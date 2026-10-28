"""A fortnight of believable life for a demo shop (ALY-110): orders, cancellations, deliveries,
counts, price changes, sold-out items, credit accounts, bookings and the chats that went
with them.

It is written the way the engine would have written it, but with the moments of the past:
every order takes stock one line at a time and gives it back when it is cancelled, and every
number on the shelf is the sum of the stock log (`stock.mismatches()` is empty; a test
checks). The whole fortnight is worked out in memory, in time order, then written in a few
statements. The same seed and the same "now" always give the same shop.

What is on the shelf at the end is what makes the demo: a few items sold out (a counted item
at zero, a daily limit used up, a dish switched off), a few nearly gone, everything else
stocked. The rest of the shop's life is whatever the random fortnight made of it.
"""

import heapq
import random
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from alyr.core import links
from alyr.core.normalise import fmt_qar
from alyr.demo.build import TZ, Item, Made, Person
from alyr.demo.model import Product
from alyr.modules import report
from alyr.modules.ledger import service as ledger
from alyr.modules.orders.service import EXPIRE_JOB

DAYS = 14
HOLD_MINUTES = 30
WEEKDAY_FACTOR = {0: 0.9, 1: 0.9, 2: 1.0, 3: 1.15, 4: 0.75, 5: 1.2, 6: 1.0}  # Monday is 0
# How long after an order is placed it has been handed over, in hours, per kind of shop.
DONE_AFTER = {"restaurant": 2, "bakery": 4, "grocery": 3, "fashion": 30, "shop": 26,
              "wholesale": 30}

WANT = {
    "en": ["Hi, I'd like to order", "Hello! Can I place an order?", "Hi, same as last time please",
           "Order for today please"],
    "ar": ["مرحبا، أبي أطلب", "السلام عليكم، أقدر أطلب؟", "هلا، نفس الطلب السابق لو سمحت",
           "طلب لليوم لو سمحتوا"],
}
LINK = {
    "en": "Here is our menu. Choose what you would like and send the order: {url}",
    "ar": "هذه قائمتنا. اختر ما تريد وأرسل الطلب: {url}",
}
BOOK = {"en": "Can I book an appointment?", "ar": "أبي أحجز موعد لو سمحتوا"}
BOOK_LINK = {
    "en": "Choose a time here: {url}",
    "ar": "اختر الموعد من هنا: {url}",
}
NOT_PAID = {
    "en": "Order #{n} was not paid within 30 minutes, so we gave your items back. "
          "Ask for a new link any time.",
    "ar": "لم يُدفع الطلب رقم {n} خلال 30 دقيقة فأعدنا الأصناف إلى المخزون. "
          "اطلب رابطاً جديداً في أي وقت.",
}
CANCELLED = {"en": "Order #{n} has been cancelled.", "ar": "تم إلغاء الطلب رقم {n}."}
RECEIVED = {"en": "Order #{n} received.", "ar": "تم استلام الطلب رقم {n}."}
READY = {"en": "Order #{n} is ready for collection.", "ar": "الطلب رقم {n} جاهز للاستلام."}
BOOKED = {"en": "Booking #{n} confirmed.", "ar": "تم تأكيد الحجز رقم {n}."}
REMINDER = {"en": "A reminder of your appointment today.", "ar": "تذكير بموعدك اليوم."}


def local(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), TZ).astimezone(UTC)


@dataclass
class Var:
    """One size or colour as the history sells it, with its running stock."""

    id: UUID
    item: Item
    name: str
    name_ar: str
    delta: int
    sku: str
    limit: int | None  # a daily-limit variant's allowance a day
    on_hand: int  # a counted variant's stock
    opening: int
    day: dict = field(default_factory=dict)  # shop day -> what the day's movements add up to
    end: int | None = None  # how many should be left when the fortnight ends
    last: datetime | None = None  # when its stock last moved

    def left(self, day: date | None) -> int | None:
        if self.item.rule == "count":
            return self.on_hand
        if self.item.rule == "daily_limit":
            return max((self.limit or 0) + self.day.get(day, 0), 0)
        return None


@dataclass
class Line:
    item: Item
    var: Var
    options: list
    quantity: int
    unit_price: int
    day: date | None  # the shop day a daily-limit line takes its units from
    fulfil_on: date | None
    id: UUID | None = None


@dataclass
class Placed:
    """One order, decided in full before anything is written."""

    id: UUID
    number: int
    person: Person
    at: datetime
    lines: list
    total: int
    status: str
    payment: str
    fulfil_on: date | None
    table: str
    group: tuple  # (group id, name, Arabic name)
    cancelled_at: datetime | None = None
    cancelled_by: str = ""  # customer | staff | assistant
    reason: str = ""
    paid_at: datetime | None = None
    request: str = ""  # "", paid, pending, expired
    held_until: datetime | None = None
    confirmed_at: datetime | None = None
    ready_at: datetime | None = None
    done_at: datetime | None = None
    refund: bool = False
    reversed: bool = False

    @property
    def on_account(self) -> bool:
        return self.payment == "on_account"


@dataclass
class Booked:
    id: UUID
    number: int
    person: Person
    service: dict
    starts: datetime
    ends: datetime
    status: str
    made: datetime
    reminded: datetime | None = None


class Fortnight:
    """Works out and writes the shop's last `DAYS` days."""

    def __init__(self, made: Made, rng: random.Random, web_url: str) -> None:
        self.made, self.shop, self.conn = made, made.shop, made.conn
        self.rng, self.now, self.web_url = rng, made.now, web_url.rstrip("/")
        self.today = self.now.astimezone(TZ).date()
        self.first_day = self.today - timedelta(days=DAYS - 1)
        self.setup = made.setup
        self.day_starts = made.clock.day_starts
        self.vars: dict[UUID, Var] = {}
        self.by_item: dict[str, list[Var]] = {}
        self.queue: list = []  # (time, sequence, kind, payload)
        self.sequence = 0
        self.number = 1000
        self.placed: list[Placed] = []
        self.booked: list[Booked] = []
        self.movements: list = []
        self.activity: list = []
        self.messages: list = []
        self.price_changes: list = []  # (item, new price, when)
        self.balance: dict[UUID, int] = {}  # what each account owes as the fortnight goes
        self.payments: list = []  # (person, at, amount, note)
        self.off: dict[UUID, datetime] = {}  # items switched off, since when
        self.price_at: dict[str, list] = {}  # product key -> [(from, price)]
        self.low_end = max(1, made.setup.low_stock_at // 2)
        self.counts = {"orders": 0, "cancelled": 0, "movements": 0, "bookings": 0}

    # ── small helpers ─────────────────────────────────────────────────────────────────

    def uuid(self) -> UUID:
        return UUID(int=self.rng.getrandbits(128), version=4)

    def shop_day(self, at: datetime) -> date:
        started = timedelta(hours=self.day_starts.hour, minutes=self.day_starts.minute)
        return (at.astimezone(TZ) - started).date()

    def push(self, at: datetime, kind: str, payload=None) -> None:
        self.sequence += 1
        heapq.heappush(self.queue, (at, self.sequence, kind, payload))

    def actor(self, email: str) -> tuple:
        name = self.shop.owner[1] if email == self.shop.owner[0] else self.shop.agent[1]
        return self.made.users[email], name

    def log(self, subject: str, subject_id: UUID, person: Person | None, action: str,
            at: datetime, staff: str | None = None, detail: dict | None = None) -> None:
        user, name = self.actor(staff) if staff else (None, "Customer")
        self.activity.append((
            subject, subject_id, person.id if person else None, action,
            {k: v for k, v in (detail or {}).items() if v is not None}, user, name, at,
        ))

    def say(self, person: Person, at: datetime, direction: str, kind: str, body: str,
            payload: dict | None = None) -> None:
        status = "received" if direction == "in" else "read"
        self.messages.append((person.id, direction, kind, body, payload or {}, at, status, "", None))

    def price_now(self, product: Product, at: datetime) -> int:
        """The normal price at a moment: a price change in the fortnight applies after it."""
        price = product.price
        for since, new in self.price_at.get(product.key, []):
            if at >= since:
                price = new
        if product.sale and at >= self.now - timedelta(days=2):
            price = min(price, product.sale[0])
        return price

    def unit_price(self, product: Product, var: Var, options: list, person: Person | None,
                   at: datetime) -> int:
        """What one costs this customer: their group's price for the item where it has one,
        else the normal or sale price, plus the size's difference and the extras."""
        group = dict(product.groups).get(person.customer.group) if person else None
        base = group if group is not None else self.price_now(product, at)
        return base + var.delta + sum(o["price_delta"] for o in options)

    # ── the shelf ─────────────────────────────────────────────────────────────────────

    def start_shelf(self) -> None:
        for key, item in self.made.items.items():
            for v in item.variants:
                var = Var(
                    v["id"], item, v["name"], v["name_ar"], v["price_delta"], v["sku"],
                    v["daily_limit"], v["on_hand"], v["on_hand"],
                )
                self.vars[var.id] = var
                self.by_item.setdefault(key, []).append(var)
                self.target(item.product, var)

    def target(self, product: Product, var: Var) -> None:
        """How much of this variant should be left at the end: nothing for a sold-out item
        (or size), a handful for a low one, and "whatever the fortnight left" otherwise."""
        size = next((s for s in product.sizes if s.name == var.name), None)
        if size is not None and size.end is not None:
            var.end = size.end
        elif product.state == "sold_out":
            var.end = 0
        elif product.state == "low" and var is self.by_item[product.key][0]:
            var.end = self.low_end

    def take(self, line: Line, order_id: UUID, at: datetime) -> None:
        var = line.var
        if var.item.rule == "count":
            var.on_hand -= line.quantity
            balance = var.on_hand
        elif var.item.rule == "daily_limit":
            var.day[line.day] = var.day.get(line.day, 0) - line.quantity
            balance = (var.limit or 0) + var.day[line.day]
        else:
            return  # a dish with a switch, or a made-to-order item, has no stock to take
        var.last = at
        self.movements.append((
            var.id, "sold", -line.quantity, balance,
            line.day if var.item.rule == "daily_limit" else None, "Order placed", order_id, None,
            "Customer", "", at,
        ))

    def give_back(self, placed: Placed, at: datetime) -> None:
        who = {"assistant": "Assistant", "customer": "Customer"}.get(
            placed.cancelled_by, self.shop.agent[1]
        )
        for line in placed.lines:
            var = line.var
            if var.item.rule == "count":
                var.on_hand += line.quantity
                balance = var.on_hand
            elif var.item.rule == "daily_limit":
                var.day[line.day] = var.day.get(line.day, 0) + line.quantity
                balance = (var.limit or 0) + var.day[line.day]
            else:
                continue
            var.last = at
            self.movements.append((
                var.id, "cancelled_restocked", line.quantity, balance,
                line.day if var.item.rule == "daily_limit" else None,
                placed.reason or "Order cancelled", placed.id, None, who, "", at,
            ))

    def stock_move(self, var: Var, kind: str, delta: int, at: datetime, reason: str, staff: str,
                   day: date | None = None) -> None:
        """A change by a person: a delivery, waste, a count, a counter sale."""
        user, name = self.actor(staff)
        if var.item.rule == "count":
            var.on_hand += delta
            balance = var.on_hand
        else:
            day = day or self.shop_day(at)
            var.day[day] = var.day.get(day, 0) + delta
            balance = (var.limit or 0) + var.day[day]
        var.last = at
        self.movements.append((
            var.id, kind, delta, balance, day if var.item.rule == "daily_limit" else None,
            reason, None, user, name, "", at,
        ))

    # ── what a customer can order ─────────────────────────────────────────────────────

    def sellable(self, item: Item, at: datetime) -> bool:
        p = item.product
        if p.state in ("draft", "hidden"):
            return False
        local_at = at.astimezone(TZ)
        if item.rule == "switch" and item.id in self.off and at >= self.off[item.id]:
            return False
        if p.window:
            opens, closes = time.fromisoformat(p.window[0]), time.fromisoformat(p.window[1])
            if not opens <= local_at.time() < closes:
                return False
        return not (p.lead and local_at.time() >= time.fromisoformat(p.lead[1]))

    def pick_day(self, item: Item, at: datetime) -> tuple[date | None, date | None]:
        """(the day a daily-limit line takes from, the date it is ordered for)."""
        p = item.product
        if p.lead:
            ordered_for = at.astimezone(TZ).date() + timedelta(days=p.lead[0])
            return (ordered_for if item.rule == "daily_limit" else None), ordered_for
        return (self.shop_day(at) if item.rule == "daily_limit" else None), None

    def quantity(self, p: Product) -> int:
        rng = self.rng
        if p.min_order > 1:
            return p.min_order * rng.choice([1, 1, 2, 2, 3])
        if self.shop.key == "wholesale":
            return rng.choice([1, 1, 2, 3, 4])
        return rng.choice([1, 1, 1, 2, 2, 3])

    def line(self, item: Item, at: datetime, person: Person) -> Line | None:
        rng, p = self.rng, item.product
        day, fulfil = self.pick_day(item, at)
        variants = self.by_item[p.key]
        quantity = self.quantity(p)
        if item.rule in ("count", "daily_limit"):
            choices = []
            for v in variants:
                left = v.left(day)
                if not left:
                    continue
                # A flagged item (sold out, or nearly) may be bought down to nothing. The
                # others keep a reserve for today and the days ahead, so the demo does not
                # run out of everything.
                keep, today = 0, self.shop_day(self.now)
                if v.end is not None:
                    if item.rule == "count" or day == today:
                        keep = v.end
                elif item.rule == "daily_limit" and day >= today:
                    keep = max(1, (v.limit or 0) // 6)
                if left - keep >= p.min_order:
                    choices.append((v, left - keep))
            if not choices:
                return None
            var, room = rng.choices(choices, [room for _, room in choices])[0]
            quantity = min(quantity, room)
            if p.min_order > 1:
                quantity -= quantity % p.min_order
            if quantity < max(1, p.min_order):
                return None
        else:
            var = variants[0] if len(variants) == 1 else rng.choice(variants)
        chosen = self.choices_of(item)
        price = self.unit_price(p, var, chosen, person, at)
        return Line(item, var, chosen, quantity, price, day, fulfil)

    def choices_of(self, item: Item) -> list:
        """The choices a customer made on a dish: one of each required group, and an extra
        now and then."""
        rng, out = self.rng, []
        for group in item.groups:
            options = [o for o in group["options"] if o["active"]]
            if not options:
                continue
            if group["required"]:
                picks = [rng.choice(options)]
            elif rng.random() < 0.35:
                picks = rng.sample(options, min(len(options), rng.randint(1, group["max_choices"])))
            else:
                picks = []
            for o in picks:
                out.append({
                    "id": str(o["id"]), "group_id": str(group["id"]), "group": group["name"],
                    "group_ar": group["name_ar"], "name": o["name"], "name_ar": o["name_ar"],
                    "price_delta": o["price_delta"],
                })
        return out

    def basket(self, at: datetime, person: Person) -> list[Line]:
        rng = self.rng
        wanted = rng.randint(*self.shop.lines)
        pool = [i for i in self.made.items.values() if self.sellable(i, at)]
        lines: list[Line] = []
        while len(lines) < wanted and pool:
            weights = [max(i.product.pop, 1) * rng.uniform(0.6, 1.4) for i in pool]
            item = rng.choices(pool, weights)[0]
            pool.remove(item)
            line = self.line(item, at, person)
            if line is not None:
                lines.append(line)
        return lines

    # ── the fortnight's timeline ──────────────────────────────────────────────────────

    def hour_weights(self) -> dict[int, float]:
        low, high = self.shop.open_hours
        out = {}
        for h in range(low, high):
            weight = 1.0
            if self.shop.key == "bakery":
                weight += 3 if h in (7, 8, 9, 10) else 1.5 if h in (16, 17) else 0
            elif self.shop.key == "wholesale":
                weight += 2 if h in (7, 8, 9, 10) else 0
            elif self.shop.key in ("fashion", "shop"):
                weight += 3 if h in (18, 19, 20, 21) else 0
            else:
                weight += 3 if h in (12, 13) else 2.5 if h in (19, 20, 21) else 0
            out[h] = weight
        return out

    def plan_orders(self) -> None:
        """When customers order: busier on Thursday and Saturday, nothing before the
        afternoon on Friday, a little more each day."""
        shop, rng = self.shop, self.rng
        weights = self.hour_weights()
        for i in range(DAYS):
            day = self.first_day + timedelta(days=i)
            factor = WEEKDAY_FACTOR[day.weekday()] * (0.85 + 0.3 * i / (DAYS - 1))
            if shop.key == "wholesale" and day.weekday() == 4:
                factor = 0.15
            count = max(0, round(shop.orders_a_day * factor + rng.uniform(-1.4, 1.4)))
            hours = {h: w for h, w in weights.items() if day.weekday() != 4 or h >= 14}
            for _ in range(count if hours else 0):
                hour = rng.choices(list(hours), list(hours.values()))[0]
                at = local(day, hour, rng.randrange(0, 60))
                if at < self.now - timedelta(minutes=45):
                    self.push(at, "order", "")
        # Two orders that came in a little while ago: one paid, one still waiting for its
        # payment link (it holds its stock for thirty minutes, as the engine does).
        self.push(self.now - timedelta(minutes=21), "order", "pending")
        self.push(self.now - timedelta(minutes=8), "order", "")
        for person in self.made.people:
            if person.customer.credit > 0:
                for index in (5, 11):
                    at = local(self.first_day + timedelta(days=index), 11, 0) + timedelta(
                        minutes=rng.randrange(0, 120))
                    self.push(at, "pay", person)

    def plan_stock(self) -> None:
        rng = self.rng
        owner, agent = self.shop.owner[0], self.shop.agent[0]
        # Deliveries early on the fourth and the ninth day, counts on the seventh.
        for index in (3, 8):
            self.push(local(self.first_day + timedelta(days=index), 7, 30), "delivery", owner)
        self.push(local(self.first_day + timedelta(days=6), 22, 10), "count", agent)
        self.push(local(self.first_day + timedelta(days=10), 22, 20), "waste", agent)
        # One price went up in the middle of the fortnight.
        priced = [
            i for i in self.made.items.values()
            if i.product.state == "" and not i.product.sale and not i.product.groups
            and 5 <= i.product.pop <= 8
        ]
        if priced and self.shop.orders_a_day:
            item = rng.choice(priced)
            new = round(item.product.price * 1.1 / 100) * 100
            if new == item.product.price:
                new += 100
            since = local(self.first_day + timedelta(days=5), 9, 15)
            self.price_at[item.product.key] = [(since, new)]
            self.price_changes.append((item, new, since))
        # A dish that was off for a lunch and came back: the switch at work.
        switches = [i for i in self.made.items.values()
                    if i.rule == "switch" and i.product.state == "" and i.product.pop >= 4]
        if switches:
            item = rng.choice(switches)
            day = self.first_day + timedelta(days=4)
            self.push(local(day, 12, 20), "flip", (item, False, agent))
            self.push(local(day, 14, 45), "flip", (item, True, agent))
        # What is switched off at the end: a switch cannot be sold down to nothing.
        for item in self.made.items.values():
            if item.rule == "switch" and item.product.state == "sold_out":
                yesterday = self.today - timedelta(days=1)
                self.push(local(yesterday, 16, 5), "flip", (item, False, agent))

    def plan_counter_sales(self) -> None:
        """A shop that sells at its counter (the salon's products): a few sales a day, which
        its staff take off the shelf."""
        rng, agent = self.rng, self.shop.agent[0]
        items = [i for i in self.made.items.values() if i.rule == "count" and i.product.state == ""]
        for i in range(DAYS):
            day = self.first_day + timedelta(days=i)
            for _ in range(rng.randint(2, 5)):
                item = rng.choices(items, [max(x.product.pop, 1) for x in items])[0]
                at = local(day, rng.randint(11, 20), rng.randrange(0, 60))
                if at < self.now - timedelta(minutes=30):
                    self.push(at, "counter", (item, agent))

    # ── the people and the order ──────────────────────────────────────────────────────

    def who(self, at: datetime) -> Person | None:
        weight = {"account": 8, "regular": 8, "occasional": 2, "new": 2}
        pool = [p for p in self.made.people if p.first_seen <= at]
        if not pool:
            return None
        return self.rng.choices(pool, [weight[p.customer.kind] for p in pool])[0]

    def status_for(self, at: datetime, fulfil_on: date | None) -> str:
        age = self.now - at
        done = timedelta(hours=DONE_AFTER.get(self.shop.key, 3))
        if fulfil_on and fulfil_on >= self.today:
            return "confirmed" if age > timedelta(minutes=40) else "new"
        if age > done:
            return "done"
        if age > done / 2:
            return "ready"
        return "confirmed" if age > timedelta(minutes=40) else "new"

    def place(self, at: datetime, pending: bool = False) -> None:
        person = self.who(at)
        if person is None:
            return
        lines = self.basket(at, person)
        if lines:
            self.place_lines(at, person, lines, pending)

    def place_lines(self, at: datetime, person: Person, lines: list, pending: bool = False,
                    plain: bool = False) -> None:
        """Place one order for these lines and decide what became of it. `plain` is an order
        that goes through without incident (the last orders of a day that sold something out)."""
        rng, shop = self.rng, self.shop
        total = sum(line.unit_price * line.quantity for line in lines)
        credit = person.customer.credit
        account = credit > 0 and (person.customer.kind == "account" or rng.random() < 0.5)
        if account and self.balance.get(person.id, 0) + total > credit:
            account = False  # over the limit: this one is paid by link
        self.number += 1
        order_id = self.uuid()
        gid = person.group_id or self.made.group_ids[""]
        dates = [line.fulfil_on for line in lines if line.fulfil_on]
        fulfil = max(dates) if dates else None
        table = str(rng.randint(1, 12)) if shop.key == "restaurant" and rng.random() < 0.25 else ""
        for line in lines:
            line.id = self.uuid()
            self.take(line, order_id, at)
        o = Placed(order_id, self.number, person, at, lines, total, "new",
                   "on_account" if account else "unpaid", fulfil, table,
                   (gid, *self.made.group_names[gid]))
        holds = any(line.item.rule in ("count", "daily_limit") for line in lines)
        age, r = self.now - at, (0.5 if plain else rng.random())
        if account:
            self.balance[person.id] = self.balance.get(person.id, 0) + total
            if r < 0.04 and age > timedelta(hours=3):
                o.status, o.cancelled_by = "cancelled", "staff"
                o.reason = "The customer changed the order"
                o.cancelled_at = min(at + timedelta(minutes=rng.randint(30, 180)),
                                     self.now - timedelta(minutes=1))
                o.reversed = True
                self.balance[person.id] -= total
                self.push(o.cancelled_at, "restock", o)
            else:
                o.status = self.status_for(at, fulfil)
        elif pending:
            o.status, o.request = "new", "pending"
            if holds:
                o.held_until = at + timedelta(minutes=HOLD_MINUTES)
        elif holds and r < 0.06 and age > timedelta(minutes=40):
            o.status, o.request, o.cancelled_by = "cancelled", "expired", "assistant"
            o.reason = "Not paid in time"
            o.cancelled_at = at + timedelta(minutes=HOLD_MINUTES)
            self.push(o.cancelled_at, "restock", o)
        elif r < 0.10 and age > timedelta(hours=1):
            o.status = "cancelled"
            o.cancelled_by = "customer" if r < 0.085 else "staff"
            o.reason = "Changed their mind" if o.cancelled_by == "customer" else (
                "Sold out at the counter")
            o.cancelled_at = min(at + timedelta(minutes=rng.randint(12, 70)),
                                 self.now - timedelta(minutes=1))
            if r >= 0.095:  # paid first, so the shop owes a refund
                o.payment, o.request, o.cancelled_by, o.refund = "paid", "paid", "staff", True
                o.paid_at = at + timedelta(minutes=rng.randint(1, 8))
                o.reason = "Could not make it in time"
            self.push(o.cancelled_at, "restock", o)
        else:
            o.status = self.status_for(at, fulfil)
            if rng.random() < 0.62 or (holds and age < timedelta(minutes=40)):
                o.payment, o.request = "paid", "paid"
                o.paid_at = min(at + timedelta(minutes=rng.randint(1, 25)),
                                self.now - timedelta(seconds=30))
            else:
                o.request = "pending"
        if o.status != "cancelled":
            self.progress(o)
        self.placed.append(o)

    def progress(self, o: Placed) -> None:
        """When staff confirmed, finished and handed over a live order: a share of the time
        it takes this kind of shop, so none of it falls in the future."""
        rng = self.rng
        span = timedelta(hours=DONE_AFTER.get(self.shop.key, 3))
        if o.status != "new":
            o.confirmed_at = o.at + min(timedelta(minutes=rng.randint(2, 15)), span * 0.1)
        if o.status in ("ready", "done"):
            o.ready_at = o.confirmed_at + span * rng.uniform(0.15, 0.4)
        if o.status == "done":
            o.done_at = o.ready_at + span * rng.uniform(0.1, 0.3)

    # ── bookings (appointment businesses) ─────────────────────────────────────────────

    def plan_bookings(self) -> None:
        """A diary: visits laid out one after another inside the opening hours, most of the
        past ones completed, a few no-shows and cancellations, and the days ahead filling."""
        rng, shop, made = self.rng, self.shop, self.made
        services = made.services
        made_people = [p for p in made.people]
        for offset in range(-(DAYS - 1), 7):
            day = self.today + timedelta(days=offset)
            weekday = (day.weekday() + 1) % 7  # PostgreSQL's: Sunday is 0
            windows = [(o, c) for d, o, c in made.hours if d == weekday]
            share = shop.bookings_a_day * (1.0 if offset <= 0 else 0.5) / max(len(windows), 1)
            for opens, closes in windows:
                at = datetime.combine(day, time.fromisoformat(opens), TZ)
                end_of_day = datetime.combine(day, time.fromisoformat(closes), TZ)
                at += timedelta(minutes=rng.choice([0, 15, 30]))
                busy = min(0.95, share * 55 / max((end_of_day - at).total_seconds() / 60, 1) * 1.6)
                while True:
                    service = rng.choices(services, [3, 2, 2, 1, 1][: len(services)])[0]
                    ends = at + timedelta(minutes=service["minutes"])
                    if ends > end_of_day:
                        break
                    if rng.random() < busy:
                        self.book(day, service, at.astimezone(UTC), ends.astimezone(UTC),
                                  made_people)
                        at = ends + timedelta(minutes=rng.choice([0, 15, 15, 30, 45]))
                    else:
                        at += timedelta(minutes=rng.choice([30, 45, 60]))

    def book(self, day: date, service: dict, starts: datetime, ends: datetime,
             people: list) -> None:
        rng = self.rng
        pool = [p for p in people if p.first_seen < starts - timedelta(days=1)]
        if not pool or starts < self.now - timedelta(days=DAYS):
            return
        person = rng.choice(pool)
        made = max(person.first_seen + timedelta(hours=1),
                   starts - timedelta(days=rng.randint(1, 6), hours=rng.randint(0, 5)))
        if made >= self.now:
            made = self.now - timedelta(hours=rng.randint(1, 60))
        if ends <= self.now:
            if starts > self.now - timedelta(days=2) and rng.random() < 0.5:
                status = "booked"  # nobody has marked it yet
            else:
                status = rng.choices(["completed", "no_show", "cancelled"], [84, 7, 9])[0]
        else:
            status = "booked"
        reminded = starts - timedelta(hours=2)
        reminded = reminded if status != "cancelled" and reminded < self.now else None
        self.booked.append(
            Booked(self.uuid(), 0, person, service, starts, ends, status, made, reminded)
        )

    # ── running the clock ─────────────────────────────────────────────────────────────

    def simulate(self) -> None:
        self.start_shelf()
        if self.shop.orders_a_day:
            self.plan_orders()
        elif self.shop.bookings_a_day:
            self.plan_bookings()
            self.plan_counter_sales()
        self.plan_stock()
        while self.queue:
            at, _, kind, payload = heapq.heappop(self.queue)
            if at <= self.now:
                getattr(self, f"do_{kind}")(at, payload)
        self.finish_shelf()

    def do_order(self, at: datetime, payload: str) -> None:
        self.place(at, pending=payload == "pending")

    def do_restock(self, at: datetime, placed: Placed) -> None:
        self.give_back(placed, at)

    def do_pay(self, at: datetime, person: Person) -> None:
        owed = self.balance.get(person.id, 0)
        if owed < 5000:
            return
        amount = round(owed * self.rng.choice([0.5, 0.7, 1.0]) / 500) * 500
        if amount > 0:
            self.balance[person.id] = owed - amount
            self.payments.append((person, at, amount, "Bank transfer"))

    def stock_pool(self) -> list[Var]:
        return [v for vs in self.by_item.values() for v in vs
                if v.item.rule == "count" and v.end is None and v.item.product.state == ""]

    def do_delivery(self, at: datetime, staff: str) -> None:
        for v in self.stock_pool():
            if v.opening > 0 and v.on_hand < v.opening * 0.5:
                self.stock_move(v, "received", v.opening - v.on_hand, at,
                                "Delivery from the supplier", staff)

    def do_count(self, at: datetime, staff: str) -> None:
        pool = [v for v in self.stock_pool() if v.on_hand > 3]
        for v in self.rng.sample(pool, min(2, len(pool))):
            difference = self.rng.choice([-2, -1, -1, 1])
            reason = {-2: "Shelf count: two damaged", -1: "Shelf count: one missing",
                      1: "Shelf count: one found at the back"}[difference]
            self.stock_move(v, "counted", difference, at, reason, staff)

    def do_waste(self, at: datetime, staff: str) -> None:
        pool = [v for v in self.stock_pool() if v.on_hand > 4]
        for v in self.rng.sample(pool, min(2, len(pool))):
            self.stock_move(v, "wasted", -1, at, "Past its date", staff)

    def do_flip(self, at: datetime, payload: tuple) -> None:
        item, available, staff = payload
        user, name = self.actor(staff)
        self.activity.append((
            "item", item.id, None, "switched_on" if available else "switched_off", {}, user,
            name, at,
        ))
        if available:
            self.off.pop(item.id, None)
        else:
            self.off[item.id] = at
        item.available = available

    def do_counter(self, at: datetime, payload: tuple) -> None:
        item, staff = payload
        in_stock = [v for v in self.by_item[item.product.key] if v.on_hand > 2]
        if in_stock:
            self.stock_move(self.rng.choice(in_stock), "adjusted", -1, at,
                            "Sold at the counter", staff)

    def finish_shelf(self) -> None:
        """Bring the shelf to where the demo wants it when the fortnight ends."""
        rng, agent = self.rng, self.shop.agent[0]
        today = self.shop_day(self.now)
        for vars_ in self.by_item.values():
            for v in vars_:
                rule, state = v.item.rule, v.item.product.state
                if rule not in ("count", "daily_limit") or state in ("draft", "hidden"):
                    continue
                have = v.left(today)
                if v.end is not None:
                    gap = have - v.end
                    if gap > 0 and rule == "daily_limit" and self.shop.orders_a_day \
                            and not v.item.product.lead:
                        self.drain_daily(v, gap, today)
                    elif gap > 0:
                        # The last of it went at the counter, a day or so ago.
                        hours = rng.randint(20, 40) if rule == "count" else 3
                        at = max(self.now - timedelta(hours=hours),
                                 (v.last + timedelta(minutes=5)) if v.last else self.now)
                        at = min(at, self.now - timedelta(minutes=2))
                        self.stock_move(
                            v, "adjusted", -gap, at,
                            "Last pieces sold at the counter" if rule == "count"
                            else "Sold at the counter", agent, today if rule == "daily_limit" else None,
                        )
                elif rule == "count" and v.opening > 0 and have <= self.setup.low_stock_at:
                    at = min(max(self.now - timedelta(hours=2), (v.last or self.now)
                                 + timedelta(minutes=1)), self.now - timedelta(minutes=1))
                    self.stock_move(v, "received", v.opening - have, at,
                                    "Delivery from the supplier", self.shop.owner[0])

    def drain_daily(self, v: Var, gap: int, today: date) -> None:
        """A daily limit that is used up, or nearly, today: taken in a few orders spread over
        the day so far, so the screen reads right at any hour (one adjustment at four in the
        morning would not)."""
        rng = self.rng
        end = self.now - timedelta(minutes=9)
        opens = local(self.now.astimezone(TZ).date(), self.shop.open_hours[0]) + timedelta(minutes=15)
        start = max(opens, (v.last or opens) + timedelta(minutes=1))
        if end - start < timedelta(hours=1):
            start = max(end - timedelta(hours=1), (v.last or end) + timedelta(minutes=1))
        size, left, pieces = max(2, gap // rng.randint(3, 5)), gap, []
        while left > 0:
            piece = min(left, rng.randint(max(1, size // 2), size))
            pieces.append(piece)
            left -= piece
        times = sorted(start + (max(end, start) - start) * rng.random() for _ in pieces)
        for quantity, at in zip(pieces, times, strict=True):
            at = min(max(at, (v.last or at) + timedelta(minutes=1)), self.now - timedelta(minutes=1))
            person = self.who(at)
            price = self.unit_price(v.item.product, v, [], person, at)
            self.place_lines(at, person, [Line(v.item, v, [], quantity, price, today, None)],
                             plain=True)

    # ── writing it all ────────────────────────────────────────────────────────────────

    async def write(self) -> dict:
        # Order numbers rise with time, as they do in a shop.
        for number, order in enumerate(sorted(self.placed, key=lambda o: o.at), start=1001):
            order.number = number
        if self.placed:
            await self.write_orders()
        if self.booked:
            await self.write_bookings()
        await self.write_stock()
        await self.write_ledger()
        await self.write_record()
        await self.finish_contacts()
        return self.counts

    async def write_orders(self) -> None:
        conn = self.conn
        order_rows, line_rows, hold_rows, pay_rows = [], [], [], []
        for o in self.placed:
            order_rows.append((
                o.id, o.person.id, o.number, o.status, o.payment, o.total, o.at,
                self.made.users[o.person.staff], o.fulfil_on, o.group[0], o.group[1], o.group[2],
                o.table,
            ))
            for line in o.lines:
                p, v = line.item.product, line.var
                line_rows.append((
                    line.id, o.id, line.item.id, p.name, p.name_ar, line.unit_price,
                    line.quantity, v.id, v.name, v.name_ar, line.options, line.fulfil_on,
                    v.sku or p.sku,
                ))
                if line.item.rule in ("count", "daily_limit"):
                    if o.status == "cancelled":
                        status, expires, released = "released", None, o.cancelled_at
                    elif o.held_until:
                        status, expires, released = "held", o.held_until, None
                    else:
                        status, expires, released = "committed", None, None
                    hold_rows.append((
                        o.id, line.id, v.id, line.quantity, line.day, status, expires, o.at,
                        released, o.reason if released else "",
                    ))
            if o.request:
                pay_rows.append((
                    self.uuid(), o.person.id, o.total, o.request, o.at,
                    o.paid_at if o.request == "paid" else None, o.id,
                ))
        await conn.executemany(
            "insert into orders (id, contact_id, number, status, payment, total, created_at, "
            "assigned_to, fulfil_on, price_group_id, price_group_name, price_group_name_ar, "
            "table_label) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
            order_rows,
        )
        await conn.executemany(
            "insert into order_items (id, order_id, item_id, name, name_ar, price, quantity, "
            "variant_id, variant_name, variant_name_ar, options, fulfil_on, sku) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
            line_rows,
        )
        await conn.executemany(
            "insert into stock_holds (order_id, order_item_id, variant_id, quantity, day, "
            "status, expires_at, created_at, released_at, released_reason) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            hold_rows,
        )
        await conn.executemany(
            "insert into payment_requests (id, contact_id, amount, status, created_at, paid_at, "
            "order_id) values ($1, $2, $3, $4, $5, $6, $7)",
            pay_rows,
        )
        for o in self.placed:
            if o.held_until:  # like the engine: a job for the moment the hold runs out
                await conn.execute(
                    "insert into jobs (kind, payload, run_at) values ($1, $2, $3)",
                    EXPIRE_JOB, {"order_id": str(o.id)}, o.held_until,
                )
        self.counts["orders"] = len(self.placed)
        self.counts["cancelled"] = sum(o.status == "cancelled" for o in self.placed)

    async def write_bookings(self) -> None:
        self.booked.sort(key=lambda b: b.made)
        for n, b in enumerate(self.booked, start=101):
            b.number = n
        await self.conn.executemany(
            "insert into bookings (id, number, contact_id, service_id, service_name, starts_at, "
            "ends_at, status, reminded_at, created_at, assigned_to) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            [(b.id, b.number, b.person.id, b.service["id"], b.service["name"], b.starts,
              b.ends, b.status, b.reminded, b.made, self.made.users[b.person.staff])
             for b in self.booked],
        )
        self.counts["bookings"] = len(self.booked)

    async def write_stock(self) -> None:
        conn = self.conn
        rows = sorted(self.movements, key=lambda m: m[10])
        await conn.executemany(
            "insert into stock_movements (variant_id, kind, delta, balance_after, day, reason, "
            "order_id, actor_id, actor_name, via, created_at) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            rows,
        )
        await conn.executemany(
            "update item_variants set on_hand = $2 where id = $1",
            [(v.id, v.on_hand) for v in self.vars.values() if v.item.rule == "count"],
        )
        await conn.executemany(
            "insert into variant_day_stock (variant_id, day, delta) values ($1, $2, $3) "
            "on conflict (variant_id, day) do update set delta = excluded.delta",
            [(v.id, day, delta) for v in self.vars.values() if v.item.rule == "daily_limit"
             for day, delta in v.day.items()],
        )
        for item in self.made.items.values():
            if item.rule == "switch" and not item.available:
                await conn.execute(
                    "update items set available = false where id = $1", item.id
                )
        for item, new, at in self.price_changes:
            await conn.execute(
                "insert into item_price_history (item_id, price, changed_by, changed_by_name, "
                "reason, created_at) values ($1, $2, $3, $4, $5, $6)",
                item.id, new, self.made.owner.id, self.shop.owner[1], "Supplier price went up", at,
            )
            await conn.execute(
                "update items set price = $2, updated_at = $3 where id = $1", item.id, new, at
            )
            self.activity.append((
                "item", item.id, None, "updated",
                {"price": fmt_qar(new), "was": fmt_qar(item.product.price)},
                self.made.owner.id, self.shop.owner[1], at,
            ))
        self.counts["movements"] = len(rows)

    async def write_ledger(self) -> None:
        """Credit sales go on the customer's account the way an order puts them there, and a
        cancelled one is taken off by the service the cancelling uses (ALY-128)."""
        conn = self.conn
        accounts = set()
        for o in self.placed:
            if not o.on_account:
                continue
            accounts.add(o.person.id)
            await ledger.add_entry(
                conn, o.person.id, "sale", o.total, f"Order #{o.number}", "Order link", o.at,
                order_id=o.id,
            )
            if o.reversed:
                await ledger.reverse_sale(
                    conn, o.id, o.person.id, o.total, o.number, self.shop.agent[1],
                    at=o.cancelled_at,
                )
        for person, at, amount, note in self.payments:
            accounts.add(person.id)
            await ledger.add_entry(conn, person.id, "payment", amount, note, self.shop.owner[1], at)
        await conn.executemany(
            "insert into ledger_accounts (contact_id, assigned_to) values ($1, $2) "
            "on conflict do nothing",
            [(c, self.made.users[self.shop.owner[0]]) for c in accounts],
        )

    def record_orders(self) -> None:
        for o in self.placed:
            person, lang = o.person, o.person.customer.lang
            staff = person.staff
            self.log("order", o.id, person, "placed", o.at, detail={
                "number": o.number, "total": fmt_qar(o.total),
                "payment": "account" if o.on_account else "link", "table": o.table or None,
            })
            for action, at in (("confirmed", o.confirmed_at), ("ready", o.ready_at),
                               ("done", o.done_at)):
                if at:
                    self.log("order", o.id, person, action, at, staff, {"number": o.number})
            if o.request == "paid" and o.paid_at:
                self.log("order", o.id, person, "paid", o.paid_at,
                         detail={"number": o.number, "amount": fmt_qar(o.total)})
            if o.status == "cancelled":
                by = staff if o.cancelled_by == "staff" else None
                self.log("order", o.id, person, "cancelled", o.cancelled_at, by, {
                    "number": o.number, "reason": o.reason,
                    "refund_due": fmt_qar(o.total) if o.refund else None,
                    "credit_reversed": fmt_qar(o.total) if o.reversed else None,
                })
                if o.refund:
                    self.log("order", o.id, person, "refund_due", o.cancelled_at, by,
                             {"number": o.number, "amount": fmt_qar(o.total)})
            # Every order starts with the customer asking for the shop's link, an account customer too.
            url = links.order_url(
                self.web_url, self.shop.slug, self.shop.tenant_id, person.id, o.table
            )
            asked = o.at - timedelta(minutes=self.rng.randint(3, 14))
            self.say(person, asked, "in", "text", self.rng.choice(WANT[lang]))
            self.say(person, asked + timedelta(seconds=4), "out", "buttons",
                     LINK[lang].format(url=url),
                     {"choices": [{"id": "order", "title": "Order"}]})
            self.say(person, o.at + timedelta(seconds=3), "out", "text",
                     RECEIVED[lang].format(n=o.number),
                     {"template": "order_received_account" if o.on_account
                      else "order_received_pay", "category": "utility", "sent_as": "text"})
            if o.status == "cancelled":
                body = (NOT_PAID if o.cancelled_by == "assistant" else CANCELLED)[lang]
                self.say(person, o.cancelled_at, "out", "text", body.format(n=o.number),
                         {"template": "order_cancelled", "category": "utility",
                          "sent_as": "text"})
            elif o.ready_at:
                self.say(person, o.ready_at, "out", "text", READY[lang].format(n=o.number),
                         {"template": "order_ready", "category": "utility", "sent_as": "text"})

    def record_bookings(self) -> None:
        for b in self.booked:
            person, lang = b.person, b.person.customer.lang
            url = f"{self.web_url}/b/{self.shop.slug}?c={person.id}"
            asked = b.made - timedelta(minutes=self.rng.randint(2, 9))
            self.say(person, asked, "in", "text", BOOK[lang])
            self.say(person, asked + timedelta(seconds=4), "out", "text",
                     BOOK_LINK[lang].format(url=url))
            self.say(person, b.made + timedelta(seconds=3), "out", "text",
                     BOOKED[lang].format(n=b.number),
                     {"template": "booking_confirmed", "category": "utility", "sent_as": "text"})
            self.log("booking", b.id, person, "booked", b.made)
            if b.reminded:
                self.say(person, b.reminded, "out", "template", REMINDER[lang],
                         {"template": "booking_reminder", "category": "utility", "params": [],
                          "lang": lang})
            if b.status == "cancelled":
                self.log("booking", b.id, person, "cancelled",
                         min(b.made + timedelta(days=1), b.starts - timedelta(hours=3)))
            if b.status in ("completed", "no_show"):
                self.log("booking", b.id, person, b.status,
                         b.ends + timedelta(minutes=self.rng.randint(5, 40)), person.staff)

    async def write_record(self) -> None:
        conn = self.conn
        self.record_orders()
        self.record_bookings()
        self.messages.sort(key=lambda m: m[5])
        await conn.executemany(
            "insert into messages (contact_id, direction, kind, body, payload, created_at, "
            "status, sent_by, sent_by_user) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            self.messages,
        )
        self.activity.sort(key=lambda a: a[7])
        await conn.executemany(
            "insert into activity (subject, subject_id, contact_id, action, detail, actor_id, "
            "actor_name, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)",
            self.activity,
        )

    async def finish_contacts(self) -> None:
        """Each conversation's state follows its last message, as the inbox expects; and the
        report the owner got last Sunday."""
        conn = self.conn
        await conn.execute(
            "update contacts c set last_inbound_at = m.last_in, inbox_read_at = m.last_any, "
            "inbox_status = case when m.last_any > $1::timestamptz - interval '2 hours' "
            "then 'open' else 'closed' end "
            "from (select contact_id, max(created_at) filter (where direction = 'in') as last_in, "
            "max(created_at) as last_any from messages group by contact_id) m "
            "where m.contact_id = c.id and c.role = 'customer'",
            self.now,
        )
        week = report.last_full_week(self.now, await report._timezone(conn))
        built = await report.build(conn, week)
        sent = datetime.combine(week + timedelta(days=7), time(report.SEND_HOUR), TZ)
        await conn.execute(
            "insert into weekly_reports (week_start, sections, sent_at, created_at) "
            "values ($1, $2, $3, $3)", week, built["sections"], sent,
        )


async def run(made: Made, rng: random.Random, web_url: str) -> dict:
    """Work out and write the shop's last fortnight. Returns what it wrote, in counts."""
    fortnight = Fortnight(made, rng, web_url)
    fortnight.simulate()
    return await fortnight.write()
