"""Two more sample businesses for the ALYR Agent's screens (ALY-99): a women's salon, and
an AC repair and maintenance company that books visits to villas and offices. With Qirfa
Bakery (`seed_qirfa.py`) they are the Bakery / Salon / Home services switch on the public
site's figure (`03-build-brief.md` §2). The third sample was a dental clinic; the founder
replaced it on 17 Oct, because clinic appointments may count as health data under
Qatar's PDPPL and the lawyer has not looked at it yet. The clinic preset stays in the
product.

Weeks of fictional activity: visits, no-shows (two customers have missed twice and are
booked again), late cancellations, reminders, regulars who come back and a few who have
gone quiet, questions answered in the chat, and a team. Every name is a first name and
an initial, or invented. Each business has only a private simulator line and no job is
queued, so nothing reaches a phone.

Run with: uv run python -m alyr.seed_bookings [salon|homeservices]   (both when omitted)
`days=0` gives an empty business, and a few days a business in its first week, for
those states of the dashboard.
"""

import asyncio
import random
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from uuid import UUID

import asyncpg

from alyr import presets
from alyr.config import get_settings
from alyr.core import consent, links
from alyr.db import Database
from alyr.seed_qirfa import NAMES_AR, PEOPLE, THANKS, TZ, Bakery, Person, _when

# Saturday to Thursday in PostgreSQL's numbering is 6, 0..4; Friday is 5.
BOOK = {"en": ["Can I book for tomorrow?", "Do you have a slot this evening?",
               "I'd like to book please", "Same as last time please"],
        "ar": ["أقدر أحجز لبكرة؟", "عندكم موعد اليوم المسا؟", "أبي أحجز لو سمحت",
               "نفس المرة الماضية لو سمحت"]}
BOOK_LINK = {"en": "Choose a time here: {url}", "ar": "اختر الموعد من هنا: {url}"}
# Questions customers ask, and the team's answers, per trade.
QUESTIONS = {
    "salon": {
        "en": [("Do you do bridal hair?", "Yes, we book a trial first. Shall I send the times?"),
               ("Is there parking?", "Yes, right in front of the salon."),
               ("How long does colour take?", "About an hour and a half."),
               ("Can my daughter come too?", "Of course, kids' cuts are 30 minutes."),
               ("Do you take card?", "Yes, card and cash.")],
        "ar": [("تسوون تسريحة عروس؟", "نعم، نحجز تجربة أولاً. أرسل لك المواعيد؟"),
               ("فيه مواقف؟", "نعم، قدام الصالون مباشرة."),
               ("كم تاخذ الصبغة؟", "حوالي ساعة ونص."),
               ("بنتي تقدر تجي معي؟", "أكيد، قص الأطفال نص ساعة."),
               ("تقبلون البطاقة؟", "نعم، بطاقة وكاش.")],
    },
    "home": {
        "en": [("Can you come today? The majlis AC is not cooling.",
                "Yes, a technician can be there this afternoon. Shall I book it?"),
               ("How much is a gas top-up?",
                "QAR 180 for a split unit; he checks for leaks first."),
               ("Do you clean the ducts too?", "Yes. A villa takes about three hours."),
               ("Do you do yearly contracts?", "Yes, four visits a year. I can send the details."),
               ("Will the technician call before coming?", "Yes, he calls 30 minutes before.")],
        "ar": [("تقدرون تجون اليوم؟ مكيف المجلس ما يبرد.", "نعم، يقدر الفني يجي العصر. أحجز لك؟"),
               ("كم تعبئة الغاز؟", "180 ريال للمكيف السبليت، ويفحص التسريب أولاً."),
               ("تنظفون مجاري الهواء؟", "نعم، الفيلا تاخذ حوالي ثلاث ساعات."),
               ("عندكم عقد سنوي؟", "نعم، أربع زيارات في السنة. أرسل لك التفاصيل."),
               ("الفني يتصل قبل ما يجي؟", "نعم، يتصل قبلها بنص ساعة.")],
    },
    "clinic": {
        "en": [("Do you accept insurance?", "We do; bring your card and we check it at the desk."),
               ("Is the cleaning painful?",
                "Most people find it comfortable. It takes 45 minutes."),
               ("Can I come after work?", "Yes, we are open 4 to 9 pm."),
               ("Do you see children?", "Yes, from age 4."),
               ("Where exactly are you?", "Al Sadd, above the pharmacy, second floor.")],
        "ar": [("تقبلون التأمين؟", "نعم، أحضر البطاقة ونتحقق منها في الاستقبال."),
               ("التنظيف يوجع؟", "أغلب الناس يجدونه مريحاً، ويستغرق 45 دقيقة."),
               ("أقدر أجي بعد الدوام؟", "نعم، نفتح من 4 إلى 9 مساءً."),
               ("تستقبلون الأطفال؟", "نعم، من عمر 4 سنوات."),
               ("وين مكانكم بالضبط؟", "السد، فوق الصيدلية، الطابق الثاني.")],
    },
}


# Women's first names and an initial, invented, for the women's salon.
WOMEN = tuple(
    (name, lang) for name, lang in PEOPLE
    if name.split()[0] in {
        "Maha", "Lina", "Rania", "Priya", "Sara", "Noor", "Dana", "Farah", "Mona", "Grace",
        "Reem", "Jana", "Kavya", "Hind", "Leila", "Aisha", "Nadia", "Yara", "Sophie", "Ola",
        "Rawan", "Asma", "Fatma", "Huda", "Ines", "Amal", "Chloe", "Meera", "Salma", "Elena",
        "Nour", "Lama", "Rasha", "Tala", "Ghada", "Isabel", "Deema", "Hiba", "Anya", "Nada",
        "Mariam", "Bushra", "Wafa", "Zainab", "Razan", "Lea", "Sana", "Basma", "Hala", "Dalia",
    }
)


@dataclass(frozen=True)
class Sample:
    key: str
    tenant_id: UUID
    slug: str
    name: str
    name_ar: str
    business_type: str
    area: str
    team: tuple  # (email, name, role); owner first, agent last
    owner_phone: str
    phone_prefix: str
    per_day: tuple  # visits a day at the start of the weeks and at the end
    seed: int
    # Who comes: (name, language). A women's salon serves women.
    people: tuple = ()
    # Its own menu, when the preset's does not fit: (name, Arabic, minutes, dirhams).
    services: tuple = ()
    # How often one person can come back, and how many visits one person makes at most
    # in the weeks seeded. A salon's regulars come every few weeks; a dental patient
    # comes for a consultation and a follow-up, then not for months.
    min_gap_days: int = 10
    max_visits: int = 99
    # What the booking says, for a business that goes to its customers.
    notes: tuple = ()
    # Customers on account: (name, language, credit limit, monthly contract in dirhams,
    # how they pay). The AC company's offices and compounds.
    accounts: tuple = ()
    # How visits that are over turned out: came, no-show, cancelled (weights).
    outcomes: tuple = (86, 9, 5)


SALON = Sample(
    "salon", UUID("0a1f0000-0000-4000-8000-0000000501a0"), "dafira", "Dafira Salon",
    "صالون ضفيرة", "salon", "Al Waab",
    (("lamees@dafira.example", "Lamees Adel", "owner"),
     ("sana@dafira.example", "Sana Rao", "admin"),
     ("hiba@dafira.example", "Hiba Taher", "agent")),
    "97455679001", "9745567", (5, 9), 31,
    people=WOMEN,
    services=(
        ("Haircut and blow-dry", "قص وتسشوار", 60, 18_000),
        ("Blow-dry", "تسشوار", 45, 12_000),
        ("Hair colour", "صبغة شعر", 120, 35_000),
        ("Manicure and pedicure", "مانيكير وباديكير", 60, 15_000),
        ("Hair treatment", "علاج الشعر", 60, 22_000),
    ),
    min_gap_days=7,
)
HOME = Sample(
    "homeservices", UUID("0a1f0000-0000-4000-8000-0000000ac0a1"), "zilal",
    "Zilal Cooling", "ظلال للتكييف", "home", "Al Rayyan",
    (("adel@zilal.example", "Adel Karim", "owner"),
     ("ritu@zilal.example", "Ritu Menon", "admin"),
     ("arun@zilal.example", "Arun Pillai", "agent"),
     ("bilal@zilal.example", "Bilal Rafiq", "agent")),
    "97455699001", "9745569", (3, 5), 53,
    services=(
        ("AC service, split unit", "صيانة مكيف سبليت", 90, 25_000),
        ("AC repair visit", "زيارة إصلاح مكيف", 60, 15_000),
        ("Gas top-up", "تعبئة غاز المكيف", 60, 18_000),
        ("Duct cleaning, villa", "تنظيف مجاري الهواء، فيلا", 180, 60_000),
        ("Yearly maintenance visit", "زيارة الصيانة السنوية", 120, 0),
    ),
    # An AC is serviced every few months; within eight weeks a household comes back only
    # for a repair after a service, or the follow-up after a gas top-up.
    min_gap_days=21,
    max_visits=2,
    notes=(
        ("Villa, 4 split units", "فيلا، 4 مكيفات سبليت"),
        ("Majlis AC not cooling", "مكيف المجلس ما يبرد"),
        ("Bedroom unit leaking water", "مكيف غرفة النوم يسرّب ماء"),
        ("Flat, 2 units, 3rd floor", "شقة، مكيفان، الطابق الثالث"),
        ("Gate code at the guard house", "رمز البوابة عند الحارس"),
        ("Please call on arrival", "اتصلوا عند الوصول"),
    ),
    accounts=(
        ("Palm Grove Compound", "en", 2_000_000, 450_000, "prompt"),
        ("Crescent Tower Offices", "ar", 1_500_000, 320_000, "late"),
        ("Bayview School", "en", 1_200_000, 280_000, "partial"),
    ),
    # A technician who finds nobody home is rarer than an empty chair at a salon.
    outcomes=(91, 5, 4),
)
SAMPLES = {s.key: s for s in (SALON, HOME)}


class Diary(Bakery):
    """A business that runs on bookings: the bakery's helpers, its own week."""

    def __init__(self, conn, now, rng, web_url, sample: Sample, days: int) -> None:
        super().__init__(conn, now, rng, web_url)
        self.sample = sample
        self.days = days
        self.first_day = self.today - timedelta(days=max(days, 1) - 1)
        self.number_id = f"sim-{sample.slug}"
        self.slug = sample.slug
        self.owner, self.admin = sample.team[0][0], sample.team[1][0]
        self.agents = [t[0] for t in sample.team if t[2] == "agent"]
        self.agent = self.agents[0]
        self.fast_staff = self.agent
        self.account_holders = 0
        self.preset = presets.PRESET_BY_KEY[sample.business_type]
        self.opening: dict[int, list[tuple[time, time]]] = {}

    async def setup(self) -> None:
        conn, sample = self.conn, self.sample
        await conn.execute(
            "insert into tenant_modules (module_key, enabled_at, enabled_by) "
            "select unnest($1::text[]), $2::timestamptz, 'ALYR setup'",
            [*self.preset.modules, *(["ledger"] if sample.accounts else [])],
            _when(self.first_day - timedelta(days=2), 10, 0),
        )
        await conn.execute("insert into shop_settings (weekly_report) values (true)")
        menu = sample.services or tuple(
            (svc.name, svc.name_ar, svc.minutes, svc.price) for svc in self.preset.services
        )
        for sort, (name, name_ar, minutes, price) in enumerate(menu):
            service_id = await conn.fetchval(
                "insert into services (name, name_ar, duration_minutes, price, sort) "
                "values ($1, $2, $3, $4, $5) returning id",
                name, name_ar, minutes, price, sort,
            )
            self.services.append((service_id, name, minutes))
        for weekday, opens, closes in self.preset.hours:
            await conn.execute(
                "insert into business_hours (weekday, opens, closes) "
                "values ($1, $2::text::time, $3::text::time)",
                weekday, opens, closes,
            )
            self.opening.setdefault(weekday, []).append(
                (time.fromisoformat(opens), time.fromisoformat(closes))
            )
        for email, name, role in sample.team:
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
        owner = await conn.fetchval(
            "insert into contacts (phone, name, role, number_id, weekly_report, lang) "
            "values ($1, $2, 'staff', $3, true, 'ar') returning id",
            sample.owner_phone, f"{sample.team[0][1].split()[0]} (owner)", self.number_id,
        )
        await consent.record(conn, owner, "service", "granted", "weekly_report_setting")

    async def person(self, index, name, lang, kind, first_seen, staff, credit_limit=0):
        contact_id = self.uuid()
        await self.conn.execute(
            "insert into contacts (id, phone, wa_user_id, name, lang, number_id, created_at, "
            "assigned_to) values ($1, $2, $3, $4, $5, $6, $7, $8)",
            contact_id, f"{self.sample.phone_prefix}{index + 1:04d}",
            f"QA.{92000000000000000000 + self.sample.seed * 1000 + index}", name, lang,
            self.number_id, first_seen, self.users[staff],
        )
        await consent.record(self.conn, contact_id, "service", "granted", "customer_initiated")
        return Person(contact_id, name, lang, staff, kind, first_seen)

    def periods(self, day) -> list[tuple[datetime, datetime]]:
        weekday = (day.weekday() + 1) % 7
        return [
            (datetime.combine(day, opens, TZ), datetime.combine(day, closes, TZ))
            for opens, closes in self.opening.get(weekday, [])
        ]

    async def run(self) -> dict:
        rng = self.rng
        await self.setup()
        if self.days == 0:
            return await self.finish([], [])
        staff_for = [self.agent] * 6 + [self.admin] * 3 + [self.owner]
        pool = list(self.sample.people or PEOPLE)
        names = rng.sample(pool, len(pool))
        people: list[Person] = []
        regulars = 14 if self.sample.max_visits > 2 else 0
        for index, (name, lang) in enumerate(names):
            if index < regulars:
                kind, seen = "regular", rng.randint(0, max(self.days // 3, 0))
            elif index < regulars + 4 and regulars:
                kind, seen = "quiet", rng.randint(0, 3)
            elif index < len(names) - 12:
                kind, seen = "occasional", int((self.days - 1) * rng.random() ** 0.6)
            else:
                kind, seen = "new", rng.randint(max(self.days - 14, 0), self.days - 1)
            day = self.day(min(seen, self.days - 1))
            people.append(await self.person(
                index, name, lang, kind, _when(day, *self.hour_on(day)), rng.choice(staff_for)
            ))

        # The diary: each open day filled in order, one customer at a time.
        visits: list[tuple[datetime, Person, int]] = []
        cutoff = {p.id: self.day(rng.randint(max(self.days - 40, 0), max(self.days - 32, 0)))
                  for p in people if p.kind == "quiet"}
        last_visit: dict = {}
        visits_of: dict = {}
        weight = {"regular": 6, "quiet": 4, "occasional": 1, "new": 2}
        start, end = self.sample.per_day
        for i in range(self.days + 14):
            day = self.first_day + timedelta(days=i)
            share = 1.0
            factor = {3: 1.15, 5: 1.1, 4: 0.7}.get(day.weekday(), 1.0)
            span = max(self.days - 1, 1)
            target = round((start + (end - start) * min(i, span) / span) * factor * share)
            target += rng.choice([-1, 0, 0, 1])
            slots = []
            for opens, closes in self.periods(day):
                cursor = opens + timedelta(minutes=rng.choice([0, 15, 30, 45]))
                while cursor < closes:
                    slots.append(cursor)
                    cursor += timedelta(minutes=rng.choice([30, 45, 60, 60, 75, 90]))
            for starts in sorted(rng.sample(slots, min(len(slots), max(target, 0)))):
                pool = [
                    p for p in people
                    if p.first_seen.astimezone(TZ).date() <= day
                    and (p.kind != "quiet" or day < cutoff[p.id])
                    and (day - last_visit.get(p.id, day - timedelta(days=99))).days
                    >= self.sample.min_gap_days
                    and visits_of.get(p.id, 0) < self.sample.max_visits
                ]
                if not pool:
                    break
                person = rng.choices(pool, [weight[p.kind] for p in pool])[0]
                last_visit[person.id] = day
                visits_of[person.id] = visits_of.get(person.id, 0) + 1
                service = rng.choices(range(len(self.services)),
                                      [5, 3, 2, 1, 1][: len(self.services)])[0]
                visits.append((starts.astimezone(UTC), person, service))
        # Keep visits from overlapping: each starts once the one before it has ended.
        visits.sort(key=lambda v: v[0])
        placed: list[tuple[datetime, datetime, Person, int]] = []
        for starts, person, service in visits:
            minutes = self.services[service][2]
            if placed and starts < placed[-1][1]:
                continue
            placed.append((starts, starts + timedelta(minutes=minutes), person, service))

        # Two regulars missed twice in the last two months and are booked again.
        regulars = [p for p in people if p.kind == "regular"]
        twice = set(p.id for p in rng.sample(regulars, min(2, len(regulars))))
        missed: dict = {}

        made_list = []
        for starts, ends, person, service in placed:
            lead = timedelta(hours=rng.choice([2, 5, 20, 26, 50, 75, 120, 200]))
            made = max(starts - lead, person.first_seen + timedelta(minutes=30),
                       datetime.combine(self.first_day, time(7), TZ).astimezone(UTC))
            if made >= starts:
                made = starts - timedelta(minutes=45)
            # A visit whose booking would be made after now is not booked yet: the days
            # ahead fill as the lead times say, as a real diary does.
            made_list.append((made, starts, ends, person, service))
        made_list.sort(key=lambda v: v[0])

        for made, starts, ends, person, service in made_list:
            if made >= self.now:
                continue
            status = "booked"
            if ends <= self.now:
                if person.id in twice and missed.get(person.id, 0) < 2 and \
                        self.now - starts < timedelta(days=60):
                    status = "no_show"
                    missed[person.id] = missed.get(person.id, 0) + 1
                elif self.now - ends < timedelta(hours=3) and rng.random() < 0.5:
                    status = "booked"  # nobody has marked it yet
                else:
                    status = rng.choices(["completed", "no_show", "cancelled"],
                                         list(self.sample.outcomes))[0]
            await self.visit(person, service, made, starts, ends, status)
        # The two who missed twice have a visit booked in the next week.
        for person in people:
            if person.id in twice and missed.get(person.id, 0) >= 2:
                day = self.today + timedelta(days=rng.randint(1, 6))
                for _, closes in self.periods(day):
                    starts = (closes - timedelta(minutes=60)).astimezone(UTC)
                    if all(not (s < starts + timedelta(minutes=45) and starts < e)
                           for s, e in self.taken_ranges):
                        await self.visit(person, 0, self.now - timedelta(hours=20), starts,
                                         starts + timedelta(minutes=self.services[0][2]), "booked")
                        break

        for person in people:
            if self.rng.random() < 0.35:
                start_day = (person.first_seen.astimezone(TZ).date() - self.first_day).days
                day = self.day(rng.randint(max(start_day, 0), self.days - 1))
                at = max(_when(day, *self.hour_on(day)), person.first_seen + timedelta(hours=1))
                self.question(person, at)
        waiting = rng.sample([p for p in people if p.kind in ("regular", "occasional")], 2)
        for minutes_ago, person in zip((16, 37), waiting, strict=True):
            asked, _ = rng.choice(QUESTIONS[self.sample.business_type][person.lang])
            self.say(person, self.now - timedelta(minutes=minutes_ago), asked)
        for index, account in enumerate(self.sample.accounts):
            await self.contract(index, account)
        return await self.finish(people, waiting)

    async def contract(self, index: int, spec: tuple) -> None:
        """A customer on account: a monthly maintenance contract invoiced on the first,
        paid on time, late, or in part."""
        from alyr.modules.ledger import service as ledger

        name, lang, limit, monthly, habit = spec
        rng, conn = self.rng, self.conn
        first_seen = _when(self.first_day - timedelta(days=120), 10, 0)
        person = await self.person(300 + index, name, lang, "account", first_seen, self.owner)
        await conn.execute("update contacts set credit_limit = $2 where id = $1", person.id, limit)
        months = []
        day = self.today.replace(day=1)
        for _ in range(4):
            months.append(day)
            day = (day - timedelta(days=1)).replace(day=1)
        for start in sorted(months):
            at = _when(start, 9, 0)
            if at >= self.now:
                continue
            await ledger.add_entry(conn, person.id, "sale", monthly,
                                   f"Maintenance contract, {start:%B}", self.names[self.owner], at)
            paid_after = {"prompt": 6, "late": 45, "partial": 20}[habit]
            paid = at + timedelta(days=paid_after + rng.randint(0, 4))
            if paid < self.now:
                amount = monthly if habit != "partial" else monthly // 2
                await ledger.add_entry(conn, person.id, "payment", amount, "Bank transfer",
                                       self.names[self.owner], paid)
        await conn.execute(
            "insert into ledger_accounts (contact_id, assigned_to) values ($1, $2)",
            person.id, self.users[self.owner],
        )

    def question(self, person: Person, at: datetime, outcome: str | None = None) -> None:
        """A question in this trade's words, answered by a person after a while."""
        rng = self.rng
        if at >= self.now - timedelta(hours=1):
            return
        asked, answer = rng.choice(QUESTIONS[self.sample.business_type][person.lang])
        self.say(person, at, asked)
        answered = at + self.answer_delay(at, person.staff)
        self.reply(person, answered, answer, person.staff)
        if rng.random() < 0.5:
            self.say(person, answered + timedelta(minutes=rng.randint(1, 8)), THANKS[person.lang])
        outcome = outcome or rng.choice(["answered"] * 5 + ["booked", "lost"])
        reason = rng.choice(["price", "not_available", "no_reply"]) if outcome == "lost" else None
        self.close(person, answered + timedelta(minutes=rng.randint(10, 90)), person.staff,
                   outcome, reason)

    @property
    def taken_ranges(self) -> list:
        return getattr(self, "_taken", [])

    async def visit(self, person: Person, service: int, made: datetime, starts: datetime,
                    ends: datetime, status: str) -> None:
        rng, conn = self.rng, self.conn
        if status == "booked":
            self._taken = [*self.taken_ranges, (starts, ends)]
        service_id, service_name, _ = self.services[service]
        reminded = starts - timedelta(hours=2)
        reminded = reminded if status != "cancelled" and reminded < self.now else None
        self.booking_number += 1
        booking_id = self.uuid()
        if self.sample.business_type == "home":
            staff = rng.choice(self.agents)  # the technician who goes
        elif self.sample.business_type == "salon":
            staff = rng.choice([self.owner, self.admin, self.admin])
        else:
            staff = self.owner
        note = ""
        if self.sample.notes and rng.random() < 0.6:
            note = rng.choice(self.sample.notes)[1 if person.lang == "ar" else 0]
        await conn.execute(
            "insert into bookings (id, number, contact_id, service_id, service_name, starts_at, "
            "ends_at, status, reminded_at, created_at, assigned_to, note) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
            booking_id, self.booking_number, person.id, service_id, service_name, starts, ends,
            status, reminded, made, self.users[staff], note,
        )
        lang = person.lang
        asked = made - timedelta(minutes=rng.randint(2, 9))
        self.say(person, asked, rng.choice(BOOK[lang]))
        # The customer's own booking link carries a signed token, like the one the chat sends.
        url = links.booking_url(self.web_url, self.slug, self.sample.tenant_id, person.id)
        self.auto(person, asked + timedelta(seconds=4), BOOK_LINK[lang].format(url=url))
        self.auto(person, made + timedelta(seconds=3), f"Booking #{self.booking_number} confirmed.",
                  {"template": "booking_confirmed", "category": "utility", "sent_as": "text"})
        self.log("booking", booking_id, person, "booked", made)
        self.close(person, made + timedelta(minutes=rng.randint(5, 30)), person.staff, "booked")
        if reminded:
            self.auto(person, reminded, "A reminder of your visit today.",
                      {"template": "booking_reminder", "category": "utility", "params": [],
                       "lang": lang}, kind="template")
        if status == "cancelled":
            # Some cancel late, the day of the visit.
            late = rng.random() < 0.3
            when = starts - (timedelta(hours=rng.randint(2, 20)) if late
                             else timedelta(days=rng.randint(2, 4)))
            self.log("booking", booking_id, person, "cancelled",
                     max(when, made + timedelta(minutes=5)))
        if status in ("completed", "no_show"):
            self.log("booking", booking_id, person, status,
                     ends + timedelta(minutes=rng.randint(5, 40)), staff)
        person.events.append(made)


async def ensure_sample_tenant(owner_dsn: str, sample: Sample, now: datetime, days: int) -> None:
    """The business row, its client and its private test line (owner role)."""
    conn = await asyncpg.connect(owner_dsn)
    try:
        started = now - timedelta(days=days + 2)
        await conn.execute(
            "insert into tenants (id, name, name_ar, slug, business_type, area, onboarding_way, "
            "onboarding_step, onboarded_at, created_at) "
            "values ($1, $2, $3, $4, $5, $6, 'appointments', 'golive', $7, $7) "
            "on conflict (id) do update set name = $2, name_ar = $3, slug = $4, onboarded_at = $7, "
            "created_at = $7",
            sample.tenant_id, sample.name, sample.name_ar, sample.slug, sample.business_type,
            sample.area, started,
        )
        await conn.execute(
            "delete from channel_numbers where tenant_id = $1 and channel = 'simulator' "
            "and number_id <> $2",
            sample.tenant_id, f"sim-{sample.slug}",
        )  # a renamed sample keeps one test line, under its new slug
        await conn.execute(
            "insert into channel_numbers (number_id, tenant_id, channel) "
            "values ($1, $2, 'simulator') on conflict (number_id) do nothing",
            f"sim-{sample.slug}", sample.tenant_id,
        )
        client = await conn.fetchval(
            "select client_id from tenants where id = $1", sample.tenant_id
        )
        if client:
            await conn.execute(
                "update clients set name = $2, contact_name = $3, contact_email = $4 where id = $1",
                client, sample.name, sample.team[0][1], sample.team[0][0],
            )
        else:
            client_id = await conn.fetchval(
                "insert into clients (name, contact_name, contact_email) values ($1, $2, $3) "
                "returning id",
                sample.name, sample.team[0][1], sample.team[0][0],
            )
            await conn.execute(
                "update tenants set client_id = $2 where id = $1", sample.tenant_id, client_id
            )
    finally:
        await conn.close()


async def reset_sample(db: Database, sample: Sample, now: datetime | None = None, days: int = 56,
                       web_url: str = "") -> dict:
    """Wipe the sample business and write `days` days of activity ending `now`."""
    now = now or datetime.now(UTC)
    async with db.tenant(sample.tenant_id) as conn:
        await conn.execute("delete from sessions where tenant_id = $1", sample.tenant_id)
        for table in ("weekly_reports", "agent_snoozes", "bookings", "services",
                      "business_hours", "saved_replies", "memberships", "jobs", "messages",
                      "processed_messages", "payment_requests", "ledger_entries",
                      "ledger_accounts", "contacts", "tenant_modules",
                      "shop_settings", "shop_features"):
            await conn.execute(f"delete from {table}")
        web_url = web_url or get_settings().public_web_url
        diary = Diary(conn, now, random.Random(sample.seed), web_url,
                      sample, days)
        return await diary.run()


async def main(keys: list[str]) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    db = Database(settings.database_url)
    await db.connect()
    try:
        for key in keys:
            sample = SAMPLES[key]
            await ensure_sample_tenant(settings.migration_url, sample, now, 56)
            counts = await reset_sample(db, sample, now)
            print(f"sample business ready: {sample.name}, "
                  + ", ".join(f"{v} {k}" for k, v in counts.items())
                  + f". Sign in as {sample.team[0][0]} (owner) or {sample.team[2][0]} (agent).")
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or list(SAMPLES)))
