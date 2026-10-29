"""How the customers of a shop pay for an order (ALY-170, spec 024).

Online (a payment link) or, until the shop has its own online account, on collection by
cash, bank transfer or card machine. The shop says which; the order page, the order's
confirmation and `service.create_order` all read it from here. When the link is off an
order is placed unpaid with its stock committed (nothing expires), and staff mark it paid
when the money arrives (`routes/orders.py`, `documents/payments.py`).

A payment link is offered only when it can take money (ALY-271): once the shop's own account
with a payment provider is connected (`catalog.py`, the "payments" connection), or on a developer
machine, where the stand-in page plays the provider. Until then every shop is paid on
collection, whatever was saved, and the online choice is neither offered nor taken.

Every function takes a connection scoped to the shop.
"""

import asyncpg

from alyr import catalog
from alyr.catalog import Text
from alyr.config import get_settings

WAYS = ("cash", "bank_transfer", "card_terminal")
DEFAULT_WAYS = ["cash", "bank_transfer"]

_WORDS = {
    "cash": Text("cash", "نقداً"),
    "bank_transfer": Text("bank transfer", "تحويل بنكي"),
    "card_terminal": Text("card machine", "بطاقة عبر الجهاز"),
}


class PayWaysError(Exception):
    """A change the shop's payment ways cannot take; the message is safe to show."""


def stand_in() -> bool:
    """Is the stand-in payment page playing the provider? Only on a developer machine."""
    settings = get_settings()
    return settings.env == "local" and settings.stand_in_payments


async def online_possible(conn: asyncpg.Connection) -> bool:
    """Can a payment link take this shop's money? Only through its own connected account, or
    the stand-in on a developer machine. Anything else sends the customer to a page that
    cannot be paid (ALY-271)."""
    if stand_in():
        return True
    connected = catalog.CONNECTION_BY_KEY["payments"].connected
    return bool(connected) and bool(await conn.fetchval(f"select {connected}"))


async def get(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow("select pay_online, pay_later_ways from shop_settings")
    online = (row["pay_online"] if row else True) and await online_possible(conn)
    ways = list(row["pay_later_ways"]) if row else []
    # Paid on collection with nothing chosen yet: the usual two.
    return {"online": online, "ways": ways or ([] if online else list(DEFAULT_WAYS))}


def say(ways: list[str], lang: str) -> str:
    """The ways in a sentence: "cash or bank transfer"."""
    names = [_WORDS[w].get(lang) for w in WAYS if w in ways]
    joiner = " أو " if lang == "ar" else " or "
    if len(names) <= 1:
        return "".join(names)
    return (", " if lang != "ar" else "، ").join(names[:-1]) + joiner + names[-1]


async def save(
    conn: asyncpg.Connection, online: bool | None = None, ways: list[str] | None = None
) -> dict:
    now = await get(conn)
    if online and not await online_possible(conn):
        raise PayWaysError(
            "Online payment needs your own account with a payment provider, connected first. "
            "Until then customers pay when they collect."
        )
    online = now["online"] if online is None else online
    if ways is None:
        # Switching to "pay on collection" with nothing chosen yet opens the usual two.
        ways = now["ways"] or (DEFAULT_WAYS if not online else [])
    if any(w not in WAYS for w in ways):
        raise PayWaysError(f"choose from: {', '.join(WAYS)}")
    if not online and not ways:
        raise PayWaysError("Choose at least one way customers can pay when they collect.")
    ways = [w for w in WAYS if w in ways]
    await conn.execute(
        "insert into shop_settings (pay_online, pay_later_ways) values ($1, $2) "
        "on conflict (tenant_id) do update set pay_online = $1, pay_later_ways = $2",
        online, ways,
    )
    return {"online": online, "ways": ways}


async def apply_choice(conn: asyncpg.Connection, choice: str) -> None:
    """The go-live list's payments choice (spec 018): cash and transfer turns the payment
    link off and opens the default ways; online turns the link on."""
    if choice == "cash_transfer":
        now = await get(conn)
        await save(conn, online=False, ways=now["ways"] or DEFAULT_WAYS)
    elif choice == "online":
        # Refused before it gets here while no account is connected (`readiness.set_choice`).
        await save(conn, online=True)
