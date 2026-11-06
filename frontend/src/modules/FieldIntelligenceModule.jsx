import { useState } from 'react'
import { fieldAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const CROPS = ['Cassava','Rice','Maize','Tomato','Groundnut','Pepper','Sweet Potato','Yam','Cocoa','Palm Oil','Banana','Okra','Ginger']
const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']
const SOIL_TYPES = ['Loam','Sandy Loam','Clay Loam','Clay','Laterite','Sandy']
const SEASONS = ['Rainy Season (May–Oct)','Dry Season (Nov–Apr)']
const PRACTICES = [
  { value: 'traditional', label: 'Traditional: basic farming, no bought inputs' },
  { value: 'improved',    label: 'Improved: some fertilizer and certified seed' },
  { value: 'best',        label: 'Best practice: full fertilizer, certified seed, pest control' },
]

function ScoreGauge({ score, label, grade }) {
  const color = grade === 'A' ? '#14532D' : grade === 'B' ? '#F59E0B' : grade === 'C' ? '#E67E22' : '#C0392B'
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#EAD9B8" strokeWidth="10" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${score * 2.51} 251`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease' }} />
        </svg>
        <div className="absolute text-center">
          <div className="font-serif text-2xl font-bold" style={{ color }}>{score}</div>
          <div className="text-xs text-agri-muted font-bold">{grade}</div>
        </div>
      </div>
      <p className="text-sm font-semibold text-bark mt-1">{label}</p>
    </div>
  )
}

export default function FieldIntelligenceModule() {
  const { user } = useAuth()
  const [tab, setTab] = useState('yield')
  const [loading, setLoading] = useState(false)

  // Yield prediction form
  const [yieldForm, setYieldForm] = useState({
    crop: '', district: user?.district || '', soil_type: '',
    plot_size: 1.0, season: 'Rainy Season (May–Oct)', practices: 'traditional'
  })
  const [yieldResult, setYieldResult] = useState(null)

  // Health score form
  const [healthForm, setHealthForm] = useState({
    uses_fertilizer: false, uses_rotation: false,
    has_irrigation: false, years_farming: 3
  })
  const [healthResult, setHealthResult] = useState(null)

  // Carbon footprint form
  const [carbonForm, setCarbonForm] = useState({
    crop: '', plot_size: 1.0, fertilizer_kg: 0,
    uses_tractor: false, burns_residue: false,
    uses_compost: false, trees_on_farm: 0
  })
  const [carbonResult, setCarbonResult] = useState(null)

  const handleYield = async (e) => {
    e.preventDefault()
    if (!yieldForm.crop) { toast.error('Select a crop'); return }
    setLoading(true)
    try {
      const r = await fieldAPI.yieldPrediction(yieldForm)
      setYieldResult(r.data)
      toast.success('Yield prediction ready')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Prediction failed. Try again.')
    } finally { setLoading(false) }
  }

  const handleHealth = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const r = await fieldAPI.healthScore(healthForm)
      setHealthResult(r.data)
      toast.success('Field health score calculated')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not calculate score')
    } finally { setLoading(false) }
  }

  const handleCarbon = async (e) => {
    e.preventDefault()
    if (!carbonForm.crop) { toast.error('Select a crop'); return }
    setLoading(true)
    try {
      const r = await fieldAPI.carbonFootprint(carbonForm)
      setCarbonResult(r.data)
      toast.success('Carbon footprint calculated')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Calculation failed')
    } finally { setLoading(false) }
  }

  const gradeColor = (g) => g === 'A' ? 'text-leaf' : g === 'B' ? 'text-gold' : g === 'C' ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Field Intelligence</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Field Intelligence</h1>
        <p className="text-agri-muted text-sm mt-1">
          Yield prediction, field health scoring, and carbon footprint: precision farming tools for every Sierra Leone farmer
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {[
          { k: 'yield',  l: '🌾 Yield Prediction' },
          { k: 'health', l: '💚 Field Health Score' },
          { k: 'carbon', l: '🌍 Carbon Footprint' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.k ? 'bg-bark text-gold-light' : 'bg-white border border-sand text-agri-muted hover:text-bark'
            }`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* YIELD PREDICTION */}
      {tab === 'yield' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-bark mb-3 text-sm">Enter your field details</h3>
            <form onSubmit={handleYield} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Crop *</label>
                  <select className="input" value={yieldForm.crop} onChange={e => setYieldForm(f=>({...f,crop:e.target.value}))}>
                    <option value="">Select crop</option>
                    {CROPS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">District</label>
                  <select className="input" value={yieldForm.district} onChange={e => setYieldForm(f=>({...f,district:e.target.value}))}>
                    <option value="">Select district</option>
                    {DISTRICTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Soil Type</label>
                  <select className="input" value={yieldForm.soil_type} onChange={e => setYieldForm(f=>({...f,soil_type:e.target.value}))}>
                    <option value="">Select soil</option>
                    {SOIL_TYPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Plot Size (ha)</label>
                  <input type="number" className="input" min="0.1" max="100" step="0.1"
                    value={yieldForm.plot_size} onChange={e => setYieldForm(f=>({...f,plot_size:parseFloat(e.target.value)||1}))} />
                </div>
                <div>
                  <label className="label">Season</label>
                  <select className="input" value={yieldForm.season} onChange={e => setYieldForm(f=>({...f,season:e.target.value}))}>
                    {SEASONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Farming Practices</label>
                  <select className="input" value={yieldForm.practices} onChange={e => setYieldForm(f=>({...f,practices:e.target.value}))}>
                    {PRACTICES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? <><span className="spinner"/>Predicting...</> : '🌾 Predict My Yield'}
              </button>
            </form>
          </div>

          {yieldResult && (
            <div className="space-y-3 animate-slide-up">
              <div className="card p-5 bg-gradient-to-r from-leaf/8 to-gold/5 border-leaf/20">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-agri-muted text-xs uppercase tracking-wide font-semibold mb-1">Expected Yield</p>
                    <p className="font-serif text-3xl font-bold text-bark">{(yieldResult.expected_yield_kg/1000).toFixed(1)} tonnes</p>
                    <p className="text-agri-muted text-sm mt-0.5">Range: {yieldResult.min_yield_kg} – {yieldResult.max_yield_kg} kg</p>
                    <p className="text-agri-muted text-xs mt-0.5">{yieldResult.yield_per_ha}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-agri-muted text-xs uppercase tracking-wide font-semibold mb-1">Est. Market Value</p>
                    <p className="font-serif text-2xl font-bold text-gold">NLE {(yieldResult.market_value_nle||0).toLocaleString()}</p>
                    <p className="text-agri-muted text-xs mt-0.5">Harvest: {yieldResult.harvest_month}</p>
                    <span className={`text-sm font-bold ${gradeColor(yieldResult.grade)}`}>Grade {yieldResult.grade}</span>
                  </div>
                </div>
              </div>
              {yieldResult.limiting_factors?.length > 0 && (
                <div className="card p-4">
                  <h4 className="text-sm font-semibold text-bark mb-2">⚠️ Limiting Factors</h4>
                  <ul className="space-y-1">{yieldResult.limiting_factors.map((f,i)=>(
                    <li key={i} className="text-sm text-agri-muted flex gap-2"><span className="text-amber-500 flex-shrink-0">→</span>{f}</li>
                  ))}</ul>
                </div>
              )}
              {yieldResult.how_to_improve?.length > 0 && (
                <div className="card p-4 bg-leaf-pale border border-leaf/20">
                  <h4 className="text-sm font-semibold text-leaf mb-2">💡 How to Increase Your Yield</h4>
                  <ul className="space-y-1">{yieldResult.how_to_improve.map((f,i)=>(
                    <li key={i} className="text-sm text-bark flex gap-2"><span className="text-leaf font-bold">{i+1}.</span>{f}</li>
                  ))}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FIELD HEALTH SCORE */}
      {tab === 'health' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-bark mb-1 text-sm">Your Field Health Score</h3>
            <p className="text-agri-muted text-xs mb-4">Based on your disease scan history, soil analysis, and farming practices</p>
            <form onSubmit={handleHealth} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'uses_fertilizer', label: 'Do you use fertilizer?' },
                  { key: 'uses_rotation',   label: 'Do you practice crop rotation?' },
                  { key: 'has_irrigation',  label: 'Do you have any irrigation?' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-sand-light border border-sand">
                    <span className="text-sm text-bark">{label}</span>
                    <button type="button"
                      onClick={() => setHealthForm(f=>({...f,[key]:!f[key]}))}
                      className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${healthForm[key] ? 'bg-leaf justify-end' : 'bg-sand-light border border-sand justify-start'}`}>
                      <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                ))}
                <div className="p-3 rounded-xl bg-sand-light border border-sand">
                  <label className="text-sm text-bark block mb-1">Years farming</label>
                  <input type="number" className="input" min="1" max="50"
                    value={healthForm.years_farming}
                    onChange={e => setHealthForm(f=>({...f,years_farming:parseInt(e.target.value)||3}))} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? <><span className="spinner"/>Calculating...</> : '💚 Calculate My Field Score'}
              </button>
            </form>
          </div>

          {healthResult && (
            <div className="space-y-4 animate-slide-up">
              <div className="card p-6">
                <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                  <ScoreGauge score={healthResult.overall_score} grade={healthResult.grade} label={healthResult.label} />
                  <div className="flex-1 min-w-[180px]">
                    <h3 className="font-serif text-xl font-bold text-bark mb-3">Field Health Score</h3>
                    <div className="space-y-2">
                      {[
                        { l: 'Crop Health', v: healthResult.breakdown?.crop_health, desc: `${healthResult.total_scans} scans, ${healthResult.diseased_scans} diseased` },
                        { l: 'Soil Health', v: healthResult.breakdown?.soil_health, desc: healthResult.soil_type },
                        { l: 'Farming Practices', v: healthResult.breakdown?.practices, desc: 'Based on your inputs' },
                      ].map(b => (
                        <div key={b.l}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-agri-muted">{b.l}</span>
                            <span className="font-mono font-semibold text-bark">{b.v}/100</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-sand overflow-hidden">
                            <div className="h-full bg-leaf rounded-full" style={{width:`${b.v}%`}} />
                          </div>
                          <p className="text-xs text-agri-muted mt-0.5">{b.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {healthResult.improvements?.length > 0 && (
                  <div className="border-t border-sand pt-4">
                    <h4 className="text-sm font-semibold text-bark mb-2">How to improve your score</h4>
                    <ul className="space-y-2">
                      {healthResult.improvements.map((tip,i) => (
                        <li key={i} className="flex gap-2 text-sm text-agri-muted">
                          <span className="text-leaf flex-shrink-0">→</span>{tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CARBON FOOTPRINT */}
      {tab === 'carbon' && (
        <div className="space-y-4">
          <div className="card p-4 bg-gradient-to-r from-green-50 to-leaf/5 border border-leaf/20">
            <div className="flex gap-2 items-start">
              <span className="text-xl">🌍</span>
              <p className="text-xs text-agri-muted leading-relaxed">
                Sustainable farming is attracting major international investment and NGO funding.
                Understanding your carbon footprint opens doors to climate finance and premium markets.
              </p>
            </div>
          </div>

          <div className="card p-5">
            <form onSubmit={handleCarbon} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Crop *</label>
                  <select className="input" value={carbonForm.crop} onChange={e => setCarbonForm(f=>({...f,crop:e.target.value}))}>
                    <option value="">Select crop</option>
                    {CROPS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Plot Size (ha)</label>
                  <input type="number" className="input" min="0.1" step="0.1"
                    value={carbonForm.plot_size} onChange={e => setCarbonForm(f=>({...f,plot_size:parseFloat(e.target.value)||1}))} />
                </div>
                <div>
                  <label className="label">Fertilizer Used (kg)</label>
                  <input type="number" className="input" min="0"
                    value={carbonForm.fertilizer_kg} onChange={e => setCarbonForm(f=>({...f,fertilizer_kg:parseFloat(e.target.value)||0}))} />
                </div>
                <div>
                  <label className="label">Trees on Farm</label>
                  <input type="number" className="input" min="0"
                    value={carbonForm.trees_on_farm} onChange={e => setCarbonForm(f=>({...f,trees_on_farm:parseInt(e.target.value)||0}))} />
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { key: 'uses_tractor',  label: 'Do you use a tractor?' },
                  { key: 'burns_residue', label: 'Do you burn crop residue after harvest?' },
                  { key: 'uses_compost',  label: 'Do you use compost?' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-sand-light border border-sand">
                    <span className="text-sm text-bark">{label}</span>
                    <button type="button"
                      onClick={() => setCarbonForm(f=>({...f,[key]:!f[key]}))}
                      className={`w-12 h-6 rounded-full transition-all flex items-center px-1 ${carbonForm[key] ? 'bg-leaf justify-end' : 'bg-sand-light border border-sand justify-start'}`}>
                      <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? <><span className="spinner"/>Calculating...</> : '🌍 Calculate Carbon Footprint'}
              </button>
            </form>
          </div>

          {carbonResult && (
            <div className="space-y-3 animate-slide-up">
              <div className={`card p-5 border-l-4 ${
                carbonResult.status === 'carbon_negative' ? 'border-leaf bg-leaf-pale' :
                carbonResult.status === 'carbon_neutral' ? 'border-gold bg-gold/5' : 'border-red-400 bg-red-50'
              }`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-semibold text-agri-muted uppercase tracking-wide mb-1">Net Carbon Footprint</p>
                    <p className="font-serif text-3xl font-bold text-bark">{Math.abs(carbonResult.net_footprint_kg)} kg CO₂</p>
                    <p className={`text-sm font-semibold mt-1 ${
                      carbonResult.status === 'carbon_negative' ? 'text-leaf' :
                      carbonResult.status === 'carbon_neutral' ? 'text-gold' : 'text-red-600'
                    }`}>{carbonResult.status_label}</p>
                  </div>
                  <div className="text-right text-xs text-agri-muted space-y-0.5">
                    <p>Emissions: {carbonResult.total_emissions_kg} kg</p>
                    <p>Absorbed: {carbonResult.total_sequestration_kg} kg</p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <h4 className="text-sm font-semibold text-bark mb-3">Breakdown</h4>
                <div className="space-y-2 text-xs">
                  {[
                    { l: 'Fertilizer emissions', v: carbonResult.breakdown?.fertilizer_emissions, neg: true },
                    { l: 'Tractor emissions',    v: carbonResult.breakdown?.tractor_emissions, neg: true },
                    { l: 'Burning emissions',    v: carbonResult.breakdown?.burning_emissions, neg: true },
                    { l: 'Crops absorb CO₂',     v: carbonResult.breakdown?.crop_sequestration, neg: false },
                    { l: 'Trees absorb CO₂',     v: carbonResult.breakdown?.tree_sequestration, neg: false },
                    { l: 'Compost benefit',       v: carbonResult.breakdown?.compost_benefit, neg: false },
                  ].filter(b => b.v > 0).map((b,i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-agri-muted">{b.l}</span>
                      <span className={`font-mono font-semibold ${b.neg ? 'text-red-600' : 'text-leaf'}`}>
                        {b.neg ? '-' : '+'}{b.v} kg
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {carbonResult.improvement_tips?.length > 0 && (
                <div className="card p-4 border border-leaf/20">
                  <h4 className="text-sm font-semibold text-leaf mb-2">🌱 Reduce Your Carbon Footprint</h4>
                  <ul className="space-y-2">
                    {carbonResult.improvement_tips.map((tip,i) => (
                      <li key={i} className="text-sm text-bark flex gap-2">
                        <span className="text-leaf flex-shrink-0">{i+1}.</span>{tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-agri-muted text-center">{carbonResult.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
