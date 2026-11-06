import { adminAPI } from '../../services/api'
import { useAsync, Card, Badge, StatCard, Skeleton, ErrorState } from '../../components/admin/ui'

export default function AdminSystem() {
  const { loading, data: d, error, reload } = useAsync(() => adminAPI.systemHealth(), [])
  if (loading) return <Skeleton className="h-64" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">System</h1>
        <button type="button" className="px-3 py-1.5 rounded-lg border text-sm" onClick={reload}>Refresh</button></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="API" value={d.api.status === 'ok' ? 'Running' : 'Problem'} tone="good" />
        <StatCard label="Database" value={d.database.status === 'ok' ? 'Connected' : 'Error'} tone={d.database.status === 'ok' ? 'good' : 'bad'} hint={`${d.database.latency_ms} ms`} />
        <StatCard label="AI failures (24h)" value={d.errors_last_24h.ai_failures} tone={d.errors_last_24h.ai_failures ? 'warn' : 'default'} />
        <StatCard label="Security events (24h)" value={d.errors_last_24h.security_events} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Storage">
          <p className="text-sm">{d.storage.uploads_files} stored photo(s), {d.storage.uploads_mb} MB</p>
          {d.storage.disk && <p className="text-sm">Disk: {d.storage.disk.free_gb} GB free of {d.storage.disk.total_gb} GB</p>}
          <p className="text-xs text-slate-500 mt-2">Retention: {d.storage.retention_days} days. {d.storage.retention_job}.</p>
        </Card>
        <Card title="Backups">
          <Badge color="amber">Status unknown</Badge>
          <p className="text-sm text-slate-600 mt-2">{d.backups.note}</p>
        </Card>
        <Card title="Credentials (presence only, values are never shown)">
          <ul className="text-sm divide-y">{Object.entries(d.credentials).map(([k, v]) => (
            <li key={k} className="flex justify-between py-1.5"><span className="font-mono text-xs">{k}</span><Badge color={v === 'configured' ? 'green' : 'amber'}>{v}</Badge></li>))}</ul>
        </Card>
        <Card title="Application settings (read-only)">
          <ul className="text-sm divide-y">
            <li className="flex justify-between py-1.5"><span>Environment</span><strong>{d.settings.environment}</strong></li>
            <li className="flex justify-between py-1.5"><span>Demo data seeding</span><strong>{d.settings.demo_seed_enabled ? 'On' : 'Off'}</strong></li>
            <li className="flex justify-between py-1.5"><span>Role account seeding</span><strong>{d.settings.role_seed_enabled ? 'On (turn off when finished)' : 'Off'}</strong></li>
            <li className="flex justify-between py-1.5"><span>Database certificate check</span><strong>{d.settings.db_ssl_verify ? 'On' : 'Off'}</strong></li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
