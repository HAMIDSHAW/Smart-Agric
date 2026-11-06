from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import DiseaseAnalysis, CropRecommendation, FertilizerPlan, LandAssessment, SoilAnalysis

history_bp = Blueprint('history', __name__)

@history_bp.route('/all', methods=['GET'])
@jwt_required()
def get_all_history():
    user_id = int(get_jwt_identity())
    limit = request.args.get('limit', 20, type=int)

    disease = DiseaseAnalysis.query.filter_by(user_id=user_id).order_by(DiseaseAnalysis.created_at.desc()).limit(limit).all()
    recommend = CropRecommendation.query.filter_by(user_id=user_id).order_by(CropRecommendation.created_at.desc()).limit(limit).all()
    fertilizer = FertilizerPlan.query.filter_by(user_id=user_id).order_by(FertilizerPlan.created_at.desc()).limit(limit).all()
    land = LandAssessment.query.filter_by(user_id=user_id).order_by(LandAssessment.created_at.desc()).limit(limit).all()
    soil = SoilAnalysis.query.filter_by(user_id=user_id).order_by(SoilAnalysis.created_at.desc()).limit(limit).all()

    all_items = []
    for d in disease:
        all_items.append({'type': 'disease', 'created_at': d.created_at.isoformat(), 'data': d.to_dict()})
    for r in recommend:
        all_items.append({'type': 'recommendation', 'created_at': r.created_at.isoformat(), 'data': r.to_dict()})
    for f in fertilizer:
        all_items.append({'type': 'fertilizer', 'created_at': f.created_at.isoformat(), 'data': f.to_dict()})
    for la in land:
        all_items.append({'type': 'land', 'created_at': la.created_at.isoformat(), 'data': la.to_dict()})
    for s in soil:
        all_items.append({'type': 'soil', 'created_at': s.created_at.isoformat(), 'data': s.to_dict()})

    all_items.sort(key=lambda x: x['created_at'], reverse=True)

    # Summary stats
    stats = {
        'total_disease_analyses': DiseaseAnalysis.query.filter_by(user_id=user_id).count(),
        'diseases_detected': DiseaseAnalysis.query.filter_by(user_id=user_id, is_healthy=False).count(),
        'healthy_plants': DiseaseAnalysis.query.filter_by(user_id=user_id, is_healthy=True).count(),
        'total_recommendations': CropRecommendation.query.filter_by(user_id=user_id).count(),
        'total_fertilizer_plans': FertilizerPlan.query.filter_by(user_id=user_id).count(),
        'total_land_assessments': LandAssessment.query.filter_by(user_id=user_id).count(),
        'total_soil_analyses': SoilAnalysis.query.filter_by(user_id=user_id).count(),
    }

    return jsonify({
        'history': all_items[:limit],
        'stats': stats
    }), 200


@history_bp.route('/dashboard-summary', methods=['GET'])
@jwt_required()
def dashboard_summary():
    user_id = int(get_jwt_identity())

    recent_disease = DiseaseAnalysis.query.filter_by(user_id=user_id).order_by(DiseaseAnalysis.created_at.desc()).limit(5).all()
    recent_recommend = CropRecommendation.query.filter_by(user_id=user_id).order_by(CropRecommendation.created_at.desc()).limit(3).all()

    return jsonify({
        'stats': {
            'disease_analyses': DiseaseAnalysis.query.filter_by(user_id=user_id).count(),
            'diseases_detected': DiseaseAnalysis.query.filter_by(user_id=user_id, is_healthy=False).count(),
            'recommendations': CropRecommendation.query.filter_by(user_id=user_id).count(),
            'fertilizer_plans': FertilizerPlan.query.filter_by(user_id=user_id).count(),
            'land_assessments': LandAssessment.query.filter_by(user_id=user_id).count(),
        },
        'recent_disease': [d.to_dict() for d in recent_disease],
        'recent_recommendations': [r.to_dict() for r in recent_recommend]
    }), 200
