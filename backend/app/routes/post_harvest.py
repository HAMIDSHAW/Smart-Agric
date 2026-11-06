import os, json
from app.services import ai_gateway as _gw
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import PostHarvestAdvice
import requests as http_requests

post_harvest_bp = Blueprint('post_harvest', __name__)

def groq_json(prompt, max_tokens=800):
    """Groq llama-3.3-70b-versatile via the shared gateway. Returns (result_dict, error_string)."""
    return _gw.groq_json(prompt, task='post_harvest', max_tokens=max_tokens, timeout=45)


@post_harvest_bp.route('/advice', methods=['POST'])
@jwt_required()
def get_advice():
    user_id  = int(get_jwt_identity())
    data     = request.get_json()
    crop     = data.get('crop', '').strip()
    quantity = data.get('quantity')
    district = data.get('district', '').strip()

    if not crop:
        return jsonify({'error': 'Crop name required'}), 400

    prompt = f"""Give post-harvest storage advice for a smallholder farmer in Sierra Leone.
Crop: {crop}
Quantity: {str(quantity) + ' kg' if quantity else 'not specified'}
District: {district or 'Sierra Leone'}

Respond ONLY with JSON, no markdown:
{{
  "storage_duration": "<how long it can be stored safely>",
  "ideal_temperature": "<temperature range>",
  "moisture_control": "<moisture advice>",
  "best_containers": ["container type 1", "container type 2"],
  "common_mistakes": ["mistake 1", "mistake 2"],
  "tips": ["specific tip 1", "specific tip 2", "specific tip 3", "specific tip 4"],
  "market_timing": "<when to sell for best price>",
  "value_addition": "<simple processing ideas to increase value>"
}}
Be specific for Sierra Leone conditions: humidity, available materials, local market."""

    result, error = groq_json(prompt)
    if error:
        return jsonify({'error': error}), 502

    try:
        record = PostHarvestAdvice(
            user_id=user_id, crop=crop, quantity=quantity,
            district=district, advice=result
        )
        db.session.add(record)
        db.session.commit()
        result['id'] = record.id
    except Exception as e:
        db.session.rollback()

    return jsonify(result), 200


@post_harvest_bp.route('/history', methods=['GET'])
@jwt_required()
def history():
    user_id = int(get_jwt_identity())
    try:
        records = PostHarvestAdvice.query.filter_by(user_id=user_id)\
            .order_by(PostHarvestAdvice.created_at.desc()).limit(10).all()
        return jsonify({'records': [r.to_dict() for r in records]}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'records': []}), 200
