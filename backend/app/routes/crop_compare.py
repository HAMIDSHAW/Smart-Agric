import os, json
from app.services import ai_gateway as _gw
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import requests as http_requests

crop_compare_bp = Blueprint('crop_compare', __name__)

def groq_json(prompt, max_tokens=800):
    """Groq llama-3.3-70b-versatile via the shared gateway. Returns (result_dict, error_string)."""
    return _gw.groq_json(prompt, task='crop_compare', max_tokens=max_tokens, timeout=45)


@crop_compare_bp.route('/compare', methods=['POST'])
@jwt_required()
def compare():
    data     = request.get_json()
    crop_a   = data.get('crop_a', '').strip()
    crop_b   = data.get('crop_b', '').strip()
    district = data.get('district', '').strip()
    nitrogen = data.get('nitrogen', 50)
    ph       = data.get('ph', 6.5)

    if not crop_a or not crop_b:
        return jsonify({'error': 'Two crops required for comparison'}), 400

    prompt = f"""Compare two crops for a Sierra Leone farmer making a planting decision.
Crop A: {crop_a}
Crop B: {crop_b}
District: {district or 'Sierra Leone'}
Soil nitrogen level: {nitrogen} mg/kg
Soil pH: {ph}

Respond ONLY with JSON, no markdown:
{{
  "crop_a": {{
    "name": "{crop_a}",
    "soil_match_score": <0-100>,
    "avg_yield_tonnes_per_hectare": <number>,
    "days_to_harvest": <integer>,
    "water_needs": "low/medium/high",
    "difficulty": "easy/medium/hard",
    "market_demand_sl": "low/medium/high",
    "estimated_revenue_nle_per_hectare": <integer>,
    "pros": ["pro 1", "pro 2"],
    "cons": ["con 1", "con 2"]
  }},
  "crop_b": {{
    "name": "{crop_b}",
    "soil_match_score": <0-100>,
    "avg_yield_tonnes_per_hectare": <number>,
    "days_to_harvest": <integer>,
    "water_needs": "low/medium/high",
    "difficulty": "easy/medium/hard",
    "market_demand_sl": "low/medium/high",
    "estimated_revenue_nle_per_hectare": <integer>,
    "pros": ["pro 1", "pro 2"],
    "cons": ["con 1", "con 2"]
  }},
  "recommendation": "<which crop to choose and why, specific to this farmer>",
  "winner": "{crop_a} or {crop_b}"
}}
Use realistic Sierra Leone 2024 market prices in NLE."""

    result, error = groq_json(prompt)
    if error:
        return jsonify({'error': error}), 502

    return jsonify(result), 200
