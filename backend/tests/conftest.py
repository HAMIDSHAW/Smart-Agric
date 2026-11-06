import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.pop('GROQ_API_KEY', None); os.environ.pop('ANTHROPIC_API_KEY', None)
import pytest
from app import create_app, db


@pytest.fixture()
def app():
    os.environ['ADMIN_EMAIL'] = 'boss@example.com'
    os.environ['ADMIN_PASSWORD'] = 'a-long-test-password'
    app = create_app('testing')
    yield app
    with app.app_context():
        db.session.remove(); db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email, password):
    r = client.post('/api/auth/login', json={'email': email, 'password': password})
    return r


def register(client, email='farmer@example.com', password='farmerpass123'):
    return client.post('/api/auth/register', json={
        'full_name': 'Test Farmer', 'email': email, 'password': password,
        'district': 'Bo', 'phone': '+23277000000'})


@pytest.fixture(autouse=True)
def _reset_state():
    from app.services import ai_gateway, ratelimit
    ai_gateway.reset_breakers(); ratelimit.reset_limits()
    yield
    ai_gateway.reset_breakers(); ratelimit.reset_limits()


def auth_header(client, email='farmer@example.com', password='farmerpass123'):
    register(client, email, password)
    tok = login(client, email, password).get_json()['access_token']
    return {'Authorization': f'Bearer {tok}'}


def admin_header(client):
    tok = login(client, 'boss@example.com', 'a-long-test-password').get_json()['access_token']
    return {'Authorization': f'Bearer {tok}'}
