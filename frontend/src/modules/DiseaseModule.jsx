import { useState, useCallback, useRef } from 'react'
import ImageCapture, { UploadProgress } from '../components/ImageCapture'
import { useTranslation } from 'react-i18next'
import { diseaseAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ScanRing } from '../components/Scene3D'
import { processLeafImage } from '../utils/imageQuality'

// Detect mobile device; camera capture only works reliably on mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : ''
)

const PLANTS = ['Cassava','Maize','Tomato','Rice','Pepper','Mango','Banana','Groundnut','Sweet Potato','Okra','Eggplant','Cocoa','Palm Oil','Ginger','Yam']

function SeverityBadge({ severity }) {
  const map = {
    high:   'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low:    'bg-blue-100 text-blue-700 border-blue-200',
    none:   'bg-green-100 text-green-700 border-green-200',
  }
  const label = { high: 'High Severity', medium: 'Medium Severity', low: 'Low Severity', none: 'No Threat' }
  if (!severity || severity === 'none') return null
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${map[severity] || map.low}`}>
      {label[severity] || severity}
    </span>
  )
}

function ImageWarnings({ warnings }) {
  if (!warnings || warnings.length === 0) return null
  return (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold mb-1">📷 Tips for a better photo</p>
      <ul className="list-disc pl-5 space-y-0.5">
        {warnings.map((w) => <li key={w.code}>{w.message}</li>)}
      </ul>
    </div>
  )
}

// Shown when the photo itself could NOT be analysed. This is general crop advice,
// never presented as a diagnosis of the uploaded image.
function GuidanceCard({ result }) {
  const g = result.general_guidance || {}
  return (
    <div className="card p-5 animate-slide-up space-y-4" role="alert">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <p className="font-semibold">⚠ Your photo was not analysed</p>
        <p className="text-sm mt-1">{result.quality_message}</p>
      </div>
      <h3 className="font-serif text-lg text-bark font-bold">General guidance (not a diagnosis)</h3>
      {g.common_problems?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-bark mb-2">Common problems to look for</h4>
          <ul className="space-y-1.5 text-sm text-agri-muted">
            {g.common_problems.map((p, i) => <li key={i}><strong>{p.name}</strong>{p.signs ? `: ${p.signs}` : ''}</li>)}
          </ul>
        </div>
      )}
      {g.treatment?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-bark mb-2">General care</h4>
          <ul className="list-disc pl-5 text-sm text-agri-muted space-y-1">{g.treatment.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {g.prevention?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-bark mb-2">Prevention</h4>
          <ul className="list-disc pl-5 text-sm text-agri-muted space-y-1">{g.prevention.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      <ImageWarnings warnings={result.image_warnings} />
    </div>
  )
}

function ResultCard({ result }) {
  if (result.image_analyzed === false) return <GuidanceCard result={result} />
  return (
    <div className="card p-5 animate-slide-up space-y-4">
      <ImageWarnings warnings={result.image_warnings} />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`badge ${result.is_healthy ? 'badge-healthy' : 'badge-diseased'}`}>
              {result.is_healthy ? '✓ Healthy Plant' : '⚠ Disease Detected'}
            </span>
            <SeverityBadge severity={result.severity} />
          </div>
          <h3 className="font-serif text-xl text-bark font-bold">{result.disease_name}</h3>
          {result.pathogen && (
            <p className="text-agri-muted text-sm mt-0.5 italic">{result.pathogen}</p>
          )}
        </div>
        <div className="text-4xl ml-3 flex-shrink-0">{result.is_healthy ? '🌿' : '🍂'}</div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between text-xs text-agri-muted mb-1">
          <span>Detection Confidence</span>
          <span className="font-mono font-semibold">{result.confidence}%</span>
        </div>
        <div className="h-2 rounded-full bg-sand overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${
            result.confidence >= 85 ? 'bg-leaf' : result.confidence >= 65 ? 'bg-gold' : 'bg-amber-500'
          }`} style={{ width: `${result.confidence}%` }} />
        </div>
      </div>

      {/* Causes */}
      {result.causes?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-bark mb-2">💡 Likely Causes</h4>
          <ul className="space-y-1.5">
            {result.causes.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm text-agri-muted leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />{c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Treatment */}
      {result.treatment?.length > 0 && (
        <div className="p-4 rounded-xl bg-leaf-pale border border-leaf/20">
          <h4 className="text-sm font-semibold text-leaf mb-2">💊 Treatment</h4>
          <ul className="space-y-2">
            {result.treatment.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-bark leading-relaxed">
                <span className="text-leaf font-bold flex-shrink-0">{i + 1}.</span>{t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prevention */}
      {result.prevention?.length > 0 && (
        <div className="p-4 rounded-xl bg-gold/5 border border-gold/20">
          <h4 className="text-sm font-semibold text-gold mb-2">🛡️ Prevention</h4>
          <ul className="space-y-2">
            {result.prevention.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-bark leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-gold mt-2 flex-shrink-0" />{p}
              </li>
            ))}
          </ul>
        </div>
      )}


    </div>
  )
}

export default function DiseaseModule() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [images, setImages]               = useState([])
  const [uploadPct, setUploadPct]         = useState(null)
  const file = images[0]?.file || null
  const [plantType, setPlantType]         = useState('')
  const [fieldLocation, setFieldLocation] = useState(user?.district || '')
  const [loading, setLoading]             = useState(false)
  const [loadingMsg, setLoadingMsg]       = useState('')
  const [result, setResult]               = useState(null)
  const [history, setHistory]             = useState([])
  const [showHistory, setShowHistory]     = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  const handleDetect = async () => {
    if (!file) { toast.error('Please upload a leaf photo first'); return }

    setLoading(true)
    setResult(null)

    const messages = [
      'Sending image to AI...',
      'AI is examining the leaf...',
      'Identifying disease patterns...',
      'Preparing your report...',
    ]
    let msgIdx = 0
    setLoadingMsg(messages[0])
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length
      setLoadingMsg(messages[msgIdx])
    }, 3000)

    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('plant_type', plantType)
      fd.append('field_location', fieldLocation)

      setUploadPct(0)
      const res = await diseaseAPI.detect(fd, {
        onUploadProgress: (e) => { if (e.total) setUploadPct(Math.round((e.loaded * 100) / e.total)) },
      })
      setResult(res.data)
      if (res.data.image_analyzed === false) {
        toast('Photo could not be analysed. Showing general guidance only.', { icon: '⚠️' })
      } else {
        toast.success(res.data.is_healthy ? 'Plant looks healthy!' : 'Analysis complete. Check treatment below')
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Analysis failed. Please try again with a clearer photo.'
      toast.error(msg)
    } finally {
      clearInterval(msgInterval)
      setUploadPct(null)
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await diseaseAPI.getHistory()
      setHistory(res.data.analyses || [])
      setShowHistory(true)
    } catch {
      toast.error('Could not load history')
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="section-tag">AI Diagnosis</div>
          <h1 className="font-serif text-2xl text-bark font-bold">{t('disease.title')}</h1>
          <p className="text-agri-muted text-sm mt-1">{t('disease.subtitle')}</p>
        </div>
        <button onClick={showHistory ? () => setShowHistory(false) : loadHistory}
          className="btn-ghost text-xs" disabled={historyLoading}>
          {historyLoading ? 'Loading...' : showHistory ? '← Back to Scanner' : `📋 ${t('disease.history')}`}
        </button>
      </div>

      {showHistory ? (
        <div className="card divide-y divide-sand">
          <div className="p-4">
            <h3 className="font-semibold text-bark text-sm">Your Detection History ({history.length} scans)</h3>
          </div>
          {history.length === 0 && (
            <div className="p-10 text-center text-agri-muted text-sm">No scans yet. Upload a leaf photo to get started.</div>
          )}
          {history.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-4 hover:bg-sand-light/40 transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${
                item.is_healthy ? 'bg-leaf-pale' : 'bg-red-50'
              }`}>
                {item.is_healthy ? '✅' : '⚠️'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-bark text-sm truncate">{item.disease_name}</p>
                <p className="text-agri-muted text-xs">
                  {item.plant_type || 'Unknown plant'} · {item.field_location || 'No location'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-bark text-xs font-mono font-bold">{item.confidence}%</p>
                <p className="text-agri-muted text-xs mt-0.5">
                  {format(new Date(item.created_at), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="card p-5 space-y-4">
            {/* Camera + gallery (shared component) */}
            <div>
              <label className="label mb-2">Leaf Photo</label>
              <ImageCapture images={images} purpose="leaf" disabled={loading}
                onChange={(next) => { setImages(next); setResult(null) }} />
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('disease.plantType')} (optional)</label>
                <select className="input" value={plantType} onChange={e => setPlantType(e.target.value)}>
                  <option value="">Select plant</option>
                  {PLANTS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('disease.fieldLocation')} (optional)</label>
                <input className="input" placeholder="e.g. Bo District"
                  value={fieldLocation} onChange={e => setFieldLocation(e.target.value)} />
              </div>
            </div>

            <button onClick={handleDetect} disabled={loading || !file}
              className="btn-primary w-full justify-center py-3 text-base">
              {loading
                ? <><span className="spinner" /> {loadingMsg}</>
                : `🔬 ${t('disease.detect')}`
              }
            </button>

            {loading && (
              <div className="flex flex-col items-center gap-3 py-2">
                <ScanRing active={true} size={100} />
                <UploadProgress percent={uploadPct != null && uploadPct < 100 ? uploadPct : null}
                  label={uploadPct != null && uploadPct < 100 ? `Uploading photo ${uploadPct}%` : loadingMsg} />
                <p className="text-xs text-agri-muted opacity-60">Usually just a few seconds</p>
              </div>
            )}
          </div>

          {result && <ResultCard result={result} />}
        </>
      )}
    </div>
  )
}
