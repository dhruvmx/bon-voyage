# Bon Voyage

Live app: https://bon-voyage-eight.vercel.app

Source: https://github.com/dhruvmx/bon-voyage

React + Vite frontend, Python FastAPI backend, Neon PostgreSQL for Vercel, and SQLite for local installs. A maritime food logistics prototype with account-based workspaces and a minimal, consistent dashboard.

## Start

Requires Python 3.10+ and Node.js 20.19+ or 22.12+.

```sh
python run.py
```

On Windows, double-click `Start-Bon-Voyage.cmd` if Python Launcher is installed. The launcher creates an isolated environment, installs dependencies, builds React, and starts Python. It resynchronizes changed dependency manifests and rebuilds after nested source or asset edits; `PORT` also updates the printed URL. Open **http://localhost:8000**. Stop with Ctrl+C.

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
3. Open **My fleet**, add a vessel, and enter minimum open-water speed, maximum speed, consumption at 18 knots, and cargo capacity.
4. Return to the planner, expand **Vessel & departure**, and assign the vessel.
5. Search the 255-product cargo catalogue or add custom cargo. Add up to 10 distinct items, then expand each item to edit its weight, age, shelf life, and temperature. Set departure time and an arrival window of up to 90 days.
6. Set the latest acceptable arrival, then compare the recommended balance, fastest feasible arrival, and lowest fuel within the deadline. Play or scrub the voyage on the map.
7. Save your passage with a name, notes, and operational status.
8. Open **My voyages** to search, reopen, edit, export, or delete saved voyages. Open **Impact overview** for aggregate metrics.
9. Use the profile icon to edit your name, organization, and role, change your password, or log out. Log back in to retrieve the same data.

## What is implemented

- Email/password signup and login; PBKDF2 salted password hashes; server-side opaque sessions; HttpOnly, SameSite cookies; login throttling and cross-origin write checks.
- Server-enforced account isolation for vessel and voyage CRUD. Password changes revoke previous sessions.
- Persistent Neon PostgreSQL storage in production. Local installs use SQLite; existing local data is retained. Database credentials remain in server-only environment variables.
- Python routing for 25 ports worldwide using the pinned, offline `searoute` network; California pairs retain their scenario corridors. Geometry is cached per port pair, and dateline crossings use continuous longitudes.
- A searchable catalogue of 255 representative maritime commodities across 11 groups, plus custom cargo, with up to 10 items per voyage. This is a curated selection, not a measured ranking by trade volume. Handling defaults are editable planning assumptions.
- Mixed-cargo freshness is calculated per item and averaged by mass. Recommendations also consider the most time-sensitive cargo, while capacity checks use the combined weight. Saved voyages and JSON exports retain the complete manifest; older single-cargo voyages remain supported.
- Each of the 255 products has numeric perishability metadata. Individual food/flower horizons, temperature response, frozen/thawed quality caps, and remaining life drive automatic freshness/fuel/habitat priorities. Durable goods have zero modeled spoilage. Expand an item to inspect its model or override routing preference; selected-route priorities and score breakdowns explain the recommendation. See `backend/DATA.md` for equations and assumptions.
- Arrival windows range from 1 to 2,160 hours (90 days), with a slider and precise numeric entry.
- Protected segment speeds at or below 10 knots, vessel maximum-speed limits, arrival feasibility, temperature-dependent freshness, shelf-life decay, cubic fuel calculation, CO₂ estimates, and whale exposure scores.
- The planner opens with a compact selected-passage summary, map and port inputs. Cargo editing, arrival allowance, route comparison and the detailed voyage report expand on demand; no planning features are removed. The selected passage and its metrics are centered in equal columns on laptops, with the passage name above three metrics on phones. Mobile controls use larger touch targets and compact navigation labels. Signed-out visitors are displayed as John Doe (guest); signed-in profiles use their own account name. On mobile, the setup form appears before the map. Route comparison sits in an expandable section immediately beneath the map, beside the planning form on desktop. Cards show sailing time, fuel burned, lowest cargo quality, and deadline slack, with fuel differences explicitly compared to the recommendation. Selecting an option scrolls to its map and briefly emphasizes its path; reduced-motion preferences receive static emphasis.
- Interactive Leaflet map with bundled Natural Earth coastline data, habitat overlays, protected speed segments, alternatives, tooltips, zoom, recentering, and time-based ship animation.
- PDF voyage reports, editable profiles, fleet management, voyage statuses, search, empty states, loading states, validation, and API error handling.
- Responsive layout with mobile navigation.
- Collapsible, resizable desktop sidebar with remembered width, keyboard resizing, and independent scrolling on short screens. The page and sidebar use themed scrollbars.
- Five workspace themes (Ocean, Forest, Walnut, Sandstone, Slate) with light, dark, and system modes. Appearance preferences persist on the device and sync across open tabs.

The map, sea-lane network, and coastline data are bundled and work offline after installation. No live AIS or whale feed is connected. California habitat/slow-zone overlays are illustrative scenarios; global whale habitat coverage is **unassessed**, and international routes return `protection: null`, not an inferred perfect score. The UI, saved records, exports, and impact averages preserve that distinction. See [data coverage](backend/DATA.md).

## Tests

```sh
python -m unittest discover -s backend -p "test_*.py" -v
npm run test:frontend
npm run build
```

Tests cover authentication, password changes, duplicate accounts, password hashing, profile updates, account isolation, CRUD, vessel constraints, persistent records, route geometry, speed limits, temperature response, arrival feasibility, invalid inputs, and cross-origin protection. They use temporary isolated databases.

Additional checks cover international and Pacific dateline passages, readable missing-dependency/no-route errors, 90-day arrival windows, catalogue size and uniqueness, manifest limits and custom cargo, item-level freshness, canonical product identity, combined-weight capacity checks, and manifest persistence.

Browser regressions cover delayed saves, renewed sessions, genuine expiry, and playback endpoints. `npm run test:planner` also checks the compact homepage and access to cargo/custom cargo, deadlines, vessel settings, comparison, live metrics, export, map coverage, and mobile layouts. Install Chromium once with `npx playwright install chromium`, then start an isolated local server in one terminal:

```sh
BON_VOYAGE_DB=/tmp/bon-voyage-browser.sqlite3 python -m uvicorn backend.main:app --port 8001
```

Run `npm run test:browser` in a second terminal. `npm run test:dialogs` checks delayed vessel saves/deletions, edit-target preservation, duplicate-delete prevention, and recovery from malformed responses. These checks create unique test accounts and voyages in that test database. `BON_VOYAGE_TEST_URL` overrides the local URL; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium executable.

API numeric minimums are 0.001 hours for shelf life, 0.001 tonnes for cargo weight, and 0.001 tonnes/day for consumption. Smaller values return validation errors before calculations.

GitHub Actions runs the backend tests, frontend tests, production build, and browser suites on pull requests and pushes to `main`. A disposable PostgreSQL service exercises the real storage adapter, JSON summary/search queries, impact totals, snapshots, and account isolation. Locally, set `BON_VOYAGE_TEST_POSTGRES_URL` to a test PostgreSQL database to enable that integration test; it creates and removes only a uniquely named test schema. Without the variable, that test is skipped and the SQLite suite still runs.

## API

Interactive API documentation: http://localhost:8000/docs

| Endpoint | Purpose |
| --- | --- |
| `GET /api/catalog` | Supported ports, cargo categories, habitat zones |
| `POST /api/plan` | Public route calculation |
| `POST /api/auth/signup`, `/login`, `/logout` | Account sessions |
| `GET /api/auth/me` | Current account |
| `PUT /api/profile`, `/api/auth/password` | Profile and password updates |
| `GET/POST /api/vessels`, `GET/PUT/DELETE /api/vessels/{id}` | Private fleet management |
| `GET/POST /api/voyages`, `GET/PUT/DELETE /api/voyages/{id}` | Private voyage management |
| `GET /api/voyages/stats` | Account-wide impact totals independent of pagination |
| `GET /api/health` | Backend/database health |

`GET /api/catalog` includes `cargo_products`, `max_cargo_items`, `max_arrival_hours`, and `data_coverage`. Send an optional `cargo_items` array to `/api/plan` or voyage endpoints. Each item has a catalogue `product_id` (or `null` and a custom `name`), `weight` in tonnes, and optional `profile`, `temperature`, `shelf_life` and `cargo_age` in hours. Catalogue identity/profile is resolved server-side. The server rejects more than 10 items, duplicate names, invalid handling values, and total cargo over 100,000 tonnes. Legacy single-cargo requests remain valid.

Responses include per-route `cargo_results`, `worst_cargo_freshness`, `whale_assessed`, and top-level coverage metadata. International `protection` values are null. The optimizer searches every candidate path at 0.01-knot open-water speed intervals within vessel limits. Protected transit speed is also optimized from 5 knots to the applicable cap (at most 10 knots), at 0.1-knot resolution. The arrival window is a maximum, with no waiting added. Results expose ETA, deadline slack, search metadata, and explicit infeasibility when even the fastest candidate is late. Identical path/speed options are labeled; `distinct_paths` reports the actual geometric count. A missing routing dependency returns a readable 503; an unavailable passage returns 422.

List endpoints return `{ items, total, limit, offset, has_more }`, with 20 items by default (maximum 100). Both accept `limit`, `offset` and `q`; voyage search covers the voyage name and cargo manifest. Voyage list items contain small card summaries, without coordinates, segments or full manifests. Fetch `GET /api/voyages/{id}` to edit or export the complete saved snapshot; `GET /api/vessels/{id}` resolves off-page vessel assignments. Fleet and voyage screens load additional pages on demand, while `/api/voyages/stats` supplies totals across the whole account. Session expiry prompts login, preserves the current draft, and restores its record/vessel association when the same account signs back in.

Read requests and stateless route calculations time out after 30 seconds and support cancellation. Invalid successful response bodies produce a recoverable error. Writes are never automatically retried. Display names are trimmed before their length is validated; password whitespace is preserved.

Departure timestamps require a timezone and a UTC year between 1900 and 2100; unsupported dates return validation errors. California habitat scoring uses absolute modeled exposure with a fixed reference, so open-water detours cannot dilute an unchanged habitat passage. See `backend/DATA.md` for the normalization.

## Structure

`src/App.jsx` owns React workspace state and forms. `src/Map.jsx` integrates Leaflet. `src/api.js` handles requests and exports. `backend/main.py` handles accounts, persistence, validation, and static delivery. `backend/routing.py` implements route calculations. `backend/test_app.py` exercises the complete API.

`BON_VOYAGE_DB` overrides the local database path (`TIDEWAY_DB` remains supported for existing local installs). `PORT` overrides the launcher port. Set `COOKIE_SECURE=true` when serving behind HTTPS. The Python server serves the built Vite frontend from the same origin. On Vercel, connect the Neon integration: DATABASE_URL selects PostgreSQL automatically. Deployment refuses ephemeral SQLite storage. The earlier hosted static Site remains separate from this local full-stack version.


Every page load and refresh opens with the Moses parting the sea animation for demos. The Skip button opens the workspace immediately. Reduced-motion preferences skip the opening. The scene uses vector artwork and coordinated staff/water motion, with no generated scene images. Escape also skips the sequence; enabling reduced motion during playback exits immediately. Run `npm run test:intro` against the isolated browser test server to check timing, replay, mobile layouts, and interaction restoration.

## Styling

Use **Appearance** in the header to choose a theme and a light, dark, or system mode. Changes apply immediately across the workspace and map without a reload or route recalculation. Preferences use browser localStorage and remain usable for the current session if storage is unavailable.

Use the button beside the sidebar logo to collapse or expand navigation. Drag its right edge to resize between 216 and 320 pixels, or focus the edge and use Left/Right, Home, and End. Double-click the edge to reset. Sidebar sizing is saved on the device; mobile keeps the bottom navigation.

Edit semantic color palettes in `src/themes.css` and shared typography, spacing, and layout rules in `src/style.css`. `src/appearance.js` restores preferences before React renders; `src/Appearance.jsx` owns the selector, device-mode updates, and cross-tab sync. No theme framework or external font requests are required. Secondary vessel and cargo inputs remain under the expandable details section.



## Vercel deployment

The project includes vercel.json and the standard FastAPI entrypoint app.py, which imports backend.main:app. Python dependencies are installed from the root requirements.txt. Vercel runs npm ci and npm run build, then serves the React build with the Python API. The connected Neon database supplies DATABASE_URL to production and preview deployments. Python initializes the tables and indexes transactionally; migrations are serialized with a Postgres advisory lock. Local SQLite files are not used on Vercel. Keep database credentials in Vercel environment variables, never in source control.

Repository: https://github.com/dhruvmx/bon-voyage


Production storage adapter: backend/database.py. Neon uses psycopg with pooled connections, transaction commits/rollbacks, and dictionary rows. The local interface remains compatible with SQLite so the same API tests can run without cloud credentials.




## Workspace search

Use the header search button or Ctrl/Cmd+K to find features, every supported port, and all cargo products. Suggestions update as you type; use the arrow keys and Enter, or select a result directly. Port suggestions explicitly set departure or destination; cargo suggestions add products without duplicates and respect the 10-item limit. Feature results open the appropriate controls, including appearance, route comparison, exports, and custom cargo. Escape closes search.

Signed-in users can also search all their saved voyages and vessels. Server-side search is debounced and cancellable, with more-results controls for paginated matches. Selecting a voyage loads its complete saved data; selecting a vessel assigns its current specifications. Account changes and expired sessions dismiss search and clear its private results. Run `npm run test:search` against the isolated browser test server for live suggestions, keyboard actions, pagination, stale responses, and 320–1440px layouts.

## Dashboard simulation and cargo quality

The dashboard follows simulated map progress, not live vessel telemetry. Time uses unrounded segment durations. Fuel follows segment distance times speed squared, normalized to the route total calculated from vessel consumption at the 18-knot reference speed; CO2 uses 3.114 tonnes per tonne of fuel. The marker follows segment bearing. The quality headline shows the lowest remaining shelf-life percentage among perishables; durable goods cannot mask an at-risk item. Non-perishable-only manifests show N/A. Whole-route whale scores remain fixed during playback and are scenario exposure scores, not safety probabilities.

Recommended balance first avoids newly expired cargo, then minimizes the worst perishable quality shortfall below a 70% arrival planning target, then applies cost weights. The target is an application policy, not a food-safety standard. Fastest and lowest-fuel alternatives retain their own objectives. A voyage that exceeds usable shelf life remains flagged: refrigeration, cargo age and shelf-life inputs must reflect actual handling; the app never boosts quality to hide an impossible passage.

Export voyage downloads a compact PDF voyage brief (no print dialog). It puts sailing time, estimated fuel, lowest perishable arrival quality and whale assessment first, followed by UTC schedule, vessel settings, a cargo table and short operator notes. A standard ten-item manifest fits one page; long labels or notes can continue on a second page. Geometry and internal model dictionaries are omitted. Missing assessments stay N/A and infeasible deadlines or low-quality cargo remain visible. Saved exports use stored passage results and current assigned-vessel specifications when available. PDF generation ships with the initial application bundle, so export does not request a versioned JavaScript chunk after a deployment.

The navigation marker uses a north-facing vector arrow with a bearing matching the projected route line. Turns use the shortest rotation across north and respect reduced-motion settings. Layer redraws retain playback position and heading. `npm run test:heading` exercises turns during live playback, seeking, layer changes, arrival/rewind and phone layout.

Arrival allowance caps elapsed sailing time; it never adds waiting. The allowance editor shows the selected sailing estimate separately. Current route responses include unrounded segment fuel/CO2 and habitat model inputs, which drive dashboard totals. During edits, obsolete dashboard values clear until the matching plan returns. Legacy voyages retain a proportional segment-fuel fallback.

The cargo dropdown closes after selection, selected rows have separate 44px remove controls, and fields fit narrow panels without nested scrolling. Numeric editing retains typed decimals before converting days to hours. Run `npm run test:cargo` for keyboard/touch-sized cargo editing, decimal precision, deadline and fuel consistency, and stale-response coverage.
