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

// Match the straight route line in Leaflet's Web Mercator projection.
// A great-circle initial bearing can point away from that line at high latitudes.
export function headingAtProgress(route, progress) {
  const segments = (route.segments || []).filter((s) => s.hours > 0 && (s.from[0] !== s.to[0] || s.from[1] !== s.to[1]));
  if (!segments.length) return 0;
  const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress / 100)) : 0;
  let target = segments.reduce((sum, s) => sum + s.hours, 0) * fraction;
  let segment = segments.at(-1);
  for (const candidate of segments) { if (target < candidate.hours) { segment = candidate; break; } target -= candidate.hours; }
  const radians = Math.PI / 180;
  const mercatorY = (latitude) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85.051129, Math.min(85.051129, latitude)) * radians / 2));
  // Route longitudes are already unwrapped to the displayed world copy.
  const x = (segment.to[1] - segment.from[1]) * radians;
  const y = mercatorY(segment.to[0]) - mercatorY(segment.from[0]);
  return (Math.atan2(x, y) / radians + 360) % 360;
}

// Keep consecutive CSS angles within 180 degrees, including crossing north.
export function continuousHeading(previous, heading) {
  if (!Number.isFinite(previous)) return heading;
  return previous + ((heading - previous + 180) % 360 + 360) % 360 - 180;
}

export function continuousHeading(previous, current) {
  if (!Number.isFinite(previous)) return current;
  const delta = ((((current - previous) % 360) + 540) % 360) - 180;
  return previous + delta;
}
