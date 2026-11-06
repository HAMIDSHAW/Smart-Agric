import os
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_migrate import Migrate
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(basedir, '.env'))

from config import config, validate_production_config

db = SQLAlchemy()
jwt = JWTManager()
bcrypt = Bcrypt()
migrate = Migrate()


def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    if config_name == 'production':
        validate_production_config()

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    db.init_app(app)
    jwt.init_app(app)

    @jwt.token_in_blocklist_loader
    def _token_revoked(_header, payload):
        """Reject tokens of suspended/deleted users and tokens issued before a password
        change, role change or suspension (token_version mismatch)."""
        from app.models import User
        try:
            user = db.session.get(User, int(payload['sub']))
        except (TypeError, ValueError, KeyError):
            return True
        if not user or not user.is_active:
            return True
        return int(payload.get('tv', 0)) != int(user.token_version or 0)
    bcrypt.init_app(app)
    migrate.init_app(app, db)

    frontend_url = os.environ.get('FRONTEND_URL', '')
    allowed_origins = [
        "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://smartagri-sl.netlify.app",
        "https://smartagricsl.netlify.app",
    ]
    if frontend_url and frontend_url not in allowed_origins:
        allowed_origins.append(frontend_url)
    # Extra exact origins (e.g. a preview deploy) via comma-separated env var.
    # Wildcard origins such as https://*.netlify.app are intentionally NOT allowed.
    for origin in os.environ.get('CORS_EXTRA_ORIGINS', '').split(','):
        origin = origin.strip()
        if origin and '*' not in origin and origin not in allowed_origins:
            allowed_origins.append(origin)

    CORS(app, resources={
        r"/api/*": {
            "origins": allowed_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })

    os.makedirs(os.path.join(basedir, 'uploads', 'disease'), exist_ok=True)
    os.makedirs(os.path.join(basedir, 'uploads', 'soil'), exist_ok=True)

    from app.routes.auth import auth_bp
    from app.routes.disease import disease_bp
    from app.routes.recommend import recommend_bp
    from app.routes.fertilizer import fertilizer_bp
    from app.routes.land import land_bp
    from app.routes.pest import pest_bp
    from app.routes.chatbot import chatbot_bp
    from app.routes.soil import soil_bp
    from app.routes.weather import weather_bp
    from app.routes.history import history_bp
    from app.routes.community_map import community_map_bp
    from app.routes.impact import impact_bp
    from app.routes.crop_calendar import crop_calendar_bp
    from app.routes.post_harvest import post_harvest_bp
    from app.routes.disease_progress import disease_progress_bp
    from app.routes.crop_compare import crop_compare_bp
    from app.routes.field_intelligence import field_bp
    from app.routes.admin import admin_bp
    from app.routes.media import media_bp
    from app.routes.marketplace import market_bp
    from app.routes.marketplace_seller import seller_bp
    from app.routes.marketplace_admin import market_admin_bp
    from app.routes.feedback import feedback_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(disease_bp, url_prefix='/api/disease')
    app.register_blueprint(recommend_bp, url_prefix='/api/recommend')
    app.register_blueprint(fertilizer_bp, url_prefix='/api/fertilizer')
    app.register_blueprint(land_bp, url_prefix='/api/land')
    app.register_blueprint(pest_bp, url_prefix='/api/pest')
    app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
    app.register_blueprint(soil_bp, url_prefix='/api/soil')
    app.register_blueprint(weather_bp, url_prefix='/api/weather')
    app.register_blueprint(history_bp, url_prefix='/api/history')
    app.register_blueprint(community_map_bp, url_prefix='/api/community')
    app.register_blueprint(impact_bp, url_prefix='/api/impact')
    app.register_blueprint(crop_calendar_bp, url_prefix='/api/calendar')
    app.register_blueprint(post_harvest_bp, url_prefix='/api/post-harvest')
    app.register_blueprint(disease_progress_bp, url_prefix='/api/disease-progress')
    app.register_blueprint(crop_compare_bp, url_prefix='/api/crop-compare')
    app.register_blueprint(field_bp, url_prefix='/api/field')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(media_bp, url_prefix='/api/media')
    app.register_blueprint(market_bp, url_prefix='/api/marketplace')
    app.register_blueprint(seller_bp, url_prefix='/api/marketplace/seller')
    app.register_blueprint(market_admin_bp, url_prefix='/api/admin/marketplace')
    app.register_blueprint(feedback_bp, url_prefix='/api/feedback')

    @app.route('/health')
    def health_check():
        return {'status': 'ok', 'service': 'SmartAgri', 'version': '1.0'}, 200

    @app.route('/')
    def root():
        return {'status': 'ok', 'message': 'SmartAgri API is running'}, 200

    # Auto-create all tables on startup (safe - skips existing tables)
    with app.app_context():
        try:
            from app.models import (User, DiseaseAnalysis, CropRecommendation,
                FertilizerPlan, LandAssessment, SoilAnalysis, ChatMessage, PestAlert,
                CropCalendar, HarvestTracker, DiseaseProgressTrack, PostHarvestAdvice, Feedback, AIInferenceLog, UserPermission, AuditLog)
            from app import models_marketplace  # noqa: F401  (registers marketplace tables)
            db.create_all()
            print("✅ Database tables ready")
        except Exception as e:
            print(f"⚠️  db.create_all() error: {e}")
        # Additive column upgrades for existing databases. Failure is fatal on purpose:
        # running with a half-upgraded schema would break logins.
        from app.migrations import ensure_schema
        ensure_schema(db, app.logger)
        from app.models_marketplace import seed_reference_data
        seed_reference_data()

    # Create default admin and seed demo data on first run
    with app.app_context():
        try:
            from app.routes.auth import ensure_default_admin
            ensure_default_admin()
        except Exception as e:
            print(f"Note: Could not create default admin yet: {e}")

    # Auto-seed realistic data if DB is fresh — use file lock to prevent loop
    with app.app_context():
        import os as _os
        seed_flag = _os.path.join(basedir, '.seeded')
        # Demo data is opt-in only (SEED_DEMO_DATA=true). Never seeded silently in production.
        if _os.environ.get('SEED_DEMO_DATA', '').lower() == 'true' and not _os.path.exists(seed_flag):
            try:
                from app.models import User
                farmer_count = User.query.filter(User.role == 'farmer').count()
                if farmer_count < 5:
                    print("🌱 Fresh database detected — seeding demo data...")
                    seed_path = _os.path.join(basedir, 'seed_data.py')
                    if _os.path.exists(seed_path):
                        import importlib.util
                        spec = importlib.util.spec_from_file_location('seed_data', seed_path)
                        seed_mod = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(seed_mod)
                        seed_mod.seed()
                # Write flag file so seeder never runs again on this instance
                open(seed_flag, 'w').write('seeded')
            except Exception as e:
                print(f"Note: Could not seed data: {e}")

    @app.errorhandler(413)
    def too_large(_e):
        return jsonify({'error': 'The upload is too large. Please use a smaller photo.',
                        'error_code': 'too_large'}), 413

    @app.cli.command('purge-images')
    def purge_images():
        """Delete stored photos older than IMAGE_RETENTION_DAYS (default 365)."""
        import time
        import click
        days = int(os.environ.get('IMAGE_RETENTION_DAYS', '365'))
        cutoff = time.time() - days * 86400
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
        removed = 0
        for sub in ('disease', 'soil', 'progress'):
            d = os.path.join(root, sub)
            if not os.path.isdir(d):
                continue
            for name in os.listdir(d):
                f = os.path.join(d, name)
                if os.path.isfile(f) and os.path.getmtime(f) < cutoff:
                    os.remove(f)
                    removed += 1
        click.echo(f'Removed {removed} photo(s) older than {days} days.')

    return app
