import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import { useLoad, Photo, Notice, Loading, money, cartChanged, apiError } from '../../components/market/bits'

export default function CartPage() {
  const navigate = useNavigate()
  const cart = useLoad(() => marketAPI.cart(), [])
  const act = async (fn) => { try { await fn(); cartChanged(); cart.reload() } catch (e) { toast.error(apiError(e)); cart.reload() } }
  if (cart.loading) return <Loading />
  if (cart.error) return <Notice tone="bad">{apiError(cart.error, 'Could not load your cart.')}</Notice>
  const c = cart.data
  if (!c.groups.length) return <Notice>Your cart is empty. <Link className="underline" to="/market/search">Find something to buy</Link>.</Notice>
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Your cart</h1>
      <p className="text-sm text-slate-600">Items from different sellers become separate orders, each with its own delivery and payment.</p>
      {c.groups.map((g) => (
        <section key={g.seller.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" aria-label={g.seller.business_name}>
          <h2 className="font-semibold">{g.seller.business_name}</h2>
          {g.items.map((it) => (
            <div key={it.product_id} className="flex gap-3 items-center">
              <Photo image={it.image} alt={it.title} className="w-16 h-16 rounded-lg" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{it.title}</p>
                <p className="text-sm text-slate-600">{money(it.unit_price)} per {it.unit} ({it.price_tier})</p>
                {it.problem && <p role="alert" className="text-sm text-red-700">{it.problem}</p>}
                <label className="text-xs" htmlFor={`q-${it.product_id}`}>Quantity</label>{' '}
                <input id={`q-${it.product_id}`} type="number" step="any" min="0" defaultValue={it.quantity} className="w-24 rounded border px-2 py-1 text-sm"
                  onBlur={(e) => Number(e.target.value) !== it.quantity && act(() => marketAPI.cartSet(it.product_id, e.target.value))} />
              </div>
              <div className="text-right"><p className="font-semibold">{money(it.line_total)}</p>
                <button type="button" className="text-xs underline text-red-700" onClick={() => act(() => marketAPI.cartRemove(it.product_id))}>Remove</button></div>
            </div>))}
          <p className="text-right text-sm">Subtotal {money(g.subtotal)}</p>
        </section>))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-bold">Total {money(c.total)}</p>
        <button type="button" disabled={!c.can_checkout} onClick={() => navigate('/market/checkout')} className="px-5 py-3 rounded-lg bg-emerald-700 text-white disabled:opacity-50">Continue to checkout</button>
      </div>
      {!c.can_checkout && <Notice tone="warn">Fix the items marked above before you check out.</Notice>}
    </div>
  )
}
