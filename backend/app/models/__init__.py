from app import db
from datetime import datetime

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='farmer')  # farmer, extension_officer, admin
    district = db.Column(db.String(80), nullable=True)
    preferred_language = db.Column(db.String(10), default='en')  # en or kr (Krio)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    # Added in Phase 4 (see app/migrations.py for the safe ALTER for existing databases)
    token_version = db.Column(db.Integer, nullable=False, default=0, server_default='0')
    verification_status = db.Column(db.String(20), nullable=False, default='unverified', server_default='unverified')
    suspended_reason = db.Column(db.String(255), nullable=True)
    suspended_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    disease_analyses = db.relationship('DiseaseAnalysis', backref='user', lazy=True, cascade='all, delete-orphan')
    recommendations = db.relationship('CropRecommendation', backref='user', lazy=True, cascade='all, delete-orphan')
    fertilizer_plans = db.relationship('FertilizerPlan', backref='user', lazy=True, cascade='all, delete-orphan')
    land_assessments = db.relationship('LandAssessment', backref='user', lazy=True, cascade='all, delete-orphan')
    soil_analyses = db.relationship('SoilAnalysis', backref='user', lazy=True, cascade='all, delete-orphan')
    chat_sessions = db.relationship('ChatMessage', backref='user', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'full_name': self.full_name,
            'email': self.email,
            'phone': self.phone,
            'role': self.role,
            'district': self.district,
            'preferred_language': self.preferred_language,
            'created_at': self.created_at.isoformat(),
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'is_active': bool(self.is_active),
            'verification_status': self.verification_status or 'unverified',
        }


class DiseaseAnalysis(db.Model):
    __tablename__ = 'disease_analyses'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    plant_type = db.Column(db.String(80), nullable=True)
    image_path = db.Column(db.String(255), nullable=True)
    is_healthy = db.Column(db.Boolean, nullable=True)
    disease_name = db.Column(db.String(150), nullable=True)
    confidence = db.Column(db.Float, nullable=True)
    pathogen = db.Column(db.String(200), nullable=True)
    treatment = db.Column(db.JSON, nullable=True)
    prevention = db.Column(db.JSON, nullable=True)
    causes = db.Column(db.JSON, nullable=True)
    field_location = db.Column(db.String(120), nullable=True)
    raw_response = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'plant_type': self.plant_type,
            # The server file path is never exposed; the photo is fetched through the
            # authenticated /api/media endpoint.
            'has_image': bool(self.image_path),
            'image_url': f'/api/media/disease/{self.id}' if self.image_path else None,
            'is_healthy': self.is_healthy,
            'disease_name': self.disease_name,
            'confidence': self.confidence,
            'pathogen': self.pathogen,
            'treatment': self.treatment,
            'prevention': self.prevention,
            'causes': self.causes,
            'field_location': self.field_location,
            'created_at': self.created_at.isoformat()
        }


class CropRecommendation(db.Model):
    __tablename__ = 'crop_recommendations'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nitrogen = db.Column(db.Float, nullable=False)
    phosphorus = db.Column(db.Float, nullable=False)
    potassium = db.Column(db.Float, nullable=False)
    ph = db.Column(db.Float, nullable=False)
    temperature = db.Column(db.Float, nullable=False)
    humidity = db.Column(db.Float, nullable=False)
    rainfall = db.Column(db.Float, nullable=False)
    district = db.Column(db.String(80), nullable=True)
    recommendations = db.Column(db.JSON, nullable=True)  # list of {crop, score, notes}
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'nitrogen': self.nitrogen,
            'phosphorus': self.phosphorus,
            'potassium': self.potassium,
            'ph': self.ph,
            'temperature': self.temperature,
            'humidity': self.humidity,
            'rainfall': self.rainfall,
            'district': self.district,
            'recommendations': self.recommendations,
            'created_at': self.created_at.isoformat()
        }


class FertilizerPlan(db.Model):
    __tablename__ = 'fertilizer_plans'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    crop = db.Column(db.String(80), nullable=False)
    growth_stage = db.Column(db.String(60), nullable=True)
    nitrogen = db.Column(db.Float, nullable=True)
    phosphorus = db.Column(db.Float, nullable=True)
    potassium = db.Column(db.Float, nullable=True)
    ph = db.Column(db.Float, nullable=True)
    deficiencies = db.Column(db.JSON, nullable=True)
    plan = db.Column(db.JSON, nullable=True)  # list of {fertilizer, qty, timing, notes}
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'crop': self.crop,
            'growth_stage': self.growth_stage,
            'nitrogen': self.nitrogen,
            'phosphorus': self.phosphorus,
            'potassium': self.potassium,
            'ph': self.ph,
            'deficiencies': self.deficiencies,
            'plan': self.plan,
            'notes': self.notes,
            'created_at': self.created_at.isoformat()
        }


class LandAssessment(db.Model):
    __tablename__ = 'land_assessments'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    district = db.Column(db.String(80), nullable=False)
    target_crop = db.Column(db.String(80), nullable=False)
    season = db.Column(db.String(40), nullable=True)
    plot_size = db.Column(db.Float, nullable=True)
    slope = db.Column(db.Float, nullable=True)
    suitability_score = db.Column(db.Integer, nullable=True)
    suitability_level = db.Column(db.String(20), nullable=True)  # High / Moderate / Low
    yield_min = db.Column(db.Float, nullable=True)
    yield_max = db.Column(db.Float, nullable=True)
    agronomist_notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'district': self.district,
            'target_crop': self.target_crop,
            'season': self.season,
            'plot_size': self.plot_size,
            'slope': self.slope,
            'suitability_score': self.suitability_score,
            'suitability_level': self.suitability_level,
            'yield_min': self.yield_min,
            'yield_max': self.yield_max,
            'agronomist_notes': self.agronomist_notes,
            'created_at': self.created_at.isoformat()
        }


class SoilAnalysis(db.Model):
    __tablename__ = 'soil_analyses'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    input_method = db.Column(db.String(20), nullable=False)  # 'image', 'manual', 'both'
    image_path = db.Column(db.String(255), nullable=True)
    # Manual inputs
    color = db.Column(db.String(40), nullable=True)
    texture = db.Column(db.String(40), nullable=True)
    moisture = db.Column(db.String(40), nullable=True)
    ph_manual = db.Column(db.Float, nullable=True)
    # Results
    soil_type = db.Column(db.String(60), nullable=True)
    confidence = db.Column(db.Float, nullable=True)
    characteristics = db.Column(db.JSON, nullable=True)
    suitable_crops = db.Column(db.JSON, nullable=True)
    improvement_tips = db.Column(db.JSON, nullable=True)
    district = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'input_method': self.input_method,
            'has_image': bool(self.image_path),
            'image_url': f'/api/media/soil/{self.id}' if self.image_path else None,
            'soil_type': self.soil_type,
            'confidence': self.confidence,
            'characteristics': self.characteristics,
            'suitable_crops': self.suitable_crops,
            'improvement_tips': self.improvement_tips,
            'district': self.district,
            'created_at': self.created_at.isoformat()
        }


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    session_id = db.Column(db.String(64), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    language = db.Column(db.String(10), default='en')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'role': self.role,
            'content': self.content,
            'language': self.language,
            'created_at': self.created_at.isoformat()
        }


class PestAlert(db.Model):
    __tablename__ = 'pest_alerts'

    id = db.Column(db.Integer, primary_key=True)
    district = db.Column(db.String(80), nullable=False)
    pest_name = db.Column(db.String(120), nullable=False)
    risk_level = db.Column(db.String(20), nullable=False)  # high / medium / low
    affected_crops = db.Column(db.JSON, nullable=True)
    description = db.Column(db.Text, nullable=True)
    recommended_action = db.Column(db.Text, nullable=True)
    temperature_trigger = db.Column(db.Float, nullable=True)
    humidity_trigger = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'district': self.district,
            'pest_name': self.pest_name,
            'risk_level': self.risk_level,
            'affected_crops': self.affected_crops,
            'description': self.description,
            'recommended_action': self.recommended_action,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat()
        }


class CropCalendar(db.Model):
    """Personalised planting calendar per farmer per crop."""
    __tablename__ = 'crop_calendars'

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    crop        = db.Column(db.String(80), nullable=False)
    district    = db.Column(db.String(80), nullable=True)
    season      = db.Column(db.String(40), nullable=True)
    planting_date = db.Column(db.String(40), nullable=True)
    calendar    = db.Column(db.JSON, nullable=True)   # list of {week, task, notes}
    harvest_date = db.Column(db.String(40), nullable=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'crop': self.crop, 'district': self.district,
            'season': self.season, 'planting_date': self.planting_date,
            'calendar': self.calendar, 'harvest_date': self.harvest_date,
            'created_at': self.created_at.isoformat()
        }


class HarvestTracker(db.Model):
    """Tracks harvest readiness countdown."""
    __tablename__ = 'harvest_trackers'

    id           = db.Column(db.Integer, primary_key=True)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    crop         = db.Column(db.String(80), nullable=False)
    planted_date = db.Column(db.String(40), nullable=False)
    days_to_harvest = db.Column(db.Integer, nullable=True)
    district     = db.Column(db.String(80), nullable=True)
    notes        = db.Column(db.Text, nullable=True)
    actual_yield = db.Column(db.Float, nullable=True)   # filled in post-harvest
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'crop': self.crop, 'planted_date': self.planted_date,
            'days_to_harvest': self.days_to_harvest, 'district': self.district,
            'notes': self.notes, 'actual_yield': self.actual_yield,
            'created_at': self.created_at.isoformat()
        }


class DiseaseProgressTrack(db.Model):
    """Photo progress tracking — multiple photos of same plant over time."""
    __tablename__ = 'disease_progress_tracks'

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    plant_label = db.Column(db.String(120), nullable=False)   # e.g. "Tomato Row 3 Field A"
    entries     = db.Column(db.JSON, nullable=True)            # list of {date, image_path, disease_name, confidence, status}
    trend       = db.Column(db.String(20), nullable=True)      # improving / stable / worsening
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'plant_label': self.plant_label,
            'entries': [
                {**{k: v for k, v in e.items() if k != 'image_path'},
                 'has_image': bool(e.get('image_path')),
                 'image_url': f'/api/media/progress/{self.id}/{i}' if e.get('image_path') else None}
                for i, e in enumerate(self.entries or []) if isinstance(e, dict)],
            'trend': self.trend,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class PostHarvestAdvice(db.Model):
    """Post-harvest storage advice log."""
    __tablename__ = 'post_harvest_advice'

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    crop       = db.Column(db.String(80), nullable=False)
    quantity   = db.Column(db.Float, nullable=True)
    district   = db.Column(db.String(80), nullable=True)
    advice     = db.Column(db.JSON, nullable=True)   # {storage_temp, moisture, container, duration, tips[]}
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'crop': self.crop, 'quantity': self.quantity,
            'district': self.district, 'advice': self.advice,
            'created_at': self.created_at.isoformat()
        }


class Feedback(db.Model):
    """Farmer feedback submissions (previously only printed to server logs)."""
    __tablename__ = 'feedback'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    name = db.Column(db.String(120))
    email = db.Column(db.String(160))
    subject = db.Column(db.String(200))
    message = db.Column(db.Text, nullable=False)
    email_delivered = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class AIInferenceLog(db.Model):
    """One row per AI provider call. No prompts, images, keys or responses are stored."""
    __tablename__ = 'ai_inference_logs'
    id = db.Column(db.Integer, primary_key=True)
    model_id = db.Column(db.String(120), nullable=False, index=True)
    provider = db.Column(db.String(30), nullable=False)
    task = db.Column(db.String(60), nullable=False, index=True)
    success = db.Column(db.Boolean, nullable=False, index=True)
    latency_ms = db.Column(db.Integer)
    error_kind = db.Column(db.String(40))
    http_status = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class UserPermission(db.Model):
    """Per-user permission override on top of the role's permissions (Super Admin managed)."""
    __tablename__ = 'user_permissions'
    __table_args__ = (db.UniqueConstraint('user_id', 'permission', name='uq_user_permission'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    permission = db.Column(db.String(60), nullable=False)
    granted = db.Column(db.Boolean, nullable=False)          # True = extra grant, False = explicit deny
    changed_by = db.Column(db.Integer, nullable=True)
    changed_at = db.Column(db.DateTime, default=datetime.utcnow)


class AuditLog(db.Model):
    """Append-only record of sensitive actions and security events. No API edits or deletes rows."""
    __tablename__ = 'audit_logs'
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    category = db.Column(db.String(20), nullable=False, index=True)   # admin | security | auth
    action = db.Column(db.String(60), nullable=False, index=True)
    outcome = db.Column(db.String(20), nullable=False, default='success')
    actor_id = db.Column(db.Integer, nullable=True, index=True)
    actor_email = db.Column(db.String(120), nullable=True)
    actor_role = db.Column(db.String(30), nullable=True)
    target_type = db.Column(db.String(30), nullable=True)
    target_id = db.Column(db.String(40), nullable=True, index=True)
    details = db.Column(db.JSON, nullable=True)
    ip = db.Column(db.String(64), nullable=True)
