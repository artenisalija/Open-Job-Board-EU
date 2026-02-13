from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .base_scraper import BaseScraper


logger = logging.getLogger(__name__)


class ManifestScraper(BaseScraper):
    SOURCE_NAME = "themanifest"
    LIST_URLS = (
        "https://themanifest.com/eu/web-development/companies",
        "https://themanifest.com/eu/it-services/companies",
        "https://themanifest.com/eu/software-development/companies",
    )
    MAX_PROFILES = 40

    def __init__(self, list_urls: tuple[str, ...] | None = None) -> None:
        super().__init__(source_name=self.SOURCE_NAME, rate_limit_seconds=1.5)
        self.list_urls = list_urls or self.LIST_URLS

    async def scrape(self) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        seen_profiles: set[str] = set()

        for list_url in self.list_urls:
            html = await self.fetch(list_url)
            if not html:
                continue
            if self._is_challenge_page(html):
                logger.warning("The Manifest is blocking scraping on %s", list_url)
                continue

            profile_urls = self._extract_profile_urls(html, list_url)
            for profile_url in profile_urls:
                if profile_url in seen_profiles:
                    continue
                seen_profiles.add(profile_url)

                profile_html = await self.fetch(profile_url)
                if not profile_html or self._is_challenge_page(profile_html):
                    continue

                company = self._parse_profile(profile_html, profile_url)
                if company:
                    results.append(company)

                if len(seen_profiles) >= self.MAX_PROFILES:
                    break

        return self._dedupe(results)

    def _extract_profile_urls(self, html: str, base_url: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        found: list[str] = []
        seen: set[str] = set()

        for obj in self._extract_json_ld_objects(soup):
            if isinstance(obj, dict):
                url = (obj.get("url") or "").strip()
                if self._is_profile_url(url):
                    normalized = self.normalize_url(url)
                    if normalized not in seen:
                        seen.add(normalized)
                        found.append(normalized)
            if isinstance(obj, list):
                for item in obj:
                    if not isinstance(item, dict):
                        continue
                    url = (item.get("url") or "").strip()
                    if self._is_profile_url(url):
                        normalized = self.normalize_url(url)
                        if normalized not in seen:
                            seen.add(normalized)
                            found.append(normalized)

        for link in soup.select("a[href]"):
            href = (link.get("href") or "").strip()
            absolute = self.normalize_url(urljoin(base_url, href))
            if not self._is_profile_url(absolute):
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            found.append(absolute)

        return found

    def _parse_profile(self, html: str, profile_url: str) -> dict[str, Any] | None:
        soup = BeautifulSoup(html, "html.parser")

        name = ""
        h1 = soup.select_one("h1")
        if h1:
            name = h1.get_text(" ", strip=True)

        website = self._extract_company_website(soup)
        country = self._extract_country(soup)

        if not name or not website:
            return None

        return {
            "name": name,
            "website": website,
            "career_page_url": "",
            "country_of_origin": country or "Unknown",
            "source": self.source_name,
            "source_url": profile_url,
        }

    def _extract_company_website(self, soup: BeautifulSoup) -> str:
        for link in soup.select("a[href]"):
            href = (link.get("href") or "").strip()
            if not href.startswith("http"):
                continue
            domain = urlparse(href).netloc.lower()
            if "themanifest.com" in domain or "clutch.co" in domain:
                continue

            text = link.get_text(" ", strip=True).lower()
            attrs = " ".join(
                [
                    text,
                    (link.get("title") or "").lower(),
                    (link.get("aria-label") or "").lower(),
                ]
            )
            if any(token in attrs for token in ("visit website", "website", "client site")):
                return self.normalize_url(href)

        for link in soup.select("a[href]"):
            href = (link.get("href") or "").strip()
            if not href.startswith("http"):
                continue
            domain = urlparse(href).netloc.lower()
            if "themanifest.com" in domain or "clutch.co" in domain:
                continue
            return self.normalize_url(href)
        return ""

    def _extract_country(self, soup: BeautifulSoup) -> str:
        for obj in self._extract_json_ld_objects(soup):
            if isinstance(obj, dict):
                country = self._country_from_obj(obj)
                if country:
                    return country
            if isinstance(obj, list):
                for item in obj:
                    if not isinstance(item, dict):
                        continue
                    country = self._country_from_obj(item)
                    if country:
                        return country
        return ""

    @staticmethod
    def _country_from_obj(obj: dict[str, Any]) -> str:
        address = obj.get("address")
        if isinstance(address, dict):
            country = address.get("addressCountry")
            if isinstance(country, str) and country.strip():
                return country.strip()
        return ""

    @staticmethod
    def _extract_json_ld_objects(soup: BeautifulSoup) -> list[Any]:
        objects: list[Any] = []
        for script in soup.select("script[type='application/ld+json']"):
            raw = script.string or script.get_text(strip=True)
            if not raw:
                continue
            try:
                objects.append(json.loads(raw))
            except Exception:
                continue
        return objects

    @staticmethod
    def _is_challenge_page(html: str) -> bool:
        lowered = html.lower()
        return "just a moment" in lowered and "cf-challenge" in lowered

    @staticmethod
    def _is_profile_url(url: str) -> bool:
        if not url:
            return False
        parsed = urlparse(url)
        if "themanifest.com" not in parsed.netloc.lower():
            return False
        path = parsed.path.lower().strip("/")
        if not path:
            return False
        return "/company/" in f"/{path}/" or path.endswith("-company")

    @staticmethod
    def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for item in items:
            key = (item.get("name", "").lower().strip(), item.get("website", "").lower().strip())
            if key in seen:
                continue
            seen.add(key)
            results.append(item)
        return results
