"""Audit trail + security events. Written in their own transaction so failures and denials are kept."""
from flask import has_request_context

_SECRET_WORDS = ('password', 'token', 'secret', 'key', 'authorization')


def _scrub(obj):
    if isinstance(obj, dict):
        return {k: ('[redacted]' if any(w in str(k).lower() for w in _SECRET_WORDS) else _scrub(v))
                for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_scrub(v) for v in obj][:50]
    if isinstance(obj, str):
        return obj[:300]
    return obj


def audit(action, *, category='admin', outcome='success', actor=None, target_type=None,
          target_id=None, details=None, actor_email=None):
    """Never raises: auditing must not break the request (failures are logged)."""
    try:
        from flask import current_app, has_app_context
        if not has_app_context():
            return
        from app import db
        from app.models import AuditLog
        from app.services.ratelimit import client_ip
        ip = client_ip() if has_request_context() else None
        with db.engine.begin() as conn:
            conn.execute(AuditLog.__table__.insert().values(
                category=category, action=action[:60], outcome=outcome,
                actor_id=getattr(actor, 'id', None),
                actor_email=(getattr(actor, 'email', None) or actor_email),
                actor_role=getattr(actor, 'role', None),
                target_type=target_type, target_id=str(target_id) if target_id is not None else None,
                details=_scrub(details) if details else None, ip=ip))
    except Exception:
        try:
            current_app.logger.error('Audit write failed for action %s', action)
        except Exception:
            pass
