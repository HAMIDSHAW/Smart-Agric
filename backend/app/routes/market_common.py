"""Shared helpers for the marketplace routes."""
import os
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from flask import jsonify
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func

from app import db
from app.models import User
from app.models_marketplace import (Category, MarketSetting, Order, Product, Review, SellerProfile)
from app.services.rbac import ADMIN_ROLES

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'uploads', 'marketplace'))
UNITS = ['kg', 'bag', 'tonne', 'piece', 'litre', 'bundle', 'basket', 'set']
VISIBLE_STATUSES = ('active', 'sold_out')
MAX_IMAGES = 6


def D(value, field='value', allow_zero=False, maximum=Decimal('1000000000')):
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f'{field} must be a number')
    if d < 0 or (d == 0 and not allow_zero) or d > maximum:
        raise ValueError(f'{field} is out of range')
    return d


def money(x):
    return None if x is None else float(Decimal(x).quantize(Decimal('0.01')))


def qty(x):
    return None if x is None else float(x)


def err(message, code=400, **extra):
    return jsonify({'error': message, **extra}), code


def me():
    return db.session.get(User, int(get_jwt_identity()))


def my_seller(user):
    return SellerProfile.query.filter_by(user_id=user.id).first()


def is_staff(user):
    return user.role in ADMIN_ROLES


def setting(key, default=None):
    row = db.session.get(MarketSetting, key)
    return row.value if row else default


def rating_for(seller_id=None, product_id=None):
    q = db.session.query(func.avg(Review.rating), func.count(Review.id)).filter(Review.status == 'published')
    if seller_id:
        q = q.filter(Review.seller_id == seller_id)
    if product_id:
        q = q.filter(Review.product_id == product_id)
    avg, n = q.one()
    return (round(float(avg), 1) if avg is not None else None), int(n or 0)


def seller_public(s):
    avg, n = rating_for(seller_id=s.id)
    return {'id': s.id, 'business_name': s.business_name, 'seller_type': s.seller_type, 'district': s.district,
            'description': s.description, 'verified': s.verification_status == 'verified',
            'verification_status': s.verification_status, 'rating_avg': avg, 'rating_count': n,
            'member_since': s.created_at.date().isoformat() if s.created_at else None}


def category_dict(c):
    return {'id': c.id, 'slug': c.slug, 'name': c.name, 'group': c.group, 'regulated': c.regulated, 'active': c.active}


def product_visible(p):
    return p.status in VISIBLE_STATUSES and p.seller.verification_status != 'suspended'


def price_for(p, quantity):
    if p.wholesale_price is not None and p.wholesale_min_qty is not None and quantity >= p.wholesale_min_qty:
        return 'wholesale', p.wholesale_price
    return 'retail', p.retail_price


def product_dict(p, detail=False, owner=False):
    avg, n = rating_for(product_id=p.id)
    d = {
        'id': p.id, 'title': p.title, 'listing_type': p.listing_type, 'unit': p.unit, 'currency': p.currency,
        'retail_price': money(p.retail_price), 'wholesale_price': money(p.wholesale_price),
        'wholesale_min_qty': qty(p.wholesale_min_qty), 'min_order_qty': qty(p.min_order_qty),
        'stock_qty': qty(p.stock_qty), 'in_stock': p.stock_qty > 0, 'district': p.district,
        'location_text': p.location_text, 'status': p.status,
        'available_from': p.available_from.isoformat() if p.available_from else None,
        'category': category_dict(p.category), 'regulated': p.regulated,
        'images': [{'id': i.id, 'url': f'/api/marketplace/images/{i.id}'} for i in p.images],
        'seller': seller_public(p.seller), 'rating_avg': avg, 'rating_count': n,
        'created_at': p.created_at.isoformat() if p.created_at else None,
        'fulfilment_options': p.fulfilment_options or [], 'pickup_point': p.pickup_point,
    }
    if detail or owner:
        d.update({'description': p.description, 'condition': p.condition})
    if owner:
        d.update({'moderation_note': p.moderation_note, 'low_stock_threshold': qty(p.low_stock_threshold)})
    return d


def new_order_number():
    return f"SA-{datetime.utcnow():%Y%m%d}-{uuid.uuid4().hex[:5].upper()}"


def add_event(order, kind, value, note=None, actor=None):
    from app.models_marketplace import OrderEvent
    db.session.add(OrderEvent(order=order, kind=kind, value=value, note=(note or None) and note[:255],
                              actor_id=getattr(actor, 'id', None)))


def order_dict(o, viewer, as_seller=False, staff=False):
    """Orders are shown in full only to the buyer, the selling shop, or marketplace staff."""
    seller_user = o.seller.user
    d = {
        'id': o.id, 'order_number': o.order_number, 'status': o.status, 'currency': o.currency,
        'subtotal': money(o.subtotal), 'delivery_fee': money(o.delivery_fee), 'total': money(o.total),
        'fulfilment_method': o.fulfilment_method, 'delivery_district': o.delivery_district,
        'pickup_point': o.pickup_point, 'buyer_note': o.buyer_note,
        'payment_method': o.payment_method, 'payment_status': o.payment_status,
        'payment_basis': o.payment_basis,
        'payment_notice': {
            'provider_verified': 'Verified by the payment provider.',
            'seller_confirmed': 'Confirmed by the seller. Not verified by a payment provider.',
        }.get(o.payment_basis),
        'cancel_reason': o.cancel_reason,
        'created_at': o.created_at.isoformat() if o.created_at else None,
        'updated_at': o.updated_at.isoformat() if o.updated_at else None,
        'items': [{'id': i.id, 'product_id': i.product_id, 'title': i.title, 'unit': i.unit,
                   'unit_price': money(i.unit_price), 'price_tier': i.price_tier, 'quantity': qty(i.quantity),
                   'line_total': money(i.line_total)} for i in o.items],
        'events': [{'kind': e.kind, 'value': e.value, 'note': e.note,
                    'at': e.created_at.isoformat() if e.created_at else None} for e in o.events],
        'seller': seller_public(o.seller),
        'payments': [{'provider': p.provider, 'status': p.status, 'amount': money(p.amount)} for p in o.payments],
    }
    if as_seller or staff:
        d['buyer'] = {'name': o.buyer.full_name, 'phone': o.contact_phone}
        d['delivery_address'] = o.delivery_address
        d['commission_rate'] = float(o.commission_rate)
        d['commission_amount'] = money(o.commission_amount)
        d['buyer_payment_reference'] = next((p.buyer_reference for p in o.payments if p.buyer_reference), None)
    else:
        d['delivery_address'] = o.delivery_address
        if (o.payment_method == 'manual_mobile_money' and o.payment_status in ('unpaid', 'awaiting_confirmation')
                and o.status not in ('cancelled',)):
            d['pay_to'] = {'mobile_money_number': o.seller.mobile_money_number,
                           'note': 'Pay the exact total, then enter your transaction reference. The order is only marked paid when the seller confirms receipt.'}
    return d


RESTORE_STATUSES = ('pending', 'confirmed', 'processing', 'ready', 'shipped')


def restore_stock(order):
    for it in order.items:
        if it.product_id:
            p = db.session.query(Product).filter_by(id=it.product_id).with_for_update().first()
            if p:
                p.stock_qty = (p.stock_qty or 0) + it.quantity
                if p.status == 'sold_out' and p.stock_qty > 0:
                    p.status = 'active'
