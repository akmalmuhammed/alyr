"""Discovery's actions as the connector uses them (ALY-327, spec 067).

The connector calls the same actions as the workspace (`modules/discovery/actions.py`); these are
thin doors onto them. Each takes the roles and the module of the action it opens, so who may do
what is written once, and each turns Discovery's own refusals (`DiscoveryError`) into the
`ActionError` the connector shows an app as a sentence. The two that change a finding say which
status in the door, so a tool cannot be asked for any other: **an app can set a finding to "I did
this" or "Skip" and nothing else, and can never approve anything.** (There is no "approve" in
Phase 1; when Phase 2 adds one, it is not added here: spec 067, "Not in this spec".)
"""

from uuid import UUID

from alyr.core import actions
from alyr.core.actions import ActionError, Caller, register
from alyr.modules.discovery import actions as discovery  # noqa: F401  (declares them)
from alyr.modules.discovery.errors import DiscoveryError

PREFIX = "mcp."


def _uuid(value) -> UUID:
    try:
        return UUID(str(value))
    except ValueError:
        raise ActionError("That is not an ID from an earlier answer.") from None


def door(name: str, target: str, fixed: dict | None = None, ids: tuple[str, ...] = ()) -> None:
    """Open `target` (a Discovery action) as `mcp.<name>`: same roles, same module, `fixed`
    arguments the caller cannot change, and the arguments in `ids` read as IDs."""
    base = actions.REGISTRY[target]

    async def run(conn, caller: Caller, args: dict) -> dict:
        given = {**args, **(fixed or {})}
        for key in ids:
            if key in given:
                given[key] = _uuid(given[key])
        try:
            return await base.run(conn, caller, given)
        except DiscoveryError as error:
            raise ActionError(error.en) from error

    run.__doc__ = f"The connector's door onto {target}."
    register(PREFIX + name, base.roles, base.module)(run)


door("discovery_overview", "discovery.overview")
door("discovery_findings", "discovery.findings")
door("discovery_finding", "discovery.finding", ids=("id",))
door("discovery_reviews", "discovery.reviews")
door("discovery_report", "discovery.report")
door("discovery_mark_done", "discovery.set_finding_status", {"status": "owner_done"}, ids=("id",))
door("discovery_skip", "discovery.set_finding_status", {"status": "skipped"}, ids=("id",))
