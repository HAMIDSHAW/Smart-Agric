import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { adminAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import {
  useAsync, errorMessage, Card, Badge, Skeleton, ErrorState, EmptyState, Pagination, ConfirmDialog, Field,
  inputCls, fmtDate,
} from '../../components/admin/ui'

const CUSTOMER_ROLES = ['farmer', 'extension_officer', 'buyer', 'seller']
const STAFF_ROLES = ['super_admin', 'operations_admin', 'marketplace_admin', 'ai_admin', 'support_admin']
const VERIFY = ['unverified', 'pending', 'verified', 'rejected']
const label = (r) => String(r || '').replaceAll('_', ' ')
const verifyColor = { verified: 'green', pending: 'amber', rejected: 'red', unverified: 'slate' }

function UserDrawer({ id, onClose, onChanged }) {
  const { user: me, hasPermission } = useAuth()
  const detail = useAsync(() => adminAPI.user(id), [id])
  const roles = useAsync(() => adminAPI.roles().catch(() => ({ data: { permissions: {} } })), [])
  const [action, setAction] = useState(null)   // { type }
  const [value, setValue] = useState('')
  const [overrides, setOverrides] = useState({})
  const [busy, setBusy] = useState(false)
  const u = detail.data?.user

  useEffect(() => {
    if (u) setOverrides(Object.fromEntries((u.permission_overrides || []).map((o) => [o.permission, o.granted ? 'grant' : 'deny'])))
  }, [u])

  const close = () => { setAction(null); setValue('') }
  const isSelf = u && me && u.id === me.id
  const staffTarget = u?.is_staff
  const canManage = hasPermission('users.manage') && !isSelf && (!staffTarget || hasPermission('roles.manage'))
  const canRole = (hasPermission('roles.assign') || hasPermission('roles.manage')) && !isSelf &&
    (!staffTarget || hasPermission('roles.manage'))
  const roleOptions = hasPermission('roles.manage') ? [...CUSTOMER_ROLES, ...STAFF_ROLES] : CUSTOMER_ROLES
  const minPw = staffTarget ? 12 : 8

  const run = async (fn, ok) => {
    setBusy(true)
    try { await fn(); toast.success(ok); close(); detail.reload(); onChanged() }
    catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(false) }
  }

  const savePermissions = () => {
    const current = Object.fromEntries((u.permission_overrides || []).map((o) => [o.permission, o.granted ? 'grant' : 'deny']))
    const body = { grant: [], deny: [], clear: [] }
    Object.keys({ ...current, ...overrides }).forEach((p) => {
      const v = overrides[p] || 'default'
      if (v === 'grant') body.grant.push(p)
      else if (v === 'deny') body.deny.push(p)
      else if (current[p]) body.clear.push(p)
    })
    return run(() => adminAPI.setPermissions(u.id, body), 'Permissions updated')
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40">
      <aside role="dialog" aria-modal="true" aria-label="User details" className="w-full max-w-lg bg-white h-full overflow-y-auto p-5 space-y-4">
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-bold">User details</h2>
          <button type="button" aria-label="Close details" className="text-xl" onClick={onClose}>✕</button>
        </div>
        {detail.loading && <Skeleton className="h-40" />}
        {detail.error && <ErrorState error={detail.error} onRetry={detail.reload} />}
        {u && (
          <>
            <div>
              <p className="font-semibold text-lg">{u.full_name}</p>
              <p className="text-sm text-slate-600">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge color={u.is_staff ? 'purple' : 'blue'}>{label(u.role)}</Badge>
                <Badge color={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Suspended'}</Badge>
                <Badge color={verifyColor[u.verification_status]}>{u.verification_status}</Badge>
              </div>
              {!u.is_active && u.suspended_reason && <p className="text-sm text-red-700 mt-2">Reason: {u.suspended_reason}</p>}
              <p className="text-xs text-slate-500 mt-2">District: {u.district || '—'} · Joined {fmtDate(u.created_at)} · Last sign-in {fmtDate(u.last_login)}</p>
            </div>

            <div className="flex flex-wrap gap-2" aria-label="Actions">
              {canManage && (u.is_active
                ? <button type="button" className="px-3 py-2 rounded-lg border border-red-300 text-red-700 text-sm" onClick={() => setAction({ type: 'suspend' })}>Suspend</button>
                : <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={() => setAction({ type: 'restore' })}>Restore</button>)}
              {canManage && <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={() => { setValue(u.verification_status); setAction({ type: 'verify' }) }}>Verification</button>}
              {canRole && <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={() => { setValue(u.role); setAction({ type: 'role' }) }}>Change role</button>}
              {hasPermission('users.reset_password') && !isSelf && (!staffTarget || hasPermission('roles.manage')) &&
                <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={() => setAction({ type: 'reset' })}>Reset password</button>}
              {hasPermission('roles.manage') && !isSelf && u.role !== 'super_admin' &&
                <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={() => setAction({ type: 'perms' })}>Permissions</button>}
              {hasPermission('users.delete') && !staffTarget && !isSelf &&
                <button type="button" className="px-3 py-2 rounded-lg bg-red-700 text-white text-sm" onClick={() => setAction({ type: 'delete' })}>Delete…</button>}
            </div>

            <Card title="Platform activity">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(u.activity).map(([k, v]) => <div key={k}><dt className="text-slate-500">{label(k)}</dt><dd className="font-semibold">{v}</dd></div>)}
              </dl>
            </Card>
            <Card title="Effective permissions">
              {u.permissions.length === 0 ? <p className="text-sm text-slate-500">None (customer account).</p>
                : <div className="flex flex-wrap gap-1">{u.permissions.map((p) => <Badge key={p}>{p}</Badge>)}</div>}
            </Card>
            <Card title="Recent history">
              {u.recent_events.length === 0 ? <p className="text-sm text-slate-500">No recorded events.</p> : (
                <ul className="text-sm divide-y">{u.recent_events.map((e) => (
                  <li key={e.id} className="py-1.5"><strong>{label(e.action)}</strong> <span className="text-slate-500">{fmtDate(e.created_at)} · {e.outcome}</span></li>))}</ul>)}
            </Card>
          </>
        )}
      </aside>

      <ConfirmDialog open={action?.type === 'suspend'} title="Suspend this account?" danger busy={busy}
        message="They will be signed out everywhere and cannot sign in until restored." confirmLabel="Suspend"
        confirmDisabled={!value.trim()} onCancel={close} onConfirm={() => run(() => adminAPI.suspend(u.id, value.trim()), 'Account suspended')}>
        <Field label="Reason (recorded in the audit log)" id="suspend-reason">
          <input id="suspend-reason" className={inputCls} value={value} maxLength={255} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={action?.type === 'restore'} title="Restore this account?" busy={busy} confirmLabel="Restore"
        onCancel={close} onConfirm={() => run(() => adminAPI.restore(u.id), 'Account restored')} />
      <ConfirmDialog open={action?.type === 'verify'} title="Change verification status" busy={busy} confirmLabel="Save"
        onCancel={close} onConfirm={() => run(() => adminAPI.verify(u.id, value), 'Verification updated')}>
        <Field label="Status" id="verify-status">
          <select id="verify-status" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)}>
            {VERIFY.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <p className="text-xs text-slate-500">Only mark "verified" after you have actually checked the person or business.</p>
      </ConfirmDialog>
      <ConfirmDialog open={action?.type === 'role'} title="Change role" busy={busy} confirmLabel="Change role"
        message="Their current sessions will end and they must sign in again."
        onCancel={close} onConfirm={() => run(() => adminAPI.setRole(u.id, value), 'Role changed')}>
        <Field label="New role" id="new-role">
          <select id="new-role" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)}>
            {roleOptions.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={action?.type === 'reset'} title="Reset password" danger busy={busy} confirmLabel="Reset password"
        confirmDisabled={value.length < minPw}
        message="Only do this after confirming the person's identity. They will be signed out everywhere."
        onCancel={close} onConfirm={() => run(() => adminAPI.resetPassword(u.id, value), 'Password reset')}>
        <Field label={`New password (at least ${minPw} characters)`} id="reset-pw">
          <input id="reset-pw" type="password" autoComplete="new-password" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={action?.type === 'delete'} title="Permanently delete this user?" danger busy={busy} confirmLabel="Delete forever"
        confirmDisabled={value !== u?.email}
        message="This removes the account and ALL of their analyses and history. It cannot be undone. Consider suspending instead."
        onCancel={close} onConfirm={() => run(async () => { await adminAPI.deleteUser(u.id); onClose() }, 'User deleted')}>
        <Field label={`Type ${u?.email} to confirm`} id="del-confirm">
          <input id="del-confirm" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={action?.type === 'perms'} title="Per-user permissions" busy={busy} confirmLabel="Save permissions"
        message="Adjust what this person can do beyond their role. Changes sign them out."
        onCancel={close} onConfirm={savePermissions}>
        <div className="max-h-64 overflow-y-auto space-y-2">
          {Object.entries(roles.data?.permissions || {}).map(([p, desc]) => (
            <div key={p} className="flex items-center justify-between gap-2 text-sm">
              <label htmlFor={`perm-${p}`} className="flex-1"><span className="font-mono text-xs">{p}</span><br /><span className="text-slate-500 text-xs">{desc}</span></label>
              <select id={`perm-${p}`} className="rounded border px-1 py-1 text-xs" value={overrides[p] || 'default'}
                onChange={(e) => setOverrides((o) => ({ ...o, [p]: e.target.value }))}>
                <option value="default">Role default</option><option value="grant">Grant</option><option value="deny">Deny</option>
              </select>
            </div>))}
        </div>
      </ConfirmDialog>
    </div>
  )
}

function CreateUserDialog({ open, onClose, onCreated }) {
  const { hasPermission } = useAuth()
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'farmer', district: '' })
  const [busy, setBusy] = useState(false)
  const roleOptions = hasPermission('roles.manage') ? [...CUSTOMER_ROLES, ...STAFF_ROLES] : CUSTOMER_ROLES
  const staff = STAFF_ROLES.includes(f.role)
  const minPw = staff ? 12 : 8
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async () => {
    setBusy(true)
    try { await adminAPI.createUser(f); toast.success('Account created'); onCreated(); onClose()
      setF({ full_name: '', email: '', password: '', role: 'farmer', district: '' }) }
    catch (err) { toast.error(errorMessage(err)) } finally { setBusy(false) }
  }
  return (
    <ConfirmDialog open={open} title="Create account" confirmLabel="Create" busy={busy}
      confirmDisabled={!f.full_name || !f.email || f.password.length < minPw} onCancel={onClose} onConfirm={submit}>
      <Field label="Full name" id="c-name"><input id="c-name" className={inputCls} value={f.full_name} onChange={set('full_name')} /></Field>
      <Field label="Email" id="c-email"><input id="c-email" type="email" className={inputCls} value={f.email} onChange={set('email')} /></Field>
      <Field label="Role" id="c-role">
        <select id="c-role" className={inputCls} value={f.role} onChange={set('role')}>{roleOptions.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
      </Field>
      <Field label={`Temporary password (at least ${minPw} characters)`} id="c-pw">
        <input id="c-pw" type="password" autoComplete="new-password" className={inputCls} value={f.password} onChange={set('password')} />
      </Field>
    </ConfirmDialog>
  )
}

export default function AdminUsers() {
  const { hasPermission } = useAuth()
  const [filters, setFilters] = useState({ q: '', role: '', status: '', verification: '' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const params = { page, per_page: 15, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }
  const list = useAsync(() => adminAPI.users(params), [JSON.stringify(params)])
  const set = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })) }
  const users = list.data?.users || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Users</h1>
        {hasPermission('users.manage') && <button type="button" className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm" onClick={() => setCreating(true)}>+ Create account</button>}
      </div>

      <Card>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Search name, email or phone" id="f-q"><input id="f-q" className={inputCls} value={filters.q} onChange={set('q')} /></Field>
          <Field label="Role" id="f-role">
            <select id="f-role" className={inputCls} value={filters.role} onChange={set('role')}>
              <option value="">All roles</option><option value="staff">All staff</option>
              {[...CUSTOMER_ROLES, ...STAFF_ROLES, 'admin'].map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </Field>
          <Field label="Status" id="f-status">
            <select id="f-status" className={inputCls} value={filters.status} onChange={set('status')}>
              <option value="">Any</option><option value="active">Active</option><option value="suspended">Suspended</option>
            </select>
          </Field>
          <Field label="Verification" id="f-ver">
            <select id="f-ver" className={inputCls} value={filters.verification} onChange={set('verification')}>
              <option value="">Any</option>{VERIFY.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      {list.loading && <Skeleton className="h-64" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && users.length === 0 && <EmptyState title="No users match these filters" />}
      {users.length > 0 && (
        <Card>
          <p className="text-xs text-slate-500 mb-2">{list.data.total} account(s)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Users</caption>
              <thead><tr className="text-left text-slate-500 border-b">
                <th scope="col" className="py-2 pr-3">Name</th><th scope="col" className="pr-3">Role</th>
                <th scope="col" className="pr-3 hidden sm:table-cell">District</th><th scope="col" className="pr-3">Status</th>
                <th scope="col" className="pr-3 hidden md:table-cell">Verification</th><th scope="col" className="hidden lg:table-cell">Last sign-in</th>
              </tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-3">
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setSelected(u.id)}
                        aria-label={`Open ${u.full_name}`}>
                        <span className="font-medium block">{u.full_name}</span><span className="text-xs text-slate-500">{u.email}</span>
                      </button>
                    </td>
                    <td className="pr-3"><Badge color={u.is_staff ? 'purple' : 'blue'}>{label(u.role)}</Badge></td>
                    <td className="pr-3 hidden sm:table-cell">{u.district || '—'}</td>
                    <td className="pr-3"><Badge color={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Suspended'}</Badge></td>
                    <td className="pr-3 hidden md:table-cell"><Badge color={verifyColor[u.verification_status]}>{u.verification_status}</Badge></td>
                    <td className="hidden lg:table-cell text-xs text-slate-500">{fmtDate(u.last_login)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={list.data.pages} onPage={setPage} />
        </Card>
      )}

      {selected && <UserDrawer id={selected} onClose={() => setSelected(null)} onChanged={list.reload} />}
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} onCreated={list.reload} />
    </div>
  )
}
