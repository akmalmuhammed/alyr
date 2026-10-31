"""Ten weeks of Zaman Bakehouse, worked out in memory and written the way the product writes
it (spec 063).

This is the demo shops' fortnight (`demo/history.py`) stretched to ten weeks and changed where
a bakery with a catering side differs from a one-room shop:

* The week has a rhythm: Thursday and Friday are the busy days, Monday and Tuesday are quiet,
  and the shop grows through the ten weeks, so this week and last week are the busiest.
* Offices, a school, a clinic and event companies order trays on account, on their own
  cadence, and pay (or do not pay) the way their habit says: promptly, monthly, slowly, late,
  or not at all. Two have a balance brought forward from before ALYR, so the credit screen has
  money in every age band and one account over its limit.
* Some ordinary customers pay in cash at the counter and the shop records it by hand; some
  get delivery with a fee. Both are written into the order the way the order page writes them.

Every stock count, hold, price and total is still decided by the same code as the demo shops,
so the stock log adds up to the stored numbers and every order is its lines' sum.
"""

from datetime import timedelta

from alyr.demo import history
from alyr.demo.history import Line, Placed, local

# Python's weekday: Monday is 0. Thursday and Friday are the busy days at a Doha bakery.
WEEKDAY = {0: 0.80, 1: 0.80, 2: 0.95, 3: 1.35, 4: 1.40, 5: 1.05, 6: 0.90}
# How a customer pays on account: the days between an order and the payment, or a rule.
LAG = {"prompt": (6, 12), "slow": (38, 55), "current": (16, 26)}
# Balances brought forward from before ALYR, in riyals and days ago (a shop's credit book).
BROUGHT_FORWARD = {"late": (1_850, 104), "over": (1_200, 64)}
# The first days of the history an account orders in (the rest of the ten weeks: nothing).
ACTIVE = {"aged": (0, 28), "late": (0, 34)}
# Days between orders, at most, for an account's habit.
CADENCE = {"prompt": 7, "monthly": 10, "slow": 8, "aged": 6, "current": 15, "late": 9,
           "over": 7}
ZONES = (
    ("West Bay and Pearl", "الخليج الغربي واللؤلؤة", 15),
    ("Al Sadd and Musheireb", "السد والمشيرب", 12),
    ("Lusail", "لوسيل", 25),
)


class Story(history.Fortnight):
    def __init__(self, made, rng, web_url, *, days, profiles, names, zones=()):
        super().__init__(made, rng, web_url, days)
        self.profiles = profiles  # contact id -> habit of an account
        self.names = names  # staff email -> name
        self.zones = zones  # delivery zones as saved: (id, name, name_ar, fee)
        self.invoice_payments: list = []  # (placed order, when, amount, method)
        self.brought: dict = {}  # contact id -> (amount, when)
        self.account_orders: dict = {}
        self.delivered: dict = {}  # order id -> zone
        self.pending_cash: list = []
        for person in made.people:
            habit = profiles.get(person.id)
            if habit in BROUGHT_FORWARD:
                riyals, ago = BROUGHT_FORWARD[habit]
                self.brought[person.id] = (riyals * 100, self.now - timedelta(days=ago))
                self.balance[person.id] = riyals * 100

    # ── who did it ────────────────────────────────────────────────────────────────────────

    def actor(self, email: str) -> tuple:
        return self.made.users[email], self.names[email]

    # ── when customers order ──────────────────────────────────────────────────────────────

    def plan_orders(self) -> None:
        shop, rng = self.shop, self.rng
        weights = self.hour_weights()
        for i in range(self.days):
            day = self.first_day + timedelta(days=i)
            ramp = 0.50 + 0.85 * i / (self.days - 1)
            factor = WEEKDAY[day.weekday()] * ramp
            count = max(0, round(shop.orders_a_day * factor + rng.uniform(-1.2, 1.2)))
            hours = dict(weights)
            if day.weekday() == 4:  # Friday: the morning starts late, the evening is full
                hours = {h: w * (0.4 if h < 11 else 1.6) for h, w in hours.items()}
            for _ in range(count):
                hour = rng.choices(list(hours), list(hours.values()))[0]
                at = local(day, hour, rng.randrange(0, 60))
                if at < self.now - timedelta(minutes=45):
                    self.push(at, "order", "")
        # Right now: one order waiting for its payment link and one that just came in.
        self.push(self.now - timedelta(minutes=21), "order", "pending")
        self.push(self.now - timedelta(minutes=8), "order", "")
        for index, person in enumerate(self.made.people):
            habit = self.profiles.get(person.id)
            if habit:
                self.plan_account(index, person, habit)

    def plan_account(self, index: int, person, habit: str) -> None:
        rng = self.rng
        first, last = ACTIVE.get(habit, (0, self.days - 1))
        every = CADENCE[habit]
        offset = rng.randint(first, first + every - 1)
        weekday_pull = rng.choice([6, 0, 1, 2])  # Sunday to Wednesday mornings
        while offset <= min(last, self.days - 1):
            day = self.first_day + timedelta(days=offset)
            if day.weekday() != weekday_pull:
                day += timedelta(days=(weekday_pull - day.weekday()) % 7)
            at = local(day, rng.randint(7, 10), rng.randrange(0, 60))
            if person.first_seen < at < self.now - timedelta(hours=2):
                self.push(at, "order", f"acct:{index}")
            offset += every + rng.randint(-1, 3)

    # ── a basket for an office ────────────────────────────────────────────────────────────

    def catering_basket(self, person, at) -> list[Line]:
        rng = self.rng
        items = [i for i in self.made.items.values() if self.sellable(i, at)]
        trays = [i for i in items if i.product.category == "Catering and trays"]
        bulk = [i for i in items if i.product.category in ("Breads", "Pastries and savouries")
                and i.rule == "daily_limit" and not i.product.lead]
        lines: list[Line] = []
        for item in rng.sample(trays, min(len(trays), rng.choice([1, 1, 2]))):
            floor = max(item.product.min_order, 1)
            quantity = floor * rng.choice([1, 1, 2]) if floor > 1 else rng.choice([1, 1, 2, 3])
            line = self.bulk_line(item, at, person, quantity)
            if line:
                lines.append(line)
        if rng.random() < 0.55 and bulk:
            item = rng.choice(bulk)
            line = self.bulk_line(item, at, person, rng.choice([6, 8, 10, 12]))
            if line:
                lines.append(line)
        return lines

    def bulk_line(self, item, at, person, quantity: int) -> Line | None:
        var = self.by_item[item.product.key][0]
        day, fulfil = self.pick_day(item, at)
        if item.rule in ("count", "daily_limit"):
            left = var.left(day) or 0
            keep = max(1, (var.limit or 0) // 6) if item.rule == "daily_limit" else 0
            if left - keep < quantity:
                return None
        chosen = self.choices_of(item)
        price = self.unit_price(item.product, var, chosen, person, at)
        return Line(item, var, chosen, quantity, price, day, fulfil)

    def do_order(self, at, payload: str) -> None:
        if payload.startswith("acct:"):
            person = self.made.people[int(payload.split(":")[1])]
            lines = self.catering_basket(person, at)
            if lines:
                self.place_lines(at, person, lines)
            return
        super().do_order(at, payload)

    def who(self, at):
        """Ordinary customers only: the accounts order on their own cadence."""
        weight = {"regular": 7, "occasional": 1.5, "new": 2.5}
        pool = [p for p in self.made.people
                if p.first_seen <= at and p.customer.kind in weight]
        if not pool:
            return None
        return self.rng.choices(pool, [weight[p.customer.kind] for p in pool])[0]

    # ── how an order is paid ──────────────────────────────────────────────────────────────

    def place_lines(self, at, person, lines, pending=False, plain=False) -> None:
        before = len(self.placed)
        super().place_lines(at, person, lines, pending, plain)
        if len(self.placed) == before:
            return
        o = self.placed[-1]
        o.catering = person.customer.kind == "account"
        if o.on_account and not o.reversed:
            self.schedule_payment(o)
        elif (self.zones and not o.on_account and o.status != "cancelled"
              and o.fulfil_on is None and self.rng.random() < 0.22):
            self.make_delivery(o)

    def make_delivery(self, o: Placed) -> None:
        """A delivery order: the fee is part of the total (the order page's own sum), unless
        the goods came to enough to ride free."""
        zone = self.rng.choice(self.zones)
        fee = 0 if o.total >= 15_000 else zone[3]
        o.total += fee
        self.delivered[o.id] = (zone, fee)

    def settle(self, o: Placed, age, holds) -> None:
        """Most paid orders came through the payment link; of the ones the link never closed,
        about half were cash at the counter and the shop recorded it by hand."""
        super().settle(o, age, holds)
        if (o.request == "pending" and not holds and o.status in ("ready", "done")
                and age > timedelta(hours=3) and self.rng.random() < 0.6):
            o.payment, o.request, o.cash = "paid", "", True
            ready = o.ready_at or (o.at + timedelta(minutes=45))
            o.paid_at = min(max(ready, o.at + timedelta(minutes=20)), self.now - timedelta(minutes=5))

    def schedule_payment(self, o: Placed) -> None:
        habit = self.profiles[o.person.id]
        rng = self.rng
        if habit in LAG:
            low, high = LAG[habit]
            at = o.at + timedelta(days=rng.randint(low, high), hours=rng.randint(1, 5))
        elif habit == "monthly":
            first = (o.at + timedelta(days=6)).astimezone(history.TZ).date()
            month_end = first.replace(day=28) if first.day <= 28 else first + timedelta(days=3)
            at = local(month_end, 11, rng.randrange(0, 50))
        else:  # aged, late, over: they do not pay
            return
        if at < self.now - timedelta(hours=2):
            self.push(at, "pay_order", o)

    def do_pay_order(self, at, o: Placed) -> None:
        method = self.rng.choice(["bank_transfer", "bank_transfer", "cheque"])
        self.balance[o.person.id] = self.balance.get(o.person.id, 0) - o.total
        self.invoice_payments.append((o, at, o.total, method))

    # ── what is written about delivery ────────────────────────────────────────────────────

    def number_orders(self, start: int = 1001) -> None:
        """Order numbers rise with time, as they do in a shop: the first order of the ten weeks
        is #1001."""
        for number, order in enumerate(sorted(self.placed, key=lambda o: o.at), start=start):
            order.number = number

    async def write_orders(self) -> None:
        await super().write_orders()
        for o in self.placed:
            if o.id not in self.delivered:
                continue
            (zone_id, name, name_ar, _), fee = self.delivered[o.id]
            await self.conn.execute(
                "update orders set fulfilment = 'delivery', delivery_zone_id = $2, "
                "delivery_zone_name = $3, delivery_zone_name_ar = $4, delivery_address = $5, "
                "delivery_fee = $6, subtotal = $7, delivery_on = $8 where id = $1",
                o.id, zone_id, name, name_ar,
                "Villa 12, street 910" if o.person.customer.lang == "en" else "فيلا 12، شارع 910",
                fee, o.total - fee, o.fulfil_on or o.at.astimezone(history.TZ).date(),
            )
        # Pickup is the rest: say so, as the order page does.
        await self.conn.execute(
            "update orders set fulfilment = 'pickup' where fulfilment is null and id = any($1)",
            [o.id for o in self.placed],
        )

