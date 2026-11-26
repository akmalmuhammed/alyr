"""The MCP door to Discovery may read, mark a finding, and at most list proposals or ask for one
to be made; it can never approve, decline or undo a proposal, or write to a source (Discovery 2.0,
research R2: a change reaches Google only after a person's tap in ALYR, so the owner's own app is
never "programmatic access" to a Business Profile).

Three layers, each tested on its own, so a mistake in one is caught by the others:
1. what the connector offers: every tool's action, through its door, is one an app may reach;
2. the code of the connector: nothing under `modules/mcp` calls approve, decline, undo, the apply
   job or a connector's write;
3. the action itself: approve, decline and undo refuse a caller on the `mcp` channel whatever its
   role, and nothing about the proposal changes.
"""

import re
from pathlib import Path
from uuid import UUID

import pytest

from alyr.core import actions
from alyr.core.actions import Caller
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.mcp import discovery_actions, registry
from discovery_proposals_support import prepared_shop, proposals
from test_consent import owner_sql

# The Discovery actions an app may reach. Adding one here is a decision, not a fix: a door to
# anything that decides, applies or undoes a proposal, or that changes a source, must not be added.
MAY_REACH = {
    "discovery.overview", "discovery.findings", "discovery.finding", "discovery.reviews",
    "discovery.report", "discovery.set_finding_status",
    # Proposals only: list them, or ask for the ones a finding calls for to be made.
    "discovery.proposals", "discovery.proposal", "discovery.prepare",
}
NEVER = {"discovery.approve_proposal", "discovery.decline_proposal", "discovery.undo_proposal"}
WRITES = re.compile(r"approv|declin|undo|apply|connection|set_fact|locations|managers", re.I)

MCP = Path(__file__).resolve().parents[1] / "src" / "alyr" / "modules" / "mcp"


def reached(action: str) -> str:
    """The action a tool's action opens: a door's target, else itself."""
    return discovery_actions.DOORS.get(action, action)


def test_every_tool_reaches_only_what_an_app_may_reach():
    registry.load()
    for name, tool in registry.TOOLS.items():
        target = reached(tool.action)
        if target.startswith("discovery."):
            assert target in MAY_REACH, f"tool {name} reaches {target}"
        assert target not in NEVER, name
    for key in actions.REGISTRY:
        if key.startswith("mcp.discovery"):
            assert key in discovery_actions.DOORS, f"{key} is not a door with a known target"
            assert discovery_actions.DOORS[key] in MAY_REACH, key


def test_the_allowed_actions_are_not_ones_that_decide_or_write():
    """The list above cannot itself drift: none of its names reads like a decision or a write,
    except the one status change an app may make, fixed in its door."""
    for key in MAY_REACH - {"discovery.set_finding_status"}:
        assert not WRITES.search(key), key
    assert NEVER <= set(actions.REGISTRY)  # they exist: this is not testing a typo


def test_no_code_of_the_connector_calls_a_decision_an_apply_or_a_write():
    """Every file of the connector, for what reaches Discovery's writes at all; the files that use
    Discovery, for anything that decides or undoes (the stock tools have an undo of their own)."""
    anywhere = [
        r"discovery\.apply\b", r"from alyr\.modules\.discovery import .*\bapply\b",
        r"alyr\.modules\.discovery\.connectors", r"approve_proposal|decline_proposal|undo_proposal",
        r"\bAPPLY_JOB\b", r"\bproposals\.(approve|decline)\b", r"\bapplying\b",
    ]
    in_discovery = [r"\bundo\(", r"\.apply\(", r"\bapprove\(", r"\bdecline\("]
    files = list(MCP.rglob("*.py"))
    assert any(p.name == "discovery_actions.py" for p in files)
    for path in files:
        text = path.read_text(encoding="utf-8")
        uses_discovery = "alyr.modules.discovery" in text
        for pattern in anywhere + (in_discovery if uses_discovery else []):
            assert not re.search(pattern, text), f"{path.name} matches {pattern}"


@pytest.fixture
def shop(client_factory, monkeypatch):
    return prepared_shop(client_factory, monkeypatch)


@pytest.mark.parametrize("key", sorted(NEVER))
def test_a_caller_on_the_mcp_channel_cannot_decide_or_undo_even_as_the_owner(shop, key):
    client = shop.owner
    waiting = proposals(client, "live")
    assert waiting, "the sample's first check-up proposes changes"
    target = waiting[0]
    owner = owner_sql(
        "select user_id from memberships where tenant_id = $1 and role = 'owner' limit 1",
        shop.tenant_id)[0]["user_id"]
    caller = Caller(owner, "Owner", "owner", "mcp")

    async def call():
        async with client.app.state.db.tenant(shop.tenant_id) as conn:
            return await actions.run(conn, caller, key, id=UUID(target["id"]),
                                     change_hash=target["change_hash"])

    with pytest.raises((DiscoveryError, actions.ActionError)):
        client.portal.call(call)
    row = owner_sql("select status, decided_at from discovery_proposals where id = $1",
                    UUID(target["id"]))[0]
    assert row["status"] == "proposed" and row["decided_at"] is None
    assert owner_sql("select count(*) as n from jobs where tenant_id = $1 and kind = "
                     "'discovery.apply'", shop.tenant_id)[0]["n"] == 0
