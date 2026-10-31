# Planning data and coverage

## Maritime routes

International geometry uses the bundled maritime network in [searoute-py](https://github.com/genthalili/searoute-py), pinned at version 1.6.0. It does not call a live routing API. The planner tries a baseline avoiding the Northwest Passage, then alternatives avoiding Suez, Panama, or Malacca. Identical results are deduplicated; if fewer than three paths exist, speed profiles share geometry. These paths do not certify vessel draft, berth access, canal availability, or navigational suitability.

California port pairs retain the project's original scenario waypoints. The supported port coordinates are approximate. The map's simplified worldwide coastline is for illustration; see `public/DATA-LICENSE.md` for the repository's attribution.

## Habitat data

The four bundled California habitat and approach circles are **illustrative scenario inputs**. They are not live detections, official habitat polygons, or a worldwide speed-regulation dataset. The modeled 10-knot limit applies only to those scenario segments. California scores are labeled scenario estimates.

No authoritative worldwide habitat spatial dataset is bundled. International routes are therefore labeled **unassessed**, with a null whale-protection score. A route with no known zone intersections is not assumed whale-free. Such routes are excluded from whale-score averages, including older saved international voyages, rather than averaged as zero or 100. Coverage metadata accompanies saved voyages and JSON exports.

The [IUCN Marine Mammal Protected Areas Task Force IMMA e-Atlas](https://www.marinemammalhabitat.org/imma-eatlas/) explains why areas outside mapped Important Marine Mammal Areas may still be important habitat. Its [spatial-data access page](https://www.marinemammalhabitat.org/immas/imma-spatial-layer-download/) describes obtaining authoritative layers. This app links to that source for context; it does not claim to contain those layers. An authoritative spatial layer and its usage terms must be obtained before offering broader habitat assessments.

## Cargo catalogue and model

`cargo_catalog.py` contains 255 representative products across produce, dry foods, chilled and frozen foods, beverages, ores/bulk materials, forestry, metals, energy/chemicals, machinery, and manufactured goods. The list is curated product vocabulary, not a statistical ranking of the world's top cargo by tonnage or value.

Product handling values and generic custom-cargo profiles are editable modeling assumptions. Each item has its own temperature, shelf life, and age; catalogue products use their own default temperature as the thermal reference. Mixed manifests assume separate cargo compartments. The model does not assess co-loading compatibility or provide carriage instructions.

### Product-specific quality model (quality-budget-v2)

All 255 products carry numeric model metadata. The 115 food/flower products have individually specified quality horizons and reference temperatures in `ITEM_PARAMETERS`; the 140 durable commodities have zero modeled spoilage loss. For example, apples use a 60-day horizon at 0°C (1.67% of the budget per day), raspberries use 3 days at 0°C (33.33% per day), and computers have no spoilage budget. These are editable scenario estimates, not measured food-safety limits or guarantees against other types of damage.

For perishables, `thermal = max(1, Q10 ** ((temperature - reference_temperature) / 10))`, with Q10 = 2 as an explicit modeling assumption. Effective life is the declared shelf life divided by thermal. Freshness is `100 * max(0, effective_life - cargo_age - transit_hours) / effective_life`. Extra cooling below the reference does not extend the horizon. Frozen goods reaching 0°C have a modeled thawed-quality cap of 72 hours; ice cream uses a 4-hour cap above −5°C. These caps are scenario policy, not safe-thawing guidance.

Automatic freshness priority is `clamp(0.9 / (1 + remaining_hours_at_departure / 168), 0.10, 0.85)` for perishables and zero for durable goods. The remaining weight is split 60:40 between fuel and habitat. An ageing apple load therefore gains urgency without manually changing a category. Operators can override the preference to freshness, fuel, or habitat. Weights are normalized, and unavailable global habitat data is excluded and the remaining weights renormalized.

The manifest uses the highest actionable freshness priority, so a small perishable load is not hidden by a heavy durable load. Every scored component lies in [0,1]: fraction of the remaining quality budget consumed, fuel/(fuel + reference fuel), and assessed habitat exposure/100. Arrival feasibility is ranked first, then newly exhausted cargo tonnage, then the weighted score. Already-exhausted items stay visible but do not conceal the urgency of other viable cargo. The response exposes per-item models and a route score breakdown; saved results preserve the model version.

The headline freshness remains a mass-weighted average. Fuel remains based on declared vessel consumption and speed; capacity uses combined cargo weight. No cargo prices or financial loss values are inferred.

Context for calibration: [UC Davis produce fact sheets](https://postharvest.ucdavis.edu/produce-facts), including [apples](https://postharvest.ucdavis.edu/produce-facts-sheets/apple-golden-delicious) and [strawberries](https://postharvest.ucdavis.edu/produce-facts-sheets/strawberry), explain commodity-dependent storage conditions. [FoodSafety.gov's cold-storage chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts) distinguishes frozen quality horizons from safety. The application does not reproduce those references as validated shipment-specific data; packaging, cultivar, atmosphere, humidity, contamination, and temperature history remain outside this simple model.
