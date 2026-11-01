# Data and calculations

## Routes

- [searoute-py](https://github.com/genthalili/searoute-py) 1.6.0 supplies the offline sea-lane network. California pairs use the original scenario waypoints.
- Alternatives avoid selected passages such as Suez, Panama and Malacca. Duplicate geometry is removed.
- Port coordinates and coastlines are approximate. These routes do not check draft, berth access, closures, weather or port delays.
- Map attribution: [Natural Earth](../public/DATA-LICENSE.md).

## Arrival and speed

- Arrival allowance is a deadline, not the voyage duration. No waiting is added.
- Open-water speed: vessel minimum to maximum, in 0.01-knot steps.
- Mapped slow zones: 5 knots to the lower of 10 knots and vessel maximum, in 0.1-knot steps; the exact upper limit is included.
- Recommended balance prioritizes deadline feasibility, avoiding cargo expiry, then minimizing the worst shortfall below 70% arrival quality before cost weights.
- Fastest arrival minimizes time; lowest fuel minimizes consumption within the deadline.
- If no route meets the deadline, the earliest available arrival is shown.

## Cargo

- 255 products; handling defaults are editable estimates, not a trade-volume ranking or food-safety limits.
- Each item has weight, temperature, shelf life and age. Mixed cargo assumes separate compartments.
- Perishable quality uses:

```text
thermal = max(1, 2 ** ((temperature - reference_temperature) / 10))
effective_life = shelf_life / thermal
quality_percent = 100 * max(0, effective_life - age - sailing_hours) / effective_life
```

- Frozen cargo above its thaw threshold has a capped quality horizon: usually 72 hours; ice cream uses 4 hours above -5°C. Colder settings do not extend the declared shelf life.
- Durable goods have no modeled spoilage. The dashboard shows the lowest perishable quality; saved route averages are weighted by cargo mass.
- Automatic freshness priority is `clamp(0.9 / (1 + remaining_hours / 168), 0.10, 0.85)`; the remaining weight is split 60:40 between fuel and habitat. Custom routing preferences override these weights.
- The 70% target is planning policy. Packaging, humidity, contamination and temperature history are not modeled.

## Fuel and emissions

```text
segment_hours = distance_nm / speed_knots
segment_fuel_tonnes = vessel_tonnes_per_day_at_18_knots / 24 * (speed_knots / 18) ** 3 * segment_hours
CO2_tonnes = fuel_tonnes * 3.114
```

The dashboard sums unrounded segment values during playback. Older saved routes use their stored totals and segment fuel proportions.

## Whale zones

- California circles and [worldwide polygons](whale_data/whale_zones.geojson) are approximate planning inputs, not official boundaries or live detections.
- Zones apply by departure month. A voyage entering another month is not re-evaluated for seasonality.
- Polygon crossings are split at boundaries. California circles use midpoint classification.
- Habitat exposure is `habitat_distance_nm * (protected_speed / 10) ** 2 * activity`. The score is `100 * 50 / (50 + exposure)`; 50 nm is a model reference, not a safety threshold.
- Coverage is partial. Crossing no mapped zone does not mean whale-free. Older unassessed voyages retain a null score and are excluded from averages.

Import licensed GeoJSON with [import_zones.py](import_zones.py):

```sh
python -m backend.import_zones source.geojson --out backend/whale_data/whale_zones_import.geojson --kind whale --source "Dataset name" --id-prefix imported
```

Zone files require unique `id`, `name` and `kind` properties. `months`, `source` and `approximate` are optional. Restart the server after changing files; replace overlapping seed data when appropriate.

## References

- [UC Davis produce facts](https://postharvest.ucdavis.edu/produce-facts) — storage conditions; not shipment-specific calibration.
- [FoodSafety.gov cold-storage chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts) — quality and safety distinctions.
- [IMMA atlas](https://www.marinemammalhabitat.org/imma-eatlas/) · [Spatial-data access](https://www.marinemammalhabitat.org/immas/imma-spatial-layer-download/) — external references; these authoritative layers are not bundled.
