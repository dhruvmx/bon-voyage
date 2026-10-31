"""Behavioral checks for deadlines, speed selection and physical route metrics."""
import unittest
from datetime import datetime
from backend.main import PlanInput, Vessel, calculate
from backend.routing import cargo_outcomes, prepare_paths, california_paths, PORTS
from backend.optimizer import search_passages
from backend.cargo_model import score_route


class OptimizerTests(unittest.TestCase):
    def plan(self, **changes):
        return calculate(PlanInput(departure='2026-11-01T00:00:00Z',
                         cargo_items=[{'product_id':'apples','weight':10}],**changes))

    def chosen(self, result, mode='balanced'):
        return next(route for route in result['routes'] if route['id']==mode)

    def test_loose_deadline_is_a_ceiling_not_voyage_duration(self):
        seven=self.plan(arrival_window=168)
        ten=self.plan(arrival_window=240)
        a,b=self.chosen(seven),self.chosen(ten)
        self.assertLess(a['hours'],72)
        self.assertEqual((a['path_id'],a['speed'],a['hours'],a['fuel']),
                         (b['path_id'],b['speed'],b['hours'],b['fuel']))
        self.assertAlmostEqual(b['slack_hours']-a['slack_hours'],72,places=3)
        self.assertFalse(seven['optimization']['deadline_binding'])
        self.assertEqual(seven['deadline_at'],'2026-11-08T00:00:00+00:00')

    def test_tight_deadline_speeds_up_and_impossible_deadline_is_explicit(self):
        loose=self.plan(arrival_window=168)
        tight=self.plan(arrival_window=30)
        a,b=self.chosen(loose),self.chosen(tight)
        self.assertGreater(b['speed'],a['speed'])
        self.assertLessEqual(b['hours'],30)
        self.assertTrue(tight['optimization']['deadline_binding'])
        impossible=self.plan(arrival_window=10)
        self.assertEqual(impossible['status'],'infeasible')
        self.assertEqual(impossible['optimization']['feasible_combinations'],0)
        self.assertGreater(impossible['optimization']['earliest_possible_hours'],10)
        self.assertTrue(all(not route['feasible'] and route['slack_hours']<0 for route in impossible['routes']))

    def test_alternatives_have_meaning_and_report_duplicates(self):
        result=self.plan(arrival_window=168)
        balanced,fastest,cheapest=[self.chosen(result,mode) for mode in ['balanced','direct','eco']]
        self.assertLessEqual(fastest['hours'],balanced['hours'])
        self.assertLessEqual(fastest['hours'],cheapest['hours'])
        self.assertLessEqual(cheapest['fuel'],balanced['fuel'])
        self.assertLessEqual(cheapest['fuel'],fastest['fuel'])
        berries=calculate(PlanInput(departure='2026-11-01T00:00:00Z',arrival_window=168,
                                   cargo_items=[{'product_id':'raspberries'}]))
        self.assertEqual(self.chosen(berries,'direct')['same_as'],'balanced')

    def test_full_speed_search_matches_independent_dense_scan(self):
        p=PlanInput(departure='2026-11-01T00:00:00Z',arrival_window=36,min_speed=8,max_speed=15,
                    cargo_items=[{'product_id':'raspberries','weight':1},{'product_id':'computers','weight':500}])
        ports={port['id']:port for port in PORTS}
        paths=prepare_paths(california_paths(ports['la'],ports['oakland']),True)
        choices,metadata=search_passages(paths,p,cargo_outcomes(p,0),True)
        ref=min(path['distance'] for path in paths)/18*p.fuel_per_day/24
        oracle=[]
        for path in paths:
            for tick in range(800,1501):
                speed=tick/100; zone_speed=10
                hours=path['open_distance']/speed+path['protected_distance']/zone_speed
                if hours>36: continue
                # Compute consumption directly from segment time * cubic speed.
                fuel=sum(p.fuel_per_day/24*((zone_speed if seg['zone'] else speed)/18)**3
                         *seg['distance']/(zone_speed if seg['zone'] else speed) for seg in path['segments'])
                protection=max(0,100-path['whale_distance']/path['distance']*100*p.whale_activity)
                score,expired,_=score_route({'hours':hours,'fuel':fuel,'protection':protection,
                                            'cargo_results':cargo_outcomes(p,hours)},ref,True)
                oracle.append((expired,score,hours,fuel,path['id'],speed))
        expected=min(oracle)
        self.assertEqual((choices['balanced']['path']['id'],choices['balanced']['speed']),expected[-2:])
        self.assertEqual(metadata['evaluated_combinations'],len(paths)*701)

    def test_eta_slack_fuel_and_speed_instructions_are_consistent(self):
        result=self.plan(arrival_window=168,min_speed=12.37,max_speed=21.29)
        for route in result['routes']:
            self.assertGreaterEqual(route['speed'],12.37); self.assertLessEqual(route['speed'],21.29)
            self.assertAlmostEqual(sum(seg['hours'] for seg in route['segments']),route['hours'],places=3)
            fuel=sum(35/24*(seg['speed']/18)**3*seg['hours'] for seg in route['segments'])
            self.assertAlmostEqual(fuel,route['fuel'],places=3)
            self.assertTrue(all(seg['speed']<=10 for seg in route['segments'] if seg['zone']))
            elapsed=(datetime.fromisoformat(route['eta'])-datetime.fromisoformat('2026-11-01T00:00:00+00:00')).total_seconds()/3600
            self.assertAlmostEqual(elapsed,route['hours'],places=3)
            self.assertAlmostEqual(route['slack_hours'],168-route['hours'],places=3)

    def test_speed_validation_and_legacy_defaults(self):
        self.assertEqual(PlanInput(departure='2026-11-01T00:00:00Z',max_speed=5).min_speed,5)
        self.assertEqual(Vessel(name='Legacy carrier',max_speed=6).min_speed,6)
        with self.assertRaises(ValueError): PlanInput(departure='2026-11-01T00:00:00Z',min_speed=25,max_speed=24)
        with self.assertRaises(ValueError): Vessel(name='Invalid carrier',min_speed=25,max_speed=24)

    def test_international_speed_choices_preserve_unassessed_habitat(self):
        result=self.plan(origin='shanghai',destination='singapore',arrival_window=168)
        for route in result['routes']:
            self.assertTrue(route['feasible']); self.assertIsNone(route['protection'])
            self.assertEqual(route['score_breakdown']['weights']['habitat'],0)
        self.assertLess(self.chosen(result,'direct')['hours'],168)

    def test_saved_vessel_limits_and_optimizer_snapshot(self):
        import tempfile
        from pathlib import Path
        from fastapi.testclient import TestClient
        from backend import main
        original=main.DB
        with tempfile.TemporaryDirectory(dir=main.ROOT/'data') as directory:
            main.DB=Path(directory)/'optimizer.sqlite3'
            try:
                main.init_db()
                with TestClient(main.app) as client:
                    client.post('/api/auth/signup',json={'name':'Operator','email':'optimizer@example.com','password':'optimizer-test-password'})
                    vessel=client.post('/api/vessels',json={'name':'Operating carrier','min_speed':12,'max_speed':20}).json()
                    inputs={'departure':'2026-11-01T00:00:00Z','arrival_window':168,'min_speed':8,'max_speed':20}
                    body={'name':'Seven day deadline','vessel_id':vessel['id'],'inputs':inputs}
                    self.assertEqual(client.post('/api/voyages',json=body).status_code,422)
                    inputs['min_speed']=12
                    response=client.post('/api/voyages',json=body)
                    self.assertEqual(response.status_code,201,response.text)
                    saved=client.get('/api/voyages').json()[0]
                    self.assertEqual(saved['inputs']['min_speed'],12)
                    self.assertEqual(saved['optimization']['version'],'deadline-speed-v1')
                    self.assertIn('deadline_at',saved)
                    self.assertGreater(saved['result']['slack_hours'],0)
            finally:
                main.DB=original
