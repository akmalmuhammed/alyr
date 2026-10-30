"""The emails that tell a person their account exists (go-live checklist item 23, specs/037).

* **Welcome:** to the owner who has just made a business at /start, in the language they signed
  up in. It says how to sign in again and links back to the setup.
* **Invite:** to someone an owner or admin adds to the team, and to the owner of a business ALYR
  makes in the back office. It says who added them, as what, and how to sign in. We do not know
  which language they read, so it is in both, the shop's own first.

Neither holds a code or a link that signs anyone in: the person signs in at /login with a code,
as always. Both go through the job queue, queued in the transaction that made the account, and
are retried if Resend does not take them. Unlike a sign-in code they hold nothing secret and
are still useful an hour later. A job carries IDs only. The address, the names and the words
are read when it runs, so a person removed from the team in the meantime is not written to.
"""

import logging
from uuid import UUID

import asyncpg

from alyr.config import get_settings
from alyr.core import auth, jobs, mail
from alyr.db import Database

log = logging.getLogger("alyr.welcome")

JOB = "account_email"
WELCOME = "welcome"
INVITE = "invite"


async def queue(
    conn: asyncpg.Connection, letter: str, user_id: UUID, by: UUID | None = None
) -> None:
    """Queue `letter` (WELCOME or INVITE) to a person of the business in scope; `by` is who
    added them, None for ALYR. Nothing is queued while email is off, or for an address that
    cannot be a real person's (the demo shops, tests)."""
    if not mail.configured():
        return
    email = await conn.fetchval("select email from users where id = $1", user_id)
    if email is None or not mail.deliverable(email):
        return
    await jobs.enqueue(
        conn, JOB, {"letter": letter, "user_id": str(user_id), "by": str(by) if by else None}
    )


class AccountMail:
    """Runs the account_email jobs."""

    def __init__(self, db: Database) -> None:
        self._db = db

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        if not mail.configured():
            return
        user_id = UUID(payload["user_id"])
        async with self._db.tenant(tenant_id) as conn:
            person = await conn.fetchrow(
                "select u.email, u.name, m.role from memberships m "
                "join users u on u.id = m.user_id where m.user_id = $1",
                user_id,
            )
            if person is None or not mail.deliverable(person["email"]):
                return  # no longer on the team, or no longer an address to write to
            shop = await conn.fetchrow(
                "select name, name_ar, owner_lang from tenants where id = $1", tenant_id
            )
            by = None
            if payload.get("by"):
                by = await conn.fetchval(
                    "select name from users where id = $1", UUID(payload["by"])
                )
        names = {"en": shop["name"], "ar": shop["name_ar"] or shop["name"]}
        web = get_settings().public_web_url.rstrip("/")
        if payload["letter"] == WELCOME:
            lang = shop["owner_lang"]
            subject, text, html = mail.welcome_message(
                lang, person["name"], names[lang], person["email"], f"{web}/login", f"{web}/start"
            )
        else:
            subject, text, html = mail.invite_message(
                shop["owner_lang"], person["name"], names, person["email"], person["role"],
                by, f"{web}/login", elsewhere=await self._opens_elsewhere(user_id, tenant_id),
            )
        # A refusal raises MailError, and the job is tried again later.
        await mail.send(person["email"], subject, text, html)

    async def _opens_elsewhere(self, user_id: UUID, tenant_id: UUID) -> bool:
        """Whether signing in takes this person to another business (`auth.business_at_sign_in`):
        then the invite says how to switch to this one, from Your account (D-081)."""
        async with self._db.unscoped() as conn, conn.transaction():
            await conn.execute("select set_config('app.user_id', $1, true)", str(user_id))
            opens = await auth.business_at_sign_in(conn, user_id)
        return opens is not None and opens != tenant_id
