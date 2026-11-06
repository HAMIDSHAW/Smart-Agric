import { useState, useEffect } from 'react'
import { communityAPI } from '../services/api'

const APP_URL = import.meta.env.VITE_APP_URL || 'https://smartagri-sl.netlify.app'

// Map Sierra Leone lat/lng to SVG x/y
function toSVG(lat, lng) {
  const minLat = 6.85, maxLat = 10.05
  const minLng = -13.35, maxLng = -10.25
  const W = 420, H = 380
  return {
    x: ((lng - minLng) / (maxLng - minLng)) * W,
    y: H - ((lat - minLat) / (maxLat - minLat)) * H,
  }
}

function statusColor(status) {
  if (status === 'high')    return '#C0392B'
  if (status === 'medium')  return '#E67E22'
  return '#14532D'
}

function daysAgo(isoStr) {
  if (!isoStr) return null
  const diff = Date.now() - new Date(isoStr).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

function buildWhatsAppMsg(report) {
  const emoji = report.status === 'high' ? '🚨' : report.status === 'medium' ? '⚠️' : '✅'
  const appUrl = import.meta.env.VITE_APP_URL || 'https://smartagricsl.netlify.app'
  const lines = [
    `${emoji} *SmartAgri Disease Alert: ${report.district}*`,
    ``,
    report.top_disease ? `Disease: *${report.top_disease}*` : `Status: Healthy reports`,
    report.plants?.length ? `Crops affected: ${report.plants.join(', ')}` : '',
    `Reports submitted: ${report.total_reports}`,
    ``,
    `View the live disease map and get treatment advice:`,
    `👉 ${appUrl}`,
    ``,
    `_SmartAgri: AI Farming for Sierra Leone_`,
    `_Built by Mohamed Hamidu · Kenema, Sierra Leone · Njala University_`,
  ].filter(Boolean)
  return encodeURIComponent(lines.join('\n'))
}

export default function CommunityMapPage() {
  const [reports, setReports]   = useState([])
  const [stats, setStats]       = useState({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter]     = useState('all')

  useEffect(() => {
    communityAPI.getMapReports()
      .then(res => {
        setReports(res.data.reports || [])
        setStats(res.data.stats || {})
      })
      .catch(err => setError(err.response?.data?.error || 'Could not load map data'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = reports.filter(r => {
    if (filter === 'diseased') return r.diseased_reports > 0
    if (filter === 'healthy')  return r.diseased_reports === 0
    return true
  })

  const diseased = reports.filter(r => r.diseased_reports > 0)
  const healthy  = reports.filter(r => r.diseased_reports === 0 && r.total_reports > 0)
  const selectedReport = selected ? reports.find(r => r.district === selected) : null

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="text-4xl mb-3">📍</div>
        <p className="text-agri-muted text-sm">Loading map data from your community...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="card p-8 text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-bark font-semibold mb-1">Could not load map</p>
      <p className="text-agri-muted text-sm">{error}</p>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Live Intelligence</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Community Disease Map</h1>
        <p className="text-agri-muted text-sm mt-1">
          Built from real farmer submissions. Every disease scan you run appears on this map.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Registered Farmers', value: stats.total_farmers ?? 0,    icon: '👨‍🌾', color: 'text-leaf' },
          { label: 'Scans Run',          value: stats.total_analyses ?? 0,   icon: '🔬', color: 'text-bark' },
          { label: 'Diseases Found',     value: stats.total_diseased ?? 0,   icon: '⚠️', color: 'text-red-600' },
          { label: 'Districts Active',   value: stats.districts_active ?? 0, icon: '📍', color: 'text-gold' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`font-serif text-2xl font-bold ${s.color}`}>{s.value}</div>
            <p className="text-agri-muted text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">🗺️</div>
          <h3 className="font-serif text-xl text-bark font-semibold mb-2">No reports yet</h3>
          <p className="text-agri-muted text-sm max-w-sm mx-auto">
            This map fills with real data as farmers run disease scans. Use the Disease Detection
            module to scan a leaf and your report will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-agri-muted font-medium">Filter:</span>
            {[
              { key: 'all',      label: `All (${reports.length})` },
              { key: 'diseased', label: `⚠️ Disease (${diseased.length})` },
              { key: 'healthy',  label: `✅ Healthy (${healthy.length})` },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === f.key
                    ? 'bg-bark text-gold-light'
                    : 'bg-white border border-sand text-agri-muted hover:text-bark'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Map + Sidebar */}
          <div className="grid lg:grid-cols-3 gap-4">
            {/* SVG Map */}
            <div className="lg:col-span-2 card p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-bark text-sm">Sierra Leone: Real Farmer Reports</h3>
                <div className="flex gap-3 text-xs text-agri-muted">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/>Disease</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-leaf inline-block"/>Healthy</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-sand-light to-sand rounded-xl overflow-hidden" style={{ minHeight: 340 }}>
                <svg viewBox="0 0 420 380" className="w-full h-full" style={{ minHeight: 300 }}>
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(124,74,30,0.07)" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  <rect width="420" height="380" fill="url(#grid)" />

                  {filtered.map(r => {
                    const { x, y } = toSVG(r.lat, r.lng)
                    const color = statusColor(r.status)
                    const isSelected = selected === r.district
                    const size = Math.min(10 + r.total_reports * 1.8, 22)

                    return (
                      <g key={r.district} style={{ cursor: 'pointer' }} onClick={() => setSelected(isSelected ? null : r.district)}>
                        {r.status !== 'healthy' && (
                          <circle cx={x} cy={y} r={size + 7}
                            fill={color} fillOpacity="0.2"
                            style={{ animation: 'ping 2.2s ease-in-out infinite' }} />
                        )}
                        <circle cx={x} cy={y} r={size} fill={color}
                          stroke={isSelected ? '#FCD34D' : 'white'}
                          strokeWidth={isSelected ? 3 : 1.5}
                          style={{ filter: isSelected ? 'drop-shadow(0 0 6px rgba(245,200,66,0.8))' : 'none', transition: 'all 0.2s' }}
                        />
                        <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
                          fill="white" fontSize="7" fontWeight="bold" fontFamily="monospace">
                          {r.total_reports}
                        </text>
                        <text x={x} y={y + size + 9} textAnchor="middle"
                          fill="#0F172A" fontSize="6" fontFamily="sans-serif" fontWeight="500">
                          {r.district.replace('Western Area ', 'W.A. ')}
                        </text>
                      </g>
                    )
                  })}
                </svg>
                <div className="absolute bottom-3 left-3 bg-white/85 backdrop-blur rounded-lg px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 inline-block"/>Disease detected</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"/>Some disease</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-leaf inline-block"/>Healthy only</div>
                  <p className="text-agri-muted">Circle size = report count</p>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="card overflow-hidden flex flex-col">
              <div className="p-3 border-b border-sand">
                <h3 className="font-semibold text-bark text-sm">
                  {selectedReport ? selectedReport.district : 'All Reports'}
                </h3>
                {selectedReport && (
                  <button onClick={() => setSelected(null)} className="text-xs text-leaf mt-0.5">← All districts</button>
                )}
              </div>
              <div className="overflow-y-auto flex-1" style={{ maxHeight: 380 }}>
                {(selectedReport ? [selectedReport] : filtered).map((r, i) => (
                  <div key={i}
                    className={`p-3 border-b border-sand/50 last:border-0 hover:bg-sand-light/40 transition-colors cursor-pointer ${selected === r.district ? 'bg-gold/5' : ''}`}
                    onClick={() => setSelected(r.district)}>
                    <div className="flex items-start gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                        r.status === 'healthy' ? 'bg-leaf-pale text-leaf' : 'bg-red-50 text-red-600'
                      }`}>
                        {r.status === 'healthy' ? '✅' : '⚠️'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-bark text-xs font-medium">{r.district}</p>
                        {r.top_disease && <p className="text-red-600 text-xs truncate">{r.top_disease}</p>}
                        {r.plants?.length > 0 && <p className="text-agri-muted text-xs">{r.plants.join(', ')}</p>}
                        <div className="flex gap-2 mt-1 text-xs text-agri-muted">
                          <span>{r.total_reports} report{r.total_reports !== 1 ? 's' : ''}</span>
                          {r.latest && <span>· {daysAgo(r.latest)}</span>}
                        </div>
                      </div>
                    </div>
                    <a href={`https://wa.me/?text=${buildWhatsAppMsg(r)}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold w-full justify-center"
                      style={{ background: '#25D366', color: 'white' }}>
                      📤 Share via WhatsApp
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Disease hotspots */}
          {diseased.length > 0 && (
            <div>
              <h2 className="font-serif text-lg text-bark font-semibold mb-3">Active Disease Reports</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {diseased.map((r, i) => (
                  <div key={i}
                    className={`card p-4 border-l-4 cursor-pointer hover:shadow-agri-lg transition-all ${r.status === 'high' ? 'border-red-500' : 'border-amber-400'}`}
                    onClick={() => setSelected(r.district)}>
                    <div className="flex items-start justify-between mb-2">
                      <span className={`text-xs font-bold uppercase tracking-wide ${r.status === 'high' ? 'text-red-600' : 'text-amber-600'}`}>
                        {r.status === 'high' ? '🚨 High' : '⚠️ Medium'}
                      </span>
                      {r.latest && <span className="text-xs text-agri-muted">{daysAgo(r.latest)}</span>}
                    </div>
                    <h3 className="font-semibold text-bark text-sm mb-0.5">{r.district}</h3>
                    {r.top_disease && <p className="text-agri-muted text-xs mb-0.5">{r.top_disease}</p>}
                    {r.plants?.length > 0 && <p className="text-agri-muted text-xs">{r.plants.join(', ')}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-sand overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(r.diseased_reports * 15, 100)}%` }} />
                      </div>
                      <span className="text-xs font-mono text-red-600">{r.diseased_reports} disease</span>
                    </div>
                    <a href={`https://wa.me/?text=${buildWhatsAppMsg(r)}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold w-full justify-center"
                      style={{ background: '#25D366', color: 'white' }}>
                      📤 Warn Community via WhatsApp
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
