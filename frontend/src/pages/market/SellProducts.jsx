import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import ImageCapture, { UploadProgress } from '../../components/ImageCapture'
import { useLoad, Pill, Notice, Loading, PrivatePhoto, money, apiError } from '../../components/market/bits'

export function SellProducts() {
  const res = useLoad(() => marketAPI.myProducts(), [])
  const [stock, setStock] = useState({})
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); res.reload() } catch (e) { toast.error(apiError(e)) } }
  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">{apiError(res.error, 'Register as a seller first.')} <Link className="underline" to="/market/sell">Go to seller setup</Link></Notice>
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">My listings</h1><Link to="/market/sell/products/new" className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm">+ New listing</Link></div>
      {res.data.products.length === 0 && <Notice>You have no listings yet.</Notice>}
      {res.data.products.map((p) => (
        <article key={p.id} className="rounded-2xl bg-white border p-4 flex gap-3">
          <PrivatePhoto image={p.images[0]} alt={p.title} className="w-20 h-20 rounded-lg flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2"><Link to={`/market/sell/products/${p.id}`} className="font-semibold underline">{p.title}</Link><Pill value={p.status} /></div>
            <p className="text-sm text-slate-600">{money(p.retail_price)} / {p.unit} · {p.stock_qty} in stock</p>
            {p.moderation_note && <p className="text-sm text-amber-800">Note from reviewer: {p.moderation_note}</p>}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={`st${p.id}`} className="sr-only">Stock for {p.title}</label>
              <input id={`st${p.id}`} type="number" min="0" className="w-24 rounded border px-2 py-1" placeholder="Stock" onChange={(e) => setStock({ ...stock, [p.id]: e.target.value })} />
              <button className="underline" disabled={stock[p.id] == null || stock[p.id] === ''} onClick={() => act(() => marketAPI.setStock(p.id, stock[p.id]), 'Stock updated')}>Update stock</button>
              {['draft', 'rejected'].includes(p.status) && <button className="underline" onClick={() => act(() => marketAPI.submitProduct(p.id), 'Submitted')}>Publish</button>}
              {['active', 'sold_out'].includes(p.status) && <button className="underline" onClick={() => act(() => marketAPI.pauseProduct(p.id), 'Paused')}>Mark unavailable</button>}
              {p.status === 'paused' && <button className="underline" onClick={() => act(() => marketAPI.resumeProduct(p.id), 'Live again')}>Mark available</button>}
              <button className="underline text-red-700" onClick={() => window.confirm('Remove this listing? Past orders keep their details.') && act(() => marketAPI.deleteProduct(p.id), 'Removed')}>Remove</button>
            </div>
          </div>
        </article>))}
    </div>
  )
}

const UNITS = ['kg', 'bag', 'tonne', 'piece', 'litre', 'bundle', 'basket', 'set']
const FUL = [['pickup', 'Pickup'], ['seller_delivery', 'I deliver'], ['third_party_arranged', 'Buyer arranges transport']]
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm w-full'

export function ProductForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const cats = useLoad(() => marketAPI.categories(), [])
  const [f, setF] = useState({ title: '', category: 'rice', listing_type: 'product', unit: 'kg', retail_price: '', stock_qty: '', min_order_qty: '1', wholesale_price: '', wholesale_min_qty: '',
    district: '', location_text: '', pickup_point: '', available_from: '', description: '', fulfilment_options: ['pickup'] })
  const [existing, setExisting] = useState([])
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const [current, setCurrent] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    if (!id) return
    marketAPI.myProducts().then((r) => {
      const p = r.data.products.find((x) => String(x.id) === String(id))
      if (!p) return
      setCurrent(p); setExisting(p.images)
      setF({ title: p.title, category: p.category.slug, listing_type: p.listing_type, unit: p.unit, retail_price: p.retail_price ?? '', stock_qty: p.stock_qty ?? '', min_order_qty: p.min_order_qty ?? 1,
        wholesale_price: p.wholesale_price ?? '', wholesale_min_qty: p.wholesale_min_qty ?? '', district: p.district || '', location_text: p.location_text || '', pickup_point: p.pickup_point || '',
        available_from: p.available_from || '', description: p.description || '', fulfilment_options: p.fulfilment_options?.length ? p.fulfilment_options : ['pickup'] })
    }).catch(() => {})
  }, [id])

  const toggle = (v) => setF((s) => ({ ...s, fulfilment_options: s.fulfilment_options.includes(v) ? s.fulfilment_options.filter((x) => x !== v) : [...s.fulfilment_options, v] }))
  const draftWithAI = async () => {
    setAiBusy(true); setAiNote('')
    try { const r = await marketAPI.aiDescribe({ title: f.title, category: f.category, unit: f.unit }); setF((s) => ({ ...s, description: r.data.description })); setAiNote(r.data.note) }
    catch (e) { toast.error(apiError(e)) } finally { setAiBusy(false) }
  }
  const removeExisting = async (img) => { try { const r = await marketAPI.deleteImage(id, img.id); setExisting(r.data.product.images) } catch (e) { toast.error(apiError(e)) } }

  const save = async (publish) => {
    setBusy(true)
    try {
      const body = { ...f }
      if (!body.wholesale_price) { body.wholesale_price = null; body.wholesale_min_qty = null }
      if (!body.available_from) delete body.available_from
      const r = id ? await marketAPI.updateProduct(id, body) : await marketAPI.createProduct(body)
      const pid = r.data.product.id
      if (images.length) {
        const fd = new FormData(); images.forEach((i) => fd.append('images', i.file, i.name))
        setPct(0)
        await marketAPI.addImages(pid, fd, { onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded * 100) / e.total)) })
      }
      if (publish) { await marketAPI.submitProduct(pid); toast.success('Submitted. Live listings appear on the marketplace; regulated ones wait for review.') } else toast.success('Saved as a draft')
      navigate('/market/sell/products')
    } catch (e) { toast.error(apiError(e)) } finally { setBusy(false); setPct(null) }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(true) }} className="space-y-5 max-w-3xl" aria-label="Listing form">
      <h1 className="text-2xl font-bold">{id ? 'Edit listing' : 'New listing'}</h1>
      {current?.moderation_note && <Notice tone="warn">Reviewer note: {current.moderation_note}</Notice>}
      <div><label htmlFor="pt" className="text-sm font-medium">Title</label><input id="pt" className={input} value={f.title} onChange={set('title')} required minLength={3} maxLength={140} /></div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label htmlFor="pc" className="text-sm font-medium">Category</label>
          <select id="pc" className={input} value={f.category} onChange={set('category')}>
            {(cats.data?.categories || []).map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.regulated ? ' (regulated)' : ''}</option>)}</select></div>
        <div><label htmlFor="pl" className="text-sm font-medium">Type</label><select id="pl" className={input} value={f.listing_type} onChange={set('listing_type')}><option value="product">For sale now</option><option value="harvest_forecast">Upcoming harvest</option></select></div>
        <div><label htmlFor="pu" className="text-sm font-medium">Sold by</label><select id="pu" className={input} value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
      </div>
      {cats.data?.categories.find((c) => c.slug === f.category)?.regulated && <Notice tone="warn">This is a regulated product. Only verified sellers can publish it and an administrator reviews it before it goes live.</Notice>}
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label htmlFor="pr" className="text-sm font-medium">Retail price (Le per unit)</label><input id="pr" type="number" min="0" step="0.01" className={input} value={f.retail_price} onChange={set('retail_price')} required /></div>
        <div><label htmlFor="ps" className="text-sm font-medium">Stock</label><input id="ps" type="number" min="0" step="any" className={input} value={f.stock_qty} onChange={set('stock_qty')} required /></div>
        <div><label htmlFor="pm" className="text-sm font-medium">Minimum order</label><input id="pm" type="number" min="0" step="any" className={input} value={f.min_order_qty} onChange={set('min_order_qty')} /></div>
        <div><label htmlFor="pw" className="text-sm font-medium">Wholesale price (optional)</label><input id="pw" type="number" min="0" step="0.01" className={input} value={f.wholesale_price} onChange={set('wholesale_price')} /></div>
        <div><label htmlFor="pq" className="text-sm font-medium">Wholesale from quantity</label><input id="pq" type="number" min="0" step="any" className={input} value={f.wholesale_min_qty} onChange={set('wholesale_min_qty')} /></div>
        {f.listing_type === 'harvest_forecast' && <div><label htmlFor="pa" className="text-sm font-medium">Expected harvest date</label><input id="pa" type="date" className={input} value={f.available_from} onChange={set('available_from')} required /></div>}
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label htmlFor="pd" className="text-sm font-medium">District</label><input id="pd" className={input} value={f.district} onChange={set('district')} /></div>
        <div><label htmlFor="pp" className="text-sm font-medium">Town or village</label><input id="pp" className={input} value={f.location_text} onChange={set('location_text')} /></div>
        <div><label htmlFor="pk" className="text-sm font-medium">Pickup point</label><input id="pk" className={input} value={f.pickup_point} onChange={set('pickup_point')} /></div>
      </div>
      <fieldset><legend className="text-sm font-medium">How can buyers get it?</legend><div className="flex flex-wrap gap-4 mt-1">{FUL.map(([v, l]) => <label key={v} className="text-sm flex items-center gap-1"><input type="checkbox" checked={f.fulfilment_options.includes(v)} onChange={() => toggle(v)} /> {l}</label>)}</div>
        <p className="text-xs text-slate-500 mt-1">SmartAgri has no delivery network. You or the buyer arrange transport.</p></fieldset>
      <div>
        <div className="flex items-center justify-between"><label htmlFor="px" className="text-sm font-medium">Description</label>
          <button type="button" className="text-sm underline disabled:opacity-50" disabled={aiBusy || f.title.trim().length < 3} onClick={draftWithAI}>{aiBusy ? 'Drafting…' : '✨ Draft with AI'}</button></div>
        <textarea id="px" rows={5} className={input} value={f.description} onChange={set('description')} maxLength={4000} />
        {aiNote && <p className="text-xs text-amber-800 mt-1">AI draft. {aiNote}</p>}
      </div>
      <section aria-label="Photos" className="space-y-2">
        <h2 className="text-sm font-medium">Photos (up to 6, at least 1 to publish)</h2>
        {existing.length > 0 && <ul className="flex flex-wrap gap-2">{existing.map((im) => <li key={im.id} className="relative"><PrivatePhoto image={im} alt="Saved photo" className="w-24 h-24 rounded-lg" />
          <button type="button" aria-label="Delete this saved photo" className="absolute top-1 right-1 rounded bg-white/90 px-1 text-xs" onClick={() => removeExisting(im)}>✕</button></li>)}</ul>}
        {id || true ? <ImageCapture images={images} onChange={setImages} multiple maxImages={Math.max(1, 6 - existing.length)} purpose="product" disabled={busy || existing.length >= 6} /> : null}
        {pct != null && <UploadProgress percent={pct < 100 ? pct : null} label={pct < 100 ? `Uploading photos ${pct}%` : 'Saving…'} />}
      </section>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="px-5 py-3 rounded-lg bg-emerald-700 text-white disabled:opacity-50" disabled={busy}>Save and publish</button>
        <button type="button" className="px-5 py-3 rounded-lg border disabled:opacity-50" disabled={busy} onClick={() => save(false)}>Save as draft</button>
      </div>
    </form>
  )
}
