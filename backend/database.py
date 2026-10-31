"""SQLite for local installs; Neon Postgres for Vercel deployments."""
import os
import sqlite3
import psycopg
from psycopg.rows import dict_row

INTEGRITY_ERRORS = (sqlite3.IntegrityError, psycopg.IntegrityError)

def database_url():
    return os.environ.get('DATABASE_URL') or os.environ.get('POSTGRES_URL') or os.environ.get('STORAGE_URL')

class PostgresConnection:
    def __init__(self, url):
        self.connection = psycopg.connect(url, row_factory=dict_row, connect_timeout=15, prepare_threshold=None)

    def execute(self, query, params=None):
        # All parameterized application queries use positional placeholders.
        # Query identifiers come only from the application's fixed table names.
        return self.connection.execute(query.replace('?', '%s'), params)

    def executescript(self, script):
        for statement in script.split(';'):
            statement = statement.strip()
            if statement and not statement.upper().startswith('PRAGMA'):
                self.connection.execute(statement.replace(' REAL ', ' DOUBLE PRECISION '))

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()

def connect(local_path):
    url = database_url()
    if url:
        return PostgresConnection(url)
    if os.environ.get('VERCEL'):
        raise RuntimeError('Connect a PostgreSQL database and configure DATABASE_URL before deploying Bon Voyage.')
    connection = sqlite3.connect(local_path, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    return connection

