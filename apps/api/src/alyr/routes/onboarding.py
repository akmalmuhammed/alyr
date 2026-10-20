"""Self-serve onboarding at /start (D-031)."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import auth, mail, onboarding, pricing
from alyr.core.auth import Staff
from alyr.routes.deps import current_staff

log = logging.getLogger("alyr.onboarding")
router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


class Email(BaseModel):
    email: str = Field(min_length=3, max_length=200)


class EmailCode(Email):
    code: str = Field(min_length=4, max_length=12)


class NewBusiness(BaseModel):
    signup_token: str = Field(min_length=10, max_length=200)
    owner_name: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    name_ar: str = Field(default="", max_length=120)
    type: str = Field(min_length=2, max_length=40)
    area: str = Field(default="", max_length=80)


class Change(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    name_ar: str | None = Field(default=None, max_length=120)
    area: str | None = Field(default=None, max_length=80)
    step: str | None = Field(default=None, max_length=40)
    reminders: bool | None = None


class Acceptance(BaseModel):
    quote_id: UUID


class TestMessage(BaseModel):
    text: str = Field(default="", max_length=1000)
    reply_id: str = Field(default="", max_length=120)


def signup_open() -> bool:
    settings = get_settings()
    return settings.signup_open if settings.signup_open is not None else settings.env == "local"


def _cookie(response: Response, token: str) -> None:
    response.set_cookie(
        auth.COOKIE, token, max_age=auth.SESSION_DAYS * 86400, httponly=True,
        samesite="lax", secure=get_settings().env != "local", path="/",
    )


@router.get("/types")
async def types(request: Request) -> dict:
    async with request.app.state.db.unscoped() as conn:
        return {"types": await onboarding.types(conn), "signup_open": signup_open()}


@router.post("/code")
async def send_code(body: Email, request: Request) -> dict:
    """Like sign-in, but a new address gets a code too when sign-up is open. The answer
    is the same either way."""
    settings = get_settings()
    try:
        code = await auth.request_code(request.app.state.db, body.email, allow_new=signup_open())
    except auth.TooManyCodes as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    answer: dict = {"sent": True, "signup_open": signup_open()}
    if code is not None and mail.configured():
        subject, text, html = mail.sign_in_message(code, auth.CODE_MINUTES)
        try:
            await mail.send(auth.clean_email(body.email), subject, text, html)
        except mail.MailError as error:
            raise HTTPException(
                status_code=503, detail="the code could not be emailed; try again in a minute"
            ) from error
    if settings.env == "local":
        answer["dev_code"] = code
    elif code is not None and not mail.configured():
        log.error("a sign-up code was created but no email provider is configured")
        raise HTTPException(status_code=503, detail="codes cannot be delivered yet")
    return answer


@router.post("/verify")
async def verify(body: EmailCode, request: Request, response: Response) -> dict:
    """A known owner is signed in. A new address gets a token to create a business."""
    db = request.app.state.db
    try:
        await auth.check_code(db, body.email, body.code)
    except auth.AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    session = await auth.session_for(db, body.email)
    if session is not None:
        _cookie(response, session)
        return {"status": "signed_in"}
    if not signup_open():
        raise HTTPException(status_code=403, detail="sign-up is not open yet")
    return {"status": "new", "signup_token": await onboarding.issue_signup_token(db, body.email)}


@router.post("/business")
async def create_business(body: NewBusiness, request: Request, response: Response) -> dict:
    if not signup_open():
        raise HTTPException(status_code=403, detail="sign-up is not open yet")
    try:
        tenant_id, session = await onboarding.create_business(
            request.app.state.db, body.signup_token, body.owner_name, body.name,
            body.name_ar, body.type, body.area,
        )
    except auth.AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    except onboarding.OnboardingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    _cookie(response, session)
    return {"created": str(tenant_id)}


def _owner(staff: Staff) -> Staff:
    if staff.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="only the owner sets up the business")
    return staff


@router.get("/state")
async def state(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await onboarding.state(conn, staff)


@router.patch("/state")
async def change(body: Change, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    _owner(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await onboarding.update(
                conn, name=body.name, name_ar=body.name_ar, area=body.area, step=body.step,
                reminders=body.reminders,
            )
            return await onboarding.state(conn, staff)
    except onboarding.OnboardingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/quote")
async def quote(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The owner's price as ALYR prepared it (D-032). The plan step asks again every few
    seconds, so a change ALYR publishes shows up while the owner is looking."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await pricing.own_quote(conn)


@router.post("/quote/accept")
async def accept_quote(
    body: Acceptance, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _owner(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        if not await pricing.accept(conn, body.quote_id, staff.user_id, staff.name):
            raise HTTPException(
                status_code=409, detail="this price has changed; look at the new one"
            )
        return await pricing.own_quote(conn)


@router.post("/finish")
async def finish(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    _owner(staff)
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        cleared = await onboarding.end_test(conn, staff)
        await onboarding.update(conn, step="", finished=True)
    return {"finished": True, "test_bookings_cancelled": cleared}


class TestDocument(BaseModel):
    document_id: UUID
    lang: str = Field(default="en", pattern="^(en|ar)$")


@router.post("/test-send")
async def test_send_document(
    body: TestDocument, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Send the first invoice to the owner's private test customer ("Invoices only", ALY-141),
    and answer with the test chat as it is now (the message arrives a moment later)."""
    _owner(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            sent = await onboarding.test_send_document(conn, staff, body.document_id, body.lang)
            return {"delivery": sent,
                    "messages": await onboarding.test_conversation(conn, staff)}
    except onboarding.OnboardingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.get("/test-chat")
async def test_chat(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"messages": await onboarding.test_conversation(conn, staff)}


@router.post("/test-chat")
async def test_send(
    body: TestMessage, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    if not (body.text.strip() or body.reply_id):
        raise HTTPException(status_code=422, detail="write a message")
    try:
        await onboarding.test_send(
            request.app.state.db, request.app.state.inbound, staff, body.text, body.reply_id
        )
    except onboarding.OnboardingError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"messages": await onboarding.test_conversation(conn, staff)}
