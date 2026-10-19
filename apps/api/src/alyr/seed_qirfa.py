"""A sample business for screenshots: Qirfa Bakery («مخبز قرفة»), a fictional bakery and
café in Doha that takes orders on WhatsApp and books cake tastings (ALY-99).

Eight weeks of believable activity, so the ALYR Agent dashboard and the Sunday report
have something real to compute: orders that grow week on week, tastings with a few
no-shows, credit accounts for offices and event planners with balances of different
ages, chats with response times, regulars, a few regulars who have gone quiet, and a
team of three (Huda the owner, Karim who runs the kitchen and the tastings, Yusuf at the
counter and on WhatsApp).

Every person and company is invented. People go by a first name and an initial, the way
a shop saves them in its phone, so no name is a real Qatari family name. Phone numbers
are made up. The business has only a private simulator line and no job is queued, so
nothing here can reach a phone.

Run with: uv run python -m alyr.seed_qirfa   (after `uv run python -m alyr.migrate`)
Running it again replaces the sample business with a fresh copy dated from today. The
same random seed gives the same shape every time.
"""

import asyncio
import random
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import get_settings
from alyr.core import consent, links
from alyr.core.normalise import fmt_qar
from alyr.db import Database
from alyr.modules import report
from alyr.modules.ledger import service as ledger

QIRFA_TENANT_ID = UUID("0a1f0000-0000-4000-8000-00000000c1fa")
CANCEL_ACCOUNT_EVERY = 0  # see where it is used; tests set it
QIRFA_SLUG = "qirfa"
NUMBER_ID = "sim-qirfa"
TZ = ZoneInfo("Asia/Qatar")
DAYS = 56  # eight weeks, the last of them ending today

# The team. The .example domain can never receive real email.
OWNER_EMAIL = "huda@qirfa.example"
ADMIN_EMAIL = "karim@qirfa.example"
AGENT_EMAIL = "yusuf@qirfa.example"
TEAM = [
    (OWNER_EMAIL, "Huda Rahim", "owner"),
    (ADMIN_EMAIL, "Karim Nasr", "admin"),
    (AGENT_EMAIL, "Yusuf Amin", "agent"),
]
NAMES_AR = {"Huda Rahim": "هدى رحيم", "Karim Nasr": "كريم نصر", "Yusuf Amin": "يوسف أمين",
            "Lamees Adel": "لميس عادل", "Sana Rao": "سناء راو", "Hiba Taher": "هبة طاهر",
            "Faris Nabil": "فارس نبيل", "Mira Antoun": "ميرا أنطون", "Omar Said": "عمر سعيد",
            "Adel Karim": "عادل كريم", "Ritu Menon": "ريتو مينون", "Arun Pillai": "أرون بيلاي",
            "Bilal Rafiq": "بلال رفيق"}
OWNER_PHONE = "97455669001"
COUNTER_PHONE = "97455669002"

# (name, Arabic name, category, price in dirhams). Invented menu and prices.
PRODUCTS = [
    ("Cinnamon roll", "لفائف القرفة", "Pastries", 1_800),
    ("Cardamom bun", "خبز الهيل", "Pastries", 1_600),
    ("Za'atar croissant", "كرواسون بالزعتر", "Pastries", 1_400),
    ("Butter croissant", "كرواسون بالزبدة", "Pastries", 1_200),
    ("Box of 12 mini pastries", "علبة 12 معجنات صغيرة", "Pastries", 9_500),
    ("Sourdough loaf", "خبز العجين المخمّر", "Breads", 3_200),
    ("Date and tahini loaf", "رغيف التمر والطحينة", "Breads", 3_800),
    ("Saffron milk cake, slice", "كيك الحليب بالزعفران، قطعة", "Cakes", 2_600),
    ("Pistachio kunafa cheesecake", "تشيز كيك الكنافة بالفستق", "Cakes", 18_500),
    ("Celebration cake, 1 kg", "كيكة مناسبات، 1 كغ", "Cakes", 22_000),
    ("Celebration cake, 2 kg", "كيكة مناسبات، 2 كغ", "Cakes", 39_000),
    ("Karak", "كرك", "Drinks", 600),
    ("Spanish latte", "سبانش لاتيه", "Drinks", 2_200),
]
EVERYDAY = [0, 1, 2, 3, 5, 6, 7, 11, 12]
CAKES = [8, 9, 10]
WHOLESALE = [5, 6, 4]  # what offices and the café order on account

# (name, Arabic name, minutes, price in dirhams)
SERVICES = [
    ("Cake tasting", "تذوّق الكيك", 45, 7_500),
    ("Celebration cake consultation", "استشارة كيكة المناسبات", 30, 0),
]
# Saturday to Thursday 6:30 to 22:00, Friday 14:00 to 22:00. Weekday 0 is Sunday.
HOURS = [
    *[(day, "06:30", "22:00") for day in (6, 0, 1, 2, 3, 4)],
    (5, "14:00", "22:00"),
]
SAVED_REPLIES = [
    ("Opening hours",
     "We are open Saturday to Thursday 6:30 am to 10 pm, and Friday 2 pm to 10 pm."),
    ("Cake orders", "Celebration cakes need 48 hours' notice. Send the date, the size and the "
                    "message for the top, and we will confirm the price."),
    ("Location", "We are in Bin Mahmoud, opposite the pharmacy. Parking is in front."),
    ("أوقات العمل",
     "نعمل من السبت إلى الخميس من ٦:٣٠ صباحاً إلى ١٠ مساءً، والجمعة من ٢ إلى ١٠ مساءً."),
]

# Customers who order as people. First name and initial only; lang is the language
# they write in.
PEOPLE = [
    ("Maha S.", "ar"), ("Omar K.", "ar"), ("Lina F.", "en"), ("Rania H.", "ar"),
    ("Priya N.", "en"), ("Hassan D.", "ar"), ("Sara M.", "en"), ("Noor A.", "ar"),
    ("James O.", "en"), ("Dana R.", "ar"), ("Ali T.", "ar"), ("Farah B.", "en"),
    ("Mona E.", "ar"), ("Ahmad J.", "ar"), ("Grace L.", "en"), ("Reem W.", "ar"),
    ("Tariq Z.", "en"), ("Jana Q.", "ar"), ("Kavya P.", "en"), ("Bassam G.", "ar"),
    ("Hind Y.", "ar"), ("Leila C.", "en"), ("Samir V.", "ar"), ("Aisha I.", "ar"),
    ("Mark D.", "en"), ("Nadia K.", "en"), ("Yara S.", "ar"), ("Khaled F.", "ar"),
    ("Sophie T.", "en"), ("Ola M.", "ar"), ("Imran H.", "en"), ("Rawan N.", "ar"),
    ("Daniel B.", "en"), ("Asma R.", "ar"), ("Fatma O.", "ar"), ("Joel A.", "en"),
    ("Huda K.", "ar"), ("Ines P.", "en"), ("Waleed S.", "ar"), ("Amal J.", "ar"),
    ("Chloe R.", "en"), ("Ziad L.", "ar"), ("Meera V.", "en"), ("Salma T.", "ar"),
    ("Hamza E.", "ar"), ("Elena G.", "en"), ("Nour B.", "ar"), ("Ravi K.", "en"),
    ("Lama D.", "ar"), ("Adam W.", "en"), ("Rasha F.", "ar"), ("Tala H.", "ar"),
    ("Arjun M.", "en"), ("Ghada N.", "ar"), ("Isabel C.", "en"), ("Majed A.", "ar"),
    ("Deema S.", "ar"), ("Lucas F.", "en"), ("Hiba Z.", "ar"), ("Anya R.", "en"),
    ("Sameer Y.", "en"), ("Nada Q.", "ar"), ("Fadi O.", "ar"), ("Mariam P.", "ar"),
    ("Oliver T.", "en"), ("Bushra L.", "ar"), ("Nikhil S.", "en"), ("Wafa K.", "ar"),
    ("Zainab H.", "ar"), ("Ethan B.", "en"), ("Razan M.", "ar"), ("Lea N.", "en"),
    ("Karam D.", "ar"), ("Sana A.", "en"), ("Basma R.", "ar"), ("Victor G.", "en"),
    ("Hala E.", "ar"), ("Rohan J.", "en"), ("Dalia W.", "ar"), ("Amir F.", "ar"),
]
# How each person behaves, by position in PEOPLE.
REGULARS = range(0, 12)  # order every few days, all eight weeks
QUIET = range(12, 17)  # were weekly regulars, nothing for the last three weeks or more
OCCASIONAL = range(17, 57)  # one to three orders, more of them in recent weeks
NEW = range(57, 72)  # first wrote in the last two weeks
ASK_ONLY = range(72, 80)  # asked questions, never ordered

# Credit accounts: offices, a café and event planners that order on account.
# (name, lang, credit limit, how they pay, opening balance (dirhams, days ago) or None)
ACCOUNTS = [
    ("Marina Desk Co-working", "en", 600_000, "monthly", None),
    ("Bluefin Events", "en", 1_000_000, "partial", None),
    ("Garden Gate Nursery", "en", 300_000, "prompt", None),
    ("Palm Court Offices", "ar", 500_000, "promised", (164_000, 76)),
    ("Tamr Café", "ar", 400_000, "fortnightly", None),
    ("Ward Events", "ar", 500_000, "silent", (125_000, 104)),
]

ASK = {
    "en": [
        "Do you have anything without nuts?", "Are you open on Friday morning?",
        "Do you deliver to West Bay?", "Can I pick up at 7 tomorrow?",
        "How long does a 2 kg cake need?", "Is the sourdough baked today?",
        "Do you have a sugar-free option?", "Can you do a cake for 30 people?",
        "Where can I park?", "Do you take card at the counter?",
    ],
    "ar": [
        "هل عندكم شيء بدون مكسرات؟", "هل تفتحون صباح الجمعة؟", "هل توصلون إلى الخليج الغربي؟",
        "أقدر أستلم الساعة ٧ بكرة؟", "كم تحتاج كيكة ٢ كيلو؟", "هل الخبز طازج اليوم؟",
        "عندكم خيار بدون سكر؟", "تقدرون تسوون كيكة لثلاثين شخص؟", "وين أقدر أوقف السيارة؟",
        "تقبلون البطاقة عند الكاونتر؟",
    ],
}
ANSWER = {
    "en": [
        "Yes, the date and tahini loaf and the sourdough have no nuts.",
        "We open at 2 pm on Friday.", "Not yet, but you can pick up any time we are open.",
        "Of course, it will be ready for you.", "48 hours, and a tasting first if you like.",
        "Yes, it comes out of the oven at 6:30 every morning.",
        "Not at the moment, sorry.", "Yes. A 2 kg cake serves about 30; I will send you options.",
        "Right in front of the shop.", "Yes, card and cash.",
    ],
    "ar": [
        "نعم، رغيف التمر والطحينة والخبز المخمّر بدون مكسرات.", "نفتح الجمعة الساعة ٢ ظهراً.",
        "ليس بعد، لكن تقدر تستلم في أي وقت نكون فيه مفتوحين.", "أكيد، بيكون جاهز لك.",
        "٤٨ ساعة، ونقدر نرتب لك تذوّق قبلها.", "نعم، يطلع من الفرن ٦:٣٠ كل صباح.",
        "للأسف ليس حالياً.", "نعم، كيكة ٢ كيلو تكفي حوالي ٣٠ شخص، بأرسل لك الخيارات.",
        "قدام المحل مباشرة.", "نعم، بطاقة وكاش.",
    ],
}
WANT = {
    "en": ["Hi, I'd like to order for tomorrow morning", "Hello! Can I place an order?",
           "Hi, same as last week please", "Order for pickup today please"],
    "ar": ["مرحبا، أبي أطلب لبكرة الصبح", "السلام عليكم، أقدر أطلب؟",
           "هلا، نفس طلب الأسبوع الماضي لو سمحت", "طلب للاستلام اليوم لو سمحتوا"],
}
EXTRA = {
    "en": ["Can you write 'Happy birthday Lina' on it?", "Could you slice the loaf?",
           "Please add a candle", "Can I collect 30 minutes later?"],
    "ar": ["تقدرون تكتبون «كل عام وأنت بخير» عليها؟", "ممكن تقطعون الخبز؟",
           "ضيفوا شمعة لو سمحتوا", "أقدر أستلم بعد نص ساعة؟"],
}
DONE_REPLY = {"en": "Done, see you soon!", "ar": "تم، بانتظارك!"}
BOOK = {"en": "Can we book a cake tasting?", "ar": "نبي نحجز تذوّق كيك"}
THANKS = {"en": "Thank you!", "ar": "شكراً لكم"}
LINK = {
    "en": "Here is our menu. Choose what you would like and send the order: {url}",
    "ar": "هذه قائمتنا. اختر ما تريد وأرسل الطلب: {url}",
}
BOOK_LINK = {
    "en": "Choose a time for your tasting here: {url}",
    "ar": "اختر موعد التذوّق من هنا: {url}",
}


def _when(day: date, hour: int, minute: int) -> datetime:
    return datetime.combine(day, time(hour, minute), TZ).astimezone(UTC)


def _open_at(day: date, hour: int) -> bool:
    """Is the bakery open at this hour (Friday afternoons only)?"""
    if day.weekday() == 4:  # Friday
        return 14 <= hour < 22
    return 7 <= hour < 22


@dataclass
class Person:
    id: UUID
    name: str
    lang: str
    staff: str  # the email of whoever looks after their chat
    kind: str
    first_seen: datetime
    events: list = field(default_factory=list)


class Bakery:
    """Writes eight weeks of one bakery's life, in its own scope."""

    def __init__(self, conn: asyncpg.Connection, now: datetime, rng: random.Random,
                 web_url: str) -> None:
        self.conn = conn
        self.now = now
        self.rng = rng
        self.today = now.astimezone(TZ).date()
        self.first_day = self.today - timedelta(days=DAYS - 1)
        self.users: dict[str, UUID] = {}
        self.names: dict[str, str] = {}
        self.products: list[tuple[UUID, str, int]] = []
        self.services: list[tuple[UUID, str, int]] = []
        self.order_number = 1000
        self.booking_number = 100
        self.messages: list[tuple] = []
        self.activity: list[tuple] = []
        self.taken_slots: set[datetime] = set()
        # What a subclass for another sample business changes (seed_bookings.py).
        self.number_id = NUMBER_ID
        self.slug = QIRFA_SLUG
        self.fast_staff = AGENT_EMAIL
        self.account_holders = len(ACCOUNTS)
        self.web_url = web_url.rstrip("/")

    # ── small helpers ─────────────────────────────────────

    def uuid(self) -> UUID:
        return UUID(int=self.rng.getrandbits(128), version=4)

    def day(self, index: int) -> date:
        return self.first_day + timedelta(days=index)

    def hour_on(self, day: date) -> tuple[int, int]:
        """A believable time for a customer to write: mornings and late afternoons."""
        hours = [7, 8, 8, 9, 9, 10, 11, 12, 13, 15, 16, 17, 17, 18, 18, 19, 20, 21]
        if day.weekday() == 4:
            hours = [14, 15, 16, 16, 17, 18, 19, 20, 21]
        return self.rng.choice(hours), self.rng.randrange(0, 60)

    def answer_delay(self, at: datetime, staff: str) -> timedelta:
        """How long the customer waited for a person. Faster in the morning, slower late,
        and quicker in recent weeks as the team got used to one inbox."""
        hour = at.astimezone(TZ).hour
        if hour < 12:
            low, high = 1, 7
        elif hour < 17:
            low, high = 2, 12
        elif hour < 20:
            low, high = 3, 18
        else:
            low, high = 6, 45
        weeks_ago = (self.now - at).days / 7
        slow = 1 + 0.12 * weeks_ago
        if staff != self.fast_staff:
            slow *= 1.4  # Karim is in the kitchen, Huda is out
        return timedelta(minutes=self.rng.uniform(low, high) * slow, seconds=self.rng.randrange(60))

    def say(self, person: Person, at: datetime, body: str, payload: dict | None = None) -> None:
        self.messages.append(
            (person.id, "in", "text", body, payload or {}, at, "received", "", None)
        )

    def auto(self, person: Person, at: datetime, body: str, payload: dict | None = None,
             kind: str = "text") -> None:
        self.messages.append((person.id, "out", kind, body, payload or {}, at, "read", "", None))

    def reply(self, person: Person, at: datetime, body: str, staff: str) -> None:
        self.messages.append(
            (person.id, "out", "text", body, {}, at, "read", self.names[staff], self.users[staff])
        )

    def log(self, subject: str, subject_id: UUID, person: Person, action: str, at: datetime,
            staff: str | None = None, detail: dict | None = None) -> None:
        actor = self.users.get(staff) if staff else None
        name = self.names[staff] if staff else "Customer"
        self.activity.append(
            (subject, subject_id, person.id, action, detail or {}, actor, name, at)
        )

    def close(self, person: Person, at: datetime, staff: str, outcome: str,
              reason: str | None = None) -> None:
        detail = {"outcome": outcome} | ({"reason": reason} if reason else {})
        self.log("conversation", person.id, person, "closed", at, staff, detail)

    # ── the shop itself ───────────────────────────────────

    async def setup(self) -> None:
        conn = self.conn
        await conn.execute(
            "insert into tenant_modules (module_key, enabled_at, enabled_by) "
            "select unnest($1::text[]), $2::timestamptz, 'ALYR setup'",
            ["inbox", "orders", "payments", "bookings", "ledger"],
            _when(self.first_day - timedelta(days=2), 10, 0),
        )
        await conn.execute("insert into shop_settings (weekly_report) values (true)")
        for sort, (name, name_ar, minutes, price) in enumerate(SERVICES):
            service_id = await conn.fetchval(
                "insert into services (name, name_ar, duration_minutes, price, sort) "
                "values ($1, $2, $3, $4, $5) returning id",
                name, name_ar, minutes, price, sort,
            )
            self.services.append((service_id, name, minutes))
        for weekday, opens, closes in HOURS:
            await conn.execute(
                "insert into business_hours (weekday, opens, closes) "
                "values ($1, $2::text::time, $3::text::time)",
                weekday, opens, closes,
            )
        for title, body in SAVED_REPLIES:
            await conn.execute(
                "insert into saved_replies (title, body) values ($1, $2)", title, body
            )
        for email, name, role in TEAM:
            user_id = await conn.fetchval(
                "insert into users (email, name, name_ar) values ($1, $2, $3) "
                "on conflict (email) do update set name = excluded.name, "
                "name_ar = excluded.name_ar returning id",
                email, name, NAMES_AR.get(name, ""),
            )
            await conn.execute(
                "insert into memberships (user_id, role, created_at) values ($1, $2, $3)",
                user_id, role, _when(self.first_day - timedelta(days=2), 10, 0),
            )
            self.users[email] = user_id
            self.names[email] = name
        for sort, (name, name_ar, category, price) in enumerate(PRODUCTS):
            product_id = await conn.fetchval(
                "insert into items (name, name_ar, category, price, sort) "
                "values ($1, $2, $3, $4, $5) returning id",
                name, name_ar, category, price, sort,
            )
            self.products.append((product_id, name, price))
        # Huda's own WhatsApp receives the Sunday report; Yusuf's counter phone does not.
        owner = await conn.fetchval(
            "insert into contacts (phone, name, role, number_id, weekly_report, lang, "
            "catalog_manager) values ($1, 'Huda (owner)', 'staff', $2, true, 'ar', true) "
            "returning id",
            OWNER_PHONE, NUMBER_ID,
        )
        await consent.record(conn, owner, "service", "granted", "weekly_report_setting")
        await conn.execute(
            "insert into contacts (phone, name, role, number_id) "
            "values ($1, 'Yusuf (counter)', 'staff', $2)",
            COUNTER_PHONE, NUMBER_ID,
        )

    async def person(self, index: int, name: str, lang: str, kind: str, first_seen: datetime,
                     staff: str, credit_limit: int = 0) -> Person:
        contact_id = self.uuid()
        await self.conn.execute(
            "insert into contacts (id, phone, wa_user_id, name, lang, credit_limit, number_id, "
            "created_at, assigned_to) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            contact_id, f"974556{index + 1:05d}", f"QA.{91000000000000000000 + index}", name,
            lang, credit_limit, self.number_id, first_seen, self.users[staff],
        )
        # They wrote to the shop first, which is what allows the shop to answer.
        await consent.record(self.conn, contact_id, "service", "granted", "customer_initiated")
        return Person(contact_id, name, lang, staff, kind, first_seen)

    # ── orders ────────────────────────────────────────────

    def basket(self, kind: str, at: datetime) -> list[tuple[UUID, str, int, int]]:
        rng = self.rng
        week = (at.astimezone(TZ).date() - self.first_day).days // 7
        if kind == "cake":
            product = self.products[rng.choice(CAKES[1:])]
            lines = [(*product, 1)]
            if rng.random() < 0.4:
                lines.append((*self.products[4], 1))
            return lines
        if kind == "account":
            return [(*self.products[i], rng.randint(2, 6)) for i in rng.sample(WHOLESALE, 2)]
        lines = []
        for i in rng.sample(EVERYDAY, rng.randint(1, 3)):
            quantity = rng.choice([1, 2, 2, 3, 4, 6]) if i < 4 else rng.randint(1, 2)
            lines.append((*self.products[i], quantity))
        # Cakes catch on as more customers hear of the tastings.
        if rng.random() < 0.06 + 0.02 * week:
            lines.append((*self.products[rng.choice(CAKES)], 1))
        return lines

    async def order(self, person: Person, at: datetime, kind: str = "everyday") -> int:
        """Place one order with its chat and its steps; returns its total, 0 if `at` is
        still to come."""
        rng, conn = self.rng, self.conn
        if at >= self.now:
            return 0
        staff = ADMIN_EMAIL if kind == "cake" else person.staff
        lines = self.basket(kind, at)
        total = sum(price * quantity for _, _, price, quantity in lines)
        self.order_number += 1
        number = self.order_number
        age = self.now - at
        # Collected within a few hours; only this morning's orders are still in the shop.
        if age > timedelta(hours=5):
            status = "cancelled" if rng.random() < 0.03 else "done"
            # Off by default so the captured report and Agent samples stay as they are; a test
            # turns it on to cancel a credit order every Nth order and check the reversal.
            if kind == "account" and CANCEL_ACCOUNT_EVERY and number % CANCEL_ACCOUNT_EVERY == 0:
                status = "cancelled"
        else:
            status = "new" if age < timedelta(minutes=40) else (
                "confirmed" if age < timedelta(hours=2) else "ready")
        # As in the order link: on account, or a payment link that is paid or still open.
        # An open link on a collected order is usually cash at the counter, which ALYR does
        # not record.
        paid_at = at + timedelta(minutes=rng.randint(1, 25))
        if kind == "account":
            payment = "on_account"
        elif (status != "cancelled" and paid_at < self.now
              and rng.random() < (0.72 if kind == "cake" else 0.58)):
            payment = "paid"
        else:
            payment = "unpaid"
        order_id = self.uuid()
        await conn.execute(
            "insert into orders (id, contact_id, number, status, payment, total, created_at, "
            "assigned_to) values ($1, $2, $3, $4, $5, $6, $7, $8)",
            order_id, person.id, number, status, payment, total, at, self.users[staff],
        )
        await conn.executemany(
            "insert into order_items (order_id, item_id, name, price, quantity) "
            "values ($1, $2, $3, $4, $5)",
            [(order_id, pid, name, price, quantity) for pid, name, price, quantity in lines],
        )
        lang = person.lang
        # The customer's own link carries a signed token, like the one the chat sends.
        url = links.order_url(self.web_url, self.slug, QIRFA_TENANT_ID, person.id)
        if kind != "account":
            asked = at - timedelta(minutes=rng.randint(3, 14))
            self.say(person, asked, rng.choice(WANT[lang]))
            self.auto(person, asked + timedelta(seconds=4), LINK[lang].format(url=url),
                      {"choices": [{"id": "order", "title": "Order"}]}, kind="buttons")
        template = "order_received_account" if payment == "on_account" else "order_received_pay"
        self.auto(person, at + timedelta(seconds=3), f"Order #{number} received.",
                  {"template": template, "category": "utility", "sent_as": "text"})
        self.log("order", order_id, person, "placed", at, detail={
            "number": number, "total": fmt_qar(total),
            "payment": "account" if payment == "on_account" else "link",
        })
        last = at
        if status != "new":
            confirmed = at + timedelta(minutes=rng.randint(2, 15))
            self.log("order", order_id, person, "confirmed", confirmed, staff)
            last = confirmed
        if status in ("ready", "done"):
            ready = last + timedelta(minutes=rng.randint(20, 150))
            if ready < self.now:
                self.log("order", order_id, person, "ready", ready, staff)
                self.auto(person, ready, f"Order #{number} is ready.",
                          {"template": "order_ready", "category": "utility", "sent_as": "text"})
                last = ready
        if status == "done":
            done = last + timedelta(minutes=rng.randint(10, 90))
            self.log("order", order_id, person, "done", min(done, self.now), staff)
        cancelled_at = at + timedelta(hours=1)
        reversed_amount = None
        if payment == "on_account":
            # The sale is tied to its order, so the ledger can tell which sale a cancellation
            # takes back (ALY-128).
            await ledger.add_entry(conn, person.id, "sale", total, f"Order #{number}",
                                   "Order link", at, order_id=order_id)
            if status == "cancelled":
                # A cancelled order on account has its sale and the reversal beside it, written
                # by the one function `orders.service.cancel_order` uses, so the demo does not
                # show a debt that was cancelled (ALY-110).
                reversed_amount = await ledger.reverse_sale(
                    conn, order_id, person.id, total, number, self.names[staff], at=cancelled_at
                )
        if status == "cancelled":
            self.log("order", order_id, person, "cancelled", cancelled_at, staff, {
                "number": number,
                "credit_reversed": fmt_qar(reversed_amount) if reversed_amount else None,
            })
        if payment != "on_account":
            paid = payment == "paid"
            await conn.execute(
                "insert into payment_requests (contact_id, amount, status, created_at, "
                "paid_at, order_id) values ($1, $2, $3, $4, $5, $6)",
                person.id, total, "paid" if paid else "pending", at,
                paid_at if paid else None, order_id,
            )
            if paid:
                self.log("order", order_id, person, "paid", paid_at,
                         detail={"amount": fmt_qar(total)})
        # Some customers add a question; a person answers it.
        if kind != "account" and rng.random() < 0.38:
            asked = at + timedelta(minutes=rng.randint(2, 40))
            if asked < self.now - timedelta(minutes=50):
                self.say(person, asked, rng.choice(EXTRA[lang]))
                answered = asked + self.answer_delay(asked, staff)
                self.reply(person, answered, DONE_REPLY[lang], staff)
                last = max(last, answered)
        if kind != "account" and at < self.now - timedelta(hours=2):
            self.close(person, last + timedelta(minutes=rng.randint(5, 60)), staff, "sold")
        person.events.append(at)
        return total

    # ── questions that are not orders ─────────────────────

    def question(self, person: Person, at: datetime, outcome: str | None = None) -> None:
        rng = self.rng
        if at >= self.now - timedelta(hours=1):
            return
        pick = rng.randrange(len(ASK["en"]))
        self.say(person, at, ASK[person.lang][pick])
        answered = at + self.answer_delay(at, person.staff)
        self.reply(person, answered, ANSWER[person.lang][pick], person.staff)
        if rng.random() < 0.5:
            self.say(person, answered + timedelta(minutes=rng.randint(1, 8)), THANKS[person.lang])
        outcome = outcome or rng.choice(["answered"] * 6 + ["lost"] * 2)
        reason = None
        if outcome == "lost":
            reason = rng.choice(["price", "not_available", "no_reply", "went_elsewhere"])
        self.close(person, answered + timedelta(minutes=rng.randint(10, 90)), person.staff,
                   outcome, reason)

    # ── tastings ──────────────────────────────────────────

    def slot(self, day: date) -> datetime | None:
        if day.weekday() == 4:
            return None
        # On the hour only: a tasting is 45 minutes, so slots never overlap.
        for hour in self.rng.sample([11, 12, 16, 17, 18, 19], 6):
            at = _when(day, hour, 0)
            if at not in self.taken_slots:
                self.taken_slots.add(at)
                return at
        return None

    async def tasting(self, person: Person, starts: datetime, made: datetime) -> bool:
        """Book a tasting; returns whether the customer came."""
        rng, conn = self.rng, self.conn
        service_id, service_name, minutes = self.services[0 if rng.random() < 0.8 else 1]
        ends = starts + timedelta(minutes=minutes)
        if ends <= self.now:
            if starts > self.now - timedelta(days=2) and rng.random() < 0.5:
                status = "booked"  # nobody has marked it yet
            else:
                status = rng.choices(["completed", "no_show", "cancelled"], [82, 9, 9])[0]
        else:
            status = "booked"
        reminded = starts - timedelta(hours=2)
        reminded = reminded if status != "cancelled" and reminded < self.now else None
        self.booking_number += 1
        booking_id = self.uuid()
        await conn.execute(
            "insert into bookings (id, number, contact_id, service_id, service_name, starts_at, "
            "ends_at, status, reminded_at, created_at, assigned_to) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            booking_id, self.booking_number, person.id, service_id, service_name, starts, ends,
            status, reminded, made, self.users[ADMIN_EMAIL],
        )
        lang = person.lang
        # The customer's own booking link carries a signed token, like the one the chat sends.
        url = links.booking_url(self.web_url, self.slug, QIRFA_TENANT_ID, person.id)
        asked = made - timedelta(minutes=rng.randint(2, 9))
        self.say(person, asked, BOOK[lang])
        self.auto(person, asked + timedelta(seconds=4), BOOK_LINK[lang].format(url=url))
        self.auto(person, made + timedelta(seconds=3), f"Booking #{self.booking_number} confirmed.",
                  {"template": "booking_confirmed", "category": "utility", "sent_as": "text"})
        self.log("booking", booking_id, person, "booked", made)
        self.close(person, made + timedelta(minutes=rng.randint(5, 30)), person.staff, "booked")
        if reminded:
            self.auto(person, reminded, "A reminder of your tasting today.",
                      {"template": "booking_reminder", "category": "utility", "params": [],
                       "lang": lang}, kind="template")
        if status == "cancelled":
            self.log("booking", booking_id, person, "cancelled",
                     min(made + timedelta(days=1), starts - timedelta(hours=3)))
        if status in ("completed", "no_show"):
            self.log("booking", booking_id, person, status,
                     ends + timedelta(minutes=rng.randint(5, 40)), ADMIN_EMAIL)
        person.events.append(made)
        return status == "completed"

    # ── credit accounts ───────────────────────────────────

    async def account(self, index: int, spec: tuple) -> tuple[Person, list[datetime]]:
        """The account holder, any balance brought forward when ALYR was set up, and the
        mornings they order on account."""
        rng, conn = self.rng, self.conn
        name, lang, limit, habit, opening = spec
        first_seen = _when(self.first_day - timedelta(days=110), 10, 0)
        person = await self.person(200 + index, name, lang, "account", first_seen, OWNER_EMAIL,
                                   credit_limit=limit)
        if opening:
            amount, days_ago = opening
            await ledger.add_entry(conn, person.id, "sale", amount, "Balance brought forward",
                                   self.names[OWNER_EMAIL], self.now - timedelta(days=days_ago))
        weekday = rng.choice([6, 0, 1])  # Sunday, Monday or Tuesday mornings
        mornings = []
        for i in range(DAYS):
            day = self.day(i)
            if day.weekday() != weekday and not (habit == "fortnightly" and day.weekday() == 3):
                continue
            if habit == "silent":
                break  # Ward Events stopped ordering when the balance went unpaid
            if habit == "partial" and rng.random() < 0.6:
                continue
            mornings.append(_when(day, 8, rng.randrange(0, 50)))
        return person, mornings

    async def settle(self, person: Person, habit: str, sales: list[tuple[datetime, int]]) -> None:
        """How the account pays, the reminders it got, and who looks after it."""
        rng, conn = self.rng, self.conn
        if habit == "partial":
            event = self.now - timedelta(days=44)
            await ledger.add_entry(conn, person.id, "sale", 285_000,
                                   "Corporate event: 300 mini pastries", self.names[OWNER_EMAIL],
                                   event)
            await self.pay(person, event + timedelta(days=21), 140_000, "Bank transfer")
        if habit == "prompt":
            for at, total in sales:
                paid = at + timedelta(days=rng.randint(2, 5))
                if paid < self.now:
                    await self.pay(person, paid, total, "Paid by link", link=True)
        if habit in ("fortnightly", "monthly"):
            every = 14 if habit == "fortnightly" else 28
            for pay_day in range(every, DAYS, every):
                cut = _when(self.day(pay_day), 0, 0) - timedelta(days=5)
                due = sum(t for at, t in sales if cut - timedelta(days=every) <= at < cut)
                when = _when(self.day(pay_day), 11, rng.randrange(0, 59))
                if due > 0 and when < self.now:
                    await self.pay(person, when, due,
                                   "Bank transfer" if habit == "monthly" else "Paid by link",
                                   link=habit == "fortnightly")
        promised, last_reminded, count = None, None, 0
        if habit == "promised":
            for days_ago in (19, 5):
                last_reminded = self.now - timedelta(days=days_ago, hours=rng.randint(0, 5))
                count += 1
                self.remind(person, last_reminded, "payment_reminder_overdue")
            promise_at = self.now - timedelta(days=2, hours=3)
            self.say(person, promise_at, "سأدفع خلال أسبوع", {"reply_id": "promise"})
            promised = (promise_at + timedelta(days=7)).date()
        if habit == "silent":
            for days_ago, template in ((40, "payment_reminder_overdue"),
                                       (24, "payment_reminder_overdue"),
                                       (9, "payment_reminder_final")):
                last_reminded = self.now - timedelta(days=days_ago, hours=rng.randint(0, 5))
                count += 1
                self.remind(person, last_reminded, template)
        if habit == "partial":
            last_reminded = self.now - timedelta(days=8)
            count = 1
            self.remind(person, last_reminded, "payment_reminder")
        await conn.execute(
            "insert into ledger_accounts (contact_id, promised_until, last_reminded_at, "
            "reminder_count, assigned_to) values ($1, $2, $3, $4, $5)",
            person.id, promised, last_reminded, count, self.users[OWNER_EMAIL],
        )

    async def pay(self, person: Person, at: datetime, amount: int, note: str,
                  link: bool = False) -> None:
        if link:
            await self.conn.execute(
                "insert into payment_requests (contact_id, amount, status, created_at, paid_at) "
                "values ($1, $2, 'paid', $3, $4)",
                person.id, amount, at - timedelta(minutes=self.rng.randint(5, 120)), at,
            )
        await ledger.add_entry(self.conn, person.id, "payment", amount, note,
                               self.names[OWNER_EMAIL], at)
        self.log("account", person.id, person, "paid", at, None if link else OWNER_EMAIL,
                 detail={"amount": fmt_qar(amount)})

    def remind(self, person: Person, at: datetime, template: str) -> None:
        self.auto(person, at, "A reminder of your account with Qirfa Bakery.",
                  {"template": template, "category": "utility", "params": [], "lang": person.lang},
                  kind="template")
        self.log("account", person.id, person, "reminded", at, OWNER_EMAIL)

    # ── the eight weeks ───────────────────────────────────

    async def run(self) -> dict:
        rng = self.rng
        await self.setup()
        staff_for = [AGENT_EMAIL] * 13 + [ADMIN_EMAIL] * 4 + [OWNER_EMAIL] * 1
        people: list[Person] = []
        for index, (name, lang) in enumerate(PEOPLE):
            if index in NEW:
                seen = self.day(rng.randint(DAYS - 14, DAYS - 2))
            elif index in OCCASIONAL:
                # Word of mouth: more first orders in later weeks.
                seen = self.day(int((DAYS - 3) * rng.random() ** 0.6))
            elif index in REGULARS:
                # Regulars came over the first four weeks and stayed.
                seen = self.day(rng.randint(0, 27))
            else:
                seen = self.day(rng.randint(0, 6))
            kind = ("regular" if index in REGULARS else "quiet" if index in QUIET
                    else "occasional" if index in OCCASIONAL else "new" if index in NEW else "ask")
            first = _when(seen, *self.hour_on(seen))
            people.append(await self.person(index, name, lang, kind, first,
                                            rng.choice(staff_for)))

        # Orders, from a smooth curve: about 4 a day in the first week to about 10 in the
        # last, fewer on Friday (open from 2 pm), more on Thursday and Saturday. Each
        # newcomer's first order is on the day they first wrote; the rest of the day's
        # orders are repeat orders, mostly from regulars.
        intents: list[tuple[datetime, Person, str]] = []
        counts = {p.id: 0 for p in people}
        # Quiet regulars stopped more than a month ago (the research rule: none in 30 days).
        cutoff = {p.id: self.day(rng.randint(17, 24)) for p in people if p.kind == "quiet"}
        weight = {"regular": 7, "quiet": 5, "occasional": 1, "new": 1}
        cap = {"regular": 99, "quiet": 99, "occasional": 3, "new": 2}
        for i in range(DAYS):
            day = self.day(i)
            factor = {4: 0.55, 3: 1.2, 5: 1.15}.get(day.weekday(), 1.0)
            target = round((4 + 6 * i / (DAYS - 1)) * factor) + rng.choice([-1, 0, 0, 1])
            firsts = [p for p in people if p.kind != "ask"
                      and p.first_seen.astimezone(TZ).date() == day]
            for person in firsts:
                intents.append((person.first_seen + timedelta(minutes=10), person, "everyday"))
                counts[person.id] += 1
            for _ in range(max(target - len(firsts), 0)):
                pool = [p for p in people if p.kind in weight
                        and p.first_seen.astimezone(TZ).date() < day
                        and counts[p.id] < cap[p.kind]
                        and (p.kind != "quiet" or day < cutoff[p.id])]
                if not pool:
                    break
                person = rng.choices(pool, [weight[p.kind] for p in pool])[0]
                intents.append((_when(day, *self.hour_on(day)), person, "everyday"))
                counts[person.id] += 1
        # Questions that were not orders.
        for person in people:
            if rng.random() < (0.9 if person.kind == "ask" else 0.3):
                start = (person.first_seen.astimezone(TZ).date() - self.first_day).days
                day = self.day(rng.randint(start, DAYS - 1))
                lost = person.kind == "ask" and rng.random() < 0.4
                at = max(_when(day, *self.hour_on(day)), person.first_seen + timedelta(hours=1))
                self.question(person, at, outcome="lost" if lost else None)

        # Tastings: a few a week at first, more as word got round, and some booked for
        # the next two weeks. Most who came then ordered a celebration cake.
        tastings: list[tuple[datetime, datetime, Person]] = []
        for week in range(8):
            for _ in range(4 + week // 2 + rng.randint(0, 2)):
                starts = self.slot(self.day(week * 7 + rng.randint(0, 6)))
                if starts is None:
                    continue
                pool = [p for p in people if p.kind in ("regular", "occasional", "new")
                        and p.first_seen < starts - timedelta(days=1)]
                if not pool:
                    continue
                person = rng.choice(pool)
                made = max(person.first_seen + timedelta(hours=1),
                           starts - timedelta(days=rng.randint(1, 6), hours=rng.randint(0, 5)))
                if made < self.now:
                    tastings.append((made, starts, person))
        for i in range(1, 15):
            if rng.random() < 0.8:
                starts = self.slot(self.today + timedelta(days=i))
                made = self.now - timedelta(hours=rng.randint(2, 70))
                pool = [p for p in people if p.kind != "ask"
                        and p.first_seen < made - timedelta(hours=1)]
                if starts and pool:
                    tastings.append((made, starts, rng.choice(pool)))
        for made, starts, person in sorted(tastings, key=lambda t: t[0]):
            if await self.tasting(person, starts, made) and rng.random() < 0.6:
                cake = starts + timedelta(days=rng.randint(1, 4), minutes=15)
                intents.append((cake, person, "cake"))

        # Right now: two orders that came in a little while ago and nobody has confirmed.
        regulars = [p for p in people if p.kind == "regular"]
        for minutes_ago in (18, 33):
            intents.append((self.now - timedelta(minutes=minutes_ago), rng.choice(regulars),
                            "everyday"))

        accounts = []
        for index, spec in enumerate(ACCOUNTS):
            person, mornings = await self.account(index, spec)
            accounts.append((person, spec[3]))
            intents += [(at, person, "account") for at in mornings]

        # Placed in time order, so order numbers rise with time as they do in the shop.
        sales: dict[UUID, list[tuple[datetime, int]]] = {}
        for at, person, kind in sorted(intents, key=lambda x: x[0]):
            total = await self.order(person, at, kind)
            if total and kind == "account":
                sales.setdefault(person.id, []).append((at, total))
        for person, habit in accounts:
            await self.settle(person, habit, sales.get(person.id, []))

        # Right now: three customers waiting for an answer, and one chat being answered.
        waiting = rng.sample([p for p in people if p.kind in ("regular", "new")], 3)
        for minutes, person in zip((14, 27, 48), waiting, strict=True):
            at = self.now - timedelta(minutes=minutes)
            self.say(person, at, rng.choice(ASK[person.lang]))
        return await self.finish(people, waiting)

    async def finish(self, people: list[Person], waiting: list[Person]) -> dict:
        conn = self.conn
        self.messages.sort(key=lambda m: m[5])
        await conn.executemany(
            "insert into messages (contact_id, direction, kind, body, payload, created_at, status, "
            "sent_by, sent_by_user) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            self.messages,
        )
        await conn.executemany(
            "insert into activity (subject, subject_id, contact_id, action, detail, actor_id, "
            "actor_name, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)",
            self.activity,
        )
        # Each conversation's state follows its last message: the three waiting are open
        # and unread, a chat from the last two hours is open, every other one is closed.
        await conn.execute(
            "update contacts c set last_inbound_at = m.last_in, inbox_read_at = m.last_any, "
            "inbox_status = case when m.last_any > $1::timestamptz - interval '2 hours' "
            "then 'open' else 'closed' end "
            "from (select contact_id, max(created_at) filter (where direction = 'in') as last_in, "
            "max(created_at) as last_any from messages group by contact_id) m "
            "where m.contact_id = c.id and c.role = 'customer'",
            self.now,
        )
        await conn.execute(
            "update contacts set inbox_status = 'open', "
            "inbox_read_at = last_inbound_at - interval '1 minute' where id = any($1)",
            [p.id for p in waiting],
        )
        # Last week's Sunday report, as it was sent.
        # The last complete week before this copy's own "now", not the clock's.
        week = report.last_full_week(self.now, await report._timezone(conn))
        built = await report.build(conn, week)
        sent = datetime.combine(week + timedelta(days=7), time(report.SEND_HOUR), TZ)
        await conn.execute(
            "insert into weekly_reports (week_start, sections, sent_at, created_at) "
            "values ($1, $2, $3, $3)",
            week, built["sections"], sent,
        )
        return {
            "customers": len(people) + self.account_holders,
            "orders": self.order_number - 1000,
            "bookings": self.booking_number - 100,
            "messages": len(self.messages),
        }


async def ensure_qirfa_tenant(owner_dsn: str) -> None:
    """The business row, its client and its private test line. Needs the owner role: the
    app role cannot write the global tables."""
    conn = await asyncpg.connect(owner_dsn)
    try:
        started = datetime.now(UTC) - timedelta(days=DAYS + 2)
        await conn.execute(
            "insert into tenants (id, name, name_ar, slug, business_type, area, onboarding_way, "
            "onboarding_step, onboarded_at, created_at) "
            "values ($1, 'Qirfa Bakery', 'مخبز قرفة', $2, 'restaurant', 'Bin Mahmoud', "
            "'assisted', 'golive', $3, $3) "
            "on conflict (id) do update set slug = $2, onboarded_at = $3, created_at = $3",
            QIRFA_TENANT_ID, QIRFA_SLUG, started,
        )
        await conn.execute(
            "insert into channel_numbers (number_id, tenant_id, channel) "
            "values ($1, $2, 'simulator') on conflict (number_id) do nothing",
            NUMBER_ID, QIRFA_TENANT_ID,
        )
        if not await conn.fetchval("select client_id from tenants where id = $1", QIRFA_TENANT_ID):
            client_id = await conn.fetchval(
                "insert into clients (name, contact_name, contact_email) "
                "values ('Qirfa Bakery', 'Huda Rahim', $1) returning id",
                OWNER_EMAIL,
            )
            await conn.execute(
                "update tenants set client_id = $2 where id = $1", QIRFA_TENANT_ID, client_id
            )
    finally:
        await conn.close()


async def reset_qirfa(
    db: Database, now: datetime | None = None, seed: int = 2026, web_url: str = ""
) -> dict:
    """Wipe Qirfa Bakery's data and write eight fresh weeks ending `now`."""
    now = now or datetime.now(UTC)
    async with db.tenant(QIRFA_TENANT_ID) as conn:
        await conn.execute(
            "delete from sessions where tenant_id = $1", QIRFA_TENANT_ID
        )
        for table in ("weekly_reports", "agent_snoozes", "bookings", "services", "business_hours",
                      "saved_replies", "memberships", "jobs", "messages", "processed_messages",
                      "order_items", "payment_requests", "orders", "items", "item_categories",
                      "ledger_entries", "ledger_accounts", "contacts", "tenant_modules",
                      "shop_settings", "shop_features"):
            await conn.execute(f"delete from {table}")
        web_url = web_url or get_settings().public_web_url
        return await Bakery(conn, now, random.Random(seed), web_url).run()


async def main() -> None:
    settings = get_settings()
    await ensure_qirfa_tenant(settings.migration_url)
    db = Database(settings.database_url)
    await db.connect()
    try:
        counts = await reset_qirfa(db)
    finally:
        await db.close()
    print(
        "sample business ready: Qirfa Bakery, "
        + ", ".join(f"{v} {k}" for k, v in counts.items())
        + f". Sign in as {OWNER_EMAIL} (owner), {ADMIN_EMAIL} (admin) or {AGENT_EMAIL} (agent)."
    )


if __name__ == "__main__":
    asyncio.run(main())
