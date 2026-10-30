"""The activation job: a payment turns a signed-up business into a working workspace (ALY-213,
decision D-100, spec 041).

When a client's payments cover what is due (staff recorded a transfer, Paddle's webhook recorded a
card payment) or staff waive the payment, `after_payment` makes the client's one `activations` row
and queues a job in the same transaction. The job then, in this order:

1. **plan**: checks the plan is active (`subscription.refresh`);
2. **modules**: switches on the modules of the products on the accepted quote, for each business
   the quote has a line for. Nothing is ever switched off, and a module someone switched off by
   hand stays off;
3. **setup**: gives each business the starting setup its type comes with where it has none (its
   services and hours, its Catalog's settings), and never touches what is there;
4. **steps**: runs the readiness check, which writes each business's onboarding steps, and gives
   the steps ALYR does for an assisted business to ALYR;
5. **email**: tells the owner their workspace is ready: what is left, who does each part, and a
   sign-in link that works once and expires.

Every step can be run again and leaves the same result, so a retry from the back office, a job that
failed halfway, or two payments recorded for one client, never do anything twice. One activation
per client: the second payment finds the first one's row. A client that is already live is never
activated (it has been through all this), and the worker's sweep catches a payment no other path
reported.

An error that retrying cannot fix (email is not set up, nobody to write to) is recorded on the
activation and shown in the back office at once, with a Retry button; a Resend hiccup is retried
by the job queue with backoff first, then recorded the same way.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr import catalog, presets, shop_templates
from alyr.config import get_settings
from alyr.core import access, auth, jobs, mail, readiness, subscription
from alyr.db import Database
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import template

log = logging.getLogger("alyr.activation")

JOB = "activation"
STEPS = ("plan", "modules", "setup", "steps", "email")
TRIGGERS = ("payment", "card", "waived", "sweep")
# How long the sign-in link in the email works (D-101). After that the owner signs in with a code.
LINK_HOURS = 24
# The job queue tries a Resend hiccup again this many times (5 seconds doubling) before the
# activation is shown as failed for staff to retry.
ATTEMPTS = 8
ACTOR = "ALYR activation"
# The steps ALYR does for a business it sets up with the owner (the `assisted` way, D-049); every
# other step is the owner's. One place to change it.
ALYR_STEPS = {"assisted": ("content", "hours", "payments", "whatsapp")}
# How many of what is left the email names.
SHOWN = 3


class ActivationError(Exception):
    """A step failed in a way running it again will not fix until someone acts; the message is
    safe to show staff."""

    def __init__(self, step: str, message: str) -> None:
        super().__init__(message)
        self.step = step


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@asynccontextmanager
async def _in(conn: asyncpg.Connection, business_id: UUID) -> AsyncIterator[asyncpg.Connection]:
    """The back-office connection also scoped to one business for a moment, as
    `routes/admin._in_business` does, so its own rows can be read and a job queued for it."""
    before = await conn.fetchval("select current_setting('app.tenant_id', true)")
    await conn.execute("select set_config('app.tenant_id', $1, true)", str(business_id))
    yield conn
    await conn.execute("select set_config('app.tenant_id', $1, true)", before or "")


async def _owner(
    conn: asyncpg.Connection, business_id: UUID, prefer: UUID | None
) -> asyncpg.Record | None:
    """The owner who is written to: the one who accepted the price if they still own the
    business, else its longest-standing owner."""
    async with _in(conn, business_id):
        return await conn.fetchrow(
            "select u.id, u.name, u.email from memberships m join users u on u.id = m.user_id "
            "where m.role = 'owner' order by (u.id = $1) desc, m.created_at limit 1",
            prefer,
        )


async def _queue(conn: asyncpg.Connection, business_id: UUID, activation_id: UUID) -> None:
    async with _in(conn, business_id):
        await jobs.enqueue(
            conn, JOB, {"activation_id": str(activation_id)}, max_attempts=ATTEMPTS
        )


# ── when a payment is recorded ──────────────────────────────


async def after_payment(
    conn: asyncpg.Connection, client_id: UUID, trigger: str, by: str = ""
) -> UUID | None:
    """The seam every path that records a payment or a waiver calls, in the same transaction
    (back-office connection). Makes the client's activation and queues its job when the payments
    now cover what is due, the client has none yet, and none of its businesses is live. Answers
    the activation's ID when it queued one: the second payment, the same payment recorded twice,
    or a payment on top of a live business answers None."""
    if trigger not in TRIGGERS or not await access.paid_up(conn, client_id):
        return None
    if await conn.fetchval(
        "select true from tenants where client_id = $1 and live_at is not null limit 1", client_id
    ):
        return None
    business = await conn.fetchval(
        "select id from tenants where client_id = $1 order by created_at limit 1", client_id
    )
    if business is None:
        return None
    quote = await access.accepted(conn, client_id)
    owner = await _owner(conn, business, quote["accepted_by"] if quote else None)
    activation_id = await conn.fetchval(
        "insert into activations (client_id, quote_id, business_id, user_id, trigger, "
        "recorded_by) values ($1, $2, $3, $4, $5, $6) on conflict (client_id) do nothing "
        "returning id",
        client_id, quote["id"] if quote else None, business, owner["id"] if owner else None,
        trigger, by[:120],
    )
    if activation_id is None:
        return None
    await _queue(conn, business, activation_id)
    return activation_id


async def sweep(db: Database) -> int:
    """Activate the clients whose payment no path reported (a way of recording payments added
    later, a restore): paid up, nothing made for them, none of their businesses live, and a payment
    or waiver recorded since this feature began, so an old payment is never emailed about. Answers
    how many it queued. The worker runs it every minute."""
    async with access.office(db) as conn:
        since = await conn.fetchval(
            "select value from platform_settings where key = 'activation_since'"
        )
        if not since:
            return 0
        since = datetime.fromisoformat(since.replace("Z", "+00:00"))
        found = [
            r["id"] for r in await conn.fetch(
                "select c.id from clients c where not exists "
                "(select 1 from activations a where a.client_id = c.id) "
                "and (c.payment_waived_at >= $1::timestamptz or exists (select 1 from "
                "client_payments p where p.client_id = c.id and p.recorded_at >= $1::timestamptz))",
                since,
            )
        ]
    queued = 0
    for client_id in found:
        try:
            async with access.office(db) as conn:
                queued += bool(await after_payment(conn, client_id, "sweep", "worker"))
        except Exception:  # one client's trouble never stops the others
            log.exception("could not activate a client")
    return queued


# ── the back office ─────────────────────────────────────────


def _view(row: asyncpg.Record) -> dict:
    steps = row["steps"] or {}
    failed = next((k for k in STEPS if k in steps and not steps[k].get("ok")), "")
    link = None
    if row["link_expires_at"] is not None:
        if row["link_used_at"] is not None:
            link = "used"
        else:
            link = "waiting" if row["link_expires_at"] > datetime.now(UTC) else "expired"
    return {
        "id": str(row["id"]), "client_id": str(row["client_id"]), "client": row["client"],
        "business": row["business"] or "", "trigger": row["trigger"], "status": row["status"],
        "attempts": row["attempts"], "error": row["error"], "failed_step": failed,
        "steps": [
            {"key": k, "state": "ok" if steps[k].get("ok") else "failed", "note": steps[k]["note"],
             "at": steps[k]["at"]}
            if k in steps else {"key": k, "state": "waiting", "note": "", "at": None}
            for k in STEPS
        ],
        "emailed_at": row["emailed_at"].isoformat() if row["emailed_at"] else None,
        "sent_to": row["sent_to"], "link": link,
        "link_expires_at": row["link_expires_at"].isoformat() if row["link_expires_at"] else None,
        "recorded_by": row["recorded_by"],
        "created_at": row["created_at"].isoformat(),
        "finished_at": row["finished_at"].isoformat() if row["finished_at"] else None,
    }


async def listing(conn: asyncpg.Connection) -> list[dict]:
    """Every activation, newest first, with where each step got to. Back office only."""
    rows = await conn.fetch(
        "select a.*, c.name as client, t.name as business, l.used_at as link_used_at, "
        "l.expires_at as link_expires_at from activations a "
        "join clients c on c.id = a.client_id left join tenants t on t.id = a.business_id "
        "left join lateral (select used_at, expires_at from signin_links "
        "  where activation_id = a.id order by created_at desc limit 1) l on true "
        "order by a.created_at desc limit 200"
    )
    return [_view(r) for r in rows]


async def retry(conn: asyncpg.Connection, activation_id: UUID, resend: bool = False) -> bool:
    """Run a failed activation again, from the start: its steps are safe to repeat. With `resend`
    a finished one runs again too and the email is sent a second time, with a new link that ends
    the old one. Answers whether anything was queued; a queued one is not queued twice. Back
    office only."""
    business = await conn.fetchval(
        "update activations set status = 'queued', error = '', finished_at = null, "
        "updated_at = now(), emailed_at = case when $2 then null else emailed_at end "
        "where id = $1 and (status = 'failed' or ($2 and status = 'done')) "
        "returning business_id",
        activation_id, resend,
    )
    if business is None:
        return False
    await _queue(conn, business, activation_id)
    return True


# ── the job ─────────────────────────────────────────────────


def modules_of_quote(lines: list[dict], applies: dict[str, str]) -> dict[UUID, set[str]]:
    """The modules each business needs for the products on its quote lines. `applies` is the
    price list's rule by item key; a line ALYR wrote by hand, one for the whole client, and a
    product that is only included, switch nothing on."""
    out: dict[UUID, set[str]] = {}
    for line in lines:
        if line["business_id"] is None:
            continue
        kind, _, key = applies.get(line["item_key"] or "", "").partition(":")
        product = catalog.PRODUCT_BY_KEY.get(key) if kind == "product" else None
        if product is not None and product.status == "available":
            out.setdefault(line["business_id"], set()).update(product.modules)
    return out


def who_does(check: dict) -> str:
    """"alyr" when ALYR does this step for the business (it owns it, or the owner has done their
    part and it waits on ALYR), else "you". `check` is a line of the readiness check."""
    return "alyr" if check["owner"] == "alyr" or check["status"] == "waiting" else "you"


class Activation:
    """Runs the activation jobs."""

    def __init__(self, db: Database) -> None:
        self._db = db

    def register(self, runner: jobs.JobRunner) -> None:
        runner.register(JOB, self.run, self.gave_up)

    async def run(self, _tenant_id: UUID, payload: dict) -> None:
        activation_id = UUID(payload["activation_id"])
        async with access.office(self._db) as conn:
            row = await conn.fetchrow(
                "select * from activations where id = $1 for update", activation_id
            )
            if row is None or row["status"] == "done":
                return  # a second job for a finished activation has nothing to do
            await conn.execute(
                "update activations set attempts = attempts + 1, updated_at = now() "
                "where id = $1", activation_id,
            )
        try:
            await self._run_steps(row)
        except ActivationError as error:
            await self._fail(activation_id, error.step, str(error))
        except Exception as error:  # a hiccup: the queue tries again, staff see why meanwhile
            await self._note(activation_id, f"{type(error).__name__}: {error}")
            raise

    async def gave_up(self, tenant_id: UUID, payload: dict) -> None:
        """The queue gave up on the job: say so where staff see it, with its last error."""
        activation_id = UUID(payload["activation_id"])
        async with self._db.tenant(tenant_id) as conn:
            why = await conn.fetchval(
                f"select last_error from jobs where {jobs.THIS_SHOP} and kind = $1 "
                "and payload->>'activation_id' = $2 order by created_at desc limit 1",
                JOB, str(activation_id),
            )
        await self._fail(activation_id, "", f"gave up after {ATTEMPTS} tries: {why or 'unknown'}")

    async def _run_steps(self, row: asyncpg.Record) -> None:
        activation_id, client_id = row["id"], row["client_id"]
        async with access.office(self._db) as conn:
            if not await access.paid_up(conn, client_id):
                raise ActivationError("plan", "the payments do not cover what is due")
            plan = await subscription.refresh(conn, client_id)
            if plan["state"] != "active":
                raise ActivationError("plan", f"the plan is {plan['state']}, not active")
            quote = await access.accepted(conn, client_id)
            lines = await conn.fetch(
                "select business_id, item_key from quote_lines where quote_id = $1",
                quote["id"],
            ) if quote else []
            applies = {r["key"]: r["applies"] for r in await conn.fetch(
                "select key, applies from price_items")}
            businesses = [r["id"] for r in await conn.fetch(
                "select id from tenants where client_id = $1 order by created_at", client_id)]
        await self._ok(activation_id, "plan",
                       f"plan active, price {quote['number']} accepted" if quote else
                       "plan active, payment waived")

        wanted = modules_of_quote([dict(r) for r in lines], applies)
        switched = {}
        for business in businesses:
            switched[business] = await self._modules(business, wanted.get(business, set()))
        await self._ok(activation_id, "modules", _count(
            sum(len(v) for v in switched.values()), "module switched on", "modules switched on",
            "all the quote's modules were already on"))

        seeded = [await self._setup(business) for business in businesses]
        await self._ok(activation_id, "setup", _count(
            sum(len(s) for s in seeded), "starting item added", "starting items added",
            "the starting setup was already in place"))

        target = row["business_id"]
        checks: list[dict] = []
        owned: list[str] = []
        for business in businesses:
            there, mine = await self._onboarding(business)
            if business == target:
                checks = there
            owned += mine
        await self._ok(activation_id, "steps", _count(
            len(checks), "step to do", "steps to do", "no step left") + (
            f"; ALYR owns {', '.join(owned)}" if owned else ""))

        await self._email(row, checks)

        async with access.office(self._db) as conn:
            await conn.execute(
                "update activations set status = 'done', error = '', finished_at = now(), "
                "updated_at = now(), quote_id = $2 where id = $1",
                activation_id, quote["id"] if quote else None,
            )

    # Each step below can run again and leaves the same result.

    async def _modules(self, business: UUID, modules: set[str]) -> list[str]:
        """Switch on the modules the quote pays for that the business does not have. A row that
        exists, on or off, is left alone: off was somebody's choice."""
        async with self._db.tenant(business) as conn:
            return [
                module for module in sorted(modules)
                if await conn.fetchval(
                    "insert into tenant_modules (module_key, enabled, enabled_at, enabled_by) "
                    "values ($1, true, now(), $2) on conflict (tenant_id, module_key) do nothing "
                    "returning true",
                    module, ACTOR,
                )
            ]

    async def _setup(self, business: UUID) -> list[str]:
        """The starting setup of the business's type where it has none: its services and hours
        when it takes bookings, its Catalog's settings and categories when the Catalog is on
        (no sample items: a business made here has its own). Answers what it added."""
        added: list[str] = []
        async with self._db.tenant(business) as conn:
            kind = await conn.fetchval(
                "select business_type from tenants "
                "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
            )
            on = {r["module_key"] for r in await conn.fetch(
                "select module_key from tenant_modules where enabled")}
            preset = presets.PRESET_BY_KEY.get(kind or "")
            if preset is not None and "bookings" in on:
                if not await conn.fetchval("select exists (select 1 from services)"):
                    for sort, s in enumerate(preset.services):
                        await conn.execute(
                            "insert into services (name, name_ar, duration_minutes, price, sort) "
                            "values ($1, $2, $3, $4, $5)", s.name, s.name_ar, s.minutes, s.price,
                            sort,
                        )
                    added.append("services")
                if not await conn.fetchval("select exists (select 1 from business_hours)"):
                    for weekday, opens, closes in preset.hours:
                        await conn.execute(
                            "insert into business_hours (weekday, opens, closes) "
                            "values ($1, $2::text::time, $3::text::time)", weekday, opens, closes,
                        )
                    added.append("hours")
            if "catalog" in on and not await conn.fetchval(
                "select exists (select 1 from shop_settings) or exists (select 1 from items)"
            ):
                await template.apply(
                    conn, shop_templates.builtin_for(kind), await shop_clock.load(conn),
                    samples_too=False, by=ACTOR,
                )
                added.append("catalog")
        return added

    async def _onboarding(self, business: UUID) -> tuple[list[dict], list[str]]:
        """Write the business's onboarding steps and who owns them. Answers what is left, in
        order, as the email names it, and the steps given to ALYR. Someone who already chose an
        owner for a step (the client, or staff) is never overruled."""
        async with self._db.tenant(business) as conn:
            way = await conn.fetchval(
                "select onboarding_way from tenants "
                "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
            )
            state = await readiness.run(conn, ACTOR)
            applies = {line["key"] for line in state["checks"]}
            given = []
            for key in ALYR_STEPS.get(way, ()):
                if key in applies and not await conn.fetchval(
                    "select exists (select 1 from onboarding_events where step_key = $1 "
                    "and event = 'owner')", key,
                ):
                    if await readiness.set_owner(conn, key, "alyr", ACTOR, False):
                        given.append(key)
            if given:
                state = await readiness.run(conn, ACTOR)
        left = [
            {"key": line["key"], "label": line["label"], "todo": line["todo"],
             "who": who_does(line)}
            for line in state["checks"] if line["status"] != "done"
        ]
        return left, given

    async def _email(self, row: asyncpg.Record, checks: list[dict]) -> None:
        activation_id, business = row["id"], row["business_id"]
        if row["emailed_at"] is not None:
            await self._ok(activation_id, "email", "already sent")
            return
        async with access.office(self._db) as conn:
            quote = await access.accepted(conn, row["client_id"])
            owner = await _owner(conn, business, quote["accepted_by"] if quote else row["user_id"])
            async with _in(conn, business):
                shop = await conn.fetchrow(
                    "select name, name_ar, owner_lang from tenants "
                    "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
                )
        if owner is None:
            raise ActivationError("email", "the business has no owner to write to")
        if not mail.deliverable(owner["email"]):
            await self._ok(activation_id, "email",
                           "nothing sent: the owner's address is an example address")
            return
        if not mail.configured():
            raise ActivationError(
                "email", "email is not set up on this server (no Resend key), so nothing was sent; "
                "set it and press Retry")
        lang = shop["owner_lang"]
        web = get_settings().public_web_url.rstrip("/")
        async with self._db.unscoped() as conn:
            token = await auth.mint_link(conn, owner["id"], business, activation_id, LINK_HOURS)
        subject, text, html = mail.workspace_ready_message(
            lang, owner["name"], {"en": shop["name"], "ar": shop["name_ar"] or shop["name"]}[lang],
            owner["email"], checks[:SHOWN], f"{web}/login/link#t={token}&l={lang}", f"{web}/login",
            LINK_HOURS,
        )
        # A refusal raises MailError and the job is tried again; a new link ends this one.
        await mail.send(owner["email"], subject, text, html)
        async with access.office(self._db) as conn:
            await conn.execute(
                "update activations set emailed_at = now(), sent_to = $2 where id = $1",
                activation_id, owner["email"],
            )
        await self._ok(activation_id, "email", f"sent, with a link that works once "
                       f"and stops after {LINK_HOURS} hours")

    # What each step writes down for the back office.

    async def _ok(self, activation_id: UUID, step: str, note: str) -> None:
        await self._record(activation_id, step, True, note)

    async def _record(self, activation_id: UUID, step: str, ok: bool, note: str) -> None:
        async with access.office(self._db) as conn:
            await conn.execute(
                "update activations set steps = steps || $2::jsonb, updated_at = now() "
                "where id = $1",
                activation_id, {step: {"ok": ok, "at": _now(), "note": note[:300]}},
            )

    async def _note(self, activation_id: UUID, error: str) -> None:
        """A hiccup the queue will try again: show it, leave the activation queued."""
        async with access.office(self._db) as conn:
            await conn.execute(
                "update activations set error = $2, updated_at = now() where id = $1",
                activation_id, f"trying again: {error}"[:500],
            )

    async def _fail(self, activation_id: UUID, step: str, message: str) -> None:
        if step:
            await self._record(activation_id, step, False, message)
        async with access.office(self._db) as conn:
            await conn.execute(
                "update activations set status = 'failed', error = $2, finished_at = now(), "
                "updated_at = now() where id = $1 and status <> 'done'",
                activation_id, message[:500],
            )
        log.warning("activation %s failed at %s", activation_id, step or "the queue")


def _count(n: int, one: str, many: str, none: str) -> str:
    return none if n == 0 else f"{n} {one if n == 1 else many}"
