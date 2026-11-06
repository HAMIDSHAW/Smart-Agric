/**
 * DiseaseDetectionModule.jsx
 *
 * FIXES:
 *  1. Camera capture now works: snap, preview, upload to backend.
 *     Previously the camera blob was never sent to the Flask API.
 *  2. Both camera capture and file upload paths converge on the same
 *     _sendToBackend() function so there is no duplicated logic.
 *  3. Drag-and-drop upload area still works as before.
 */
import { useState, useRef, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

function ResultCard({ result }) {
  const healthy = result.is_healthy
  return (
    <div className={`card p-5 animate-slide-up border-l-4 ${
      healthy ? 'border-leaf' : 'border-rust'
    }`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{healthy ? '✅' : '⚠️'}</span>
        <div>
          <h3 className="font-serif text-lg font-bold text-bark">
            {result.disease_name}
          </h3>
          <p className={`text-xs font-mono ${healthy ? 'text-leaf' : 'text-rust'}`}>
            {healthy ? 'HEALTHY' : 'DISEASE DETECTED'} · {result.confidence}% confidence
          </p>
        </div>
      </div>
      {!healthy && result.severity && (
        <div className={`inline-block text-xs px-2 py-0.5 rounded-full mb-3 font-mono ${
          result.severity === 'high'   ? 'bg-rust/10 text-rust' :
          result.severity === 'medium' ? 'bg-gold/10 text-gold' :
                                         'bg-leaf/10 text-leaf'
        }`}>
          Severity: {result.severity.toUpperCase()}
        </div>
      )}
      <div className="text-sm text-bark leading-relaxed whitespace-pre-wrap">
        {result.diagnosis || result.recommendations}
      </div>
    </div>
  )
}

export default function DiseaseDetectionModule() {
  const [preview,  setPreview]  = useState(null)   // base64 data URL
  const [imageBlob, setBlob]    = useState(null)   // raw File or Blob
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const fileRef   = useRef(null)
  const videoRef  = useRef(null)
  const streamRef = useRef(null)

  // ── Shared: send image to backend ────────────────────────────
  const sendToBackend = useCallback(async (blob) => {
    setLoading(true)
    setResult(null)
    try {
      const formData = new FormData()
      // Use 'image' field name (matches Flask route)
      formData.append('image', blob, blob.name || 'capture.jpg')
      const res = await api.post('/api/disease/detect', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
      toast.success('Analysis complete')
    } catch (err) {
      const msg = err.response?.data?.error || 'Analysis failed. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── File input / drag-drop ─────────────────────────────────
  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    setBlob(file)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const onFileChange = (e) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0])
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ── Camera ─────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      setCameraOn(true)
      // Give React time to render the video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (err) {
      toast.error('Camera access denied. Please allow camera permission or use file upload.')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) { toast.error('Capture failed'); return }
      stopCamera()
      setPreview(canvas.toDataURL('image/jpeg'))
      setBlob(new File([blob], 'capture.jpg', { type: 'image/jpeg' }))
      setResult(null)
    }, 'image/jpeg', 0.92)
  }

  const handleAnalyze = () => {
    if (!imageBlob) { toast.error('Take a photo or upload an image first'); return }
    sendToBackend(imageBlob)
  }

  const reset = () => {
    setPreview(null)
    setBlob(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">AI Diagnosis</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Plant Disease Detection</h1>
        <p className="text-agri-muted text-sm mt-1">
          Take a photo or upload a leaf image. Our AI identifies diseases and gives you treatment advice.
        </p>
      </div>

      {/* Camera view */}
      {cameraOn && (
        <div className="card overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-t"
            style={{ maxHeight: 320, objectFit: 'cover', background: '#000' }}
          />
          <div className="flex gap-3 p-3">
            <button onClick={capturePhoto} className="btn-primary flex-1">
              📸 Capture Photo
            </button>
            <button onClick={stopCamera} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upload / drag-drop area (hidden when camera is on or image selected) */}
      {!cameraOn && !preview && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`card p-10 flex flex-col items-center justify-center gap-3 cursor-pointer border-2 border-dashed transition-all ${
            dragOver ? 'border-leaf bg-leaf/5' : 'border-sand'
          }`}
        >
          <div className="text-4xl">🌿</div>
          <p className="text-bark font-semibold text-center">
            Drag and drop a leaf photo here
          </p>
          <p className="text-agri-muted text-sm text-center">
            or click to browse your files
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
              className="btn-ghost text-sm"
            >
              📁 Browse Files
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); startCamera() }}
              className="btn-ghost text-sm"
            >
              📸 Use Camera
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Image preview */}
      {preview && !cameraOn && (
        <div className="card overflow-hidden">
          <img
            src={preview}
            alt="Selected leaf"
            className="w-full object-cover"
            style={{ maxHeight: 320 }}
          />
          <div className="flex gap-3 p-3">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="btn-primary flex-1"
            >
              {loading
                ? <><span className="spinner" /> Analysing...</>
                : '🔍 Analyse Plant'}
            </button>
            <button onClick={reset} className="btn-ghost" disabled={loading}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && <ResultCard result={result} />}
    </div>
  )
}
