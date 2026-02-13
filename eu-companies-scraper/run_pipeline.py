from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from career_finder import CareerFinder
from merger import merge_company_lists, save_companies_json
from scrapers.clutch_scraper import ClutchScraper
from scrapers.eu_startups_scraper import EUStartupsScraper
from scrapers.manifest_scraper import ManifestScraper
from scrapers.wikipedia_global_scraper import WikipediaGlobalScraper
from scrapers.wikipedia_scraper import WikipediaScraper


DATA_DIR = Path("data")
COMPANIES_PATH = DATA_DIR / "companies.json"
SOURCE_HEALTH_PATH = DATA_DIR / "source_health.json"


def _source_counts(companies: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for company in companies:
        source = str(company.get("source", "unknown")).strip() or "unknown"
        counts[source] = counts.get(source, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: item[0]))


def _dedupe_candidates(companies: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for company in companies:
        name = str(company.get("name", "")).strip().lower()
        website = str(company.get("website", "")).strip().lower()
        key = (name, website)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(company)
    return deduped


def _save_source_health(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with SOURCE_HEALTH_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


async def run_pipeline() -> dict[str, Any]:
    async with WikipediaScraper() as wikipedia:
        wikipedia_candidates = await wikipedia.scrape()

    async with WikipediaGlobalScraper() as wikipedia_global:
        wikipedia_global_candidates = await wikipedia_global.scrape()

    async with EUStartupsScraper() as eu_startups:
        eu_startups_candidates = await eu_startups.scrape()

    async with ClutchScraper() as clutch:
        clutch_candidates = await clutch.scrape()

    async with ManifestScraper() as manifest:
        manifest_candidates = await manifest.scrape()

    all_candidates = (
        wikipedia_candidates
        + wikipedia_global_candidates
        + eu_startups_candidates
        + clutch_candidates
        + manifest_candidates
    )
    deduped_candidates = _dedupe_candidates(all_candidates)

    async with CareerFinder(max_concurrency=8) as finder:
        enriched = await finder.enrich_companies(deduped_candidates)

    merged = merge_company_lists(enriched)
    save_companies_json(COMPANIES_PATH, merged)

    health = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "candidates": {
            "wikipedia": len(wikipedia_candidates),
            "wikipedia_global": len(wikipedia_global_candidates),
            "eu_startups": len(eu_startups_candidates),
            "clutch": len(clutch_candidates),
            "themanifest": len(manifest_candidates),
            "total_raw": len(all_candidates),
            "total_deduped": len(deduped_candidates),
        },
        "enriched_with_careers": len(enriched),
        "final_merged": len(merged),
        "final_by_source": _source_counts(merged),
    }
    _save_source_health(health)
    return health


def main() -> None:
    health = asyncio.run(run_pipeline())
    print(json.dumps(health, indent=2))


if __name__ == "__main__":
    main()
