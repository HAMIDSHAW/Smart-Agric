import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { adminAPI } from '../services/api'

// Each link shows only if the signed-in staff member holds one of the permissions.
// This is a convenience: the server rejects anything not permitted, whatever the UI shows.
export const ADMIN_NAV = [
  { to: '/admin',          label: 'Overview',      icon: '📊', end: true, any: ['reports.view', 'users.view'] },
  { to: '/admin/users',    label: 'Users',         icon: '👥', any: ['users.view'] },
  { to: '/admin/roles',    label: 'Roles',         icon: '🛡️', any: ['users.view', 'roles.manage'] },
  { to: '/admin/marketplace', label: 'Marketplace', icon: '🛒', any: ['marketplace.manage', 'marketplace.verify_sellers'] },
  { to: '/admin/ai',       label: 'AI Models',     icon: '🤖', any: ['ai.view'] },
  { to: '/admin/system',   label: 'System',        icon: '🖥️', any: ['system.view'] },
  { to: '/admin/audit',    label: 'Audit Log',     icon: '📜', any: ['audit.view'] },
  { to: '/admin/reports',  label: 'Reports',       icon: '📥', any: ['reports.export'] },
  { to: '/admin/feedback', label: 'Feedback',      icon: '💬', any: ['feedback.view'] },
  { to: '/admin/profile',  label: 'My Account',    icon: '⚙️', any: [] },
]

const ROLE_LABEL = {
  super_admin: 'Super Admin', operations_admin: 'Operations Admin', marketplace_admin: 'Marketplace Admin',
  ai_admin: 'AI / Technical Admin', support_admin: 'Support Admin', admin: 'Administrator',
}

export default function AdminLayout() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState(0)

  useEffect(() => {
    adminAPI.notifications()
      .then((r) => setAlerts((r.data.notifications || []).filter((n) => n.level !== 'info').length))
      .catch(() => setAlerts(0))
  }, [])

  const links = ADMIN_NAV.filter((l) => l.any.length === 0 || l.any.some(hasPermission))
  const handleLogout = () => { logout(); toast.success('Logged out'); navigate('/') }
  const initials = user?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'AD'

  const nav = (
    <nav aria-label="Admin" className="flex-1 py-4 px-2 overflow-y-auto">
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm mb-1 transition-all ${
            isActive ? 'text-yellow-300 font-medium bg-amber-500/15' : 'text-white/60 hover:text-white'}`}>
          <span aria-hidden="true">{l.icon}</span> {l.label}
        </NavLink>
      ))}
      <Link to="/dashboard" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm mt-3 text-white/50 hover:text-white">
        <span aria-hidden="true">🌾</span> Farmer app
      </Link>
    </nav>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col flex-shrink-0" style={{ background: '#0F172A' }}>
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, #14532D, #2E7D32)' }}>🌿</div>
          <div>
            <div className="font-serif text-sm font-bold text-yellow-300">SmartAgri</div>
            <div className="text-xs text-white/40">Control centre</div>
          </div>
        </div>
        {nav}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold bg-amber-500">{initials}</div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate text-white/80">{user?.full_name}</p>
              <p className="text-xs text-white/40">{ROLE_LABEL[user?.role] || 'Staff'}</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:text-red-300">↩ Logout</button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-64 flex flex-col" style={{ background: '#0F172A' }}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <span className="font-serif font-bold text-yellow-300">SmartAgri Admin</span>
              <button type="button" aria-label="Close menu" className="text-white" onClick={() => setOpen(false)}>✕</button>
            </div>
            {nav}
            <button type="button" onClick={handleLogout} className="m-3 text-left text-sm text-red-400">↩ Logout</button>
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button type="button" aria-label="Open menu" className="md:hidden text-xl" onClick={() => setOpen(true)}>☰</button>
          <p className="font-semibold text-slate-800 hidden sm:block">Administration</p>
          <Link to="/admin" aria-label={`${alerts} notifications needing attention`} className="relative ml-auto text-xl">
            🔔{alerts > 0 && <span className="absolute -top-1 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">{alerts}</span>}
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 text-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
