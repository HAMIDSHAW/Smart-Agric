import { useCallback, useEffect, useRef, useState } from 'react'

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    return fn().then(
      (res) => setState({ loading: false, data: res.data, error: null }),
      (err) => setState({ loading: false, data: null, error: err }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  return { ...state, reload: run }
}

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.response?.status === 403) return err.response?.data?.error || 'You do not have permission to see this.'
  return err?.response?.data?.error || fallback
}

export function Card({ title, children, className = '', actions }) {
  return (
    <section className={`rounded-2xl bg-white border border-slate-200 shadow-sm p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          {title && <h2 className="font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatCard({ label, value, hint, tone = 'default' }) {
  const tones = { default: 'text-slate-900', good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700' }
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value ?? '—'}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

const BADGES = {
  green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-900',
  blue: 'bg-blue-100 text-blue-800', slate: 'bg-slate-100 text-slate-700', purple: 'bg-purple-100 text-purple-800',
}
export function Badge({ children, color = 'slate' }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGES[color]}`}>{children}</span>
}

export function Skeleton({ className = 'h-24' }) {
  return <div role="status" aria-label="Loading" className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
      <p>{errorMessage(error)}</p>
      {onRetry && error?.response?.status !== 403 && (
        <button type="button" className="underline mt-2" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <p className="text-sm mt-1">{children}</p>}
    </div>
  )
}

export function Pagination({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-3 text-sm">
      <button type="button" className="px-3 py-2 rounded-lg border disabled:opacity-40" disabled={page <= 1}
        onClick={() => onPage(page - 1)}>Previous</button>
      <span aria-live="polite">Page {page} of {pages}</span>
      <button type="button" className="px-3 py-2 rounded-lg border disabled:opacity-40" disabled={page >= pages}
        onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  )
}

/** Accessible confirmation dialog for sensitive actions. Children = optional form fields. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, busy = false,
  confirmDisabled = false, onConfirm, onCancel, children }) {
  const ref = useRef(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  // Move focus into the dialog only when it OPENS (not on every re-render, which would
  // steal focus from the field being typed in).
  useEffect(() => {
    if (!open) return undefined
    ref.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') cancelRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3">
      <div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl outline-none">
        <h2 className="font-semibold text-lg text-slate-900">{title}</h2>
        {message && <p className="text-sm text-slate-600 mt-1">{message}</p>}
        {children && <div className="mt-3 space-y-3">{children}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button type="button" className="px-4 py-2 rounded-lg border" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" disabled={busy || confirmDisabled} onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 ${danger ? 'bg-red-600' : 'bg-emerald-700'}`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Field({ label, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

export const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export async function downloadBlob(promise, filename) {
  const res = await promise
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
