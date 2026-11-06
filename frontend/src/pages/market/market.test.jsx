import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const auth = { user: { id: 1, full_name: 'Buyer B', is_staff: false, permissions: [] }, hasPermission: () => false, loading: false }
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('../../hooks/useAuthedImage', () => ({ default: () => null }))
vi.mock('../../utils/imageQuality', () => ({ processLeafImage: vi.fn(async (f) => ({ blob: f, quality: { isDark: false, isBlurry: false } })) }))
vi.mock('../../services/api', () => {
  const names = ['categories', 'home', 'products', 'product', 'priceContext', 'storefront', 'paymentMethods', 'suggestions', 'cart', 'cartAdd', 'cartSet', 'cartRemove',
    'wishAdd', 'checkout', 'orders', 'order', 'cancelOrder', 'completeOrder', 'payRef', 'review', 'dispute', 'report', 'enquiries', 'enquiry', 'startEnquiry', 'replyEnquiry',
    'requests', 'createRequest', 'sellerRegister', 'sellerProfile', 'sellerUpdate', 'verifyRequest', 'sellerDashboard', 'myProducts', 'createProduct', 'updateProduct',
    'submitProduct', 'pauseProduct', 'resumeProduct', 'setStock', 'deleteProduct', 'addImages', 'deleteImage', 'aiDescribe', 'sellerOrders', 'sellerOrder', 'sellerStatus',
    'confirmPayment', 'markRefunded']
  const marketAPI = Object.fromEntries(names.map((n) => [n, vi.fn()]))
  const anames = ['overview', 'sellers', 'sellerAct', 'products', 'productAct', 'categories', 'addCategory', 'setCategory', 'orders', 'payments', 'reports', 'resolveReport',
    'disputes', 'resolveDispute', 'reviews', 'reviewAct', 'settings', 'saveSettings']
  const adminMarketAPI = Object.fromEntries(anames.map((n) => [n, vi.fn()]))
  return { marketAPI, adminMarketAPI, default: {}, adminAPI: {} }
})
import toast from 'react-hot-toast'
import { marketAPI as M, adminMarketAPI as A } from '../../services/api'
import ProductPage from './ProductPage'
import CartPage from './CartPage'
import Checkout from './Checkout'
import { OrderDetail } from './Orders'
import { SellDashboard } from './Sell'
import { ProductForm } from './SellProducts'
import MarketHome from './MarketHome'
import AdminMarketplace from '../admin/AdminMarketplace'
import MarketSuggestions from '../../components/market/MarketSuggestions'

const ok = (data) => Promise.resolve({ data })
const fail = (error, status = 400) => Promise.reject({ response: { status, data: { error } } })
const seller = { id: 7, business_name: 'Green Valley', seller_type: 'farmer', district: 'Bo', verified: false, verification_status: 'unverified', rating_avg: null, rating_count: 0 }
const prod = (o = {}) => ({ id: 3, title: 'Local rice', listing_type: 'product', unit: 'kg', currency: 'SLE', retail_price: 10, wholesale_price: 7, wholesale_min_qty: 50, min_order_qty: 2, stock_qty: 100,
  in_stock: true, district: 'Bo', status: 'active', category: { slug: 'rice', name: 'Rice' }, regulated: false, images: [], seller, rating_avg: null, rating_count: 0, fulfilment_options: ['pickup'], description: 'Clean rice', reviews: [], ...o })
const at = (ui, path = '/') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/market/product/:id" element={ui} /><Route path="/login" element={<Where />} /><Route path="*" element={ui} /></Routes></MemoryRouter>)
function Where() { const l = useLocation(); return <p>login page from {l.state?.from}</p> }

beforeEach(() => {
  Object.values(M).forEach((f) => f.mockReset()); Object.values(A).forEach((f) => f.mockReset())
  toast.error.mockClear(); toast.success.mockClear()
  auth.user = { id: 1, full_name: 'Buyer B', is_staff: false, permissions: [] }; auth.hasPermission = () => false
  M.priceContext.mockReturnValue(ok({ available: false }))
  M.sellerDashboard.mockReturnValue(ok(null))
})

describe('Product page', () => {
  it('shows honest seller status and switches to the wholesale price at the minimum quantity', async () => {
    M.product.mockReturnValue(ok({ product: prod() }))
    at(<ProductPage />, '/market/product/3')
    expect(await screen.findByRole('heading', { name: 'Local rice' })).toBeInTheDocument()
    expect(screen.getByText('Not verified')).toBeInTheDocument()
    expect(screen.getAllByText('Le 20').length).toBeGreaterThan(0)            // 2 kg x 10 retail
    await userEvent.clear(screen.getByLabelText(/quantity/i)); await userEvent.type(screen.getByLabelText(/quantity/i), '60')
    expect(screen.getByText(/\(wholesale\)/)).toBeInTheDocument(); expect(screen.getAllByText('Le 420').length).toBeGreaterThan(0)    // 60 x 7
  })
  it('adds the chosen quantity to the real cart and shows server refusals', async () => {
    M.product.mockReturnValue(ok({ product: prod() })); M.cartAdd.mockReturnValue(ok({}))
    at(<ProductPage />, '/market/product/3')
    await userEvent.click(await screen.findByRole('button', { name: /add to cart/i }))
    await waitFor(() => expect(M.cartAdd).toHaveBeenCalledWith(3, 2))
    M.cartAdd.mockImplementation(() => fail('Only 1 kg left.'))
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only 1 kg left.'))
  })
  it('sends visitors to sign in and brings them back', async () => {
    auth.user = null
    M.product.mockReturnValue(ok({ product: prod() }))
    at(<ProductPage />, '/market/product/3')
    await userEvent.click(await screen.findByRole('button', { name: /add to cart/i }))
    expect(await screen.findByText(/login page from \/market\/product\/3/)).toBeInTheDocument()
    expect(M.cartAdd).not.toHaveBeenCalled()
  })
  it('does not offer to buy an upcoming harvest', async () => {
    M.product.mockReturnValue(ok({ product: prod({ listing_type: 'harvest_forecast', available_from: '2027-02-01' }) }))
    at(<ProductPage />, '/market/product/3')
    expect(await screen.findByText(/upcoming harvest. You cannot buy it yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to cart/i })).toBeNull()
  })
  it('shows a not-yet-public listing only with a clear owner notice', async () => {
    M.product.mockReturnValue(ok({ product: prod({ status: 'pending_review', moderation_note: 'Add registration' }) }))
    at(<ProductPage />, '/market/product/3')
    expect(await screen.findByText(/only visible to you/i)).toBeInTheDocument()
  })
  it('explains price comparisons come from SmartAgri listings only', async () => {
    M.product.mockReturnValue(ok({ product: prod() }))
    M.priceContext.mockReturnValue(ok({ available: true, min: 8, max: 12, median: 10, unit: 'kg', note: 'Based on other current SmartAgri listings only. It is not an official market price.' }))
    at(<ProductPage />, '/market/product/3')
    expect(await screen.findByText(/not an official market price/i)).toBeInTheDocument()
  })
})

describe('Cart and checkout', () => {
  const cartWith = (over = {}) => ({ groups: [{ seller, subtotal: 20, items: [{ product_id: 3, title: 'Local rice', unit: 'kg', quantity: 2, unit_price: 10, price_tier: 'retail', line_total: 20, image: null, problem: null }] }], total: 20, can_checkout: true, ...over })
  it('blocks checkout and shows the problem when an item became unavailable', async () => {
    const c = cartWith(); c.groups[0].items[0].problem = 'Only 1 kg left.'; c.can_checkout = false
    M.cart.mockReturnValue(ok(c))
    render(<MemoryRouter><CartPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 1 kg left.')
    expect(screen.getByRole('button', { name: /continue to checkout/i })).toBeDisabled()
  })
  it('is honest that online payment is not available and offers only offline methods', async () => {
    M.cart.mockReturnValue(ok(cartWith()))
    M.paymentMethods.mockReturnValue(ok({ methods: [{ id: 'cash_on_delivery', label: 'Pay cash when the goods are delivered', online: false }, { id: 'manual_mobile_money', label: "Send mobile money to the seller's number, then the seller confirms receipt", online: false }] }))
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    expect(await screen.findByText(/Online card or mobile-money payment through SmartAgri is not available yet/)).toBeInTheDocument()
    expect(screen.getAllByRole('radio', { name: /pay cash|mobile money/i })).toHaveLength(2)
  })
  it('places one order with a stable idempotency key even if the button is pressed twice', async () => {
    M.cart.mockReturnValue(ok(cartWith()))
    M.paymentMethods.mockReturnValue(ok({ methods: [{ id: 'manual_mobile_money', label: 'Mobile money', online: false }] }))
    let resolve
    M.checkout.mockImplementation(() => new Promise((r) => { resolve = r }))
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText(/phone number/i), '077123456')
    await userEvent.click(screen.getByRole('radio', { name: /mobile money/i }))
    const btn = screen.getByRole('button', { name: /place order/i })
    await userEvent.dblClick(btn)
    expect(M.checkout).toHaveBeenCalledTimes(1)
    const body = M.checkout.mock.calls[0][0]
    expect(body).toMatchObject({ fulfilment_method: 'pickup', payment_method: 'manual_mobile_money', contact_phone: '077123456' })
    expect(body.idempotency_key.length).toBeGreaterThanOrEqual(8)
    resolve({ data: { orders: [{ id: 9, order_number: 'SA-1', total: 20, seller, pay_to: { mobile_money_number: '076000111', note: 'The order is only marked paid when the seller confirms receipt.' } }] } })
    expect(await screen.findByText(/Nothing is marked paid until the seller confirms/)).toBeInTheDocument()
    expect(screen.getByText('076000111')).toBeInTheDocument()
  })
  it('asks for an address when delivery is chosen and shows server errors', async () => {
    M.cart.mockReturnValue(ok(cartWith()))
    M.paymentMethods.mockReturnValue(ok({ methods: [{ id: 'cash_on_delivery', label: 'Cash', online: false }] }))
    M.checkout.mockImplementation(() => fail('Rice: Only 1 kg left.', 409))
    render(<MemoryRouter><Checkout /></MemoryRouter>)
    await screen.findByLabelText(/phone number/i)
    expect(screen.queryByLabelText(/delivery address/i)).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: /seller delivers/i }))
    expect(screen.getByLabelText(/delivery address/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/delivery address/i), '12 Mile Rd')
    await userEvent.type(screen.getByLabelText(/phone number/i), '077123456')
    await userEvent.click(screen.getByRole('button', { name: /place order/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Rice: Only 1 kg left.'))
  })
})

describe('Order detail (buyer)', () => {
  const order = (o = {}) => ({ id: 9, order_number: 'SA-1', status: 'pending', payment_status: 'unpaid', payment_method: 'manual_mobile_money', fulfilment_method: 'pickup', total: 20, seller,
    items: [{ id: 1, product_id: 3, title: 'Local rice', unit: 'kg', quantity: 2, unit_price: 10, price_tier: 'retail', line_total: 20 }], events: [{ kind: 'status', value: 'pending', note: 'Order placed', at: '2026-11-01T10:00:00' }], ...o })
  const view = () => render(<MemoryRouter initialEntries={['/market/orders/9']}><Routes><Route path="/market/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>)
  it('treats a typed mobile-money reference as a claim and sends it to the seller', async () => {
    M.order.mockReturnValue(ok({ order: order({ pay_to: { mobile_money_number: '076000111', note: 'The order is only marked paid when the seller confirms receipt.' } }) }))
    M.payRef.mockReturnValue(ok({}))
    view()
    const paid = await screen.findByRole('button', { name: /i have paid/i })
    expect(paid).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/transaction reference/i), 'MM12345678')
    await userEvent.click(paid)
    await waitFor(() => expect(M.payRef).toHaveBeenCalledWith(9, 'MM12345678'))
  })
  it('labels seller-confirmed payments as not provider verified and hides self-cancel once paid', async () => {
    M.order.mockReturnValue(ok({ order: order({ payment_status: 'paid', payment_basis: 'seller_confirmed', payment_notice: 'Confirmed by the seller. Not verified by a payment provider.' }) }))
    view()
    expect(await screen.findByText(/Not verified by a payment provider/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel order/i })).toBeNull()
  })
  it('lets the buyer confirm receipt, and offers reviews only after completion', async () => {
    M.order.mockReturnValue(ok({ order: order({ status: 'delivered' }) }))
    view()
    expect(await screen.findByRole('button', { name: /i received my order/i })).toBeInTheDocument()
    expect(screen.queryByText(/review your items/i)).toBeNull()
  })
  it('posts a review for a completed order', async () => {
    M.order.mockReturnValue(ok({ order: order({ status: 'completed', payment_status: 'paid' }) })); M.review.mockReturnValue(ok({}))
    view()
    await userEvent.selectOptions(await screen.findByLabelText('Rating'), '5')
    await userEvent.click(screen.getByRole('button', { name: /post review/i }))
    await waitFor(() => expect(M.review).toHaveBeenCalledWith(9, expect.objectContaining({ product_id: 3, rating: 5 })))
  })
  it('explains a refund is arranged outside SmartAgri', async () => {
    M.order.mockReturnValue(ok({ order: order({ status: 'cancelled', payment_status: 'refund_due' }) }))
    view()
    expect(await screen.findByText(/SmartAgri does not hold or move money/)).toBeInTheDocument()
  })
})

describe('Seller tools', () => {
  it('invites a new seller to register and explains regulated products', async () => {
    M.sellerProfile.mockReturnValue(ok({ profile: null }))
    render(<MemoryRouter><SellDashboard /></MemoryRouter>)
    expect(await screen.findByText(/Start selling on SmartAgri/)).toBeInTheDocument()
    expect(screen.getByText(/pesticides need a verified seller/i)).toBeInTheDocument()
    M.sellerRegister.mockReturnValue(ok({}))
    await userEvent.type(screen.getByLabelText(/shop or business name/i), 'Green Valley Farm')
    await userEvent.click(screen.getByRole('button', { name: /register as a seller/i }))
    await waitFor(() => expect(M.sellerRegister).toHaveBeenCalledWith(expect.objectContaining({ business_name: 'Green Valley Farm', seller_type: 'farmer' })))
  })
  it('shows real dashboard figures, low stock and what the numbers mean; verification is never automatic', async () => {
    M.sellerProfile.mockReturnValue(ok({ profile: { id: 7, business_name: 'Green Valley', verification_status: 'unverified', mobile_money_number: '076' } }))
    M.sellerDashboard.mockReturnValue(ok({ window_days: 30, notes: ['Paid revenue = only orders marked paid.'], low_stock: [{ id: 1, title: 'Maize seed', stock_qty: 3, unit: 'kg' }], sales_by_day: [{ date: '2026-11-01', orders: 1, sales: 20 }],
      figures: { total_orders: 3, pending_orders: 1, completed_orders: 1, cancelled_orders: 1, gross_sales: 70, paid_revenue: 20, active_listings: 2, listings_awaiting_review: 0, rating_avg: null, rating_count: 0 } }))
    render(<MemoryRouter><SellDashboard /></MemoryRouter>)
    expect(await screen.findByText('Le 70')).toBeInTheDocument(); expect(screen.getByText('Le 20')).toBeInTheDocument()
    expect(screen.getByText(/Low stock:/).parentElement).toHaveTextContent('Maize seed (3 kg)')
    expect(screen.getByText('No reviews')).toBeInTheDocument()
    expect(screen.getByText(/An administrator checks your details; it is not automatic/)).toBeInTheDocument()
    M.verifyRequest.mockReturnValue(ok({}))
    await userEvent.click(screen.getByRole('button', { name: /request verification/i }))
    await waitFor(() => expect(M.verifyRequest).toHaveBeenCalled())
  })
})

describe('Listing form (camera / gallery / AI draft)', () => {
  const form = (path = '/market/sell/products/new') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/market/sell/products/new" element={<ProductForm />} /><Route path="/market/sell/products" element={<p>my listings</p>} /></Routes></MemoryRouter>)
  beforeEach(() => M.categories.mockReturnValue(ok({ categories: [{ slug: 'rice', name: 'Rice', group: 'produce', regulated: false }, { slug: 'pesticides', name: 'Approved pesticides', group: 'inputs', regulated: true }] })))

  it('uses the shared camera and gallery component and warns about regulated products', async () => {
    form()
    expect(await screen.findByRole('button', { name: /take photo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /choose from gallery/i })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'pesticides')
    expect(screen.getByText(/regulated product. Only verified sellers can publish it/i)).toBeInTheDocument()
  })
  it('labels the AI description as a draft the seller must check', async () => {
    M.aiDescribe.mockReturnValue(ok({ description: 'Clean local rice from Bo.', note: 'AI draft. Check it is accurate before you publish.' }))
    form()
    await userEvent.type(await screen.findByLabelText('Title'), 'Local rice')
    await userEvent.click(screen.getByRole('button', { name: /draft with ai/i }))
    expect(await screen.findByDisplayValue('Clean local rice from Bo.')).toBeInTheDocument()
    expect(screen.getByText(/AI draft. AI draft. Check it is accurate/)).toBeInTheDocument()
  })
  it('creates the listing, uploads the chosen photos, then publishes', async () => {
    M.createProduct.mockReturnValue(ok({ product: { id: 55 } })); M.addImages.mockReturnValue(ok({})); M.submitProduct.mockReturnValue(ok({}))
    form()
    await userEvent.type(await screen.findByLabelText('Title'), 'Local rice')
    await userEvent.type(screen.getByLabelText(/retail price/i), '10'); await userEvent.type(screen.getByLabelText('Stock'), '40')
    fireEvent.change(screen.getByTestId('gallery-input'), { target: { files: [new File([new Uint8Array(900)], 'rice.jpg', { type: 'image/jpeg' })] } })
    await screen.findByRole('img', { name: /preview of rice\.jpg/i })
    await userEvent.click(screen.getByRole('button', { name: /save and publish/i }))
    await waitFor(() => expect(M.submitProduct).toHaveBeenCalledWith(55))
    const fd = M.addImages.mock.calls[0][1]
    expect(M.addImages.mock.calls[0][0]).toBe(55); expect(fd).toBeInstanceOf(FormData); expect(fd.getAll('images')).toHaveLength(1)
    expect(M.createProduct.mock.calls[0][0]).toMatchObject({ title: 'Local rice', retail_price: '10', wholesale_price: null })
  })
  it('shows the server message when publishing is refused', async () => {
    M.createProduct.mockReturnValue(ok({ product: { id: 5 } })); M.submitProduct.mockImplementation(() => fail('Add at least one photo before publishing.'))
    form()
    await userEvent.type(await screen.findByLabelText('Title'), 'Local rice'); await userEvent.type(screen.getByLabelText(/retail price/i), '10'); await userEvent.type(screen.getByLabelText('Stock'), '4')
    await userEvent.click(screen.getByRole('button', { name: /save and publish/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Add at least one photo before publishing.'))
  })
})

describe('Marketplace home and suggestions', () => {
  it('shows categories and an honest empty state', async () => {
    M.home.mockReturnValue(ok({ recent: [], wholesale: [], local_produce: [], upcoming_harvests: [], note: 'x' }))
    M.categories.mockReturnValue(ok({ categories: [{ slug: 'seeds', name: 'Seeds and seedlings', group: 'inputs', listings: 0 }] }))
    render(<MemoryRouter><MarketHome /></MemoryRouter>)
    expect(await screen.findByText(/No products are listed yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Seeds and seedlings/ })).toHaveAttribute('href', '/market/search?category=seeds')
  })
  it('labels AI/recommendation suggestions as not advertisements', async () => {
    M.suggestions.mockReturnValue(ok({ products: [prod({ title: 'Hybrid maize seed' })], sponsored: false }))
    render(<MemoryRouter><MarketSuggestions crop="maize" need="seeds" /></MemoryRouter>)
    expect(await screen.findByText('Hybrid maize seed')).toBeInTheDocument()
    expect(screen.getByText(/This is not an advertisement/)).toBeInTheDocument()
  })
  it('says so when nothing matches instead of inventing products', async () => {
    M.suggestions.mockReturnValue(ok({ products: [] }))
    render(<MemoryRouter><MarketSuggestions crop="cocoa" need="seeds" /></MemoryRouter>)
    expect(await screen.findByText(/No matching listings yet/)).toBeInTheDocument()
  })
})

describe('Admin marketplace', () => {
  const sellerRow = { id: 7, business_name: 'Green Valley', seller_type: 'farmer', verification_status: 'pending', owner_name: 'Ada', owner_email: 'a@x.sl', listings: 2, registration_number: 'RC-1', verified: false }
  it('shows only the sections the admin may use', async () => {
    auth.hasPermission = (p) => p === 'marketplace.verify_sellers'
    A.overview.mockReturnValue(ok({ sellers: {}, products: {}, orders_total: 0, gross_sales: 0, paid_orders: { provider_verified: 0, seller_confirmed: 0 }, refunds_due: 0, open_reports: 0, open_disputes: 0, commission_recorded: 0 }))
    render(<AdminMarketplace />)
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['Overview', 'Sellers'])
  })
  it('keeps provider-verified and seller-confirmed payments apart on the overview', async () => {
    auth.hasPermission = () => true
    A.overview.mockReturnValue(ok({ sellers: { pending: 1 }, products: { active: 3 }, orders_total: 4, gross_sales: 400, paid_orders: { provider_verified: 0, seller_confirmed: 2 }, refunds_due: 0, open_reports: 0, open_disputes: 0, commission_recorded: 0 }))
    render(<AdminMarketplace />)
    expect(await screen.findByText('Paid: seller confirmed')).toBeInTheDocument()
    expect(screen.getByText('Paid: provider verified')).toBeInTheDocument()
    expect(screen.getByText(/“Provider verified” will stay at 0 until one is integrated/)).toBeInTheDocument()
  })
  it('verifying a seller requires a written check and calls the server', async () => {
    auth.hasPermission = () => true
    A.overview.mockReturnValue(ok({ sellers: {}, products: {}, orders_total: 0, gross_sales: 0, paid_orders: { provider_verified: 0, seller_confirmed: 0 }, refunds_due: 0, open_reports: 0, open_disputes: 0, commission_recorded: 0 }))
    A.sellers.mockReturnValue(ok({ sellers: [sellerRow], total: 1, pages: 1 })); A.sellerAct.mockReturnValue(ok({}))
    render(<AdminMarketplace />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Sellers' }))
    await userEvent.click(await screen.findByRole('button', { name: /^verify$/i }))
    const dlg = screen.getByRole('dialog', { name: /verify green valley/i })
    const go = within(dlg).getByRole('button', { name: /^verify$/i })
    expect(go).toBeDisabled()
    await userEvent.type(within(dlg).getByLabelText(/note/i), 'Saw certificate RC-1')
    await userEvent.click(go)
    await waitFor(() => expect(A.sellerAct).toHaveBeenCalledWith(7, 'verify', 'Saw certificate RC-1'))
  })
})
