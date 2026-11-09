"""What must stay true of the connector's code and words (spec 067): it calls no model and no
outside service of its own, it keeps no secret in the repository, what an owner reads says no more
than is true, and the small checker that guards tool arguments does what it says."""

import ast
import re
from pathlib import Path

import pytest

from alyr.modules.mcp import clients, page, registry, safety, schema, scopes, server
from mcp_support import App, environment, new_shop, person, sql

ROOT = Path(__file__).resolve().parents[3]
MODULE = ROOT / "apps" / "api" / "src" / "alyr" / "modules" / "mcp"
NOT_ALLOWED = {
    "httpx", "requests", "aiohttp", "urllib3", "socket", "smtplib", "http", "anthropic", "openai",
    "google", "cohere", "mistralai", "ollama", "langchain", "litellm",
}


def imports(path: Path) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            found.add(node.module.split(".")[0])
    return found


def test_the_connector_calls_no_model_and_no_outside_service():
    """The owner's app calls ALYR; ALYR never calls a model (spec 067, D-170). The one outside
    read, an app's own description, goes through `connect/ssrf.py`, which is not in this package."""
    files = list(MODULE.rglob("*.py")) + [ROOT / "apps/api/src/alyr/routes" / n
                                          for n in ("mcp.py", "mcp_oauth.py", "mcp_manage.py")]
    assert len(files) > 10
    for path in files:
        assert not (imports(path) & NOT_ALLOWED), (path.name, imports(path) & NOT_ALLOWED)
        text = path.read_text(encoding="utf-8").lower()
        for provider in ("api.anthropic.com", "api.openai.com", "generativelanguage",
                         "claude-", "gpt-"):
            assert provider not in text, (path.name, provider)


def test_no_connector_secret_is_written_anywhere_in_the_repository():
    shape = re.compile(r"alyr_mcp_(?:at|rt|ac|cf|rq|bd)_[A-Za-z0-9_-]{43}")
    skip = {".git", "node_modules", ".venv", ".next", "__pycache__", ".pytest_cache"}
    seen = 0
    for top in ("apps/api", "docs", "specs", "infra", "scripts", ".github"):
        base = ROOT / top
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if skip & set(path.parts) or not path.is_file() or path.stat().st_size > 2_000_000:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            seen += 1
            assert not shape.search(text), f"a token-shaped value is written in {path}"
    assert seen > 100


BANNED = re.compile(
    r"\bAI\b|\bsmart\b|assistant|agentic|intelligen|\blearns?\b|understands|predict|forecast"
    r"|\bthinks?\b|مساعد|ذكاء|ذكي",
    re.IGNORECASE,
)


def test_what_an_owner_reads_says_no_ai_words_until_they_are_true():
    """Honesty (D-012, docs/honesty): no model is in the product, so nothing an owner or an app's
    screen shows says or implies one. That is the page, the scope words, and each tool's title and
    description (an app shows them to the person)."""
    texts: list[str] = []
    for lang in ("en", "ar"):
        for value in page.COPY[lang].values():
            if isinstance(value, str):
                texts.append(value)
            elif callable(value):
                texts.append(value(*["X"] * value.__code__.co_argcount))
    for pair in scopes.WORDS.values():
        texts.extend(pair)
    registry.load()
    for tool in registry.TOOLS.values():
        texts += [tool.title, tool.description]
    texts.append(server.INSTRUCTIONS)
    for text in texts:
        assert not BANNED.search(text), text


def test_the_page_has_the_same_words_in_both_languages():
    assert set(page.COPY["en"]) == set(page.COPY["ar"])
    assert set(scopes.WORDS) == set(scopes.ALL)
    for pair in scopes.WORDS.values():
        assert all(pair) and pair[0] != pair[1]
    for key, value in page.COPY["ar"].items():
        if isinstance(value, str):
            assert not value.endswith(("…", "...")), key


def test_every_tool_is_well_formed_and_names_a_real_action():
    registry.load()
    from alyr.core import actions

    assert registry.TOOLS
    for name, tool in registry.TOOLS.items():
        assert re.fullmatch(registry.NAME, name) and name == tool.name
        assert tool.action in actions.REGISTRY
        assert tool.scope in scopes.ALL and tool.title and 20 <= len(tool.description) <= 1024
        assert tool.schema["type"] == "object"
        if tool.changing:
            assert tool.preview is not None and tool.scope != scopes.READ
        else:
            assert tool.scope == scopes.READ and not tool.sends


def test_the_connector_fails_closed_outside_a_developers_machine():
    from alyr.config import Settings, mcp_on

    https = "https://mcp.alyr.qa"
    assert mcp_on(Settings(env="local", mcp_enabled=None)) is True
    assert mcp_on(Settings(env="local", mcp_enabled=False)) is False
    # In production it is off until the founder switches it on, and only with an https address.
    assert mcp_on(Settings(env="production", mcp_enabled=None, mcp_public_url=https)) is False
    assert mcp_on(Settings(env="production", mcp_enabled=False, mcp_public_url=https)) is False
    assert mcp_on(Settings(env="production", mcp_enabled=True, mcp_public_url=https)) is True
    for wrong in ("http://mcp.alyr.qa", "mcp.alyr.qa", "", "http://localhost:8000"):
        assert mcp_on(Settings(env="production", mcp_enabled=True, mcp_public_url=wrong)) is False


# ── The small argument checker ─────────────────────────────────────────────────────────────────

SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "minLength": 2, "maxLength": 5, "pattern": "^[a-z]+$"},
        "count": {"type": "integer", "minimum": 1, "maximum": 3},
        "ratio": {"type": "number"}, "on": {"type": "boolean"},
        "kind": {"type": "string", "enum": ["a", "b"]},
        "tags": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 2},
    },
    "required": ["name"], "additionalProperties": False,
}


@pytest.mark.parametrize("value,count", [
    ({"name": "ab"}, 0),
    ({}, 1), ({"name": "a"}, 1), ({"name": "abcdef"}, 1), ({"name": "AB"}, 1),
    ({"name": "ab", "count": 0}, 1), ({"name": "ab", "count": 4}, 1),
    ({"name": "ab", "count": True}, 1), ({"name": "ab", "count": 1.5}, 1),
    ({"name": "ab", "ratio": "1"}, 1), ({"name": "ab", "on": "yes"}, 1),
    ({"name": "ab", "kind": "c"}, 1), ({"name": "ab", "tags": []}, 1),
    ({"name": "ab", "tags": ["x", "y", "z"]}, 1), ({"name": "ab", "tags": [1]}, 1),
    ({"name": "ab", "other": 1}, 1), ({"name": 5}, 1),
])
def test_the_argument_checker(value, count):
    assert len(schema.problems(value, SCHEMA)) == count


def test_the_argument_checker_refuses_a_schema_it_does_not_understand():
    with pytest.raises(ValueError, match="unsupported"):
        schema.check_schema({"type": "object", "properties": {"a": {"$ref": "http://x/y"}}})
    with pytest.raises(ValueError, match="unsupported"):
        schema.check_schema({"type": "object", "oneOf": []})
    schema.check_schema(SCHEMA)


# ── A page that shows what a stranger wrote ────────────────────────────────────────────────────


def test_the_name_an_app_gives_itself_cannot_inject_into_the_page(client_factory, monkeypatch):
    environment(monkeypatch)
    app = App(client_factory())
    app.register(name='<script>alert(1)</script> & "Claude"')
    page_text = app.start("a" * 43).text
    assert "<script>alert(1)</script>" not in page_text
    assert "&lt;script&gt;" in page_text and "<script" not in page_text.replace("&lt;script", "")


def test_unused_registrations_make_room_and_a_full_table_says_so(client_factory, monkeypatch):
    environment(monkeypatch)
    app = App(client_factory())
    sql("delete from mcp_clients where not exists (select 1 from mcp_grants g "
        "where g.app_id = mcp_clients.app_id)")
    total = sql("select count(*) as n from mcp_clients")[0]["n"]
    monkeypatch.setattr(clients, "MAX_CLIENTS", total + 2)
    app.register()
    app.register()
    full = app.http.post("/oauth/register", json={"client_name": "x", "redirect_uris": [
        "https://claude.ai/api/mcp/auth_callback"]})
    assert full.status_code == 503  # nothing is old enough to remove yet
    sql("update mcp_clients set created_at = now() - interval '8 days' where kind = 'dcr'")
    ok = app.http.post("/oauth/register", json={"client_name": "x", "redirect_uris": [
        "https://claude.ai/api/mcp/auth_callback"]})
    assert ok.status_code == 201


def test_a_second_person_never_sees_the_first_persons_request(client_factory, monkeypatch):
    """The sign-in request carries only what the browser that began it can present."""
    environment(monkeypatch)
    shop = new_shop()
    one, two = App(client_factory()), App(client_factory())
    one.register()
    two.client_id = one.client_id
    page_one = one.start("a" * 43)
    req = re.search(r'name="req" value="([^"]+)"', page_one.text).group(1)
    stolen = two.http.post("/oauth/authorize/email", data={"req": req, "email": person(shop)})
    assert stolen.status_code == 400
    assert safety.NAME_MAX == 40
