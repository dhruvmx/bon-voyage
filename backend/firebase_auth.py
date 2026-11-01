"""Verify Firebase Google ID tokens using Google's public signing certificates."""
import os
import re
from functools import partial
import requests

from fastapi import HTTPException
from google.auth import exceptions as google_errors
from google.auth.transport.requests import Request
from google.oauth2 import id_token as google_token


def public_config():
    config = {
        'apiKey': os.environ.get('FIREBASE_API_KEY', '').strip(),
        'authDomain': os.environ.get('FIREBASE_AUTH_DOMAIN', '').strip(),
        'projectId': os.environ.get('FIREBASE_PROJECT_ID', '').strip(),
        'appId': os.environ.get('FIREBASE_APP_ID', '').strip(),
    }
    return {'enabled': all(config.values()), 'config': config if all(config.values()) else None}


def verify_google_token(token):
    project = os.environ.get('FIREBASE_PROJECT_ID', '').strip()
    if not project or not public_config()['enabled']:
        raise HTTPException(503, 'Google sign-in is currently unavailable.')
    try:
        # No service-account private key is needed to verify public ID tokens.
        with requests.Session() as transport:
            claims = google_token.verify_firebase_token(
                token, partial(Request(session=transport), timeout=10), audience=project)
    except google_errors.TransportError as error:
        raise HTTPException(503, 'Google sign-in could not be verified. Please try again.') from error
    except (ValueError, google_errors.GoogleAuthError) as error:
        raise HTTPException(401, 'Google sign-in expired or is invalid. Please try again.') from error
    email = claims.get('email', '')
    subject = claims.get('sub', '')
    provider = claims.get('firebase')
    if (claims.get('iss') != f'https://securetoken.google.com/{project}'
            or claims.get('aud') != project
            or not isinstance(provider, dict) or provider.get('sign_in_provider') != 'google.com'
            or claims.get('email_verified') is not True
            or not isinstance(subject, str) or not 1 <= len(subject) <= 128
            or not isinstance(email, str) or len(email) > 254
            or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email)):
        raise HTTPException(401, 'Use a verified Google account to sign in.')
    return {**claims, 'email': email.lower(), 'identity': f'{project}:{subject}'}
