"""`hello`: the first tool, and the one that proves the connector end to end."""

from alyr.modules.mcp import scopes
from alyr.modules.mcp.registry import declare

declare(
    name="hello",
    action="mcp.hello",
    scope=scopes.READ,
    title="Which business am I connected to",
    description=(
        "Tells you which ALYR business this connection is for, who is asking and their role, "
        "which parts of ALYR the business uses, and the time at the business. Call it first, or "
        "whenever you are unsure which business you are talking about. It changes nothing."
    ),
    input_schema={"type": "object", "properties": {}, "additionalProperties": False},
)
