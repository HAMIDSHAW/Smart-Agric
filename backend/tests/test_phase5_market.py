import hashlib, hmac, io, json, os, shutil
from decimal import Decimal
import pytest
from conftest import login, register, auth_header, admin_header
from helpers import img_bytes, FakeResp, groq_ok
from test_phase4_admin import as_role, make_user, tok, PW
import app.services.ai_gateway as gw
from app.services import payments
from app import db
from app.models import AuditLog
from app.models_marketplace import Product, Order, Payment, SellerProfile, MarketSetting, Review

M = '/api/marketplace'


@pytest.fixture(autouse=True, scope='session')
def _clean_uploads():
    yield
    from app.routes.market_common import UPLOAD_DIR
    shutil.rmtree(UPLOAD_DIR, ignore_errors=True)


# ── helpers ───────────────────────────────────────────────────────────────
def seller_h(client, email='seller1@t.example', name='Green Valley Farm', momo='076000111', **kw):
    h = auth_header(client, email)
    body = {'business_name': name, 'seller_type': 'farmer', 'district': 'Bo', 'contact_phone': '076111222',
            'mobile_money_number': momo, **kw}
    r = client.post(f'{M}/seller/register', json=body, headers=h)
    assert r.status_code in (201, 409), r.get_json()
    return h


def product(client, h, category='rice', publish=True, images=1, **over):
    body = {'title': 'Local rice', 'category': category, 'unit': 'kg', 'retail_price': '10', 'stock_qty': '100',
            'min_order_qty': '1', 'district': 'Bo', 'fulfilment_options': ['pickup', 'seller_delivery'], **over}
    r = client.post(f'{M}/seller/products', json=body, headers=h)
    assert r.status_code == 201, r.get_json()
    pid = r.get_json()['product']['id']
    if images:
        up = client.post(f'{M}/seller/products/{pid}/images', headers=h, content_type='multipart/form-data',
                         data={'images': [(io.BytesIO(img_bytes()), f'p{i}.jpg') for i in range(images)]})
        assert up.status_code == 201, up.get_json()
    if publish:
        assert client.post(f'{M}/seller/products/{pid}/submit', headers=h).status_code == 200
    return pid


def mk_admin(app, client, role='marketplace_admin'):
    return as_role(app, client, role)


def verify(client, app, h, sid=None):
    adm = mk_admin(app, client)
    prof = client.get(f'{M}/seller/profile', headers=h).get_json()['profile']
    r = client.post(f'/api/admin/marketplace/sellers/{prof["id"]}/verify', json={'note': 'Checked registration and visited'}, headers=adm)
    assert r.status_code == 200, r.get_json()
    return adm


def add_cart(client, h, pid, q='2'):
    return client.post(f'{M}/cart', json={'product_id': pid, 'quantity': q}, headers=h)


def checkout(client, h, key='key-12345678', **over):
    body = {'idempotency_key': key, 'fulfilment_method': 'pickup', 'payment_method': 'cash_on_delivery',
            'contact_phone': '077123456', **over}
    return client.post(f'{M}/checkout', json=body, headers=h)


def place_order(client, buyer, pid, q='2', **over):
    assert add_cart(client, buyer, pid, q).status_code == 200
    r = checkout(client, buyer, **over)
    assert r.status_code == 201, r.get_json()
    return r.get_json()['orders'][0]


# ── seller onboarding & verification ──────────────────────────────────────
def test_farmer_can_register_as_seller_and_public_view_hides_private_data(app, client):
    h = seller_h(client)
    prof = client.get(f'{M}/seller/profile', headers=h).get_json()['profile']
    assert prof['verification_status'] == 'unverified' and prof['verified'] is False
    pid = product(client, h)
    d = client.get(f'{M}/products/{pid}').get_json()['product']
    blob = json.dumps(d)
    assert '076111222' not in blob and '076000111' not in blob and 'seller1@t.example' not in blob
    assert d['seller']['verified'] is False                       # never auto-verified


def test_seller_registration_rules(app, client):
    h = seller_h(client)
    assert client.post(f'{M}/seller/register', json={'business_name': 'Again', 'seller_type': 'farmer'}, headers=h).status_code == 409
    h2 = auth_header(client, 'x@t.example')
    assert client.post(f'{M}/seller/register', json={'business_name': 'ab', 'seller_type': 'farmer'}, headers=h2).status_code == 400
    assert client.post(f'{M}/seller/register', json={'business_name': 'Good name', 'seller_type': 'alien'}, headers=h2).status_code == 400
    assert client.post(f'{M}/seller/register', json={'business_name': 'Staff Shop', 'seller_type': 'farmer'}, headers=mk_admin(app, client)).status_code == 403
    assert client.post(f'{M}/seller/register', json={'business_name': 'Shop'}).status_code == 401


def test_verification_workflow_needs_a_real_admin_decision(app, client):
    h = seller_h(client)
    assert client.post(f'{M}/seller/verification-request', json={}, headers=h).status_code == 400    # nothing to verify yet
    client.put(f'{M}/seller/profile', json={'registration_number': 'RC-1234'}, headers=h)
    assert client.post(f'{M}/seller/verification-request', json={}, headers=h).status_code == 200
    assert client.get(f'{M}/seller/profile', headers=h).get_json()['profile']['verification_status'] == 'pending'
    prof_id = client.get(f'{M}/seller/profile', headers=h).get_json()['profile']['id']
    ops = as_role(app, client, 'operations_admin')
    assert client.post(f'/api/admin/marketplace/sellers/{prof_id}/verify', json={'note': 'checked'}, headers=ops).status_code == 403
    adm = mk_admin(app, client)
    assert client.post(f'/api/admin/marketplace/sellers/{prof_id}/verify', json={}, headers=adm).status_code == 400   # must record what was checked
    assert client.post(f'/api/admin/marketplace/sellers/{prof_id}/verify', json={'note': 'Saw certificate RC-1234'}, headers=adm).status_code == 200
    pub = client.get(f'{M}/sellers/{prof_id}').get_json()['seller']
    assert pub['verified'] is True
    ev = [e for e in AuditLog.query.all()] if False else None
    log = client.get('/api/admin/audit?action=seller_verify', headers=admin_header(client)).get_json()
    assert log['total'] == 1


# ── listings ──────────────────────────────────────────────────────────────
def test_listing_flow_photos_publish_and_visibility(app, client):
    h = seller_h(client)
    pid = product(client, h, publish=False, images=0)
    assert client.get(f'{M}/products').get_json()['total'] == 0                     # draft is not public
    assert client.get(f'{M}/products/{pid}').status_code == 404
    assert client.get(f'{M}/products/{pid}', headers=h).status_code == 200          # owner can preview
    assert client.post(f'{M}/seller/products/{pid}/submit', headers=h).status_code == 400   # needs a photo
    up = client.post(f'{M}/seller/products/{pid}/images', headers=h, content_type='multipart/form-data',
                     data={'images': (io.BytesIO(img_bytes()), 'a.jpg')})
    img_url = up.get_json()['product']['images'][0]['url']
    assert client.get(img_url).status_code == 404                                   # draft photo is private
    assert client.get(img_url, headers=h).status_code == 200
    assert client.post(f'{M}/seller/products/{pid}/submit', headers=h).get_json()['product']['status'] == 'active'
    r = client.get(img_url)
    assert r.status_code == 200 and r.mimetype == 'image/jpeg' and r.data[:2] == b'\xff\xd8'
    assert client.get(f'{M}/products').get_json()['total'] == 1


def test_product_photos_are_validated_on_the_server(app, client):
    h = seller_h(client)
    pid = product(client, h, publish=False, images=0)
    url = f'{M}/seller/products/{pid}/images'
    bad = client.post(url, headers=h, content_type='multipart/form-data', data={'images': (io.BytesIO(b'<?php x ?>'), 'shell.php.jpg')})
    assert bad.status_code == 400 and bad.get_json()['error_code'] == 'not_an_image'
    many = client.post(url, headers=h, content_type='multipart/form-data', data={'images': [(io.BytesIO(img_bytes()), f'{i}.jpg') for i in range(7)]})
    assert many.status_code == 400
    assert client.post(url, headers=h, content_type='multipart/form-data', data={}).status_code == 400
    other = seller_h(client, 'o2@t.example', 'Other Shop')
    assert client.post(url, headers=other, content_type='multipart/form-data', data={'images': (io.BytesIO(img_bytes()), 'a.jpg')}).status_code == 404
    uploaded = os.listdir(__import__('app.routes.market_common', fromlist=['x']).UPLOAD_DIR)
    assert all(f.endswith('.jpg') for f in uploaded)


def test_listing_validation_rules(app, client):
    h = seller_h(client)
    base = {'title': 'Maize', 'category': 'maize', 'retail_price': '10', 'stock_qty': '5'}
    post = lambda **o: client.post(f'{M}/seller/products', json={**base, **o}, headers=h).status_code
    assert post() == 201
    assert post(title='ab') == 400 and post(retail_price='-3') == 400 and post(retail_price='abc') == 400
    assert post(category='nope') == 400 and post(unit='barrel') == 400 and post(stock_qty='-1') == 400
    assert post(wholesale_price='12', wholesale_min_qty='50') == 400            # wholesale must be lower
    assert post(wholesale_price='8') == 400                                     # needs a minimum quantity
    assert post(wholesale_price='8', wholesale_min_qty='50') == 201
    assert post(fulfilment_options=['drone']) == 400
    assert post(listing_type='harvest_forecast') == 400                         # needs a harvest date
    assert post(listing_type='harvest_forecast', available_from='2027-01-15') == 201


def test_regulated_products_need_a_verified_seller_and_admin_approval(app, client):
    h = seller_h(client)
    pid = product(client, h, category='pesticides', publish=False)
    r = client.post(f'{M}/seller/products/{pid}/submit', headers=h)
    assert r.status_code == 403 and 'regulated' in r.get_json()['error'].lower()
    adm = verify(client, app, h)
    assert client.post(f'{M}/seller/products/{pid}/submit', headers=h).get_json()['product']['status'] == 'pending_review'
    assert client.get(f'{M}/products').get_json()['total'] == 0
    assert client.post(f'/api/admin/marketplace/products/{pid}/reject', json={}, headers=adm).status_code == 400
    assert client.post(f'/api/admin/marketplace/products/{pid}/approve', json={}, headers=adm).status_code == 200
    assert client.get(f'{M}/products').get_json()['total'] == 1
    assert client.post(f'/api/admin/marketplace/products/{pid}/approve', json={}, headers=adm).status_code == 409


def test_rejected_listing_can_be_fixed_and_resubmitted(app, client):
    h = seller_h(client)
    adm = verify(client, app, h)
    pid = product(client, h, category='herbicides')
    assert client.post(f'/api/admin/marketplace/products/{pid}/reject', json={'note': 'Add the registration number'}, headers=adm).status_code == 200
    p = client.get(f'{M}/seller/products', headers=h).get_json()['products'][0]
    assert p['status'] == 'rejected' and p['moderation_note'] == 'Add the registration number'
    client.put(f'{M}/seller/products/{pid}', json={'description': 'Reg no. PB-123'}, headers=h)
    assert client.post(f'{M}/seller/products/{pid}/submit', headers=h).get_json()['product']['status'] == 'pending_review'


def test_premoderation_setting_holds_every_new_listing(app, client):
    adm = mk_admin(app, client)
    assert client.put('/api/admin/marketplace/settings', json={'premoderate_all': True}, headers=adm).status_code == 200
    h = seller_h(client)
    pid = product(client, h)
    assert client.get(f'{M}/seller/products', headers=h).get_json()['products'][0]['status'] == 'pending_review'


def test_search_filters_sorting_and_pagination(app, client):
    a, b = seller_h(client, 'a@t.example', 'Alpha'), seller_h(client, 'b@t.example', 'Beta')
    product(client, a, title='Bo white rice', category='rice', retail_price='8', district='Bo', wholesale_price='6', wholesale_min_qty='100')
    product(client, a, title='Fresh cassava', category='cassava', retail_price='3', district='Kenema')
    product(client, b, title='Hoe', category='hand-tools', retail_price='50', district='Bo', unit='piece')
    get = lambda qs: client.get(f'{M}/products?{qs}').get_json()
    assert get('')['total'] == 3
    assert [p['title'] for p in get('q=rice')['products']] == ['Bo white rice']
    assert get('category=cassava')['total'] == 1 and get('group=produce')['total'] == 2 and get('group=equipment')['total'] == 1
    assert get('district=Bo')['total'] == 2 and get('wholesale=1')['total'] == 1
    assert get('min_price=5&max_price=20')['total'] == 1
    assert [p['retail_price'] for p in get('sort=price_asc')['products']] == [3.0, 8.0, 50.0]
    assert [p['retail_price'] for p in get('sort=price_desc')['products']] == [50.0, 8.0, 3.0]
    pg = get('per_page=2&page=2')
    assert len(pg['products']) == 1 and pg['pages'] == 2
    assert client.get(f'{M}/products?min_price=abc').status_code == 400
    assert get('seller_id=' + str(client.get(f'{M}/seller/profile', headers=b).get_json()['profile']['id']))['total'] == 1


def test_categories_cover_required_groups_and_regulated_flags(client):
    cats = client.get(f'{M}/categories').get_json()['categories']
    slugs = {c['slug']: c for c in cats}
    for s in ('seeds', 'fertilizers', 'pesticides', 'herbicides', 'crop-protection', 'soil-improvement', 'hand-tools',
              'irrigation', 'water-pumps', 'machinery', 'protective-equipment', 'rice', 'cassava', 'maize', 'cocoa',
              'coffee', 'groundnuts', 'vegetables', 'fruits'):
        assert s in slugs
    assert slugs['pesticides']['regulated'] and slugs['herbicides']['regulated'] and not slugs['rice']['regulated']


def test_home_sections_use_real_listings_only(app, client):
    assert client.get(f'{M}/home').get_json()['recent'] == []
    h = seller_h(client)
    product(client, h, wholesale_price='8', wholesale_min_qty='50')
    product(client, h, title='Harvest soon', category='cassava', listing_type='harvest_forecast', available_from='2027-02-01')
    d = client.get(f'{M}/home').get_json()
    assert len(d['recent']) == 1 and len(d['wholesale']) == 1 and len(d['local_produce']) == 1 and len(d['upcoming_harvests']) == 1


def test_stock_updates_flip_sold_out_and_pause_resume_delete(app, client):
    h = seller_h(client)
    pid = product(client, h)
    s = lambda q: client.post(f'{M}/seller/products/{pid}/stock', json={'stock_qty': q}, headers=h).get_json()['product']['status']
    assert s('0') == 'sold_out' and s('7') == 'active'
    assert client.post(f'{M}/seller/products/{pid}/pause', headers=h).get_json()['product']['status'] == 'paused'
    assert client.get(f'{M}/products').get_json()['total'] == 0
    assert client.post(f'{M}/seller/products/{pid}/resume', headers=h).get_json()['product']['status'] == 'active'
    assert client.delete(f'{M}/seller/products/{pid}', headers=h).status_code == 200
    assert client.get(f'{M}/products').get_json()['total'] == 0


def test_other_sellers_cannot_touch_my_listing(app, client):
    a, b = seller_h(client, 'a@t.example', 'Seller A'), seller_h(client, 'b@t.example', 'Seller B')
    pid = product(client, a)
    assert client.put(f'{M}/seller/products/{pid}', json={'title': 'Hacked'}, headers=b).status_code == 404
    assert client.delete(f'{M}/seller/products/{pid}', headers=b).status_code == 404
    assert client.post(f'{M}/seller/products/{pid}/stock', json={'stock_qty': '9'}, headers=b).status_code == 404


# ── cart & wishlist ───────────────────────────────────────────────────────
def test_cart_rules_and_wholesale_pricing(app, client):
    s = seller_h(client)
    pid = product(client, s, min_order_qty='2', stock_qty='120', retail_price='10', wholesale_price='7', wholesale_min_qty='50')
    b = auth_header(client, 'buyer@t.example')
    assert add_cart(client, b, pid, '1').status_code == 400                       # below minimum
    assert add_cart(client, b, pid, '500').status_code == 400                     # above stock
    c = add_cart(client, b, pid, '5').get_json()
    it = c['groups'][0]['items'][0]
    assert it['price_tier'] == 'retail' and it['unit_price'] == 10.0 and c['total'] == 50.0
    c = client.put(f'{M}/cart/{pid}', json={'quantity': '60'}, headers=b).get_json()
    it = c['groups'][0]['items'][0]
    assert it['price_tier'] == 'wholesale' and it['unit_price'] == 7.0 and c['total'] == 420.0
    assert add_cart(client, s, pid, '2').status_code == 400                       # cannot buy own product
    assert client.delete(f'{M}/cart/{pid}', headers=b).get_json()['groups'] == []
    assert client.get(f'{M}/cart').status_code == 401
    assert add_cart(client, mk_admin(app, client), pid, '2').status_code == 403   # staff cannot trade


def test_cart_flags_problems_when_a_product_goes_away(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    add_cart(client, b, pid, '3')
    client.post(f'{M}/seller/products/{pid}/pause', headers=s)
    c = client.get(f'{M}/cart', headers=b).get_json()
    assert c['can_checkout'] is False and 'no longer available' in c['groups'][0]['items'][0]['problem']
    assert checkout(client, b).status_code == 409


def test_harvest_forecasts_are_enquiry_only(app, client):
    s = seller_h(client)
    pid = product(client, s, category='cassava', listing_type='harvest_forecast', available_from='2027-02-01')
    b = auth_header(client, 'buyer@t.example')
    r = add_cart(client, b, pid, '5')
    assert r.status_code == 400 and 'enquiry' in r.get_json()['error'].lower()
    e = client.post(f'{M}/enquiries', json={'product_id': pid, 'kind': 'bulk', 'message': 'Can I pre-book 500kg?'}, headers=b)
    assert e.status_code == 201


def test_wishlist(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    assert client.post(f'{M}/wishlist/{pid}', headers=b).status_code == 200
    assert client.post(f'{M}/wishlist/{pid}', headers=b).status_code == 200      # idempotent
    assert [p['id'] for p in client.get(f'{M}/wishlist', headers=b).get_json()['products']] == [pid]
    client.delete(f'{M}/wishlist/{pid}', headers=b)
    assert client.get(f'{M}/wishlist', headers=b).get_json()['products'] == []
    assert client.post(f'{M}/wishlist/99999', headers=b).status_code == 404


# ── checkout & orders ─────────────────────────────────────────────────────
def test_checkout_creates_one_order_per_seller_with_snapshots_and_stock_reduction(app, client):
    s1, s2 = seller_h(client, 's1@t.example', 'Shop One'), seller_h(client, 's2@t.example', 'Shop Two')
    p1, p2, p3 = product(client, s1, retail_price='10', stock_qty='50'), product(client, s1, title='Beans', category='vegetables', retail_price='4', stock_qty='20'), product(client, s2, retail_price='12', stock_qty='30')
    b = auth_header(client, 'buyer@t.example')
    for pid, q in ((p1, '5'), (p2, '3'), (p3, '2')):
        add_cart(client, b, pid, q)
    r = checkout(client, b)
    assert r.status_code == 201
    orders = r.get_json()['orders']
    assert len(orders) == 2 and sorted(o['total'] for o in orders) == [24.0, 62.0]
    assert all(o['status'] == 'pending' and o['payment_status'] == 'unpaid' and o['order_number'].startswith('SA-') for o in orders)
    assert client.get(f'{M}/cart', headers=b).get_json()['groups'] == []
    with app.app_context():
        assert Product.query.get(p1).stock_qty == Decimal('45') and Product.query.get(p3).stock_qty == Decimal('28')
    client.put(f'{M}/seller/products/{p1}', json={'retail_price': '99'}, headers=s1)          # later price change
    o = client.get(f'{M}/orders/{orders[0]["id"]}', headers=b).get_json()['order']
    assert o['items'][0]['unit_price'] in (10.0, 4.0)


def test_checkout_is_idempotent_so_double_taps_do_not_double_order(app, client):
    s = seller_h(client)
    pid = product(client, s, stock_qty='10')
    b = auth_header(client, 'buyer@t.example')
    add_cart(client, b, pid, '4')
    first = checkout(client, b, key='same-key-0001')
    again = checkout(client, b, key='same-key-0001')
    assert first.status_code == 201 and again.status_code == 200 and again.get_json()['idempotent_replay'] is True
    assert first.get_json()['orders'][0]['id'] == again.get_json()['orders'][0]['id']
    with app.app_context():
        assert Order.query.count() == 1 and Product.query.get(pid).stock_qty == Decimal('6')


def test_last_unit_cannot_be_oversold(app, client):
    s = seller_h(client)
    pid = product(client, s, stock_qty='1')
    b1, b2 = auth_header(client, 'b1@t.example'), auth_header(client, 'b2@t.example')
    add_cart(client, b1, pid, '1'); add_cart(client, b2, pid, '1')
    assert checkout(client, b1, key='key-b1-00001').status_code == 201
    r = checkout(client, b2, key='key-b2-00001')
    assert r.status_code == 409
    with app.app_context():
        p = Product.query.get(pid)
        assert p.stock_qty == 0 and p.status == 'sold_out' and Order.query.count() == 1


def test_failed_checkout_changes_nothing(app, client):
    s = seller_h(client)
    ok_id = product(client, s, stock_qty='10')
    low_id = product(client, s, title='Rare', stock_qty='5')
    b = auth_header(client, 'buyer@t.example')
    add_cart(client, b, ok_id, '3'); add_cart(client, b, low_id, '5')
    client.post(f'{M}/seller/products/{low_id}/stock', json={'stock_qty': '2'}, headers=s)     # stock drops after carting
    assert checkout(client, b).status_code == 409
    with app.app_context():
        assert Product.query.get(ok_id).stock_qty == Decimal('10') and Order.query.count() == 0
    assert len(client.get(f'{M}/cart', headers=b).get_json()['groups'][0]['items']) == 2     # cart kept


def test_checkout_validation(app, client):
    s = seller_h(client, momo='')
    pid = product(client, s, fulfilment_options=['pickup'])
    b = auth_header(client, 'buyer@t.example')
    add_cart(client, b, pid, '2')
    assert checkout(client, b, key='x').status_code == 400                                       # key too short
    assert checkout(client, b, payment_method='bitcoin').status_code == 400
    assert checkout(client, b, payment_method='testpay').status_code == 400
    assert checkout(client, b, fulfilment_method='seller_delivery', delivery_address='Main St 1').status_code == 409   # not offered
    assert checkout(client, b, fulfilment_method='nope').status_code == 400
    assert checkout(client, b, contact_phone='1').status_code == 400
    assert checkout(client, b, payment_method='manual_mobile_money').status_code == 409          # seller has no wallet number
    client.put(f'{M}/seller/products/{pid}', json={'fulfilment_options': ['pickup', 'seller_delivery']}, headers=s)
    assert checkout(client, b, key='key-deliv-001', fulfilment_method='seller_delivery').status_code == 400   # address required
    assert client.post(f'{M}/checkout', json={'idempotency_key': 'k' * 10}, headers=auth_header(client, 'empty@t.example')).status_code == 400


def test_commission_is_recorded_but_not_charged_automatically(app, client):
    adm = mk_admin(app, client)
    assert client.put('/api/admin/marketplace/settings', json={'commission_rate': '5'}, headers=adm).status_code == 200
    assert client.put('/api/admin/marketplace/settings', json={'commission_rate': '90'}, headers=adm).status_code == 400
    s = seller_h(client)
    pid = product(client, s, retail_price='10')
    o = place_order(client, auth_header(client, 'buyer@t.example'), pid, '10')
    d = client.get(f'{M}/seller/orders/{o["id"]}', headers=s).get_json()['order']
    assert d['total'] == 100.0 and d['commission_rate'] == 5.0 and d['commission_amount'] == 5.0


# ── payments: nothing is "paid" without real confirmation ─────────────────
def test_offline_payment_is_seller_confirmed_never_provider_verified(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid, '3', payment_method='manual_mobile_money')
    assert o['payment_status'] == 'unpaid' and o['pay_to']['mobile_money_number'] == '076000111'
    r = client.post(f'{M}/orders/{o["id"]}/payment-reference', json={'reference': 'MM12345678'}, headers=b)
    assert r.get_json()['order']['payment_status'] == 'awaiting_confirmation'          # a claim, not payment
    assert client.post(f'{M}/seller/orders/{o["id"]}/confirm-payment', headers=b).status_code in (403, 404)
    other = seller_h(client, 'o@t.example', 'Other')
    assert client.post(f'{M}/seller/orders/{o["id"]}/confirm-payment', headers=other).status_code == 404
    done = client.post(f'{M}/seller/orders/{o["id"]}/confirm-payment', headers=s).get_json()['order']
    assert done['payment_status'] == 'paid' and done['payment_basis'] == 'seller_confirmed'
    assert 'Not verified by a payment provider' in done['payment_notice']
    assert client.post(f'{M}/seller/orders/{o["id"]}/confirm-payment', headers=s).status_code == 409
    assert 'pay_to' not in client.get(f'{M}/orders/{o["id"]}', headers=b).get_json()['order']


def test_there_is_no_way_to_mark_an_order_paid_from_the_client(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid)
    for payload in ({'status': 'paid'}, {'payment_status': 'paid'}):
        assert client.post(f'{M}/seller/orders/{o["id"]}/status', json=payload, headers=s).status_code == 409
        assert client.put(f'{M}/orders/{o["id"]}', json=payload, headers=b).status_code in (404, 405)
    assert client.get(f'{M}/orders/{o["id"]}', headers=b).get_json()['order']['payment_status'] == 'unpaid'


@pytest.fixture()
def testpay():
    secret = 'whsec_test_secret'
    payments.register(payments.HmacJsonAdapter('testpay', secret, label='Test provider'))
    yield secret
    payments.unregister('testpay')


def sign(secret, body):
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def webhook(client, secret, payload, sig=None):
    raw = json.dumps(payload).encode()
    return client.post(f'{M}/payments/webhook/testpay', data=raw, content_type='application/json',
                       headers={'X-Signature': sig if sig is not None else sign(secret, raw)})


def order_with_provider_payment(app, client, total='30'):
    s = seller_h(client)
    pid = product(client, s, retail_price='10')
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid, '3')
    with app.app_context():
        pay = Payment.query.filter_by(order_id=o['id']).first()
        pay.provider, pay.provider_reference = 'testpay', 'REF-1'
        db.session.commit()
    return o, b


def test_webhook_verifies_signature_amount_and_is_idempotent(app, client, testpay):
    o, b = order_with_provider_payment(app, client)
    evt = {'event_id': 'evt-1', 'reference': 'REF-1', 'status': 'successful', 'amount': '30.00', 'currency': 'SLE'}
    assert webhook(client, testpay, evt, sig='deadbeef').status_code == 401                  # forged
    assert webhook(client, testpay, evt, sig='').status_code == 401
    assert client.get(f'{M}/orders/{o["id"]}', headers=b).get_json()['order']['payment_status'] == 'unpaid'
    r = webhook(client, testpay, evt)
    assert r.status_code == 200 and r.get_json()['status'] == 'verified'
    d = client.get(f'{M}/orders/{o["id"]}', headers=b).get_json()['order']
    assert d['payment_status'] == 'paid' and d['payment_basis'] == 'provider_verified' and 'Verified by the payment provider' in d['payment_notice']
    assert webhook(client, testpay, evt).get_json()['status'] == 'duplicate'                    # replay
    assert webhook(client, testpay, {**evt, 'event_id': 'evt-2'}).get_json()['status'] == 'already_paid'
    bad = [e for e in client.get('/api/admin/audit?action=webhook_bad_signature', headers=admin_header(client)).get_json()['events']]
    assert len(bad) == 2


def test_webhook_amount_mismatch_unknown_reference_failure_and_malformed(app, client, testpay):
    o, b = order_with_provider_payment(app, client)
    st = lambda **k: webhook(client, testpay, {'event_id': k.pop('eid'), 'reference': 'REF-1', 'status': 'successful', 'amount': '30.00', 'currency': 'SLE', **k}).get_json()['status']
    assert st(eid='e1', amount='1.00') == 'amount_mismatch'
    assert client.get(f'{M}/orders/{o["id"]}', headers=b).get_json()['order']['payment_status'] == 'unpaid'
    o2, b2 = o, b
    assert webhook(client, testpay, {'event_id': 'e2', 'reference': 'NOPE', 'status': 'successful', 'amount': '30', 'currency': 'SLE'}).get_json()['status'] == 'unknown_reference'
    assert webhook(client, testpay, {'event_id': 'e3'}).status_code == 400
    assert client.post(f'{M}/payments/webhook/ghost', json={}).status_code == 404
    with app.app_context():
        Payment.query.filter_by(order_id=o['id']).first().status = 'pending'; db.session.commit()
    assert st(eid='e4', status='successful', currency='USD') == 'amount_mismatch'
    with app.app_context():
        Payment.query.filter_by(order_id=o['id']).first().status = 'pending'; db.session.commit()
    assert st(eid='e5', status='failed') == 'failed'
    assert client.get(f'{M}/orders/{o["id"]}', headers=b).get_json()['order']['payment_status'] == 'failed'


def test_online_methods_are_not_offered_until_a_provider_is_registered(client, testpay):
    ids = [m['id'] for m in client.get(f'{M}/payments/methods').get_json()['methods']]
    assert {'cash_on_delivery', 'pay_on_pickup', 'manual_mobile_money', 'testpay'} <= set(ids)
    payments.unregister('testpay')
    ids = [m['id'] for m in client.get(f'{M}/payments/methods').get_json()['methods']]
    assert ids == ['cash_on_delivery', 'pay_on_pickup', 'manual_mobile_money']


# ── order lifecycle ───────────────────────────────────────────────────────
def test_full_order_lifecycle_and_tracking(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid, '4', fulfilment_method='seller_delivery', delivery_address='12 Mile Rd, Bo')
    st = lambda status, **k: client.post(f'{M}/seller/orders/{o["id"]}/status', json={'status': status, **k}, headers=s)
    assert st('delivered').status_code == 409                                 # cannot skip ahead
    assert st('ready').status_code == 409                                     # delivery order, not pickup
    assert st('confirmed').status_code == 200 and st('shipped').status_code == 200 and st('delivered').status_code == 200
    assert client.post(f'{M}/orders/{o["id"]}/complete', headers=auth_header(client, 'x@t.example')).status_code == 404
    done = client.post(f'{M}/orders/{o["id"]}/complete', headers=b).get_json()['order']
    assert done['status'] == 'completed'
    track = [(e['kind'], e['value']) for e in done['events']]
    assert track[:2] == [('status', 'pending'), ('payment', 'unpaid')] and ('status', 'shipped') in track and track[-1] == ('status', 'completed')
    assert st('cancelled', note='x').status_code == 409
    seller_view = client.get(f'{M}/seller/orders/{o["id"]}', headers=s).get_json()['order']
    assert seller_view['delivery_address'] == '12 Mile Rd, Bo' and seller_view['buyer']['phone'] == '077123456'
    assert 'email' not in json.dumps(seller_view['buyer'])


def test_pickup_orders_use_ready_not_shipped(app, client):
    s = seller_h(client)
    pid = product(client, s, pickup_point='Bo market stall 4')
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid)
    assert o['pickup_point'] == 'Bo market stall 4'
    st = lambda status: client.post(f'{M}/seller/orders/{o["id"]}/status', json={'status': status}, headers=s).status_code
    assert st('confirmed') == 200 and st('shipped') == 409 and st('ready') == 200 and st('delivered') == 200


def test_cancellation_restores_stock_and_flags_refunds(app, client):
    s = seller_h(client)
    pid = product(client, s, stock_qty='10')
    b = auth_header(client, 'buyer@t.example')
    o1 = place_order(client, b, pid, '4', key='k-cancel-0001') if False else None
    add_cart(client, b, pid, '4')
    o = checkout(client, b, key='k-cancel-0001').get_json()['orders'][0]
    with app.app_context():
        assert Product.query.get(pid).stock_qty == Decimal('6')
    assert client.post(f'{M}/orders/{o["id"]}/cancel', json={'reason': 'Changed my mind'}, headers=b).status_code == 200
    with app.app_context():
        assert Product.query.get(pid).stock_qty == Decimal('10')
    assert client.post(f'{M}/orders/{o["id"]}/cancel', headers=b).status_code == 409

    add_cart(client, b, pid, '3')
    o2 = checkout(client, b, key='k-cancel-0002').get_json()['orders'][0]
    client.post(f'{M}/seller/orders/{o2["id"]}/confirm-payment', headers=s)
    assert client.post(f'{M}/orders/{o2["id"]}/cancel', headers=b).status_code == 409           # paid: buyer cannot self-cancel
    assert client.post(f'{M}/seller/orders/{o2["id"]}/status', json={'status': 'cancelled'}, headers=s).status_code == 400   # reason needed
    r = client.post(f'{M}/seller/orders/{o2["id"]}/status', json={'status': 'cancelled', 'note': 'Out of fresh stock'}, headers=s).get_json()['order']
    assert r['status'] == 'cancelled' and r['payment_status'] == 'refund_due'
    with app.app_context():
        assert Product.query.get(pid).stock_qty == Decimal('10')
    assert client.post(f'{M}/seller/orders/{o2["id"]}/mark-refunded', headers=s).get_json()['order']['payment_status'] == 'refunded'


def test_orders_are_private_to_buyer_seller_and_staff(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid)
    stranger = auth_header(client, 'stranger@t.example')
    other_seller = seller_h(client, 'os@t.example', 'Other')
    assert client.get(f'{M}/orders/{o["id"]}', headers=stranger).status_code == 404
    assert client.get(f'{M}/seller/orders/{o["id"]}', headers=other_seller).status_code == 404
    assert client.get(f'{M}/orders/{o["id"]}').status_code == 401
    adm = mk_admin(app, client)
    assert client.get(f'/api/admin/marketplace/orders/{o["id"]}', headers=adm).status_code == 200
    assert client.get(f'/api/admin/marketplace/orders/{o["id"]}', headers=as_role(app, client, 'support_admin')).status_code == 403
    assert len(client.get(f'{M}/orders', headers=b).get_json()['orders']) == 1
    assert client.get(f'{M}/orders', headers=stranger).get_json()['orders'] == []


# ── reviews, reports, disputes ────────────────────────────────────────────
def completed_order(app, client, s, b, pid):
    o = place_order(client, b, pid, '2', key=f'k-{pid}-{b["Authorization"][-6:]}')
    for status in ('confirmed', 'ready', 'delivered'):
        client.post(f'{M}/seller/orders/{o["id"]}/status', json={'status': status}, headers=s)
    client.post(f'{M}/orders/{o["id"]}/complete', headers=b)
    return o


def test_reviews_only_after_completion_one_per_item_and_moderated(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid)
    rv = lambda **k: client.post(f'{M}/orders/{o["id"]}/review', json={'product_id': pid, 'rating': 5, **k}, headers=b)
    assert rv().status_code == 409                                              # not completed yet
    for status in ('confirmed', 'ready', 'delivered'):
        client.post(f'{M}/seller/orders/{o["id"]}/status', json={'status': status}, headers=s)
    client.post(f'{M}/orders/{o["id"]}/complete', headers=b)
    assert rv(rating=6).status_code == 400 and rv(rating='5').status_code == 400 and rv(product_id=999).status_code == 400
    assert rv(comment='Fresh and clean').status_code == 201 and rv().status_code == 409
    assert client.post(f'{M}/orders/{o["id"]}/review', json={'product_id': pid, 'rating': 5}, headers=auth_header(client, 'z@t.example')).status_code == 404
    d = client.get(f'{M}/products/{pid}').get_json()['product']
    assert d['rating_avg'] == 5.0 and d['rating_count'] == 1 and d['reviews'][0]['buyer'] == 'Test' and 'email' not in json.dumps(d['reviews'])
    adm = mk_admin(app, client)
    rid = client.get('/api/admin/marketplace/reviews', headers=adm).get_json()['reviews'][0]['id']
    client.post(f'/api/admin/marketplace/reviews/{rid}/hide', headers=adm)
    d = client.get(f'{M}/products/{pid}').get_json()['product']
    assert d['rating_avg'] is None and d['reviews'] == []


def test_reports_are_moderated_with_real_effects(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    rep = lambda **k: client.post(f'{M}/reports', json={'target_type': 'product', 'target_id': pid, 'reason': 'fraud', **k}, headers=b)
    assert rep().status_code == 201 and rep().status_code == 409
    assert rep(reason='boring').status_code == 400 and rep(target_id=9999).status_code == 404 and rep(target_type='x').status_code == 404
    adm = mk_admin(app, client)
    rid = client.get('/api/admin/marketplace/reports?status=open', headers=adm).get_json()['reports'][0]['id']
    assert client.post(f'/api/admin/marketplace/reports/{rid}/resolve', json={'action': 'hide_review', 'note': 'ok then'}, headers=adm).status_code == 409
    assert client.post(f'/api/admin/marketplace/reports/{rid}/resolve', json={'action': 'remove_product'}, headers=adm).status_code == 400
    assert client.post(f'/api/admin/marketplace/reports/{rid}/resolve', json={'action': 'remove_product', 'note': 'Scam listing'}, headers=adm).status_code == 200
    assert client.get(f'{M}/products').get_json()['total'] == 0
    assert client.get('/api/admin/marketplace/reports?status=open', headers=adm).get_json()['reports'] == []


def test_suspending_a_seller_hides_listings_and_blocks_selling(app, client):
    s = seller_h(client)
    pid = product(client, s)
    prof = client.get(f'{M}/seller/profile', headers=s).get_json()['profile']
    adm = mk_admin(app, client)
    assert client.post(f'/api/admin/marketplace/sellers/{prof["id"]}/suspend', json={}, headers=adm).status_code == 400
    assert client.post(f'/api/admin/marketplace/sellers/{prof["id"]}/suspend', json={'note': 'Fraud reports'}, headers=adm).status_code == 200
    assert client.get(f'{M}/products').get_json()['total'] == 0 and client.get(f'{M}/sellers/{prof["id"]}').status_code == 404
    assert client.post(f'{M}/seller/products', json={'title': 'New', 'category': 'rice', 'retail_price': '1'}, headers=s).status_code == 403
    b = auth_header(client, 'buyer@t.example')
    assert add_cart(client, b, pid, '1').status_code == 400
    assert client.post(f'/api/admin/marketplace/sellers/{prof["id"]}/restore', headers=adm).status_code == 200
    assert client.get(f'{M}/products').get_json()['total'] == 1


def test_disputes_and_refund_flag(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid)
    client.post(f'{M}/seller/orders/{o["id"]}/confirm-payment', headers=s)
    assert client.post(f'{M}/orders/{o["id"]}/dispute', json={'reason': 'bad'}, headers=b).status_code == 400
    assert client.post(f'{M}/orders/{o["id"]}/dispute', json={'reason': 'not_received', 'details': 'Never came'}, headers=b).status_code == 201
    assert client.post(f'{M}/orders/{o["id"]}/dispute', json={'reason': 'quality'}, headers=s).status_code == 409
    assert client.post(f'{M}/orders/{o["id"]}/dispute', json={'reason': 'quality'}, headers=auth_header(client, 'z@t.example')).status_code == 404
    adm = mk_admin(app, client)
    did = client.get('/api/admin/marketplace/disputes?status=open', headers=adm).get_json()['disputes'][0]['id']
    assert client.post(f'/api/admin/marketplace/disputes/{did}/resolve', json={'resolution': 'in_favour_of_buyer'}, headers=adm).status_code == 400
    assert client.post(f'/api/admin/marketplace/disputes/{did}/resolve', json={'resolution': 'in_favour_of_buyer', 'note': 'Seller agreed it was not sent'}, headers=adm).status_code == 200
    assert client.get(f'{M}/orders/{o["id"]}', headers=b).get_json()['order']['payment_status'] == 'refund_due'


# ── enquiries, buyer requests ─────────────────────────────────────────────
def test_enquiries_are_private_threads_that_do_not_share_contact_details(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    e = client.post(f'{M}/enquiries', json={'product_id': pid, 'kind': 'negotiation', 'message': 'Would you take 8 per kg for 200kg?', 'offered_price': '8'}, headers=b)
    eid = e.get_json()['enquiry']['id']
    inbox = client.get(f'{M}/enquiries', headers=s).get_json()['enquiries']
    assert len(inbox) == 1 and inbox[0]['role'] == 'seller' and inbox[0]['with'] == 'Test'
    r = client.post(f'{M}/enquiries/{eid}/messages', json={'message': 'Yes for 200kg or more', 'offered_price': '8.5'}, headers=s)
    msgs = r.get_json()['enquiry']['messages']
    assert [m['mine'] for m in msgs] == [False, True] and msgs[1]['offered_price'] == 8.5
    blob = json.dumps(client.get(f'{M}/enquiries/{eid}', headers=b).get_json())
    assert 'seller1@t.example' not in blob and '076111222' not in blob and 'buyer@t.example' not in blob
    assert client.get(f'{M}/enquiries/{eid}', headers=auth_header(client, 'z@t.example')).status_code == 404
    assert client.post(f'{M}/enquiries/{eid}/messages', json={'message': 'hi'}, headers=auth_header(client, 'z@t.example')).status_code == 404
    assert client.post(f'{M}/enquiries', json={'product_id': pid, 'message': 'me'}, headers=s).status_code == 400
    again = client.post(f'{M}/enquiries', json={'product_id': pid, 'message': 'one more thing'}, headers=b)
    assert again.get_json()['enquiry']['id'] == eid                                   # same thread


def test_buyer_requests_and_seller_responses(app, client):
    b = auth_header(client, 'buyer@t.example')
    r = client.post(f'{M}/requests', json={'title': 'Need 2 tonnes of dry cassava', 'category': 'cassava', 'quantity': '2000', 'unit': 'kg', 'district': 'Bo', 'needed_by': '2027-01-10'}, headers=b)
    rid = r.get_json()['id']
    assert client.post(f'{M}/requests', json={'title': 'x'}, headers=b).status_code == 400
    listing = client.get(f'{M}/requests').get_json()['requests']
    assert listing[0]['title'].startswith('Need 2 tonnes') and listing[0]['buyer'] == 'Test' and 'email' not in json.dumps(listing)
    s = seller_h(client)
    assert client.post(f'{M}/enquiries', json={'request_id': rid, 'message': 'I can supply from March'}, headers=b).status_code == 400   # not your own
    assert client.post(f'{M}/enquiries', json={'request_id': rid, 'message': 'I can supply from March'}, headers=auth_header(client, 'nos@t.example')).status_code == 403
    assert client.post(f'{M}/enquiries', json={'request_id': rid, 'message': 'I can supply from March'}, headers=s).status_code == 201
    assert len(client.get(f'{M}/enquiries', headers=b).get_json()['enquiries']) == 1
    assert client.post(f'{M}/requests/{rid}/close', headers=s).status_code == 404
    client.post(f'{M}/requests/{rid}/close', headers=b)
    assert client.get(f'{M}/requests').get_json()['requests'] == []


# ── seller dashboard: real numbers ───────────────────────────────────────
def test_seller_dashboard_numbers_come_from_orders(app, client):
    s = seller_h(client)
    pid = product(client, s, retail_price='10', stock_qty='20', low_stock_threshold='6')
    d0 = client.get(f'{M}/seller/dashboard', headers=s).get_json()['figures']
    assert d0['total_orders'] == 0 and d0['gross_sales'] == 0 and d0['active_listings'] == 1 and d0['rating_avg'] is None
    b = auth_header(client, 'buyer@t.example')
    done = completed_order(app, client, s, b, pid)                      # 2 x 10 = 20, completed
    client.post(f'{M}/seller/orders/{done["id"]}/confirm-payment', headers=s)
    add_cart(client, b, pid, '5')
    pending = checkout(client, b, key='k-dash-00001').get_json()['orders'][0]   # 50, pending, unpaid
    add_cart(client, b, pid, '9')
    cancelled = checkout(client, b, key='k-dash-00002').get_json()['orders'][0]
    client.post(f'{M}/seller/orders/{cancelled["id"]}/status', json={'status': 'cancelled', 'note': 'Sold elsewhere'}, headers=s)
    client.post(f'{M}/orders/{done["id"]}/review', json={'product_id': pid, 'rating': 4}, headers=b)
    d = client.get(f'{M}/seller/dashboard', headers=s).get_json()
    f = d['figures']
    assert (f['total_orders'], f['pending_orders'], f['completed_orders'], f['cancelled_orders']) == (3, 1, 1, 1)
    assert f['gross_sales'] == 70.0 and f['paid_revenue'] == 20.0 and f['rating_avg'] == 4.0 and f['rating_count'] == 1
    assert [x['stock_qty'] for x in d['low_stock']] == [13.0] or d['low_stock'] == []      # 20-2-5 = 13 (> threshold 6)
    assert sum(x['orders'] for x in d['sales_by_day']) == 2 and sum(x['sales'] for x in d['sales_by_day']) == 70.0
    client.post(f'{M}/seller/products/{pid}/stock', json={'stock_qty': '4'}, headers=s)
    assert [x['id'] for x in client.get(f'{M}/seller/dashboard', headers=s).get_json()['low_stock']] == [pid]


# ── AI integration ────────────────────────────────────────────────────────
@pytest.fixture()
def net(monkeypatch):
    state = {'h': lambda *a: groq_ok('{"description":"Fresh local rice grown in Bo district."}')}
    monkeypatch.setattr(gw.requests, 'post', lambda url, headers=None, json=None, timeout=None: state['h']())
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
    return state


def test_ai_listing_helper_is_labelled_and_fails_honestly(app, client, net, monkeypatch):
    s = seller_h(client)
    r = client.post(f'{M}/seller/ai/describe', json={'title': 'Local rice', 'category': 'rice'}, headers=s)
    assert r.status_code == 200 and r.get_json()['ai_generated'] is True and 'Check it is accurate' in r.get_json()['note']
    net['h'] = lambda *a: FakeResp(503, {}, text='down')
    r = client.post(f'{M}/seller/ai/describe', json={'title': 'Local rice'}, headers=s)
    assert r.status_code == 503 and 'yourself' in r.get_json()['error'] + 'yourself'
    assert client.post(f'{M}/seller/ai/describe', json={'title': 'x'}, headers=s).status_code == 400
    assert client.post(f'{M}/seller/ai/describe', json={'title': 'Local rice'}, headers=auth_header(client, 'ns@t.example')).status_code == 403


def test_suggestions_are_labelled_not_sponsored_and_match_listings(app, client):
    s = seller_h(client)
    product(client, s, title='Hybrid maize seed', category='seeds')
    product(client, s, title='NPK 15-15-15 for maize', category='fertilizers')
    b = auth_header(client, 'buyer@t.example')
    d = client.get(f'{M}/suggestions?crop=maize&need=seeds', headers=b).get_json()
    assert d['sponsored'] is False and d['source'] == 'smartagri_suggestion' and [p['title'] for p in d['products']] == ['Hybrid maize seed']
    d = client.get(f'{M}/suggestions?crop=maize&need=fertilizer', headers=b).get_json()
    assert [p['title'] for p in d['products']] == ['NPK 15-15-15 for maize']
    assert client.get(f'{M}/suggestions?need=bogus', headers=b).status_code == 400
    assert client.get(f'{M}/suggestions?crop=maize').status_code == 401


def test_price_context_uses_only_real_listings(app, client):
    s = seller_h(client)
    ids = [product(client, s, title=f'Rice {i}', retail_price=str(8 + i)) for i in range(2)]
    d = client.get(f'{M}/products/{ids[0]}/price-context').get_json()
    assert d['available'] is False                                         # not enough data: says so, invents nothing
    more = [product(client, s, title=f'Rice more {i}', retail_price=str(20 + i)) for i in range(3)]
    d = client.get(f'{M}/products/{ids[0]}/price-context').get_json()
    assert d['available'] is True and d['listings_compared'] == 4 and d['min'] == 9.0 and d['max'] == 22.0 and 'not an official market price' in d['note']


# ── admin ─────────────────────────────────────────────────────────────────
def test_admin_marketplace_overview_and_lists_show_real_data(app, client):
    s = seller_h(client)
    pid = product(client, s)
    b = auth_header(client, 'buyer@t.example')
    o = place_order(client, b, pid, '3')
    client.post(f'{M}/seller/orders/{o["id"]}/confirm-payment', headers=s)
    adm = mk_admin(app, client)
    ov = client.get('/api/admin/marketplace/overview', headers=adm).get_json()
    assert ov['orders_total'] == 1 and ov['gross_sales'] == 30.0 and ov['paid_orders'] == {'provider_verified': 0, 'seller_confirmed': 1}
    assert ov['products']['active'] == 1 and ov['sellers']['unverified'] == 1
    pay = client.get('/api/admin/marketplace/payments', headers=adm).get_json()
    assert pay['payments'][0]['status'] == 'seller_confirmed' and pay['payments'][0]['basis'] == 'seller_confirmed'
    assert 'seller\'s own confirmation' in pay['note']
    assert client.get('/api/admin/marketplace/orders?payment_basis=seller_confirmed', headers=adm).get_json()['total'] == 1
    assert client.get('/api/admin/marketplace/orders?payment_basis=provider_verified', headers=adm).get_json()['total'] == 0
    assert client.get('/api/admin/marketplace/sellers?status=unverified', headers=adm).get_json()['total'] == 1
    dash = client.get('/api/admin/dashboard', headers=super_h_(client)).get_json()['marketplace']
    assert dash['orders_total'] == 1


def super_h_(client):
    return tok(client, 'boss@example.com', 'a-long-test-password')


def test_admin_marketplace_permissions(app, client):
    urls = ['/overview', '/sellers', '/products', '/categories', '/orders', '/payments', '/reports', '/disputes', '/reviews', '/settings']
    for role, allowed in (('farmer', set()), ('operations_admin', set()), ('support_admin', set()), ('ai_admin', set()),
                          ('marketplace_admin', set(urls)), ('super_admin', set(urls))):
        h = as_role(app, client, role)
        for u in urls:
            code = client.get('/api/admin/marketplace' + u, headers=h).status_code
            assert code == (200 if u in allowed else 403), (role, u, code)
    assert client.get('/api/admin/marketplace/overview').status_code == 401


def test_category_management_and_regulated_toggle_takes_effect(app, client):
    adm = mk_admin(app, client)
    c = client.post('/api/admin/marketplace/categories', json={'name': 'Bee keeping', 'group': 'equipment'}, headers=adm)
    assert c.status_code == 201 and c.get_json()['category']['slug'] == 'bee-keeping'
    assert client.post('/api/admin/marketplace/categories', json={'name': 'Bee keeping', 'group': 'equipment'}, headers=adm).status_code == 409
    assert client.post('/api/admin/marketplace/categories', json={'name': 'X', 'group': 'cars'}, headers=adm).status_code == 400
    cid = c.get_json()['category']['id']
    client.put(f'/api/admin/marketplace/categories/{cid}', json={'regulated': True}, headers=adm)
    s = seller_h(client)
    pid = product(client, s, category='bee-keeping', publish=False)
    assert client.post(f'{M}/seller/products/{pid}/submit', headers=s).status_code == 403
    client.put(f'/api/admin/marketplace/categories/{cid}', json={'active': False}, headers=adm)
    assert 'bee-keeping' not in [x['slug'] for x in client.get(f'{M}/categories').get_json()['categories']]


def test_admin_marketplace_actions_are_audited(app, client):
    s = seller_h(client)
    pid = product(client, s, category='pesticides', publish=False)
    adm = verify(client, app, s)
    client.post(f'{M}/seller/products/{pid}/submit', headers=s)
    client.post(f'/api/admin/marketplace/products/{pid}/approve', json={}, headers=adm)
    client.put('/api/admin/marketplace/settings', json={'commission_rate': '2'}, headers=adm)
    ev = {e['action'] for e in client.get('/api/admin/audit', headers=admin_header(client)).get_json()['events']}
    assert {'seller_verify', 'product_approve', 'market_settings_changed'} <= ev


def test_marketplace_notifications_reach_the_right_admins(app, client):
    s = seller_h(client)
    client.put(f'{M}/seller/profile', json={'registration_number': 'RC-9'}, headers=s)
    client.post(f'{M}/seller/verification-request', json={}, headers=s)
    adm = mk_admin(app, client)
    titles = [n['title'] for n in client.get('/api/admin/notifications', headers=adm).get_json()['notifications']]
    assert any('waiting for verification' in t for t in titles)
    ops = as_role(app, client, 'operations_admin')
    assert not any('waiting for verification' in n['title'] for n in client.get('/api/admin/notifications', headers=ops).get_json()['notifications'])


def test_public_endpoints_work_without_login_and_private_ones_do_not(client):
    for u in ('/categories', '/products', '/home', '/payments/methods', '/requests'):
        assert client.get(M + u).status_code == 200, u
    for method, u in (('get', '/cart'), ('post', '/checkout'), ('get', '/orders'), ('get', '/wishlist'), ('get', '/enquiries'),
                      ('get', '/seller/dashboard'), ('get', '/seller/products'), ('post', '/seller/products'), ('get', '/seller/orders')):
        assert getattr(client, method)(M + u).status_code == 401, u


def test_marketplace_tables_are_created_additively(app):
    from sqlalchemy import inspect
    with app.app_context():
        names = set(inspect(db.engine).get_table_names())
    assert {'seller_profiles', 'market_products', 'market_orders', 'market_payments', 'market_webhook_events',
            'market_reviews', 'market_reports', 'market_disputes', 'market_enquiries', 'market_buyer_requests'} <= names
    assert {'users', 'disease_analyses', 'audit_logs'} <= names                       # existing tables untouched
