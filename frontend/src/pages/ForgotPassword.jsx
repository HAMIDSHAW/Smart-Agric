import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) { toast.error('Enter your email address'); return }
    setLoading(true)
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase())
      setSent(true)
      toast.success('Reset instructions sent')
    } catch (err) {
      // Even if the email doesn't exist, show success (security best practice)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #14532D 50%, #0F172A 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg, #14532D, #2E7D32)', boxShadow: '0 2px 8px rgba(20,83,45,0.3)' }}>🌿</div>
            <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#FFFFFF' }}>SmartAgri</span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-agri-lg">
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📧</div>
              <h2 className="font-heading text-xl text-bark font-bold mb-2">Check your email</h2>
              <p className="text-agri-muted text-sm leading-relaxed mb-6">
                If an account exists for <strong>{email}</strong>, we have sent password reset instructions.
                Check your inbox and spam folder.
              </p>
              <Link to="/login" className="btn-primary justify-center w-full">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-heading text-2xl text-bark font-bold mb-1">Reset Password</h2>
              <p className="text-agri-muted text-sm mb-6">
                Enter the email address on your SmartAgri account and we will send reset instructions.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                  {loading ? <><span className="spinner" /> Sending...</> : 'Send Reset Instructions'}
                </button>
              </form>
              <p className="text-center text-sm text-agri-muted mt-5">
                Remember your password?{' '}
                <Link to="/login" className="text-leaf font-medium hover:text-leaf-light">Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
