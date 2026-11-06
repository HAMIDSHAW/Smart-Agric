"""
Payment provider framework.

IMPORTANT: no live online payment provider is enabled in this codebase. Providers that cover
Sierra Leone (for example Monime, pawaPay's Orange Money corridor, or Orange Money Web Payment)
need merchant onboarding, credentials and the provider's current API/webhook specification, none
of which can be verified from this repository. Until a real adapter is registered, the only
payment methods are OFFLINE: cash on delivery, pay on pickup, and manual mobile money (buyer
pays the seller's own wallet, the SELLER confirms receipt).

An order becomes "paid" only when
  (a) a registered provider adapter's webhook passes signature verification, matches the payment
      reference AND the exact amount/currency  ->  payment_basis = provider_verified, or
  (b) the seller confirms receipt of an offline payment  ->  payment_basis = seller_confirmed
      (shown to everyone as "confirmed by seller", never as "verified by payment provider").
A browser/frontend response can never mark an order paid.

To add a provider: subclass ProviderAdapter (implement verify_signature, parse), call register().
"""
import hashlib
import hmac
import os
from dataclasses import dataclass
from decimal import Decimal

OFFLINE_METHODS = {
    'cash_on_delivery': 'Pay cash when the goods are delivered',
    'pay_on_pickup': 'Pay when you collect the goods',
    'manual_mobile_money': "Send mobile money to the seller's number, then the seller confirms receipt",
}

REGISTRY = {}


@dataclass
class NormalizedEvent:
    event_id: str
    reference: str
    status: str            # 'successful' | 'failed'
    amount: Decimal
    currency: str


class ProviderAdapter:
    name = ''
    label = ''

    def verify_signature(self, raw_body: bytes, headers) -> bool:  # pragma: no cover - interface
        raise NotImplementedError

    def parse(self, payload: dict) -> NormalizedEvent:             # pragma: no cover - interface
        raise NotImplementedError


class HmacJsonAdapter(ProviderAdapter):
    """
    Reference adapter for providers that sign the raw body with HMAC-SHA256 (hex) in a header and
    send {event_id, reference, status, amount, currency}. Used by the automated tests. A real provider
    usually needs its own field mapping, so do not enable this against a real provider without
    checking that provider's documentation.
    """
    def __init__(self, name, secret, header='X-Signature', label=None):
        self.name, self._secret, self._header, self.label = name, secret, header, label or name

    def verify_signature(self, raw_body, headers):
        sent = (headers.get(self._header) or '').strip().lower()
        good = hmac.new(self._secret.encode(), raw_body, hashlib.sha256).hexdigest()
        return bool(sent) and hmac.compare_digest(sent, good)

    def parse(self, payload):
        try:
            return NormalizedEvent(
                event_id=str(payload['event_id'])[:80], reference=str(payload['reference'])[:80],
                status=str(payload['status']).lower(), amount=Decimal(str(payload['amount'])),
                currency=str(payload['currency']).upper())
        except (KeyError, ValueError, ArithmeticError):
            raise ValueError('malformed event')


def register(adapter):
    REGISTRY[adapter.name] = adapter


def unregister(name):
    REGISTRY.pop(name, None)


def available_methods():
    methods = [{'id': k, 'label': v, 'online': False, 'verified_by_provider': False}
               for k, v in OFFLINE_METHODS.items()]
    methods += [{'id': a.name, 'label': a.label, 'online': True, 'verified_by_provider': True}
                for a in REGISTRY.values()]
    return methods
