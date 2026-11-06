import csv, io, os, pytest
from conftest import login, register
from app import create_app, db, bcrypt
from app.models import User, AuditLog, UserPermission
from app.services.rbac import ROLE_PERMISSIONS, ALL_ROLES
from app.migrations import ensure_schema

PW = 'a-very-long-test-password'


def make_user(app, role, email=None, password=PW, **kw):
    email = email or f'{role}@t.example'
    with app.app_context():
        u = User(full_name=role.title(), email=email, role=role, district='Bo', is_active=True,
                 password_hash=bcrypt.generate_password_hash(password).decode(), **kw)
        db.session.add(u); db.session.commit()
        return u.id, email


def tok(client, email, password=PW):
    r = login(client, email, password)
    assert r.status_code == 200, r.get_json()
    return {'Authorization': f"Bearer {r.get_json()['access_token']}"}


def as_role(app, client, role):
    _, email = make_user(app, role)
    return tok(client, email)


def super_h(client):
    return tok(client, 'boss@example.com', 'a-long-test-password')


# ── Seeding ────────────────────────────────────────────────────────────────
@pytest.fixture()
def fresh_app(monkeypatch):
    made = []
    def build(**env):
        for k in ('ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SEED_ROLE_USERS', 'SEED_USERS_PASSWORD', 'SEED_USERS_DOMAIN'):
            monkeypatch.delenv(k, raising=False)
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        a = create_app('testing'); made.append(a); return a
    yield build
    for a in made:
        with a.app_context():
            db.session.remove(); db.drop_all()


def test_main_user_is_seeded_as_super_admin_from_env(fresh_app):
    app = fresh_app(ADMIN_EMAIL='Owner@Farm.sl', ADMIN_PASSWORD='owner-pass-123456')
    r = login(app.test_client(), 'owner@farm.sl', 'owner-pass-123456')
    assert r.status_code == 200 and r.get_json()['user']['role'] == 'super_admin'
    assert 'roles.manage' in r.get_json()['user']['permissions']


def test_weak_main_password_is_refused(fresh_app):
    app = fresh_app(ADMIN_EMAIL='owner@farm.sl', ADMIN_PASSWORD='short')
    with app.app_context():
        assert User.query.count() == 0


def test_no_env_means_no_accounts_and_no_default_credentials(fresh_app):
    app = fresh_app()
    with app.app_context():
        assert User.query.count() == 0


def test_existing_account_promoted_only_when_no_super_admin(fresh_app):
    app = fresh_app()
    make_user(app, 'admin', 'owner@farm.sl', 'old-password-1234')
    from app.services.seeding import seed_accounts
    os.environ['ADMIN_EMAIL'], os.environ['ADMIN_PASSWORD'] = 'owner@farm.sl', 'new-password-123456'
    with app.app_context():
        seed_accounts()
        u = User.query.filter_by(email='owner@farm.sl').first()
        assert u.role == 'super_admin'
        assert bcrypt.check_password_hash(u.password_hash, 'old-password-1234')     # password NOT reset
        other = User(full_name='X', email='x@farm.sl', role='farmer', password_hash='x'); db.session.add(other); db.session.commit()
        os.environ['ADMIN_EMAIL'] = 'x@farm.sl'
        seed_accounts()
        assert User.query.filter_by(email='x@farm.sl').first().role == 'farmer'   # a super admin already exists
    os.environ.pop('ADMIN_EMAIL'); os.environ.pop('ADMIN_PASSWORD')


def test_role_users_seeded_for_every_role_and_can_log_in(fresh_app, caplog):
    app = fresh_app(ADMIN_EMAIL='owner@farm.sl', ADMIN_PASSWORD='owner-pass-123456',
                    SEED_ROLE_USERS='true', SEED_USERS_PASSWORD='demo-pass-1234567', SEED_USERS_DOMAIN='@farm.sl')
    c = app.test_client()
    roles = {}
    for role, local in [('farmer', 'farmer'), ('extension_officer', 'extension.officer'), ('buyer', 'buyer'),
                        ('seller', 'seller'), ('operations_admin', 'operations.admin'),
                        ('marketplace_admin', 'marketplace.admin'), ('ai_admin', 'ai.admin'),
                        ('support_admin', 'support.admin')]:
        r = login(c, f'{local}@farm.sl', 'demo-pass-1234567')
        assert r.status_code == 200, local
        roles[role] = r.get_json()['user']
        assert roles[role]['role'] == role
    assert roles['ai_admin']['permissions'] == sorted(ROLE_PERMISSIONS['ai_admin'])
    assert roles['farmer']['permissions'] == []
    with app.app_context():
        assert User.query.count() == 9                              # 8 role accounts + main user
        blob = str([a.details for a in AuditLog.query.all()])
        assert 'demo-pass' not in blob and 'owner-pass' not in blob


def test_role_seeding_is_idempotent_and_needs_a_strong_password(fresh_app):
    app = fresh_app(SEED_ROLE_USERS='true', SEED_USERS_PASSWORD='demo-pass-1234567')
    from app.services.seeding import seed_accounts
    with app.app_context():
        n = User.query.count(); seed_accounts(); assert User.query.count() == n == 8
    app2 = fresh_app(SEED_ROLE_USERS='true', SEED_USERS_PASSWORD='weak')
    with app2.app_context():
        assert User.query.count() == 0


# ── Permissions are enforced on the server ────────────────────────────────
ADMIN_GETS = ['/api/admin/dashboard', '/api/admin/users', '/api/admin/users/1', '/api/admin/roles', '/api/admin/audit',
              '/api/admin/notifications', '/api/admin/feedback', '/api/admin/system/health', '/api/admin/ai/models',
              '/api/admin/ai/errors', '/api/admin/reports/users.csv', '/api/admin/analyses', '/api/auth/admin/users',
              '/api/auth/admin/stats']


@pytest.mark.parametrize('url', ADMIN_GETS)
def test_every_admin_endpoint_rejects_anonymous_and_non_staff(app, client, url):
    assert client.get(url).status_code == 401
    for role in ('farmer', 'buyer', 'seller', 'extension_officer'):
        h = as_role(app, client, role)
        assert client.get(url, headers=h).status_code == 403, (role, url)


@pytest.mark.parametrize('role', ['operations_admin', 'marketplace_admin', 'ai_admin', 'support_admin', 'admin'])
def test_each_staff_role_only_reaches_what_its_permissions_allow(app, client, role):
    h = as_role(app, client, role)
    perms = ROLE_PERMISSIONS[role]
    expect = {
        '/api/admin/users': 'users.view', '/api/admin/ai/models': 'ai.view', '/api/admin/audit': 'audit.view',
        '/api/admin/system/health': 'system.view', '/api/admin/feedback': 'feedback.view',
        '/api/admin/notifications': 'notifications.view', '/api/admin/reports/ai_usage.csv': 'reports.export',
    }
    for url, perm in expect.items():
        assert client.get(url, headers=h).status_code == (200 if perm in perms else 403), (role, url)


def test_forged_role_claim_is_ignored_because_the_database_decides(app, client):
    from flask_jwt_extended import create_access_token
    uid, _ = make_user(app, 'farmer', 'f@t.example')
    with app.app_context():
        t = create_access_token(identity=str(uid), additional_claims={'role': 'super_admin', 'tv': 0})
    assert client.get('/api/admin/users', headers={'Authorization': f'Bearer {t}'}).status_code == 403


def test_operations_admin_limits(app, client):
    ops = as_role(app, client, 'operations_admin')
    sid, _ = make_user(app, 'super_admin', 'super2@t.example')
    fid, _ = make_user(app, 'farmer', 'farm@t.example')
    assert client.post(f'/api/admin/users/{fid}/role', json={'role': 'seller'}, headers=ops).status_code == 200
    assert client.post(f'/api/admin/users/{fid}/role', json={'role': 'ai_admin'}, headers=ops).status_code == 403
    assert client.post(f'/api/admin/users/{sid}/role', json={'role': 'farmer'}, headers=ops).status_code == 403
    assert client.post(f'/api/admin/users/{sid}/suspend', json={'reason': 'x'}, headers=ops).status_code == 403
    assert client.post(f'/api/admin/users/{sid}/reset-password', json={'new_password': 'x' * 14}, headers=ops).status_code == 403
    assert client.put(f'/api/admin/users/{fid}/permissions', json={'grant': ['ai.view']}, headers=ops).status_code == 403
    assert client.post('/api/admin/users', json={'full_name': 'S', 'email': 's@t.example', 'password': 'p' * 14, 'role': 'super_admin'}, headers=ops).status_code == 403
    assert client.delete(f'/api/admin/users/{fid}', headers=ops).status_code == 403          # users.delete is Super Admin only


def test_legacy_admin_is_not_a_super_admin(app, client):
    h = as_role(app, client, 'admin')
    uid, _ = make_user(app, 'farmer', 'f2@t.example')
    assert client.get('/api/admin/users', headers=h).status_code == 200
    assert client.post(f'/api/admin/users/{uid}/role', json={'role': 'support_admin'}, headers=h).status_code == 403
    assert client.post('/api/auth/admin/create-admin', json={'full_name': 'A', 'email': 'a@t.example', 'password': 'p' * 14}, headers=h).status_code == 403


def test_super_admin_manages_roles_with_guards(app, client):
    h = super_h(client)
    uid, _ = make_user(app, 'farmer', 'f3@t.example')
    r = client.post(f'/api/admin/users/{uid}/role', json={'role': 'marketplace_admin'}, headers=h)
    assert r.status_code == 200 and r.get_json()['user']['role'] == 'marketplace_admin'
    me = client.get('/api/auth/profile', headers=h).get_json()['user']['id']
    assert client.post(f'/api/admin/users/{me}/role', json={'role': 'farmer'}, headers=h).status_code == 403
    assert client.post(f'/api/admin/users/{uid}/role', json={'role': 'admin'}, headers=h).status_code == 403     # legacy role can't be assigned
    assert client.post(f'/api/admin/users/{uid}/role', json={'role': 'nonsense'}, headers=h).status_code == 403
    assert client.delete(f'/api/admin/users/{me}', headers=h).status_code == 400


def test_permission_overrides_by_super_admin_only(app, client):
    h = super_h(client)
    uid, email = make_user(app, 'support_admin', 'sup@t.example')
    sh = tok(client, email)
    assert client.get('/api/admin/ai/models', headers=sh).status_code == 403
    r = client.put(f'/api/admin/users/{uid}/permissions', json={'grant': ['ai.view'], 'deny': ['users.reset_password']}, headers=h)
    assert r.status_code == 200 and 'ai.view' in r.get_json()['permissions'] and 'users.reset_password' not in r.get_json()['permissions']
    sh = tok(client, email)
    assert client.get('/api/admin/ai/models', headers=sh).status_code == 200
    fid, femail = make_user(app, 'farmer', 'f4@t.example')
    assert client.post(f'/api/admin/users/{fid}/reset-password', json={'new_password': 'n' * 10}, headers=sh).status_code == 403
    assert client.put(f'/api/admin/users/{uid}/permissions', json={'grant': ['made.up']}, headers=h).status_code == 400
    sid = client.get('/api/auth/profile', headers=h).get_json()['user']['id']
    assert client.put(f'/api/admin/users/{sid}/permissions', json={'deny': ['audit.view']}, headers=h).status_code == 403
    uid2, _ = make_user(app, 'super_admin', 'sup2@t.example')
    assert client.put(f'/api/admin/users/{uid2}/permissions', json={'deny': ['audit.view']}, headers=h).status_code == 400


# ── Sessions end immediately when access changes ──────────────────────────
def test_suspension_kills_existing_sessions_and_blocks_login(app, client):
    h = super_h(client)
    fid, email = make_user(app, 'farmer', 'victim@t.example')
    fh = tok(client, email)
    assert client.get('/api/auth/profile', headers=fh).status_code == 200
    assert client.post(f'/api/admin/users/{fid}/suspend', json={}, headers=h).status_code == 400            # reason required
    assert client.post(f'/api/admin/users/{fid}/suspend', json={'reason': 'Fraud report'}, headers=h).status_code == 200
    assert client.get('/api/auth/profile', headers=fh).status_code == 401
    assert login(client, email, PW).status_code == 403
    assert client.post(f'/api/admin/users/{fid}/restore', headers=h).status_code == 200
    assert login(client, email, PW).status_code == 200


def test_password_change_signs_out_other_sessions_but_keeps_this_one(app, client):
    _, email = make_user(app, 'farmer', 'pc@t.example')
    old = tok(client, email)
    r = client.post('/api/auth/change-password', headers=old, json={'current_password': PW, 'new_password': 'brand-new-password-1'})
    assert r.status_code == 200
    assert client.get('/api/auth/profile', headers=old).status_code == 401
    new = {'Authorization': f"Bearer {r.get_json()['access_token']}"}
    assert client.get('/api/auth/profile', headers=new).status_code == 200
    assert login(client, email, 'brand-new-password-1').status_code == 200


def test_admin_reset_and_role_change_invalidate_tokens(app, client):
    h = super_h(client)
    fid, email = make_user(app, 'farmer', 'rs@t.example')
    fh = tok(client, email)
    assert client.post(f'/api/admin/users/{fid}/reset-password', json={'new_password': 'reset-password-12'}, headers=h).status_code == 200
    assert client.get('/api/auth/profile', headers=fh).status_code == 401
    fh = tok(client, email, 'reset-password-12')
    assert client.post(f'/api/admin/users/{fid}/role', json={'role': 'seller'}, headers=h).status_code == 200
    assert client.get('/api/auth/profile', headers=fh).status_code == 401


def test_refresh_token_also_stops_working_after_suspension(app, client):
    h = super_h(client)
    fid, email = make_user(app, 'farmer', 'rf@t.example')
    refresh = login(client, email, PW).get_json()['refresh_token']
    client.post(f'/api/admin/users/{fid}/suspend', json={'reason': 'test'}, headers=h)
    assert client.post('/api/auth/refresh', headers={'Authorization': f'Bearer {refresh}'}).status_code == 401


def test_staff_passwords_must_be_strong(app, client):
    h = super_h(client)
    assert client.post('/api/admin/users', json={'full_name': 'S', 'email': 's1@t.example', 'password': 'short-pass', 'role': 'support_admin'}, headers=h).status_code == 400
    assert client.post('/api/admin/users', json={'full_name': 'S', 'email': 's1@t.example', 'password': 'long-enough-pass-1', 'role': 'support_admin'}, headers=h).status_code == 201
    assert register(client, 'weak@t.example', 'short7!').status_code == 400


# ── Audit trail ───────────────────────────────────────────────────────────
def test_sensitive_actions_denials_and_failed_logins_are_audited_without_secrets(app, client):
    h = super_h(client)
    fid, email = make_user(app, 'farmer', 'au@t.example')
    client.post(f'/api/admin/users/{fid}/role', json={'role': 'seller'}, headers=h)
    client.post(f'/api/admin/users/{fid}/suspend', json={'reason': 'because'}, headers=h)
    client.post(f'/api/admin/users/{fid}/reset-password', json={'new_password': 'super-secret-pw-99'}, headers=h)
    login(client, 'nobody@t.example', 'guess-guess-guess')
    fh = tok(client, as_role(app, client, 'farmer') and 'farmer@t.example')
    client.get('/api/admin/users', headers=fh)
    ev = client.get('/api/admin/audit?days=7', headers=h).get_json()['events']
    actions = {e['action'] for e in ev}
    assert {'role_changed', 'user_suspended', 'password_reset_by_admin', 'login_failed', 'access_denied', 'admin_login'} <= actions
    blob = str(ev)
    assert 'super-secret-pw-99' not in blob and 'guess-guess' not in blob
    ch = [e for e in ev if e['action'] == 'role_changed'][0]
    assert ch['details'] == {'from': 'farmer', 'to': 'seller'} and ch['actor_email'] == 'boss@example.com' and ch['target_id'] == str(fid)
    assert client.get('/api/admin/audit?action=login_failed', headers=h).get_json()['total'] >= 1


def test_audit_log_is_append_only_through_the_api(app, client):
    h = super_h(client)
    for m in (client.put, client.delete, client.patch):
        assert m('/api/admin/audit', headers=h).status_code == 405
        assert m('/api/admin/audit/1', headers=h).status_code == 404


# ── Dashboard / users / reports / health ──────────────────────────────────
def test_dashboard_numbers_are_real_and_marketplace_is_not_faked(app, client):
    h = super_h(client)
    make_user(app, 'farmer', 'd1@t.example'); make_user(app, 'seller', 'd2@t.example'); make_user(app, 'support_admin', 'd3@t.example')
    d = client.get('/api/admin/dashboard', headers=h).get_json()
    assert d['users']['total'] == 4 and d['users']['by_role']['farmer'] == 1 and d['users']['by_role']['seller'] == 1
    assert d['stats']['farmers'] == 1 and d['stats']['admins'] == 2
    assert d['ai']['requests'] == 0 and d['ai']['success_rate'] is None
    assert d['marketplace']['available'] is True and d['marketplace']['orders_total'] == 0 and 'not measured agricultural impact' in d['platform_note']
    assert len(d['registrations_by_day']) == 31 and sum(x['count'] for x in d['registrations_by_day']) == 4


def test_user_list_search_filter_paginate(app, client):
    h = super_h(client)
    for i in range(25):
        make_user(app, 'farmer', f'bulk{i}@t.example')
    make_user(app, 'seller', 'sel@t.example')
    d = client.get('/api/admin/users?per_page=10&page=2', headers=h).get_json()
    assert len(d['users']) == 10 and d['total'] == 27 and d['pages'] == 3
    assert client.get('/api/admin/users?q=bulk7', headers=h).get_json()['total'] == 1
    assert client.get('/api/admin/users?role=seller', headers=h).get_json()['total'] == 1
    assert client.get('/api/admin/users?role=staff', headers=h).get_json()['total'] == 1
    assert client.get('/api/admin/users?status=suspended', headers=h).get_json()['total'] == 0
    assert client.get('/api/admin/users?per_page=9999', headers=h).get_json()['users'] and True


def test_user_detail_shows_activity_permissions_and_history(app, client):
    h = super_h(client)
    fid, _ = make_user(app, 'farmer', 'det@t.example')
    client.post(f'/api/admin/users/{fid}/verify', json={'status': 'verified'}, headers=h)
    assert client.post(f'/api/admin/users/{fid}/verify', json={'status': 'bogus'}, headers=h).status_code == 400
    d = client.get(f'/api/admin/users/{fid}', headers=h).get_json()['user']
    assert d['verification_status'] == 'verified' and d['activity']['disease_analyses'] == 0
    assert any(e['action'] == 'user_verification_changed' for e in d['recent_events'])
    assert 'password_hash' not in str(d)


def test_csv_reports_permission_gated_audited_and_formula_safe(app, client):
    h = super_h(client)
    make_user(app, 'farmer', 'csv@t.example')
    with app.app_context():
        u = User.query.filter_by(email='csv@t.example').first(); u.full_name = '=HYPERLINK("http://evil")'; db.session.commit()
    r = client.get('/api/admin/reports/users.csv', headers=h)
    assert r.status_code == 200 and r.mimetype == 'text/csv' and 'attachment' in r.headers['Content-Disposition']
    rows = list(csv.reader(io.StringIO(r.get_data(as_text=True))))
    assert rows[0][:3] == ['id', 'name', 'email'] and any(row[1].startswith("'=HYPERLINK") for row in rows)
    assert 'password' not in r.get_data(as_text=True).lower()
    for name in ('registrations', 'ai_usage', 'disease_trends', 'districts', 'crop_recommendations', 'audit'):
        assert client.get(f'/api/admin/reports/{name}.csv', headers=h).status_code == 200
    assert client.get('/api/admin/reports/nope.csv', headers=h).status_code == 404
    mk = as_role(app, client, 'marketplace_admin')
    assert client.get('/api/admin/reports/users.csv', headers=mk).status_code == 200 and client.get('/api/admin/reports/audit.csv', headers=mk).status_code == 403
    ai = as_role(app, client, 'ai_admin')
    assert client.get('/api/admin/reports/users.csv', headers=ai).status_code == 403
    ev = client.get('/api/admin/audit?action=report_exported', headers=h).get_json()
    assert ev['total'] >= 7


def test_system_health_reports_presence_never_secret_values(app, client, monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_TOPSECRETVALUE')
    h = super_h(client)
    d = client.get('/api/admin/system/health', headers=h).get_json()
    assert d['database']['status'] == 'ok' and d['credentials']['GROQ_API_KEY'] == 'configured'
    assert d['backups']['status'] == 'unknown'
    blob = str(d)
    assert 'TOPSECRET' not in blob and 'boss@example.com' not in blob


def test_notifications_reflect_real_risks_only(app, client):
    h = super_h(client)
    titles = [n['title'] for n in client.get('/api/admin/notifications', headers=h).get_json()['notifications']]
    assert 'Default admin password still active' not in titles
    make_user(app, 'admin', 'admin@smartagri.sl', 'SmartAgri2024!')
    titles = [n['title'] for n in client.get('/api/admin/notifications', headers=h).get_json()['notifications']]
    assert 'Default admin password still active' in titles


def test_delete_user_super_only_and_never_staff(app, client):
    h = super_h(client)
    fid, _ = make_user(app, 'farmer', 'del@t.example')
    sid, _ = make_user(app, 'support_admin', 'delsup@t.example')
    assert client.delete(f'/api/admin/users/{sid}', headers=h).status_code == 400
    assert client.delete(f'/api/admin/users/{fid}', headers=h).status_code == 200
    with app.app_context():
        assert db.session.get(User, fid) is None


def test_legacy_auth_admin_endpoints_still_work_with_new_rules(app, client):
    h = super_h(client)
    fid, _ = make_user(app, 'farmer', 'leg@t.example')
    assert client.get('/api/auth/admin/stats', headers=h).get_json()['farmers'] == 1
    assert client.post(f'/api/auth/admin/toggle-user/{fid}', headers=h).status_code == 200
    r = client.post('/api/auth/admin/create-admin', headers=h, json={'full_name': 'Ops', 'email': 'ops@t.example', 'password': 'ops-password-1234', 'role': 'ops'})
    assert r.status_code == 400
    r = client.post('/api/auth/admin/create-admin', headers=h, json={'full_name': 'Ops', 'email': 'ops@t.example', 'password': 'ops-password-1234'})
    assert r.status_code == 201 and r.get_json()['user']['role'] == 'operations_admin'
    me = client.get('/api/auth/profile', headers=h).get_json()['user']['id']
    assert client.post(f'/api/auth/admin/toggle-user/{me}', headers=h).status_code == 403
    assert client.post('/api/auth/admin-reset', headers=h, json={'email': 'leg@t.example', 'new_password': 'x' * 9}).status_code == 200


# ── Schema upgrade keeps existing data ────────────────────────────────────
def test_schema_upgrade_adds_columns_and_keeps_existing_rows():
    from sqlalchemy import create_engine, text
    eng = create_engine('sqlite://')
    with eng.begin() as c:
        c.execute(text('CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(120), role VARCHAR(20))'))
        c.execute(text("INSERT INTO users (email, role) VALUES ('old@farm.sl', 'farmer')"))
    class Fake: engine = eng
    added = ensure_schema(Fake)
    assert set(added) == {'users.token_version', 'users.verification_status', 'users.suspended_reason', 'users.suspended_at'}
    with eng.connect() as c:
        row = c.execute(text('SELECT email, role, token_version, verification_status FROM users')).one()
    assert tuple(row) == ('old@farm.sl', 'farmer', 0, 'unverified')
    assert ensure_schema(Fake) == []                     # idempotent
