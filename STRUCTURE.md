# Repo guide

## Folders

| Path | Purpose |
| --- | --- |
| [src/](src/) | React interface, forms, map, dashboard and PDF export |
| [backend/](backend/) | API, routing, calculations, accounts and database |
| [public/](public/) | Coastline, favicon and data attribution |
| [tests/](tests/) | Browser tests; unit tests sit beside the code they check |
| [.github/workflows/](.github/workflows/) | Automated checks |

## Where to make changes

| Change | Files |
| --- | --- |
| Planning form and saved voyages | [App.jsx](src/App.jsx) |
| Cargo picker and fields | [CargoPicker.jsx](src/CargoPicker.jsx) |
| Map and navigation marker | [Map.jsx](src/Map.jsx), [voyagePosition.js](src/voyagePosition.js) |
| Dashboard values | [journey.js](src/journey.js) |
| PDF layout | [voyagePdf.js](src/voyagePdf.js) |
| API requests | [api.js](src/api.js) |
| Layout and colours | [style.css](src/style.css), [themes.css](src/themes.css) |
| API endpoints and validation | [main.py](backend/main.py) |
| Sea paths and route results | [routing.py](backend/routing.py) |
| Path and speed selection | [optimizer.py](backend/optimizer.py) |
| Cargo defaults and freshness | [cargo_catalog.py](backend/cargo_catalog.py), [cargo_model.py](backend/cargo_model.py) |
| Database access | [database.py](backend/database.py) |

## Entry points

- [run.py](run.py): installs dependencies, builds the frontend and starts the local server.
- [src/main.jsx](src/main.jsx): starts React.
- [app.py](app.py) and [vercel.json](vercel.json): Vercel entry point and build settings.
- [vite.config.js](vite.config.js): frontend build and local API proxy.

## Planning flow

Form → `POST /api/plan` → candidate sea paths → speed optimization → route estimates → map and dashboard.

The API stores accounts, vessels and voyages. Map playback and PDF generation run in the browser.
