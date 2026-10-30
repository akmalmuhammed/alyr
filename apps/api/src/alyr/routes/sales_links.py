"""The back office's side of the sales link (ALY-216, D-105, spec 041): make a lead, change its
plan, send the link, see what came of it, revoke it. ALYR staff only, like the rest of
`routes/admin.py`, and every change is written to the audit log in its own transaction (D-033)."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.core import sales_link
from alyr.core.auth import Staff
from alyr.core.sales_link import SalesLinkError
from alyr.routes.admin import _back_office, platform_admin

router = APIRouter(prefix="/api/admin", tags=["back office"])


class NewLead(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    contact_name: str = Field(min_length=1, max_length=120)
    contact_email: str = Field(min_length=3, max_length=200)
    contact_phone: str = Field(default="", max_length=40)
    note: str = Field(default="", max_length=2000)
    type: str = Field(min_length=2, max_length=40)
    name_ar: str = Field(default="", max_length=120)
    area: str = Field(default="", max_length=80)


class Prospect(BaseModel):
    type: str = Field(min_length=2, max_length=40)
    name_ar: str = Field(default="", max_length=120)
    area: str = Field(default="", max_length=80)


class Send(BaseModel):
    days: Literal[1, 3, 7, 14, 30] = sales_link.DEFAULT_DAYS


def _refused(error: SalesLinkError) -> HTTPException:
    return HTTPException(status_code=409, detail=str(error))


@router.post("/leads")
async def create_lead(
    body: NewLead, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            client_id = await sales_link.create_lead(
                conn, staff, name=body.name, contact_name=body.contact_name,
                contact_email=body.contact_email, contact_phone=body.contact_phone,
                note=body.note, type_key=body.type, name_ar=body.name_ar, area=body.area,
            )
    except SalesLinkError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"id": str(client_id)}


@router.put("/clients/{client_id}/prospect")
async def save_prospect(
    client_id: UUID, body: Prospect, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            await sales_link.save_prospect(
                conn, staff, client_id, body.type, body.name_ar, body.area
            )
    except SalesLinkError as error:
        raise _refused(error) from error
    return {"saved": True}


@router.get("/clients/{client_id}/sales-link")
async def get_link(
    client_id: UUID, request: Request, _: Staff = Depends(platform_admin)
) -> dict:
    async with _back_office(request) as conn:
        return await sales_link.state(conn, client_id)


@router.post("/clients/{client_id}/sales-link")
async def send_link(
    client_id: UUID, body: Send, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            return await sales_link.issue(conn, staff, client_id, body.days)
    except SalesLinkError as error:
        raise _refused(error) from error


@router.delete("/clients/{client_id}/sales-link")
async def revoke_link(
    client_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    try:
        async with _back_office(request) as conn:
            return await sales_link.revoke(conn, staff, client_id)
    except SalesLinkError as error:
        raise _refused(error) from error
