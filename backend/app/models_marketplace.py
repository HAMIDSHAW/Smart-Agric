"""Marketplace tables (Phase 5). All additive: nothing here changes existing tables."""
from datetime import datetime

from app import db

SELLER_TYPES = ['farmer', 'cooperative', 'supplier', 'wholesaler', 'retailer', 'business']
PRODUCT_STATUSES = ['draft', 'pending_review', 'active', 'rejected', 'paused', 'sold_out', 'removed']
ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'completed', 'cancelled']
FULFILMENT = ['pickup', 'seller_delivery', 'third_party_arranged']
PAYMENT_METHODS = ['cash_on_delivery', 'pay_on_pickup', 'manual_mobile_money']


class SellerProfile(db.Model):
    __tablename__ = 'seller_profiles'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False)
    business_name = db.Column(db.String(120), nullable=False)
    seller_type = db.Column(db.String(20), nullable=False)
    description = db.Column(db.Text)
    district = db.Column(db.String(80))
    location_text = db.Column(db.String(160))
    contact_phone = db.Column(db.String(30))            # never shown publicly
    registration_number = db.Column(db.String(60))      # business / cooperative registration, if any
    mobile_money_number = db.Column(db.String(30))      # shown to a buyer only for their own manual-mobile-money order
    # unverified | pending | verified | rejected | suspended
    verification_status = db.Column(db.String(20), nullable=False, default='unverified')
    verification_note = db.Column(db.String(255))
    verified_at = db.Column(db.DateTime)
    verified_by = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref=db.backref('seller_profile', uselist=False))


class Category(db.Model):
    __tablename__ = 'market_categories'
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(60), unique=True, nullable=False)
    name = db.Column(db.String(80), nullable=False)
    group = db.Column(db.String(20), nullable=False)    # inputs | equipment | produce
    regulated = db.Column(db.Boolean, nullable=False, default=False)
    active = db.Column(db.Boolean, nullable=False, default=True)
    sort = db.Column(db.Integer, default=0)


class Product(db.Model):
    __tablename__ = 'market_products'
    id = db.Column(db.Integer, primary_key=True)
    seller_id = db.Column(db.Integer, db.ForeignKey('seller_profiles.id'), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey('market_categories.id'), nullable=False, index=True)
    title = db.Column(db.String(140), nullable=False)
    description = db.Column(db.Text)
    listing_type = db.Column(db.String(20), nullable=False, default='product')   # product | harvest_forecast
    condition = db.Column(db.String(20))                # new | used | n/a
    unit = db.Column(db.String(20), nullable=False, default='kg')
    retail_price = db.Column(db.Numeric(12, 2), nullable=False)
    wholesale_price = db.Column(db.Numeric(12, 2))
    wholesale_min_qty = db.Column(db.Numeric(12, 2))
    min_order_qty = db.Column(db.Numeric(12, 2), nullable=False, default=1)
    stock_qty = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    low_stock_threshold = db.Column(db.Numeric(12, 2), default=5)
    currency = db.Column(db.String(3), nullable=False, default='SLE')
    district = db.Column(db.String(80), index=True)
    location_text = db.Column(db.String(160))
    available_from = db.Column(db.Date)                 # harvest forecasts
    fulfilment_options = db.Column(db.JSON)             # subset of FULFILMENT
    pickup_point = db.Column(db.String(160))
    status = db.Column(db.String(20), nullable=False, default='draft', index=True)
    moderation_note = db.Column(db.String(255))
    regulated = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    seller = db.relationship('SellerProfile', backref='products')
    category = db.relationship('Category')
    images = db.relationship('ProductImage', backref='product', cascade='all, delete-orphan',
                             order_by='ProductImage.position')


class ProductImage(db.Model):
    __tablename__ = 'market_product_images'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('market_products.id', ondelete='CASCADE'), nullable=False, index=True)
    filename = db.Column(db.String(80), nullable=False)
    position = db.Column(db.Integer, default=0)


class CartItem(db.Model):
    __tablename__ = 'market_cart_items'
    __table_args__ = (db.UniqueConstraint('user_id', 'product_id', name='uq_cart_user_product'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey('market_products.id', ondelete='CASCADE'), nullable=False)
    quantity = db.Column(db.Numeric(12, 2), nullable=False, default=1)
    product = db.relationship('Product')


class WishlistItem(db.Model):
    __tablename__ = 'market_wishlist'
    __table_args__ = (db.UniqueConstraint('user_id', 'product_id', name='uq_wish_user_product'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey('market_products.id', ondelete='CASCADE'), nullable=False)
    product = db.relationship('Product')


class Order(db.Model):
    __tablename__ = 'market_orders'
    __table_args__ = (db.UniqueConstraint('buyer_id', 'checkout_key', 'seller_id', name='uq_order_checkout'),)
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(30), unique=True, nullable=False)
    checkout_key = db.Column(db.String(64), nullable=False)             # idempotency key from the client
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    seller_id = db.Column(db.Integer, db.ForeignKey('seller_profiles.id'), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default='pending', index=True)
    subtotal = db.Column(db.Numeric(12, 2), nullable=False)
    delivery_fee = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    total = db.Column(db.Numeric(12, 2), nullable=False)
    currency = db.Column(db.String(3), nullable=False, default='SLE')
    fulfilment_method = db.Column(db.String(24), nullable=False)
    delivery_address = db.Column(db.String(255))
    delivery_district = db.Column(db.String(80))
    contact_phone = db.Column(db.String(30))
    pickup_point = db.Column(db.String(160))
    buyer_note = db.Column(db.String(500))
    payment_method = db.Column(db.String(30), nullable=False)
    # unpaid | awaiting_confirmation | paid | failed | refund_due | refunded
    payment_status = db.Column(db.String(24), nullable=False, default='unpaid', index=True)
    payment_basis = db.Column(db.String(20))              # provider_verified | seller_confirmed (only when paid)
    commission_rate = db.Column(db.Numeric(5, 2), nullable=False, default=0)
    commission_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    cancel_reason = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    items = db.relationship('OrderItem', backref='order', cascade='all, delete-orphan')
    events = db.relationship('OrderEvent', backref='order', cascade='all, delete-orphan', order_by='OrderEvent.id')
    seller = db.relationship('SellerProfile')
    buyer = db.relationship('User', foreign_keys=[buyer_id])


class OrderItem(db.Model):
    __tablename__ = 'market_order_items'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('market_orders.id', ondelete='CASCADE'), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey('market_products.id', ondelete='SET NULL'), nullable=True)
    title = db.Column(db.String(140), nullable=False)       # snapshot
    unit = db.Column(db.String(20), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)   # snapshot (retail or wholesale)
    price_tier = db.Column(db.String(12), nullable=False, default='retail')
    quantity = db.Column(db.Numeric(12, 2), nullable=False)
    line_total = db.Column(db.Numeric(12, 2), nullable=False)


class OrderEvent(db.Model):
    __tablename__ = 'market_order_events'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('market_orders.id', ondelete='CASCADE'), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)         # status | payment | note
    value = db.Column(db.String(40), nullable=False)
    note = db.Column(db.String(255))
    actor_id = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Payment(db.Model):
    __tablename__ = 'market_payments'
    __table_args__ = (db.UniqueConstraint('provider', 'provider_reference', name='uq_payment_ref'),)
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('market_orders.id'), nullable=False, index=True)
    provider = db.Column(db.String(30), nullable=False)
    provider_reference = db.Column(db.String(80))
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    currency = db.Column(db.String(3), nullable=False)
    # pending | verified | seller_confirmed | failed | amount_mismatch
    status = db.Column(db.String(20), nullable=False, default='pending')
    buyer_reference = db.Column(db.String(80))              # what the buyer typed (e.g. mobile money txn id): NOT proof
    confirmed_by = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    verified_at = db.Column(db.DateTime)
    order = db.relationship('Order', backref='payments')


class WebhookEvent(db.Model):
    __tablename__ = 'market_webhook_events'
    __table_args__ = (db.UniqueConstraint('provider', 'event_id', name='uq_webhook_event'),)
    id = db.Column(db.Integer, primary_key=True)
    provider = db.Column(db.String(30), nullable=False)
    event_id = db.Column(db.String(80), nullable=False)
    outcome = db.Column(db.String(30))
    received_at = db.Column(db.DateTime, default=datetime.utcnow)


class Review(db.Model):
    __tablename__ = 'market_reviews'
    __table_args__ = (db.UniqueConstraint('order_id', 'product_id', name='uq_review_order_product'),)
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('market_orders.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('market_products.id', ondelete='SET NULL'), nullable=True, index=True)
    seller_id = db.Column(db.Integer, db.ForeignKey('seller_profiles.id'), nullable=False, index=True)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.String(1000))
    status = db.Column(db.String(12), nullable=False, default='published')    # published | hidden
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    buyer = db.relationship('User')


class Report(db.Model):
    __tablename__ = 'market_reports'
    id = db.Column(db.Integer, primary_key=True)
    reporter_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    target_type = db.Column(db.String(12), nullable=False)       # product | seller | review | order
    target_id = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(30), nullable=False)
    details = db.Column(db.String(1000))
    status = db.Column(db.String(12), nullable=False, default='open', index=True)   # open | actioned | dismissed
    resolved_by = db.Column(db.Integer)
    resolution_note = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Dispute(db.Model):
    __tablename__ = 'market_disputes'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('market_orders.id'), nullable=False, index=True)
    opened_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    reason = db.Column(db.String(30), nullable=False)
    details = db.Column(db.String(1000))
    status = db.Column(db.String(20), nullable=False, default='open', index=True)   # open | resolved | closed
    resolution = db.Column(db.String(30))                        # in_favour_of_buyer | in_favour_of_seller | settled
    resolution_note = db.Column(db.String(500))
    resolved_by = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    order = db.relationship('Order')


class Enquiry(db.Model):
    __tablename__ = 'market_enquiries'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('market_products.id', ondelete='SET NULL'), nullable=True)
    request_id = db.Column(db.Integer, db.ForeignKey('market_buyer_requests.id', ondelete='SET NULL'), nullable=True)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    seller_id = db.Column(db.Integer, db.ForeignKey('seller_profiles.id'), nullable=False, index=True)
    kind = db.Column(db.String(12), nullable=False, default='enquiry')   # enquiry | bulk | negotiation
    subject = db.Column(db.String(140), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    messages = db.relationship('EnquiryMessage', backref='enquiry', cascade='all, delete-orphan', order_by='EnquiryMessage.id')
    product = db.relationship('Product')
    seller = db.relationship('SellerProfile')
    buyer = db.relationship('User')


class EnquiryMessage(db.Model):
    __tablename__ = 'market_enquiry_messages'
    id = db.Column(db.Integer, primary_key=True)
    enquiry_id = db.Column(db.Integer, db.ForeignKey('market_enquiries.id', ondelete='CASCADE'), nullable=False, index=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    body = db.Column(db.String(2000), nullable=False)
    offered_price = db.Column(db.Numeric(12, 2))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class BuyerRequest(db.Model):
    __tablename__ = 'market_buyer_requests'
    id = db.Column(db.Integer, primary_key=True)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey('market_categories.id'))
    title = db.Column(db.String(140), nullable=False)
    details = db.Column(db.String(1000))
    quantity = db.Column(db.Numeric(12, 2))
    unit = db.Column(db.String(20))
    target_price = db.Column(db.Numeric(12, 2))
    district = db.Column(db.String(80))
    needed_by = db.Column(db.Date)
    status = db.Column(db.String(10), nullable=False, default='open', index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    category = db.relationship('Category')
    buyer = db.relationship('User')


class MarketSetting(db.Model):
    __tablename__ = 'market_settings'
    key = db.Column(db.String(40), primary_key=True)
    value = db.Column(db.String(120), nullable=False)
    updated_by = db.Column(db.Integer)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)


DEFAULT_CATEGORIES = [
    # slug, name, group, regulated
    ('seeds', 'Seeds and seedlings', 'inputs', False),
    ('fertilizers', 'Fertilizers', 'inputs', False),
    ('pesticides', 'Approved pesticides', 'inputs', True),
    ('herbicides', 'Herbicides', 'inputs', True),
    ('crop-protection', 'Crop protection products', 'inputs', True),
    ('soil-improvement', 'Soil improvement products', 'inputs', False),
    ('hand-tools', 'Hand tools', 'equipment', False),
    ('irrigation', 'Irrigation systems', 'equipment', False),
    ('water-pumps', 'Water pumps', 'equipment', False),
    ('machinery', 'Tractors and machinery', 'equipment', False),
    ('protective-equipment', 'Protective equipment', 'equipment', False),
    ('farm-accessories', 'Farm accessories', 'equipment', False),
    ('rice', 'Rice', 'produce', False),
    ('cassava', 'Cassava', 'produce', False),
    ('maize', 'Maize', 'produce', False),
    ('cocoa', 'Cocoa', 'produce', False),
    ('coffee', 'Coffee', 'produce', False),
    ('groundnuts', 'Groundnuts', 'produce', False),
    ('vegetables', 'Vegetables', 'produce', False),
    ('fruits', 'Fruits', 'produce', False),
    ('other-produce', 'Other locally produced crops', 'produce', False),
]
DEFAULT_SETTINGS = {'commission_rate': '0', 'premoderate_all': 'false', 'currency': 'SLE'}


def seed_reference_data():
    """Idempotent. Creates the category list and default settings (structure, not fake data)."""
    for i, (slug, name, group, reg) in enumerate(DEFAULT_CATEGORIES):
        if not Category.query.filter_by(slug=slug).first():
            db.session.add(Category(slug=slug, name=name, group=group, regulated=reg, sort=i))
    for k, v in DEFAULT_SETTINGS.items():
        if not db.session.get(MarketSetting, k):
            db.session.add(MarketSetting(key=k, value=v))
    db.session.commit()
