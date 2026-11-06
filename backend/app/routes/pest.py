import os
import datetime
import requests
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required

pest_bp = Blueprint('pest', __name__)

SL_LOCATIONS = {
    'Freetown': {'lat': 8.4657, 'lon': -13.2317},
    'Bo':       {'lat': 7.9647, 'lon': -11.7383},
    'Kenema':   {'lat': 7.8762, 'lon': -11.1903},
    'Makeni':   {'lat': 8.8849, 'lon': -12.0467},
    'Koidu':    {'lat': 8.6386, 'lon': -10.9653},
    'Moyamba':  {'lat': 8.1597, 'lon': -12.4323},
    'Port Loko':{'lat': 8.7666, 'lon': -12.8710},
    'Kabala':   {'lat': 9.5855, 'lon': -11.5473},
    'Kailahun': {'lat': 8.2781, 'lon': -10.5773},
    'Pujehun':  {'lat': 7.3527, 'lon': -11.7175},
}

CITY_MAP = {
    'Bo': 'Bo', 'Bombali': 'Makeni', 'Bonthe': 'Moyamba',
    'Falaba': 'Kabala', 'Kailahun': 'Kailahun', 'Kambia': 'Freetown',
    'Karene': 'Makeni', 'Kenema': 'Kenema', 'Koinadugu': 'Kabala',
    'Kono': 'Koidu', 'Moyamba': 'Moyamba', 'Port Loko': 'Port Loko',
    'Pujehun': 'Pujehun', 'Tonkolili': 'Makeni',
    'Western Area Rural': 'Freetown', 'Western Area Urban': 'Freetown',
}

PEST_KNOWLEDGE = [
    {
        'pest_name': 'Fall Armyworm (Spodoptera frugiperda)',
        'affected_crops': ['Maize', 'Sorghum', 'Rice', 'Millet'],
        'temp_min': 20, 'temp_max': 35, 'humidity_min': 40,
        'peak_months': [4, 5, 6, 7, 8],
        'description': 'Destructive moth larvae boring into maize whorls. Can destroy 20–50% of yield if not controlled early.',
        'action': 'Inspect whorl leaves daily. Apply Emamectin benzoate or Chlorpyrifos into whorl at first detection. Use pheromone traps for monitoring. Bacillus thuringiensis (Bt) is an effective biological option.',
    },
    {
        'pest_name': 'Late Blight (Phytophthora infestans)',
        'affected_crops': ['Tomato', 'Potato', 'Pepper'],
        'temp_min': 10, 'temp_max': 25, 'humidity_min': 75,
        'peak_months': [5, 6, 7, 8, 9, 10],
        'description': 'Devastating fungal disease destroying entire tomato crops within days under cool humid conditions.',
        'action': 'Apply copper-based fungicide (Bordeaux mixture) preventively every 7 days. Remove infected material immediately. Avoid overhead irrigation.',
    },
    {
        'pest_name': 'Cassava Mosaic Virus (Whitefly-transmitted)',
        'affected_crops': ['Cassava'],
        'temp_min': 22, 'temp_max': 35, 'humidity_min': 50,
        'peak_months': [1, 2, 3, 4, 11, 12],
        'description': 'Viral disease causing mosaic leaf patterns and severe yield loss, spread by whitefly populations.',
        'action': 'Control whitefly with yellow sticky traps and neem-based insecticide. Plant only certified disease-free cuttings. Remove and destroy infected plants.',
    },
    {
        'pest_name': 'Rice Yellow Mottle Virus',
        'affected_crops': ['Rice'],
        'temp_min': 25, 'temp_max': 35, 'humidity_min': 70,
        'peak_months': [5, 6, 7, 8, 9],
        'description': 'Most important rice disease in sub-Saharan Africa. Spreads through water and infected plant material.',
        'action': 'Use certified seed only. Drain fields periodically to disrupt disease cycle. Plant NERICA resistant varieties. Clean all tools between fields.',
    },
    {
        'pest_name': 'Cassava Brown Streak Virus',
        'affected_crops': ['Cassava'],
        'temp_min': 20, 'temp_max': 30, 'humidity_min': 60,
        'peak_months': [4, 5, 6, 7, 8, 9],
        'description': 'Causes root necrosis making entire harvest inedible. Spreading rapidly in Eastern Province of Sierra Leone.',
        'action': 'Plant only virus-tested certified cuttings. Use resistant varieties Narocass 1 or Kiroba. Control whitefly vector. Report new cases to your district agricultural office.',
    },
    {
        'pest_name': 'Grasshopper / Locust Pressure',
        'affected_crops': ['Maize', 'Rice', 'Cassava', 'Groundnut', 'Vegetables'],
        'temp_min': 28, 'temp_max': 42, 'humidity_min': 15,
        'peak_months': [11, 12, 1, 2, 3],
        'description': 'Migratory pest capable of destroying entire fields within hours. Higher pressure during dry season.',
        'action': 'Scout field edges daily during dry season. Contact district agricultural officer immediately if swarm detected. Coordinate with neighbouring farmers for joint control using Malathion.',
    },
]


def get_live_weather(district):
    """Fetch real weather from OpenWeatherMap."""
    api_key = os.environ.get('OPENWEATHER_API_KEY', '')
    if not api_key:
        return None, None

    city = CITY_MAP.get(district, 'Freetown')
    coords = SL_LOCATIONS.get(city, SL_LOCATIONS['Freetown'])

    try:
        resp = requests.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params={'lat': coords['lat'], 'lon': coords['lon'], 'appid': api_key, 'units': 'metric'},
            timeout=6
        )
        if resp.status_code == 200:
            wd = resp.json()
            return round(wd['main']['temp'], 1), wd['main']['humidity']
    except Exception as e:
        current_app.logger.warning(f"Weather fetch failed for pest alerts: {e}")
    return None, None


def calculate_risk(pest, temp, humidity, month):
    score = 0
    # Temperature match
    if pest['temp_min'] <= temp <= pest['temp_max']:
        score += 40
    elif abs(temp - pest['temp_min']) <= 4 or abs(temp - pest['temp_max']) <= 4:
        score += 20
    # Humidity match
    if humidity >= pest['humidity_min']:
        score += 35
    elif humidity >= pest['humidity_min'] - 10:
        score += 15
    # Seasonal match
    if month in pest['peak_months']:
        score += 25

    if score >= 70:
        return 'high'
    elif score >= 40:
        return 'medium'
    return 'low'


@pest_bp.route('/alerts', methods=['GET'])
@jwt_required()
def get_pest_alerts():
    district = request.args.get('district', 'Western Area Urban')
    month = datetime.datetime.utcnow().month

    # Get live weather
    temperature, humidity = get_live_weather(district)

    if temperature is None:
        return jsonify({'error': 'Could not fetch live weather data. Check OPENWEATHER_API_KEY in backend/.env'}), 503

    alerts = []
    for pest in PEST_KNOWLEDGE:
        risk = calculate_risk(pest, temperature, humidity, month)
        alerts.append({
            'pest_name': pest['pest_name'],
            'affected_crops': pest['affected_crops'],
            'risk_level': risk,
            'description': pest['description'],
            'recommended_action': pest['action'],
            'conditions': f"Current: {temperature}°C, {humidity}% humidity, {datetime.datetime.utcnow().strftime('%B')}"
        })

    alerts.sort(key=lambda x: {'high': 0, 'medium': 1, 'low': 2}[x['risk_level']])

    return jsonify({
        'district': district,
        'alerts': alerts,
        'weather': {'temperature': temperature, 'humidity': humidity, 'month': month}
    }), 200
