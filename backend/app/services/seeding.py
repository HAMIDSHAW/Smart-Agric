"""
Deployment-time account seeding. NO password is stored in the code: every password
comes from an environment variable that only you control.

  ADMIN_EMAIL, ADMIN_PASSWORD     The MAIN user (Super Admin). Created if missing;
                                  an existing account with that email is promoted
                                  if the system has no Super Admin yet. (min 12 chars)
  SEED_ROLE_USERS=true            Also create one account for every other role.
  SEED_USERS_PASSWORD             Password for those accounts (min 12 chars).
  SEED_USERS_DOMAIN               Email domain for them (default: seed.smartagri.local).

Seeding is idempotent: existing accounts are never modified and passwords are never reset.
"""
import os

from flask import current_app

SEED_ROLES = ['farmer', 'extension_officer', 'buyer', 'seller',
              'operations_admin', 'marketplace_admin', 'ai_admin', 'support_admin']
MIN_LEN = 12


def seed_accounts():
    from app import bcrypt, db
    from app.models import User
    from app.services.audit import audit
    log = current_app.logger

    email = os.environ.get('ADMIN_EMAIL', '').strip().lower()
    password = os.environ.get('ADMIN_PASSWORD', '')
    if email and password:
        existing = User.query.filter_by(email=email).first()
        if len(password) < MIN_LEN and not existing:
            log.error('ADMIN_PASSWORD must be at least %d characters; main user not created.', MIN_LEN)
        elif not existing:
            u = User(full_name=os.environ.get('ADMIN_NAME', 'SmartAgri Super Admin'), email=email,
                     password_hash=bcrypt.generate_password_hash(password).decode('utf-8'),
                     role='super_admin', district='Western Area Urban', preferred_language='en',
                     is_active=True, verification_status='verified')
            db.session.add(u)
            db.session.commit()
            audit('seed_main_user', category='security', target_type='user', target_id=u.id,
                  details={'email': email, 'role': 'super_admin'}, actor_email='system')
            log.info('Main user created: %s (super_admin)', email)
        elif existing.role != 'super_admin' and not User.query.filter_by(role='super_admin').first():
            old = existing.role
            existing.role = 'super_admin'
            existing.is_active = True
            existing.token_version = (existing.token_version or 0) + 1
            db.session.commit()
            audit('seed_promote_super_admin', category='security', target_type='user', target_id=existing.id,
                  details={'from': old}, actor_email='system')
            log.info('Existing account %s promoted to super_admin (none existed).', email)

    if os.environ.get('SEED_ROLE_USERS', '').lower() == 'true':
        pw = os.environ.get('SEED_USERS_PASSWORD', '')
        if len(pw) < MIN_LEN:
            log.error('SEED_ROLE_USERS=true but SEED_USERS_PASSWORD is missing or shorter than %d characters; skipped.', MIN_LEN)
        else:
            domain = os.environ.get('SEED_USERS_DOMAIN', 'seed.smartagri.local').strip().lstrip('@')
            created = []
            pw_hash = bcrypt.generate_password_hash(pw).decode('utf-8')
            for role in SEED_ROLES:
                addr = f'{role.replace("_", ".")}@{domain}'
                if User.query.filter_by(email=addr).first():
                    continue
                db.session.add(User(full_name=role.replace('_', ' ').title() + ' (seeded)', email=addr,
                                    password_hash=pw_hash, role=role, district='Western Area Urban',
                                    preferred_language='en', is_active=True, verification_status='verified'))
                created.append(addr)
            if created:
                db.session.commit()
                audit('seed_role_users', category='security', actor_email='system', details={'created': created})
                log.info('Seeded %d role account(s): %s', len(created), ', '.join(created))
            log.warning('SEED_ROLE_USERS is on. Turn it off once you no longer need the demo role accounts.')
