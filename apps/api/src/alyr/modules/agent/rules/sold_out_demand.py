"""27. Sold-out demand (plan row C5): customers who asked for an item while it was sold out.

What it reads (stored already, nothing new):

* `sold_out_asks` (migration 0030): one row per customer, item and shop day, written when a
  customer's cart check or order is refused for a sold-out item, or when the chat shows a
  customer a sold-out item (`modules/items/demand.py`). Only for a shop whose `catalog`
  module is on, only for customers.
* `stock_watches` (migration 0027): "tell me when it is back". One row per customer and item
  while `waiting`. When stock returns, `items/events.py` queues a job and `items/watches.py`
  sends the one message and closes the request. A request counts here only while it is
  `waiting`, has not expired, and its customer still holds the `back_in_stock` agreement
  (`contacts.consent_back_in_stock = 'granted'`), because `watches.py` closes a request
  without sending when that agreement is gone.

It counts distinct customers per item over the last 30 days, never rows (a customer who
asks on three days is one). The card is information only: the Catalog screen (`/app/catalog`,
filtered to what is sold out now) is where the owner puts the item back.
"""

from datetime import timedelta

import asyncpg

from alyr.catalog import Text
from alyr.core.words import CUSTOMERS
from alyr.modules.agent.facts import Facts, Row
from alyr.modules.agent.model import Action, Finding, Insight
from alyr.modules.agent.words import B, agree, count, rich

KEY = "sold_out_demand"
DAYS = 30
# Fewer than this many customers asking for one item is a coincidence, not a pattern.
MIN_CUSTOMERS = 3
# The most items the card names.
MAX_ITEMS = 3

_ASKED = (
    "with asked as ("
    "  select distinct a.item_id, a.contact_id, c.consent_back_in_stock = 'granted' as agreed"
    "  from sold_out_asks a"
    "  join contacts c on c.id = a.contact_id"
    "  join items i on i.id = a.item_id"
    "  where a.created_at > $1 and a.created_at <= $2"
    "    and i.status = 'live'"
    "    and c.role = 'customer' and coalesce(c.wa_user_id, '') not like 'TEST.%'"
    "), per_item as ("
    "  select s.item_id, count(*)::int as people,"
    "         (count(*) filter (where s.agreed and exists ("
    "            select 1 from stock_watches w"
    "            where w.contact_id = s.contact_id and w.item_id = s.item_id"
    "              and w.status = 'waiting' and w.expires_at > $2)))::int as waiting"
    "  from asked s group by s.item_id"
    ") "
    "select i.id::text as id, i.name, i.name_ar, p.people, p.waiting "
    "from per_item p join items i on i.id = p.item_id "
    "order by p.people desc, i.name, i.id limit $3"
)


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    """The items customers asked for most while they were sold out, in the last 30 days,
    and how many of those customers are waiting to be told when each is back. One query."""
    if "catalog" not in f.modules:
        return  # nothing is recorded for a shop without the Catalog
    records = await conn.fetch(_ASKED, f.now - timedelta(days=DAYS), f.now, MAX_ITEMS)
    f.extra[KEY] = {"items": [dict(r) for r in records]}


def _find(f: Facts) -> Finding | None:
    items = [i for i in f.extra.get(KEY, {}).get("items", []) if i["people"] >= MIN_CUSTOMERS]
    if not items:
        return None
    rows = [
        Row(i["id"], i["name"], {
            "name_ar": i["name_ar"], "people": i["people"], "waiting": i["waiting"],
        })
        for i in items
    ]
    top = items[0]
    return Finding(
        rows, CUSTOMERS, {"people": top["people"], "waiting": top["waiting"]},
        total=top["people"],
    )


def _name(row: Row, lang: str) -> str:
    return (row.detail.get("name_ar") or row.label) if lang == "ar" else row.label


def _say(x: Finding, f: Facts, lang: str):
    top, others = x.rows[0], x.rows[1:]
    people, waiting = x.numbers["people"], x.numbers["waiting"]
    who = count(people, CUSTOMERS, lang)
    name = B(_name(top, lang))
    if lang == "ar":
        title = rich("طلب {who} {name} خلال 30 يوماً حين نفدت الكمية", who=who, name=name)
        if waiting == 0:
            parts = rich("لا أحد منهم ينتظر إبلاغه عند عودة الصنف.")
        elif waiting == people:
            parts = rich("كلهم ينتظرون إبلاغهم عند عودة الصنف.")
        else:
            verb = agree(
                waiting, "واحد منهم ينتظر إبلاغه عند عودة الصنف.",
                "اثنان منهم ينتظران إبلاغهما عند عودة الصنف.",
                "{w} منهم ينتظرون إبلاغهم عند عودة الصنف.",
            )
            parts = rich(verb, w=B(str(waiting)))
        if others:
            names = "، ".join(_name(r, lang) for r in others)
            parts += rich(" وطلب العملاء أيضاً: {names}.", names=B(names))
        return title, parts
    title = rich("{who} asked for {name} in 30 days while it was sold out", who=who, name=name)
    if waiting == 0:
        parts = rich("None of them is waiting to be told when it is back.")
    elif waiting == people:
        parts = rich("All of them are waiting to be told when it is back.")
    else:
        parts = rich("{w} of them {verb} waiting to be told when it is back.",
                     w=B(str(waiting)), verb="is" if waiting == 1 else "are")
    if others:
        names = ", ".join(_name(r, lang) for r in others)
        parts += rich(" Also asked for: {names}.", names=B(names))
    return title, parts


INSIGHT = Insight(
    KEY, 27, "knowledge", "orders",
    Text(
        "3 or more customers asked for the same item while it was sold out, in the last 30 days",
        "3 عملاء أو أكثر طلبوا الصنف نفسه وهو نافد خلال آخر 30 يوماً",
    ),
    _find, _say,
    Action(Text("Show the sold out items", "اعرض الأصناف النافدة"), "/app/catalog?show=sold_out"),
)
