import { Link, useParams } from 'react-router-dom'
import { marketAPI } from '../../services/api'
import { useLoad, ProductGrid, Loading, Notice, Stars, VerifiedBadge } from '../../components/market/bits'

export default function Storefront() {
  const { id } = useParams()
  const res = useLoad(() => marketAPI.storefront(id), [id])
  if (res.loading) return <Loading />
  if (res.error) return <Notice tone="bad">This seller is not available. <Link to="/market" className="underline">Back to the marketplace</Link></Notice>
  const { seller, products, reviews } = res.data
  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{seller.business_name}</h1><VerifiedBadge seller={seller} /></div>
        <p className="text-sm text-slate-600">{seller.seller_type} · {seller.district || 'Sierra Leone'} · Member since {seller.member_since}</p>
        <Stars value={seller.rating_avg} count={seller.rating_count} />
        {seller.description && <p>{seller.description}</p>}
        {!seller.verified && <Notice tone="warn">This seller has not been verified by SmartAgri. Check the listing and agree delivery and payment carefully.</Notice>}
      </header>
      <h2 className="font-semibold">Listings ({products.length})</h2>
      {products.length === 0 ? <Notice>No live listings right now.</Notice> : <ProductGrid items={products} />}
      {reviews.length > 0 && <section><h2 className="font-semibold mb-2">Recent reviews</h2><ul className="space-y-2">{reviews.map((r, i) => <li key={i} className="text-sm"><span className="text-amber-600">{'★'.repeat(r.rating)}</span> <strong>{r.buyer}</strong> {r.comment}</li>)}</ul></section>}
    </div>
  )
}
