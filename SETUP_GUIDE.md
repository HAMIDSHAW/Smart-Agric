# SmartAgri — Setup Guide
### Built by Mohamed Hamidu · Freetown, Sierra Leone

---

## WHY THE PREVIOUS INSTALL FAILED

You are running **Python 3.14** which was released very recently.
`psycopg2-binary` and `Pillow` do not have pre-built Windows packages for Python 3.14 yet.

**The fix:** We replaced `psycopg2` with `pg8000` — a pure Python PostgreSQL driver that works
on any Python version with zero compilation required. Pillow was never actually needed — removed.

---

## OPTION A — Run Without Docker (Recommended for now)

### Step 1 — Set Up PostgreSQL

1. Open **pgAdmin 4** (Start Menu → pgAdmin 4)
2. Connect to your server
3. Right-click **Databases** → **Query Tool**
4. Paste this and click ▶ Run:

```sql
CREATE USER smartagri_user WITH PASSWORD 'smartagri2024';
CREATE DATABASE smartagri_db OWNER smartagri_user;
GRANT ALL PRIVILEGES ON DATABASE smartagri_db TO smartagri_user;
```

### Step 2 — Install Backend

Open PowerShell in the `backend/` folder:

```powershell
cd C:\Users\chern\OneDrive\Desktop\smartagri\backend
pip install -r requirements.txt
```

This will now install successfully — pg8000 is pure Python, no compiler needed.

### Step 3 — Initialize Database

```powershell
python init_db.py
```

Expected output:
```
✅ All tables created successfully!
Tables created:
   • users
   • disease_analyses
   • crop_recommendations
   ...
```

### Step 4 — Start Backend

```powershell
python run_local.py
```

Expected output:
```
🌿 SmartAgri Backend Starting...
✅ Database tables created successfully!
🚀 Starting Flask server on http://localhost:5000
```

Test: Open http://localhost:5000/api/health — should show `{"status": "ok"}`

### Step 5 — Start Frontend

Open a **second PowerShell window**:

```powershell
cd C:\Users\chern\OneDrive\Desktop\smartagri\frontend
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## OPTION B — Run With Docker

### Before running Docker, you MUST:

1. Open **Docker Desktop** from your Start Menu and wait for it to fully start
   - You will see a whale icon in your taskbar when it is ready
   - Wait until it says "Docker Desktop is running"

2. Then run:

```powershell
cd C:\Users\chern\OneDrive\Desktop\smartagri
docker-compose up --build
```

Note: Docker uses `host.docker.internal` to reach your local PostgreSQL.
Make sure PostgreSQL is running before starting Docker.

---

## TROUBLESHOOTING

**"No module named flask"**
→ Make sure you ran `pip install -r requirements.txt` inside the `backend/` folder

**"pg8000 connection error" or "database error"**
→ Make sure PostgreSQL is running (check Windows Services or pgAdmin)
→ Make sure you ran the SQL setup in Step 1
→ Your DATABASE_URL in `.env` should use `localhost` (not `host.docker.internal`) for local run

**"Docker cannot find pipe" error**
→ Docker Desktop is not running — open it from Start Menu and wait for the whale icon

**"Model is loading" (Hugging Face)**
→ Normal — the free model sleeps. Wait 30 seconds and try again.

---

## DEMO DAY CHECKLIST

- [ ] PostgreSQL running + database created
- [ ] `pip install -r requirements.txt` succeeds ✅
- [ ] `python init_db.py` shows all tables created ✅
- [ ] `python run_local.py` — backend on http://localhost:5000/api/health ✅
- [ ] `npm install && npm run dev` — frontend on http://localhost:3000 ✅
- [ ] Can register an account and log in ✅
- [ ] Disease detection, crop recommendation, chatbot all working ✅

---

## DEMO SCRIPT (What to Show Judges)

1. **Landing page** → point to Feed Salone stats and Njala University
2. **Register** as Mohamed Hamidu, Farmer, Kenema District
3. **Disease Detection** → upload any leaf photo → show AI diagnosis
4. **Crop Recommendation** → N:42, P:18, K:33, pH:6.2, Temp:28, Humidity:78, Rainfall:2200
5. **Fertilizer Guide** → Cassava, Pre-planting → show plan with quantities
6. **AI Chatbot** → type in Krio: *"Which crop best for laterite soil for Kenema?"*
7. **Land Suitability** → Kenema, Cassava, Rainy season, 2.5ha → show score
8. **History** → show all analyses saved

---

Built by Mohamed Hamidu · Njala University · Feed Salone · Sierra Leone
