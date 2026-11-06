# AI model preservation checklist (verified against source; updated Phase 2)
Machine-readable source of truth: `backend/app/services/model_registry.py`. `backend/tests/test_phase2.py::test_every_preserved_model_is_in_registry` fails if any entry is removed.
Live status of each provider model is visible to administrators at `GET /api/admin/ai/models`, and a real one-request check is available at `POST /api/admin/ai/probe/<id>` (needs the provider key on the server).

Status vocabulary: Verified working | Preserved, awaiting credentials | Preserved, provider-unavailable | Reconnected and tested | Not yet verified.

| # | Model / engine | Provider | Route(s) | Current status |
|---|---|---|---|---|
| 1 | qwen/qwen3.8-27b (vision) | Groq | /api/disease/detect, /public-detect | Not yet verified against live provider. Code path unit-tested (mocked HTTP). The old comment said "3.6"; the configured ID is kept unchanged. Use the admin probe to confirm it, or set GROQ_VISION_MODELS. |
| 2 | openai/gpt-oss-120b (text fallback) | Groq | same | Not yet verified live. FIXED: output is now labelled general guidance (image_analyzed=false, confidence 0, not stored as a diagnosis). |
| 3 | llama-3.3-70b-versatile | Groq | chatbot, calendar, post-harvest, crop-compare, field/yield-prediction | Not yet verified live; all 5 routes now use the shared gateway (unit-tested) |
| 4 | llama-3.1-8b-instant | Groq | chatbot fallback | Not yet verified live; fallback chain preserved exactly and tested |
| 5 | claude-haiku-4-5-20251001 (vision) | Anthropic | /api/disease-progress/tracks/<id>/photo | Auth bug FIXED in code + unit-tested with mocked HTTP; real call awaiting ANTHROPIC_API_KEY |
| 6 | linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification | Hugging Face | none (services/huggingface.py unused) | Preserved, not connected. Not reconnected in Phase 2: the old api-inference endpoint and this model's labels/accuracy could not be verified from the build environment (no access to Hugging Face). Reconnect only after a live test. |
| 7 | google/vit-base-patch16-224 | Hugging Face | none | Preserved, not connected |
| 8 | PantagruelGPT_large | Hugging Face | stub in recommend.py | Preserved, not connected |
| 9 | Soil colour classifier + manual classifier | local | /api/soil/analyse | Preserved |
| 10 | Crop scoring engine + harvest prediction | local | /api/recommend/crops | Preserved |
| 11 | Fertilizer rules | local | /api/fertilizer/plan | Preserved |
| 12 | Land suitability tables | local | /api/land/assess | Preserved |
| 13 | Pest risk rules (+OpenWeather) | local/OpenWeather | /api/pest/alerts | Preserved |
| 14 | Weather | OpenWeather | /api/weather/* | Preserved |
| 15 | Field health-score, carbon footprint | local calc (to be confirmed) | /api/field/* | Preserved |
| 16 | Disease knowledge base + parser | local | services/huggingface.py | Preserved (unused until #6 reconnected) |

No model was removed, replaced, merged or downgraded in Phase 0/1.
