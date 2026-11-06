import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../services/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [newAdmin, setNewAdmin] = useState({ full_name: '', email: '', password: '', district: '' })
  const [creatingAdmin, setCreatingAdmin] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, usersRes] = await Promise.all([
        authAPI.getAdminStats(),
        authAPI.listUsers()
      ])
      setStats(statsRes.data)
      setUsers(usersRes.data.users)
    } catch (err) {
      toast.error('Could not load admin data')
    } finally {
      setLoading(false)
    }
  }

  const toggleUser = async (userId) => {
    try {
      await authAPI.toggleUser(userId)
      toast.success('User status updated')
      loadData()
    } catch {
      toast.error('Could not update user')
    }
  }

  const handleCreateAdmin = async (e) => {
    e.preventDefault()
    if (!newAdmin.full_name || !newAdmin.email || !newAdmin.password) {
      toast.error('Fill in all required fields')
      return
    }
    setCreatingAdmin(true)
    try {
      await authAPI.createAdmin(newAdmin)
      toast.success(`Admin account created for ${newAdmin.email}`)
      setNewAdmin({ full_name: '', email: '', password: '', district: '' })
      loadData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create admin')
    } finally {
      setCreatingAdmin(false)
    }
  }

  const DISTRICTS = ['Bo','Bombali','Bonthe','Falaba','Kailahun','Kambia','Karene','Kenema','Koinadugu','Kono','Moyamba','Port Loko','Pujehun','Tonkolili','Western Area Rural','Western Area Urban']

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="section-tag">Administration</div>
        <h1 className="font-serif text-2xl text-bark font-bold">Admin Dashboard</h1>
        <p className="text-agri-muted text-sm mt-1">Platform management, {user?.email}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-sand rounded-xl w-fit">
        {[['overview','📊 Overview'],['users','👥 Users'],['create-admin','➕ Add Admin']].map(([key,label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key ? 'bg-white text-bark shadow-sm' : 'text-agri-muted hover:text-bark'
            }`}>{label}</button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-slide-up">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="card p-4 h-24 shimmer" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Users', value: stats?.total_users || 0, icon: '👥', color: 'text-leaf' },
                  { label: 'Active Users', value: stats?.active_users || 0, icon: '✅', color: 'text-leaf' },
                  { label: 'Disease Analyses', value: stats?.disease_analyses || 0, icon: '🔬', color: 'text-gold' },
                  { label: 'Crop Plans', value: stats?.crop_recommendations || 0, icon: '🌾', color: 'text-soil' },
                  { label: 'Fertilizer Plans', value: stats?.fertilizer_plans || 0, icon: '🧪', color: 'text-sky' },
                  { label: 'Land Assessments', value: stats?.land_assessments || 0, icon: '🗺️', color: 'text-gold' },
                  { label: 'Soil Analyses', value: stats?.soil_analyses || 0, icon: '🟤', color: 'text-soil' },
                  { label: 'Chat Messages', value: stats?.chat_messages || 0, icon: '💬', color: 'text-leaf' },
                ].map(s => (
                  <div key={s.label} className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{s.icon}</span>
                    </div>
                    <div className={`font-serif text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <p className="text-agri-muted text-xs mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="card p-5 border-l-4 border-gold">
                <h3 className="font-semibold text-bark mb-3">Platform Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-agri-muted">Farmers Registered</span>
                    <span className="font-semibold text-bark">{stats?.farmers || 0}</span>
                  </div>
                  <div className="mt-3 p-3 rounded-lg bg-gold/5 border border-gold/15 text-xs text-bark">
                    ⚠️ Change the default admin password after your first login for security.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg text-bark font-semibold">
              All Users ({users.length})
            </h2>
            <button onClick={loadData} className="btn-ghost text-xs">↻ Refresh</button>
          </div>

          <div className="card">
            {loading ? (
              <div className="p-8 text-center text-agri-muted">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-agri-muted">No users yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-sand bg-sand-light">
                    <tr>
                      <th className="text-left p-3 text-xs text-agri-muted uppercase tracking-wide">Name</th>
                      <th className="text-left p-3 text-xs text-agri-muted uppercase tracking-wide">Email</th>
                      <th className="text-left p-3 text-xs text-agri-muted uppercase tracking-wide">District</th>
                      <th className="text-left p-3 text-xs text-agri-muted uppercase tracking-wide">Role</th>
                      <th className="text-left p-3 text-xs text-agri-muted uppercase tracking-wide">Joined</th>
                      <th className="text-left p-3 text-xs text-agri-muted uppercase tracking-wide">Status</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-sand/50 last:border-0 hover:bg-sand-light/30">
                        <td className="p-3 font-medium text-bark">{u.full_name}</td>
                        <td className="p-3 text-agri-muted text-xs font-mono">{u.email}</td>
                        <td className="p-3 text-agri-muted text-xs">{u.district || ', '}</td>
                        <td className="p-3">
                          <span className={`badge text-xs ${u.role === 'admin' ? 'badge-primary' : 'badge-info'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3 text-agri-muted text-xs">
                          {format(new Date(u.created_at), 'dd MMM yyyy')}
                        </td>
                        <td className="p-3">
                          <span className={`badge text-xs ${u.is_active !== false ? 'badge-healthy' : 'badge-diseased'}`}>
                            {u.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-3">
                          {u.role !== 'admin' && (
                            <button
                              onClick={() => toggleUser(u.id)}
                              className={`text-xs px-2 py-1 rounded border transition-all ${
                                u.is_active !== false
                                  ? 'border-red-200 text-red-600 hover:bg-red-50'
                                  : 'border-leaf/30 text-leaf hover:bg-leaf-pale'
                              }`}
                            >
                              {u.is_active !== false ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Admin Tab */}
      {activeTab === 'create-admin' && (
        <div className="animate-slide-up max-w-md">
          <h2 className="font-serif text-lg text-bark font-semibold mb-4">Create Admin Account</h2>
          <p className="text-agri-muted text-sm mb-5">
            Only administrators can create other admin accounts. Admin accounts have full platform access.
          </p>
          <form onSubmit={handleCreateAdmin} className="card p-5 space-y-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Administrator Name"
                value={newAdmin.full_name} onChange={e => setNewAdmin({...newAdmin, full_name: e.target.value})} />
            </div>
            <div>
              <label className="label">Email Address *</label>
              <input type="email" className="input" placeholder="admin@example.com"
                value={newAdmin.email} onChange={e => setNewAdmin({...newAdmin, email: e.target.value})} />
            </div>
            <div>
              <label className="label">District</label>
              <select className="input" value={newAdmin.district}
                onChange={e => setNewAdmin({...newAdmin, district: e.target.value})}>
                <option value="">Select district</option>
                {DISTRICTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Password *</label>
              <input type="password" className="input" placeholder="Min. 6 characters"
                value={newAdmin.password} onChange={e => setNewAdmin({...newAdmin, password: e.target.value})} />
            </div>
            <button type="submit" disabled={creatingAdmin} className="btn-primary w-full justify-center py-3">
              {creatingAdmin ? <><span className="spinner" /> Creating...</> : '➕ Create Admin Account'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
