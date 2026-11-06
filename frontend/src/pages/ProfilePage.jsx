import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']
const ROLES = { farmer: '👨‍🌾 Farmer', extension_officer: '🧑‍💼 Extension Officer', admin: '⚙️ Administrator' }

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const { t, i18n } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    district: user?.district || '',
    preferred_language: user?.preferred_language || 'en',
  })
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })

  const setP = (k, v) => setProfile(f => ({ ...f, [k]: v }))
  const setPw = (k, v) => setPasswords(f => ({ ...f, [k]: v }))

  const saveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await authAPI.updateProfile(profile)
      updateUser(res.data.user)
      if (profile.preferred_language !== i18n.language) {
        i18n.changeLanguage(profile.preferred_language)
        localStorage.setItem('lang', profile.preferred_language)
      }
      toast.success('Profile updated successfully')
    } catch {
      toast.error('Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm) {
      toast.error('New passwords do not match')
      return
    }
    const minLen = user?.is_staff ? 12 : 8
    if (passwords.new_password.length < minLen) {
      toast.error(`New password must be at least ${minLen} characters`)
      return
    }
    setChangingPw(true)
    try {
      const res = await authAPI.changePassword({ current_password: passwords.current_password, new_password: passwords.new_password })
      // The server signs out every other session and issues fresh tokens for this one.
      if (res.data?.access_token) localStorage.setItem('access_token', res.data.access_token)
      if (res.data?.refresh_token) localStorage.setItem('refresh_token', res.data.refresh_token)
      toast.success('Password changed successfully')
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change password')
    } finally {
      setChangingPw(false)
    }
  }

  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'MH'

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <div className="section-tag">Account</div>
        <h1 className="font-serif text-2xl text-bark font-bold">My Profile</h1>
        <p className="text-agri-muted text-sm mt-1">Manage your account details and preferences</p>
      </div>

      {/* Avatar block */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-leaf to-soil flex items-center justify-center text-white text-2xl font-bold font-serif flex-shrink-0">
          {initials}
        </div>
        <div>
          <h2 className="font-serif text-xl font-bold text-bark">{user?.full_name}</h2>
          <p className="text-agri-muted text-sm">{user?.email}</p>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            <span className="badge badge-primary">{ROLES[user?.role] || user?.role}</span>
            {user?.district && <span className="badge badge-info">📍 {user.district}</span>}
          </div>
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={saveProfile} className="card p-5 space-y-4">
        <h3 className="font-semibold text-bark">Personal Details</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={profile.full_name}
              onChange={e => setP('full_name', e.target.value)} />
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input className="input" placeholder="+232 76 000 000"
              value={profile.phone} onChange={e => setP('phone', e.target.value)} />
          </div>
          <div>
            <label className="label">District</label>
            <select className="input" value={profile.district} onChange={e => setP('district', e.target.value)}>
              <option value="">Select district</option>
              {DISTRICTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Preferred Language</label>
            <select className="input" value={profile.preferred_language}
              onChange={e => setP('preferred_language', e.target.value)}>
              <option value="en">🇬🇧 English</option>
              <option value="kr">🇸🇱 Krio</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Email Address</label>
          <input className="input bg-sand-light cursor-not-allowed" value={user?.email} disabled />
          <p className="text-xs text-agri-muted mt-1">Email cannot be changed</p>
        </div>

        <div>
          <label className="label">Account Role</label>
          <input className="input bg-sand-light cursor-not-allowed"
            value={ROLES[user?.role] || user?.role} disabled />
          <p className="text-xs text-agri-muted mt-1">Contact an administrator to change your role</p>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <><span className="spinner" /> Saving...</> : '💾 Save Changes'}
        </button>
      </form>

      {/* Change password */}
      <form onSubmit={changePassword} className="card p-5 space-y-4">
        <h3 className="font-semibold text-bark">Change Password</h3>

        <div>
          <label className="label">Current Password</label>
          <input type="password" className="input" placeholder="Your current password"
            value={passwords.current_password} onChange={e => setPw('current_password', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" placeholder="Min. 6 characters"
              value={passwords.new_password} onChange={e => setPw('new_password', e.target.value)} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" placeholder="Repeat new password"
              value={passwords.confirm} onChange={e => setPw('confirm', e.target.value)} />
          </div>
        </div>

        <button type="submit" disabled={changingPw} className="btn-secondary">
          {changingPw ? <><span className="spinner-dark" style={{ width: 14, height: 14 }} /> Changing...</> : '🔒 Change Password'}
        </button>
      </form>

      {/* Account info */}
      <div className="card p-5">
        <h3 className="font-semibold text-bark mb-3">Account Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-agri-muted">Member since</span>
            <span className="text-bark font-medium">{user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ', '}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-agri-muted">Last login</span>
            <span className="text-bark font-medium">{user?.last_login ? new Date(user.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'First login'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-agri-muted">Platform</span>
            <span className="text-bark font-medium">SmartAgri Sierra Leone</span>
          </div>
        </div>
      </div>
    </div>
  )
}
