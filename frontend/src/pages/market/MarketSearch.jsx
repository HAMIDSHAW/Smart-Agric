import { useSearchParams } from 'react-router-dom'
import { marketAPI } from '../../services/api'
import { useLoad, ProductGrid, Loading, Notice } from '../../components/market/bits'

const DISTRICTS = ['Bo', 'Bombali', 'Bonthe', 'Falaba', 'Kailahun', 'Kambia', 'Karene', 'Kenema', 'Koinadugu', 'Kono', 'Moyamba', 'Port Loko', 'Pujehun', 'Tonkolili', 'Western Area Rural', 'Western Area Urban']

export default function MarketSearch() {
  const [sp, setSp] = useSearchParams()
  const params = Object.fromEntries(sp.entries())
  const cats = useLoad(() => marketAPI.categories(), [])
  const res = useLoad(() => marketAPI.products({ ...params, per_page: 12 }), [sp.toString()])
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); n.delete('page'); setSp(n) }
  const page = Number(params.page || 1)
  const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm w-full'
  return (
    <div className="grid lg:grid-cols-[16rem_1fr] gap-5">
      <aside aria-label="Filters" className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3 h-fit">
        <h1 className="font-semibold">Filters</h1>
        <div><label className="text-sm font-medium" htmlFor="s-q">Search</label><input id="s-q" className={field} defaultValue={params.q || ''} onKeyDown={(e) => e.key === 'Enter' && set('q', e.target.value)} onBlur={(e) => set('q', e.target.value)} /></div>
        <div><label className="text-sm font-medium" htmlFor="s-cat">Category</label>
          <select id="s-cat" className={field} value={params.category || ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">All categories</option>
            {(cats.data?.categories || []).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select></div>
        <div><label className="text-sm font-medium" htmlFor="s-dist">District</label>
          <select id="s-dist" className={field} value={params.district || ''} onChange={(e) => set('district', e.target.value)}>
            <option value="">Anywhere</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-sm font-medium" htmlFor="s-min">Min price</label><input id="s-min" type="number" min="0" className={field} defaultValue={params.min_price || ''} onBlur={(e) => set('min_price', e.target.value)} /></div>
          <div><label className="text-sm font-medium" htmlFor="s-max">Max price</label><input id="s-max" type="number" min="0" className={field} defaultValue={params.max_price || ''} onBlur={(e) => set('max_price', e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={params.wholesale === '1'} onChange={(e) => set('wholesale', e.target.checked ? '1' : '')} /> Wholesale prices only</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={params.type === 'harvest_forecast'} onChange={(e) => set('type', e.target.checked ? 'harvest_forecast' : '')} /> Upcoming harvests only</label>
        <div><label className="text-sm font-medium" htmlFor="s-sort">Sort by</label>
          <select id="s-sort" className={field} value={params.sort || ''} onChange={(e) => set('sort', e.target.value)}>
            <option value="">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></div>
        <button type="button" className="text-sm underline" onClick={() => setSp({})}>Clear filters</button>
      </aside>
      <section aria-live="polite" className="space-y-3">
        {res.loading && <Loading />}
        {res.error && <Notice tone="bad">{res.error.response?.data?.error || 'Could not load products.'}</Notice>}
        {res.data && <p className="text-sm text-slate-600">{res.data.total} result(s)</p>}
        {res.data && res.data.products.length === 0 && <Notice>No products match. Try fewer filters.</Notice>}
        {res.data && <ProductGrid items={res.data.products} />}
        {res.data && res.data.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between pt-2 text-sm">
            <button className="px-3 py-2 rounded-lg border disabled:opacity-40" disabled={page <= 1} onClick={() => { const n = new URLSearchParams(sp); n.set('page', page - 1); setSp(n) }}>Previous</button>
            <span>Page {page} of {res.data.pages}</span>
            <button className="px-3 py-2 rounded-lg border disabled:opacity-40" disabled={page >= res.data.pages} onClick={() => { const n = new URLSearchParams(sp); n.set('page', page + 1); setSp(n) }}>Next</button>
          </nav>)}
      </section>
    </div>
  )
}
