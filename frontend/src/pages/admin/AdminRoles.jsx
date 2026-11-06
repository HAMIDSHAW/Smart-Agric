import { adminAPI } from '../../services/api'
import { useAsync, Card, Badge, Skeleton, ErrorState } from '../../components/admin/ui'

export default function AdminRoles() {
  const { loading, data, error, reload } = useAsync(() => adminAPI.roles(), [])
  if (loading) return <Skeleton className="h-64" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const perms = Object.keys(data.permissions)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Roles and permissions</h1>
      <p className="text-sm text-slate-600 max-w-2xl">
        What each role can do. Role permissions are fixed in the server code for safety. A Super Admin can grant or deny
        individual permissions for one person in <strong>Users → Permissions</strong>. Every check is made on the server.
      </p>
      <Card>
        <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
            <caption className="sr-only">Permissions by role</caption>
            <thead><tr className="text-left border-b">
              <th scope="col" className="py-2 pr-4">Permission</th>
              {data.roles.map((r) => <th key={r.role} scope="col" className="px-2 text-center align-bottom">
                <span className="block text-xs font-semibold">{r.role.replaceAll('_', ' ')}</span>
                <span className="text-xs text-slate-500">{r.users} user(s)</span></th>)}
            </tr></thead>
            <tbody>
              {perms.map((p) => (
                <tr key={p} className="border-b last:border-0">
                  <th scope="row" className="py-2 pr-4 text-left font-normal"><span className="font-mono text-xs">{p}</span><br /><span className="text-xs text-slate-500">{data.permissions[p]}</span></th>
                  {data.roles.map((r) => (
                    <td key={r.role} className="text-center">
                      {r.permissions.includes(p) ? <span aria-label="Allowed" className="text-emerald-700">✓</span> : <span aria-label="Not allowed" className="text-slate-300">–</span>}
                    </td>))}
                </tr>))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Notes">
        <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
          <li><Badge color="purple">admin</Badge> is the older administrator role. It keeps the old abilities but cannot manage staff roles or delete accounts.</li>
          <li>Marketplace permissions apply once the marketplace module is live.</li>
          <li>Changing someone's role or permissions signs them out so the change applies immediately.</li>
        </ul>
      </Card>
    </div>
  )
}
