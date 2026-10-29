"""A client pays ALYR by card, through Paddle (ALY-180, decision D-074, spec 035).

This is ALYR's own billing: the client paying for ALYR's service, never a shop's customer
paying the shop (hard rule 3; that is `core/payments.py`). It sits beside the payments ALYR's
staff record by hand (`core/access.py`): a card payment is one more row in `client_payments`,
so go-live (the readiness check `paid`) needs nothing new.

1. The owner asks to pay by card at go-live. Only a row saying so is written: the owner can
   never choose what is charged.
2. A job, on a back-office connection, reads the accepted quote, works out the setup fee and
   the first period in US cents at the peg, and asks Paddle for a transaction: the setup
   once, the plan every period. Paddle makes the subscription from it when it is paid.
3. The owner pays in Paddle's checkout, on ALYR's billing page.
4. Paddle's webhook is checked for its signature and only queues a job; the job reads the
   transaction back from Paddle and records the payment if what Paddle took is exactly what
   ALYR asked. A different amount is never recorded: the checkout is marked `mismatch` for
   ALYR's staff. Each renewal is recorded the same way, as one more period.
"""

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import Settings
from alyr.core import access, jobs, paddle
from alyr.core.normalise import fmt_qar
from alyr.db import Database

log = logging.getLogger("alyr.card_billing")

CHECKOUT_JOB = "billing.card_checkout"
SYNC_JOB = "billing.card_sync"
# An open checkout is offered again for this long, for the same accepted quote, instead of
# making a new one each time the owner presses Pay.
REUSE_FOR = timedelta(hours=12)
# The events worth reading the transaction or the subscription back for.
TRANSACTION_EVENTS = ("transaction.paid", "transaction.completed")
QATAR = ZoneInfo("Asia/Qatar")


class CardError(Exception):
    """A card payment the owner cannot start; the message is safe to show."""


def view(row: asyncpg.Record | None) -> dict | None:
    """A checkout as the owner's page and the back office read it."""
    if row is None:
        return None
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "problem": row["problem"],
        "provider": row["provider"],
        # The page opens Paddle's checkout for this transaction.
        "transaction": row["provider_ref"] if row["status"] == "open" else None,
        "amount_text": paddle.usd_text(row["charge_amount"]) if row["charge_amount"] else "",
        "covers_text": fmt_qar(row["amount"]) if row["amount"] else "",
        "subscription_status": row["subscription_status"],
        "created_at": row["created_at"].isoformat(),
    }


async def latest(conn: asyncpg.Connection, client_id: UUID | None = None) -> dict | None:
    """The newest checkout of the client in scope (row-level security), or of `client_id` on
    a back-office connection."""
    return view(await conn.fetchrow(
        "select * from card_checkouts where $1::uuid is null or client_id = $1 "
        "order by created_at desc limit 1",
        client_id,
    ))


async def start(conn: asyncpg.Connection, settings: Settings, by: str) -> dict:
    """The owner asks to pay by card. `conn` is the owner's tenant-scoped connection."""
    summary = await access.summary(conn)
    if summary["status"] == "paid":
        raise CardError("nothing is due: your payment is settled")
    if summary["status"] == "no_price":
        raise CardError("accept your price first")
    if summary.get("card") is None:
        raise CardError(
            "card payment is not offered here: pay by bank transfer"
            if summary["paid"] == 0 else "part is paid already: pay the rest by bank transfer"
        )
    client_id = await conn.fetchval("select own_client()")
    first = await access.first_payment(conn, client_id)
    reuse = await conn.fetchrow(
        "select * from card_checkouts where status in ('creating', 'open') "
        "and (quote_id is null or quote_id = $1) "
        "and created_at > now() - make_interval(secs => $2) "
        "order by created_at desc limit 1",
        first["quote_id"], REUSE_FOR.total_seconds(),
    )
    if reuse is not None:
        return view(reuse)
    row = await conn.fetchrow(
        "insert into card_checkouts (client_id, business_id, provider, created_by) "
        "values ($1, nullif(current_setting('app.tenant_id', true), '')::uuid, $2, $3) "
        "returning *",
        client_id, summary["card"]["provider"], by[:120],
    )
    await jobs.enqueue(conn, CHECKOUT_JOB, {"checkout_id": str(row["id"])})
    return view(row)


class CardBilling:
    def __init__(self, db: Database, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    def register(self, runner: jobs.JobRunner) -> None:
        runner.register(CHECKOUT_JOB, self.checkout, self.checkout_gave_up)
        runner.register(SYNC_JOB, self.sync)

    # ── making the checkout ────────────────────────────────

    async def checkout(self, _tenant_id: UUID, payload: dict) -> None:
        checkout_id = UUID(payload["checkout_id"])
        async with _office(self._db) as conn:
            row = await conn.fetchrow(
                "select * from card_checkouts where id = $1 for update", checkout_id
            )
            if row is None or row["status"] != "creating":
                return
            first = await access.first_payment(conn, row["client_id"])
            paid = await conn.fetchval(
                "select coalesce(sum(amount), 0) from client_payments where client_id = $1",
                row["client_id"],
            )
            problem = (
                "no accepted price" if first is None
                else "part is paid already" if paid else ""
            )
            if first is not None and not problem and first["period"] <= 0:
                problem = "the plan has no price per period"
            if problem:
                await _fail(conn, checkout_id, problem)
                return
            setup, period = paddle.usd_cents(first["setup"]), paddle.usd_cents(first["period"])
            await conn.execute(
                "update card_checkouts set quote_id = $2, amount = $3, period_amount = $4, "
                "period_months = $5, charge_amount = $6, period_charge = $7, updated_at = now() "
                "where id = $1",
                checkout_id, first["quote_id"], first["setup"] + first["period"],
                first["period"], first["months"], setup + period, period,
            )
        months = first["months"]
        body = paddle.checkout_body(
            checkout_id=str(checkout_id), setup=setup, period=period, months=months,
            period_name="Plan, every month" if months == 1 else f"Plan, every {months} months",
        )
        try:
            data = await paddle.Paddle(self._settings).create_transaction(body)
        except paddle.Refused as error:
            async with _office(self._db) as conn:
                await _fail(conn, checkout_id, str(error))
            return
        # paddle.Unavailable goes up: the job runner tries again later.
        transaction = str(data.get("id", ""))
        url = str((data.get("checkout") or {}).get("url") or "")
        async with _office(self._db) as conn:
            if not transaction.startswith("txn_"):
                await _fail(conn, checkout_id, "Paddle answered without a transaction")
                return
            await conn.execute(
                "update card_checkouts set status = 'open', provider_ref = $2, "
                "checkout_url = nullif($3, ''), updated_at = now() "
                "where id = $1 and status = 'creating'",
                checkout_id, transaction[:80], url[:500] if url.startswith("https://") else "",
            )

    async def checkout_gave_up(self, _tenant_id: UUID, payload: dict) -> None:
        async with _office(self._db) as conn:
            await conn.execute(
                "update card_checkouts set status = 'failed', problem = 'Paddle could not be "
                "reached', updated_at = now() where id = $1 and status = 'creating'",
                UUID(payload["checkout_id"]),
            )

    # ── Paddle's webhook ───────────────────────────────────

    async def receive(self, body: bytes, signature: str) -> bool:
        """A webhook from Paddle. Raises PermissionError when it is not signed by Paddle.
        Answers whether it was about one of ALYR's checkouts (and a job now reads it back).
        Nothing is trusted from it but the IDs: the job asks Paddle."""
        if not paddle.signed(signature, body, self._settings.paddle_webhook_secret):
            raise PermissionError("not signed by Paddle")
        try:
            event = json.loads(body)
            kind, data = str(event["event_type"]), event["data"]
            ref = str(data["id"])
        except (ValueError, KeyError, TypeError):
            return False
        if kind in TRANSACTION_EVENTS:
            what = "transaction"
        elif kind.startswith("subscription."):
            what = "subscription"
        else:
            return False
        mine = (data.get("custom_data") or {}).get("alyr_checkout")
        subscription = data.get("subscription_id") if what == "transaction" else ref
        async with _office(self._db) as conn:
            row = await conn.fetchrow(
                "select id, business_id from card_checkouts "
                "where id = $1::uuid or provider_ref = $2 or subscription_ref = $3 "
                "order by created_at limit 1",
                _uuid(mine), ref, subscription,
            )
        if row is None:
            log.info("Paddle %s for no checkout of ours", kind)
            return False
        async with self._db.tenant(row["business_id"]) as conn:
            await jobs.enqueue(
                conn, SYNC_JOB, {"checkout_id": str(row["id"]), "kind": what, "ref": ref}
            )
        return True

    # ── reading Paddle back ────────────────────────────────

    async def sync(self, _tenant_id: UUID, payload: dict) -> None:
        checkout_id, ref = UUID(payload["checkout_id"]), payload["ref"]
        api = paddle.Paddle(self._settings)
        if payload["kind"] == "subscription":
            data = await api.subscription(ref)
            ours = (data.get("custom_data") or {}).get("alyr_checkout") == str(checkout_id)
            async with _office(self._db) as conn:
                # Only the subscription made from this checkout, read from Paddle itself.
                await conn.execute(
                    "update card_checkouts set subscription_ref = $2, subscription_status = $3, "
                    "updated_at = now() where id = $1 "
                    "and (subscription_ref = $2 or (subscription_ref is null and $4))",
                    checkout_id, ref, str(data.get("status", ""))[:40], ours,
                )
            return
        data = await api.transaction(ref)
        if data.get("status") not in paddle.PAID:
            return
        async with _office(self._db) as conn:
            row = await conn.fetchrow(
                "select * from card_checkouts where id = $1 for update", checkout_id
            )
            if row is None or row["charge_amount"] is None:
                return
            await self._record(conn, row, data)

    async def _record(self, conn: asyncpg.Connection, row: asyncpg.Record, data: dict) -> None:
        ref = str(data["id"])
        subscription = data.get("subscription_id")
        first = ref == row["provider_ref"]
        if first:
            expected, covers, note = row["charge_amount"], row["amount"], "Setup and first period"
        elif (
            subscription and subscription == (row["subscription_ref"] or subscription)
            and (data.get("custom_data") or {}).get("alyr_checkout") == str(row["id"])
        ):
            expected, covers, note = row["period_charge"], row["period_amount"], "Renewal"
        else:
            log.warning("Paddle transaction does not belong to checkout %s", row["id"])
            return
        totals = (data.get("details") or {}).get("totals") or {}
        subtotal, discount = _int(totals.get("subtotal")), _int(totals.get("discount", "0"))
        taken = _int(totals.get("grand_total") or totals.get("total"))
        currency = data.get("currency_code")
        if (subtotal, discount, currency) != (expected, 0, row["charge_currency"]) or not taken:
            # Never mark paid what does not match: ALYR's staff look at it (/ops).
            await _fail(
                conn, row["id"],
                f"Paddle took {subtotal} {currency} (discount {discount}) on {ref}; "
                f"ALYR asked {expected} {row['charge_currency']}",
                status="mismatch",
            )
            return
        await conn.execute(
            "insert into client_payments (client_id, quote_id, amount, method, reference, "
            "received_on, note, recorded_by, provider, provider_ref, paid_currency, paid_amount) "
            "values ($1, $2, $3, 'card', $4, $5, $6, 'Paddle', 'paddle', $4, $7, $8) "
            "on conflict (provider, provider_ref) where provider_ref is not null do nothing",
            row["client_id"], row["quote_id"], covers, ref[:80], _day(data),
            f"{note}, by card ({paddle.usd_text(taken)} with tax)", currency, taken,
        )
        if first:
            await conn.execute(
                "update card_checkouts set status = 'paid', problem = '', "
                "subscription_ref = coalesce(subscription_ref, $2), updated_at = now() "
                "where id = $1",
                row["id"], subscription,
            )


@asynccontextmanager
async def _office(db: Database) -> AsyncIterator[asyncpg.Connection]:
    """One transaction on which the API declares it is ALYR itself, as `routes/admin.py`
    does for its staff: a client's billing is ALYR's own data, not a shop's."""
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        yield conn


async def _fail(
    conn: asyncpg.Connection, checkout_id: UUID, problem: str, status: str = "failed"
) -> None:
    await conn.execute(
        "update card_checkouts set status = $2, problem = $3, updated_at = now() where id = $1",
        checkout_id, status, problem[:200],
    )


def _uuid(value: object) -> UUID | None:
    try:
        return UUID(str(value))
    except ValueError:
        return None


def _int(value: object) -> int:
    try:
        return int(str(value))
    except ValueError:
        return 0


def _day(data: dict):
    """The day the money was taken, in Qatar."""
    stamp = data.get("billed_at") or data.get("updated_at")
    try:
        moment = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except ValueError:
        moment = datetime.now(UTC)
    return moment.astimezone(QATAR).date()
