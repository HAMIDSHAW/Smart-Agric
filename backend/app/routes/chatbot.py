import os
import uuid
import requests
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import ChatMessage

chatbot_bp = Blueprint('chatbot', __name__)

SYSTEM_PROMPT_EN = """You are SmartAgri Assistant, an expert agricultural advisor for Sierra Leone and West Africa.

You help smallholder farmers with:
1. Plant disease identification and treatment
2. Crop selection and soil management
3. Fertilizer recommendations
4. Pest control strategies
5. Weather and planting calendar advice
6. How to use the SmartAgri platform

Key context about Sierra Leone agriculture:
- Main crops: cassava, rice, maize, groundnut, sweet potato, tomato, pepper, mango, cocoa, oil palm
- Key districts: Bo, Kenema, Bombali, Tonkolili, Kailahun, Moyamba
- Rainy season: May–October | Dry season: November–April
- Feed Salone is the national agricultural program by President Bio
- Njala University is the main agricultural research institution

Give practical, affordable advice. Always respond in clear English unless the user specifically writes in Krio language."""

SYSTEM_PROMPT_KR = """Yu na SmartAgri Assistant, wan agricultural expert for Sierra Leone.

Yu dey help smallholder farmers wit:
1. Plant sickness check and treatment
2. Crop selection and soil care
3. Fertilizer advice
4. Pest control
5. Weather and planting advice
6. How for use SmartAgri platform

Main crops for Sierra Leone: kasava, rais, kohn, pinat, swit pateto, tomato, peper, mango.
Wet season: May–October. Dry season: November–April.
Feed Salone na di national farming program. Njala University na di main agricultural school.

Always give practical advice wey farmers can use."""

# Current working Groq models (llama3-8b-8192 was decommissioned)
GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
]

def call_groq(messages, api_key, language='en'):
    """Try each model in the preserved fallback chain; returns text or None."""
    from app.services import ai_gateway as gw
    system_prompt = SYSTEM_PROMPT_KR if language == 'kr' else SYSTEM_PROMPT_EN
    full = [{'role': 'system', 'content': system_prompt}] + messages
    for model in GROQ_MODELS:
        try:
            return gw.groq_chat(model, full, task='chatbot', max_tokens=800,
                                temperature=0.7, timeout=30, retries=0)
        except gw.AIError as e:
            current_app.logger.warning('Chatbot model %s failed: %s', model, e.kind)
            if e.kind in ('not_configured', 'auth'):
                break
    return None


@chatbot_bp.route('/message', methods=['POST'])
@jwt_required()
def send_message():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    user_message = data.get('message', '').strip()
    session_id = data.get('session_id', str(uuid.uuid4()))
    language = data.get('language', 'en')

    if not user_message:
        return jsonify({'error': 'Message cannot be empty'}), 400

    history = ChatMessage.query.filter_by(
        user_id=user_id, session_id=session_id
    ).order_by(ChatMessage.created_at.asc()).limit(8).all()

    messages_for_api = [{'role': m.role, 'content': m.content} for m in history]
    messages_for_api.append({'role': 'user', 'content': user_message})

    api_key = os.environ.get('GROQ_API_KEY', '')
    current_app.logger.info(f"Groq key loaded: {bool(api_key)}, length: {len(api_key)}")

    if not api_key:
        return jsonify({'error': 'GROQ_API_KEY not configured in backend/.env'}), 503

    assistant_response = call_groq(messages_for_api, api_key, language)

    if not assistant_response:
        return jsonify({'error': 'Could not reach AI. Please try again in a moment.'}), 503

    db.session.add(ChatMessage(user_id=user_id, session_id=session_id, role='user', content=user_message, language=language))
    db.session.add(ChatMessage(user_id=user_id, session_id=session_id, role='assistant', content=assistant_response, language=language))
    db.session.commit()

    return jsonify({
        'session_id': session_id,
        'response': assistant_response,
        'language': language
    }), 200


@chatbot_bp.route('/history/<session_id>', methods=['GET'])
@jwt_required()
def get_chat_history(session_id):
    user_id = int(get_jwt_identity())
    messages = ChatMessage.query.filter_by(
        user_id=user_id, session_id=session_id
    ).order_by(ChatMessage.created_at.asc()).all()
    return jsonify({'messages': [m.to_dict() for m in messages]}), 200


@chatbot_bp.route('/sessions', methods=['GET'])
@jwt_required()
def get_sessions():
    user_id = int(get_jwt_identity())
    sessions = db.session.query(
        ChatMessage.session_id,
        db.func.min(ChatMessage.created_at).label('started'),
        db.func.max(ChatMessage.created_at).label('last_message'),
        db.func.count(ChatMessage.id).label('message_count')
    ).filter_by(user_id=user_id).group_by(ChatMessage.session_id) \
     .order_by(db.func.max(ChatMessage.created_at).desc()).limit(10).all()

    return jsonify({'sessions': [
        {'session_id': s.session_id, 'started': s.started.isoformat(),
         'last_message': s.last_message.isoformat(), 'message_count': s.message_count}
        for s in sessions
    ]}), 200
