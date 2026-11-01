"""Optional real-adapter coverage, isolated in a disposable PostgreSQL schema."""
import os
import secrets
import unittest
from unittest.mock import patch
import psycopg
from psycopg.conninfo import make_conninfo
from psycopg import sql
from fastapi.testclient import TestClient
from backend import main

@unittest.skipUnless(os.environ.get('BON_VOYAGE_TEST_POSTGRES_URL'),'Set BON_VOYAGE_TEST_POSTGRES_URL for PostgreSQL integration tests.')
class PostgresTests(unittest.TestCase):
    def setUp(self):
        self.url=os.environ['BON_VOYAGE_TEST_POSTGRES_URL']
        self.schema='bon_test_'+secrets.token_hex(8)
        with psycopg.connect(self.url,autocommit=True) as connection:
            connection.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(self.schema)))
        self.addCleanup(self.drop_schema)
        connection_url=make_conninfo(self.url,options=f'-c search_path={self.schema}')
        self.env=patch.dict(os.environ,{'DATABASE_URL':connection_url}); self.env.start()
        self.addCleanup(self.env.stop)
        main.init_db()
        self.client=TestClient(main.app); self.addCleanup(self.client.close)

    def drop_schema(self):
        with psycopg.connect(self.url,autocommit=True) as connection:
            connection.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(self.schema)))

    def test_real_json_queries_snapshots_stats_and_account_isolation(self):
        signup=self.client.post('/api/auth/signup',json={'name':'Postgres Operator','email':'pg@example.com','password':'postgres-test-password'})
        self.assertEqual(signup.status_code,201,signup.text)
        vessel=self.client.post('/api/vessels',json={'name':' PostgreSQL carrier '}).json()
        saved=self.client.post('/api/voyages',json={'name':' 100%_ voyage ','vessel_id':vessel['id'],'notes':'long notes '*100,
            'inputs':{'departure':'2026-11-01T00:00:00Z','arrival_window':168}})
        self.assertEqual(saved.status_code,201,saved.text); voyage=saved.json()
        page=self.client.get('/api/voyages',params={'q':'100%_','limit':1}).json()
        self.assertEqual(page['total'],1); self.assertNotIn('segments',page['items'][0]['result'])
        stats=self.client.get('/api/voyages/stats').json()
        self.assertEqual(stats['total'],1); self.assertEqual(stats['cargo'],240)
        self.assertEqual(stats['assessed'],1); self.assertEqual(stats['protection'],voyage['result']['protection'])
        self.assertEqual(self.client.get('/api/voyages/'+voyage['id']).json()['notes'],'long notes '*100)
        self.assertEqual(self.client.get('/api/vessels',params={'q':'PostgreSQL'}).json()['total'],1)
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/signup',json={'name':'Other Operator','email':'otherpg@example.com','password':'postgres-test-password'})
        self.assertEqual(self.client.get('/api/voyages').json()['total'],0)
        self.assertEqual(self.client.get('/api/voyages/'+voyage['id']).status_code,404)
        self.assertEqual(self.client.get('/api/vessels/'+vessel['id']).status_code,404)
