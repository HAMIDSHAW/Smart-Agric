import os, json
from app.services import ai_gateway as _gw
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import CropCalendar, HarvestTracker
import requests as http_requests
from datetime import datetime, timedelta

crop_calendar_bp = Blueprint('crop_calendar', __name__)

# 'https://api.anthropic.com/v1/messages'

def groq_json(prompt, max_tokens=800):
    """Groq llama-3.3-70b-versatile via the shared gateway. Returns (result_dict, error_string)."""
    return _gw.groq_json(prompt, task='crop_calendar', max_tokens=max_tokens, timeout=45)


@crop_calendar_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate_calendar():
    user_id  = int(get_jwt_identity())
    data     = request.get_json()
    crop     = data.get('crop', '').strip()
    district = data.get('district', '').strip()
    season   = data.get('season', '').strip()
    planting_date = data.get('planting_date', '').strip()

    if not crop:
        return jsonify({'error': 'Crop name is required'}), 400

    prompt = f"""Generate a detailed crop growing calendar for a Sierra Leone farmer.
Crop: {crop}
District: {district or 'Sierra Leone'}
Season: {season or 'current season'}
Planned planting date: {planting_date or 'as soon as possible'}

Respond ONLY with a JSON object, no markdown:
{{
  "crop": "{crop}",
  "total_days": <integer days from planting to harvest>,
  "harvest_date": "<estimated harvest date or week>",
  "weeks": [
    {{
      "week": 1,
      "phase": "Land Preparation",
      "tasks": ["task 1", "task 2"],
      "water_needs": "low/medium/high",
      "watch_for": "what to monitor"
    }}
  ],
  "quick_tips": ["tip 1", "tip 2", "tip 3"],
  "best_market_window": "when to sell for best price in Sierra Leone"
}}
Include every week from land prep to harvest. Be specific to Sierra Leone conditions."""

    result, error = groq_json(prompt, max_tokens=1500)
    if error:
        return jsonify({'error': error}), 502

    # Save to DB
    try:
        cal = CropCalendar(
            user_id=user_id, crop=crop, district=district,
            season=season, planting_date=planting_date,
            calendar=result.get('weeks', []),
            harvest_date=result.get('harvest_date')
        )
        db.session.add(cal)
        db.session.commit()
        result['id'] = cal.id
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f'Calendar save error: {e}')

    return jsonify(result), 200


@crop_calendar_bp.route('/list', methods=['GET'])
@jwt_required()
def list_calendars():
    user_id = int(get_jwt_identity())
    try:
        cals = CropCalendar.query.filter_by(user_id=user_id)\
            .order_by(CropCalendar.created_at.desc()).limit(10).all()
        return jsonify({'calendars': [c.to_dict() for c in cals]}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'calendars': []}), 200


@crop_calendar_bp.route('/harvest-tracker', methods=['POST'])
@jwt_required()
def create_harvest_tracker():
    user_id  = int(get_jwt_identity())
    data     = request.get_json()
    crop     = data.get('crop', '').strip()
    planted  = data.get('planted_date', '').strip()
    district = data.get('district', '').strip()

    if not crop or not planted:
        return jsonify({'error': 'Crop and planting date required'}), 400

    # Get days to harvest from Claude
    prompt = f"""For {crop} grown in {district or 'Sierra Leone'}, how many days from planting to harvest?
Respond ONLY with a JSON object: {{"days_to_harvest": <integer>, "notes": "<brief harvest readiness tips>"}}"""

    result, _ = groq_json(prompt, max_tokens=120)
    days = result.get('days_to_harvest', 90) if result else 90
    notes = result.get('notes', '') if result else ''

    try:
        tracker = HarvestTracker(
            user_id=user_id, crop=crop, planted_date=planted,
            days_to_harvest=days, district=district, notes=notes
        )
        db.session.add(tracker)
        db.session.commit()
        return jsonify(tracker.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@crop_calendar_bp.route('/harvest-tracker/list', methods=['GET'])
@jwt_required()
def list_trackers():
    user_id = int(get_jwt_identity())
    try:
        trackers = HarvestTracker.query.filter_by(user_id=user_id)\
            .order_by(HarvestTracker.created_at.desc()).all()
        result = []
        for t in trackers:
            d = t.to_dict()
            try:
                planted = datetime.strptime(t.planted_date, '%Y-%m-%d')
                harvest_due = planted + timedelta(days=t.days_to_harvest or 90)
                days_elapsed = (datetime.utcnow() - planted).days
                days_remaining = max(0, (harvest_due - datetime.utcnow()).days)
                pct = min(100, round(days_elapsed / (t.days_to_harvest or 90) * 100))
                d['days_elapsed'] = days_elapsed
                d['days_remaining'] = days_remaining
                d['progress_pct'] = pct
                d['harvest_due'] = harvest_due.strftime('%d %b %Y')
            except Exception:
                d['progress_pct'] = 0
            result.append(d)
        return jsonify({'trackers': result}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'trackers': []}), 200


@crop_calendar_bp.route('/harvest-tracker/<int:tracker_id>/yield', methods=['POST'])
@jwt_required()
def record_yield(tracker_id):
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    actual  = data.get('actual_yield')
    try:
        tracker = HarvestTracker.query.filter_by(id=tracker_id, user_id=user_id).first()
        if not tracker:
            return jsonify({'error': 'Tracker not found'}), 404
        tracker.actual_yield = actual
        db.session.commit()
        return jsonify({'message': 'Yield recorded', 'tracker': tracker.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
