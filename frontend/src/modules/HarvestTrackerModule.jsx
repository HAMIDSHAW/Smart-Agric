/**
 * HarvestTrackerModule.jsx
 *
 * FIXES:
 *  1. Page no longer goes blank after a few seconds. The blank was caused by
 *     an uncaught promise rejection from the API (list endpoint 404 / network
 *     error) which triggered an unhandled error boundary.  Now wrapped in
 *     try/catch with graceful empty-state rendering.
 *  2. Correct API path used: /api/calendar/harvest-tracker/list (matches logs).
 *  3. Loading spinner shown while data fetches; error message shown on failure.
 */
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'

const CROPS = [
  { name: 'Cassava',     days: 270 },
  { name: 'Rice',        days: 120 },
  { name: 'Maize',       days: 90  },
  { name: 'Tomato',      days: 75  },
  { name: 'Groundnut',   days: 110 },
  { name: 'Sweet Potato',days: 100 },
  { name: 'Cocoa',       days: 365 },
  { name: 'Yam',         days: 210 },
  { name: 'Okra',        days: 55  },
  { name: 'Pepper',      days: 80  },
]

function ProgressBar({ pct, color = 'bg-leaf' }) {
  return (
    <div className="w-full h-3 bg-sand rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

function TrackerCard({ record, onLogYield }) {
  const planted  = new Date(record.planting_date)
  const today    = new Date()
  const elapsed  = Math.floor((today - planted) / (1000 * 60 * 60 * 24))
  const expected = record.expected_days || record.days_to_harvest || 120
  const pct      = Math.min(100, Math.round((elapsed / expected) * 100))
  const done     = elapsed >= expected
  const remaining= Math.max(0, expected - elapsed)

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-serif text-lg font-bold text-bark">{record.crop}</h3>
          <p className="text-xs text-agri-muted">
            Planted: {planted.toLocaleDateString()}  ·  District: {record.district || 'N/A'}
          </p>
        </div>
        <span className={`text-xs font-mono px-2 py-1 rounded-full ${
          done ? 'bg-gold/20 text-gold' : 'bg-leaf/10 text-leaf'
        }`}>
          {done ? '🌾 Ready' : `${pct}%`}
        </span>
      </div>

      <ProgressBar pct={pct} color={done ? 'bg-gold' : 'bg-leaf'} />

      <div className="mt-3 flex items-center justify-between text-xs text-agri-muted">
        <span>{elapsed} days elapsed</span>
        <span>{done ? 'Harvest time!' : `~${remaining} days remaining`}</span>
      </div>

      {record.actual_yield ? (
        <div className="mt-3 p-2 bg-gold/10 rounded text-xs text-bark">
          ✅ Actual yield recorded: <strong>{record.actual_yield} tonnes</strong>
        </div>
      ) : done ? (
        <button
          onClick={() => onLogYield(record)}
          className="mt-3 w-full btn-primary text-sm py-2"
        >
          Log Actual Yield
        </button>
      ) : null}
    </div>
  )
}

function AddTrackerForm({ onSuccess }) {
  const [form, setForm] = useState({ crop: '', planting_date: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedCrop = CROPS.find(c => c.name === form.crop)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.crop || !form.planting_date) {
      toast.error('Select a crop and planting date')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/calendar/harvest-tracker/add', {
        ...form,
        expected_days: selectedCrop?.days,
      })
      toast.success('Harvest tracker added!')
      setForm({ crop: '', planting_date: '', notes: '' })
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add tracker')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-5 mb-5">
      <h3 className="font-serif text-lg font-bold text-bark mb-4">Track a New Crop</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Crop *</label>
            <select className="input" value={form.crop} onChange={e => set('crop', e.target.value)}>
              <option value="">Select crop</option>
              {CROPS.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} (~{c.days} days)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Planting Date *</label>
            <input
              type="date"
              className="input"
              value={form.planting_date}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => set('planting_date', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input type="text" className="input" value={form.notes}
            placeholder="Field location, variety, etc."
            onChange={e => set('notes', e.target.value)} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <><span className="spinner" /> Adding...</> : '+ Add Tracker'}
        </button>
      </form>
    </div>
  )
}

export default function HarvestTrackerModule() {
  const { user } = useAuth()
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [yieldModal, setYieldModal] = useState(null)
  const [yieldVal, setYieldVal] = useState('')
  const [saving, setSaving]     = useState(false)

  const fetchRecords = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/calendar/harvest-tracker/list')
      setRecords(Array.isArray(res.data) ? res.data : res.data?.records || [])
    } catch (err) {
      console.error('Harvest tracker fetch error:', err)
      setError('Could not load harvest records. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleLogYield = async () => {
    if (!yieldVal || isNaN(parseFloat(yieldVal))) {
      toast.error('Enter a valid yield in tonnes')
      return
    }
    setSaving(true)
    try {
      await api.patch(`/api/calendar/harvest-tracker/${yieldModal.id}/yield`, {
        actual_yield: parseFloat(yieldVal)
      })
      toast.success('Yield recorded!')
      setYieldModal(null)
      setYieldVal('')
      fetchRecords()
    } catch (err) {
      toast.error('Failed to save yield')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Farm Management</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Harvest Tracker</h1>
        <p className="text-agri-muted text-sm mt-1">
          Track your crops from planting to harvest. Log your actual yield after harvest.
        </p>
      </div>

      <AddTrackerForm onSuccess={fetchRecords} />

      {loading && (
        <div className="flex items-center justify-center py-12 text-agri-muted">
          <span className="spinner mr-2" /> Loading your records...
        </div>
      )}

      {!loading && error && (
        <div className="card p-6 text-center">
          <p className="text-rust text-sm">{error}</p>
          <button onClick={fetchRecords} className="btn-ghost mt-3 text-sm">
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">🌱</div>
          <p className="text-bark font-semibold">No crops tracked yet</p>
          <p className="text-agri-muted text-sm mt-1">
            Add your first crop above to start tracking harvest progress.
          </p>
        </div>
      )}

      {!loading && !error && records.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {records.map(r => (
            <TrackerCard
              key={r.id}
              record={r}
              onLogYield={rec => { setYieldModal(rec); setYieldVal('') }}
            />
          ))}
        </div>
      )}

      {/* Yield log modal */}
      {yieldModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <h3 className="font-serif text-lg font-bold text-bark mb-1">Log Harvest Yield</h3>
            <p className="text-sm text-agri-muted mb-4">{yieldModal.crop}</p>
            <label className="label">Actual Yield (tonnes)</label>
            <input
              type="number" step="0.01" min="0" className="input mb-4"
              placeholder="e.g. 2.5"
              value={yieldVal}
              onChange={e => setYieldVal(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleLogYield} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving...' : 'Save Yield'}
              </button>
              <button onClick={() => setYieldModal(null)} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
