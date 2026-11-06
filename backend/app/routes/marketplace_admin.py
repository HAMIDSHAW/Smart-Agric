"""Marketplace administration (mounted at /api/admin/marketplace). Server-side permissions + audit log."""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app import db
from app.models import User
from app.models_marketplace import (Category, Dispute, MarketSetting, Order, Payment, Product, Report, Review,
                                    SellerProfile)
from app.routes.market_common import (D, category_dict, err, money, order_dict, product_dict, restore_stock,
                                      seller_public, add_event)
from app.services.audit import audit
from app.services.rbac import current_user, require_permission

market_admin_bp = Blueprint('market_admin', __name__)


def _page(default=20):
    return max(request.args.get('page', 1, type=int), 1), min(max(request.args.get('per_page', default, type=int), 1), 100)


def _j():
    return request.get_json(silent=True) or {}


def marketplace_stats():
    """Real counts for the admin overview. Also used by /api/admin/dashboard."""
    orders = Order.query.filter(Order.status != 'cancelled')
    return {
        'available': True,
        'sellers': dict(db.session.query(SellerProfile.verification_status, func.count(SellerProfile.id)).group_by(SellerProfile.verification_status).all()),
        'products': dict(db.session.query(Product.status, func.count(Product.id)).group_by(Product.status).all()),
        'orders_total': Order.query.count(),
        'orders_by_status': dict(db.session.query(Order.status, func.count(Order.id)).group_by(Order.status).all()),
        'gross_sales': money(orders.with_entities(func.coalesce(func.sum(Order.total), 0)).scalar()),
        'paid_orders': {
            'provider_verified': Order.query.filter_by(payment_status='paid', payment_basis='provider_verified').count(),
            'seller_confirmed': Order.query.filter_by(payment_status='paid', payment_basis='seller_confirmed').count(),
        },
        'refunds_due': Order.query.filter_by(payment_status='refund_due').count(),
        'open_reports': Report.query.filter_by(status='open').count(),
        'open_disputes': Dispute.query.filter_by(status='open').count(),
        'commission_recorded': money(orders.with_entities(func.coalesce(func.sum(Order.commission_amount), 0)).scalar()),
        'currency': 'SLE',
    }


@market_admin_bp.route('/overview', methods=['GET'])
@require_permission('marketplace.manage', 'marketplace.verify_sellers', any_of=True)
def overview():
    return jsonify(marketplace_stats()), 200


# ───────── sellers ─────────

def _seller_row(s):
    d = seller_public(s)
    d.update({'user_id': s.user_id, 'owner_email': s.user.email, 'owner_name': s.user.full_name,
              'registration_number': s.registration_number, 'contact_phone': s.contact_phone,
              'verification_note': s.verification_note, 'verified_at': s.verified_at.isoformat() if s.verified_at else None,
              'listings': Product.query.filter_by(seller_id=s.id).filter(Product.status != 'removed').count()})
    return d


@market_admin_bp.route('/sellers', methods=['GET'])
@require_permission('marketplace.verify_sellers', 'marketplace.manage', any_of=True)
def sellers():
    page, per = _page()
    q = SellerProfile.query
    if request.args.get('status'):
        q = q.filter(SellerProfile.verification_status == request.args['status'])
    if request.args.get('q'):
        like = f"%{request.args['q'].lower()}%"
        q = q.filter(func.lower(SellerProfile.business_name).like(like))
    p = q.order_by(SellerProfile.id.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'sellers': [_seller_row(s) for s in p.items], 'total': p.total, 'pages': p.pages}), 200


def _seller_action(sid, action):
    actor = current_user()
    s = db.session.get(SellerProfile, sid)
    if not s:
        return err('Seller not found', 404)
    note = str(_j().get('note', '')).strip()[:255]
    old = s.verification_status
    if action == 'verify':
        if old not in ('pending', 'unverified', 'rejected'):
            return err(f'Seller is {old}.', 409)
        if len(note) < 5:
            return err('Record what you checked (at least 5 characters).')
        s.verification_status, s.verified_at, s.verified_by, s.verification_note = 'verified', datetime.utcnow(), actor.id, note
    elif action == 'reject':
        if not note:
            return err('Give a reason.')
        s.verification_status, s.verification_note = 'rejected', note
        for p in Product.query.filter_by(seller_id=s.id, regulated=True, status='active').all():
            p.status, p.moderation_note = 'pending_review', 'Seller verification was rejected.'
    elif action == 'suspend':
        if not note:
            return err('Give a reason.')
        s.verification_status, s.verification_note = 'suspended', note
    elif action == 'restore':
        if old != 'suspended':
            return err('Seller is not suspended.', 409)
        s.verification_status = 'verified' if s.verified_at else 'unverified'
    db.session.commit()
    audit(f'seller_{action}', actor=actor, target_type='seller', target_id=s.id, details={'from': old, 'to': s.verification_status, 'note': note})
    return jsonify({'seller': _seller_row(s)}), 200


@market_admin_bp.route('/sellers/<int:sid>/<action>', methods=['POST'])
@require_permission('marketplace.verify_sellers')
def seller_action(sid, action):
    if action not in ('verify', 'reject', 'suspend', 'restore'):
        return err('Unknown action', 404)
    return _seller_action(sid, action)


# ───────── products ─────────

@market_admin_bp.route('/products', methods=['GET'])
@require_permission('marketplace.manage')
def products():
    page, per = _page()
    q = Product.query
    if request.args.get('status'):
        q = q.filter(Product.status == request.args['status'])
    if request.args.get('regulated') in ('1', 'true'):
        q = q.filter(Product.regulated.is_(True))
    if request.args.get('q'):
        q = q.filter(func.lower(Product.title).like(f"%{request.args['q'].lower()}%"))
    p = q.order_by(Product.id.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'products': [product_dict(x, detail=True, owner=True) for x in p.items], 'total': p.total, 'pages': p.pages}), 200


@market_admin_bp.route('/products/<int:pid>/<action>', methods=['POST'])
@require_permission('marketplace.manage')
def product_action(pid, action):
    actor = current_user()
    p = db.session.get(Product, pid)
    if not p:
        return err('Product not found', 404)
    note = str(_j().get('note', '')).strip()[:255]
    old = p.status
    if action == 'approve':
        if old != 'pending_review':
            return err('Only listings awaiting review can be approved.', 409)
        if p.regulated and p.seller.verification_status != 'verified':
            return err('Regulated products need a verified seller.', 409)
        p.status = 'sold_out' if (p.listing_type == 'product' and p.stock_qty <= 0) else 'active'
        p.moderation_note = None
    elif action == 'reject':
        if not note:
            return err('Give a reason so the seller can fix it.')
        p.status, p.moderation_note = 'rejected', note
    elif action == 'remove':
        if not note:
            return err('Give a reason.')
        p.status, p.moderation_note = 'removed', note
        for o in Order.query.filter(Order.status.in_(('pending',)), Order.items.any(product_id=p.id)).all():
            pass                                  # existing orders keep their own lifecycle
    else:
        return err('Unknown action', 404)
    db.session.commit()
    audit(f'product_{action}', actor=actor, target_type='product', target_id=p.id, details={'from': old, 'to': p.status, 'note': note})
    return jsonify({'product': product_dict(p, detail=True, owner=True)}), 200


# ───────── categories ─────────

@market_admin_bp.route('/categories', methods=['GET'])
@require_permission('marketplace.manage')
def categories():
    return jsonify({'categories': [category_dict(c) for c in Category.query.order_by(Category.sort).all()]}), 200


@market_admin_bp.route('/categories', methods=['POST'])
@require_permission('marketplace.manage')
def create_category():
    actor, d = current_user(), _j()
    name, group = str(d.get('name', '')).strip()[:80], d.get('group')
    slug = ''.join(ch if ch.isalnum() else '-' for ch in str(d.get('slug') or name).lower()).strip('-')[:60]
    if len(name) < 2 or group not in ('inputs', 'equipment', 'produce') or not slug:
        return err('Name and a group (inputs, equipment or produce) are required.')
    if Category.query.filter_by(slug=slug).first():
        return err('A category with that name already exists.', 409)
    c = Category(slug=slug, name=name, group=group, regulated=bool(d.get('regulated')), sort=(db.session.query(func.max(Category.sort)).scalar() or 0) + 1)
    db.session.add(c)
    db.session.commit()
    audit('category_created', actor=actor, target_type='category', target_id=c.id, details={'slug': slug, 'regulated': c.regulated})
    return jsonify({'category': category_dict(c)}), 201


@market_admin_bp.route('/categories/<int:cid>', methods=['PUT'])
@require_permission('marketplace.manage')
def update_category(cid):
    actor, d = current_user(), _j()
    c = db.session.get(Category, cid)
    if not c:
        return err('Category not found', 404)
    changed = {}
    for f in ('name',):
        if f in d and 2 <= len(str(d[f]).strip()) <= 80:
            setattr(c, f, str(d[f]).strip()); changed[f] = True
    for f in ('regulated', 'active'):
        if f in d:
            setattr(c, f, bool(d[f])); changed[f] = bool(d[f])
    db.session.commit()
    audit('category_updated', actor=actor, target_type='category', target_id=c.id, details=changed)
    return jsonify({'category': category_dict(c)}), 200


# ───────── orders & payments ─────────

@market_admin_bp.route('/orders', methods=['GET'])
@require_permission('marketplace.manage')
def orders():
    page, per = _page()
    q = Order.query
    for f in ('status', 'payment_status', 'payment_basis'):
        if request.args.get(f):
            q = q.filter(getattr(Order, f) == request.args[f])
    if request.args.get('q'):
        q = q.filter(Order.order_number.like(f"%{request.args['q'].upper()}%"))
    p = q.order_by(Order.id.desc()).paginate(page=page, per_page=per, error_out=False)
    u = current_user()
    return jsonify({'orders': [order_dict(o, u, staff=True) for o in p.items], 'total': p.total, 'pages': p.pages}), 200


@market_admin_bp.route('/orders/<int:oid>', methods=['GET'])
@require_permission('marketplace.manage')
def order_detail(oid):
    o = db.session.get(Order, oid)
    return (jsonify({'order': order_dict(o, current_user(), staff=True)}), 200) if o else err('Order not found', 404)


@market_admin_bp.route('/payments', methods=['GET'])
@require_permission('marketplace.manage')
def payments_list():
    page, per = _page()
    q = Payment.query
    if request.args.get('status'):
        q = q.filter(Payment.status == request.args['status'])
    p = q.order_by(Payment.id.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'payments': [{
        'id': x.id, 'order_number': x.order.order_number, 'provider': x.provider, 'status': x.status,
        'amount': money(x.amount), 'currency': x.currency, 'buyer_reference': x.buyer_reference,
        'basis': {'verified': 'provider_verified', 'seller_confirmed': 'seller_confirmed'}.get(x.status),
        'created_at': x.created_at.isoformat() if x.created_at else None} for x in p.items],
        'total': p.total, 'pages': p.pages,
        'note': 'Only "verified" rows were confirmed by a payment provider. "seller_confirmed" rows are the seller\'s own confirmation.'}), 200


# ───────── reports, disputes, reviews ─────────

@market_admin_bp.route('/reports', methods=['GET'])
@require_permission('marketplace.manage')
def reports():
    page, per = _page()
    q = Report.query
    if request.args.get('status'):
        q = q.filter(Report.status == request.args['status'])
    p = q.order_by(Report.id.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'reports': [{'id': r.id, 'target_type': r.target_type, 'target_id': r.target_id, 'reason': r.reason,
                                 'details': r.details, 'status': r.status, 'resolution_note': r.resolution_note,
                                 'created_at': r.created_at.isoformat()} for r in p.items], 'total': p.total, 'pages': p.pages}), 200


@market_admin_bp.route('/reports/<int:rid>/resolve', methods=['POST'])
@require_permission('marketplace.manage')
def resolve_report(rid):
    actor, d = current_user(), _j()
    r = db.session.get(Report, rid)
    if not r or r.status != 'open':
        return err('Open report not found', 404)
    action, note = d.get('action'), str(d.get('note', '')).strip()[:255]
    if action not in ('dismiss', 'remove_product', 'suspend_seller', 'hide_review'):
        return err('action must be dismiss, remove_product, suspend_seller or hide_review')
    if len(note) < 3:
        return err('Add a short note about your decision.')
    done = None
    if action == 'remove_product' and r.target_type == 'product':
        p = db.session.get(Product, r.target_id)
        if p: p.status, p.moderation_note, done = 'removed', note, True
    elif action == 'suspend_seller' and r.target_type in ('seller', 'product'):
        sid = r.target_id if r.target_type == 'seller' else (db.session.get(Product, r.target_id).seller_id if db.session.get(Product, r.target_id) else None)
        s = db.session.get(SellerProfile, sid) if sid else None
        if s: s.verification_status, s.verification_note, done = 'suspended', note, True
    elif action == 'hide_review' and r.target_type == 'review':
        rv = db.session.get(Review, r.target_id)
        if rv: rv.status, done = 'hidden', True
    if action != 'dismiss' and not done:
        return err('That action does not apply to this report.', 409)
    r.status = 'dismissed' if action == 'dismiss' else 'actioned'
    r.resolved_by, r.resolution_note = actor.id, note
    db.session.commit()
    audit('market_report_resolved', actor=actor, target_type='report', target_id=r.id, details={'action': action, 'target': f'{r.target_type}:{r.target_id}'})
    return jsonify({'ok': True}), 200


@market_admin_bp.route('/disputes', methods=['GET'])
@require_permission('marketplace.manage')
def disputes():
    page, per = _page()
    q = Dispute.query
    if request.args.get('status'):
        q = q.filter(Dispute.status == request.args['status'])
    p = q.order_by(Dispute.id.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'disputes': [{'id': x.id, 'order_id': x.order_id, 'order_number': x.order.order_number,
                                  'total': money(x.order.total), 'payment_status': x.order.payment_status,
                                  'reason': x.reason, 'details': x.details, 'status': x.status, 'resolution': x.resolution,
                                  'resolution_note': x.resolution_note, 'opened_by': x.opened_by,
                                  'created_at': x.created_at.isoformat()} for x in p.items], 'total': p.total, 'pages': p.pages}), 200


@market_admin_bp.route('/disputes/<int:did>/resolve', methods=['POST'])
@require_permission('marketplace.manage')
def resolve_dispute(did):
    actor, d = current_user(), _j()
    x = db.session.get(Dispute, did)
    if not x or x.status != 'open':
        return err('Open dispute not found', 404)
    res, note = d.get('resolution'), str(d.get('note', '')).strip()[:500]
    if res not in ('in_favour_of_buyer', 'in_favour_of_seller', 'settled') or len(note) < 5:
        return err('Choose a resolution and explain it (at least 5 characters).')
    o = x.order
    if res == 'in_favour_of_buyer' and o.payment_status == 'paid':
        o.payment_status = 'refund_due'
        add_event(o, 'payment', 'refund_due', 'Dispute decided for the buyer: refund owed (arranged outside SmartAgri)', actor)
    x.status, x.resolution, x.resolution_note, x.resolved_by = 'resolved', res, note, actor.id
    add_event(o, 'note', 'dispute_resolved', res, actor)
    db.session.commit()
    audit('dispute_resolved', actor=actor, target_type='dispute', target_id=x.id, details={'resolution': res})
    return jsonify({'ok': True}), 200


@market_admin_bp.route('/reviews', methods=['GET'])
@require_permission('marketplace.manage')
def reviews():
    page, per = _page()
    q = Review.query
    if request.args.get('status'):
        q = q.filter(Review.status == request.args['status'])
    p = q.order_by(Review.id.desc()).paginate(page=page, per_page=per, error_out=False)
    return jsonify({'reviews': [{'id': r.id, 'rating': r.rating, 'comment': r.comment, 'status': r.status,
                                 'product_id': r.product_id, 'seller_id': r.seller_id,
                                 'created_at': r.created_at.isoformat()} for r in p.items], 'total': p.total, 'pages': p.pages}), 200


@market_admin_bp.route('/reviews/<int:rid>/<action>', methods=['POST'])
@require_permission('marketplace.manage')
def review_action(rid, action):
    actor = current_user()
    r = db.session.get(Review, rid)
    if not r or action not in ('hide', 'publish'):
        return err('Not found', 404)
    r.status = 'hidden' if action == 'hide' else 'published'
    db.session.commit()
    audit(f'review_{action}', actor=actor, target_type='review', target_id=r.id)
    return jsonify({'ok': True}), 200


# ───────── settings ─────────

@market_admin_bp.route('/settings', methods=['GET'])
@require_permission('marketplace.manage')
def get_settings():
    return jsonify({'settings': {r.key: r.value for r in MarketSetting.query.all()},
                    'notes': {'commission_rate': 'Percent recorded on each new order for reporting. SmartAgri does not collect it automatically.',
                              'premoderate_all': 'When true, every new listing is reviewed before it goes live (regulated products always are).'}}), 200


@market_admin_bp.route('/settings', methods=['PUT'])
@require_permission('marketplace.manage')
def put_settings():
    actor, d = current_user(), _j()
    changed = {}
    if 'commission_rate' in d:
        try:
            rate = D(d['commission_rate'], 'commission_rate', allow_zero=True, maximum=30)
        except ValueError as e:
            return err(str(e))
        changed['commission_rate'] = str(rate)
    if 'premoderate_all' in d:
        changed['premoderate_all'] = 'true' if d['premoderate_all'] in (True, 'true') else 'false'
    for k, v in changed.items():
        row = db.session.get(MarketSetting, k) or MarketSetting(key=k, value=v)
        row.value, row.updated_by, row.updated_at = v, actor.id, datetime.utcnow()
        db.session.merge(row)
    db.session.commit()
    audit('market_settings_changed', actor=actor, details=changed)
    return jsonify({'settings': {r.key: r.value for r in MarketSetting.query.all()}}), 200
