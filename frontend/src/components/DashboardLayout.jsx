import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { weatherAPI } from '../services/api'
import toast from 'react-hot-toast'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { path: '/dashboard', label: 'Home', icon: '⊞', exact: true },
    ]
  },
  {
    label: 'Diagnose',
    items: [
      { path: '/dashboard/disease',   label: 'Disease Detection', icon: '🔬' },
      { path: '/dashboard/soil',      label: 'Soil Analysis',     icon: '🟤' },
      { path: '/dashboard/progress',  label: 'Disease Progress',  icon: '📈' },
      { path: '/market',              label: 'Marketplace',       icon: '🛒' },
      { path: '/dashboard/pest',      label: 'Pest Alerts',       icon: '⚠️' },
    ]
  },
  {
    label: 'Plan',
    items: [
      { path: '/dashboard/recommend',   label: 'Crop Advice',       icon: '🌾' },
      { path: '/dashboard/fertilizer',  label: 'Fertilizer',        icon: '🧪' },
      { path: '/dashboard/calendar',    label: 'Crop Calendar',     icon: '📅' },
      { path: '/dashboard/compare',     label: 'Crop Compare',      icon: '⚖️' },
      { path: '/dashboard/land',        label: 'Land Suitability',  icon: '🗺️' },
    ]
  },
  {
    label: 'Insights',
    items: [
      { path: '/dashboard/field',        label: 'Field Intelligence', icon: '📡' },
      { path: '/dashboard/post-harvest', label: 'Post-Harvest',       icon: '📦' },
      { path: '/dashboard/chatbot',      label: 'AI Assistant',       icon: '💬' },
    ]
  },
  {
    label: 'Community',
    items: [
      { path: '/dashboard/map',         label: 'Disease Map',  icon: '📍' },
      { path: '/dashboard/impact',      label: 'Impact',       icon: '📊' },
      { path: '/dashboard/history',     label: 'My History',   icon: '📋' },
    ]
  },
]

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [weather, setWeather] = useState(null)

  useEffect(() => {
    const district = user?.district || 'Western Area Urban'
    weatherAPI.getCurrent(district)
      .then(res => setWeather(res.data))
      .catch(() => {})
  }, [user?.district])

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/')
  }

  const toggleLang = () => {
    const newLang = i18n.language === 'en' ? 'kr' : 'en'
    i18n.changeLanguage(newLang)
    localStorage.setItem('lang', newLang)
  }

  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'SA'

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-dark/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 w-52 flex flex-col
        bg-dark border-r border-white/10 transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-leaf to-primary-light flex items-center justify-center text-lg">🌿</div>
          <span className="font-heading text-white font-semibold text-base">SmartAgri</span>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="mb-1">
              {group.label && (
                <p className="text-white/25 text-xs px-4 pt-3 pb-1 uppercase tracking-widest font-bold">
                  {group.label}
                </p>
              )}
              {group.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `
                    flex items-center gap-2.5 px-4 py-2 text-xs transition-all rounded-lg mx-2 my-0.5
                    ${isActive
                      ? 'text-highlight bg-highlight/10 font-semibold'
                      : 'text-white/45 hover:text-white/80 hover:bg-white/5'
                    }
                  `}
                >
                  <span className="text-sm w-5 text-center flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-leaf flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white/80 text-xs font-medium truncate">{user?.full_name}</p>
              <p className="text-white/30 text-xs truncate">{user?.district || 'Sierra Leone'}</p>
            </div>
          </div>
          <button onClick={toggleLang}
            className="w-full text-left px-2 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors rounded">
            🌐 {i18n.language === 'en' ? 'Switch to Krio' : 'Switch to English'}
          </button>
          <NavLink to="/dashboard/profile"
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors rounded"
            onClick={() => setSidebarOpen(false)}>
            ⚙️ Profile & Settings
          </NavLink>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors rounded">
            ↩ Sign Out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-dark border-b border-white/10 flex items-center gap-3 px-4 h-12 flex-shrink-0">
          <button className="lg:hidden text-white/60 hover:text-white p-1 text-lg" onClick={() => setSidebarOpen(true)}>☰</button>

          {weather && (
            <div className="hidden sm:flex items-center gap-4 flex-1">
              <span className="text-white/40 text-xs">📍 {weather.location || user?.district}</span>
              <span className="text-white/60 text-xs">🌡️ <strong className="text-white/90">{weather.temperature}°C</strong></span>
              <span className="text-white/60 text-xs">💧 <strong className="text-white/90">{weather.humidity}%</strong></span>
            </div>
          )}

          <div className="flex-1" />

          <button onClick={toggleLang} className="text-white/40 text-xs hover:text-white/70 transition-colors hidden sm:block">
            {i18n.language === 'en' ? '🇸🇱 Krio' : '🇬🇧 English'}
          </button>

          <div className="flex items-center gap-2">
            <NavLink to="/dashboard/profile">
              <div className="w-7 h-7 rounded-full bg-leaf flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:opacity-80">
                {initials}
              </div>
            </NavLink>
            <span className="text-white/50 text-xs hidden sm:block truncate max-w-24">{user?.full_name}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-page/50">
          <div className="max-w-5xl mx-auto px-4 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
