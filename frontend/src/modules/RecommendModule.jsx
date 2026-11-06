import MarketSuggestions from '../components/market/MarketSuggestions'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { recommendAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

// Reference market prices for Sierra Leone (sourced from MAFFS price bulletins)
// Update these figures each season from https://www.maffs.gov.sl or your local market
const MARKET_PRICES = {
  'Rice':        { price: 'NLE 3,200/bag',   unit: '50kg bag',  source: 'MAFFS 2024' },
  'Cassava':     { price: 'NLE 850/kg',       unit: 'per kg',    source: 'MAFFS 2024' },
  'Maize':       { price: 'NLE 1,100/kg',     unit: 'per kg',    source: 'MAFFS 2024' },
  'Tomato':      { price: 'NLE 4,500/crate',  unit: 'per crate', source: 'MAFFS 2024' },
  'Groundnut':   { price: 'NLE 2,800/kg',     unit: 'per kg',    source: 'MAFFS 2024' },
  'Pepper':      { price: 'NLE 3,100/crate',  unit: 'per crate', source: 'MAFFS 2024' },
  'Sweet Potato':{ price: 'NLE 1,600/kg',     unit: 'per kg',    source: 'MAFFS 2024' },
  'Yam':         { price: 'NLE 2,200/kg',     unit: 'per kg',    source: 'MAFFS 2024' },
  'Plantain':    { price: 'NLE 1,800/bunch',  unit: 'per bunch', source: 'MAFFS 2024' },
  'Banana':      { price: 'NLE 900/bunch',    unit: 'per bunch', source: 'MAFFS 2024' },
}

function getMarketPrice(cropName) {
  const name = cropName?.toLowerCase() || ''
  for (const [key, val] of Object.entries(MARKET_PRICES)) {
    if (name.includes(key.toLowerCase()) || key.toLowerCase().includes(name)) return val
  }
  return null
}


function Slider({ label, value, min, max, unit, onChange }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <label className="label mb-0">{label}</label>
        <span className="font-mono text-sm text-leaf font-medium">{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, #14532D ${((value-min)/(max-min))*100}%, #E5E7EB ${((value-min)/(max-min))*100}%)` }}
      />
      <div className="flex justify-between text-xs text-agri-muted mt-1">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  )
}

function ProduceCard({ crop, rank }) {
  const rankColors = ['border-gold bg-gold/5', 'border-leaf bg-leaf/5', 'border-soil-light bg-soil/5']
  const rankBadge = ['🥇 Best Match', '🥈 2nd Choice', '🥉 3rd Choice']

  return (
    <div className={`card p-4 border-t-2 ${rankColors[rank] || 'border-sand bg-white'} transition-all hover:shadow-agri-lg hover:-translate-y-px`}>
      <div className="text-3xl mb-2">{crop.emoji}</div>
      <h3 className="font-semibold text-bark text-sm">{crop.crop}</h3>
      <p className="text-agri-muted text-xs">{crop.category}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="font-mono text-xs font-bold text-leaf">{crop.score.toFixed(0)}%</span>
        {rank < 3 && <span className="text-xs text-gold">{rankBadge[rank]}</span>}
      </div>
      {/* Score bar */}
      <div className="mt-2 h-1 rounded-full bg-sand overflow-hidden">
        <div className="h-full bg-leaf rounded-full" style={{ width: `${crop.score}%` }} />
      </div>
      {crop.local_name_krio && (
        <p className="text-agri-muted text-xs mt-1.5 italic">Krio: {crop.local_name_krio}</p>
      )}
      {/* Market Price - sourced from MAFFS price bulletins */}
      {(() => { const mp = getMarketPrice(crop.crop); return mp ? (
        <div className="mt-2 pt-2 border-t border-sand/60">
          <p className="text-xs font-semibold text-bark">💰 Reference Price</p>
          <p className="text-xs font-mono text-agri-muted mt-0.5">{mp.price}</p>
          <p className="text-xs text-agri-muted opacity-60">{mp.source} · verify locally</p>
        </div>
      ) : null })()}
    </div>
  )
}

const DISTRICTS = ['Bo', 'Bombali', 'Bonthe', 'Falaba', 'Kailahun', 'Kambia', 'Karene', 'Kenema', 'Koinadugu', 'Kono', 'Moyamba', 'Port Loko', 'Pujehun', 'Tonkolili', 'Western Area Rural', 'Western Area Urban']

export default function RecommendModule() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const [form, setForm] = useState({
    nitrogen: 42, phosphorus: 18, potassium: 33,
    ph: 6.2, temperature: 28, humidity: 78, rainfall: 2200,
    district: user?.district || ''
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setResults(null)
    try {
      const res = await recommendAPI.getCrops(form)
      setResults(res.data)
      toast.success('Recommendations ready!')
    } catch (err) {
      toast.error(err.response?.data?.error || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const displayed = results ? (showAll ? results.all_crops : results.recommendations) : []

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">AI Recommendation</div>
        <h1 className="font-serif text-2xl text-bark font-bold">{t('recommend.title')}</h1>
        <p className="text-agri-muted text-sm mt-1">{t('recommend.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-1">
        <h3 className="font-semibold text-bark text-sm mb-3">Soil Nutrient Levels</h3>

        <Slider label={t('recommend.nitrogen')} value={form.nitrogen} min={0} max={140} unit="kg/ha" onChange={v => set('nitrogen', v)} />
        <Slider label={t('recommend.phosphorus')} value={form.phosphorus} min={0} max={145} unit="kg/ha" onChange={v => set('phosphorus', v)} />
        <Slider label={t('recommend.potassium')} value={form.potassium} min={0} max={205} unit="kg/ha" onChange={v => set('potassium', v)} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div>
            <label className="label">{t('recommend.ph')}</label>
            <input type="number" className="input" min="3" max="10" step="0.1"
              value={form.ph} onChange={e => set('ph', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="label">{t('recommend.temperature')}</label>
            <input type="number" className="input"
              value={form.temperature} onChange={e => set('temperature', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="label">{t('recommend.humidity')}</label>
            <input type="number" className="input"
              value={form.humidity} onChange={e => set('humidity', parseFloat(e.target.value))} />
          </div>
          <div>
            <label className="label">{t('recommend.rainfall')}</label>
            <input type="number" className="input"
              value={form.rainfall} onChange={e => set('rainfall', parseFloat(e.target.value))} />
          </div>
        </div>

        <div className="pt-1">
          <label className="label">{t('recommend.district')}</label>
          <select className="input max-w-xs" value={form.district} onChange={e => set('district', e.target.value)}>
            <option value="">Select district</option>
            {DISTRICTS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div className="pt-2">
          <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto justify-center py-3">
            {loading ? <><span className="spinner" /> Analysing soil...</> : `🌾 ${t('recommend.analyse')}`}
          </button>
        </div>
      </form>

      {/* Results */}
      {results && (
        <div className="animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-xl text-bark font-bold">{t('recommend.results')}</h2>
            <button className="btn-ghost text-xs"
              onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show Top 6' : `Show All ${results.all_crops.length}`}
            </button>
          </div>

          {displayed[0]?.notes && (
            <div className="card p-4 mb-4 border-l-4 border-leaf bg-leaf-pale/50">
              <p className="text-sm text-bark leading-relaxed">
                <strong>💡 Top pick:</strong> {displayed[0]?.notes}
              </p>
            </div>
          )}

          <div className="card p-3 mb-3 bg-gradient-to-r from-gold/5 to-leaf/5 border border-gold/20 flex items-center gap-3">
            <span className="text-xl">💰</span>
            <div>
              <p className="text-xs font-semibold text-bark">Reference Market Prices</p>
              <p className="text-agri-muted text-xs">Prices from MAFFS 2024 price bulletins. Verify with your local market before selling.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {displayed.map((crop, i) => (
              <ProduceCard key={crop.crop} crop={crop} rank={i} />
            ))}
          </div>

          {displayed[0]?.crop && <MarketSuggestions crop={displayed[0].crop} need="seeds" />}

          {/* Harvest Predictions */}
          {results.harvest_predictions?.length > 0 && (
            <div className="mt-5">
              <h3 className="font-serif text-lg text-bark font-semibold mb-3">
                🌾 What You Can Expect to Harvest
              </h3>
              <div className="space-y-3">
                {results.harvest_predictions.map((pred, i) => (
                  <div key={i} className={`card p-4 border-l-4 ${i === 0 ? 'border-gold' : 'border-sand'}`}>
                    <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          {i === 0 && <span className="text-xs font-bold text-gold uppercase tracking-wide">Top Recommendation</span>}
                        </div>
                        <h4 className="font-serif text-lg font-bold text-bark">{pred.crop}</h4>
                        <p className="text-agri-muted text-xs">Ready in {pred.days_to_harvest}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-serif text-2xl font-bold text-leaf">
                          {(pred.expected_yield_kg / 1000).toFixed(1)}t
                        </p>
                        <p className="text-agri-muted text-xs">{pred.yield_per_ha}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      {[
                        { label: 'Min Yield', value: `${pred.min_yield_kg.toLocaleString()} kg`, icon: '📉' },
                        { label: 'Expected', value: `${pred.expected_yield_kg.toLocaleString()} kg`, icon: '🎯' },
                        { label: 'Max Yield', value: `${pred.max_yield_kg.toLocaleString()} kg`, icon: '📈' },
                        { label: 'Est. Revenue', value: `NLE ${pred.estimated_revenue_nle.toLocaleString()}`, icon: '💰' },
                      ].map(m => (
                        <div key={m.label} className="text-center p-2 rounded-lg bg-sand-light border border-sand">
                          <p className="text-base mb-0.5">{m.icon}</p>
                          <p className="text-bark text-xs font-semibold">{m.value}</p>
                          <p className="text-agri-muted text-xs">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-2">
                      <span className="text-sm">⚠️</span>
                      <p className="text-xs text-amber-800">
                        <strong>Post-harvest loss:</strong> {pred.post_harvest_loss_pct}% average loss without proper storage.
                        Sellable amount: <strong>{pred.sellable_kg.toLocaleString()} kg</strong>
                      </p>
                    </div>

                    {pred.notes && (
                      <p className="text-xs text-agri-muted italic">{pred.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
