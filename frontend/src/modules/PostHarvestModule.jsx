import { useState } from 'react'
import { postHarvestAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const CROPS = ['Cassava','Rice','Maize','Tomato','Groundnut','Pepper','Sweet Potato','Yam','Okra','Plantain','Banana','Eggplant','Cocoa','Palm Oil']
const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']

export default function PostHarvestModule() {
  const { user } = useAuth()
  const [form, setForm] = useState({ crop: '', quantity: '', district: user?.district || '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.crop) { toast.error('Select your crop'); return }
    setLoading(true)
    setResult(null)
    try {
      const r = await postHarvestAPI.getAdvice({
        crop: form.crop,
        quantity: form.quantity ? parseFloat(form.quantity) : null,
        district: form.district
      })
      setResult(r.data)
      toast.success('Storage advice ready')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not get advice. Try again.')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Post-Harvest</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Post-Harvest Storage Advice</h1>
        <p className="text-agri-muted text-sm mt-1">
          Post-harvest loss accounts for up to 40% of produce in Sierra Leone. Get specific storage guidance to protect your harvest.
        </p>
      </div>

      <div className="card p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Crop *</label>
              <select className="input" value={form.crop} onChange={e => set('crop', e.target.value)}>
                <option value="">Select crop</option>
                {CROPS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Quantity (kg)</label>
              <input type="number" className="input" placeholder="e.g. 500" min="1"
                value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div>
              <label className="label">District</label>
              <select className="input" value={form.district} onChange={e => set('district', e.target.value)}>
                <option value="">Select district</option>
                {DISTRICTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <><span className="spinner" /> Getting advice...</> : '📦 Get Storage Advice'}
          </button>
        </form>
      </div>

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: '⏱️', label: 'Storage Duration', value: result.storage_duration },
              { icon: '🌡️', label: 'Temperature', value: result.ideal_temperature },
              { icon: '💧', label: 'Moisture Control', value: result.moisture_control },
            ].map(m => (
              <div key={m.label} className="card p-4 text-center">
                <div className="text-2xl mb-1">{m.icon}</div>
                <p className="text-xs text-agri-muted mb-0.5">{m.label}</p>
                <p className="font-semibold text-bark text-sm">{m.value}</p>
              </div>
            ))}
          </div>

          {result.best_containers?.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-bark text-sm mb-2">📦 Best Containers</h3>
              <div className="flex gap-2 flex-wrap">
                {result.best_containers.map((c, i) => (
                  <span key={i} className="px-3 py-1.5 bg-sand-light border border-sand rounded-lg text-sm text-bark">{c}</span>
                ))}
              </div>
            </div>
          )}

          {result.tips?.length > 0 && (
            <div className="card p-4 bg-leaf-pale border border-leaf/20">
              <h3 className="font-semibold text-leaf text-sm mb-2">✅ Storage Tips</h3>
              <ul className="space-y-2">
                {result.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-bark">
                    <span className="font-bold text-leaf flex-shrink-0">{i+1}.</span>{tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.common_mistakes?.length > 0 && (
            <div className="card p-4 bg-red-50 border border-red-200">
              <h3 className="font-semibold text-red-700 text-sm mb-2">⚠️ Common Mistakes to Avoid</h3>
              <ul className="space-y-1.5">
                {result.common_mistakes.map((m, i) => (
                  <li key={i} className="flex gap-2 text-sm text-red-800">
                    <span className="flex-shrink-0">✗</span>{m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {result.market_timing && (
              <div className="card p-4 border border-gold/20">
                <h3 className="font-semibold text-gold text-sm mb-1">💰 Best Time to Sell</h3>
                <p className="text-bark text-sm">{result.market_timing}</p>
              </div>
            )}
            {result.value_addition && (
              <div className="card p-4 border border-leaf/20">
                <h3 className="font-semibold text-leaf text-sm mb-1">🔄 Increase Your Value</h3>
                <p className="text-bark text-sm">{result.value_addition}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
