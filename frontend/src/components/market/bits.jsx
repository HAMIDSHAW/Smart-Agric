import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import useAuthedImage from '../../hooks/useAuthedImage'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
export const money = (n) => (n == null ? '—' : `Le ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`)
export const cartChanged = () => window.dispatchEvent(new Event('cart:changed'))

export function RequireLogin({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return children
}

/** Public product photo (listings that are live). */
export function Photo({ image, alt, className = '' }) {
  if (!image) return <div className={`flex items-center justify-center bg-emerald-50 text-3xl ${className}`} aria-label="No photo">🌾</div>
  return <img src={`${API_URL}${image.url || image}`} alt={alt} loading="lazy" className={`object-cover ${className}`} />
}

/** Owner preview of a photo that is not public yet (needs the login token). */
export function PrivatePhoto({ image, alt, className = '' }) {
  const src = useAuthedImage(image?.url)
  if (!src) return <div className={`animate-pulse bg-slate-200 ${className}`} aria-label="Loading photo" />
  return <img src={src} alt={alt} className={`object-cover ${className}`} />
}

export function Stars({ value, count }) {
  if (value == null) return <span className="text-xs text-slate-500">No reviews yet</span>
  return <span className="text-xs text-amber-600" aria-label={`Rated ${value} out of 5 from ${count} review(s)`}>★ {value} <span className="text-slate-500">({count})</span></span>
}

export function VerifiedBadge({ seller }) {
  return seller.verified
    ? <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">✓ Verified seller</span>
    : <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">Not verified</span>
}

const PILL = {
  pending: 'bg-amber-100 text-amber-900', confirmed: 'bg-blue-100 text-blue-800', processing: 'bg-blue-100 text-blue-800',
  ready: 'bg-blue-100 text-blue-800', shipped: 'bg-blue-100 text-blue-800', delivered: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-red-100 text-red-800',
  unpaid: 'bg-slate-100 text-slate-700', awaiting_confirmation: 'bg-amber-100 text-amber-900', paid: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800', refund_due: 'bg-red-100 text-red-800', refunded: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-800', draft: 'bg-slate-100 text-slate-700', pending_review: 'bg-amber-100 text-amber-900',
  rejected: 'bg-red-100 text-red-800', paused: 'bg-slate-100 text-slate-700', sold_out: 'bg-amber-100 text-amber-900', removed: 'bg-red-100 text-red-800',
  verified: 'bg-emerald-100 text-emerald-800', unverified: 'bg-slate-100 text-slate-700', suspended: 'bg-red-100 text-red-800',
}
export function Pill({ value }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PILL[value] || 'bg-slate-100 text-slate-700'}`}>{String(value).replaceAll('_', ' ')}</span>
}

export function ProductCard({ p }) {
  return (
    <Link to={`/market/product/${p.id}`} className="block rounded-2xl bg-white border border-slate-200 overflow-hidden hover:shadow-md focus:outline focus:outline-2 focus:outline-emerald-600">
      <Photo image={p.images[0]} alt={p.title} className="w-full h-36 sm:h-40" />
      <div className="p-3 space-y-1">
        <p className="font-medium text-slate-900 line-clamp-2">{p.title}</p>
        <p className="text-emerald-800 font-semibold">{money(p.retail_price)} <span className="text-xs text-slate-500 font-normal">/ {p.unit}</span></p>
        {p.wholesale_price != null && <p className="text-xs text-slate-600">Wholesale {money(p.wholesale_price)} from {p.wholesale_min_qty} {p.unit}</p>}
        {p.listing_type === 'harvest_forecast' && <p className="text-xs text-blue-700">Upcoming harvest{p.available_from ? `: ${p.available_from}` : ''}</p>}
        <div className="flex items-center justify-between gap-2"><VerifiedBadge seller={p.seller} /><Stars value={p.rating_avg} count={p.rating_count} /></div>
        <p className="text-xs text-slate-500">{p.district || p.seller.district || 'Sierra Leone'}{p.status === 'sold_out' || !p.in_stock ? ' · Out of stock' : ''}</p>
      </div>
    </Link>
  )
}

export function ProductGrid({ items }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
}

export function useLoad(fn, deps = []) {
  const [s, setS] = useState({ loading: true, data: null, error: null })
  const run = () => {
    setS((x) => ({ ...x, loading: true, error: null }))
    return fn().then((r) => setS({ loading: false, data: r.data, error: null }), (e) => setS({ loading: false, data: null, error: e }))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run() }, deps)
  return { ...s, reload: run }
}

export const apiError = (e, fb = 'Something went wrong. Please try again.') => e?.response?.data?.error || fb

export function Notice({ tone = 'info', children }) {
  const t = { info: 'border-blue-200 bg-blue-50 text-blue-900', warn: 'border-amber-300 bg-amber-50 text-amber-900', bad: 'border-red-300 bg-red-50 text-red-800', good: 'border-emerald-300 bg-emerald-50 text-emerald-900' }[tone]
  return <div role={tone === 'bad' ? 'alert' : 'note'} className={`rounded-xl border p-3 text-sm ${t}`}>{children}</div>
}

export function Loading({ rows = 3 }) {
  return <div role="status" aria-label="Loading" className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-slate-200/70 animate-pulse" />)}</div>
}

export function useIdempotencyKey() {
  const ref = useRef(null)
  if (!ref.current) ref.current = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replaceAll('-', '').slice(0, 40)
  return ref
}
