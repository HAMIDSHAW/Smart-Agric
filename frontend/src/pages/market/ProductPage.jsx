import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLoad, Photo, PrivatePhoto, Stars, VerifiedBadge, Notice, Loading, money, cartChanged, apiError } from '../../components/market/bits'

const FUL = { pickup: 'Pickup', seller_delivery: 'Seller delivery', third_party_arranged: 'Third-party delivery (arranged by you)' }

export default function ProductPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const res = useLoad(() => marketAPI.product(id), [id])
  const ctx = useLoad(() => marketAPI.priceContext(id).catch(() => ({ data: { available: false } })), [id])
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [report, setReport] = useState(false)
  const [reason, setReason] = useState('misleading')
  const [imgIdx, setImgIdx] = useState(0)

  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">{res.error.response?.status === 404 ? 'This product is not available.' : 'Could not load this product.'} <Link className="underline" to="/market/search">Back to search</Link></Notice>
  const p = res.data.product
  const mine = user && p.status !== 'active' && p.status !== 'sold_out'
  const q = qty === '' ? p.min_order_qty : Number(qty)
  const tier = p.wholesale_price != null && p.wholesale_min_qty != null && q >= p.wholesale_min_qty ? 'wholesale' : 'retail'
  const unitPrice = tier === 'wholesale' ? p.wholesale_price : p.retail_price
  const needLogin = () => { if (!user) { navigate('/login', { state: { from: `/market/product/${p.id}` } }); return true } return false }
  const purchasable = p.listing_type === 'product' && p.in_stock && p.status === 'active'

  const add = async () => {
    if (needLogin()) return
    setBusy(true)
    try { await marketAPI.cartAdd(p.id, q); cartChanged(); toast.success('Added to your cart') }
    catch (e) { toast.error(apiError(e)) } finally { setBusy(false) }
  }
  const wish = async () => { if (needLogin()) return; try { await marketAPI.wishAdd(p.id); toast.success('Saved to your wishlist') } catch (e) { toast.error(apiError(e)) } }
  const ask = async () => {
    if (needLogin()) return
    try { const r = await marketAPI.startEnquiry({ product_id: p.id, message: msg, kind: p.listing_type === 'harvest_forecast' ? 'bulk' : 'enquiry' }); toast.success('Message sent'); navigate(`/market/messages/${r.data.enquiry.id}`) }
    catch (e) { toast.error(apiError(e)) }
  }
  const sendReport = async () => {
    if (needLogin()) return
    try { await marketAPI.report({ target_type: 'product', target_id: p.id, reason }); toast.success('Thanks. Our team will review this listing.'); setReport(false) }
    catch (e) { toast.error(apiError(e)) }
  }

  return (
    <article className="grid md:grid-cols-2 gap-6">
      <div className="space-y-2">
        {mine ? <PrivatePhoto image={p.images[imgIdx]} alt={p.title} className="w-full h-72 rounded-2xl" /> : <Photo image={p.images[imgIdx]} alt={p.title} className="w-full h-72 rounded-2xl" />}
        {p.images.length > 1 && <div className="flex gap-2 overflow-x-auto">{p.images.map((im, i) => (
          <button key={im.id} type="button" aria-label={`Show photo ${i + 1}`} onClick={() => setImgIdx(i)} className={`rounded-lg overflow-hidden border-2 ${i === imgIdx ? 'border-emerald-600' : 'border-transparent'}`}>
            {mine ? <PrivatePhoto image={im} alt="" className="w-16 h-16" /> : <Photo image={im} alt="" className="w-16 h-16" />}</button>))}</div>}
      </div>

      <div className="space-y-4">
        {p.status !== 'active' && p.status !== 'sold_out' && <Notice tone="warn">This listing is <strong>{p.status.replaceAll('_', ' ')}</strong> and is only visible to you{p.moderation_note ? `: ${p.moderation_note}` : '.'}</Notice>}
        <div><p className="text-xs text-slate-500">{p.category.name}{p.regulated ? ' · Regulated product' : ''}</p>
          <h1 className="text-2xl font-bold">{p.title}</h1><Stars value={p.rating_avg} count={p.rating_count} /></div>
        <p className="text-2xl font-bold text-emerald-800">{money(p.retail_price)} <span className="text-sm font-normal text-slate-500">per {p.unit}</span></p>
        {p.wholesale_price != null && <p className="text-sm">Wholesale: <strong>{money(p.wholesale_price)}</strong> per {p.unit} when you buy {p.wholesale_min_qty} {p.unit} or more.</p>}
        <p className="text-sm text-slate-600">Minimum order {p.min_order_qty} {p.unit} · {p.in_stock ? `${p.stock_qty} ${p.unit} in stock` : 'Out of stock'}{p.available_from ? ` · Expected ${p.available_from}` : ''}</p>
        <p className="text-sm text-slate-600">📍 {[p.location_text, p.district].filter(Boolean).join(', ') || 'Sierra Leone'}</p>
        {p.fulfilment_options.length > 0 && <p className="text-sm text-slate-600">Options: {p.fulfilment_options.map((f) => FUL[f]).join(' · ')}</p>}
        {p.description && <p className="whitespace-pre-wrap text-slate-800">{p.description}</p>}

        {ctx.data?.available && <Notice>Other SmartAgri listings for this item range from {money(ctx.data.min)} to {money(ctx.data.max)} per {ctx.data.unit} (middle price {money(ctx.data.median)}). {ctx.data.note}</Notice>}

        {purchasable ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <label className="text-sm font-medium" htmlFor="qty">Quantity ({p.unit})</label>
            <input id="qty" type="number" min={p.min_order_qty} step="any" value={qty} placeholder={String(p.min_order_qty)} onChange={(e) => setQty(e.target.value)} className="w-32 rounded-lg border border-slate-300 px-3 py-2" />
            <p className="text-sm">Price: <strong>{money(unitPrice)}</strong> per {p.unit} ({tier}) · Total <strong>{money(unitPrice * q)}</strong></p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-4 py-2 rounded-lg bg-emerald-700 text-white disabled:opacity-50" disabled={busy} onClick={add}>Add to cart</button>
              <button type="button" className="px-4 py-2 rounded-lg border" onClick={wish}>♡ Save</button>
            </div>
          </div>
        ) : p.listing_type === 'harvest_forecast' ? <Notice>This is an upcoming harvest. You cannot buy it yet: send the seller a message to arrange it.</Notice>
          : <Notice tone="warn">{p.in_stock ? 'This listing is not open for orders right now.' : 'Out of stock.'}</Notice>}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" aria-label="Seller">
          <div className="flex flex-wrap items-center justify-between gap-2"><Link to={`/market/seller/${p.seller.id}`} className="font-semibold underline">{p.seller.business_name}</Link><VerifiedBadge seller={p.seller} /></div>
          <p className="text-xs text-slate-500">{p.seller.seller_type} · {p.seller.district || 'Sierra Leone'} · <Stars value={p.seller.rating_avg} count={p.seller.rating_count} /></p>
          <label className="text-sm font-medium" htmlFor="enq">Ask the seller a question or make an offer</label>
          <textarea id="enq" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Is this available in larger quantities?" />
          <p className="text-xs text-slate-500">Messages stay inside SmartAgri. Do not share your phone number or payment details here.</p>
          <button type="button" className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50" disabled={msg.trim().length < 2} onClick={ask}>Send message</button>
        </section>

        {p.reviews?.length > 0 && <section aria-label="Reviews"><h2 className="font-semibold mb-2">Reviews</h2><ul className="space-y-2">{p.reviews.map((r, i) => <li key={i} className="text-sm"><span className="text-amber-600">{'★'.repeat(r.rating)}</span> <strong>{r.buyer}</strong><br />{r.comment}</li>)}</ul></section>}

        <div className="text-xs text-slate-500">{!report ? <button className="underline" onClick={() => setReport(true)}>Report this listing</button> : (
          <span className="flex flex-wrap items-center gap-2"><label htmlFor="rep" className="sr-only">Reason</label>
            <select id="rep" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border px-2 py-1">
              <option value="misleading">Misleading</option><option value="fraud">Fraud or scam</option><option value="prohibited_item">Prohibited item</option><option value="unsafe">Unsafe</option><option value="other">Other</option></select>
            <button className="underline" onClick={sendReport}>Send report</button></span>)}</div>
      </div>
    </article>
  )
}
