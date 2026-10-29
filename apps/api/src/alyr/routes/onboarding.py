"""Self-serve onboarding at /start (D-031)."""

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import (
    access,
    auth,
    links,
    mail,
    onboarding,
    pricing,
    ratelimit,
    readiness,
    terms,
    whatsapp_setup,
)
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
    # The versions of the terms and the privacy notice the owner ticked, as the sign-up screen
    # listed them (GET /terms/current); every current one is needed (ALY-167).
    accepted_terms: list[UUID] = Field(default_factory=list, max_length=10)
    # The language of the screen the owner filled this in on (ALY-171).
    lang: Literal["en", "ar"] = "en"


class TermsAcceptance(BaseModel):
    version_ids: list[UUID] = Field(min_length=1, max_length=10)


class Change(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    name_ar: str | None = Field(default=None, max_length=120)
    area: str | None = Field(default=None, max_length=80)
    step: str | None = Field(default=None, max_length=40)
    reminders: bool | None = None
    # The language the owner reads, and whether to email them to finish setting up (ALY-171).
    lang: Literal["en", "ar"] | None = None
    resume_reminders: bool | None = None


class ResumeStop(BaseModel):
    slug: str = Field(min_length=1, max_length=60)
    token: str = Field(min_length=10, max_length=300)


class Acceptance(BaseModel):
    quote_id: UUID


class StepChange(BaseModel):
    # Hand the step to ALYR, or take it back.
    owner: str | None = Field(default=None, max_length=10)
    # How the business wants to do a step that has choices (WhatsApp, payments).
    choice: str | None = Field(default=None, max_length=40)


class WhatsappSetup(BaseModel):
    # The way, as on the go-live list; then the number and what is ready (ALY-217).
    way: str | None = Field(default=None, max_length=40)
    phone: str | None = Field(default=None, max_length=30)
    display_name: str | None = Field(default=None, max_length=80)
    ready: list[str] | None = Field(default=None, max_length=10)


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


@router.get("/terms/current")
async def current_terms(request: Request) -> dict:
    """What a new owner is asked to accept, before they have a business."""
    async with request.app.state.db.unscoped() as conn:
        return {"current": await terms.current(conn)}


@router.post("/code")
async def send_code(body: Email, request: Request) -> dict:
    """Like sign-in, but a new address gets a code too when sign-up is open. The answer
    is the same either way."""
    settings = get_settings()
    await ratelimit.check(request, "code-address", ratelimit.CODES_PER_ADDRESS)
    try:
        code = await auth.request_code(request.app.state.db, body.email, allow_new=signup_open())
    except auth.TooManyCodes as error:
        raise HTTPException(
            status_code=429, detail=str(error), headers={"Retry-After": str(error.retry_after)}
        ) from error
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
    await ratelimit.check(request, "guess-address", ratelimit.GUESSES_PER_ADDRESS)
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
    await ratelimit.check(request, "signup-address", ratelimit.SIGNUPS_PER_ADDRESS)
    try:
        tenant_id, session = await onboarding.create_business(
            request.app.state.db, body.signup_token, body.owner_name, body.name,
            body.name_ar, body.type, body.area, body.accepted_terms,
            ratelimit.client_address(request), request.headers.get("user-agent", ""),
            body.lang,
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


@router.post("/resume/stop")
async def stop_resume(body: ResumeStop, request: Request) -> dict:
    """Switch the reminder emails off, from the link at the foot of one. No sign-in: the link is
    signed for this business and can do nothing else."""
    await ratelimit.check(request, "resume-stop", ratelimit.STOPS_PER_ADDRESS)
    db = request.app.state.db
    async with db.unscoped() as conn:
        tenant_id = await conn.fetchval("select id from tenants where slug = $1", body.slug)
        try:
            if tenant_id is None:
                raise links.LinkError("malformed")
            link = links.read(body.token, tenant_id, purpose=links.RESUME)
            if link.subject_id != tenant_id:
                raise links.LinkError("bad_signature")
        except links.LinkError as error:
            raise HTTPException(status_code=400, detail="this link does not work") from error
        await conn.fetchval("select stop_resume_reminders($1)", tenant_id)
    return {"stopped": True}


@router.get("/terms")
async def my_terms(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """The terms and the privacy notice in force, and which the business has not accepted."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await terms.state(conn)


@router.post("/terms/accept")
async def accept_terms(
    body: TermsAcceptance, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The owner accepts the current versions, again after a new one is published."""
    _owner(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await terms.accept(
                conn, body.version_ids, staff.user_id, staff.name,
                ratelimit.client_address(request), request.headers.get("user-agent", ""),
            )
            return await terms.state(conn)
    except terms.TermsError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


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
                reminders=body.reminders, lang=body.lang,
                resume_reminders=body.resume_reminders,
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
        # Checked first: the test booking or order it cancels still proves the owner tried it.
        await readiness.run(conn, staff.name)
        cleared = await onboarding.end_test(conn, staff)
        orders_cleared = await onboarding.end_test_orders(
            conn, staff, request.app.state.outbound
        )
        await onboarding.update(conn, step="", finished=True)
    return {
        "finished": True, "test_bookings_cancelled": cleared,
        "test_orders_cancelled": orders_cleared,
    }


@router.get("/readiness")
async def get_readiness(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Is the business ready to go live, and what is left (ALY-165). The same answer the
    go-live step, the workspace and the back office show."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await readiness.run(conn, staff.name)


@router.patch("/steps/{key}")
async def change_step(
    key: str, body: StepChange, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The owner hands a step to ALYR (or takes it back), or chooses how to do it."""
    _owner(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if body.owner is not None:
                await readiness.set_owner(conn, key, body.owner, staff.name, False)
            if body.choice is not None:
                await readiness.set_choice(conn, key, body.choice, staff.name, False)
            return await readiness.run(conn, staff.name)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except readiness.ReadinessError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/payment")
async def payment(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """What opens the workspace (ALY-212, D-051): the amount due, what was paid, how to pay,
    and whether the products are open."""
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await access.summary(conn)


@router.patch("/whatsapp")
async def change_whatsapp(
    body: WhatsappSetup, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """The owner chooses how customers reach them on WhatsApp, gives the number and ticks
    what they have ready. Answers the whole go-live list."""
    _owner(staff)
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            if body.way is not None:
                await readiness.set_choice(conn, "whatsapp", body.way, staff.name, False)
            if (body.phone, body.display_name, body.ready) != (None, None, None):
                await whatsapp_setup.prepare(
                    conn, staff.name, False, phone=body.phone, display_name=body.display_name,
                    ready=body.ready,
                )
            return await readiness.run(conn, staff.name)
    except (readiness.ReadinessError, whatsapp_setup.SetupError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


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
