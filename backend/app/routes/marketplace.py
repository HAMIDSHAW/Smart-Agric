"""Marketplace: public browsing, cart, wishlist, checkout, buyer orders, reviews, reports,
disputes, enquiries and buyer requests. Seller tools live in marketplace_seller.py."""
import os
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request
from sqlalchemy import func

from app import db
from app.models import User
from app.models_marketplace import (BuyerRequest, CartItem, Category, Dispute, Enquiry, EnquiryMessage, FULFILMENT,
                                    Order, OrderItem, Payment, PAYMENT_METHODS, Product, ProductImage, Report,
                                    Review, SellerProfile, WishlistItem)
from app.routes.market_common import (D, UPLOAD_DIR, VISIBLE_STATUSES, add_event, category_dict, err, is_staff, me,
                                      money, my_seller, new_order_number, order_dict, price_for, product_dict,
                                      product_visible, qty, restore_stock, seller_public, setting)
from app.services import payments
from app.services.audit import audit
from app.services.ratelimit import rate_limit

market_bp = Blueprint('market', __name__)


def _visible_query():
    return (Product.query.join(SellerProfile, Product.seller_id == SellerProfile.id)
            .filter(Product.status.in_(VISIBLE_STATUSES), SellerProfile.verification_status != 'suspended'))


def _trader():
    """Logged-in, non-staff user (staff cannot buy or sell: conflict of interest)."""
    u = me()
    if not u or not u.is_active:
        return None, err('Please sign in.', 401)
    if is_staff(u):
        return None, err('Staff accounts cannot buy or sell on the marketplace.', 403)
    return u, None


# ───────────────────────── public ─────────────────────────

@market_bp.route('/categories', methods=['GET'])
def categories():
    counts = dict(db.session.query(Product.category_id, func.count(Product.id))
                  .join(SellerProfile, Product.seller_id == SellerProfile.id)
                  .filter(Product.status.in_(VISIBLE_STATUSES), SellerProfile.verification_status != 'suspended')
                  .group_by(Product.category_id).all())
    out = []
    for c in Category.query.filter_by(active=True).order_by(Category.sort).all():
        d = category_dict(c); d['listings'] = int(counts.get(c.id, 0)); out.append(d)
    return jsonify({'categories': out}), 200


@market_bp.route('/home', methods=['GET'])
def home():
    base = _visible_query().filter(Product.listing_type == 'product')
    recent = base.order_by(Product.created_at.desc()).limit(8).all()
    wholesale = base.filter(Product.wholesale_price.isnot(None)).order_by(Product.created_at.desc()).limit(8).all()
    produce = (base.join(Category, Product.category_id == Category.id).filter(Category.group == 'produce')
               .order_by(Product.created_at.desc()).limit(8).all())
    harvest = (_visible_query().filter(Product.listing_type == 'harvest_forecast')
               .order_by(Product.available_from.asc()).limit(6).all())
    return jsonify({
        'recent': [product_dict(p) for p in recent], 'wholesale': [product_dict(p) for p in wholesale],
        'local_produce': [product_dict(p) for p in produce], 'upcoming_harvests': [product_dict(p) for p in harvest],
        'note': 'Listings are shown by recency. SmartAgri does not accept payment for ranking or promotion.',
    }), 200


@market_bp.route('/products', methods=['GET'])
def search_products():
    q = _visible_query()
    a = request.args
    term = a.get('q', '').strip()
    if term:
        like = f'%{term.lower()}%'
        q = q.filter(db.or_(func.lower(Product.title).like(like), func.lower(func.coalesce(Product.description, '')).like(like)))
    if a.get('category'):
        q = q.join(Category, Product.category_id == Category.id).filter(Category.slug == a['category'])
    elif a.get('group') in ('inputs', 'equipment', 'produce'):
        q = q.join(Category, Product.category_id == Category.id).filter(Category.group == a['group'])
    if a.get('district'):
        q = q.filter(Product.district == a['district'])
    if a.get('type') in ('product', 'harvest_forecast'):
        q = q.filter(Product.listing_type == a['type'])
    if a.get('wholesale') in ('1', 'true'):
        q = q.filter(Product.wholesale_price.isnot(None))
    if a.get('seller_id', type=int):
        q = q.filter(Product.seller_id == a.get('seller_id', type=int))
    try:
        if a.get('min_price'):
            q = q.filter(Product.retail_price >= D(a['min_price'], 'min_price', allow_zero=True))
        if a.get('max_price'):
            q = q.filter(Product.retail_price <= D(a['max_price'], 'max_price', allow_zero=True))
    except ValueError as e:
        return err(str(e))
    order = {'price_asc': Product.retail_price.asc(), 'price_desc': Product.retail_price.desc()}.get(
        a.get('sort'), Product.created_at.desc())
    page, per = max(a.get('page', 1, type=int), 1), min(max(a.get('per_page', 12, type=int), 1), 48)
    p = q.order_by(order).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'products': [product_dict(x) for x in p.items], 'total': p.total, 'pages': p.pages, 'page': page}), 200


def _viewer():
    try:
        verify_jwt_in_request(optional=True)
        ident = get_jwt_identity()
        return db.session.get(User, int(ident)) if ident else None
    except Exception:
        return None


@market_bp.route('/products/<int:pid>', methods=['GET'])
def product_detail(pid):
    p = db.session.get(Product, pid)
    viewer = _viewer()
    owner = bool(viewer and p and p.seller.user_id == viewer.id)
    staff = bool(viewer and is_staff(viewer))
    if not p or not (product_visible(p) or owner or staff):
        return err('Product not found', 404)
    d = product_dict(p, detail=True, owner=owner)
    d['reviews'] = [{'rating': r.rating, 'comment': r.comment, 'buyer': (r.buyer.full_name or 'Buyer').split()[0],
                     'at': r.created_at.isoformat()} for r in
                    Review.query.filter_by(product_id=p.id, status='published').order_by(Review.id.desc()).limit(20).all()]
    return jsonify({'product': d}), 200


@market_bp.route('/products/<int:pid>/price-context', methods=['GET'])
def price_context(pid):
    """Compares with OTHER SmartAgri listings in the same category and unit. It is not a market survey."""
    p = db.session.get(Product, pid)
    if not p or not product_visible(p):
        return err('Product not found', 404)
    rows = [float(x[0]) for x in db.session.query(Product.retail_price).join(SellerProfile, Product.seller_id == SellerProfile.id)
            .filter(Product.category_id == p.category_id, Product.unit == p.unit, Product.id != p.id,
                    Product.status.in_(VISIBLE_STATUSES), SellerProfile.verification_status != 'suspended').all()]
    if len(rows) < 3:
        return jsonify({'available': False, 'note': 'Not enough similar listings on SmartAgri to compare prices.'}), 200
    rows.sort()
    return jsonify({'available': True, 'listings_compared': len(rows), 'unit': p.unit, 'min': rows[0],
                    'median': rows[len(rows) // 2], 'max': rows[-1], 'this_price': money(p.retail_price),
                    'note': 'Based on other current SmartAgri listings only. It is not an official market price.'}), 200


@market_bp.route('/images/<int:image_id>', methods=['GET'])
def product_image(image_id):
    img = db.session.get(ProductImage, image_id)
    if not img:
        return err('Not found', 404)
    p = img.product
    viewer = _viewer()
    allowed = product_visible(p) or (viewer and (p.seller.user_id == viewer.id or is_staff(viewer)))
    path = os.path.join(UPLOAD_DIR, os.path.basename(img.filename))
    if not allowed or not os.path.isfile(path):
        return err('Not found', 404)
    resp = send_file(path, mimetype='image/jpeg', max_age=300)
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    return resp


@market_bp.route('/sellers/<int:sid>', methods=['GET'])
def storefront(sid):
    s = db.session.get(SellerProfile, sid)
    if not s or s.verification_status == 'suspended':
        return err('Seller not found', 404)
    prods = _visible_query().filter(Product.seller_id == sid).order_by(Product.created_at.desc()).limit(48).all()
    revs = Review.query.filter_by(seller_id=sid, status='published').order_by(Review.id.desc()).limit(10).all()
    return jsonify({'seller': seller_public(s), 'products': [product_dict(p) for p in prods],
                    'reviews': [{'rating': r.rating, 'comment': r.comment, 'buyer': (r.buyer.full_name or 'Buyer').split()[0]} for r in revs]}), 200


@market_bp.route('/payments/methods', methods=['GET'])
def payment_methods():
    return jsonify({'methods': payments.available_methods(),
                    'note': 'Online payment providers are not connected yet. Offline methods are confirmed by the seller, not by a payment provider.'}), 200


@market_bp.route('/suggestions', methods=['GET'])
@jwt_required()
def suggestions():
    """SmartAgri's own suggestions from existing recommendations (crop, soil, fertilizer). Never sponsored."""
    crop = request.args.get('crop', '').strip().lower()[:40]
    need = request.args.get('need', 'seeds')
    slugs = {'seeds': ['seeds'], 'fertilizer': ['fertilizers', 'soil-improvement'],
             'equipment': ['hand-tools', 'irrigation', 'water-pumps', 'protective-equipment', 'farm-accessories'],
             'produce': ['rice', 'cassava', 'maize', 'cocoa', 'coffee', 'groundnuts', 'vegetables', 'fruits', 'other-produce']}.get(need)
    if not slugs:
        return err('need must be seeds, fertilizer, equipment or produce')
    q = _visible_query().join(Category, Product.category_id == Category.id).filter(Category.slug.in_(slugs), Product.listing_type == 'product')
    if crop:
        like = f'%{crop}%'
        crop_q = q.filter(db.or_(func.lower(Product.title).like(like), func.lower(func.coalesce(Product.description, '')).like(like)))
        found = crop_q.order_by(Product.created_at.desc()).limit(6).all()
    else:
        found = []
    return jsonify({'source': 'smartagri_suggestion', 'sponsored': False, 'need': need, 'crop': crop or None,
                    'products': [product_dict(p) for p in found],
                    'note': 'Matched by name from current listings. These are suggestions, not advertisements, and SmartAgri does not guarantee product suitability.'}), 200


# ───────────────────────── cart & wishlist ─────────────────────────

def _purchasable_error(p, quantity, buyer):
    if not product_visible(p):
        return 'This product is no longer available.'
    if p.listing_type != 'product':
        return 'This is an upcoming harvest. Send the seller an enquiry instead.'
    if p.seller.user_id == buyer.id:
        return 'You cannot buy your own product.'
    if p.stock_qty <= 0 or p.status == 'sold_out':
        return 'Out of stock.'
    if quantity < p.min_order_qty:
        return f'The minimum order is {qty(p.min_order_qty)} {p.unit}.'
    if quantity > p.stock_qty:
        return f'Only {qty(p.stock_qty)} {p.unit} left.'
    return None


def _cart_view(user):
    items = CartItem.query.filter_by(user_id=user.id).order_by(CartItem.id).all()
    groups, total, ok = {}, Decimal('0'), True
    for it in items:
        p, problem = it.product, _purchasable_error(it.product, it.quantity, user)
        tier, unit_price = price_for(p, it.quantity)
        line = (unit_price * it.quantity).quantize(Decimal('0.01'))
        g = groups.setdefault(p.seller_id, {'seller': seller_public(p.seller), 'items': [], 'subtotal': Decimal('0')})
        g['items'].append({'product_id': p.id, 'title': p.title, 'unit': p.unit, 'quantity': qty(it.quantity),
                           'unit_price': money(unit_price), 'price_tier': tier, 'line_total': money(line),
                           'image': (f'/api/marketplace/images/{p.images[0].id}' if p.images else None), 'problem': problem})
        if problem:
            ok = False
        else:
            g['subtotal'] += line; total += line
    for g in groups.values():
        g['subtotal'] = money(g['subtotal'])
    return {'groups': list(groups.values()), 'total': money(total), 'currency': 'SLE', 'can_checkout': bool(items) and ok}


@market_bp.route('/cart', methods=['GET'])
@jwt_required()
def cart_get():
    u, e = _trader()
    return e or (jsonify(_cart_view(u)), 200)


@market_bp.route('/cart', methods=['POST'])
@jwt_required()
@rate_limit('cart_write', 120, 600, per='user')
def cart_add():
    u, e = _trader()
    if e: return e
    data = request.get_json(silent=True) or {}
    p = db.session.get(Product, data.get('product_id') if isinstance(data.get('product_id'), int) else -1)
    if not p:
        return err('Product not found', 404)
    try:
        quantity = D(data.get('quantity', p.min_order_qty), 'quantity')
    except ValueError as ex:
        return err(str(ex))
    existing = CartItem.query.filter_by(user_id=u.id, product_id=p.id).first()
    new_qty = quantity + (existing.quantity if existing else 0)
    problem = _purchasable_error(p, new_qty, u)
    if problem:
        return err(problem)
    if existing:
        existing.quantity = new_qty
    else:
        db.session.add(CartItem(user_id=u.id, product_id=p.id, quantity=new_qty))
    db.session.commit()
    return jsonify(_cart_view(u)), 200


@market_bp.route('/cart/<int:pid>', methods=['PUT'])
@jwt_required()
def cart_set(pid):
    u, e = _trader()
    if e: return e
    item = CartItem.query.filter_by(user_id=u.id, product_id=pid).first()
    if not item:
        return err('Not in your cart', 404)
    try:
        quantity = D((request.get_json(silent=True) or {}).get('quantity'), 'quantity')
    except ValueError as ex:
        return err(str(ex))
    problem = _purchasable_error(item.product, quantity, u)
    if problem:
        return err(problem)
    item.quantity = quantity
    db.session.commit()
    return jsonify(_cart_view(u)), 200


@market_bp.route('/cart/<int:pid>', methods=['DELETE'])
@jwt_required()
def cart_remove(pid):
    u, e = _trader()
    if e: return e
    CartItem.query.filter_by(user_id=u.id, product_id=pid).delete()
    db.session.commit()
    return jsonify(_cart_view(u)), 200


@market_bp.route('/wishlist', methods=['GET'])
@jwt_required()
def wishlist_get():
    u, e = _trader()
    if e: return e
    rows = WishlistItem.query.filter_by(user_id=u.id).order_by(WishlistItem.id.desc()).all()
    return jsonify({'products': [product_dict(w.product) for w in rows if product_visible(w.product)]}), 200


@market_bp.route('/wishlist/<int:pid>', methods=['POST', 'DELETE'])
@jwt_required()
def wishlist_toggle(pid):
    u, e = _trader()
    if e: return e
    if request.method == 'POST':
        if not db.session.get(Product, pid):
            return err('Product not found', 404)
        if not WishlistItem.query.filter_by(user_id=u.id, product_id=pid).first():
            db.session.add(WishlistItem(user_id=u.id, product_id=pid))
    else:
        WishlistItem.query.filter_by(user_id=u.id, product_id=pid).delete()
    db.session.commit()
    return jsonify({'ok': True}), 200


# ───────────────────────── checkout ─────────────────────────

@market_bp.route('/checkout', methods=['POST'])
@jwt_required()
@rate_limit('checkout', 10, 600, per='user')
def checkout():
    u, e = _trader()
    if e: return e
    d = request.get_json(silent=True) or {}
    key = str(d.get('idempotency_key', '')).strip()
    if not (8 <= len(key) <= 64):
        return err('idempotency_key (8 to 64 characters) is required so a double tap cannot create two orders.')

    prior = Order.query.filter_by(buyer_id=u.id, checkout_key=key).all()
    if prior:
        return jsonify({'orders': [order_dict(o, u) for o in prior], 'idempotent_replay': True}), 200

    method, fulfil = d.get('payment_method'), d.get('fulfilment_method')
    if method not in PAYMENT_METHODS and method not in payments.REGISTRY:
        return err('Choose a supported payment method.')
    if method in payments.REGISTRY:
        return err('Online payment is not available yet.', 501)
    if fulfil not in FULFILMENT:
        return err('Choose pickup, seller delivery or third-party delivery.')
    address = str(d.get('delivery_address', '')).strip()[:255]
    if fulfil != 'pickup' and len(address) < 5:
        return err('A delivery address is required.')
    phone = str(d.get('contact_phone', '')).strip()[:30]
    if len(phone) < 6:
        return err('A contact phone number is required so the seller can reach you about this order.')

    items = CartItem.query.filter_by(user_id=u.id).all()
    if not items:
        return err('Your cart is empty.')

    commission = Decimal(setting('commission_rate', '0'))
    by_seller = {}
    try:
        for it in items:
            p = db.session.query(Product).filter_by(id=it.product_id).with_for_update().first()
            problem = _purchasable_error(p, it.quantity, u)
            if problem:
                raise ValueError(f'{p.title}: {problem}')
            opts = p.fulfilment_options or []
            if opts and fulfil not in opts:
                raise ValueError(f'{p.title}: this seller does not offer that delivery option.')
            if method == 'manual_mobile_money' and not p.seller.mobile_money_number:
                raise ValueError(f'{p.seller.business_name} has not set up a mobile money number.')
            by_seller.setdefault(p.seller_id, []).append((p, it.quantity))

        orders = []
        for seller_id, lines in by_seller.items():
            subtotal = Decimal('0')
            o = Order(order_number=new_order_number(), checkout_key=key, buyer_id=u.id, seller_id=seller_id,
                      subtotal=0, total=0, fulfilment_method=fulfil, delivery_address=address or None,
                      delivery_district=str(d.get('delivery_district', ''))[:80] or None, contact_phone=phone,
                      pickup_point=lines[0][0].pickup_point if fulfil == 'pickup' else None,
                      buyer_note=str(d.get('buyer_note', ''))[:500] or None, payment_method=method,
                      payment_status='unpaid', commission_rate=commission)
            db.session.add(o)
            for p, quantity in lines:
                tier, unit_price = price_for(p, quantity)
                line = (unit_price * quantity).quantize(Decimal('0.01'))
                subtotal += line
                db.session.add(OrderItem(order=o, product_id=p.id, title=p.title, unit=p.unit, unit_price=unit_price,
                                         price_tier=tier, quantity=quantity, line_total=line))
                p.stock_qty = p.stock_qty - quantity
                if p.stock_qty <= 0:
                    p.stock_qty, p.status = Decimal('0'), 'sold_out'
            o.subtotal = o.total = subtotal
            o.commission_amount = (subtotal * commission / 100).quantize(Decimal('0.01'))
            db.session.flush()
            db.session.add(Payment(order=o, provider=method, amount=o.total, currency=o.currency, status='pending'))
            add_event(o, 'status', 'pending', 'Order placed', u)
            add_event(o, 'payment', 'unpaid', payments.OFFLINE_METHODS.get(method), u)
            orders.append(o)
        CartItem.query.filter_by(user_id=u.id).delete()
        db.session.commit()
    except ValueError as ex:
        db.session.rollback()
        return err(str(ex), 409)
    except Exception:
        db.session.rollback()
        raise
    return jsonify({'orders': [order_dict(o, u) for o in orders], 'idempotent_replay': False}), 201


# ───────────────────────── buyer orders ─────────────────────────

def _my_order(oid, u):
    o = db.session.get(Order, oid)
    return o if o and o.buyer_id == u.id else None


@market_bp.route('/orders', methods=['GET'])
@jwt_required()
def my_orders():
    u, e = _trader()
    if e: return e
    page = max(request.args.get('page', 1, type=int), 1)
    p = Order.query.filter_by(buyer_id=u.id).order_by(Order.id.desc()).paginate(page=page, per_page=15, error_out=False)
    return jsonify({'orders': [order_dict(o, u) for o in p.items], 'total': p.total, 'pages': p.pages}), 200


@market_bp.route('/orders/<int:oid>', methods=['GET'])
@jwt_required()
def my_order(oid):
    u, e = _trader()
    if e: return e
    o = _my_order(oid, u)
    return (jsonify({'order': order_dict(o, u)}), 200) if o else err('Order not found', 404)


@market_bp.route('/orders/<int:oid>/cancel', methods=['POST'])
@jwt_required()
def buyer_cancel(oid):
    u, e = _trader()
    if e: return e
    o = _my_order(oid, u)
    if not o:
        return err('Order not found', 404)
    if o.status not in ('pending', 'confirmed'):
        return err('This order can no longer be cancelled here. Open a dispute if there is a problem.', 409)
    if o.payment_status == 'paid':
        return err('This order is already paid. Ask the seller to cancel it, or open a dispute.', 409)
    o.status, o.cancel_reason = 'cancelled', str((request.get_json(silent=True) or {}).get('reason', ''))[:255] or 'Cancelled by buyer'
    o.payment_status = 'unpaid'
    restore_stock(o)
    add_event(o, 'status', 'cancelled', o.cancel_reason, u)
    db.session.commit()
    return jsonify({'order': order_dict(o, u)}), 200


@market_bp.route('/orders/<int:oid>/complete', methods=['POST'])
@jwt_required()
def buyer_complete(oid):
    u, e = _trader()
    if e: return e
    o = _my_order(oid, u)
    if not o:
        return err('Order not found', 404)
    if o.status != 'delivered':
        return err('You can confirm receipt once the seller marks the order as delivered.', 409)
    o.status = 'completed'
    add_event(o, 'status', 'completed', 'Buyer confirmed receipt', u)
    db.session.commit()
    return jsonify({'order': order_dict(o, u)}), 200


@market_bp.route('/orders/<int:oid>/payment-reference', methods=['POST'])
@jwt_required()
def buyer_payment_reference(oid):
    """The buyer says they sent mobile money. This is a CLAIM: the order is not paid until the seller confirms."""
    u, e = _trader()
    if e: return e
    o = _my_order(oid, u)
    if not o:
        return err('Order not found', 404)
    if o.payment_method != 'manual_mobile_money' or o.status == 'cancelled' or o.payment_status == 'paid':
        return err('Nothing to update for this order.', 409)
    ref = str((request.get_json(silent=True) or {}).get('reference', '')).strip()[:80]
    if len(ref) < 4:
        return err('Enter the mobile money transaction reference.')
    pay = o.payments[0]
    pay.buyer_reference = ref
    o.payment_status = 'awaiting_confirmation'
    add_event(o, 'payment', 'awaiting_confirmation', 'Buyer reported payment sent', u)
    db.session.commit()
    return jsonify({'order': order_dict(o, u)}), 200


@market_bp.route('/orders/<int:oid>/review', methods=['POST'])
@jwt_required()
@rate_limit('review', 30, 3600, per='user')
def add_review(oid):
    u, e = _trader()
    if e: return e
    o = _my_order(oid, u)
    if not o:
        return err('Order not found', 404)
    if o.status != 'completed':
        return err('You can review after you confirm you received the order.', 409)
    d = request.get_json(silent=True) or {}
    rating = d.get('rating')
    if not isinstance(rating, int) or not 1 <= rating <= 5:
        return err('rating must be a whole number from 1 to 5')
    pid = d.get('product_id')
    item = next((i for i in o.items if i.product_id == pid), None)
    if not item:
        return err('That product is not part of this order.')
    if Review.query.filter_by(order_id=o.id, product_id=pid).first():
        return err('You already reviewed this item.', 409)
    db.session.add(Review(order_id=o.id, product_id=pid, seller_id=o.seller_id, buyer_id=u.id, rating=rating,
                          comment=str(d.get('comment', '')).strip()[:1000] or None))
    db.session.commit()
    return jsonify({'ok': True}), 201


@market_bp.route('/orders/<int:oid>/dispute', methods=['POST'])
@jwt_required()
@rate_limit('dispute', 10, 3600, per='user')
def open_dispute(oid):
    u, e = _trader()
    if e: return e
    o = db.session.get(Order, oid)
    seller_user_id = o.seller.user_id if o else None
    if not o or u.id not in (o.buyer_id, seller_user_id):
        return err('Order not found', 404)
    d = request.get_json(silent=True) or {}
    reason = d.get('reason')
    if reason not in ('not_received', 'not_as_described', 'payment_problem', 'quality', 'other'):
        return err('Choose a reason.')
    if Dispute.query.filter_by(order_id=o.id, status='open').first():
        return err('A dispute is already open for this order.', 409)
    db.session.add(Dispute(order_id=o.id, opened_by=u.id, reason=reason, details=str(d.get('details', ''))[:1000] or None))
    add_event(o, 'note', 'dispute_opened', reason, u)
    db.session.commit()
    return jsonify({'ok': True}), 201


@market_bp.route('/reports', methods=['POST'])
@jwt_required()
@rate_limit('report', 15, 3600, per='user')
def report_target():
    u, e = _trader()
    if e: return e
    d = request.get_json(silent=True) or {}
    ttype, tid = d.get('target_type'), d.get('target_id')
    model = {'product': Product, 'seller': SellerProfile, 'review': Review, 'order': Order}.get(ttype)
    if not model or not isinstance(tid, int) or not db.session.get(model, tid):
        return err('Report target not found', 404)
    reason = d.get('reason')
    if reason not in ('fraud', 'prohibited_item', 'misleading', 'unsafe', 'abusive', 'other'):
        return err('Choose a reason.')
    if Report.query.filter_by(reporter_id=u.id, target_type=ttype, target_id=tid, status='open').first():
        return err('You already reported this.', 409)
    db.session.add(Report(reporter_id=u.id, target_type=ttype, target_id=tid, reason=reason, details=str(d.get('details', ''))[:1000] or None))
    db.session.commit()
    return jsonify({'ok': True}), 201


# ───────────────────────── payments webhook ─────────────────────────

@market_bp.route('/payments/webhook/<provider>', methods=['POST'])
def payment_webhook(provider):
    adapter = payments.REGISTRY.get(provider)
    if not adapter:
        return err('Provider not enabled', 404)
    raw = request.get_data()
    if not adapter.verify_signature(raw, request.headers):
        audit('webhook_bad_signature', category='security', outcome='denied', target_type='payment_provider', target_id=provider)
        return err('Invalid signature', 401)
    try:
        ev = adapter.parse(request.get_json(silent=True) or {})
    except ValueError:
        return err('Malformed event', 400)

    from app.models_marketplace import WebhookEvent
    try:
        db.session.add(WebhookEvent(provider=provider, event_id=ev.event_id, outcome='received'))
        db.session.flush()
    except Exception:                                     # duplicate delivery: idempotent
        db.session.rollback()
        return jsonify({'status': 'duplicate'}), 200

    pay = Payment.query.filter_by(provider=provider, provider_reference=ev.reference).with_for_update().first()
    outcome = 'unknown_reference'
    if pay:
        o = pay.order
        if pay.status in ('verified', 'seller_confirmed'):
            outcome = 'already_paid'
        elif ev.amount != pay.amount or ev.currency != pay.currency:
            pay.status, outcome = 'amount_mismatch', 'amount_mismatch'
            add_event(o, 'payment', 'amount_mismatch', 'Provider amount did not match the order total')
        elif ev.status == 'successful':
            pay.status, pay.verified_at = 'verified', datetime.utcnow()
            o.payment_status, o.payment_basis, outcome = 'paid', 'provider_verified', 'verified'
            add_event(o, 'payment', 'paid', f'Verified by {provider}')
        elif ev.status == 'failed':
            pay.status, o.payment_status, outcome = 'failed', 'failed', 'failed'
            add_event(o, 'payment', 'failed', f'{provider} reported failure')
    row = WebhookEvent.query.filter_by(provider=provider, event_id=ev.event_id).first()
    row.outcome = outcome
    db.session.commit()
    return jsonify({'status': outcome}), 200


# ───────────────────────── enquiries & buyer requests ─────────────────────────

def _enquiry_dict(en, viewer, full=False):
    other_is_seller = viewer.id == en.buyer_id
    d = {'id': en.id, 'kind': en.kind, 'subject': en.subject, 'product_id': en.product_id,
         'product_title': en.product.title if en.product else None,
         'with': (en.seller.business_name if other_is_seller else (en.buyer.full_name or 'Buyer').split()[0]),
         'role': 'buyer' if other_is_seller else 'seller',
         'updated_at': en.updated_at.isoformat() if en.updated_at else None,
         'last_message': en.messages[-1].body[:120] if en.messages else None}
    if full:
        d['messages'] = [{'id': m.id, 'mine': m.sender_id == viewer.id, 'body': m.body,
                          'offered_price': money(m.offered_price), 'at': m.created_at.isoformat()} for m in en.messages]
    return d


@market_bp.route('/enquiries', methods=['POST'])
@jwt_required()
@rate_limit('enquiry', 20, 3600, per='user')
def start_enquiry():
    u, e = _trader()
    if e: return e
    d = request.get_json(silent=True) or {}
    body = str(d.get('message', '')).strip()[:2000]
    if len(body) < 2:
        return err('Write a message.')
    kind = d.get('kind', 'enquiry') if d.get('kind') in ('enquiry', 'bulk', 'negotiation') else 'enquiry'
    offered = None
    if d.get('offered_price') not in (None, ''):
        try:
            offered = D(d['offered_price'], 'offered_price')
        except ValueError as ex:
            return err(str(ex))

    req = db.session.get(BuyerRequest, d['request_id']) if isinstance(d.get('request_id'), int) else None
    if req:                                                # a seller answering a buyer request
        if req.buyer_id == u.id:
            return err('You cannot respond to your own request.')
        s = my_seller(u)
        if not s or s.verification_status == 'suspended':
            return err('Set up your seller profile to respond to requests.', 403)
        en = Enquiry.query.filter_by(request_id=req.id, seller_id=s.id).first()
        if not en:
            en = Enquiry(request_id=req.id, buyer_id=req.buyer_id, seller_id=s.id, kind='negotiation', subject=req.title[:140])
            db.session.add(en)
    else:
        p = db.session.get(Product, d['product_id']) if isinstance(d.get('product_id'), int) else None
        if not p or not product_visible(p):
            return err('Product not found', 404)
        if p.seller.user_id == u.id:
            return err('You cannot message yourself.')
        en = Enquiry.query.filter_by(product_id=p.id, buyer_id=u.id).first()
        if not en:
            en = Enquiry(product_id=p.id, buyer_id=u.id, seller_id=p.seller_id, kind=kind,
                         subject=str(d.get('subject') or p.title)[:140])
            db.session.add(en)
    db.session.flush()
    db.session.add(EnquiryMessage(enquiry_id=en.id, sender_id=u.id, body=body, offered_price=offered))
    en.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'enquiry': _enquiry_dict(en, u, full=True)}), 201


@market_bp.route('/enquiries', methods=['GET'])
@jwt_required()
def list_enquiries():
    u, e = _trader()
    if e: return e
    s = my_seller(u)
    q = Enquiry.query.filter(db.or_(Enquiry.buyer_id == u.id, Enquiry.seller_id == (s.id if s else -1)))
    return jsonify({'enquiries': [_enquiry_dict(x, u) for x in q.order_by(Enquiry.updated_at.desc()).limit(100).all()]}), 200


def _my_enquiry(eid, u):
    en = db.session.get(Enquiry, eid)
    if not en or u.id not in (en.buyer_id, en.seller.user_id):
        return None
    return en


@market_bp.route('/enquiries/<int:eid>', methods=['GET'])
@jwt_required()
def get_enquiry(eid):
    u, e = _trader()
    if e: return e
    en = _my_enquiry(eid, u)
    return (jsonify({'enquiry': _enquiry_dict(en, u, full=True)}), 200) if en else err('Not found', 404)


@market_bp.route('/enquiries/<int:eid>/messages', methods=['POST'])
@jwt_required()
@rate_limit('enquiry_msg', 60, 3600, per='user')
def reply_enquiry(eid):
    u, e = _trader()
    if e: return e
    en = _my_enquiry(eid, u)
    if not en:
        return err('Not found', 404)
    d = request.get_json(silent=True) or {}
    body = str(d.get('message', '')).strip()[:2000]
    if len(body) < 1:
        return err('Write a message.')
    offered = None
    if d.get('offered_price') not in (None, ''):
        try:
            offered = D(d['offered_price'], 'offered_price')
        except ValueError as ex:
            return err(str(ex))
    db.session.add(EnquiryMessage(enquiry_id=en.id, sender_id=u.id, body=body, offered_price=offered))
    en.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'enquiry': _enquiry_dict(en, u, full=True)}), 200


@market_bp.route('/requests', methods=['GET'])
def list_requests():
    q = BuyerRequest.query.filter_by(status='open')
    if request.args.get('category'):
        q = q.join(Category, BuyerRequest.category_id == Category.id).filter(Category.slug == request.args['category'])
    rows = q.order_by(BuyerRequest.id.desc()).limit(50).all()
    return jsonify({'requests': [{
        'id': r.id, 'title': r.title, 'details': r.details, 'quantity': qty(r.quantity), 'unit': r.unit,
        'target_price': money(r.target_price), 'district': r.district, 'category': category_dict(r.category) if r.category else None,
        'needed_by': r.needed_by.isoformat() if r.needed_by else None,
        'buyer': (r.buyer.full_name or 'Buyer').split()[0], 'created_at': r.created_at.isoformat()} for r in rows]}), 200


@market_bp.route('/requests', methods=['POST'])
@jwt_required()
@rate_limit('buyer_request', 10, 3600, per='user')
def create_request():
    u, e = _trader()
    if e: return e
    d = request.get_json(silent=True) or {}
    title = str(d.get('title', '')).strip()[:140]
    if len(title) < 3:
        return err('Describe what you want to buy.')
    cat = Category.query.filter_by(slug=d['category']).first() if d.get('category') else None
    try:
        quantity = D(d['quantity'], 'quantity') if d.get('quantity') not in (None, '') else None
        target = D(d['target_price'], 'target_price') if d.get('target_price') not in (None, '') else None
        needed = date.fromisoformat(d['needed_by']) if d.get('needed_by') else None
    except ValueError:
        return err('Check the quantity, price and date.')
    r = BuyerRequest(buyer_id=u.id, category_id=cat.id if cat else None, title=title, details=str(d.get('details', ''))[:1000] or None,
                     quantity=quantity, unit=str(d.get('unit', ''))[:20] or None, target_price=target,
                     district=str(d.get('district', ''))[:80] or None, needed_by=needed)
    db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id}), 201


@market_bp.route('/requests/<int:rid>/close', methods=['POST'])
@jwt_required()
def close_request(rid):
    u, e = _trader()
    if e: return e
    r = db.session.get(BuyerRequest, rid)
    if not r or r.buyer_id != u.id:
        return err('Not found', 404)
    r.status = 'closed'
    db.session.commit()
    return jsonify({'ok': True}), 200
