# Admin control centre: setup, roles and API

Open `/admin` after signing in with a staff account. Staff accounts are sent there automatically.

## 1. Your main user and demo role accounts are seeded on deploy (no passwords in the code)
Set these environment variables on Render, then deploy:

| Variable | Meaning |
|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your **main user** (Super Admin). Created if missing; if that email already exists and the system has no Super Admin, it is promoted. Password at least 12 characters. An existing password is never reset. |
| `SEED_ROLE_USERS=true` | Also create one account for each other role. |
| `SEED_USERS_PASSWORD` | Password for those accounts (at least 12 characters). Same for all of them, so keep it private. |
| `SEED_USERS_DOMAIN` | Email domain for them (default `seed.smartagri.local`). |

Accounts created when `SEED_ROLE_USERS=true` (with domain `example.org` for illustration):
`farmer@`, `extension.officer@`, `buyer@`, `seller@`, `operations.admin@`, `marketplace.admin@`, `ai.admin@`, `support.admin@`.
Seeding is idempotent: re-deploying never duplicates or modifies accounts. **Turn `SEED_ROLE_USERS` off when you no longer need them** (anyone who knows the shared password can sign in to those roles). The System page shows whether seeding is on.

The old built-in `admin@smartagri.sl` / public default password no longer exists in code. If your live database still has that account with the old password, the Overview shows a red alert: reset it or deactivate it.

## 2. Roles
Customers: `farmer`, `extension_officer`, `buyer`, `seller` (no admin access).
Staff: `super_admin`, `operations_admin`, `marketplace_admin`, `ai_admin`, `support_admin`, plus the legacy `admin` (keeps its old abilities, but is never a Super Admin).
Full matrix: Admin > Roles, or `GET /api/admin/roles`.

Rules enforced by the server:
- Permissions are read from the database on every request, never from the token. A forged or stale role in a token has no effect.
- Only a Super Admin can create/assign/remove staff roles, set per-user permissions, or permanently delete accounts.
- Nobody can change their own role, permissions or suspend/delete themselves. The last active Super Admin cannot be demoted or suspended.
- Suspending, restoring, changing role/permissions, resetting or changing a password ends all that user's sessions immediately (token version).
- Staff passwords must be 12+ characters, customer passwords 8+.

## 3. What is in the console
Overview (real counts, charts, notification centre), Users (search, filter, paginate, details, suspend/restore with reason, verification, role, password reset, permissions, create, delete), Roles, AI Models (health, usage, errors, live check), System (health, storage, credential presence, settings, backups note), Audit log (filter, CSV), Reports (CSV), Feedback.
Marketplace administration (listings, sellers, orders, payments, disputes) is NOT built yet: it arrives with the marketplace in Phase 5. The Overview says so instead of showing zeros.

## 4. API (all under `/api/admin`, all need a login and the listed permission)
| Endpoint | Permission |
|---|---|
| `GET /dashboard?days=` | reports.view or users.view |
| `GET /users?q&role&status&verification&district&page&per_page`, `GET /users/<id>` | users.view |
| `POST /users`, `PUT /users/<id>`, `POST /users/<id>/suspend\|restore\|verify` | users.manage (staff targets need roles.manage) |
| `POST /users/<id>/role` | roles.assign (customer roles) / roles.manage (staff roles) |
| `POST /users/<id>/reset-password` | users.reset_password |
| `PUT /users/<id>/permissions` | roles.manage |
| `DELETE /users/<id>` | users.delete |
| `GET /roles` | users.view or roles.manage |
| `GET /audit?category&action&outcome&actor&target_id&days&page` | audit.view |
| `GET /notifications` | notifications.view |
| `GET /feedback` | feedback.view |
| `GET /system/health` | system.view |
| `GET /ai/models`, `GET /ai/errors` | ai.view |
| `POST /ai/probe/<id>` | ai.manage |
| `GET /reports/<registrations\|districts\|ai_usage\|disease_trends\|crop_recommendations\|users\|audit>.csv` | reports.export (+ users.view / audit.view for the last two) |

Legacy paths `/api/auth/admin/*` and `/api/auth/admin-reset` still work but now use the same permission checks and audit logging.

## 5. Audit log
Written for: sign-in failures and admin sign-ins, permission denials, role/permission/verification changes, suspend/restore, password resets and changes, user creation/deletion, report exports, AI live checks, seeding. Entries store actor, role, target, outcome, IP and non-sensitive details (passwords/tokens are redacted). There is no API to edit or delete entries. Note: this is application-level protection; it does not stop someone with direct database access.

## 6. Database change
New tables `user_permissions`, `audit_logs`, and 4 new nullable/defaulted columns on `users` (`token_version`, `verification_status`, `suspended_reason`, `suspended_at`). `app/migrations.py` adds missing columns automatically at start-up without touching existing rows (tested). If the upgrade fails the app refuses to start rather than run half-upgraded. Back up your database before the first deploy of this version.

## 7. Not done yet
- **MFA (two-factor sign-in) is NOT implemented.** Use long unique staff passwords meanwhile.
- No CSRF tokens are used: the API authenticates with a bearer token in a header (not cookies), so classic CSRF does not apply; protection against XSS (CSP headers) comes in the security phase.
- Marketplace admin, payment verification and disputes: Phase 5.
- "Reported incorrect AI results" needs the expert-review workflow (Phase 6).
- Backups are not monitored by the app (shown as "unknown").
- Old `pages/AdminDashboard.jsx` was never routed in the original app; it is kept in the repository untouched but is superseded by the new console.
