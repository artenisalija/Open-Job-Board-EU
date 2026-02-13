from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel


class Job(BaseModel):
    title: str
    url: str


class Company(BaseModel):
    name: str
    website: str
    career_page_url: str
    country_of_origin: str
    source: str
    jobs: list[Job] = []


class JobResult(BaseModel):
    company_name: str
    company_website: str
    country_of_origin: str
    source: str
    career_page_url: str
    title: str
    url: str


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = BASE_DIR / "data" / "companies.json"
SOURCE_HEALTH_FILE = BASE_DIR / "data" / "source_health.json"

app = FastAPI(
    title="Open Job Board EU API",
    version="0.1.0",
    description="Serves scraped EU company data with career pages.",
)


def _load_companies(path: Path = DATA_FILE) -> list[dict[str, Any]]:
    if not path.exists():
        return []

    try:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {path.name}") from exc

    if not isinstance(payload, list):
        return []

    companies: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        if not all(
            key in item for key in ("name", "website", "career_page_url", "country_of_origin", "source", "jobs")
        ):
            continue
        if not item.get("career_page_url"):
            continue
        companies.append(item)

    companies.sort(key=lambda company: str(company.get("name", "")).lower())
    return companies


def _load_source_health(path: Path = SOURCE_HEALTH_FILE) -> dict[str, Any]:
    if not path.exists():
        return {"message": "No source health data found yet."}
    try:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid JSON in {path.name}") from exc
    if not isinstance(payload, dict):
        return {"message": "Invalid source health format."}
    return payload


def _contains_casefold(haystack: str, needle: str) -> bool:
    return needle.casefold() in haystack.casefold()


def _apply_company_filters(
    companies: list[dict[str, Any]],
    country: str | None,
    source: str | None,
    company: str | None,
    jobs_query: str | None,
    has_jobs: bool | None,
) -> list[dict[str, Any]]:
    filtered = companies

    if country:
        filtered = [c for c in filtered if _contains_casefold(str(c.get("country_of_origin", "")), country)]
    if source:
        filtered = [c for c in filtered if _contains_casefold(str(c.get("source", "")), source)]
    if company:
        filtered = [c for c in filtered if _contains_casefold(str(c.get("name", "")), company)]
    if has_jobs is True:
        filtered = [c for c in filtered if c.get("jobs")]
    if has_jobs is False:
        filtered = [c for c in filtered if not c.get("jobs")]

    if jobs_query:
        jq = jobs_query.casefold()
        filtered = [
            c
            for c in filtered
            if any(
                jq in str(job.get("title", "")).casefold() or jq in str(job.get("url", "")).casefold()
                for job in c.get("jobs", [])
                if isinstance(job, dict)
            )
        ]

    return filtered


def _sort_companies(
    companies: list[dict[str, Any]],
    sort_by: Literal["company", "country", "source", "jobs_count"],
    sort_order: Literal["asc", "desc"],
) -> list[dict[str, Any]]:
    reverse = sort_order == "desc"

    if sort_by == "company":
        key_fn = lambda c: str(c.get("name", "")).casefold()
    elif sort_by == "country":
        key_fn = lambda c: str(c.get("country_of_origin", "")).casefold()
    elif sort_by == "source":
        key_fn = lambda c: str(c.get("source", "")).casefold()
    else:
        key_fn = lambda c: len(c.get("jobs", []))

    return sorted(companies, key=key_fn, reverse=reverse)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {"message": "Open Job Board EU API is running."}


@app.get("/companies", response_model=list[Company], tags=["companies"])
def get_companies(
    country: str | None = Query(default=None, description="Filter by country (partial match)."),
    source: str | None = Query(default=None, description="Filter by source (partial match)."),
    company: str | None = Query(default=None, description="Filter by company name (partial match)."),
    jobs_query: str | None = Query(default=None, description="Search term in job title or job URL."),
    has_jobs: bool | None = Query(default=None, description="If true, only companies with jobs."),
    sort_by: Literal["company", "country", "source", "jobs_count"] = Query(default="company"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
) -> list[dict[str, Any]]:
    companies = _load_companies()
    companies = _apply_company_filters(companies, country, source, company, jobs_query, has_jobs)
    companies = _sort_companies(companies, sort_by, sort_order)
    return companies


@app.get("/jobs", response_model=list[JobResult], tags=["jobs"])
def search_jobs(
    query: str | None = Query(default=None, description="Search term in job title or URL."),
    country: str | None = Query(default=None, description="Filter by company country."),
    source: str | None = Query(default=None, description="Filter by company source."),
    company: str | None = Query(default=None, description="Filter by company name."),
    sort_by: Literal["company", "country", "source", "title"] = Query(default="company"),
    sort_order: Literal["asc", "desc"] = Query(default="asc"),
) -> list[dict[str, Any]]:
    companies = _load_companies()
    companies = _apply_company_filters(companies, country, source, company, None, True)

    results: list[dict[str, Any]] = []
    for c in companies:
        for job in c.get("jobs", []):
            if not isinstance(job, dict):
                continue
            title = str(job.get("title", "")).strip()
            url = str(job.get("url", "")).strip()
            if not title or not url:
                continue
            if query and not (
                _contains_casefold(title, query) or _contains_casefold(url, query)
            ):
                continue
            results.append(
                {
                    "company_name": c.get("name", ""),
                    "company_website": c.get("website", ""),
                    "country_of_origin": c.get("country_of_origin", ""),
                    "source": c.get("source", ""),
                    "career_page_url": c.get("career_page_url", ""),
                    "title": title,
                    "url": url,
                }
            )

    reverse = sort_order == "desc"
    if sort_by == "title":
        key_fn = lambda r: str(r.get("title", "")).casefold()
    elif sort_by == "country":
        key_fn = lambda r: str(r.get("country_of_origin", "")).casefold()
    elif sort_by == "source":
        key_fn = lambda r: str(r.get("source", "")).casefold()
    else:
        key_fn = lambda r: str(r.get("company_name", "")).casefold()
    return sorted(results, key=key_fn, reverse=reverse)


@app.get("/sources/health", tags=["meta"])
def get_source_health() -> dict[str, Any]:
    return _load_source_health()


@app.get("/debug/stats", tags=["debug"])
def get_debug_stats() -> dict[str, Any]:
    companies = _load_companies()
    companies_with_jobs = sum(1 for company in companies if company.get("jobs"))
    total_jobs = sum(len(company.get("jobs", [])) for company in companies)
    return {
        "companies_count": len(companies),
        "companies_with_jobs_count": companies_with_jobs,
        "total_jobs_count": total_jobs,
    }
