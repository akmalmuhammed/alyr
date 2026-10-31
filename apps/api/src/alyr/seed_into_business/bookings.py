"""The diary: tastings, catering consultations and cake design fittings, with the people and
the room they use, deposits where the service takes one, and a today and tomorrow that look
busy (spec 063).

A person or the tasting table is never booked twice at once: every booking is placed in a free
slot of its resource's own hours. The made-up customers are the ones of the story; bookings are
numbered in the order they were made, and the messages the booking page and the reminders
would have left in the chat are written beside them.
"""

from datetime import datetime, time, timedelta
from uuid import UUID

from alyr.core.normalise import fmt_qar
from alyr.demo.build import TZ
from alyr.seed_into_business import persona
from alyr.seed_into_business.context import Run

# (key, name, Arabic name, minutes, price, deposit (fixed, in dirhams), resource keys)
SERVICES = (
    ("tasting", "Cake tasting", "جلسة تذوّق الكيك", 45, 7_500, 2_500, ("noura", "table")),
    ("consult", "Catering consultation", "استشارة التموين", 30, 0, 0, ("dina",)),
    ("fitting", "Cake design fitting", "جلسة تصميم الكيك", 60, 15_000, 5_000, ("noura",)),
)
# (key, name, Arabic name, kind, hours: (weekday, opens, closes) with Sunday as 0)
RESOURCES = (
    ("noura", "Noura (cakes)", "نورة (الكيك)", "person",
     [(d, "10:00", "18:00") for d in (6, 0, 1, 2, 3, 4)]),
    ("dina", "Dina (catering)", "دينا (التموين)", "person",
     [(d, "09:00", "17:00") for d in (0, 1, 2, 3, 4)]),
    ("table", "Tasting table", "طاولة التذوق", "place",
     [(d, "10:00", "20:00") for d in (6, 0, 1, 2, 3, 4)] + [(5, "15:00", "20:00")]),
)
HOURS = [(d, "06:30", "22:00") for d in (6, 0, 1, 2, 3, 4)] + [(5, "14:00", "22:00")]

BOOK = {"en": "Can I book a {service}?", "ar": "أبي أحجز {service}"}
LINK = {"en": "Choose a time here: {url}", "ar": "اختر الموعد من هنا: {url}"}
CONFIRMED = {"en": "Booking #{n} confirmed for {when}.", "ar": "تم تأكيد الحجز رقم {n} يوم {when}."}
REMINDER = {"en": "A reminder of your appointment today.", "ar": "تذكير بموعدك اليوم."}
DEPOSIT = {"en": "Your deposit of {amount} is received. See you soon!",
           "ar": "وصلنا العربون {amount}. بانتظاركم!"}


async def setup(run: Run, conn) -> dict:
    """The services, the people and the room, their hours, and who does what. Opening hours the
    business already has are left alone."""
    ids: dict = {"services": {}, "resources": {}}
    for sort, (key, name, name_ar, minutes, price, deposit, _) in enumerate(SERVICES):
        found = await conn.fetchval("select id from services where name = $1", name)
        if found is None:
            kind = "fixed" if deposit else "none"
            found = await conn.fetchval(
                "insert into services (name, name_ar, duration_minutes, price, sort, deposit_kind, "
                "deposit_value) values ($1, $2, $3, $4, $5, $6, $7) returning id",
                name, name_ar, minutes, price, 10 + sort, kind, deposit,
            )
        ids["services"][key] = found
    for sort, (key, name, name_ar, kind, hours) in enumerate(RESOURCES):
        found = await conn.fetchval("select id from booking_resources where name = $1", name)
        if found is None:
            found = await conn.fetchval(
                "insert into booking_resources (name, name_ar, kind, sort) "
                "values ($1, $2, $3, $4) returning id", name, name_ar, kind, 10 + sort)
            for weekday, opens, closes in hours:
                await conn.execute(
                    "insert into resource_hours (resource_id, weekday, opens, closes) "
                    "values ($1, $2, $3::text::time, $4::text::time)",
                    found, weekday, opens, closes)
        ids["resources"][key] = found
    for key, _, _, _, _, _, resources in SERVICES:
        for r in resources:
            await conn.execute(
                "insert into service_resources (service_id, resource_id) values ($1, $2) "
                "on conflict do nothing", ids["services"][key], ids["resources"][r])
    if not await conn.fetchval("select 1 from business_hours"):
        for weekday, opens, closes in HOURS:
            await conn.execute(
                "insert into business_hours (weekday, opens, closes) "
                "values ($1, $2::text::time, $3::text::time)", weekday, opens, closes)
    return ids


def free(taken: list, starts: datetime, ends: datetime) -> bool:
    return all(ends <= s or starts >= e for s, e in taken)


def slots(day, hours: list, minutes: int):
    """Start times on the half hour inside a resource's hours for a day (Sunday is 0)."""
    weekday = (day.weekday() + 1) % 7
    for d, opens, closes in hours:
        if d != weekday:
            continue
        at = datetime.combine(day, time.fromisoformat(opens), TZ)
        end = datetime.combine(day, time.fromisoformat(closes), TZ)
        while at + timedelta(minutes=minutes) <= end:
            yield at
            at += timedelta(minutes=30)


async def write(run: Run, conn, story, ids: dict) -> int:
    """Plan the diary, write it, and leave its chat messages in the story's lists."""
    rng, now = story.rng, story.now
    today = story.today
    hours = {key: h for key, _, _, _, h in RESOURCES}
    taken: dict[str, list] = {key: [] for key in hours}
    people = [p for p in story.made.people if p.customer.kind != "account"]
    plan = []  # (day, service key)
    for offset in range(-(story.days - 1), 7):
        day = today + timedelta(days=offset)
        if offset in (0, 1):
            count = 5  # today and tomorrow are full
        elif offset < 0:
            ramp = 0.35 + 0.9 * (offset + story.days) / (story.days + 6)
            count = rng.choices([0, 1, 2], [15 - 9 * ramp, 2 + 3 * ramp, 0.2 + ramp])[0]
        else:
            count = rng.choices([0, 1, 2], [2, 3, 2])[0]
        plan += [(day, rng.choices([s[0] for s in SERVICES], [4, 3, 2])[0]) for _ in range(count)]
    rows = []
    for day, key in plan:
        service = next(s for s in SERVICES if s[0] == key)
        _, name, name_ar, minutes, price, deposit, resources = service
        choices = []
        for res in resources:
            for starts in slots(day, hours[res], minutes):
                ends = starts + timedelta(minutes=minutes)
                if free(taken[res], starts, ends):
                    choices.append((res, starts, ends))
        if not choices:
            continue
        res, starts, ends = rng.choice(choices)
        pool = [p for p in people if p.first_seen < starts - timedelta(days=1)]
        if not pool:
            continue
        person = rng.choice(pool)
        taken[res].append((starts, ends))
        made = max(person.first_seen + timedelta(hours=1),
                   starts - timedelta(days=rng.randint(1, 6), hours=rng.randint(0, 5)))
        if made >= now:
            made = now - timedelta(hours=rng.randint(1, 60))
        rows.append((made, starts, ends, key, res, person, service))
    rows.sort(key=lambda r: r[0])
    number = run.booking_start - 1
    written = 0
    for made, starts, ends, key, res, person, service in rows:
        number += 1
        _, name, name_ar, minutes, price, deposit, _r = service
        if ends <= now:
            if starts > now - timedelta(hours=30) and rng.random() < 0.6:
                status = "booked"  # nobody has marked it yet
            else:
                status = rng.choices(["completed", "no_show", "cancelled"], [90, 4, 6])[0]
        else:
            status = "booked"
        state, hold, requested = "none", None, False
        if deposit:
            if status == "cancelled":
                state = "refund_due" if starts - made > timedelta(days=2) else "kept"
                requested = True
            elif status == "no_show":
                state, requested = "kept", True
            elif status == "completed" or rng.random() < 0.8:
                state, requested = "paid", True
            else:
                state, hold = "due", now + timedelta(hours=20)
                if starts - now > timedelta(days=3):
                    hold = now + timedelta(hours=6)
        reminded = starts - timedelta(hours=2)
        reminded = reminded if status != "cancelled" and reminded < now else None
        staff_email = person.staff
        booking_id = story.uuid()
        await conn.execute(
            "insert into bookings (id, number, contact_id, service_id, service_name, starts_at, "
            "ends_at, status, reminded_at, created_at, assigned_to, resource_id, deposit, "
            "deposit_state, deposit_terms, hold_until) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
            booking_id, number, person.id, ids["services"][key], name, starts, ends, status,
            reminded, made, story.made.users[staff_email], ids["resources"][res], deposit if state != "none" else 0,
            state,
            {"kind": "fixed", "value": deposit, "no_show": "keep", "late_cancel": "keep",
             "cancel_hours": 24} if state != "none" else {},
            hold,
        )
        if requested:
            await conn.execute(
                "insert into payment_requests (contact_id, amount, status, created_at, paid_at, "
                "booking_id) values ($1, $2, 'paid', $3, $4, $5)",
                person.id, deposit, made, made + timedelta(minutes=rng.randint(2, 40)), booking_id,
            )
        written += 1
        lang = person.customer.lang
        shown = name_ar if lang == "ar" else name
        url = f"{story.web_url}/b/{story.shop.slug}?c={person.id}"
        asked = made - timedelta(minutes=rng.randint(2, 9))
        when = starts.astimezone(TZ).strftime("%a %d %b, %H:%M") if lang == "en" else (
            starts.astimezone(TZ).strftime("%d/%m %H:%M"))
        story.say(person, asked, "in", "text", BOOK[lang].format(service=shown))
        story.say(person, asked + timedelta(seconds=4), "out", "text", LINK[lang].format(url=url))
        story.say(person, made + timedelta(seconds=3), "out", "text",
                  CONFIRMED[lang].format(n=number, when=when),
                  {"template": "booking_confirmed", "category": "utility", "sent_as": "text"})
        if requested and state in ("paid", "kept", "refund_due"):
            story.say(person, made + timedelta(minutes=3), "out", "text",
                      DEPOSIT[lang].format(amount=fmt_qar(deposit)),
                      {"template": "deposit_received", "category": "utility", "sent_as": "text"})
        story.log("booking", booking_id, person, "booked", made)
        if reminded:
            story.say(person, reminded, "out", "template", REMINDER[lang],
                      {"template": "booking_reminder", "category": "utility", "params": [],
                       "lang": lang})
        if status == "cancelled":
            story.log("booking", booking_id, person, "cancelled",
                      min(made + timedelta(days=1), starts - timedelta(hours=3)))
        if status in ("completed", "no_show"):
            story.log("booking", booking_id, person, status,
                      ends + timedelta(minutes=rng.randint(5, 40)), person.staff)
    story.counts["bookings"] = written
    return written
