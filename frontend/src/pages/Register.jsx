import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

// Hardcoded fallback so district dropdown always works even if API is slow or CORS blocks
const FALLBACK_DISTRICTS = [
  'Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene',
  'Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun',
  'Tonkolili','Western Area Rural','Western Area Urban'
]

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [districts, setDistricts] = useState(FALLBACK_DISTRICTS)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', password: '', confirm_password: '',
    district: '', preferred_language: 'en'
  })

  useEffect(() => {
    // Try to fetch from API. If it works, use the API list; if not, fallback is already set
    authAPI.getDistricts()
      .then(res => {
        if (res.data?.districts?.length) setDistricts(res.data.districts)
      })
      .catch(() => {
        // Fallback districts already in state, no action needed
      })
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) { toast.error('Please enter your full name'); return }
    if (!form.email.trim())     { toast.error('Please enter your email address'); return }
    if (!form.password)         { toast.error('Please create a password'); return }
    if (form.password !== form.confirm_password) { toast.error('Passwords do not match'); return }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }

    setLoading(true)
    try {
      const { confirm_password, ...data } = form
      await register(data)
      toast.success('Welcome to SmartAgri!')
      navigate('/dashboard')
    } catch (err) {
      // Show the exact error from the server if available
      const msg = err.response?.data?.error
        || err.response?.data?.message
        || err.message
        || 'Registration failed. Please check your details and try again.'
      toast.error(msg)
      console.error('Registration error:', err.response?.data || err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #14532D 50%, #0F172A 100%)' }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg, #14532D, #2E7D32)', boxShadow: '0 2px 8px rgba(20,83,45,0.3)' }}>🌿</div>
            <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#FFFFFF' }}>SmartAgri</span>
          </Link>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Precision agriculture for Sierra Leone</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-agri-lg">
          <h2 className="font-heading text-2xl text-bark font-bold mb-1">Create Your Account</h2>
          <p className="text-agri-muted text-sm mb-6">Join SmartAgri and get AI farming intelligence</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Your full name" value={form.full_name}
                onChange={e => set('full_name', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" placeholder="you@example.com"
                  value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" placeholder="+232 76 000 000"
                  value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">District</label>
                <select className="input" value={form.district} onChange={e => set('district', e.target.value)}>
                  <option value="">Select your district</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Language</label>
                <select className="input" value={form.preferred_language}
                  onChange={e => set('preferred_language', e.target.value)}>
                  <option value="en">English</option>
                  <option value="kr">Krio</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Password *</label>
                <input type="password" className="input" placeholder="Min. 6 characters"
                  value={form.password} onChange={e => set('password', e.target.value)} />
              </div>
              <div>
                <label className="label">Confirm Password *</label>
                <input type="password" className="input" placeholder="Repeat password"
                  value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)} />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full btn-primary justify-center py-3 text-base mt-2">
              {loading ? <><span className="spinner" /> Creating account...</> : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-agri-muted mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-leaf font-medium hover:text-leaf-light">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
