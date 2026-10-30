"""Self-serve onboarding: a new owner creates their business and sets it up (D-031).

The order matches the prototype (ALY-76): prove the email, pick the type of business,
give its name and area, then edit the starting setup the type comes with, try it as a
customer on a private test line, see the plan, and finish on the go-live checklist.

Creating a business is the one thing the app role cannot do directly. It goes through
the database function `signup_create_business`, which spends a single-use token this
module issues only after the email's code was checked.
"""

import hashlib
import re
import secrets
from uuid import UUID, uuid4

import asyncpg

from alyr import catalog, presets, shop_templates
from alyr.channels.base import InboundMessage
from alyr.config import get_settings
from alyr.core import auth, identity, pricing, team, terms, welcome
from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar
from alyr.db import Database
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import template

SIGNUP_MINUTES = 60
TEST_PREFIX = identity.TEST_PREFIX


class OnboardingError(Exception):
    """A request onboarding cannot carry out; the message is safe to show."""


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _text(value) -> dict:
    return {"en": value.en, "ar": value.ar}


def catalog_on() -> bool:
    """Do new businesses get their type's Catalog? One setting (`catalog_for_new_shops`), on
    since the go-live sweep (ALY-113, D-039) and still there to turn it off."""
    return get_settings().catalog_for_new_shops


async def types(conn: asyncpg.Connection) -> list[dict]:
    """The types of business an owner may choose, as ALYR has switched them (D-032):
    hidden types are left out, and `way` is the path a new business of that type takes.
    The types that exist for the Catalog are left out until it is on for new shops."""
    settings = await pricing.type_settings(conn)
    return [
        {"key": p.key, "name": _text(p.name), "hint": _text(p.hint), "icon": p.icon,
         "way": pricing.way_for(p, settings[p.key]["availability"])}
        for p in presets.PRESETS
        if settings[p.key]["availability"] != "hidden" and p.offered(catalog_on())
    ]


async def issue_signup_token(db: Database, email: str) -> str:
    """After the code was checked: a token that may create one business."""
    token = secrets.token_urlsafe(32)
    async with db.unscoped() as conn:
        await conn.execute(
            "insert into signup_tokens (token_hash, email, expires_at) "
            f"values ($1, $2, now() + interval '{SIGNUP_MINUTES} minutes')",
            _hash(token), auth.clean_email(email),
        )
        await conn.execute("delete from signup_tokens where expires_at < now() - interval '1 day'")
    return token


def _main_product(modules: tuple[str, ...]) -> str:
    """The product a setup request for a new business is filed under: credit accounts
    for a trader, bookings for an appointment business set up with ALYR, else Chat."""
    using = catalog.products_for(set(modules))
    for key in ("accounts", "bookings", "chat"):
        if key in using:
            return key
    return "chat"


def slug_base(name: str) -> str:
    """A web-address-safe version of the name. Arabic-only names fall back to 'shop'."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:32].strip("-")
    return base if len(base) >= 2 else "shop"


async def _free_slug(conn: asyncpg.Connection, name: str) -> str:
    base = slug_base(name)
    for n in range(1, 200):
        slug = base if n == 1 else f"{base}-{n}"
        if not await conn.fetchval("select true from tenants where slug = $1", slug):
            return slug
    return f"{base}-{secrets.token_hex(3)}"


async def create_business(
    db: Database, token: str, owner_name: str, name: str, name_ar: str, type_key: str,
    area: str, accepted_terms: list[UUID] | None = None, ip: str = "", user_agent: str = "",
    lang: str = "en", sales_link: UUID | None = None,
) -> tuple[UUID, str]:
    """Create the business, its owner and its starting setup. Returns the tenant and a
    session cookie value for the owner. The owner must have accepted every current version of
    the terms and the privacy notice (ALY-167): without that nothing is created, and with it
    each acceptance is recorded with who, when and from where.

    With `sales_link` (ALY-216) the business is made for the lead's own client, and the
    database refuses unless that link is live and its client's recorded email is the one the
    sign-up token proved. The session opens this business, not the owner's other ones."""
    async with db.unscoped() as conn:
        required = {t["id"] for t in await terms.current(conn)}
    if required - {str(t) for t in accepted_terms or []}:
        raise OnboardingError("accept the terms and the privacy notice to create your business")
    preset = presets.PRESET_BY_KEY.get(type_key)
    if preset is None or not preset.offered(catalog_on()):
        raise OnboardingError("choose the type of business")
    name, owner_name = name.strip(), owner_name.strip()
    modules = preset.modules_for(catalog_on())
    if not name or not owner_name:
        raise OnboardingError("give the business name and your name")
    tenant_id = None
    async with db.unscoped() as conn:
        availability = (await pricing.type_settings(conn))[preset.key]["availability"]
        if availability == "hidden":
            raise OnboardingError("choose the type of business")
        way = pricing.way_for(preset, availability)
        first_step = presets.STEPS[way][0]
        price_list = await pricing.items(conn, only_active=True)
        for _ in range(5):
            slug = await _free_slug(conn, name)
            try:
                async with conn.transaction():
                    tenant_id = await conn.fetchval(
                        "select signup_create_business("
                        "$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                        _hash(token), owner_name, name, name_ar.strip(), slug, preset.key,
                        area.strip(), way, first_step, list(modules), sales_link,
                    )
                break
            except asyncpg.UniqueViolationError:
                continue  # someone took the same address a moment ago; try the next
            except asyncpg.InsufficientPrivilegeError as error:
                raise auth.AuthError("this sign-up has expired; ask for a new code") from error
        if tenant_id is None:
            raise OnboardingError("could not create the business; try again")
        email = await conn.fetchval(
            "select email from signup_tokens where token_hash = $1", _hash(token)
        )
    async with db.tenant(tenant_id) as conn:
        # The language the owner reads, so a reminder to finish setup is written in it (ALY-171).
        await conn.execute("select update_own_resume($1, null)", "ar" if lang == "ar" else "en")
        owner = await conn.fetchval(
            "select user_id from memberships where role = 'owner' order by created_at limit 1"
        )
        # How to get back in, in the language they signed up in (specs/037).
        await welcome.queue(conn, welcome.WELCOME, owner)
        if required:
            await terms.accept(
                conn, [UUID(t) for t in sorted(required)], owner, owner_name, ip, user_agent
            )
        for sort, s in enumerate(preset.services):
            await conn.execute(
                "insert into services (name, name_ar, duration_minutes, price, sort) "
                "values ($1, $2, $3, $4, $5)",
                s.name, s.name_ar, s.minutes, s.price, sort,
            )
        for weekday, opens, closes in preset.hours:
            await conn.execute(
                "insert into business_hours (weekday, opens, closes) "
                "values ($1, $2::text::time, $3::text::time)",
                weekday, opens, closes,
            )
        await pricing.create_first_quote(
            conn, pricing.Business(tenant_id, name, frozenset(modules)), price_list
        )
        if "catalog" in modules and preset.catalog is not None:
            # Its words are by type; its starting values, categories and sample items are
            # written now, and are the owner's to change (`modules/items/template.py`).
            await template.apply(
                conn, shop_templates.builtin_for(preset.key), await shop_clock.load(conn)
            )
        if way == "assisted":
            await conn.execute(
                "insert into setup_requests (product_key, step_key, note, requested_by) "
                "values ($1, 'onboarding', $2, $3)",
                _main_product(modules),
                f"New {preset.name.en} business: set up its "
                f"{preset.hint.en.lower()} with the owner.",
                owner_name,
            )
    if sales_link is not None:
        # A person who already works for another business would be signed in to that one.
        async with db.unscoped() as conn, conn.transaction():
            user_id = await conn.fetchval("select id from users where email = $1", email)
            await conn.execute("select set_config('app.user_id', $1, true)", str(user_id))
            return tenant_id, await auth.create_session(conn, user_id, tenant_id)
    session = await auth.session_for(db, email)
    return tenant_id, session


async def state(conn: asyncpg.Connection, staff: Staff) -> dict:
    """Everything the onboarding screens need, for the signed-in owner's business."""
    # The owner is back: any reminder that went is now answered (ALY-171).
    await conn.execute(
        "update onboarding_reminders set returned_at = now() where returned_at is null"
    )
    shop = await conn.fetchrow(
        "select name, name_ar, slug, business_type, area, onboarding_way, onboarding_step, "
        "onboarded_at, booking_reminders, owner_lang from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    preset = presets.PRESET_BY_KEY.get(shop["business_type"])
    way = shop["onboarding_way"] or (preset.way if preset else "appointments")
    services = await conn.fetch(
        "select id, name, name_ar, duration_minutes, price from services "
        "where active order by sort, created_at"
    )
    hours = await conn.fetch(
        "select weekday, opens, closes from business_hours order by weekday, opens"
    )
    return {
        "business": {
            "name": shop["name"], "name_ar": shop["name_ar"], "slug": shop["slug"],
            "type": shop["business_type"], "area": shop["area"],
            "reminders": shop["booking_reminders"],
        },
        "owner": {"name": staff.name, "email": staff.email},
        "way": way,
        "steps": list(presets.STEPS[way]),
        "step": shop["onboarding_step"],
        "finished": shop["onboarded_at"] is not None,
        # The language ALYR writes to the owner in (a reminder to finish setting up).
        "lang": shop["owner_lang"],
        "services": [
            {"id": str(r["id"]), "name": r["name"], "name_ar": r["name_ar"],
             "duration_minutes": r["duration_minutes"], "price": r["price"],
             "price_text": fmt_qar(r["price"]) if r["price"] else ""}
            for r in services
        ],
        "hours": [
            {"weekday": r["weekday"], "opens": r["opens"].strftime("%H:%M"),
             "closes": r["closes"].strftime("%H:%M")}
            for r in hours
        ],
        "quote": await pricing.own_quote(conn),
        "areas": list(presets.AREAS),
        # What the shop's type gives its Catalog, in plain words, for the review; null where
        # the shop has no Catalog (travel and documents, or while it is off for new shops).
        "catalog": await template.review(conn) if await template.enabled(conn) else None,
    }


async def update(
    conn: asyncpg.Connection, *, name: str | None = None, name_ar: str | None = None,
    area: str | None = None, step: str | None = None, reminders: bool | None = None,
    finished: bool = False, lang: str | None = None, resume_reminders: bool | None = None,
) -> None:
    """Change the business's own onboarding details. `conn` is tenant-scoped."""
    every_step = {s for steps in presets.STEPS.values() for s in steps} | {""}
    if step is not None and step not in every_step:
        raise OnboardingError("unknown step")
    await conn.execute(
        "select update_own_business($1, $2, $3, $4, $5, $6)",
        name, name_ar, area, step, reminders, finished,
    )
    if lang is not None or resume_reminders is not None:
        if lang not in (None, "en", "ar"):
            raise OnboardingError("choose English or Arabic")
        await conn.execute("select update_own_resume($1, $2)", lang, resume_reminders)


def test_key(staff: Staff) -> str:
    """The owner's private test customer on their business's test line."""
    return f"{TEST_PREFIX}{staff.user_id or 'demo'}"


async def test_line(conn: asyncpg.Connection) -> str:
    number = await conn.fetchval(
        "select number_id from channel_numbers where channel = 'simulator' and tenant_id = "
        "nullif(current_setting('app.tenant_id', true), '')::uuid order by number_id limit 1"
    )
    if number is None:
        raise OnboardingError("this business has no test line")
    return number


async def test_send(db: Database, inbound, staff: Staff, text: str, reply_id: str) -> None:
    """Send a message to the business as the owner's test customer. It goes through the
    real inbound path, so the answer is exactly what a customer would get."""
    async with db.tenant(staff.tenant_id) as conn:
        number = await test_line(conn)
    await inbound.accept(
        InboundMessage(
            channel="simulator", message_id=f"test-{uuid4()}", to_number_id=number,
            kind="interactive" if reply_id else "text", from_user_id=test_key(staff),
            profile_name=f"{staff.name} (test)", text=text, reply_id=reply_id,
        )
    )


async def end_test(conn: asyncpg.Connection, staff: Staff) -> int:
    """When the owner opens their workspace the test is over. Their test booking is
    cancelled, so its time is free for real customers and no reminder goes out, and the
    test chat is closed, so it does not wait in the inbox as unanswered. Both stay in the
    history. Answers how many bookings were cancelled."""
    contact_id = await conn.fetchval(
        "select id from contacts where wa_user_id = $1", test_key(staff)
    )
    if contact_id is None:
        return 0
    rows = await conn.fetch(
        "update bookings set status = 'cancelled' where contact_id = $1 and status = 'booked' "
        "returning id, number",
        contact_id,
    )
    for row in rows:
        await team.record(
            conn, "booking", row["id"], "cancelled", team.actor_of(staff), contact_id,
            {"number": row["number"], "test": True},
        )
    await conn.execute("update contacts set inbox_status = 'closed' where id = $1", contact_id)
    return len(rows)


async def end_test_orders(conn: asyncpg.Connection, staff: Staff, outbound) -> int:
    """The same for the owner's test orders (ALY-168): each is cancelled, whatever it had got
    to (the owner may have marked it ready), and its stock goes back, so the shop starts with
    what it counted. Nothing is sent to the test customer and nothing is owed. The order stays
    in the list, marked Test, and is counted nowhere. Answers how many were cancelled."""
    from alyr.modules.orders import service as orders  # orders reads core, so not at the top

    ids = [
        r["id"] for r in await conn.fetch(
            "select o.id from orders o join contacts c on c.id = o.contact_id "
            "where c.wa_user_id = $1 and o.is_test and o.status <> 'cancelled'",
            test_key(staff),
        )
    ]
    for order_id in ids:
        await orders.cancel_order(
            conn, order_id, outbound, team.actor_of(staff), restock=True,
            reason="Test order: the test is over", notify=False,
        )
    return len(ids)


async def test_conversation(conn: asyncpg.Connection, staff: Staff) -> list[dict]:
    rows = await conn.fetch(
        "select m.direction, m.kind, m.body, m.payload, m.status, m.created_at "
        "from messages m join contacts c on c.id = m.contact_id "
        "where c.wa_user_id = $1 order by m.created_at",
        test_key(staff),
    )
    return [{**dict(r), "created_at": r["created_at"].isoformat()} for r in rows]
