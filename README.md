# 🌿 SmartAgri — AI-Powered Precision Agriculture for Sierra Leone

> Built by **Mohamed Hamidu** · Hackathon Edition · Freetown, Sierra Leone  
> Aligned with **Njala University** and the **Feed Salone** national programme

---

## What is SmartAgri?

SmartAgri is a full-stack AI-driven agricultural intelligence platform built for Sierra Leone's smallholder farmers. It brings expert agronomic knowledge to every farmer — in English and Krio — through seven AI-powered modules.

## The Problem It Solves

- **63%** of Sierra Leoneans depend on agriculture (World Bank, 2023)
- **77%** faced food insecurity in 2024 (WFP)
- Only **15%** of 5.4M hectares of fertile land is cultivated (FAO)
- **480,000 tonnes** of rice imported annually despite ideal growing conditions

## Seven Modules

| Module | Description | Type |
|--------|-------------|------|
| 🔬 Disease Detection | Upload any leaf photo for instant AI diagnosis | Primary Demo |
| 🌾 Crop Recommendation | Soil NPK + climate → ranked crop recommendations | Primary Demo |
| 🧪 Fertilizer Guide | Precise fertilizer plan with quantities and timing | Primary Demo |
| 🗺️ Land Suitability | Score land and predict yield for any crop variety | Integrated |
| ⚠️ Pest Alerts | Real-time environmental outbreak risk monitoring | Integrated |
| 🟤 Soil Analysis | Identify soil type from photo or description | New |
| 💬 AI Assistant | Ask anything in English or Krio (Groq AI) | AI |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask (Python) |
| ML Models | Hugging Face Inference API |
| AI Chatbot | Groq API (Llama 3) — FREE |
| Frontend | React + Tailwind CSS + Three.js |
| Database | PostgreSQL |
| Weather | OpenWeatherMap API |
| Auth | JWT (Farmer / Extension Officer / Admin roles) |
| Deploy | Netlify (frontend) + Render (backend) |

## Quick Start

```bash
# 1. Copy environment file and fill in your API keys
cp .env.example .env

# 2. Initialize database (PostgreSQL must be running)
cd backend && python -c "from app import create_app, db; app=create_app(); app.app_context().push(); db.create_all(); print('Done')"

# 3. Run with Docker
cd .. && docker-compose up --build
```

Open http://localhost:3000

## Full Setup Instructions

See **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** for:
- Creating all API accounts (Hugging Face, Groq, OpenWeatherMap)
- PostgreSQL setup
- Docker run commands
- Netlify + Render deployment
- Demo day checklist and script

## Languages Supported

- 🇬🇧 **English** — full platform
- 🇸🇱 **Krio** — full platform including AI chatbot responses

## Project Structure

```
smartagri/
├── backend/                 Flask API
│   ├── app/
│   │   ├── models/          Database models (User, DiseaseAnalysis, etc.)
│   │   ├── routes/          API endpoints (auth, disease, recommend, etc.)
│   │   └── services/        Hugging Face integration
│   ├── config.py
│   ├── run.py
│   └── requirements.txt
├── frontend/                React app
│   ├── src/
│   │   ├── pages/           Landing, Login, Register, Dashboard, etc.
│   │   ├── modules/         7 feature modules
│   │   ├── components/      Layout, Sidebar, shared UI
│   │   ├── context/         Auth state
│   │   ├── services/        API calls
│   │   └── i18n/            English + Krio translations
│   └── package.json
├── docker-compose.yml
├── .env.example
├── database_setup.sql
├── SETUP_GUIDE.md           ← READ THIS FIRST
└── README.md
```

---

Built to win. Built to serve.  
**Mohamed Hamidu · Njala University · Feed Salone · Sierra Leone**
