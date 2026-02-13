# scrapers/base_scraper.py
from __future__ import annotations

import asyncio
import logging
import os
import time
from abc import ABC, abstractmethod
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx


logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """
    Base class for all source scrapers.
    Provides:
    - robots.txt checking
    - per-domain rate limiting
    - HTTP fetch helper
    - common URL/data utilities
    """

    def __init__(
        self,
        source_name: str,
        user_agent: str | None = None,
        rate_limit_seconds: float = 1.0,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.source_name = source_name
        self.user_agent = user_agent or os.getenv(
            "SCRAPER_USER_AGENT",
            "OpenJobBoardEU/1.0 (https://github.com/Artenis/Open-Job-Board-EU; contact: openjobboardeu@example.com)",
        )
        self.rate_limit_seconds = rate_limit_seconds

        self._client = httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=True,
            headers={
                "User-Agent": self.user_agent,
                "Accept-Language": "en-US,en;q=0.9",
            },
        )

        self._robots_cache: dict[str, RobotFileParser] = {}
        self._domain_locks: dict[str, asyncio.Lock] = {}
        self._last_request_ts: dict[str, float] = {}

    async def __aenter__(self) -> "BaseScraper":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()

    @abstractmethod
    async def scrape(self) -> list[dict[str, Any]]:
        """
        Child scrapers implement this and return a list of company dicts.
        """
        raise NotImplementedError

    async def fetch(self, url: str) -> str | None:
        """
        Fetch URL after robots.txt check + rate limiting.
        Returns response text on success, else None.
        """
        normalized_url = self.normalize_url(url)
        if not await self.is_allowed_by_robots(normalized_url):
            logger.info("Blocked by robots.txt: %s", normalized_url)
            return None

        await self._apply_rate_limit(normalized_url)

        try:
            response = await self._client.get(normalized_url)
            response.raise_for_status()
            return response.text
        except httpx.HTTPError as exc:
            status_code = None
            if isinstance(exc, httpx.HTTPStatusError):
                status_code = exc.response.status_code
            if status_code is not None and status_code < 500:
                logger.info("Fetch skipped for %s: %s", normalized_url, exc)
            else:
                logger.warning("Failed to fetch %s: %s", normalized_url, exc)
            return None

    async def is_allowed_by_robots(self, url: str) -> bool:
        """
        Checks robots.txt permissions for the current user-agent.
        If robots.txt cannot be fetched, we allow by default but log it.
        """
        parsed = urlparse(url)
        domain = parsed.netloc

        parser = self._robots_cache.get(domain)
        if parser is None:
            robots_url = f"{parsed.scheme}://{domain}/robots.txt"
            parser = RobotFileParser()
            parser.set_url(robots_url)

            try:
                resp = await self._client.get(robots_url)
                if resp.status_code >= 400:
                    logger.info("No robots.txt available at %s (status %s)", robots_url, resp.status_code)
                    self._robots_cache[domain] = parser
                    return True

                parser.parse(resp.text.splitlines())
                self._robots_cache[domain] = parser
            except httpx.HTTPError:
                logger.info("Could not read robots.txt at %s; allowing fetch", robots_url)
                self._robots_cache[domain] = parser
                return True

        return parser.can_fetch(self.user_agent, url)

    async def _apply_rate_limit(self, url: str) -> None:
        """
        Enforces a minimum delay between requests to the same domain.
        """
        domain = urlparse(url).netloc
        lock = self._domain_locks.setdefault(domain, asyncio.Lock())

        async with lock:
            now = time.monotonic()
            last = self._last_request_ts.get(domain, 0.0)
            elapsed = now - last

            if elapsed < self.rate_limit_seconds:
                await asyncio.sleep(self.rate_limit_seconds - elapsed)

            self._last_request_ts[domain] = time.monotonic()

    @staticmethod
    def normalize_url(url: str) -> str:
        """
        Normalize URL by removing fragments and trimming trailing slash.
        """
        parsed = urlparse(url.strip())
        cleaned = parsed._replace(fragment="")
        normalized = urlunparse(cleaned)
        if normalized.endswith("/"):
            normalized = normalized[:-1]
        return normalized

    @staticmethod
    def to_absolute_url(base_url: str, maybe_relative_url: str) -> str:
        return urljoin(base_url, maybe_relative_url)

    def build_company_record(
        self,
        name: str,
        website: str,
        career_page_url: str,
        country_of_origin: str,
    ) -> dict[str, str]:
        """
        Standard company schema used across all scrapers.
        Includes source tracking required by your project.
        """
        return {
            "name": name.strip(),
            "website": self.normalize_url(website),
            "career_page_url": self.normalize_url(career_page_url),
            "country_of_origin": country_of_origin.strip(),
            "source": self.source_name,
        }
