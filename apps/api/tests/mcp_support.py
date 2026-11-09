"""Helpers for the connector's tests (spec 067): a client that completes the whole sign-in the way an
app does, speaks MCP in both eras, and a shop with its people.

Everything goes through the real path: PostgreSQL, the HTTP API, the email code (read from the
page the API shows on a developer's machine), PKCE, tokens. No token is ever written into a file;
every one is made at run time by the API.
"""

import base64
import hashlib
import re
import secrets
from dataclasses import dataclass, field
from html import unescape
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

from documents_support import make_shop
from test_consent import owner_sql

ISSUER = "http://testserver"
RESOURCE = f"{ISSUER}/mcp"
CLAUDE = "https://claude.ai/api/mcp/auth_callback"
ALL_SCOPES = "read stock bookings orders send"
MODERN = "2026-07-28"


def environment(monkeypatch, **more) -> None:
    """The settings every connector test needs. The connector is on in a developer's machine."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    monkeypatch.setenv("ALYR_MCP_PUBLIC_URL", ISSUER)
    for name, value in more.items():
        monkeypatch.setenv(f"ALYR_{name.upper()}", str(value))


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)[:64]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge.rstrip(b"=").decode()


def hidden(html: str, name: str) -> str:
    found = re.search(rf'name="{name}" value="([^"]*)"', html)
    assert found, f"no {name} on the page"
    return unescape(found.group(1))


def dev_code(html: str) -> str:
    found = re.search(r'data-dev-code="(\d+)"', html)
    assert found, "no code on the page"
    return found.group(1)


@dataclass
class Tokens:
    access: str
    refresh: str
    client_id: str
    raw: dict
    scope: str = ""


@dataclass
class Shop:
    tenant_id: UUID
    emails: dict


def new_shop(**kw) -> Shop:
    made = make_shop(documents=kw.pop("documents", True))
    return Shop(made.tenant_id, made.emails)


def sql(query, *args):
    """Rows as dicts, as the database owner (who sees every business). The jsonb columns the tests
    read come back decoded."""
    import json

    rows = [dict(r) for r in owner_sql(query, *args)]
    for row in rows:
        for key in ("detail", "preview"):
            if isinstance(row.get(key), str):
                row[key] = json.loads(row[key])
    return rows


@dataclass
class App:
    """One app speaking to the API: a TestClient, with the steps of an OAuth sign-in."""

    http: object
    client_id: str = ""
    redirect: str = CLAUDE
    name: str = "Claude"
    trail: list = field(default_factory=list)

    # ── registration ──────────────────────────────────────────────────────────────────────────

    def register(self, redirect: str | None = None, name: str | None = None, **more) -> str:
        answer = self.http.post("/oauth/register", json={
            "client_name": name or self.name, "redirect_uris": [redirect or self.redirect],
            "token_endpoint_auth_method": "none", "grant_types": ["authorization_code",
                                                                  "refresh_token"],
            "response_types": ["code"], **more,
        })
        assert answer.status_code == 201, answer.text
        self.client_id = answer.json()["client_id"]
        return self.client_id

    # ── the page ──────────────────────────────────────────────────────────────────────────────

    def authorize_url(self, challenge: str, **more) -> str:
        params = {
            "response_type": "code", "client_id": self.client_id, "redirect_uri": self.redirect,
            "code_challenge": challenge, "code_challenge_method": "S256", "state": "xyz",
            "scope": "read", "resource": RESOURCE, **more,
        }
        from urllib.parse import urlencode

        return "/oauth/authorize?" + urlencode({k: v for k, v in params.items() if v is not None})

    def start(self, challenge: str, **more):
        return self.http.get(self.authorize_url(challenge, **more))

    def sign_in(self, page, email: str) -> str:
        """Email, then the code from the page. Returns the page after the code."""
        req = hidden(page.text, "req")
        sent = self.http.post("/oauth/authorize/email", data={"req": req, "email": email})
        assert sent.status_code == 200, sent.text
        code = dev_code(sent.text)
        return self.http.post("/oauth/authorize/code", data={"req": req, "code": code})

    def consent(self, page, tenant_id: UUID | None = None, *, opt_in: bool = True,
                decision: str = "allow"):
        """Choose the business (if the page asks) and answer the consent page. Returns the
        response of the last post, not followed."""
        req = hidden(page.text, "req")
        if 'action="/oauth/authorize/shop"' in page.text:
            assert tenant_id is not None
            page = self.http.post("/oauth/authorize/shop",
                                  data={"req": req, "tenant_id": str(tenant_id)})
            assert page.status_code == 200, page.text
        tenant = hidden(page.text, "tenant_id")
        data = {"req": req, "tenant_id": tenant, "decision": decision}
        if opt_in:
            data["opt_in"] = "yes"
        return self.http.post("/oauth/authorize/consent", data=data, follow_redirects=False)

    def connect(self, email: str, tenant_id: UUID | None = None, *, scope: str = "read",
                opt_in: bool = True, challenge_pair=None, **more) -> Tokens:
        """The whole thing: register (if not yet), authorize, sign in, consent, exchange."""
        if not self.client_id:
            self.register()
        verifier, challenge = challenge_pair or pkce()
        page = self.start(challenge, scope=scope, **more)
        assert page.status_code == 200, page.text
        after = self.sign_in(page, email)
        assert after.status_code == 200, after.text
        done = self.consent(after, tenant_id, opt_in=opt_in)
        assert done.status_code == 303, done.text
        target = urlsplit(done.headers["location"])
        query = parse_qs(target.query)
        assert query["iss"] == [ISSUER] and query["state"] == ["xyz"]
        return self.exchange(query["code"][0], verifier)

    def exchange(self, code: str, verifier: str, **more) -> Tokens:
        answer = self.token({"grant_type": "authorization_code", "code": code,
                             "client_id": self.client_id, "redirect_uri": self.redirect,
                             "code_verifier": verifier, "resource": RESOURCE, **more})
        assert answer.status_code == 200, answer.text
        body = answer.json()
        return Tokens(body["access_token"], body["refresh_token"], self.client_id, body,
                      body["scope"])

    def token(self, data: dict):
        return self.http.post("/oauth/token", data=data)

    def refresh(self, refresh_token: str, **more):
        return self.token({"grant_type": "refresh_token", "refresh_token": refresh_token,
                           "client_id": self.client_id, **more})

    # ── MCP ───────────────────────────────────────────────────────────────────────────────────

    def rpc(self, token: str | None, method: str, params: dict | None = None, *, modern=False,
            id_=1, headers: dict | None = None, raw: bytes | None = None):
        message = {"jsonrpc": "2.0", "id": id_, "method": method}
        if params is not None or modern:
            message["params"] = dict(params or {})
        send = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if token:
            send["Authorization"] = f"Bearer {token}"
        if modern:
            message["params"]["_meta"] = {
                "io.modelcontextprotocol/protocolVersion": MODERN,
                "io.modelcontextprotocol/clientCapabilities": {},
                "io.modelcontextprotocol/clientInfo": {"name": "test", "version": "1"},
            }
            send["MCP-Protocol-Version"] = MODERN
            send["Mcp-Method"] = method
            if method == "tools/call":
                send["Mcp-Name"] = message["params"]["name"]
        send.update(headers or {})
        import json

        return self.http.post("/mcp", content=raw if raw is not None else json.dumps(message),
                              headers=send)

    def call(self, token: str, tool: str, arguments: dict | None = None, **more):
        return self.rpc(token, "tools/call", {"name": tool, "arguments": arguments or {}}, **more)

    def result(self, token: str, tool: str, arguments: dict | None = None, **more) -> dict:
        """The result of a tool call that was answered 200."""
        answer = self.call(token, tool, arguments, **more)
        assert answer.status_code == 200, answer.text
        return answer.json()["result"]


def person(shop: Shop, role: str = "owner") -> str:
    return shop.emails[role]


def structured(result: dict) -> dict:
    assert result["isError"] is False, result
    return result["structuredContent"]
