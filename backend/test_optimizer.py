"""Behavioral checks for deadlines, speed selection and physical route metrics."""
import unittest
from datetime import datetime
from backend.main import PlanInput, Vessel, calculate
from backend.routing import cargo_outcomes, prepare_paths, california_paths, PORTS
from backend.optimizer import search_passages
from backend.cargo_model import score_route


def full_records(client):
    page=client.get('/api/voyages?limit=100').json()
    return [client.get('/api/voyages/'+item['id']).json() for item in page['items']]


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

    def test_seven_day_allowance_does_not_pad_a_three_day_passage(self):
        from backend.routing import materialize_route
        p=PlanInput(departure='2026-11-01T00:00:00Z',arrival_window=168,min_speed=18,max_speed=18,
                    cargo_items=[{'product_id':'computers'}])
        path={'id':'three-days','name':'Test passage','distance':1296,'open_distance':1296,
              'protected_distance':0,'whale_distance':0,'coordinates':[[0,0],[0,21.6]],
              'segments':[{'from':[0,0],'to':[0,21.6],'zone':None,'distance':1296,'kind':'open'}]}
        choices,metadata=search_passages([path],p,cargo_outcomes(p,0),False)
        route=materialize_route(choices['balanced'],'balanced',p,False,metadata['reference_fuel_tonnes'])
        self.assertEqual(route['hours'],72)
        self.assertEqual(route['slack_hours'],96)
        self.assertEqual(route['eta'],'2026-11-04T00:00:00+00:00')
        self.assertAlmostEqual(sum(s['fuel'] for s in route['segments']),route['fuel'],places=4)
        self.assertAlmostEqual(sum(s['co2'] for s in route['segments']),route['co2'],places=4)

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
        self.assertLessEqual(self.chosen(berries,'direct')['hours'],self.chosen(berries)['hours'])

    def test_full_speed_search_matches_independent_dense_scan(self):
        p=PlanInput(departure='2026-11-01T00:00:00Z',arrival_window=36,min_speed=8,max_speed=15,
                    cargo_items=[{'product_id':'raspberries','weight':1},{'product_id':'computers','weight':500}])
        # A small speed interval still spans a full protected-speed grid and
        # mixed zone/open-water segments, so direct segment sums stay cheap.
        p.min_speed=14.9; p.max_speed=15.1
        paths=[{'id':str(i),'distance':open_nm+protected_nm,'open_distance':open_nm,
                'protected_distance':protected_nm,'whale_distance':protected_nm,
                'segments':[{'zone':None,'distance':open_nm},{'zone':'Habitat','distance':protected_nm}]}
               for i,(open_nm,protected_nm) in enumerate([(250,100),(300,60)])]
        choices,metadata=search_passages(paths,p,cargo_outcomes(p,0),True)
        ref=min(path['distance'] for path in paths)/18*p.fuel_per_day/24
        oracle=[]
        for path in paths:
            for zone_tick in range(50,101):
                zone_speed=zone_tick/10
                for tick in range(1490,1511):
                    speed=tick/100
                    hours=sum(seg['distance']/(zone_speed if seg['zone'] else speed) for seg in path['segments'])
                    if hours>36: continue
                    fuel=sum(p.fuel_per_day/24*((zone_speed if seg['zone'] else speed)/18)**3
                             *seg['distance']/(zone_speed if seg['zone'] else speed) for seg in path['segments'])
                    protection=100*50/(50+path['whale_distance']*(zone_speed/10)**2*p.whale_activity)
                    score,expired,_=score_route({'hours':hours,'fuel':fuel,'protection':protection,
                                                'cargo_results':cargo_outcomes(p,hours)},ref,True)
                    # Use unrounded quality to distinguish adjacent speeds.
                    shortfall=max((max(0,(hours-item['departure_remaining_hours']+.7*item['effective_shelf_life_hours'])/item['effective_shelf_life_hours']) for item in cargo_outcomes(p,0) if item['perishable']),default=0)
                    oracle.append((expired,shortfall,score,hours,fuel,path['id'],speed,zone_speed))
        expected=min(oracle)
        choice=choices['balanced']
        self.assertEqual((choice['path']['id'],choice['speed'],choice['zone_speed']),expected[-3:])
        self.assertEqual(metadata['evaluated_combinations'],len(paths)*21*51)

    def test_long_passage_prioritizes_quality_over_slow_cheap_arrival(self):
        p=PlanInput(departure='2026-11-01T00:00:00Z',arrival_window=200,min_speed=10,max_speed=20,
                    cargo_items=[{'product_id':'apples','weight':1,'shelf_life':100,'temperature':4},
                                 {'product_id':'computers','weight':999}])
        paths=[{'id':'ocean','distance':1000,'open_distance':1000,'protected_distance':0,
                'whale_distance':0,'segments':[{'zone':None,'distance':1000}]}]
        choices,metadata=search_passages(paths,p,cargo_outcomes(p,0),False)
        self.assertEqual(choices['balanced']['speed'],20)
        self.assertGreater(choices['balanced']['speed'],choices['eco']['speed'])
        self.assertEqual(metadata['arrival_quality_target_percent'],70)
        # An impossible quality target is never satisfied by changing shelf life.
        outcomes=cargo_outcomes(p,choices['balanced']['hours'])
        self.assertLess(outcomes[0]['freshness'],70)

    def test_lowest_fuel_optimizes_protected_speeds_below_cap(self):
        result=calculate(PlanInput(departure='2026-11-01T00:00:00Z',arrival_window=168,
                                  cargo_items=[{'product_id':'computers','weight':10}]))
        route=self.chosen(result,'eco')
        self.assertEqual(route['protected_speed'],5)
        self.assertLess(route['fuel'],6.5642)
        self.assertLess(route['hours'],168)
        self.assertTrue(all(seg['speed']==5 for seg in route['segments'] if seg['zone']))
        fastest=self.chosen(result,'direct')
        self.assertEqual(fastest['protected_speed'],10)
        for option in result['routes']:
            if option['same_as']:
                prior=self.chosen(result,option['same_as'])
                self.assertEqual((option['path_id'],option['speed'],option['protected_speed']),
                                 (prior['path_id'],prior['speed'],prior['protected_speed']))

    def test_protected_cap_and_no_zone_search(self):
        result=self.plan(arrival_window=168,min_speed=5,max_speed=5.03)
        self.assertTrue(all(route['protected_speed']<=5.03 for route in result['routes']))
        path={'id':'open','distance':100,'open_distance':100,'protected_distance':0,'whale_distance':0}
        p=PlanInput(departure='2026-11-01T00:00:00Z',min_speed=8,max_speed=9)
        _,metadata=search_passages([path],p,cargo_outcomes(p,0),False)
        self.assertEqual(metadata['evaluated_combinations'],101)

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
        with tempfile.TemporaryDirectory() as directory:
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
                    saved=full_records(client)[0]
                    self.assertEqual(saved['inputs']['min_speed'],12)
                    self.assertEqual(saved['optimization']['version'],'deadline-speed-quality-v4')
                    self.assertIn('deadline_at',saved)
                    self.assertGreater(saved['result']['slack_hours'],0)
                    inputs['fuel_per_day']=1
                    self.assertEqual(client.post('/api/voyages',json=body).status_code,422)
                    self.assertEqual(client.put('/api/voyages/'+saved['id'],json=body).status_code,422)
                    inputs['fuel_per_day']=35
                    vessel['fuel_per_day']=100
                    self.assertEqual(client.put('/api/vessels/'+vessel['id'],json=vessel).status_code,200)
                    self.assertEqual(client.put('/api/voyages/'+saved['id'],json=body).status_code,422)
                    inputs['fuel_per_day']=100
                    updated=client.put('/api/voyages/'+saved['id'],json=body)
                    self.assertEqual(updated.status_code,200,updated.text)
                    self.assertEqual(updated.json()['inputs']['fuel_per_day'],100)

            finally:
                main.DB=original
