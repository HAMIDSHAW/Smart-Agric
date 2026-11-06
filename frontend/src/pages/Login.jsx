import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      toast.error('Please fill in all fields')
      return
    }
    setLoading(true)
    try {
      const loggedIn = await login(form)
      toast.success('Welcome back!')
      navigate(location.state?.from || (loggedIn?.is_staff ? '/admin' : '/dashboard'))
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Please check your credentials.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #14532D 50%, #0F172A 100%)' }}>
      {/* Left, branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '48px 48px' }}
        />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 60% at 30% 40%, rgba(76,175,80,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 50% at 80% 75%, rgba(245,158,11,0.1) 0%, transparent 60%)' }} />

        <Link to="/" className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg, #14532D, #2E7D32)', boxShadow: '0 2px 8px rgba(20,83,45,0.3)' }}>🌿</div>
          <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#FFFFFF' }}>SmartAgri</span>
        </Link>

        <div className="relative z-10">
          <h1 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: '2.5rem', lineHeight: 1.15, color: '#FFFFFF', marginBottom: '1rem' }}>
            Precision Farming<br/>
            <span style={{ color: '#F59E0B' }}>for Every</span><br/>
            <span style={{ color: '#4CAF50' }}>Sierra Leone</span> Field
          </h1>
          <p className="text-base leading-relaxed mb-8 max-w-sm" style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter, sans-serif' }}>
            AI-powered disease detection, crop recommendations, and fertilizer guidance, built for West African smallholder farmers.
          </p>

          {/* Stats: the real stakes */}
          <div className="flex gap-6">
            {[
              { n: '63%', l: 'Depend on farming' },
              { n: '77%', l: 'Faced food insecurity, 2024' },
              { n: '15%', l: 'Of fertile land farmed' },
            ].map(s => (
              <div key={s.l}>
                <div style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 800, fontSize: '1.6rem', color: '#F59E0B' }}>{s.n}</div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: 2, maxWidth: 100 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-white/20 text-xs">Aligned with Njala University · Feed Salone Initiative</p>
        </div>
      </div>

      {/* Right, form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #14532D, #2E7D32)' }}>🌿</div>
            <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#FFFFFF' }}>SmartAgri</span>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-agri-lg">
            <h2 className="font-heading text-2xl text-bark font-bold mb-1">Sign In</h2>
            <p className="text-agri-muted text-sm mb-6">Welcome back to your farming dashboard</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">{t('auth.email')}</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="label">{t('auth.password')}</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="Your password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-agri-muted text-xs"
                    onClick={() => setShowPass(!showPass)}
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary justify-center py-3 text-base"
              >
                {loading ? <><span className="spinner" /> Signing in...</> : t('auth.loginBtn')}
              </button>
            </form>

            {/* Forgot password */}
            <div className="flex items-center justify-between mt-2 mb-4">
              <Link to="/forgot-password" className="text-xs text-leaf hover:text-leaf-light">
                Forgot password?
              </Link>
            </div>

            <p className="text-center text-sm text-agri-muted mt-4">
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="text-leaf font-medium hover:text-leaf-light">
                Create Account
              </Link>
            </p>
          </div>

          {/* Download App button */}
          <div className="text-center mt-5">
            <button
              onClick={() => { const m = document.getElementById('app-msg'); if(m) m.classList.toggle('hidden') }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}>
              📱 Download App (Coming Soon)
            </button>
            <div id="app-msg" className="hidden mt-3 p-3 rounded-xl text-xs leading-relaxed"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}>
              <p className="font-semibold mb-1">SmartAgri Mobile App (Coming Q3 2026)</p>
              <p className="opacity-75">The platform works great on your phone browser right now at smartagricsl.netlify.app, just open it and tap "Add to Home Screen" to use it like an app today.</p>
            </div>
          </div>

          <div className="text-center mt-4">
            <p className="text-white/30 text-xs mb-2">Want to try before signing in?</p>
            <Link to="/scan"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-all"
              style={{ background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', color: '#4CAF50' }}>
              📸 Try Free Disease Scan (No Account Needed)
            </Link>
          </div>
          <p className="text-center text-white/20 text-xs mt-4">
            SmartAgri · Built by Mohamed Hamidu Shaw · Kenema, Sierra Leone
          </p>
        </div>
      </div>
    </div>
  )
}
