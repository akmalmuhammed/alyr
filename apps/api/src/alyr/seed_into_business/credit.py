"""The credit accounts' last touches: the balances brought forward from before ALYR, one
account over its limit, promises to pay, and the reminders the shop already sent (spec 063).

The sales and payments themselves come from the story (an office orders trays on account; each
order is a sale on the customer's account, each payment is recorded against its invoice). What
is added here is what a shop's credit book has that ten weeks of orders cannot explain: debts
that are older than the system, a customer who is over the limit, and the chasing. A reminder
is *recorded*, in the chat and on the account's history; nothing is sent.
"""

from datetime import timedelta

from alyr.modules.ledger import service as ledger
from alyr.seed_into_business.context import Run

REMINDER = {
    "en": "A reminder from Zaman Bakehouse: your account balance is {amount}. Please arrange "
          "payment, or tell us when we can expect it. Thank you.",
    "ar": "تذكير من مخبز زمان: رصيد حسابكم {amount}. نرجو ترتيب السداد أو إبلاغنا بالموعد "
          "المتوقع. شكراً لكم.",
}
FINAL = {
    "en": "Final reminder from Zaman Bakehouse: your account balance of {amount} is long "
          "overdue. Please call us this week so we can agree a plan.",
    "ar": "تذكير أخير من مخبز زمان: رصيد حسابكم {amount} متأخر منذ فترة طويلة. نرجو الاتصال "
          "بنا هذا الأسبوع للاتفاق على خطة.",
}
PROMISE = {
    "en": "We will transfer the payment next week, please bear with us.",
    "ar": "سنحوّل المبلغ الأسبوع القادم، نرجو التفهّم.",
}
# habit -> days ago the reminders went, the last of them final; when a promise was made
REMINDERS = {
    "slow": {"days": (6,), "promise": None},
    "aged": {"days": (24, 10), "promise": (9, -3)},
    "late": {"days": (45, 28, 12), "final": True, "promise": None},
    "over": {"days": (5,), "promise": None},
}


def money(riyals: int, lang: str) -> str:
    return f"{riyals:,} ر.ق" if lang == "ar" else f"QAR {riyals:,}"


async def finish(run: Run, conn, story, dina_name: str) -> dict:
    """Brought-forward balances, the one account over its limit, promises and reminders."""
    rng, now = story.rng, story.now
    dina = run.staff["dina"]
    for contact_id, (amount, when) in story.brought.items():
        await ledger.add_entry(conn, contact_id, "sale", amount, "Balance brought forward",
                               dina_name, at=when)
    made = {"reminders": 0, "promises": 0, "over_limit": 0}
    for person in story.made.people:
        habit = story.profiles.get(person.id)
        if not habit:
            continue
        lang = person.customer.lang
        await conn.execute(
            "insert into ledger_accounts (contact_id, assigned_to) values ($1, $2) "
            "on conflict do nothing", person.id, dina)
        await conn.execute("update ledger_accounts set assigned_to = $2 where contact_id = $1",
                           person.id, dina)
        if habit == "over":
            aged = await ledger.aged(conn, person.id)
            target = int(person.customer.credit * 1.09)
            if aged.balance < target:
                await ledger.add_entry(
                    conn, person.id, "adjustment", target - aged.balance,
                    "Corrected invoice: extra tray added", dina_name,
                    at=now - timedelta(days=3, hours=2), documents=False)
            made["over_limit"] += 1
        plan = REMINDERS.get(habit)
        if not plan:
            continue
        balance = (await ledger.aged(conn, person.id)).balance
        amount = money(round(balance / 100), lang)
        last = None
        for number, days in enumerate(plan["days"], start=1):
            at = now - timedelta(days=days, hours=rng.randint(0, 4))
            final = plan.get("final") and number == len(plan["days"])
            text = (FINAL if final else REMINDER)[lang].format(amount=amount)
            template = "payment_reminder_final" if final else (
                "payment_reminder_overdue" if number > 1 or habit != "slow" else "payment_reminder")
            story.messages.append((
                person.id, "out", "template", text,
                {"template": template, "category": "utility", "params": [], "lang": lang},
                at, "read", dina_name, dina))
            story.log("account", person.id, person, "reminded", at, run.emails["dina"])
            last = at
        promised = None
        if plan["promise"]:
            ago, until = plan["promise"]
            said = now - timedelta(days=ago)
            story.say(person, said, "in", "text", PROMISE[lang])
            promised = (now + timedelta(days=until)).date()
            story.log("account", person.id, person, "promised", said, None,
                      {"until": promised.isoformat()})
            made["promises"] += 1
        elif habit == "slow":
            promised = (now + timedelta(days=4)).date()
            made["promises"] += 1
        await conn.execute(
            "update ledger_accounts set promised_until = $2, last_reminded_at = $3, "
            "reminder_count = $4 where contact_id = $1",
            person.id, promised, last, len(plan["days"]))
        made["reminders"] += len(plan["days"])
    return made
