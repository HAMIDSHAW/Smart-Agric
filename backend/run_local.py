import os
import sys
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '.env'))

def check_env():
    print("🔑 Checking environment variables...")
    hf = os.environ.get('HUGGINGFACE_API_TOKEN', '')
    groq = os.environ.get('GROQ_API_KEY', '')
    ow = os.environ.get('OPENWEATHER_API_KEY', '')
    db = os.environ.get('DATABASE_URL', '')
    print(f"   HuggingFace: {'✅ loaded (' + hf[:10] + '...)' if hf else '❌ MISSING - add to .env'}")
    print(f"   Groq:        {'✅ loaded (' + groq[:10] + '...)' if groq else '❌ MISSING - add to .env'}")
    print(f"   OpenWeather: {'✅ loaded (' + ow[:8] + '...)' if ow else '❌ MISSING - add to .env'}")
    print(f"   Database:    {'✅ loaded' if db else '❌ MISSING'}")
    print()

check_env()

os.environ.setdefault('FLASK_ENV', 'development')

from app import create_app, db

app = create_app()

with app.app_context():
    try:
        db.create_all()
        print("🌿 SmartAgri Backend Starting...")
        print("=" * 45)
        print("✅ Database tables ready!")
        from app.models import User
        admin = User.query.filter_by(role='admin').first()
        if admin:
            print(f"✅ Admin account exists ({admin.email})")
        else:
            print("ℹ️  No admin found — will be created on first request")
    except Exception as e:
        print(f"❌ Database error: {e}")
        print("   Make sure PostgreSQL is running and database_setup.sql was run in pgAdmin")
        sys.exit(1)

print()
print("🚀 Running on http://localhost:5000")
print("   Health: http://localhost:5000/api/health")
print("   Press CTRL+C to stop")
print()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=True)
