"""Whale zone layer: GeoJSON loading, geometry, seasons and worldwide assessment.

These tests need neither FastAPI nor the searoute package.
"""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend import routing
from backend.import_zones import convert, main as import_main, simplify_ring, split_antimeridian
from backend.zones import ZoneIndex, distance_nm, load_zones


def square(zone_id, lat0, lat1, lon0, lon1, **extra):
    props = {'id': zone_id, 'name': zone_id.title(), 'kind': 'whale', **extra}
    ring = [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]
    return {'type': 'Feature', 'properties': props, 'geometry': {'type': 'Polygon', 'coordinates': [ring]}}


def zone_dir(*features):
    directory = tempfile.TemporaryDirectory()
    collection = {'type': 'FeatureCollection', 'features': list(features)}
    (Path(directory.name) / 'whale_zones_test.geojson').write_text(json.dumps(collection), encoding='utf-8')
    return directory


def plan_input(**changes):
    values = dict(origin='la', destination='oakland', departure='2026-11-01T00:00:00Z', arrival_window=72,
                  min_speed=8, max_speed=24, fuel_per_day=35, whale_activity=1, cargo_items=None,
                  cargo_name='Avocados', cargo_type='avocados', weight=100, temperature=5,
                  shelf_life=336, cargo_age=0)
    values.update(changes)
    return SimpleNamespace(**values)


class LoadingTests(unittest.TestCase):
    def test_bundled_layer_is_valid_and_global(self):
        zones = load_zones()
        ids = [zone['id'] for zone in zones]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(zones), 10)
        self.assertEqual({zone['kind'] for zone in zones} - {'whale', 'vsr'}, set())
        lons = [zone['lon'] for zone in zones]
        self.assertTrue(min(lons) < -100 and max(lons) > 100, 'layer should span both hemispheres')
        for zone in zones:
            self.assertGreaterEqual(len(zone['rings'][0]), 3)
        self.assertEqual(len(routing.ZONES), len(routing.CALIFORNIA_ZONES) + len(zones))

    def test_invalid_files_fail_loudly(self):
        cases = {
            'kind': square('a', 0, 1, 0, 1, kind='nope'),
            'months': square('a', 0, 1, 0, 1, months=[0, 13]),
            'antimeridian': square('a', 0, 1, 170, -170),
            'range': square('a', 0, 91, 0, 1),
        }
        for label, feature in cases.items():
            with self.subTest(label), zone_dir(feature) as directory:
                with self.assertRaises(ValueError):
                    load_zones(directory)
        with zone_dir(square('a', 0, 1, 0, 1), square('a', 2, 3, 2, 3)) as directory:
            with self.assertRaises(ValueError):
                load_zones(directory)

    def test_multipolygon_parts_get_unique_ids(self):
        ring = lambda x: [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]
        feature = {'type': 'Feature', 'properties': {'id': 'm', 'name': 'Multi', 'kind': 'vsr'},
                   'geometry': {'type': 'MultiPolygon', 'coordinates': [[ring(0)], [ring(5)]]}}
        with zone_dir(feature) as directory:
            self.assertEqual([z['id'] for z in load_zones(directory)], ['m-1', 'm-2'])


class GeometryTests(unittest.TestCase):
    def index(self, *features):
        with zone_dir(*features) as directory:
            return ZoneIndex(load_zones(directory))

    def test_point_lookup_holes_and_wrapped_longitudes(self):
        outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
        donut = {'type': 'Feature', 'properties': {'id': 'donut', 'name': 'Donut', 'kind': 'whale'},
                 'geometry': {'type': 'Polygon', 'coordinates': [outer, hole]}}
        west = square('west', -1, 1, -179, -175)
        index = self.index(donut, west)
        self.assertEqual(index.zone_at([2, 2])['id'], 'donut')
        self.assertIsNone(index.zone_at([5, 5]))
        self.assertIsNone(index.zone_at([20, 20]))
        # Route longitudes can run past 180 degrees after unwrapping.
        self.assertEqual(index.zone_at([0, 183])['id'], 'west')
        self.assertEqual(index.zone_at([0, -177])['id'], 'west')

    def test_months_select_seasonal_zones(self):
        index = self.index(square('winter', 0, 1, 0, 1, months=[11, 12, 1]), square('always', 2, 3, 2, 3))
        self.assertEqual(index.active_ids(12), ['winter', 'always'])
        self.assertEqual(index.active_ids(6), ['always'])
        self.assertIsNone(index.zone_at([0.5, 0.5], 6))
        self.assertEqual(index.zone_at([0.5, 0.5], 12)['id'], 'winter')
        self.assertEqual(index.zone_at([0.5, 0.5])['id'], 'winter')  # no month: every zone

    def test_habitat_wins_over_overlapping_slow_zone(self):
        vsr = square('slow', 0, 2, 0, 2, kind='vsr')
        habitat = square('habitat', 0, 2, 0, 2)
        self.assertEqual(self.index(vsr, habitat).zone_at([1, 1])['kind'], 'whale')

    def test_segment_is_cut_at_zone_boundaries(self):
        index = self.index(square('box', -1, 1, 2, 3))
        a, b = [0, 0], [0, 5]
        cuts = index.split_segment(a, b)
        self.assertEqual(len(cuts), 4)
        self.assertEqual([round(p[1], 4) for p in cuts], [0, 2, 3, 5])
        self.assertAlmostEqual(sum(distance_nm(p, q) for p, q in zip(cuts, cuts[1:])), distance_nm(a, b), places=2)
        kinds = [index.zone_at([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]) is not None for p, q in zip(cuts, cuts[1:])]
        self.assertEqual(kinds, [False, True, False])
        self.assertEqual(index.split_segment([5, 0], [5, 5]), [[5, 0], [5, 5]])  # misses the zone

    def test_segment_cuts_across_the_antimeridian(self):
        index = self.index(square('west', -1, 1, -179, -175))
        cuts = index.split_segment([0, 178], [0, 183])
        self.assertEqual([round(p[1], 4) for p in cuts], [178, 181, 183])
        # Same crossing in the other direction.
        cuts = index.split_segment([0, 183], [0, 178])
        self.assertEqual([round(p[1], 4) for p in cuts], [183, 181, 178])

    def test_circles_are_not_cut(self):
        circle = {'id': 'c', 'name': 'Circle', 'kind': 'vsr', 'lat': 0, 'lon': 1, 'radius_nm': 30}
        index = ZoneIndex([circle])
        self.assertEqual(index.split_segment([0, 0], [0, 2]), [[0, 0], [0, 2]])
        self.assertEqual(index.zone_at([0, 1.2])['id'], 'c')


class RoutingTests(unittest.TestCase):
    def paths(self, coords, month):
        return routing.prepare_paths({'direct': coords}, False, month)[0]

    def test_seasonal_zone_changes_exposure_by_departure_month(self):
        # Sydney -> Auckland leaves through the east-Australia humpback corridor (May-Nov).
        coords = routing.dense([[-33.97, 151.22], [-33.97, 156.0]], 5)
        winter, summer = self.paths(coords, 7), self.paths(coords, 1)
        self.assertGreater(winter['whale_distance'], 20)
        self.assertEqual(summer['whale_distance'], 0)
        self.assertAlmostEqual(winter['distance'], summer['distance'], places=1)
        self.assertAlmostEqual(winter['protected_distance'] + winter['open_distance'], winter['distance'], places=6)

    def test_boundary_cuts_make_exposure_exact_for_coarse_segments(self):
        # One 300 nm segment crossing the Strait of Gibraltar zone (about 48 nm of it inside).
        path = self.paths([[36.0, -8.0], [36.0, -2.0]], None)
        inside = path['whale_distance']
        self.assertGreater(inside, 35); self.assertLess(inside, 60)
        self.assertEqual(len(path['segments']), 3)

    def test_california_routes_are_unchanged(self):
        result = routing.plan(plan_input())
        self.assertEqual(result['data_coverage']['whale']['status'], 'scenario')
        for route in result['routes']:
            self.assertTrue(route['whale_assessed']); self.assertIsNotNone(route['protection'])
        self.assertTrue({'sb', 'monterey', 'sf', 'lax'} <= set(result['active_zone_ids']))

    def test_world_routes_are_assessed_against_mapped_zones(self):
        def fake_route(origin, dest, **kwargs):
            line = [[4.14, 51.95], [-9.5, 36.0], [-3.0, 36.0], [-0.32, 39.44]]
            return {'geometry': {'coordinates': line}, 'properties': {'length': 1500}}
        routing._cached_world_paths.cache_clear()
        try:
            with patch.object(routing, '_searoute', SimpleNamespace(searoute=fake_route)):
                result = routing.plan(plan_input(origin='rotterdam', destination='valencia', arrival_window=400))
        finally:
            routing._cached_world_paths.cache_clear()
        coverage = result['data_coverage']['whale']
        self.assertEqual(coverage['status'], 'mapped-zones'); self.assertTrue(coverage['score_available'])
        self.assertEqual(coverage['departure_month'], 11)
        for route in result['routes']:
            self.assertTrue(route['whale_assessed'])
            self.assertIsNotNone(route['protection']); self.assertLess(route['protection'], 100)
            self.assertGreater(route['protected_distance'], 0)
            self.assertIn('Strait of Gibraltar whale area (approx.)', {s['zone'] for s in route['segments']})
        self.assertIn('es-strait-of-gibraltar', result['active_zone_ids'])

    def test_missing_world_layer_falls_back_to_unassessed(self):
        def fake_route(origin, dest, **kwargs):
            return {'geometry': {'coordinates': [[121.6, 31.35], [103.84, 1.26]]}, 'properties': {'length': 2000}}
        routing._cached_world_paths.cache_clear()
        try:
            with patch.object(routing, '_searoute', SimpleNamespace(searoute=fake_route)), \
                 patch.object(routing, 'HAS_WORLD_LAYER', False):
                result = routing.plan(plan_input(origin='shanghai', destination='singapore', arrival_window=400))
        finally:
            routing._cached_world_paths.cache_clear()
        self.assertEqual(result['data_coverage']['whale']['status'], 'unassessed')
        for route in result['routes']:
            self.assertIsNone(route['protection']); self.assertFalse(route['whale_assessed'])

    def test_active_zones_follow_departure_month(self):
        self.assertIn('us-port-nynj', routing.ZONE_INDEX.active_ids(12))
        self.assertNotIn('us-port-nynj', routing.ZONE_INDEX.active_ids(7))
        self.assertIn('au-east-coast-humpback', routing.ZONE_INDEX.active_ids(7))
        self.assertNotIn('au-east-coast-humpback', routing.ZONE_INDEX.active_ids(1))


class ImporterTests(unittest.TestCase):
    def collection(self, *features):
        return {'type': 'FeatureCollection', 'features': list(features)}

    def feature(self, name, ring, **props):
        return {'type': 'Feature', 'properties': {'NAME': name, **props},
                'geometry': {'type': 'Polygon', 'coordinates': [ring]}}

    def test_simplification_keeps_corners_and_closure(self):
        ring = [[x / 10, 0] for x in range(0, 101)] + [[10, 10], [0, 10], [0, 0]]
        simple = simplify_ring(ring, 0.05)
        self.assertEqual(simple[0], simple[-1])
        self.assertLess(len(simple), len(ring))
        for corner in ([0, 0], [10, 0], [10, 10], [0, 10]):
            self.assertIn(corner, simple)

    def test_antimeridian_polygon_is_split_into_valid_rings(self):
        ring = [[170, -5], [-170, -5], [-170, 5], [170, 5], [170, -5]]  # 20 degrees wide across 180
        parts = split_antimeridian(ring)
        self.assertEqual(len(parts), 2)
        for part in parts:
            self.assertTrue(all(-180 <= lon <= 180 for lon, _ in part))
        spans = sorted((min(p[0] for p in part), max(p[0] for p in part)) for part in parts)
        self.assertEqual(spans, [(-180, -170), (170, 180)])

    def test_converted_layer_loads_and_is_searchable(self):
        crossing = self.feature('Dateline Sea', [[170, -5], [-170, -5], [-170, 5], [170, 5], [170, -5]], IMMA_ID=7)
        plain = self.feature('Quiet Bay', [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]], IMMA_ID=8)
        point = {'type': 'Feature', 'properties': {'NAME': 'A point'}, 'geometry': {'type': 'Point', 'coordinates': [0, 0]}}
        result, skipped = convert(self.collection(crossing, plain, point), source='Test atlas', id_prefix='imma', months=[6, 7])
        self.assertEqual([label for label, _ in skipped], ['A point'])
        self.assertEqual([f['properties']['id'] for f in result['features']], ['imma-7', 'imma-8'])
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'whale_zones_imma.geojson').write_text(json.dumps(result), encoding='utf-8')
            zones = load_zones(directory)
        self.assertEqual([z['id'] for z in zones], ['imma-7-1', 'imma-7-2', 'imma-8'])
        index = ZoneIndex(zones)
        self.assertEqual(index.zone_at([0, 175], 7)['name'], 'Dateline Sea')
        self.assertEqual(index.zone_at([0, 185], 7)['name'], 'Dateline Sea')  # unwrapped longitude
        self.assertEqual(index.zone_at([0, -175], 7)['name'], 'Dateline Sea')
        self.assertIsNone(index.zone_at([0, 175], 1))  # out of season
        self.assertFalse(zones[0]['approximate'])

    def test_command_line_writes_a_loadable_file(self):
        with tempfile.TemporaryDirectory() as directory:
            source, out = Path(directory) / 'in.geojson', Path(directory) / 'whale_zones_cli.geojson'
            source.write_text(json.dumps(self.collection(
                self.feature('Quiet Bay', [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]))), encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()):
                status = import_main([str(source), '--out', str(out), '--kind', 'vsr', '--months', '12,1'])
            self.assertEqual(status, 0)
            zone = load_zones(directory)[0]
        self.assertEqual((zone['kind'], zone['months']), ('vsr', [1, 12]))


if __name__ == '__main__':
    unittest.main()
