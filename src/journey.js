const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const nonnegative = (value) => finite(value) != null && value >= 0 ? value : null;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function journeyAtProgress(route, progress) {
  if (!route) return null;
  const fraction = finite(progress) == null ? 0 : clamp(progress / 100, 0, 1);
  const segments = Array.isArray(route.segments) ? route.segments : [];
  const timed = segments.length > 0 && segments.every((s) => nonnegative(s.hours) != null);
  const totalHours = timed ? segments.reduce((sum, s) => sum + s.hours, 0) : nonnegative(route.hours);
  const elapsedHours = totalHours == null ? null : totalHours * fraction;
  const remainingHours = totalHours == null ? null : Math.max(0, totalHours - elapsedHours);
  const outcomes = Array.isArray(route.cargo_results) ? route.cargo_results : [];
  const perishables = outcomes.filter((item) => item.perishable === true);
  const qualityAt = (item) => {
    if (item.perishable === false) return 100;
    const life = finite(item.effective_shelf_life_hours), budget = nonnegative(item.departure_remaining_hours);
    return life != null && life > 0 && budget != null && elapsedHours != null
      ? clamp(100 * (budget - elapsedHours) / life, 0, 100) : null;
  };
  const lowest = (values) => values.length && values.every((v) => finite(v) != null) ? Math.min(...values) : null;
  const worstFreshness = lowest(perishables.map(qualityAt));
  const arrivalFreshness = lowest(perishables.map((item) => finite(item.freshness) == null ? null : clamp(item.freshness, 0, 100)));
  const weighted = outcomes.filter((item) => finite(item.weight) != null && item.weight > 0);
  const weight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const freshness = weight > 0 && weighted.every((item) => qualityAt(item) != null)
    ? weighted.reduce((sum, item) => sum + item.weight * qualityAt(item), 0) / weight : null;

  // Current responses carry exact per-segment fuel. Legacy saved routes use the
  // same cubic-rate model, normalized to their stored route total.
  const exactFuel = timed && segments.every((s) => nonnegative(s.fuel) != null);
  const legacyWeights = timed && segments.every((s) => nonnegative(s.distance) != null && finite(s.speed) != null && s.speed > 0);
  const weights = exactFuel ? segments.map((s) => s.fuel) : legacyWeights ? segments.map((s) => s.distance * s.speed ** 2) : [];
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const totalFuel = exactFuel ? totalWeight : nonnegative(route.fuel);
  let elapsed = 0, used = 0, activeSegment = segments.find((s) => s.hours > 0) || null;
  if (timed && elapsedHours != null) {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i], hours = segment.hours;
      const usedFraction = hours > 0 ? clamp((elapsedHours - elapsed) / hours, 0, 1) : 0;
      used += (weights[i] || 0) * usedFraction;
      if (hours > 0 && (elapsedHours < elapsed + hours || fraction === 1)) activeSegment = segment;
      elapsed += hours;
      if (elapsedHours < elapsed) break;
    }
  }
  const fuelConsumed = totalFuel == null || totalHours == null ? null : fraction === 1 ? totalFuel
    : totalWeight > 0 ? totalFuel * clamp(used / totalWeight, 0, 1) : totalFuel * fraction;
  const factor = finite(route.calculation?.co2_per_tonne_fuel) ?? 3.114;
  const assessed = route.whale_assessed !== false && finite(route.protection) != null;
  const exposure = nonnegative(route.calculation?.habitat_exposure), reference = finite(route.calculation?.habitat_reference_nm);
  const protection = !assessed ? null : exposure != null && reference != null && reference > 0
    ? 100 * reference / (reference + exposure) : clamp(route.protection, 0, 100);
  return { elapsedHours, remainingHours, totalHours, totalFuel, freshness, worstFreshness, arrivalFreshness,
    perishableCount: perishables.length, fuelConsumed, co2Consumed: fuelConsumed == null || factor <= 0 ? null : fuelConsumed * factor,
    protection, activeSegment, activeSpeed: finite(activeSegment?.speed) ?? finite(route.speed) };
}
