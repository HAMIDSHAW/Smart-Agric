-- Run this in PostgreSQL to create the database and user
-- Open pgAdmin or psql and run these commands ONE BY ONE

-- Step 1: Create the database user
CREATE USER smartagri_user WITH PASSWORD 'yourpassword';

-- Step 2: Create the database
CREATE DATABASE smartagri_db OWNER smartagri_user;

-- Step 3: Grant privileges
GRANT ALL PRIVILEGES ON DATABASE smartagri_db TO smartagri_user;

-- That's it. Flask will create all tables automatically when you run it.
-- The tables created will be:
--   users
--   disease_analyses
--   crop_recommendations
--   fertilizer_plans
--   land_assessments
--   soil_analyses
--   chat_messages
--   pest_alerts
