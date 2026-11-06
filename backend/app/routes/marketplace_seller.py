"""Seller tools: onboarding, verification request, listings, photos, stock, orders, payments, dashboard."""
import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app import db
from app.models_marketplace import (Category, Order, Product, ProductImage, SELLER_TYPES, SellerProfile, Review,
                                    FULFILMENT, Payment)
from app.routes.market_common import (D, MAX_IMAGES, UNITS, UPLOAD_DIR, add_event, err, is_staff, me, money,
                                      my_seller, order_dict, product_dict, qty, restore_stock, setting)
from app.services import ai_gateway
from app.services.audit import audit
from app.services.images import ImageRejected, process_image
from app.services.ratelimit import rate_limit

seller_bp = Blueprint('market_seller', __name__)

TRANSITIONS = {
    'pending': {'confirmed', 'cancelled'},
    'confirmed': {'processing', 'ready', 'shipped', 'cancelled'},
    'processing': {'ready', 'shipped', 'cancelled'},
    'ready': {'delivered', 'cancelled'},
    'shipped': {'delivered'},
    'delivered': set(),            # the BUYER confirms receipt -> completed
}


def _seller_or_error():
    u = me()
    if not u or not u.is_active:
        return None, None, err('Please sign in.', 401)
    if is_staff(u):
        return None, None, err('Staff accounts cannot sell on the marketplace.', 403)
    s = my_seller(u)
    if not s:
        return u, None, err('Register as a seller first.', 403)
    if s.verification_status == 'suspended':
        return u, s, err('Your seller account is suspended. Contact support.', 403)
    return u, s, None


# ───────────── onboarding ─────────────

def _profile_dict(s):
    return {'id': s.id, 'business_name': s.business_name, 'seller_type': s.seller_type, 'description': s.description,
            'district': s.district, 'location_text': s.location_text, 'contact_phone': s.contact_phone,
            'registration_number': s.registration_number, 'mobile_money_number': s.mobile_money_number,
            'verification_status': s.verification_status, 'verification_note': s.verification_note,
            'verified': s.verification_status == 'verified'}


def _apply_profile(s, d):
    name = str(d.get('business_name', s.business_name or '')).strip()
    if not 3 <= len(name) <= 120:
        raise ValueError('Business or shop name must be 3 to 120 characters.')
    stype = d.get('seller_type', s.seller_type)
    if stype not in SELLER_TYPES:
        raise ValueError('Choose a seller type: ' + ', '.join(SELLER_TYPES))
    s.business_name, s.seller_type = name, stype
    for f, n in (('description', 1000), ('district', 80), ('location_text', 160), ('contact_phone', 30),
                 ('registration_number', 60), ('mobile_money_number', 30)):
        if f in d:
            setattr(s, f, (str(d[f]).strip()[:n] or None) if d[f] is not None else None)


@seller_bp.route('/register', methods=['POST'])
@jwt_required()
@rate_limit('seller_register', 5, 3600, per='user')
def register_seller():
    u = me()
    if is_staff(u):
        return err('Staff accounts cannot sell on the marketplace.', 403)
    if my_seller(u):
        return err('You are already registered as a seller.', 409)
    s = SellerProfile(user_id=u.id, business_name='', seller_type='farmer', verification_status='unverified')
    try:
        _apply_profile(s, request.get_json(silent=True) or {})
    except ValueError as e:
        return err(str(e))
    db.session.add(s)
    db.session.commit()
    return jsonify({'profile': _profile_dict(s)}), 201


@seller_bp.route('/profile', methods=['GET', 'PUT'])
@jwt_required()
def profile():
    u = me()
    s = my_seller(u)
    if not s:
        return jsonify({'profile': None}), 200
    if request.method == 'PUT':
        if s.verification_status == 'suspended':
            return err('Your seller account is suspended.', 403)
        try:
            _apply_profile(s, request.get_json(silent=True) or {})
        except ValueError as e:
            return err(str(e))
        db.session.commit()
    return jsonify({'profile': _profile_dict(s)}), 200


@seller_bp.route('/verification-request', methods=['POST'])
@jwt_required()
@rate_limit('verif_req', 5, 86400, per='user')
def request_verification():
    u, s, e = _seller_or_error()
    if e: return e
    if s.verification_status not in ('unverified', 'rejected'):
        return err('Your verification is already ' + s.verification_status + '.', 409)
    note = str((request.get_json(silent=True) or {}).get('note', '')).strip()[:255]
    if not s.registration_number and len(note) < 10:
        return err('Add your registration number to your profile, or explain who you are (at least 10 characters).')
    s.verification_status, s.verification_note = 'pending', note or None
    db.session.commit()
    audit('seller_verification_requested', category='auth', actor=u, target_type='seller', target_id=s.id)
    return jsonify({'profile': _profile_dict(s)}), 200


# ───────────── listings ─────────────

def _parse_product(d, existing=None):
    out = {}
    def has(k): return k in d
    if has('title') or not existing:
        t = str(d.get('title', '')).strip()
        if not 3 <= len(t) <= 140:
            raise ValueError('Title must be 3 to 140 characters.')
        out['title'] = t
    if has('description'):
        out['description'] = str(d['description'] or '').strip()[:4000] or None
    if has('category') or not existing:
        c = Category.query.filter_by(slug=d.get('category'), active=True).first() or \
            (db.session.get(Category, d['category']) if isinstance(d.get('category'), int) else None)
        if not c or not c.active:
            raise ValueError('Choose a valid category.')
        out['category_id'], out['regulated'] = c.id, c.regulated
    if has('listing_type') or not existing:
        lt = d.get('listing_type', 'product')
        if lt not in ('product', 'harvest_forecast'):
            raise ValueError('listing_type must be product or harvest_forecast.')
        out['listing_type'] = lt
    if has('unit') or not existing:
        if d.get('unit', 'kg') not in UNITS:
            raise ValueError('unit must be one of: ' + ', '.join(UNITS))
        out['unit'] = d.get('unit', 'kg')
    if has('retail_price') or not existing:
        out['retail_price'] = D(d.get('retail_price'), 'retail_price')
    if has('wholesale_price') or has('wholesale_min_qty'):
        wp, wq = d.get('wholesale_price'), d.get('wholesale_min_qty')
        if wp in (None, '') and wq in (None, ''):
            out['wholesale_price'] = out['wholesale_min_qty'] = None
        else:
            out['wholesale_price'], out['wholesale_min_qty'] = D(wp, 'wholesale_price'), D(wq, 'wholesale_min_qty')
    if has('min_order_qty'):
        out['min_order_qty'] = D(d['min_order_qty'], 'min_order_qty')
    if has('stock_qty') or not existing:
        out['stock_qty'] = D(d.get('stock_qty', 0), 'stock_qty', allow_zero=True)
    if has('low_stock_threshold'):
        out['low_stock_threshold'] = D(d['low_stock_threshold'], 'low_stock_threshold', allow_zero=True)
    for f, n in (('district', 80), ('location_text', 160), ('pickup_point', 160), ('condition', 20)):
        if has(f):
            out[f] = str(d[f] or '').strip()[:n] or None
    if has('fulfilment_options'):
        opts = d['fulfilment_options'] or []
        if not isinstance(opts, list) or any(o not in FULFILMENT for o in opts):
            raise ValueError('fulfilment_options must be a list of: ' + ', '.join(FULFILMENT))
        out['fulfilment_options'] = opts
    if has('available_from'):
        try:
            out['available_from'] = date.fromisoformat(d['available_from']) if d['available_from'] else None
        except ValueError:
            raise ValueError('available_from must be a date like 2026-12-01.')
    # cross-field rules (use incoming values, falling back to the existing record)
    get = lambda k: out[k] if k in out else (getattr(existing, k, None) if existing else None)
    rp, wp, wq = get('retail_price'), get('wholesale_price'), get('wholesale_min_qty')
    if wp is not None and (rp is None or wp >= rp):
        raise ValueError('Wholesale price must be lower than the retail price.')
    mo = get('min_order_qty') or Decimal('1')
    if wq is not None and wq < mo:
        raise ValueError('Wholesale minimum quantity must be at least the minimum order quantity.')
    if get('listing_type') == 'harvest_forecast' and not get('available_from'):
        raise ValueError('An upcoming harvest needs an expected harvest date (available_from).')
    return out


def _mine(pid, s):
    p = db.session.get(Product, pid)
    return p if p and p.seller_id == s.id else None


def _submit(p, s):
    """Apply moderation rules. Returns an error response or None."""
    if not p.images:
        return err('Add at least one photo before publishing.')
    c = p.category
    p.regulated = c.regulated
    if c.regulated:
        if s.verification_status != 'verified':
            return err(f'"{c.name}" are regulated products. Only verified sellers can list them. Request verification first.', 403)
        p.status = 'pending_review'
    elif setting('premoderate_all', 'false') == 'true':
        p.status = 'pending_review'
    else:
        p.status = 'sold_out' if (p.listing_type == 'product' and p.stock_qty <= 0) else 'active'
    p.moderation_note = None
    return None


@seller_bp.route('/products', methods=['GET'])
@jwt_required()
def my_products():
    u, s, e = _seller_or_error()
    if e: return e
    rows = Product.query.filter_by(seller_id=s.id).filter(Product.status != 'removed').order_by(Product.id.desc()).all()
    return jsonify({'products': [product_dict(p, owner=True) for p in rows]}), 200


@seller_bp.route('/products', methods=['POST'])
@jwt_required()
@rate_limit('product_write', 40, 3600, per='user')
def create_product():
    u, s, e = _seller_or_error()
    if e: return e
    d = request.get_json(silent=True) or {}
    try:
        f = _parse_product(d)
    except ValueError as ex:
        return err(str(ex))
    f.setdefault('min_order_qty', Decimal('1'))
    f.setdefault('currency', 'SLE')
    f.setdefault('fulfilment_options', ['pickup'])
    f.setdefault('district', s.district)
    p = Product(seller_id=s.id, status='draft', **f)
    db.session.add(p)
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True)}), 201


@seller_bp.route('/products/<int:pid>', methods=['PUT'])
@jwt_required()
def update_product(pid):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    if not p or p.status == 'removed':
        return err('Product not found', 404)
    try:
        f = _parse_product(request.get_json(silent=True) or {}, existing=p)
    except ValueError as ex:
        return err(str(ex))
    rereview = p.status in ('active', 'sold_out') and (
        ('category_id' in f and f['category_id'] != p.category_id) or
        (p.regulated and ('title' in f or 'description' in f)))
    for k, v in f.items():
        setattr(p, k, v)
    if rereview and p.regulated:
        p.status, p.moderation_note = 'pending_review', 'Edited: needs review again.'
    if 'stock_qty' in f and p.listing_type == 'product' and p.status in ('active', 'sold_out'):
        p.status = 'active' if p.stock_qty > 0 else 'sold_out'
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True)}), 200


@seller_bp.route('/products/<int:pid>/submit', methods=['POST'])
@jwt_required()
def submit_product(pid):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    if not p or p.status not in ('draft', 'rejected', 'paused'):
        return err('Only drafts, rejected or paused listings can be submitted.', 409 if p else 404)
    bad = _submit(p, s)
    if bad: return bad
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True)}), 200


@seller_bp.route('/products/<int:pid>/pause', methods=['POST'])
@jwt_required()
def pause_product(pid):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    if not p or p.status not in ('active', 'sold_out'):
        return err('Only live listings can be paused.', 409 if p else 404)
    p.status = 'paused'
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True)}), 200


@seller_bp.route('/products/<int:pid>/resume', methods=['POST'])
@jwt_required()
def resume_product(pid):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    if not p or p.status != 'paused':
        return err('Only paused listings can be resumed.', 409 if p else 404)
    if p.regulated and s.verification_status != 'verified':
        return err('Regulated products need a verified seller account.', 403)
    p.status = 'sold_out' if (p.listing_type == 'product' and p.stock_qty <= 0) else 'active'
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True)}), 200


@seller_bp.route('/products/<int:pid>/stock', methods=['POST'])
@jwt_required()
def set_stock(pid):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    if not p:
        return err('Product not found', 404)
    try:
        p.stock_qty = D((request.get_json(silent=True) or {}).get('stock_qty'), 'stock_qty', allow_zero=True)
    except ValueError as ex:
        return err(str(ex))
    if p.status in ('active', 'sold_out') and p.listing_type == 'product':
        p.status = 'active' if p.stock_qty > 0 else 'sold_out'
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True)}), 200


@seller_bp.route('/products/<int:pid>', methods=['DELETE'])
@jwt_required()
def delete_product(pid):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    if not p:
        return err('Product not found', 404)
    p.status = 'removed'        # history (orders, reviews) keeps its snapshot
    db.session.commit()
    return jsonify({'ok': True}), 200


@seller_bp.route('/products/<int:pid>/images', methods=['POST'])
@jwt_required()
@rate_limit('product_images', 60, 3600, per='user')
def add_images(pid):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    if not p:
        return err('Product not found', 404)
    files = request.files.getlist('images') or request.files.getlist('image')
    if not files:
        return err('No photos received.')
    if len(p.images) + len(files) > MAX_IMAGES:
        return err(f'A listing can have at most {MAX_IMAGES} photos.')
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved, warnings = [], []
    for f in files:
        try:
            img = process_image(f.read())
        except ImageRejected as ex:
            return err(f'{f.filename or "Photo"}: {ex.message}', 400, error_code=ex.code)
        name = f'{uuid.uuid4().hex}.jpg'
        with open(os.path.join(UPLOAD_DIR, name), 'wb') as out:
            out.write(img.jpeg_bytes)                       # product photos are public: store the processed copy
        row = ProductImage(product_id=p.id, filename=name, position=len(p.images) + len(saved))
        db.session.add(row); saved.append(row); warnings += img.warnings
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True), 'image_warnings': warnings}), 201


@seller_bp.route('/products/<int:pid>/images/<int:image_id>', methods=['DELETE'])
@jwt_required()
def delete_image(pid, image_id):
    u, s, e = _seller_or_error()
    if e: return e
    p = _mine(pid, s)
    img = db.session.get(ProductImage, image_id)
    if not p or not img or img.product_id != p.id:
        return err('Photo not found', 404)
    try:
        os.remove(os.path.join(UPLOAD_DIR, os.path.basename(img.filename)))
    except OSError:
        pass
    db.session.delete(img)
    db.session.commit()
    return jsonify({'product': product_dict(p, owner=True)}), 200


@seller_bp.route('/ai/describe', methods=['POST'])
@jwt_required()
@rate_limit('ai_describe', 20, 3600, per='user')
def ai_describe():
    """Drafts a listing description with the existing text model. The seller must review it."""
    u, s, e = _seller_or_error()
    if e: return e
    d = request.get_json(silent=True) or {}
    title = str(d.get('title', '')).strip()[:140]
    if len(title) < 3:
        return err('Enter a product title first.')
    cat = str(d.get('category', '')).strip()[:60]
    prompt = (f'Write a short, honest marketplace listing description (60 to 90 words) for a Sierra Leone farm marketplace.\n'
              f'Product: {title}. Category: {cat or "not given"}. Unit: {d.get("unit", "kg")}.\n'
              'Use only the facts above. Do NOT invent quality claims, certifications, origin, weights or prices. '
              'Respond ONLY with JSON: {"description":"..."}')
    result, error = ai_gateway.groq_json(prompt, task='marketplace_description', max_tokens=300, timeout=30, retries=0)
    if not result or not isinstance(result.get('description'), str):
        return err(error or 'The AI helper is unavailable. You can write the description yourself.', 503)
    return jsonify({'description': result['description'][:1500], 'ai_generated': True,
                    'note': 'AI draft. Check it is accurate before you publish.'}), 200


# ───────────── orders ─────────────

def _my_order(oid, s):
    o = db.session.get(Order, oid)
    return o if o and o.seller_id == s.id else None


@seller_bp.route('/orders', methods=['GET'])
@jwt_required()
def seller_orders():
    u, s, e = _seller_or_error()
    if e: return e
    q = Order.query.filter_by(seller_id=s.id)
    if request.args.get('status'):
        q = q.filter(Order.status == request.args['status'])
    page = max(request.args.get('page', 1, type=int), 1)
    p = q.order_by(Order.id.desc()).paginate(page=page, per_page=15, error_out=False)
    return jsonify({'orders': [order_dict(o, u, as_seller=True) for o in p.items], 'total': p.total, 'pages': p.pages}), 200


@seller_bp.route('/orders/<int:oid>', methods=['GET'])
@jwt_required()
def seller_order(oid):
    u, s, e = _seller_or_error()
    if e: return e
    o = _my_order(oid, s)
    return (jsonify({'order': order_dict(o, u, as_seller=True)}), 200) if o else err('Order not found', 404)


@seller_bp.route('/orders/<int:oid>/status', methods=['POST'])
@jwt_required()
def seller_set_status(oid):
    u, s, e = _seller_or_error()
    if e: return e
    o = _my_order(oid, s)
    if not o:
        return err('Order not found', 404)
    d = request.get_json(silent=True) or {}
    new = d.get('status')
    if new not in TRANSITIONS.get(o.status, set()):
        return err(f'An order that is "{o.status}" cannot move to "{new}".', 409)
    if new == 'shipped' and o.fulfilment_method == 'pickup':
        return err('This is a pickup order: mark it "ready" for collection.', 409)
    if new == 'ready' and o.fulfilment_method != 'pickup':
        return err('Use "shipped" for delivery orders.', 409)
    note = str(d.get('note', '')).strip()[:255]
    if new == 'cancelled':
        if not note:
            return err('Give a reason for cancelling.')
        o.cancel_reason = note
        restore_stock(o)
        if o.payment_status == 'paid':
            o.payment_status = 'refund_due'
            add_event(o, 'payment', 'refund_due', 'Order cancelled after payment: refund owed to buyer', u)
        elif o.payment_status == 'awaiting_confirmation':
            o.payment_status = 'unpaid'
    o.status = new
    add_event(o, 'status', new, note, u)
    db.session.commit()
    return jsonify({'order': order_dict(o, u, as_seller=True)}), 200


@seller_bp.route('/orders/<int:oid>/confirm-payment', methods=['POST'])
@jwt_required()
def seller_confirm_payment(oid):
    """The seller attests they received the money (cash, or mobile money to their own wallet)."""
    u, s, e = _seller_or_error()
    if e: return e
    o = _my_order(oid, s)
    if not o:
        return err('Order not found', 404)
    if o.payment_method not in ('cash_on_delivery', 'pay_on_pickup', 'manual_mobile_money'):
        return err('This payment is confirmed by the payment provider, not by you.', 409)
    if o.status == 'cancelled' or o.payment_status in ('paid', 'refund_due', 'refunded'):
        return err('This order cannot be marked paid.', 409)
    pay = o.payments[0]
    pay.status, pay.confirmed_by, pay.verified_at = 'seller_confirmed', u.id, datetime.utcnow()
    o.payment_status, o.payment_basis = 'paid', 'seller_confirmed'
    add_event(o, 'payment', 'paid', 'Seller confirmed receipt (not verified by a payment provider)', u)
    db.session.commit()
    audit('seller_confirmed_payment', category='auth', actor=u, target_type='order', target_id=o.id, details={'total': float(o.total)})
    return jsonify({'order': order_dict(o, u, as_seller=True)}), 200


@seller_bp.route('/orders/<int:oid>/mark-refunded', methods=['POST'])
@jwt_required()
def seller_mark_refunded(oid):
    u, s, e = _seller_or_error()
    if e: return e
    o = _my_order(oid, s)
    if not o or o.payment_status != 'refund_due':
        return err('No refund is due on this order.', 409 if o else 404)
    o.payment_status = 'refunded'
    add_event(o, 'payment', 'refunded', 'Seller says the refund was paid back to the buyer (outside SmartAgri)', u)
    db.session.commit()
    return jsonify({'order': order_dict(o, u, as_seller=True)}), 200


# ───────────── dashboard (all figures from the database) ─────────────

@seller_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    u, s, e = _seller_or_error()
    if e: return e
    days = min(max(request.args.get('days', 30, type=int), 1), 365)
    since = datetime.utcnow() - timedelta(days=days)
    orders = Order.query.filter_by(seller_id=s.id)
    live = orders.filter(Order.status != 'cancelled')
    gross = live.with_entities(func.coalesce(func.sum(Order.total), 0)).scalar()
    paid = live.filter(Order.payment_status == 'paid').with_entities(func.coalesce(func.sum(Order.total), 0)).scalar()
    status_counts = dict(orders.with_entities(Order.status, func.count(Order.id)).group_by(Order.status).all())
    by_day = {str(k): (n, float(t)) for k, n, t in live.filter(Order.created_at >= since)
              .with_entities(func.date(Order.created_at), func.count(Order.id), func.sum(Order.total))
              .group_by(func.date(Order.created_at)).all()}
    series = []
    for i in range(days, -1, -1):
        dd = (datetime.utcnow() - timedelta(days=i)).date().isoformat()
        n, t = by_day.get(dd, (0, 0.0))
        series.append({'date': dd, 'orders': n, 'sales': round(t, 2)})
    prods = Product.query.filter_by(seller_id=s.id).filter(Product.status != 'removed')
    low = [{'id': p.id, 'title': p.title, 'stock_qty': qty(p.stock_qty), 'unit': p.unit}
           for p in prods.filter(Product.listing_type == 'product', Product.status.in_(('active', 'sold_out')),
                                 Product.stock_qty <= func.coalesce(Product.low_stock_threshold, 5)).all()]
    avg, n_rev = db.session.query(func.avg(Review.rating), func.count(Review.id)).filter(
        Review.seller_id == s.id, Review.status == 'published').one()
    recent_reviews = Review.query.filter_by(seller_id=s.id, status='published').order_by(Review.id.desc()).limit(5).all()
    return jsonify({
        'window_days': days, 'currency': 'SLE', 'verification_status': s.verification_status,
        'figures': {
            'total_orders': orders.count(), 'pending_orders': status_counts.get('pending', 0),
            'completed_orders': status_counts.get('completed', 0), 'cancelled_orders': status_counts.get('cancelled', 0),
            'gross_sales': money(gross), 'paid_revenue': money(paid),
            'active_listings': prods.filter(Product.status == 'active').count(),
            'listings_awaiting_review': prods.filter(Product.status == 'pending_review').count(),
            'rating_avg': round(float(avg), 1) if avg is not None else None, 'rating_count': int(n_rev or 0),
        },
        'notes': ['Gross sales = all orders that were not cancelled.',
                  'Paid revenue = only orders marked paid (by a payment provider or confirmed by you). SmartAgri does not collect money for you.'],
        'low_stock': low, 'sales_by_day': series, 'order_status_counts': status_counts,
        'recent_reviews': [{'rating': r.rating, 'comment': r.comment} for r in recent_reviews],
    }), 200
