# SmartAgri Marketplace (Phase 5)

## What works now
Buying: browse/search/filter, product pages, seller storefronts, cart, wishlist, checkout (one order per seller), order history and tracking, reviews (after the buyer confirms receipt), reports, disputes, private enquiry threads, buyer requests ("I want 2 tonnes of cassava").
Selling: seller registration, profile, verification request, listings with photos from **camera or gallery** (shared capture component, server-side image validation), retail + wholesale price tiers, minimum order, stock, pause/resume, an AI-drafted description (labelled, must be reviewed), orders received with status updates, payment confirmation, a dashboard built only from database records.
Admin (`/admin/marketplace`): overview, seller verification/suspension, listing approval/rejection/removal, categories (including the regulated flag), orders, payments, reports, disputes, review moderation, settings (commission record, "review every listing"). Every action needs a note and is written to the audit log.
SmartAgri intelligence: crop recommendation results show matching seed listings; `GET /api/marketplace/suggestions` returns matches labelled `sponsored: false`; the product page compares price with **other SmartAgri listings only** and says nothing when fewer than 3 exist.

## Payments: what is real and what is not
**No online payment provider is connected.** Providers that cover Sierra Leone exist (for example Monime, pawaPay's Orange Money corridor, Orange Money Web Payment) but each needs a merchant account, credentials and its current API/webhook specification, which cannot be verified from this repository. Nothing here pretends otherwise.

Methods available today (all OFFLINE, money never passes through SmartAgri):
| Method | How it becomes "paid" |
|---|---|
| Cash on delivery / pay on pickup | The seller presses "I received the payment". |
| Manual mobile money | Buyer pays the seller's own wallet number and types the transaction reference (a claim, not proof). The seller checks their wallet and confirms. |

An order is `paid` only when (a) the seller confirms receipt: shown everywhere as "Confirmed by the seller. Not verified by a payment provider.", or (b) a registered provider's signed webhook matches the reference **and exact amount/currency**: shown as "Verified by the payment provider." Nothing the browser sends can mark an order paid (tested). Commission is recorded on each order for reporting only; SmartAgri does not collect it. Refunds are never automatic: a cancelled/disputed paid order becomes `refund_due` and the seller marks it refunded after repaying outside SmartAgri.

### Adding a real provider later
`app/services/payments.py` contains the framework: subclass `ProviderAdapter` (signature check + field mapping), `register()` it, and add the provider's "start payment" call. The webhook endpoint `POST /api/marketplace/payments/webhook/<provider>` already verifies the signature, rejects forged calls (and logs a security event), is idempotent per `event_id`, ignores replays, flags amount/currency mismatches instead of marking paid, and updates the order only through a verified match. It returns 404 until an adapter is registered. Tests use a clearly named test adapter; none is registered in production. You will need from the provider: merchant onboarding, API keys, the webhook signing method and sandbox access.

## Delivery
No delivery network exists. Sellers choose pickup, seller delivery, or "buyer arranges transport". The UI says so.

## Trust and safety
- "Verified" is set only by a marketplace administrator who must record what they checked. Unverified sellers are labelled "Not verified" on every card and page.
- Regulated categories (pesticides, herbicides, crop protection) need a verified seller and admin approval before going live. Admins can mark any category regulated.
- Suspended sellers' listings disappear and they cannot sell. Staff accounts cannot buy or sell.
- Buyer contact numbers are shown only to the seller of that order. Seller phone/email/wallet number are never shown publicly (the wallet number appears only on a buyer's own mobile-money order). Messages never reveal contact details.
- Stock is reserved at checkout with row locks and restored on cancellation; checkout is idempotent (double taps cannot double-order or oversell). Prices are snapshotted on the order.
- Rate limits on checkout, listings, photos, messages, reports, disputes, reviews.

## Database
New tables (additive): seller_profiles, market_categories, market_products, market_product_images, market_cart_items, market_wishlist, market_orders, market_order_items, market_order_events, market_payments, market_webhook_events, market_reviews, market_reports, market_disputes, market_enquiries, market_enquiry_messages, market_buyer_requests, market_settings. The 21 default categories are reference data created at start-up (idempotent). No existing table changed.

## API
Public: `GET /api/marketplace/{categories,home,products,products/<id>,products/<id>/price-context,images/<id>,sellers/<id>,payments/methods,requests}`.
Signed-in non-staff: cart, wishlist, checkout, orders (+cancel, complete, payment-reference, review, dispute), reports, enquiries, requests, suggestions. Sellers: `/api/marketplace/seller/*` (register, profile, verification-request, products CRUD + images + stock + pause/resume + submit, ai/describe, orders + status/confirm-payment/mark-refunded, dashboard). Admin: `/api/admin/marketplace/*` (permissions `marketplace.manage` / `marketplace.verify_sellers`).

## Limitations to know before a live launch
- **Uploads live on the server disk.** On hosts with an ephemeral disk (Render's free web service) listing photos and farmer photos are lost on redeploy. Attach a persistent disk or move uploads to object storage before real sellers rely on it.
- No online payments (see above), no delivery network, no automatic refunds, no email/SMS notifications (order updates are visible in the app only).
- Seller identity checks are manual: verify properly before marking anyone verified.
- Regulatory approval lists for pesticides in Sierra Leone are not encoded; "regulated" means "needs verified seller + admin approval", and the admin decides what is approved.
- Search is simple text matching (no typo tolerance). Prices are in Sierra Leone leones (SLE) only.
- Product photos are public once a listing is live; retention purge (`flask purge-images`) does not touch them.
- Not tested with real users, real phones or a real provider.
