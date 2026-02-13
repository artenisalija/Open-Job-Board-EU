# Open Job Board EU

Open-source job board project that scrapes EU companies with career pages, extracts job postings, and serves the data through a FastAPI API and a React frontend.

## Features

- Multi-source scraping pipeline (Wikipedia, EU Startups, Clutch, The Manifest).
- Skips companies without career pages.
- Tracks source per company.
- Extracts job postings from company career pages.
- FastAPI endpoints for companies, jobs, and source health.
- React + Bootstrap frontend with search, filters, sorting, and pagination.
- Automated dataset refresh with GitHub Actions.
- Docker Compose setup for easy self-hosting.

## Project Structure

- `scrapers/` source scrapers and shared base scraper utilities.
- `api/` FastAPI application.
- `data/` generated datasets (`companies.json`, `source_health.json`).
- `frontend/` React application (Vite).
- `run_pipeline.py` executes scraping + merge pipeline.
- `career_finder.py` finds career pages and jobs.
- `merger.py` deduplicates/merges company records.

## Data Schema

Each company record in `data/companies.json`:

- `name`
- `website`
- `career_page_url`
- `country_of_origin`
- `source`
- `jobs` (list of `{ title, url }`)

## API Endpoints

Base: `http://127.0.0.1:8011`

- `GET /` health message
- `GET /companies` company list with filters/sorting
- `GET /jobs` flattened job search endpoint
- `GET /sources/health` source run health summary
- `GET /debug/stats` quick stats for UI

## Run Locally (Python + Node)

1. Install Python dependencies:
   - `pip install -r requirements.txt`
2. Build dataset:
   - `python run_pipeline.py`
3. Start API:
   - `python -m uvicorn api.main:app --reload --port 8011 --app-dir <absolute-path-to-eu-companies-scraper>`
4. Start frontend:
   - `cd frontend`
   - `npm install`
   - `npm run dev`
5. Open:
   - Frontend: `http://127.0.0.1:5173`
   - API docs: `http://127.0.0.1:8011/docs`

## Run with Docker Compose

From `eu-companies-scraper/`:

1. Optional one-time scrape refresh:
   - `docker compose --profile setup up --build pipeline`
2. Start app:
   - `docker compose up --build`
3. Open:
   - Frontend: `http://127.0.0.1:8080`
   - API: `http://127.0.0.1:8011`
4. Stop:
   - `docker compose down`

## GitHub Automation

### 1) Scraping workflow

Workflow: `.github/workflows/scrape.yml`

- Runs every 6 hours.
- Runs manually via workflow dispatch.
- Commits updated data files when changed.

### 2) Frontend deploy workflow (GitHub Pages)

Workflow: `.github/workflows/deploy-frontend.yml`

- Builds frontend in static mode.
- Reads `data/companies.json` from the repo.
- Deploys public site to GitHub Pages.

## Publish Public Link on GitHub Pages

1. Ensure workflows are in the repo root `.github/workflows`.
2. Push to `main`.
3. In GitHub: `Settings -> Pages -> Source = GitHub Actions`.
4. Run `Deploy Frontend (GitHub Pages)` once.
5. Public URL:
   - `https://<your-github-username>.github.io/<repo-name>/`

## Notes

- Some sources may block scraping with anti-bot protections.
- Career/job extraction quality depends on site structure.
- Keep `data/companies.json` committed so Pages can serve fresh data without a live backend.

## License

Add your preferred open-source license file (for example MIT) in the repo root.

## Public Link to access the platform
- https://artenisalija.github.io/Open-Job-Board-EU/
