# Open Job Board EU

FastAPI-powered EU company scraper with automated dataset refresh via GitHub Actions.

## What It Does

- Scrapes EU company candidates from multiple sources.
- Finds and validates career pages.
- Skips companies without career pages.
- Merges and deduplicates final records.
- Serves results from `GET /companies`.
- Tracks source health at `GET /sources/health`.

## Final Company Schema

Each item returned by `/companies` has:

- `name`
- `website`
- `career_page_url`
- `country_of_origin`
- `source`

## Data Pipeline

Main runner: `run_pipeline.py`

Sources currently wired:

- `wikipedia`
- `wikipedia_global`
- `eu_startups`
- `clutch` (can be blocked by Cloudflare in automation)
- `themanifest` (can be blocked by Cloudflare in automation)

Pipeline outputs:

- `data/companies.json`
- `data/source_health.json`

## Automation

Workflow file: `.github/workflows/scrape.yml`

Runs:

- on manual dispatch
- every 6 hours
- on scraper/pipeline code changes

## Local Run

1. Install dependencies:
   - `pip install -r requirements.txt`
2. Build dataset:
   - `python run_pipeline.py`
3. Start API:
   - `uvicorn api.main:app --reload`

## Frontend (React + Bootstrap)

The frontend is in `frontend/` and uses Vite with a proxy to the FastAPI backend.

1. Start API on port `8011`:
   - `python -m uvicorn api.main:app --reload --port 8011 --app-dir C:\Users\Artenis\Documents\GitHub\Open-Job-Board-EU\eu-companies-scraper`
2. Start frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`
3. Open:
   - `http://127.0.0.1:5173`

## Docker Compose (Shareable Setup)

This repo includes a full Docker setup so anyone can run it without local Python/Node setup.

Files:

- `docker-compose.yml`
- `Dockerfile.api`
- `frontend/Dockerfile`
- `frontend/nginx.conf`

Run scraping once to refresh dataset:

- `docker compose --profile setup up --build pipeline`

Run API + frontend:

- `docker compose up --build`

Open:

- Frontend: `http://127.0.0.1:8080`
- API: `http://127.0.0.1:8011`

Stop:

- `docker compose down`

## Public Link on GitHub Pages

Workflow file:

- `.github/workflows/deploy-frontend.yml`

What it does:

- Builds the React frontend in static-data mode.
- Deploys frontend to GitHub Pages.
- Reads data from:
  - `data/companies.json`
  - `data/source_health.json`
  committed in this repo (updated by `scrape.yml`).

One-time setup in GitHub:

1. Go to repo `Settings` -> `Pages`.
2. Set source to `GitHub Actions`.
3. Push to `main` or run the workflow manually.

After deploy, the app will be publicly available at:

- `https://<your-github-username>.github.io/<repo-name>/`
