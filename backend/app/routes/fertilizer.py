from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import FertilizerPlan


APPLICATION_METHODS = {
    'Broadcast': {
        'steps': [
            'Measure the correct amount of fertilizer for your plot size',
            'Walk across the field in a grid pattern, spreading fertilizer evenly by hand or spreader',
            'Avoid applying when rain is expected within 2 hours: nutrients will wash away',
            'Lightly rake or incorporate into top 5cm of soil if possible',
            'Water lightly if no rain expected within 3 days',
        ],
        'tools': 'Bucket, measuring scale, hand spreader or broadcaster',
        'tip': 'Stand upwind and wear gloves. Apply in cool morning hours.',
    },
    'Side-dress': {
        'steps': [
            'Measure the correct amount of fertilizer for your plot size',
            'Create a shallow furrow (5cm deep) 10-15cm beside the plant stem, not touching roots',
            'Place fertilizer evenly in the furrow',
            'Cover with soil immediately to prevent nitrogen loss',
            'Water after application if no rain within 48 hours',
        ],
        'tools': 'Hoe, measuring scale, bucket',
        'tip': 'Never apply fertilizer directly against the stem, it causes burning.',
    },
    'Furrow': {
        'steps': [
            'Before planting, open furrows at planting row spacing',
            'Measure and place fertilizer along the bottom of each furrow',
            'Cover fertilizer with 5cm of soil before placing seeds/seedlings on top',
            'This keeps fertilizer close to roots without burning seeds',
            'Water immediately after planting',
        ],
        'tools': 'Hoe, measuring scale, bucket',
        'tip': 'Keep fertilizer at least 5cm below seeds to prevent burning.',
    },
    'Incorporate': {
        'steps': [
            'Spread fertilizer evenly across the entire field surface',
            'Use a hoe or plough to mix into the top 15-20cm of soil',
            'Level the surface before planting',
            'Best done 1-2 weeks before planting for maximum benefit',
            'Works well for phosphorus and potassium which do not move in soil',
        ],
        'tools': 'Hoe, plough or tiller, measuring scale',
        'tip': 'Incorporate organic matter (compost) at the same time for best results.',
    },
    'Foliar': {
        'steps': [
            'Dissolve fertilizer in clean water at recommended rate (usually 2-5g per litre)',
            'Fill a knapsack sprayer and test nozzle for even spray',
            'Spray in early morning (before 9am) or late afternoon (after 5pm)',
            'Cover undersides of leaves as well as tops',
            'Do not spray on windy days or before rain',
        ],
        'tools': 'Knapsack sprayer, clean water, measuring scale',
        'tip': 'Foliar feeding works fastest but is a supplement, not a replacement for soil application.',
    },
    'Broadcast in standing water': {
        'steps': [
            'Maintain water level at 5-10cm in the paddy field',
            'Measure the correct amount of fertilizer',
            'Walk through the paddy and broadcast evenly across standing water',
            'Keep water in field for 3-4 days after application',
            'Do not drain the field for at least 5 days',
        ],
        'tools': 'Bucket, measuring scale, rubber boots',
        'tip': 'Apply urea in the morning. Avoid application during very hot midday, nitrogen evaporates.',
    },
}


fertilizer_bp = Blueprint('fertilizer', __name__)

FERTILIZER_PLANS = {
    'Cassava': {
        'Pre-planting': [
            {'fertilizer': 'NPK 10-10-10', 'qty_per_ha': '250 kg', 'timing': 'Broadcast and incorporate 2 weeks before planting', 'method': 'Broadcast'},
            {'fertilizer': 'Lime (if pH < 5.5)', 'qty_per_ha': '1–2 tonnes', 'timing': '4 weeks before planting', 'method': 'Broadcast'},
        ],
        'Vegetative': [
            {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '80 kg', 'timing': '6–8 weeks after planting', 'method': 'Side-dress'},
            {'fertilizer': 'Muriate of Potash (MOP)', 'qty_per_ha': '60 kg', 'timing': '12 weeks after planting', 'method': 'Side-dress'},
        ],
        'Bulking': [
            {'fertilizer': 'Potassium Sulphate (SOP)', 'qty_per_ha': '50 kg', 'timing': '16–20 weeks after planting', 'method': 'Side-dress'},
        ]
    },
    'Maize': {
        'Pre-planting': [
            {'fertilizer': 'NPK 15-15-15', 'qty_per_ha': '300 kg', 'timing': 'Apply in furrow at planting', 'method': 'Furrow'},
            {'fertilizer': 'Lime (if pH < 5.8)', 'qty_per_ha': '1 tonne', 'timing': '3 weeks before planting', 'method': 'Broadcast'},
        ],
        'Vegetative': [
            {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '100 kg', 'timing': 'Top-dress at knee-high stage (V6)', 'method': 'Side-dress'},
            {'fertilizer': 'Zinc Sulphate', 'qty_per_ha': '15 kg', 'timing': 'At planting if zinc deficiency known', 'method': 'Broadcast'},
        ],
        'Tasseling': [
            {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '50 kg', 'timing': 'At tasseling for grain fill', 'method': 'Side-dress'},
        ]
    },
    'Rice': {
        'Pre-planting': [
            {'fertilizer': 'NPK 20-10-10', 'qty_per_ha': '250 kg', 'timing': 'Incorporate into soil at land prep', 'method': 'Incorporate'},
        ],
        'Vegetative': [
            {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '100 kg', 'timing': '21 days after transplanting', 'method': 'Broadcast in standing water'},
            {'fertilizer': 'Triple Superphosphate (TSP)', 'qty_per_ha': '60 kg', 'timing': 'At transplanting', 'method': 'Incorporate'},
        ],
        'Panicle Initiation': [
            {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '60 kg', 'timing': 'At panicle initiation (PI stage)', 'method': 'Broadcast'},
            {'fertilizer': 'Muriate of Potash (MOP)', 'qty_per_ha': '60 kg', 'timing': 'At PI stage', 'method': 'Broadcast'},
        ]
    },
    'Tomato': {
        'Pre-planting': [
            {'fertilizer': 'NPK 12-24-12', 'qty_per_ha': '200 kg', 'timing': 'Basal application 1 week before transplanting', 'method': 'Furrow'},
            {'fertilizer': 'Well-rotted compost', 'qty_per_ha': '5–10 tonnes', 'timing': '2–3 weeks before transplanting', 'method': 'Incorporate'},
        ],
        'Vegetative': [
            {'fertilizer': 'Calcium Nitrate', 'qty_per_ha': '50 kg', 'timing': 'Every 2 weeks during vegetative stage', 'method': 'Drip/Foliar'},
            {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '40 kg', 'timing': '3 weeks after transplanting', 'method': 'Side-dress'},
        ],
        'Flowering': [
            {'fertilizer': 'Potassium Sulphate (SOP)', 'qty_per_ha': '75 kg', 'timing': 'At first flower, reduces blossom-end rot', 'method': 'Side-dress'},
            {'fertilizer': 'Calcium Nitrate', 'qty_per_ha': '30 kg', 'timing': 'Foliar spray at flowering', 'method': 'Foliar'},
        ],
        'Fruiting': [
            {'fertilizer': 'NPK 6-12-36', 'qty_per_ha': '100 kg', 'timing': 'At fruit set to improve fruit quality', 'method': 'Side-dress'},
        ]
    },
    'Groundnut': {
        'Pre-planting': [
            {'fertilizer': 'Single Superphosphate (SSP)', 'qty_per_ha': '150 kg', 'timing': 'At planting, groundnut is P-responsive', 'method': 'Furrow'},
            {'fertilizer': 'Gypsum (Calcium Sulphate)', 'qty_per_ha': '200 kg', 'timing': 'Broadcast at flowering, prevents empty pods', 'method': 'Broadcast'},
        ],
        'Vegetative': [
            {'fertilizer': 'Muriate of Potash (MOP)', 'qty_per_ha': '60 kg', 'timing': '3 weeks after planting', 'method': 'Side-dress'},
        ]
    },
    'Sweet Potato': {
        'Pre-planting': [
            {'fertilizer': 'NPK 6-6-12', 'qty_per_ha': '200 kg', 'timing': 'In ridges before planting vines', 'method': 'Incorporate in ridge'},
        ],
        'Vegetative': [
            {'fertilizer': 'Muriate of Potash (MOP)', 'qty_per_ha': '80 kg', 'timing': '4 weeks after planting', 'method': 'Side-dress'},
            {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '30 kg', 'timing': '3 weeks after planting (avoid excess N)', 'method': 'Side-dress'},
        ]
    },
}

GENERIC_PLAN = [
    {'fertilizer': 'NPK 15-15-15', 'qty_per_ha': '250 kg', 'timing': 'At planting', 'method': 'Broadcast/Incorporate'},
    {'fertilizer': 'Urea (46% N)', 'qty_per_ha': '80 kg', 'timing': '4–6 weeks after planting', 'method': 'Side-dress'},
    {'fertilizer': 'Muriate of Potash (MOP)', 'qty_per_ha': '60 kg', 'timing': '8–10 weeks after planting', 'method': 'Side-dress'},
]

def detect_deficiencies(n, p, k, ph):
    deficiencies = []
    if n < 40:
        deficiencies.append({'nutrient': 'Nitrogen (N)', 'severity': 'High' if n < 20 else 'Moderate', 'symptoms': 'Yellowing of older/lower leaves, stunted growth, pale green colour overall'})
    if p < 20:
        deficiencies.append({'nutrient': 'Phosphorus (P)', 'severity': 'High' if p < 10 else 'Moderate', 'symptoms': 'Purple/reddish discolouration of leaves, poor root development, delayed maturity'})
    if k < 30:
        deficiencies.append({'nutrient': 'Potassium (K)', 'severity': 'High' if k < 15 else 'Moderate', 'symptoms': 'Leaf edge scorching (brown margins), weak stems, poor drought tolerance'})
    if ph < 5.5:
        deficiencies.append({'nutrient': 'Lime required (Low pH)', 'severity': 'High' if ph < 5.0 else 'Moderate', 'symptoms': 'Multiple nutrient lockout, poor root growth, aluminium toxicity risk'})
    if ph > 7.5:
        deficiencies.append({'nutrient': 'pH too high (Alkaline)', 'severity': 'Moderate', 'symptoms': 'Iron and manganese deficiency, yellowing between leaf veins (interveinal chlorosis)'})
    return deficiencies


@fertilizer_bp.route('/plan', methods=['POST'])
@jwt_required()
def get_fertilizer_plan():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    crop = data.get('crop', 'Cassava')
    growth_stage = data.get('growth_stage', 'Pre-planting')

    try:
        n = float(data.get('nitrogen', 0))
        p = float(data.get('phosphorus', 0))
        k = float(data.get('potassium', 0))
        ph = float(data.get('ph', 6.5))
    except (ValueError, TypeError):
        return jsonify({'error': 'Nutrient values must be numbers'}), 400

    deficiencies = detect_deficiencies(n, p, k, ph)

    crop_plans = FERTILIZER_PLANS.get(crop, {})
    stage_plan = crop_plans.get(growth_stage, GENERIC_PLAN)

    # If growth_stage not in crop plan, return all stages
    if not stage_plan and crop in FERTILIZER_PLANS:
        all_stages = []
        for stage, items in FERTILIZER_PLANS[crop].items():
            for item in items:
                all_stages.append({**item, 'stage': stage})
        stage_plan = all_stages[:4]

    notes = f"For {crop} at {growth_stage} stage. "
    if deficiencies:
        def_names = [d['nutrient'] for d in deficiencies]
        notes += f"Detected deficiencies: {', '.join(def_names)}. Prioritise corrective fertilization before standard plan. "
    if ph < 5.5:
        notes += f"CRITICAL: Soil pH is {ph}, apply lime first. Target pH 5.8–6.5 for optimal nutrient availability. "
    notes += "Always conduct a soil test annually for best results."

    plan_record = FertilizerPlan(
        user_id=user_id,
        crop=crop,
        growth_stage=growth_stage,
        nitrogen=n, phosphorus=p, potassium=k, ph=ph,
        deficiencies=deficiencies,
        plan=stage_plan,
        notes=notes
    )
    db.session.add(plan_record)
    db.session.commit()

    return jsonify({
        'id': plan_record.id,
        'crop': crop,
        'growth_stage': growth_stage,
        'deficiencies': deficiencies,
        'plan': stage_plan,
        'notes': notes,
        'all_stages': FERTILIZER_PLANS.get(crop, {}),
        'created_at': plan_record.created_at.isoformat()
    }), 200
