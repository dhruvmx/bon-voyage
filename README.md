# Tideway

A maritime food logistics prototype that balances cargo freshness, fuel consumption, and whale protection.

## Run locally

Requires Node.js 18 or newer. No dependencies or build step.

```sh
npm start
```

Open http://localhost:4173

## Features

- Four cargo profiles: fresh berries, avocados, bulk grain, and electronics.
- Three calculated passages with cargo-aware recommendations.
- Arrival windows and open-water speed compensation, capped at 24 knots.
- Protected segments at 10 knots, whale habitat overlays, and route colors by cargo.
- Temperature-sensitive freshness, fuel estimates, arrival times, and whale protection scores.
- Animated voyage preview, map zoom, layer controls, and port direction swapping.
- Browser-local saved voyages, aggregate impact overview, and JSON export.

## Project structure

- `index.html` contains the dashboard and SVG map. 
- `style.css` contains responsive styling. 
- `app.js` contains the scenario model, routing, and interactions.
- `server.cjs` serves the prototype locally.

The California routes and habitat overlays are scenario inputs. Calculations run in the browser. Saved voyages use localStorage.

## Check

```sh
npm run check
```

