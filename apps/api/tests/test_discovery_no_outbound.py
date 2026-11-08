"""Phase 1 changes nothing outside ALYR, sends nothing and calls no model (spec 065, "What it must
never do", 2 and 3): `modules/discovery` makes no outside call and never calls `Outbound`, and the
sample connector has no network at all. Each of these fails if someone adds one."""

import ast
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


def test_the_scan_sees_the_module_it_is_meant_to_guard():
    names = {p.name for p in FILES}
    assert {"engine.py", "rules.py", "actions.py", "sample.py", "discovery.py"} <= names


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_no_file_of_discovery_imports_anything_that_reaches_outside(path):
    for name in imports_of(path):
        for banned in FORBIDDEN_IMPORTS:
            assert name != banned and not name.startswith(banned + "."), (path.name, name)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_no_file_of_discovery_names_the_outbound_layer_or_a_channel(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        name = node.id if isinstance(node, ast.Name) else (
            node.attr if isinstance(node, ast.Attribute) else None)
        assert name not in FORBIDDEN_NAMES, (path.name, name, getattr(node, "lineno", None))


def test_the_sample_connector_imports_only_dates_and_discoveries_own_plain_data():
    sample = SRC / "modules" / "discovery" / "connectors" / "sample.py"
    def outside(path):
        return {n.split(".")[0] for n in imports_of(path) if not n.startswith("alyr")}

    assert outside(sample) <= {"datetime"}
    base = SRC / "modules" / "discovery" / "connectors" / "base.py"
    assert outside(base) <= {"dataclasses", "datetime", "typing", "uuid"}
    # no `async` that waits on anything either: the snapshot only builds data
    text = sample.read_text(encoding="utf-8")
    assert "await " not in text and "sleep" not in text


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
