"""Helpers for the tests of connected mode (ALY-142): a shop that has accepted the terms and has
a key, a machine client that speaks only with that key, a sale a till might send, and a small
receiver on this machine for webhooks.

No test here sends anything to the outside: the receiver is a thread on 127.0.0.1, the WhatsApp
channel is the simulator, and email is not set up. Every key a test uses is made at run time by
the API; no key is ever written into a file.
"""

import hashlib
import hmac
import json
import threading
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4

from documents_sales_support import SalesShop, sales_shop
from documents_support import LINES, LINES_TOTAL
from test_consent import owner_sql

LINES_MINOR = [dict(line) for line in LINES]
SCOPES_ALL = ["sales:write", "documents:read", "webhooks"]


@dataclass
class Connected:
    """A shop, a machine client and a key."""

    shop: SalesShop
    machine: object
    secret: str
    key: dict
    receivers: list = field(default_factory=list)

    @property
    def tenant_id(self):
        return self.shop.tenant_id

    @property
    def owner(self):
        return self.shop.owner

    def headers(self, idem: str | None = None, **more) -> dict:
        out = {"Authorization": f"Bearer {self.secret}", **more}
        if idem is not None:
            out["Idempotency-Key"] = idem
        return out

    def post_sale(self, body: dict, idem: str | None = None):
        return self.machine.post("/api/connect/sales", json=body,
                                 headers=self.headers(idem or f"idem-{uuid4().hex}"))

    def sale(self, body: dict, idem: str | None = None) -> dict:
        answer = self.post_sale(body, idem)
        assert answer.status_code in (200, 201), answer.text
        return answer.json()


def connected_shop(client_factory, monkeypatch, *, scopes=None, accept_terms: bool = True,
                   rate: int | None = None, **settings) -> Connected:
    shop = sales_shop(client_factory, monkeypatch, **settings)
    if accept_terms:
        done = shop.owner.post("/api/connect-setup/terms/accept")
        assert done.status_code == 200, done.text
    machine = client_factory()
    made = make_key(shop, scopes or SCOPES_ALL, rate=rate) if accept_terms else None
    return Connected(shop, machine, made["secret"] if made else "", made["key"] if made else {})


def make_key(shop: SalesShop, scopes, name: str = "Till 1", rate: int | None = None) -> dict:
    body = {"name": name, "scopes": list(scopes)}
    if rate is not None:
        body["rate_limit_per_minute"] = rate
    done = shop.owner.post("/api/connect-setup/keys", json=body)
    assert done.status_code == 201, done.text
    return done.json()


def sale_body(sale_id: str | None = None, kind: str = "receipt", **more) -> dict:
    """A sale a till might send: bread and a cake. A receipt is paid in cash in full; an invoice
    is unpaid."""
    body = {
        "external_sale_id": sale_id or f"POS-{uuid4().hex[:8]}",
        "kind": kind,
        "customer": {"phone": "+974 5555 0199", "name": "Fatima Al-Kuwari",
                     "name_ar": "فاطمة الكواري"},
        "lines": LINES_MINOR,
        "totals": {"total_minor": LINES_TOTAL},
    }
    if kind == "receipt":
        body["payment"] = {"method": "cash", "amount_minor": LINES_TOTAL}
    elif kind == "invoice":
        body["payment"] = "unpaid"
    return {**body, **more}


def authority(shop: SalesShop, **kinds_) -> dict:
    """Hand kinds to the other system: `authority(shop, receipt="external")`."""
    done = shop.owner.put("/api/connect-setup/authority", json={"changes": kinds_})
    assert done.status_code == 200, done.text
    return done.json()["authority"]


def rows(sql: str, *args) -> list:
    return [dict(r) for r in owner_sql(sql, *args)]


def documents_of(shop: SalesShop) -> list[dict]:
    return rows("select id, kind, status, number, number_authority, series_key, seq, source, "
                "source_ref, total_minor, withdrawn_at from documents where tenant_id = $1 "
                "order by created_at, issued_at nulls first, id", shop.tenant_id)


def series_counters(shop: SalesShop) -> dict:
    return {(r["kind"], r["series_key"]): r["last_number"] for r in rows(
        "select kind, series_key, last_number from document_series where tenant_id = $1",
        shop.tenant_id)}


# ── a receiver for webhooks, on this machine ─────────────────────────────────────────────


class Receiver:
    """Records what it is sent and answers with the statuses it is told to (the last one
    repeats)."""

    def __init__(self, statuses=(200,), body: bytes = b"ok") -> None:
        self.requests: list[dict] = []
        self.statuses = list(statuses)
        self.body = body
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802 - the name http.server asks for
                length = int(self.headers.get("content-length", "0"))
                data = self.rfile.read(length)
                outer.requests.append({"headers": {k.lower(): v for k, v in self.headers.items()},
                                       "body": data, "path": self.path})
                status = outer.statuses.pop(0) if len(outer.statuses) > 1 else outer.statuses[0]
                self.send_response(status)
                if 300 <= status < 400:
                    self.send_header("Location", "http://169.254.169.254/latest/meta-data/")
                self.send_header("Content-Length", str(len(outer.body)))
                self.end_headers()
                self.wfile.write(outer.body)

            def log_message(self, *args):  # silence
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}/hook"

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()

    def events(self) -> list[dict]:
        return [json.loads(r["body"]) for r in self.requests]


def verify_signature(secret: str, request: dict, *, now: int | None = None) -> bool:
    """What a receiver does: recompute `sha256=` of `<timestamp>.<body>` and compare."""
    timestamp = request["headers"]["x-alyr-timestamp"]
    expected = "sha256=" + hmac.new(secret.encode(), f"{timestamp}.".encode() + request["body"],
                                    hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, request["headers"]["x-alyr-signature"])


def push_due_webhooks(shop: Connected) -> None:
    """Make every waiting webhook retry due now and run the job queue, as time passing would."""
    owner_sql("update jobs set run_at = now() where kind = 'webhook_send' "
              "and status = 'queued' and tenant_id = $1", shop.tenant_id)
    shop.machine.portal.call(shop.machine.app.state.jobs.drain)
