import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = { user: null, hasPermission: () => false, login: vi.fn(), logout: vi.fn(), loading: false }
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth, AuthProvider: ({ children }) => children }))
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: t, Toaster: () => null }
})
vi.mock('../../services/api', () => {
  const adminAPI = {
    dashboard: vi.fn(), notifications: vi.fn(), users: vi.fn(), user: vi.fn(), roles: vi.fn(), suspend: vi.fn(),
    restore: vi.fn(), verify: vi.fn(), setRole: vi.fn(), resetPassword: vi.fn(), deleteUser: vi.fn(),
    createUser: vi.fn(), setPermissions: vi.fn(), aiModels: vi.fn(), aiErrors: vi.fn(), aiProbe: vi.fn(),
  }
  return { adminAPI, authAPI: {}, default: {} }
})
import toast from 'react-hot-toast'
import { adminAPI } from '../../services/api'
import AdminLayout from '../../components/AdminLayout'
import AdminOverview from './AdminOverview'
import AdminUsers from './AdminUsers'
import AdminAI from './AdminAI'
import { ConfirmDialog } from '../../components/admin/ui'
import { AdminRoute } from '../../App'

const ok = (data) => Promise.resolve({ data })
const setUser = (role, perms, extra = {}) => {
  auth.user = { id: 1, full_name: 'Ada Admin', role, is_staff: true, permissions: perms, ...extra }
  auth.hasPermission = (p) => perms.includes(p)
}

beforeEach(() => {
  Object.values(adminAPI).forEach((f) => f.mockReset())
  adminAPI.notifications.mockReturnValue(ok({ notifications: [] }))
  adminAPI.roles.mockReturnValue(ok({ permissions: { 'ai.view': 'View AI', 'users.view': 'View users' }, roles: [] }))
  toast.error.mockClear(); toast.success.mockClear()
})

describe('AdminLayout navigation (permission aware)', () => {
  const renderLayout = () => render(<MemoryRouter initialEntries={['/admin']}><Routes>
    <Route path="/admin" element={<AdminLayout />}><Route index element={<p>home</p>} /></Route></Routes></MemoryRouter>)
  const links = () => screen.getAllByRole('link').map((a) => a.textContent.replace(/^\S+\s/, '').trim())

  it('operations admin sees users/roles/audit/reports but not AI models', () => {
    setUser('operations_admin', ['users.view', 'users.manage', 'audit.view', 'reports.view', 'reports.export', 'system.view', 'feedback.view', 'notifications.view'])
    renderLayout()
    const names = links().join('|')
    expect(names).toMatch(/Users/); expect(names).toMatch(/Audit Log/); expect(names).toMatch(/Reports/)
    expect(names).not.toMatch(/AI Models/)
  })
  it('AI admin sees AI models and system but not users', () => {
    setUser('ai_admin', ['ai.view', 'ai.manage', 'system.view', 'reports.view', 'audit.view', 'notifications.view'])
    renderLayout()
    const names = links().join('|')
    expect(names).toMatch(/AI Models/); expect(names).toMatch(/System/); expect(names).not.toMatch(/\bUsers\b/)
  })
  it('always offers My Account and the farmer app; shows the alert count', async () => {
    setUser('support_admin', ['users.view', 'notifications.view'])
    adminAPI.notifications.mockReturnValue(ok({ notifications: [{ level: 'critical' }, { level: 'info' }] }))
    renderLayout()
    expect(links().join('|')).toMatch(/My Account/); expect(links().join('|')).toMatch(/Farmer app/)
    expect(await screen.findByLabelText(/1 notifications needing attention/i)).toBeInTheDocument()
  })
})

describe('AdminRoute', () => {
  const go = () => render(<MemoryRouter initialEntries={['/admin']}><Routes>
    <Route path="/admin" element={<AdminRoute><p>secret admin</p></AdminRoute>} />
    <Route path="/login" element={<p>login page</p>} /><Route path="/dashboard" element={<p>farmer dashboard</p>} /></Routes></MemoryRouter>)
  it('sends anonymous visitors to login', () => { auth.user = null; go(); expect(screen.getByText('login page')).toBeInTheDocument() })
  it('sends farmers to their dashboard', () => { auth.user = { role: 'farmer', is_staff: false }; go(); expect(screen.getByText('farmer dashboard')).toBeInTheDocument() })
  it('lets staff in', () => { setUser('support_admin', []); go(); expect(screen.getByText('secret admin')).toBeInTheDocument() })
})

describe('AdminOverview', () => {
  it('shows real figures, honest AI wording and that the marketplace is not live', async () => {
    setUser('super_admin', ['reports.view'])
    adminAPI.notifications.mockReturnValue(ok({ notifications: [{ level: 'critical', title: 'Default admin password still active', detail: 'Reset it', link: '/admin/users' }] }))
    adminAPI.dashboard.mockReturnValue(ok({
      window_days: 30, platform_note: 'These figures describe platform activity. not measured agricultural impact.',
      users: { total: 12, active: 10, suspended: 2, pending_verification: 3, new_in_window: 5, active_in_window: 7, by_role: { farmer: 9, seller: 3 } },
      ai: { requests: 0, successful: 0, failed: 0, success_rate: null, avg_latency_ms: null },
      analyses: { disease: 4, soil: 2, crop_recommendations: 6, top_diseases: [] },
      registrations_by_day: [{ date: '2026-11-01', count: 1 }], districts: [{ district: 'Bo', users: 5 }],
      security_last_24h: { failed_logins: 2, access_denied: 1 }, marketplace: { available: false },
    }))
    render(<MemoryRouter><AdminOverview /></MemoryRouter>)
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText(/No AI calls recorded in this period/)).toBeInTheDocument()   // not a fake 100%
    expect(screen.getByText(/marketplace module is not live yet/i)).toBeInTheDocument()
    expect(screen.getByText(/Default admin password still active/)).toBeInTheDocument()
    expect(screen.getByText(/not measured agricultural impact/i)).toBeInTheDocument()
  })
  it('shows a permission message instead of crashing on 403', async () => {
    setUser('support_admin', [])
    adminAPI.dashboard.mockImplementation(() => Promise.reject({ response: { status: 403, data: { error: 'You do not have permission to do this.' } } }))
    render(<MemoryRouter><AdminOverview /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not have permission/i)
  })
})

describe('AdminUsers', () => {
  const farmer = { id: 5, full_name: 'Fatmata Kamara', email: 'f@farm.sl', role: 'farmer', is_active: true, is_staff: false, verification_status: 'unverified', district: 'Bo' }
  const detail = (over = {}) => ok({ user: { ...farmer, permissions: [], permission_overrides: [], recent_events: [], activity: { disease_analyses: 3 }, ...over } })
  beforeEach(() => {
    adminAPI.users.mockReturnValue(ok({ users: [farmer], total: 1, pages: 1, page: 1 }))
  })

  it('lists users and filters through the server', async () => {
    setUser('operations_admin', ['users.view', 'users.manage'])
    render(<AdminUsers />)
    expect(await screen.findByText('Fatmata Kamara')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/search name/i), 'fat')
    await waitFor(() => expect(adminAPI.users).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'fat', page: 1 })))
  })

  it('suspending needs a reason, confirms, then calls the server', async () => {
    setUser('operations_admin', ['users.view', 'users.manage', 'roles.assign'])
    adminAPI.user.mockReturnValue(detail())
    adminAPI.suspend.mockReturnValue(ok({}))
    render(<AdminUsers />)
    await userEvent.click(await screen.findByRole('button', { name: /open fatmata/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^suspend$/i }))
    const dlg = screen.getByRole('dialog', { name: /suspend this account/i })
    const confirm = within(dlg).getByRole('button', { name: /^suspend$/i })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dlg).getByLabelText(/reason/i), 'Reported fraud')
    await userEvent.click(confirm)
    await waitFor(() => expect(adminAPI.suspend).toHaveBeenCalledWith(5, 'Reported fraud'))
    expect(toast.success).toHaveBeenCalled()
  })

  it('shows the server error when an action is refused', async () => {
    setUser('operations_admin', ['users.view', 'users.manage'])
    adminAPI.user.mockReturnValue(detail())
    adminAPI.restore.mockImplementation(() => Promise.reject({ response: { data: { error: 'You cannot restore this account.' } } }))
    adminAPI.user.mockReturnValue(detail({ is_active: false, suspended_reason: 'x' }))
    render(<AdminUsers />)
    await userEvent.click(await screen.findByRole('button', { name: /open fatmata/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^restore$/i }))
    await userEvent.click(within(screen.getByRole('dialog', { name: /restore this account/i })).getByRole('button', { name: /^restore$/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You cannot restore this account.'))
  })

  it('staff roles can only be offered to a Super Admin', async () => {
    adminAPI.user.mockReturnValue(detail())
    setUser('operations_admin', ['users.view', 'users.manage', 'roles.assign'])
    const first = render(<AdminUsers />)
    await userEvent.click(await screen.findByRole('button', { name: /open fatmata/i }))
    await userEvent.click(await screen.findByRole('button', { name: /change role/i }))
    let options = within(screen.getByRole('dialog', { name: /change role/i })).getAllByRole('option').map((o) => o.value)
    expect(options).toEqual(['farmer', 'extension_officer', 'buyer', 'seller'])
    first.unmount()

    setUser('super_admin', ['users.view', 'users.manage', 'roles.assign', 'roles.manage', 'users.delete'])
    render(<AdminUsers />)
    await userEvent.click(await screen.findByRole('button', { name: /open fatmata/i }))
    await userEvent.click(await screen.findByRole('button', { name: /change role/i }))
    options = within(screen.getByRole('dialog', { name: /change role/i })).getAllByRole('option').map((o) => o.value)
    expect(options).toContain('super_admin'); expect(options).toContain('ai_admin')
  })

  it('hides destructive buttons the user lacks permission for, and protects staff and self', async () => {
    adminAPI.user.mockReturnValue(detail())
    setUser('support_admin', ['users.view', 'users.reset_password'])
    const a = render(<AdminUsers />)
    await userEvent.click(await screen.findByRole('button', { name: /open fatmata/i }))
    await screen.findByRole('button', { name: /reset password/i })
    expect(screen.queryByRole('button', { name: /^suspend$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /change role/i })).toBeNull()
    a.unmount()

    setUser('operations_admin', ['users.view', 'users.manage', 'roles.assign', 'users.reset_password'])
    adminAPI.user.mockReturnValue(detail({ role: 'super_admin', is_staff: true }))
    render(<AdminUsers />)
    await userEvent.click(await screen.findByRole('button', { name: /open fatmata/i }))
    await screen.findByText(/effective permissions/i)
    expect(screen.queryByRole('button', { name: /^suspend$/i })).toBeNull()       // staff target, no roles.manage
    expect(screen.queryByRole('button', { name: /reset password/i })).toBeNull()
  })

  it('deleting requires typing the exact email', async () => {
    setUser('super_admin', ['users.view', 'users.manage', 'users.delete', 'roles.manage'])
    adminAPI.user.mockReturnValue(detail()); adminAPI.deleteUser.mockReturnValue(ok({}))
    render(<AdminUsers />)
    await userEvent.click(await screen.findByRole('button', { name: /open fatmata/i }))
    await userEvent.click(await screen.findByRole('button', { name: /delete/i }))
    const dlg = screen.getByRole('dialog', { name: /permanently delete/i })
    const btn = within(dlg).getByRole('button', { name: /delete forever/i })
    expect(btn).toBeDisabled()
    await userEvent.type(within(dlg).getByLabelText(/type f@farm.sl/i), 'f@farm.sl')
    expect(btn).toBeEnabled()
  })
})

describe('AdminAI', () => {
  const models = { window_days: 7, models: [
    { id: 'a', identifier: 'qwen/qwen3.8-27b', provider: 'groq', capability: 'vision', state: 'live', credential: 'configured', routes: ['/api/disease/detect'], health: 'untested', stats: { requests: 0, success_rate: null, avg_latency_ms: null, last_call: null } },
    { id: 'b', identifier: 'claude-haiku-4-5-20251001', provider: 'anthropic', capability: 'vision', state: 'live', credential: 'missing', routes: [], health: 'awaiting_credentials', stats: { requests: 0, success_rate: null, avg_latency_ms: null, last_call: null } },
    { id: 'c', identifier: 'google/vit-base-patch16-224', provider: 'huggingface', capability: 'image-classifier', state: 'configured_unused', credential: 'missing', routes: [], health: 'not_connected' },
  ] }
  beforeEach(() => { adminAPI.aiModels.mockReturnValue(ok(models)); adminAPI.aiErrors.mockReturnValue(ok({ errors: [] })) })

  it('never labels an untested model healthy and lists preserved models', async () => {
    setUser('ai_admin', ['ai.view', 'ai.manage'])
    render(<AdminAI />)
    expect(await screen.findByText('qwen/qwen3.8-27b')).toBeInTheDocument()
    expect(screen.getByText('Untested')).toBeInTheDocument(); expect(screen.getByText('Needs credentials')).toBeInTheDocument()
    expect(screen.getByText('google/vit-base-patch16-224')).toBeInTheDocument()
    expect(screen.queryByText('Healthy')).toBeNull()
  })

  it('asks before sending a live check and shows the true result', async () => {
    setUser('ai_admin', ['ai.view', 'ai.manage'])
    adminAPI.aiProbe.mockReturnValue(ok({ ok: false, error_kind: 'model_unavailable', message: 'The AI model is currently unavailable.', latency_ms: 90 }))
    render(<AdminAI />)
    await userEvent.click((await screen.findAllByRole('button', { name: /run check/i }))[0])
    expect(adminAPI.aiProbe).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /run check/i }))
    await waitFor(() => expect(adminAPI.aiProbe).toHaveBeenCalledWith('a'))
    expect(await screen.findByText(/Check failed: The AI model is currently unavailable/)).toBeInTheDocument()
  })

  it('does not offer live checks without ai.manage', async () => {
    setUser('support_admin', ['ai.view'])
    render(<AdminAI />)
    await screen.findByText('qwen/qwen3.8-27b')
    expect(screen.queryByRole('button', { name: /run check/i })).toBeNull()
  })
})

describe('ConfirmDialog', () => {
  it('is an accessible modal that closes with Escape', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="Sure?" onCancel={onCancel} onConfirm={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Sure?' })).toHaveAttribute('aria-modal', 'true')
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })
})
