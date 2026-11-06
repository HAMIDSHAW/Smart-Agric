"""
Small in-memory sliding-window rate limiter.

Limitations (documented): counters live in one process. Render runs a single gunicorn
worker here, so this is effective; with several workers/instances use Redis instead.
Client IP = right-most X-Forwarded-For entry (the address the trusted proxy saw).
"""
import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import jsonify, request

_hits = defaultdict(deque)
_lock = threading.Lock()


def reset_limits():
    with _lock:
        _hits.clear()


def client_ip():
    xff = request.headers.get('X-Forwarded-For', '')
    if xff:
        return xff.split(',')[-1].strip()
    return request.remote_addr or 'unknown'


def check(bucket, key, limit, window):
    now = time.monotonic()
    with _lock:
        q = _hits[(bucket, key)]
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return max(1, int(window - (now - q[0])))
        q.append(now)
        return 0


def rate_limit(bucket, limit, window, per='ip'):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            key = client_ip()
            if per == 'user':
                try:
                    from flask_jwt_extended import get_jwt_identity
                    key = f'u{get_jwt_identity()}' or key
                except Exception:
                    pass
            wait = check(bucket, key, limit, window)
            if wait:
                resp = jsonify({'error': 'Too many requests. Please wait and try again.', 'retry_after': wait})
                resp.status_code = 429
                resp.headers['Retry-After'] = str(wait)
                return resp
            return fn(*a, **kw)
        return wrapper
    return deco
