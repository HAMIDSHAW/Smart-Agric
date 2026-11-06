import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { marketAPI } from '../../services/api'

export default function MarketLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [count, setCount] = useState(0)

  useEffect(() => {
    const load = () => {
      if (!user || user.is_staff) { setCount(0); return }
      marketAPI.cart().then((r) => setCount(r.data.groups.reduce((n, g) => n + g.items.length, 0))).catch(() => setCount(0))
    }
    load()
    window.addEventListener('cart:changed', load)
    return () => window.removeEventListener('cart:changed', load)
  }, [user])

  const link = ({ isActive }) => `px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-emerald-100 text-emerald-900 font-medium' : 'text-slate-600 hover:text-slate-900'}`
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 py-2 flex flex-wrap items-center gap-2">
          <Link to="/market" className="font-serif font-bold text-emerald-900 text-lg mr-2">🌿 SmartAgri Market</Link>
          <form role="search" className="flex-1 min-w-48 order-3 sm:order-none flex gap-2"
            onSubmit={(e) => { e.preventDefault(); navigate(`/market/search?q=${encodeURIComponent(q)}`) }}>
            <label htmlFor="market-q" className="sr-only">Search the marketplace</label>
            <input id="market-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search seeds, tools, rice…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm">Search</button>
          </form>
          <nav aria-label="Marketplace" className="flex flex-wrap items-center gap-1">
            <NavLink to="/market/requests" className={link}>Buyer requests</NavLink>
            <NavLink to="/market/sell" className={link}>Sell</NavLink>
            <NavLink to="/market/orders" className={link}>Orders</NavLink>
            <NavLink to="/market/messages" className={link}>Messages</NavLink>
            <NavLink to="/market/cart" className={link} aria-label={`Cart, ${count} item(s)`}>🛒 Cart{count > 0 && <span className="ml-1 rounded-full bg-emerald-700 text-white text-xs px-1.5">{count}</span>}</NavLink>
            {user ? <Link to={user.is_staff ? '/admin' : '/dashboard'} className="px-3 py-2 text-sm text-slate-600">My SmartAgri</Link>
              : <Link to="/login" className="px-3 py-2 rounded-lg border text-sm">Sign in</Link>}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-3 py-5"><Outlet /></main>
      <footer className="max-w-6xl mx-auto px-3 pb-8 text-xs text-slate-500">
        SmartAgri connects buyers and sellers. Sellers are responsible for their listings. “Verified” means an administrator checked the seller's details.
        Listings are ordered by date, not by payment.
      </footer>
    </div>
  )
}
