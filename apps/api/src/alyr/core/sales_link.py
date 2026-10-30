"""Sales links: a quote made on a visit opens sign-up at the pay step (ALY-216, D-105 to D-108,
spec 041).

The founder visits a shop, agrees a price, and in the back office makes the shop a **lead**: a
client with no business yet whose plan (the type of business, the Arabic name, the area) is kept
in `clients.prospect`. The quote engine drafts the lead's first quote from the price list for
that type. He publishes it and sends a **sales link**: a signed token (`core/links.py`, purpose
`sales`) for one row of `sales_links`. The owner opens it, proves the email the founder recorded
by a code, reads the published quote, accepts the terms, and the business is made for the lead's
own client and opened at the go-live step, where the first payment is asked.

Two sets of functions, as in `core/pricing.py`:

* the back office's (`create_lead`, `save_prospect`, `issue`, `revoke`, `state`) take a connection
  on which the API has declared the caller is ALYR staff;
* the owner's (`resolve`, `opened`, `public_view`, `published_quote`, `accept`) take a connection
  on which the API has declared it is ALYR (`core/access.py` `office`), and every query in them
  is for the one link `resolve` accepted. No client or business ID is ever read from a request.
"""

import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr import catalog, presets
from alyr.config import get_settings
from alyr.core import access, backoffice, links, onboarding, pricing
from alyr.core.auth import Staff
from alyr.db import Database

DAYS = (1, 3, 7, 14, 30)
DEFAULT_DAYS = 7
# An owner who reloads the page is one open in the audit log, not twenty (the count on the row
# is exact).
OPEN_AUDIT_EVERY = timedelta(minutes=10)
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# What the owner's page is told, by `code`; the page has the words in both languages.
MESSAGES = {
    "unknown": "this link does not work",
    "expired": "this link has run out; ask ALYR for a new one",
    "revoked": "ALYR has withdrawn this link; ask for a new one",
    "used": "this link has been used",
    "changed": "the price has changed; look at the new one",
}


class SalesLinkError(Exception):
    """A request the sales link cannot carry out. `code` is one of `MESSAGES` for the owner's
    page, or `refused` for the back office; the message is safe to show."""

    def __init__(self, code: str, message: str | None = None) -> None:
        super().__init__(message or MESSAGES.get(code, code))
        self.code = code


@dataclass(frozen=True)
class Offer:
    """A live link and the lead it is for, as `resolve` found them."""

    link_id: UUID
    client_id: UUID
    name: str
    contact_name: str
    email: str
    plan: dict
    opened_at: datetime | None


# ── the lead ──────────────────────────────────────────────


async def _clean_plan(conn: asyncpg.Connection, type_key: str, name_ar: str, area: str) -> dict:
    """The lead's plan, if the type is one an owner may be given now: not hidden, and with its
    Catalog on where it needs one (the same rule sign-up applies)."""
    preset = presets.PRESET_BY_KEY.get(type_key)
    if preset is None or not preset.offered(onboarding.catalog_on()):
        raise SalesLinkError("refused", "choose the type of business")
    if (await pricing.type_settings(conn))[preset.key]["availability"] == "hidden":
        raise SalesLinkError("refused", "choose the type of business")
    return {"type": preset.key, "name_ar": name_ar.strip()[:120], "area": area.strip()[:80]}


async def create_lead(
    conn: asyncpg.Connection, staff: Staff, *, name: str, contact_name: str, contact_email: str,
    contact_phone: str, note: str, type_key: str, name_ar: str, area: str,
) -> UUID:
    """A client with no business yet. The owner's email is needed now: the code goes there."""
    email = contact_email.strip().lower()
    if not name.strip() or not contact_name.strip():
        raise SalesLinkError("refused", "give the business name and the owner's name")
    if not _EMAIL.match(email):
        raise SalesLinkError("refused", "give the owner's email: the code goes there")
    plan = await _clean_plan(conn, type_key, name_ar, area)
    client_id = await conn.fetchval(
        "insert into clients (name, contact_name, contact_email, contact_phone, note, prospect) "
        "values ($1, $2, $3, $4, $5, $6) returning id",
        name.strip(), contact_name.strip(), email, contact_phone.strip(), note.strip(), plan,
    )
    await backoffice.audit(
        conn, staff, "lead.created", "client", client_id, client_id=client_id,
        detail={"name": name.strip(), "type": plan["type"]},
    )
    return client_id


async def _lead(conn: asyncpg.Connection, client_id: UUID, *, lock: bool = False):
    """The client row if it is a lead (a plan, no business), else a refusal."""
    row = await conn.fetchrow(
        "select c.*, exists (select 1 from tenants t where t.client_id = c.id) as has_business "
        f"from clients c where c.id = $1{' for update of c' if lock else ''}",
        client_id,
    )
    if row is None:
        raise SalesLinkError("refused", "no such client")
    if row["has_business"]:
        raise SalesLinkError(
            "refused",
            "this client already has a business; its owner signs in and answers the price there",
        )
    if row["prospect"] is None:
        raise SalesLinkError("refused", "this client is not a lead")
    return row


async def save_prospect(
    conn: asyncpg.Connection, staff: Staff, client_id: UUID, type_key: str, name_ar: str,
    area: str,
) -> None:
    """Change the lead's plan. A quote already drafted keeps its lines; the founder edits them."""
    await _lead(conn, client_id, lock=True)
    plan = await _clean_plan(conn, type_key, name_ar, area)
    await conn.execute("update clients set prospect = $2 where id = $1", client_id, plan)
    await backoffice.audit(
        conn, staff, "lead.plan_saved", "client", client_id, client_id=client_id, detail=plan
    )


# ── the link, for the back office ─────────────────────────


def _expires_unix(row: asyncpg.Record) -> int:
    return int(row["expires_at"].timestamp())


def _view(row: asyncpg.Record, business: str = "") -> dict:
    now = datetime.now(UTC)
    status = (
        "used" if row["claimed_at"] else "revoked" if row["revoked_at"]
        else "expired" if row["expires_at"] <= now else "live"
    )
    out = {
        "id": str(row["id"]), "state": status,
        "created_at": row["created_at"].isoformat(), "created_by": row["created_by"],
        "expires_at": row["expires_at"].isoformat(),
        "opens": row["opens"],
        "first_opened_at": row["first_opened_at"].isoformat() if row["first_opened_at"] else None,
        "last_opened_at": row["last_opened_at"].isoformat() if row["last_opened_at"] else None,
        "verified_at": row["verified_at"].isoformat() if row["verified_at"] else None,
        "claimed_at": row["claimed_at"].isoformat() if row["claimed_at"] else None,
        "business": business,
        "revoked_at": row["revoked_at"].isoformat() if row["revoked_at"] else None,
        "revoked_by": row["revoked_by"], "revoked_reason": row["revoked_reason"],
        "url": None,
    }
    if status == "live":
        # Made again from the row: the token is never stored.
        out["url"] = links.sales_url(
            get_settings().public_web_url.rstrip("/"), row["client_id"], row["id"],
            _expires_unix(row),
        )
    return out


async def state(conn: asyncpg.Connection, client_id: UUID) -> dict:
    """The newest link of the client and what came of it, with its address while it is live."""
    row = await conn.fetchrow(
        "select l.*, t.name as business from sales_links l "
        "left join tenants t on t.id = l.claimed_tenant "
        "where l.client_id = $1 order by l.created_at desc limit 1",
        client_id,
    )
    return {"link": _view(row, row["business"] or "") if row else None}


async def published_quote_row(conn: asyncpg.Connection, client_id: UUID):
    return await conn.fetchrow(
        "select * from quotes where client_id = $1 and status = 'published' "
        "order by number desc limit 1",
        client_id,
    )


async def revoke_live(
    conn: asyncpg.Connection, client_id: UUID, by: str, reason: str
) -> list[UUID]:
    rows = await conn.fetch(
        "update sales_links set revoked_at = now(), revoked_by = $2, revoked_reason = $3 "
        "where client_id = $1 and revoked_at is null and claimed_at is null returning id",
        client_id, by, reason,
    )
    return [r["id"] for r in rows]


async def issue(
    conn: asyncpg.Connection, staff: Staff, client_id: UUID, days: int = DEFAULT_DAYS
) -> dict:
    """Send link: a new link for the lead, replacing any earlier one that was not used. The
    lead needs its owner's email and a published quote; the amounts are the quote's."""
    if days not in DAYS:
        raise SalesLinkError("refused", f"a link lasts {', '.join(map(str, DAYS))} days")
    lead = await _lead(conn, client_id, lock=True)
    if not _EMAIL.match(lead["contact_email"]):
        raise SalesLinkError("refused", "add the owner's email first: the code goes there")
    if await published_quote_row(conn, client_id) is None:
        raise SalesLinkError("refused", "publish the quote first; the owner reads it from the link")
    by = staff.name or staff.email or "ALYR"
    replaced = await revoke_live(conn, client_id, by, "replaced")
    row = await conn.fetchrow(
        "insert into sales_links (client_id, created_by, expires_at) "
        "values ($1, $2, now() + make_interval(days => $3)) returning *",
        client_id, by, days,
    )
    await backoffice.audit(
        conn, staff, "sales_link.sent", "sales_link", row["id"], client_id=client_id,
        detail={"days": days, "expires_at": row["expires_at"].isoformat(),
                "replaced": [str(x) for x in replaced]},
    )
    return {"link": _view(row)}


async def revoke(conn: asyncpg.Connection, staff: Staff, client_id: UUID) -> dict:
    by = staff.name or staff.email or "ALYR"
    revoked = await revoke_live(conn, client_id, by, "by_hand")
    if not revoked:
        raise SalesLinkError("refused", "there is no live link to revoke")
    for link_id in revoked:
        await backoffice.audit(
            conn, staff, "sales_link.revoked", "sales_link", link_id, client_id=client_id,
            detail={"reason": "by_hand"},
        )
    return await state(conn, client_id)


async def email_changed(conn: asyncpg.Connection, staff: Staff, client_id: UUID) -> None:
    """The lead's email was changed: a link made for the old address no longer fits."""
    by = staff.name or staff.email or "ALYR"
    for link_id in await revoke_live(conn, client_id, by, "email_changed"):
        await backoffice.audit(
            conn, staff, "sales_link.revoked", "sales_link", link_id, client_id=client_id,
            detail={"reason": "email_changed"},
        )


# ── the link, for the owner ───────────────────────────────


def mask(email: str) -> str:
    """`nadia@gmail.com` as `n••••@gmail.com`: enough for the owner to know which mailbox the
    code went to, not enough to learn the address."""
    local, _, domain = email.partition("@")
    return f"{local[:1]}••••@{domain}"


async def resolve(conn: asyncpg.Connection, token: str, *, now: float | None = None) -> Offer:
    """The live link a token stands for. Raises `SalesLinkError`: `unknown` for anything that is
    not ours or not for this link (a forged or damaged token, one of another purpose, one made
    for another client's link, a link that does not exist), `expired`, `revoked` or `used`. The
    checks are in the order the spec lists; an unknown link and a forged one answer alike."""
    refused = SalesLinkError("unknown")
    try:
        link_id = links.peek(token)
    except links.LinkError as error:
        raise refused from error
    row = await conn.fetchrow(
        "select l.*, c.name, c.contact_name, c.contact_email, c.prospect, "
        "exists (select 1 from tenants t where t.client_id = c.id) as has_business "
        "from sales_links l join clients c on c.id = l.client_id where l.id = $1",
        link_id,
    )
    if row is None:
        raise refused
    try:
        # The signature is checked against the client the ROW names, so a token that was made
        # for one client's link and carries another's ID fails here.
        link = links.read(token, row["client_id"], purpose=links.SALES, now=now)
    except links.LinkError as error:
        raise SalesLinkError("expired" if error.code == "expired" else "unknown") from error
    if link.subject_id != row["id"]:
        raise refused
    if row["revoked_at"] is not None:
        raise SalesLinkError("revoked")
    if row["claimed_at"] is not None or row["has_business"]:
        raise SalesLinkError("used")
    at = datetime.fromtimestamp(now if now is not None else time.time(), UTC)
    if not row["prospect"]:
        raise refused
    if row["expires_at"] <= at:
        raise SalesLinkError("expired")
    return Offer(
        row["id"], row["client_id"], row["name"], row["contact_name"],
        row["contact_email"].strip().lower(), row["prospect"], row["last_opened_at"],
    )


async def opened(conn: asyncpg.Connection, offer: Offer) -> None:
    """Count an open; one is written to the audit log if the last was ten minutes ago or more."""
    await conn.execute(
        "update sales_links set opens = opens + 1, "
        "first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now() "
        "where id = $1",
        offer.link_id,
    )
    if offer.opened_at is None or datetime.now(UTC) - offer.opened_at >= OPEN_AUDIT_EVERY:
        await backoffice.audit_owner(
            conn, "sales_link.opened", "sales_link", offer.link_id, client_id=offer.client_id
        )


async def code_sent(conn: asyncpg.Connection, offer: Offer) -> None:
    await backoffice.audit_owner(
        conn, "sales_link.code_sent", "sales_link", offer.link_id, client_id=offer.client_id
    )


async def verified(conn: asyncpg.Connection, offer: Offer) -> None:
    await conn.execute("update sales_links set verified_at = now() where id = $1", offer.link_id)
    await backoffice.audit_owner(
        conn, "sales_link.verified", "sales_link", offer.link_id, client_id=offer.client_id
    )


def public_view(offer: Offer) -> dict:
    """What anyone holding a live link may see before the code: the shop's name and type and
    where the code goes (masked). Not the price, the owner's name or the full address."""
    preset = presets.PRESET_BY_KEY[offer.plan["type"]]
    return {
        "business": {
            "name": offer.name, "name_ar": offer.plan.get("name_ar", ""),
            "type": preset.key, "type_name": {"en": preset.name.en, "ar": preset.name.ar},
        },
        "email_hint": mask(offer.email),
    }


async def offer_view(conn: asyncpg.Connection, offer: Offer) -> dict:
    """What the owner sees once the code is proved: the published quote as the plan step of
    sign-up shows it (`pricing.quote_view`, the price list's amounts), the products the business
    will have, and the owner's name to confirm."""
    preset = presets.PRESET_BY_KEY[offer.plan["type"]]
    modules = preset.modules_for(onboarding.catalog_on())
    row = await published_quote_row(conn, offer.client_id)
    quote = {"status": "preparing"}
    if row is not None:
        quote = await pricing.quote_view(conn, row, await pricing.promise(conn))
        quote.pop("updated_by")
    return {
        "quote": quote,
        "products": [
            {"en": catalog.PRODUCT_BY_KEY[k].name.en, "ar": catalog.PRODUCT_BY_KEY[k].name.ar}
            for k in catalog.products_for(set(modules))
        ],
        "owner_name": offer.contact_name,
    }


async def accept(
    db: Database, offer: Offer, signup_token: str, owner_name: str,
    accepted_terms: list[UUID], quote_id: UUID, ip: str, user_agent: str, lang: str,
) -> tuple[UUID, str, bool]:
    """The owner accepts: the business is made for the lead's client (the database refuses
    unless the link is live and the proved email is the recorded one), the terms are recorded,
    the quote shown is accepted, and the business opens at the go-live step. Answers the tenant,
    the owner's session and whether the quote was accepted; if the price changed in the moment
    between, the business opens at the plan step to answer it there."""
    async with access.office(db) as conn:
        row = await published_quote_row(conn, offer.client_id)
    if row is None or row["id"] != quote_id:
        raise SalesLinkError("changed")
    tenant_id, session = await onboarding.create_business(
        db, signup_token, owner_name.strip() or offer.contact_name, offer.name,
        offer.plan.get("name_ar", ""), offer.plan["type"], offer.plan.get("area", ""),
        accepted_terms, ip, user_agent, lang, sales_link=offer.link_id,
    )
    async with db.tenant(tenant_id) as conn:
        owner = await conn.fetchval(
            "select user_id from memberships where role = 'owner' order by created_at limit 1"
        )
        name = owner_name.strip() or offer.contact_name
        done = await pricing.accept(conn, quote_id, owner, name)
        await onboarding.update(conn, step="golive" if done else "plan")
    async with access.office(db) as conn:
        await backoffice.audit_owner(
            conn, "sales_link.accepted", "sales_link", offer.link_id, client_id=offer.client_id,
            business_id=tenant_id, detail={"quote_id": str(quote_id), "quote_accepted": done},
        )
    return tenant_id, session, done
