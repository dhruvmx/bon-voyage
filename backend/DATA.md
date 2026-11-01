# Data and calculations

## Routes and deadlines

- International routes use [searoute-py](https://github.com/genthalili/searoute-py) 1.6.0. California pairs use scenario waypoints.
- The planner compares alternative sea paths and speeds. Duplicate paths are removed.
- Arrival allowance is the maximum sailing time. No waiting is added to fill it.
- Open-water speeds use 0.01-knot steps within vessel limits. Protected segments use 0.1-knot steps from 5 knots to the lower of 10 knots and vessel maximum, including the exact cap.
- Recommended balance prioritizes meeting the deadline, avoiding expiry and reducing the worst cargo shortfall below 70% arrival quality, then cost weights.
- Fastest arrival minimizes time. Lowest fuel minimizes consumption within the deadline. If all options are late, the earliest arrival is shown.
- Routes do not account for live weather, currents, port delays, draft or berth access.

## Cargo freshness

- The 255-product catalogue provides editable temperature and shelf-life defaults. It is not a trade-volume ranking.
- Each item has its own weight, temperature, shelf life and age. Mixed cargo assumes separate compartments.

```text
thermal = max(1, 2 ** ((temperature - reference_temperature) / 10))
effective_life = shelf_life / thermal
freshness = 100 * max(0, effective_life - cargo_age - sailing_hours) / effective_life
```

- Cooling below the reference temperature does not extend shelf life.
- Thawed frozen goods use a 72-hour quality cap; ice cream uses 4 hours above -5°C.
- Durable goods have no modeled spoilage. The dashboard shows the lowest perishable freshness; route averages are weighted by cargo mass.
- Automatic freshness weight is `clamp(0.9 / (1 + remaining_hours / 168), 0.10, 0.85)`. The rest is split 60:40 between fuel and habitat. Routing preferences can override these weights.
- Defaults and the 70% target are planning assumptions, not food-safety limits. Packaging, humidity and temperature history are not modeled.

## Fuel and emissions

```text
segment_hours = distance_nm / speed_knots
segment_fuel = vessel_tonnes_per_day_at_18_knots / 24 * (speed_knots / 18) ** 3 * segment_hours
CO2_tonnes = fuel_tonnes * 3.114
```

The dashboard uses unrounded segment totals during playback. Older saved routes use stored totals and segment fuel proportions. Changing cargo weight affects capacity checks; it does not change the vessel's declared consumption curve.

## Whale assessment

- Four illustrative California habitat and approach zones are bundled. They are not live detections or official boundaries.
- Protected transit stays at or below 10 knots. Habitat exposure is `habitat_distance_nm * (protected_speed / 10) ** 2 * activity`.
- The route score is `100 * 50 / (50 + exposure)`. The 50 nm reference is a model setting, not a safety threshold.
- International routes are unassessed: scores are null and excluded from averages. No known habitat data does not mean whale-free.
- Map data attribution: [Natural Earth](../public/DATA-LICENSE.md).

## References

- [UC Davis produce facts](https://postharvest.ucdavis.edu/produce-facts): storage conditions; not shipment-specific calibration.
- [FoodSafety.gov cold-storage chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts): quality and safety distinctions.
- [IMMA atlas](https://www.marinemammalhabitat.org/imma-eatlas/) and [spatial-data access](https://www.marinemammalhabitat.org/immas/imma-spatial-layer-download/): external habitat references; their spatial layers are not bundled.
