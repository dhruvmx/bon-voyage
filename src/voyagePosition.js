// Use segment time for interpolation; the headline duration is rounded for display.
export function positionAtProgress(route, progress) {
  const coordinates = route.coordinates;
  const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress / 100)) : 0;
  if (fraction <= 0) return coordinates[0];
  if (fraction >= 1) return coordinates.at(-1);
  const segments = route.segments || [];
  const target = segments.reduce((sum, segment) => sum + Math.max(0, segment.hours), 0) * fraction;
  let elapsed = 0;
  for (const segment of segments) {
    if (segment.hours > 0 && elapsed + segment.hours >= target) {
      const t = Math.max(0, Math.min(1, (target - elapsed) / segment.hours));
      return segment.from.map((value, i) => value + (segment.to[i] - value) * t);
    }
    elapsed += Math.max(0, segment.hours);
  }
  return coordinates.at(-1);
}
