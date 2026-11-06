/**
 * imageQuality.js
 *
 * Two jobs, done together in one pass so we only decode the photo once:
 *
 * 1. COMPRESS the photo before upload. Phone cameras in Sierra Leone
 *    often produce 3-8MB photos; resizing to ~1024px on the long edge
 *    and re-encoding as JPEG cuts upload time and Groq's vision
 *    inference time dramatically, with no visible quality loss for
 *    disease detection purposes.
 *
 * 2. Run a quick, forgiving quality check (too blurry / too dark) so
 *    we can nudge the farmer to move closer or find better light
 *    BEFORE they wait for a full AI analysis. This never blocks
 *    submission — it's a suggestion, not a gate, because many phones
 *    here have modest cameras and a soft photo can still be diagnosed.
 *
 * IMPORTANT — memory safety:
 * Newer phones can shoot 48-108MP photos (e.g. 9000x6000px). A plain
 * `new Image()` forces the browser to decode that at FULL resolution
 * into raw memory first — often 200-400MB of RAM — before we ever get
 * a chance to shrink it, which crashes low-RAM phones with an
 * out-of-memory error. To avoid this we decode via createImageBitmap()
 * with a resize option, which downscales DURING decode instead of
 * after, so the huge intermediate bitmap is never created. We fall
 * back to the old <img> approach only on browsers that lack this API.
 */

const DECODE_CAP = 1600 // safe intermediate size; final output is downsized further below

async function decodeDownscaled(file, cap = DECODE_CAP) {
  if (typeof createImageBitmap === 'function') {
    try {
      // Giving only resizeWidth lets the browser preserve aspect ratio
      // automatically, regardless of portrait/landscape orientation.
      const bitmap = await createImageBitmap(file, {
        resizeWidth: cap,
        resizeQuality: 'medium',
      })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, isBitmap: true }
    } catch {
      // Some browsers/WebViews reject certain options or formats —
      // fall through to the <img> fallback below.
    }
  }

  // Fallback for browsers without createImageBitmap resize support
  // (older Safari, some embedded WebViews).
  const url = URL.createObjectURL(file)
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = (err) => { URL.revokeObjectURL(url); reject(err) }
    el.src = url
  })
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, isBitmap: false, url }
}

function analyzeQuality(ctx, w, h) {
  let data
  try {
    ;({ data } = ctx.getImageData(0, 0, w, h))
  } catch {
    // If pixel readback is ever blocked, just skip the quality check
    // rather than fail the whole upload.
    return { isDark: false, isBlurry: false, message: null }
  }

  const gray = new Float32Array(w * h)
  let sum = 0

  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const v = 0.299 * r + 0.587 * g + 0.114 * b
    gray[i] = v
    sum += v
  }
  const brightness = sum / (w * h)

  // Cheap Laplacian-variance blur estimate: sharp edges produce a high
  // variance, soft/blurry images produce a low one.
  let lapSum = 0
  let lapSumSq = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      lapSum += lap
      lapSumSq += lap * lap
      count++
    }
  }
  const mean = lapSum / count
  const variance = lapSumSq / count - mean * mean

  // Deliberately lenient — these only catch clearly unusable shots,
  // not just "not studio quality". Tuned loose on purpose.
  const isDark = brightness < 32
  const isBlurry = variance < 14

  let message = null
  if (isDark && isBlurry) {
    message = "This photo looks dark and blurry. Try moving closer to the leaf and taking it in better light."
  } else if (isBlurry) {
    message = "This photo looks a bit blurry. Hold the phone steady and move a little closer to the leaf."
  } else if (isDark) {
    message = "This photo looks dark. Try taking it in daylight or brighter light if you can."
  }

  return { isDark, isBlurry, message }
}

/**
 * Process a leaf photo File/Blob: returns a compressed JPEG File ready
 * for upload, a preview data URL, and a lenient quality verdict.
 *
 * Falls back gracefully — if anything in the quality-check or canvas
 * pipeline fails (unsupported browser, corrupt image, low memory,
 * etc.), the caller should catch and just use the original file
 * untouched, so a failure here never blocks the farmer from scanning.
 */
export async function processLeafImage(file, { maxDim = 1024, quality = 0.75, checkDim = 220 } = {}) {
  const decoded = await decodeDownscaled(file)
  const { source, width, height } = decoded

  try {
    // --- Quality check on a small downsampled canvas (fast, cheap) ---
    const checkScale = Math.min(1, checkDim / Math.max(width, height))
    const cw = Math.max(1, Math.round(width * checkScale))
    const ch = Math.max(1, Math.round(height * checkScale))
    const checkCanvas = document.createElement('canvas')
    checkCanvas.width = cw
    checkCanvas.height = ch
    const checkCtx = checkCanvas.getContext('2d', { willReadFrequently: true })
    checkCtx.drawImage(source, 0, 0, cw, ch)
    const qualityResult = analyzeQuality(checkCtx, cw, ch)

    // --- Resize/compress for upload (source is already <=1600px, so
    // this step is cheap regardless of the original photo's size) ---
    const outScale = Math.min(1, maxDim / Math.max(width, height))
    const ow = Math.max(1, Math.round(width * outScale))
    const oh = Math.max(1, Math.round(height * outScale))
    const outCanvas = document.createElement('canvas')
    outCanvas.width = ow
    outCanvas.height = oh
    const outCtx = outCanvas.getContext('2d')
    outCtx.drawImage(source, 0, 0, ow, oh)

    const blob = await new Promise((resolve, reject) => {
      outCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', quality)
    })

    return {
      blob: new File([blob], 'leaf.jpg', { type: 'image/jpeg' }),
      dataUrl: outCanvas.toDataURL('image/jpeg', 0.7),
      quality: qualityResult,
    }
  } finally {
    // Free memory promptly rather than waiting for garbage collection —
    // matters most on the low-RAM phones this is meant to protect.
    if (decoded.isBitmap && typeof source.close === 'function') {
      source.close()
    } else if (decoded.url) {
      URL.revokeObjectURL(decoded.url)
    }
  }
}
