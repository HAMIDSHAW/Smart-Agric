import { useState, useCallback, useRef } from 'react'
import ImageCapture, { UploadProgress } from '../components/ImageCapture'
import { Link } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'
import { processLeafImage } from '../utils/imageQuality'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

const PLANTS = ['Cassava','Maize','Tomato','Rice','Pepper','Cocoa','Groundnut','Sweet Potato','Yam','Banana','Okra','Other']

export default function QuickScan() {
  const [images, setImages]     = useState([])
  const [uploadPct, setUploadPct] = useState(null)
  const file = images[0]?.file || null
  const [plantType, setPlantType] = useState('')
  const [loading, setLoading]     = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Analysing leaf...')
  const [result, setResult]       = useState(null)
  const [showSignup, setShowSignup] = useState(false)

  const handleDetect = async () => {
    if (!file) { toast.error('Upload or take a photo of a leaf first'); return }
    setLoading(true)
    setResult(null)

    const msgs = ['Sending to AI...', 'Examining the leaf...', 'Identifying disease...', 'Almost done...']
    let i = 0
    setLoadingMsg(msgs[0])
    const interval = setInterval(() => { i = (i+1) % msgs.length; setLoadingMsg(msgs[i]) }, 2500)

    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('plant_type', plantType)
      fd.append('field_location', 'Quick Scan (Guest)')

      // Call public endpoint (no auth required)
      setUploadPct(0)
      const res = await axios.post(`${API_URL}/api/disease/public-detect`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 50000,
        onUploadProgress: (e) => { if (e.total) setUploadPct(Math.round((e.loaded * 100) / e.total)) },
      })
      setResult(res.data)
      // Show signup prompt after result
      setTimeout(() => setShowSignup(true), 1500)
      if (res.data.image_analyzed === false) toast('Photo could not be analysed', { icon: '⚠️' })
      else toast.success(res.data.is_healthy ? 'Plant looks healthy!' : 'Analysis complete')
    } catch (err) {
      const msg = err.response?.data?.error || 'Analysis failed. Please try again.'
      toast.error(msg)
    } finally {
      clearInterval(interval)
      setUploadPct(null)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #14532D 60%, #0F172A 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, #14532D, #2E7D32)' }}>🌿</div>
          <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#FFFFFF' }}>SmartAgri</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ color: 'rgba(254,253,249,0.6)' }}>Sign In</Link>
          <Link to="/register" className="btn-primary text-xs">Create Account</Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-6">
          <h1 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#FFFFFF', marginBottom: 4 }}>
            Detect Crop Disease Free
          </h1>
          <p style={{ color: 'rgba(254,253,249,0.5)', fontSize: 14 }}>
            Take a photo or upload a leaf. No account needed.
          </p>
        </div>

        {/* Upload / Camera zone */}
        <div className="card p-5 space-y-4" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))', borderColor: 'rgba(245,158,11,0.2)' }}>

          {/* Camera + gallery (shared component) */}
          <div style={{ color: '#FEFDF9' }}>
            <ImageCapture images={images} purpose="leaf" disabled={loading}
              onChange={(next) => { setImages(next); setResult(null); setShowSignup(false) }} />
          </div>

          {/* Plant type */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(254,253,249,0.5)' }}>
              Plant type (optional, improves accuracy)
            </label>
            <select
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FEFDF9' }}
              value={plantType}
              onChange={e => setPlantType(e.target.value)}>
              <option value="">Select plant</option>
              {PLANTS.map(p => <option key={p} style={{ background: '#0F172A' }}>{p}</option>)}
            </select>
          </div>

          {/* Detect button */}
          <button
            onClick={handleDetect}
            disabled={loading || !file}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background: loading || !file ? 'rgba(76,175,80,0.3)' : 'linear-gradient(135deg, #14532D, #4CAF50)',
              color: 'white',
              cursor: loading || !file ? 'not-allowed' : 'pointer',
            }}>
            {loading ? (
              <><span className="spinner" />{loadingMsg}</>
            ) : (
              <>🔬 Detect Disease</>
            )}
          </button>

          {loading && (
            <p className="text-center text-xs" style={{ color: 'rgba(254,253,249,0.35)' }}>
              Usually just a few seconds
            </p>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="mt-4 card p-5 animate-slide-up" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))', borderColor: result.is_healthy ? 'rgba(76,175,80,0.4)' : 'rgba(192,57,43,0.4)' }}>
            {result.image_analyzed === false || result.image_quality === 'poor' || result.confidence === 0 ? (
              <div>
                <div className="text-3xl mb-2 text-center">📷</div>
                <p className="font-semibold text-center mb-2" style={{ color: '#FEFDF9' }}>{result.image_analyzed === false ? 'Photo was not analysed' : 'Photo needs to be clearer'}</p>
                <p className="text-xs text-center" style={{ color: 'rgba(254,253,249,0.5)' }}>{result.quality_message}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full mb-2 ${
                      result.is_healthy ? 'bg-leaf/20 text-leaf' : 'bg-red-900/30 text-red-400'
                    }`}>
                      {result.is_healthy ? '✓ Healthy Plant' : '⚠ Disease Detected'}
                    </span>
                    <h3 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#FEFDF9' }}>{result.disease_name}</h3>
                    {result.pathogen && <p className="text-xs italic mt-0.5" style={{ color: 'rgba(254,253,249,0.4)' }}>{result.pathogen}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xl font-bold" style={{ color: result.is_healthy ? '#4CAF50' : '#F59E0B' }}>{result.confidence}%</p>
                    <p className="text-xs" style={{ color: 'rgba(254,253,249,0.4)' }}>confidence</p>
                  </div>
                </div>

                {result.treatment?.length > 0 && !result.is_healthy && (
                  <div className="p-3 rounded-xl mb-3" style={{ background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)' }}>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: '#4CAF50' }}>💊 Quick Treatment</p>
                    <p className="text-xs" style={{ color: 'rgba(254,253,249,0.7)' }}>{result.treatment[0]}</p>
                  </div>
                )}

                {/* Teaser for full results */}
                <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <p className="text-xs font-medium mb-0.5" style={{ color: '#FCD34D' }}>
                    🔒 Full analysis available after sign up
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(254,253,249,0.45)' }}>
                    See all causes, biological treatments, prevention tips, and spray timing
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sign up prompt */}
        {showSignup && (
          <div className="mt-4 p-5 rounded-2xl text-center animate-slide-up" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#FCD34D', marginBottom: 4 }}>Save this result and get more</p>
            <p className="text-xs mb-4" style={{ color: 'rgba(254,253,249,0.55)' }}>
              Create a free account to save your disease history, get crop plans, check pest alerts, and access all 12 SmartAgri modules.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link to="/register" className="btn-primary text-sm px-5">Create Free Account</Link>
              <Link to="/login" className="text-sm px-5 py-2 rounded-xl font-medium"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#FEFDF9', border: '1px solid rgba(255,255,255,0.1)' }}>
                Sign In
              </Link>
            </div>
          </div>
        )}

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(254,253,249,0.25)' }}>
          Built by Mohamed Hamidu Shaw · Kenema, Sierra Leone
        </p>
      </div>
    </div>
  )
}
