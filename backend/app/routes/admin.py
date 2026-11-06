"""
Admin API (mounted at /api/admin). EVERY endpoint is protected on the server by a permission
check against the database (see services/rbac.py); hiding buttons in the UI is cosmetic only.
Sensitive actions are written to the append-only audit log.
"""
import csv
import io
import os
import shutil
import time
from datetime import datetime, timedelta

from flask import Blueprint, Response, jsonify, request
from sqlalchemy import func

from app import bcrypt, db
from app.models import (AIInferenceLog, AuditLog, ChatMessage, CropRecommendation, DiseaseAnalysis,
                        Feedback, FertilizerPlan, LandAssessment, SoilAnalysis, User, UserPermission)
from app.services import ai_gateway, model_registry
from app.services.audit import audit
from app.services.ratelimit import rate_limit
from app.services.rbac import (ADMIN_ROLES, ALL_ROLES, CUSTOMER_ROLES, PERMISSIONS, ROLE_PERMISSIONS,
                               STAFF_ROLES, can_modify_target, count_active_super_admins, current_user,
                               effective_permissions, require_permission, role_change_allowed)

admin_bp = Blueprint('admin', __name__)

PLATFORM_NOTE = ('These figures describe platform activity (accounts, requests, analyses). '
                 'They are not measured agricultural impact such as yield or crop-loss change.')


def _page_args(default=20, maximum=100):
    page = max(request.args.get('page', 1, type=int), 1)
    per = min(max(request.args.get('per_page', default, type=int), 1), maximum)
    return page, per


def _days(default=30, maximum=365):
    return min(max(request.args.get('days', default, type=int), 1), maximum)


def _json():
    return request.get_json(silent=True) or {}


def _csv_response(filename, header, rows):
    """CSV download. Cells starting with = + - @ are prefixed so spreadsheets never run them."""
    def safe(v):
        v = '' if v is None else str(v)
        return "'" + v if v[:1] in ('=', '+', '-', '@') else v
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([safe(c) for c in r])
    return Response(buf.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': f'attachment; filename={filename}',
                             'Cache-Control': 'no-store'})


# ─── DASHBOARD ───────────────────────────────────────────────

def _market_stats():
    from app.routes.marketplace_admin import marketplace_stats
    return marketplace_stats()


@admin_bp.route('/dashboard', methods=['GET'])
@require_permission('reports.view', 'users.view', any_of=True)
def admin_dashboard():
    days = _days(30, 180)
    since = datetime.utcnow() - timedelta(days=days)

    by_role = dict(db.session.query(User.role, func.count(User.id)).group_by(User.role).all())
    total_users = sum(by_role.values())
    staff = sum(n for r, n in by_role.items() if r in ADMIN_ROLES)
    active = User.query.filter_by(is_active=True).count()
    pending_verification = User.query.filter_by(verification_status='pending').count()

    # registrations per day (filled so charts have no gaps)
    # str(): PostgreSQL returns date objects here, SQLite returns strings.
    reg = {str(k): v for k, v in db.session.query(func.date(User.created_at), func.count(User.id))
           .filter(User.created_at >= since).group_by(func.date(User.created_at)).all()}
    series = []
    for i in range(days, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).date().isoformat()
        series.append({'date': d, 'count': int(reg.get(d, 0))})

    districts = [{'district': d or 'Unknown', 'users': n} for d, n in
                 db.session.query(User.district, func.count(User.id)).group_by(User.district)
                 .order_by(func.count(User.id).desc()).limit(20).all()]

    ai_q = db.session.query(func.count(AIInferenceLog.id),
                            func.sum(db.case((AIInferenceLog.success.is_(True), 1), else_=0)),
                            func.avg(AIInferenceLog.latency_ms)).filter(AIInferenceLog.created_at >= since).one()
    ai_total, ai_ok = int(ai_q[0] or 0), int(ai_q[1] or 0)

    top_diseases = [{'disease': n, 'count': c} for n, c in
                    db.session.query(DiseaseAnalysis.disease_name, func.count(DiseaseAnalysis.id))
                    .filter(DiseaseAnalysis.is_healthy.is_(False)).group_by(DiseaseAnalysis.disease_name)
                    .order_by(func.count(DiseaseAnalysis.id).desc()).limit(10).all()]

    since7 = datetime.utcnow() - timedelta(days=7)
    return jsonify({
        'window_days': days,
        'platform_note': PLATFORM_NOTE,
        'stats': {                                  # original keys kept for compatibility
            'total_users': total_users,
            'farmers': by_role.get('farmer', 0),
            'extension_officers': by_role.get('extension_officer', 0),
            'admins': staff,
            'total_disease_analyses': DiseaseAnalysis.query.count(),
            'diseases_detected': DiseaseAnalysis.query.filter_by(is_healthy=False).count(),
            'total_recommendations': CropRecommendation.query.count(),
            'total_fertilizer_plans': FertilizerPlan.query.count(),
            'total_land_assessments': LandAssessment.query.count(),
        },
        'users': {
            'total': total_users, 'by_role': by_role, 'active': active, 'suspended': total_users - active,
            'pending_verification': pending_verification,
            'new_in_window': User.query.filter(User.created_at >= since).count(),
            'active_in_window': User.query.filter(User.last_login >= since).count(),
        },
        'registrations_by_day': series,
        'districts': districts,
        'ai': {
            'requests': ai_total, 'successful': ai_ok, 'failed': ai_total - ai_ok,
            'success_rate': round(100.0 * ai_ok / ai_total, 1) if ai_total else None,
            'avg_latency_ms': round(float(ai_q[2])) if ai_q[2] is not None else None,
        },
        'analyses': {
            'disease': DiseaseAnalysis.query.count(), 'soil': SoilAnalysis.query.count(),
            'crop_recommendations': CropRecommendation.query.count(),
            'fertilizer': FertilizerPlan.query.count(), 'land': LandAssessment.query.count(),
            'chat_messages': ChatMessage.query.count(), 'top_diseases': top_diseases,
        },
        'feedback': {'total': Feedback.query.count(),
                     'last_7_days': Feedback.query.filter(Feedback.created_at >= since7).count()},
        'security_last_24h': {
            'failed_logins': AuditLog.query.filter(AuditLog.action == 'login_failed',
                                                   AuditLog.created_at >= datetime.utcnow() - timedelta(hours=24)).count(),
            'access_denied': AuditLog.query.filter(AuditLog.action == 'access_denied',
                                                   AuditLog.created_at >= datetime.utcnow() - timedelta(hours=24)).count(),
        },
        'marketplace': _market_stats(),
        'recent_users': [u.to_dict() for u in User.query.order_by(User.created_at.desc()).limit(8).all()],
        'recent_analyses': [a.to_dict() for a in DiseaseAnalysis.query.order_by(DiseaseAnalysis.created_at.desc()).limit(8).all()],
    }), 200


@admin_bp.route('/analyses', methods=['GET'])
@require_permission('reports.view')
def all_analyses():
    page, per = _page_args()
    analyses = DiseaseAnalysis.query.order_by(DiseaseAnalysis.created_at.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'analyses': [a.to_dict() for a in analyses.items], 'total': analyses.total, 'pages': analyses.pages}), 200


# ─── USERS ───────────────────────────────────────────────────

def _user_row(u):
    d = u.to_dict()
    d['is_staff'] = u.role in ADMIN_ROLES
    d['suspended_reason'] = u.suspended_reason
    d['suspended_at'] = u.suspended_at.isoformat() if u.suspended_at else None
    return d


@admin_bp.route('/users', methods=['GET'])
@require_permission('users.view')
def list_users():
    page, per = _page_args()
    q = User.query
    term = request.args.get('q', '').strip()
    if term:
        like = f'%{term.lower()}%'
        q = q.filter(db.or_(func.lower(User.email).like(like), func.lower(User.full_name).like(like),
                            func.lower(func.coalesce(User.phone, '')).like(like)))
    role = request.args.get('role')
    if role == 'staff':
        q = q.filter(User.role.in_(ADMIN_ROLES))
    elif role in ALL_ROLES:
        q = q.filter(User.role == role)
    status = request.args.get('status')
    if status == 'active':
        q = q.filter(User.is_active.is_(True))
    elif status == 'suspended':
        q = q.filter(User.is_active.is_(False))
    ver = request.args.get('verification')
    if ver in ('unverified', 'pending', 'verified', 'rejected'):
        q = q.filter(User.verification_status == ver)
    if request.args.get('district'):
        q = q.filter(User.district == request.args['district'])
    p = q.order_by(User.created_at.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'users': [_user_row(u) for u in p.items], 'total': p.total, 'pages': p.pages, 'page': page}), 200


@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@require_permission('users.view')
def user_detail(user_id):
    u = User.query.get_or_404(user_id)
    counts = {
        'disease_analyses': DiseaseAnalysis.query.filter_by(user_id=u.id).count(),
        'soil_analyses': SoilAnalysis.query.filter_by(user_id=u.id).count(),
        'crop_recommendations': CropRecommendation.query.filter_by(user_id=u.id).count(),
        'fertilizer_plans': FertilizerPlan.query.filter_by(user_id=u.id).count(),
        'land_assessments': LandAssessment.query.filter_by(user_id=u.id).count(),
        'chat_messages': ChatMessage.query.filter_by(user_id=u.id).count(),
    }
    events = AuditLog.query.filter(db.or_(db.and_(AuditLog.target_type == 'user', AuditLog.target_id == str(u.id)),
                                          AuditLog.actor_id == u.id)).order_by(AuditLog.created_at.desc()).limit(25).all()
    overrides = [{'permission': o.permission, 'granted': o.granted} for o in UserPermission.query.filter_by(user_id=u.id).all()]
    d = _user_row(u)
    d['activity'] = counts
    d['recent_events'] = [_audit_row(e) for e in events]
    d['permissions'] = sorted(effective_permissions(u))
    d['permission_overrides'] = overrides
    return jsonify({'user': d}), 200


@admin_bp.route('/users', methods=['POST'])
@require_permission('users.manage')
def create_user():
    actor = current_user()
    data = _json()
    for f in ('full_name', 'email', 'password'):
        if not data.get(f):
            return jsonify({'error': f'{f} is required'}), 400
    role = data.get('role', 'farmer')
    if role == 'admin' or role not in ALL_ROLES:
        return jsonify({'error': 'Unknown role'}), 400
    if role in ADMIN_ROLES and 'roles.manage' not in effective_permissions(actor):
        return jsonify({'error': 'Only a Super Admin can create staff accounts.'}), 403
    min_len = 12 if role in ADMIN_ROLES else 8
    if len(data['password']) < min_len:
        return jsonify({'error': f'Password must be at least {min_len} characters'}), 400
    email = str(data['email']).lower().strip()
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already exists'}), 409
    u = User(full_name=str(data['full_name']).strip()[:120], email=email,
             phone=str(data.get('phone', '')).strip()[:20],
             password_hash=bcrypt.generate_password_hash(data['password']).decode('utf-8'),
             role=role, district=data.get('district', ''), preferred_language='en', is_active=True,
             verification_status='verified' if role in ADMIN_ROLES else 'unverified')
    db.session.add(u)
    db.session.commit()
    audit('user_created', actor=actor, target_type='user', target_id=u.id, details={'role': role, 'email': email})
    return jsonify({'user': _user_row(u)}), 201


@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@require_permission('users.manage')
def update_user(user_id):
    actor = current_user()
    u = User.query.get_or_404(user_id)
    if actor.id != u.id and not can_modify_target(actor, u):
        return jsonify({'error': 'You cannot change this account.'}), 403
    data = _json()
    changed = {}
    for field, limit in (('full_name', 120), ('phone', 20), ('district', 80)):
        if field in data:
            setattr(u, field, str(data[field]).strip()[:limit])
            changed[field] = True
    if data.get('preferred_language') in ('en', 'kr'):
        u.preferred_language = data['preferred_language']
        changed['preferred_language'] = True
    db.session.commit()
    audit('user_updated', actor=actor, target_type='user', target_id=u.id, details={'fields': list(changed)})
    return jsonify({'user': _user_row(u)}), 200


@admin_bp.route('/users/<int:user_id>/role', methods=['POST'])
@require_permission('roles.assign', 'roles.manage', any_of=True)
def set_role(user_id):
    actor = current_user()
    u = User.query.get_or_404(user_id)
    new_role = _json().get('role')
    ok, err = role_change_allowed(actor, u, new_role)
    if not ok:
        audit('role_change_denied', category='security', outcome='denied', actor=actor, target_type='user',
              target_id=u.id, details={'attempted': new_role})
        return jsonify({'error': err}), 403
    if u.role == 'super_admin' and new_role != 'super_admin' and count_active_super_admins() <= 1:
        return jsonify({'error': 'You cannot remove the last Super Admin.'}), 400
    old = u.role
    u.role = new_role
    if new_role in ADMIN_ROLES:
        u.verification_status = 'verified'
    u.token_version = (u.token_version or 0) + 1        # old tokens (with the old role) stop working
    db.session.commit()
    audit('role_changed', actor=actor, target_type='user', target_id=u.id, details={'from': old, 'to': new_role})
    return jsonify({'user': _user_row(u)}), 200


@admin_bp.route('/users/<int:user_id>/suspend', methods=['POST'])
@require_permission('users.manage')
def suspend_user(user_id):
    actor = current_user()
    u = User.query.get_or_404(user_id)
    if not can_modify_target(actor, u):
        return jsonify({'error': 'You cannot suspend this account.'}), 403
    if u.role == 'super_admin' and count_active_super_admins() <= 1:
        return jsonify({'error': 'You cannot suspend the last Super Admin.'}), 400
    reason = str(_json().get('reason', '')).strip()[:255]
    if not reason:
        return jsonify({'error': 'A reason is required.'}), 400
    u.is_active = False
    u.suspended_at = datetime.utcnow()
    u.suspended_reason = reason
    u.token_version = (u.token_version or 0) + 1
    db.session.commit()
    audit('user_suspended', actor=actor, target_type='user', target_id=u.id, details={'reason': reason})
    return jsonify({'user': _user_row(u)}), 200


@admin_bp.route('/users/<int:user_id>/restore', methods=['POST'])
@require_permission('users.manage')
def restore_user(user_id):
    actor = current_user()
    u = User.query.get_or_404(user_id)
    if not can_modify_target(actor, u):
        return jsonify({'error': 'You cannot restore this account.'}), 403
    u.is_active = True
    u.suspended_at = None
    u.suspended_reason = None
    db.session.commit()
    audit('user_restored', actor=actor, target_type='user', target_id=u.id)
    return jsonify({'user': _user_row(u)}), 200


@admin_bp.route('/users/<int:user_id>/verify', methods=['POST'])
@require_permission('users.manage')
def verify_user(user_id):
    actor = current_user()
    u = User.query.get_or_404(user_id)
    if not can_modify_target(actor, u):
        return jsonify({'error': 'You cannot change this account.'}), 403
    status = _json().get('status')
    if status not in ('unverified', 'pending', 'verified', 'rejected'):
        return jsonify({'error': 'status must be unverified, pending, verified or rejected'}), 400
    old = u.verification_status
    u.verification_status = status
    db.session.commit()
    audit('user_verification_changed', actor=actor, target_type='user', target_id=u.id, details={'from': old, 'to': status})
    return jsonify({'user': _user_row(u)}), 200


@admin_bp.route('/users/<int:user_id>/reset-password', methods=['POST'])
@rate_limit('admin_reset_pw', 20, 3600, per='user')
@require_permission('users.reset_password')
def reset_user_password(user_id):
    actor = current_user()
    u = User.query.get_or_404(user_id)
    if not can_modify_target(actor, u):
        return jsonify({'error': 'You cannot reset this account.'}), 403
    pw = str(_json().get('new_password', '')).strip()
    min_len = 12 if u.role in ADMIN_ROLES else 8
    if len(pw) < min_len:
        return jsonify({'error': f'Password must be at least {min_len} characters'}), 400
    u.password_hash = bcrypt.generate_password_hash(pw).decode('utf-8')
    u.token_version = (u.token_version or 0) + 1
    db.session.commit()
    audit('password_reset_by_admin', actor=actor, target_type='user', target_id=u.id)
    return jsonify({'message': 'Password reset. The user has been signed out everywhere.'}), 200


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@require_permission('users.delete')
def delete_user(user_id):
    actor = current_user()
    u = User.query.get_or_404(user_id)
    if u.id == actor.id or u.role in ADMIN_ROLES:
        return jsonify({'error': 'Staff accounts and your own account cannot be deleted here.'}), 400
    email = u.email
    db.session.delete(u)
    db.session.commit()
    audit('user_deleted', actor=actor, target_type='user', target_id=user_id, details={'email': email})
    return jsonify({'message': 'User and their data were permanently deleted.'}), 200


# ─── ROLES & PERMISSIONS ─────────────────────────────────────

@admin_bp.route('/roles', methods=['GET'])
@require_permission('users.view', 'roles.manage', any_of=True)
def roles_matrix():
    counts = dict(db.session.query(User.role, func.count(User.id)).group_by(User.role).all())
    return jsonify({
        'permissions': PERMISSIONS,
        'roles': [{'role': r, 'staff': r in ADMIN_ROLES, 'users': counts.get(r, 0),
                   'permissions': sorted(ROLE_PERMISSIONS.get(r, set()))} for r in ALL_ROLES],
    }), 200


@admin_bp.route('/users/<int:user_id>/permissions', methods=['PUT'])
@require_permission('roles.manage')
def set_user_permissions(user_id):
    """Super Admin only. Body: {"grant": [...], "deny": [...], "clear": [...]}"""
    actor = current_user()
    u = User.query.get_or_404(user_id)
    if u.id == actor.id:
        return jsonify({'error': 'You cannot change your own permissions.'}), 403
    if u.role == 'super_admin':
        return jsonify({'error': 'Super Admin permissions cannot be restricted.'}), 400
    data = _json()
    unknown = [p for k in ('grant', 'deny', 'clear') for p in data.get(k, []) if p not in PERMISSIONS]
    if unknown:
        return jsonify({'error': 'Unknown permission(s): ' + ', '.join(unknown)}), 400
    for key, granted in (('grant', True), ('deny', False)):
        for perm in data.get(key, []):
            row = UserPermission.query.filter_by(user_id=u.id, permission=perm).first()
            if row:
                row.granted, row.changed_by, row.changed_at = granted, actor.id, datetime.utcnow()
            else:
                db.session.add(UserPermission(user_id=u.id, permission=perm, granted=granted, changed_by=actor.id))
    for perm in data.get('clear', []):
        UserPermission.query.filter_by(user_id=u.id, permission=perm).delete()
    u.token_version = (u.token_version or 0) + 1
    db.session.commit()
    audit('permissions_changed', actor=actor, target_type='user', target_id=u.id,
          details={k: data.get(k, []) for k in ('grant', 'deny', 'clear')})
    return jsonify({'permissions': sorted(effective_permissions(u))}), 200


# ─── AUDIT LOG ───────────────────────────────────────────────

def _audit_row(e):
    return {'id': e.id, 'created_at': e.created_at.isoformat() if e.created_at else None,
            'category': e.category, 'action': e.action, 'outcome': e.outcome, 'actor_id': e.actor_id,
            'actor_email': e.actor_email, 'actor_role': e.actor_role, 'target_type': e.target_type,
            'target_id': e.target_id, 'details': e.details, 'ip': e.ip}


def _audit_query():
    q = AuditLog.query
    for field in ('category', 'action', 'outcome'):
        if request.args.get(field):
            q = q.filter(getattr(AuditLog, field) == request.args[field])
    if request.args.get('actor'):
        q = q.filter(func.lower(AuditLog.actor_email).like(f"%{request.args['actor'].lower()}%"))
    if request.args.get('target_id'):
        q = q.filter(AuditLog.target_id == request.args['target_id'])
    return q.filter(AuditLog.created_at >= datetime.utcnow() - timedelta(days=_days(90, 730)))


@admin_bp.route('/audit', methods=['GET'])
@require_permission('audit.view')
def audit_list():
    page, per = _page_args(30, 200)
    p = _audit_query().order_by(AuditLog.id.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'events': [_audit_row(e) for e in p.items], 'total': p.total, 'pages': p.pages, 'page': page}), 200


# ─── NOTIFICATIONS (derived from real conditions, never invented) ───

@admin_bp.route('/notifications', methods=['GET'])
@require_permission('notifications.view')
def notifications():
    actor = current_user()
    perms = effective_permissions(actor)
    items = []
    def add(level, title, detail, link=None):
        items.append({'level': level, 'title': title, 'detail': detail, 'link': link})
    if 'roles.manage' in perms and count_active_super_admins() == 0:
        add('critical', 'No active Super Admin', 'Set ADMIN_EMAIL and ADMIN_PASSWORD and redeploy.')
    legacy = User.query.filter_by(email='admin@smartagri.sl').first()
    if legacy and bcrypt.check_password_hash(legacy.password_hash, 'SmartAgri2024!'):
        add('critical', 'Default admin password still active', 'Account admin@smartagri.sl uses the old public password. Reset it now.', '/admin/users')
    if 'users.manage' in perms:
        n = User.query.filter_by(verification_status='pending').count()
        if n:
            add('info', f'{n} account(s) awaiting verification', 'Review them in Users.', '/admin/users?verification=pending')
    if 'marketplace.verify_sellers' in perms:
        from app.models_marketplace import SellerProfile
        n = SellerProfile.query.filter_by(verification_status='pending').count()
        if n:
            add('info', f'{n} seller(s) waiting for verification', 'Review them in Marketplace > Sellers.', '/admin/marketplace')
    if 'marketplace.manage' in perms:
        from app.models_marketplace import Product, Dispute, Report, Order
        for label, n in (('listing(s) awaiting approval', Product.query.filter_by(status='pending_review').count()),
                         ('open dispute(s)', Dispute.query.filter_by(status='open').count()),
                         ('open report(s) on listings, sellers or reviews', Report.query.filter_by(status='open').count()),
                         ('refund(s) owed to buyers', Order.query.filter_by(payment_status='refund_due').count())):
            if n:
                add('warning' if 'dispute' in label or 'refund' in label else 'info', f'{n} {label}', 'Open Marketplace to handle them.', '/admin/marketplace')
    if 'ai.view' in perms:
        since = datetime.utcnow() - timedelta(hours=1)
        rows = db.session.query(AIInferenceLog.model_id, func.count(AIInferenceLog.id),
                                func.sum(db.case((AIInferenceLog.success.is_(True), 1), else_=0))) \
            .filter(AIInferenceLog.created_at >= since).group_by(AIInferenceLog.model_id).all()
        for model, total, ok in rows:
            if total >= 5 and (ok or 0) / total < 0.5:
                add('warning', f'AI model failing: {model}', f'{total - (ok or 0)} of {total} calls failed in the last hour.', '/admin/ai')
        for e in model_registry.REGISTRY:
            if e['state'] == 'live' and model_registry.credential_state(e) == 'missing':
                add('warning', f"Missing credential for {e['identifier']}", f"Set {e['env_key']} on the server.", '/admin/ai')
    if 'audit.view' in perms:
        since = datetime.utcnow() - timedelta(hours=24)
        n = AuditLog.query.filter(AuditLog.action == 'login_failed', AuditLog.created_at >= since).count()
        if n >= 20:
            add('warning', f'{n} failed logins in 24 hours', 'Possible password guessing. Review the audit log.', '/admin/audit')
    if 'feedback.view' in perms:
        n = Feedback.query.filter(Feedback.created_at >= datetime.utcnow() - timedelta(days=7)).count()
        if n:
            add('info', f'{n} new feedback message(s) this week', 'Read them in Feedback.', '/admin/feedback')
    return jsonify({'notifications': items}), 200


# ─── FEEDBACK ────────────────────────────────────────────────

@admin_bp.route('/feedback', methods=['GET'])
@require_permission('feedback.view')
def feedback_list():
    page, per = _page_args()
    p = Feedback.query.order_by(Feedback.created_at.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'items': [{'id': f.id, 'name': f.name, 'email': f.email, 'subject': f.subject,
                               'message': f.message, 'email_delivered': f.email_delivered,
                               'created_at': f.created_at.isoformat() if f.created_at else None}
                              for f in p.items], 'total': p.total, 'pages': p.pages}), 200


# ─── SYSTEM HEALTH ───────────────────────────────────────────

def _dir_stats(path):
    n = size = 0
    if os.path.isdir(path):
        for root, _, files in os.walk(path):
            for f in files:
                try:
                    size += os.path.getsize(os.path.join(root, f)); n += 1
                except OSError:
                    pass
    return n, size


@admin_bp.route('/system/health', methods=['GET'])
@require_permission('system.view')
def system_health():
    t0 = time.monotonic()
    try:
        db.session.execute(db.text('SELECT 1'))
        db_ok, db_err = True, None
    except Exception as e:
        db_ok, db_err = False, type(e).__name__
    db_ms = int((time.monotonic() - t0) * 1000)

    uploads = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'uploads'))
    files, size = _dir_stats(uploads)
    try:
        du = shutil.disk_usage(uploads if os.path.isdir(uploads) else '/')
        disk = {'total_gb': round(du.total / 1e9, 1), 'free_gb': round(du.free / 1e9, 1)}
    except OSError:
        disk = None
    day = datetime.utcnow() - timedelta(hours=24)
    creds = {k: ('configured' if os.environ.get(k) else 'missing') for k in
             ('DATABASE_URL', 'SECRET_KEY', 'JWT_SECRET_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY',
              'HUGGINGFACE_API_TOKEN', 'OPENWEATHER_API_KEY', 'SMTP_HOST')}      # presence only, never values
    return jsonify({
        'api': {'status': 'ok'},
        'database': {'status': 'ok' if db_ok else 'error', 'latency_ms': db_ms, 'error': db_err},
        'storage': {'uploads_files': files, 'uploads_mb': round(size / 1e6, 1), 'disk': disk,
                    'retention_days': int(os.environ.get('IMAGE_RETENTION_DAYS', '365')),
                    'retention_job': 'not scheduled by the app (run `flask purge-images` from a cron job)'},
        'credentials': creds,
        'backups': {'status': 'unknown',
                    'note': 'SmartAgri has no backup integration. Use your database provider\'s automated backups and check them there.'},
        'settings': {'environment': os.environ.get('FLASK_ENV', 'development'),
                     'demo_seed_enabled': os.environ.get('SEED_DEMO_DATA', '').lower() == 'true',
                     'role_seed_enabled': os.environ.get('SEED_ROLE_USERS', '').lower() == 'true',
                     'db_ssl_verify': os.environ.get('DB_SSL_VERIFY', '').lower() in ('1', 'true', 'yes')},
        'errors_last_24h': {'ai_failures': AIInferenceLog.query.filter(AIInferenceLog.success.is_(False),
                                                                      AIInferenceLog.created_at >= day).count(),
                            'security_events': AuditLog.query.filter(AuditLog.category == 'security',
                                                                     AuditLog.created_at >= day).count()},
    }), 200


# ─── REPORTS (CSV) ───────────────────────────────────────────

@admin_bp.route('/reports/<name>.csv', methods=['GET'])
@require_permission('reports.export')
def report_csv(name):
    actor = current_user()
    since = datetime.utcnow() - timedelta(days=_days(90, 730))
    stamp = datetime.utcnow().strftime('%Y%m%d')
    if name == 'registrations':
        rows = db.session.query(func.date(User.created_at), User.role, User.district, func.count(User.id)) \
            .filter(User.created_at >= since).group_by(func.date(User.created_at), User.role, User.district).order_by(func.date(User.created_at)).all()
        out = _csv_response(f'registrations_{stamp}.csv', ['date', 'role', 'district', 'new_accounts'], rows)
    elif name == 'users':
        if 'users.view' not in effective_permissions(actor):
            return jsonify({'error': 'You do not have permission to do this.'}), 403
        rows = [(u.id, u.full_name, u.email, u.role, u.district, 'active' if u.is_active else 'suspended',
                 u.verification_status, u.created_at, u.last_login) for u in User.query.order_by(User.id).all()]
        out = _csv_response(f'users_{stamp}.csv', ['id', 'name', 'email', 'role', 'district', 'status',
                                                  'verification', 'created_at', 'last_login'], rows)
    elif name == 'ai_usage':
        rows = db.session.query(func.date(AIInferenceLog.created_at), AIInferenceLog.model_id, AIInferenceLog.task,
                                func.count(AIInferenceLog.id),
                                func.sum(db.case((AIInferenceLog.success.is_(True), 0), else_=1)),
                                func.avg(AIInferenceLog.latency_ms)) \
            .filter(AIInferenceLog.created_at >= since).group_by(func.date(AIInferenceLog.created_at), AIInferenceLog.model_id, AIInferenceLog.task).all()
        out = _csv_response(f'ai_usage_{stamp}.csv', ['date', 'model', 'task', 'requests', 'failures', 'avg_latency_ms'],
                            [(a, b, c, d, int(e or 0), round(float(f)) if f is not None else '') for a, b, c, d, e, f in rows])
    elif name == 'disease_trends':
        rows = db.session.query(DiseaseAnalysis.disease_name, DiseaseAnalysis.plant_type, func.count(DiseaseAnalysis.id),
                                func.avg(DiseaseAnalysis.confidence)) \
            .filter(DiseaseAnalysis.created_at >= since).group_by(DiseaseAnalysis.disease_name, DiseaseAnalysis.plant_type) \
            .order_by(func.count(DiseaseAnalysis.id).desc()).all()
        out = _csv_response(f'disease_trends_{stamp}.csv', ['disease', 'plant', 'analyses', 'avg_model_confidence'],
                            [(a, b, c, round(float(d), 1) if d is not None else '') for a, b, c, d in rows])
    elif name == 'districts':
        rows = db.session.query(User.district, func.count(User.id),
                                func.sum(db.case((User.is_active.is_(True), 1), else_=0))).group_by(User.district).order_by(func.count(User.id).desc()).all()
        out = _csv_response(f'districts_{stamp}.csv', ['district', 'accounts', 'active_accounts'],
                            [(d or 'Unknown', n, int(a or 0)) for d, n, a in rows])
    elif name == 'crop_recommendations':
        rows = db.session.query(CropRecommendation.district, func.count(CropRecommendation.id)) \
            .filter(CropRecommendation.created_at >= since).group_by(CropRecommendation.district).order_by(func.count(CropRecommendation.id).desc()).all()
        out = _csv_response(f'crop_recommendations_{stamp}.csv', ['district', 'recommendations_requested'], [(d or 'Unknown', n) for d, n in rows])
    elif name == 'audit':
        if 'audit.view' not in effective_permissions(actor):
            return jsonify({'error': 'You do not have permission to do this.'}), 403
        evs = AuditLog.query.filter(AuditLog.created_at >= since).order_by(AuditLog.id.desc()).limit(20000).all()
        out = _csv_response(f'audit_{stamp}.csv', ['time', 'category', 'action', 'outcome', 'actor', 'role', 'target_type', 'target_id', 'ip'],
                            [(e.created_at, e.category, e.action, e.outcome, e.actor_email, e.actor_role, e.target_type, e.target_id, e.ip) for e in evs])
    else:
        return jsonify({'error': 'Unknown report'}), 404
    audit('report_exported', actor=actor, target_type='report', target_id=name)
    return out


# ─── AI MODEL MONITORING ─────────────────────────────────────

def _stats_for(model_ids, tasks, since):
    q = db.session.query(
        AIInferenceLog.model_id,
        func.count(AIInferenceLog.id),
        func.sum(db.case((AIInferenceLog.success.is_(True), 1), else_=0)),
        func.avg(AIInferenceLog.latency_ms),
        func.max(AIInferenceLog.created_at),
    ).filter(AIInferenceLog.created_at >= since, AIInferenceLog.model_id.in_(model_ids))
    if tasks:
        q = q.filter(AIInferenceLog.task.in_(tasks))
    total = ok = 0
    lat = []
    last = None
    for _, n, s_, avg, mx in q.group_by(AIInferenceLog.model_id).all():
        total += n or 0
        ok += int(s_ or 0)
        if avg is not None:
            lat.append(float(avg))
        last = max(filter(None, [last, mx])) if mx else last
    return {
        'requests': total, 'successes': ok, 'failures': total - ok,
        'success_rate': round(100.0 * ok / total, 1) if total else None,
        'avg_latency_ms': round(sum(lat) / len(lat)) if lat else None,
        'last_call': last.isoformat() if last else None,
    }


def _health_label(entry, st):
    if entry['state'] == 'configured_unused':
        return 'not_connected'
    if entry['state'] == 'local_engine':
        return 'available'
    if model_registry.credential_state(entry) == 'missing':
        return 'awaiting_credentials'
    if not st['requests']:
        return 'untested'          # configured, but no calls in the window - NOT claimed as working
    rate = st['success_rate']
    return 'healthy' if rate >= 90 else ('degraded' if rate >= 50 else 'failing')


@admin_bp.route('/ai/models', methods=['GET'])
@require_permission('ai.view')
def ai_models():
    days = min(max(request.args.get('days', 7, type=int), 1), 90)
    since = datetime.utcnow() - timedelta(days=days)
    out = []
    for e in model_registry.REGISTRY:
        view = model_registry.public_view(e)
        st = _stats_for([e['identifier']], e.get('tasks'), since) if e['state'] == 'live' else None
        view['stats'] = st
        view['health'] = _health_label(e, st or {'requests': 0})
        out.append(view)
    return jsonify({'window_days': days, 'models': out}), 200


@admin_bp.route('/ai/errors', methods=['GET'])
@require_permission('ai.view')
def ai_errors():
    since = datetime.utcnow() - timedelta(days=min(request.args.get('days', 7, type=int), 90))
    rows = db.session.query(AIInferenceLog.model_id, AIInferenceLog.error_kind, func.count(AIInferenceLog.id)) \
        .filter(AIInferenceLog.success.is_(False), AIInferenceLog.created_at >= since) \
        .group_by(AIInferenceLog.model_id, AIInferenceLog.error_kind).all()
    return jsonify({'errors': [{'model': m, 'error_kind': k, 'count': c} for m, k, c in rows]}), 200


@admin_bp.route('/ai/probe/<entry_id>', methods=['POST'])
@rate_limit('ai_probe', 10, 300, per='user')
@require_permission('ai.manage')
def ai_probe(entry_id):
    """
    Send ONE tiny real request to a live model to verify credentials, model id and
    input format. Vision models receive a generated test image (this checks that the
    model ACCEPTS images, not that its diagnosis is accurate).
    """
    entry = model_registry.get_entry(entry_id)
    if not entry or entry['state'] != 'live':
        return jsonify({'error': 'Only live provider models can be probed'}), 404
    import io, base64, time
    from PIL import Image
    audit('ai_probe', target_type='ai_model', target_id=entry_id, actor=current_user())
    t0 = time.monotonic()
    try:
        if entry['provider'] == 'groq' and entry['capability'] == 'vision':
            buf = io.BytesIO(); Image.new('RGB', (128, 128), (60, 140, 60)).save(buf, 'JPEG')
            b64 = base64.b64encode(buf.getvalue()).decode()
            ai_gateway.groq_chat(entry['identifier'], [{'role': 'user', 'content': [
                {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}},
                {'type': 'text', 'text': 'Reply with one word: the dominant colour.'}]}],
                task='probe', max_tokens=20, timeout=25, retries=0, extra={'reasoning_effort': 'none'})
        elif entry['provider'] == 'groq':
            ai_gateway.groq_chat(entry['identifier'], [{'role': 'user', 'content': 'Reply with the word OK.'}],
                                 task='probe', max_tokens=10, timeout=20, retries=0)
        elif entry['provider'] == 'anthropic':
            buf = io.BytesIO(); Image.new('RGB', (128, 128), (60, 140, 60)).save(buf, 'JPEG')
            b64 = base64.b64encode(buf.getvalue()).decode()
            ai_gateway.anthropic_message(entry['identifier'], [{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': b64}},
                {'type': 'text', 'text': 'Reply with one word: the dominant colour.'}]}],
                task='probe', max_tokens=20, timeout=25, retries=0)
        else:
            return jsonify({'error': 'Unsupported provider'}), 400
    except ai_gateway.AIError as e:
        return jsonify({'ok': False, 'error_kind': e.kind, 'message': e.message,
                        'latency_ms': int((time.monotonic() - t0) * 1000)}), 200
    return jsonify({'ok': True, 'latency_ms': int((time.monotonic() - t0) * 1000)}), 200
