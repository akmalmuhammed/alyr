"""What every payment provider's adapter does (ALY-17, specs/033-payment-adapters).

The shop is always the merchant of record and is paid by the provider into its own bank
account (D-044); an adapter only ever acts on the shop's own account, with the shop's own keys.
Nothing outside `gateways/` knows which provider a shop uses.
"""

from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID


@dataclass(frozen=True)
class Field:
    """One thing the owner pastes from the provider's dashboard."""

    key: str
    label_en: str
    label_ar: str
    secret: bool = True


@dataclass(frozen=True)
class Payment:
    """What a provider needs to make its payment page for one payment request."""

    id: UUID
    amount: int  # dirhams
    description: str
    # Where the provider sends the customer back to: the ALYR pay link.
    return_url: str
    # Where the provider calls when something happens.
    webhook_url: str


@dataclass(frozen=True)
class Checkout:
    ref: str
    url: str


@dataclass(frozen=True)
class Event:
    """A webhook the provider proved it sent. Says which payment, never what happened:
    that comes from `status`."""

    event_id: str
    ref: str


@dataclass(frozen=True)
class Status:
    state: Literal["paid", "pending", "failed"]
    amount: int  # dirhams


class BadKeys(Exception):
    """The provider refused the keys."""


class Unavailable(Exception):
    """The provider could not be reached or answered with an error. Worth trying again."""


class Gateway(Protocol):
    name: str
    title: str
    fields: tuple[Field, ...]
    # Whether it may be offered anywhere but a developer machine.
    live: bool

    async def check(self, keys: dict[str, str]) -> None: ...

    async def create_checkout(self, keys: dict[str, str], payment: Payment) -> Checkout: ...

    def read_webhook(
        self, keys: dict[str, str], headers: dict[str, str], body: bytes
    ) -> Event | None: ...

    async def status(self, keys: dict[str, str], ref: str) -> Status: ...

    async def refund(self, keys: dict[str, str], ref: str, amount: int) -> str: ...
