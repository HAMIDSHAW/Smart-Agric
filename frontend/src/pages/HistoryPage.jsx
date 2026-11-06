import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { historyAPI } from '../services/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const TYPE_CONFIG = {
  disease: { icon: '🔬', label: 'Disease Detection', color: 'bg-leaf-pale text-leaf' },
  recommendation: { icon: '🌾', label: 'Crop Recommendation', color: 'bg-gold/10 text-gold' },
  fertilizer: { icon: '🧪', label: 'Fertilizer Plan', color: 'bg-soil/10 text-soil' },
  land: { icon: '🗺️', label: 'Land Assessment', color: 'bg-sky/10 text-sky' },
  soil: { icon: '🟤', label: 'Soil Analysis', color: 'bg-soil-light/10 text-soil-light' },
}

function HistoryItem({ item }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.disease
  const d = item.data

  const getSummary = () => {
    if (item.type === 'disease') return `${d.disease_name} · ${d.plant_type || 'Unknown plant'} · ${d.confidence}% confidence`
    if (item.type === 'recommendation') return `N:${d.nitrogen} P:${d.phosphorus} K:${d.potassium} · pH ${d.ph} · ${d.district || 'No district'}`
    if (item.type === 'fertilizer') return `${d.crop} · ${d.growth_stage}`
    if (item.type === 'land') return `${d.district} · ${d.target_crop} · ${d.suitability_level} suitability`
    if (item.type === 'soil') return `${d.soil_type} · ${d.confidence}% confidence`
    return ''
  }

  const getResult = () => {
    if (item.type === 'disease') return { label: d.is_healthy ? 'Healthy' : 'Diseased', color: d.is_healthy ? 'badge-healthy' : 'badge-diseased' }
    if (item.type === 'land') return { label: d.suitability_level, color: d.suitability_level === 'High' ? 'badge-healthy' : d.suitability_level === 'Moderate' ? 'badge-warning' : 'badge-diseased' }
    if (item.type === 'soil') return { label: d.soil_type, color: 'badge-info' }
    return null
  }

  const result = getResult()

  return (
    <div className="border-b border-sand last:border-0">
      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-sand-light/50 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${cfg.color}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-agri-muted">{cfg.label}</span>
            {result && <span className={`badge text-xs ${result.color}`}>{result.label}</span>}
          </div>
          <p className="text-sm text-bark truncate">{getSummary()}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-agri-muted">{format(new Date(item.created_at), 'dd MMM yyyy')}</p>
          <p className="text-xs text-agri-muted">{format(new Date(item.created_at), 'HH:mm')}</p>
          <span className="text-agri-muted text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 animate-slide-up">
          <div className="bg-sand-light rounded-xl p-4 text-sm space-y-2">
            {item.type === 'disease' && (
              <>
                <DetailRow label="Disease" value={d.disease_name} />
                <DetailRow label="Plant" value={d.plant_type || ', '} />
                <DetailRow label="Location" value={d.field_location || ', '} />
                <DetailRow label="Confidence" value={`${d.confidence}%`} />
                {d.treatment?.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-agri-muted uppercase tracking-wide">Treatment</span>
                    <ul className="mt-1 space-y-1">{d.treatment.map((t,i) => <li key={i} className="text-agri-muted text-xs">• {t}</li>)}</ul>
                  </div>
                )}
              </>
            )}
            {item.type === 'recommendation' && (
              <>
                <DetailRow label="Soil N/P/K" value={`${d.nitrogen} / ${d.phosphorus} / ${d.potassium} kg/ha`} />
                <DetailRow label="pH" value={d.ph} />
                <DetailRow label="Temp/Humidity" value={`${d.temperature}°C / ${d.humidity}%`} />
                <DetailRow label="Rainfall" value={`${d.rainfall}mm/year`} />
                {d.recommendations?.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-agri-muted uppercase tracking-wide">Top Crops</span>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {d.recommendations.slice(0,3).map(r => (
                        <span key={r.crop} className="badge badge-healthy">{r.crop} {r.emoji} {r.score?.toFixed(0)}%</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {item.type === 'fertilizer' && (
              <>
                <DetailRow label="Crop" value={d.crop} />
                <DetailRow label="Stage" value={d.growth_stage} />
                {d.plan?.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-agri-muted uppercase tracking-wide">Plan</span>
                    <ul className="mt-1 space-y-1">{d.plan.map((p,i) => <li key={i} className="text-agri-muted text-xs">• {p.fertilizer}, {p.qty_per_ha}</li>)}</ul>
                  </div>
                )}
              </>
            )}
            {item.type === 'land' && (
              <>
                <DetailRow label="District" value={d.district} />
                <DetailRow label="Crop" value={d.target_crop} />
                <DetailRow label="Score" value={`${d.suitability_score}/100 (${d.suitability_level})`} />
                <DetailRow label="Yield estimate" value={`${d.yield_min}–${d.yield_max} t/ha`} />
                {d.agronomist_notes && <p className="text-xs text-agri-muted mt-1">{d.agronomist_notes}</p>}
              </>
            )}
            {item.type === 'soil' && (
              <>
                <DetailRow label="Soil Type" value={d.soil_type} />
                <DetailRow label="Confidence" value={`${d.confidence}%`} />
                {d.suitable_crops?.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-agri-muted uppercase tracking-wide">Suitable Crops</span>
                    <div className="flex gap-1 flex-wrap mt-1">{d.suitable_crops.map(c => <span key={c} className="badge badge-healthy">{c}</span>)}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs text-agri-muted font-medium flex-shrink-0">{label}</span>
      <span className="text-xs text-bark text-right">{value}</span>
    </div>
  )
}

export default function HistoryPage() {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    historyAPI.getAll()
      .then(res => setData(res.data))
      .catch(() => toast.error('Could not load history'))
      .finally(() => setLoading(false))
  }, [])

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'disease', label: '🔬 Disease' },
    { key: 'recommendation', label: '🌾 Crops' },
    { key: 'fertilizer', label: '🧪 Fertilizer' },
    { key: 'land', label: '🗺️ Land' },
    { key: 'soil', label: '🟤 Soil' },
  ]

  const filtered = filter === 'all'
    ? (data?.history || [])
    : (data?.history || []).filter(i => i.type === filter)

  const stats = data?.stats || {}

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Activity Log</div>
        <h1 className="font-serif text-2xl text-bark font-bold">My History</h1>
        <p className="text-agri-muted text-sm mt-1">Every analysis, recommendation, and plan, saved for you</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {[
          { label: 'Disease Checks', value: stats.total_disease_analyses || 0 },
          { label: 'Diseases Found', value: stats.diseases_detected || 0 },
          { label: 'Crop Plans', value: stats.total_recommendations || 0 },
          { label: 'Fertilizer Plans', value: stats.total_fertilizer_plans || 0 },
          { label: 'Soil Analyses', value: stats.total_soil_analyses || 0 },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <div className="font-serif text-xl font-bold text-bark">{s.value}</div>
            <div className="text-agri-muted text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f.key ? 'bg-bark text-gold-light' : 'bg-white border border-sand text-agri-muted hover:text-bark'
            }`}>{f.label}</button>
        ))}
      </div>

      {/* List */}
      <div className="card">
        {loading && (
          <div className="space-y-0">
            {[1,2,3,4,5].map(i => <div key={i} className="h-16 shimmer border-b border-sand" />)}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-bark font-semibold">No history yet</p>
            <p className="text-agri-muted text-sm mt-1">Your analyses and plans will appear here</p>
          </div>
        )}
        {!loading && filtered.map((item, i) => <HistoryItem key={i} item={item} />)}
      </div>
    </div>
  )
}
