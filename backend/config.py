import os
import ssl
from datetime import timedelta
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))


def get_database_url():
    url = os.environ.get(
        'DATABASE_URL',
        'postgresql+pg8000://smartagri_user:smartagri2024@localhost:5432/smartagri_db'
    )
    # Normalize driver prefix - always use pg8000
    for prefix in ['postgresql+psycopg2://', 'postgresql://', 'postgres://']:
        if url.startswith(prefix):
            url = 'postgresql+pg8000://' + url[len(prefix):]
            break
    return url


def get_engine_options():
    """
    NullPool: every request opens a fresh connection and closes it immediately.
    This uses at most 1 connection per concurrent request instead of a persistent pool.
    Essential for Render free PostgreSQL (15 connection hard limit).
    For Supabase Transaction Pooler (port 6543), NullPool also works perfectly.
    """
    ssl_ctx = ssl.create_default_context()
    # Certificate verification is OFF by default to stay compatible with the
    # current Render/Supabase setup. Set DB_SSL_VERIFY=true once the provider's
    # CA chain is confirmed to work, to enable full verification.
    if os.environ.get('DB_SSL_VERIFY', '').lower() not in ('1', 'true', 'yes'):
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

    return {
        'poolclass': __import__('sqlalchemy.pool', fromlist=['NullPool']).NullPool,
        'connect_args': {
            'ssl_context': ssl_ctx,
        },
    }


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
    SQLALCHEMY_DATABASE_URI = get_database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = get_engine_options()

    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    ANTHROPIC_API_KEY   = os.environ.get('ANTHROPIC_API_KEY', '')
    GROQ_API_KEY        = os.environ.get('GROQ_API_KEY', '')
    OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY', '')
    FRONTEND_URL        = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
    UPLOAD_FOLDER       = os.path.join(basedir, 'uploads')
    MAX_CONTENT_LENGTH  = 16 * 1024 * 1024


REQUIRED_PRODUCTION_ENV = ['SECRET_KEY', 'JWT_SECRET_KEY', 'DATABASE_URL']
_INSECURE_VALUES = {'dev-secret-change-in-production', 'jwt-secret-change-in-production', ''}


def validate_production_config():
    """Fail fast (never silently fall back to insecure defaults) in production."""
    problems = [k for k in REQUIRED_PRODUCTION_ENV if not os.environ.get(k)]
    for k in ('SECRET_KEY', 'JWT_SECRET_KEY'):
        v = os.environ.get(k, '')
        if v in _INSECURE_VALUES or (v and len(v) < 24):
            problems.append(f'{k} (missing, default, or shorter than 24 characters)')
    if problems:
        raise RuntimeError(
            'Insecure or incomplete production configuration. Fix these environment '
            'variables: ' + ', '.join(sorted(set(problems)))
        )


class DevelopmentConfig(Config):
    DEBUG = True
    # No SSL for local dev - simpler pool
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_size': 3,
    }


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_ENGINE_OPTIONS = {}
    SECRET_KEY = 'test-secret-key-not-for-production-use'
    JWT_SECRET_KEY = 'test-jwt-secret-key-not-for-production'


config = {
    'testing':     TestingConfig,
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'default':     DevelopmentConfig,
}
