import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { landAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']
const CROPS = ['Cassava','Maize','Rice','Groundnut','Sweet Potato','Mango','Cocoa','Oil Palm','Tomato']
const SEASONS = ['Rainy (May–Oct)', 'Dry (Nov–Apr)']

function ScoreRing({ score, level }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = level === 'High' ? '#14532D' : level === 'Moderate' ? '#F59E0B' : '#C0392B'

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#E5E7EB" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-2xl font-bold text-bark">{score}</span>
        <span className="text-xs text-agri-muted">/ 100</span>
      </div>
    </div>
  )
}

export default function LandModule() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    district: user?.district || 'Kenema',
    target_crop: 'Cassava',
    season: 'Rainy (May–Oct)',
    plot_size: 2.5,
    slope: 3
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await landAPI.assess(form)
      setResult(res.data)
      toast.success('Land assessment complete!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Assessment failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const levelBadge = { High: 'badge-healthy', Moderate: 'badge-warning', Low: 'badge-diseased' }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Land Intelligence</div>
        <h1 className="font-serif text-2xl text-bark font-bold">{t('land.title')}</h1>
        <p className="text-agri-muted text-sm mt-1">{t('land.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('land.district')}</label>
            <select className="input" value={form.district} onChange={e => set('district', e.target.value)}>
              {DISTRICTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('land.targetCrop')}</label>
            <select className="input" value={form.target_crop} onChange={e => set('target_crop', e.target.value)}>
              {CROPS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('land.season')}</label>
            <select className="input" value={form.season} onChange={e => set('season', e.target.value)}>
              {SEASONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('land.plotSize')}</label>
            <input type="number" className="input" min="0.1" max="100" step="0.5"
              value={form.plot_size} onChange={e => set('plot_size', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="label">{t('land.slope')} (degrees)</label>
            <input type="number" className="input" min="0" max="45" step="1"
              value={form.slope} onChange={e => set('slope', parseFloat(e.target.value))} />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary justify-center py-3 w-full sm:w-auto">
          {loading ? <><span className="spinner" /> Scoring land...</> : `Map ${t('land.score')}`}
        </button>
      </form>

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="card p-6">
            <div className="text-center mb-5">
              <ScoreRing score={result.suitability_score} level={result.suitability_level} />
              <div className="mt-3">
                <span className={`badge text-sm px-4 py-1.5 ${levelBadge[result.suitability_level] || 'badge-info'}`}>
                  {result.suitability_level} Suitability
                </span>
              </div>
              <p className="text-agri-muted text-sm mt-2">
                {result.district} · {result.target_crop} · {result.season}
              </p>
            </div>

            {/* Yield */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="text-center p-3 bg-sand-light rounded-xl">
                <div className="font-serif text-xl font-bold text-bark">{result.yield_min} to {result.yield_max}</div>
                <div className="text-xs text-agri-muted mt-1">{result.yield_unit || 'tonnes/ha'}</div>
              </div>
              <div className="text-center p-3 bg-sand-light rounded-xl">
                <div className="font-serif text-xl font-bold text-bark">{result.total_yield_min} to {result.total_yield_max}</div>
                <div className="text-xs text-agri-muted mt-1">Total on {result.plot_size}ha</div>
              </div>
            </div>

            {/* District profile */}
            {result.district_profile && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-sand-light rounded-lg p-2 text-center">
                  <div className="text-sm font-semibold text-bark">{result.district_profile.rainfall}mm</div>
                  <div className="text-xs text-agri-muted">Annual Rainfall</div>
                </div>
                <div className="bg-sand-light rounded-lg p-2 text-center">
                  <div className="text-sm font-semibold text-bark">{result.district_profile.temp}°C</div>
                  <div className="text-xs text-agri-muted">Average Temp</div>
                </div>
                <div className="bg-sand-light rounded-lg p-2 text-center">
                  <div className="text-xs font-semibold text-bark leading-tight">{result.district_profile.soil || result.district_profile.soil_type || 'Mixed'}</div>
                  <div className="text-xs text-agri-muted">Soil Type</div>
                </div>
              </div>
            )}

            {/* Reasoning */}
            {result.reasoning?.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-bark mb-2">Why this score?</h4>
                <ul className="space-y-1.5">
                  {result.reasoning.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-agri-muted">
                      <span className="text-leaf mt-0.5 flex-shrink-0">+</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.notes && (
              <div className="p-3 rounded-xl bg-gold/5 border border-gold/15">
                <p className="text-sm text-bark leading-relaxed">{result.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
