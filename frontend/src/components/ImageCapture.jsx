import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { processLeafImage } from '../utils/imageQuality'
import {
  validateImageFile, qualityToWarnings, cameraErrorCode, cameraSupported,
  stopStream, makeId,
} from '../utils/capture'

/**
 * Shared camera + gallery capture for every SmartAgri image feature.
 *
 * - "Take photo": live in-app camera (getUserMedia, rear camera preferred). Falls back to the
 *   phone's own camera app (<input capture="environment">) when getUserMedia is unavailable.
 * - "Choose from gallery": normal file picker (JPEG / PNG / WebP), multiple where allowed.
 * - Preview, retake, remove, quality warnings (never silent rejection of usable photos).
 * - The camera stream is stopped on capture, close, Escape, tab hidden and unmount.
 *
 * Controlled component: `images` is an array of
 *   { id, file, previewUrl, warnings: [{code, message}], source: 'camera' | 'gallery', name }
 * and `onChange(nextImages)` is called whenever it changes.
 */
export default function ImageCapture({
  images = [], onChange, multiple = false, maxImages = 1, purpose = 'leaf', disabled = false,
}) {
  const { t } = useTranslation()
  const limit = multiple ? maxImages : 1

  const galleryRef = useRef(null)
  const nativeCamRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const imagesRef = useRef(images)
  imagesRef.current = images

  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState('explain') // explain | starting | live | review
  const [camError, setCamError] = useState(null)
  const [facing, setFacing] = useState('environment')
  const [canSwitch, setCanSwitch] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [shot, setShot] = useState(null) // { file, url }
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // ── stream handling ─────────────────────────────────────────────
  const releaseStream = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setTorchOn(false)
    setTorchSupported(false)
  }, [])

  const startStream = useCallback(async (facingMode) => {
    releaseStream()
    setCamError(null)
    setStage('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try { await videoRef.current.play() } catch { /* autoplay quirks: controls still work */ }
      }
      const track = stream.getVideoTracks()[0]
      try { setTorchSupported(!!(track?.getCapabilities?.().torch)) } catch { setTorchSupported(false) }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1)
      } catch { setCanSwitch(false) }
      setStage('live')
    } catch (err) {
      releaseStream()
      setCamError(cameraErrorCode(err))
      setStage('explain')
    }
  }, [releaseStream])

  const closeCamera = useCallback(() => {
    releaseStream()
    setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null })
    setOpen(false)
    setStage('explain')
  }, [releaseStream])

  useEffect(() => () => { // unmount
    stopStream(streamRef.current)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onHide = () => { if (document.visibilityState === 'hidden') closeCamera() }
    const onKey = (e) => { if (e.key === 'Escape') closeCamera() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', closeCamera)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', closeCamera)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, closeCamera])

  // revoke preview URLs that are no longer used
  useEffect(() => () => { imagesRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)) }, [])

  // ── adding images ───────────────────────────────────────────────
  const addFiles = useCallback(async (fileList, source) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setErrors([])
    setBusy(true)
    const problems = []
    const added = []
    const room = multiple ? Math.max(0, limit - imagesRef.current.length) : 1
    if (multiple && files.length > room) problems.push(t('capture.errors.max', { max: limit }))

    for (const original of files.slice(0, room || 0)) {
      const bad = validateImageFile(original)
      if (bad) { problems.push(`${original.name || t('capture.photo')}: ${t(bad.key)}`); continue }
      let file = original
      let warnings = []
      try {
        const out = await processLeafImage(original) // compress + blur/dark check
        file = out.blob
        warnings = qualityToWarnings(out.quality)
      } catch {
        // Never block the farmer: send the original; the server validates it and explains problems.
        warnings = [{ code: 'unchecked', key: 'capture.warnings.unchecked' }]
      }
      added.push({
        id: makeId(), file, source, name: original.name || 'photo.jpg',
        previewUrl: URL.createObjectURL(file),
        warnings: warnings.map((w) => ({ code: w.code, message: t(w.key) })),
      })
    }

    if (added.length) {
      if (multiple) {
        onChange([...imagesRef.current, ...added])
      } else {
        imagesRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl))
        onChange([added[0]])
      }
    }
    setErrors(problems)
    setBusy(false)
  }, [limit, multiple, onChange, t])

  const removeImage = (id) => {
    const target = images.find((i) => i.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    onChange(images.filter((i) => i.id !== id))
    setErrors([])
  }

  // ── camera actions ──────────────────────────────────────────────
  const openCamera = () => {
    if (disabled) return
    if (!cameraSupported()) { // fall back to the phone's own camera app
      nativeCamRef.current?.click()
      return
    }
    setShot(null)
    setCamError(null)
    setOpen(true)
    setStage('explain')
  }

  const capture = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) { setCamError('unknown'); return }
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
      releaseStream() // camera light off while reviewing
      setShot({ file, url: URL.createObjectURL(file) })
      setStage('review')
    }, 'image/jpeg', 0.92)
  }

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url)
    setShot(null)
    startStream(facing)
  }

  const usePhoto = async () => {
    const file = shot?.file
    closeCamera()
    if (file) await addFiles([file], 'camera')
  }

  const switchCamera = () => {
    const next = facing === 'environment' ? 'user' : 'environment'
    setFacing(next)
    startStream(next)
  }

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] })
      setTorchOn((v) => !v)
    } catch { setTorchSupported(false) }
  }

  // ── render ──────────────────────────────────────────────────────
  const full = images.length >= limit && multiple
  const tips = t(`capture.tips.${purpose}`, { returnObjects: true })
  const tipList = Array.isArray(tips) ? tips : []

  return (
    <div
      className={`space-y-3 ${dragOver ? 'ring-2 ring-emerald-500 rounded-2xl' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!disabled) addFiles(e.dataTransfer.files, 'gallery') }}
    >
      {/* hidden native inputs */}
      <input ref={galleryRef} type="file" className="hidden" data-testid="gallery-input"
        accept="image/jpeg,image/png,image/webp" multiple={multiple}
        onChange={(e) => { addFiles(e.target.files, 'gallery'); e.target.value = '' }} />
      <input ref={nativeCamRef} type="file" className="hidden" data-testid="native-camera-input"
        accept="image/*" capture="environment"
        onChange={(e) => { addFiles(e.target.files, 'camera'); e.target.value = '' }} />

      {images.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed p-6 text-center" style={{ borderColor: 'var(--border, #cbd5e1)' }}>
          <p className="text-4xl mb-2" aria-hidden="true">📷</p>
          <p className="font-semibold">{t('capture.title')}</p>
          <p className="text-sm opacity-70 mt-1">{t('capture.formats')}</p>
        </div>
      )}

      {images.length > 0 && (
        <ul className={`grid gap-3 ${multiple ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`} aria-label={t('capture.selected')}>
          {images.map((img) => (
            <li key={img.id} className="rounded-xl overflow-hidden border relative bg-black/5">
              <img src={img.previewUrl} alt={t('capture.previewAlt', { name: img.name })}
                className="w-full max-h-72 object-contain bg-black/5" />
              <div className="p-2 flex gap-2">
                <button type="button" className="btn-secondary flex-1 text-sm" disabled={disabled}
                  onClick={openCamera}>{t('capture.retake')}</button>
                <button type="button" className="btn-ghost text-sm" disabled={disabled}
                  aria-label={t('capture.removeAria', { name: img.name })}
                  onClick={() => removeImage(img.id)}>🗑 {t('capture.remove')}</button>
              </div>
              {img.warnings.length > 0 && (
                <ul role="status" className="m-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 list-disc pl-5">
                  {img.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" className="btn-primary flex-1" disabled={disabled || busy || full}
          onClick={openCamera}>📷 {t('capture.takePhoto')}</button>
        <button type="button" className="btn-secondary flex-1" disabled={disabled || busy || full}
          onClick={() => galleryRef.current?.click()}>🖼 {t('capture.fromGallery')}</button>
      </div>

      {busy && <p role="status" className="text-sm opacity-70">{t('capture.processing')}</p>}
      {errors.length > 0 && (
        <ul role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800 list-disc pl-5">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {tipList.length > 0 && (
        <details className="text-sm opacity-90">
          <summary className="cursor-pointer font-medium">{t('capture.tipsTitle')}</summary>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">{tipList.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
        </details>
      )}
      <p className="text-xs opacity-60">{t('capture.privacy')}</p>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={t('capture.cameraTitle')}
          className="fixed inset-0 z-50 flex flex-col bg-black text-white">
          <div className="flex items-center justify-between p-3">
            <p className="font-semibold">{t('capture.cameraTitle')}</p>
            <button type="button" className="px-3 py-2 rounded-lg bg-white/15" onClick={closeCamera}
              aria-label={t('capture.close')}>✕</button>
          </div>

          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <video ref={videoRef} playsInline muted autoPlay
              className={`max-h-full max-w-full ${stage === 'live' ? '' : 'hidden'}`} />
            {stage === 'review' && shot && (
              <img src={shot.url} alt={t('capture.shotAlt')} className="max-h-full max-w-full" />
            )}
            {stage === 'starting' && <p role="status">{t('capture.starting')}</p>}
            {stage === 'explain' && (
              <div className="max-w-sm p-5 text-center space-y-3">
                <p className="text-5xl" aria-hidden="true">📷</p>
                <p>{t('capture.why')}</p>
                {camError && (
                  <p role="alert" className="rounded-lg bg-red-600/30 border border-red-400 p-2 text-sm">
                    {t(`capture.cameraErrors.${camError}`)}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  <button type="button" className="btn-primary" onClick={() => startStream(facing)}>
                    {camError ? t('capture.tryAgain') : t('capture.allow')}
                  </button>
                  {camError && (
                    <button type="button" className="btn-secondary"
                      onClick={() => { closeCamera(); nativeCamRef.current?.click() }}>
                      {t('capture.useCameraApp')}
                    </button>
                  )}
                  <button type="button" className="btn-ghost text-white"
                    onClick={() => { closeCamera(); galleryRef.current?.click() }}>
                    {t('capture.fromGallery')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {stage === 'live' && (
            <div className="p-4 space-y-3">
              <p className="text-center text-sm opacity-80">{t('capture.holdSteady')}</p>
              <div className="flex items-center justify-center gap-4">
                {torchSupported
                  ? <button type="button" className="px-4 py-3 rounded-full bg-white/15" aria-pressed={torchOn}
                      onClick={toggleTorch}>🔦 {torchOn ? t('capture.torchOff') : t('capture.torchOn')}</button>
                  : <span className="w-16" />}
                <button type="button" aria-label={t('capture.capture')} onClick={capture}
                  className="w-20 h-20 rounded-full bg-white border-4 border-emerald-500 active:scale-95" />
                {canSwitch
                  ? <button type="button" className="px-4 py-3 rounded-full bg-white/15" onClick={switchCamera}>
                      🔄 {t('capture.switch')}</button>
                  : <span className="w-16" />}
              </div>
            </div>
          )}
          {stage === 'review' && (
            <div className="p-4 flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={retake}>{t('capture.retake')}</button>
              <button type="button" className="btn-primary flex-1" onClick={usePhoto}>{t('capture.usePhoto')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Simple accessible upload / analysis progress bar. `percent` null = indeterminate. */
export function UploadProgress({ percent, label }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={percent ?? undefined} className="w-full">
      <div className="h-2 rounded-full bg-black/10 overflow-hidden">
        <div className={`h-full bg-emerald-600 transition-all ${percent == null ? 'animate-pulse w-full' : ''}`}
          style={percent == null ? undefined : { width: `${percent}%` }} />
      </div>
      {label && <p className="text-xs opacity-70 mt-1">{label}</p>}
    </div>
  )
}
