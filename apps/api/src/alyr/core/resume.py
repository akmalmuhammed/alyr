"""Bring back an owner who stopped partway through setting up (ALY-171, D-068, spec 032).

The step an owner stopped on is saved on the business, so `/start` reopens there. This is what
asks them to come back: one email 24 hours after they were last there, naming the next step with
a link to it, and a second after three days. Then no more. It is for a business whose setup is
unfinished (not set up, not live) and whose owner has not switched it off, from the link at the
foot of every email. When the owner opens setup again, the reminder is recorded as answered, and
the back office's funnel counts both.

Which businesses are due is worked out by the database function `resume_candidates`, which reads
across every business as the table owner because the worker has none in scope. The email goes
out after the reminder is recorded and is never retried: a missed reminder is better than a
second one.
"""

import logging
from datetime import UTC, datetime

from alyr.config import get_settings
from alyr.core import links, mail
from alyr.db import Database

log = logging.getLogger("alyr.resume")

# What completes "your next step is to ...", by step, in each language (ALY-164 and ALY-165 are
# the ways a business sets up; every step of every way is here).
STEP_PHRASES = {
    "en": {
        "services": "add your services",
        "hours": "set your opening hours",
        "products": "choose what you sell",
        "handover": "set pickup, delivery and how customers pay",
        "try": "try it as a customer",
        "plan": "read your plan",
        "golive": "finish the go-live list",
        "assisted": "check what ALYR is setting up with you",
    },
    "ar": {
        "services": "تضيف خدماتك",
        "hours": "تحدد ساعات عملك",
        "products": "تختار ما تبيعه",
        "handover": "تحدد الاستلام والتوصيل وطريقة الدفع",
        "try": "تجرّبه كعميل",
        "plan": "تطّلع على خطتك",
        "golive": "تُنهي قائمة الانطلاق",
        "assisted": "تراجع ما تجهّزه ALYR معك",
    },
}
FALLBACK = {"en": "finish your setup", "ar": "تُكمل إعدادك"}


def step_phrase(step: str, lang: str) -> str:
    lang = "ar" if lang == "ar" else "en"
    return STEP_PHRASES[lang].get(step, FALLBACK[lang])


async def send_due(db: Database, now: datetime | None = None) -> int:
    """Send every reminder that is due. Answers how many went out."""
    if not mail.configured():
        return 0
    now = now or datetime.now(UTC)
    web_url = get_settings().public_web_url.rstrip("/")
    async with db.unscoped() as conn:
        due = await conn.fetch("select * from resume_candidates($1)", now)
    sent = 0
    for c in due:
        # Never to an address that cannot be a real person's (the demo shops, tests).
        if not mail.deliverable(c["owner_email"]):
            continue
        number = c["sent"] + 1
        async with db.tenant(c["tenant_id"]) as conn:
            claimed = await conn.fetchval(
                "insert into onboarding_reminders (number, step, lang, sent_at) "
                "values ($1, $2, $3, $4) on conflict (tenant_id, number) do nothing returning id",
                number, c["step"], c["lang"], now,
            )
        if claimed is None:  # another worker got there first
            continue
        subject, text, html = mail.resume_message(
            c["lang"], c["owner_name"], c["business_name"], step_phrase(c["step"], c["lang"]),
            f"{web_url}/start", links.resume_stop_url(web_url, c["slug"], c["tenant_id"]),
        )
        try:
            await mail.send(c["owner_email"], subject, text, html)
            sent += 1
        except mail.MailError as error:
            log.warning("reminder %s to a business not sent: %s", number, error)
    return sent
