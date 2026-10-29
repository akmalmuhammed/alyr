"""A person's own account: the businesses they work for, the email they sign in with, and the
emails that tell them and their owners what changed (go-live items 40 and 41, specs/040, D-081).

* **Businesses.** A person can work for more than one business. `businesses` lists them, and
  `switch` swaps this browser's session for one in another of them: the old session ends, so a
  cookie only ever opens the business the browser shows. The business switched to is kept on
  the person (`users.last_tenant_id`), and signing in opens it again.
* **The sign-in email.** A code goes to the new address, and typing it makes the change. The
  code is an ordinary sign-in code kept under its own key, `change:<person>:<new address>`, so it
  cannot sign anyone in and cannot crowd out the new address's own sign-in codes. The person's
  other sessions end, every business they work for records the change, and the old address is
  told (with the new one shown only in part), so a change nobody asked for is seen at once.
* **The emails.** One job, `account_notice`, sends the note to the old address and the note to
  each owner that the business's data was downloaded (`core/export.py`). A job holds the old
  address, because it is no longer on the person's record; everything else is read when it runs.
"""

import logging
from datetime import UTC, datetime
from html import escape
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr import brand
from alyr.config import get_settings
from alyr.core import auth, jobs, mail, ratelimit, team
from alyr.core.auth import Staff
from alyr.db import Database

log = logging.getLogger("alyr.account")

NOTICE = "account_notice"
EMAIL_CHANGED = "email_changed"
DATA_EXPORTED = "data_exported"
DOHA = ZoneInfo("Asia/Qatar")

# Changes one person may ask for, and codes one address may be sent for a change, in an hour.
CHANGES_PER_PERSON = ratelimit.Limit(5, ratelimit.HOUR)
CODES_TO_ADDRESS = ratelimit.Limit(5, ratelimit.HOUR)

# What a refusal is, for the screen to say in the reader's language; the text is the English.
REFUSALS = {
    "demo": "the open demo has no sign-in email to change",
    "invalid": "that is not an email address",
    "same": "that is already your sign-in email",
    "staff": "ALYR staff change their sign-in email through ALYR",
    "too_many": "too many codes asked for; try again in an hour",
    "code": "that code is wrong or has expired",
    "taken": "that address already signs someone in to ALYR",
}


class AccountError(Exception):
    """A request about the person's own account that was refused. `code` is a key of
    REFUSALS; `retry_after` is set for "too_many"."""

    def __init__(self, code: str, retry_after: int | None = None) -> None:
        super().__init__(REFUSALS[code])
        self.code = code
        self.retry_after = retry_after


# ── businesses ──


async def businesses(db: Database, staff: Staff) -> list[dict]:
    """Every business the person works for, the one open now marked `current`."""
    if staff.user_id is None:
        return []
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.user_id', $1, true)", str(staff.user_id))
        rows = await conn.fetch(
            "select t.id, t.name, t.name_ar, t.slug, m.role from memberships m "
            "join tenants t on t.id = m.tenant_id where m.user_id = $1 "
            "order by lower(t.name), t.id",
            staff.user_id,
        )
    return [
        {
            "id": str(r["id"]), "name": r["name"], "name_ar": r["name_ar"] or "",
            "slug": r["slug"], "role": r["role"], "current": r["id"] == staff.tenant_id,
        }
        for r in rows
    ]


async def switch(db: Database, staff: Staff, token: str, business_id: UUID) -> str:
    """A session in another business the person works for, in place of `token`. Raises
    LookupError when they do not work for it."""
    if staff.user_id is None:
        raise LookupError("no such business")
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.user_id', $1, true)", str(staff.user_id))
        member = await conn.fetchval(
            "select true from memberships where user_id = $1 and tenant_id = $2",
            staff.user_id, business_id,
        )
        if not member:
            raise LookupError("no such business")
        fresh = await auth.create_session(conn, staff.user_id, business_id)
        await conn.execute(
            "update users set last_tenant_id = $2 where id = $1", staff.user_id, business_id
        )
    await auth.sign_out(db, token)
    return fresh


# ── the sign-in email ──


def _key(user_id: UUID, email: str) -> str:
    """Where a change's code is kept in `login_codes`: never an address anyone signs in with."""
    return f"change:{user_id}:{email}"


def _usable(email: str) -> bool:
    """An address with a name, an @ and a dotted domain, no spaces. Outside a developer's
    machine it must also be one ALYR would write to (not an example or test domain)."""
    local, at, domain = email.rpartition("@")
    shaped = bool(local and at and "." in domain.strip(".")) and len(email) <= 200
    shaped = shaped and not any(c.isspace() for c in email)
    return shaped and (get_settings().env == "local" or mail.deliverable(email))


async def _is_alyr_staff(db: Database, email: str) -> bool:
    async with db.unscoped() as conn:
        return bool(
            await conn.fetchval("select true from platform_admins where email = $1", email)
        )


async def request_email_code(db: Database, staff: Staff, email: str) -> tuple[str, str]:
    """A code for changing the person's sign-in email to `email`, and the address to send it
    to. Raises AccountError."""
    if staff.user_id is None:
        raise AccountError("demo")
    new = auth.clean_email(email)
    if not _usable(new):
        raise AccountError("invalid")
    if new == auth.clean_email(staff.email):
        raise AccountError("same")
    if await _is_alyr_staff(db, auth.clean_email(staff.email)):
        raise AccountError("staff")
    try:
        await ratelimit.hit(db, "email-change", str(staff.user_id), CHANGES_PER_PERSON)
        await ratelimit.hit(db, "email-change-to", new, CODES_TO_ADDRESS)
    except ratelimit.TooManyRequests as error:
        raise AccountError("too_many", error.retry_after) from error
    try:
        code = await auth.request_code(db, _key(staff.user_id, new), allow_new=True)
    except auth.TooManyCodes as error:
        raise AccountError("too_many", error.retry_after) from error
    assert code is not None  # allow_new always makes one
    return code, new


async def change_email(db: Database, staff: Staff, token: str, email: str, code: str) -> str:
    """Make `email` the person's sign-in email if `code` is the one sent to it. Ends their
    other sessions, records the change in every business they work for and tells the old
    address. Returns the new address. Raises AccountError."""
    if staff.user_id is None:
        raise AccountError("demo")
    new = auth.clean_email(email)
    if await _is_alyr_staff(db, auth.clean_email(staff.email)):
        raise AccountError("staff")
    try:
        await auth.check_code(db, _key(staff.user_id, new), code)
    except auth.AuthError as error:
        raise AccountError("code") from error
    async with db.unscoped() as conn, conn.transaction():
        old = await conn.fetchval(
            "select email from users where id = $1 for update", staff.user_id
        )
        if await conn.fetchval("select true from users where email = $1", new):
            raise AccountError("taken")
        try:
            await conn.execute("update users set email = $2 where id = $1", staff.user_id, new)
        except asyncpg.UniqueViolationError as error:  # taken a moment ago
            raise AccountError("taken") from error
        await conn.execute(
            "delete from sessions where user_id = $1 and token_hash <> $2",
            staff.user_id, auth.token_hash(token),
        )
        await conn.execute("select set_config('app.user_id', $1, true)", str(staff.user_id))
        shops = [
            r["tenant_id"] for r in await conn.fetch(
                "select tenant_id from memberships where user_id = $1", staff.user_id
            )
        ]
    actor = team.Actor(staff.user_id, staff.name)
    for shop in shops:
        async with db.tenant(shop) as conn:
            await team.record(conn, "team", staff.user_id, "email_changed", actor)
            if shop == staff.tenant_id and mail.configured() and mail.deliverable(old):
                await jobs.enqueue(conn, NOTICE, {
                    "letter": EMAIL_CHANGED, "user_id": str(staff.user_id), "to": old,
                    "new": masked(new),
                })
    log.info("a person changed their sign-in email")
    return new


def masked(email: str) -> str:
    """An address shown in part: `ah••••@gmail.com`."""
    local, _, domain = email.rpartition("@")
    keep = 2 if len(local) > 3 else 1
    return f"{local[:keep]}••••@{domain}"


# ── the emails ──


def _letter(subject: str, en: list[str], ar: list[str]) -> tuple[str, str, str]:
    """Subject, plain text and HTML of a short note in English, then Arabic."""
    text = "\n\n".join(en) + "\n\n" + "\n\n".join(ar)
    e, f = brand.EMAIL, brand.CSS_FONT["email"]
    rows = "".join(
        f'<tr><td style="padding-top:12px;font-size:15px;line-height:1.55">{escape(p)}</td></tr>'
        for p in en
    )
    rows_ar = "".join(
        f'<tr><td dir="rtl" style="padding-top:12px;font-size:15px;line-height:1.7;'
        f'text-align:right">{escape(p)}</td></tr>'
        for p in ar
    )
    html = (
        f'<!doctype html><html><body style="margin:0;background:{e["bg"]};font-family:{f};'
        f'color:{e["text"]}"><table role="presentation" width="100%" cellpadding="0" '
        'cellspacing="0" style="padding:32px 16px"><tr><td align="center">'
        f'<table role="presentation" width="100%" style="max-width:480px;background:{e["panel"]};'
        'border-radius:16px;padding:28px">'
        '<tr><td style="font-weight:700;font-size:15px;letter-spacing:.06em">ALYR</td></tr>'
        f'{rows}<tr><td style="padding-top:20px;border-bottom:1px solid {e["rule"]}"></td></tr>'
        f"{rows_ar}</table></td></tr></table></body></html>"
    )
    return subject, text, html


def change_code_message(code: str, minutes: int) -> tuple[str, str, str]:
    """The code that makes this address someone's sign-in email, in English and Arabic."""
    return _letter(
        f"{code} is your code to change your ALYR sign-in email",
        [
            f"Your code is {code}",
            "Type it in ALYR to make this address the one you sign in with. "
            f"It works once and expires in {minutes} minutes.",
            "If you did not ask for it, ignore this email: nothing changes without the code.",
        ],
        [
            f"رمزك هو {code}",
            "اكتبه في ALYR ليصبح هذا العنوان هو بريد الدخول لديك. "
            f"يعمل مرة واحدة وتنتهي صلاحيته خلال {minutes} دقائق.",
            "إذا لم تطلبه، تجاهل هذه الرسالة: لا يتغير شيء دون الرمز.",
        ],
    )


def email_changed_message(name: str, new: str) -> tuple[str, str, str]:
    """The note to the address a person no longer signs in with."""
    first = name.split()[0] if name.strip() else ""
    return _letter(
        "Your ALYR sign-in email was changed",
        [
            f"Hello {first}," if first else "Hello,",
            f"The email you sign in to ALYR with is now {new}. This address no longer signs "
            "you in, and you were signed out everywhere else.",
            "If you did not do this, reply to this email now and we will lock the account.",
        ],
        [
            f"مرحباً {first}،" if first else "مرحباً،",
            f"أصبح بريد الدخول إلى ALYR لديك هو {new}. لم يعد هذا العنوان يُدخلك، "
            "وتم تسجيل خروجك من الأجهزة الأخرى.",
            "إذا لم تقم بذلك، ردّ على هذه الرسالة الآن وسنقفل الحساب.",
        ],
    )


def _doha(moment: datetime) -> tuple[str, str]:
    at = moment.astimezone(DOHA)
    months_ar = ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس",
                 "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر")
    clock = at.strftime("%H:%M")
    return (
        f"{at.day} {at.strftime('%b')} {at.year} at {clock} Doha time",
        f"{at.day} {months_ar[at.month - 1]} {at.year} الساعة {clock} بتوقيت الدوحة",
    )


def data_exported_message(
    shop: str, shop_ar: str, by: str | None, at: datetime
) -> tuple[str, str, str]:
    """The note to an owner that all of the business's data was downloaded; `by` is None when
    nobody signed in did it (the open demo on a developer's machine)."""
    when, when_ar = _doha(at)
    return _letter(
        f"All of {shop}'s data was downloaded from ALYR",
        [
            f"{by or 'Someone'} downloaded all of {shop}'s data from ALYR on {when}: "
            "customers, messages, orders, documents, the catalog and the rest.",
            "Every owner of the business gets this note. If nobody on your team did this, "
            "reply to this email now.",
        ],
        [
            f"قام {by or 'أحدهم'} بتنزيل كل بيانات {shop_ar} من ALYR في {when_ar}: "
            "العملاء والرسائل والطلبات والمستندات والكتالوج وغيرها.",
            "تصل هذه الرسالة إلى كل مالكي النشاط. إذا لم يقم بذلك أحد من فريقك، "
            "ردّ على هذه الرسالة الآن.",
        ],
    )


async def queue_export_notes(conn: asyncpg.Connection, by: UUID | None) -> int:
    """One note for each owner of the business in scope that its data was downloaded by `by`.
    Returns how many were queued (none while email is off)."""
    if not mail.configured():
        return 0
    owners = await conn.fetch(
        "select u.id, u.email from memberships m join users u on u.id = m.user_id "
        "where m.role = 'owner' "
        "and m.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    at = datetime.now(UTC).isoformat()
    queued = 0
    for owner in owners:
        if not mail.deliverable(owner["email"]):
            continue
        await jobs.enqueue(conn, NOTICE, {
            "letter": DATA_EXPORTED, "user_id": str(owner["id"]),
            "by": str(by) if by else None, "at": at,
        })
        queued += 1
    return queued


class AccountNotices:
    """Runs the account_notice jobs."""

    def __init__(self, db: Database) -> None:
        self._db = db

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        if not mail.configured():
            return
        if payload["letter"] == EMAIL_CHANGED:
            async with self._db.unscoped() as conn:
                name = await conn.fetchval(
                    "select name from users where id = $1", UUID(payload["user_id"])
                )
            if not mail.deliverable(payload["to"]):
                return
            subject, text, html = email_changed_message(name or "", payload["new"])
            await mail.send(payload["to"], subject, text, html)
            return
        async with self._db.tenant(tenant_id) as conn:
            owner = await conn.fetchrow(
                "select u.email from memberships m join users u on u.id = m.user_id "
                "where m.user_id = $1 and m.role = 'owner'",
                UUID(payload["user_id"]),
            )
            if owner is None or not mail.deliverable(owner["email"]):
                return  # no longer an owner, or no longer an address to write to
            shop = await conn.fetchrow(
                "select name, name_ar from tenants where id = $1", tenant_id
            )
            by = None
            if payload.get("by"):
                by = await conn.fetchval(
                    "select name from users where id = $1", UUID(payload["by"])
                )
        subject, text, html = data_exported_message(
            shop["name"], shop["name_ar"] or shop["name"], by,
            datetime.fromisoformat(payload["at"]),
        )
        await mail.send(owner["email"], subject, text, html)
