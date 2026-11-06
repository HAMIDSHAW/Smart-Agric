import { useState, useEffect } from 'react'
import { calendarAPI } from '../services/api'
import { HarvestOrb } from '../components/Scene3D'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const CROPS = ['Cassava','Rice','Maize','Tomato','Groundnut','Pepper','Sweet Potato','Yam','Okra','Plantain','Banana','Eggplant','Cocoa','Palm Oil','Ginger']
const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']
const SEASONS = ['Dry Season (Nov–Apr)','Rainy Season (May–Oct)']
const PHASE_COLORS = { 'Land Preparation':'bg-soil/20 border-soil/40', 'Planting':'bg-leaf/15 border-leaf/30', 'Growth':'bg-green-100 border-green-300', 'Flowering':'bg-gold/15 border-gold/30', 'Harvest':'bg-amber-100 border-amber-300' }
const WATER_ICONS = { low:'💧', medium:'💧💧', high:'💧💧💧' }

function HarvestTrackerPanel() {
  const { user } = useAuth()
  const [trackers, setTrackers] = useState([])
  const [form, setForm] = useState({ crop: '', planted_date: '', district: user?.district || '' })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const loadTrackers = () => {
    setLoadError(null)
    calendarAPI.listTrackers()
      .then(r => { setTrackers(r.data.trackers || []); setLoading(false) })
      .catch(err => {
        setLoading(false)
        // Only clear list if we have a real non-auth error; auth errors are retried by interceptor
        if (err.response?.status !== 401) {
          setLoadError('Could not load trackers. Please try refreshing.')
        }
      })
  }

  useEffect(() => { loadTrackers() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.crop || !form.planted_date) { toast.error('Crop and planting date required'); return }
    setLoading(true)
    try {
      await calendarAPI.createTracker(form)
      await loadTrackers()
      setForm({ crop: '', planted_date: '', district: user?.district || '' })
      toast.success('Harvest tracker added')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add tracker')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold text-bark mb-3 text-sm">Add Crop to Track</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Crop</label>
            <select className="input" value={form.crop} onChange={e => setForm(f => ({...f, crop: e.target.value}))}>
              <option value="">Select crop</option>
              {CROPS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Planting Date</label>
            <input type="date" className="input" value={form.planted_date}
              onChange={e => setForm(f => ({...f, planted_date: e.target.value}))} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <><span className="spinner" /> Adding...</> : '+ Add'}
            </button>
          </div>
        </form>
      </div>

      {loadError ? (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="text-bark text-sm font-medium mb-3">{loadError}</p>
          <button onClick={loadTrackers} className="btn-primary text-sm">Try Again</button>
        </div>
      ) : loading ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🌾</div>
          <p className="text-agri-muted text-xs">Loading your tracked crops...</p>
        </div>
      ) : trackers.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🌾</div>
          <p className="font-semibold text-bark text-sm mb-1">No crops tracked yet</p>
          <p className="text-agri-muted text-xs">Add a crop above with its planting date to start tracking harvest readiness.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {trackers.map(t => (
            <div key={t.id} className="card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0">
                  <HarvestOrb progress={t.progress_pct || 0} size={64} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-bark">{t.crop}</h4>
                  <p className="text-agri-muted text-xs">Planted: {t.planted_date}</p>
                  <p className="font-serif text-lg font-bold text-leaf mt-0.5">{t.progress_pct || 0}% grown</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-sand overflow-hidden mb-2">
                <div className="h-full bg-leaf rounded-full transition-all duration-700"
                  style={{ width: `${t.progress_pct || 0}%` }} />
              </div>
              <div className="flex justify-between text-xs text-agri-muted">
                <span>{t.days_elapsed || 0} days in</span>
                <span className={t.days_remaining === 0 ? 'text-gold font-bold' : ''}>
                  {t.days_remaining > 0 ? `${t.days_remaining} days to harvest` : '🌾 Ready to harvest!'}
                </span>
              </div>
              {t.harvest_due && <p className="text-xs text-agri-muted mt-1">Due: {t.harvest_due}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CropCalendarModule() {
  const { user } = useAuth()
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('cal_tab') || 'calendar' } catch { return 'calendar' }
  })

  const switchTab = (t) => {
    setTab(t)
    try { sessionStorage.setItem('cal_tab', t) } catch {}
  }
  const [form, setForm] = useState({ crop: '', district: user?.district || '', season: '', planting_date: '' })
  const [loading, setLoading] = useState(false)
  const [calendar, setCalendar] = useState(null)
  const [past, setPast] = useState([])
  const [pastLoaded, setPastLoaded] = useState(false)
  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  // Only load past calendars when on calendar tab and not yet loaded
  useEffect(() => {
    if (tab === 'calendar' && !pastLoaded) {
      calendarAPI.list().then(r => {
        setPast(r.data.calendars || [])
        setPastLoaded(true)
      }).catch(() => { setPastLoaded(true) })
    }
  }, [tab])

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!form.crop) { toast.error('Select a crop first'); return }
    setLoading(true)
    setCalendar(null)
    try {
      const r = await calendarAPI.generate(form)
      setCalendar(r.data)
      calendarAPI.list().then(pr => setPast(pr.data.calendars || [])).catch(() => {})
      toast.success('Calendar generated')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate calendar')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <div className="section-tag">Planning Tools</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Crop Growth Calendar</h1>
        <p className="text-agri-muted text-sm mt-1">Get a week-by-week farming plan and track your crops to harvest</p>
      </div>

      <div className="flex gap-2">
        {[{k:'calendar',l:'📅 Generate Calendar'},{k:'tracker',l:'🌾 Harvest Tracker'}].map(t => (
          <button key={t.k} onClick={() => switchTab(t.k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.k ? 'bg-bark text-gold-light' : 'bg-white border border-sand text-agri-muted hover:text-bark'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'calendar' && (
        <>
          <div className="card p-5">
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="label">Crop *</label>
                  <select className="input" value={form.crop} onChange={e => set('crop', e.target.value)}>
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
                  <label className="label">Season</label>
                  <select className="input" value={form.season} onChange={e => set('season', e.target.value)}>
                    <option value="">Any season</option>
                    {SEASONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Planting Date</label>
                  <input type="date" className="input" value={form.planting_date}
                    onChange={e => set('planting_date', e.target.value)} />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? <><span className="spinner" /> Generating calendar...</> : '📅 Generate My Calendar'}
              </button>
            </form>
          </div>

          {calendar && (
            <div className="space-y-4 animate-slide-up">
              <div className="card p-5 bg-gradient-to-r from-leaf/8 to-gold/5 border-leaf/20">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-bark">{calendar.crop} Growing Calendar</h2>
                    <p className="text-agri-muted text-sm mt-1">Total growing period: {calendar.total_days} days · Harvest by {calendar.harvest_date}</p>
                  </div>
                  <div className="text-3xl">📅</div>
                </div>
                {calendar.quick_tips?.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {calendar.quick_tips.map((tip, i) => (
                      <span key={i} className="text-xs bg-white/70 text-bark border border-sand rounded-lg px-2 py-1">{tip}</span>
                    ))}
                  </div>
                )}
                {calendar.best_market_window && (
                  <p className="text-xs text-gold font-medium mt-2">💰 Best selling window: {calendar.best_market_window}</p>
                )}
              </div>

              <div className="space-y-3">
                {(calendar.weeks || []).map((week, i) => (
                  <div key={i} className={`card p-4 border-l-4 ${Object.entries(PHASE_COLORS).find(([k]) => week.phase?.includes(k))?.[1] || 'border-sand'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-bark text-gold-light px-2 py-0.5 rounded">Week {week.week}</span>
                        <span className="font-semibold text-bark text-sm">{week.phase}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-agri-muted">
                        {week.water_needs && <span>{WATER_ICONS[week.water_needs]} {week.water_needs} water</span>}
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {(week.tasks || []).map((task, j) => (
                        <li key={j} className="flex gap-2 text-sm text-bark">
                          <span className="text-leaf mt-0.5">→</span>{task}
                        </li>
                      ))}
                    </ul>
                    {week.watch_for && <p className="text-xs text-amber-600 mt-2 italic">👁 Watch for: {week.watch_for}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && !calendar && (
            <div>
              <h3 className="font-semibold text-bark text-sm mb-2">Recent Calendars</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {past.map(c => (
                  <div key={c.id} className="card p-3 cursor-pointer hover:shadow-agri-lg transition-all"
                    onClick={() => setCalendar(c)}>
                    <p className="font-medium text-bark text-sm">{c.crop}</p>
                    <p className="text-xs text-agri-muted">{c.district} · {c.season || 'Any season'}</p>
                    <p className="text-xs text-agri-muted mt-1">{new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'tracker' && <HarvestTrackerPanel />}
    </div>
  )
}
