"""
SmartAgri AI gateway: one place for provider authentication, request construction,
timeouts, controlled retries, error classification, response validation, a small
circuit breaker and usage logging.

Design rules
- Each provider keeps its own request format (Groq = OpenAI-style, Anthropic = Messages API).
- A provider's key is only ever sent to that provider.
- Prompts, images, API keys and responses are NEVER logged or stored; only
  model id, task, outcome, latency, error kind and HTTP status.
- Retries are bounded (default 1) and only for transient errors.
"""
import json
import os
import threading
import time

import requests

GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
ANTHROPIC_VERSION = '2023-06-01'

RETRYABLE = {'rate_limited', 'provider_unavailable', 'timeout', 'network'}

FRIENDLY = {
    'not_configured': 'This AI service is not configured on the server yet.',
    'auth': 'The AI service rejected the server credentials.',
    'rate_limited': 'The AI service is busy right now. Please try again in a minute.',
    'timeout': 'The AI service took too long to respond.',
    'provider_unavailable': 'The AI service is temporarily unavailable.',
    'model_unavailable': 'The AI model is currently unavailable.',
    'bad_request': 'The AI service could not process this request.',
    'invalid_response': 'The AI service returned an unreadable answer.',
    'network': 'Could not reach the AI service.',
    'circuit_open': 'The AI service is recovering from repeated errors. Please try again shortly.',
}


class AIError(Exception):
    def __init__(self, kind, http_status=None):
        super().__init__(kind)
        self.kind = kind
        self.http_status = http_status

    @property
    def message(self):
        return FRIENDLY.get(self.kind, 'AI request failed.')


# ───────────────────────── circuit breaker ─────────────────────────
_BREAKER_THRESHOLD = 5      # consecutive transient failures
_BREAKER_COOLDOWN = 30      # seconds
_breakers = {}
_lock = threading.Lock()


def reset_breakers():
    with _lock:
        _breakers.clear()


def _breaker_open(model_id):
    with _lock:
        b = _breakers.get(model_id)
        return bool(b and b['open_until'] > time.monotonic())


def _breaker_record(model_id, ok, kind=None):
    with _lock:
        b = _breakers.setdefault(model_id, {'fails': 0, 'open_until': 0.0})
        if ok:
            b['fails'] = 0
            b['open_until'] = 0.0
        elif kind in RETRYABLE:
            b['fails'] += 1
            if b['fails'] >= _BREAKER_THRESHOLD:
                b['open_until'] = time.monotonic() + _BREAKER_COOLDOWN


# ───────────────────────── usage logging ─────────────────────────
def record_inference(model_id, provider, task, ok, latency_ms, error_kind=None, http_status=None):
    """Write one usage row in its own transaction. Never raises."""
    try:
        from flask import has_app_context
        if not has_app_context():
            return
        from app import db
        from app.models import AIInferenceLog
        with db.engine.begin() as conn:
            conn.execute(AIInferenceLog.__table__.insert().values(
                model_id=model_id, provider=provider, task=task, success=bool(ok),
                latency_ms=int(latency_ms), error_kind=error_kind, http_status=http_status))
    except Exception:
        pass  # monitoring must never break a farmer's request


def classify_status(status, body_text=''):
    if status in (401, 403):
        return 'auth'
    if status == 404:
        return 'model_unavailable'
    if status == 408:
        return 'timeout'
    if status == 429:
        return 'rate_limited'
    if status >= 500:
        return 'provider_unavailable'
    low = (body_text or '').lower()
    if status in (400, 422):
        if 'decommission' in low or 'not found' in low or 'does not exist' in low:
            return 'model_unavailable'
        return 'bad_request'
    return 'bad_request'


def _post(provider, url, headers, payload, *, model_id, task, timeout, retries):
    attempts = 1 + max(0, retries)
    last = None
    for attempt in range(attempts):
        if _breaker_open(model_id):
            record_inference(model_id, provider, task, False, 0, 'circuit_open')
            raise AIError('circuit_open')
        t0 = time.monotonic()
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        except requests.exceptions.Timeout:
            last = AIError('timeout')
        except requests.exceptions.RequestException:
            last = AIError('network')
        else:
            ms = (time.monotonic() - t0) * 1000
            if resp.status_code == 200:
                try:
                    data = resp.json()
                except ValueError:
                    last = AIError('invalid_response', 200)
                else:
                    record_inference(model_id, provider, task, True, ms)
                    _breaker_record(model_id, True)
                    return data
            else:
                last = AIError(classify_status(resp.status_code, resp.text[:300]), resp.status_code)
                if last.kind == 'rate_limited' and attempt + 1 < attempts:
                    try:
                        time.sleep(min(float(resp.headers.get('retry-after', 2)), 4))
                    except ValueError:
                        time.sleep(2)
                    record_inference(model_id, provider, task, False, ms, last.kind, last.http_status)
                    _breaker_record(model_id, False, last.kind)
                    continue
            ms = (time.monotonic() - t0) * 1000
        ms = (time.monotonic() - t0) * 1000
        record_inference(model_id, provider, task, False, ms, last.kind, last.http_status)
        _breaker_record(model_id, False, last.kind)
        if last.kind not in RETRYABLE or attempt + 1 >= attempts:
            raise last
        time.sleep(1.0)
    raise last


# ───────────────────────── providers ─────────────────────────
def groq_chat(model, messages, *, task, max_tokens=800, temperature=0.1, timeout=30,
              json_mode=False, extra=None, retries=1):
    """Returns the assistant text. Raises AIError."""
    key = os.environ.get('GROQ_API_KEY', '')
    if not key:
        record_inference(model, 'groq', task, False, 0, 'not_configured')
        raise AIError('not_configured')
    payload = {'model': model, 'messages': messages,
               'max_tokens': max_tokens, 'temperature': temperature}
    if json_mode:
        payload['response_format'] = {'type': 'json_object'}
    if extra:
        payload.update(extra)
    data = _post('groq', GROQ_URL,
                 {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
                 payload, model_id=model, task=task, timeout=timeout, retries=retries)
    try:
        text = data['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError):
        raise AIError('invalid_response', 200)
    if not isinstance(text, str) or not text.strip():
        raise AIError('invalid_response', 200)
    return text.strip()


def anthropic_message(model, messages, *, task, max_tokens=300, timeout=40, retries=1):
    """Returns the assistant text from the Anthropic Messages API. Raises AIError."""
    key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not key:
        record_inference(model, 'anthropic', task, False, 0, 'not_configured')
        raise AIError('not_configured')
    data = _post('anthropic', ANTHROPIC_URL,
                 {'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION,
                  'content-type': 'application/json'},
                 {'model': model, 'max_tokens': max_tokens, 'messages': messages},
                 model_id=model, task=task, timeout=timeout, retries=retries)
    try:
        text = data['content'][0]['text']
    except (KeyError, IndexError, TypeError):
        raise AIError('invalid_response', 200)
    if not isinstance(text, str) or not text.strip():
        raise AIError('invalid_response', 200)
    return text.strip()


# ───────────────────────── helpers ─────────────────────────
def parse_json_object(text):
    """Extract the first JSON object from model text (handles ``` fences)."""
    raw = text.strip()
    if '```' in raw:
        for part in raw.split('```'):
            part = part.strip()
            if part.startswith('json'):
                part = part[4:].strip()
            if part.startswith('{'):
                raw = part
                break
    start, end = raw.find('{'), raw.rfind('}') + 1
    if start < 0 or end <= start:
        raise AIError('invalid_response')
    try:
        obj = json.loads(raw[start:end])
    except ValueError:
        raise AIError('invalid_response')
    if not isinstance(obj, dict):
        raise AIError('invalid_response')
    return obj


DEFAULT_TEXT_MODEL = 'llama-3.3-70b-versatile'
ADVISOR_SYSTEM = ('You are an expert Sierra Leone agricultural advisor. Always respond with valid '
                  'JSON only. No markdown, no explanation outside JSON.')


def groq_json(prompt, *, task, max_tokens=800, timeout=45, system=ADVISOR_SYSTEM,
              model=DEFAULT_TEXT_MODEL, retries=1):
    """Compatibility helper: returns (dict|None, error_message|None)."""
    try:
        text = groq_chat(model, [{'role': 'system', 'content': system},
                                 {'role': 'user', 'content': prompt}],
                         task=task, max_tokens=max_tokens, timeout=timeout,
                         json_mode=True, retries=retries)
        return parse_json_object(text), None
    except AIError as e:
        return None, e.message


def normalise_disease_result(result):
    """Clamp/validate a vision model's JSON so the UI never receives junk types."""
    out = dict(result)
    try:
        c = float(out.get('confidence', 0))
    except (TypeError, ValueError):
        c = 0
    out['confidence'] = max(0, min(100, round(c, 1)))
    for k in ('causes', 'treatment', 'biological_treatment', 'prevention'):
        v = out.get(k)
        out[k] = [str(x) for x in v][:8] if isinstance(v, list) else []
    sev = str(out.get('severity', 'none')).lower()
    out['severity'] = sev if sev in ('none', 'low', 'medium', 'high') else 'none'
    out['is_healthy'] = bool(out.get('is_healthy', False))
    out['disease_name'] = str(out.get('disease_name') or 'Unknown')[:120]
    return out
