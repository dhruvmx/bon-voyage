export function journeyAtProgress(route, progress) {
    if (!route) return null;

    const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress / 100)) : 0;
    const totalHours = route.segments?.reduce((sum, segment) => sum + Math.max(0, Number(segment.hours) || 0), 0) || route.hours;
    const elapsedHours = totalHours * fraction;
    const remainingHours = Math.max(0, totalHours - elapsedHours);
    const outcomes = Array.isArray(route.cargo_results) ? route.cargo_results : [];
    const manifestWeight = outcomes.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
    const perishables = outcomes.filter((item) => item.perishable);
    const qualityAt = (item) => !item.perishable ? 100 : Math.max(0, Math.min(100, 100 * (Number(item.departure_remaining_hours) - elapsedHours) / Number(item.effective_shelf_life_hours)));
    const worstFreshness = perishables.length ? Math.min(...perishables.map(qualityAt)) : null;
    const currentFreshness = outcomes.length && manifestWeight > 0
      ? outcomes.reduce((sum, item) => {
          if (!item.perishable) return sum + (Number(item.weight) || 0) * 100;
          const effectiveLife = Number(item.effective_shelf_life_hours);
          const departureRemaining = Number(item.departure_remaining_hours);
          const quality = Number.isFinite(effectiveLife) && effectiveLife > 0 && Number.isFinite(departureRemaining)
            ? Math.max(0, Math.min(100, 100 * (departureRemaining - elapsedHours) / effectiveLife))
            : Number(item.freshness) || 0;
          return sum + (Number(item.weight) || 0) * quality;
        }, 0) / manifestWeight
      : Number(route.freshness) || 0;

    const segments = Array.isArray(route.segments) ? route.segments : [];
    const totalFuelWeight = segments.reduce((sum, segment) => {
      const speed = Number(segment.speed) || Number(route.speed) || 0;
      return sum + Math.max(0, Number(segment.distance) || 0) * speed * speed;
    }, 0);
    let elapsedSegmentHours = 0;
    let usedFuelWeight = 0;
    let activeSegment = segments[0] || null;
    for (const segment of segments) {
      const duration = Math.max(0, Number(segment.hours) || 0);
      const speed = Number(segment.speed) || Number(route.speed) || 0;
      const segmentFuelWeight = Math.max(0, Number(segment.distance) || 0) * speed * speed;
      const segmentFraction = duration > 0
        ? Math.max(0, Math.min(1, (elapsedHours - elapsedSegmentHours) / duration))
        : (elapsedHours >= elapsedSegmentHours ? 1 : 0);
      usedFuelWeight += segmentFuelWeight * segmentFraction;
      if (elapsedHours <= elapsedSegmentHours + duration || segment === segments[segments.length - 1]) {
        activeSegment = segment;
        break;
      }
      elapsedSegmentHours += duration;
    }
    const fuel = Number(route.fuel) || 0;
    const fuelConsumed = totalFuelWeight > 0
      ? fuel * Math.max(0, Math.min(1, usedFuelWeight / totalFuelWeight))
      : fuel * fraction;
    return {
      arrivalFreshness: perishables.length ? Math.min(...perishables.map((item) => Number(item.freshness))) : null,
      worstFreshness,
      perishableCount: perishables.length,
      elapsedHours,
      remainingHours,
      freshness: Math.max(0, Math.min(100, currentFreshness)),
      fuelConsumed: fraction >= 1 ? fuel : fuelConsumed,
      co2Consumed: (fraction >= 1 ? fuel : fuelConsumed) * 3.114,
      activeSegment,
      activeSpeed: Number(activeSegment?.speed) || Number(route.speed) || 0,
    };
}
