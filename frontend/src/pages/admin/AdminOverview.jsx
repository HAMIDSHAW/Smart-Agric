import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts'
import { adminAPI } from '../../services/api'
import { useAsync, Card, StatCard, Skeleton, ErrorState, EmptyState } from '../../components/admin/ui'

const LEVEL = {
  critical: 'border-red-300 bg-red-50 text-red-900', warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
}

export default function AdminOverview() {
  const [days, setDays] = useState(30)
  const dash = useAsync(() => adminAPI.dashboard(days), [days])
  const notes = useAsync(() => adminAPI.notifications(), [])
  const d = dash.data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Overview</h1>
        <label className="text-sm flex items-center gap-2">Period
          <select className="rounded-lg border border-slate-300 bg-white px-2 py-1" value={days}
            onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      <Card title="Notification centre">
        {notes.loading ? <Skeleton className="h-12" /> : notes.error ? <ErrorState error={notes.error} onRetry={notes.reload} /> :
          (notes.data.notifications.length === 0
            ? <p className="text-sm text-slate-500">Nothing needs your attention.</p>
            : <ul className="space-y-2">{notes.data.notifications.map((n, i) => (
                <li key={i} className={`rounded-xl border p-3 text-sm ${LEVEL[n.level] || LEVEL.info}`}>
                  <p className="font-semibold">{n.title}</p>
                  <p>{n.detail} {n.link && <Link to={n.link.split('?')[0]} className="underline">Open</Link>}</p>
                </li>))}</ul>)}
      </Card>

      {dash.loading && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} />)}</div>}
      {dash.error && <ErrorState error={dash.error} onRetry={dash.reload} />}

      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total accounts" value={d.users.total} />
            <StatCard label="Active" value={d.users.active} tone="good" />
            <StatCard label="Suspended" value={d.users.suspended} tone={d.users.suspended ? 'warn' : 'default'} />
            <StatCard label="Awaiting verification" value={d.users.pending_verification} />
            <StatCard label={`New (${d.window_days}d)`} value={d.users.new_in_window} />
            <StatCard label={`Signed in (${d.window_days}d)`} value={d.users.active_in_window} />
            <StatCard label="AI requests" value={d.ai.requests}
              hint={d.ai.success_rate == null ? 'No AI calls recorded in this period' : `${d.ai.success_rate}% succeeded, ${d.ai.failed} failed`}
              tone={d.ai.success_rate != null && d.ai.success_rate < 80 ? 'warn' : 'default'} />
            <StatCard label="Disease analyses" value={d.analyses.disease} hint={`${d.analyses.soil} soil, ${d.analyses.crop_recommendations} crop recs`} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="New accounts per day">
              <div className="h-56" role="img" aria-label="Line chart of new accounts per day">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.registrations_by_day}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={28} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#047857" fill="#a7f3d0" name="New accounts" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Accounts by district">
              {d.districts.length === 0 ? <EmptyState title="No accounts yet" /> : (
                <div className="h-56" role="img" aria-label="Bar chart of accounts by district">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.districts.slice(0, 8)} layout="vertical" margin={{ left: 30 }}>
                      <XAxis type="number" allowDecimals={false} fontSize={11} />
                      <YAxis type="category" dataKey="district" fontSize={11} width={90} />
                      <Tooltip />
                      <Bar dataKey="users" fill="#059669" name="Accounts" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>)}
            </Card>
            <Card title="Accounts by role">
              <ul className="text-sm divide-y">
                {Object.entries(d.users.by_role).map(([role, n]) => (
                  <li key={role} className="flex justify-between py-1.5"><span>{role.replaceAll('_', ' ')}</span><strong>{n}</strong></li>))}
              </ul>
            </Card>
            <Card title="Most detected diseases">
              {d.analyses.top_diseases.length === 0 ? <EmptyState title="No disease analyses saved yet" /> : (
                <ul className="text-sm divide-y">{d.analyses.top_diseases.map((t) => (
                  <li key={t.disease} className="flex justify-between py-1.5"><span>{t.disease}</span><strong>{t.count}</strong></li>))}</ul>)}
            </Card>
            <Card title="Security (last 24 hours)">
              <p className="text-sm">Failed sign-ins: <strong>{d.security_last_24h.failed_logins}</strong></p>
              <p className="text-sm">Permission denials: <strong>{d.security_last_24h.access_denied}</strong></p>
            </Card>
            <Card title="Marketplace">
              {d.marketplace.available
                ? <p className="text-sm">Marketplace statistics are shown here.</p>
                : <p className="text-sm text-slate-600">The marketplace module is not live yet, so there are no listings, orders or sales to report. Figures will appear here once it is.</p>}
            </Card>
          </div>

          <p className="text-xs text-slate-500">{d.platform_note}</p>
        </>
      )}
    </div>
  )
}
