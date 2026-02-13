from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote, urlparse

from bs4 import BeautifulSoup

from .base_scraper import BaseScraper


logger = logging.getLogger(__name__)


class WikipediaScraper(BaseScraper):
    """
    Scraper for company candidates from Wikipedia list pages.

    This class focuses on collecting core company metadata from Wikipedia.
    Career page discovery is intentionally handled by `career_finder.py`.
    """

    WIKIPEDIA_LIST_URL = "https://en.wikipedia.org/wiki/List_of_largest_companies_in_Europe_by_revenue"
    SOURCE_NAME = "wikipedia"

    def __init__(self, list_url: str | None = None) -> None:
        super().__init__(source_name=self.SOURCE_NAME, rate_limit_seconds=0.35)
        self.list_url = list_url or self.WIKIPEDIA_LIST_URL

    async def scrape(self) -> list[dict[str, Any]]:
        """
        Returns candidate companies in a normalized schema.

        Note: `career_page_url` is empty here by design. The next pipeline step
        (`career_finder.py`) resolves it and filters companies without careers pages.
        """
        html = await self.fetch(self.list_url)
        if not html:
            return []

        soup = BeautifulSoup(html, "html.parser")
        companies = self._extract_companies_from_tables(soup)
        companies = await self._fill_missing_websites_from_company_pages(companies)

        deduped: list[dict[str, Any]] = []
        seen_websites: set[str] = set()
        seen_names: set[str] = set()

        for company in companies:
            website = company["website"]
            name_key = self._normalize_text_key(company["name"])

            if website and website in seen_websites:
                continue
            if name_key in seen_names:
                continue

            if website:
                seen_websites.add(website)
            seen_names.add(name_key)
            deduped.append(company)

        return deduped

    async def _fill_missing_websites_from_company_pages(
        self, companies: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        for company in companies:
            if company.get("website"):
                continue

            company_wiki_url = company.get("company_wiki_url", "")
            if not company_wiki_url:
                continue

            html = await self.fetch(company_wiki_url)
            if not html:
                continue

            website = self._extract_official_website_from_company_page(html)
            if website:
                company["website"] = website

        for company in companies:
            company.pop("company_wiki_url", None)
        return companies

    def _extract_official_website_from_company_page(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")

        for row in soup.select("table.infobox tr"):
            header = row.select_one("th")
            if not header:
                continue
            header_text = header.get_text(" ", strip=True).lower()
            if "website" not in header_text:
                continue

            links = row.select("td a[href]")
            for link in links:
                href = (link.get("href") or "").strip()
                if href.startswith("http") and "wikipedia.org" not in href:
                    return self.normalize_url(href)

        external_section = soup.select("li#t-officialwebsite a[href], li#t-homepage a[href]")
        for link in external_section:
            href = (link.get("href") or "").strip()
            if href.startswith("http") and "wikipedia.org" not in href:
                return self.normalize_url(href)
        return ""

    def _extract_companies_from_tables(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        """
        Wikipedia list pages are usually table-driven. We parse each wikitable and
        locate likely columns for company name, website, and country.
        """
        results: list[dict[str, Any]] = []
        tables = soup.select("table.wikitable")

        for table in tables:
            header_row = table.select_one("tr")
            if not header_row:
                continue

            headers = [self._clean_cell_text(th.get_text(" ", strip=True)) for th in header_row.select("th")]
            if not headers:
                continue

            name_idx = self._find_header_index(headers, ["company", "name", "corporation"])
            website_idx = self._find_header_index(headers, ["website", "web", "url"])
            country_idx = self._find_header_index(headers, ["country", "headquarters", "hq", "location"])

            if name_idx is None:
                continue

            rows = table.select("tr")
            for row in rows[1:]:
                cells = row.find_all(["th", "td"])
                if not cells:
                    continue
                # Skip non-data rows that only contain headers.
                if all(cell.name == "th" for cell in cells):
                    continue

                name = self._read_text_cell(cells, name_idx)
                if not name:
                    continue

                company_wiki_url = self._extract_company_wiki_url(cells, name_idx)
                website = self._extract_website(cells, website_idx)
                country = self._read_text_cell(cells, country_idx) if country_idx is not None else ""
                country = country or "Unknown"

                results.append(
                    {
                        "name": name,
                        "website": website,
                        "career_page_url": "",
                        "country_of_origin": country,
                        "source": self.source_name,
                        "source_url": self.list_url,
                        "company_wiki_url": company_wiki_url,
                    }
                )

        return results

    def _extract_website(self, cells: list[Any], idx: int | None) -> str:
        if idx is not None and idx < len(cells):
            links = cells[idx].select("a[href]")
            for link in links:
                href = (link.get("href") or "").strip()
                if href.startswith("http"):
                    return self.normalize_url(href)

        for cell in cells:
            links = cell.select("a[href]")
            for link in links:
                href = (link.get("href") or "").strip()
                if href.startswith("http") and "wikipedia.org" not in href:
                    return self.normalize_url(href)
        return ""

    def _extract_company_wiki_url(self, cells: list[Any], idx: int | None) -> str:
        if idx is None or idx >= len(cells):
            return ""
        for link in cells[idx].select("a[href]"):
            href = (link.get("href") or "").strip()
            if href.startswith("/wiki/") and ":" not in href:
                return self.to_absolute_url("https://en.wikipedia.org", href)
            if href.startswith("https://en.wikipedia.org/wiki/") and ":" not in href:
                return self.normalize_url(href)
        return ""

    @staticmethod
    def _find_header_index(headers: list[str], candidates: list[str]) -> int | None:
        lowered = [h.lower() for h in headers]
        for i, header in enumerate(lowered):
            if any(token in header for token in candidates):
                return i
        return None

    @staticmethod
    def _read_text_cell(cells: list[Any], idx: int | None) -> str:
        if idx is None or idx >= len(cells):
            return ""
        return WikipediaScraper._clean_cell_text(cells[idx].get_text(" ", strip=True))

    @staticmethod
    def _clean_cell_text(text: str) -> str:
        text = re.sub(r"\[[^\]]+\]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @staticmethod
    def _normalize_text_key(text: str) -> str:
        return re.sub(r"\s+", " ", text.lower()).strip()

    @staticmethod
    def wikipedia_page_url(title: str) -> str:
        normalized = title.strip().replace(" ", "_")
        return f"https://en.wikipedia.org/wiki/{quote(normalized)}"

    @staticmethod
    def domain_from_url(url: str) -> str:
        parsed = urlparse(url)
        return parsed.netloc.lower()
