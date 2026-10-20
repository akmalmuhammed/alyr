"""The open API another system uses to send sales to ALYR and read what became of them
(ALY-142, spec 015, docs/connect-api.md).

Everything here is for a machine and answers to an API key (`Authorization: Bearer <key>`), never
to a browser's session: the workspace's own routes read a cookie and ignore this header, and these
read this header and ignore the cookie, so a key cannot reach the workspace, another module or
another shop. The shop is set from the key, and row-level security does the rest.

Each call is counted against the key's rate limit before it does anything (`keys.authenticate`),
and a call over the limit is refused with 429 and `Retry-After`. The documents module must be on
for the shop. A key's scopes say what it may do: `sales:write`, `documents:read`, `webhooks`.

The error shape is the documents API's: `detail` in English, `code` to program against,
`message_ar`, and what says where. A malformed body is answered 422 with one entry for each
problem (`detail`, a list of `loc` and `msg`) and `code: validation_error`.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from alyr.config import get_settings
from alyr.core import links
from alyr.modules.connect import ingest, keys, webhooks
from alyr.modules.connect.keys import ApiKey
from alyr.modules.connect.schemas import MAX_BODY_BYTES, SaleIn
from alyr.modules.connect.words import ConnectError
from alyr.modules.documents import delivery, sales, service

router = APIRouter(prefix="/api/connect", tags=["connect"])


# ── who is calling ───────────────────────────────────────────────────────────────────────


async def current_key(request: Request, response: Response) -> ApiKey:
    """Prove the key, count the call, check the shop has Documents on."""
    from alyr.core.workspace import module_enabled

    db = request.app.state.db
    key = await keys.authenticate(db, request.headers.get("authorization"))
    if not await module_enabled(db, key.tenant_id, "documents"):
        raise ConnectError("module_off", 403)
    response.headers["X-RateLimit-Limit"] = str(key.rate_limit)
    response.headers["X-RateLimit-Remaining"] = str(key.remaining)
    response.headers["X-RateLimit-Reset"] = str(key.reset_seconds)
    return key


def needs(scope: str):
    """A dependency: the key must carry this scope."""

    async def check(key: ApiKey = Depends(current_key)) -> ApiKey:
        if not key.has(scope):
            raise ConnectError("scope_missing", 403, scope=scope)
        return key

    return check


SALES_WRITE = needs("sales:write")
DOCUMENTS_READ = needs("documents:read")
WEBHOOKS = needs("webhooks")


def _db(request: Request):
    return request.app.state.db


async def read_json(request: Request, model: type[BaseModel]):
    """The request body as `model`, never more than 512 KB. Problems come back as one list, in
    the shape every client of this API can read."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise ConnectError("body_too_large", 413)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY_BYTES:
            raise ConnectError("body_too_large", 413)
    try:
        return model.model_validate_json(bytes(body))
    except ValidationError as error:
        problems = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]}
                    for e in error.errors(include_url=False, include_context=False)]
        raise Invalid(problems) from error


class Invalid(Exception):
    def __init__(self, problems: list[dict]) -> None:
        super().__init__("invalid body")
        self.problems = problems


async def invalid(request: Request, error: Invalid) -> JSONResponse:
    return JSONResponse(status_code=422,
                        content={"detail": error.problems, "code": "validation_error"})


# ── ping ─────────────────────────────────────────────────────────────────────────────────


@router.get("/ping")
async def ping(key: ApiKey = Depends(current_key)) -> dict:
    """Is the key good, and what may it do? Counts as a call."""
    return {"ok": True, "key": {"name": key.name, "prefix": key.prefix, "scopes": list(key.scopes),
                                "rate_limit_per_minute": key.rate_limit}}


# ── sales ────────────────────────────────────────────────────────────────────────────────


@router.post("/sales", status_code=201)
async def post_sale(
    request: Request, response: Response, key: ApiKey = Depends(SALES_WRITE),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """One sale in, one document out, once. Send an `Idempotency-Key` and the other system's own
    `external_sale_id`. The same key and the same body again returns the first answer with
    `replayed: true` and status 200; the same key with a different body is 409."""
    if idempotency_key is None:
        raise ConnectError("idempotency_key_needed", 400)
    sale = await read_json(request, SaleIn)
    sender = ingest.Sender(key.actor(), via="api", api_key_id=key.id, key_prefix=key.prefix)
    async with _db(request).tenant(key.tenant_id) as conn:
        result = await ingest.accept(conn, sender, sale, idempotency_key)
    if result["replayed"]:
        response.status_code = 200
    return result


@router.get("/sales/{external_sale_id}")
async def get_sale(
    external_sale_id: str, request: Request,
    kind: str | None = Query(default=None, max_length=20),
    key: ApiKey = Depends(DOCUMENTS_READ),
) -> dict:
    """What became of a sale: its document and whether the customer got it."""
    async with _db(request).tenant(key.tenant_id) as conn:
        row = await conn.fetchrow(
            "select * from connect_sales where external_sale_id = $1 and released_at is null "
            "and ($2::text is null or kind = $2) order by created_at desc limit 1",
            external_sale_id, kind)
        if row is None:
            raise ConnectError("sale_not_found", 404)
        return await ingest.answer(conn, row, replayed=False)


# ── documents ────────────────────────────────────────────────────────────────────────────


@router.get("/documents/{doc_id}")
async def get_document(doc_id: UUID, request: Request,
                       key: ApiKey = Depends(DOCUMENTS_READ)) -> dict:
    async with _db(request).tenant(key.tenant_id) as conn:
        staff = sales.staff_for(key.tenant_id, key.actor())
        try:
            document = await service.get(conn, staff, doc_id)
        except Exception as error:  # a document that is not this shop's is not found
            if getattr(error, "code", "") == "not_found":
                raise ConnectError("document_not_found", 404) from error
            raise
        document["delivery"] = delivery.summary_of(
            (await delivery.summaries(conn, [doc_id])).get(str(doc_id)))
        shop = await conn.fetchrow(
            "select id, slug from tenants "
            "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")
        document["hosted_url"] = (
            links.document_url(get_settings().public_web_url, shop["slug"], shop["id"], doc_id)
            if shop["slug"] and document["status"] != "draft" and not document["withdrawn"]
            else None)
    return {"document": document}


@router.get("/documents/{doc_id}/pdf")
async def get_pdf(doc_id: UUID, request: Request,
                  key: ApiKey = Depends(DOCUMENTS_READ)) -> Response:
    async with _db(request).tenant(key.tenant_id) as conn:
        staff = sales.staff_for(key.tenant_id, key.actor())
        try:
            data, row = await service.pdf_of(conn, staff, doc_id)
        except Exception as error:
            if getattr(error, "code", "") == "not_found":
                raise ConnectError("document_not_found", 404) from error
            raise
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": 'inline; filename="document.pdf"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


# ── webhooks (scope: webhooks) ───────────────────────────────────────────────────────────


class WebhookIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(max_length=500)
    events: list[str] = Field(min_length=1, max_length=5)
    name: str = Field(default="", max_length=60)


class WebhookPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str | None = Field(default=None, max_length=500)
    events: list[str] | None = Field(default=None, max_length=5)
    name: str | None = Field(default=None, max_length=60)
    enabled: bool | None = None


@router.get("/webhooks")
async def list_webhooks(request: Request, key: ApiKey = Depends(WEBHOOKS)) -> dict:
    async with _db(request).tenant(key.tenant_id) as conn:
        return {"webhooks": await webhooks.list_endpoints(conn), "events": list(webhooks.EVENTS)}


@router.post("/webhooks", status_code=201)
async def add_webhook(body: WebhookIn, request: Request,
                      key: ApiKey = Depends(WEBHOOKS)) -> dict:
    """Register an address. The signing secret is in the answer, once."""
    async with _db(request).tenant(key.tenant_id) as conn:
        row, secret = await webhooks.create(
            conn, key.actor(), url=body.url, events=body.events, name=body.name)
    return {"webhook": row, "secret": secret}


@router.put("/webhooks/{webhook_id}")
async def change_webhook(webhook_id: UUID, body: WebhookPatch, request: Request,
                         key: ApiKey = Depends(WEBHOOKS)) -> dict:
    async with _db(request).tenant(key.tenant_id) as conn:
        return {"webhook": await webhooks.update(
            conn, key.actor(), webhook_id, **body.model_dump(exclude_unset=True))}


@router.post("/webhooks/{webhook_id}/rotate-secret")
async def rotate_webhook_secret(webhook_id: UUID, request: Request,
                                key: ApiKey = Depends(WEBHOOKS)) -> dict:
    async with _db(request).tenant(key.tenant_id) as conn:
        row, secret = await webhooks.rotate_secret(conn, key.actor(), webhook_id)
    return {"webhook": row, "secret": secret}


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(webhook_id: UUID, request: Request,
                       key: ApiKey = Depends(WEBHOOKS)) -> dict:
    async with _db(request).tenant(key.tenant_id) as conn:
        return await webhooks.send_test(conn, key.actor(), webhook_id)


@router.get("/webhooks/{webhook_id}/deliveries")
async def webhook_deliveries(webhook_id: UUID, request: Request,
                             key: ApiKey = Depends(WEBHOOKS)) -> dict:
    async with _db(request).tenant(key.tenant_id) as conn:
        return {"deliveries": await webhooks.deliveries_of(conn, webhook_id)}


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: UUID, request: Request,
                         key: ApiKey = Depends(WEBHOOKS)) -> dict:
    async with _db(request).tenant(key.tenant_id) as conn:
        await webhooks.remove(conn, key.actor(), webhook_id)
    return {"deleted": True}
