from __future__ import annotations

from typing import Any

from .wikipedia_scraper import WikipediaScraper


class WikipediaGlobalScraper(WikipediaScraper):
    """
    Secondary Wikipedia source:
    starts from the global largest-companies list and keeps only Europe-based firms.
    """

    SOURCE_NAME = "wikipedia_global"
    WIKIPEDIA_LIST_URL = "https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue"

    EUROPE_COUNTRIES = {
        "albania",
        "andorra",
        "armenia",
        "austria",
        "azerbaijan",
        "belarus",
        "belgium",
        "bosnia and herzegovina",
        "bulgaria",
        "croatia",
        "cyprus",
        "czech republic",
        "denmark",
        "estonia",
        "finland",
        "france",
        "georgia",
        "germany",
        "greece",
        "hungary",
        "iceland",
        "ireland",
        "italy",
        "kosovo",
        "latvia",
        "liechtenstein",
        "lithuania",
        "luxembourg",
        "malta",
        "moldova",
        "monaco",
        "montenegro",
        "netherlands",
        "north macedonia",
        "norway",
        "poland",
        "portugal",
        "romania",
        "san marino",
        "serbia",
        "slovakia",
        "slovenia",
        "spain",
        "sweden",
        "switzerland",
        "ukraine",
        "united kingdom",
        "vatican city",
    }

    async def scrape(self) -> list[dict[str, Any]]:
        records = await super().scrape()
        filtered: list[dict[str, Any]] = []
        for record in records:
            country = str(record.get("country_of_origin", "")).strip().lower()
            if self._is_europe_country_text(country):
                filtered.append(record)
        return filtered

    def _is_europe_country_text(self, text: str) -> bool:
        if not text:
            return False
        normalized = " " + text + " "
        for country in self.EUROPE_COUNTRIES:
            token = " " + country + " "
            if token in normalized:
                return True
        return False
