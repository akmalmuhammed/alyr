"""Stands in for a payment provider, the way the simulator channel stands in for WhatsApp.

Nothing leaves the machine and no money moves. Its keys look like `sim_...`; anything else is
refused as wrong keys, and keys with `down` in them answer as a provider that is not
reachable. Its payment pages are kept in memory. `pay` marks one paid (from the developer-only
route `POST /sim/gateway/<ref>/pay`), which then sends the signed webhook a real provider would.
"""

import hashlib
import hmac
import json
from dataclasses import dataclass
from uuid import uuid4

from alyr.gateways.base import (
    BadKeys,
    Checkout,
    Event,
    Field,
    Payment,
    Status,
    Unavailable,
)

SIGNATURE = "x-sim-signature"


@dataclass
class SimCheckout:
    key: str
    amount: int
    webhook_url: str
    state: str = "pending"
    paid_amount: int = 0


def sign(key: str, body: bytes) -> str:
    return hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


class SimulatorGateway:
    name = "simulator"
    title = "Test provider"
    fields = (Field("secret_key", "Secret key", "المفتاح السري"),)
    live = False

    def __init__(self) -> None:
        self.checkouts: dict[str, SimCheckout] = {}

    def _key(self, keys: dict[str, str]) -> str:
        key = keys.get("secret_key", "")
        if "down" in key:
            raise Unavailable("the test provider is down")
        if not key.startswith("sim_") or len(key) < 8:
            raise BadKeys("the test provider does not know these keys")
        return key

    async def check(self, keys: dict[str, str]) -> None:
        self._key(keys)

    async def create_checkout(self, keys: dict[str, str], payment: Payment) -> Checkout:
        key = self._key(keys)
        # Our payment's ID is the merchant reference: asking twice gives the same page.
        ref = f"simpay_{payment.id.hex}"
        self.checkouts.setdefault(ref, SimCheckout(key, payment.amount, payment.webhook_url))
        return Checkout(ref, f"{payment.return_url}?sim={ref}")

    def read_webhook(
        self, keys: dict[str, str], headers: dict[str, str], body: bytes
    ) -> Event | None:
        key = keys.get("secret_key", "")
        given = headers.get(SIGNATURE, "")
        if not key or not hmac.compare_digest(given, sign(key, body)):
            return None
        try:
            data = json.loads(body)
            return Event(str(data["event_id"]), str(data["ref"]))
        except (ValueError, KeyError, TypeError):
            return None

    async def status(self, keys: dict[str, str], ref: str) -> Status:
        self._key(keys)
        found = self.checkouts.get(ref)
        if found is None:
            raise Unavailable("no such payment at the test provider")
        if found.state == "paid":
            return Status("paid", found.paid_amount)
        return Status("failed" if found.state == "failed" else "pending", found.amount)

    async def refund(self, keys: dict[str, str], ref: str, amount: int) -> str:
        self._key(keys)
        if ref not in self.checkouts:
            raise Unavailable("no such payment at the test provider")
        return f"simrefund_{uuid4().hex[:12]}"

    def pay(self, ref: str, amount: int | None = None) -> tuple[str, bytes, dict[str, str]]:
        """The customer pays on the test provider's page. Answers where to send the webhook,
        its body and its headers. `amount` lets a test say the provider took another amount."""
        found = self.checkouts[ref]
        found.state = "paid"
        found.paid_amount = found.amount if amount is None else amount
        body = json.dumps({"event_id": f"simevt_{uuid4().hex}", "ref": ref}).encode()
        return found.webhook_url, body, {SIGNATURE: sign(found.key, body)}
