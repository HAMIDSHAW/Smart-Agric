import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const login = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login, user: null }) }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
import Login from './Login'

const run = async (loggedIn) => {
  login.mockResolvedValue(loggedIn)
  render(<MemoryRouter initialEntries={['/login']}><Routes>
    <Route path="/login" element={<Login />} /><Route path="/admin" element={<p>admin console</p>} />
    <Route path="/dashboard" element={<p>farmer dashboard</p>} /></Routes></MemoryRouter>)
  await userEvent.type(screen.getByRole('textbox'), 'user@farm.sl')
  await userEvent.type(document.querySelector('input[type="password"]'), 'a-long-password-1')
  await userEvent.click(screen.getByRole('button', { name: /sign in|log in|login/i }))
}

describe('Login redirect by account type', () => {
  it('sends staff to the admin console', async () => { await run({ is_staff: true, role: 'super_admin' }); expect(await screen.findByText('admin console')).toBeInTheDocument() })
  it('sends farmers to their dashboard', async () => { await run({ is_staff: false, role: 'farmer' }); expect(await screen.findByText('farmer dashboard')).toBeInTheDocument() })
})
