import { useState } from 'react'
import { Link, Outlet, NavLink } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { marketAPI } from '../../services/api'
import { useLoad, Pill, Notice, Loading, money, apiError, RequireLogin } from '../../components/market/bits'

const TYPES = [['farmer', 'Farmer'], ['cooperative', 'Cooperative'], ['supplier', 'Agricultural supplier'], ['wholesaler', 'Wholesaler'], ['retailer', 'Retailer'], ['business', 'Registered business']]
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm w-full'

export function SellerRegister({ onDone, existing }) {
  const [f, setF] = useState({ business_name: existing?.business_name || '', seller_type: existing?.seller_type || 'farmer', district: existing?.district || '', location_text: existing?.location_text || '',
    contact_phone: existing?.contact_phone || '', mobile_money_number: existing?.mobile_money_number || '', registration_number: existing?.registration_number || '', description: existing?.description || '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault(); setBusy(true)
    try { await (existing ? marketAPI.sellerUpdate(f) : marketAPI.sellerRegister(f)); toast.success(existing ? 'Profile saved' : 'You are registered as a seller'); onDone() }
    catch (err) { toast.error(apiError(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border p-5 grid sm:grid-cols-2 gap-3" aria-label="Seller profile">
      <div className="sm:col-span-2"><label htmlFor="bn" className="text-sm font-medium">Shop or business name</label><input id="bn" className={input} value={f.business_name} onChange={set('business_name')} required minLength={3} /></div>
      <div><label htmlFor="st" className="text-sm font-medium">I am a</label><select id="st" className={input} value={f.seller_type} onChange={set('seller_type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div><label htmlFor="sd" className="text-sm font-medium">District</label><input id="sd" className={input} value={f.district} onChange={set('district')} /></div>
      <div><label htmlFor="sl" className="text-sm font-medium">Town or village</label><input id="sl" className={input} value={f.location_text} onChange={set('location_text')} /></div>
      <div><label htmlFor="sp" className="text-sm font-medium">Phone (private, shown only on your orders)</label><input id="sp" className={input} value={f.contact_phone} onChange={set('contact_phone')} /></div>
      <div><label htmlFor="sm" className="text-sm font-medium">Mobile money number for buyers who pay that way</label><input id="sm" className={input} value={f.mobile_money_number} onChange={set('mobile_money_number')} /></div>
      <div><label htmlFor="sr" className="text-sm font-medium">Registration number (cooperative or business, if any)</label><input id="sr" className={input} value={f.registration_number} onChange={set('registration_number')} /></div>
      <div className="sm:col-span-2"><label htmlFor="sx" className="text-sm font-medium">About your shop</label><textarea id="sx" rows={3} className={input} value={f.description} onChange={set('description')} /></div>
      <div className="sm:col-span-2"><button className="px-4 py-2 rounded-lg bg-emerald-700 text-white disabled:opacity-50" disabled={busy}>{existing ? 'Save profile' : 'Register as a seller'}</button></div>
    </form>
  )
}

export function SellLayout() {
  const link = ({ isActive }) => `px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-emerald-100 text-emerald-900 font-medium' : 'text-slate-600'}`
  return (
    <RequireLogin>
      <div className="space-y-4">
        <nav aria-label="Seller" className="flex flex-wrap gap-1"><NavLink end to="/market/sell" className={link}>Dashboard</NavLink><NavLink to="/market/sell/products" className={link}>My listings</NavLink><NavLink to="/market/sell/orders" className={link}>Orders received</NavLink></nav>
        <Outlet />
      </div>
    </RequireLogin>
  )
}

export function SellDashboard() {
  const prof = useLoad(() => marketAPI.sellerProfile(), [])
  const dash = useLoad(() => marketAPI.sellerDashboard(30).catch(() => ({ data: null })), [prof.data?.profile?.id])
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  if (prof.loading) return <Loading />
  if (prof.error) return <Notice tone="bad">{apiError(prof.error)}</Notice>
  const profile = prof.data.profile
  if (!profile) {
    return (<div className="space-y-4"><h1 className="text-2xl font-bold">Start selling on SmartAgri</h1>
      <Notice>Anyone can list normal farm produce and supplies. Regulated products such as pesticides need a verified seller account.</Notice>
      <SellerRegister onDone={prof.reload} /></div>)
  }
  const d = dash.data
  const f = d?.figures
  const verifyRequest = async () => { try { await marketAPI.verifyRequest(note); toast.success('Verification requested'); prof.reload() } catch (e) { toast.error(apiError(e)) } }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{profile.business_name}</h1><Pill value={profile.verification_status} />
        <button className="text-sm underline" onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit profile'}</button></div>
      {editing && <SellerRegister existing={profile} onDone={() => { setEditing(false); prof.reload() }} />}
      {profile.verification_status === 'unverified' || profile.verification_status === 'rejected' ? (
        <Notice tone="warn">{profile.verification_status === 'rejected' && <p>Verification was not approved: {profile.verification_note}</p>}
          <p>Verified sellers show a badge and can list regulated products. An administrator checks your details; it is not automatic.</p>
          <label htmlFor="vn" className="text-sm font-medium mt-2 block">Tell us how to verify you (registration number is in your profile)</label>
          <input id="vn" className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="mt-2 px-3 py-1.5 rounded bg-emerald-700 text-white text-sm" onClick={verifyRequest}>Request verification</button></Notice>
      ) : profile.verification_status === 'pending' ? <Notice>Your verification request is waiting for an administrator.</Notice>
        : profile.verification_status === 'suspended' ? <Notice tone="bad">Your seller account is suspended: {profile.verification_note}</Notice> : null}
      {!profile.mobile_money_number && <Notice>Add a mobile money number in your profile if you want to accept mobile-money payments from buyers.</Notice>}

      {dash.loading && <Loading rows={2} />}
      {f && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[['Gross sales (30d window not applied)', money(f.gross_sales)], ['Paid revenue', money(f.paid_revenue)], ['Pending orders', f.pending_orders], ['Completed orders', f.completed_orders],
              ['Active listings', f.active_listings], ['Awaiting review', f.listings_awaiting_review], ['Cancelled orders', f.cancelled_orders], ['Rating', f.rating_avg == null ? 'No reviews' : `${f.rating_avg} (${f.rating_count})`]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white border p-4"><p className="text-xs uppercase text-slate-500">{k.replace(' (30d window not applied)', '')}</p><p className="text-xl font-bold mt-1">{v}</p></div>))}
          </div>
          <div className="rounded-2xl bg-white border p-4"><h2 className="font-semibold mb-2">Orders in the last {d.window_days} days</h2>
            <div className="h-48" role="img" aria-label="Chart of sales per day"><ResponsiveContainer width="100%" height="100%"><AreaChart data={d.sales_by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} fontSize={11} /><YAxis fontSize={11} width={40} /><Tooltip />
              <Area type="monotone" dataKey="sales" stroke="#047857" fill="#a7f3d0" name="Sales" /></AreaChart></ResponsiveContainer></div></div>
          {d.low_stock.length > 0 && <Notice tone="warn"><strong>Low stock:</strong> {d.low_stock.map((x) => `${x.title} (${x.stock_qty} ${x.unit})`).join(', ')}. <Link className="underline" to="/market/sell/products">Update stock</Link></Notice>}
          <ul className="text-xs text-slate-500 list-disc pl-5">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>)}
    </div>
  )
}
