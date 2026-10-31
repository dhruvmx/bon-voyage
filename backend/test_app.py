import os, tempfile, unittest
from unittest.mock import patch
from backend import routing
from pathlib import Path
from fastapi.testclient import TestClient
from backend import main

class BonVoyageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=main.ROOT / "data"); self.old=main.DB
        main.DB=Path(self.temp.name)/'test.sqlite3';main.init_db()
        self.a=TestClient(main.app);self.b=TestClient(main.app)
        self.inputs={'departure':'2026-11-01T06:00:00Z'}
    def tearDown(self):
        self.a.close();self.b.close();main.DB=self.old;self.temp.cleanup()
    def signup(self,client,email='alex@example.com'):
        response=client.post('/api/auth/signup',json={'name':'Alex Kim','email':email,'password':'test-password-123','company':'Pacific Test'})
        self.assertEqual(response.status_code,201,response.text);return response
    def voyage(self,**kwargs):
        return {'name':'California food passage','inputs':self.inputs,**kwargs}
    def test_authentication_lifecycle(self):
        self.assertEqual(self.a.get('/api/auth/me').status_code,401)
        response=self.signup(self.a);self.assertIn('HttpOnly',response.headers['set-cookie'])
        self.assertEqual(self.a.get('/api/auth/me').json()['email'],'alex@example.com')
        self.a.post('/api/auth/logout');self.assertEqual(self.a.get('/api/auth/me').status_code,401)
        self.assertEqual(self.a.post('/api/auth/login',json={'email':'alex@example.com','password':'wrong'}).status_code,401)
        self.assertEqual(self.a.post('/api/auth/login',json={'email':'ALEX@example.com','password':'test-password-123'}).status_code,200)
    def test_signup_validation_and_hashing(self):
        self.assertEqual(self.a.post('/api/auth/signup',json={'name':'Alex','email':'bad','password':'short'}).status_code,422)
        self.signup(self.a);self.assertEqual(self.a.post('/api/auth/signup',json={'name':'Alex','email':'alex@example.com','password':'test-password-123'}).status_code,409)
        with main.db() as c: row=c.execute('SELECT * FROM users').fetchone()
        self.assertNotEqual(row['password_hash'],'test-password-123');self.assertEqual(len(row['salt']),32)
    def test_profile_and_password(self):
        self.signup(self.a)
        r=self.a.put('/api/profile',json={'name':'Captain Alex','company':'Ocean Co','role':'Captain'})
        self.assertEqual(r.status_code,200);self.assertEqual(self.a.get('/api/auth/me').json()['name'],'Captain Alex')
        self.assertEqual(self.a.put('/api/auth/password',json={'current_password':'wrong','new_password':'new-password-123'}).status_code,400)
        self.assertEqual(self.a.put('/api/auth/password',json={'current_password':'test-password-123','new_password':'new-password-123'}).status_code,200)
        self.a.post('/api/auth/logout');self.assertEqual(self.a.post('/api/auth/login',json={'email':'alex@example.com','password':'new-password-123'}).status_code,200)
    def test_voyage_crud_and_account_isolation(self):
        self.signup(self.a);self.signup(self.b,'other@example.com')
        r=self.a.post('/api/voyages',json=self.voyage());self.assertEqual(r.status_code,201,r.text);vid=r.json()['id']
        self.assertEqual(len(self.a.get('/api/voyages').json()),1);self.assertEqual(self.b.get('/api/voyages').json(),[])
        self.assertEqual(self.b.put('/api/voyages/'+vid,json=self.voyage()).status_code,404)
        self.assertEqual(self.b.delete('/api/voyages/'+vid).status_code,404)
        self.assertEqual(self.a.put('/api/voyages/'+vid,json=self.voyage(name='Updated voyage',status='In transit')).status_code,200)
        self.assertEqual(self.a.get('/api/voyages').json()[0]['status'],'In transit')
        self.assertEqual(self.a.delete('/api/voyages/'+vid).status_code,200);self.assertEqual(self.a.get('/api/voyages').json(),[])
    def test_vessel_capacity_and_ownership(self):
        self.signup(self.a);self.signup(self.b,'other@example.com')
        vessel=self.a.post('/api/vessels',json={'name':'Pacific Voyager','max_speed':20,'capacity':100,'fuel_per_day':30}).json()
        vid=vessel['id'];self.assertEqual(self.b.put('/api/vessels/'+vid,json={'name':'Stolen Vessel'}).status_code,404)
        self.assertEqual(self.a.post('/api/voyages',json=self.voyage(vessel_id=vid)).status_code,422)
        self.inputs.update(weight=90,max_speed=20,fuel_per_day=30)
        self.assertEqual(self.a.post('/api/voyages',json=self.voyage(vessel_id=vid)).status_code,201)
        self.assertEqual(self.a.delete('/api/vessels/'+vid).status_code,200)
        self.assertEqual(len(self.a.get('/api/voyages').json()),1)
    def test_routes_have_valid_geography_and_speed_caps(self):
        r=self.a.post('/api/plan',json=self.inputs);self.assertEqual(r.status_code,200,r.text)
        routes=r.json()['routes'];self.assertEqual(len(routes),3)
        self.assertTrue(all(route['distance']>0 for route in routes))
        for route in routes:
            self.assertEqual(route['coordinates'][0],[33.705,-118.265])
            self.assertEqual(route['coordinates'][-1],[37.795,-122.32])
            self.assertTrue(all(s['speed']<=10 for s in route['segments'] if s['zone']))
            self.assertTrue(all(s['speed']<=24 for s in route['segments']))
            self.assertAlmostEqual(sum(s['hours'] for s in route['segments']),route['hours'],places=1)
    def test_temperature_deadline_and_cargo_response(self):
        cold=self.a.post('/api/plan',json={**self.inputs,'cargo_type':'berries','temperature':2,'shelf_life':84}).json()
        warm=self.a.post('/api/plan',json={**self.inputs,'cargo_type':'berries','temperature':20,'shelf_life':84}).json()
        self.assertGreater(cold['routes'][0]['freshness'],warm['routes'][0]['freshness'])
        tight=self.a.post('/api/plan',json={**self.inputs,'arrival_window':8,'max_speed':18}).json()
        self.assertTrue(all(not r['feasible'] for r in tight['routes']))
        self.assertTrue(all(r['speed']<=18 for r in tight['routes']))
        electronic=self.a.post('/api/plan',json={**self.inputs,'cargo_type':'electronics','temperature':35}).json()
        self.assertTrue(all(r['freshness']==100 for r in electronic['routes']))
    def test_reversed_route_and_validation(self):
        r=self.a.post('/api/plan',json={**self.inputs,'origin':'oakland','destination':'la'}).json()
        self.assertEqual(r['routes'][0]['coordinates'][0],[37.795,-122.32])
        for bad in [{'destination':'la'},{'weight':-1},{'max_speed':100},{'cargo_type':'invalid'},{'departure':'invalid'}]:
            self.assertEqual(self.a.post('/api/plan',json={**self.inputs,**bad}).status_code,422)
    def test_cross_origin_writes_blocked(self):
        self.assertEqual(self.a.post('/api/auth/signup',headers={'origin':'https://other.example'},json={'name':'Alex','email':'alex@example.com','password':'password123'}).status_code,403)
    def test_database_persists_between_clients(self):
        self.signup(self.a);self.a.post('/api/voyages',json=self.voyage());self.a.post('/api/auth/logout')
        new=TestClient(main.app)
        self.assertEqual(new.post('/api/auth/login',json={'email':'alex@example.com','password':'test-password-123'}).status_code,200)
        self.assertEqual(len(new.get('/api/voyages').json()),1);new.close()

    def test_catalog_products_and_global_coverage(self):
        catalog=self.a.get('/api/catalog').json()
        products=catalog['cargo_products']
        self.assertGreaterEqual(len(products),200); self.assertLessEqual(len(products),300)
        self.assertEqual(len({product['id'] for product in products}),len(products))
        self.assertEqual(catalog['max_cargo_items'],10)
        self.assertEqual(catalog['max_arrival_hours'],2160)
        self.assertFalse(catalog['data_coverage']['whale']['live'])

    def test_international_route_and_long_arrival_window(self):
        response=self.a.post('/api/plan',json={**self.inputs,'origin':'shanghai','destination':'singapore','arrival_window':2160})
        self.assertEqual(response.status_code,200,response.text)
        result=response.json()
        self.assertFalse(result['data_coverage']['whale']['score_available'])
        self.assertEqual(len(result['routes']),3)
        for route in result['routes']:
            self.assertIsNone(route['protection']); self.assertFalse(route['whale_assessed'])
            self.assertTrue(route['feasible']); self.assertGreater(route['hours'],0)
            self.assertEqual(route['coordinates'][0],[31.35,121.6])
            self.assertAlmostEqual(route['coordinates'][-1][0],1.26,places=3)
            self.assertTrue(all(abs(a[1]-b[1])<=180 for a,b in zip(route['coordinates'],route['coordinates'][1:])))

    def test_pacific_dateline_route(self):
        response=self.a.post('/api/plan',json={**self.inputs,'origin':'la','destination':'shanghai','arrival_window':1080})
        self.assertEqual(response.status_code,200,response.text)
        route=response.json()['routes'][0]
        self.assertGreater(route['distance'],4000); self.assertLess(route['distance'],9000)
        self.assertTrue(all(abs(a[1]-b[1])<=180 for a,b in zip(route['coordinates'],route['coordinates'][1:])))

    def test_global_dependency_and_no_path_errors_are_readable(self):
        payload={**self.inputs,'origin':'shanghai','destination':'singapore'}
        with patch.object(routing,'_searoute',None):
            response=self.a.post('/api/plan',json=payload)
            self.assertEqual(response.status_code,503)
            self.assertIn('requirements',response.json()['detail'])
            self.assertEqual(self.a.post('/api/plan',json=self.inputs).status_code,200)
        with patch.object(routing,'_cached_world_paths',side_effect=routing.RoutePlanningError('No sea passage could be calculated.')):
            response=self.a.post('/api/plan',json=payload)
            self.assertEqual(response.status_code,422)
            self.assertIn('sea passage',response.json()['detail'])

    def test_mixed_cargo_results_and_temperature(self):
        manifest=[{'product_id':'strawberries','weight':5},
                  {'product_id':None,'name':'Custom sensors','profile':'electronics','weight':95}]
        cold=self.a.post('/api/plan',json={**self.inputs,'cargo_items':manifest}).json()['routes'][0]
        self.assertEqual(len(cold['cargo_results']),2)
        berries,sensors=cold['cargo_results']
        self.assertEqual(sensors['freshness'],100)
        self.assertLess(berries['freshness'],100)
        self.assertAlmostEqual(cold['freshness'],berries['freshness']*.05+95,places=2)
        warm=self.a.post('/api/plan',json={**self.inputs,'cargo_items':[{**manifest[0],'temperature':20},manifest[1]]}).json()['routes'][0]
        self.assertLess(warm['cargo_results'][0]['freshness'],berries['freshness'])
        self.assertLess(warm['worst_cargo_freshness'],warm['freshness'])

    def test_manifest_limits_and_identity_validation(self):
        items=[{'name':f'Custom cargo {i}','profile':'electronics','weight':1} for i in range(10)]
        self.assertEqual(self.a.post('/api/plan',json={**self.inputs,'cargo_items':items}).status_code,200)
        for bad in [[],items+[{'name':'Eleventh cargo'}],[items[0],items[0]],[{'product_id':'unknown'}],[{'name':'   '}],[{'name':'Invalid','weight':0}],[{'name':'Invalid','profile':'unknown'}]]:
            self.assertEqual(self.a.post('/api/plan',json={**self.inputs,'cargo_items':bad}).status_code,422)
        response=self.a.post('/api/plan',json={**self.inputs,'cargo_items':[{'product_id':'avocados','name':'Spoofed name','profile':'electronics'}]}).json()
        item=response['routes'][0]['cargo_results'][0]
        self.assertEqual(item['name'],'Avocados'); self.assertEqual(item['profile'],'avocados')

    def test_manifest_persistence_and_capacity_uses_total_weight(self):
        self.signup(self.a)
        vessel=self.a.post('/api/vessels',json={'name':'Manifest carrier','capacity':100}).json()
        items=[{'product_id':'avocados','weight':60},{'name':'Custom tools','profile':'electronics','weight':60}]
        payload=self.voyage(vessel_id=vessel['id'])
        payload['inputs']={**self.inputs,'weight':1,'cargo_items':items}
        self.assertEqual(self.a.post('/api/voyages',json=payload).status_code,422)
        items[0]['weight']=30; items[1]['weight']=20
        saved=self.a.post('/api/voyages',json=payload)
        self.assertEqual(saved.status_code,201,saved.text)
        record=self.a.get('/api/voyages').json()[0]
        self.assertEqual(record['inputs']['weight'],50)
        self.assertEqual(record['inputs']['cargo_items'][1]['name'],'Custom tools')
        self.assertEqual(len(record['result']['cargo_results']),2)
        self.assertTrue(record['data_coverage']['whale']['score_available'])

    def test_product_temperature_reference_and_arrival_bounds(self):
        payload={**self.inputs,'cargo_items':[{'product_id':'frozen-beef','weight':1}]}
        cold=self.a.post('/api/plan',json=payload).json()['routes'][0]
        self.assertAlmostEqual(cold['shelf_remaining'],4320-cold['hours'],places=1)
        payload['cargo_items'][0]['temperature']=-8
        warm=self.a.post('/api/plan',json=payload).json()['routes'][0]
        self.assertAlmostEqual(warm['shelf_remaining'],2160-warm['hours'],places=1)
        for window in [0,2161]:
            self.assertEqual(self.a.post('/api/plan',json={**self.inputs,'arrival_window':window}).status_code,422)

    def test_global_geometry_cache_avoids_recomputing_for_cargo_edits(self):
        routing._cached_world_paths.cache_clear()
        payload={**self.inputs,'origin':'shanghai','destination':'singapore'}
        with patch.object(routing._searoute,'searoute',wraps=routing._searoute.searoute) as network:
            first=self.a.post('/api/plan',json=payload).json()
            calls=network.call_count
            second=self.a.post('/api/plan',json={**payload,'temperature':12}).json()
            self.assertGreater(calls,0); self.assertEqual(network.call_count,calls)
            self.assertEqual(first['routes'][0]['coordinates'],second['routes'][0]['coordinates'])

    def test_every_product_has_a_bounded_perishability_model(self):
        for product in self.a.get('/api/catalog').json()['cargo_products']:
            model=product['model']; weights=model['routing_weights']
            self.assertAlmostEqual(sum(weights.values()),1)
            self.assertTrue(all(0<=value<=1 for value in weights.values()))
            self.assertGreaterEqual(model['decay_percent_per_day'],0)
            if not model['perishable']:
                self.assertEqual(model['decay_percent_per_day'],0)
                self.assertEqual(weights['freshness'],0)

    def test_apples_berries_and_electronics_have_distinct_quality_loss(self):
        from backend.cargo_model import evaluate_cargo
        from backend.cargo_catalog import PRODUCT_BY_ID
        from backend.main import CargoItem
        quality={key:evaluate_cargo(CargoItem(product_id=key),PRODUCT_BY_ID[key]['model'],48)['freshness']
                 for key in ['apples','raspberries','computers']}
        self.assertLess(quality['raspberries'],quality['apples'])
        self.assertLess(quality['apples'],quality['computers'])
        self.assertEqual(quality['computers'],100)
        new=self.a.post('/api/plan',json={**self.inputs,'cargo_items':[{'product_id':'apples'}]}).json()
        old=self.a.post('/api/plan',json={**self.inputs,'cargo_items':[{'product_id':'apples','cargo_age':1410}]}).json()
        new_best=next(route for route in new['routes'] if route['id']==new['recommended'])
        old_best=next(route for route in old['routes'] if route['id']==old['recommended'])
        self.assertLess(old_best['hours'],new_best['hours'])
        self.assertEqual(old_best['newly_expired_tonnes'],0)
        self.assertGreater(old['routes'][0]['score_breakdown']['weights']['freshness'],new['routes'][0]['score_breakdown']['weights']['freshness'])

    def test_small_perishable_load_and_normalized_global_weights(self):
        payload={**self.inputs,'cargo_items':[{'product_id':'raspberries','weight':.1},{'product_id':'computers','weight':1000}]}
        result=self.a.post('/api/plan',json=payload).json()
        best=next(route for route in result['routes'] if route['id']==result['recommended'])
        self.assertEqual(best['hours'],min(route['hours'] for route in result['routes']))
        for route in result['routes']:
            self.assertGreaterEqual(route['score'],0); self.assertLessEqual(route['score'],1)
        payload.update(origin='shanghai',destination='singapore')
        global_route=self.a.post('/api/plan',json=payload).json()['routes'][0]
        weights=global_route['score_breakdown']['weights']
        self.assertEqual(weights['habitat'],0); self.assertAlmostEqual(sum(weights.values()),1)
        self.assertIsNone(global_route['score_breakdown']['components']['habitat'])

    def test_frozen_thawing_cold_floor_and_priority_override(self):
        from backend.cargo_model import evaluate_cargo
        from backend.cargo_catalog import PRODUCT_BY_ID
        from backend.main import CargoItem
        model=PRODUCT_BY_ID['frozen-beef']['model']
        frozen=evaluate_cargo(CargoItem(product_id='frozen-beef'),model,48)
        colder=evaluate_cargo(CargoItem(product_id='frozen-beef',temperature=-30),model,48)
        thawed=evaluate_cargo(CargoItem(product_id='frozen-beef',temperature=4),model,100)
        self.assertEqual(colder['freshness'],frozen['freshness'])
        self.assertEqual(thawed['freshness'],0)
        self.assertTrue(thawed['expired_on_arrival'])
        payload={**self.inputs,'cargo_items':[{'name':'Custom fruit','profile':'avocados','shelf_life':100,'routing_priority':'freshness'}]}
        response=self.a.post('/api/plan',json=payload).json()
        self.assertAlmostEqual(response['routes'][0]['cargo_results'][0]['model']['routing_weights']['freshness'],.85)
        payload['cargo_items'][0]['routing_priority']='unknown'
        self.assertEqual(self.a.post('/api/plan',json=payload).status_code,422)

if __name__=='__main__':unittest.main()


