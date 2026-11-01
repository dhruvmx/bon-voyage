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

// Compass bearing in degrees, independent of the icon artwork's orientation.
export function headingAtProgress(route, progress) {
  const segments = (route.segments || []).filter((s) => s.hours > 0 && (s.from[0] !== s.to[0] || s.from[1] !== s.to[1]));
  if (!segments.length) return 0;
  let target = segments.reduce((sum, s) => sum + s.hours, 0) * Math.max(0, Math.min(1, progress / 100));
  let segment = segments.at(-1);
  for (const candidate of segments) { if (target < candidate.hours) { segment = candidate; break; } target -= candidate.hours; }
  const radians = Math.PI / 180;
  const lat1 = segment.from[0] * radians, lat2 = segment.to[0] * radians;
  const delta = (segment.to[1] - segment.from[1]) * radians;
  return (Math.atan2(Math.sin(delta) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta)) / radians + 360) % 360;
}
