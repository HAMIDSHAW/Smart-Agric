# Farmer photo privacy and retention policy (as implemented)

**What is stored:** the photo a farmer submits for disease, soil or progress analysis, kept for later expert review. Guest QuickScan photos are analysed and NOT stored.

**Who can see it:** only the farmer who uploaded it and administrators. Photos are never served as public files. They are fetched through `GET /api/media/...`, which needs a valid login and checks ownership (other users receive 404). Responses are `Cache-Control: private, no-store`.

**What the API never reveals:** server file paths. Earlier versions returned absolute server paths in history responses; this was removed.

**Camera:** the browser camera is requested only after the farmer taps "Take photo" and agrees on an explanation screen. The stream is stopped on capture, close, Escape, hidden tab and page exit. No audio is requested.

**Deleting:** farmers can delete a stored photo (`DELETE /api/media/disease|soil/<id>`, `/progress/<track>/<index>`); the analysis record is kept, the file is removed.

**Automatic clean-up:** `flask purge-images` deletes stored photos older than `IMAGE_RETENTION_DAYS` (default 365). It is NOT scheduled automatically: add a Render Cron Job running `flask purge-images` (not configured in this repo). Until it is scheduled, photos are kept until the farmer deletes them.

**Server-side checks on every upload:** real content verified (not file extension), JPEG/PNG/WebP only, size limit (12 MB, request limit 16 MB), pixel-count limit, EXIF rotation fixed, stored extension taken from the detected format, rate limits per user/IP.

**Client-side:** photos are compressed before upload (max 1024 px, JPEG) to save mobile data. This means the stored copy is the compressed copy; if full-resolution originals are needed for expert review, raise `maxDim` in `frontend/src/utils/imageQuality.js` at the cost of data usage.
