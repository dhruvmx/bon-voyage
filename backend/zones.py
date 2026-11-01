"""Whale habitat and slow-zone layer.

Polygon zones are read from ``backend/whale_data/whale_zones*.geojson`` (standard
GeoJSON, coordinates in lon/lat order). Legacy circular zones (the California
scenario) are plain dictionaries with ``lat``/``lon``/``radius_nm`` and no
``rings``.

The geometry is deliberately pure Python: a handful of polygons does not
justify a GIS dependency in a deployment that must stay light. Every zone has a
bounding box, and a segment only touches ring edges when it overlaps that box.

Conventions
-----------
* Rings are stored as ``[lat, lon]`` pairs, without a repeated closing point.
  A zone's ``rings`` list is ``[outer, *holes]``.
* A polygon must not cross the antimeridian; split it at 180 degrees instead.
  Route points may use longitudes beyond +/-180 (see ``routing.unwrap``) and are
  wrapped here before testing.
* ``months`` is ``None`` for a year-round zone, otherwise a list of calendar
  months (1-12) in which the zone applies.
"""
import json
import math
from pathlib import Path

DATA_DIR = Path(__file__).parent / 'whale_data'  # not 'data/': .gitignore excludes that name
KINDS = ('whale', 'vsr')
EARTH_NM = 3440.065


def distance_nm(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[0] - a[0])
    dn = math.radians(b[1] - a[1])
    h = math.sin(dl / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dn / 2) ** 2
    return EARTH_NM * 2 * math.asin(min(1, math.sqrt(h)))


def wrap_lon(lon):
    """Map any longitude into [-180, 180)."""
    return (lon + 180.0) % 360.0 - 180.0


# --- loading -----------------------------------------------------------------

def _ring(coords, where):
    points = []
    for position in coords:
        try:
            lon, lat = float(position[0]), float(position[1])
        except (TypeError, ValueError, IndexError):
            raise ValueError(f'{where}: invalid coordinate {position!r}') from None
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f'{where}: coordinate {position!r} is outside lon/lat range')
        points.append([lat, lon])
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    if len(points) < 3:
        raise ValueError(f'{where}: a ring needs at least three distinct points')
    for a, b in zip(points, points[1:] + points[:1]):
        if abs(a[1] - b[1]) > 180:
            raise ValueError(f'{where}: ring crosses the antimeridian; split it at 180 degrees')
    return points


def _months(value, where):
    if value in (None, ''):
        return None
    ok = isinstance(value, list) and value and all(type(m) is int and 1 <= m <= 12 for m in value)
    if not ok:
        raise ValueError(f'{where}: months must be null or a non-empty list of integers 1-12')
    return sorted(set(value))


def _polygons(geometry, where):
    kind = (geometry or {}).get('type')
    coordinates = (geometry or {}).get('coordinates')
    if kind == 'Polygon':
        return [coordinates]
    if kind == 'MultiPolygon':
        return list(coordinates)
    raise ValueError(f'{where}: geometry must be a Polygon or MultiPolygon, not {kind!r}')


def load_zones(directory=DATA_DIR):
    """Read every ``whale_zones*.geojson`` file in *directory* into zone dictionaries."""
    zones, seen = [], set()
    for path in sorted(Path(directory).glob('whale_zones*.geojson')):
        data = json.loads(path.read_text(encoding='utf-8'))
        for index, feature in enumerate(data.get('features', [])):
            where = f'{path.name} feature {index}'
            props = feature.get('properties') or {}
            zone_id = str(props.get('id') or '').strip()
            name = str(props.get('name') or '').strip()
            kind = props.get('kind')
            if not zone_id or not name:
                raise ValueError(f'{where}: id and name are required')
            if kind not in KINDS:
                raise ValueError(f'{where}: kind must be one of {KINDS}')
            months = _months(props.get('months'), where)
            parts = _polygons(feature.get('geometry'), where)
            for number, part in enumerate(parts, 1):
                rings = [_ring(ring, where) for ring in part]
                unique_id = zone_id if len(parts) == 1 else f'{zone_id}-{number}'
                if unique_id in seen:
                    raise ValueError(f'{where}: duplicate zone id {unique_id!r}')
                seen.add(unique_id)
                lats = [p[0] for p in rings[0]]
                lons = [p[1] for p in rings[0]]
                zones.append({
                    'id': unique_id, 'name': name, 'kind': kind, 'months': months,
                    'source': str(props.get('source') or ''),
                    'approximate': bool(props.get('approximate', True)),
                    'lat': round((min(lats) + max(lats)) / 2, 4),
                    'lon': round((min(lons) + max(lons)) / 2, 4),
                    'rings': rings,
                })
    return zones


# --- geometry ----------------------------------------------------------------

def _inside(ring, lat, lon):
    """Even-odd ray cast on a [lat, lon] ring."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _crossing(ax, ay, bx, by, cx, cy, dx, dy):
    """Parameter t along A->B where it meets segment C->D, or None."""
    rx, ry = bx - ax, by - ay
    sx, sy = dx - cx, dy - cy
    denominator = rx * sy - ry * sx
    if denominator == 0:
        return None
    qx, qy = cx - ax, cy - ay
    t = (qx * sy - qy * sx) / denominator
    u = (qx * ry - qy * rx) / denominator
    return t if 0 <= t <= 1 and 0 <= u <= 1 else None


class _Entry:
    __slots__ = ('zone', 'rings', 'bbox')

    def __init__(self, zone):
        self.zone = zone
        self.rings = zone.get('rings')
        if self.rings:
            outer = self.rings[0]
            lats = [p[0] for p in outer]
            lons = [p[1] for p in outer]
            self.bbox = (min(lats), max(lats), min(lons), max(lons))
        else:
            self.bbox = None


class ZoneIndex:
    """Month-aware lookups over circular and polygon zones."""

    def __init__(self, zones):
        self.zones = list(zones)
        self._entries_all = [_Entry(zone) for zone in self.zones]
        self._by_month = {}

    def _entries(self, month=None):
        if month is None:
            return self._entries_all
        if month not in self._by_month:
            self._by_month[month] = [
                e for e in self._entries_all
                if e.zone.get('months') is None or month in e.zone['months']]
        return self._by_month[month]

    def active_ids(self, month=None):
        return [e.zone['id'] for e in self._entries(month)]

    def zone_at(self, point, month=None):
        """Zone containing *point*; a whale-habitat zone wins over a slow-zone overlap."""
        lat, lon = point[0], wrap_lon(point[1])
        found = None
        for entry in self._entries(month):
            zone = entry.zone
            if entry.rings is None:
                hit = distance_nm(point, [zone['lat'], zone['lon']]) <= zone['radius_nm']
            else:
                min_lat, max_lat, min_lon, max_lon = entry.bbox
                hit = (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon
                       and _inside(entry.rings[0], lat, lon)
                       and not any(_inside(hole, lat, lon) for hole in entry.rings[1:]))
            if hit:
                if zone['kind'] == 'whale':
                    return zone
                found = found or zone
        return found

    def split_segment(self, a, b, month=None):
        """Points ``[a, ..., b]`` along the straight lat/lon segment, cut wherever it crosses a polygon edge.

        Circular zones are never cut; they keep the legacy midpoint classification.
        """
        entries = [e for e in self._entries(month) if e.rings is not None]
        if not entries:
            return [a, b]
        shift = -360.0 * math.floor((a[1] + 180.0) / 360.0)
        ax, ay, bx, by = a[1] + shift, a[0], b[1] + shift, b[0]
        lo_x, hi_x = min(ax, bx), max(ax, bx)
        lo_y, hi_y = min(ay, by), max(ay, by)
        cuts = []
        for entry in entries:
            min_lat, max_lat, min_lon, max_lon = entry.bbox
            if hi_y < min_lat or lo_y > max_lat:
                continue
            for copy in (-360.0, 0.0, 360.0):
                if hi_x < min_lon + copy or lo_x > max_lon + copy:
                    continue
                for ring in entry.rings:
                    for i in range(len(ring)):
                        y1, x1 = ring[i]
                        y2, x2 = ring[(i + 1) % len(ring)]
                        if max(y1, y2) < lo_y or min(y1, y2) > hi_y:
                            continue
                        if max(x1, x2) + copy < lo_x or min(x1, x2) + copy > hi_x:
                            continue
                        t = _crossing(ax, ay, bx, by, x1 + copy, y1, x2 + copy, y2)
                        if t is not None and 1e-9 < t < 1 - 1e-9:
                            cuts.append(t)
        if not cuts:
            return [a, b]
        cuts.sort()
        unique = [cuts[0]]
        for t in cuts[1:]:
            if t - unique[-1] > 1e-9:
                unique.append(t)
        inner = [[round(a[0] + (b[0] - a[0]) * t, 6), round(a[1] + (b[1] - a[1]) * t, 6)] for t in unique]
        return [a, *inner, b]
