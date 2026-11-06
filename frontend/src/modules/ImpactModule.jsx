/**
 * ImpactModule.jsx
 *
 * FIXES:
 *  1. Cards now show LIVE data fetched from /api/impact/stats.
 *  2. Numbers animate up from 0 on load (CountUp effect).
 *  3. "Built by" updated to "Mohamed Hamidu Shaw".
 *  4. Coming Soon section REMOVED.
 */
import { useState, useEffect, useRef } from 'react'
import api from '../services/api'

function CountUp({ target, duration = 1200, suffix = '' }) {
  const [val, setVal]   = useState(0)
  const rafRef          = useRef(null)
  const startRef        = useRef(null)

  useEffect(() => {
    if (target === 0) return
    startRef.current = null
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts
      const progress = Math.min((ts - startRef.current) / duration, 1)
      setVal(Math.floor(progress * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return <span>{val.toLocaleString()}{suffix}</span>
}

const STAT_CONFIG = [
  { key: 'total_farmers',       label: 'Farmers Helped',         icon: '👨‍🌾', color: 'text-leaf'  },
  { key: 'total_scans',         label: 'Plant Scans Done',        icon: '🔬', color: 'text-gold'  },
  { key: 'diseases_detected',   label: 'Diseases Detected',       icon: '⚠️', color: 'text-rust'  },
  { key: 'total_predictions',   label: 'Predictions Made',        icon: '🧠', color: 'text-leaf'  },
  { key: 'districts_served',    label: 'Districts Covered',       icon: '🗺️', color: 'text-gold'  },
  { key: 'soil_analyses',       label: 'Soil Tests Analysed',     icon: '🧪', color: 'text-leaf'  },
  { key: 'fertilizer_plans',    label: 'Fertilizer Plans Made',   icon: '🌱', color: 'text-gold'  },
  { key: 'harvest_records',     label: 'Harvests Tracked',        icon: '🌾', color: 'text-rust'  },
]

export default function ImpactModule() {
  const [stats,   setStats]   = useState({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/api/impact/stats')
        setStats(res.data)
      } catch (err) {
        setError('Could not load impact data.')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="section-tag">Platform Impact</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Our Impact</h1>
        <p className="text-agri-muted text-sm mt-1">
          Real numbers from real Sierra Leonean farmers using Smart Agri-Intelligence Platform.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-agri-muted">
          <span className="spinner mr-2" /> Loading live statistics...
        </div>
      )}

      {!loading && error && (
        <div className="card p-6 text-center text-rust text-sm">{error}</div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {STAT_CONFIG.map(({ key, label, icon, color }) => (
              <div key={key} className="card p-5 text-center">
                <div className="text-3xl mb-2">{icon}</div>
                <div className={`font-serif text-3xl font-bold ${color}`}>
                  <CountUp target={stats[key] || 0} />
                </div>
                <p className="text-xs text-agri-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <h2 className="font-serif text-lg font-bold text-bark mb-1">About this Platform</h2>
            <p className="text-sm text-agri-muted leading-relaxed">
              The Smart Agri-Intelligence Platform was built by{' '}
              <strong className="text-bark">Mohamed Hamidu Shaw</strong>,
              Freetown, Sierra Leone. It combines Groq Llama 3.3 AI, Hugging Face
              computer vision, and real-time weather data to bring precision agriculture
              to every smallholder farmer, in English and Krio.
            </p>
            <p className="text-xs text-agri-muted mt-3">
              Aligned with Njala University's food security mission · All 16 Sierra Leone districts covered
            </p>
          </div>
        </>
      )}
    </div>
  )
}
