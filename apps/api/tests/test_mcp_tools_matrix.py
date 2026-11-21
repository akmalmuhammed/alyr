"""Every connector tool against the same questions (ALY-290, ALY-291, ALY-327, spec 067): who is
offered it, who may call it, which scope and which part of ALYR it needs, that a change needs the
confirm step, that every call is on the record as the connector, and that the day's cap holds.

The tables below are the permission table of the tools. A tool added without a row fails the first
test, so no tool can be added without being asked these questions.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from alyr.modules.mcp import registry
from discovery_support import findings as workspace_findings
from discovery_support import run_check_up, turn_on_sample
from mcp_support import sql
from mcp_tools_support import ALL_MODULES, build, new_id, workspace
from test_consent import owner_sql
from test_mcp_tools_stock import make_catalog

OWNER_ADMIN = ("owner", "admin")
EVERYONE = ("owner", "admin", "agent")

# tool: (scope, the part of ALYR it needs or None, who may use it, does it change anything)
MATRIX = {
    "hello": ("read", None, EVERYONE, False),
    "today": ("read", None, EVERYONE, False),
    "bookings": ("read", "bookings", EVERYONE, False),
    "orders": ("read", "orders", EVERYONE, False),
    "owed": ("read", "ledger", OWNER_ADMIN, False),
    "low_stock": ("read", "catalog", EVERYONE, False),
    "sales_summary": ("read", "orders", OWNER_ADMIN, False),
    "insights": ("read", None, EVERYONE, False),
    "shop_info": ("read", None, EVERYONE, False),
    "mark_sold_out": ("stock", "catalog", EVERYONE, True),
    "mark_back_in_stock": ("stock", "catalog", EVERYONE, True),
    "set_stock": ("stock", "catalog", EVERYONE, True),
    "undo_stock_change": ("stock", "catalog", EVERYONE, True),
    "discovery_overview": ("read", "discovery", EVERYONE, False),
    "discovery_findings": ("read", "discovery", EVERYONE, False),
    "discovery_reviews": ("read", "discovery", EVERYONE, False),
    "discovery_report": ("read", "discovery", EVERYONE, False),
    "discovery_mark_done": ("discovery", "discovery", OWNER_ADMIN, True),
    "discovery_skip": ("discovery", "discovery", OWNER_ADMIN, True),
}
CHANGING = [t for t, row in MATRIX.items() if row[3]]
ON = (*ALL_MODULES, "discovery")


def real_tools() -> dict:
    registry.load()
    return {n: t for n, t in registry.TOOLS.items() if not t.test_only}


@pytest.fixture
def world(client_factory, monkeypatch):
    made = build(client_factory, monkeypatch, modules=ON)
    made.slug = f"mcp-{uuid4().hex[:8]}"
    owner_sql("update tenants set slug = $1 where id = $2", made.slug, made.tenant_id)
    made.client = workspace(client_factory, made.shop)
    made.shop.owner = made.client
    made.items = make_catalog(made.client)
    turn_on_sample(made.shop)
    run_check_up(made.client)
    made.finding = workspace_findings(made.client)[0]["id"]
    return made


def valid_arguments(world) -> dict:
    """Arguments each tool accepts, for the questions that need a call to get as far as it can."""
    return {
        "hello": {}, "today": {}, "bookings": {}, "orders": {}, "owed": {}, "low_stock": {},
        "sales_summary": {}, "insights": {}, "shop_info": {},
        "mark_sold_out": {"item": "Pancake"},
        "mark_back_in_stock": {"item": "Pancake"},
        "set_stock": {"item": "Zaatar roll", "count": 7},
        "undo_stock_change": {"change_id": new_id()},
        "discovery_overview": {}, "discovery_findings": {}, "discovery_reviews": {},
        "discovery_report": {"month": datetime.now(UTC).strftime("%Y-%m")},
        "discovery_mark_done": {"id": world.finding}, "discovery_skip": {"id": world.finding},
    }


# ── the table is the registry ──────────────────────────────────────────────────────────────────


def test_the_permission_table_names_every_tool_and_says_the_same_as_the_registry():
    tools = real_tools()
    assert set(tools) == set(MATRIX), (set(tools) ^ set(MATRIX))
    from alyr.core import actions

    for name, (scope, module, roles, changing) in MATRIX.items():
        tool = tools[name]
        action = actions.REGISTRY[tool.action]
        assert tool.scope == scope, name
        assert action.module == module, name
        assert set(action.roles) == set(roles), name
        assert tool.changing is changing, name
        # A tool that changes something must be written for a model: a title and a description
        # that says what it does, who it is for, and (for a change) that the owner says yes first.
        assert len(tool.description) >= 120, name
        if changing:
            assert "preview" in tool.description and "owner" in tool.description, name
            assert tool.preview is not None, name
        else:
            assert "Changes nothing" in tool.description or name == "hello", name


# ── who is offered what ────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("role", EVERYONE)
def test_each_role_is_offered_exactly_the_tools_the_table_gives_it(world, role):
    expected = {t for t, (_, _, roles, _) in MATRIX.items() if role in roles}
    assert {n for n in world.offered(role) if not n.startswith("test_")} == expected


def test_a_tool_whose_part_of_alyr_is_off_is_not_offered_and_is_refused(
        client_factory, monkeypatch):
    bare = build(client_factory, monkeypatch, modules=(), roles=("owner",))
    arguments = valid_arguments(type("W", (), {"finding": new_id()}))
    names = set(bare.offered())
    for tool, (_, module, _, _) in MATRIX.items():
        if module is None:
            assert tool in names, tool
            continue
        assert tool not in names, tool
        assert module in bare.refused(tool, arguments[tool]), tool


def test_a_token_without_a_scope_is_not_offered_the_tools_that_need_it(client_factory, monkeypatch):
    for scope, hidden in (("read", {"stock", "discovery"}), ("read stock", {"discovery"}),
                          ("read discovery", {"stock"})):
        narrow = build(client_factory, monkeypatch, modules=ON, roles=("owner",), scope=scope)
        offered = set(narrow.offered())
        for tool, (needs, _, _, _) in MATRIX.items():
            assert (tool in offered) is (needs not in hidden), (scope, tool)


# ── a change is a preview first, on every tool ─────────────────────────────────────────────────


def snapshot(world) -> tuple:
    return (
        sql("select id, available, status from items where tenant_id = $1 order by name",
            world.tenant_id),
        sql("select id, status from discovery_findings where tenant_id = $1 order by id",
            world.tenant_id),
        sql("select count(*) as n from stock_movements where tenant_id = $1",
            world.tenant_id)[0]["n"],
        sql("select count(*) as n from activity where tenant_id = $1 and subject <> 'mcp'",
            world.tenant_id)[0]["n"],
    )


@pytest.mark.parametrize("tool", [t for t in CHANGING if t != "undo_stock_change"])
def test_a_changing_tool_does_nothing_until_the_owner_has_said_yes(world, tool):
    arguments = valid_arguments(world)[tool]
    if tool == "mark_back_in_stock":
        world.change("mark_sold_out", {"item": "Pancake"})
    before = snapshot(world)
    first = world.ask(tool, arguments)
    assert first["confirm_token"] and "Nothing has been changed" in first["next_step"]
    assert first["preview"]["records_affected"] == 1 and first["preview"]["what_will_change"]
    # Called again without the token, it is still only a preview.
    assert "confirm_token" in world.ask(tool, arguments)
    # A token nobody gave out, or one for other arguments, does nothing.
    bogus = world.raw("owner", tool, {**arguments, "confirm_token": "alyr_mcp_cf_" + "1" * 43})
    assert bogus["isError"] is True
    assert snapshot(world) == before
    # With the token it is done, once.
    world.ask(tool, {**arguments, "confirm_token": first["confirm_token"]})
    assert snapshot(world) != before
    assert world.raw("owner", tool, {**arguments, "confirm_token": first["confirm_token"]})[
        "isError"] is True


def test_every_change_through_the_connector_is_on_the_record_as_the_connector(world):
    started = sql("select coalesce(max(created_at), 'epoch') as t from activity "
                  "where tenant_id = $1", world.tenant_id)[0]["t"]
    arguments = valid_arguments(world)
    world.change("mark_sold_out", arguments["mark_sold_out"])
    world.change("mark_back_in_stock", arguments["mark_back_in_stock"])
    world.change("set_stock", arguments["set_stock"])
    world.change("discovery_skip", arguments["discovery_skip"])
    rows = sql("select subject, action, channel, actor_name from activity where tenant_id = $1 "
               "and created_at > $2 order by created_at", world.tenant_id, started)
    # Skipping a finding closes a change that waited on it (Discovery Phase 2, spec 066): that
    # close is the engine's own row, on the record as `system`. Everything else is the connector.
    closes = [r for r in rows if r["channel"] == "system"]
    assert all(r["action"] == "proposal.expire" for r in closes), rows
    rows = [r for r in rows if r["channel"] != "system"]
    assert rows and {r["channel"] for r in rows} == {"mcp"}, rows
    assert {r["actor_name"] for r in rows} == {"Owner"}
    assert {r["action"] for r in rows} >= {
        "call", "switched_off", "switched_on", "stock_counted", "finding.status"}
    # The calls that were refused are on the record too.
    world.raw("agent", "owed", {})
    assert sql("select 1 from activity where tenant_id = $1 and action = 'call' and "
               "detail->>'tool' = 'owed' and detail->>'result' = 'refused'",
               world.tenant_id)


# ── the cap, across the tools ──────────────────────────────────────────────────────────────────


def test_the_days_changes_are_counted_across_every_tool_and_stop_at_the_cap(
        client_factory, monkeypatch):
    capped = build(client_factory, monkeypatch, modules=ON, roles=("owner",),
                   mcp_writes_per_day=3)
    capped.client = workspace(client_factory, capped.shop)
    capped.shop.owner = capped.client
    capped.items = make_catalog(capped.client)
    turn_on_sample(capped.shop)
    run_check_up(capped.client)
    found = [f["id"] for f in workspace_findings(capped.client)]
    capped.change("mark_sold_out", {"item": "Pancake"})
    capped.change("set_stock", {"item": "Zaatar roll", "count": 4})
    capped.change("discovery_skip", {"id": found[0]})
    refused = {}
    for tool, args in (("discovery_mark_done", {"id": found[1]}),
                       ("mark_sold_out", {"item": "Chicken wrap"})):
        token = capped.preview(tool, args)["confirm_token"]
        refused[tool] = capped.raw("owner", tool, {**args, "confirm_token": token})
        assert refused[tool]["isError"] and "daily limit" in refused[tool]["content"][0]["text"]
    assert sql("select status from discovery_findings where id = $1", found[1])[0][
        "status"] == "open"
    assert sql("select available from items where tenant_id = $1 and name = 'Chicken wrap'",
               capped.tenant_id)[0]["available"] is True
    # Reading is never counted against it.
    assert capped.ask("today")["sections"] is not None
