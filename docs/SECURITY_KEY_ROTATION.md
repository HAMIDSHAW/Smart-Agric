# Key rotation checklist (do this now)
The supplied ZIP contained a `backend/.env` with live values. Treat all as compromised, especially if the repo is public or the file was ever pushed.
1. Groq: console.groq.com -> API Keys -> delete old, create new -> set `GROQ_API_KEY` on Render.
2. Hugging Face: settings/tokens -> revoke -> new token -> `HUGGINGFACE_API_TOKEN`.
3. OpenWeather: account -> API keys -> regenerate -> `OPENWEATHER_API_KEY`.
4. Database: change the DB user's password (Render/Supabase dashboard) -> update `DATABASE_URL`.
5. Generate new `SECRET_KEY` and `JWT_SECRET_KEY` (`python -c "import secrets;print(secrets.token_urlsafe(48))"`). This logs everyone out.
6. Old admin: `admin@smartagri.sl` used a public default password. Log in and change it (or set ADMIN_EMAIL/ADMIN_PASSWORD, create your own admin, then deactivate the old one).
7. Check GitHub history: `git log --all -- backend/.env .env`. If found, rotating is mandatory; to purge history use `git filter-repo --path backend/.env --invert-paths` then force-push. Deleting the file in a new commit does NOT remove it from history.
8. Farmer photos (`backend/uploads/`) were in the ZIP; keep them out of git (now ignored).
