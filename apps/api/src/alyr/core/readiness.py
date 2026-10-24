"""The go-live readiness check: one answer to "is this business ready?" for `/start`, the
workspace and the back office (ALY-165, decision D-049).

Whether a check passes is always worked out from the business's own data, never typed in.
What data cannot say is kept in `onboarding_steps`: who owns the step (the client, or ALYR
doing it for them), a blocker ALYR wrote, and a choice the owner made. Each run also keeps
the last state it saw there, so the back office can list every business without opening
each one, and appends every change to `onboarding_events` for the funnel (ALY-169).

A business moves through three stages:
  * setting_up: something the owner (or ALYR) still has to do;
  * ready: everything is done except the WhatsApp number, which waits on Meta or on ALYR;
  * live: everything is done, the number included. Live is recorded once and kept: it
    starts the clock of the money-back promise (D-034), and the first invoice (ALY-218).

Every function takes a connection scoped to the business, unless it says otherwise.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

import asyncpg

from alyr import catalog
from alyr.catalog import Text

OWNERS = ("client", "alyr")

# How a business can be on WhatsApp (ALY-217). Every one of them ends as a Meta channel row
# on the business; until then the step waits.
WHATSAPP_WAYS = ("alyr_number", "new_number", "move_number", "own_account")
# How a business takes its customers' money (D-044). Cash and transfer need nothing
# connected; online needs the business's own account with a payment provider.
PAYMENT_WAYS = ("cash_transfer", "online")

_SCOPE = "nullif(current_setting('app.tenant_id', true), '')::uuid"


class ReadinessError(Exception):
    """A change the check cannot make; the message is safe to show."""


@dataclass(frozen=True)
class Check:
    key: str
    label: Text
    # In plain words: what to do while it fails.
    todo: Text
    # The modules any one of which makes the check apply; empty applies to every business.
    modules: tuple[str, ...] = ()
    # Needed before the business is ready. The WhatsApp check is needed only to go live.
    for_ready: bool = True
    choices: tuple[str, ...] = ()


CHECKS: tuple[Check, ...] = (
    Check(
        "content",
        Text("What you sell is in ALYR", "ما تبيعه موجود في ALYR"),
        Text(
            "Add at least one item with a price, or one service customers can book.",
            "أضف صنفاً واحداً على الأقل بسعره، أو خدمة واحدة يمكن حجزها.",
        ),
        modules=("orders", "catalog", "bookings"),
    ),
    Check(
        "hours",
        Text("Opening hours are set", "ساعات العمل محددة"),
        Text("Set the days and hours customers can book.", "حدّد الأيام والساعات المتاحة للحجز."),
        modules=("bookings",),
    ),
    Check(
        "test",
        Text("You tried it as a customer", "جرّبته كعميل"),
        Text(
            "Place a test order or booking on your private test line.",
            "اطلب أو احجز تجربةً على خط التجربة الخاص بك.",
        ),
        modules=("orders", "bookings"),
    ),
    Check(
        "price",
        Text("Your ALYR plan is accepted", "خطتك مع ALYR مقبولة"),
        Text("Read your price and accept it.", "اطّلع على سعرك واقبله."),
    ),
    Check(
        "payments",
        Text("You chose how customers pay", "اخترت طريقة الدفع"),
        Text(
            "Choose cash and bank transfer for now, or online payments to your own account.",
            "اختر النقد والتحويل البنكي الآن، أو الدفع الإلكتروني إلى حسابك.",
        ),
        choices=PAYMENT_WAYS,
    ),
    Check(
        "whatsapp",
        Text("Your WhatsApp number is connected", "رقم واتساب مربوط"),
        Text(
            "Choose how your customers reach you on WhatsApp.",
            "اختر كيف يصل إليك عملاؤك على واتساب.",
        ),
        for_ready=False,
        choices=WHATSAPP_WAYS,
    ),
)
CHECK_BY_KEY = {c.key: c for c in CHECKS}

# The workspace's setup steps (`catalog.py`) and the readiness step each one feeds. When the
# owner asks ALYR to do one of them, ALYR owns that readiness step.
SETUP_STEP = {
    "whatsapp": "whatsapp", "provider": "payments", "services": "content",
    "products": "content", "hours": "hours",
}


async def _exists(conn: asyncpg.Connection, sql: str) -> bool:
    return bool(await conn.fetchval(f"select exists ({sql})"))


async def _content(conn: asyncpg.Connection, modules: set[str]) -> bool:
    if modules & {"orders", "catalog"} and await _exists(
        conn, "select 1 from items where available and status = 'live'"
    ):
        return True
    return "bookings" in modules and await _exists(
        conn, "select 1 from services where active"
    )


async def _test(conn: asyncpg.Connection, modules: set[str]) -> bool:
    # The owner's test customer is `TEST.<user>` on the business's private test line
    # (`core/onboarding.py`). A cancelled test booking still proves they tried it.
    if "bookings" in modules and await _exists(
        conn,
        "select 1 from bookings b join contacts c on c.id = b.contact_id "
        "where c.wa_user_id like 'TEST.%'",
    ):
        return True
    return "orders" in modules and await _exists(
        conn,
        "select 1 from orders o join contacts c on c.id = o.contact_id "
        "where c.wa_user_id like 'TEST.%'",
    )


async def _price(conn: asyncpg.Connection, modules: set[str]) -> bool:
    # Row-level security shows the owner only their own client's quotes.
    return await _exists(conn, "select 1 from quotes where status = 'accepted'")


async def _connected(conn: asyncpg.Connection, key: str) -> bool:
    connection = catalog.CONNECTION_BY_KEY[key]
    if not connection.connected:
        return False
    return bool(await conn.fetchval(f"select {connection.connected}"))


Evaluate = Callable[[asyncpg.Connection, set[str]], Awaitable[bool]]
_PASSES: dict[str, Evaluate] = {
    "content": _content,
    "hours": lambda conn, modules: _exists(conn, "select 1 from business_hours"),
    "test": _test,
    "price": _price,
}


async def _status(conn: asyncpg.Connection, check: Check, modules: set[str], choice: str) -> str:
    """done, todo, or waiting: the owner did their part and it waits on someone else."""
    if check.key == "whatsapp":
        if await _connected(conn, "whatsapp"):
            return "done"
        return "waiting" if choice else "todo"
    if check.key == "payments":
        if choice == "cash_transfer" or await _connected(conn, "payments"):
            return "done"
        return "waiting" if choice == "online" else "todo"
    return "done" if await _PASSES[check.key](conn, modules) else "todo"


def applies(check: Check, modules: set[str]) -> bool:
    return not check.modules or bool(modules & set(check.modules))


def _text(value: Text) -> dict:
    return {"en": value.en, "ar": value.ar}


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def _event(
    conn: asyncpg.Connection, step: str, event: str, actor: str, by_alyr: bool,
    detail: dict | None = None,
) -> None:
    await conn.execute(
        "insert into onboarding_events (step_key, event, detail, actor, by_alyr) "
        "values ($1, $2, $3, $4, $5)",
        step, event, detail or {}, actor, by_alyr,
    )


async def run(conn: asyncpg.Connection, actor: str = "", by_alyr: bool = False) -> dict:
    """Check the business in scope, keep what changed, and answer the whole state."""
    modules = {
        r["module_key"]
        for r in await conn.fetch("select module_key from tenant_modules where enabled")
    }
    checks = [c for c in CHECKS if applies(c, modules)]
    await conn.executemany(
        "insert into onboarding_steps (step_key) values ($1) on conflict do nothing",
        [(c.key,) for c in checks],
    )
    rows = {
        r["step_key"]: r
        for r in await conn.fetch(
            "select step_key, owner, blocker, choice, done_at, updated_at, updated_by "
            "from onboarding_steps"
        )
    }
    asked = {
        SETUP_STEP.get(r["step_key"], r["step_key"])
        for r in await conn.fetch("select step_key from setup_requests where status = 'open'")
    }
    lines = []
    for check in checks:
        row = rows[check.key]
        status = await _status(conn, check, modules, row["choice"])
        if status == "done":
            # Only the run that sees it first records it, so two at once write one event.
            done_at = await conn.fetchval(
                "update onboarding_steps set done_at = now(), checked_at = now() "
                "where step_key = $1 and done_at is null returning done_at",
                check.key,
            )
            if done_at is not None:
                await _event(conn, check.key, "done", actor, by_alyr)
            else:
                done_at = row["done_at"]
        else:
            undone = await conn.fetchval(
                "update onboarding_steps set done_at = null, checked_at = now() "
                "where step_key = $1 and done_at is not null returning true",
                check.key,
            )
            if undone:
                await _event(conn, check.key, "undone", actor, by_alyr)
            done_at = None
        lines.append({
            "key": check.key,
            "label": _text(check.label),
            "todo": _text(check.todo),
            "status": status,
            "for_ready": check.for_ready,
            "owner": row["owner"],
            "asked": row["owner"] == "alyr" or check.key in asked,
            "blocker": row["blocker"],
            "choice": row["choice"],
            "choices": list(check.choices),
            "done_at": _iso(done_at),
        })
    await conn.execute(
        "update onboarding_steps set checked_at = now() where step_key = any($1)",
        [c.key for c in checks],
    )

    ready = all(line["status"] == "done" for line in lines if line["for_ready"])
    live = ready and all(line["status"] == "done" for line in lines)
    if ready and await conn.fetchval("select record_own_stage('ready')"):
        await _event(conn, "", "ready", actor, by_alyr)
    if live and await conn.fetchval("select record_own_stage('live')"):
        await _event(conn, "", "live", actor, by_alyr)
    shop = await conn.fetchrow(f"select ready_at, live_at from tenants where id = {_SCOPE}")
    if shop["live_at"]:
        stage = "live"
    else:
        stage = "ready" if ready else "setting_up"
    return {
        "stage": stage,
        "ready_at": _iso(shop["ready_at"]),
        "live_at": _iso(shop["live_at"]),
        "checks": lines,
        "left": [line["key"] for line in lines if line["status"] != "done"],
    }


async def _step(conn: asyncpg.Connection, key: str):
    if key not in CHECK_BY_KEY:
        raise LookupError("no such step")
    await conn.execute(
        "insert into onboarding_steps (step_key) values ($1) on conflict do nothing", key
    )
    return await conn.fetchrow(
        "select owner, blocker, choice from onboarding_steps where step_key = $1 for update", key
    )


async def set_owner(
    conn: asyncpg.Connection, key: str, owner: str, actor: str, by_alyr: bool
) -> bool:
    """Hand a step to ALYR, or back to the client. Answers whether anything changed."""
    if owner not in OWNERS:
        raise ReadinessError("a step is owned by the client or by ALYR")
    row = await _step(conn, key)
    if row["owner"] == owner:
        return False
    await conn.execute(
        "update onboarding_steps set owner = $2, updated_at = now(), updated_by = $3 "
        "where step_key = $1",
        key, owner, actor,
    )
    await _event(conn, key, "owner", actor, by_alyr, {"from": row["owner"], "to": owner})
    return True


async def set_choice(
    conn: asyncpg.Connection, key: str, choice: str, actor: str, by_alyr: bool
) -> bool:
    """Record how the business wants to do a step that has choices (WhatsApp, payments)."""
    check = CHECK_BY_KEY.get(key)
    if check is None:
        raise LookupError("no such step")
    if choice not in check.choices:
        raise ReadinessError(f"choose one of: {', '.join(check.choices)}")
    row = await _step(conn, key)
    if row["choice"] == choice:
        return False
    await conn.execute(
        "update onboarding_steps set choice = $2, updated_at = now(), updated_by = $3 "
        "where step_key = $1",
        key, choice, actor,
    )
    await _event(conn, key, "choice", actor, by_alyr, {"from": row["choice"], "to": choice})
    return True


async def set_blocker(conn: asyncpg.Connection, key: str, blocker: str, actor: str) -> bool:
    """ALYR writes (or clears) what is holding a step up. Only the back office does this."""
    blocker = blocker.strip()[:500]
    row = await _step(conn, key)
    if row["blocker"] == blocker:
        return False
    await conn.execute(
        "update onboarding_steps set blocker = $2, updated_at = now(), updated_by = $3 "
        "where step_key = $1",
        key, blocker, actor,
    )
    await _event(
        conn, key, "blocked" if blocker else "unblocked", actor, True,
        {"blocker": blocker} if blocker else {},
    )
    return True


async def handed_over(conn: asyncpg.Connection, setup_step: str, actor: str) -> None:
    """The owner asked ALYR to do a workspace setup step: ALYR owns its readiness step."""
    key = SETUP_STEP.get(setup_step)
    if key is not None:
        await set_owner(conn, key, "alyr", actor, False)


# ── the back office's board ───────────────────────────────

# How long a business may sit without progress before the board calls it stuck.
STUCK_HOURS = 48


def board_row(row: asyncpg.Record, now: datetime) -> dict:
    """One business on the onboarding board, from `admin_onboarding()`: the last state the
    check saw. Needs no connection to the business."""
    steps = row["steps"] or []
    left = [s for s in steps if not s["done_at"]]
    for_ready = {c.key for c in CHECKS if c.for_ready}
    if row["live_at"]:
        stage = "live"
    elif steps and all(s["done_at"] for s in steps if s["key"] in for_ready):
        stage = "ready"
    else:
        stage = "setting_up"
    since = row["live_at"] or row["ready_at"] or row["created_at"]
    moved = max(filter(None, [row["last_event_at"], row["created_at"]]))
    hours_still = (now - moved).total_seconds() / 3600
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "slug": row["slug"],
        "client_id": str(row["client_id"]) if row["client_id"] else None,
        "type": row["business_type"],
        "way": row["onboarding_way"],
        "stage": stage,
        "created_at": _iso(row["created_at"]),
        "ready_at": _iso(row["ready_at"]),
        "live_at": _iso(row["live_at"]),
        "days_in_stage": int((now - since).total_seconds() // 86400),
        "checked": bool(steps),
        "left": [s["key"] for s in left],
        "alyr_owes": [s["key"] for s in left if s["owner"] == "alyr"],
        "blockers": {s["key"]: s["blocker"] for s in steps if s["blocker"]},
        "choices": {s["key"]: s["choice"] for s in steps if s["choice"]},
        "stuck": stage != "live" and hours_still >= STUCK_HOURS,
        "helped": row["helped"],
    }
