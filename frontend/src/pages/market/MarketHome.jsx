import { Link } from 'react-router-dom'
import { marketAPI } from '../../services/api'
import { useLoad, ProductGrid, Loading, Notice } from '../../components/market/bits'

const GROUPS = [['inputs', '🌱 Farm inputs'], ['equipment', '🛠 Equipment'], ['produce', '🌾 Produce']]

function Section({ title, items, to }) {
  if (!items?.length) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2>{to && <Link to={to} className="text-sm text-emerald-800 underline">See all</Link>}</div>
      <ProductGrid items={items} />
    </section>
  )
}

export default function MarketHome() {
  const home = useLoad(() => marketAPI.home(), [])
  const cats = useLoad(() => marketAPI.categories(), [])
  const empty = home.data && !home.data.recent.length && !home.data.upcoming_harvests.length
  return (
    <div className="space-y-8">
      <section className="rounded-3xl p-6 sm:p-8 text-white" style={{ background: 'linear-gradient(135deg,#14532D,#2E7D32)' }}>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold">Buy and sell farm products across Sierra Leone</h1>
        <p className="mt-2 text-white/85 max-w-2xl">Seeds, tools and fresh produce from farmers, cooperatives and suppliers. Contact details stay private until you place an order.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/market/search" className="px-4 py-2 rounded-lg bg-white text-emerald-900 font-medium">Browse everything</Link>
          <Link to="/market/sell" className="px-4 py-2 rounded-lg border border-white/60">Start selling</Link>
        </div>
      </section>

      <section aria-label="Categories" className="space-y-3">
        {GROUPS.map(([g, label]) => (
          <div key={g}>
            <h2 className="font-semibold mb-2">{label}</h2>
            <div className="flex flex-wrap gap-2">
              {(cats.data?.categories || []).filter((c) => c.group === g).map((c) => (
                <Link key={c.slug} to={`/market/search?category=${c.slug}`} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-emerald-600">
                  {c.name}{c.listings ? <span className="text-slate-500"> · {c.listings}</span> : null}
                </Link>))}
            </div>
          </div>))}
      </section>

      {home.loading && <Loading />}
      {home.error && <Notice tone="bad">Could not load the marketplace. Please try again.</Notice>}
      {empty && <Notice>No products are listed yet. Be the first: <Link className="underline" to="/market/sell">start selling</Link>.</Notice>}
      {home.data && (
        <>
          <Section title="Recently listed" items={home.data.recent} to="/market/search" />
          <Section title="Local produce" items={home.data.local_produce} to="/market/search?group=produce" />
          <Section title="Wholesale and bulk prices" items={home.data.wholesale} to="/market/search?wholesale=1" />
          <Section title="Upcoming harvests" items={home.data.upcoming_harvests} to="/market/search?type=harvest_forecast" />
          <p className="text-xs text-slate-500">{home.data.note}</p>
        </>
      )}
    </div>
  )
}
