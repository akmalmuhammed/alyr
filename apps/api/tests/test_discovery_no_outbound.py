"""Discovery changes nothing outside ALYR except through a connector's write, sends nothing to a
customer, and calls no model (spec 065, "What it must never do", 2 and 3; spec 066, 5 to 7 and 12):
`modules/discovery` makes no outside call, and the one file that names the outbound layer is
`asks.py`, which loads contacts only through the staff query; the sample connector has no network at
all. Each of these fails if someone adds one."""

import ast
import re
from pathlib import Path

import pytest

from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql

SRC = Path(__file__).resolve().parents[1] / "src" / "alyr"
FILES = sorted((SRC / "modules" / "discovery").rglob("*.py")) + [
    SRC / "routes" / "discovery.py", SRC / "discovery_demo.py"]
# Anything that could carry data out, tell a person something or ask a model.
FORBIDDEN_IMPORTS = (
    "httpx", "requests", "aiohttp", "urllib", "http", "socket", "ssl", "smtplib", "ftplib",
    "websockets", "boto3", "anthropic", "openai", "google",
    "alyr.core.outbound", "alyr.channels", "alyr.core.mail", "alyr.core.templates",
    "alyr.core.drawing", "alyr.core.whatsapp_attach", "alyr.core.welcome", "alyr.gateways",
    "alyr.modules.report", "alyr.modules.inbox", "alyr.modules.bookings",
)
FORBIDDEN_NAMES = {"Outbound", "outbound", "MetaChannel", "SimulatorChannel", "InboundMessage",
                   "OutboundMessage"}


def imports_of(path: Path) -> set[str]:
    found = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom):
            found.add(node.module or "")
            found |= {f"{node.module}.{a.name}" for a in node.names}
    return found


# The one file that may name the outbound layer, a channel's message types and the templates: it
# asks the owner's own team, and nothing else does (spec 066).
ASKS = "asks.py"
ASKS_MAY_IMPORT = ("alyr.channels", "alyr.core.templates")


def test_the_scan_sees_the_module_it_is_meant_to_guard():
    names = {p.name for p in FILES}
    assert {"engine.py", "rules.py", "actions.py", "sample.py", "discovery.py", "asks.py",
            "apply.py", "proposals.py", "sweep.py", "brief.py", "facts.py",
            "proposal_words.py"} <= names


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_no_file_of_discovery_imports_anything_that_reaches_outside(path):
    for name in imports_of(path):
        for banned in FORBIDDEN_IMPORTS:
            if path.name == ASKS and banned in ASKS_MAY_IMPORT:
                continue
            assert name != banned and not name.startswith(banned + "."), (path.name, name)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_no_file_of_discovery_names_the_outbound_layer_or_a_channel(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        name = node.id if isinstance(node, ast.Name) else (
            node.attr if isinstance(node, ast.Attribute) else None)
        if path.name == ASKS:
            continue  # the one file that asks the owner's team (below: how it loads contacts)
        assert name not in FORBIDDEN_NAMES, (path.name, name, getattr(node, "lineno", None))


def test_the_sample_connector_imports_only_dates_and_discoveries_own_plain_data():
    sample = SRC / "modules" / "discovery" / "connectors" / "sample.py"
    def outside(path):
        return {n.split(".")[0] for n in imports_of(path) if not n.startswith("alyr")}

    assert outside(sample) <= {"datetime", "dataclasses", "uuid"}
    base = SRC / "modules" / "discovery" / "connectors" / "base.py"
    assert outside(base) <= {"dataclasses", "datetime", "typing", "uuid", "re", "collections"}
    # no `async` that waits on anything either: the snapshot only builds data, and a write hands
    # its value to the state store it is given (the business's own rows), nothing else
    text = sample.read_text(encoding="utf-8")
    assert "sleep" not in text
    awaited = re.findall(r"await ([\w.]+)", text)
    assert awaited and all(a.startswith(("ctx.state.", "self.read_current")) for a in awaited), (
        awaited)


def test_no_place_for_a_key_or_a_model_exists_in_the_module():
    for path in FILES:
        text = path.read_text(encoding="utf-8").lower()
        assert "places_key" not in text and "api_key" not in text, path.name


def test_a_whole_check_up_makes_no_http_call_and_queues_no_message(client_factory, monkeypatch):
    import httpx

    from alyr.core.outbound import SEND, Outbound

    def refuse(*args, **kwargs):
        raise AssertionError("Discovery made an outside call")

    async def refuse_async(*args, **kwargs):
        raise AssertionError("Discovery made an outside call")

    # The real network transports, not `Client.send`: the test client is an httpx client too.
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)
    for name in ("send", "deliver", "gave_up"):
        if hasattr(Outbound, name):
            monkeypatch.setattr(Outbound, name, refuse_async)
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    for _ in range(4):
        assert run_check_up(shop.owner)["status"] == "done"
    shop.owner.post("/api/discovery/findings/" + shop.owner.get(
        "/api/discovery/findings?status=all").json()["items"][0]["id"] + "/status",
        json={"status": "skipped"})
    kinds = {r["kind"] for r in owner_sql("select kind from jobs where tenant_id = $1",
                                          shop.tenant_id)}
    assert kinds == {"discovery.run"} and SEND not in kinds
    assert owner_sql("select count(*) from messages where tenant_id = $1",
                     shop.tenant_id)[0]["count"] == 0
    assert owner_sql("select count(*) from contacts where tenant_id = $1",
                     shop.tenant_id)[0]["count"] == 0


# ── spec 066: who a message can go to, and what can change outside ALYR ──────────────────


def sql_strings(path: Path):
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            yield node.value, node.lineno


def test_every_query_on_contacts_in_discovery_names_staff_and_none_takes_a_customer():
    """No code in `modules/discovery` takes a customer's contact id: every statement that reads or
    changes `contacts` says `role = 'staff'` (the receivers' query, a linked person's own number,
    the settings' list of staff numbers)."""
    seen = 0
    for path in FILES:
        for text, line in sql_strings(path):
            if re.search(r"\b(from|update|join)\s+contacts\b", text, re.I):
                seen += 1
                assert "role = 'staff'" in text or "role = $" in text, (path.name, line, text[:80])
    assert seen >= 5


def test_asks_loads_contacts_only_through_the_staff_query_and_the_sender_of_a_tap():
    path = SRC / "modules" / "discovery" / ASKS
    text = path.read_text(encoding="utf-8")
    assert "def receivers" in text and "c.role = 'staff' and c.user_id is not null" in text
    assert "c.discovery_asks" in text
    # no message is built from a contact the module did not get from there or from the tap
    tree = ast.parse(text)
    sends = [n for n in ast.walk(tree) if isinstance(n, ast.Call)
             and isinstance(n.func, ast.Attribute) and n.func.attr == "send"]
    assert len(sends) == 2  # the ask, the result of an apply, and nothing else


def test_only_asks_names_the_outbound_layer_and_no_other_file_sends():
    for path in FILES:
        if path.name == ASKS:
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            assert not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                        and node.func.attr == "send"), (path.name, node.lineno)


def test_nothing_outside_alyr_changes_except_through_a_connectors_write():
    """`apply` of a connector is called from one place: the apply job."""
    callers = []
    for path in FILES:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and (
                    node.func.attr == "apply" and "connector" in ast.unparse(node.func.value)):
                callers.append(path.name)
    assert callers == ["apply.py"]


def test_a_whole_phase_two_flow_with_no_receiver_makes_no_http_call_and_sends_no_message(
        client_factory, monkeypatch):
    import httpx

    from alyr.core.outbound import Outbound
    from discovery_proposals_support import approve, find, place_id, prepared_shop

    def refuse(*args, **kwargs):
        raise AssertionError("Discovery made an outside call")

    async def refuse_async(*args, **kwargs):
        raise AssertionError("Discovery made an outside call")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)
    for name in ("send", "deliver", "gave_up"):
        monkeypatch.setattr(Outbound, name, refuse_async)
    shop = prepared_shop(client_factory, monkeypatch)
    approve(shop.owner, find(shop.owner, "whatsapp_link_missing", "Al Sadd"))
    approve(shop.owner, find(shop.owner, "name_conflict", "Al Wakra"))
    shop.owner.post("/api/discovery/proposals/"
                    f"{find(shop.owner, 'category_missing', 'Al Wakra')['id']}/decline")
    shop.owner.put("/api/discovery/facts", json={"location_id": place_id(shop.owner, "Lusail"),
                                                  "key": "phone",
                                                  "value": {"phone": "+97455550166"}})
    run_check_up(shop.owner)
    kinds = {r["kind"] for r in owner_sql("select kind from jobs where tenant_id = $1",
                                          shop.tenant_id)}
    assert kinds == {"discovery.run", "discovery.apply"}
    assert owner_sql("select count(*) as n from messages where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 0
    assert owner_sql("select count(*) as n from contacts where tenant_id = $1",
                     shop.tenant_id)[0]["n"] == 0
