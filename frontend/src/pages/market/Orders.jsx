import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import { useLoad, Pill, Notice, Loading, money, apiError } from '../../components/market/bits'

export function OrderList() {
  const [page, setPage] = useState(1)
  const res = useLoad(() => marketAPI.orders(page), [page])
  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">{apiError(res.error, 'Could not load your orders.')}</Notice>
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My orders</h1>
      {res.data.orders.length === 0 && <Notice>You have not placed any orders. <Link to="/market" className="underline">Visit the marketplace</Link></Notice>}
      {res.data.orders.map((o) => (
        <Link key={o.id} to={`/market/orders/${o.id}`} className="block rounded-2xl bg-white border border-slate-200 p-4 hover:shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{o.order_number}</p><span className="flex gap-1"><Pill value={o.status} /><Pill value={o.payment_status} /></span></div>
          <p className="text-sm text-slate-600">{o.seller.business_name} · {money(o.total)} · {new Date(o.created_at).toLocaleDateString()}</p>
          <p className="text-sm text-slate-500 truncate">{o.items.map((i) => `${i.quantity} ${i.unit} ${i.title}`).join(', ')}</p>
        </Link>))}
      {res.data.pages > 1 && <div className="flex justify-between text-sm"><button className="px-3 py-2 border rounded-lg disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {res.data.pages}</span><button className="px-3 py-2 border rounded-lg disabled:opacity-40" disabled={page >= res.data.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
  )
}

export function Timeline({ events }) {
  return (
    <ol className="space-y-2 border-l-2 border-emerald-200 pl-4" aria-label="Order tracking">
      {events.map((e, i) => (
        <li key={i} className="text-sm"><span className="font-medium">{e.kind === 'payment' ? 'Payment: ' : e.kind === 'note' ? '' : 'Order: '}{e.value.replaceAll('_', ' ')}</span>
          {e.note ? <span className="text-slate-600"> — {e.note}</span> : null}<br /><span className="text-xs text-slate-500">{new Date(e.at).toLocaleString()}</span></li>))}
    </ol>
  )
}

export function OrderDetail() {
  const { id } = useParams()
  const res = useLoad(() => marketAPI.order(id), [id])
  const [ref, setRef] = useState('')
  const [rev, setRev] = useState({})
  const [dispute, setDispute] = useState(false)
  const [reason, setReason] = useState('not_received')
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); res.reload() } catch (e) { toast.error(apiError(e)) } }
  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">Order not found. <Link className="underline" to="/market/orders">Back to orders</Link></Notice>
  const o = res.data.order
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{o.order_number}</h1><Pill value={o.status} /><Pill value={o.payment_status} /></div>
      <p className="text-sm text-slate-600">Sold by <Link className="underline" to={`/market/seller/${o.seller.id}`}>{o.seller.business_name}</Link> · {o.fulfilment_method.replaceAll('_', ' ')}{o.pickup_point ? ` · Pickup: ${o.pickup_point}` : ''}</p>
      {o.payment_notice && <Notice tone={o.payment_basis === 'provider_verified' ? 'good' : 'info'}>{o.payment_notice}</Notice>}
      {o.payment_status === 'refund_due' && <Notice tone="warn">A refund is owed to you. SmartAgri does not hold or move money: arrange it with the seller, and open a dispute if it is not resolved.</Notice>}
      {o.pay_to && (
        <Notice tone="warn">Pay {money(o.total)} by mobile money to <strong>{o.pay_to.mobile_money_number}</strong>. {o.pay_to.note}
          <span className="flex flex-wrap gap-2 mt-2"><label htmlFor="ref" className="sr-only">Transaction reference</label>
            <input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Mobile money transaction reference" className="rounded border px-2 py-1 text-sm flex-1 min-w-48" />
            <button type="button" className="px-3 py-1 rounded bg-emerald-700 text-white text-sm" disabled={ref.trim().length < 4} onClick={() => run(() => marketAPI.payRef(o.id, ref), 'Reference sent to the seller')}>I have paid</button></span></Notice>)}
      <section className="rounded-2xl bg-white border p-4 space-y-2" aria-label="Items">
        {o.items.map((i) => (
          <div key={i.id} className="flex justify-between text-sm gap-2"><span>{i.quantity} {i.unit} × {i.title} <span className="text-slate-500">({i.price_tier} {money(i.unit_price)})</span></span><span>{money(i.line_total)}</span></div>))}
        <p className="border-t pt-2 flex justify-between font-semibold"><span>Total</span><span>{money(o.total)}</span></p>
      </section>
      <section><h2 className="font-semibold mb-2">Tracking</h2><Timeline events={o.events} /></section>

      <div className="flex flex-wrap gap-2">
        {['pending', 'confirmed'].includes(o.status) && o.payment_status !== 'paid' && <button className="px-4 py-2 rounded-lg border border-red-300 text-red-700" onClick={() => window.confirm('Cancel this order?') && run(() => marketAPI.cancelOrder(o.id, 'Cancelled by buyer'), 'Order cancelled')}>Cancel order</button>}
        {o.status === 'delivered' && <button className="px-4 py-2 rounded-lg bg-emerald-700 text-white" onClick={() => run(() => marketAPI.completeOrder(o.id), 'Thanks for confirming')}>I received my order</button>}
        {o.status !== 'cancelled' && <button className="px-4 py-2 rounded-lg border" onClick={() => setDispute(!dispute)}>Report a problem</button>}
      </div>
      {dispute && (
        <div className="rounded-2xl border p-4 space-y-2"><label htmlFor="dr" className="text-sm font-medium">What went wrong?</label>
          <select id="dr" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border px-2 py-1 text-sm">
            <option value="not_received">I did not receive it</option><option value="not_as_described">Not as described</option><option value="quality">Poor quality</option><option value="payment_problem">Payment problem</option><option value="other">Other</option></select>
          <button className="ml-2 px-3 py-1 rounded bg-slate-800 text-white text-sm" onClick={() => run(() => marketAPI.dispute(o.id, { reason }), 'Our team will review your case')}>Open dispute</button></div>)}
      {o.status === 'completed' && (
        <section className="space-y-3" aria-label="Reviews"><h2 className="font-semibold">Review your items</h2>
          {o.items.map((i) => (
            <div key={i.id} className="rounded-xl border p-3 space-y-2"><p className="text-sm font-medium">{i.title}</p>
              <label htmlFor={`r${i.id}`} className="text-xs">Rating</label>
              <select id={`r${i.id}`} className="rounded border px-2 py-1 text-sm ml-2" value={rev[i.id]?.rating || ''} onChange={(e) => setRev({ ...rev, [i.id]: { ...rev[i.id], rating: Number(e.target.value) } })}>
                <option value="">Choose</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}</select>
              <input aria-label={`Comment for ${i.title}`} className="block w-full rounded border px-2 py-1 text-sm" placeholder="Comment (optional)" onChange={(e) => setRev({ ...rev, [i.id]: { ...rev[i.id], comment: e.target.value } })} />
              <button className="px-3 py-1 rounded bg-emerald-700 text-white text-sm disabled:opacity-50" disabled={!rev[i.id]?.rating}
                onClick={() => run(() => marketAPI.review(o.id, { product_id: i.product_id, ...rev[i.id] }), 'Review posted')}>Post review</button></div>))}
        </section>)}
    </div>
  )
}
