from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import CropRecommendation
import requests


# Harvest predictions per crop for Sierra Leone conditions
HARVEST_PREDICTIONS = {
    'Rice': {
        'days_to_harvest': '90-120 days',
        'yield_range_tha': '1.5-4.0',
        'typical_yield_tha': '2.2',
        'market_value_nle_per_tonne': 3800000,
        'season': 'Rainy season (May-Oct)',
        'post_harvest_loss_pct': 15,
        'notes': 'NERICA varieties yield up to 4t/ha. Traditional varieties 1.5-2t/ha.',
    },
    'Cassava': {
        'days_to_harvest': '270-360 days',
        'yield_range_tha': '8-25',
        'typical_yield_tha': '12',
        'market_value_nle_per_tonne': 850000,
        'season': 'Can be planted any time with rain',
        'post_harvest_loss_pct': 40,
        'notes': 'Fresh weight. TMS varieties yield 20-25t/ha. Store as gari to reduce losses.',
    },
    'Maize': {
        'days_to_harvest': '85-95 days',
        'yield_range_tha': '1.0-3.5',
        'typical_yield_tha': '2.0',
        'market_value_nle_per_tonne': 1100000,
        'season': 'Rainy season or irrigated dry season',
        'post_harvest_loss_pct': 20,
        'notes': 'Hybrid varieties reach 3.5t/ha. Improved OPV varieties 2-2.5t/ha.',
    },
    'Tomato': {
        'days_to_harvest': '70-90 days',
        'yield_range_tha': '8-20',
        'typical_yield_tha': '12',
        'market_value_nle_per_tonne': 4500000,
        'season': 'Dry season (Nov-Apr) with irrigation',
        'post_harvest_loss_pct': 35,
        'notes': 'High value but perishable. Sell within 5 days or process. Late blight risk in wet season.',
    },
    'Groundnut': {
        'days_to_harvest': '100-120 days',
        'yield_range_tha': '0.8-2.5',
        'typical_yield_tha': '1.4',
        'market_value_nle_per_tonne': 2800000,
        'season': 'Rainy season',
        'post_harvest_loss_pct': 10,
        'notes': 'Fixes nitrogen in soil. Rotate with rice or cassava.',
    },
    'Pepper': {
        'days_to_harvest': '80-100 days',
        'yield_range_tha': '5-15',
        'typical_yield_tha': '8',
        'market_value_nle_per_tonne': 3100000,
        'season': 'Dry season with irrigation',
        'post_harvest_loss_pct': 25,
        'notes': 'Very high demand in Freetown. Can be dried for longer shelf life.',
    },
    'Cocoa': {
        'days_to_harvest': '365-540 days (first harvest)',
        'yield_range_tha': '0.4-1.5',
        'typical_yield_tha': '0.7',
        'market_value_nle_per_tonne': 18000000,
        'season': 'Main crop Oct-Feb, mid crop May-Jul',
        'post_harvest_loss_pct': 5,
        'notes': 'Long-term investment. Grade A beans command premium export price.',
    },
    'Sweet Potato': {
        'days_to_harvest': '90-120 days',
        'yield_range_tha': '5-15',
        'typical_yield_tha': '8',
        'market_value_nle_per_tonne': 1600000,
        'season': 'Can grow in both seasons',
        'post_harvest_loss_pct': 30,
        'notes': 'Drought tolerant. Orange-fleshed varieties are nutritious and fetch premium prices.',
    },
}

def get_harvest_prediction(crop_name, plot_size=1.0, practices='traditional'):
    """Calculate harvest prediction for a given crop and plot size."""
    # Normalize crop name
    crop_key = crop_name
    for key in HARVEST_PREDICTIONS:
        if key.lower() in crop_name.lower() or crop_name.lower() in key.lower():
            crop_key = key
            break

    data = HARVEST_PREDICTIONS.get(crop_key, None)
    if not data:
        return None

    # Adjust yield based on practices
    base_yield = float(data['typical_yield_tha'])
    if practices == 'improved':
        base_yield *= 1.35
    elif practices == 'best':
        base_yield *= 1.75

    min_y = float(data['yield_range_tha'].split('-')[0])
    max_y = float(data['yield_range_tha'].split('-')[1])

    expected_kg = round(base_yield * plot_size * 1000)
    min_kg = round(min_y * plot_size * 1000)
    max_kg = round(max_y * plot_size * 1000)
    post_loss_kg = round(expected_kg * (1 - data['post_harvest_loss_pct'] / 100))
    market_value = round(post_loss_kg / 1000 * data['market_value_nle_per_tonne'])

    return {
        'crop':                crop_key,
        'plot_size_ha':        plot_size,
        'days_to_harvest':     data['days_to_harvest'],
        'expected_yield_kg':   expected_kg,
        'min_yield_kg':        min_kg,
        'max_yield_kg':        max_kg,
        'yield_per_ha':        f"{base_yield:.1f} tonnes/ha",
        'post_harvest_loss_pct': data['post_harvest_loss_pct'],
        'sellable_kg':         post_loss_kg,
        'estimated_revenue_nle': market_value,
        'market_price_per_tonne': data['market_value_nle_per_tonne'],
        'season':              data['season'],
        'notes':               data['notes'],
        'practices':           practices,
    }


recommend_bp = Blueprint('recommend', __name__)

# Crop database with Sierra Leone context
CROP_DATABASE = {
    'Cassava': {
        'emoji': '🌿', 'category': 'Root Crop',
        'ideal': {'N': (0, 80), 'P': (10, 60), 'K': (20, 100), 'pH': (5.5, 7.0), 'temp': (20, 35), 'humidity': (50, 90), 'rainfall': (1000, 3000)},
        'notes': 'Excellent drought tolerance. Main staple crop in Sierra Leone. Grows well in laterite soils found in Bo, Kenema, and Kailahun districts.',
        'local_name_krio': 'Kasava'
    },
    'Maize': {
        'emoji': '🌽', 'category': 'Cereal',
        'ideal': {'N': (60, 140), 'P': (20, 80), 'K': (30, 100), 'pH': (5.8, 7.0), 'temp': (20, 35), 'humidity': (50, 80), 'rainfall': (500, 1800)},
        'notes': 'Fast maturing. High demand in Sierra Leone markets. Suits Bombali, Tonkolili, and Koinadugu districts well.',
        'local_name_krio': 'Kohn'
    },
    'Rice': {
        'emoji': '🌾', 'category': 'Cereal',
        'ideal': {'N': (80, 140), 'P': (30, 80), 'K': (40, 120), 'pH': (5.5, 6.5), 'temp': (20, 35), 'humidity': (60, 90), 'rainfall': (1500, 3000)},
        'notes': "Sierra Leone's staple food. Upland and swamp varieties available. High market value, government priority under Feed Salone.",
        'local_name_krio': 'Rais'
    },
    'Groundnut': {
        'emoji': '🥜', 'category': 'Legume',
        'ideal': {'N': (0, 40), 'P': (20, 80), 'K': (30, 100), 'pH': (5.8, 7.0), 'temp': (20, 35), 'humidity': (40, 70), 'rainfall': (500, 1200)},
        'notes': 'Fixes nitrogen, improves soil for next crop. High demand locally. Suits dry season planting in Northern Province.',
        'local_name_krio': 'Pinat'
    },
    'Sweet Potato': {
        'emoji': '🍠', 'category': 'Root Crop',
        'ideal': {'N': (20, 80), 'P': (20, 80), 'K': (40, 140), 'pH': (5.5, 6.5), 'temp': (20, 30), 'humidity': (50, 80), 'rainfall': (750, 2000)},
        'notes': 'High nutritional value. Fast maturing (3–4 months). Orange-fleshed variety reduces malnutrition, WFP promoted in Sierra Leone.',
        'local_name_krio': 'Swit Pateto'
    },
    'Yam': {
        'emoji': '🧅', 'category': 'Root Crop',
        'ideal': {'N': (40, 100), 'P': (20, 60), 'K': (60, 160), 'pH': (5.5, 7.0), 'temp': (25, 35), 'humidity': (60, 80), 'rainfall': (1000, 2000)},
        'notes': 'High-value crop with strong local and regional market. Requires staking. Popular in Eastern Province.',
        'local_name_krio': 'Yam'
    },
    'Tomato': {
        'emoji': '🍅', 'category': 'Vegetable',
        'ideal': {'N': (80, 140), 'P': (40, 100), 'K': (100, 200), 'pH': (6.0, 7.0), 'temp': (20, 30), 'humidity': (40, 70), 'rainfall': (600, 1500)},
        'notes': 'High demand and good market price in Freetown. Best grown in dry season with irrigation to avoid late blight.',
        'local_name_krio': 'Tomato'
    },
    'Pepper': {
        'emoji': '🌶️', 'category': 'Vegetable',
        'ideal': {'N': (60, 120), 'P': (30, 80), 'K': (60, 140), 'pH': (5.5, 7.0), 'temp': (20, 32), 'humidity': (50, 80), 'rainfall': (600, 1200)},
        'notes': 'High market value. Both sweet and hot pepper in high demand. Good for kitchen gardens near urban areas.',
        'local_name_krio': 'Peper'
    },
    'Cabbage': {
        'emoji': '🥬', 'category': 'Vegetable',
        'ideal': {'N': (100, 160), 'P': (40, 100), 'K': (60, 140), 'pH': (6.0, 7.5), 'temp': (15, 25), 'humidity': (60, 80), 'rainfall': (500, 1000)},
        'notes': 'Best grown in highlands. Good yield in Kono and Koinadugu districts. Dry season crop with irrigation.',
        'local_name_krio': 'Cabbage'
    },
    'Mango': {
        'emoji': '🥭', 'category': 'Fruit Tree',
        'ideal': {'N': (20, 80), 'P': (10, 50), 'K': (30, 100), 'pH': (5.5, 7.5), 'temp': (24, 38), 'humidity': (40, 70), 'rainfall': (750, 2500)},
        'notes': 'Long-term investment, bears fruit in 3–5 years. High export potential. Grows across most of Sierra Leone.',
        'local_name_krio': 'Mango'
    },
    'Banana': {
        'emoji': '🍌', 'category': 'Fruit',
        'ideal': {'N': (100, 160), 'P': (20, 80), 'K': (120, 240), 'pH': (5.5, 7.0), 'temp': (22, 35), 'humidity': (70, 90), 'rainfall': (1500, 3500)},
        'notes': 'Year-round harvest. High local demand. Suits humid coastal areas and river valleys.',
        'local_name_krio': 'Banana'
    },
    'Plantain': {
        'emoji': '🍌', 'category': 'Fruit',
        'ideal': {'N': (80, 140), 'P': (20, 60), 'K': (100, 200), 'pH': (5.5, 7.0), 'temp': (22, 35), 'humidity': (70, 90), 'rainfall': (1500, 3000)},
        'notes': 'Staple food supplement. High demand in all Sierra Leone markets. Grows alongside cassava effectively.',
        'local_name_krio': 'Plantein'
    },
    'Cocoa': {
        'emoji': '🍫', 'category': 'Cash Crop',
        'ideal': {'N': (20, 80), 'P': (10, 50), 'K': (20, 80), 'pH': (6.0, 7.5), 'temp': (20, 30), 'humidity': (70, 90), 'rainfall': (1500, 3000)},
        'notes': 'Top export earner for Sierra Leone. Best in Eastern Province (Kenema, Kailahun, Kono). Long-term income investment.',
        'local_name_krio': 'Koko'
    },
    'Coffee': {
        'emoji': '☕', 'category': 'Cash Crop',
        'ideal': {'N': (20, 80), 'P': (10, 60), 'K': (20, 80), 'pH': (5.5, 6.5), 'temp': (15, 28), 'humidity': (60, 80), 'rainfall': (1200, 2500)},
        'notes': 'Export crop. Robusta variety suits Sierra Leone highlands. Good shade-tree intercropping potential.',
        'local_name_krio': 'Kofi'
    },
    'Oil Palm': {
        'emoji': '🌴', 'category': 'Cash Crop',
        'ideal': {'N': (20, 80), 'P': (10, 60), 'K': (40, 120), 'pH': (4.5, 7.0), 'temp': (22, 35), 'humidity': (70, 90), 'rainfall': (2000, 4000)},
        'notes': 'Sierra Leone has natural palm oil potential. Long-term crop (25+ years). High local and export demand.',
        'local_name_krio': 'Palm'
    },
}

def score_crop(crop_data, n, p, k, ph, temp, humidity, rainfall):
    ideal = crop_data['ideal']
    scores = []

    def range_score(val, low, high):
        if low <= val <= high:
            return 100
        elif val < low:
            return max(0, 100 - ((low - val) / low) * 100)
        else:
            return max(0, 100 - ((val - high) / high) * 80)

    scores.append(range_score(n, *ideal['N']) * 0.20)
    scores.append(range_score(p, *ideal['P']) * 0.15)
    scores.append(range_score(k, *ideal['K']) * 0.15)
    scores.append(range_score(ph, *ideal['pH']) * 0.20)
    scores.append(range_score(temp, *ideal['temp']) * 0.15)
    scores.append(range_score(humidity, *ideal['humidity']) * 0.05)
    scores.append(range_score(rainfall, *ideal['rainfall']) * 0.10)

    return round(sum(scores), 1)


@recommend_bp.route('/crops', methods=['POST'])
@jwt_required()
def recommend_crops():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    required = ['nitrogen', 'phosphorus', 'potassium', 'ph', 'temperature', 'humidity', 'rainfall']
    for field in required:
        if field not in data:
            return jsonify({'error': f'{field} is required'}), 400

    try:
        n = float(data['nitrogen'])
        p = float(data['phosphorus'])
        k = float(data['potassium'])
        ph = float(data['ph'])
        temp = float(data['temperature'])
        humidity = float(data['humidity'])
        rainfall = float(data['rainfall'])
    except (ValueError, TypeError):
        return jsonify({'error': 'All values must be numbers'}), 400

    scored = []
    for name, crop_data in CROP_DATABASE.items():
        score = score_crop(crop_data, n, p, k, ph, temp, humidity, rainfall)
        scored.append({
            'crop': name,
            'emoji': crop_data['emoji'],
            'category': crop_data['category'],
            'score': score,
            'notes': crop_data['notes'],
            'local_name_krio': crop_data['local_name_krio']
        })

    scored.sort(key=lambda x: x['score'], reverse=True)
    top_recommendations = scored[:6]

    # Try Hugging Face API for additional validation
    hf_token = current_app.config.get('HUGGINGFACE_API_TOKEN', '')
    if hf_token:
        try:
            hf_url = "https://api-inference.huggingface.co/models/Einmalumdiewelt/PantagruelGPT_large"
            # We use our scoring as primary — HF as supporting
        except Exception:
            pass

    rec = CropRecommendation(
        user_id=user_id,
        nitrogen=n, phosphorus=p, potassium=k,
        ph=ph, temperature=temp, humidity=humidity, rainfall=rainfall,
        district=data.get('district', ''),
        recommendations=top_recommendations
    )
    db.session.add(rec)
    db.session.commit()

    # Add harvest predictions for top 3 recommended crops
    plot_size = float(data.get('plot_size', 1.0) or 1.0)
    practices = data.get('practices', 'traditional')
    harvest_predictions = []
    for crop_rec in top_recommendations[:3]:
        pred = get_harvest_prediction(crop_rec.get('crop', ''), plot_size, practices)
        if pred:
            harvest_predictions.append(pred)

    return jsonify({
        'id': rec.id,
        'recommendations': top_recommendations,
        'all_crops': scored,
        'harvest_predictions': harvest_predictions,
        'created_at': rec.created_at.isoformat()
    }), 200
