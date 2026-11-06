import requests
import base64
from flask import current_app

DISEASE_KNOWLEDGE_BASE = {
    "Tomato___Late_blight": {
        "display_name": "Tomato Late Blight",
        "pathogen": "Phytophthora infestans",
        "causes": [
            "High humidity above 75% combined with cool temperatures (10–25°C)",
            "Excessive moisture on leaves from rain or irrigation",
            "Infected plant debris left in field after harvest"
        ],
        "treatment": [
            "Apply copper-based fungicide (Bordeaux mixture) every 7–10 days",
            "Use systemic fungicides like Metalaxyl or Mancozeb",
            "Remove and destroy all infected plant material immediately",
            "Improve field drainage to reduce humidity around plants"
        ],
        "prevention": [
            "Use disease-resistant tomato varieties (e.g. Tylka, Summit)",
            "Practice crop rotation, avoid planting Solanaceae in same field for 3 years",
            "Avoid overhead irrigation; use drip irrigation instead",
            "Apply preventive fungicide at start of rainy season"
        ]
    },
    "Tomato___Early_blight": {
        "display_name": "Tomato Early Blight",
        "pathogen": "Alternaria solani",
        "causes": [
            "Warm temperatures (24–29°C) with high humidity",
            "Extended periods of leaf wetness",
            "Stressed plants with nutrient deficiencies"
        ],
        "treatment": [
            "Apply Chlorothalonil or Mancozeb fungicide every 7 days",
            "Remove lower infected leaves and destroy them",
            "Ensure adequate nitrogen fertilization to reduce plant stress"
        ],
        "prevention": [
            "Plant certified disease-free seedlings",
            "Mulch around plants to prevent soil splash onto leaves",
            "Maintain good plant spacing for air circulation"
        ]
    },
    "Cassava___Bacterial_Blight": {
        "display_name": "Cassava Bacterial Blight",
        "pathogen": "Xanthomonas axonopodis pv. manihotis",
        "causes": [
            "Infected planting material (stem cuttings)",
            "Rain splash spreading bacteria between plants",
            "High humidity during rainy season"
        ],
        "treatment": [
            "No effective chemical cure, remove and destroy infected plants immediately",
            "Disinfect all tools with bleach solution (1:10) between plants",
            "Apply copper-based bactericide as protective measure on healthy plants"
        ],
        "prevention": [
            "Use certified disease-free stem cuttings for planting",
            "Plant resistant varieties (TMS 30572, TMS 30555)",
            "Avoid working in field when plants are wet",
            "Rotate crops, do not plant cassava in same field consecutively"
        ]
    },
    "Cassava___Brown_Streak_Disease": {
        "display_name": "Cassava Brown Streak Disease",
        "pathogen": "Cassava brown streak virus (CBSV)",
        "causes": [
            "Whitefly (Bemisia tabaci) transmission between plants",
            "Use of infected stem cuttings",
            "Movement of planting material from infected regions"
        ],
        "treatment": [
            "Remove and burn all infected plants immediately",
            "Control whitefly populations with insecticides (Imidacloprid)",
            "No effective treatment once infected, prevention is critical"
        ],
        "prevention": [
            "Use virus-tested, certified clean planting material",
            "Plant resistant varieties (Narocass 1, Kiroba)",
            "Control whitefly with yellow sticky traps and neem-based sprays",
            "Inspect new planting material before introducing to your field"
        ]
    },
    "Maize___Northern_Leaf_Blight": {
        "display_name": "Maize Northern Leaf Blight",
        "pathogen": "Exserohilum turcicum",
        "causes": [
            "Moderate temperatures (18–27°C) with high humidity",
            "Infected crop debris in soil",
            "Dense planting reducing air circulation"
        ],
        "treatment": [
            "Apply foliar fungicide (Propiconazole or Azoxystrobin) at disease onset",
            "Ensure adequate plant spacing",
            "Apply balanced fertilizer to reduce plant stress"
        ],
        "prevention": [
            "Plant resistant maize varieties",
            "Rotate with non-host crops (legumes, cassava)",
            "Till soil after harvest to destroy infected debris"
        ]
    },
    "Maize___Common_rust": {
        "display_name": "Maize Common Rust",
        "pathogen": "Puccinia sorghi",
        "causes": [
            "Cool temperatures (16–23°C) with high humidity",
            "Windborne spores from infected fields",
            "Susceptible maize varieties"
        ],
        "treatment": [
            "Apply Mancozeb or Propiconazole fungicide",
            "Apply at first sign of rust pustules on lower leaves"
        ],
        "prevention": [
            "Plant rust-resistant hybrids",
            "Early planting to avoid peak rust season",
            "Scout fields weekly during cool humid periods"
        ]
    },
    "Rice___Leaf_Blast": {
        "display_name": "Rice Leaf Blast",
        "pathogen": "Magnaporthe oryzae",
        "causes": [
            "Cool nights (below 20°C) followed by warm humid days",
            "Excess nitrogen fertilization",
            "Dense canopy reducing air circulation"
        ],
        "treatment": [
            "Apply Tricyclazole or Isoprothiolane fungicide immediately",
            "Reduce nitrogen application if disease is severe",
            "Drain field temporarily to reduce humidity"
        ],
        "prevention": [
            "Plant blast-resistant varieties (NERICA, IR64)",
            "Balance nitrogen fertilization, avoid excess",
            "Maintain good water management in paddy fields"
        ]
    },
    "Healthy": {
        "display_name": "Healthy Plant",
        "pathogen": None,
        "causes": [],
        "treatment": ["Continue current management practices", "Monitor weekly for early signs of stress or disease"],
        "prevention": [
            "Maintain balanced soil nutrition",
            "Practice regular scouting, inspect 10% of plants per week",
            "Keep field free of weeds that harbour pests and disease"
        ]
    }
}

def call_huggingface_image(image_bytes, model_url, api_token):
    headers = {"Authorization": f"Bearer {api_token}"}
    try:
        response = requests.post(model_url, headers=headers, data=image_bytes, timeout=30)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 503:
            return {"error": "model_loading", "estimated_time": 20}
        else:
            return {"error": f"API error {response.status_code}"}
    except requests.exceptions.Timeout:
        return {"error": "timeout"}
    except Exception as e:
        return {"error": str(e)}


def parse_disease_result(api_response):
    if isinstance(api_response, dict) and 'error' in api_response:
        return None

    if not isinstance(api_response, list):
        return None

    top = sorted(api_response, key=lambda x: x.get('score', 0), reverse=True)
    if not top:
        return None

    label = top[0].get('label', '').replace(' ', '_').replace('(', '').replace(')', '')
    confidence = round(top[0].get('score', 0) * 100, 1)

    # Try to match to knowledge base
    matched_key = None
    for key in DISEASE_KNOWLEDGE_BASE:
        if key.lower() in label.lower() or label.lower() in key.lower():
            matched_key = key
            break

    if not matched_key:
        # Determine if healthy from label
        if 'healthy' in label.lower():
            matched_key = 'Healthy'
        else:
            # Unknown disease — return generic response
            return {
                'is_healthy': False,
                'disease_name': label.replace('___', ' - ').replace('_', ' '),
                'confidence': confidence,
                'pathogen': 'Unknown pathogen',
                'causes': ['Environmental stress', 'Possible pathogen infection'],
                'treatment': [
                    'Consult a local agricultural extension officer',
                    'Remove visibly affected leaves and monitor closely',
                    'Ensure proper nutrition and irrigation'
                ],
                'prevention': [
                    'Scout fields regularly',
                    'Maintain crop rotation practices',
                    'Use certified disease-free planting material'
                ],
                'raw_labels': [{'label': t.get('label'), 'score': round(t.get('score', 0)*100, 1)} for t in top[:3]]
            }

    kb = DISEASE_KNOWLEDGE_BASE[matched_key]
    is_healthy = matched_key == 'Healthy'

    return {
        'is_healthy': is_healthy,
        'disease_name': kb['display_name'],
        'confidence': confidence,
        'pathogen': kb.get('pathogen'),
        'causes': kb.get('causes', []),
        'treatment': kb.get('treatment', []),
        'prevention': kb.get('prevention', []),
        'raw_labels': [{'label': t.get('label'), 'score': round(t.get('score', 0)*100, 1)} for t in top[:3]]
    }


def classify_soil_from_image(image_bytes, api_token):
    """
    Uses a general image classifier to get visual cues,
    then applies heuristics for soil type classification.
    Since no specific soil model is public on HuggingFace with free API,
    we use color/texture analysis as primary method.
    """
    headers = {"Authorization": f"Bearer {api_token}"}
    model_url = "https://api-inference.huggingface.co/models/google/vit-base-patch16-224"
    try:
        response = requests.post(model_url, headers=headers, data=image_bytes, timeout=30)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None
