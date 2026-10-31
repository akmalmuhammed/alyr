"""A fake Meta for the tests of the WhatsApp line (specs 060 to 063): the Graph API's answers for
the calls ALYR makes, held in memory, and a record of what was asked.

Nothing here reaches the network. `install` swaps the HTTP client every Meta call is made with
for one that talks to this object, the way `test_attach_whatsapp.meta_says` always has. The
fake answers only the paths ALYR uses, in the shapes Meta's documentation gives (pages checked
31 Oct 2026, linked from docs/runbooks/whatsapp-line.md); a call it does not know is a 404 and
the test fails, so the code can never ask Meta something nobody has written down.

It never keeps the access token it was sent. `token_ok = False` makes every call answer the way
Meta does for a wrong or expired token (error code 190).
"""

import json

import httpx

from alyr.channels import meta

GRAPH_VERSION = "v21.0"


def error(status: int, code: int, message: str) -> httpx.Response:
    return httpx.Response(status, json={"error": {"message": message, "code": code}})


class FakeMeta:
    def __init__(self, app_id: str = "1071845795713841") -> None:
        self.app_id = app_id
        self.token_ok = True
        # number id -> what GET /{id} answers
        self.numbers: dict[str, dict] = {}
        # waba id -> {"numbers": [ids], "apps": [app ids]}
        self.wabas: dict[str, dict] = {}
        # Every request, as (method, path after the version, query, body). No headers.
        self.calls: list[tuple[str, str, dict, dict]] = []
        # path -> (status, code, message): a call to that path is refused this way
        self.refuse: dict[str, tuple[int, int, str]] = {}
        self.sent: list[dict] = []

    # ── what Meta "has" ──────────────────────────────────────────────────────────────────

    def add_number(
        self, number_id: str, waba_id: str = "", *, status: str = "CONNECTED",
        display: str = "+974 5555 0188", name: str = "Test Shop", quality: str = "GREEN",
        subscribed: bool = True,
    ) -> None:
        self.numbers[number_id] = {
            "id": number_id, "status": status, "display_phone_number": display,
            "verified_name": name, "quality_rating": quality, "name_status": "APPROVED",
            "code_verification_status": "VERIFIED",
        }
        if waba_id:
            account = self.wabas.setdefault(waba_id, {"numbers": [], "apps": []})
            account["numbers"].append(number_id)
            if subscribed and self.app_id not in account["apps"]:
                account["apps"].append(self.app_id)

    def paths(self) -> list[str]:
        return [path for _, path, _, _ in self.calls]

    # ── the transport ────────────────────────────────────────────────────────────────────

    def handle(self, request: httpx.Request) -> httpx.Response:
        parts = request.url.path.strip("/").split("/")
        path = "/".join(parts[1:]) if parts and parts[0].startswith("v") else "/".join(parts)
        query = dict(request.url.params)
        body: dict = {}
        if request.content and request.headers.get("content-type", "").startswith(
            "application/json"
        ):
            body = json.loads(request.content)
        self.calls.append((request.method, path, query, body))
        if not self.token_ok:
            return error(401, 190, "Error validating access token: Session has expired")
        if path in self.refuse:
            return error(*self.refuse[path])
        return self.route(request.method, parts[1:], query, body)

    def route(self, method: str, parts: list[str], query: dict, body: dict) -> httpx.Response:
        if method == "GET" and len(parts) == 1 and parts[0] in self.numbers:
            number = self.numbers[parts[0]]
            wanted = [f for f in query.get("fields", "").split(",") if f]
            return httpx.Response(200, json={
                "id": parts[0], **{k: v for k, v in number.items() if not wanted or k in wanted}})
        if method == "GET" and len(parts) == 1:
            return error(400, 100, "Unsupported get request. Object does not exist")
        if method == "GET" and len(parts) == 2 and parts[1] == "phone_numbers":
            account = self.wabas.get(parts[0])
            if account is None:
                return error(400, 100, "Unsupported get request. Object does not exist")
            return httpx.Response(200, json={"data": [{"id": n} for n in account["numbers"]]})
        if method == "GET" and len(parts) == 2 and parts[1] == "subscribed_apps":
            account = self.wabas.get(parts[0])
            if account is None:
                return error(400, 100, "Unsupported get request. Object does not exist")
            return httpx.Response(200, json={"data": [
                {"whatsapp_business_api_data": {"id": app, "name": "alyr", "link": ""}}
                for app in account["apps"]]})
        if method == "POST" and len(parts) == 2 and parts[1] == "messages":
            self.sent.append(body)
            return httpx.Response(200, json={"messages": [{"id": f"wamid.fake{len(self.sent)}"}]})
        if method == "POST" and len(parts) == 2 and parts[1] == "media":
            return httpx.Response(200, json={"id": "media-fake"})
        return error(404, 100, f"the fake Meta does not know {method} /{'/'.join(parts)}")

    def install(self, monkeypatch) -> "FakeMeta":
        real = httpx.AsyncClient
        transport = httpx.MockTransport(self.handle)
        monkeypatch.setattr(
            meta.httpx, "AsyncClient", lambda **kw: real(**({"transport": transport} | kw)))
        return self
