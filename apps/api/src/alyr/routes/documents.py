"""Documents in the workspace: receipts, invoices, quotes and the rest (ALY-138, spec 011).

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

from alyr.core import mail, team
from alyr.core.auth import Staff
from alyr.core.team import actor_of
from alyr.modules.documents import (
    access,
    delivery,
    kinds,
    listing,
    lookup,
    money,
    payments,
    sales,
    service,
)
from alyr.modules.documents import settings as doc_settings
from alyr.modules.documents.errors import DocumentError
from alyr.modules.documents.render import raster
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
Shape = Literal["pdf", "png"]


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
    # What happens on its own (ALY-139).
    auto_receipt_on_payment: bool | None = None
    auto_invoice_credit_sales: bool | None = None
    auto_deposit_receipt: bool | None = None
    auto_send_whatsapp: bool | None = None
    auto_send_email: bool | None = None
    send_mode: Literal["automatic", "manual"] | None = None
    agents_may_record_payments: bool | None = None


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


class PaymentRecordIn(Strict):
    """Money the shop took itself (ALY-139): which order, booking, invoice or customer balance
    it was for, how much, how, and a reference such as a cheque number."""
    subject: Literal["order", "booking", "invoice", "credit"]
    id: UUID = Field(description="The order's, booking's, invoice's or customer's ID")
    amount_minor: Annotated[StrictInt, Field(gt=0, le=money.MAX_MINOR)] | None = Field(
        default=None, description="Leave out to pay what is owed in full")
    method: Literal["cash", "bank_transfer", "cheque", "card_terminal"]
    reference: str = Field(default="", max_length=80)
    receipt: bool | None = Field(
        default=None, description="Make the receipt (true), do not (false), or follow the "
        "shop's settings (leave out)")
    send: bool | None = Field(
        default=None, description="Send the receipt (true), do not (false), or follow the "
        "shop's settings (leave out)")


class FromSaleIn(Strict):
    kind: Literal["invoice", "receipt"] = "invoice"
    send: bool | None = None


class SendIn(Strict):
    channels: list[Literal["whatsapp", "email"]] | None = Field(
        default=None, description="Leave out to send by every way that has somewhere to go")
    phone: str | None = Field(
        default=None, max_length=40, description="Another number (owners and admins)")
    email: str | None = Field(
        default=None, max_length=120, description="Another address (owners and admins)")
    language: Literal["ar", "en"] | None = None


class CancelIn(Strict):
    reason: str = Field(min_length=3, max_length=300)
    notify: bool = Field(default=False, description="Send the credit note to the customer")


class CustomerEmailIn(Strict):
    email: str | None = Field(max_length=120, description="null to remove it")


class PreviewIn(Strict):
    draft_id: UUID | None = None
    document: DraftIn | None = None
    kind: Kind | Literal["credit_note"] | None = Field(
        default=None, description="With neither a draft nor a document: a sample of this kind"
    )
    layout: Layout | None = None
    languages: Languages | None = None
    settings: SettingsIn | None = Field(
        default=None, description="Settings typed and not saved yet, tried out on the page "
        "(owners and admins). Nothing is stored.")


def _db(request: Request):
    return request.app.state.db


def _settings_public(row: dict) -> dict:
    return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}


# ── what the screens need to know ─────────────────────────────────────────────────────────


@router.get("/meta")
async def meta(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with _db(request).tenant(staff.tenant_id) as conn:
        allowed = await access.view(conn, staff)
        shop = await doc_settings.get(conn)
    return {
        # What the draft form starts from. Nothing here is secret or the owner's alone: the bank
        # details, the registration number's text and the rest of the settings are not.
        "defaults": {
            "currency": shop["currency"], "tax_enabled": shop["tax_enabled"],
            "tax_rate_bp": shop["tax_rate_bp"], "cash_rounding_minor": shop["cash_rounding_minor"],
            "languages": shop["languages"], "default_audience": shop["default_audience"],
            "layout": shop["layout"], "show_sku": shop["show_sku"],
            "has_registration": bool(shop["commercial_registration"]),
            "show_alyr_mark": shop["show_alyr_mark"],
        },
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


@router.get("/settings/activity")
async def settings_activity(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The last changes to the document settings: who, when, which settings. (Declared before
    `/settings/{which}`, which would otherwise take "activity" for a picture.)"""
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"changes": await doc_settings.recent_changes(conn)}


@router.get("/settings/{which}")
async def get_image(
    which: Literal["logo", "stamp"], request: Request, staff: Staff = Depends(current_staff)
) -> Response:
    """The shop's logo or its signature or stamp picture, as saved, for the settings screen to
    show. Owners and admins."""
    access.require_manager(staff)
    async with _db(request).tenant(staff.tenant_id) as conn:
        logo, stamp = await doc_settings.images_of(conn)
    data = logo if which == "logo" else stamp
    if data is None:
        raise DocumentError("not_found", 404)
    return Response(bytes(data), media_type="image/png", headers={
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


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
    body: PreviewIn, request: Request, staff: Staff = Depends(current_staff),
    shape: Annotated[Shape, Query(alias="format")] = "pdf",
    page: int = Query(default=1, ge=1, le=50),
    width: int = Query(default=raster.DEFAULT_WIDTH, ge=raster.MIN_WIDTH, le=raster.MAX_WIDTH),
) -> Response:
    """The PDF of a draft, of a document in the request, or of a made-up sale, with PREVIEW
    across it and no number. Nothing is written."""
    given = [body.draft_id is not None, body.document is not None, body.kind is not None]
    if sum(given) != 1:
        raise DocumentError("preview_needs_input", 422)
    override = None
    if body.settings is not None:
        access.require_manager(staff)  # the settings are the owner's and an admin's
        override = body.settings.model_dump(exclude_unset=True)
        for name in ("terms", "notes"):
            if override.get(name) is not None:
                override[name] = {k: dict(v) for k, v in override[name].items()}
        override = {k: v for k, v in override.items() if v is not None or k == "brand_color"}
    async with _db(request).tenant(staff.tenant_id) as conn:
        data = await service.preview_pdf(
            conn, staff, draft_id=body.draft_id,
            body=body.document.model_dump(mode="python") if body.document else None,
            kind=body.kind, layout=body.layout, languages=body.languages, override=override,
        )
    return await _as_asked(data, _pdf_headers("preview.pdf"), shape, page, width)


def _pdf_headers(filename: str) -> dict:
    return {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    }




async def _as_asked(
    data: bytes, headers: dict, shape: Shape, page: int, width: int
) -> Response:
    """The PDF as it is, or one page of it as a picture (`shape=png`, the screens' way to show
    a document inside a page on a phone). The page count travels in `X-Page-Count`."""
    if shape == "pdf":
        return Response(data, media_type="application/pdf", headers=headers)
    png, count = await asyncio.to_thread(raster.png_of, data, page, width)
    picture = {k: v for k, v in headers.items() if k != "Content-Disposition"}
    return Response(png, media_type="image/png", headers={**picture, "X-Page-Count": str(count)})


# ── the documents ─────────────────────────────────────────────────────────────────────────


@router.get("")
async def list_documents(
    request: Request, kind: Kind | Literal["credit_note"] | None = None,
    status: Literal["draft", "issued", "void", "cancelled"] | None = None,
    payment: str | None = Query(
        default=None, max_length=40,
        description="Comma-separated: paid, part, unpaid (issued papers that take payment)"),
    delivery_state: Literal["none", "queued", "sent", "delivered", "not_delivered"] | None = Query(
        default=None, alias="delivery"),
    branch: str | None = Query(default=None, pattern="^[a-z0-9]{1,12}$"),
    date_from: date | None = None, date_to: date | None = None,
    q: str | None = Query(default=None, max_length=80),
    show: Literal["unpaid_invoices", "not_delivered"] | None = Query(
        default=None, description="The filter a home-screen card opens"),
    limit: int = Query(default=listing.PAGE, ge=1, le=listing.MAX_PAGE),
    cursor: str | None = Query(default=None, max_length=120),
    offset: int = Query(default=0, ge=0),
    totals: bool = True,
    staff: Staff = Depends(current_staff),
) -> dict:
    """Newest first, by cursor (`next_cursor` from the page before). `totals` (the count and the
    money in the whole filtered list) is worked out once, with the first page."""
    filters = (listing.Filters.preset(show) if show else listing.Filters(
        kind=kind, status=status, delivery=delivery_state, branch=branch,
        payment=[p for p in (payment or "").split(",") if p],
        date_from=date_from, date_to=date_to))
    filters.q = q or ""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await listing.page(
            conn, staff, filters, limit=limit, cursor=cursor, offset=offset,
            with_totals=totals and not cursor)


@router.get("/counts")
async def counts(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The numbers on the home screen, each the size of the list its card opens."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"counts": await listing.counts(conn, staff)}


@router.get("/customers")
async def find_customers(
    request: Request, q: str = Query(default="", max_length=60),
    staff: Staff = Depends(current_staff),
) -> dict:
    """The shop's customers, for the draft's customer picker."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"customers": await lookup.customers(conn, q)}


@router.get("/catalog-lines")
async def find_catalog_lines(
    request: Request, q: str = Query(default="", max_length=60), contact_id: UUID | None = None,
    staff: Staff = Depends(current_staff),
) -> dict:
    """Lines to add from the Catalog (by name, item code or SKU), priced for the customer's
    price group when `contact_id` is given."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"lines": await lookup.catalog_lines(conn, q, contact_id)}




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
        document = await service.get(conn, staff, doc_id)
        document["delivery"] = delivery.summary_of(
            (await delivery.summaries(conn, [doc_id])).get(str(doc_id)))
    return {"document": document}


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
async def pdf(
    doc_id: UUID, request: Request, layout: Layout | None = None,
    download: bool = False, staff: Staff = Depends(current_staff),
    shape: Annotated[Shape, Query(alias="format")] = "pdf",
    page: int = Query(default=1, ge=1, le=50),
    width: int = Query(default=raster.DEFAULT_WIDTH, ge=raster.MIN_WIDTH, le=raster.MAX_WIDTH),
) -> Response:
    """The stored PDF. With `layout` other than the one it was issued in, a copy of the same
    content on that page size, to print (never stored; the issued PDF stays as it was). With
    `format=png`, one page of it as a picture (`page`, `width`; the count is in
    `X-Page-Count`), which is how the screens show it on a phone."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        data, row = await service.pdf_of(conn, staff, doc_id, layout=layout)
    headers = {**_pdf_headers(f"{row['number']}.pdf"), "X-Document-Status": row["status"]}
    if layout and layout != row["layout"]:
        headers["X-Document-Layout"] = layout
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{row["number"]}.pdf"'
    return await _as_asked(data, headers, shape, page, width)


@router.post("/{doc_id}/link")
async def share_link(
    doc_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """A link to the hosted page of an issued document, to copy and send by hand. The same
    kind of signed link a send carries; each one made is on the record."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await delivery.share_link(conn, staff, doc_id)


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


# ── from the shop's own sales, payments by hand, and delivery (ALY-139) ───────────────────


@router.post("/payments", status_code=201)
async def record_payment(
    body: PaymentRecordIn, request: Request, response: Response,
    staff: Staff = Depends(current_staff),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """Mark an order, booking, invoice or customer balance as paid by cash, bank transfer,
    cheque or card terminal, with a reference. It makes the receipt (or a deposit receipt for a
    part-payment on a booking) unless the shop has that switched off or `receipt` is false.
    Owners and admins; an agent only when the shop allows it. An `Idempotency-Key` is required:
    the same request again returns the same payment and receipt, never a second."""
    if idempotency_key is None:
        raise DocumentError("key_needed", 400)
    async with _db(request).tenant(staff.tenant_id) as conn:
        done = await payments.record(
            conn, staff, subject=body.subject, subject_id=body.id, amount_minor=body.amount_minor,
            method=body.method, reference=body.reference, key=idempotency_key,
            receipt=body.receipt, send=body.send,
        )
    if done["replayed"]:
        response.status_code = 200
    return done


@router.post("/payments/{payment_id}/receipt")
async def receipt_for_payment(
    payment_id: UUID, request: Request, send: bool | None = None,
    staff: Staff = Depends(current_staff),
) -> dict:
    """The receipt of a payment that was recorded without one. Asking again returns it."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await payments.receipt_of_payment(conn, staff, payment_id, send)


@router.post("/from/order/{order_id}", status_code=201)
async def document_from_order(
    order_id: UUID, body: FromSaleIn, request: Request, response: Response,
    staff: Staff = Depends(current_staff),
) -> dict:
    """An invoice for any order, or a receipt for a paid one, on request. The same document
    the automatic hook made, if it did: asking again returns it (`replayed`)."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        document, replayed = await sales.from_order(conn, staff, order_id, body.kind, body.send)
    if replayed:
        response.status_code = 200
    return {"document": document, "replayed": replayed}


@router.post("/from/booking/{booking_id}", status_code=201)
async def document_from_booking(
    booking_id: UUID, body: FromSaleIn, request: Request, response: Response,
    staff: Staff = Depends(current_staff),
) -> dict:
    """An invoice for a booking, on request, at the service's price with what has been
    recorded as paid so far."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        document, replayed = await sales.from_booking(
            conn, staff, booking_id, body.kind, body.send)
    if replayed:
        response.status_code = 200
    return {"document": document, "replayed": replayed}


@router.post("/{doc_id}/send")
async def send_document(
    doc_id: UUID, body: SendIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Send an issued document to its customer, or again, or (owners and admins) to another
    number or address. WhatsApp inside the 24-hour window as a PDF, outside it through the
    approved template; email when there is an address. Every press is on the record."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        made = await delivery.send(
            conn, staff, doc_id, channels=body.channels, phone=body.phone, email=body.email,
            language=body.language)
    return {"deliveries": made}


@router.get("/{doc_id}/deliveries")
async def deliveries(
    doc_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Who it was sent to, by which way, and whether it arrived."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        await service.get(conn, staff, doc_id)  # a document you may not see has no deliveries
        found = await delivery.deliveries_of(conn, doc_id)
    return {"deliveries": found, "summary": delivery.summary_of(
        {"state": delivery.overall([d["state"] for d in found]), "count": len(found),
         "last": found[0]} if found else None)}


@router.post("/{doc_id}/cancel", status_code=201)
async def cancel_document(
    doc_id: UUID, body: CancelIn, request: Request, response: Response,
    staff: Staff = Depends(current_staff),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    """Cancel an issued document with a reason: a numbered credit note for all of it, linked to
    it; the document stays, marked void, and is never deleted. Owners and admins. With
    `notify`, the credit note is sent to the customer by the shop's channels."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        note, replayed = await service.credit_note(
            conn, staff, doc_id, reason=body.reason, key=idempotency_key)
        if not replayed:
            row = await conn.fetchrow("select contact_id from documents where id = $1", doc_id)
            await delivery.queue_auto(
                conn, note, row["contact_id"], send=True if body.notify else False,
                actor=actor_of(staff))
        original = await service.get(conn, staff, doc_id)
    if replayed:
        response.status_code = 200
    return {"credit_note": note, "document": original, "replayed": replayed}


@router.put("/customers/{contact_id}/email")
async def set_customer_email(
    contact_id: UUID, body: CustomerEmailIn, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    """Put a customer's email address on file (or take it off), so their documents can be
    emailed. Owners and admins. Reserved example addresses are refused."""
    access.require_manager(staff)
    address = (body.email or "").strip() or None
    if address is not None and not mail.deliverable(address):
        raise DocumentError("email_invalid", field="email")
    async with _db(request).tenant(staff.tenant_id) as conn:
        updated = await conn.fetchval(
            "update contacts set email = $2 where id = $1 and role = 'customer' returning id",
            contact_id, address)
        if updated is None:
            raise DocumentError("source_not_found", 404)
        await team.record(conn, "conversation", contact_id, "email_changed", actor_of(staff),
                          contact_id, {"removed": address is None})
    return {"contact_id": str(contact_id), "has_email": address is not None}
