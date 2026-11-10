"""The stock tools (ALY-291, spec 067): sold out, back in stock, set the count, and undo.

Each changes something, so each is a changing tool: the first call returns a preview and a confirm
token, the second (after the owner's yes) does it. The previews are made by the same `plan_*`
functions the change itself uses (`modules/mcp/stock_actions.py`), from the catalog as it is at
that moment, so an item that cannot be changed, or a name that fits two items, is said at the
preview and nothing is spent.
"""

from alyr.modules.mcp import scopes
from alyr.modules.mcp import stock_actions as acts
from alyr.modules.mcp.registry import declare
from alyr.modules.mcp.safety import Preview

ITEM = {
    "type": "string", "minLength": 1, "maxLength": 80,
    "description": (
        "The item's name, in English or Arabic, or its code number (like 214). For one size or "
        "colour of an item, add it to the name, like 'abaya black M'."
    ),
}
NOBODY = "No customer is messaged by this."
MANAGERS_MAY = (
    " The business's managers may get the catalog's usual sold-out or low-stock alert on "
    "WhatsApp."
)


async def _told(conn, plan: acts.Plan) -> tuple[str, str]:
    """Who hears of it, and what cannot be taken back, said plainly."""
    people = await acts.waiting(conn, plan.item["id"]) if plan.increases else 0
    if people:
        noun = "customer" if people == 1 else "customers"
        return (
            f"{people} {noun} who asked to be told when this is back will get one message "
            "from ALYR (the catalog's own 'back in stock' message, sent only to people who "
            "agreed to it).",
            "that message to the customers cannot be taken back; the change to the stock can",
        )
    return (NOBODY + (MANAGERS_MAY if plan.low_alert else ""), "")


async def _preview(conn, plan: acts.Plan) -> Preview:
    told, cannot = await _told(conn, plan)
    return Preview(
        what=plan.what + " " + acts.UNDO_NOTE, who_is_told=told, cannot_undo=cannot, affects=1,
        data={"item": plan.label},
    )


async def preview_sold_out(conn, caller, args: dict) -> Preview:
    return await _preview(conn, await acts.plan_sold_out(conn, args))


async def preview_back(conn, caller, args: dict) -> Preview:
    return await _preview(conn, await acts.plan_back(conn, args))


async def preview_set_stock(conn, caller, args: dict) -> Preview:
    return await _preview(conn, await acts.plan_set_stock(conn, args))


async def preview_undo(conn, caller, args: dict) -> Preview:
    plan = await acts.plan_undo(conn, caller, args)
    return Preview(what=plan.what, who_is_told="nobody", affects=1,
                   data={"item": acts._name(plan.entry.item)})


declare(
    name="mark_sold_out",
    action="mcp.mark_sold_out",
    scope=scopes.STOCK,
    title="Mark an item as sold out",
    description=(
        "Mark an item as sold out so customers cannot order it, for example when the owner says "
        "'we have no more pancakes'. Give the item's name or code. If two items fit the name you "
        "get a 'did you mean' list: ask the owner which, then call again with its code. For one "
        "size or colour that is counted, its count is set to 0. First call gives a preview and a "
        "confirm token: show the preview to the owner and wait for their yes before calling "
        "again with the token. The change can be undone with undo_stock_change."
    ),
    input_schema={
        "type": "object", "properties": {"item": ITEM}, "required": ["item"],
        "additionalProperties": False,
    },
    changing=True, idempotent=True, preview=preview_sold_out,
)

declare(
    name="mark_back_in_stock",
    action="mcp.mark_back_in_stock",
    scope=scopes.STOCK,
    title="Put an item back on sale",
    description=(
        "Switch an item that was marked sold out back on, so customers can order it again, for "
        "example when the owner says 'pancakes are back'. Give the item's name or code. An item "
        "that is counted in stock and has none counted stays unorderable: use set_stock to say "
        "how many there are. If two items fit you get a 'did you mean' list. First call gives a "
        "preview and a confirm token: show it to the owner and wait for their yes. Customers who "
        "asked to be told when it is back are messaged by ALYR after that, and the preview says "
        "how many. The change can be undone with undo_stock_change."
    ),
    input_schema={
        "type": "object", "properties": {"item": ITEM}, "required": ["item"],
        "additionalProperties": False,
    },
    changing=True, idempotent=True, preview=preview_back,
)

declare(
    name="set_stock",
    action="mcp.set_stock",
    scope=scopes.STOCK,
    title="Set how many are in stock",
    description=(
        "Set the number in stock for an item that is counted, for example 'we have 12 left'. "
        "This is a count of the shelf: it replaces the number ALYR had. Give the item's name or "
        "code and the number. An item with several sizes or colours needs the size in the name, "
        "like 'abaya black M'. If two items fit you get a 'did you mean' list. First call gives "
        "a preview and a confirm token: show it to the owner and wait for their yes. The change "
        "can be undone with undo_stock_change."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "item": ITEM,
            "count": {"type": "number", "minimum": 0, "maximum": 1000000,
                      "description": "How many are in stock now. A whole number, or a decimal "
                                     "for something sold by weight."},
        },
        "required": ["item", "count"],
        "additionalProperties": False,
    },
    changing=True, idempotent=True, preview=preview_set_stock,
)

declare(
    name="undo_stock_change",
    action="mcp.undo_stock_change",
    scope=scopes.STOCK,
    title="Undo a stock change",
    description=(
        "Take back a change made with mark_sold_out, mark_back_in_stock or set_stock, using the "
        "change_id from that answer. It works only while the item has not been changed again "
        "since, and only for the person who made the change or an owner or admin. First call "
        "gives a preview and a confirm token: show it to the owner and wait for their yes."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "change_id": {
                "type": "string", "maxLength": 36,
                "pattern": r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                           r"[0-9a-fA-F]{12}$",
                "description": "The change_id returned when the change was made.",
            },
        },
        "required": ["change_id"],
        "additionalProperties": False,
    },
    changing=True, idempotent=True, preview=preview_undo,
)
