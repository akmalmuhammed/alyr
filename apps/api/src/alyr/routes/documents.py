"""Documents in the workspace: receipts, invoices, quotes and the rest (ALY-138, spec 010).

Answers only for shops with the `documents` module on (it is off for every shop until the
screens and the sales hooks of packages 2 and 3 exist). Who may do what is in
`modules/documents/access.py`. Money is whole numbers of the currency's smallest unit
(`StrictInt`: 10.5 is refused, not rounded); a quantity travels as text.

Issuing takes an `Idempotency-Key` header (8 to 80 characters): a client that did not hear
the answer sends the same request again and gets the same document back, with 200 instead of
201, never a second one.
"""

import asyncio
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from alyr.core.auth import Staff
from alyr.core.team import actor_of
from alyr.modules.documents import access, kinds, money, service
from alyr.modules.documents import settings as doc_settings
from alyr.modules.documents.errors import DocumentError
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/documents", tags=["documents"])

Kind = Literal["receipt", "invoice", "quote", "delivery_note", "statement", "deposit_receipt",
               "proforma"]
Minor = Annotated[StrictInt, Field(ge=0, le=money.MAX_MINOR,
                                   description="Whole minor units: 100 is QAR 1")]
Languages = Literal["ar_en", "en_ar", "ar", "en"]
Layout = Literal["a4", "a5", "thermal80"]
Audience = Literal["consumer", "business"]
Unit = Literal["piece", "kg", "g", "l", "m", "box", "pack", "portion", "hour", "day", "service"]
Method = Literal["cash", "card", "bank_transfer", "link", "credit", "cheque", "other"]
IMAGE_LIMIT = doc_settings.IMAGE_MAX_BYTES


async def refused(request: Request, error: DocumentError) -> JSONResponse:
    """How every refusal reaches a client: `detail` in English like any other route, a `code`
    to act on, the same words in Arabic, and whatever says where (a field, a line)."""
    return JSONResponse(
        status_code=error.status,
        content={"detail": error.en, "code": error.code, "message_ar": error.ar, **error.extra},
    )


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LineIn(Strict):
    description: str = Field(default="", max_length=300)
    description_ar: str = Field(default="", max_length=300)
    sku: str = Field(default="", max_length=40)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unit: Unit = "piece"
    unit_price_minor: Minor
    discount_minor: Minor = 0
    tax_rate_bp: StrictInt = Field(default=0, ge=0, le=10000, description="500 is 5%")


class CustomerIn(Strict):
    name: str = Field(default="", max_length=120)
    name_ar: str = Field(default="", max_length=120)
    company: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=120)
    registration_number: str = Field(default="", max_length=40)
    tax_id: str = Field(default="", max_length=40)
    address: str = Field(default="", max_length=300)
    address_ar: str = Field(default="", max_length=300)


class PaymentIn(Strict):
    method: Method
    amount_minor: Annotated[StrictInt, Field(gt=0, le=money.MAX_MINOR)]
    reference: str = Field(default="", max_length=80)


class PairIn(Strict):
    en: str = Field(default="", max_length=600)
    ar: str = Field(default="", max_length=600)


class DraftIn(Strict):
    kind: Kind
    audience: Audience | None = Field(default=None, description="Default: the shop's setting")
    languages: Languages | None = None
    layout: Layout | None = None
    branch: str = Field(default="main", pattern="^[a-z0-9]{1,12}$",
                        description="Which of the shop's places it is issued from")
    currency: str | None = Field(default=None, pattern="^[A-Z]{3}$")
    due_date: date | None = Field(default=None, description="Due, or valid until, by kind")
    customer: CustomerIn = Field(default_factory=CustomerIn)
    contact_id: UUID | None = None
    lines: list[LineIn] = Field(default_factory=list, max_length=200)
    payments: list[PaymentIn] = Field(default_factory=list, max_length=10)
    notes: PairIn = Field(default_factory=PairIn)
    terms: PairIn = Field(default_factory=PairIn)
    reason: str = Field(default="", max_length=300)
    source: Literal["order", "booking", "ledger_payment", "manual", "external"] = "manual"
    source_ref: str = Field(default="", max_length=120)


class CreditNoteIn(Strict):
    reason: str = Field(min_length=3, max_length=300)
    lines: list[LineIn] | None = Field(
        default=None, max_length=200,
        description="Leave out to credit the whole document (once); list lines to credit part",
    )


class CreateIn(DraftIn):
    issue: bool = Field(default=False, description="Issue it in the same request (needs a key)")


class SettingsIn(Strict):
    business_name: str | None = None
    business_name_ar: str | None = None
    commercial_registration: str | None = None
    tax_id: str | None = None
    licence_number: str | None = None
    address: str | None = None
    address_ar: str | None = None
    phone: str | None = None
    email: str | None = None
    currency: str | None = None
    tax_enabled: bool | None = None
    tax_rate_bp: StrictInt | None = None
    cash_rounding_minor: StrictInt | None = Field(
        default=None, description="0 off, else 5, 10, 25, 50 or 100 minor units")
    languages: Languages | None = None
    default_audience: Audience | None = None
    layout: Layout | None = None
    brand_color: str | None = None
    show_sku: bool | None = None
    show_discounts: bool | None = None
    show_customer_tax_id: bool | None = None
    show_bank: bool | None = None
    show_signature: bool | None = None
    show_alyr_mark: bool | None = None
    bank_details: str | None = None
    header_en: str | None = None
    header_ar: str | None = None
    footer_en: str | None = None
    footer_ar: str | None = None
    terms: dict[str, PairIn] | None = None
    notes: dict[str, PairIn] | None = None
    agents_may_issue: bool | None = None


class BranchIn(Strict):
    name: str | None = Field(default=None, max_length=80)
    name_ar: str | None = Field(default=None, max_length=80)
    code: str | None = Field(default=None, max_length=4, description="Chosen once, at creation")
    address: str | None = Field(default=None, max_length=300)
    address_ar: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=40)
    active: bool | None = None


class SeriesIn(Strict):
    prefix: str | None = Field(default=None, max_length=8)
    pad: StrictInt | None = Field(default=None, ge=1, le=10)
    yearly_reset: bool | None = None


class PreviewIn(Strict):
    draft_id: UUID | None = None
    document: DraftIn | None = None
    kind: Kind | Literal["credit_note"] | None = Field(
        default=None, description="With neither a draft nor a document: a sample of this kind"
    )
    layout: Layout | None = None
    languages: Languages | None = None


def _db(request: Request):
    return request.app.state.db


def _settings_public(row: dict) -> dict:
    return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}


# ── what the screens need to know ─────────────────────────────────────────────────────────


@router.get("/meta")
async def meta(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with _db(request).tenant(staff.tenant_id) as conn:
        allowed = await access.view(conn, staff)
    return {
        "kinds": [
            {"key": k.key, "prefix": k.prefix, "needs_customer": k.needs_customer,
             "needs_registration": k.needs_registration, "payments": k.payments,
             "second_date": k.second_date, "creditable": k.creditable}
            for k in kinds.KINDS.values()
        ],
        "layouts": list(kinds.LAYOUTS), "languages": list(kinds.LANGUAGES),
        "cash_rounding_steps": list(kinds.CASH_ROUNDING_STEPS),
        "units": list(kinds.UNITS), "payment_methods": list(kinds.PAYMENT_METHODS),
        "currencies": {c.code: {"exponent": c.exponent, "symbol_ar": c.symbol_ar}
                       for c in money.CURRENCIES.values()},
        "retention": {"years": kinds.RETENTION_YEARS, "confirmed": kinds.RETENTION_CONFIRMED},
        "access": allowed,
    }


# ── settings, pictures and numbering ──────────────────────────────────────────────────────


@router.get("/settings")
async def get_settings(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"settings": _settings_public(await doc_settings.get(conn))}


@router.put("/settings")
async def put_settings(
    body: SettingsIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    changes = body.model_dump(exclude_unset=True)
    for name in ("terms", "notes"):
        if changes.get(name) is not None:
            changes[name] = {k: dict(v) for k, v in changes[name].items()}
    changes = {k: v for k, v in changes.items() if v is not None or k == "brand_color"}
    async with _db(request).tenant(staff.tenant_id) as conn:
        row = await doc_settings.update(conn, actor_of(staff), changes)
    return {"settings": _settings_public(row)}


@router.put("/settings/{which}")
async def put_image(
    which: Literal["logo", "stamp"], request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Set the logo or the stamp. The picture is the request body (`Content-Type: image/png`
    and so on); it is checked like a product photo and kept as a PNG."""
    access.require_manager(staff)
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > IMAGE_LIMIT:
        raise DocumentError("image_too_big", 413)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > IMAGE_LIMIT:
            raise DocumentError("image_too_big", 413)
    png, sha = await asyncio.to_thread(doc_settings.prepare_image, bytes(body))
    async with _db(request).tenant(staff.tenant_id) as conn:
        row = await doc_settings.set_image(conn, actor_of(staff), which, png, sha)
    return {"settings": _settings_public(row)}


@router.delete("/settings/{which}")
async def delete_image(
    which: Literal["logo", "stamp"], request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        row = await doc_settings.set_image(conn, actor_of(staff), which, None, None)
    return {"settings": _settings_public(row)}


@router.get("/branches")
async def get_branches(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"branches": await doc_settings.branches(conn)}


@router.put("/branches/{branch_key}")
async def put_branch(
    branch_key: str, body: BranchIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Add a branch (its own numbering) or change one. Owners and admins only."""
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        row = await doc_settings.save_branch(
            conn, actor_of(staff), branch_key, body.model_dump(exclude_unset=True))
    return {"branch": row}


@router.get("/series")
async def get_series(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"series": await doc_settings.series_rows(conn)}


@router.put("/series/{kind}/{series_key}")
async def put_series(
    kind: str, series_key: str, body: SeriesIn, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        row = await doc_settings.update_series(
            conn, actor_of(staff), kind, series_key, prefix=body.prefix, pad=body.pad,
            yearly_reset=body.yearly_reset,
        )
    return {"series": row}


# ── the preview: any layout and kind, no number taken ─────────────────────────────────────


@router.post("/preview")
async def preview(
    body: PreviewIn, request: Request, staff: Staff = Depends(current_staff)
) -> Response:
    """The PDF of a draft, of a document in the request, or of a made-up sale, with PREVIEW
    across it and no number. Nothing is written."""
    given = [body.draft_id is not None, body.document is not None, body.kind is not None]
    if sum(given) != 1:
        raise DocumentError("preview_needs_input", 422)
    async with _db(request).tenant(staff.tenant_id) as conn:
        data = await service.preview_pdf(
            conn, staff, draft_id=body.draft_id,
            body=body.document.model_dump(mode="python") if body.document else None,
            kind=body.kind, layout=body.layout, languages=body.languages,
        )
    return Response(data, media_type="application/pdf", headers=_pdf_headers("preview.pdf"))


def _pdf_headers(filename: str) -> dict:
    return {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    }


# ── the documents ─────────────────────────────────────────────────────────────────────────


@router.get("")
async def list_documents(
    request: Request, kind: Kind | Literal["credit_note"] | None = None,
    status: Literal["draft", "issued", "void"] | None = None,
    q: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
    staff: Staff = Depends(current_staff),
) -> dict:
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await service.list_documents(
            conn, staff, kind=kind, status=status, q=q, limit=limit, offset=offset
        )


@router.post("", status_code=201)
async def create(
    body: CreateIn, request: Request, response: Response, staff: Staff = Depends(current_staff),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """A draft; or, with `issue: true` and an Idempotency-Key, an issued document."""
    data = body.model_dump(mode="python", exclude={"issue"})
    async with _db(request).tenant(staff.tenant_id) as conn:
        if body.issue:
            document, replayed = await service.create_and_issue(
                conn, staff, data, key=idempotency_key
            )
        else:
            document, replayed = await service.create_draft(conn, staff, data), False
    if replayed:
        response.status_code = 200
    return {"document": document, "replayed": replayed}


@router.get("/{doc_id}")
async def get_document(
    doc_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"document": await service.get(conn, staff, doc_id)}


@router.put("/{doc_id}")
async def update(
    doc_id: UUID, body: DraftIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Replace a draft's content. An issued document cannot be changed: issue a credit note."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"document": await service.update_draft(
            conn, staff, doc_id, body.model_dump(mode="python"))}


@router.delete("/{doc_id}")
async def discard(
    doc_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Throw a draft away. Issued documents are never deleted."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        await service.delete_draft(conn, staff, doc_id)
    return {"deleted": True}


@router.post("/{doc_id}/issue")
async def issue(
    doc_id: UUID, request: Request, response: Response, staff: Staff = Depends(current_staff),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """Give a draft its number and its PDF. With the same Idempotency-Key again it answers
    with the document it already issued (200), never a second."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        document, replayed = await service.issue(conn, staff, doc_id, key=idempotency_key)
    return {"document": document, "replayed": replayed}


@router.post("/{doc_id}/credit-note", status_code=201)
async def credit_note(
    doc_id: UUID, body: CreditNoteIn, request: Request, response: Response,
    staff: Staff = Depends(current_staff),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """Cancel an issued invoice or receipt, in whole or part, with a numbered credit note."""
    lines = ([line.model_dump(mode="python") for line in body.lines]
             if body.lines is not None else None)
    async with _db(request).tenant(staff.tenant_id) as conn:
        document, replayed = await service.credit_note(
            conn, staff, doc_id, reason=body.reason, lines=lines, key=idempotency_key
        )
    if replayed:
        response.status_code = 200
    return {"document": document, "replayed": replayed}


@router.get("/{doc_id}/pdf")
async def pdf(doc_id: UUID, request: Request, staff: Staff = Depends(current_staff)) -> Response:
    async with _db(request).tenant(staff.tenant_id) as conn:
        data, row = await service.pdf_of(conn, staff, doc_id)
    return Response(data, media_type="application/pdf",
                    headers={**_pdf_headers(f"{row['number']}.pdf"),
                             "X-Document-Status": row["status"]})


@router.get("/{doc_id}/verify")
async def verify(doc_id: UUID, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Recompute the document's hash from what is stored and compare."""
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await service.verify(conn, doc_id)


@router.get("/{doc_id}/activity")
async def activity(
    doc_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"activity": await service.activity_of(conn, doc_id)}
