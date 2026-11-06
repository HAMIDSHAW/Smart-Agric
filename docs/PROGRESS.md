# SmartAgri Upgrade — Progress & Implementation Log
Resume from this file in any new session. Baseline git commit: `0ae7d94` (original ZIP).

## Status
| Phase | State |
|---|---|
| 0 Baseline & audit | DONE (see docs/AI_MODEL_INVENTORY.md) |
| 1 Security & existing-system repair | DONE in code, 10/10 automated tests pass. Provider checks need real keys (see below) |
| 2 AI reliability & monitoring | DONE in code; 68/68 backend tests pass (mocked providers). Live provider checks need keys |
| 3 Camera & gallery | DONE in code: 78 backend + 25 frontend tests pass. NOT tested on a real Android phone (see limitations) |
| 4 Admin dashboard (RBAC) | DONE in code: 124 backend + 45 frontend tests pass. MFA NOT done; marketplace admin waits for Phase 5 |
| 5 Marketplace | DONE in code: 174 backend + 72 frontend tests pass. NO online payment provider connected (offline methods only); no delivery network |
| 6 Agri intelligence / expert validation / offline | NEXT |
| 7 UI/UX redesign | pending |
| 8 Full testing & deployment docs | pending |

## Phase 5 changes
See `docs/MARKETPLACE.md` (features, payment honesty, adding a provider, trust and safety, limitations).
- Backend: `models_marketplace.py` (18 additive tables + default categories), `routes/marketplace.py` (public, cart, wishlist, idempotent checkout with stock locking, orders, reviews, reports, disputes, webhook, enquiries, buyer requests, suggestions, price context), `routes/marketplace_seller.py` (onboarding, listings, photos, stock, orders, payment confirmation, dashboard, AI description), `routes/marketplace_admin.py` (sellers, listings, categories, orders, payments, reports, disputes, reviews, settings), `services/payments.py` (provider framework, HMAC webhook adapter used only in tests), shared helpers; admin dashboard/notifications now show real marketplace data; llama task `marketplace_description` added to the model registry.
- Frontend: `/market/*` (home, search, product, storefront, cart, checkout, orders, messages, buyer requests), `/market/sell/*` (dashboard, listings with camera/gallery, orders), `/admin/marketplace`, `MarketSuggestions` in crop recommendation results, nav links.
- Tests: `backend/tests/test_phase5_market.py` (50), `frontend/src/pages/market/market.test.jsx` (27).
- Security fix found while testing: demo seed script no longer creates a public-password admin or farmers.

## Phase 4 changes
See `docs/ADMIN_SETUP.md` for setup, roles, API list, seeding variables and limitations.
- Backend: RBAC (`services/rbac.py`: 5 staff roles + legacy admin, 17 permissions, DB-checked on every request, per-user overrides by Super Admin); token versioning (`tv` claim + JWT blocklist loader) so suspension, role/permission change and password change end sessions immediately; append-only audit log (`services/audit.py`, table `audit_logs`); deploy-time seeding (`services/seeding.py`); additive schema upgrade (`app/migrations.py`); `routes/admin.py` rewritten (dashboard, users CRUD+actions, roles matrix, permissions, audit, notifications, feedback, system health, 7 CSV reports, AI monitoring); legacy `/api/auth/admin/*` moved onto the same checks; buyer/seller roles introduced; login/refresh responses include `permissions` and `is_staff`; registration min password 8, staff 12.
- Frontend: `/admin` console (Overview, Users, Roles, AI Models, System, Audit, Reports, Feedback), permission-aware navigation with mobile drawer, notification centre, confirmation dialogs for sensitive actions, staff login redirect, password change keeps the current session. Old unrouted `AdminDashboard.jsx` left in place.
- Tests: `backend/tests/test_phase4_admin.py` (46 cases), `frontend/src/pages/admin/admin.test.jsx`, `Login.test.jsx`. A test found and fixed a real accessibility bug (dialog stole focus while typing).

## Phase 3 changes
- NEW `frontend/src/components/ImageCapture.jsx` (+ `UploadProgress`): one reusable capture component. In-app live camera via getUserMedia (rear camera preferred, audio never requested, permission explained first), capture -> preview -> retake/use, camera switching only when >1 camera, torch only when the track reports support, gallery picker (JPEG/PNG/WebP, multiple where enabled), drag-and-drop on desktop, remove/replace, per-photo quality warnings (dark/blurry, via existing `utils/imageQuality.js`) that never silently reject, purpose-specific tips (leaf/plant/pest/soil/product), fallback to the phone's camera app (`capture="environment"`) when getUserMedia is unavailable or blocked. Stream is released on capture, close, Escape, tab hidden, page exit and unmount.
- NEW `utils/capture.js` (validation, HEIC explanation, error classification), `hooks/useAuthedImage.js` (loads private photos with the login token).
- Integrated into: Disease Detection (`DiseaseModule`), QuickScan (guest), Soil Analysis (`SoilModule`), and a NEW Disease Progress Tracker screen (`DiseaseProgressModule`, route `/dashboard/progress`, nav "Disease Progress") - the backend existed but had no UI. Upload progress bars added. Soil screen shows the "estimate, not a lab result" note.
- Backend: NEW `routes/media.py` (private photo read/delete with ownership checks, traversal-proof path resolution, image-extension whitelist, no-store headers); API no longer leaks server file paths (`image_path` replaced by `has_image` + `image_url`); JSON 413 for oversized uploads; `flask purge-images` retention command; see `docs/IMAGE_PRIVACY_AND_RETENTION.md`.
- i18n: `capture.*` keys in English (complete) and Krio (core buttons only - NEEDS native-speaker review; other keys fall back to English).
- Tests: `backend/tests/test_phase3_media.py` (10), frontend `vitest` suite (25: helpers, component camera/gallery flows with mocked getUserMedia, QuickScan integration). Run: `cd frontend && npm test`.
- Dependencies (dev only): vitest, jsdom, @testing-library/*.
- Contract change to note: history/analysis JSON no longer contains `image_path`.

## Phase 2 changes
- NEW `backend/app/services/ai_gateway.py`: provider-specific auth (Groq key only to Groq, Anthropic key only to Anthropic), timeouts, bounded retries (default 1, transient errors only), error classification, response validation, circuit breaker (5 consecutive transient failures -> 30s pause), usage logging. Prompts/images/keys are never logged.
- NEW `backend/app/services/model_registry.py`: all 16 models/engines (preservation list), `GROQ_VISION_MODELS` override.
- NEW `backend/app/services/images.py` (Pillow): content-based validation (not extension), EXIF orientation fix, bounded resize (1600px), JPEG re-encode with no colour/sharpness changes, quality WARNINGS (dark, overexposed, blurry, low resolution) with farmer advice; only corrupt/unsupported/empty/huge files are rejected, with a reason. Original photo is kept for review; stored extension comes from detected format.
- NEW `backend/app/services/ratelimit.py`: in-memory sliding window (single-process; use Redis if you scale to several workers). Applied to login (10/5min), register (10/h), forgot-password (5/h), guest scan (3/min, 20/h), authenticated disease/soil/progress uploads.
- NEW table `ai_inference_logs` (additive). NEW admin endpoints: `GET /api/admin/ai/models`, `GET /api/admin/ai/errors`, `POST /api/admin/ai/probe/<id>`.
- `disease.py` rewritten around the gateway: SAME models; vision failure -> clearly labelled general guidance (`image_analyzed:false`, confidence 0, not saved to history); total failure -> honest 503 without leaking env-var names; all new response fields are additive. Shared `run_detection` for guest + logged-in routes.
- `chatbot.py` (same fallback chain), `crop_calendar.py`, `crop_compare.py`, `post_harvest.py`, `field_intelligence.py`, `disease_progress.py` now call the gateway (same models, prompts, routes).
- `soil.py`: upload validated; the colour engine now receives real decoded pixels (lossless PNG) instead of JPEG byte estimates; response adds `is_laboratory_result:false`, `nutrients_are_estimates:true`, `assessment_type`, `data_source_note`.
- Frontend: `DiseaseModule.jsx` shows a "photo not analysed - general guidance (not a diagnosis)" card and photo-quality tips; `QuickScan.jsx` handles `image_analyzed:false`.
- Dependency added: `Pillow>=10.4,<12`. Env var added: `GROQ_VISION_MODELS` (optional).
- Tests: `backend/tests/test_phase2.py` (preservation list, gateway, images, disease/soil/progress/chatbot routes, rate limits, admin AI endpoints).

## Phase 1 changes
- `backend/config.py`: `validate_production_config()` — production refuses to start without strong SECRET_KEY, JWT_SECRET_KEY, DATABASE_URL. Added `TestingConfig`. DB TLS verification opt-in via `DB_SSL_VERIFY=true` (default unchanged to avoid breaking current hosting).
- `backend/app/__init__.py`: calls validator; CORS wildcards (`*.netlify.app`, `*.onrender.com`) removed, exact origins + `CORS_EXTRA_ORIGINS`; registered `admin_bp` (/api/admin) and `feedback_bp` (/api/feedback); demo seeding now opt-in (`SEED_DEMO_DATA=true`).
- `backend/app/routes/auth.py`: removed hardcoded admin credentials; admin bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; startup WARNING if legacy default admin still has the old password; password-reset token no longer logged; admin reset min length 8.
- `backend/app/routes/admin.py`: cannot delete admin accounts; cannot change own role; min password 8.
- `backend/app/routes/feedback.py`: now stored in new `feedback` table (additive, created by existing `create_all`), input limits, no message text in logs, reports real email delivery state.
- `backend/app/routes/disease_progress.py`: Anthropic call now uses `ANTHROPIC_API_KEY` (same model `claude-haiku-4-5-20251001`); failed analysis entries flagged `analysis_failed` and no longer look like a diagnosis.
- `frontend/src/modules/DiseaseDetectionModule.jsx`: `/api/disease/analyze` -> `/api/disease/detect` (component is not currently routed; its camera code will seed Phase 3).
- `.gitignore` rewritten as UTF-8; `.env` files and farmer upload photos removed from the project; `.env.example` placeholders only; `render.yaml` lists new env vars.
- Tests: `backend/tests/test_phase1.py` (run `cd backend && pytest tests`).

## New environment variables
ADMIN_EMAIL, ADMIN_PASSWORD, ANTHROPIC_API_KEY (already existed), CORS_EXTRA_ORIGINS, DB_SSL_VERIFY, SEED_DEMO_DATA, HUGGINGFACE_API_TOKEN (add to Render if reconnecting HF models).

## Known open items / limitations
- Provider verification (Groq model IDs incl. `qwen/qwen3.8-27b` vs comment "3.6", Anthropic call, HF endpoints) NOT done: sandbox cannot reach those APIs and no keys are supplied. Status of every model: "Not yet verified" except code-level fixes.
- HF models (#6-#8) not reconnected: cannot be verified from the build environment. Use the admin probe pattern once an HF token is available.
- Evaluation metrics (accuracy/F1) cannot be produced: no labelled test set is in the repo. Do not quote accuracy figures until one is evaluated.
- Rate limiter is per-process memory.
- Marketplace: no online payment provider, no delivery network, no email/SMS notifications; uploads need a persistent disk on hosts with ephemeral storage. See docs/MARKETPLACE.md.
- Existing crop-recommendation screen shows static MAFFS 2024 price figures that were already in the app (source labelled there); the marketplace never invents prices.
- MFA for staff is not implemented. Marketplace/payment/dispute administration depends on Phase 5. Admin console look is a fixed light/dark layout (not the farmer app's theme switch).
- The role-seeded demo accounts share one password: switch `SEED_ROLE_USERS` off after demos.
- Existing live databases get new columns automatically; back up before first deploy.
- NOT verified on a physical Android phone or real browsers (only jsdom with a mocked camera). Real-device check needed: rear camera, permission prompt, torch, gallery on Chrome/Android. iOS Safari needs HTTPS for getUserMedia.
- Marketplace product-photo capture (Phase 5) will reuse ImageCapture with `multiple`; QuickScan guest photos are not stored.
- Photo retention purge is a command, not scheduled; add a Render Cron Job.
- Original full-resolution photos are not kept: the client compresses to 1024 px before upload.
- Pest identification by photo does not exist yet in the app (pest alerts are weather-rule based); the component supports `purpose="pest"` when that feature is added.
- JWT role claim can be stale up to 24h after a role change; DB-checked RBAC comes in Phase 4.
- No self-service password reset yet (no email provider). Admin-assisted reset only.
- Frontend `api.resetPassword` calls a non-existent endpoint (unused).
- Git history of the ORIGINAL GitHub repo may contain the old .env values; this ZIP had no history. Rotate regardless.
