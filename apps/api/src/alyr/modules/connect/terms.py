"""What a shop confirms before it connects another system (ALY-142, spec 016).

WhatsApp asks every business to have a person's opt-in before it starts a conversation with them.
A customer who bought at the counter of a shop that keeps its sales in another POS has, as far as
ALYR can see, never written to that shop on WhatsApp. So the permission comes from the shop: the
owner reads four sentences in the document settings and accepts them once, and from then on each
connected sale that asks for delivery records, on the customer's contact, a **service** consent
with the source `connected_sale`, the shop's assertion and the key that sent the sale
(`ingest.py`, `consent.record`). It is a consent for what the shop asserted (their receipts,
invoices and credit notes), nothing wider: marketing is a different purpose and is never
granted this way. A customer who has said stop is not messaged, whatever a shop asserts.

The words are versioned. A new version asks the owner to accept again (existing keys keep
working until then; new keys wait for the acceptance). The recorded wording names the version.
"""

import asyncpg

from alyr.catalog import Text
from alyr.core import team
from alyr.core.team import Actor
from alyr.modules.connect.words import ConnectError
from alyr.modules.documents import settings

VERSION = 1

# Shown in the settings, in both languages. The Arabic is a draft until ALY-66.
POINTS: tuple[Text, ...] = (
    Text(
        "I have each customer's permission to send them the receipts, invoices and credit "
        "notes that my system sends to ALYR, on WhatsApp and by email.",
        "لديّ إذن كل عميل بإرسال الإيصالات والفواتير والإشعارات الدائنة التي يرسلها نظامي إلى "
        "ALYR، عبر واتساب والبريد الإلكتروني.",
    ),
    Text(
        "I will use this connection for those documents only: no offers, no reminders, no "
        "marketing.",
        "سأستخدم هذا الربط لهذه المستندات فقط: دون عروض أو تذكيرات أو تسويق.",
    ),
    Text(
        "A customer who asks to stop will not be messaged again. ALYR enforces this and I will "
        "not work around it.",
        "لن يُراسَل العميل الذي يطلب التوقف مرة أخرى. تفرض ALYR ذلك ولن أتحايل عليه.",
    ),
    Text(
        "A document numbered by my own system is issued by me and ALYR only delivers it. I am "
        "responsible for what my system sends.",
        "المستند الذي يرقّمه نظامي أنا من يصدره، وتتولى ALYR إيصاله فقط. وأنا المسؤول عمّا يرسله "
        "نظامي.",
    ),
)

# The sentence recorded as the customer's consent (the `wording` of the `consents` row).
ASSERTION = (
    "The shop confirmed it has this customer's permission to send them their receipts, "
    "invoices and credit notes on WhatsApp and by email."
)


def wording(key_prefix: str = "", version: int = VERSION) -> str:
    """What the `consents` row says: the assertion, the terms' version and the key that sent
    the sale (its public prefix, never its secret)."""
    key = f", API key {key_prefix}." if key_prefix else "."
    return (f"{ASSERTION} Connected sales terms v{version}{key}")[:500]


async def status(conn: asyncpg.Connection) -> dict:
    await settings.ensure(conn)
    row = await conn.fetchrow(
        "select connect_terms_version, connect_terms_accepted_by, connect_terms_accepted_at "
        "from document_settings")
    accepted = row["connect_terms_version"] == VERSION
    return {
        "version": VERSION,
        "accepted": accepted,
        "accepted_version": row["connect_terms_version"],
        "accepted_by": row["connect_terms_accepted_by"],
        "accepted_at": row["connect_terms_accepted_at"].isoformat()
        if row["connect_terms_accepted_at"] else None,
        "points": [{"en": p.en, "ar": p.ar} for p in POINTS],
    }


async def accept(conn: asyncpg.Connection, actor: Actor) -> dict:
    await settings.ensure(conn)
    await conn.execute(
        "update document_settings set connect_terms_version = $1, "
        "connect_terms_accepted_by = $2, connect_terms_accepted_at = now()", VERSION, actor.name)
    await team.record(conn, settings.SUBJECT, await settings.shop_id(conn),
                      "connect_terms_accepted", actor, None, {"version": VERSION})
    return await status(conn)


async def require(conn: asyncpg.Connection, *, current: bool = True) -> int:
    """The version the owner accepted, or a refusal. A new key or an import needs the current
    version; a sale from a key that already exists needs only that the owner has accepted
    some version, so a change of wording never stops a shop's till."""
    found = await status(conn)
    if found["accepted_version"] is None or (current and not found["accepted"]):
        raise ConnectError("terms_not_accepted", 409)
    return found["accepted_version"]
