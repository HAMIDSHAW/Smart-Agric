import { useState } from 'react'
import { cropCompareAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const CROPS = ['Cassava','Rice','Maize','Tomato','Groundnut','Pepper','Sweet Potato','Yam','Okra','Plantain','Banana','Eggplant','Cocoa','Palm Oil','Ginger']
const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']
const DEMAND_COLOR = { high: 'text-leaf', medium: 'text-gold', low: 'text-red-500' }
const WATER_LABEL  = { low: '💧 Low', medium: '💧💧 Medium', high: '💧💧💧 High' }

function ScoreBar({ score, color='bg-leaf' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-sand overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono font-bold w-8 text-right">{score}</span>
    </div>
  )
}

export default function CropCompareModule() {
  const { user } = useAuth()
  const [form, setForm] = useState({ crop_a: '', crop_b: '', district: user?.district || '', nitrogen: 50, ph: 6.5 })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  const handleCompare = async (e) => {
    e.preventDefault()
    if (!form.crop_a || !form.crop_b) { toast.error('Select two crops to compare'); return }
    if (form.crop_a === form.crop_b) { toast.error('Select two different crops'); return }
    setLoading(true)
    setResult(null)
    try {
      const r = await cropCompareAPI.compare(form)
      setResult(r.data)
      toast.success('Comparison ready')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Comparison failed')
    } finally { setLoading(false) }
  }

  const winner = result?.winner

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Decision Tool</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Crop Comparison Tool</h1>
        <p className="text-agri-muted text-sm mt-1">Compare two crops side by side on soil match, yield, and market price to make the smartest planting decision</p>
      </div>

      <div className="card p-5">
        <form onSubmit={handleCompare} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Crop A *</label>
              <select className="input" value={form.crop_a} onChange={e => set('crop_a', e.target.value)}>
                <option value="">Select crop</option>
                {CROPS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Crop B *</label>
              <select className="input" value={form.crop_b} onChange={e => set('crop_b', e.target.value)}>
                <option value="">Select crop</option>
                {CROPS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">District</label>
              <select className="input" value={form.district} onChange={e => set('district', e.target.value)}>
                <option value="">Select district</option>
                {DISTRICTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Soil pH</label>
              <input type="number" className="input" step="0.1" min="4" max="9"
                value={form.ph} onChange={e => set('ph', parseFloat(e.target.value))} />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <><span className="spinner" /> Comparing...</> : '⚖️ Compare Crops'}
          </button>
        </form>
      </div>

      {result && (() => {
        const a = result.crop_a, b = result.crop_b
        return (
          <div className="space-y-4 animate-slide-up">
            {/* Winner banner */}
            {winner && (
              <div className="card p-4 bg-gold/10 border border-gold/30 flex items-center gap-3">
                <div className="text-3xl">🏆</div>
                <div>
                  <p className="font-serif text-lg font-bold text-bark">{winner} is the better choice</p>
                  <p className="text-agri-muted text-sm">{result.recommendation}</p>
                </div>
              </div>
            )}

            {/* Side by side */}
            <div className="grid grid-cols-2 gap-3">
              {[a, b].map((crop, idx) => (
                <div key={idx} className={`card p-4 ${crop?.name === winner ? 'border-2 border-gold/50' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif text-lg font-bold text-bark">{crop?.name}</h3>
                    {crop?.name === winner && <span className="text-gold text-lg">🏆</span>}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between text-agri-muted mb-1"><span>Soil Match</span></div>
                      <ScoreBar score={crop?.soil_match_score || 0} color={crop?.name === winner ? 'bg-gold' : 'bg-leaf'} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {[
                        { label: 'Yield/ha', value: `${crop?.avg_yield_tonnes_per_hectare}t` },
                        { label: 'Days', value: crop?.days_to_harvest },
                        { label: 'Water', value: WATER_LABEL[crop?.water_needs] || crop?.water_needs },
                        { label: 'Difficulty', value: crop?.difficulty },
                        { label: 'Market', value: crop?.market_demand_sl, className: DEMAND_COLOR[crop?.market_demand_sl] },
                        { label: 'Revenue', value: `NLE ${(crop?.estimated_revenue_nle_per_hectare || 0).toLocaleString()}/ha` },
                      ].map(m => (
                        <div key={m.label} className="bg-sand-light rounded p-2">
                          <p className="text-agri-muted text-xs">{m.label}</p>
                          <p className={`font-semibold text-bark text-xs mt-0.5 ${m.className || ''}`}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                    {crop?.pros?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-leaf font-semibold mb-1">Pros</p>
                        {crop.pros.map((p, i) => <p key={i} className="text-bark">✓ {p}</p>)}
                      </div>
                    )}
                    {crop?.cons?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-red-500 font-semibold mb-1">Cons</p>
                        {crop.cons.map((c, i) => <p key={i} className="text-bark">✗ {c}</p>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
