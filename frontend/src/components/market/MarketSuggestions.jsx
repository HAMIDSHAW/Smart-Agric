import { Link } from 'react-router-dom'
import { marketAPI } from '../../services/api'
import { useLoad, ProductGrid } from './bits'

/**
 * Marketplace listings that match a SmartAgri recommendation (for example seeds for the top
 * recommended crop). Clearly labelled as a suggestion, never an advertisement.
 */
export default function MarketSuggestions({ crop, need = 'seeds', title }) {
  const res = useLoad(() => (crop ? marketAPI.suggestions({ crop, need }) : Promise.resolve({ data: { products: [] } })), [crop, need])
  const items = res.data?.products || []
  const heading = title || (need === 'fertilizer' ? `Fertilizer for ${crop}` : need === 'equipment' ? 'Farm equipment' : `Seeds for ${crop}`)
  if (!crop || res.loading || res.error) return null
  return (
    <section aria-label={heading} className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-bark text-sm">🛒 {heading} on the marketplace</h3>
        <Link to={`/market/search?q=${encodeURIComponent(crop)}`} className="text-xs underline">Browse more</Link>
      </div>
      {items.length === 0
        ? <p className="text-xs text-agri-muted">No matching listings yet. <Link className="underline" to="/market/requests">Post a buyer request</Link> so sellers can reach you.</p>
        : <ProductGrid items={items.slice(0, 3)} />}
      <p className="text-xs text-agri-muted">Suggested by SmartAgri from current listings. This is not an advertisement and SmartAgri does not guarantee a product suits your farm. Check with your extension officer.</p>
    </section>
  )
}
