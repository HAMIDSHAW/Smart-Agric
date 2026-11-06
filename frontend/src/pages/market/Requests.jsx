import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLoad, Notice, Loading, apiError, money } from '../../components/market/bits'

export default function Requests() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const res = useLoad(() => marketAPI.requests(), [])
  const [f, setF] = useState({ title: '', quantity: '', unit: 'kg', district: '', needed_by: '', target_price: '' })
  const [reply, setReply] = useState({})
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const need = () => { if (!user) { navigate('/login', { state: { from: '/market/requests' } }); return true } return false }
  const create = async (e) => {
    e.preventDefault(); if (need()) return
    try { await marketAPI.createRequest(Object.fromEntries(Object.entries(f).filter(([, v]) => v))); toast.success('Request posted'); setF({ ...f, title: '' }); res.reload() }
    catch (err) { toast.error(apiError(err)) }
  }
  const respond = async (r) => {
    if (need()) return
    try { const x = await marketAPI.startEnquiry({ request_id: r.id, message: reply[r.id] }); toast.success('Sent to the buyer'); navigate(`/market/messages/${x.data.enquiry.id}`) }
    catch (err) { toast.error(apiError(err)) }
  }
  const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm w-full'
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Buyer requests</h1>
      <p className="text-sm text-slate-600">Buyers post what they need. Sellers reply with an offer. Your name is shown by first name only.</p>
      <form onSubmit={create} className="rounded-2xl bg-white border p-4 grid sm:grid-cols-2 gap-3" aria-label="Post a request">
        <div className="sm:col-span-2"><label htmlFor="rt" className="text-sm font-medium">What do you want to buy?</label><input id="rt" className={input} value={f.title} onChange={set('title')} placeholder="2 tonnes of dry cassava" /></div>
        <div><label htmlFor="rq" className="text-sm font-medium">Quantity</label><input id="rq" type="number" min="0" className={input} value={f.quantity} onChange={set('quantity')} /></div>
        <div><label htmlFor="ru" className="text-sm font-medium">Unit</label><input id="ru" className={input} value={f.unit} onChange={set('unit')} /></div>
        <div><label htmlFor="rd" className="text-sm font-medium">District</label><input id="rd" className={input} value={f.district} onChange={set('district')} /></div>
        <div><label htmlFor="rn" className="text-sm font-medium">Needed by</label><input id="rn" type="date" className={input} value={f.needed_by} onChange={set('needed_by')} /></div>
        <div><label htmlFor="rp" className="text-sm font-medium">Price you can pay per unit (optional)</label><input id="rp" type="number" min="0" className={input} value={f.target_price} onChange={set('target_price')} /></div>
        <div className="flex items-end"><button className="px-4 py-2 rounded-lg bg-emerald-700 text-white disabled:opacity-50" disabled={f.title.trim().length < 3}>Post request</button></div>
      </form>
      {res.loading && <Loading />}
      {res.data && res.data.requests.length === 0 && <Notice>No open requests.</Notice>}
      {res.data?.requests.map((r) => (
        <article key={r.id} className="rounded-2xl bg-white border p-4 space-y-2">
          <h2 className="font-semibold">{r.title}</h2>
          <p className="text-sm text-slate-600">{r.buyer} · {[r.quantity && `${r.quantity} ${r.unit || ''}`, r.district, r.needed_by && `by ${r.needed_by}`, r.target_price && `up to ${money(r.target_price)} each`].filter(Boolean).join(' · ')}</p>
          <label htmlFor={`rep${r.id}`} className="sr-only">Your offer</label>
          <div className="flex gap-2"><input id={`rep${r.id}`} className={input} placeholder="I can supply this: price, quantity and when" onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} />
            <button className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50" disabled={(reply[r.id] || '').trim().length < 2} onClick={() => respond(r)}>Respond</button></div>
        </article>))}
    </div>
  )
}
