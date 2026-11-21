"""Two tools that exist to prove the safety layer (spec 067). `test_only`: they are not offered, and
cannot be called, anywhere but a developer's machine (or where ALYR_MCP_TEST_TOOLS is set)."""

from alyr.modules.mcp import safety, scopes
from alyr.modules.mcp.registry import declare
from alyr.modules.mcp.safety import Preview


def _show_customer(data: dict) -> dict:
    row = data.get("customer")
    return {"customer": safety.person(row["name"], row["phone"]) if row else None}


declare(
    name="test_customer_name",
    action="mcp.test_customer_name",
    scope=scopes.READ,
    title="Test: the newest customer",
    description=(
        "For testing only. Returns the newest customer as a first name (marked as written by "
        "the customer) and the last three digits of their number."
    ),
    input_schema={"type": "object", "properties": {}, "additionalProperties": False},
    present=_show_customer,
    test_only=True,
)


async def _preview_note(conn, caller, args: dict) -> Preview:
    return Preview(
        what=f"Put the note {safety.clean(args['note'])[:80]!r} on the business's activity record.",
        who_is_told="nobody",
        cannot_undo="a note on the record stays on the record",
        affects=1,
    )


declare(
    name="test_write_note",
    action="mcp.test_write_note",
    scope=scopes.STOCK,
    title="Test: write a note",
    description=(
        "For testing only. Writes a note on the activity record, after the owner has confirmed "
        "the preview."
    ),
    input_schema={
        "type": "object",
        "properties": {"note": {"type": "string", "minLength": 1, "maxLength": 200}},
        "required": ["note"],
        "additionalProperties": False,
    },
    changing=True,
    preview=_preview_note,
    test_only=True,
)
