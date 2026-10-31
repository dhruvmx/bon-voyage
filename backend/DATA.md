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

Product handling values and the four perishability profiles are editable modeling assumptions. Each item has its own temperature, shelf life, and age; catalogue products use their own default temperature as the thermal reference. Mixed manifests assume separate cargo compartments. The model does not assess co-loading compatibility or provide carriage instructions.

Freshness is calculated for every item. The headline is a mass-weighted average; item results and low-freshness warnings remain visible. Recommendations include the strongest freshness urgency so a small perishable load is not hidden by a large non-perishable load. Fuel remains based on the vessel's declared reference consumption and speed, while vessel capacity uses the sum of all item weights.
