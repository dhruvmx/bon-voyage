# Bon Voyage

React + Vite frontend, Python FastAPI backend, and SQLite storage. A complete local maritime food logistics prototype with account-based workspaces and a minimal, consistent dashboard.

## Start

Requires Python 3.10+ and Node.js 20.19+ or 22.12+.

```sh
python run.py
```

On Windows, double-click `Start-Bon-Voyage.cmd` if Python Launcher is installed. The launcher creates an isolated environment, installs dependencies, builds React, and starts Python. Open **http://localhost:8000**. Stop with Ctrl+C.

## Manual setup

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
npm run build
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

For development, keep Python running and use `npm run dev` in a second terminal. Vite opens on http://localhost:5173 and proxies `/api` to Python.

## Try the full flow

1. Explore the dashboard as a guest. Switch cargo categories, ports, arrival windows, temperatures, and map layers.
2. Click **Sign up** and create your own account. No seeded credentials are needed.
3. Open **My fleet**, add a vessel, and enter maximum speed, consumption at 18 knots, and cargo capacity.
4. Return to the planner, expand **Vessel, cargo & departure details**, and assign the vessel.
5. Enter cargo name, weight, age, shelf life, temperature, departure time, and whale activity.
6. Compare the three passages and select one. Play or scrub the voyage on the map.
7. Save your passage with a name, notes, and operational status.
8. Open **My voyages** to search, reopen, edit, export, or delete saved voyages. Open **Impact overview** for aggregate metrics.
9. Use the profile icon to edit your name, organization, and role, change your password, or log out. Log back in to retrieve the same data.

## What is implemented

- Email/password signup and login; PBKDF2 salted password hashes; server-side opaque sessions; HttpOnly, SameSite cookies; login throttling and cross-origin write checks.
- Server-enforced account isolation for vessel and voyage CRUD. Password changes revoke previous sessions.
- Persistent SQLite storage in `data/tideway.sqlite3`, excluded from Git. Restarting the server preserves accounts and records.
- Python route optimization over sampled geographic sea waypoints for Los Angeles, Oakland, San Diego, and Humboldt Bay, in either direction.
- Protected segment speeds at or below 10 knots, vessel maximum-speed limits, arrival feasibility, temperature-dependent freshness, shelf-life decay, cubic fuel calculation, CO₂ estimates, and whale exposure scores.
- Interactive Leaflet map with bundled Natural Earth coastline data, habitat overlays, protected speed segments, alternatives, tooltips, zoom, recentering, and time-based ship animation.
- JSON export, editable profiles, fleet management, voyage statuses, search, empty states, loading states, validation, and API error handling.
- Responsive layout with mobile navigation.

The map and coastline data are bundled and work offline. The California route and habitat datasets are included planning scenarios; API accounts or live AIS/whale feeds are not required. Planning and saved records work locally.

## Tests

```sh
python -m unittest backend.test_app -v
npm run build
```

Tests cover authentication, password changes, duplicate accounts, password hashing, profile updates, account isolation, CRUD, vessel constraints, persistent records, route geometry, speed limits, temperature response, arrival feasibility, invalid inputs, and cross-origin protection. They use temporary isolated databases.

## API

Interactive API documentation: http://localhost:8000/docs

| Endpoint | Purpose |
| --- | --- |
| `GET /api/catalog` | Supported ports, cargo categories, habitat zones |
| `POST /api/plan` | Public route calculation |
| `POST /api/auth/signup`, `/login`, `/logout` | Account sessions |
| `GET /api/auth/me` | Current account |
| `PUT /api/profile`, `/api/auth/password` | Profile and password updates |
| `GET/POST /api/vessels`, `PUT/DELETE /api/vessels/{id}` | Private fleet management |
| `GET/POST /api/voyages`, `PUT/DELETE /api/voyages/{id}` | Private voyage management |
| `GET /api/health` | Backend/database health |

## Structure

`src/App.jsx` owns React workspace state and forms. `src/Map.jsx` integrates Leaflet. `src/api.js` handles requests and exports. `backend/main.py` handles accounts, persistence, validation, and static delivery. `backend/routing.py` implements route calculations. `backend/test_app.py` exercises the complete API.

`BON_VOYAGE_DB` overrides the local database path (`TIDEWAY_DB` remains supported for existing local installs). `PORT` overrides the launcher port. Set `COOKIE_SECURE=true` when serving behind HTTPS. The Python server serves the built Vite frontend from the same origin. Use a persistent filesystem if deploying this SQLite configuration. The earlier hosted static Site remains separate from this local full-stack version.


## Styling

Edit the variables at the top of src/style.css to change colors, typography, spacing, or corner radius throughout the app. Shared surface, button, field, and layout rules apply across all pages. The stylesheet has 249 lines and two responsive breakpoints; no CSS framework or generated utility classes are required. Secondary vessel and cargo inputs remain under the expandable details section.



## Vercel deployment

The project includes vercel.json and pyproject.toml with the FastAPI entrypoint backend.main:app. Vercel runs npm ci and npm run build, then serves the React build with the Python API. Production account and voyage storage requires a connected hosted database; local SQLite files are not persistent on Vercel. Keep database credentials in Vercel environment variables, never in source control.

Repository: https://github.com/dhruvmx/bon-voyage


