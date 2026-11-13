"""C4, "N people started an order and did not finish, about QAR X" (insights plan, row C4).

What is stored, and so what this can say. The only unfinished order ALYR keeps is the draft a
customer builds by messaging the shop's WhatsApp number (`chat_carts`, modules/items/chat_cart.py):
one row per customer, rewritten on each message, thrown away when the order is placed, and
expired six hours after the last message. The customer's order page keeps its basket in the
customer's own browser: the cart check (`POST /{slug}/cart/check`) changes nothing, so a basket
left on the order page is not stored anywhere and is not counted here.

"Started and did not finish", from those columns: a draft with at least one line, last touched
between one hour and six hours ago (inside an hour the customer may still be ordering; after six
the draft is gone), whose customer has placed no order since it was last touched. The value is
the prices on its lines, the prices the customer was last shown, times the quantities. Expired
drafts that are still lying in the table are not counted: the chat clears them only when that
customer or a new draft comes along, so counting them would depend on when that happened.

One query. At most `MAX_OPEN` (500) drafts exist per shop; `chat_carts_expiry` (tenant_id,
expires_at) answers the live ones and `orders_contact` (tenant_id, contact_id) the check for a
later order. Staff and test contacts are not customers and are left out.
"""

from datetime import timedelta

import asyncpg

from alyr.catalog import Text
from alyr.core.words import CUSTOMERS
from alyr.modules.agent.facts import Facts, Row
from alyr.modules.agent.model import Finding, Insight
from alyr.modules.agent.words import B, agree, count, money, rich

KEY = "carts"
IDLE = timedelta(hours=1)  # a customer who wrote within this hour may still be ordering
MIN_CARTS = 3
SHOWN = 10  # people named in the "show me" list; the count and the value cover everyone


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    records = await conn.fetch(
        "select c.id, c.name, "
        "  coalesce((select sum(round((l->>'price')::numeric * (l->>'quantity')::numeric)) "
        "            from jsonb_array_elements(k.lines) l), 0)::bigint as value "
        "from chat_carts k join contacts c on c.id = k.contact_id "
        "where k.expires_at > $1 and k.updated_at <= $1::timestamptz - $2::interval "
        "  and jsonb_array_length(k.lines) > 0 "
        "  and c.role = 'customer' and coalesce(c.wa_user_id, '') not like 'TEST.%' "
        "  and not exists (select 1 from orders o where o.contact_id = k.contact_id "
        "                  and o.created_at >= k.updated_at) "
        "order by value desc, c.id",
        f.now, IDLE,
    )
    f.extra[KEY] = {
        "n": len(records),
        "value": sum(r["value"] for r in records),
        "rows": [(str(r["id"]), r["name"] or "", r["value"]) for r in records[:SHOWN]],
    }


def _find(f: Facts) -> Finding | None:
    got = f.extra.get(KEY)
    if not got or got["n"] < MIN_CARTS or got["value"] <= 0:
        return None
    rows = [Row(i, name, {"value": value}) for i, name, value in got["rows"]]
    return Finding(rows, CUSTOMERS, {"n": got["n"], "value": got["value"]}, total=got["n"])


def _say(x: Finding, f: Facts, lang: str):
    amount = B(money(x.numbers["value"], lang))
    who = count(x.n, x.noun, lang)
    if lang == "ar":
        verb = agree(x.n, "بدأ طلباً في المحادثة ولم يكمله", "بدآ طلباً في المحادثة ولم يكملاه",
                     "بدؤوا طلباً في المحادثة ولم يكملوه")
        return (
            rich("{who} " + verb + "، بنحو {a}", who=who, a=amount),
            rich("آخر رسالة منهم قبل ساعة إلى 6 ساعات، والمبلغ بالأسعار التي رأوها. "
                 "الطلبات التي تبدأ في صفحة الطلب لا تُحتسب."),
        )
    return (
        rich("{who} started an order in chat and did not finish, about {a}", who=who, a=amount),
        rich("Last message 1 to 6 hours ago; the amount is at the prices they were shown. "
             "Orders started on the order page are not counted."),
    )


INSIGHT = Insight(
    KEY, 26, "knowledge", "orders",
    Text("3 or more customers with an order started in chat, last message 1 to 6 hours ago, "
         "nothing ordered since",
         "3 عملاء أو أكثر بدؤوا طلباً في المحادثة، وآخر رسالة منهم قبل ساعة إلى 6 ساعات، "
         "ولم يطلبوا بعدها"),
    _find, _say, status=Text("Information only.", "للعلم فقط."), money=True,
)
