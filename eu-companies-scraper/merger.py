from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


FINAL_KEYS = (
    "name",
    "website",
    "career_page_url",
    "country_of_origin",
    "source",
    "jobs",
)


def merge_company_lists(*company_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Merge and deduplicate multiple company lists into the final API schema.

    Deduplication priority:
    1) `website` domain (strongest key)
    2) normalized company name
    """
    merged: list[dict[str, Any]] = []
    by_domain: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}

    for company_list in company_lists:
        for raw in company_list:
            company = _to_final_record(raw)
            if not company:
                continue

            domain_key = _domain_key(company["website"])
            name_key = _normalize_name(company["name"])

            existing = None
            if domain_key and domain_key in by_domain:
                existing = by_domain[domain_key]
            elif name_key in by_name:
                existing = by_name[name_key]

            if existing is None:
                merged.append(company)
                by_name[name_key] = company
                if domain_key:
                    by_domain[domain_key] = company
                continue

            resolved = _prefer_more_complete(existing, company)
            if resolved is not existing:
                _replace_in_list(merged, existing, resolved)
                by_name[name_key] = resolved
                if domain_key:
                    by_domain[domain_key] = resolved

    merged.sort(key=lambda item: item["name"].lower())
    return merged


def load_companies_json(path: str | Path) -> list[dict[str, Any]]:
    file_path = Path(path)
    if not file_path.exists():
        return []
    with file_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def save_companies_json(path: str | Path, companies: list[dict[str, Any]]) -> None:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with file_path.open("w", encoding="utf-8") as f:
        json.dump(companies, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _to_final_record(raw: dict[str, Any]) -> dict[str, Any] | None:
    name = str(raw.get("name", "")).strip()
    website = _normalize_url(str(raw.get("website", "")).strip())
    career_page_url = _normalize_url(str(raw.get("career_page_url", "")).strip())
    country = str(raw.get("country_of_origin", "")).strip()
    source = str(raw.get("source", "")).strip()
    jobs = _normalize_jobs(raw.get("jobs", []))

    # Final output requirement: skip companies without career pages.
    if not name or not website or not career_page_url:
        return None

    if not country:
        country = "Unknown"
    if not source:
        source = "unknown"

    return {
        "name": name,
        "website": website,
        "career_page_url": career_page_url,
        "country_of_origin": country,
        "source": source,
        "jobs": jobs,
    }


def _prefer_more_complete(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    """
    Keep the record with stronger data completeness.
    """
    left_score = _record_score(left)
    right_score = _record_score(right)
    if right_score > left_score:
        return right

    # Stable tie-breakers:
    # 1) keep a non-unknown country
    # 2) keep shorter career URL (often cleaner canonical path)
    if left["country_of_origin"].lower() == "unknown" and right["country_of_origin"].lower() != "unknown":
        return right
    if len(right["career_page_url"]) < len(left["career_page_url"]):
        return right
    return left


def _record_score(record: dict[str, Any]) -> int:
    score = 0
    if record["name"]:
        score += 2
    if record["website"]:
        score += 2
    if record["career_page_url"]:
        score += 3
    if record["country_of_origin"] and record["country_of_origin"].lower() != "unknown":
        score += 1
    if record["source"] and record["source"].lower() != "unknown":
        score += 1
    if isinstance(record.get("jobs"), list) and len(record["jobs"]) > 0:
        score += 1
    return score


def _replace_in_list(items: list[dict[str, Any]], old: dict[str, Any], new: dict[str, Any]) -> None:
    for i, item in enumerate(items):
        if item is old:
            items[i] = new
            return


def _normalize_name(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r"\s+", " ", name)
    return name


def _domain_key(url: str) -> str:
    try:
        netloc = urlparse(url).netloc.lower()
    except Exception:
        return ""
    if netloc.startswith("www."):
        return netloc[4:]
    return netloc


def _normalize_url(url: str) -> str:
    url = url.strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    parsed = urlparse(url)
    if not parsed.netloc or "." not in parsed.netloc:
        return ""
    if len(url) > 220:
        return ""
    if url.endswith("/"):
        url = url[:-1]
    return url


def _normalize_jobs(raw_jobs: Any) -> list[dict[str, str]]:
    if not isinstance(raw_jobs, list):
        return []
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw_jobs:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        url = _normalize_url(str(item.get("url", "")).strip())
        if not title or not url:
            continue
        key = f"{title.lower()}|{url.lower()}"
        if key in seen:
            continue
        seen.add(key)
        normalized.append({"title": title, "url": url})
    return normalized
