import os, json, uuid, base64
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import DiseaseProgressTrack
import requests as http_requests
from datetime import datetime

from app.services.ratelimit import rate_limit

disease_progress_bp = Blueprint('disease_progress', __name__)

def get_upload_path():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'uploads', 'progress'))
    os.makedirs(base, exist_ok=True)
    return base

def analyse_image_with_claude(image_bytes, content_type, plant_label):
    """claude-haiku-4-5-20251001 via Anthropic (ANTHROPIC_API_KEY only). Returns (dict, error_message)."""
    from app.services import ai_gateway as gw
    b64 = base64.standard_b64encode(image_bytes).decode('utf-8')
    media_type = content_type if content_type in ['image/jpeg', 'image/png', 'image/webp'] else 'image/jpeg'
    prompt = (f'This is a progress photo of a plant labelled "{plant_label}".\n'
              'Analyse this leaf/plant for disease status. Respond ONLY with JSON:\n'
              '{"disease_name": "<disease name or Healthy>", "is_healthy": true or false, '
              '"confidence": <50-99>, "status": "improving" or "stable" or "worsening" or "healthy", '
              '"observation": "<one sentence describing what you see compared to a typical case>"}')
    try:
        text = gw.anthropic_message(
            'claude-haiku-4-5-20251001',
            [{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': b64}},
                {'type': 'text', 'text': prompt}]}],
            task='disease_progress', max_tokens=300, timeout=40, retries=1)
        return gw.parse_json_object(text), None
    except gw.AIError as e:
        return None, e.message

@disease_progress_bp.route('/tracks', methods=['GET'])
@jwt_required()
def list_tracks():
    user_id = int(get_jwt_identity())
    try:
        tracks = DiseaseProgressTrack.query.filter_by(user_id=user_id)\
            .order_by(DiseaseProgressTrack.updated_at.desc()).all()
        return jsonify({'tracks': [t.to_dict() for t in tracks]}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'tracks': []}), 200


@disease_progress_bp.route('/tracks', methods=['POST'])
@jwt_required()
def create_track():
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    label   = data.get('plant_label', '').strip()
    if not label:
        return jsonify({'error': 'Plant label required'}), 400
    try:
        track = DiseaseProgressTrack(user_id=user_id, plant_label=label, entries=[], trend='stable')
        db.session.add(track)
        db.session.commit()
        return jsonify(track.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@disease_progress_bp.route('/tracks/<int:track_id>/photo', methods=['POST'])
@jwt_required()
@rate_limit('progress_photo', 20, 600, per='user')
def add_photo(track_id):
    user_id = int(get_jwt_identity())

    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    from app.services.images import process_image, ImageRejected
    try:
        processed = process_image(request.files['image'].read())
    except ImageRejected as e:
        return jsonify({'error': e.message, 'error_code': e.code}), 400
    image_bytes = processed.jpeg_bytes          # sent to the AI
    content_type = 'image/jpeg'
    ext = processed.original_ext                # original is stored for review

    try:
        track = DiseaseProgressTrack.query.filter_by(id=track_id, user_id=user_id).first()
        if not track:
            return jsonify({'error': 'Track not found'}), 404

        # Save image
        filename = f'{uuid.uuid4()}.{ext}'
        image_path = os.path.join(get_upload_path(), filename)
        with open(image_path, 'wb') as out:
            out.write(processed.original_bytes)

        # Analyse with Claude
        analysis, error = analyse_image_with_claude(image_bytes, content_type, track.plant_label)
        if error or not analysis:
            analysis = {'disease_name': 'Unknown', 'is_healthy': False, 'confidence': 0,
                        'status': 'stable', 'analysis_failed': True,
                        'observation': 'AI analysis was not completed for this photo. The image was saved; this entry is NOT a diagnosis.'}

        # Append entry
        entries = track.entries or []
        entries.append({
            'date': datetime.utcnow().isoformat(),
            'image_path': filename,
            'disease_name': analysis.get('disease_name'),
            'is_healthy': analysis.get('is_healthy'),
            'confidence': analysis.get('confidence'),
            'status': analysis.get('status', 'stable'),
            'observation': analysis.get('observation', ''),
            'analysis_failed': bool(analysis.get('analysis_failed', False)),
        })
        track.entries = entries

        # Calculate overall trend from last 3 entries
        if len(entries) >= 2:
            statuses = [e.get('status', 'stable') for e in entries[-3:]]
            if statuses.count('improving') >= 2:
                track.trend = 'improving'
            elif statuses.count('worsening') >= 2:
                track.trend = 'worsening'
            else:
                track.trend = 'stable'

        track.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'track': track.to_dict(), 'latest': entries[-1]}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
