"""Bookings: the public booking page's API and the workspace's view.

The public routes need no sign-in: the customer arrives by a link from the chat, and the
tenant comes from the shop's slug in the address, so every query is still scoped.
"""

from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.bookings import service
from alyr.routes.deps import current_staff, current_tenant

public = APIRouter(prefix="/api/book", tags=["booking page"])
router = APIRouter(prefix="/api", tags=["bookings"])

_STATUS_FOR = {"unknown_customer": 404, "unknown_service": 404, "not_free": 409}


class NewBooking(BaseModel):
    contact_id: UUID
    service_id: UUID
    starts_at: datetime
    note: str = Field(default="", max_length=500)


class ServiceChange(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    name_ar: str | None = Field(default=None, max_length=120)
    duration_minutes: int | None = Field(default=None, ge=5, le=600)
    price: int | None = Field(default=None, ge=0, description="In dirhams: 100 is QAR 1")


class NewService(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    name_ar: str = Field(default="", max_length=120)
    duration_minutes: int = Field(ge=5, le=600)
    price: int = Field(default=0, ge=0, description="In dirhams: 100 is QAR 1")


class Active(BaseModel):
    active: bool


class Period(BaseModel):
    weekday: int = Field(ge=0, le=6, description="0 is Sunday, 6 is Saturday")
    opens: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    closes: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class Week(BaseModel):
    periods: list[Period] = Field(max_length=28)


class Outcome(BaseModel):
    status: str


class Move(BaseModel):
    starts_at: datetime


class Assignment(BaseModel):
    user_id: UUID | None = Field(description="A team member, or null for nobody")


def _refuse(error: service.BookingError) -> HTTPException:
    return HTTPException(
        status_code=_STATUS_FOR.get(error.code, 422),
        detail={"code": error.code, "message": str(error)},
    )


def _aware(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise HTTPException(status_code=422, detail="starts_at must include a time zone")
    return moment


async def _shop(request: Request, slug: str):
    async with request.app.state.db.unscoped() as conn:
        shop = await conn.fetchrow(
            "select id, name, name_ar, timezone from tenants where slug = $1", slug
        )
    if shop is None:
        raise HTTPException(status_code=404, detail="shop not found")
    return shop


@public.get("/{slug}")
async def booking_page(slug: str, request: Request, c: UUID | None = None) -> dict:
    shop = await _shop(request, slug)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        services = await service.list_services(conn, only_active=True)
        customer = None
        if c is not None:
            name = await conn.fetchval(
                "select name from contacts where id = $1 and role = 'customer'", c
            )
            if name is not None:
                customer = {"name": name}
    return {
        "shop": {"name": shop["name"], "name_ar": shop["name_ar"],
                 "timezone": shop["timezone"]},
        "services": services, "customer": customer,
    }


@public.get("/{slug}/times")
async def times(slug: str, service_id: UUID, day: date, request: Request) -> dict:
    shop = await _shop(request, slug)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            free = await service.free_times(conn, service_id, day)
    except service.BookingError as error:
        raise _refuse(error) from error
    return {"day": day.isoformat(), "times": [t.isoformat() for t in free]}


@public.post("/{slug}")
async def book(slug: str, body: NewBooking, request: Request) -> dict:
    shop = await _shop(request, slug)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            return await service.create_booking(
                conn, shop["id"], request.app.state.outbound, body.contact_id,
                body.service_id, _aware(body.starts_at), body.note,
            )
    except service.BookingError as error:
        raise _refuse(error) from error


@router.get("/bookings")
async def bookings(
    request: Request, first: date | None = None, last: date | None = None,
    tenant_id: UUID = Depends(current_tenant),
) -> dict:
    """Bookings between two shop-calendar days; by default today and the next week."""
    async with request.app.state.db.tenant(tenant_id) as conn:
        today = await conn.fetchval(
            "select (now() at time zone (select timezone from tenants where id = $1))::date",
            tenant_id,
        )
        first = first or today
        last = last or first + timedelta(days=7)
        return {
            "first": first.isoformat(), "last": last.isoformat(),
            "bookings": await service.list_bookings(conn, first, last),
        }


@router.post("/bookings/{booking_id}/outcome")
async def outcome(
    booking_id: UUID, body: Outcome, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await service.set_outcome(
                conn, booking_id, body.status, team.actor_of(staff)
            )
    except service.BookingError as error:
        raise _refuse(error) from error
    if not found:
        raise HTTPException(status_code=404, detail="booking not found or already finished")
    return {"status": body.status}


@router.post("/bookings/{booking_id}/cancel")
async def cancel(
    booking_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await service.cancel(
            conn, request.app.state.outbound, booking_id, actor=team.actor_of(staff)
        ):
            raise HTTPException(status_code=404, detail="booking not found or already finished")
    return {"status": "cancelled"}


@router.post("/bookings/{booking_id}/move")
async def move(
    booking_id: UUID, body: Move, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await service.reschedule(
                conn, request.app.state.outbound, booking_id, _aware(body.starts_at),
                team.actor_of(staff),
            )
    except service.BookingError as error:
        raise _refuse(error) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail="booking not found") from error


@router.post("/bookings/{booking_id}/assign")
async def assign(
    booking_id: UUID, body: Assignment, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            found = await team.assign(
                conn, "booking", booking_id, body.user_id, team.actor_of(staff)
            )
    except team.TeamError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if not found:
        raise HTTPException(status_code=404, detail="booking not found")
    return {"assigned_to": str(body.user_id) if body.user_id else None}


@router.get("/services")
async def services(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"services": await service.list_services(conn)}


@router.post("/services")
async def add_service(
    body: NewService, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"id": await service.add_service(
            conn, body.name, body.name_ar, body.duration_minutes, body.price
        )}


@router.patch("/services/{service_id}")
async def change_service(
    service_id: UUID, body: ServiceChange, request: Request,
    tenant_id: UUID = Depends(current_tenant),
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        if not await service.update_service(
            conn, service_id, body.name, body.name_ar, body.duration_minutes, body.price
        ):
            raise HTTPException(status_code=404, detail="service not found")
        return {"services": await service.list_services(conn)}


@router.post("/services/{service_id}/active")
async def set_active(
    service_id: UUID, body: Active, request: Request,
    tenant_id: UUID = Depends(current_tenant),
) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        if not await service.set_service_active(conn, service_id, body.active):
            raise HTTPException(status_code=404, detail="service not found")
    return {"active": body.active}


@router.get("/hours")
async def hours(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"periods": await service.hours(conn)}


@router.put("/hours")
async def set_hours(
    body: Week, request: Request, tenant_id: UUID = Depends(current_tenant)
) -> dict:
    try:
        async with request.app.state.db.tenant(tenant_id) as conn:
            await service.set_hours(
                conn, [(p.weekday, p.opens, p.closes) for p in body.periods]
            )
            return {"periods": await service.hours(conn)}
    except service.BookingError as error:
        raise _refuse(error) from error
