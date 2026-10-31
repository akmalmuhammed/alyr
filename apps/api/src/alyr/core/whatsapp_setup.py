"""How a business gets onto WhatsApp (ALY-217, decision D-050, spec 019).

The owner chooses a way on their go-live list (the `whatsapp` step's choice in
`core/readiness.py`). Each way needs a few things ready before ALYR and Meta can connect
it; the owner ticks them here and gives the number. Then it waits: on Meta, while ALYR
cannot yet connect that way (`Settings.whatsapp_ways_open`), or on ALYR to start. ALYR
marks it connecting, or failed with the reason, from the back office. Connected is never
stored: it is the business's Meta row in `channel_numbers` (attached by ALY-166 or by
Embedded Signup, ALY-39).

What each way needs was checked against Meta's own pages on 23 Oct 2026:
  * coexistence (moving a number and keeping the app): developers.facebook.com
    /documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
  * an account with another provider is shared with ALYR, not migrated: numbers cannot be
    moved between accounts on Meta's new account model (.../solution-providers/support
    /migrating-phone-numbers-among-solution-partners-via-embedded-signup)
  * Meta bills each business's own account; a Tech Provider has no credit line.

Every function takes a connection scoped to the business.
"""

import re
from dataclasses import dataclass

import asyncpg

from alyr import catalog
from alyr.catalog import Text
from alyr.config import get_settings
from alyr.core import whatsapp_signup


class SetupError(Exception):
    """A change the setup cannot take; the message is safe to show."""


@dataclass(frozen=True)
class Need:
    key: str
    label: Text
    # A field rather than a tick: done when the field is filled in.
    field: str = ""


_PORTFOLIO = Need(
    "portfolio",
    Text(
        "A Meta business portfolio with your business's legal name, address and website",
        "حساب أعمال على Meta (Business Portfolio) باسم نشاطك القانوني وعنوانه وموقعه",
    ),
)
_META_CARD = Need(
    "meta_card",
    Text(
        "A card you can add to your WhatsApp account in Meta. Meta charges you directly, a few "
        "cents for each message ALYR starts for you; replies to customers are free",
        "بطاقة تضيفها إلى حساب واتساب الخاص بك في Meta. تحاسبك Meta مباشرة ببضع سنتات عن كل "
        "رسالة ترسلها ALYR نيابة عنك؛ الرد على العملاء مجاني",
    ),
)

NEEDS: dict[str, tuple[Need, ...]] = {
    "new_number": (
        Need(
            "number",
            Text(
                "The new number. It must not be on WhatsApp yet, and must be able to get a text "
                "or a call for the code",
                "الرقم الجديد. يجب ألا يكون مسجلاً على واتساب، وأن يستقبل رسالة أو مكالمة للرمز",
            ),
            field="phone",
        ),
        Need(
            "name",
            Text(
                "The name customers see. Use your business's name as it is on your sign or "
                "commercial registration",
                "الاسم الذي يراه العملاء. استخدم اسم نشاطك كما هو على اللافتة أو السجل التجاري",
            ),
            field="display_name",
        ),
        _PORTFOLIO,
        _META_CARD,
    ),
    "move_number": (
        Need(
            "number",
            Text("The number you use now", "الرقم الذي تستخدمه الآن"),
            field="phone",
        ),
        Need(
            "app_version",
            Text(
                "WhatsApp Business app 2.24.17 or newer on the phone with that number",
                "تطبيق واتساب للأعمال بالإصدار 2.24.17 أو أحدث على الهاتف الذي يحمل الرقم",
            ),
        ),
        Need(
            "phone_at_hand",
            Text(
                "That phone with you on the day: you scan a code, then keep the app open "
                "while your last six months of chats copy over",
                "الهاتف معك يوم الربط: تمسح رمزاً، ثم تبقي التطبيق مفتوحاً حتى تُنسخ محادثات "
                "آخر ستة أشهر",
            ),
        ),
        Need(
            "limits",
            Text(
                "You accept what changes: groups stay in the app only, broadcast lists become "
                "read-only, disappearing, view once and live location messages switch off, "
                "linked computers are signed out, and the phone must open the app at least "
                "every 14 days",
                "توافق على ما يتغير: تبقى المجموعات في التطبيق فقط، وتصبح قوائم البث للقراءة "
                "فقط، وتتوقف الرسائل المؤقتة والعرض لمرة واحدة ومشاركة الموقع المباشر، وتُفصل "
                "الأجهزة المرتبطة، ويجب فتح التطبيق على الهاتف مرة كل 14 يوماً على الأقل",
            ),
        ),
        _PORTFOLIO,
        _META_CARD,
    ),
    "own_account": (
        Need(
            "number",
            Text("The number on that account", "الرقم المسجل على ذلك الحساب"),
            field="phone",
        ),
        Need(
            "admin",
            Text(
                "You are an admin of the business portfolio that owns the account, so you "
                "can share it with ALYR",
                "أنت مسؤول (Admin) في حساب الأعمال الذي يملك الحساب، لتتمكن من مشاركته مع ALYR",
            ),
        ),
        Need(
            "provider",
            Text(
                "You can sign in to your current provider, so ALYR and you pick the day of the "
                "switch and no message is missed",
                "يمكنك الدخول إلى مزوّدك الحالي، لنختار معك يوم الانتقال إلى ALYR "
                "دون أن تفوتك رسالة",
            ),
        ),
        Need(
            "meta_card",
            Text(
                "The account has a payment method in Meta",
                "للحساب وسيلة دفع مسجلة في Meta",
            ),
        ),
    ),
    # ALYR's own shared number needs nothing from the business. It is not offered yet: one
    # number reaching many businesses needs a routing step that does not exist (D-050).
    "alyr_number": (),
}

STATES = ("", "connecting", "failed")
_PHONE = re.compile(r"^\+[1-9][0-9]{7,14}$")


def clean_phone(value: str) -> str:
    """A number in international form, or a SetupError. Qatar's eight digits get +974."""
    digits = re.sub(r"[\s\-()]", "", value or "")
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if re.fullmatch(r"[3-7][0-9]{7}", digits):
        digits = "+974" + digits
    if digits and not _PHONE.match(digits):
        raise SetupError("write the number in international form, like +974 5555 0101")
    return digits


def open_ways() -> set[str]:
    """The ways ALYR can connect today. Until Meta approves ALYR, none: the owner still
    gets everything ready, and the business is ready to go live on everything else."""
    raw = get_settings().whatsapp_ways_open
    return {w.strip() for w in raw.split(",") if w.strip() in NEEDS}


def done(need: Need, row: asyncpg.Record | dict | None) -> bool:
    if row is None:
        return False
    if need.field:
        return bool(row[need.field])
    return need.key in row["ready"]


def status(way: str, row: asyncpg.Record | dict | None, connected: bool) -> str:
    """Where a business is: connected; none (no way chosen); preparing (the owner has
    something left to get ready); waiting_on_meta; queued (ALYR can start); connecting;
    failed."""
    if connected:
        return "connected"
    if not way:
        return "none"
    if not all(done(n, row) for n in NEEDS.get(way, ())):
        return "preparing"
    state = row["state"] if row is not None else ""
    if state:
        return state
    return "queued" if way in open_ways() else "waiting_on_meta"


async def row(conn: asyncpg.Connection) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "select phone, display_name, ready, state, note, updated_at from whatsapp_setup"
    )


async def _way(conn: asyncpg.Connection) -> str:
    return await conn.fetchval(
        "select choice from onboarding_steps where step_key = 'whatsapp'"
    ) or ""


async def _connected(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval(f"select {catalog.CONNECTION_BY_KEY['whatsapp'].connected}"))


async def current(conn: asyncpg.Connection) -> dict:
    """The setup as the owner and the back office see it."""
    way, saved = await _way(conn), await row(conn)
    return {
        "way": way,
        "status": status(way, saved, await _connected(conn)),
        "phone": saved["phone"] if saved else "",
        "display_name": saved["display_name"] if saved else "",
        "needs": [
            {"key": n.key, "label": {"en": n.label.en, "ar": n.label.ar}, "field": n.field,
             "done": done(n, saved)}
            for n in NEEDS.get(way, ())
        ],
        "note": saved["note"] if saved else "",
        "open": way in open_ways(),
        # Whether the owner may connect now, with Meta's pop-up (spec 063): nothing but a yes or no.
        "connect": whatsapp_signup.offer(get_settings(), way),
    }


async def _event(conn: asyncpg.Connection, actor: str, by_alyr: bool, detail: dict) -> None:
    await conn.execute(
        "insert into onboarding_events (step_key, event, detail, actor, by_alyr) "
        "values ('whatsapp', 'whatsapp', $1, $2, $3)",
        detail, actor, by_alyr,
    )


async def prepare(
    conn: asyncpg.Connection, actor: str, by_alyr: bool, *, phone: str | None = None,
    display_name: str | None = None, ready: list[str] | None = None,
) -> dict:
    """The owner (or ALYR for them) gives the number and ticks what is ready. Answers what
    changed, for the audit."""
    way = await _way(conn)
    if not way:
        raise SetupError("choose how customers reach you on WhatsApp first")
    ticks = {n.key for n in NEEDS[way] if not n.field}
    await conn.execute("insert into whatsapp_setup default values on conflict do nothing")
    row = await conn.fetchrow(
        "select phone, display_name, ready from whatsapp_setup for update"
    )
    changed: dict = {}
    if phone is not None and (phone := clean_phone(phone)) != row["phone"]:
        changed["phone"] = phone
    if display_name is not None and (display_name := display_name.strip()[:80]) != row[
        "display_name"
    ]:
        changed["display_name"] = display_name
    if ready is not None:
        unknown = set(ready) - ticks
        if unknown:
            raise SetupError(f"not something this way needs: {', '.join(sorted(unknown))}")
        # Ticks for another way are kept, in case the owner switches back.
        kept = [k for k in row["ready"] if k not in ticks]
        new = sorted(set(kept) | set(ready))
        if new != sorted(row["ready"]):
            changed["ready"] = new
    if changed:
        await conn.execute(
            "update whatsapp_setup set phone = coalesce($1, phone), "
            "display_name = coalesce($2, display_name), ready = coalesce($3, ready), "
            "updated_at = now(), updated_by = $4",
            changed.get("phone"), changed.get("display_name"), changed.get("ready"), actor,
        )
        # The record keeps what was given, not the number itself.
        await _event(conn, actor, by_alyr, {k: True for k in changed})
    return changed


async def set_state(conn: asyncpg.Connection, state: str, note: str, actor: str) -> bool:
    """ALYR says where it is with the connection: connecting, failed (and why), or back to
    nothing yet. Only the back office does this."""
    if state not in STATES:
        raise SetupError("the state is connecting, failed, or empty")
    note = note.strip()[:500]
    if state == "failed" and not note:
        raise SetupError("say why it failed: the owner sees it")
    await conn.execute("insert into whatsapp_setup default values on conflict do nothing")
    row = await conn.fetchrow("select state, note from whatsapp_setup for update")
    if (row["state"], row["note"]) == (state, note):
        return False
    await conn.execute(
        "update whatsapp_setup set state = $1, note = $2, updated_at = now(), updated_by = $3",
        state, note, actor,
    )
    await _event(conn, actor, True, {"state": state, "from": row["state"]})
    return True
