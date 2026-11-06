"""
Role-based access control, enforced on the SERVER for every protected endpoint.

Permissions are looked up from the database on every request (never trusted from the
JWT), so a suspended user or a changed role takes effect immediately.
"""
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

CUSTOMER_ROLES = ['farmer', 'extension_officer', 'buyer', 'seller']
STAFF_ROLES = ['super_admin', 'operations_admin', 'marketplace_admin', 'ai_admin', 'support_admin']
LEGACY_ADMIN = 'admin'                      # pre-RBAC role; kept working, never super
ADMIN_ROLES = set(STAFF_ROLES) | {LEGACY_ADMIN}
ALL_ROLES = CUSTOMER_ROLES + STAFF_ROLES + [LEGACY_ADMIN]

PERMISSIONS = {
    'users.view': 'View users and their activity',
    'users.manage': 'Edit, verify, suspend and restore customer accounts',
    'users.reset_password': 'Reset a customer password',
    'users.delete': 'Permanently delete accounts and their data',
    'roles.assign': 'Assign customer roles (farmer, extension officer, buyer, seller)',
    'roles.manage': 'Assign staff roles and manage per-user permissions (Super Admin)',
    'audit.view': 'View audit logs and security events',
    'reports.view': 'View dashboards and analytics',
    'reports.export': 'Download CSV reports',
    'ai.view': 'View AI model health and usage',
    'ai.manage': 'Run AI model checks and change safe AI settings',
    'system.view': 'View system health and configuration status',
    'system.manage': 'Change application settings',
    'feedback.view': 'Read farmer feedback',
    'notifications.view': 'See the admin notification centre',
    'marketplace.manage': 'Moderate listings, orders, disputes and sellers (Phase 5)',
    'marketplace.verify_sellers': 'Verify sellers and businesses (Phase 5)',
}

_ALL = set(PERMISSIONS)
_BASE_STAFF = {'notifications.view'}

ROLE_PERMISSIONS = {
    'super_admin': set(_ALL),
    'operations_admin': _BASE_STAFF | {'users.view', 'users.manage', 'users.reset_password', 'roles.assign',
                                       'audit.view', 'reports.view', 'reports.export', 'system.view',
                                       'feedback.view'},
    'marketplace_admin': _BASE_STAFF | {'users.view', 'marketplace.manage', 'marketplace.verify_sellers',
                                        'reports.view', 'reports.export', 'feedback.view'},
    'ai_admin': _BASE_STAFF | {'ai.view', 'ai.manage', 'system.view', 'reports.view', 'audit.view'},
    'support_admin': _BASE_STAFF | {'users.view', 'users.reset_password', 'feedback.view'},
    # Legacy 'admin' keeps what the old admin could do (users, stats, reset, AI monitoring)
    # but NOT Super Admin powers (roles.manage, users.delete, system.manage).
    'admin': _BASE_STAFF | {'users.view', 'users.manage', 'users.reset_password', 'roles.assign',
                            'audit.view', 'reports.view', 'reports.export', 'system.view', 'feedback.view',
                            'ai.view', 'ai.manage'},
}


def is_staff(user):
    return bool(user and user.role in ADMIN_ROLES)


def effective_permissions(user):
    if not user or not user.is_active:
        return set()
    perms = set(ROLE_PERMISSIONS.get(user.role, set()))
    if user.role == 'super_admin':
        return perms                              # Super Admin cannot be restricted by overrides
    from app.models import UserPermission
    for o in UserPermission.query.filter_by(user_id=user.id).all():
        if o.permission not in PERMISSIONS:
            continue
        (perms.add if o.granted else perms.discard)(o.permission)
    return perms


def current_user():
    from app import db
    from app.models import User
    try:
        return db.session.get(User, int(get_jwt_identity()))
    except (TypeError, ValueError):
        return None


def require_permission(*needed, any_of=False):
    """Decorator: valid login + active account + the permission(s), checked against the DB."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            verify_jwt_in_request()
            user = current_user()
            have = effective_permissions(user)
            ok = (any(p in have for p in needed) if any_of else all(p in have for p in needed))
            if not ok:
                from app.services.audit import audit
                audit('access_denied', category='security', outcome='denied', actor=user,
                      details={'needed': list(needed)})
                return jsonify({'error': 'You do not have permission to do this.'}), 403
            return fn(*a, **kw)
        return wrapper
    return deco


def can_modify_target(actor, target):
    """Who may act on whom. Staff accounts can only be changed by someone with roles.manage."""
    if actor.id == target.id:
        return False
    if target.role in ADMIN_ROLES:
        return 'roles.manage' in effective_permissions(actor)
    return True


def role_change_allowed(actor, target, new_role):
    """Returns (ok, error_message)."""
    if new_role not in ALL_ROLES or new_role == LEGACY_ADMIN:
        return False, 'Unknown role.'
    if actor.id == target.id:
        return False, 'You cannot change your own role.'
    perms = effective_permissions(actor)
    touches_staff = new_role in ADMIN_ROLES or target.role in ADMIN_ROLES
    if touches_staff and 'roles.manage' not in perms:
        return False, 'Only a Super Admin can assign or remove staff roles.'
    if not touches_staff and 'roles.assign' not in perms and 'roles.manage' not in perms:
        return False, 'You cannot assign roles.'
    return True, None


def count_active_super_admins():
    from app.models import User
    return User.query.filter_by(role='super_admin', is_active=True).count()
