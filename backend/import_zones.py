"""Convert an external polygon layer into the app's whale-zone GeoJSON format.

Typical use, after downloading a layer you are licensed to bundle (for example
the IUCN IMMA e-Atlas export, saved or converted to GeoJSON):

    python -m backend.import_zones imma.geojson \\
        --out backend/whale_data/whale_zones_imma.geojson \\
        --kind whale --source "IUCN IMMA e-Atlas" --id-prefix imma

The server loads every ``backend/whale_data/whale_zones*.geojson`` file at startup, so
no code change is needed. The importer

* keeps Polygon and MultiPolygon features and reports everything else,
* simplifies rings (Douglas-Peucker, ``--tolerance`` in degrees, default 0.02),
* splits polygons that cross the antimeridian into two parts at 180 degrees,
* rounds coordinates to 4 decimals and writes unique, URL-safe ids.

It does not decide regulatory status or seasons: use ``--kind vsr`` only for
layers that are actual speed-restriction areas, and ``--months`` for seasonal
ones (comma-separated, e.g. ``11,12,1,2,3,4``).
"""
import argparse
import json
import math
import re
import sys

NAME_FIELDS = ('NAME', 'Name', 'name', 'IMMA_NAME', 'SITENAME')
ID_FIELDS = ('IMMA_ID', 'ID', 'id', 'OBJECTID', 'FID')


def _perpendicular(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def _douglas_peucker(points, tolerance):
    """Iterative Douglas-Peucker on an open polyline (endpoints are kept)."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        worst, index = 0.0, None
        for i in range(first + 1, last):
            d = _perpendicular(points[i], points[first], points[last])
            if d > worst:
                worst, index = d, i
        if index is not None and worst > tolerance:
            keep[index] = True
            stack.extend([(first, index), (index, last)])
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tolerance):
    """Simplify a closed ring ([lon, lat] points, first == last) and keep it closed."""
    open_ring = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else list(ring)
    if tolerance <= 0 or len(open_ring) < 4:
        return open_ring + [open_ring[0]]
    # Split at the point farthest from the start so neither half is a loop.
    far = max(range(len(open_ring)), key=lambda i: _perpendicular(open_ring[i], open_ring[0], open_ring[0]))
    first = _douglas_peucker(open_ring[:far + 1], tolerance)
    second = _douglas_peucker(open_ring[far:] + [open_ring[0]], tolerance)
    simplified = first[:-1] + second[:-1]
    return simplified + [simplified[0]]


def _unwrap(points):
    out = [list(points[0])]
    for lon, lat, *_ in points[1:]:
        prev = out[-1][0]
        while lon - prev > 180:
            lon -= 360
        while lon - prev < -180:
            lon += 360
        out.append([lon, lat])
    return out


def _clip(points, keep, cut):
    out = []
    for i, current in enumerate(points):
        previous = points[i - 1]
        if keep(current) != keep(previous):
            out.append(cut(previous, current))
        if keep(current):
            out.append(current)
    return out


def split_antimeridian(ring):
    """Return closed rings that each stay within [-180, 180]; one ring when no split is needed."""
    points = _unwrap(ring[:-1] if ring[0] == ring[-1] else ring)
    lons = [p[0] for p in points]
    if min(lons) >= -180 and max(lons) <= 180:
        return [points + [points[0]]]

    def at(x):
        return lambda a, b: [x, a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1])]

    if max(lons) > 180:
        parts = [(_clip(points, lambda p: p[0] <= 180, at(180)), 0),
                 (_clip(points, lambda p: p[0] >= 180, at(180)), -360)]
    else:
        parts = [(_clip(points, lambda p: p[0] >= -180, at(-180)), 0),
                 (_clip(points, lambda p: p[0] <= -180, at(-180)), 360)]
    rings = []
    for part, shift in parts:
        part = [[p[0] + shift, p[1]] for p in part]
        if len(part) >= 3:
            rings.append(part + [part[0]])
    return rings


def _slug(text):
    return re.sub(r'[^a-z0-9]+', '-', str(text).lower()).strip('-') or 'zone'


def _first(props, fields):
    for field in fields:
        value = props.get(field)
        if value not in (None, ''):
            return value
    return None


def _round(ring):
    return [[round(lon, 4), round(lat, 4)] for lon, lat, *_ in ring]


def convert(collection, *, kind='whale', source='', id_prefix='zone', months=None,
            tolerance=0.02, name_field=None, id_field=None, approximate=False):
    """Return ``(feature_collection, skipped)``; *skipped* lists ``(label, reason)`` pairs."""
    features, skipped, used = [], [], set()
    for index, feature in enumerate(collection.get('features', [])):
        props = feature.get('properties') or {}
        geometry = feature.get('geometry') or {}
        raw_name = props.get(name_field) if name_field else _first(props, NAME_FIELDS)
        raw_id = props.get(id_field) if id_field else _first(props, ID_FIELDS)
        label = str(raw_name or f'feature {index}')
        if geometry.get('type') == 'Polygon':
            polygons = [geometry['coordinates']]
        elif geometry.get('type') == 'MultiPolygon':
            polygons = geometry['coordinates']
        else:
            skipped.append((label, f"unsupported geometry {geometry.get('type')!r}"))
            continue
        out_polygons = []
        for polygon in polygons:
            try:
                outer = simplify_ring([p[:2] for p in polygon[0]], tolerance)
                holes = [simplify_ring([p[:2] for p in ring], tolerance) for ring in polygon[1:]]
            except (IndexError, TypeError, ValueError):
                skipped.append((label, 'malformed polygon'))
                continue
            if len(outer) < 4:
                skipped.append((label, 'ring collapsed when simplified'))
                continue
            pieces = split_antimeridian(outer)
            if len(pieces) > 1:
                holes = []  # holes are not carried across a split
            for k, piece in enumerate(pieces):
                rings = [_round(piece)] + ([_round(h) for h in holes if len(h) >= 4] if k == 0 else [])
                out_polygons.append(rings)
        if not out_polygons:
            continue
        zone_id = _slug(f'{id_prefix}-{raw_id if raw_id is not None else index}')
        base, n = zone_id, 2
        while zone_id in used:
            zone_id, n = f'{base}-{n}', n + 1
        used.add(zone_id)
        features.append({
            'type': 'Feature',
            'properties': {'id': zone_id, 'name': str(raw_name or f'{id_prefix} {raw_id if raw_id is not None else index}'),
                           'kind': kind, 'months': months, 'source': source, 'approximate': approximate},
            'geometry': ({'type': 'Polygon', 'coordinates': out_polygons[0]} if len(out_polygons) == 1
                         else {'type': 'MultiPolygon', 'coordinates': out_polygons}),
        })
    return {'type': 'FeatureCollection', 'name': f'whale_zones_{_slug(id_prefix)}', 'features': features}, skipped


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('source_file', help='input polygon GeoJSON')
    parser.add_argument('--out', required=True, help='output path, e.g. backend/whale_data/whale_zones_imma.geojson')
    parser.add_argument('--kind', choices=('whale', 'vsr'), default='whale')
    parser.add_argument('--source', default='', help='attribution text stored on every zone')
    parser.add_argument('--id-prefix', default='zone')
    parser.add_argument('--months', help='comma-separated calendar months for seasonal layers')
    parser.add_argument('--tolerance', type=float, default=0.02, help='simplification tolerance in degrees')
    parser.add_argument('--name-field')
    parser.add_argument('--id-field')
    args = parser.parse_args(argv)
    months = sorted({int(m) for m in args.months.split(',')}) if args.months else None
    if months and not all(1 <= m <= 12 for m in months):
        parser.error('--months must be integers 1-12')
    with open(args.source_file, encoding='utf-8') as handle:
        collection = json.load(handle)
    result, skipped = convert(collection, kind=args.kind, source=args.source, id_prefix=args.id_prefix,
                              months=months, tolerance=args.tolerance,
                              name_field=args.name_field, id_field=args.id_field)
    with open(args.out, 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(',', ':'))
        handle.write('\n')
    print(f'Wrote {len(result["features"])} zones to {args.out}; skipped {len(skipped)}.')
    for label, reason in skipped[:20]:
        print(f'  skipped {label}: {reason}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
