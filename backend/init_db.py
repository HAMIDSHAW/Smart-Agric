"""
Run this ONCE to create all database tables.

Usage:
    python init_db.py
"""
import os
os.environ.setdefault('FLASK_ENV', 'development')

from app import create_app, db

app = create_app()

with app.app_context():
    try:
        db.create_all()
        print("✅ All tables created successfully!")
        print("\nTables created:")
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        for table in inspector.get_table_names():
            print(f"   • {table}")
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\n💡 Check your DATABASE_URL in .env")
        print("   For local run use: postgresql://smartagri_user:smartagri2024@localhost:5432/smartagri_db")
        print("   For Docker use:    postgresql://smartagri_user:smartagri2024@host.docker.internal:5432/smartagri_db")
