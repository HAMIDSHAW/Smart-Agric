"""
Private access to farmer photographs.

Photos are never publicly served. Only the owning user (or an administrator)
can read or delete a photo, and only files inside the uploads directory can be
reached: the stored value is reduced to a bare filename and re-resolved inside
the expected sub-folder, so path traversal through a tampered database value
is impossible.
"""
import os
from flask import Blueprint, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app import db
from app.models import DiseaseAnalysis, SoilAnalysis, DiseaseProgressTrack

media_bp = Blueprint('media', __name__)

UPLOAD_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'uploads'))
_MIME = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}


def resolve_upload(subdir, stored):
    """Map a stored DB value to a real file inside uploads/<subdir>, or None."""
    if not stored:
        return None
    name = os.path.basename(str(stored).replace('\\', '/'))
    base = os.path.realpath(os.path.join(UPLOAD_ROOT, subdir))
    full = os.path.realpath(os.path.join(base, name))
    if not full.startswith(base + os.sep) or not os.path.isfile(full):
        return None
    if full.rsplit('.', 1)[-1].lower() not in _MIME:
        return None
    return full


def _can_access(owner_id):
    """Owner, or staff who may view user data (checked against the database, not the token)."""
    if int(get_jwt_identity()) == owner_id:
        return True
    from app.services.rbac import current_user, effective_permissions
    return 'users.view' in effective_permissions(current_user())


def _send(full):
    resp = send_file(full, mimetype=_MIME[full.rsplit('.', 1)[-1].lower()], max_age=0)
    resp.headers['Cache-Control'] = 'private, no-store'
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Content-Disposition'] = 'inline'
    return resp


def _delete_file(full):
    try:
        os.remove(full)
        return True
    except OSError:
        return False


def _record_and_file(model, subdir, rid):
    rec = db.session.get(model, rid)
    if not rec or not _can_access(rec.user_id):
        return None, None
    return rec, resolve_upload(subdir, rec.image_path)


@media_bp.route('/disease/<int:rid>', methods=['GET'])
@jwt_required()
def disease_image(rid):
    rec, full = _record_and_file(DiseaseAnalysis, 'disease', rid)
    return _send(full) if full else (jsonify({'error': 'Image not found'}), 404)


@media_bp.route('/soil/<int:rid>', methods=['GET'])
@jwt_required()
def soil_image(rid):
    rec, full = _record_and_file(SoilAnalysis, 'soil', rid)
    return _send(full) if full else (jsonify({'error': 'Image not found'}), 404)


@media_bp.route('/disease/<int:rid>', methods=['DELETE'])
@jwt_required()
def delete_disease_image(rid):
    rec, full = _record_and_file(DiseaseAnalysis, 'disease', rid)
    if not rec:
        return jsonify({'error': 'Image not found'}), 404
    if full:
        _delete_file(full)
    rec.image_path = None
    db.session.commit()
    return jsonify({'message': 'Photo deleted. The analysis record was kept.'}), 200


@media_bp.route('/soil/<int:rid>', methods=['DELETE'])
@jwt_required()
def delete_soil_image(rid):
    rec, full = _record_and_file(SoilAnalysis, 'soil', rid)
    if not rec:
        return jsonify({'error': 'Image not found'}), 404
    if full:
        _delete_file(full)
    rec.image_path = None
    db.session.commit()
    return jsonify({'message': 'Photo deleted. The analysis record was kept.'}), 200


def _progress_entry(track_id, idx):
    track = db.session.get(DiseaseProgressTrack, track_id)
    if not track or not _can_access(track.user_id):
        return None, None
    entries = track.entries or []
    if idx < 0 or idx >= len(entries):
        return None, None
    return track, entries[idx]


@media_bp.route('/progress/<int:track_id>/<int:idx>', methods=['GET'])
@jwt_required()
def progress_image(track_id, idx):
    track, entry = _progress_entry(track_id, idx)
    full = resolve_upload('progress', (entry or {}).get('image_path'))
    return _send(full) if full else (jsonify({'error': 'Image not found'}), 404)


@media_bp.route('/progress/<int:track_id>/<int:idx>', methods=['DELETE'])
@jwt_required()
def delete_progress_image(track_id, idx):
    track, entry = _progress_entry(track_id, idx)
    if not entry:
        return jsonify({'error': 'Image not found'}), 404
    full = resolve_upload('progress', entry.get('image_path'))
    if full:
        _delete_file(full)
    entries = [dict(e) for e in track.entries]
    entries[idx]['image_path'] = None
    track.entries = entries            # reassign so the JSON column change is detected
    db.session.commit()
    return jsonify({'message': 'Photo deleted. The entry was kept.'}), 200
