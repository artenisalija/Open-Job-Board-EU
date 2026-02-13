from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .base_scraper import BaseScraper


logger = logging.getLogger(__name__)


class EUStartupsScraper(BaseScraper):
    SOURCE_NAME = "eu_startups"
    DIRECTORY_URL = "https://www.eu-startups.com/directory/"
    MAX_CATEGORY_PAGES = 8
    MAX_COMPANIES = 60

    def __init__(self) -> None:
        super().__init__(source_name=self.SOURCE_NAME, rate_limit_seconds=0.6)

    async def scrape(self) -> list[dict[str, Any]]:
        directory_html = await self.fetch(self.DIRECTORY_URL)
        if not directory_html:
            return []

        category_urls = self._extract_category_urls(directory_html)
        if not category_urls:
            return []

        listing_urls: list[str] = []
        seen_listing_urls: set[str] = set()

        for category_url in category_urls[: self.MAX_CATEGORY_PAGES]:
            category_html = await self.fetch(category_url)
            if not category_html:
                continue

            for listing_url in self._extract_listing_urls(category_html):
                if listing_url in seen_listing_urls:
                    continue
                seen_listing_urls.add(listing_url)
                listing_urls.append(listing_url)
                if len(listing_urls) >= self.MAX_COMPANIES:
                    break

            if len(listing_urls) >= self.MAX_COMPANIES:
                break

        results: list[dict[str, Any]] = []
        for listing_url in listing_urls:
            listing_html = await self.fetch(listing_url)
            if not listing_html:
                continue

            record = self._parse_listing_page(listing_html, listing_url)
            if record:
                results.append(record)

        return self._dedupe(results)

    def _extract_category_urls(self, html: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        urls: list[str] = []
        seen: set[str] = set()

        for link in soup.select("a[href*='/directory/wpbdp_category/']"):
            href = (link.get("href") or "").strip()
            if not href:
                continue
            absolute = self.normalize_url(urljoin(self.DIRECTORY_URL, href))
            if absolute in seen:
                continue
            seen.add(absolute)
            urls.append(absolute)
        return urls

    def _extract_listing_urls(self, html: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        urls: list[str] = []
        seen: set[str] = set()

        for link in soup.select(".listing-title a[href*='/directory/']"):
            href = (link.get("href") or "").strip()
            if not href:
                continue
            absolute = self.normalize_url(urljoin(self.DIRECTORY_URL, href))
            if "/wpbdp_category/" in absolute:
                continue
            if "wpbdp_view=" in absolute:
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            urls.append(absolute)
        return urls

    def _parse_listing_page(self, html: str, source_url: str) -> dict[str, Any] | None:
        soup = BeautifulSoup(html, "html.parser")
        name_tag = soup.select_one("h1")
        if not name_tag:
            return None

        name = name_tag.get_text(" ", strip=True)
        if self._looks_like_url(name):
            fallback_name = self._extract_business_name(soup)
            if fallback_name:
                name = fallback_name
        if not name:
            return None
        if self._looks_like_url(name):
            return None

        website = self._extract_website(soup)
        if not website:
            return None

        country = self._extract_country(soup) or "Unknown"

        return {
            "name": name,
            "website": website,
            "career_page_url": "",
            "country_of_origin": country,
            "source": self.source_name,
            "source_url": source_url,
        }

    def _extract_website(self, soup: BeautifulSoup) -> str:
        website_field = soup.select_one(".wpbdp-field-website .value")
        if not website_field:
            website_field = soup.select_one(".wpbdp-field-website .wpbdp-field-value")
        if not website_field:
            return ""

        raw_text = website_field.get_text(" ", strip=True)
        if not raw_text:
            return ""
        match = re.search(r"(https?://[^\s]+|www\.[^\s]+)", raw_text, flags=re.IGNORECASE)
        if not match:
            return ""

        value = match.group(1).strip().rstrip(".,;)")
        if not value.startswith(("http://", "https://")):
            value = "https://" + value

        parsed = urlparse(value)
        if not parsed.netloc or "." not in parsed.netloc:
            return ""
        if len(value) > 200:
            return ""
        canonical = f"{parsed.scheme or 'https'}://{parsed.netloc}"
        return self.normalize_url(canonical)

    def _extract_country(self, soup: BeautifulSoup) -> str:
        country_field = soup.select_one(".wpbdp-field-category .value")
        if not country_field:
            country_field = soup.select_one(".wpbdp-field-category .wpbdp-field-value")
        if not country_field:
            return ""
        return country_field.get_text(" ", strip=True)

    def _extract_business_name(self, soup: BeautifulSoup) -> str:
        business_field = soup.select_one(".wpbdp-field-business_name .value")
        if not business_field:
            business_field = soup.select_one(".wpbdp-field-business_name .wpbdp-field-value")
        if not business_field:
            return ""
        return business_field.get_text(" ", strip=True)

    @staticmethod
    def _looks_like_url(value: str) -> bool:
        lowered = value.lower().strip()
        return lowered.startswith(("http://", "https://", "www."))

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
