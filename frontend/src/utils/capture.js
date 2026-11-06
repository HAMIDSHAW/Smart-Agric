// Pure helpers for the shared camera / gallery component (unit-tested).

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024 // before client-side compression

export function extensionOf(name = '') {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/**
 * Returns null when the file is acceptable, otherwise { code, key } where key is
 * an i18n key under capture.errors.*  (the server re-validates the real content).
 */
export function validateImageFile(file) {
  if (!file || file.size === 0) return { code: 'empty', key: 'capture.errors.empty' }
  const type = (file.type || '').toLowerCase()
  const ext = extensionOf(file.name)
  if (type === 'image/heic' || type === 'image/heif' || ext === 'heic' || ext === 'heif') {
    return { code: 'heic', key: 'capture.errors.heic' }
  }
  const typeOk = ACCEPTED_TYPES.includes(type)
  const extOk = ACCEPTED_EXTENSIONS.includes(ext)
  // Some Android browsers give an empty type for camera files; accept on extension then.
  if (!(typeOk || (!type && extOk))) return { code: 'type', key: 'capture.errors.type' }
  if (file.size > MAX_SOURCE_BYTES) return { code: 'size', key: 'capture.errors.size' }
  return null
}

/** Map the quality result of processLeafImage() to farmer-friendly warnings. */
export function qualityToWarnings(quality) {
  const w = []
  if (!quality) return w
  if (quality.isDark) w.push({ code: 'too_dark', key: 'capture.warnings.dark' })
  if (quality.isBlurry) w.push({ code: 'blurry', key: 'capture.warnings.blurry' })
  return w
}

export function cameraErrorCode(err) {
  const name = err && err.name
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'permission'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'nocamera'
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') return 'inuse'
  return 'unknown'
}

export function cameraSupported() {
  return typeof window !== 'undefined' &&
    window.isSecureContext !== false &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

export function stopStream(stream) {
  if (!stream) return
  stream.getTracks().forEach((t) => { try { t.stop() } catch { /* already stopped */ } })
}

export function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
