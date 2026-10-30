"""Paddle, the card provider a client can pay ALYR through (ALY-180, D-074, spec 035).

Only what ALYR's own billing needs: make a checkout for what a client owes, read a
transaction or a subscription back, and check that a webhook was signed by Paddle. Paddle is
the merchant of record for the card payment; ALYR never sees a card number.

Checked against developer.paddle.com on 29 Oct 2026:
- Non-catalog items: each item carries its `price` (name, description, `unit_price` with the
  amount as a string in the currency's smallest unit, `billing_cycle` for a recurring price)
  and the price its `product` (name, `tax_category`; "saas" is open on every account).
  Recurring items on one transaction must share a billing interval.
- A transaction made without a customer is a draft that a checkout completes; its
  `checkout.url` is the account's default payment link with `?_ptxn=txn_...`.
- Custom data on the transaction is copied to the subscription Paddle makes from it, and from
  the subscription to every renewal.
- `POST /subscriptions/{id}/cancel` with `effective_from: immediately` cancels at once
  (the default, `next_billing_period`, schedules it for the period's end); a cancelled
  subscription cannot be reinstated.
- Webhooks carry `Paddle-Signature: ts=...;h1=...`: an HMAC-SHA256, in hex, of
  `ts + ":" + raw body` with the notification destination's secret.

Paddle has no Qatari riyal, so ALYR charges in US dollars at the riyal's fixed peg (QAR 3.64
to USD 1, since 2001), rounded up to the cent.
"""

import hashlib
import hmac
import time

import httpx

from alyr.config import Settings

# Tests replace this with an httpx.MockTransport; nothing else should.
transport: httpx.AsyncBaseTransport | None = None

BASE_URL = {"sandbox": "https://sandbox-api.paddle.com", "live": "https://api.paddle.com"}
TIMEOUT_SECONDS = 15
# Dirhams in one US dollar: QAR 3.64, the peg.
DIRHAMS_PER_USD = 364
# A webhook signed longer ago than this is refused. Handling one is idempotent, so the window
# only has to cover clock drift and Paddle's delivery time.
SIGNATURE_TOLERANCE_SECONDS = 300
# What a transaction is when its money was taken.
PAID = ("paid", "completed")


class Refused(Exception):
    """Paddle answered that the request is wrong (4xx): trying again will not help."""


class Unavailable(Exception):
    """Paddle could not be reached or failed (5xx, timeout): try again later."""


def ready(settings: Settings) -> bool:
    """Is everything set for a card payment through Paddle? "unset" is the placeholder
    Secret Manager holds for a value not given yet (infra/gcp/setup.sh)."""
    values = (settings.paddle_api_key, settings.paddle_webhook_secret, settings.paddle_client_token)
    return all(v and v != "unset" for v in values) and settings.paddle_environment in BASE_URL


def usd_cents(dirhams: int) -> int:
    """An amount in dirhams, in US cents at the peg, rounded up: ALYR never charges less than
    the price the client accepted."""
    return -(-dirhams * 100 // DIRHAMS_PER_USD)


def usd_text(cents: int) -> str:
    return f"USD {cents // 100:,}.{cents % 100:02d}"


def signed(header: str, body: bytes, secret: str, now: float | None = None) -> bool:
    """Was this body signed by Paddle with this destination's secret, recently? More than one
    h1 can be sent while Paddle rotates the secret: any one matching is enough."""
    if not header or not secret or secret == "unset":
        return False
    parts: dict[str, list[str]] = {}
    for piece in header.split(";"):
        key, _, value = piece.strip().partition("=")
        parts.setdefault(key, []).append(value)
    stamps, signatures = parts.get("ts", []), parts.get("h1", [])
    if len(stamps) != 1 or not stamps[0].isdigit() or not signatures:
        return False
    if abs((time.time() if now is None else now) - int(stamps[0])) > SIGNATURE_TOLERANCE_SECONDS:
        return False
    expected = hmac.new(
        secret.encode(), stamps[0].encode() + b":" + body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in signatures)


def checkout_body(
    *, checkout_id: str, setup: int, period: int, months: int, period_name: str
) -> dict:
    """The transaction Paddle is asked to make: the setup fee once, and the plan every
    `months` months, in US cents. Only ALYR's checkout ID goes as custom data: no name, no
    email and nothing about the client's business."""
    items = []
    if setup:
        items.append(_item("ALYR setup", "Setup, once", setup, None))
    items.append(_item("ALYR", period_name, period, months))
    return {
        "items": items,
        "currency_code": "USD",
        "collection_mode": "automatic",
        "custom_data": {"alyr_checkout": checkout_id},
    }


def _item(product: str, name: str, cents: int, months: int | None) -> dict:
    price = {
        "name": name,
        "description": name,
        "unit_price": {"amount": str(cents), "currency_code": "USD"},
        "product": {"name": product, "tax_category": "saas"},
    }
    if months:
        price["billing_cycle"] = {"interval": "month", "frequency": months}
    return {"quantity": 1, "price": price}


class Paddle:
    def __init__(self, settings: Settings) -> None:
        self._key = settings.paddle_api_key
        self._base = BASE_URL.get(settings.paddle_environment, BASE_URL["sandbox"])

    async def create_transaction(self, body: dict) -> dict:
        return await self._call("POST", "/transactions", body)

    async def transaction(self, transaction_id: str) -> dict:
        return await self._call("GET", f"/transactions/{_ref(transaction_id, 'txn_')}")

    async def subscription(self, subscription_id: str) -> dict:
        return await self._call("GET", f"/subscriptions/{_ref(subscription_id, 'sub_')}")

    async def cancel_subscription(self, subscription_id: str) -> dict:
        """Stop a subscription now: it renews no more (ALY-218). Paddle cannot restart a
        cancelled subscription; a client who comes back starts a new one."""
        return await self._call(
            "POST", f"/subscriptions/{_ref(subscription_id, 'sub_')}/cancel",
            {"effective_from": "immediately"},
        )

    async def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        try:
            async with httpx.AsyncClient(
                base_url=self._base, timeout=TIMEOUT_SECONDS, transport=transport
            ) as http:
                answer = await http.request(
                    method, path, json=body,
                    headers={"Authorization": f"Bearer {self._key}"},
                )
        except httpx.HTTPError as error:
            raise Unavailable(type(error).__name__) from error
        if answer.status_code >= 500 or answer.status_code == 429:
            raise Unavailable(f"Paddle answered {answer.status_code}")
        if answer.status_code >= 400:
            # Paddle's error code only: its detail can repeat what was sent.
            code = ""
            try:
                code = str(answer.json().get("error", {}).get("code", ""))[:60]
            except ValueError:
                pass
            raise Refused(f"Paddle answered {answer.status_code} {code}".strip())
        try:
            return answer.json()["data"]
        except (ValueError, KeyError) as error:
            raise Unavailable("Paddle's answer could not be read") from error


def _ref(value: str, prefix: str) -> str:
    """A Paddle ID that is safe in a path."""
    if not (value.startswith(prefix) and value[len(prefix):].isalnum() and len(value) <= 80):
        raise Refused("not a Paddle ID")
    return value
