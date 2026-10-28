"""Bookings: the public booking page's API and the workspace's view.

The public routes need no sign-in: the customer arrives by a link from the chat, and the
tenant comes from the shop's slug in the address, so every query is still scoped.

Two kinds of link open the booking page, as on the order page (`routes/store.py`):

* **Public** (`/b/<slug>`): anyone can open it and look at the services and the free times.
  It carries no customer and cannot book; a customer who wants to book is sent to the shop's
  WhatsApp to get a link of their own.
* **One customer's**: `?t=<token>` made for booking (`core/links.py`), signed over the shop,
  the customer and the purpose, and sent by the page in the header `X-Order-Link`. It lets
  that customer book. A token made for the order page is refused here, and a bare contact
  ID in the address or in a request identifies nobody (ALY-133).
"""

from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from alyr.core import links, team
from alyr.core.auth import Staff
from alyr.modules.bookings import service
from alyr.routes import customer_link
from alyr.routes.deps import current_staff, current_tenant

public = APIRouter(prefix="/api/book", tags=["booking page"])
router = APIRouter(prefix="/api", tags=["bookings"])

_STATUS_FOR = {
    "unknown_customer": 404, "unknown_service": 404, "not_free": 409,
    "unknown_resource": 404, "last_resource": 409,
}


class NewBooking(BaseModel):
    # The customer's own booking link token, never a contact ID. A missing one is refused
    # with the same words as a bad one.
    token: str | None = Field(
        default=None, max_length=200,
        description="The customer's own booking link token (`?t=` in their booking link)",
    )
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


class NewResource(BaseModel):
    name: str = Field(min_length=1, max_length=120, description="A chair, a person or a room")
    name_ar: str = Field(default="", max_length=120)


class ResourceChange(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    name_ar: str | None = Field(default=None, max_length=120)


class ServiceResources(BaseModel):
    resource_ids: list[UUID] = Field(
        max_length=50, description="The resources that do this service; empty means all"
    )


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
async def booking_page(
    slug: str, request: Request, response: Response,
    t: str | None = Query(default=None, max_length=200),
    x_order_link: str | None = Header(default=None, max_length=200),
) -> dict:
    """The booking page: the shop, its services, and the customer if the link is theirs.
    `link` says whether the link was good, expired or not valid, with the words for it."""
    customer_link.keep_private(response)
    shop = await _shop(request, slug)
    link, state = customer_link.state(x_order_link or t, shop["id"], links.BOOKING)
    async with request.app.state.db.tenant(shop["id"]) as conn:
        services = await service.list_services(conn, only_active=True)
        customer = None
        if link is not None:
            who = await conn.fetchrow(
                "select name, lang from contacts where id = $1 and role = 'customer'",
                link.contact_id,
            )
            if who is not None:
                customer = {"name": who["name"], "lang": who["lang"]}
            else:
                state = "invalid"  # a link whose customer is gone
        # So a customer who cannot book here can be sent to the shop's chat.
        whatsapp = await conn.fetchval("select whatsapp_number from shop_settings") or ""
    return {
        "shop": {"name": shop["name"], "name_ar": shop["name_ar"],
                 "timezone": shop["timezone"], "whatsapp": whatsapp},
        "services": services, "customer": customer,
        "link": customer_link.view(state, links.BOOKING),
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
    # Who is booking comes from the signed link and from nothing else in the request.
    link = customer_link.require(body.token, shop["id"], links.BOOKING, required=True)
    try:
        async with request.app.state.db.tenant(shop["id"]) as conn:
            return await service.create_booking(
                conn, shop["id"], request.app.state.outbound, link.contact_id,
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


def _managers_only(staff: Staff) -> None:
    """Chairs and who does what are the owner's or an admin's to change (D-062)."""
    if staff.role == "agent":
        raise HTTPException(status_code=403, detail="only an owner or admin can change this")


@router.get("/resources")
async def resources(request: Request, tenant_id: UUID = Depends(current_tenant)) -> dict:
    """The shop's chairs, people or rooms. Empty means the shop takes one customer at a time."""
    async with request.app.state.db.tenant(tenant_id) as conn:
        return {"resources": await service.list_resources(conn)}


@router.post("/resources")
async def add_resource(
    body: NewResource, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _managers_only(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        resource_id = await service.add_resource(conn, body.name, body.name_ar)
        return {"id": resource_id, "resources": await service.list_resources(conn)}


@router.patch("/resources/{resource_id}")
async def change_resource(
    resource_id: UUID, body: ResourceChange, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    _managers_only(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await service.update_resource(conn, resource_id, body.name, body.name_ar):
            raise HTTPException(status_code=404, detail="resource not found")
        return {"resources": await service.list_resources(conn)}


@router.post("/resources/{resource_id}/active")
async def set_resource_active(
    resource_id: UUID, body: Active, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _managers_only(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if not await service.set_resource_active(conn, resource_id, body.active):
                raise HTTPException(status_code=404, detail="resource not found")
    except service.BookingError as error:
        raise _refuse(error) from error
    return {"active": body.active}


@router.put("/services/{service_id}/resources")
async def set_service_resources(
    service_id: UUID, body: ServiceResources, request: Request,
    staff: Staff = Depends(current_staff),
) -> dict:
    """Say which resources do this service. An empty list means all of them."""
    _managers_only(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if not await service.set_service_resources(conn, service_id, body.resource_ids):
                raise HTTPException(status_code=404, detail="service not found")
            return {"resources": await service.list_resources(conn)}
    except service.BookingError as error:
        raise _refuse(error) from error


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
