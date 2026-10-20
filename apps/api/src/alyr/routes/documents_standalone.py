"""What a shop that only invoices uses beyond the engine's own routes (ALY-141, spec 016):
saved lines, the shop's customers as a book of their own, and the one-line box.

Behind `require_module("documents")` like the rest of `/api/documents`; included before it
(`main.py`) so that `/api/documents/saved-lines` is not taken for a document's ID. Who may do
what: anyone on the team may use and save lines and look up, add and change customers (drafting
is for everyone, `access.py`); a customer's balance and documents, and saying a customer asked to
be sent documents on WhatsApp, are for owners and admins.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from alyr.core.auth import Staff
from alyr.modules.documents import customers, money, saved_lines, standalone
from alyr.modules.documents.errors import DocumentError
from alyr.modules.documents.kinds import UNITS
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/documents", tags=["documents: standalone"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SavedLineIn(Strict):
    name: str = Field(default="", max_length=300)
    name_ar: str = Field(default="", max_length=300)
    unit: str = Field(default="piece", max_length=20)
    price_minor: Annotated[StrictInt, Field(ge=0, le=money.MAX_MINOR)] = 0


class UsedIn(Strict):
    ids: list[UUID] = Field(max_length=60)


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
    whatsapp_ok: bool = Field(
        default=False,
        description="The owner says this customer asked to be sent documents on WhatsApp")


class QuickIn(Strict):
    text: str = Field(max_length=500)


def _db(request: Request):
    return request.app.state.db


# ── saved lines ──────────────────────────────────────────────────────────────────────────


@router.get("/saved-lines")
async def list_saved_lines(
    request: Request, q: str = Query(default="", max_length=60),
    limit: int = Query(default=saved_lines.LIMIT, ge=1, le=200),
    staff: Staff = Depends(current_staff),
) -> dict:
    """The shop's saved lines, the most used first; `q` narrows them by what is typed."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"lines": await saved_lines.listing(conn, q, limit)}


@router.post("/saved-lines", status_code=201)
async def save_line(
    body: SavedLineIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Save a line for next time. Saving the same words again updates the one that is there."""
    if body.unit not in UNITS:
        raise DocumentError("quantity_invalid", field="unit")
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"line": await saved_lines.save(conn, staff, body.model_dump())}


@router.post("/saved-lines/used")
async def lines_used(
    body: UsedIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """These lines went on a document: they come earlier next time."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"used": await saved_lines.used(conn, body.ids)}


@router.put("/saved-lines/{line_id}")
async def change_line(
    line_id: UUID, body: SavedLineIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    if body.unit not in UNITS:
        raise DocumentError("quantity_invalid", field="unit")
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"line": await saved_lines.save(conn, staff, body.model_dump(), line_id)}


@router.delete("/saved-lines/{line_id}")
async def remove_line(
    line_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with _db(request).tenant(staff.tenant_id) as conn:
        await saved_lines.archive(conn, line_id)
    return {"removed": True}


# ── the shop's customers ─────────────────────────────────────────────────────────────────


@router.get("/customers/all")
async def customer_book(
    request: Request, q: str = Query(default="", max_length=60),
    limit: int = Query(default=customers.PAGE, ge=1, le=customers.MAX_PAGE),
    offset: int = Query(default=0, ge=0, le=100_000), owing: bool = False,
    staff: Staff = Depends(current_staff),
) -> dict:
    """The customers screen: everyone the shop has, by name, with how many documents each has
    and what they owe (owners and admins). `owing` keeps those who owe something."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await customers.listing_of(conn, staff, q, limit, offset, owing)


@router.get("/customers/{contact_id}")
async def customer(
    contact_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"customer": await customers.find(conn, staff, contact_id)}


@router.post("/customers", status_code=201)
async def add_customer(
    body: CustomerIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Add a customer. A phone number the shop already knows from its chat is the same person:
    they are filled in, not made twice."""
    fields = body.model_dump(exclude={"whatsapp_ok"})
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"customer": await customers.save(conn, staff, fields,
                                                 whatsapp_ok=body.whatsapp_ok)}


@router.put("/customers/{contact_id}")
async def change_customer(
    contact_id: UUID, body: CustomerIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    fields = body.model_dump(exclude={"whatsapp_ok"})
    async with _db(request).tenant(staff.tenant_id) as conn:
        return {"customer": await customers.save(conn, staff, fields, contact_id,
                                                 whatsapp_ok=body.whatsapp_ok)}


# ── the one-line box ─────────────────────────────────────────────────────────────────────


@router.post("/quick")
async def read_quick(
    body: QuickIn, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Read "AC repair 500 for Ahmed 5551 2345" (or "invoice for AC repair, QAR 500, to Ahmed")
    as the draft it asks for, and say which of the shop's customers it names. Makes nothing."""
    async with _db(request).tenant(staff.tenant_id) as conn:
        return await standalone.read_quick(conn, body.text)
