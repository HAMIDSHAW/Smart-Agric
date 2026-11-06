import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { marketAPI } from '../../services/api'
import { useLoad, Notice, Loading, apiError } from '../../components/market/bits'

export function MessageList() {
  const res = useLoad(() => marketAPI.enquiries(), [])
  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">{apiError(res.error)}</Notice>
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Messages</h1>
      <Notice>Messages stay inside SmartAgri and never show anyone's phone or email. Do not share personal or payment details here.</Notice>
      {res.data.enquiries.length === 0 && <Notice>No messages yet. Open a product and use "Ask the seller".</Notice>}
      {res.data.enquiries.map((e) => (
        <Link key={e.id} to={`/market/messages/${e.id}`} className="block rounded-2xl bg-white border p-4 hover:shadow-sm">
          <p className="font-semibold">{e.subject}</p><p className="text-sm text-slate-600">With {e.with} ({e.role === 'buyer' ? 'seller' : 'buyer'}) · {e.kind}</p><p className="text-sm text-slate-500 truncate">{e.last_message}</p></Link>))}
    </div>
  )
}

export function MessageThread() {
  const { id } = useParams()
  const res = useLoad(() => marketAPI.enquiry(id), [id])
  const [body, setBody] = useState('')
  const [price, setPrice] = useState('')
  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">Conversation not found. <Link className="underline" to="/market/messages">Back</Link></Notice>
  const e = res.data.enquiry
  const send = async (ev) => {
    ev.preventDefault()
    try { await marketAPI.replyEnquiry(id, { message: body, offered_price: price || undefined }); setBody(''); setPrice(''); res.reload() } catch (err) { toast.error(apiError(err)) }
  }
  return (
    <div className="space-y-3 max-w-2xl">
      <Link to="/market/messages" className="text-sm underline">← All messages</Link>
      <h1 className="text-xl font-bold">{e.subject}</h1>
      <ul className="space-y-2" aria-label="Conversation">
        {e.messages.map((m) => (
          <li key={m.id} className={`rounded-2xl p-3 text-sm max-w-[85%] ${m.mine ? 'ml-auto bg-emerald-100' : 'bg-white border'}`}>
            {m.body}{m.offered_price != null && <p className="font-semibold mt-1">Offer: Le {m.offered_price}</p>}
            <p className="text-xs text-slate-500 mt-1">{new Date(m.at).toLocaleString()}</p></li>))}
      </ul>
      <form onSubmit={send} className="space-y-2">
        <label htmlFor="reply" className="sr-only">Your reply</label>
        <textarea id="reply" rows={2} value={body} onChange={(x) => setBody(x.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Write a reply" />
        <div className="flex gap-2"><label htmlFor="offer" className="sr-only">Offer price</label>
          <input id="offer" type="number" min="0" step="any" value={price} onChange={(x) => setPrice(x.target.value)} placeholder="Offer price (optional)" className="rounded-lg border px-3 py-2 text-sm w-48" />
          <button className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm disabled:opacity-50" disabled={!body.trim()}>Send</button></div>
      </form>
    </div>
  )
}
