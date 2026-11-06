import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import { useLoad, Pill, Notice, Loading, money, apiError } from '../../components/market/bits'
import { Timeline } from './Orders'

export function SellOrders() {
  const [status, setStatus] = useState('')
  const res = useLoad(() => marketAPI.sellerOrders(status ? { status } : {}), [status])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-bold">Orders received</h1>
        <label className="text-sm">Show <select className="rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>{['pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label></div>
      {res.loading && <Loading />}
      {res.error && <Notice tone="bad">{apiError(res.error)}</Notice>}
      {res.data?.orders.length === 0 && <Notice>No orders yet.</Notice>}
      {res.data?.orders.map((o) => (
        <Link key={o.id} to={`/market/sell/orders/${o.id}`} className="block rounded-2xl bg-white border p-4 hover:shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{o.order_number}</span><span className="flex gap-1"><Pill value={o.status} /><Pill value={o.payment_status} /></span></div>
          <p className="text-sm text-slate-600">{o.buyer.name} · {money(o.total)} · {o.fulfilment_method.replaceAll('_', ' ')}</p></Link>))}
    </div>
  )
}

const NEXT = { pending: ['confirmed'], confirmed: ['processing', 'ready', 'shipped'], processing: ['ready', 'shipped'], ready: ['delivered'], shipped: ['delivered'] }

export function SellOrderDetail() {
  const { id } = useParams()
  const res = useLoad(() => marketAPI.sellerOrder(id), [id])
  const [reason, setReason] = useState('')
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); res.reload() } catch (e) { toast.error(apiError(e)) } }
  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">Order not found.</Notice>
  const o = res.data.order
  const options = (NEXT[o.status] || []).filter((s) => (o.fulfilment_method === 'pickup' ? s !== 'shipped' : s !== 'ready'))
  const canCancel = ['pending', 'confirmed', 'processing', 'ready'].includes(o.status)
  const canConfirmPay = o.status !== 'cancelled' && !['paid', 'refund_due', 'refunded'].includes(o.payment_status)
  return (
    <div className="space-y-4">
      <Link to="/market/sell/orders" className="text-sm underline">← Orders received</Link>
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{o.order_number}</h1><Pill value={o.status} /><Pill value={o.payment_status} /></div>
      <section className="rounded-2xl bg-white border p-4 text-sm space-y-1" aria-label="Buyer">
        <p><strong>{o.buyer.name}</strong> · {o.buyer.phone}</p>
        <p>{o.fulfilment_method.replaceAll('_', ' ')}{o.delivery_address ? ` · ${o.delivery_address}` : ''}{o.delivery_district ? `, ${o.delivery_district}` : ''}</p>
        {o.buyer_note && <p>Note: {o.buyer_note}</p>}
        <p className="text-xs text-slate-500">Buyer contact details are for fulfilling this order only.</p>
      </section>
      <section className="rounded-2xl bg-white border p-4 space-y-1" aria-label="Items">
        {o.items.map((i) => <div key={i.id} className="flex justify-between text-sm"><span>{i.quantity} {i.unit} × {i.title} ({i.price_tier})</span><span>{money(i.line_total)}</span></div>)}
        <p className="border-t pt-2 flex justify-between font-semibold"><span>Total</span><span>{money(o.total)}</span></p>
        {o.commission_rate > 0 && <p className="text-xs text-slate-500">Marketplace commission recorded: {money(o.commission_amount)} ({o.commission_rate}%).</p>}
      </section>
      <section aria-label="Payment" className="space-y-2">
        <h2 className="font-semibold">Payment: {o.payment_method.replaceAll('_', ' ')}</h2>
        {o.buyer_payment_reference && <Notice>Buyer's mobile money reference: <strong>{o.buyer_payment_reference}</strong>. Check your wallet before confirming. This is the buyer's claim, not proof.</Notice>}
        {o.payment_notice && <Notice tone="good">{o.payment_notice}</Notice>}
        {canConfirmPay && <button className="px-4 py-2 rounded-lg bg-emerald-700 text-white" onClick={() => window.confirm(`Confirm you have received ${money(o.total)}? SmartAgri cannot check this for you.`) && run(() => marketAPI.confirmPayment(o.id), 'Payment confirmed')}>I received the payment</button>}
        {o.payment_status === 'refund_due' && <div><Notice tone="warn">A refund is owed to the buyer. Pay them back outside SmartAgri, then mark it.</Notice><button className="mt-2 px-3 py-2 rounded-lg border" onClick={() => run(() => marketAPI.markRefunded(o.id), 'Marked refunded')}>I refunded the buyer</button></div>}
      </section>
      <section className="space-y-2" aria-label="Update status">
        <h2 className="font-semibold">Update the order</h2>
        <div className="flex flex-wrap gap-2">{options.map((s) => <button key={s} className="px-3 py-2 rounded-lg border" onClick={() => run(() => marketAPI.sellerStatus(o.id, s), `Marked ${s}`)}>Mark {s}</button>)}</div>
        {canCancel && <div className="flex flex-wrap gap-2 items-center"><label htmlFor="cr" className="sr-only">Reason for cancelling</label>
          <input id="cr" className="rounded border px-2 py-1 text-sm flex-1 min-w-48" placeholder="Reason for cancelling" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="px-3 py-2 rounded-lg border border-red-300 text-red-700 disabled:opacity-50" disabled={!reason.trim()} onClick={() => run(() => marketAPI.sellerStatus(o.id, 'cancelled', reason), 'Order cancelled')}>Cancel order</button></div>}
        {o.status === 'delivered' && <p className="text-sm text-slate-600">Waiting for the buyer to confirm they received it.</p>}
      </section>
      <section><h2 className="font-semibold mb-2">Tracking</h2><Timeline events={o.events} /></section>
    </div>
  )
}
