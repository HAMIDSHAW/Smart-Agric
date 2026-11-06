"""
Field Intelligence, inspired by Farmonaut's satellite analytics.
We use AI + weather + soil data instead of satellite imagery.
Provides: Yield Prediction, Field Health Score, Carbon Footprint Estimate.
"""
import os, json
from app.services import ai_gateway as _gw
import requests as http_requests
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import DiseaseAnalysis, CropRecommendation, SoilAnalysis

field_bp = Blueprint('field', __name__)


def groq_json(prompt, max_tokens=600):
    """Groq llama-3.3-70b-versatile via the shared gateway. Returns (result_dict, error_string)."""
    return _gw.groq_json(prompt, task='yield_prediction', max_tokens=max_tokens, timeout=40, retries=0,
                         system='You are an expert Sierra Leone agricultural scientist. Respond with valid JSON only.')


@field_bp.route('/yield-prediction', methods=['POST'])
@jwt_required()
def yield_prediction():
    """AI-powered yield prediction based on crop, soil, district, and season."""
    user_id = int(get_jwt_identity())
    data = request.get_json()
    crop      = data.get('crop', '').strip()
    district  = data.get('district', '').strip()
    soil_type = data.get('soil_type', '').strip()
    plot_size = float(data.get('plot_size', 1.0) or 1.0)
    season    = data.get('season', 'Rainy Season')
    practices = data.get('practices', 'traditional')  # traditional / improved / best

    if not crop:
        return jsonify({'error': 'Crop name required'}), 400

    prompt = f"""Predict crop yield for a Sierra Leone farmer.
Crop: {crop}
District: {district or 'Sierra Leone'}
Soil type: {soil_type or 'Unknown'}
Plot size: {plot_size} hectares
Season: {season}
Farming practices: {practices} (traditional=basic/no inputs, improved=some fertilizer+certified seed, best=full package)

Respond ONLY with JSON:
{{
  "crop": "{crop}",
  "plot_size_ha": {plot_size},
  "min_yield_kg": <minimum expected kg for this plot>,
  "max_yield_kg": <maximum expected kg for this plot>,
  "expected_yield_kg": <most likely kg for this plot>,
  "yield_per_ha": "<e.g. 1.2-2.4 tonnes/ha>",
  "market_value_nle": <estimated market value in Sierra Leone Leones>,
  "confidence": <percentage 60-90>,
  "limiting_factors": ["factor 1", "factor 2"],
  "how_to_improve": ["action 1 to increase yield", "action 2"],
  "harvest_month": "<expected harvest month based on planting now in {season}>",
  "grade": "A" or "B" or "C" or "D"
}}
Use realistic Sierra Leone 2024 data. Account for typical weather, pests, and market prices in {district}."""

    result, error = groq_json(prompt)
    if error:
        return jsonify({'error': error}), 502
    return jsonify(result), 200


@field_bp.route('/health-score', methods=['POST'])
@jwt_required()
def field_health_score():
    """
    Calculate a Field Health Score (0-100) based on soil, disease history,
    and farming practices, our equivalent of Farmonaut's NDVI score.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json()

    # Pull user's recent data from DB to build the score
    try:
        recent_diseases = DiseaseAnalysis.query.filter_by(user_id=user_id)\
            .order_by(DiseaseAnalysis.created_at.desc()).limit(10).all()
        recent_soil = SoilAnalysis.query.filter_by(user_id=user_id)\
            .order_by(SoilAnalysis.created_at.desc()).first()
    except Exception:
        recent_diseases = []
        recent_soil = None

    total = len(recent_diseases)
    diseased = sum(1 for d in recent_diseases if not d.is_healthy)
    healthy_pct = ((total - diseased) / total * 100) if total > 0 else 70

    # Base score from disease history
    disease_score = min(100, max(20, healthy_pct))

    # Soil score
    soil_score = 70  # default
    if recent_soil:
        soil_map = {'Loam': 90, 'Sandy Loam': 80, 'Clay Loam': 75,
                    'Clay': 65, 'Laterite': 60, 'Sandy': 50}
        soil_score = soil_map.get(recent_soil.soil_type, 70)

    # Extra data from request
    uses_fertilizer = data.get('uses_fertilizer', False)
    uses_rotation   = data.get('uses_rotation', False)
    has_irrigation  = data.get('has_irrigation', False)
    years_farming   = int(data.get('years_farming', 3))

    practice_score = 60
    if uses_fertilizer: practice_score += 10
    if uses_rotation:   practice_score += 10
    if has_irrigation:  practice_score += 10
    if years_farming > 5: practice_score += 5
    practice_score = min(100, practice_score)

    overall = round(disease_score * 0.4 + soil_score * 0.35 + practice_score * 0.25)

    grade = 'A' if overall >= 80 else 'B' if overall >= 65 else 'C' if overall >= 50 else 'D'

    improvements = []
    if disease_score < 70: improvements.append('Several diseased scans detected, treat affected crops and scout weekly')
    if soil_score < 70:    improvements.append('Soil type has low fertility, add compost or organic matter before next planting')
    if not uses_fertilizer: improvements.append('Using fertilizer can increase yield by 30-50%, start with NPK at planting')
    if not uses_rotation:   improvements.append('Practice crop rotation, alternate between cereals and legumes each season')
    if not has_irrigation:  improvements.append('Even basic drip irrigation in the dry season can double your income')

    return jsonify({
        'overall_score':   overall,
        'grade':           grade,
        'breakdown': {
            'crop_health': round(disease_score),
            'soil_health': soil_score,
            'practices':   round(practice_score),
        },
        'total_scans':     total,
        'diseased_scans':  diseased,
        'soil_type':       recent_soil.soil_type if recent_soil else 'Not analysed yet',
        'improvements':    improvements[:3],
        'label':           'Excellent' if grade == 'A' else 'Good' if grade == 'B' else 'Fair' if grade == 'C' else 'Needs Attention',
    }), 200


@field_bp.route('/carbon-footprint', methods=['POST'])
@jwt_required()
def carbon_footprint():
    """
    Estimate the carbon footprint of a farmer's practices.
    Inspired by Farmonaut's carbon MRV system.
    """
    data = request.get_json()
    crop          = data.get('crop', '')
    plot_size     = float(data.get('plot_size', 1.0) or 1.0)
    fertilizer_kg = float(data.get('fertilizer_kg', 0) or 0)
    uses_tractor  = data.get('uses_tractor', False)
    burns_residue = data.get('burns_residue', False)
    uses_compost  = data.get('uses_compost', False)
    trees_on_farm = int(data.get('trees_on_farm', 0) or 0)

    # Emission factors (kg CO2 equivalent)
    fertilizer_emission = fertilizer_kg * 6.0       # synthetic fertilizer
    tractor_emission    = plot_size * 50 if uses_tractor else 0
    burning_emission    = plot_size * 200 if burns_residue else 0

    # Carbon sequestration
    crop_sequestration  = plot_size * 2000           # crops absorb CO2 while growing
    tree_sequestration  = trees_on_farm * 22         # each tree sequesters ~22kg CO2/year
    compost_reduction   = plot_size * 80 if uses_compost else 0

    total_emissions     = round(fertilizer_emission + tractor_emission + burning_emission)
    total_sequestration = round(crop_sequestration + tree_sequestration + compost_reduction)
    net_footprint       = total_emissions - total_sequestration

    status = 'carbon_negative' if net_footprint < 0 else 'carbon_neutral' if net_footprint < 100 else 'carbon_positive'

    tips = []
    if burns_residue:
        tips.append('Stop burning crop residue, compost it instead to reduce CO2 by 200kg per hectare')
    if fertilizer_kg > 150 * plot_size:
        tips.append('You are over-applying fertilizer, reducing by 20% saves money and cuts emissions')
    if trees_on_farm < 5:
        tips.append('Plant trees on field borders, each tree sequesters 22kg of CO2 per year and improves soil')
    if not uses_compost:
        tips.append('Use compost instead of burning residue, adds nutrients back and reduces carbon footprint')

    return jsonify({
        'plot_size_ha':        plot_size,
        'total_emissions_kg':  total_emissions,
        'total_sequestration_kg': total_sequestration,
        'net_footprint_kg':    net_footprint,
        'status':              status,
        'status_label':        'Carbon Negative (Great!)' if status == 'carbon_negative' else 'Carbon Neutral' if status == 'carbon_neutral' else 'Carbon Positive',
        'breakdown': {
            'fertilizer_emissions': round(fertilizer_emission),
            'tractor_emissions':    round(tractor_emission),
            'burning_emissions':    round(burning_emission),
            'crop_sequestration':   round(crop_sequestration),
            'tree_sequestration':   round(tree_sequestration),
            'compost_benefit':      round(compost_reduction),
        },
        'improvement_tips': tips[:3],
        'note': 'Estimates based on standard agricultural emission factors. For certified carbon credits, a field audit is required.'
    }), 200
