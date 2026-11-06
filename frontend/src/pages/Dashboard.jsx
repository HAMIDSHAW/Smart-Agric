import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { historyAPI, communityAPI, impactAPI } from '../services/api'
import { format } from 'date-fns'
import { EarthOrb } from '../components/Scene3D'
import AgriWeatherWidget from '../components/AgriWeatherWidget'

const MODULE_CARDS = [
  { to: '/dashboard/disease',    icon: '🔬', label: 'Disease Detection',     desc: 'Upload a leaf photo for instant AI diagnosis',                       color: 'from-leaf/10 to-leaf/5 border-leaf/20' },
  { to: '/dashboard/recommend',  icon: '🌾', label: 'Crop Recommendation',   desc: 'Find the best crops for your soil and climate',                      color: 'from-gold/10 to-gold/5 border-gold/20' },
  { to: '/dashboard/fertilizer', icon: '🧪', label: 'Fertilizer Guide',      desc: 'Get a precise fertilizer plan for your crop and soil',               color: 'from-soil/10 to-soil/5 border-soil/20' },
  { to: '/dashboard/land',       icon: '🗺️', label: 'Land Suitability',     desc: 'Score your land and predict yield for any crop variety',             color: 'from-sky/10 to-sky/5 border-sky/20' },
  { to: '/dashboard/pest',       icon: '⚠️', label: 'Pest and Disease Alerts',desc: 'Live weather-based outbreak risk with WhatsApp alerts',             color: 'from-red-500/10 to-red-500/5 border-red-500/20' },
  { to: '/dashboard/soil',       icon: '🟤', label: 'Soil Analysis',         desc: 'Identify your soil type from a photo or description',                color: 'from-soil-light/10 to-soil-light/5 border-soil-light/20' },
  { to: '/dashboard/chatbot',    icon: '💬', label: 'AI Assistant',          desc: 'Ask any farming question in English or Krio',                        color: 'from-purple-500/10 to-purple-500/5 border-purple-500/20' },
  { to: '/dashboard/map',        icon: '📍', label: 'Community Map',         desc: 'Live disease map built from real farmer submissions across Sierra Leone', color: 'from-leaf/10 to-sky/5 border-leaf/30' },
  { to: '/dashboard/impact',     icon: '📊', label: 'Impact Dashboard',      desc: 'Live statistics from your database showing SmartAgri\'s real reach', color: 'from-gold/10 to-gold/5 border-gold/30' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [summary, setSummary]     = useState(null)
  const [mapData, setMapData]     = useState(null)
  const [impact, setImpact]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [tickerIdx, setTickerIdx] = useState(0)

  useEffect(() => {
    Promise.allSettled([
      historyAPI.getDashboardSummary(),
      communityAPI.getMapReports(),
      impactAPI.getStats(),
    ]).then(([summaryRes, mapRes, impactRes]) => {
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data)
      if (mapRes.status === 'fulfilled')     setMapData(mapRes.value.data)
      if (impactRes.status === 'fulfilled')  setImpact(impactRes.value.data)
    }).finally(() => setLoading(false))
  }, [])

  // Build ticker from real data only
  const tickerItems = impact ? [
    impact.totals.farmers > 0
      ? `${impact.totals.farmers} farmers registered on SmartAgri`
      : 'Welcome to SmartAgri: AI Farming for Sierra Leone',
    impact.totals.disease_scans > 0
      ? `${impact.totals.disease_scans} disease scans run across Sierra Leone`
      : 'Run your first disease scan to get started',
    impact.today.scans > 0
      ? `${impact.today.scans} scans run today`
      : 'Upload a leaf photo to detect disease in seconds',
    impact.today.diseases > 0
      ? `${impact.today.diseases} diseases detected this week`
      : 'Upload a leaf photo to detect disease in seconds',
    ...(impact.recent_diseases || []).slice(0, 2).map(d => `Recent detection: ${d}`),
  ].filter(Boolean) : ['Loading live data...']

  useEffect(() => {
    const interval = setInterval(() => setTickerIdx(i => (i + 1) % tickerItems.length), 4000)
    return () => clearInterval(interval)
  }, [tickerItems.length])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const stats = summary?.stats || {}
  // Top diseased districts from real community map data
  const diseasedDistricts = (mapData?.reports || [])
    .filter(r => r.diseased_reports > 0)
    .slice(0, 5)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Live ticker: real data */}
      <div className="rounded-xl p-2.5 bg-bark text-white overflow-hidden flex items-center gap-3">
        <span className="text-xs font-bold text-gold-light uppercase tracking-wider flex-shrink-0">LIVE</span>
        <p className="text-xs text-white/75 truncate" key={tickerIdx}>{tickerItems[tickerIdx]}</p>
      </div>

      {/* Welcome */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-agri-muted text-sm">{greeting()},</p>
          <h1 className="font-serif text-2xl text-bark font-bold">{user?.full_name}</h1>
          {user?.district && <p className="text-agri-muted text-xs mt-0.5">📍 {user.district}</p>}
        </div>
        <Link to="/dashboard/impact"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-all">
          📊 Live Impact Stats
        </Link>
      </div>

      {/* User's own stats from DB */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Disease Analyses', value: stats.disease_analyses || 0, icon: '🔬', color: 'text-leaf' },
          { label: 'Diseases Found',   value: stats.diseases_detected || 0, icon: '⚠️', color: 'text-red-600' },
          { label: 'Crop Plans',       value: stats.recommendations || 0,   icon: '🌾', color: 'text-gold' },
          { label: 'Fertilizer Plans', value: stats.fertilizer_plans || 0,  icon: '🧪', color: 'text-soil' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <span className="text-xl">{s.icon}</span>
            <div className={`font-serif text-2xl font-bold mt-2 ${loading ? 'text-sand' : s.color}`}>
              {loading ? '...' : s.value}
            </div>
            <p className="text-agri-muted text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Community map preview + Platform totals */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Community map: real DB data */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-sand flex items-center justify-between">
            <div>
              <h2 className="font-serif text-base text-bark font-semibold">Community Disease Map</h2>
              <p className="text-agri-muted text-xs mt-0.5">
                {mapData ? `${mapData.reports.length} districts reporting` : 'Loading...'}
              </p>
            </div>
            <Link to="/dashboard/map" className="btn-ghost text-xs">Full Map →</Link>
          </div>
          <div className="p-4">
            {!mapData || mapData.reports.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-agri-muted text-sm">No reports yet. Run a disease scan and it appears here.</p>
                <Link to="/dashboard/disease" className="btn-primary mt-3 text-xs">Run First Scan</Link>
              </div>
            ) : diseasedDistricts.length > 0 ? (
              <div className="space-y-2">
                {diseasedDistricts.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <span className="text-xs font-medium text-bark w-32 flex-shrink-0">{r.district}</span>
                    <span className="text-xs text-agri-muted truncate">{r.top_disease || 'Disease detected'}</span>
                  </div>
                ))}
                <Link to="/dashboard/map" className="mt-3 w-full btn-secondary text-xs justify-center">Open Full Map</Link>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-leaf text-sm font-medium">All reporting districts are healthy</p>
                <Link to="/dashboard/map" className="mt-2 btn-ghost text-xs">View Map</Link>
              </div>
            )}
          </div>
        </div>

        {/* Platform totals: real DB */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-sand">
            <h2 className="font-serif text-base text-bark font-semibold">Platform Activity</h2>
            <p className="text-agri-muted text-xs mt-0.5">Live from database</p>
          </div>
          <div className="divide-y divide-sand/50">
            {impact ? [
              { icon: '👨‍🌾', label: 'Registered farmers',    value: impact.totals.farmers },
              { icon: '🔬', label: 'Total disease scans',     value: impact.totals.disease_scans },
              { icon: '⚠️', label: 'Diseases detected',       value: impact.totals.diseased },
              { icon: '🌾', label: 'Crop plans generated',    value: impact.totals.recommendations },
              { icon: '📍', label: 'Districts with activity', value: impact.totals.districts },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg w-7">{item.icon}</span>
                <p className="flex-1 text-bark text-sm">{item.label}</p>
                <span className="font-mono text-sm font-bold text-bark">{item.value.toLocaleString()}</span>
              </div>
            )) : (
              <div className="p-6 text-center text-agri-muted text-sm">Loading platform stats...</div>
            )}
          </div>
        </div>
      </div>

      {/* Agri Weather: best time to spray/weed/harvest */}
      <AgriWeatherWidget />

      {/* Feed Salone banner */}
      <div className="rounded-xl p-4 border border-gold/20 bg-gradient-to-r from-gold/8 to-leaf/8 overflow-hidden relative">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 hidden sm:block">
            <EarthOrb size={72} />
          </div>
          <div>
            <p className="font-semibold text-bark text-sm">Aligned with Feed Salone</p>
            <p className="text-agri-muted text-xs mt-0.5 leading-relaxed">
              SmartAgri supports President Bio's national agricultural transformation programme,
              giving Sierra Leone farmers expert agronomic guidance in English and Krio.
            </p>
          </div>
          <span className="text-2xl hidden xs:block ml-auto">🇸🇱</span>
        </div>
      </div>

      {/* All Modules */}
      <div>
        <h2 className="font-serif text-lg text-bark font-semibold mb-3">All Modules</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {MODULE_CARDS.map(m => (
            <Link key={m.to} to={m.to}
              className={`card p-3 border ${m.color} hover:shadow-agri-lg hover:-translate-y-px transition-all group text-center`}>
              <div className="text-2xl mb-1.5">{m.icon}</div>
              <p className="text-bark text-xs font-medium leading-tight group-hover:text-leaf transition-colors">{m.label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      {summary?.recent_disease?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg text-bark font-semibold">Recent Activity</h2>
            <Link to="/dashboard/history" className="text-leaf text-xs font-medium hover:text-leaf-light">View all →</Link>
          </div>
          <div className="card divide-y divide-sand">
            {summary.recent_disease.map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${item.is_healthy ? 'bg-leaf-pale' : 'bg-red-50'}`}>🔬</div>
                <div className="flex-1 min-w-0">
                  <p className="text-bark text-sm font-medium truncate">{item.disease_name}</p>
                  <p className="text-agri-muted text-xs">{item.plant_type || 'Unknown plant'} · {item.field_location || 'No location'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`badge text-xs ${item.is_healthy ? 'badge-healthy' : 'badge-diseased'}`}>{item.is_healthy ? 'Healthy' : 'Diseased'}</span>
                  <p className="text-agri-muted text-xs mt-1">{format(new Date(item.created_at), 'dd MMM')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !summary?.recent_disease?.length && (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-4">🌱</div>
          <h3 className="font-serif text-xl text-bark font-semibold mb-2">Start Your First Analysis</h3>
          <p className="text-agri-muted text-sm mb-5 max-w-sm mx-auto">
            Upload a leaf photo or enter your soil data to get your first AI-powered farming insight.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/dashboard/disease" className="btn-primary">Detect Disease</Link>
            <Link to="/dashboard/recommend" className="btn-secondary">Get Crop Advice</Link>
          </div>
        </div>
      )}
    </div>
  )
}
