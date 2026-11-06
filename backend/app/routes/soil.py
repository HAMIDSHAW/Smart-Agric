import os
import uuid
import struct
import zlib
import math
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import SoilAnalysis

from app.services.ratelimit import rate_limit

soil_bp = Blueprint('soil', __name__)

SOIL_TYPES = {
    'Laterite': {
        'characteristics': [
            'Reddish-orange to brick-red colour from iron and aluminium oxides',
            'Hardens to concrete-like consistency when exposed to air and sun',
            'Very low organic matter, typically less than 1%',
            'Common throughout Sierra Leone where forest has been cleared',
            'Highly acidic, pH typically 4.5–5.5'
        ],
        'suitable_crops': ['Cassava', 'Oil Palm', 'Mango', 'Groundnut', 'Sweet Potato', 'Pineapple'],
        'improvement_tips': [
            'Apply minimum 5 tonnes of compost or manure per hectare before each planting season',
            'Never leave soil bare, mulch heavily or use cover crops like cowpea or velvet bean',
            'Apply agricultural lime at 1–2 tonnes/ha to raise pH above 5.8 before planting',
            'Agroforestry with Gliricidia or Leucaena trees fixes nitrogen and rebuilds organic matter',
            'Avoid burning, it destroys the organic matter that laterite soils desperately need'
        ],
        'water_retention': 'Low', 'drainage': 'Good', 'nutrient_level': 'Very Low',
        'common_districts': ['Kenema', 'Kono', 'Kailahun', 'Bo upland', 'Koinadugu']
    },
    'Clay': {
        'characteristics': [
            'Dark grey to blue-grey colour, sometimes with green tinge in waterlogged areas',
            'Extremely sticky when wet, moulds easily and holds shape',
            'Cracks deeply and hardens when dry',
            'Very poor drainage, water sits on surface after rain',
            'High nutrient content but nutrients are often locked up due to waterlogging'
        ],
        'suitable_crops': ['Swamp Rice', 'Sugarcane', 'Oil Palm', 'Taro', 'Water Spinach'],
        'improvement_tips': [
            'Construct drainage channels to remove standing water before planting upland crops',
            'Build raised beds (30–40cm high) for vegetable production',
            'Add coarse sand and compost in equal parts to improve workability',
            'Apply gypsum (calcium sulphate) at 500kg/ha to improve soil structure',
            'Never work this soil when wet, causes severe compaction that lasts years'
        ],
        'water_retention': 'Very High', 'drainage': 'Very Poor', 'nutrient_level': 'High',
        'common_districts': ['Bonthe', 'Moyamba coastal', 'Port Loko lowlands', 'Western Area']
    },
    'Sandy': {
        'characteristics': [
            'Very pale, white to cream to light yellowish colour',
            'Extremely loose and gritty, individual grains visible and felt',
            'Water drains within minutes, cannot hold moisture',
            'Very low nutrient content, nutrients wash out with rain',
            'Warms up very quickly in morning sunshine'
        ],
        'suitable_crops': ['Groundnut', 'Sweet Potato', 'Cassava', 'Watermelon', 'Cowpea', 'Sesame'],
        'improvement_tips': [
            'Apply minimum 10 tonnes of compost or manure per hectare every season',
            'Mulch entire soil surface with at least 10cm of plant material to retain moisture',
            'Apply fertilizer in 3 small applications across the season rather than one large dose',
            'Plant cowpea or groundnut as cover crops between seasons to add nitrogen and organic matter',
            'Drip irrigation is far more efficient than overhead watering on sandy soils'
        ],
        'water_retention': 'Very Low', 'drainage': 'Excellent', 'nutrient_level': 'Very Low',
        'common_districts': ['Bombali', 'Koinadugu highlands', 'Falaba', 'Karene coastal areas']
    },
    'Loam': {
        'characteristics': [
            'Rich dark brown to almost black colour with visible organic matter',
            'Crumbly and easy to work, holds shape briefly then breaks apart',
            'Excellent balance of drainage and moisture retention',
            'Smells earthy, sign of active soil biology and good organic matter',
            'The most productive soil type, ideal for all crops'
        ],
        'suitable_crops': ['Maize', 'Tomato', 'Pepper', 'Vegetables', 'Groundnut', 'Cassava', 'Rice', 'Cocoa'],
        'improvement_tips': [
            'Maintain organic matter by incorporating crop residues after each harvest',
            'Rotate crops every season to prevent nutrient depletion and disease buildup',
            'Test pH annually, target 6.0–6.5 for most crops',
            'Mulch between plant rows to prevent erosion during heavy rains',
            'Minimal intervention needed, protect this soil and it will reward you'
        ],
        'water_retention': 'Good', 'drainage': 'Good', 'nutrient_level': 'High',
        'common_districts': ['Bo valley areas', 'Kenema upland', 'Kailahun valleys', 'Moyamba inland']
    },
    'Clay Loam': {
        'characteristics': [
            'Medium to dark brown colour with slightly sticky feel when wet',
            'Holds shape when squeezed but breaks with moderate pressure',
            'Good moisture retention without becoming waterlogged in most cases',
            'Moderate workability, heavier than loam but easier than pure clay',
            'Good natural fertility, most common productive soil in Sierra Leone'
        ],
        'suitable_crops': ['Cassava', 'Maize', 'Rice', 'Cocoa', 'Oil Palm', 'Tomato', 'Pepper', 'Vegetables'],
        'improvement_tips': [
            'Add compost or manure every season to maintain structure and fertility',
            'Avoid heavy machinery or animals on wet soil, causes compaction',
            'Apply lime if pH falls below 5.8, common in high-rainfall districts',
            'Suitable for most Sierra Leone crops, focus on crop rotation and nutrition',
            'Install simple drainage if water pools for more than 24 hours after heavy rain'
        ],
        'water_retention': 'Good', 'drainage': 'Moderate', 'nutrient_level': 'Medium-High',
        'common_districts': ['Kenema', 'Kailahun', 'Moyamba', 'Bo', 'Pujehun']
    },
    'Sandy Loam': {
        'characteristics': [
            'Light brown to pale brown colour with slightly gritty texture',
            'Easy to work, loose but holds some shape when squeezed',
            'Good drainage with moderate moisture retention',
            'Moderate fertility, better than pure sand but needs regular feeding',
            'Warms up quickly, good for early season planting'
        ],
        'suitable_crops': ['Groundnut', 'Cassava', 'Maize', 'Sweet Potato', 'Tomato', 'Pepper', 'Cowpea'],
        'improvement_tips': [
            'Apply compost at 3–5 tonnes/ha every season to build organic matter',
            'Split fertilizer applications, apply half at planting, half at 4–6 weeks',
            'Mulching is essential, reduces moisture loss by up to 40% in dry season',
            'Ideal for dry season vegetable production with drip or furrow irrigation',
            'Plant velvet bean or cowpea during off-season to protect and improve soil'
        ],
        'water_retention': 'Moderate', 'drainage': 'Good', 'nutrient_level': 'Moderate',
        'common_districts': ['Bombali', 'Tonkolili', 'Karene', 'Kambia', 'Port Loko']
    }
}


# ─── REAL PIXEL COLOR ANALYSIS ───────────────────────────────

def decode_png_pixels(data):
    """Decode PNG file and extract average RGB values using pure Python."""
    try:
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            return None, None, None

        pos = 8
        width = height = 0
        idat_data = b''
        color_type = 2
        bit_depth = 8

        while pos < len(data) - 12:
            if pos + 8 > len(data):
                break
            length = struct.unpack('>I', data[pos:pos+4])[0]
            chunk_type = data[pos+4:pos+8]
            chunk_data = data[pos+8:pos+8+length] if pos+8+length <= len(data) else b''

            if chunk_type == b'IHDR' and len(chunk_data) >= 13:
                width = struct.unpack('>I', chunk_data[0:4])[0]
                height = struct.unpack('>I', chunk_data[4:8])[0]
                bit_depth = chunk_data[8]
                color_type = chunk_data[9]
            elif chunk_type == b'IDAT':
                idat_data += chunk_data
            elif chunk_type == b'IEND':
                break
            pos += 12 + length

        if not idat_data or width == 0 or height == 0:
            return None, None, None

        raw = zlib.decompress(idat_data)

        if color_type in (2, 6):
            bpp = 3 if color_type == 2 else 4
        elif color_type == 0:
            bpp = 1
        else:
            return None, None, None

        stride = width * bpp + 1

        reds, greens, blues = [], [], []
        row_step = max(1, height // 30)
        col_step = max(1, width // 20)

        for row in range(0, height, row_step):
            base = row * stride + 1
            for col in range(0, width, col_step):
                px = base + col * bpp
                if px + bpp > len(raw):
                    continue
                if bpp >= 3:
                    reds.append(raw[px])
                    greens.append(raw[px+1])
                    blues.append(raw[px+2])
                else:
                    v = raw[px]
                    reds.append(v); greens.append(v); blues.append(v)

        if len(reds) < 5:
            return None, None, None

        return sum(reds)/len(reds), sum(greens)/len(greens), sum(blues)/len(blues)

    except Exception as e:
        current_app.logger.warning(f"PNG decode error: {e}")
        return None, None, None


def estimate_rgb_from_jpeg(data):
    """
    Estimate brightness and approximate RGB from JPEG byte distribution.
    JPEG stores DCT coefficients after the header (~500 bytes).
    High byte values generally correlate with brighter/lighter pixels.
    """
    try:
        if data[:2] != b'\xff\xd8':
            return None, None, None

        # Skip JPEG headers (SOS marker 0xFFDA signals start of image data)
        pos = 2
        while pos < len(data) - 4:
            if data[pos] == 0xFF:
                marker = data[pos+1]
                if marker == 0xDA:  # SOS - start of scan
                    pos += 2
                    break
                elif marker in (0xD8, 0xD9):
                    pos += 2
                else:
                    if pos + 4 <= len(data):
                        length = struct.unpack('>H', data[pos+2:pos+4])[0]
                        pos += 2 + length
                    else:
                        break
            else:
                pos += 1

        scan_data = data[pos:pos+20000]  # First 20KB of image data
        if len(scan_data) < 100:
            scan_data = data[500:20500]  # Fallback

        # Sample bytes
        sample = scan_data[::15][:500]
        if len(sample) < 50:
            return None, None, None

        avg = sum(sample) / len(sample)
        # JPEG DCT coefficients: higher avg = brighter image
        # Map to approximate brightness
        brightness = min(255, max(0, avg * 1.8))

        # Estimate color channels from byte patterns
        # JPEG interleaves Y, Cb, Cr - we approximate
        # High values with some variation = colorful
        variance = sum((x - avg)**2 for x in sample) / len(sample)
        std = math.sqrt(variance)

        # Rough RGB estimation based on brightness and variance
        if brightness < 80:
            r, g, b = brightness * 1.4, brightness * 0.9, brightness * 0.6
        elif brightness < 140:
            r, g, b = brightness * 1.2, brightness * 1.0, brightness * 0.7
        elif brightness < 180:
            r, g, b = brightness * 1.1, brightness * 1.0, brightness * 0.85
        else:
            r, g, b = brightness, brightness * 0.97, brightness * 0.88

        return min(255, r), min(255, g), min(255, b)

    except Exception as e:
        current_app.logger.warning(f"JPEG estimate error: {e}")
        return None, None, None



# Detailed nutrient profiles per soil type (typical Sierra Leone values)
SOIL_NUTRIENTS = {
    'Laterite': {
        'nitrogen':     {'level': 'Low',       'value': '0.05-0.12%',  'mgkg': '28-45'},
        'phosphorus':   {'level': 'Very Low',  'value': '2-8 mg/kg',   'mgkg': '2-8'},
        'potassium':    {'level': 'Low',       'value': '80-150 mg/kg','mgkg': '80-150'},
        'calcium':      {'level': 'Low',       'value': '200-400 mg/kg','mgkg': '200-400'},
        'magnesium':    {'level': 'Low',       'value': '40-80 mg/kg', 'mgkg': '40-80'},
        'iron':         {'level': 'Very High', 'value': '5000+ mg/kg', 'mgkg': '5000+'},
        'zinc':         {'level': 'Low',       'value': '0.5-1.5 mg/kg','mgkg': '0.5-1.5'},
        'hydrogen_ph':  {'level': 'Acidic',    'value': '4.5-5.5',     'mgkg': None},
        'organic_matter':{'level': 'Low',      'value': '1.0-2.5%',    'mgkg': None},
        'cec':          {'description': 'Low cation exchange: nutrients leach easily in rain'},
    },
    'Sandy': {
        'nitrogen':     {'level': 'Very Low',  'value': '0.02-0.06%',  'mgkg': '15-30'},
        'phosphorus':   {'level': 'Low',       'value': '5-12 mg/kg',  'mgkg': '5-12'},
        'potassium':    {'level': 'Very Low',  'value': '40-80 mg/kg', 'mgkg': '40-80'},
        'calcium':      {'level': 'Low',       'value': '150-300 mg/kg','mgkg': '150-300'},
        'magnesium':    {'level': 'Very Low',  'value': '20-50 mg/kg', 'mgkg': '20-50'},
        'iron':         {'level': 'Moderate',  'value': '500-1500 mg/kg','mgkg': '500-1500'},
        'zinc':         {'level': 'Very Low',  'value': '0.3-0.8 mg/kg','mgkg': '0.3-0.8'},
        'hydrogen_ph':  {'level': 'Slightly Acidic','value': '5.5-6.5','mgkg': None},
        'organic_matter':{'level': 'Very Low', 'value': '0.3-1.0%',   'mgkg': None},
        'cec':          {'description': 'Very low cation exchange: nutrients do not stay in soil long'},
    },
    'Clay': {
        'nitrogen':     {'level': 'Moderate',  'value': '0.10-0.25%',  'mgkg': '50-120'},
        'phosphorus':   {'level': 'Low-Moderate','value': '8-20 mg/kg','mgkg': '8-20'},
        'potassium':    {'level': 'High',      'value': '200-400 mg/kg','mgkg': '200-400'},
        'calcium':      {'level': 'High',      'value': '600-1200 mg/kg','mgkg': '600-1200'},
        'magnesium':    {'level': 'Moderate',  'value': '80-160 mg/kg','mgkg': '80-160'},
        'iron':         {'level': 'High',      'value': '1500-4000 mg/kg','mgkg': '1500-4000'},
        'zinc':         {'level': 'Moderate',  'value': '1.0-3.0 mg/kg','mgkg': '1.0-3.0'},
        'hydrogen_ph':  {'level': 'Acidic-Neutral','value': '5.0-6.5','mgkg': None},
        'organic_matter':{'level': 'Moderate', 'value': '2.0-4.0%',   'mgkg': None},
        'cec':          {'description': 'High cation exchange: holds nutrients well but can waterlog'},
    },
    'Loam': {
        'nitrogen':     {'level': 'Good',      'value': '0.12-0.25%',  'mgkg': '60-120'},
        'phosphorus':   {'level': 'Moderate',  'value': '12-25 mg/kg', 'mgkg': '12-25'},
        'potassium':    {'level': 'Moderate',  'value': '150-300 mg/kg','mgkg': '150-300'},
        'calcium':      {'level': 'Good',      'value': '400-800 mg/kg','mgkg': '400-800'},
        'magnesium':    {'level': 'Good',      'value': '80-150 mg/kg','mgkg': '80-150'},
        'iron':         {'level': 'Moderate',  'value': '800-2000 mg/kg','mgkg': '800-2000'},
        'zinc':         {'level': 'Adequate',  'value': '1.5-4.0 mg/kg','mgkg': '1.5-4.0'},
        'hydrogen_ph':  {'level': 'Near Neutral','value': '6.0-7.0',  'mgkg': None},
        'organic_matter':{'level': 'Good',     'value': '2.5-5.0%',   'mgkg': None},
        'cec':          {'description': 'Good cation exchange: holds nutrients well and drains freely'},
    },
    'Sandy Loam': {
        'nitrogen':     {'level': 'Low-Moderate','value': '0.06-0.15%','mgkg': '30-70'},
        'phosphorus':   {'level': 'Low-Moderate','value': '8-18 mg/kg','mgkg': '8-18'},
        'potassium':    {'level': 'Low-Moderate','value': '100-200 mg/kg','mgkg': '100-200'},
        'calcium':      {'level': 'Moderate',  'value': '300-600 mg/kg','mgkg': '300-600'},
        'magnesium':    {'level': 'Low',       'value': '50-100 mg/kg','mgkg': '50-100'},
        'iron':         {'level': 'Moderate',  'value': '600-1800 mg/kg','mgkg': '600-1800'},
        'zinc':         {'level': 'Low',       'value': '0.8-2.0 mg/kg','mgkg': '0.8-2.0'},
        'hydrogen_ph':  {'level': 'Slightly Acidic','value': '5.5-6.5','mgkg': None},
        'organic_matter':{'level': 'Low-Moderate','value': '1.5-3.0%','mgkg': None},
        'cec':          {'description': 'Moderate cation exchange: responds well to fertilizer'},
    },
    'Clay Loam': {
        'nitrogen':     {'level': 'Moderate',  'value': '0.10-0.20%',  'mgkg': '50-100'},
        'phosphorus':   {'level': 'Moderate',  'value': '10-22 mg/kg', 'mgkg': '10-22'},
        'potassium':    {'level': 'Moderate-High','value': '180-350 mg/kg','mgkg': '180-350'},
        'calcium':      {'level': 'Good',      'value': '500-1000 mg/kg','mgkg': '500-1000'},
        'magnesium':    {'level': 'Moderate',  'value': '70-130 mg/kg','mgkg': '70-130'},
        'iron':         {'level': 'High',      'value': '1200-3000 mg/kg','mgkg': '1200-3000'},
        'zinc':         {'level': 'Moderate',  'value': '1.2-3.5 mg/kg','mgkg': '1.2-3.5'},
        'hydrogen_ph':  {'level': 'Slightly Acidic','value': '5.5-6.8','mgkg': None},
        'organic_matter':{'level': 'Moderate', 'value': '2.0-4.5%',   'mgkg': None},
        'cec':          {'description': 'Good cation exchange: productive soil with proper drainage'},
    },
}

NUTRIENT_THRESHOLDS = {
    'nitrogen':   {'very_low': 30, 'low': 60, 'adequate': 120, 'high': 200},
    'phosphorus': {'very_low': 5,  'low': 12, 'adequate': 25,  'high': 50},
    'potassium':  {'very_low': 80, 'low': 150,'adequate': 300,  'high': 500},
}


def classify_soil_from_image_bytes(image_bytes, filename=''):
    """
    Classify soil type from real image pixel colors.
    Returns (soil_type, confidence, r, g, b) or (None, 0, 0, 0, 0)
    """
    r, g, b = None, None, None

    # Try PNG first (lossless, better color accuracy)
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        r, g, b = decode_png_pixels(image_bytes)
        current_app.logger.info(f"PNG pixel decode: R={round(r) if r is not None else None} G={round(g) if g is not None else None} B={round(b) if b is not None else None}")
    elif image_bytes[:2] == b'\xff\xd8':
        r, g, b = estimate_rgb_from_jpeg(image_bytes)
        current_app.logger.info(f"JPEG estimate: R={round(r) if r is not None else None} G={round(g) if g is not None else None} B={round(b) if b is not None else None}")

    if r is None:
        return None, 0

    # Calculate color metrics
    brightness = (r + g + b) / 3
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    saturation = (max_c - min_c) / max(max_c, 1)
    redness = r / max(g, 1)
    yellowness = (r + g) / max(b * 2, 1)
    greyness = 1 - saturation

    current_app.logger.info(
        f"Color metrics: brightness={brightness:.1f}, saturation={saturation:.2f}, "
        f"redness={redness:.2f}, yellowness={yellowness:.2f}, greyness={greyness:.2f}"
    )

    # Score each soil type
    scores = {}

    # LATERITE: Red/orange, medium brightness, high redness
    scores['Laterite'] = 0
    if redness > 1.5: scores['Laterite'] += 50
    elif redness > 1.3: scores['Laterite'] += 30
    elif redness > 1.15: scores['Laterite'] += 15
    if 60 < brightness < 160: scores['Laterite'] += 25
    if saturation > 0.3: scores['Laterite'] += 15
    if r > 150 and g < 120 and b < 100: scores['Laterite'] += 20

    # SANDY: High brightness, low saturation, pale/cream
    scores['Sandy'] = 0
    if brightness > 180: scores['Sandy'] += 50
    elif brightness > 160: scores['Sandy'] += 30
    elif brightness > 140: scores['Sandy'] += 10
    if saturation < 0.15: scores['Sandy'] += 30
    elif saturation < 0.25: scores['Sandy'] += 15
    if yellowness > 1.5 and brightness > 150: scores['Sandy'] += 20

    # CLAY: Grey, medium-low brightness, very low saturation
    scores['Clay'] = 0
    if saturation < 0.08: scores['Clay'] += 50
    elif saturation < 0.15: scores['Clay'] += 25
    if greyness > 0.9: scores['Clay'] += 30
    if 80 < brightness < 150: scores['Clay'] += 20
    if abs(r - g) < 10 and abs(g - b) < 10: scores['Clay'] += 30  # very grey

    # LOAM: Dark brown, high redness, low brightness
    scores['Loam'] = 0
    if brightness < 90: scores['Loam'] += 40
    elif brightness < 110: scores['Loam'] += 25
    elif brightness < 130: scores['Loam'] += 10
    if 1.2 < redness < 1.8: scores['Loam'] += 30
    if saturation > 0.3 and brightness < 110: scores['Loam'] += 20
    if r > g > b and brightness < 100: scores['Loam'] += 20

    # SANDY LOAM: Light brown, moderate saturation
    scores['Sandy Loam'] = 0
    if 130 < brightness < 190: scores['Sandy Loam'] += 35
    if 1.05 < redness < 1.35: scores['Sandy Loam'] += 30
    if 0.1 < saturation < 0.3: scores['Sandy Loam'] += 25
    if 140 < r < 200 and 110 < g < 170 and 80 < b < 140: scores['Sandy Loam'] += 20

    # CLAY LOAM: Medium brown, moderate saturation and brightness
    scores['Clay Loam'] = 0
    if 90 < brightness < 150: scores['Clay Loam'] += 35
    if 1.1 < redness < 1.5: scores['Clay Loam'] += 30
    if 0.15 < saturation < 0.45: scores['Clay Loam'] += 25
    if r > g > b and 100 < brightness < 155: scores['Clay Loam'] += 20

    best = max(scores, key=scores.get)
    total = sum(v for v in scores.values() if v > 0)

    if total == 0:
        return None, 0

    raw_conf = (scores[best] / total) * 100
    confidence = round(min(92, max(58, raw_conf * 1.2)), 1)

    current_app.logger.info(f"Soil scores: {scores} → {best} ({confidence}%)")
    return best, confidence


def classify_soil_from_manual(color, texture, moisture, ph):
    """Classify from manual text inputs."""
    scores = {k: 0 for k in SOIL_TYPES}

    c = color.lower() if color else ''
    if any(k in c for k in ['red', 'orange', 'reddish', 'brick', 'laterite']): scores['Laterite'] += 55
    elif any(k in c for k in ['grey', 'gray', 'blue', 'dark grey']): scores['Clay'] += 55
    elif any(k in c for k in ['white', 'pale', 'cream', 'beige', 'very light']): scores['Sandy'] += 55
    elif any(k in c for k in ['dark brown', 'very dark', 'black', 'dark']): scores['Loam'] += 50; scores['Clay Loam'] += 15
    elif any(k in c for k in ['light brown', 'tan', 'sandy brown']): scores['Sandy Loam'] += 40; scores['Sandy'] += 20
    elif any(k in c for k in ['medium brown', 'brown']): scores['Clay Loam'] += 40; scores['Loam'] += 15

    t = texture.lower() if texture else ''
    if any(k in t for k in ['very sticky', 'moulds easily', 'highly plastic']): scores['Clay'] += 55
    elif any(k in t for k in ['sticky', 'plastic', 'moulds']): scores['Clay Loam'] += 45; scores['Clay'] += 15
    elif any(k in t for k in ['slightly sticky']): scores['Clay Loam'] += 30; scores['Loam'] += 20
    elif any(k in t for k in ['crumbly', 'friable', 'not sticky', 'falls apart']): scores['Loam'] += 50; scores['Sandy Loam'] += 15
    elif any(k in t for k in ['gritty', 'coarse', 'sandy', 'rough']): scores['Sandy'] += 55; scores['Sandy Loam'] += 15
    elif any(k in t for k in ['hard when dry', 'cement', 'brick', 'hardens']): scores['Laterite'] += 50; scores['Clay'] += 20

    m = moisture.lower() if moisture else ''
    if any(k in m for k in ['waterlogged', 'very wet']): scores['Clay'] += 35
    elif any(k in m for k in ['wet', 'moist']): scores['Clay Loam'] += 20; scores['Loam'] += 15
    elif any(k in m for k in ['very dry', 'dusty']): scores['Sandy'] += 35; scores['Laterite'] += 25

    if ph:
        try:
            v = float(ph)
            if v < 5.0: scores['Laterite'] += 30; scores['Sandy'] += 10
            elif v < 5.5: scores['Laterite'] += 15; scores['Clay'] += 10
            elif v <= 6.5: scores['Loam'] += 25; scores['Clay Loam'] += 15
            else: scores['Clay'] += 20; scores['Clay Loam'] += 10
        except: pass

    best = max(scores, key=scores.get)
    total = sum(v for v in scores.values() if v > 0)
    if total == 0:
        return None, 0
    confidence = round(min(93, max(60, (scores[best] / total) * 120)), 1)
    return best, confidence


def get_upload_path():
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'uploads', 'soil'))
    os.makedirs(base, exist_ok=True)
    return base


@soil_bp.route('/analyse', methods=['POST'])
@jwt_required()
@rate_limit('soil_analyse', 30, 600, per='user')
def analyse_soil():
    user_id = int(get_jwt_identity())

    input_method = request.form.get('input_method', 'manual')
    color    = request.form.get('color', '').strip()
    texture  = request.form.get('texture', '').strip()
    moisture = request.form.get('moisture', '').strip()
    ph       = request.form.get('ph', '').strip()
    district = request.form.get('district', '').strip()

    # Client-side RGB classification sent from browser canvas
    client_soil_type = request.form.get('client_soil_type', '').strip()
    client_confidence_str = request.form.get('client_confidence', '0').strip()
    try:
        client_confidence = max(0.0, min(100.0, float(client_confidence_str)))
    except Exception:
        client_confidence = 0

    image_path = None
    soil_type  = None
    confidence = 0
    image_warnings = []

    # Save image if provided
    if 'image' in request.files and request.files['image'].filename:
        from app.services.images import process_image, to_small_png, ImageRejected
        f = request.files['image']
        try:
            processed = process_image(f.read())
        except ImageRejected as e:
            return jsonify({'error': e.message, 'error_code': e.code}), 400
        image_warnings = processed.warnings
        fname = f"{uuid.uuid4()}.{processed.original_ext}"
        image_path = os.path.join(get_upload_path(), fname)
        with open(image_path, 'wb') as fout:
            fout.write(processed.original_bytes)
        # Real decoded pixels (lossless PNG) instead of estimating colour from JPEG bytes
        image_bytes = to_small_png(processed.jpeg_bytes)

        # Use client-side canvas RGB classification if available (much more accurate than server JPEG parsing)
        if client_soil_type and client_soil_type in SOIL_TYPES and client_confidence > 0:
            soil_type = client_soil_type
            confidence = client_confidence
            current_app.logger.info(f"Using client canvas RGB classification: {soil_type} {confidence}%")
        else:
            # Fallback to server-side pixel analysis
            soil_type, confidence = classify_soil_from_image_bytes(image_bytes, f.filename)
            current_app.logger.info(f"Server image classification: {soil_type} {confidence}%")

    # Manual inputs - refine or use alone
    has_manual = any([color, texture, moisture, ph])
    if has_manual:
        m_soil, m_conf = classify_soil_from_manual(color, texture, moisture, ph)
        if m_soil:
            if soil_type:
                if m_soil == soil_type:
                    confidence = round(min(95, confidence * 0.55 + m_conf * 0.45 + 6), 1)
                else:
                    if m_conf > confidence:
                        soil_type, confidence = m_soil, round(m_conf * 0.87, 1)
                    else:
                        confidence = round(confidence * 0.87, 1)
            else:
                soil_type, confidence = m_soil, m_conf

    if not soil_type:
        return jsonify({'error': 'Could not classify soil. Upload a clear soil photo or fill in the description fields.'}), 400

    soil_data = SOIL_TYPES[soil_type]

    analysis = SoilAnalysis(
        user_id=user_id, input_method=input_method, image_path=image_path,
        color=color, texture=texture, moisture=moisture,
        ph_manual=float(ph) if ph else None,
        soil_type=soil_type, confidence=confidence,
        characteristics=soil_data['characteristics'],
        suitable_crops=soil_data['suitable_crops'],
        improvement_tips=soil_data['improvement_tips'],
        district=district
    )
    db.session.add(analysis)
    db.session.commit()

    # Add nutrient profile
    nutrients = SOIL_NUTRIENTS.get(soil_type, SOIL_NUTRIENTS.get('Loam', {}))

    return jsonify({
        'id': analysis.id,
        'soil_type': soil_type,
        'confidence': confidence,
        'characteristics': soil_data['characteristics'],
        'suitable_crops': soil_data['suitable_crops'],
        'improvement_tips': soil_data['improvement_tips'],
        'water_retention': soil_data['water_retention'],
        'drainage': soil_data['drainage'],
        'nutrient_level': soil_data['nutrient_level'],
        'common_districts': soil_data['common_districts'],
        'created_at': analysis.created_at.isoformat(),
        'nutrients': nutrients,
        # Honesty metadata (additive): this is an estimate, never a laboratory result.
        'assessment_type': 'image_estimate' if image_path else 'manual_description',
        'is_laboratory_result': False,
        'nutrients_are_estimates': True,
        'data_source_note': ('Soil type is estimated from the photo colour and/or your description. '
                             'Nutrient levels shown are typical values for this soil type, not measurements. '
                             'Only a laboratory soil test gives actual N, P, K and pH values.'),
        'image_warnings': image_warnings,
    }), 200
