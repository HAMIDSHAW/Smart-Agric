import { useState } from 'react'
import toast from 'react-hot-toast'
import { adminAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useAsync, errorMessage, Card, Badge, Skeleton, ErrorState, ConfirmDialog, fmtDate } from '../../components/admin/ui'

const HEALTH = {
  healthy: ['green', 'Healthy'], degraded: ['amber', 'Degraded'], failing: ['red', 'Failing'],
  untested: ['slate', 'Untested'], awaiting_credentials: ['amber', 'Needs credentials'],
  not_connected: ['slate', 'Not connected'], available: ['green', 'Available'],
}
const STATE = { live: 'Live', configured_unused: 'Preserved, not connected', local_engine: 'Local engine' }

export default function AdminAI() {
  const { hasPermission } = useAuth()
  const [days, setDays] = useState(7)
  const models = useAsync(() => adminAPI.aiModels(days), [days])
  const errors = useAsync(() => adminAPI.aiErrors(days), [days])
  const [probe, setProbe] = useState(null)       // model entry to check
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState({})

  const runProbe = async () => {
    setBusy(true)
    try {
      const { data } = await adminAPI.aiProbe(probe.id)
      setResults((r) => ({ ...r, [probe.id]: data }))
      toast[data.ok ? 'success' : 'error'](data.ok ? 'Model responded correctly' : data.message)
      models.reload(); errors.reload()
    } catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false); setProbe(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">AI models</h1>
        <label className="text-sm flex items-center gap-2">Period
          <select className="rounded-lg border border-slate-300 bg-white px-2 py-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>24 hours</option><option value={7}>7 days</option><option value={30}>30 days</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-slate-600 max-w-3xl">
        Every SmartAgri model and engine is listed here and none can be removed from this screen. "Untested" means credentials are set
        but no calls were recorded in this period; it does not mean the model works. Use "Run check" to send one real test request.
      </p>

      {models.loading && <Skeleton className="h-64" />}
      {models.error && <ErrorState error={models.error} onRetry={models.reload} />}
      {models.data && (
        <div className="space-y-3">
          {models.data.models.map((m) => {
            const [color, text] = HEALTH[m.health] || ['slate', m.health]
            const res = results[m.id]
            return (
              <Card key={m.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-all">{m.identifier}</p>
                    <p className="text-xs text-slate-500">{m.provider} · {m.capability} · {STATE[m.state]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={color}>{text}</Badge>
                    {m.state === 'live' && hasPermission('ai.manage') && (
                      <button type="button" className="px-3 py-1.5 rounded-lg border text-xs" onClick={() => setProbe(m)}>Run check</button>)}
                  </div>
                </div>
                {m.note && <p className="text-xs text-slate-500 mt-1">{m.note}</p>}
                {m.state === 'live' && (
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mt-3">
                    <div><dt className="text-slate-500 text-xs">Requests</dt><dd className="font-semibold">{m.stats.requests}</dd></div>
                    <div><dt className="text-slate-500 text-xs">Success rate</dt><dd className="font-semibold">{m.stats.success_rate == null ? '—' : `${m.stats.success_rate}%`}</dd></div>
                    <div><dt className="text-slate-500 text-xs">Avg response</dt><dd className="font-semibold">{m.stats.avg_latency_ms == null ? '—' : `${m.stats.avg_latency_ms} ms`}</dd></div>
                    <div><dt className="text-slate-500 text-xs">Last call</dt><dd className="font-semibold text-xs">{fmtDate(m.stats.last_call)}</dd></div>
                  </dl>)}
                <p className="text-xs text-slate-500 mt-2">Credential: {m.credential.replaceAll('_', ' ')}{m.routes?.length ? ` · Used by ${m.routes.join(', ')}` : ''}</p>
                {res && <p role="status" className={`text-sm mt-2 ${res.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {res.ok ? `Check passed in ${res.latency_ms} ms.` : `Check failed: ${res.message} (${res.error_kind})`}</p>}
              </Card>)
          })}
        </div>
      )}

      <Card title="Errors in this period">
        {errors.loading ? <Skeleton className="h-12" /> : errors.error ? <ErrorState error={errors.error} onRetry={errors.reload} /> :
          errors.data.errors.length === 0 ? <p className="text-sm text-slate-500">No AI errors recorded.</p> : (
            <table className="w-full text-sm"><caption className="sr-only">AI errors</caption>
              <thead><tr className="text-left text-slate-500"><th scope="col">Model</th><th scope="col">Error</th><th scope="col">Count</th></tr></thead>
              <tbody>{errors.data.errors.map((e, i) => <tr key={i}><td className="py-1 pr-2 break-all">{e.model}</td><td>{e.error_kind}</td><td>{e.count}</td></tr>)}</tbody>
            </table>)}
      </Card>

      <ConfirmDialog open={!!probe} title={`Run a live check on ${probe?.identifier}?`} busy={busy} confirmLabel="Run check"
        message="This sends one small real request to the provider. It uses a tiny amount of your quota. It does not change any configuration."
        onCancel={() => setProbe(null)} onConfirm={runProbe} />
    </div>
  )
}
