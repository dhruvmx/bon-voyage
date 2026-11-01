# Repository structure

| Path | Contents |
| --- | --- |
| [src/](src/) | React screens, forms, map, dashboard and PDF export |
| [backend/](backend/) | FastAPI endpoints, routing, calculations and storage |
| [backend/whale_data/](backend/whale_data/) | Bundled whale-zone polygons |
| [public/](public/) | Coastline, favicon and data attribution |
| [tests/](tests/) | Browser tests; Python and JavaScript unit tests sit beside their code |
| [.github/workflows/](.github/workflows/) | Automated checks |

## Main files

- [src/App.jsx](src/App.jsx): workspace state, planning form, accounts and saved voyages.
- [src/Map.jsx](src/Map.jsx): Leaflet map, layers and playback marker.
- [src/CargoPicker.jsx](src/CargoPicker.jsx): cargo selection and editing.
- [src/journey.js](src/journey.js): dashboard values at each playback position.
- [src/api.js](src/api.js): API requests; [src/voyagePdf.js](src/voyagePdf.js): PDF reports.
- [backend/main.py](backend/main.py): API routes, validation and authentication.
- [backend/routing.py](backend/routing.py): sea paths and route results.
- [backend/optimizer.py](backend/optimizer.py): path and speed selection within the deadline.
- [backend/cargo_model.py](backend/cargo_model.py): freshness; [backend/cargo_catalog.py](backend/cargo_catalog.py): product defaults.
- [backend/zones.py](backend/zones.py): zone intersections; [backend/import_zones.py](backend/import_zones.py): GeoJSON import.
- [backend/database.py](backend/database.py): SQLite and PostgreSQL storage.
- [src/style.css](src/style.css) and [src/themes.css](src/themes.css): layout and colours.

## Entry points

- [run.py](run.py): local setup and server launch.
- [src/main.jsx](src/main.jsx): mounts React.
- [app.py](app.py) + [vercel.json](vercel.json): Vercel entry point and build configuration.
- [vite.config.js](vite.config.js): frontend build and development API proxy.

## Request flow

Planning form → `POST /api/plan` → sea paths → speed optimization → cargo/fuel/habitat estimates → map and dashboard.

Saved voyages and vessels use authenticated API endpoints and the database. Playback and PDF generation run in the browser.
