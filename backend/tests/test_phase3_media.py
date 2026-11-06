import io, os, time
import pytest
from conftest import auth_header, admin_header
from helpers import img_bytes, groq_ok, VISION_JSON, FakeResp
import app.services.ai_gateway as gw


@pytest.fixture()
def net(monkeypatch):
    def fake(url, headers=None, json=None, timeout=None):
        return groq_ok(VISION_JSON)
    monkeypatch.setattr(gw.requests, 'post', fake)
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')


def _scan(client, h):
    r = client.post('/api/disease/detect', headers=h, content_type='multipart/form-data',
                    data={'image': (io.BytesIO(img_bytes()), 'leaf.jpg'), 'plant_type': 'cassava'})
    assert r.status_code == 200
    return r.get_json()['id']


def test_owner_can_fetch_private_photo_with_safe_headers(client, net):
    h = auth_header(client)
    rid = _scan(client, h)
    r = client.get(f'/api/media/disease/{rid}', headers=h)
    assert r.status_code == 200 and r.mimetype == 'image/jpeg' and r.data[:2] == b'\xff\xd8'
    assert 'no-store' in r.headers['Cache-Control'] and r.headers['X-Content-Type-Options'] == 'nosniff'


def test_photo_requires_login_and_hides_from_other_users(client, net):
    h1 = auth_header(client, 'a@example.com')
    rid = _scan(client, h1)
    assert client.get(f'/api/media/disease/{rid}').status_code == 401
    h2 = auth_header(client, 'b@example.com')
    assert client.get(f'/api/media/disease/{rid}', headers=h2).status_code == 404   # no existence leak
    assert client.delete(f'/api/media/disease/{rid}', headers=h2).status_code == 404
    assert client.get(f'/api/media/disease/{rid}', headers=admin_header(client)).status_code == 200


def test_api_never_exposes_server_file_paths(client, net):
    h = auth_header(client)
    rid = _scan(client, h)
    items = client.get('/api/disease/history', headers=h).get_json()
    blob = str(items)
    assert 'image_path' not in blob and '/uploads/' not in blob and 'backend' not in blob
    first = (items.get('analyses') or items.get('history') or items)[0] if not isinstance(items, list) else items[0]
    assert first['has_image'] is True and first['image_url'] == f'/api/media/disease/{rid}'


def test_path_traversal_through_tampered_db_value_is_blocked(app, client, net):
    from app import db
    from app.models import DiseaseAnalysis
    h = auth_header(client)
    rid = _scan(client, h)
    with app.app_context():
        a = db.session.get(DiseaseAnalysis, rid)
        for evil in ('../../config.py', '/etc/passwd', '..\\..\\config.py', '/tmp/../etc/passwd'):
            a.image_path = evil
            db.session.commit()
            assert client.get(f'/api/media/disease/{rid}', headers=h).status_code == 404


def test_non_image_extension_never_served(app, client, net):
    from app import db
    from app.models import DiseaseAnalysis
    from app.routes.media import UPLOAD_ROOT
    h = auth_header(client)
    rid = _scan(client, h)
    p = os.path.join(UPLOAD_ROOT, 'disease', 'secret.txt')
    open(p, 'w').write('x')
    with app.app_context():
        db.session.get(DiseaseAnalysis, rid).image_path = p
        db.session.commit()
    assert client.get(f'/api/media/disease/{rid}', headers=h).status_code == 404
    os.remove(p)


def test_user_can_delete_photo_but_keeps_record(app, client, net):
    from app.routes.media import UPLOAD_ROOT, resolve_upload
    from app.models import DiseaseAnalysis
    h = auth_header(client)
    rid = _scan(client, h)
    with app.app_context():
        path = resolve_upload('disease', DiseaseAnalysis.query.get(rid).image_path)
    assert os.path.isfile(path)
    assert client.delete(f'/api/media/disease/{rid}', headers=h).status_code == 200
    assert not os.path.exists(path)
    assert client.get(f'/api/media/disease/{rid}', headers=h).status_code == 404
    with app.app_context():
        assert DiseaseAnalysis.query.get(rid) is not None


def test_soil_photo_private_access(client):
    h = auth_header(client)
    r = client.post('/api/soil/analyse', headers=h, content_type='multipart/form-data',
                    data={'image': (io.BytesIO(img_bytes(noisy=False, color=(92, 64, 51))), 's.jpg'), 'input_method': 'image'})
    sid = r.get_json().get('id')
    assert sid and client.get(f'/api/media/soil/{sid}', headers=h).status_code == 200
    assert client.get(f'/api/media/soil/{sid}').status_code == 401
    assert client.get(f'/api/media/soil/{sid}', headers=auth_header(client, 'o@example.com')).status_code == 404


def test_progress_photo_access_and_delete(client, monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'k')
    monkeypatch.setattr(gw.requests, 'post', lambda *a, **k: FakeResp(200, {'content': [{'text': '{"disease_name":"Healthy","is_healthy":true,"confidence":90,"status":"healthy","observation":"ok"}'}]}))
    h = auth_header(client)
    t = client.post('/api/disease-progress/tracks', headers=h, json={'plant_label': 'Cassava A'}).get_json()
    tid = t.get('id') or t['track']['id']
    client.post(f'/api/disease-progress/tracks/{tid}/photo', headers=h, content_type='multipart/form-data',
                data={'image': (io.BytesIO(img_bytes()), 'p.jpg')})
    tracks = client.get('/api/disease-progress/tracks', headers=h).get_json()['tracks']
    e = tracks[0]['entries'][0]
    assert e['has_image'] and e['image_url'] == f'/api/media/progress/{tid}/0' and 'image_path' not in e
    assert client.get(e['image_url'], headers=h).status_code == 200
    assert client.get(e['image_url'], headers=auth_header(client, 'z@example.com')).status_code == 404
    assert client.delete(e['image_url'], headers=h).status_code == 200
    assert client.get(e['image_url'], headers=h).status_code == 404


def test_oversized_request_gets_json_413(app, client, net):
    app.config['MAX_CONTENT_LENGTH'] = 1024
    r = client.post('/api/disease/public-detect', content_type='multipart/form-data',
                    data={'image': (io.BytesIO(b'0' * 5000), 'x.jpg')})
    assert r.status_code == 413 and r.get_json()['error_code'] == 'too_large'


def test_purge_images_command_honours_retention(app, monkeypatch):
    from app.routes.media import UPLOAD_ROOT
    d = os.path.join(UPLOAD_ROOT, 'disease'); os.makedirs(d, exist_ok=True)
    old, new = os.path.join(d, 'old_purge_test.jpg'), os.path.join(d, 'new_purge_test.jpg')
    for f in (old, new):
        open(f, 'wb').write(b'x')
    t = time.time() - 400 * 86400
    os.utime(old, (t, t))
    monkeypatch.setenv('IMAGE_RETENTION_DAYS', '365')
    res = app.test_cli_runner().invoke(args=['purge-images'])
    assert 'Removed 1 photo' in res.output and not os.path.exists(old) and os.path.exists(new)
    os.remove(new)
