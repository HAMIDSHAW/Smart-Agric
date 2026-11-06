import os
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from app import db, bcrypt
from app.models import User
from app.services.ratelimit import rate_limit
from app.services.rbac import (require_permission, effective_permissions, can_modify_target, ADMIN_ROLES,
                               STAFF_ROLES, count_active_super_admins)
from app.services.audit import audit
from datetime import datetime

auth_bp = Blueprint('auth', __name__)


def issue_tokens(user):
    """Access + refresh tokens carrying the user's token_version ('tv'). Bumping token_version
    (password change, suspension, role change) invalidates every older token immediately."""
    claims = {'role': user.role, 'tv': int(user.token_version or 0)}
    return (create_access_token(identity=str(user.id), additional_claims=claims),
            create_refresh_token(identity=str(user.id), additional_claims={'tv': claims['tv']}))


def user_payload(user):
    d = user.to_dict()
    d['permissions'] = sorted(effective_permissions(user))
    d['is_staff'] = user.role in ADMIN_ROLES
    return d

SIERRA_LEONE_DISTRICTS = [
    'Bo', 'Bombali', 'Bonthe', 'Falaba', 'Kailahun', 'Kambia',
    'Karene', 'Kenema', 'Koinadugu', 'Kono', 'Moyamba',
    'Port Loko', 'Pujehun', 'Tonkolili', 'Western Area Rural', 'Western Area Urban'
]

# Legacy credentials that shipped in earlier versions. They are kept ONLY so the app
# can detect (and loudly warn about) an account that still uses them. They are never
# used to create new accounts.
_LEGACY_ADMIN_EMAIL = 'admin@smartagri.sl'
_LEGACY_ADMIN_PASSWORD = 'SmartAgri2024!'


def ensure_default_admin():
    """Seed the main user / role accounts from environment variables (see services/seeding.py)
    and warn about risky leftovers. No hardcoded credentials exist in the code."""
    from app.services.seeding import seed_accounts
    seed_accounts()

    legacy = User.query.filter_by(email=_LEGACY_ADMIN_EMAIL).first()
    if legacy and bcrypt.check_password_hash(legacy.password_hash, _LEGACY_ADMIN_PASSWORD):
        current_app.logger.warning(
            'SECURITY: the account %s still uses the old default password. '
            'Change it immediately (Profile > Change password).', _LEGACY_ADMIN_EMAIL)
    if not User.query.filter_by(role='super_admin', is_active=True).first():
        current_app.logger.warning(
            'No active Super Admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) '
            'and redeploy to create or promote the main user.')


@auth_bp.route('/register', methods=['POST'])
@rate_limit('register', 10, 3600)
def register():
    data = request.get_json(silent=True) or {}

    # Required fields
    for field in ['full_name', 'email', 'password']:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    if User.query.filter_by(email=data['email'].lower().strip()).first():
        return jsonify({'error': 'An account with this email already exists'}), 409

    if len(data['password']) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    # All public registrations are farmers — admin cannot be created via public register
    role = 'farmer'

    pw_hash = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    user = User(
        full_name=data['full_name'].strip(),
        email=data['email'].lower().strip(),
        phone=data.get('phone', '').strip(),
        password_hash=pw_hash,
        role=role,
        district=data.get('district', ''),
        preferred_language=data.get('preferred_language', 'en')
    )
    db.session.add(user)
    db.session.commit()

    access_token, refresh_token = issue_tokens(user)

    return jsonify({
        'message': 'Account created successfully',
        'user': user_payload(user),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 201


@auth_bp.route('/login', methods=['POST'])
@rate_limit('login', 10, 300)
def login():
    data = request.get_json(silent=True) or {}
    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400

    email = str(data['email']).lower().strip()
    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, data['password']):
        audit('login_failed', category='auth', outcome='failure', actor=user,
              actor_email=email[:120], details={'reason': 'bad_credentials'})
        return jsonify({'error': 'Invalid email or password'}), 401

    if not user.is_active:
        audit('login_blocked_suspended', category='auth', outcome='denied', actor=user)
        return jsonify({'error': 'Account deactivated. Contact administrator.'}), 403

    user.last_login = datetime.utcnow()
    db.session.commit()
    if user.role in ADMIN_ROLES:
        audit('admin_login', category='auth', actor=user)

    access_token, refresh_token = issue_tokens(user)

    return jsonify({
        'message': 'Login successful',
        'user': user_payload(user),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'User not found'}), 404
    access_token, _ = issue_tokens(user)
    return jsonify({'access_token': access_token}), 200


@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user_payload(user)}), 200


@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'User not found'}), 404
    data = request.get_json()
    if 'full_name' in data:
        user.full_name = data['full_name'].strip()
    if 'phone' in data:
        user.phone = data['phone'].strip()
    if 'district' in data:
        user.district = data['district']
    if 'preferred_language' in data and data['preferred_language'] in ['en', 'kr']:
        user.preferred_language = data['preferred_language']
    db.session.commit()
    return jsonify({'message': 'Profile updated', 'user': user.to_dict()}), 200


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    user = User.query.get(int(get_jwt_identity()))
    data = request.get_json(silent=True) or {}
    if not bcrypt.check_password_hash(user.password_hash, data.get('current_password', '')):
        audit('password_change_failed', category='auth', outcome='failure', actor=user)
        return jsonify({'error': 'Current password is incorrect'}), 401
    new_pw = data.get('new_password', '')
    min_len = 12 if user.role in ADMIN_ROLES else 8
    if len(new_pw) < min_len:
        return jsonify({'error': f'New password must be at least {min_len} characters'}), 400
    user.password_hash = bcrypt.generate_password_hash(new_pw).decode('utf-8')
    user.token_version = (user.token_version or 0) + 1       # signs out every other session
    db.session.commit()
    audit('password_changed', category='auth', actor=user)
    access_token, refresh_token = issue_tokens(user)         # this session stays signed in
    return jsonify({'message': 'Password changed successfully',
                    'access_token': access_token, 'refresh_token': refresh_token}), 200


# ─── ADMIN ROUTES (legacy paths kept; enforced by permissions on the server) ─────────

@auth_bp.route('/admin/users', methods=['GET'])
@require_permission('users.view')
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({'users': [u.to_dict() for u in users], 'total': len(users)}), 200


@auth_bp.route('/admin/create-admin', methods=['POST'])
@require_permission('roles.manage')
def create_admin():
    """Super Admin only. Creates a staff account with a specific staff role."""
    from app.services.rbac import current_user
    actor = current_user()
    data = request.get_json(silent=True) or {}
    for field in ['full_name', 'email', 'password']:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
    role = data.get('role', 'operations_admin')
    if role not in STAFF_ROLES:
        return jsonify({'error': 'role must be one of: ' + ', '.join(STAFF_ROLES)}), 400
    if len(data['password']) < 12:
        return jsonify({'error': 'Staff passwords must be at least 12 characters'}), 400
    email = data['email'].lower().strip()
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already exists'}), 409

    new_admin = User(
        full_name=data['full_name'].strip(), email=email,
        password_hash=bcrypt.generate_password_hash(data['password']).decode('utf-8'),
        role=role, district=data.get('district', 'Western Area Urban'),
        preferred_language='en', is_active=True, verification_status='verified')
    db.session.add(new_admin)
    db.session.commit()
    audit('staff_account_created', actor=actor, target_type='user', target_id=new_admin.id,
          details={'email': email, 'role': role})
    return jsonify({'message': f'{role} account created for {new_admin.email}', 'user': new_admin.to_dict()}), 201


@auth_bp.route('/admin/toggle-user/<int:user_id>', methods=['POST'])
@require_permission('users.manage')
def toggle_user(user_id):
    from app.services.rbac import current_user
    actor = current_user()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    if not can_modify_target(actor, user):
        return jsonify({'error': 'You cannot change this account.'}), 403
    suspending = bool(user.is_active)
    user.is_active = not user.is_active
    user.suspended_at = datetime.utcnow() if suspending else None
    user.suspended_reason = None if not suspending else (user.suspended_reason or 'Suspended by an administrator')
    user.token_version = (user.token_version or 0) + 1       # live sessions end now
    db.session.commit()
    audit('user_suspended' if suspending else 'user_restored', actor=actor, target_type='user', target_id=user.id)
    return jsonify({'message': f'User {"deactivated" if suspending else "activated"}', 'user': user.to_dict()}), 200


@auth_bp.route('/admin/stats', methods=['GET'])
@require_permission('reports.view', 'users.view', any_of=True)
def admin_stats():
    from app.models import DiseaseAnalysis, CropRecommendation, FertilizerPlan, LandAssessment, SoilAnalysis, ChatMessage
    return jsonify({
        'total_users': User.query.count(),
        'active_users': User.query.filter_by(is_active=True).count(),
        'farmers': User.query.filter_by(role='farmer').count(),
        'disease_analyses': DiseaseAnalysis.query.count(),
        'crop_recommendations': CropRecommendation.query.count(),
        'fertilizer_plans': FertilizerPlan.query.count(),
        'land_assessments': LandAssessment.query.count(),
        'soil_analyses': SoilAnalysis.query.count(),
        'chat_messages': ChatMessage.query.count(),
    }), 200


@auth_bp.route('/forgot-password', methods=['POST'])
@rate_limit('forgot', 5, 3600)
def forgot_password():
    """
    Sends password reset instructions.
    For security, always returns 200 whether email exists or not.
    Without an email provider configured, logs the reset token so admin can manually help.
    """
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({'message': 'If that account exists, reset instructions have been sent.'}), 200

    import secrets
    from datetime import datetime, timedelta
    from app import db

    user = User.query.filter_by(email=email).first()
    if user:
        # No email provider is configured, so no self-service reset token is issued.
        # Reset tokens are never logged. An administrator can reset the password
        # via /api/auth/admin-reset after verifying the user's identity.
        current_app.logger.info('Password reset requested for user id %s', user.id)

    return jsonify({'message': 'If that account exists, reset instructions have been sent.'}), 200


@auth_bp.route('/admin-reset', methods=['POST'])
@rate_limit('admin_reset', 20, 3600, per='user')
@require_permission('users.reset_password')
def admin_reset_password():
    """Reset a user's password after verifying their identity out-of-band."""
    from app.services.rbac import current_user
    actor = current_user()
    data = request.get_json(silent=True) or {}
    email = str(data.get('email', '')).strip().lower()
    new_pass = str(data.get('new_password', '')).strip()
    user = User.query.filter_by(email=email).first() if email else None
    if not user:
        return jsonify({'error': 'User not found'}), 404
    if not can_modify_target(actor, user):
        return jsonify({'error': 'You cannot reset this account.'}), 403
    min_len = 12 if user.role in ADMIN_ROLES else 8
    if len(new_pass) < min_len:
        return jsonify({'error': f'Password (min {min_len} chars) required'}), 400

    user.password_hash = bcrypt.generate_password_hash(new_pass).decode('utf-8')
    user.token_version = (user.token_version or 0) + 1
    db.session.commit()
    audit('password_reset_by_admin', actor=actor, target_type='user', target_id=user.id)
    return jsonify({'message': f'Password reset for {user.full_name}'}), 200


@auth_bp.route('/districts', methods=['GET'])
def get_districts():
    return jsonify({'districts': SIERRA_LEONE_DISTRICTS}), 200
