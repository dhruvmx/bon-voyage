"""Google identity verification and account linking; no live Firebase users."""
import os
import tempfile
import unittest
import time
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend import main, firebase_auth


CONFIG = {'FIREBASE_PROJECT_ID': 'bon-voyage-test', 'FIREBASE_API_KEY': 'public-test-key',
          'FIREBASE_AUTH_DOMAIN': 'bon-voyage-test.firebaseapp.com', 'FIREBASE_APP_ID': 'test-app'}


def claims(**overrides):
    return {'sub': 'google-user-1', 'aud': 'bon-voyage-test',
            'iss': 'https://securetoken.google.com/bon-voyage-test',
            'email': 'operator@example.com', 'email_verified': True,
            'name': 'Google Operator', 'firebase': {'sign_in_provider': 'google.com'}, **overrides}


class FirebaseAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, CONFIG)
        self.env.start(); self.addCleanup(self.env.stop)
        self.path = patch.object(main, 'DB', Path(self.temp.name) / 'test.sqlite3')
        self.path.start(); self.addCleanup(self.path.stop)
        main.init_db()
        self.client = TestClient(main.app); self.addCleanup(self.client.close)
        self.verify = patch.object(firebase_auth.google_token, 'verify_firebase_token', return_value=claims())
        self.verifier = self.verify.start(); self.addCleanup(self.verify.stop)

    def exchange(self, **extra):
        return self.client.post('/api/auth/google', json={'id_token': 'test-token-for-firebase-verification', **extra})

    def test_configuration_is_public_and_disabled_without_complete_config(self):
        config = self.client.get('/api/auth/config').json()['google']
        self.assertTrue(config['enabled'])
        self.assertEqual(set(config['config']), {'apiKey', 'authDomain', 'projectId', 'appId'})
        with patch.dict(os.environ, {'FIREBASE_APP_ID': ''}):
            self.assertEqual(self.client.get('/api/auth/config').json()['google'], {'enabled': False, 'config': None})
            self.assertEqual(self.exchange().status_code, 503)
        self.verifier.assert_not_called()

    def test_new_google_account_session_logout_and_stable_identity(self):
        response = self.exchange()
        self.assertEqual(response.status_code, 200, response.text)
        user = response.json()
        self.assertFalse(user['has_password'])
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertEqual(self.verifier.call_args.kwargs['audience'], 'bon-voyage-test')
        self.assertEqual(self.client.get('/api/auth/me').json()['id'], user['id'])
        self.assertEqual(self.client.put('/api/auth/password', json={'current_password': 'anything', 'new_password': 'new-password-123'}).status_code, 400)
        self.client.post('/api/auth/logout')
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.verifier.return_value = claims(email='renamed@example.com')
        self.assertEqual(self.exchange().json()['id'], user['id'])
        with main.db() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n'], 1)

    def test_existing_account_requires_password_and_keeps_private_records(self):
        old = self.client.post('/api/auth/signup', json={'email': 'operator@example.com', 'name': 'Existing Operator', 'password': 'existing-password'}).json()
        ship = self.client.post('/api/vessels', json={'name': 'Existing ship'}).json()
        self.client.post('/api/auth/logout')
        response = self.exchange()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['detail']['code'], 'account_link_required')
        self.assertEqual(self.exchange(password='wrong').status_code, 401)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        linked = self.exchange(password='existing-password')
        self.assertEqual(linked.status_code, 200, linked.text)
        self.assertEqual(linked.json()['id'], old['id'])
        self.assertTrue(linked.json()['has_password'])
        self.assertEqual(self.client.get('/api/vessels/' + ship['id']).status_code, 200)
        self.client.post('/api/auth/logout')
        self.assertEqual(self.exchange().json()['id'], old['id'])
        self.client.post('/api/auth/logout')
        self.verifier.return_value = claims(sub='different-google-user', email='other@example.com')
        self.assertEqual(self.exchange().status_code, 200)
        self.assertEqual(self.client.get('/api/vessels/' + ship['id']).status_code, 404)

    def test_rejects_invalid_expired_wrong_project_and_non_google_tokens(self):
        self.verifier.side_effect = ValueError('Invalid signature or expired token')
        self.assertEqual(self.exchange().status_code, 401)
        self.verifier.side_effect = None
        for invalid in [claims(iss='https://accounts.google.com'), claims(aud='another-project'),
                        claims(email_verified=False), claims(sub=''), claims(email='invalid'),
                        claims(firebase={'sign_in_provider': 'password'})]:
            self.verifier.return_value = invalid
            self.assertEqual(self.exchange().status_code, 401)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_cross_origin_and_exchange_rate_limit(self):
        response = self.client.post('/api/auth/google', headers={'Origin': 'https://other.example'}, json={'id_token': 'test-token-for-firebase-verification'})
        self.assertEqual(response.status_code, 403)
        self.verifier.assert_not_called()
        self.verifier.side_effect = ValueError('bad token')
        for _ in range(20): self.assertEqual(self.exchange().status_code, 401)
        self.assertEqual(self.exchange().status_code, 429)
        self.assertEqual(self.verifier.call_count, 20)

    def test_real_signature_expiry_and_project_validation(self):
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        from google.auth import crypt, jwt
        self.verify.stop()
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        signer = crypt.RSASigner.from_string(private, key_id='disposable-test-key')
        def sign(**overrides):
            return jwt.encode(signer, {**claims(), 'iat': int(time.time()) - 5, 'exp': int(time.time()) + 300, **overrides}).decode()
        with patch.object(firebase_auth.google_token, '_fetch_certs', return_value={'disposable-test-key': public}):
            for token in [sign(exp=int(time.time())-60), sign(aud='other-project'), 'forged.token.signature']:
                result = self.client.post('/api/auth/google', json={'id_token': token})
                self.assertEqual(result.status_code, 401, result.text)
            result = self.client.post('/api/auth/google', json={'id_token': sign()})
            self.assertEqual(result.status_code, 200, result.text)


if __name__ == '__main__':
    unittest.main()
