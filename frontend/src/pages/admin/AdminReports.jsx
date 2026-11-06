import { useState } from 'react'
import toast from 'react-hot-toast'
import { adminAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { errorMessage, Card, downloadBlob } from '../../components/admin/ui'

const REPORTS = [
  { name: 'registrations', title: 'User registrations', text: 'New accounts per day by role and district.' },
  { name: 'districts', title: 'District adoption', text: 'Accounts and active accounts by district.' },
  { name: 'ai_usage', title: 'AI usage and performance', text: 'Requests, failures and response time per model per day.' },
  { name: 'disease_trends', title: 'Disease analysis trends', text: 'What the models detected, by crop, with average model confidence.' },
  { name: 'crop_recommendations', title: 'Crop recommendation requests', text: 'Recommendation requests by district.' },
  { name: 'users', title: 'User list', text: 'All accounts with role, status and verification. Contains personal data: handle with care.', needs: 'users.view' },
  { name: 'audit', title: 'Audit log', text: 'Sensitive actions and security events.', needs: 'audit.view' },
]

export default function AdminReports() {
  const { hasPermission } = useAuth()
  const [days, setDays] = useState(90)
  const [busy, setBusy] = useState(null)
  const get = async (r) => {
    setBusy(r.name)
    try { await downloadBlob(adminAPI.report(r.name, days), `${r.name}.csv`); toast.success('Report downloaded') }
    catch (err) { toast.error(errorMessage(err, 'Could not create the report')) }
    finally { setBusy(null) }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Reports</h1>
        <label className="text-sm flex items-center gap-2">Period
          <select className="rounded-lg border border-slate-300 bg-white px-2 py-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
      </div>
      <p className="text-sm text-slate-600 max-w-2xl">These reports describe <strong>platform activity</strong>. They do not measure real-world agricultural impact such as yield gains or crop-loss reduction, which would need independent field evidence.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {REPORTS.filter((r) => !r.needs || hasPermission(r.needs)).map((r) => (
          <Card key={r.name} title={r.title}>
            <p className="text-sm text-slate-600 mb-3">{r.text}</p>
            <button type="button" className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm disabled:opacity-50" disabled={busy === r.name}
              onClick={() => get(r)}>{busy === r.name ? 'Preparing…' : 'Download CSV'}</button>
          </Card>))}
      </div>
    </div>
  )
}
