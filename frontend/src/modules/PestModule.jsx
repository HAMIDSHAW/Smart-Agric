import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { pestAPI, weatherAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']

const RISK_CONFIG = {
  high:   { badge: 'bg-red-50 text-red-700 border-red-200',   icon: '🚨', border: 'border-l-4 border-red-500',   bg: 'bg-red-50/30' },
  medium: { badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: '⚠️', border: 'border-l-4 border-amber-500', bg: 'bg-amber-50/30' },
  low:    { badge: 'bg-green-50 text-green-700 border-green-200', icon: '✅', border: 'border-l-4 border-green-400', bg: 'bg-green-50/20' },
}

function buildWhatsAppMessage(alert, district) {
  const riskEmoji = alert.risk_level === 'high' ? '🚨' : alert.risk_level === 'medium' ? '⚠️' : '✅'
  const appUrl = import.meta.env.VITE_APP_URL || 'https://smartagricsl.netlify.app'
  return encodeURIComponent(
    `${riskEmoji} *SmartAgri Pest Alert: ${district}*\n\n` +
    `*Pest/Disease:* ${alert.pest_name}\n` +
    `*Risk Level:* ${alert.risk_level.toUpperCase()}\n` +
    `*Affected Crops:* ${alert.affected_crops?.join(', ') || 'Multiple'}\n\n` +
    `*Description:* ${alert.description}\n\n` +
    `*Action Required:* ${alert.recommended_action}\n\n` +
    `Get full details and treatment advice:\n` +
    `👉 ${appUrl}\n\n` +
    `_SmartAgri: Farming Intelligence for Sierra Leone_\n` +
    `_Built by Mohamed Hamidu · Kenema, Sierra Leone · Njala University_`
  )
}

export default function PestModule() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [district, setDistrict] = useState(user?.district || 'Western Area Urban')
  const [alerts, setAlerts] = useState([])
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = async (d) => {
    setLoading(true)
    setError(null)
    try {
      const [alertRes, weatherRes] = await Promise.allSettled([
        pestAPI.getAlerts(d),
        weatherAPI.getCurrent(d)
      ])
      if (alertRes.status === 'fulfilled') {
        setAlerts(alertRes.value.data.alerts || [])
        setWeather(alertRes.value.data.weather)
      } else {
        setError(alertRes.reason?.response?.data?.error || 'Could not load pest alerts')
      }
      if (weatherRes.status === 'fulfilled') setWeather(weatherRes.value.data)
    } catch {
      setError('Could not load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(district) }, [district])

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.risk_level === filter)
  const high = alerts.filter(a => a.risk_level === 'high')
  const medium = alerts.filter(a => a.risk_level === 'medium')
  const low = alerts.filter(a => a.risk_level === 'low')

  const handleWhatsApp = (alert) => {
    const msg = buildWhatsAppMessage(alert, district)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
    toast.success('Opening WhatsApp to share this alert')
  }

  const handleShareAll = () => {
    const highAlerts = alerts.filter(a => a.risk_level === 'high')
    if (!highAlerts.length) {
      toast('No high-risk alerts to share right now', { icon: 'ℹ️' })
      return
    }
    const lines = highAlerts.map(a => `🚨 ${a.pest_name}: ${a.affected_crops?.join(', ')}`).join('\n')
    const msg = encodeURIComponent(
      `🌿 *SmartAgri Pest Alert: ${district}*\n\n` +
      `${highAlerts.length} HIGH RISK alert(s):\n${lines}\n\n` +
      `Check SmartAgri for full treatment advice. Protect your harvest!\n\n` +
      `_SmartAgri: AI Farming for Sierra Leone_`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
    toast.success('Opening WhatsApp to share all high-risk alerts')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="section-tag">Environmental Monitoring</div>
          <h1 className="font-serif text-2xl text-bark font-bold">{t('pest.title')}</h1>
          <p className="text-agri-muted text-sm mt-1">Live weather-based outbreak risk with WhatsApp alerts</p>
        </div>
        <select className="input max-w-[200px]" value={district} onChange={e => setDistrict(e.target.value)}>
          {DISTRICTS.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>

      {error && (
        <div className="card p-4 border-l-4 border-red-500 bg-red-50">
          <p className="text-red-700 text-sm font-medium">⚠ {error}</p>
          <p className="text-red-500 text-xs mt-1">Check that OPENWEATHER_API_KEY is set in backend/.env</p>
        </div>
      )}

      {/* Weather cards */}
      {weather && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '🌡️', label: 'Temperature', value: `${weather.temperature}°C` },
            { icon: '💧', label: 'Humidity', value: `${weather.humidity}%` },
            { icon: '📅', label: 'Month', value: new Date().toLocaleString('en', { month: 'long' }) },
            { icon: '📍', label: 'District', value: district.replace(' Area Urban', '').replace(' Area Rural', ' Rural') },
          ].map(w => (
            <div key={w.label} className="card p-3 text-center">
              <div className="text-xl mb-1">{w.icon}</div>
              <div className="font-semibold text-bark text-sm">{w.value}</div>
              <div className="text-agri-muted text-xs">{w.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Risk summary + WhatsApp share all */}
      {!loading && alerts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <div className="flex gap-2 flex-wrap">
            {high.length > 0 && <span className="badge bg-red-50 text-red-700 border border-red-200">🚨 {high.length} High Risk</span>}
            {medium.length > 0 && <span className="badge bg-amber-50 text-amber-700 border border-amber-200">⚠️ {medium.length} Medium</span>}
            {low.length > 0 && <span className="badge bg-green-50 text-green-700 border border-green-200">✅ {low.length} Low Risk</span>}
          </div>
          <button onClick={handleShareAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: '#25D366', color: 'white' }}>
            📤 Share All High-Risk Alerts via WhatsApp
          </button>
        </div>
      )}

      {/* Filter bar */}
      {!loading && alerts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'all', label: `All (${alerts.length})` },
            { key: 'high', label: `🚨 High (${high.length})` },
            { key: 'medium', label: `⚠️ Medium (${medium.length})` },
            { key: 'low', label: `✅ Low (${low.length})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f.key ? 'bg-bark text-gold-light' : 'bg-white border border-sand text-agri-muted hover:text-bark'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Alert cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="card p-5 h-28 shimmer" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert, i) => {
            const cfg = RISK_CONFIG[alert.risk_level]
            const isExpanded = expanded === i
            return (
              <div key={i} className={`card overflow-hidden ${cfg.border} ${cfg.bg}`}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-bark text-sm">{alert.pest_name}</h3>
                        <span className={`badge border text-xs flex-shrink-0 ${cfg.badge}`}>
                          {alert.risk_level.charAt(0).toUpperCase() + alert.risk_level.slice(1)} Risk
                        </span>
                      </div>
                      {alert.affected_crops?.length > 0 && (
                        <div className="flex gap-1 flex-wrap mb-2">
                          {alert.affected_crops.map(c => (
                            <span key={c} className="text-xs bg-white border border-sand rounded px-1.5 py-0.5 text-agri-muted">{c}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-sm text-agri-muted leading-relaxed mb-2">{alert.description}</p>
                      {alert.conditions && (
                        <p className="text-xs text-agri-muted opacity-70">📊 {alert.conditions}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => setExpanded(isExpanded ? null : i)}
                      className="btn-ghost text-xs px-3 py-1.5">
                      {isExpanded ? '▲ Hide Action' : '💊 Show Action'}
                    </button>
                    <button onClick={() => handleWhatsApp(alert)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: '#25D366', color: 'white' }}>
                      📤 Share via WhatsApp
                    </button>
                  </div>

                  {/* Expanded action */}
                  {isExpanded && (
                    <div className="mt-3 p-3 rounded-xl bg-white/80 border border-white animate-slide-up">
                      <p className="text-xs font-semibold text-bark mb-1">💊 Recommended Action:</p>
                      <p className="text-xs text-agri-muted leading-relaxed">{alert.recommended_action}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* WhatsApp info banner */}
      <div className="card p-4 bg-gradient-to-r from-green-50 to-leaf/5 border border-leaf/20">
        <div className="flex items-start gap-3">
          <div className="text-3xl">📱</div>
          <div>
            <p className="font-semibold text-bark text-sm">WhatsApp Alerts</p>
            <p className="text-agri-muted text-xs mt-0.5 leading-relaxed">
              Sierra Leone farmers rely on WhatsApp. Each alert card has a share button that opens WhatsApp 
              with a pre-written warning message ready to send to your farming group or community.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
