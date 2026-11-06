import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fertilizerAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const CROPS = ['Cassava', 'Maize', 'Rice', 'Tomato', 'Groundnut', 'Sweet Potato', 'Yam', 'Mango', 'Banana', 'Pepper', 'Cabbage']
const STAGES = ['Pre-planting', 'Vegetative', 'Flowering', 'Fruiting', 'Tasseling', 'Bulking', 'Panicle Initiation']

function NutrientBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100)
  const status = pct < 25 ? 'Low' : pct < 60 ? 'Moderate' : 'Good'
  const statusColor = pct < 25 ? 'text-red-600' : pct < 60 ? 'text-gold' : 'text-leaf'
  return (
    <div className="flex items-center gap-3 py-2 border-b border-sand last:border-0">
      <span className="font-mono text-sm font-bold text-bark w-5">{label}</span>
      <div className="flex-1 h-2 bg-sand rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs w-12 text-right text-bark">{value}</span>
      <span className={`text-xs w-14 text-right font-medium ${statusColor}`}>{status}</span>
    </div>
  )
}

export default function FertilizerModule() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    crop: 'Cassava', growth_stage: 'Pre-planting',
    nitrogen: 42, phosphorus: 18, potassium: 33, ph: 6.2,
    plot_size: 1.0
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fertilizerAPI.getPlan(form)
      setResult(res.data)
      toast.success('Fertilizer plan generated!')
    } catch (err) {
      toast.error(err.response?.data?.error || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Soil Science</div>
        <h1 className="font-serif text-2xl text-bark font-bold">{t('fertilizer.title')}</h1>
        <p className="text-agri-muted text-sm mt-1">{t('fertilizer.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">{t('fertilizer.targetCrop')}</label>
            <select className="input" value={form.crop} onChange={e => set('crop', e.target.value)}>
              {CROPS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('fertilizer.growthStage')}</label>
            <select className="input" value={form.growth_stage} onChange={e => set('growth_stage', e.target.value)}>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Plot Size (hectares)</label>
            <input type="number" className="input" min="0.1" max="100" step="0.1"
              placeholder="e.g. 1.5"
              value={form.plot_size}
              onChange={e => set('plot_size', parseFloat(e.target.value) || 1)} />
            <p className="text-xs text-agri-muted mt-0.5">1 hectare = 2.47 acres</p>
          </div>
        </div>

        <div>
          <label className="label mb-3">{t('fertilizer.currentLevels')}</label>
          <div className="card p-3 space-y-0">
            <NutrientBar label="N" value={form.nitrogen} max={140} color="bg-sky-light" />
            <NutrientBar label="P" value={form.phosphorus} max={145} color="bg-gold" />
            <NutrientBar label="K" value={form.potassium} max={205} color="bg-leaf" />
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[['nitrogen','N',0,140],['phosphorus','P',0,145],['potassium','K',0,205],['ph','pH',3,10]].map(([key, lbl, min, max]) => (
              <div key={key}>
                <label className="label">{lbl}</label>
                <input type="number" className="input" min={min} max={max} step={key==='ph'?'0.1':'1'}
                  value={form[key]} onChange={e => set(key, parseFloat(e.target.value))} />
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto justify-center py-3">
          {loading ? <><span className="spinner" /> Calculating...</> : `🧪 ${t('fertilizer.generate')}`}
        </button>
      </form>

      {result && (
        <div className="space-y-4 animate-slide-up">
          {/* Deficiencies */}
          {result.deficiencies?.length > 0 && (
            <div className="card p-4 border-l-4 border-red-500">
              <h3 className="font-semibold text-bark text-sm mb-3">⚠️ {t('fertilizer.deficiencies')}</h3>
              <div className="space-y-2">
                {result.deficiencies.map((d, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`badge text-xs ${d.severity === 'High' ? 'bg-red-50 text-red-700' : 'badge-warning'}`}>
                      {d.severity}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-bark">{d.nutrient}</p>
                      <p className="text-xs text-agri-muted">{d.symptoms}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plan */}
          <div className="card p-5">
            <h3 className="font-semibold text-bark text-base mb-1">
              {t('fertilizer.plan')}, {result.crop}
            </h3>
            <p className="text-agri-muted text-xs mb-4">{result.growth_stage} stage</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand">
                    <th className="text-left py-2 pr-4 text-xs text-agri-muted uppercase tracking-wide">{t('fertilizer.fertilizer')}</th>
                    <th className="text-left py-2 pr-4 text-xs text-agri-muted uppercase tracking-wide">{t('fertilizer.quantity')}</th>
                    <th className="text-left py-2 pr-4 text-xs text-agri-muted uppercase tracking-wide">{t('fertilizer.timing')}</th>
                    <th className="text-left py-2 text-xs text-agri-muted uppercase tracking-wide">{t('fertilizer.method')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.plan.map((item, i) => (
                    <tr key={i} className="border-b border-sand/50 last:border-0">
                      <td className="py-3 pr-4 font-medium text-bark">{item.fertilizer}</td>
                      <td className="py-3 pr-4 font-mono text-leaf text-xs">{item.qty_per_ha}</td>
                      <td className="py-3 pr-4 text-agri-muted text-xs">{item.timing}</td>
                      <td className="py-3 text-agri-muted text-xs">{item.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.notes && (
              <div className="mt-4 p-3 rounded-lg bg-gold/5 border border-gold/15">
                <p className="text-xs text-bark leading-relaxed">💡 {result.notes}</p>
              </div>
            )}
          </div>

          {/* Application Steps - show for first recommendation */}
          {result?.recommendations?.[0]?.application_steps?.length > 0 && (
            <div className="card p-5 border-l-4 border-leaf">
              <h3 className="font-semibold text-bark text-sm mb-1">
                📋 How to Apply: {result.recommendations[0].method || 'Broadcast'} Method
              </h3>
              {result.recommendations[0].tools_needed && (
                <p className="text-xs text-agri-muted mb-3">
                  🔧 Tools needed: {result.recommendations[0].tools_needed}
                </p>
              )}
              <ol className="space-y-2">
                {result.recommendations[0].application_steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-bark">
                    <span className="w-5 h-5 rounded-full bg-leaf text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              {result.recommendations[0].application_tip && (
                <div className="mt-3 p-3 rounded-lg bg-gold/8 border border-gold/20">
                  <p className="text-xs font-semibold text-gold mb-0.5">💡 Pro Tip</p>
                  <p className="text-xs text-bark">{result.recommendations[0].application_tip}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
