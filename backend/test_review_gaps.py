"""Regressions for habitat scoring, geometry identity, dates and bounded lists."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend import main, routing
from backend.optimizer import search_passages


class ReviewGapTests(unittest.TestCase):
    def setUp(self):
        self.original=main.DB
        self.temp=tempfile.TemporaryDirectory()
        main.DB=Path(self.temp.name)/'review.sqlite3'; main.init_db()
        self.client=TestClient(main.app,raise_server_exceptions=False)

    def tearDown(self):
        self.client.close(); main.DB=self.original; self.temp.cleanup()

    def signup(self):
        return self.client.post('/api/auth/signup',json={'name':'Review Operator','email':'review@example.com','password':'review-test-password'}).json()

    def test_habitat_exposure_is_not_diluted_by_open_water(self):
        p=main.PlanInput(departure='2026-11-01T00:00:00Z',arrival_window=2160,
                         min_speed=8,max_speed=8,cargo_items=[{'product_id':'computers'}])
        protections=[]
        for open_nm in [100,1000]:
            path={'id':'test','distance':open_nm+20,'open_distance':open_nm,'protected_distance':20,'whale_distance':20}
            choices,_=search_passages([path],p,routing.cargo_outcomes(p,0),True)
            protections.append(choices['balanced']['protection'])
        self.assertEqual(protections[0],protections[1])
        # The fixed 50 nm baseline and speed squared determine exposure only.
        self.assertAlmostEqual(protections[0],100*50/(50+20*(5/10)**2))

    def test_equal_length_distinct_geometry_survives_and_duplicates_do_not(self):
        ports={p['id']:p for p in routing.PORTS}
        def feature(points): return {'geometry':{'coordinates':points},'properties':{'length':100}}
        north=[[0,0],[1,1],[2,0]]; south=[[0,0],[1,-1],[2,0]]
        routing._cached_world_paths.cache_clear()
        try:
            with patch.object(routing._searoute,'searoute',side_effect=[feature(north),feature(south),feature(north),feature([[0,0],[0,0],[1,1],[2,0]])]):
                paths=routing.world_paths(ports['shanghai'],ports['singapore'])
            self.assertEqual(len(routing.prepare_paths(paths,False)),2)
        finally: routing._cached_world_paths.cache_clear()

    def test_unsupported_departures_return_validation_errors(self):
        for departure in ['9999-12-31T00:00:00Z','0001-01-01T00:00:00+23:00','2101-01-01T00:00:00Z','not-a-date']:
            response=self.client.post('/api/plan',json={'departure':departure,'arrival_window':2160})
            self.assertEqual(response.status_code,422,response.text)
        for departure in ['1900-01-01T00:00:00Z','2100-12-31T23:59:00Z']:
            response=self.client.post('/api/plan',json={'departure':departure,'arrival_window':2160})
            self.assertEqual(response.status_code,200,response.text)

    def test_paginated_summaries_details_search_stats_and_isolation(self):
        owner=self.signup()
        inputs=main.PlanInput(departure='2026-11-01T00:00:00Z',cargo_items=[{'product_id':'apples','weight':10}])
        planned=main.calculate(inputs)
        base={'name':'Stored voyage','inputs':inputs.model_dump(),'result':planned['routes'][0],
              'status':'Planned','notes':'n'*1000,'route_id':'balanced','vessel_id':None}
        with main.db() as c:
            for i in range(25):
                data=copy.deepcopy(base); data['name']=f'Voyage {i:02d}'
                if i==0:
                    data['name']='100%_! cargo'; data['inputs']['cargo_items'][0]['name']='Needle product'
                c.execute('INSERT INTO voyages VALUES(?,?,?,?,?)',(f'voyage{i:02d}',owner['id'],json.dumps(data),1000,1000))
            for i in range(23):
                c.execute('INSERT INTO vessels VALUES(?,?,?,?)',(f'vessel{i:02d}',owner['id'],main.Vessel(name=f'Vessel {i}').model_dump_json(),1000))
        first=self.client.get('/api/voyages').json()
        self.assertEqual(first['total'],25); self.assertEqual(len(first['items']),20); self.assertTrue(first['has_more'])
        second=self.client.get('/api/voyages?offset=20').json()
        self.assertFalse(second['has_more']); self.assertEqual(len(second['items']),5)
        self.assertEqual(len({v['id'] for v in first['items']+second['items']}),25)
        summary=first['items'][0]
        self.assertNotIn('coordinates',summary['result']); self.assertNotIn('segments',summary['result'])
        self.assertNotIn('cargo_items',summary['inputs']); self.assertEqual(len(summary['notes']),200)
        detail=self.client.get('/api/voyages/'+summary['id']).json()
        self.assertIn('coordinates',detail['result']); self.assertEqual(len(detail['notes']),1000)
        for query in ['Needle','100%_!']:
            page=self.client.get('/api/voyages',params={'q':query}).json()
            self.assertEqual(page['total'],1); self.assertEqual(page['items'][0]['id'],'voyage00')
        stats=self.client.get('/api/voyages/stats').json()
        self.assertEqual(stats['total'],25); self.assertEqual(stats['cargo'],250)
        self.assertAlmostEqual(stats['fuel'],25*base['result']['fuel'])
        self.assertEqual(stats['assessed'],25); self.assertAlmostEqual(stats['protection'],base['result']['protection'])
        self.assertEqual(len(self.client.get('/api/vessels').json()['items']),20)
        self.assertEqual(len(self.client.get('/api/vessels?offset=20').json()['items']),3)
        self.assertEqual(self.client.get('/api/vessels/vessel00').json()['name'],'Vessel 0')
        for path in ['/api/voyages?limit=101','/api/vessels?offset=-1','/api/voyages?limit=0']:
            self.assertEqual(self.client.get(path).status_code,422)
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/signup',json={'name':'Other Operator','email':'other@example.com','password':'review-test-password'})
        self.assertEqual(self.client.get('/api/voyages').json()['total'],0)
        self.assertEqual(self.client.get('/api/voyages/stats').json()['total'],0)
        self.assertEqual(self.client.get('/api/voyages/'+summary['id']).status_code,404)
        self.assertEqual(self.client.get('/api/vessels/vessel00').status_code,404)
