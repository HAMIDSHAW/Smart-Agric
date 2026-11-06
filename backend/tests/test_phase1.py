import io, os, pytest
from conftest import login, register
from config import validate_production_config


def test_no_hardcoded_default_admin(app, client):
    assert login(client, 'admin@smartagri.sl', 'SmartAgri2024!').status_code == 401


def test_env_bootstrap_admin_works(client):
    r = login(client, 'boss@example.com', 'a-long-test-password')
    assert r.status_code == 200 and r.get_json()['user']['role'] == 'super_admin'


def test_admin_blueprint_registered_and_protected(client):
    assert client.get('/api/admin/dashboard').status_code == 401
    register(client)
    tok = login(client, 'farmer@example.com', 'farmerpass123').get_json()['access_token']
    r = client.get('/api/admin/dashboard', headers={'Authorization': f'Bearer {tok}'})
    assert r.status_code == 403            # farmer cannot reach admin API


def test_admin_dashboard_real_counts(client):
    register(client)
    tok = login(client, 'boss@example.com', 'a-long-test-password').get_json()['access_token']
    r = client.get('/api/admin/dashboard', headers={'Authorization': f'Bearer {tok}'})
    assert r.status_code == 200 and r.get_json()['stats']['farmers'] == 1


def test_admin_cannot_delete_admin_or_change_own_role(client):
    tok = login(client, 'boss@example.com', 'a-long-test-password').get_json()['access_token']
    h = {'Authorization': f'Bearer {tok}'}
    me = client.get('/api/auth/profile', headers=h).get_json()
    uid = me.get('user', me)['id']
    assert client.delete(f'/api/admin/users/{uid}', headers=h).status_code == 400
    assert client.post(f'/api/admin/users/{uid}/role', json={'role': 'farmer'}, headers=h).status_code == 403


def test_feedback_route_served_and_persisted(app, client):
    assert client.post('/api/feedback/send', json={}).status_code == 400
    r = client.post('/api/feedback/send', json={'name': 'A', 'message': 'Great app'})
    assert r.status_code == 200 and r.get_json()['email_delivered'] is False
    from app.models import Feedback
    with app.app_context():
        assert Feedback.query.count() == 1


def test_forgot_password_never_leaks_or_logs_token(client, caplog):
    register(client)
    with caplog.at_level('DEBUG'):
        r = client.post('/api/auth/forgot-password', json={'email': 'farmer@example.com'})
    assert r.status_code == 200
    assert 'Token' not in caplog.text
    same = client.post('/api/auth/forgot-password', json={'email': 'nobody@example.com'})
    assert same.get_json() == r.get_json()     # no account enumeration


def test_production_refuses_insecure_config(monkeypatch):
    for k in ('SECRET_KEY', 'JWT_SECRET_KEY', 'DATABASE_URL'):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(RuntimeError):
        validate_production_config()
    monkeypatch.setenv('SECRET_KEY', 'dev-secret-change-in-production')
    monkeypatch.setenv('JWT_SECRET_KEY', 'x' * 40)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://u:p@h/db')
    with pytest.raises(RuntimeError):
        validate_production_config()
    monkeypatch.setenv('SECRET_KEY', 'y' * 40)
    validate_production_config()


def test_cors_rejects_wildcard_netlify_origin(client):
    r = client.options('/api/auth/login', headers={
        'Origin': 'https://evil-site.netlify.app',
        'Access-Control-Request-Method': 'POST'})
    assert 'evil-site' not in (r.headers.get('Access-Control-Allow-Origin') or '')


def test_progress_route_uses_anthropic_key_only(monkeypatch):
    import app.routes.disease_progress as dp
    calls = {}
    class R:
        status_code = 200
        def json(self): return {'content': [{'text': '{"disease_name":"Healthy","is_healthy":true,"confidence":90,"status":"healthy","observation":"ok"}'}]}
    def fake_post(url, headers=None, json=None, timeout=None):
        calls['url'], calls['headers'], calls['model'] = url, headers, json['model']
        return R()
    import app.services.ai_gateway as gwm
    monkeypatch.setattr(gwm.requests, 'post', fake_post)
    monkeypatch.setenv('GROQ_API_KEY', 'groq-secret'); monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    res, err = dp.analyse_image_with_claude(b'x', 'image/jpeg', 'plant')
    assert res is None and not calls and 'not configured' in err      # Groq key never forwarded
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'anthropic-secret')
    res, err = dp.analyse_image_with_claude(b'x', 'image/jpeg', 'plant')
    assert err is None and calls['headers']['x-api-key'] == 'anthropic-secret'
    assert calls['model'] == 'claude-haiku-4-5-20251001' and 'anthropic.com' in calls['url']
