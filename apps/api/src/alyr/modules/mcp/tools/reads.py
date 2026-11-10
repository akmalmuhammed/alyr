"""The read tools (ALY-290, spec 067): today, bookings, orders, owed, low stock, sales, tips and the
business's own details.

Each is an action of the same layer the workspace and the WhatsApp commands use
(`modules/owner/`); the number an app is told is the number on the screen it came from. A tool
only reads. What reaches the app is cut down here, in each `present`: a customer is a first name
(marked as written by the customer) and the last three digits of the number, never a message, an
ID or a full number; money only for the people who may see money (the action leaves it out for an
agent, and the tool says nothing about it).
"""

from alyr.modules.mcp import safety, scopes
from alyr.modules.mcp.registry import declare
from alyr.modules.mcp.tools.shape import keep, money, plain_text, who

DATE = {
    "type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$",
    "description": "A day, written year-month-day, like 2026-11-09.",
}
NO_ARGUMENTS = {"type": "object", "properties": {}, "additionalProperties": False}
# The tips whose rows are things the business sells, not customers.
ITEM_TIPS = {"unused_items"}


# ── today ─────────────────────────────────────────────────────────────────────────────────


def present_today(data: dict) -> dict:
    sections = {}
    for key, section in data["sections"].items():
        shown = dict(section)
        if "value" in shown:
            shown["value"] = money(shown["value"])
            if shown["value"] is None:
                del shown["value"]
        if "collected" in shown:
            shown["collected"] = money(shown["collected"])
        following = shown.get("next")
        if following:
            shown["next"] = {
                "time": following["time"], "service": plain_text(following["service"]),
                "customer": who(following["customer"], following.get("phone")),
            }
        sections[key] = shown
    return {"date": data["date"], "sections": sections}


declare(
    name="today",
    action="today",
    scope=scopes.READ,
    title="How today is going",
    description=(
        "How the business's day is going right now: orders so far today and how many are waiting "
        "or ready, today's bookings and the next one, what was collected on credit accounts, "
        "and how many customers wrote in. One small section for each part of ALYR the business "
        "uses. Use it for 'how is today going', 'how are we doing', 'what is happening now'. "
        "Amounts are in QAR and shown only to people allowed to see money. Changes nothing."
    ),
    input_schema=NO_ARGUMENTS,
    present=present_today,
)


# ── bookings ──────────────────────────────────────────────────────────────────────────────


def present_bookings(data: dict) -> dict:
    return {
        "from": data["date"], "to": data["to"],
        "bookings": [
            {
                "number": b["number"], "date": b["date"], "time": b["time"],
                "service": plain_text(b["service"]), "status": b["status"],
                "customer": who(b["customer"], b.get("phone")),
            }
            for b in data["items"]
        ],
        "more_not_shown": data["more"],
    }


declare(
    name="bookings",
    action="bookings",
    scope=scopes.READ,
    title="Bookings for a day or a few days",
    description=(
        "The bookings on a day, or on up to 14 days from that day, in time order with the time, "
        "the service, who booked (first name and last three digits of their number) and whether "
        "they came. Today's when no date is given. Times are in the business's own time zone. "
        "Use it for 'who is booked tomorrow', 'what is on this week'. Needs bookings to be "
        "switched on. Changes nothing."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "date": {**DATE, "description": "The first day. Leave out for today."},
            "days": {
                "type": "integer", "minimum": 1, "maximum": 14,
                "description": "How many days from the first day. 1 when left out.",
            },
        },
        "additionalProperties": False,
    },
    present=present_bookings,
)


# ── orders ────────────────────────────────────────────────────────────────────────────────


def present_orders(data: dict) -> dict:
    out = keep(data, "open", "date", "count", "cancelled", "more")
    if "more" in out:
        out["more_not_shown"] = out.pop("more")
    if data.get("value") is not None:
        out["value"] = money(data["value"])
    orders = []
    for o in data["items"]:
        row = {
            "number": o["number"], "status": o["status"], "payment": o["payment"],
            "placed_at": o["placed_at"], "customer": who(o["customer"], o.get("phone")),
            "lines": [plain_text(line) for line in o["lines"]],
        }
        if o.get("total") is not None:
            row["total"] = money(o["total"])
        orders.append(row)
    out["orders"] = orders
    return out


declare(
    name="orders",
    action="orders",
    scope=scopes.READ,
    title="Orders: open ones, or a day's",
    description=(
        "Orders. With no arguments, the open ones (new, confirmed or ready), newest first. Ask "
        "for 'today', 'yesterday' or a date to get every order of that day with how many there "
        "were, how many were cancelled and (for people allowed to see money) their total value. "
        "Each order shows its number, status, whether it is paid, what is in it and who ordered "
        "(first name and last three digits of their number). Times are in the business's own "
        "time zone. Needs orders to be switched on. Changes nothing."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "when": {
                "type": "string", "enum": ["open", "today", "yesterday", "date"],
                "description": "Which orders. 'open' when left out. Use 'date' with date.",
            },
            "date": DATE,
            "limit": {
                "type": "integer", "minimum": 1, "maximum": 25,
                "description": "How many to list. 8 when left out.",
            },
        },
        "additionalProperties": False,
    },
    present=present_orders,
)


# ── owed ──────────────────────────────────────────────────────────────────────────────────


def present_owed(data: dict) -> dict:
    return {
        "total_owed": money(data["total"]),
        "customers_owing": data["customers"],
        "late_total": money(data["late_total"]),
        "late_customers": data["late_customers"],
        "biggest": [
            {"customer": who(row["name"], row.get("phone")), "owes": money(row["balance"]),
             "late": row["late"]}
            for row in data["top"]
        ],
    }


declare(
    name="owed",
    action="owed",
    scope=scopes.READ,
    title="Who owes the business money",
    description=(
        "What customers owe on their credit accounts: the total, how many customers owe, how much "
        "of it is late (over 60 days) and the five who owe the most (first name and last three "
        "digits of their number). Use it for 'who owes us', 'how much is outstanding'. Only for "
        "owners and admins, and needs credit accounts to be switched on. Changes nothing."
    ),
    input_schema=NO_ARGUMENTS,
    present=present_owed,
)


# ── low_stock ─────────────────────────────────────────────────────────────────────────────


def present_low_stock(data: dict) -> dict:
    def item(row: dict) -> dict:
        shown = {"name": plain_text(row["name"]), "name_ar": plain_text(row["name_ar"]),
                 "code": row["code"]}
        if "left" in row:
            shown["left"] = row["left"]
            if row["unit"]:
                shown["unit"] = row["unit"]
        return shown

    return {
        "low_stock_number": data["low_stock_number"],
        "low_count": data["low_count"], "sold_out_count": data["sold_out_count"],
        "running_low": [item(r) for r in data["low"]],
        "sold_out": [item(r) for r in data["sold_out"]],
        "more_not_shown": data["more_low"] + data["more_sold_out"],
    }


declare(
    name="low_stock",
    action="low_stock",
    scope=scopes.READ,
    title="What is sold out or running low",
    description=(
        "The items that are sold out and the ones running low (at or under the business's "
        "low-stock number, lowest first), with each item's name in English and Arabic and its "
        "code. Use it for 'what is running out', 'what is sold out', before deciding what to "
        "restock. Needs the catalog to be switched on. Changes nothing."
    ),
    input_schema=NO_ARGUMENTS,
    present=present_low_stock,
)


# ── sales_summary ─────────────────────────────────────────────────────────────────────────


def _against(found: dict | None) -> dict | None:
    if found is None:
        return None
    return {"was": found["was"], "difference": found["difference"],
            **keep(found, "percent")}


def present_sales(data: dict) -> dict:
    out = keep(data, "period", "from", "to", "orders", "came_back", "compared_with")
    out["sales"] = money(data["sales"])
    if "paid_by_link" in data:
        out["paid_by_payment_link"] = money(data["paid_by_link"])
    if data.get("orders_against"):
        out["orders_against"] = _against(data["orders_against"])
    if data.get("sales_against"):
        against = data["sales_against"]
        out["sales_against"] = {
            "was": money(against["was"]), "difference": money(against["difference"]),
            **keep(against, "percent"),
        }
    return out


declare(
    name="sales_summary",
    action="sales_summary",
    scope=scopes.READ,
    title="Sales and orders: a day or a week",
    description=(
        "Orders and sales (in QAR) for 'today', 'yesterday', 'this_week' (Sunday to now) or "
        "'last_week', each compared the way the business's own dashboard compares: this week "
        "against last week to the same time, a day against the same weekday a week earlier. A "
        "percentage is given only when both periods have 20 or more orders. Cancelled orders do "
        "not count. Use it for 'how were sales this week', 'are we up on last week'. Only for "
        "owners and admins, and needs orders to be switched on. Changes nothing."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "period": {
                "type": "string", "enum": ["today", "yesterday", "this_week", "last_week"],
                "description": "Which period. 'today' when left out.",
            },
        },
        "additionalProperties": False,
    },
    present=present_sales,
)


# ── insights ──────────────────────────────────────────────────────────────────────────────


def present_insights(data: dict) -> dict:
    def tip(row: dict) -> dict:
        names = row["rows"]
        if row["key"] in ITEM_TIPS:
            shown = [plain_text(n) for n in names]
        else:
            shown = [safety.untrusted(safety.first_name(n), "customer name", safety.NAME_MAX)
                     for n in names]
        return {
            "key": row["key"], "kind": row["kind"], "tip": plain_text(row["title"]),
            "the_rule_that_raised_it": plain_text(row["rule"]),
            "what_to_do": plain_text(row["what_to_do"] or ""),
            "workspace_screen": row["screen"],
            "who_or_what": shown, "more_not_shown": row["more_rows"],
        }

    return {
        "needs_attention_now": [
            {"key": n["key"], "count": n["count"], "what": plain_text(n["title"]),
             "the_rule_that_raised_it": plain_text(n["rule"]), "workspace_screen": n["screen"]}
            for n in data["needs"]
        ],
        "tips": [tip(t) for t in data["tips"]],
    }


declare(
    name="insights",
    action="insights",
    scope=scopes.READ,
    title="What needs attention, and tips",
    description=(
        "What the business's dashboard says needs attention now (chats waiting, orders to "
        "confirm, money to chase) and up to three tips, each with the plain-words rule that "
        "raised it, which screen of the workspace deals with it, and first names of the "
        "customers it counts. Nothing is guessed: each line is raised by a written rule and "
        "says which. Use it for 'what should I do today', 'anything I should know'. Owners and "
        "admins also see the money tips. Changes nothing."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "lang": {
                "type": "string", "enum": ["en", "ar"],
                "description": "Answer in English (en) or Arabic (ar). English when left out.",
            },
        },
        "additionalProperties": False,
    },
    present=present_insights,
)


# ── shop_info ─────────────────────────────────────────────────────────────────────────────


def present_shop(data: dict) -> dict:
    return {
        "name": plain_text(data["name"]), "name_ar": plain_text(data["name_ar"]),
        **keep(data, "business_type", "time_zone", "language", "currency", "modules_on",
               "opening_hours"),
    }


declare(
    name="shop_info",
    action="shop_info",
    scope=scopes.READ,
    title="About the business",
    description=(
        "The business's name in English and Arabic, its kind of business, time zone, usual "
        "language, opening hours by day and which parts of ALYR it has switched on. Use it for "
        "'when are we open', 'what do we use'. Use hello instead to find out who is asking. "
        "Changes nothing."
    ),
    input_schema=NO_ARGUMENTS,
    present=present_shop,
)
