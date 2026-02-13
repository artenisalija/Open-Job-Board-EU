from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from scrapers.base_scraper import BaseScraper


logger = logging.getLogger(__name__)


class CareerFinder(BaseScraper):
    """
    Enriches company records with a careers page URL.

    This is not a source scraper; it is a pipeline step that consumes
    already-scraped company candidates and filters out records where a
    careers page cannot be found.
    """

    SOURCE_NAME = "career_finder"

    CAREER_KEYWORDS = (
        "career",
        "careers",
        "jobs",
        "job",
        "join-us",
        "joinus",
        "work-with-us",
        "vacancies",
        "hiring",
        "opportunities",
        "workday",
        "talent",
    )

    COMMON_CAREER_PATHS = (
        "/careers",
        "/career",
        "/jobs",
        "/join-us",
        "/vacancies",
        "/work-with-us",
        "/en/careers",
        "/en/jobs",
    )
    MAX_JOBS_PER_COMPANY = 25
    ATS_DOMAINS = (
        "greenhouse.io",
        "lever.co",
        "workable.com",
        "smartrecruiters.com",
        "myworkdayjobs.com",
        "ashbyhq.com",
        "teamtailor.com",
        "recruitee.com",
        "bamboohr.com",
    )

    def __init__(self, max_concurrency: int = 8) -> None:
        super().__init__(source_name=self.SOURCE_NAME, rate_limit_seconds=1.0, timeout_seconds=12.0)
        self.max_concurrency = max_concurrency

    async def scrape(self) -> list[dict[str, Any]]:
        """
        Required by BaseScraper ABC.
        CareerFinder runs through `enrich_companies` instead.
        """
        return []

    async def enrich_companies(self, companies: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Adds `career_page_url` for each company and drops entries where a
        career page cannot be found.
        """
        semaphore = asyncio.Semaphore(self.max_concurrency)
        tasks = [self._enrich_one(company, semaphore) for company in companies]
        results = await asyncio.gather(*tasks)
        return [item for item in results if item is not None]

    async def _enrich_one(
        self, company: dict[str, Any], semaphore: asyncio.Semaphore
    ) -> dict[str, Any] | None:
        website = (company.get("website") or "").strip()
        if not website or not self._is_valid_website(website):
            return None

        async with semaphore:
            career_url = await self.find_career_page(website)

        if not career_url:
            return None

        jobs = await self.extract_jobs(career_url, website)

        updated = dict(company)
        updated["career_page_url"] = career_url
        updated["jobs"] = jobs
        return updated

    async def find_career_page(self, website_url: str) -> str | None:
        website_url = self._ensure_http_scheme(self.normalize_url(website_url))
        parsed_home = urlparse(website_url)
        home_domain = parsed_home.netloc.lower()

        # 1) Discover career links from homepage.
        html = await self.fetch(website_url)
        if not html:
            # If the homepage itself is blocked/unreachable, probing many fallback
            # paths is usually slow and low-yield. Skip to keep pipeline responsive.
            return None

        linked_candidates = self._extract_career_links(html, website_url)
        for candidate in linked_candidates:
            if not self._is_related_domain(home_domain, candidate):
                continue
            if await self._is_valid_career_page(candidate):
                return self.normalize_url(candidate)

        # 2) Fallback: probe common career paths.
        for path in self.COMMON_CAREER_PATHS:
            candidate = self.normalize_url(urljoin(website_url + "/", path.lstrip("/")))
            if await self._is_valid_career_page(candidate):
                return candidate

        return None

    def _extract_career_links(self, html: str, base_url: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        found: list[str] = []
        seen: set[str] = set()

        for link in soup.select("a[href]"):
            href = (link.get("href") or "").strip()
            if not href:
                continue

            link_text = " ".join(
                filter(
                    None,
                    [
                        link.get_text(" ", strip=True),
                        (link.get("title") or "").strip(),
                        (link.get("aria-label") or "").strip(),
                        href,
                    ],
                )
            ).lower()

            if not self._contains_career_keyword(link_text):
                continue

            absolute = self.normalize_url(urljoin(base_url, href))
            if absolute in seen:
                continue
            seen.add(absolute)
            found.append(absolute)

        return found

    async def _is_valid_career_page(self, url: str) -> bool:
        html = await self.fetch(url)
        if not html:
            return False

        soup = BeautifulSoup(html, "html.parser")
        title = (soup.title.string or "").strip().lower() if soup.title and soup.title.string else ""

        body_text = soup.get_text(" ", strip=True).lower()
        body_text = re.sub(r"\s+", " ", body_text)
        snippet = body_text[:5000]

        if self._contains_career_keyword(title):
            return True
        if self._contains_career_keyword(url.lower()):
            return True
        if any(word in snippet for word in ("open positions", "job openings", "vacancies", "apply now")):
            return True
        return False

    async def extract_jobs(self, career_url: str, company_website: str) -> list[dict[str, str]]:
        html = await self.fetch(career_url)
        if not html:
            return []

        soup = BeautifulSoup(html, "html.parser")
        jobs: list[dict[str, str]] = []
        seen: set[str] = set()

        for job in self._extract_jobs_from_json_ld(soup):
            key = (job.get("url") or "").strip().lower() or (job.get("title") or "").strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            jobs.append(job)
            if len(jobs) >= self.MAX_JOBS_PER_COMPANY:
                return jobs

        company_domain = urlparse(self._ensure_http_scheme(company_website)).netloc.lower()
        for link in soup.select("a[href]"):
            href = (link.get("href") or "").strip()
            if not href:
                continue

            absolute = self.normalize_url(urljoin(career_url, href))
            title = re.sub(r"\s+", " ", link.get_text(" ", strip=True)).strip()
            if not title or not self._looks_like_job_link(title, absolute):
                continue
            if not self._is_job_domain_allowed(company_domain, absolute):
                continue

            key = absolute.lower()
            if key in seen:
                continue
            seen.add(key)
            jobs.append({"title": title, "url": absolute})
            if len(jobs) >= self.MAX_JOBS_PER_COMPANY:
                break

        return jobs

    def _extract_jobs_from_json_ld(self, soup: BeautifulSoup) -> list[dict[str, str]]:
        jobs: list[dict[str, str]] = []
        for script in soup.select("script[type='application/ld+json']"):
            raw = script.string or script.get_text(strip=True)
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except Exception:
                continue
            jobs.extend(self._walk_job_postings(payload))
        return jobs

    def _walk_job_postings(self, obj: Any) -> list[dict[str, str]]:
        results: list[dict[str, str]] = []
        if isinstance(obj, list):
            for item in obj:
                results.extend(self._walk_job_postings(item))
            return results

        if not isinstance(obj, dict):
            return results

        obj_type = obj.get("@type")
        if obj_type == "JobPosting" or (isinstance(obj_type, list) and "JobPosting" in obj_type):
            title = str(obj.get("title", "")).strip()
            url = str(obj.get("url", "")).strip()
            if title and url:
                results.append({"title": title, "url": self.normalize_url(url)})

        for value in obj.values():
            results.extend(self._walk_job_postings(value))
        return results

    @classmethod
    def _contains_career_keyword(cls, text: str) -> bool:
        return any(keyword in text for keyword in cls.CAREER_KEYWORDS)

    @staticmethod
    def _ensure_http_scheme(url: str) -> str:
        if not url.startswith(("http://", "https://")):
            return f"https://{url}"
        return url

    @staticmethod
    def _is_related_domain(home_domain: str, url: str) -> bool:
        candidate_domain = urlparse(url).netloc.lower()
        if not candidate_domain:
            return False
        if candidate_domain == home_domain:
            return True
        return candidate_domain.endswith("." + home_domain)

    @staticmethod
    def _is_valid_website(url: str) -> bool:
        candidate = url if url.startswith(("http://", "https://")) else f"https://{url}"
        parsed = urlparse(candidate)
        return bool(parsed.netloc and "." in parsed.netloc and len(candidate) <= 220)

    def _looks_like_job_link(self, title: str, url: str) -> bool:
        blob = f"{title} {url}".lower()
        blocked_tokens = ("privacy", "cookie", "terms", "linkedin.com/company", "facebook.com")
        if any(token in blob for token in blocked_tokens):
            return False
        return any(
            token in blob
            for token in (
                "job",
                "jobs",
                "position",
                "opening",
                "vacanc",
                "careers",
                "apply",
                "workday",
                "greenhouse",
                "lever",
            )
        )

    def _is_job_domain_allowed(self, company_domain: str, url: str) -> bool:
        domain = urlparse(url).netloc.lower()
        if not domain:
            return False
        if domain == company_domain or domain.endswith("." + company_domain):
            return True
        return any(ats in domain for ats in self.ATS_DOMAINS)
