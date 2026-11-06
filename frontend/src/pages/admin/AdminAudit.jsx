import { useState } from 'react'
import toast from 'react-hot-toast'
import { adminAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useAsync, errorMessage, Card, Badge, Skeleton, ErrorState, EmptyState, Pagination, Field, inputCls, fmtDate, downloadBlob } from '../../components/admin/ui'

const OUTCOME = { success: 'green', failure: 'red', denied: 'amber' }

export default function AdminAudit() {
  const { hasPermission } = useAuth()
  const [f, setF] = useState({ category: '', outcome: '', actor: '', action: '' })
  const [page, setPage] = useState(1)
  const params = { page, per_page: 25, days: 90, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }
  const list = useAsync(() => adminAPI.audit(params), [JSON.stringify(params)])
  const set = (k) => (e) => { setPage(1); setF((s) => ({ ...s, [k]: e.target.value })) }
  const events = list.data?.events || []

  const exportCsv = async () => {
    try { await downloadBlob(adminAPI.report('audit', 90), 'audit.csv') } catch (err) { toast.error(errorMessage(err)) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Audit log</h1>
        {hasPermission('reports.export') && <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={exportCsv}>Download CSV</button>}
      </div>
      <p className="text-sm text-slate-600">An append-only record of sensitive actions and security events. Entries cannot be edited or deleted from SmartAgri. Passwords and tokens are never recorded.</p>
      <Card>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Category" id="a-cat"><select id="a-cat" className={inputCls} value={f.category} onChange={set('category')}>
            <option value="">All</option><option value="admin">Admin actions</option><option value="security">Security</option><option value="auth">Sign-in</option></select></Field>
          <Field label="Outcome" id="a-out"><select id="a-out" className={inputCls} value={f.outcome} onChange={set('outcome')}>
            <option value="">All</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option></select></Field>
          <Field label="Action (exact)" id="a-act"><input id="a-act" className={inputCls} value={f.action} placeholder="e.g. login_failed" onChange={set('action')} /></Field>
          <Field label="Actor email contains" id="a-actor"><input id="a-actor" className={inputCls} value={f.actor} onChange={set('actor')} /></Field>
        </div>
      </Card>
      {list.loading && <Skeleton className="h-64" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && events.length === 0 && <EmptyState title="No events match" />}
      {events.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><caption className="sr-only">Audit events</caption>
              <thead><tr className="text-left text-slate-500 border-b"><th scope="col" className="py-2 pr-3">When</th><th scope="col" className="pr-3">Action</th>
                <th scope="col" className="pr-3">Actor</th><th scope="col" className="pr-3 hidden md:table-cell">Target</th><th scope="col">Outcome</th></tr></thead>
              <tbody>{events.map((e) => (
                <tr key={e.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtDate(e.created_at)}</td>
                  <td className="pr-3"><span className="font-medium">{e.action.replaceAll('_', ' ')}</span>
                    {e.details && <details><summary className="text-xs text-slate-500 cursor-pointer">Details</summary><pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(e.details)}</pre></details>}</td>
                  <td className="pr-3 text-xs break-all">{e.actor_email || 'system'}{e.actor_role ? ` (${e.actor_role})` : ''}</td>
                  <td className="pr-3 hidden md:table-cell text-xs">{e.target_type ? `${e.target_type} #${e.target_id}` : '—'}</td>
                  <td><Badge color={OUTCOME[e.outcome] || 'slate'}>{e.outcome}</Badge></td>
                </tr>))}</tbody>
            </table>
          </div>
          <Pagination page={page} pages={list.data.pages} onPage={setPage} />
        </Card>)}
    </div>
  )
}
