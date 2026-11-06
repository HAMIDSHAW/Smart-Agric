SmartAgri — Fixes Applied (Rounds 1–4)
=========================================

ROUND 1 — White screen crash (root cause)
-------------------------------------------
Two places in the 3D background code tried to overwrite a Three.js light's
read-only `position` property via Object.assign(...), which throws in the
Three.js version this project uses. With no error boundary anywhere, that
uncaught error made React unmount the entire page, the white screen.
Fixed in Landing.jsx (Globe3D) and Scene3D.jsx (HarvestOrb) using
light.position.set(x,y,z). Added ErrorBoundary.jsx as a safety net.

ROUND 2 — Navigation + footer (Landing page)
-----------------------------------------------
Fixed a CSS class referenced but never defined (mobile nav overflowed and
overlapped the logo), an unused `menuOpen` state (built a real hamburger
menu with it), nav text colors hardcoded for the wrong background, dead
footer links with no href, and a broken "pulse" animation reference.

ROUND 3 — Hero redesign + site-wide brand consistency
----------------------------------------------------------
Replaced the generic dark-gradient-and-globe hero with a signature visual
grounded in the actual product (animated leaf scan revealing a real
diagnosis), swapped generic product-count stats for the real stakes (63%
depend on farming, 77% faced food insecurity in 2024, 15% of fertile land
farmed). Found and fixed a split design system: a new primary/accent/
highlight/Poppins palette used only on Landing, versus a legacy soil/leaf/
bark/gold/serif system everywhere else (a comment in tailwind.config.js
explicitly said the legacy one was "kept for dashboard components"). Fixed
Login, Register, ForgotPassword, QuickScan, and the dashboard shell
individually. Corrected "SmartAgric" to "SmartAgri" and "Freetown" to
"Kenema" to match the rest of the codebase.

ROUND 4 — Every dashboard module + removing all em-dashes
----------------------------------------------------------------
The legacy theme turned out to run through every one of the ~25 dashboard/
module files (hundreds of individual text-bark / bg-gold / bg-sand /
font-serif references), not just the shell. Rather than hand-edit hundreds
of class names across 25+ files (a much higher-risk way to introduce typos
or miss spots), the fix was made at the token level: tailwind.config.js's
soil/bark/sand/gold colors and the font-serif family are remapped to the
new palette and Poppins, so every file using those shared classes inherits
the fix automatically. Then individually went through each file to fix the
handful of hardcoded inline hex values that bypass the token system
(AdminLayout.jsx's whole sidebar was still on the old dark-brown scheme,
plus smaller spots in App.jsx, LandModule.jsx, RecommendModule.jsx,
CommunityMapPage.jsx, FieldIntelligenceModule.jsx, Landing.jsx's Globe3D
ring colors). Verified by rendering all 16 dashboard module routes plus all
5 public pages in a real headless browser (mocked auth) with zero console
errors.

Also removed every em-dash (—) from user-facing text across the whole
frontend (17 files) and the backend routes/seed data that produce
user-visible recommendation text (soil descriptions, fertilizer tips,
field-intelligence improvement suggestions, the few-shot example in the AI
diagnosis prompt). Replaced with commas, periods, or colons depending on
what reads naturally in each sentence, not a blind find-and-replace. Left
em-dashes in backend code comments/docstrings/console logs alone since
those are never shown to a user. Number ranges using en-dash (–), like
"20–30cm" or "May–Oct", were left as-is since that's correct typography for
ranges, not the AI-sounding pattern being removed.

FILES IN THIS ZIP
--------------------
Frontend (paths relative to frontend/):
  tailwind.config.js, src/index.css, src/App.jsx
  src/pages/: Landing, Login, Register, ForgotPassword, QuickScan,
    Dashboard, ComingSoonFeatures, CommunityMapPage, ImpactDashboard,
    HistoryPage, AdminDashboard
  src/components/: Scene3D, ErrorBoundary (new), DashboardLayout,
    AdminLayout, AgriWeatherWidget
  src/modules/: FeedbackModule, ChatbotModule, CropCalendarModule,
    CropCompareModule, DiseaseDetectionModule, DiseaseModule,
    FertilizerModule, FieldIntelligenceModule, HarvestTrackerModule,
    ImpactModule, LandModule, PestModule, PostHarvestModule,
    RecommendModule, SoilModule

Backend (paths relative to backend/):
  seed_data.py
  app/routes/: soil.py, disease.py, fertilizer.py, field_intelligence.py,
    post_harvest.py

HOW TO APPLY
-------------
Copy these files into your project at the exact same paths, overwriting the
existing ones. No npm install needed on the frontend, no new pip packages
on the backend. Commit and push as usual; Netlify/Render will redeploy.

NOT TOUCHED / OUT OF SCOPE
------------------------------
AdminDashboard/AdminLayout are styled and fixed but still aren't wired into
any route in App.jsx (pre-existing, not something I added). If you want the
admin panel reachable, it needs a route added.
