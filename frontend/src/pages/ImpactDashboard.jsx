import { useState, useEffect, useRef } from 'react'
import { impactAPI } from '../services/api'

function useCountUp(target, duration = 2000, started = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!started || target === 0) return
    let startTime = null
    const animate = (ts) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(target * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [started, target, duration])
  return count
}

function StatCard({ icon, value, label, desc, color, started }) {
  const count = useCountUp(value, 2000, started)
  return (
    <div className="card p-6 text-center hover:shadow-agri-lg transition-all">
      <div className="text-4xl mb-3">{icon}</div>
      <div className={`font-serif text-4xl font-black mb-1 ${color}`}>
        {value === 0 ? '0' : count.toLocaleString()}
      </div>
      <h3 className="font-semibold text-bark text-sm mb-1">{label}</h3>
      <p className="text-agri-muted text-xs leading-relaxed">{desc}</p>
    </div>
  )
}

const CROP_EMOJIS = {
  Cassava: '🌿', Rice: '🌾', Maize: '🌽', Tomato: '🍅',
  Groundnut: '🥜', Pepper: '🌶️', Yam: '🧅', 'Sweet Potato': '🍠',
  Banana: '🍌', Plantain: '🍌', Cocoa: '🍫', 'Oil Palm': '🌴',
}

export default function ImpactDashboard() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [started, setStarted] = useState(false)
  const [tickerIdx, setTickerIdx] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    impactAPI.getStats()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Could not load impact data'))
      .finally(() => setLoading(false))
  }, [])

  // Start count-up animations when card section scrolls into view
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setStarted(true); observer.disconnect() }
    }, { threshold: 0.2 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  // Build ticker from real recent diseases
  const tickerItems = data?.recent_diseases?.length
    ? [
        `${data.totals.farmers} registered farmers using SmartAgri`,
        `${data.totals.disease_scans} total disease scans run`,
        `${data.today.scans} scans run today`,
        `${data.today.diseases} diseases detected this week`,
        ...data.recent_diseases.map(d => `Recent detection: ${d}`),
      ]
    : ['Loading live stats...']

  useEffect(() => {
    if (!tickerItems.length) return
    const interval = setInterval(() => setTickerIdx(i => (i + 1) % tickerItems.length), 3500)
    return () => clearInterval(interval)
  }, [tickerItems.length])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-agri-muted text-sm">Loading live impact data...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="card p-8 text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-bark font-semibold mb-1">Could not load impact data</p>
      <p className="text-agri-muted text-sm">{error}</p>
    </div>
  )

  const t = data.totals
  const STATS = [
    { icon: '👨‍🌾', value: t.farmers,          label: 'Registered Farmers',    desc: 'Active farmers using SmartAgri across Sierra Leone', color: 'text-leaf' },
    { icon: '🔬', value: t.disease_scans,      label: 'Disease Scans Run',     desc: 'Leaf images analysed by AI to catch disease early', color: 'text-red-600' },
    { icon: '🌾', value: t.recommendations,    label: 'Crop Plans Generated',   desc: 'Personalised recommendations based on real soil and climate data', color: 'text-gold' },
    { icon: '🌍', value: t.districts,          label: 'Districts Active',       desc: 'Sierra Leone districts with at least one SmartAgri scan', color: 'text-bark' },
    { icon: '🧪', value: t.fertilizer_plans,   label: 'Fertilizer Plans Made',  desc: 'Precision fertilizer plans generated from soil data', color: 'text-soil' },
    { icon: '⚠️', value: t.diseased,           label: 'Diseases Detected',      desc: 'Cases caught before they spread to entire fields', color: 'text-amber-600' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="section-tag">Live Impact</div>
          <h1 className="font-serif text-2xl text-bark font-bold">SmartAgri Impact Dashboard</h1>
          <p className="text-agri-muted text-sm mt-1">
            Every number here comes directly from your database. No estimates, no demos.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: 'rgba(20,83,45,0.1)', border: '1px solid rgba(20,83,45,0.3)', color: '#14532D' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-leaf animate-pulse inline-block"/>
          Live from database
        </div>
      </div>

      {/* Live ticker from real data */}
      <div className="card p-3 bg-bark text-white overflow-hidden flex items-center gap-3">
        <span className="text-xs font-bold text-gold-light uppercase tracking-wider flex-shrink-0">LIVE</span>
        <p className="text-xs text-white/80 truncate" key={tickerIdx}>
          {tickerItems[tickerIdx]}
        </p>
      </div>

      {/* Stat cards */}
      <div ref={ref} className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {STATS.map((s, i) => (
          <StatCard key={i} {...s} started={started} />
        ))}
      </div>

      {/* Feed Salone context: this is factual public information, not fake stats */}
      <div className="card p-6 bg-gradient-to-r from-leaf/8 to-gold/5 border border-gold/20">
        <div className="flex gap-4 items-start flex-wrap">
          <div className="text-4xl">🇸🇱</div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-serif text-xl font-bold text-bark mb-2">Aligned with Feed Salone</h2>
            <p className="text-agri-muted text-sm leading-relaxed">
              President Bio's Feed Salone programme is Sierra Leone's national agricultural transformation plan.
              SmartAgri is built to serve the farmers that programme is trying to reach, giving every one of
              them expert AI agronomic advice in English and Krio.
            </p>
          </div>
        </div>
      </div>

      {/* District breakdown from real DB */}
      {data.district_breakdown?.length > 0 && (
        <div>
          <h2 className="font-serif text-lg text-bark font-semibold mb-3">Impact by District</h2>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-3 gap-3 p-3 border-b border-sand bg-sand-light">
              <span className="text-xs font-bold text-agri-muted uppercase">District</span>
              <span className="text-xs font-bold text-agri-muted uppercase text-center">Farmers</span>
              <span className="text-xs font-bold text-agri-muted uppercase text-right">Scans</span>
            </div>
            {data.district_breakdown.map((d, i) => (
              <div key={i} className="grid grid-cols-3 gap-3 p-3 border-b border-sand/50 last:border-0 hover:bg-sand-light/40 transition-colors">
                <p className="text-bark text-xs font-medium">{d.district}</p>
                <p className="text-center font-mono text-xs font-bold text-leaf">{d.farmers}</p>
                <p className="text-right font-mono text-xs font-bold text-bark">{d.scans}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crop breakdown from real DB */}
      {data.crop_breakdown?.length > 0 && (
        <div>
          <h2 className="font-serif text-lg text-bark font-semibold mb-3">Most Recommended Crops</h2>
          <div className="card p-4 space-y-3">
            {data.crop_breakdown.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xl w-7">{CROP_EMOJIS[c.crop] || '🌱'}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-bark">{c.crop}</span>
                    <span className="text-xs font-mono text-agri-muted">{c.count} plans</span>
                  </div>
                  <div className="h-2 rounded-full bg-sand overflow-hidden">
                    <div className="h-full bg-leaf rounded-full transition-all duration-1000"
                      style={{ width: started ? `${c.pct}%` : '0%' }} />
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-leaf w-8 text-right">{c.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state if platform is fresh */}
      {t.disease_scans === 0 && t.farmers === 0 && (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-4">🌱</div>
          <h3 className="font-serif text-xl text-bark font-semibold mb-2">Impact grows with every scan</h3>
          <p className="text-agri-muted text-sm max-w-sm mx-auto">
            This dashboard shows real numbers from your platform. Register farmers, run disease scans,
            generate crop plans and every number here updates automatically.
          </p>
        </div>
      )}

      {/* Njala University - stats from real DB */}
      <div className="card p-5 border border-gold/20">
        <div className="flex gap-3 items-start">
          <div className="text-3xl">🎓</div>
          <div className="flex-1">
            <h3 className="font-semibold text-bark mb-1">Njala University Research Partnership</h3>
            <p className="text-agri-muted text-sm leading-relaxed mb-3">
              Every SmartAgri scan builds a Sierra Leone-specific agricultural dataset.
              Njala researchers can use this to train better local AI models, publish agronomic studies,
              and position Sierra Leone as a leader in West African precision agriculture.
            </p>
            <div className="flex gap-6 flex-wrap">
              <div>
                <div className="font-serif text-xl font-bold text-gold">{t.disease_scans}</div>
                <div className="text-xs text-agri-muted">Images in dataset</div>
              </div>
              <div>
                <div className="font-serif text-xl font-bold text-leaf">{t.districts}</div>
                <div className="text-xs text-agri-muted">Districts covered</div>
              </div>
              <div>
                <div className="font-serif text-xl font-bold text-bark">{t.farmers}</div>
                <div className="text-xs text-agri-muted">Contributing farmers</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Builders credit */}
      <div className="text-center py-4">
        <p className="text-agri-muted text-xs">
          Built by <strong className="text-bark">Mohamed Hamidu Shaw</strong> · Kenema, Sierra Leone · Njala University
        </p>
      </div>
    </div>
  )
}
