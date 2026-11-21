"""The tool registry (spec 067, "The tool registry"): a tool is an action plus words, a schema and
flags.

The action, in `core/actions.py`, stays the one place that says who may do what (roles) and which
module must be on. A tool adds how a model finds it and calls it: a name and description written
for a model, an input schema, the scope the owner must have given the app, and whether it changes
anything. A changing tool also gives a `preview`; the registry, not the tool, does the two-step
shape (`server.py`), so a tool author cannot skip the confirm.

How the real tools plug in (ALY-290, 291, 327): add a file under `modules/mcp/tools/`, import it in
`tools/__init__.py`, and write

    declare(name="today", action="today", scope=scopes.READ, title="...", description="...",
            input_schema={...}, present=...)

Reading tools need nothing else. A changing tool adds `changing=True` and a `preview` function.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from alyr.core import actions
from alyr.modules.mcp import scopes
from alyr.modules.mcp.safety import Preview
from alyr.modules.mcp.schema import check_schema

# (conn, caller, args) -> a Preview. Reads and changes nothing.
PreviewFn = Callable[..., Awaitable[Preview]]
# (data returned by the action) -> data for the model. Where the data minimum is kept.
PresentFn = Callable[[dict], dict]

NAME = r"^[a-z][a-z0-9_]{0,63}$"


@dataclass(frozen=True)
class Tool:
    name: str
    action: str
    scope: str
    title: str
    description: str
    input_schema: dict
    changing: bool = False
    # Reaches a customer (counted against the day's sends as well as its changes).
    sends: bool = False
    destructive: bool = False
    idempotent: bool = False
    preview: PreviewFn | None = None
    present: PresentFn | None = None
    # Only exists on a developer's machine (and where ALYR_MCP_TEST_TOOLS is set).
    test_only: bool = False
    schema: dict = field(init=False, repr=False, default_factory=dict)

    def __post_init__(self) -> None:
        schema = dict(self.input_schema)
        if self.changing:
            props = dict(schema.get("properties") or {})
            props["confirm_token"] = {
                "type": "string", "maxLength": 100,
                "description": (
                    "Leave this out the first time: you get a preview and a confirm token. "
                    "After the owner has said yes to the preview, call again with the same "
                    "arguments and this token."
                ),
            }
            schema["properties"] = props
        object.__setattr__(self, "schema", schema)

    def listed(self) -> dict:
        """The tool as `tools/list` gives it."""
        read_only = not self.changing
        annotations = {
            "title": self.title,
            "readOnlyHint": read_only,
            "openWorldHint": False,
        }
        if self.changing:
            annotations["destructiveHint"] = self.destructive
            annotations["idempotentHint"] = self.idempotent
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": self.schema,
            "annotations": annotations,
            "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": [self.scope]}]},
        }


TOOLS: dict[str, Tool] = {}


def declare(**fields) -> Tool:
    """Declare a tool. Checked at import: a bad name, an unknown scope, a schema the checker
    cannot read, or a changing tool without a preview refuses to load, so a mistake is a failed
    start and not a tool that skips its confirm."""
    import re

    made = Tool(**fields)
    if not re.fullmatch(NAME, made.name):
        raise ValueError(f"tool name {made.name!r} must be snake_case")
    if made.name in TOOLS:
        raise ValueError(f"tool {made.name} is declared twice")
    if made.scope not in scopes.ALL:
        raise ValueError(f"tool {made.name}: unknown scope {made.scope}")
    if made.changing and made.preview is None:
        raise ValueError(f"tool {made.name} changes things and has no preview")
    if made.sends and not made.changing:
        raise ValueError(f"tool {made.name} sends and must be a changing tool")
    if made.changing and made.scope == scopes.READ:
        raise ValueError(f"tool {made.name} changes things and cannot use the read scope")
    if not made.changing and made.scope != scopes.READ:
        raise ValueError(f"tool {made.name} only reads and must use the read scope")
    if made.input_schema.get("type") != "object":
        raise ValueError(f"tool {made.name}: the input schema must be an object")
    check_schema(made.input_schema, made.name)
    # The arguments are passed to the action as keywords.
    named = set(made.input_schema.get("properties", {}))
    reserved = {"conn", "caller", "key", "confirm_token"} & named
    if reserved:
        raise ValueError(f"tool {made.name}: argument names {sorted(reserved)} are reserved")
    TOOLS[made.name] = made
    return made


def load() -> None:
    """Import every tool, so each has declared itself, and check each against the action layer."""
    from alyr.modules.mcp import tools  # noqa: F401

    actions.load()
    for found in TOOLS.values():
        if found.action not in actions.REGISTRY:
            raise ValueError(f"tool {found.name} names an action that does not exist")


def offered(role: str, held: frozenset[str], modules: set[str], test_tools: bool) -> list[Tool]:
    """The tools a caller may see: their scopes, their role and the business's modules all allow
    it. In a fixed order, so a client can cache the list."""
    load()
    found = []
    for item in sorted(TOOLS.values(), key=lambda t: t.name):
        if item.test_only and not test_tools:
            continue
        if item.scope not in held:
            continue
        action = actions.REGISTRY[item.action]
        if role not in action.roles:
            continue
        if action.module is not None and action.module not in modules:
            continue
        found.append(item)
    return found
