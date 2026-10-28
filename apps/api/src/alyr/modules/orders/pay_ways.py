"""How the customers of a shop pay for an order (ALY-170, spec 024).

Online (a payment link) or, until the shop has its own online account, on collection by
cash, bank transfer or card machine. The shop says which; the order page, the order's
confirmation and `service.create_order` all read it from here. When the link is off an
order is placed unpaid with its stock committed (nothing expires), and staff mark it paid
when the money arrives (`routes/orders.py`, `documents/payments.py`).

Every function takes a connection scoped to the shop.
"""

import asyncpg

from alyr.catalog import Text

WAYS = ("cash", "bank_transfer", "card_terminal")
DEFAULT_WAYS = ["cash", "bank_transfer"]

_WORDS = {
    "cash": Text("cash", "نقداً"),
    "bank_transfer": Text("bank transfer", "تحويل بنكي"),
    "card_terminal": Text("card machine", "بطاقة عبر الجهاز"),
}


class PayWaysError(Exception):
    """A change the shop's payment ways cannot take; the message is safe to show."""


async def get(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow("select pay_online, pay_later_ways from shop_settings")
    return {
        "online": row["pay_online"] if row else True,
        "ways": list(row["pay_later_ways"]) if row else [],
    }


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
        await save(conn, online=True)
