import { useState, useEffect } from 'react'
import { weatherAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

function getSprayAdvice(temp, humidity, windSpeed = 0) {
  if (humidity > 85) return { ok: false, msg: 'Too humid: fungal spray may spread disease further', icon: '🚫' }
  if (humidity < 30) return { ok: false, msg: 'Too dry: spray will evaporate before absorbing', icon: '🚫' }
  if (temp > 33) return { ok: false, msg: 'Too hot: spray evaporates fast. Try again after 5pm', icon: '⚠️' }
  if (temp < 15) return { ok: false, msg: 'Too cold: chemicals work poorly below 15°C', icon: '⚠️' }
  return { ok: true, msg: 'Good conditions for spraying now', icon: '✅' }
}

function getWeedAdvice(temp, humidity) {
  if (humidity > 80) return { ok: false, msg: 'Wait: wet soil makes weeding harder and spreads weed seeds', icon: '⚠️' }
  if (temp > 35) return { ok: false, msg: 'Too hot to weed comfortably. Try early morning before 8am', icon: '⚠️' }
  return { ok: true, msg: 'Good conditions for weeding today', icon: '✅' }
}

function getHarvestAdvice(humidity) {
  if (humidity > 80) return { ok: false, msg: 'Humid: harvested crops may mould quickly. Dry conditions preferred', icon: '⚠️' }
  return { ok: true, msg: 'Good conditions for harvesting and drying', icon: '✅' }
}

export default function AgriWeatherWidget() {
  const { user } = useAuth()
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const district = user?.district || 'Western Area Urban'

  useEffect(() => {
    weatherAPI.getCurrent(district)
      .then(res => setWeather(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [district])

  if (loading) return (
    <div className="card p-4 h-32 shimmer" />
  )

  if (!weather) return null

  const { temp, temperature, humidity } = weather
  const t = temp || temperature || 27
  const h = humidity || 70

  const spray   = getSprayAdvice(t, h)
  const weed    = getWeedAdvice(t, h)
  const harvest = getHarvestAdvice(h)

  const hour = new Date().getHours()
  const timeLabel = hour < 6 ? 'Early morning' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-sand">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base text-bark font-semibold">Farming Conditions Now</h3>
            <p className="text-agri-muted text-xs mt-0.5">{district} · {timeLabel} · {t}°C · {h}% humidity</p>
          </div>
          <div className="text-2xl">⛅</div>
        </div>
      </div>
      <div className="divide-y divide-sand/50">
        {[
          { label: 'Spray crops', advice: spray, icon: '💨' },
          { label: 'Weed fields', advice: weed, icon: '🌿' },
          { label: 'Harvest crops', advice: harvest, icon: '🌾' },
        ].map(({ label, advice, icon }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <span className="text-lg">{icon}</span>
            <div className="flex-1">
              <p className="text-bark text-xs font-semibold">{label}</p>
              <p className="text-agri-muted text-xs mt-0.5">{advice.msg}</p>
            </div>
            <span className="text-lg">{advice.icon}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
