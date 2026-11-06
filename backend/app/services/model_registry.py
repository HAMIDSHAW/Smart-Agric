"""
Authoritative registry of every SmartAgri AI model and engine.

Entries here are the PRESERVATION CHECKLIST: automated tests assert that every
entry still exists. Nothing may be deleted from this list without an explicit,
documented decision. New models may be appended.

state:
  live              - called by a running route
  configured_unused - integration code/config kept, not currently called
  local_engine      - non-LLM algorithm shipped in this repo
"""
import os

REGISTRY = [
    # id, provider, identifier, capability, state, routes, env_key, tasks (inference-log task names)
    dict(id='groq-vision-disease', provider='groq', identifier='qwen/qwen3.8-27b', capability='vision',
         state='live', env_key='GROQ_API_KEY', tasks=['disease_vision'],
         routes=['/api/disease/detect', '/api/disease/public-detect'],
         note='Primary image diagnosis. Override list with GROQ_VISION_MODELS (comma separated).'),
    dict(id='groq-text-fallback', provider='groq', identifier='openai/gpt-oss-120b', capability='text',
         state='live', env_key='GROQ_API_KEY', tasks=['disease_text_guidance'],
         routes=['/api/disease/detect', '/api/disease/public-detect'],
         note='Text-only. Produces general guidance, never an image diagnosis.'),
    dict(id='groq-llama-70b', provider='groq', identifier='llama-3.3-70b-versatile', capability='text',
         state='live', env_key='GROQ_API_KEY',
         tasks=['chatbot', 'crop_calendar', 'harvest_days', 'post_harvest', 'crop_compare', 'yield_prediction', 'marketplace_description'],
         routes=['/api/chatbot/message', '/api/calendar/generate', '/api/calendar/harvest-tracker',
                 '/api/post-harvest/advice', '/api/crop-compare/compare', '/api/field/yield-prediction',
                 '/api/marketplace/seller/ai/describe']),
    dict(id='groq-llama-8b', provider='groq', identifier='llama-3.1-8b-instant', capability='text',
         state='live', env_key='GROQ_API_KEY', tasks=['chatbot'], routes=['/api/chatbot/message'],
         note='Chatbot fallback.'),
    dict(id='anthropic-haiku-progress', provider='anthropic', identifier='claude-haiku-4-5-20251001',
         capability='vision', state='live', env_key='ANTHROPIC_API_KEY', tasks=['disease_progress'],
         routes=['/api/disease-progress/tracks/<id>/photo']),
    dict(id='hf-plant-disease-mobilenet', provider='huggingface',
         identifier='linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification',
         capability='image-classifier', state='configured_unused', env_key='HUGGINGFACE_API_TOKEN', tasks=[],
         routes=[], note='services/huggingface.py; DISEASE_MODEL_URL. Not connected; endpoint must be re-verified.'),
    dict(id='hf-vit-base', provider='huggingface', identifier='google/vit-base-patch16-224',
         capability='image-classifier', state='configured_unused', env_key='HUGGINGFACE_API_TOKEN', tasks=[],
         routes=[], note='General ImageNet classifier; NOT trained for soil. SOIL_MODEL_URL.'),
    dict(id='hf-pantagruel', provider='huggingface', identifier='Einmalumdiewelt/PantagruelGPT_large',
         capability='text', state='configured_unused', env_key='HUGGINGFACE_API_TOKEN', tasks=[],
         routes=[], note='Stub in recommend.py.'),
    dict(id='engine-soil-colour', provider='local', identifier='soil-colour-classifier', capability='engine',
         state='local_engine', env_key=None, tasks=[], routes=['/api/soil/analyse']),
    dict(id='engine-crop-scoring', provider='local', identifier='crop-scoring+harvest-prediction',
         capability='engine', state='local_engine', env_key=None, tasks=[], routes=['/api/recommend/crops']),
    dict(id='engine-fertilizer-rules', provider='local', identifier='fertilizer-rules', capability='engine',
         state='local_engine', env_key=None, tasks=[], routes=['/api/fertilizer/plan']),
    dict(id='engine-land-suitability', provider='local', identifier='land-suitability-tables',
         capability='engine', state='local_engine', env_key=None, tasks=[], routes=['/api/land/assess']),
    dict(id='engine-pest-risk', provider='local', identifier='pest-risk-rules', capability='engine',
         state='local_engine', env_key='OPENWEATHER_API_KEY', tasks=[], routes=['/api/pest/alerts']),
    dict(id='service-weather', provider='openweather', identifier='openweathermap-2.5', capability='engine',
         state='local_engine', env_key='OPENWEATHER_API_KEY', tasks=[], routes=['/api/weather/current', '/api/weather/forecast']),
    dict(id='engine-field-calcs', provider='local', identifier='field-health+carbon-calcs', capability='engine',
         state='local_engine', env_key=None, tasks=[], routes=['/api/field/health-score', '/api/field/carbon-footprint']),
    dict(id='kb-disease', provider='local', identifier='disease-knowledge-base', capability='engine',
         state='local_engine', env_key=None, tasks=[], routes=[], note='services/huggingface.py DISEASE_KNOWLEDGE_BASE'),
]

CHATBOT_MODEL_CHAIN = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile']


def vision_models():
    env = os.environ.get('GROQ_VISION_MODELS', '').strip()
    return [m.strip() for m in env.split(',') if m.strip()] or ['qwen/qwen3.8-27b']


def get_entry(entry_id):
    return next((e for e in REGISTRY if e['id'] == entry_id), None)


def credential_state(entry):
    key = entry.get('env_key')
    if not key:
        return 'not_required'
    return 'configured' if os.environ.get(key) else 'missing'


def public_view(entry):
    """Registry entry safe to show in the admin UI (never includes secret values)."""
    e = {k: v for k, v in entry.items() if k != 'env_key'}
    e['credential'] = credential_state(entry)
    return e
