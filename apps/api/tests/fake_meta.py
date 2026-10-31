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
        # waba id -> the templates Meta has on it: {id, name, language, status, category,
        # rejected_reason}. `created` and `edited` are what ALYR sent; `uploads` the sample files.
        self.templates: dict[str, list[dict]] = {}
        self.created: list[dict] = []
        self.edited: list[tuple[str, list]] = []
        self.uploads: list[str] = []
        # Meta refuses a request for a field it does not know (error 100) as a whole; the health
        # read asks for the extended fields first and again for the basics when refused.
        self.reject_extended = False
        # Meta pages its lists; a small page forces the code to follow the cursor.
        self.page_size = 200
        # After this many created templates Meta answers "too many requests" (code 4).
        self.rate_limit_after: int | None = None
        # (name, language) -> (status, code, message): creating that template is refused.
        self.refuse_template: dict[tuple[str, str], tuple[int, int, str]] = {}

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
            "whatsapp_business_manager_messaging_limit": "TIER_250",
            "throughput": {"level": "STANDARD"},
            "health_status": {"can_send_message": "AVAILABLE"},
        }
        if waba_id:
            account = self.wabas.setdefault(waba_id, {"numbers": [], "apps": []})
            account["numbers"].append(number_id)
            if subscribed and self.app_id not in account["apps"]:
                account["apps"].append(self.app_id)

    def add_template(
        self, waba_id: str, name: str, language: str = "en", status: str = "APPROVED",
        category: str = "UTILITY", reason: str = "NONE",
    ) -> str:
        found = self.templates.setdefault(waba_id, [])
        template_id = str(900000 + sum(len(v) for v in self.templates.values()))
        found.append({"id": template_id, "name": name, "language": language, "status": status,
                      "category": category, "rejected_reason": reason})
        return template_id

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
            if self.reject_extended and "whatsapp_business_manager_messaging_limit" in wanted:
                return error(400, 100, "(#100) Tried accessing nonexisting field")
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
        if method == "GET" and len(parts) == 2 and parts[1] == "message_templates":
            if parts[0] not in self.wabas and parts[0] not in self.templates:
                return error(400, 100, "Unsupported get request. Object does not exist")
            everything = self.templates.get(parts[0], [])
            size = min(int(query.get("limit", 25)), self.page_size)
            start = int(query.get("after", 0) or 0)
            page = everything[start:start + size]
            more = start + size < len(everything)
            paging = {"cursors": {"after": str(start + size)}}
            if more:
                paging["next"] = "https://graph.facebook.com/next-page-never-fetched"
            return httpx.Response(200, json={"data": page, "paging": paging})
        if method == "POST" and len(parts) == 2 and parts[1] == "message_templates":
            return self.create(parts[0], body)
        if method == "POST" and len(parts) == 2 and parts[1] == "uploads":
            self.uploads.append(query.get("file_name", ""))
            return httpx.Response(200, json={"id": f"upload:{len(self.uploads)}"})
        if method == "POST" and len(parts) == 1 and parts[0].startswith("upload:"):
            return httpx.Response(200, json={"h": f"handle-for-{parts[0]}"})
        if method == "POST" and len(parts) == 1:
            for found in self.templates.values():
                for template in found:
                    if template["id"] == parts[0]:
                        self.edited.append((parts[0], body.get("components", [])))
                        template["status"] = "PENDING"
                        return httpx.Response(200, json={"success": True})
        if method == "POST" and len(parts) == 2 and parts[1] == "messages":
            self.sent.append(body)
            return httpx.Response(200, json={"messages": [{"id": f"wamid.fake{len(self.sent)}"}]})
        if method == "POST" and len(parts) == 2 and parts[1] == "media":
            return httpx.Response(200, json={"id": "media-fake"})
        return error(404, 100, f"the fake Meta does not know {method} /{'/'.join(parts)}")

    def create(self, waba_id: str, body: dict) -> httpx.Response:
        key = (body.get("name", ""), body.get("language", ""))
        if waba_id not in self.wabas and waba_id not in self.templates:
            return error(400, 100, "Unsupported post request. Object does not exist")
        if self.rate_limit_after is not None and len(self.created) >= self.rate_limit_after:
            return error(400, 4, "Application request limit reached")
        if key in self.refuse_template:
            return error(*self.refuse_template[key])
        if any((t["name"], t["language"]) == key for t in self.templates.get(waba_id, [])):
            return error(400, 100, "Content in This Language Already Exists")
        if not (body.get("components") and body.get("category") in (
                "UTILITY", "MARKETING", "AUTHENTICATION")):
            return error(400, 100, "Invalid parameter")
        self.created.append(body)
        template_id = self.add_template(
            waba_id, key[0], key[1], status="PENDING", category=body["category"])
        return httpx.Response(200, json={
            "id": template_id, "status": "PENDING", "category": body["category"]})

    def install(self, monkeypatch) -> "FakeMeta":
        real = httpx.AsyncClient
        transport = httpx.MockTransport(self.handle)
        monkeypatch.setattr(
            meta.httpx, "AsyncClient", lambda **kw: real(**({"transport": transport} | kw)))
        return self
