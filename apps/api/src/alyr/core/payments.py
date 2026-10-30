"""Payment links on the shop's own payment account (ALY-17, specs/033-payment-adapters).

A shop connects an account at a provider in its own name (D-044: ALYR never holds money). From
then on its payment links are made on that account: the row is written with the module's
transaction, and a job asks the provider for its payment page. The provider's webhook is
checked with the shop's own keys and recorded once; a second job then asks the provider what
happened, and only its answer marks a payment paid. Every call to a provider is a job, never
part of a request.

A shop with no connected account gets the stand-in, exactly as before.
"""

import logging
from uuid import UUID, uuid4

import asyncpg

from alyr.core import jobs, payment_keys
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.gateways.base import BadKeys, Gateway, Payment

log = logging.getLogger("alyr.payments")

CHECK = "payments.check_account"
CHECKOUT = "payments.checkout"
SYNC = "payments.sync"

# What an account's `problem` can say.
BAD_KEYS = "bad_keys"
UNAVAILABLE = "unavailable"
KEYS_UNREADABLE = "keys_unreadable"


class Invalid(Exception):
    """A connect request the API refuses: an unknown provider or a missing field."""


class NotSetUp(Exception):
    """This server has no key to seal payment keys with."""


class Refused(Exception):
    """A webhook that is not from the provider, or for no account we know."""


class NotYet(Exception):
    """The provider still says pending. The job is tried again later."""


async def request(
    conn: asyncpg.Connection, contact_id: UUID, amount: int, order_id: UUID | None = None
) -> UUID:
    """Record a payment request and return its ID. On a shop with a connected account the
    provider's payment page is asked for by a job, in this same transaction."""
    account = await conn.fetchrow(
        "select id, provider from payment_accounts where status = 'connected'"
    )
    if account is None:
        return await conn.fetchval(
            "insert into payment_requests (contact_id, amount, order_id) values ($1, $2, $3) "
            "returning id",
            contact_id, amount, order_id,
        )
    payment_id = await conn.fetchval(
        "insert into payment_requests (contact_id, amount, order_id, provider, account_id) "
        "values ($1, $2, $3, $4, $5) returning id",
        contact_id, amount, order_id, account["provider"], account["id"],
    )
    await jobs.enqueue(conn, CHECKOUT, {"payment_id": str(payment_id)})
    return payment_id


def present(row: asyncpg.Record | None, webhook_url: str) -> dict | None:
    """An account as the workspace sees it. Never the keys."""
    if row is None:
        return None
    return {
        "id": str(row["id"]), "provider": row["provider"], "status": row["status"],
        "problem": row["problem"] or None, "key_hint": row["key_hint"],
        "webhook_url": webhook_url, "created_by": row["created_by"],
        "connected_at": row["connected_at"].isoformat() if row["connected_at"] else None,
    }


ACCOUNT_COLUMNS = "id, provider, status, problem, key_hint, created_by, connected_at"


class Payments:
    def __init__(
        self, db: Database, outbound: Outbound, gateways: dict[str, Gateway], web_url: str
    ) -> None:
        self.db = db
        self.outbound = outbound
        self.gateways = gateways
        self.web_url = web_url

    def register(self, runner: jobs.JobRunner) -> None:
        runner.register(CHECK, self.check_account, self.check_gave_up)
        runner.register(CHECKOUT, self.checkout, self.checkout_gave_up)
        runner.register(SYNC, self.sync)

    def webhook_url(self, tenant_id: UUID, account_id: UUID | str) -> str:
        # Through the web address, which forwards /api to the API, as every customer page does.
        return f"{self.web_url}/api/payments/hooks/{tenant_id}/{account_id}"

    def providers(self) -> list[dict]:
        return [
            {
                "name": g.name, "title": g.title,
                "fields": [
                    {"key": f.key, "label_en": f.label_en, "label_ar": f.label_ar,
                     "secret": f.secret}
                    for f in g.fields
                ],
            }
            for g in self.gateways.values()
        ]

    # The workspace: owners and admins (routes/payments.py checks who).

    async def account(self, conn: asyncpg.Connection, tenant_id: UUID) -> dict | None:
        row = await conn.fetchrow(
            f"select {ACCOUNT_COLUMNS} from payment_accounts where status <> 'disconnected' "
            "order by created_at desc limit 1"
        )
        return present(row, self.webhook_url(tenant_id, row["id"])) if row else None

    async def connect(
        self, conn: asyncpg.Connection, tenant_id: UUID, provider: str,
        keys: dict[str, str], by: str,
    ) -> dict:
        """Seal the keys, replace any account the shop had, and ask a job to check them."""
        gateway = self.gateways.get(provider)
        if gateway is None:
            raise Invalid("unknown_provider")
        wanted = {f.key: str(keys.get(f.key) or "").strip() for f in gateway.fields}
        if not all(wanted.values()):
            raise Invalid("missing_field")
        if not payment_keys.ready():
            raise NotSetUp()
        await self.disconnect(conn)
        account_id = uuid4()
        first_secret = next((f.key for f in gateway.fields if f.secret), gateway.fields[0].key)
        await conn.execute(
            "insert into payment_accounts (id, provider, sealed_keys, key_hint, created_by) "
            "values ($1, $2, $3, $4, $5)",
            account_id, provider, payment_keys.seal(tenant_id, account_id, wanted),
            payment_keys.hint(wanted[first_secret]), by,
        )
        await jobs.enqueue(conn, CHECK, {"account_id": str(account_id)})
        return await self.account(conn, tenant_id)

    async def disconnect(self, conn: asyncpg.Connection) -> bool:
        """The keys are wiped, not kept. New links go back to the stand-in."""
        done = await conn.fetch(
            "update payment_accounts set status = 'disconnected', sealed_keys = null, "
            "disconnected_at = now() where status <> 'disconnected' returning id"
        )
        return bool(done)

    # Jobs. Each reads what it needs, calls the provider outside any transaction, then writes.

    async def _keys(
        self, tenant_id: UUID, account_id: UUID
    ) -> tuple[Gateway, dict[str, str]] | None:
        async with self.db.tenant(tenant_id) as conn:
            row = await conn.fetchrow(
                "select provider, sealed_keys from payment_accounts where id = $1", account_id
            )
        if row is None or row["sealed_keys"] is None or row["provider"] not in self.gateways:
            return None
        try:
            keys = payment_keys.unseal(tenant_id, account_id, row["sealed_keys"])
        except (payment_keys.KeysUnreadable, payment_keys.KeysKeyMissing):
            # The sealing key changed or is gone: the account stops taking links and the
            # owner sees that it must be connected again.
            log.warning("payment account %s: its keys do not open", account_id)
            async with self.db.tenant(tenant_id) as conn:
                await conn.execute(
                    "update payment_accounts set status = 'failed', problem = $2, "
                    "checked_at = now() where id = $1 and status in ('checking', 'connected')",
                    account_id, KEYS_UNREADABLE,
                )
            return None
        return self.gateways[row["provider"]], keys

    async def check_account(self, tenant_id: UUID, payload: dict) -> None:
        account_id = UUID(payload["account_id"])
        found = await self._keys(tenant_id, account_id)
        if found is None:
            return  # disconnected or replaced since
        gateway, keys = found
        try:
            await gateway.check(keys)
        except BadKeys:
            await self._checked(tenant_id, account_id, "failed", BAD_KEYS)
            return
        # Unavailable propagates: the job is tried again, and `check_gave_up` ends it.
        await self._checked(tenant_id, account_id, "connected", "")

    async def check_gave_up(self, tenant_id: UUID, payload: dict) -> None:
        await self._checked(tenant_id, UUID(payload["account_id"]), "failed", UNAVAILABLE)

    async def _checked(
        self, tenant_id: UUID, account_id: UUID, status: str, problem: str
    ) -> None:
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute(
                "update payment_accounts set status = $2, problem = $3, checked_at = now(), "
                "connected_at = case when $2 = 'connected' then now() end "
                "where id = $1 and status = 'checking'",
                account_id, status, problem,
            )

    async def checkout(self, tenant_id: UUID, payload: dict) -> None:
        payment_id = UUID(payload["payment_id"])
        async with self.db.tenant(tenant_id) as conn:
            row = await conn.fetchrow(
                "select p.account_id, p.amount, p.status, p.checkout_url, o.number, t.name "
                "from payment_requests p join tenants t on t.id = p.tenant_id "
                "left join orders o on o.id = p.order_id where p.id = $1",
                payment_id,
            )
        if row is None or row["status"] != "pending" or row["checkout_url"]:
            return
        found = await self._keys(tenant_id, row["account_id"])
        if found is None:
            await self._note(tenant_id, payment_id, "no_account")
            return
        gateway, keys = found
        payment = Payment(
            payment_id, row["amount"],
            f"{row['name']} order {row['number']}" if row["number"] else row["name"],
            f"{self.web_url}/pay/{tenant_id}/{payment_id}",
            self.webhook_url(tenant_id, row["account_id"]),
        )
        try:
            made = await gateway.create_checkout(keys, payment)
        except BadKeys:
            # The provider no longer takes these keys: the owner is shown "wrong keys".
            async with self.db.tenant(tenant_id) as conn:
                await conn.execute(
                    "update payment_accounts set status = 'failed', problem = $2, "
                    "checked_at = now() where id = $1 and status = 'connected'",
                    row["account_id"], BAD_KEYS,
                )
            await self._note(tenant_id, payment_id, "checkout_failed")
            return
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute(
                "update payment_requests set provider_ref = $2, checkout_url = $3 "
                "where id = $1 and checkout_url is null",
                payment_id, made.ref, made.url,
            )

    async def checkout_gave_up(self, tenant_id: UUID, payload: dict) -> None:
        await self._note(tenant_id, UUID(payload["payment_id"]), "checkout_failed")

    async def _note(self, tenant_id: UUID, payment_id: UUID, note: str) -> None:
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute(
                "update payment_requests set gateway_status = $2 where id = $1",
                payment_id, note,
            )

    async def receive(
        self, tenant_id: UUID, account_id: UUID, headers: dict[str, str], body: bytes
    ) -> str:
        """A provider's webhook. `accepted`, `duplicate` (seen before) or `ignored` (about no
        payment of ours); raises `Refused` when it is not from the provider."""
        async with self.db.tenant(tenant_id) as conn:
            row = await conn.fetchrow(
                "select provider, sealed_keys from payment_accounts where id = $1", account_id
            )
            if row is None or row["sealed_keys"] is None or row["provider"] not in self.gateways:
                raise Refused()
            try:
                keys = payment_keys.unseal(tenant_id, account_id, row["sealed_keys"])
            except (payment_keys.KeysUnreadable, payment_keys.KeysKeyMissing):
                raise Refused() from None
            event = self.gateways[row["provider"]].read_webhook(keys, headers, body)
            if event is None:
                raise Refused()
            payment_id = await conn.fetchval(
                "select id from payment_requests where account_id = $1 and provider_ref = $2",
                account_id, event.ref,
            )
            new = await conn.fetchval(
                "insert into payment_events (account_id, event_id, provider_ref, payment_id) "
                "values ($1, $2, $3, $4) on conflict (account_id, event_id) do nothing "
                "returning id",
                account_id, event.event_id[:200], event.ref[:200], payment_id,
            )
            if new is None:
                return "duplicate"
            if payment_id is None:
                return "ignored"
            await jobs.enqueue(conn, SYNC, {"payment_id": str(payment_id)})
            return "accepted"

    async def sync(self, tenant_id: UUID, payload: dict) -> None:
        """Ask the provider what happened, and only then mark the payment paid."""
        from alyr.modules.ledger import (
            service as ledger,  # the ledger reads core, so not at the top
        )

        payment_id = UUID(payload["payment_id"])
        async with self.db.tenant(tenant_id) as conn:
            row = await conn.fetchrow(
                "select account_id, provider_ref, amount, status from payment_requests "
                "where id = $1", payment_id,
            )
        if row is None or row["status"] == "paid" or not row["provider_ref"]:
            return
        found = await self._keys(tenant_id, row["account_id"])
        if found is None:
            await self._note(tenant_id, payment_id, "no_account")
            return
        gateway, keys = found
        try:
            said = await gateway.status(keys, row["provider_ref"])
        except BadKeys:
            await self._note(tenant_id, payment_id, "no_account")
            return
        if said.state == "pending":
            raise NotYet("the provider still says pending")
        if said.state == "failed":
            await self._note(tenant_id, payment_id, "failed")
            return
        if said.amount != row["amount"]:
            # Never marked paid for an amount we did not ask for; the back office looks.
            log.warning("payment %s: the provider reports another amount", payment_id)
            await self._note(tenant_id, payment_id, "amount_mismatch")
            return
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute(
                "update payment_requests set gateway_status = '' where id = $1", payment_id
            )
            await ledger.complete_payment(conn, payment_id, self.outbound)

