import io, json, pytest
from PIL import Image
from conftest import auth_header, admin_header
from helpers import FakeResp, groq_ok, img_bytes, VISION_JSON
import app.services.ai_gateway as gw
from app.services import model_registry
from app.services.images import process_image, ImageRejected

# ── Preservation checklist: NOTHING may be removed from this list ──────────────
PRESERVED_IDENTIFIERS = {
    'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
    'claude-haiku-4-5-20251001',
    'linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification',
    'google/vit-base-patch16-224', 'Einmalumdiewelt/PantagruelGPT_large',
    'soil-colour-classifier', 'crop-scoring+harvest-prediction', 'fertilizer-rules',
    'land-suitability-tables', 'pest-risk-rules', 'openweathermap-2.5', 'field-health+carbon-calcs',
    'disease-knowledge-base',
}


def test_every_preserved_model_is_in_registry():
    have = {e['identifier'] for e in model_registry.REGISTRY}
    assert PRESERVED_IDENTIFIERS <= have, PRESERVED_IDENTIFIERS - have


def test_chatbot_fallback_chain_and_vision_default_preserved():
    assert model_registry.CHATBOT_MODEL_CHAIN == ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile']
    from app.routes.chatbot import GROQ_MODELS
    assert GROQ_MODELS == model_registry.CHATBOT_MODEL_CHAIN
    assert model_registry.vision_models() == ['qwen/qwen3.8-27b']


def test_huggingface_service_and_knowledge_base_still_present():
    from app.services import huggingface as hf
    assert 'Tomato___Late_blight' in hf.DISEASE_KNOWLEDGE_BASE and callable(hf.call_huggingface_image)


def test_registry_public_view_never_exposes_secrets(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_SUPERSECRET')
    blob = json.dumps([model_registry.public_view(e) for e in model_registry.REGISTRY])
    assert 'SUPERSECRET' not in blob and 'env_key' not in blob


# ── Gateway ────────────────────────────────────────────────────────────────────
@pytest.fixture()
def net(monkeypatch):
    calls = []
    state = {'handler': lambda url, headers, json, timeout: groq_ok('{"a":1}')}
    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append((url, headers, json))
        return state['handler'](url, headers, json, timeout)
    monkeypatch.setattr(gw.requests, 'post', fake_post)
    monkeypatch.setattr(gw.time, 'sleep', lambda s: None)
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_test'); monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-test')
    return type('Net', (), {'calls': calls, 'state': state})


def test_not_configured(monkeypatch):
    monkeypatch.delenv('GROQ_API_KEY', raising=False)
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m', [], task='t')
    assert e.value.kind == 'not_configured'


def test_provider_keys_never_cross(net):
    gw.groq_chat('llama-3.3-70b-versatile', [{'role': 'user', 'content': 'hi'}], task='t')
    net.state['handler'] = lambda *a: FakeResp(200, {'content': [{'text': 'ok'}]})
    gw.anthropic_message('claude-haiku-4-5-20251001', [{'role': 'user', 'content': 'hi'}], task='t')
    (u1, h1, _), (u2, h2, _) = net.calls
    assert 'groq.com' in u1 and h1['Authorization'] == 'Bearer gsk_test' and 'x-api-key' not in h1
    assert 'anthropic.com' in u2 and h2['x-api-key'] == 'sk-ant-test' and 'Authorization' not in h2


@pytest.mark.parametrize('status,kind', [(401, 'auth'), (403, 'auth'), (404, 'model_unavailable'),
                                          (400, 'bad_request'), (429, 'rate_limited'), (503, 'provider_unavailable')])
def test_error_classification(net, status, kind):
    net.state['handler'] = lambda *a: FakeResp(status, {'error': 'x'}, text='x')
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m', [], task='t', retries=0)
    assert e.value.kind == kind


def test_decommissioned_model_detected(net):
    net.state['handler'] = lambda *a: FakeResp(400, {}, text='model has been decommissioned')
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m', [], task='t', retries=0)
    assert e.value.kind == 'model_unavailable'


def test_auth_error_is_not_retried(net):
    net.state['handler'] = lambda *a: FakeResp(401, {}, text='no')
    with pytest.raises(gw.AIError):
        gw.groq_chat('m', [], task='t', retries=3)
    assert len(net.calls) == 1


def test_rate_limit_retried_once_then_succeeds(net):
    seq = iter([FakeResp(429, {}, headers={'retry-after': '1'}), groq_ok('{"ok":true}')])
    net.state['handler'] = lambda *a: next(seq)
    assert gw.groq_chat('m', [], task='t', retries=1) == '{"ok":true}'
    assert len(net.calls) == 2


def test_retries_are_bounded(net):
    net.state['handler'] = lambda *a: FakeResp(503, {}, text='down')
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m', [], task='t', retries=1)
    assert e.value.kind == 'provider_unavailable' and len(net.calls) == 2


def test_timeout_and_network_errors(net):
    def boom(*a):
        raise gw.requests.exceptions.Timeout()
    net.state['handler'] = boom
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m', [], task='t', retries=0)
    assert e.value.kind == 'timeout'
    def boom2(*a):
        raise gw.requests.exceptions.ConnectionError()
    net.state['handler'] = boom2
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m2', [], task='t', retries=0)
    assert e.value.kind == 'network'


@pytest.mark.parametrize('body', [{}, {'choices': []}, {'choices': [{'message': {'content': ''}}]}, {'choices': [{'message': {}}]}])
def test_invalid_response_shapes(net, body):
    net.state['handler'] = lambda *a: FakeResp(200, body)
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m', [], task='t', retries=0)
    assert e.value.kind == 'invalid_response'


def test_non_json_200_body(net):
    net.state['handler'] = lambda *a: FakeResp(200, None, text='<html>')
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('m', [], task='t', retries=0)
    assert e.value.kind == 'invalid_response'


def test_circuit_breaker_opens_and_stops_hammering(net):
    net.state['handler'] = lambda *a: FakeResp(503, {}, text='down')
    for _ in range(5):
        with pytest.raises(gw.AIError):
            gw.groq_chat('flaky', [], task='t', retries=0)
    n = len(net.calls)
    with pytest.raises(gw.AIError) as e:
        gw.groq_chat('flaky', [], task='t', retries=0)
    assert e.value.kind == 'circuit_open' and len(net.calls) == n


def test_parse_json_object_variants():
    assert gw.parse_json_object('```json\n{"a": 1}\n```') == {'a': 1}
    assert gw.parse_json_object('Sure! {"a": 2} hope that helps') == {'a': 2}
    for bad in ('no json', '{broken', '[1,2]'):
        with pytest.raises(gw.AIError):
            gw.parse_json_object(bad)


def test_normalise_disease_result_clamps_junk():
    r = gw.normalise_disease_result({'confidence': '999', 'treatment': 'x', 'severity': 'banana', 'is_healthy': 1})
    assert r['confidence'] == 100 and r['treatment'] == [] and r['severity'] == 'none' and r['is_healthy'] is True


def test_inference_is_logged_without_prompt_or_key(app, net):
    from app.models import AIInferenceLog
    with app.app_context():
        gw.groq_chat('llama-3.3-70b-versatile', [{'role': 'user', 'content': 'SECRET FARM DATA'}], task='chatbot')
        row = AIInferenceLog.query.one()
        assert row.success and row.task == 'chatbot' and row.latency_ms >= 0
        assert 'SECRET' not in repr(row.__dict__) and 'gsk_test' not in repr(row.__dict__)


# ── Image processing ───────────────────────────────────────────────────────────
def test_good_jpeg_passes_without_warnings():
    p = process_image(img_bytes())
    assert p.content_type == 'image/jpeg' and p.original_ext == 'jpg' and p.warnings == []


def test_png_rgba_and_webp_accepted():
    assert process_image(img_bytes('PNG', mode='RGBA')).original_ext == 'png'
    assert process_image(img_bytes('WEBP')).original_ext == 'webp'


def test_exif_orientation_is_corrected():
    im = Image.effect_noise((600, 300), 70).convert('RGB')
    exif = Image.Exif(); exif[0x0112] = 6            # rotate 90 CW
    buf = io.BytesIO(); im.save(buf, 'JPEG', exif=exif)
    p = process_image(buf.getvalue())
    assert (p.width, p.height) == (300, 600)


def test_large_image_downscaled_original_kept():
    raw = img_bytes(size=(3200, 2400))
    p = process_image(raw)
    assert max(p.width, p.height) == 1600 and p.original_bytes == raw and p.original_width == 3200


@pytest.mark.parametrize('raw,code', [
    (b'', 'empty_file'), (b'not an image at all', 'not_an_image'),
    (b'<?php echo 1; ?>', 'not_an_image'), (img_bytes('GIF', size=(200, 200)), 'unsupported_format'),
    (img_bytes(size=(30, 30)), 'too_small'),
])
def test_rejections_have_reasons(raw, code):
    with pytest.raises(ImageRejected) as e:
        process_image(raw)
    assert e.value.code == code and e.value.message


def test_truncated_jpeg_rejected():
    raw = img_bytes()
    with pytest.raises(ImageRejected):
        process_image(raw[:len(raw) // 3])


def test_too_large_upload_rejected():
    with pytest.raises(ImageRejected) as e:
        process_image(b'0' * 100, max_bytes=50)
    assert e.value.code == 'too_large'


def test_quality_warnings_are_warnings_not_rejections():
    dark = process_image(img_bytes(noisy=False, color=(8, 8, 8)))
    assert {'too_dark', 'blurry'} <= {w['code'] for w in dark.warnings}
    bright = process_image(img_bytes(noisy=False, color=(252, 252, 252)))
    assert 'overexposed' in {w['code'] for w in bright.warnings}
    small = process_image(img_bytes(size=(200, 200)))
    assert 'low_resolution' in {w['code'] for w in small.warnings}
    assert all(w['message'] for w in dark.warnings)


# ── Disease endpoints (full path, provider HTTP mocked) ────────────────────────
def _post_img(client, url, headers=None, plant='cassava', raw=None, name='leaf.jpg'):
    return client.post(url, headers=headers or {}, content_type='multipart/form-data',
                       data={'image': (io.BytesIO(raw or img_bytes()), name), 'plant_type': plant})


def _vision_handler(vision_ok=True, text_ok=True):
    def h(url, headers, payload, timeout):
        if payload['model'] == 'qwen/qwen3.8-27b':
            return groq_ok(VISION_JSON) if vision_ok else FakeResp(503, {}, text='down')
        if payload['model'] == 'openai/gpt-oss-120b':
            return groq_ok('{"common_problems":[{"name":"Mosaic","signs":"yellow patches"}],"treatment":["rogue plants"],"prevention":["clean cuttings"]}') if text_ok else FakeResp(503, {}, text='down')
        return FakeResp(400, {}, text='unknown')
    return h


def test_detect_requires_login(client):
    assert _post_img(client, '/api/disease/detect').status_code == 401


def test_detect_real_vision_result_is_saved(app, client, net):
    net.state['handler'] = _vision_handler()
    r = _post_img(client, '/api/disease/detect', auth_header(client))
    d = r.get_json()
    assert r.status_code == 200 and d['image_analyzed'] is True and d['disease_name'] == 'Cassava Mosaic'
    assert d['saved'] is True and d['confidence'] == 88
    from app.models import DiseaseAnalysis
    with app.app_context():
        assert DiseaseAnalysis.query.count() == 1


def test_vision_failure_returns_labelled_guidance_not_a_diagnosis(app, client, net):
    net.state['handler'] = _vision_handler(vision_ok=False)
    r = _post_img(client, '/api/disease/detect', auth_header(client))
    d = r.get_json()
    assert r.status_code == 200
    assert d['image_analyzed'] is False and d['analysis_type'] == 'general_guidance'
    assert d['confidence'] == 0 and d['saved'] is False
    assert 'NOT a diagnosis' in d['quality_message'] and d['disease_name'].startswith('No diagnosis')
    assert d['general_guidance']['common_problems'][0]['name'] == 'Mosaic'
    from app.models import DiseaseAnalysis
    with app.app_context():
        assert DiseaseAnalysis.query.count() == 0       # never stored as a diagnosis


def test_total_failure_is_honest_and_hides_config_details(client, net):
    net.state['handler'] = _vision_handler(vision_ok=False, text_ok=False)
    r = _post_img(client, '/api/disease/detect', auth_header(client))
    d = r.get_json()
    assert r.status_code == 503 and d['image_analyzed'] is False and 'analys' in d['error'].lower()


def test_missing_key_message_does_not_leak_env_names(client, monkeypatch):
    monkeypatch.delenv('GROQ_API_KEY', raising=False)
    r = _post_img(client, '/api/disease/detect', auth_header(client))
    assert r.status_code == 503 and 'GROQ' not in r.get_data(as_text=True) and 'Render' not in r.get_data(as_text=True)


def test_text_fallback_needs_plant_type(client, net):
    net.state['handler'] = _vision_handler(vision_ok=False)
    r = _post_img(client, '/api/disease/detect', auth_header(client), plant='')
    assert r.status_code == 503      # no plant -> no guidance, honest failure


def test_invalid_uploads_rejected_with_reason(client, net):
    h = auth_header(client)
    r = _post_img(client, '/api/disease/detect', h, raw=b'<?php system($_GET[1]); ?>', name='shell.php.jpg')
    assert r.status_code == 400 and r.get_json()['error_code'] == 'not_an_image'
    r = client.post('/api/disease/detect', headers=h, data={'plant_type': 'x'})
    assert r.status_code == 400
    assert not net.calls                                  # AI never called for bad files


def test_stored_extension_comes_from_content_not_filename(app, client, net):
    import os
    net.state['handler'] = _vision_handler()
    _post_img(client, '/api/disease/detect', auth_header(client), name='evil.php')
    from app.routes.disease import get_upload_path
    files = os.listdir(get_upload_path())
    assert files and all(f.endswith('.jpg') for f in files[-1:])


def test_quality_warnings_returned_with_result(client, net):
    net.state['handler'] = _vision_handler()
    r = _post_img(client, '/api/disease/detect', auth_header(client), raw=img_bytes(noisy=False, color=(8, 8, 8)))
    codes = {w['code'] for w in r.get_json()['image_warnings']}
    assert r.status_code == 200 and 'too_dark' in codes


def test_public_detect_partial_result_and_rate_limit(client, net):
    net.state['handler'] = _vision_handler()
    for _ in range(3):
        r = _post_img(client, '/api/disease/public-detect')
        assert r.status_code == 200 and r.get_json()['full_results_locked'] is True
        assert len(r.get_json()['treatment']) <= 1
    r = _post_img(client, '/api/disease/public-detect')
    assert r.status_code == 429 and r.headers['Retry-After']


def test_public_detect_failure_is_labelled(client, net):
    net.state['handler'] = _vision_handler(vision_ok=False)
    d = _post_img(client, '/api/disease/public-detect').get_json()
    assert d['image_analyzed'] is False and d['confidence'] == 0 and d['treatment'] == []


# ── Other image routes ─────────────────────────────────────────────────────────
def test_soil_upload_uses_decoded_pixels_and_labels_estimate(client):
    h = auth_header(client)
    raw = img_bytes(noisy=False, color=(92, 64, 51))        # dark brown
    r = client.post('/api/soil/analyse', headers=h, content_type='multipart/form-data',
                    data={'image': (io.BytesIO(raw), 's.jpg'), 'input_method': 'image'})
    d = r.get_json()
    assert r.status_code == 200 and d['soil_type'] and d['is_laboratory_result'] is False
    assert d['nutrients_are_estimates'] is True and d['assessment_type'] == 'image_estimate'


def test_soil_rejects_non_image(client):
    r = client.post('/api/soil/analyse', headers=auth_header(client), content_type='multipart/form-data',
                    data={'image': (io.BytesIO(b'hello'), 's.jpg')})
    assert r.status_code == 400


def test_progress_photo_uses_anthropic_and_flags_failure(client, net, monkeypatch):
    h = auth_header(client)
    t = client.post('/api/disease-progress/tracks', headers=h, json={'plant_label': 'My cassava', 'plant_type': 'cassava'})
    tid = (t.get_json().get('track') or t.get_json())['id']
    net.state['handler'] = lambda *a: FakeResp(200, {'content': [{'text': '{"disease_name":"Healthy","is_healthy":true,"confidence":90,"status":"healthy","observation":"ok"}'}]})
    r = client.post(f'/api/disease-progress/tracks/{tid}/photo', headers=h, content_type='multipart/form-data',
                    data={'image': (io.BytesIO(img_bytes()), 'p.jpg')})
    assert r.status_code in (200, 201) and 'anthropic.com' in net.calls[-1][0]
    net.state['handler'] = lambda *a: FakeResp(503, {}, text='down')
    r = client.post(f'/api/disease-progress/tracks/{tid}/photo', headers=h, content_type='multipart/form-data',
                    data={'image': (io.BytesIO(img_bytes()), 'p.jpg')})
    assert 'NOT a diagnosis' in json.dumps(r.get_json())


# ── Chatbot chain & other text models ──────────────────────────────────────────
def test_chatbot_falls_back_through_preserved_chain(client, net):
    tried = []
    def h(url, headers, payload, timeout):
        tried.append(payload['model'])
        return FakeResp(503, {}, text='down') if len(tried) == 1 else groq_ok('Plant cassava in May.')
    net.state['handler'] = h
    r = client.post('/api/chatbot/message', headers=auth_header(client), json={'message': 'When to plant cassava?', 'language': 'en'})
    assert r.status_code == 200 and tried[:2] == ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']


def test_text_model_routes_use_gateway(client, net):
    net.state['handler'] = lambda *a: groq_ok('{"summary":"ok"}')
    h = auth_header(client)
    r = client.post('/api/crop-compare/compare', headers=h, json={'crops': ['rice', 'cassava'], 'district': 'Bo'})
    assert r.status_code in (200, 400) and (net.calls or r.status_code == 400)


# ── Rate limiting on auth ──────────────────────────────────────────────────────
def test_login_is_rate_limited(client):
    for _ in range(10):
        client.post('/api/auth/login', json={'email': 'x@y.com', 'password': 'bad'})
    assert client.post('/api/auth/login', json={'email': 'x@y.com', 'password': 'bad'}).status_code == 429


# ── Admin AI monitoring ────────────────────────────────────────────────────────
def test_admin_ai_endpoints_permissions(client):
    assert client.get('/api/admin/ai/models').status_code == 401
    assert client.get('/api/admin/ai/models', headers=auth_header(client)).status_code == 403
    assert client.post('/api/admin/ai/probe/groq-vision-disease', headers=auth_header(client)).status_code == 403


def test_admin_ai_models_lists_all_and_reports_honest_health(app, client, net, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    h = admin_header(client)
    d = client.get('/api/admin/ai/models', headers=h).get_json()
    ids = {m['id'] for m in d['models']}
    assert ids == {e['id'] for e in model_registry.REGISTRY}
    byid = {m['id']: m for m in d['models']}
    assert byid['anthropic-haiku-progress']['health'] == 'awaiting_credentials'
    assert byid['groq-llama-70b']['health'] == 'untested'           # key set, no calls: NOT 'healthy'
    assert byid['hf-vit-base']['health'] == 'not_connected'
    assert 'GROQ_API_KEY' not in json.dumps(d) and 'gsk_test' not in json.dumps(d)
    net.state['handler'] = lambda *a: groq_ok('hello')
    with app.app_context():
        gw.groq_chat('llama-3.3-70b-versatile', [], task='chatbot')
    d = client.get('/api/admin/ai/models', headers=h).get_json()
    m = {x['id']: x for x in d['models']}['groq-llama-70b']
    assert m['health'] == 'healthy' and m['stats']['requests'] == 1 and m['stats']['success_rate'] == 100.0


def test_admin_probe_reports_failures_truthfully(client, net):
    h = admin_header(client)
    net.state['handler'] = lambda *a: FakeResp(404, {}, text='model not found')
    d = client.post('/api/admin/ai/probe/groq-vision-disease', headers=h).get_json()
    assert d['ok'] is False and d['error_kind'] == 'model_unavailable'
    net.state['handler'] = lambda *a: groq_ok('green')
    assert client.post('/api/admin/ai/probe/groq-vision-disease', headers=h).get_json()['ok'] is True
    assert client.post('/api/admin/ai/probe/engine-soil-colour', headers=h).status_code == 404
