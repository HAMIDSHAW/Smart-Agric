import { useState, useCallback } from 'react'
import ImageCapture from '../components/ImageCapture'
import { useTranslation } from 'react-i18next'
import { soilAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const COLORS = ['Red / Reddish', 'Dark Brown', 'Brown', 'Light Brown', 'Grey / Gray', 'Black', 'Yellowish / Pale', 'Orange', 'White / Cream']
const TEXTURES = ['Very sticky (moulds easily)', 'Sticky', 'Slightly sticky', 'Not sticky', 'Gritty / Sandy feel', 'Crumbly / Friable', 'Hard when dry / brick-like']
const MOISTURE = ['Waterlogged / Standing water', 'Wet', 'Moist', 'Slightly dry', 'Dry', 'Very dry / dusty']
const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']

const SOIL_ICONS = {
  'Laterite': '🟠', 'Clay': '🟫', 'Sandy': '🟡',
  'Loam': '🟤', 'Clay Loam': '🟫', 'Sandy Loam': '🟤'
}

// Extract accurate RGB from image using canvas (browser API)
function extractImageRGB(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const SIZE = 100 // sample at 100x100
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, SIZE, SIZE)
      const imageData = ctx.getImageData(0, 0, SIZE, SIZE)
      const data = imageData.data
      let r = 0, g = 0, b = 0, count = 0
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        count++
      }
      URL.revokeObjectURL(url)
      resolve({ r: r / count, g: g / count, b: b / count })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

// Classify soil from accurate browser-extracted RGB
function classifySoilFromRGB(r, g, b) {
  const brightness = (r + g + b) / 3
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const saturation = max > 0 ? (max - min) / max : 0
  const redness = g > 0 ? r / g : 1
  const yellowness = b > 0 ? (r + g) / (b * 2) : 1

  const scores = {}

  // Laterite: reddish-orange, medium brightness
  scores['Laterite'] = 0
  if (redness > 1.4) scores['Laterite'] += 50
  else if (redness > 1.2) scores['Laterite'] += 25
  if (brightness > 80 && brightness < 170) scores['Laterite'] += 20
  if (saturation > 0.25) scores['Laterite'] += 20
  if (r > 140 && g < 110 && b < 90) scores['Laterite'] += 30

  // Sandy: very pale, low saturation
  scores['Sandy'] = 0
  if (brightness > 185) scores['Sandy'] += 60
  else if (brightness > 165) scores['Sandy'] += 35
  if (saturation < 0.12) scores['Sandy'] += 30
  if (yellowness > 1.3 && brightness > 155) scores['Sandy'] += 20

  // Clay: grey, very low saturation, medium brightness
  scores['Clay'] = 0
  if (saturation < 0.07) scores['Clay'] += 55
  else if (saturation < 0.13) scores['Clay'] += 25
  if (brightness > 90 && brightness < 155) scores['Clay'] += 20
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) scores['Clay'] += 35

  // Loam: dark brown, low brightness, noticeable redness
  scores['Loam'] = 0
  if (brightness < 85) scores['Loam'] += 45
  else if (brightness < 105) scores['Loam'] += 25
  if (redness > 1.15 && redness < 1.7) scores['Loam'] += 30
  if (r > g && g > b && brightness < 100) scores['Loam'] += 25

  // Sandy Loam: light to medium brown, moderate saturation
  scores['Sandy Loam'] = 0
  if (brightness > 130 && brightness < 190) scores['Sandy Loam'] += 30
  if (redness > 1.05 && redness < 1.35) scores['Sandy Loam'] += 30
  if (saturation > 0.1 && saturation < 0.28) scores['Sandy Loam'] += 25
  if (r > 130 && r < 200 && g > 100 && g < 165 && b > 70 && b < 130) scores['Sandy Loam'] += 15

  // Clay Loam: medium brown, moderate brightness
  scores['Clay Loam'] = 0
  if (brightness > 90 && brightness < 150) scores['Clay Loam'] += 30
  if (redness > 1.1 && redness < 1.5) scores['Clay Loam'] += 30
  if (saturation > 0.15 && saturation < 0.4) scores['Clay Loam'] += 25
  if (r > g && g > b && brightness > 100 && brightness < 155) scores['Clay Loam'] += 20

  const best = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b)
  const total = Object.values(scores).reduce((a, b) => a + Math.max(0, b), 0)
  const rawConf = total > 0 ? (scores[best] / total) * 100 : 0
  const confidence = Math.round(Math.min(91, Math.max(57, rawConf * 1.15)) * 10) / 10

  return { soilType: best, confidence, rgb: { r: Math.round(r), g: Math.round(g), b: Math.round(b) } }
}

export default function SoilModule() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Analysing...')
  const [result, setResult] = useState(null)
  const [images, setImages] = useState([])
  const file = images[0]?.file || null
  const [form, setForm] = useState({ color: '', texture: '', moisture: '', ph: '', district: user?.district || '' })
  const [showManual, setShowManual] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const hasManual = form.color || form.texture || form.moisture || form.ph
    if (!file && !hasManual) {
      toast.error('Upload a soil photo, or fill in the description fields below')
      return
    }

    setLoading(true)

    try {
      const fd = new FormData()
      fd.append('input_method', file ? (hasManual ? 'both' : 'image') : 'manual')

      // If image uploaded, extract RGB in browser first and send as hint
      if (file) {
        setLoadingMsg('Reading image colours...')
        try {
          const { r, g, b } = await extractImageRGB(file)
          const clientClassification = classifySoilFromRGB(r, g, b)
          // Send client-side classification to backend as a strong hint
          fd.append('client_soil_type', clientClassification.soilType)
          fd.append('client_confidence', clientClassification.confidence.toString())
          fd.append('client_r', Math.round(r).toString())
          fd.append('client_g', Math.round(g).toString())
          fd.append('client_b', Math.round(b).toString())
        } catch (rgbErr) {
          console.warn('RGB extraction failed, sending image only:', rgbErr)
        }
        fd.append('image', file)
      }

      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v) })

      setLoadingMsg('Getting soil profile...')
      const res = await soilAPI.analyse(fd)
      setResult(res.data)
      toast.success('Soil identified!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not analyse soil. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Soil Science</div>
        <h1 className="font-serif text-2xl text-bark font-bold">{t('soil.title')}</h1>
        <p className="text-agri-muted text-sm mt-1">Upload a soil photo for AI identification, or describe your soil manually</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <div>
          <label className="label mb-2">Soil Photo</label>
          <ImageCapture images={images} purpose="soil" disabled={loading}
            onChange={(next) => { setImages(next); setResult(null) }} />
        </div>

        <div>
          <button type="button" onClick={() => setShowManual(!showManual)}
            className="text-sm text-leaf font-medium hover:text-leaf-light flex items-center gap-1 transition-colors">
            {showManual ? '▼' : '▶'} {showManual ? 'Hide' : 'Add'} manual description (improves accuracy)
          </button>
        </div>

        {showManual && (
          <div className="space-y-3 p-4 bg-sand-light rounded-xl border border-sand">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('soil.color')}</label>
                <select className="input" value={form.color} onChange={e => set('color', e.target.value)}>
                  <option value="">Select colour</option>
                  {COLORS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('soil.texture')}</label>
                <select className="input" value={form.texture} onChange={e => set('texture', e.target.value)}>
                  <option value="">Select texture</option>
                  {TEXTURES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('soil.moisture')}</label>
                <select className="input" value={form.moisture} onChange={e => set('moisture', e.target.value)}>
                  <option value="">Select moisture level</option>
                  {MOISTURE.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">pH (if known)</label>
                <input type="number" className="input" placeholder="e.g. 6.2" min="3" max="10" step="0.1"
                  value={form.ph} onChange={e => set('ph', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">District</label>
              <select className="input max-w-xs" value={form.district} onChange={e => set('district', e.target.value)}>
                <option value="">Select district</option>
                {DISTRICTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary justify-center py-3 w-full sm:w-auto">
          {loading ? <><span className="spinner" /> {loadingMsg}</> : `🟤 ${t('soil.analyse')}`}
        </button>
      </form>

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="card p-5 text-center">
            <div className="text-5xl mb-3">{SOIL_ICONS[result.soil_type] || '🟤'}</div>
            <h2 className="font-serif text-2xl text-bark font-bold">{result.soil_type} Soil</h2>
            <p className="text-agri-muted text-sm mt-1">
              Confidence: <span className="font-mono font-semibold text-leaf">{result.confidence}%</span>
            </p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'Water Retention', value: result.water_retention },
                { label: 'Drainage', value: result.drainage },
                { label: 'Nutrient Level', value: result.nutrient_level },
              ].map(m => (
                <div key={m.label} className="bg-sand-light rounded-lg p-2">
                  <div className="text-xs font-semibold text-bark">{m.value}</div>
                  <div className="text-xs text-agri-muted">{m.label}</div>
                </div>
              ))}
            </div>
            {result.common_districts?.length > 0 && (
              <p className="text-xs text-agri-muted mt-3">Common in: {result.common_districts.join(', ')}</p>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-bark text-sm mb-3">📋 Characteristics</h3>
            <ul className="space-y-2">
              {result.characteristics.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-agri-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-soil mt-2 flex-shrink-0" />{c}
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-bark text-sm mb-3">🌱 Best Crops for This Soil</h3>
            <div className="flex flex-wrap gap-2">
              {result.suitable_crops.map(c => (
                <span key={c} className="badge badge-healthy px-3 py-1">{c}</span>
              ))}
            </div>
          </div>

          <div className="card p-5 border-l-4 border-gold">
            <h3 className="font-semibold text-bark text-sm mb-3">💡 How to Improve This Soil</h3>
            <ul className="space-y-2">
              {result.improvement_tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-agri-muted">
                  <span className="text-gold mt-0.5">→</span>{tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Nutrient Profile */}
          {result.data_source_note && (
            <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>{result.is_laboratory_result === false ? 'Estimate, not a lab result. ' : ''}</strong>{result.data_source_note}
            </div>
          )}
          {result.nutrients && (
            <div className="card p-5">
              <h3 className="font-semibold text-bark text-sm mb-1">🧪 Soil Nutrient Profile</h3>
              <p className="text-agri-muted text-xs mb-4">Typical nutrient levels for {result.soil_type} soil in Sierra Leone</p>
              {result.nutrients.cec && (
                <div className="p-3 rounded-lg bg-sand-light border border-sand mb-4">
                  <p className="text-xs text-agri-muted">{result.nutrients.cec.description}</p>
                </div>
              )}
              <div className="space-y-3">
                {[
                  { key: 'hydrogen_ph',   icon: '⚗️',  label: 'Soil pH (Hydrogen)',  unit: 'pH' },
                  { key: 'nitrogen',      icon: '🌿',  label: 'Nitrogen (N)',         unit: 'mg/kg' },
                  { key: 'phosphorus',    icon: '🔴',  label: 'Phosphorus (P)',       unit: 'mg/kg' },
                  { key: 'potassium',     icon: '🟡',  label: 'Potassium (K)',        unit: 'mg/kg' },
                  { key: 'calcium',       icon: '⚪',  label: 'Calcium (Ca)',         unit: 'mg/kg' },
                  { key: 'magnesium',     icon: '🟢',  label: 'Magnesium (Mg)',       unit: 'mg/kg' },
                  { key: 'iron',          icon: '🟤',  label: 'Iron (Fe)',            unit: 'mg/kg' },
                  { key: 'zinc',          icon: '🔵',  label: 'Zinc (Zn)',            unit: 'mg/kg' },
                  { key: 'organic_matter',icon: '🌱',  label: 'Organic Matter',       unit: '%' },
                ].map(({ key, icon, label }) => {
                  const n = result.nutrients[key]
                  if (!n) return null
                  const levelColor = {
                    'Very Low': 'text-red-600 bg-red-50',
                    'Low': 'text-amber-600 bg-amber-50',
                    'Low-Moderate': 'text-amber-500 bg-amber-50',
                    'Moderate': 'text-blue-600 bg-blue-50',
                    'Moderate-High': 'text-green-500 bg-green-50',
                    'Good': 'text-leaf bg-leaf-pale',
                    'High': 'text-leaf bg-leaf-pale',
                    'Very High': 'text-leaf bg-leaf-pale',
                    'Adequate': 'text-leaf bg-leaf-pale',
                    'Acidic': 'text-red-500 bg-red-50',
                    'Slightly Acidic': 'text-amber-500 bg-amber-50',
                    'Acidic-Neutral': 'text-amber-400 bg-amber-50',
                    'Near Neutral': 'text-leaf bg-leaf-pale',
                  }[n.level] || 'text-agri-muted bg-sand-light'
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-lg flex-shrink-0 w-7">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-bark">{label}</p>
                        <p className="text-xs text-agri-muted font-mono">{n.value}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${levelColor}`}>
                        {n.level}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
