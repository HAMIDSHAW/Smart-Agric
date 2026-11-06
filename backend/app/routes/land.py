from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import LandAssessment

land_bp = Blueprint('land', __name__)

# Real Sierra Leone district climate data (sourced from MAFFS and FAO)
DISTRICT_DATA = {
    'Bo':               {'rainfall': 2400, 'temp': 27.2, 'humidity': 78, 'soil': 'Laterite/Clay Loam', 'elevation': 'Low'},
    'Bombali':          {'rainfall': 1980, 'temp': 28.1, 'humidity': 67, 'soil': 'Sandy Loam', 'elevation': 'Low-Mid'},
    'Bonthe':           {'rainfall': 3520, 'temp': 26.8, 'humidity': 86, 'soil': 'Clay/Alluvial', 'elevation': 'Coastal'},
    'Falaba':           {'rainfall': 1620, 'temp': 25.9, 'humidity': 61, 'soil': 'Sandy Loam', 'elevation': 'High'},
    'Kailahun':         {'rainfall': 2840, 'temp': 26.9, 'humidity': 80, 'soil': 'Clay Loam', 'elevation': 'Low-Mid'},
    'Kambia':           {'rainfall': 2180, 'temp': 27.3, 'humidity': 75, 'soil': 'Sandy Clay', 'elevation': 'Coastal'},
    'Karene':           {'rainfall': 1790, 'temp': 27.1, 'humidity': 70, 'soil': 'Sandy Loam', 'elevation': 'Low-Mid'},
    'Kenema':           {'rainfall': 2650, 'temp': 26.8, 'humidity': 79, 'soil': 'Laterite/Clay Loam', 'elevation': 'Low-Mid'},
    'Koinadugu':        {'rainfall': 1710, 'temp': 25.4, 'humidity': 64, 'soil': 'Sandy', 'elevation': 'High'},
    'Kono':             {'rainfall': 2520, 'temp': 26.3, 'humidity': 76, 'soil': 'Laterite', 'elevation': 'Mid-High'},
    'Moyamba':          {'rainfall': 2810, 'temp': 27.0, 'humidity': 80, 'soil': 'Clay Loam', 'elevation': 'Low'},
    'Port Loko':        {'rainfall': 2220, 'temp': 27.4, 'humidity': 74, 'soil': 'Sandy Clay Loam', 'elevation': 'Coastal'},
    'Pujehun':          {'rainfall': 2790, 'temp': 27.1, 'humidity': 81, 'soil': 'Clay Loam', 'elevation': 'Low'},
    'Tonkolili':        {'rainfall': 2090, 'temp': 27.2, 'humidity': 72, 'soil': 'Sandy Clay', 'elevation': 'Low-Mid'},
    'Western Area Rural': {'rainfall': 3010, 'temp': 27.5, 'humidity': 82, 'soil': 'Clay', 'elevation': 'Coastal-Low'},
    'Western Area Urban': {'rainfall': 2980, 'temp': 28.2, 'humidity': 80, 'soil': 'Clay', 'elevation': 'Coastal'},
}

# Crop requirements and yield data (from MAFFS Sierra Leone and FAO)
CROP_DATA = {
    'Cassava': {
        'rain_min': 1000, 'rain_max': 3000,
        'temp_min': 20, 'temp_max': 35,
        'humidity_min': 50,
        'best_districts': ['Bo', 'Kenema', 'Kailahun', 'Moyamba', 'Pujehun', 'Kono'],
        'base_yield_t_ha': 11.5,
        'unit': 'tonnes/ha (fresh root)',
        'season_best': 'Rainy',
    },
    'Maize': {
        'rain_min': 600, 'rain_max': 2000,
        'temp_min': 20, 'temp_max': 33,
        'humidity_min': 45,
        'best_districts': ['Bombali', 'Tonkolili', 'Karene', 'Koinadugu', 'Falaba'],
        'base_yield_t_ha': 2.8,
        'unit': 'tonnes/ha (grain)',
        'season_best': 'Rainy',
    },
    'Rice': {
        'rain_min': 1200, 'rain_max': 4000,
        'temp_min': 22, 'temp_max': 35,
        'humidity_min': 60,
        'best_districts': ['Tonkolili', 'Bo', 'Moyamba', 'Port Loko', 'Bombali', 'Kambia'],
        'base_yield_t_ha': 2.2,
        'unit': 'tonnes/ha (paddy)',
        'season_best': 'Rainy',
    },
    'Groundnut': {
        'rain_min': 500, 'rain_max': 1500,
        'temp_min': 22, 'temp_max': 35,
        'humidity_min': 40,
        'best_districts': ['Bombali', 'Tonkolili', 'Karene', 'Koinadugu', 'Falaba', 'Kambia'],
        'base_yield_t_ha': 1.4,
        'unit': 'tonnes/ha (in-shell)',
        'season_best': 'Dry',
    },
    'Sweet Potato': {
        'rain_min': 750, 'rain_max': 2000,
        'temp_min': 20, 'temp_max': 30,
        'humidity_min': 50,
        'best_districts': ['Bo', 'Kenema', 'Moyamba', 'Kailahun', 'Port Loko'],
        'base_yield_t_ha': 8.5,
        'unit': 'tonnes/ha (fresh root)',
        'season_best': 'Rainy',
    },
    'Mango': {
        'rain_min': 1000, 'rain_max': 2500,
        'temp_min': 24, 'temp_max': 38,
        'humidity_min': 40,
        'best_districts': ['Kenema', 'Kailahun', 'Bo', 'Kono', 'Moyamba', 'Bombali'],
        'base_yield_t_ha': 7.2,
        'unit': 'tonnes/ha (fruit)',
        'season_best': 'Both',
    },
    'Cocoa': {
        'rain_min': 1500, 'rain_max': 3000,
        'temp_min': 20, 'temp_max': 30,
        'humidity_min': 70,
        'best_districts': ['Kenema', 'Kailahun', 'Kono', 'Bo'],
        'base_yield_t_ha': 0.75,
        'unit': 'tonnes/ha (dry bean)',
        'season_best': 'Both',
    },
    'Oil Palm': {
        'rain_min': 2000, 'rain_max': 4000,
        'temp_min': 22, 'temp_max': 35,
        'humidity_min': 70,
        'best_districts': ['Bonthe', 'Moyamba', 'Pujehun', 'Bo', 'Kenema', 'Port Loko'],
        'base_yield_t_ha': 3.8,
        'unit': 'tonnes FFB/ha',
        'season_best': 'Both',
    },
    'Tomato': {
        'rain_min': 400, 'rain_max': 1200,
        'temp_min': 20, 'temp_max': 30,
        'humidity_min': 40,
        'best_districts': ['Western Area Urban', 'Western Area Rural', 'Bombali', 'Tonkolili'],
        'base_yield_t_ha': 12.0,
        'unit': 'tonnes/ha (fresh fruit)',
        'season_best': 'Dry',
    },
}


def score_land(district, crop, season, slope):
    """
    Real scoring, each input changes the result.
    Rainfall, temperature, humidity, district suitability, season, slope all matter.
    """
    d = DISTRICT_DATA.get(district, DISTRICT_DATA['Bo'])
    c = CROP_DATA.get(crop, CROP_DATA['Cassava'])

    score = 0
    reasons = []

    # --- RAINFALL (30 points) ---
    rain = d['rainfall']
    if c['rain_min'] <= rain <= c['rain_max']:
        score += 30
        reasons.append(f"Rainfall {rain}mm is within the ideal range of {c['rain_min']}–{c['rain_max']}mm for {crop}")
    elif rain < c['rain_min']:
        pct = rain / c['rain_min']
        pts = round(30 * pct)
        score += pts
        shortfall = c['rain_min'] - rain
        reasons.append(f"Rainfall {rain}mm is {shortfall}mm below minimum, supplementary irrigation will be needed")
    else:
        excess_pct = (rain - c['rain_max']) / c['rain_max']
        pts = max(0, round(30 - excess_pct * 40))
        score += pts
        reasons.append(f"Rainfall {rain}mm exceeds ideal maximum, good drainage channels are essential")

    # --- TEMPERATURE (25 points) ---
    temp = d['temp']
    if c['temp_min'] <= temp <= c['temp_max']:
        score += 25
        reasons.append(f"Average temperature {temp}°C is within the ideal range for {crop}")
    elif temp < c['temp_min']:
        pts = max(0, round(25 - (c['temp_min'] - temp) * 5))
        score += pts
        reasons.append(f"Temperature {temp}°C is below ideal minimum {c['temp_min']}°C, consider heat-tolerant varieties")
    else:
        pts = max(0, round(25 - (temp - c['temp_max']) * 4))
        score += pts
        reasons.append(f"Temperature {temp}°C is above ideal maximum {c['temp_max']}°C, shade management recommended")

    # --- HUMIDITY (15 points) ---
    if d['humidity'] >= c['humidity_min']:
        score += 15
    else:
        pct = d['humidity'] / c['humidity_min']
        pts = round(15 * pct)
        score += pts
        reasons.append(f"Humidity {d['humidity']}% is below crop optimum {c['humidity_min']}%, mulching and cover crops recommended")

    # --- DISTRICT SUITABILITY (20 points) ---
    if district in c['best_districts']:
        score += 20
        reasons.append(f"{district} is one of Sierra Leone's best districts for growing {crop}")
    else:
        score += 5
        reasons.append(f"{district} can grow {crop} but is not among the optimal districts, extra management needed")

    # --- SEASON MATCH (10 points) ---
    if c['season_best'] == 'Both':
        score += 10
        reasons.append(f"{crop} grows well in both seasons")
    elif c['season_best'].lower() in season.lower():
        score += 10
        reasons.append(f"{season} is the correct season for {crop} in Sierra Leone")
    else:
        score += 3
        reasons.append(f"{season} is not the recommended season, {c['season_best']} season gives much better yields")

    # --- SLOPE PENALTY ---
    if slope > 15:
        penalty = min(25, round((slope - 15) * 2.0))
        score -= penalty
        reasons.append(f"Slope of {slope}° is steep, {penalty} point penalty. Terracing required to prevent erosion")
    elif slope > 8:
        penalty = round((slope - 8) * 1.2)
        score -= penalty
        reasons.append(f"Slope of {slope}° needs contour planting, {penalty} point penalty")

    final = int(max(5, min(97, round(score))))
    level = 'High' if final >= 75 else ('Moderate' if final >= 50 else 'Low')

    return final, level, reasons, d, c


def calculate_yield(score, crop_data, plot_size):
    base = crop_data['base_yield_t_ha']
    # Yield scales with suitability score
    multiplier = score / 80.0
    yield_per_ha_min = round(base * multiplier * 0.75, 1)
    yield_per_ha_max = round(base * multiplier * 1.25, 1)
    total_min = round(yield_per_ha_min * plot_size, 1)
    total_max = round(yield_per_ha_max * plot_size, 1)
    return yield_per_ha_min, yield_per_ha_max, total_min, total_max


@land_bp.route('/assess', methods=['POST'])
@jwt_required()
def assess_land():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    district = data.get('district', 'Bo')
    target_crop = data.get('target_crop', 'Cassava')
    season = data.get('season', 'Rainy (May–Oct)')
    plot_size = float(data.get('plot_size', 1.0))
    slope = float(data.get('slope', 0))

    if district not in DISTRICT_DATA:
        district = 'Bo'
    if target_crop not in CROP_DATA:
        target_crop = 'Cassava'

    score, level, reasons, district_profile, crop_info = score_land(district, target_crop, season, slope)
    y_min, y_max, t_min, t_max = calculate_yield(score, crop_info, plot_size)

    notes = f"{district} district: {district_profile['rainfall']}mm annual rainfall, avg {district_profile['temp']}°C, {district_profile['soil']} soil. "
    if reasons:
        notes += reasons[0]

    assessment = LandAssessment(
        user_id=user_id,
        district=district,
        target_crop=target_crop,
        season=season,
        plot_size=plot_size,
        slope=slope,
        suitability_score=score,
        suitability_level=level,
        yield_min=y_min,
        yield_max=y_max,
        agronomist_notes=notes
    )
    db.session.add(assessment)
    db.session.commit()

    return jsonify({
        'id': assessment.id,
        'district': district,
        'target_crop': target_crop,
        'season': season,
        'plot_size': plot_size,
        'slope': slope,
        'suitability_score': score,
        'suitability_level': level,
        'yield_min': y_min,
        'yield_max': y_max,
        'yield_unit': crop_info['unit'],
        'total_yield_min': t_min,
        'total_yield_max': t_max,
        'reasoning': reasons,
        'district_profile': district_profile,
        'notes': notes,
        'created_at': assessment.created_at.isoformat()
    }), 200
