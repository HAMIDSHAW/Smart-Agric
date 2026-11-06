from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import DiseaseAnalysis, CropRecommendation, FertilizerPlan, SoilAnalysis, User
from sqlalchemy import func
from datetime import datetime, timedelta, time as dt_time

impact_bp = Blueprint('impact', __name__)

@impact_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_impact_stats():
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, dt_time.min)
    week_start  = datetime.utcnow() - timedelta(days=7)

    total_farmers      = User.query.filter_by(is_active=True).count()
    total_disease      = DiseaseAnalysis.query.count()
    total_diseased     = DiseaseAnalysis.query.filter_by(is_healthy=False).count()
    total_recommend    = CropRecommendation.query.count()
    total_fertilizer   = FertilizerPlan.query.count() if hasattr(FertilizerPlan, '__table__') else 0
    total_soil         = SoilAnalysis.query.count()

    today_scans   = DiseaseAnalysis.query.filter(DiseaseAnalysis.created_at >= today_start).count()
    week_diseases = DiseaseAnalysis.query.filter(
        DiseaseAnalysis.created_at >= week_start, DiseaseAnalysis.is_healthy == False
    ).count()

    # Districts with any activity
    disease_districts = db.session.query(User.district).join(
        DiseaseAnalysis, DiseaseAnalysis.user_id == User.id
    ).filter(User.district.isnot(None)).distinct().count()

    # Crop breakdown from recommendations JSON field
    all_recs = CropRecommendation.query.with_entities(CropRecommendation.recommendations).all()
    crop_counts = {}
    for (recs,) in all_recs:
        if recs and isinstance(recs, list) and len(recs) > 0:
            top = recs[0].get('crop') if isinstance(recs[0], dict) else None
            if top:
                crop_counts[top] = crop_counts.get(top, 0) + 1
    sorted_crops = sorted(crop_counts.items(), key=lambda x: x[1], reverse=True)[:6]
    total_crop_recs = sum(c for _, c in sorted_crops)
    crop_breakdown = [
        {'crop': name, 'count': cnt,
         'pct': round(cnt / total_crop_recs * 100) if total_crop_recs else 0}
        for name, cnt in sorted_crops
    ]

    # District breakdown
    district_rows = db.session.query(
        User.district,
        func.count(User.id).label('farmers'),
        func.count(DiseaseAnalysis.id).label('scans'),
    ).outerjoin(DiseaseAnalysis, DiseaseAnalysis.user_id == User.id)\
     .filter(User.is_active == True, User.district.isnot(None))\
     .group_by(User.district)\
     .order_by(func.count(User.id).desc()).limit(8).all()

    district_breakdown = [
        {'district': r.district, 'farmers': r.farmers, 'scans': r.scans}
        for r in district_rows
    ]

    # Recent disease names for ticker
    recent = DiseaseAnalysis.query.filter(
        DiseaseAnalysis.is_healthy == False,
        DiseaseAnalysis.disease_name.isnot(None),
        DiseaseAnalysis.created_at >= week_start
    ).order_by(DiseaseAnalysis.created_at.desc()).limit(5).all()

    recent_diseases = [r.disease_name for r in recent]

    return jsonify({
        'totals': {
            'farmers':       total_farmers,
            'disease_scans': total_disease,
            'diseased':      total_diseased,
            'recommendations': total_recommend,
            'fertilizer_plans': total_fertilizer,
            'soil_analyses': total_soil,
            'districts':     disease_districts,
        },
        'today': {
            'scans':    today_scans,
            'diseases': week_diseases,
        },
        'crop_breakdown':    crop_breakdown,
        'district_breakdown': district_breakdown,
        'recent_diseases':   recent_diseases,
    }), 200
