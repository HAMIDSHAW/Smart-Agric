import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import { useLoad, Notice, Loading, money, cartChanged, apiError, useIdempotencyKey } from '../../components/market/bits'

const FUL = [['pickup', 'I will collect it (pickup)'], ['seller_delivery', 'Seller delivers to me'], ['third_party_arranged', 'I arrange my own transport']]

export default function Checkout() {
  const navigate = useNavigate()
  const key = useIdempotencyKey()
  const cart = useLoad(() => marketAPI.cart(), [])
  const methods = useLoad(() => marketAPI.paymentMethods(), [])
  const [f, setF] = useState({ fulfilment_method: 'pickup', payment_method: 'cash_on_delivery', delivery_address: '', delivery_district: '', contact_phone: '', buyer_note: '' })
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'

  if (cart.loading || methods.loading) return <Loading />
  if (placed) {
    return (
      <div className="space-y-4">
        <Notice tone="good"><strong>Order placed.</strong> The seller will confirm it. Nothing is marked paid until the seller confirms they received your payment.</Notice>
        {placed.map((o) => (
          <div key={o.id} className="rounded-2xl bg-white border p-4 space-y-1">
            <p className="font-semibold">{o.order_number} · {o.seller.business_name} · {money(o.total)}</p>
            {o.pay_to && <Notice tone="warn">Send {money(o.total)} by mobile money to <strong>{o.pay_to.mobile_money_number}</strong>, then open the order and enter your transaction reference. {o.pay_to.note}</Notice>}
            <Link className="underline text-sm" to={`/market/orders/${o.id}`}>Track this order</Link>
          </div>))}
      </div>
    )
  }
  const c = cart.data
  if (!c.groups.length) return <Notice>Your cart is empty. <Link className="underline" to="/market/search">Browse products</Link></Notice>

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await marketAPI.checkout({ ...f, idempotency_key: key.current })
      cartChanged(); setPlaced(r.data.orders); toast.success('Order placed')
    } catch (err) { toast.error(apiError(err)); cart.reload() } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="grid lg:grid-cols-[1fr_20rem] gap-6" aria-label="Checkout">
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Checkout</h1>
        <fieldset className="space-y-2"><legend className="font-semibold">How will you get it?</legend>
          {FUL.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="ful" checked={f.fulfilment_method === v} onChange={() => setF((s) => ({ ...s, fulfilment_method: v }))} /> {l}</label>)}
        </fieldset>
        {f.fulfilment_method !== 'pickup' && (
          <div className="space-y-2">
            <label htmlFor="addr" className="text-sm font-medium">Delivery address</label><input id="addr" className={input} value={f.delivery_address} onChange={set('delivery_address')} required minLength={5} />
            <label htmlFor="dist" className="text-sm font-medium">District</label><input id="dist" className={input} value={f.delivery_district} onChange={set('delivery_district')} />
          </div>)}
        <div><label htmlFor="phone" className="text-sm font-medium">Phone number for this order</label><input id="phone" className={input} value={f.contact_phone} onChange={set('contact_phone')} required minLength={6} />
          <p className="text-xs text-slate-500 mt-1">Shared only with the seller of this order.</p></div>
        <div><label htmlFor="note" className="text-sm font-medium">Note to the seller (optional)</label><textarea id="note" rows={2} className={input} value={f.buyer_note} onChange={set('buyer_note')} maxLength={500} /></div>
        <fieldset className="space-y-2"><legend className="font-semibold">Payment</legend>
          <Notice tone="warn">Online card or mobile-money payment through SmartAgri is not available yet. You pay the seller directly, and the seller confirms when they receive your money. SmartAgri does not hold your money.</Notice>
          {(methods.data?.methods || []).filter((m) => !m.online).map((m) => (
            <label key={m.id} className="flex items-start gap-2 text-sm"><input type="radio" name="pay" className="mt-1" checked={f.payment_method === m.id} onChange={() => setF((s) => ({ ...s, payment_method: m.id }))} /> <span>{m.label}</span></label>))}
        </fieldset>
      </div>
      <aside className="rounded-2xl bg-white border border-slate-200 p-4 h-fit space-y-2" aria-label="Order summary">
        <h2 className="font-semibold">Summary</h2>
        {c.groups.map((g) => <div key={g.seller.id} className="text-sm"><p className="font-medium">{g.seller.business_name}</p>
          {g.items.map((it) => <p key={it.product_id} className="text-slate-600">{it.quantity} × {it.title}</p>)}<p>Subtotal {money(g.subtotal)}</p></div>)}
        <p className="font-bold border-t pt-2">Total {money(c.total)}</p>
        <button type="submit" disabled={busy || !c.can_checkout} className="w-full px-4 py-3 rounded-lg bg-emerald-700 text-white disabled:opacity-50">{busy ? 'Placing order…' : 'Place order'}</button>
        <p className="text-xs text-slate-500">Pressing the button twice will not create two orders.</p>
      </aside>
    </form>
  )
}
