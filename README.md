# Bon Voyage

Maritime route planning with cargo, fuel and arrival estimates.

[Live app](https://bon-voyage-eight.vercel.app/) · [GitHub](https://github.com/dhruvmx/bon-voyage)

## Features

- Route comparison across 25 ports; arrival allowance sets the deadline.
- 255 cargo products, custom cargo and up to 10 items per voyage.
- Vessel-based fuel estimates, cargo freshness, CO₂ and whale assessment.
- Accounts, fleet management, saved voyages and PDF export.
- Workspace search, mobile layouts, five themes and light/dark modes.

## Run locally

Requires Python 3.10+ and Node.js 20.19+ or 22.12+.

```sh
python run.py
```

- Installs dependencies, builds the frontend and starts the server.
- Open [localhost:8000](http://localhost:8000). Stop with Ctrl+C.
- Windows: double-click [Start-Bon-Voyage.cmd](Start-Bon-Voyage.cmd).
- Development: run `npm run dev` alongside the Python server; open [localhost:5173](http://localhost:5173).

## Stack & storage

- React + Vite, Leaflet, Python + FastAPI.
- SQLite locally; Neon PostgreSQL on Vercel via `DATABASE_URL`.
- `PORT` changes the launcher port; `BON_VOYAGE_DB` changes the local database path.

## Checks

With `.venv` activated:

```sh
python -m unittest discover -s backend -p 'test_*.py'
npm run test:frontend
npm run build
```

[CI workflow and browser checks](.github/workflows/checks.yml)

## Reference

- [API docs](http://localhost:8000/docs) — available with the server running.
- [Calculations & data coverage](backend/DATA.md) — planning models and mapped whale zones, not live tracking.
- [Data licences](public/DATA-LICENSE.md)
- [Frontend](src/) · [Backend](backend/) · [Vercel config](vercel.json)
