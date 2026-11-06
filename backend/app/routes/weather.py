import os
import datetime
import requests
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required

weather_bp = Blueprint('weather', __name__)

SL_LOCATIONS = {
    'Freetown':  {'lat': 8.4657,  'lon': -13.2317},
    'Bo':        {'lat': 7.9647,  'lon': -11.7383},
    'Kenema':    {'lat': 7.8762,  'lon': -11.1903},
    'Makeni':    {'lat': 8.8849,  'lon': -12.0467},
    'Koidu':     {'lat': 8.6386,  'lon': -10.9653},
    'Moyamba':   {'lat': 8.1597,  'lon': -12.4323},
    'Port Loko': {'lat': 8.7666,  'lon': -12.8710},
    'Kabala':    {'lat': 9.5855,  'lon': -11.5473},
    'Kailahun':  {'lat': 8.2781,  'lon': -10.5773},
    'Pujehun':   {'lat': 7.3527,  'lon': -11.7175},
}

CITY_MAP = {
    'Bo': 'Bo', 'Bombali': 'Makeni', 'Bonthe': 'Moyamba',
    'Falaba': 'Kabala', 'Kailahun': 'Kailahun', 'Kambia': 'Freetown',
    'Karene': 'Makeni', 'Kenema': 'Kenema', 'Koinadugu': 'Kabala',
    'Kono': 'Koidu', 'Moyamba': 'Moyamba', 'Port Loko': 'Port Loko',
    'Pujehun': 'Pujehun', 'Tonkolili': 'Makeni',
    'Western Area Rural': 'Freetown', 'Western Area Urban': 'Freetown',
}


def fetch_weather(district):
    api_key = os.environ.get('OPENWEATHER_API_KEY', '')
    city = CITY_MAP.get(district, 'Freetown')
    coords = SL_LOCATIONS.get(city, SL_LOCATIONS['Freetown'])

    if not api_key:
        return None, 'API key not configured'

    try:
        resp = requests.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params={'lat': coords['lat'], 'lon': coords['lon'], 'appid': api_key, 'units': 'metric'},
            timeout=8
        )
        if resp.status_code == 200:
            wd = resp.json()
            return {
                'location': city,
                'district': district,
                'temperature': round(wd['main']['temp'], 1),
                'feels_like': round(wd['main']['feels_like'], 1),
                'humidity': wd['main']['humidity'],
                'rainfall_24h': round(wd.get('rain', {}).get('1h', 0) * 24, 1),
                'wind_speed': round(wd['wind']['speed'] * 3.6, 1),
                'description': wd['weather'][0]['description'].title(),
                'icon': wd['weather'][0]['icon'],
                'pressure': wd['main']['pressure'],
            }, None
        else:
            return None, f'Weather API error {resp.status_code}'
    except requests.exceptions.Timeout:
        return None, 'Weather API timeout'
    except Exception as e:
        return None, str(e)


@weather_bp.route('/current', methods=['GET'])
@jwt_required()
def get_weather():
    district = request.args.get('district', 'Western Area Urban')
    data, error = fetch_weather(district)
    if error:
        return jsonify({'error': error}), 503
    return jsonify(data), 200


@weather_bp.route('/forecast', methods=['GET'])
@jwt_required()
def get_forecast():
    district = request.args.get('district', 'Western Area Urban')
    api_key = os.environ.get('OPENWEATHER_API_KEY', '')
    city = CITY_MAP.get(district, 'Freetown')
    coords = SL_LOCATIONS.get(city, SL_LOCATIONS['Freetown'])

    if not api_key:
        return jsonify({'error': 'Weather API key not configured'}), 503

    try:
        resp = requests.get(
            'https://api.openweathermap.org/data/2.5/forecast',
            params={'lat': coords['lat'], 'lon': coords['lon'], 'appid': api_key, 'units': 'metric', 'cnt': 40},
            timeout=8
        )
        if resp.status_code != 200:
            return jsonify({'error': f'Forecast API error {resp.status_code}'}), 503

        raw = resp.json()
        days = {}
        for item in raw.get('list', []):
            dt = datetime.datetime.fromtimestamp(item['dt'])
            day_key = dt.strftime('%A')
            if day_key not in days:
                days[day_key] = {
                    'day': day_key,
                    'temp_max': round(item['main']['temp_max'], 1),
                    'temp_min': round(item['main']['temp_min'], 1),
                    'humidity': item['main']['humidity'],
                    'rainfall': round(item.get('rain', {}).get('3h', 0), 1),
                    'description': item['weather'][0]['description'].title()
                }
        return jsonify({'forecast': list(days.values())[:5]}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 503
