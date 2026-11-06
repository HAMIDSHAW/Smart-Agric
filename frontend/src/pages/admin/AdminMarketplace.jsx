import { useState } from 'react'
import toast from 'react-hot-toast'
import { adminMarketAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useAsync, errorMessage, Card, Badge, StatCard, Skeleton, ErrorState, EmptyState, Pagination, ConfirmDialog, Field, inputCls, fmtDate } from '../../components/admin/ui'

const TABS = [['overview', 'Overview', ['marketplace.manage', 'marketplace.verify_sellers']], ['sellers', 'Sellers', ['marketplace.verify_sellers', 'marketplace.manage']],
  ['products', 'Listings', ['marketplace.manage']], ['orders', 'Orders', ['marketplace.manage']], ['payments', 'Payments', ['marketplace.manage']],
  ['reports', 'Reports', ['marketplace.manage']], ['disputes', 'Disputes', ['marketplace.manage']], ['reviews', 'Reviews', ['marketplace.manage']],
  ['categories', 'Categories', ['marketplace.manage']], ['settings', 'Settings', ['marketplace.manage']]]
const money = (n) => `Le ${Number(n || 0).toLocaleString()}`
const col = { verified: 'green', pending: 'amber', unverified: 'slate', rejected: 'red', suspended: 'red', active: 'green', pending_review: 'amber', rejected_: 'red', paid: 'green', unpaid: 'slate', refund_due: 'red' }

/** Action that needs a written reason/note (recorded in the audit log). */
function NoteAction({ label, title, message, danger, minLen = 3, onSubmit, children }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try { await onSubmit(note.trim(), extra); setOpen(false); setNote('') } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <button type="button" className={`px-2 py-1 rounded border text-xs ${danger ? 'border-red-300 text-red-700' : ''}`} onClick={() => setOpen(true)}>{label}</button>
      <ConfirmDialog open={open} title={title} message={message} danger={danger} busy={busy} confirmLabel={label} confirmDisabled={note.trim().length < minLen}
        onCancel={() => setOpen(false)} onConfirm={go}>
        {children && children(extra, setExtra)}
        <Field label="Note (recorded in the audit log)" id={`note-${label}`}><input id={`note-${label}`} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  )
}

function Table({ q, render, head, empty, page, setPage, listKey }) {
  if (q.loading) return <Skeleton className="h-48" />
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />
  const rows = q.data[listKey]
  if (!rows.length) return <EmptyState title={empty} />
  return (
    <Card>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500 border-b">{head.map((h) => <th key={h} scope="col" className="py-2 pr-3">{h}</th>)}</tr></thead>
        <tbody>{rows.map(render)}</tbody></table></div>
      <Pagination page={page} pages={q.data.pages} onPage={setPage} />
    </Card>
  )
}

function Overview() {
  const q = useAsync(() => adminMarketAPI.overview(), [])
  if (q.loading) return <Skeleton className="h-40" />
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />
  const d = q.data
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Orders" value={d.orders_total} /><StatCard label="Gross sales" value={money(d.gross_sales)} hint="Orders not cancelled" />
        <StatCard label="Paid: provider verified" value={d.paid_orders.provider_verified} hint="Confirmed by a payment provider" />
        <StatCard label="Paid: seller confirmed" value={d.paid_orders.seller_confirmed} hint="The seller's own confirmation" />
        <StatCard label="Refunds owed" value={d.refunds_due} tone={d.refunds_due ? 'warn' : 'default'} /><StatCard label="Open reports" value={d.open_reports} tone={d.open_reports ? 'warn' : 'default'} />
        <StatCard label="Open disputes" value={d.open_disputes} tone={d.open_disputes ? 'warn' : 'default'} /><StatCard label="Commission recorded" value={money(d.commission_recorded)} hint="Not collected automatically" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Card title="Sellers by status">{Object.keys(d.sellers).length === 0 ? <p className="text-sm text-slate-500">No sellers yet.</p> : <ul className="text-sm divide-y">{Object.entries(d.sellers).map(([k, v]) => <li key={k} className="flex justify-between py-1"><span>{k}</span><strong>{v}</strong></li>)}</ul>}</Card>
        <Card title="Listings by status">{Object.keys(d.products).length === 0 ? <p className="text-sm text-slate-500">No listings yet.</p> : <ul className="text-sm divide-y">{Object.entries(d.products).map(([k, v]) => <li key={k} className="flex justify-between py-1"><span>{k.replaceAll('_', ' ')}</span><strong>{v}</strong></li>)}</ul>}</Card>
      </div>
      <p className="text-xs text-slate-500">Online payment providers are not connected. “Provider verified” will stay at 0 until one is integrated.</p>
    </div>
  )
}

function Sellers() {
  const { hasPermission } = useAuth()
  const [status, setStatus] = useState('pending'); const [page, setPage] = useState(1)
  const q = useAsync(() => adminMarketAPI.sellers({ status: status || undefined, page }), [status, page])
  const act = (id, a) => async (note) => { await adminMarketAPI.sellerAct(id, a, note); toast.success('Done'); q.reload() }
  return (
    <div className="space-y-3">
      <Field label="Show" id="seller-status"><select id="seller-status" className={inputCls + ' max-w-xs'} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
        <option value="">All</option>{['pending', 'unverified', 'verified', 'rejected', 'suspended'].map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Table q={q} listKey="sellers" page={page} setPage={setPage} empty="No sellers match" head={['Seller', 'Type', 'Status', 'Listings', 'Details', 'Actions']}
        render={(s) => (
          <tr key={s.id} className="border-b last:border-0 align-top">
            <td className="py-2 pr-3"><p className="font-medium">{s.business_name}</p><p className="text-xs text-slate-500">{s.owner_name} · {s.owner_email}</p></td>
            <td className="pr-3">{s.seller_type}</td><td className="pr-3"><Badge color={col[s.verification_status]}>{s.verification_status}</Badge></td><td className="pr-3">{s.listings}</td>
            <td className="pr-3 text-xs">{s.registration_number ? `Reg: ${s.registration_number}` : 'No registration number'}{s.verification_note ? <><br />{s.verification_note}</> : null}</td>
            <td><div className="flex flex-wrap gap-1">{hasPermission('marketplace.verify_sellers') && (<>
              {['pending', 'unverified', 'rejected'].includes(s.verification_status) && <NoteAction label="Verify" title={`Verify ${s.business_name}?`} message="Only verify after you have checked their identity or registration. Say what you checked." minLen={5} onSubmit={act(s.id, 'verify')} />}
              {['pending', 'unverified', 'verified'].includes(s.verification_status) && <NoteAction label="Reject" danger title="Reject verification?" message="The seller will see your reason." onSubmit={act(s.id, 'reject')} />}
              {s.verification_status !== 'suspended' ? <NoteAction label="Suspend" danger title="Suspend this seller?" message="All their listings disappear and they cannot sell." onSubmit={act(s.id, 'suspend')} />
                : <NoteAction label="Restore" title="Restore this seller?" minLen={0} onSubmit={act(s.id, 'restore')} />}</>)}</div></td>
          </tr>)} />
    </div>
  )
}

function Listings() {
  const [status, setStatus] = useState('pending_review'); const [page, setPage] = useState(1)
  const q = useAsync(() => adminMarketAPI.products({ status: status || undefined, page }), [status, page])
  const act = (id, a) => async (note) => { await adminMarketAPI.productAct(id, a, note); toast.success('Done'); q.reload() }
  return (
    <div className="space-y-3">
      <Field label="Show" id="prod-status"><select id="prod-status" className={inputCls + ' max-w-xs'} value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
        <option value="">All</option>{['pending_review', 'active', 'rejected', 'paused', 'sold_out', 'draft', 'removed'].map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></Field>
      <Table q={q} listKey="products" page={page} setPage={setPage} empty="No listings match" head={['Listing', 'Seller', 'Category', 'Price', 'Status', 'Actions']}
        render={(p) => (
          <tr key={p.id} className="border-b last:border-0 align-top">
            <td className="py-2 pr-3"><p className="font-medium">{p.title}</p><p className="text-xs text-slate-500 max-w-xs truncate">{p.description}</p></td>
            <td className="pr-3">{p.seller.business_name}<br /><Badge color={p.seller.verified ? 'green' : 'slate'}>{p.seller.verified ? 'verified' : 'not verified'}</Badge></td>
            <td className="pr-3">{p.category.name}{p.regulated && <><br /><Badge color="amber">regulated</Badge></>}</td><td className="pr-3">{money(p.retail_price)}</td>
            <td className="pr-3"><Badge color={col[p.status] || 'slate'}>{p.status.replaceAll('_', ' ')}</Badge></td>
            <td><div className="flex flex-wrap gap-1">
              {p.status === 'pending_review' && <button type="button" className="px-2 py-1 rounded border text-xs" onClick={() => act(p.id, 'approve')('').catch((e) => toast.error(errorMessage(e)))}>Approve</button>}
              {['pending_review', 'active'].includes(p.status) && <NoteAction label="Reject" danger title="Reject this listing?" message="The seller sees your reason and can fix it." onSubmit={act(p.id, 'reject')} />}
              {p.status !== 'removed' && <NoteAction label="Remove" danger title="Remove this listing?" message="It disappears from the marketplace." onSubmit={act(p.id, 'remove')} />}</div></td>
          </tr>)} />
    </div>
  )
}

function Orders() {
  const [f, setF] = useState({ status: '', payment_basis: '' }); const [page, setPage] = useState(1)
  const q = useAsync(() => adminMarketAPI.orders({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page }), [f.status, f.payment_basis, page])
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Order status" id="o-st"><select id="o-st" className={inputCls} value={f.status} onChange={(e) => { setPage(1); setF({ ...f, status: e.target.value }) }}><option value="">Any</option>{['pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'completed', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Payment basis" id="o-pb"><select id="o-pb" className={inputCls} value={f.payment_basis} onChange={(e) => { setPage(1); setF({ ...f, payment_basis: e.target.value }) }}><option value="">Any</option><option value="provider_verified">Provider verified</option><option value="seller_confirmed">Seller confirmed</option></select></Field>
      </div>
      <Table q={q} listKey="orders" page={page} setPage={setPage} empty="No orders" head={['Order', 'Seller', 'Total', 'Status', 'Payment']}
        render={(o) => (<tr key={o.id} className="border-b last:border-0"><td className="py-2 pr-3 font-medium">{o.order_number}<br /><span className="text-xs text-slate-500">{fmtDate(o.created_at)}</span></td>
          <td className="pr-3">{o.seller.business_name}</td><td className="pr-3">{money(o.total)}</td><td className="pr-3"><Badge color="blue">{o.status}</Badge></td>
          <td><Badge color={col[o.payment_status] || 'slate'}>{o.payment_status.replaceAll('_', ' ')}</Badge>{o.payment_basis && <p className="text-xs text-slate-500">{o.payment_basis === 'provider_verified' ? 'Provider verified' : 'Seller confirmed'}</p>}</td></tr>)} />
    </div>
  )
}

function Payments() {
  const [page, setPage] = useState(1)
  const q = useAsync(() => adminMarketAPI.payments({ page }), [page])
  return (
    <div className="space-y-3">
      {q.data?.note && <p className="text-sm text-slate-600">{q.data.note}</p>}
      <Table q={q} listKey="payments" page={page} setPage={setPage} empty="No payments" head={['Order', 'Method', 'Amount', 'Status', 'Buyer reference']}
        render={(p) => (<tr key={p.id} className="border-b last:border-0"><td className="py-2 pr-3">{p.order_number}</td><td className="pr-3">{p.provider.replaceAll('_', ' ')}</td><td className="pr-3">{money(p.amount)}</td>
          <td className="pr-3"><Badge color={p.status === 'verified' ? 'green' : p.status === 'seller_confirmed' ? 'blue' : p.status === 'failed' || p.status === 'amount_mismatch' ? 'red' : 'slate'}>{p.status.replaceAll('_', ' ')}</Badge></td><td className="text-xs">{p.buyer_reference || '—'}</td></tr>)} />
    </div>
  )
}

function Reports() {
  const [page, setPage] = useState(1)
  const q = useAsync(() => adminMarketAPI.reports({ status: 'open', page }), [page])
  const resolve = (id) => async (note, action) => { await adminMarketAPI.resolveReport(id, action || 'dismiss', note); toast.success('Report closed'); q.reload() }
  return (
    <Table q={q} listKey="reports" page={page} setPage={setPage} empty="No open reports" head={['Target', 'Reason', 'Details', 'Decision']}
      render={(r) => (<tr key={r.id} className="border-b last:border-0 align-top"><td className="py-2 pr-3">{r.target_type} #{r.target_id}</td><td className="pr-3">{r.reason.replaceAll('_', ' ')}</td><td className="pr-3 text-xs">{r.details}</td>
        <td><NoteAction label="Decide" title="Resolve this report" onSubmit={resolve(r.id)}>
          {(extra, setExtra) => <Field label="Action" id={`ra-${r.id}`}><select id={`ra-${r.id}`} className={inputCls} value={extra || 'dismiss'} onChange={(e) => setExtra(e.target.value)}>
            <option value="dismiss">Dismiss (no action)</option><option value="remove_product">Remove the product</option><option value="suspend_seller">Suspend the seller</option><option value="hide_review">Hide the review</option></select></Field>}</NoteAction></td></tr>)} />
  )
}

function Disputes() {
  const [page, setPage] = useState(1)
  const q = useAsync(() => adminMarketAPI.disputes({ status: 'open', page }), [page])
  const resolve = (id) => async (note, res) => { await adminMarketAPI.resolveDispute(id, res || 'settled', note); toast.success('Dispute resolved'); q.reload() }
  return (
    <Table q={q} listKey="disputes" page={page} setPage={setPage} empty="No open disputes" head={['Order', 'Total', 'Reason', 'Payment', 'Decision']}
      render={(d) => (<tr key={d.id} className="border-b last:border-0 align-top"><td className="py-2 pr-3">{d.order_number}</td><td className="pr-3">{money(d.total)}</td><td className="pr-3">{d.reason.replaceAll('_', ' ')}<br /><span className="text-xs">{d.details}</span></td><td className="pr-3"><Badge color={col[d.payment_status] || 'slate'}>{d.payment_status.replaceAll('_', ' ')}</Badge></td>
        <td><NoteAction label="Resolve" title="Resolve this dispute" minLen={5} message="Explain the decision. A decision for the buyer on a paid order marks a refund as owed; SmartAgri does not move money." onSubmit={resolve(d.id)}>
          {(extra, setExtra) => <Field label="Decision" id={`dr-${d.id}`}><select id={`dr-${d.id}`} className={inputCls} value={extra || 'settled'} onChange={(e) => setExtra(e.target.value)}>
            <option value="settled">Settled between them</option><option value="in_favour_of_buyer">In favour of the buyer</option><option value="in_favour_of_seller">In favour of the seller</option></select></Field>}</NoteAction></td></tr>)} />
  )
}

function Reviews() {
  const [page, setPage] = useState(1)
  const q = useAsync(() => adminMarketAPI.reviews({ page }), [page])
  const act = async (id, a) => { try { await adminMarketAPI.reviewAct(id, a); q.reload() } catch (e) { toast.error(errorMessage(e)) } }
  return (
    <Table q={q} listKey="reviews" page={page} setPage={setPage} empty="No reviews" head={['Rating', 'Comment', 'Status', '']}
      render={(r) => (<tr key={r.id} className="border-b last:border-0"><td className="py-2 pr-3">{'★'.repeat(r.rating)}</td><td className="pr-3">{r.comment}</td><td className="pr-3"><Badge color={r.status === 'published' ? 'green' : 'slate'}>{r.status}</Badge></td>
        <td><button type="button" className="px-2 py-1 rounded border text-xs" onClick={() => act(r.id, r.status === 'published' ? 'hide' : 'publish')}>{r.status === 'published' ? 'Hide' : 'Publish'}</button></td></tr>)} />
  )
}

function Categories() {
  const q = useAsync(() => adminMarketAPI.categories(), [])
  const [name, setName] = useState(''); const [group, setGroup] = useState('produce'); const [reg, setReg] = useState(false)
  const add = async (e) => { e.preventDefault(); try { await adminMarketAPI.addCategory({ name, group, regulated: reg }); setName(''); q.reload(); toast.success('Category added') } catch (er) { toast.error(errorMessage(er)) } }
  const toggle = async (c, k) => { try { await adminMarketAPI.setCategory(c.id, { [k]: !c[k] }); q.reload() } catch (er) { toast.error(errorMessage(er)) } }
  return (
    <div className="space-y-3">
      <form onSubmit={add} className="grid sm:grid-cols-4 gap-3 items-end" aria-label="Add category">
        <Field label="New category name" id="cat-name"><input id="cat-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Group" id="cat-group"><select id="cat-group" className={inputCls} value={group} onChange={(e) => setGroup(e.target.value)}><option value="inputs">Inputs</option><option value="equipment">Equipment</option><option value="produce">Produce</option></select></Field>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={reg} onChange={(e) => setReg(e.target.checked)} /> Regulated</label>
        <button className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm disabled:opacity-50" disabled={name.trim().length < 2}>Add</button>
      </form>
      {q.loading ? <Skeleton /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : (
        <Card><table className="w-full text-sm"><thead><tr className="text-left text-slate-500"><th scope="col">Category</th><th scope="col">Group</th><th scope="col">Regulated</th><th scope="col">Active</th></tr></thead>
          <tbody>{q.data.categories.map((c) => (<tr key={c.id} className="border-t"><td className="py-1.5">{c.name}</td><td>{c.group}</td>
            <td><input type="checkbox" aria-label={`${c.name} regulated`} checked={c.regulated} onChange={() => toggle(c, 'regulated')} /></td>
            <td><input type="checkbox" aria-label={`${c.name} active`} checked={c.active} onChange={() => toggle(c, 'active')} /></td></tr>))}</tbody></table></Card>)}
    </div>
  )
}

function Settings() {
  const q = useAsync(() => adminMarketAPI.settings(), [])
  const [rate, setRate] = useState(null); const [pre, setPre] = useState(null)
  if (q.loading) return <Skeleton />
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />
  const s = q.data.settings
  const save = async () => {
    try { await adminMarketAPI.saveSettings({ commission_rate: rate ?? s.commission_rate, premoderate_all: pre ?? s.premoderate_all === 'true' }); toast.success('Settings saved'); q.reload() }
    catch (e) { toast.error(errorMessage(e)) }
  }
  return (
    <Card title="Marketplace settings">
      <div className="space-y-4 max-w-md">
        <Field label="Commission rate (%) recorded on new orders" id="m-rate"><input id="m-rate" type="number" min="0" max="30" step="0.1" className={inputCls} defaultValue={s.commission_rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">{q.data.notes.commission_rate}</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={s.premoderate_all === 'true'} onChange={(e) => setPre(e.target.checked)} /> Review every new listing before it goes live</label>
        <p className="text-xs text-slate-500">{q.data.notes.premoderate_all}</p>
        <button type="button" className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm" onClick={save}>Save settings</button>
      </div>
    </Card>
  )
}

const VIEWS = { overview: Overview, sellers: Sellers, products: Listings, orders: Orders, payments: Payments, reports: Reports, disputes: Disputes, reviews: Reviews, categories: Categories, settings: Settings }

export default function AdminMarketplace() {
  const { hasPermission } = useAuth()
  const tabs = TABS.filter(([, , perms]) => perms.some(hasPermission))
  const [tab, setTab] = useState(tabs[0]?.[0] || 'overview')
  const View = VIEWS[tab]
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Marketplace</h1>
      <div role="tablist" aria-label="Marketplace sections" className="flex flex-wrap gap-1">
        {tabs.map(([id, label]) => <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
          className={`px-3 py-2 rounded-lg text-sm ${tab === id ? 'bg-emerald-700 text-white' : 'bg-white border text-slate-700'}`}>{label}</button>)}
      </div>
      <div role="tabpanel"><View /></div>
    </div>
  )
}
