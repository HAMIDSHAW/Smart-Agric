import os
import uuid
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import DiseaseAnalysis
from app.services import ai_gateway as gw
from app.services.ai_gateway import AIError
from app.services.images import process_image, ImageRejected
from app.services.model_registry import vision_models
from app.services.ratelimit import rate_limit

disease_bp = Blueprint('disease', __name__)

TEXT_FALLBACK_MODEL = 'openai/gpt-oss-120b'


def get_upload_path():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'uploads', 'disease'))
    os.makedirs(base, exist_ok=True)
    return base


def analyse_with_groq_vision(image_bytes, content_type='image/jpeg', plant_type=''):
    """
    Image diagnosis with the Groq-hosted vision model(s) (default qwen/qwen3.8-27b,
    override with GROQ_VISION_MODELS). Returns (result_dict, None) on success or
    (None, error_kind) on failure. error_kind is one of the AIError kinds, or
    'vision_failed' when every model failed for non-credential reasons.
    """
    import base64
    b64 = base64.standard_b64encode(image_bytes).decode('utf-8')
    media_type = content_type if content_type in ['image/jpeg', 'image/png', 'image/webp'] else 'image/jpeg'
    plant_hint = f'The farmer says this is a {plant_type} plant. ' if plant_type else ''

    prompt = f"""{plant_hint}You are an expert plant pathologist and agronomist for West Africa and Sierra Leone.

Most photos come from budget Android phones in rural Sierra Leone, often in imperfect light, so treat soft focus, low resolution, mild glare, or dim lighting as NORMAL and still diagnose them. Only flag poor quality in extreme cases: the image is pure black, pure white, so blurred that zero leaf structure is visible, or clearly not a plant at all. If you can identify the plant type or see any leaf colour, spotting, or shape, proceed with diagnosis rather than rejecting it.

If truly unusable, respond with:
{{"image_quality":"poor","quality_message":"Please retake the photo closer to the leaf in natural daylight","is_healthy":true,"disease_name":"Image unclear","confidence":0,"pathogen":null,"diagnosis_type":"quality_error","nutrient_lacking":null,"causes":[],"treatment":[],"biological_treatment":[],"prevention":[],"severity":"none","best_spray_condition":null}}

If image is usable (even if imperfect), analyse for diseases AND nutrient deficiencies. Respond ONLY with valid JSON, no preamble, no markdown fences:
{{"image_quality":"good","quality_message":null,"is_healthy":true or false,"diagnosis_type":"disease" or "nutrient_deficiency" or "pest" or "healthy","disease_name":"exact name","confidence":55-97,"pathogen":"scientific name or null","nutrient_lacking":"Nitrogen/Phosphorus/Potassium/Iron/Zinc or null","causes":["cause 1","cause 2","cause 3"],"treatment":["treatment 1","treatment 2","treatment 3"],"biological_treatment":["organic alternative 1","organic alternative 2"],"prevention":["prevention 1","prevention 2"],"severity":"none/low/medium/high","best_spray_condition":"e.g. Early morning before 9am"}}

Focus on Sierra Leone crops: cassava (mosaic virus, brown streak, bacterial blight), rice (blast, leaf scald), tomato (late blight, early blight), maize (northern leaf blight, rust), groundnut (leaf spot), cocoa (black pod, swollen shoot), pepper (bacterial spot).
Nutrient deficiencies: Nitrogen=yellow older leaves, Phosphorus=purple/red tinge, Potassium=brown leaf edges, Iron=yellow between veins on young leaves.
Be concise in each list item (under 15 words) so the response stays fast."""

    last_kind = 'vision_failed'
    for model in vision_models():
        try:
            text = gw.groq_chat(
                model,
                [{'role': 'user', 'content': [
                    {'type': 'image_url', 'image_url': {'url': f'data:{media_type};base64,{b64}'}},
                    {'type': 'text', 'text': prompt}]}],
                task='disease_vision', max_tokens=800, temperature=0.1, timeout=25,
                # Reasoning models can burn the token budget thinking; ask for none.
                extra={'reasoning_effort': 'none'}, retries=1)
            result = gw.normalise_disease_result(gw.parse_json_object(text))
            return result, None
        except AIError as e:
            current_app.logger.warning('Vision model %s failed: %s', model, e.kind)
            last_kind = e.kind
            if e.kind in ('not_configured', 'auth'):
                break            # no point trying other models with a bad/missing key
    return None, ('vision_failed' if last_kind in ('model_unavailable', 'bad_request', 'invalid_response') else last_kind)


def analyse_with_groq_text(plant_type=''):
    """
    TEXT-ONLY general guidance. This model never sees the image, so its output is
    returned as general guidance for the crop - never as a diagnosis of the photo.
    Returns a dict {'common_problems': [...], 'treatment': [...], 'prevention': [...]} or None.
    """
    if not plant_type:
        return None
    prompt = f"""A farmer in Sierra Leone is growing {plant_type}. Their photo could NOT be analysed.
Give GENERAL guidance only: the most common problems of {plant_type} in Sierra Leone, and general care.
Do not claim to have seen the plant. Respond ONLY with JSON:
{{"common_problems":[{{"name":"problem","signs":"what the farmer can look for"}}],"treatment":["general step 1","general step 2"],"prevention":["tip 1","tip 2"]}}
Maximum 4 common problems."""
    try:
        text = gw.groq_chat(TEXT_FALLBACK_MODEL,
                            [{'role': 'system', 'content': 'You are an expert Sierra Leone agricultural advisor. Respond with valid JSON only.'},
                             {'role': 'user', 'content': prompt}],
                            task='disease_text_guidance', max_tokens=500, temperature=0.1, timeout=20,
                            json_mode=True, retries=0)
        g = gw.parse_json_object(text)
    except AIError as e:
        current_app.logger.warning('Text guidance failed: %s', e.kind)
        return None
    probs = [p for p in g.get('common_problems', []) if isinstance(p, dict)][:4]
    return {
        'common_problems': [{'name': str(p.get('name', ''))[:100], 'signs': str(p.get('signs', ''))[:250]} for p in probs],
        'treatment': [str(x)[:250] for x in g.get('treatment', [])][:6] if isinstance(g.get('treatment'), list) else [],
        'prevention': [str(x)[:250] for x in g.get('prevention', [])][:6] if isinstance(g.get('prevention'), list) else [],
    }


def run_detection(processed, plant_type):
    """
    Returns (payload_dict, http_status). Single implementation shared by the
    authenticated and guest endpoints.
    payload['image_analyzed'] is True ONLY when the vision model actually returned
    a result for the uploaded image.
    """
    result, error = analyse_with_groq_vision(processed.jpeg_bytes, 'image/jpeg', plant_type)
    if result:
        return {'image_analyzed': True, 'analysis_type': 'image_diagnosis', 'result': result}, 200

    guidance = analyse_with_groq_text(plant_type)
    if guidance:
        return {'image_analyzed': False, 'analysis_type': 'general_guidance',
                'failure_kind': error, 'guidance': guidance}, 200
    return {'image_analyzed': False, 'failure_kind': error}, 503


def _failure_message(kind):
    if kind in ('not_configured', 'auth'):
        return 'Image analysis is not available right now. Our team has been notified. Please try again later.'
    if kind == 'rate_limited':
        return 'The analysis service is very busy. Please try again in a minute.'
    if kind == 'timeout':
        return 'The analysis took too long. Check your connection and try again.'
    return 'We could not analyse this photo. Please retake it closer to the affected leaf in good light.'


def _guidance_payload(det, plant_type):
    g = det['guidance']
    return {
        'image_analyzed': False,
        'analysis_type': 'general_guidance',
        'is_healthy': False,
        'disease_name': f'No diagnosis: general guidance for {plant_type}',
        'confidence': 0,
        'pathogen': None,
        'diagnosis_type': 'general_guidance',
        'nutrient_lacking': None,
        'image_quality': 'poor',
        'quality_message': ('Your photo could NOT be analysed, so this is NOT a diagnosis. '
                            f'It is general guidance about common {plant_type} problems in Sierra Leone. '
                            'Please retake the photo closer to the leaf in daylight for a real analysis.'),
        'causes': [], 'treatment': g['treatment'], 'biological_treatment': [],
        'prevention': g['prevention'], 'severity': 'none', 'best_spray_condition': None,
        'general_guidance': g,
        'saved': False,
    }


@disease_bp.route('/detect', methods=['POST'])
@jwt_required()
@rate_limit('disease_detect', 20, 600, per='user')
def detect_disease():
    user_id = int(get_jwt_identity())
    plant_type     = request.form.get('plant_type', '').strip()[:60]
    field_location = request.form.get('field_location', '').strip()[:120]

    if 'image' not in request.files or not request.files['image'].filename:
        return jsonify({'error': 'No image uploaded. Please select or capture a leaf photo.'}), 400

    try:
        processed = process_image(request.files['image'].read())
    except ImageRejected as e:
        return jsonify({'error': e.message, 'error_code': e.code}), 400

    # Keep the ORIGINAL photo for expert review; extension comes from the detected
    # format, never from the client-supplied filename.
    filename   = f'{uuid.uuid4()}.{processed.original_ext}'
    image_path = os.path.join(get_upload_path(), filename)
    with open(image_path, 'wb') as out:
        out.write(processed.original_bytes)

    det, status = run_detection(processed, plant_type)
    warnings = processed.warnings

    if status != 200:
        return jsonify({'error': _failure_message(det.get('failure_kind')),
                        'error_kind': det.get('failure_kind'),
                        'image_analyzed': False, 'image_warnings': warnings}), status

    if not det['image_analyzed']:
        payload = _guidance_payload(det, plant_type)
        payload['image_warnings'] = warnings
        return jsonify(payload), 200      # not saved as a diagnosis

    result = det['result']
    try:
        analysis = DiseaseAnalysis(
            user_id=user_id, plant_type=plant_type, image_path=image_path,
            is_healthy=result.get('is_healthy', False),
            disease_name=result.get('disease_name', 'Unknown'),
            confidence=result.get('confidence', 0),
            field_location=field_location, raw_response=result)
        db.session.add(analysis)
        db.session.commit()
        saved_id = analysis.id
    except Exception as e:
        current_app.logger.error(f'DB save error: {e}')
        db.session.rollback()
        saved_id = None

    return jsonify({
        'id':                   saved_id,
        'image_analyzed':       True,
        'analysis_type':        'image_diagnosis',
        'is_healthy':           result.get('is_healthy', False),
        'disease_name':         result.get('disease_name', 'Unknown'),
        'confidence':           result.get('confidence', 0),
        'pathogen':             result.get('pathogen'),
        'diagnosis_type':       result.get('diagnosis_type', 'disease'),
        'nutrient_lacking':     result.get('nutrient_lacking'),
        'image_quality':        result.get('image_quality', 'good'),
        'quality_message':      result.get('quality_message'),
        'causes':               result.get('causes', []),
        'treatment':            result.get('treatment', []),
        'biological_treatment': result.get('biological_treatment', []),
        'prevention':           result.get('prevention', []),
        'severity':             result.get('severity', 'none'),
        'best_spray_condition': result.get('best_spray_condition'),
        'image_warnings':       warnings,
        'saved':                saved_id is not None,
    }), 200


@disease_bp.route('/history', methods=['GET'])
@jwt_required()
def disease_history():
    user_id = int(get_jwt_identity())
    page = request.args.get('page', 1, type=int)
    try:
        analyses = DiseaseAnalysis.query.filter_by(user_id=user_id) \
            .order_by(DiseaseAnalysis.created_at.desc()) \
            .paginate(page=page, per_page=10, error_out=False)
        return jsonify({
            'analyses':     [a.to_dict() for a in analyses.items],
            'total':        analyses.total,
            'pages':        analyses.pages,
            'current_page': page
        }), 200
    except Exception as e:
        current_app.logger.error(f'History error: {e}')
        db.session.rollback()
        return jsonify({'analyses': [], 'total': 0, 'pages': 0, 'current_page': 1}), 200

@disease_bp.route('/public-detect', methods=['POST'])
@rate_limit('public_detect_min', 3, 60)
@rate_limit('public_detect_hour', 20, 3600)
def public_detect():
    """
    Guest disease detection (no account). Returns partial results to encourage signup.
    Rate limited per client IP (3/minute, 20/hour) to protect the AI quota.
    """
    plant_type = request.form.get('plant_type', '').strip()[:60]

    if 'image' not in request.files or not request.files['image'].filename:
        return jsonify({'error': 'No image uploaded.'}), 400
    try:
        processed = process_image(request.files['image'].read(), max_bytes=8 * 1024 * 1024)
    except ImageRejected as e:
        return jsonify({'error': e.message, 'error_code': e.code}), 400

    det, status = run_detection(processed, plant_type)
    if status != 200:
        return jsonify({'error': _failure_message(det.get('failure_kind')),
                        'error_kind': det.get('failure_kind'), 'image_analyzed': False}), status

    if not det['image_analyzed']:
        p = _guidance_payload(det, plant_type)
        return jsonify({
            'image_analyzed': False, 'analysis_type': 'general_guidance',
            'is_healthy': False, 'disease_name': p['disease_name'], 'confidence': 0,
            'pathogen': None, 'diagnosis_type': 'general_guidance',
            'image_quality': 'poor', 'quality_message': p['quality_message'],
            'severity': 'none', 'treatment': [],
            'image_warnings': processed.warnings, 'full_results_locked': False,
        }), 200

    result = det['result']
    return jsonify({
        'image_analyzed':  True,
        'analysis_type':   'image_diagnosis',
        'is_healthy':      result.get('is_healthy', False),
        'disease_name':    result.get('disease_name', 'Unknown'),
        'confidence':      result.get('confidence', 0),
        'pathogen':        result.get('pathogen'),
        'diagnosis_type':  result.get('diagnosis_type', 'disease'),
        'image_quality':   result.get('image_quality', 'good'),
        'quality_message': result.get('quality_message'),
        'severity':        result.get('severity', 'none'),
        'treatment':       result.get('treatment', [])[:1],
        'image_warnings':  processed.warnings,
        'full_results_locked': True,
        'signup_prompt': 'Create a free SmartAgri account to see all causes, full treatment plan, biological alternatives, and prevention tips.',
    }), 200
