from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from app import db
from app.models import DiseaseAnalysis, User
from sqlalchemy import func
from datetime import datetime, timedelta

community_map_bp = Blueprint('community_map', __name__)

# District coordinates for Sierra Leone
DISTRICT_COORDS = {
    'Bo':                  {'lat': 7.9647,  'lng': -11.7383, 'region': 'South'},
    'Bombali':             {'lat': 9.0244,  'lng': -12.0234, 'region': 'North'},
    'Bonthe':              {'lat': 7.1667,  'lng': -12.5,    'region': 'South'},
    'Falaba':              {'lat': 9.8,     'lng': -11.3,    'region': 'North'},
    'Kailahun':            {'lat': 8.2804,  'lng': -10.5719, 'region': 'East'},
    'Kambia':              {'lat': 9.1239,  'lng': -12.9178, 'region': 'North'},
    'Karene':              {'lat': 9.3,     'lng': -12.5,    'region': 'North'},
    'Kenema':              {'lat': 7.8767,  'lng': -11.1875, 'region': 'East'},
    'Koinadugu':           {'lat': 9.5,     'lng': -11.5,    'region': 'North'},
    'Kono':                {'lat': 8.7000,  'lng': -10.9833, 'region': 'East'},
    'Moyamba':             {'lat': 8.1608,  'lng': -12.4364, 'region': 'South'},
    'Port Loko':           {'lat': 8.7669,  'lng': -12.7875, 'region': 'North'},
    'Pujehun':             {'lat': 7.3540,  'lng': -11.7183, 'region': 'South'},
    'Tonkolili':           {'lat': 8.7000,  'lng': -11.8667, 'region': 'North'},
    'Western Area Rural':  {'lat': 8.3,     'lng': -13.1,    'region': 'West'},
    'Western Area Urban':  {'lat': 8.4897,  'lng': -13.2344, 'region': 'West'},
}

def normalise_district(raw):
    """Match raw field_location or user.district to a known district name."""
    if not raw:
        return None
    raw = raw.strip()
    for d in DISTRICT_COORDS:
        if d.lower() in raw.lower() or raw.lower() in d.lower():
            return d
    return None


@community_map_bp.route('/reports', methods=['GET'])
@jwt_required()
def get_map_reports():
    """
    Return disease reports grouped by district, sourced entirely from the DB.
    Only analyses from the last 90 days are included.
    """
    cutoff = datetime.utcnow() - timedelta(days=90)

    # Join disease analyses with users to get district
    rows = (
        db.session.query(
            DiseaseAnalysis.disease_name,
            DiseaseAnalysis.plant_type,
            DiseaseAnalysis.is_healthy,
            DiseaseAnalysis.field_location,
            DiseaseAnalysis.created_at,
            User.district.label('user_district'),
        )
        .join(User, DiseaseAnalysis.user_id == User.id)
        .filter(DiseaseAnalysis.created_at >= cutoff)
        .order_by(DiseaseAnalysis.created_at.desc())
        .limit(500)
        .all()
    )

    # Group into districts
    district_map = {}

    for row in rows:
        # Resolve district: prefer field_location, fall back to user's district
        district = normalise_district(row.field_location) or normalise_district(row.user_district)
        if not district:
            continue

        if district not in district_map:
            district_map[district] = {
                'district': district,
                'coords': DISTRICT_COORDS[district],
                'total_reports': 0,
                'diseased_reports': 0,
                'healthy_reports': 0,
                'diseases': {},
                'plants': set(),
                'latest': None,
            }

        entry = district_map[district]
        entry['total_reports'] += 1

        if row.is_healthy:
            entry['healthy_reports'] += 1
        else:
            entry['diseased_reports'] += 1
            dname = row.disease_name or 'Unknown Disease'
            entry['diseases'][dname] = entry['diseases'].get(dname, 0) + 1

        if row.plant_type:
            entry['plants'].add(row.plant_type)

        ts = row.created_at.isoformat()
        if entry['latest'] is None or ts > entry['latest']:
            entry['latest'] = ts

    # Convert to JSON-serialisable list
    reports = []
    for d, e in district_map.items():
        top_disease = max(e['diseases'], key=e['diseases'].get) if e['diseases'] else None
        status = 'healthy' if e['diseased_reports'] == 0 else ('high' if e['diseased_reports'] >= 3 else 'medium')
        reports.append({
            'district':         d,
            'lat':              e['coords']['lat'],
            'lng':              e['coords']['lng'],
            'region':           e['coords']['region'],
            'total_reports':    e['total_reports'],
            'diseased_reports': e['diseased_reports'],
            'healthy_reports':  e['healthy_reports'],
            'top_disease':      top_disease,
            'plants':           sorted(e['plants']),
            'status':           status,
            'latest':           e['latest'],
        })

    # Sort by most reports first
    reports.sort(key=lambda x: x['total_reports'], reverse=True)

    # Summary stats (all-time from DB)
    total_analyses = DiseaseAnalysis.query.count()
    total_diseased  = DiseaseAnalysis.query.filter_by(is_healthy=False).count()
    total_farmers   = User.query.filter_by(is_active=True).count()
    districts_active = len(district_map)

    return jsonify({
        'reports': reports,
        'stats': {
            'total_analyses':   total_analyses,
            'total_diseased':   total_diseased,
            'total_farmers':    total_farmers,
            'districts_active': districts_active,
        }
    }), 200
