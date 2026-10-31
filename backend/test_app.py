import os, tempfile, unittest
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
        self.inputs.update(weight=90,max_speed=20)
        self.assertEqual(self.a.post('/api/voyages',json=self.voyage(vessel_id=vid)).status_code,201)
        self.assertEqual(self.a.delete('/api/vessels/'+vid).status_code,200)
        self.assertEqual(len(self.a.get('/api/voyages').json()),1)
    def test_routes_have_valid_geography_and_speed_caps(self):
        r=self.a.post('/api/plan',json=self.inputs);self.assertEqual(r.status_code,200,r.text)
        routes=r.json()['routes'];self.assertEqual(len(routes),3)
        self.assertLess(routes[0]['distance'],routes[2]['distance'])
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

if __name__=='__main__':unittest.main()


