"""The page a sales link opens (ALY-216, D-105, spec 041): an owner proves their email, reads the
quote ALYR prepared on the visit, accepts the terms and lands on the pay step.

Public: nobody is signed in. What lets a call through is a live link, and every call carries it in
the body (never in a query string, so it is in no access log). Every call counts against the
caller's address first, so a forged token costs the caller a try like any other. The client comes
from the link's row, never from the request. A forged, damaged, foreign, unknown, expired,
revoked or used link is told apart only where the owner needs to know (spec 041, "The link").
"""

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import access, auth, mail, onboarding, ratelimit, sales_link, terms
from alyr.core.sales_link import Offer, SalesLinkError

log = logging.getLogger("alyr.join")
router = APIRouter(prefix="/api/join", tags=["join"])


class Link(BaseModel):
    t: str = Field(min_length=10, max_length=300)


class LinkCode(Link):
    code: str = Field(min_length=4, max_length=12)


class Accept(Link):
    signup_token: str = Field(min_length=10, max_length=200)
    owner_name: str = Field(default="", max_length=120)
    accepted_terms: list[UUID] = Field(default_factory=list, max_length=10)
    quote_id: UUID
    lang: Literal["en", "ar"] = "en"


def _refused(error: SalesLinkError) -> HTTPException:
    """The same body for every kind of bad link, so the page can word it; unknown is a 404, the
    rest (a good link that is over) a 410."""
    return HTTPException(
        status_code=404 if error.code == "unknown" else 410,
        detail={"code": error.code, "message": str(error)},
    )


async def _offer(request: Request, body: Link, *, record_open: bool = False) -> Offer:
    await ratelimit.check(request, "join", ratelimit.JOIN_PER_ADDRESS)
    async with access.office(request.app.state.db) as conn:
        try:
            offer = await sales_link.resolve(conn, body.t)
        except SalesLinkError as error:
            raise _refused(error) from error
        if record_open:
            await sales_link.opened(conn, offer)
    return offer


@router.post("/open")
async def open_link(body: Link, request: Request) -> dict:
    """The first look: the shop's name and type and where the code will go. No price yet."""
    offer = await _offer(request, body, record_open=True)
    return sales_link.public_view(offer)


@router.post("/code")
async def send_code(body: Link, request: Request) -> dict:
    """Email the code to the address ALYR recorded for the lead; the caller cannot name another."""
    settings = get_settings()
    offer = await _offer(request, body)
    await ratelimit.check(
        request, "join-code-link", ratelimit.JOIN_CODES_PER_LINK, subject=str(offer.link_id)
    )
    try:
        code = await auth.request_code(request.app.state.db, offer.email, allow_new=True)
    except auth.TooManyCodes as error:
        raise HTTPException(
            status_code=429, detail=str(error), headers={"Retry-After": str(error.retry_after)}
        ) from error
    if mail.configured():
        subject, text, html = mail.sign_in_message(code, auth.CODE_MINUTES)
        try:
            await mail.send(offer.email, subject, text, html)
        except mail.MailError as error:
            raise HTTPException(
                status_code=503, detail="the code could not be emailed; try again in a minute"
            ) from error
    elif settings.env != "local":
        log.error("a sales link code was created but no email provider is configured")
        raise HTTPException(status_code=503, detail="codes cannot be delivered yet")
    async with access.office(request.app.state.db) as conn:
        await sales_link.code_sent(conn, offer)
    answer: dict = {"sent": True, "email_hint": sales_link.mask(offer.email)}
    if settings.env == "local":
        answer["dev_code"] = code
    return answer


@router.post("/verify")
async def verify(body: LinkCode, request: Request) -> dict:
    """A right code proves the mailbox. The answer is the offer: the published quote, the
    products, the terms to accept, and a one-time token that may make this lead's business."""
    db = request.app.state.db
    offer = await _offer(request, body)
    await ratelimit.check(request, "join-guess", ratelimit.JOIN_GUESSES_PER_ADDRESS)
    await ratelimit.check(
        request, "join-guess-link", ratelimit.JOIN_GUESSES_PER_LINK, subject=str(offer.link_id)
    )
    try:
        await auth.check_code(db, offer.email, body.code)
    except auth.AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    token = await onboarding.issue_signup_token(db, offer.email)
    async with access.office(db) as conn:
        await sales_link.verified(conn, offer)
        shown = await sales_link.offer_view(conn, offer)
        current = await terms.current(conn)
    return {"signup_token": token, "terms": current, **shown}


@router.post("/accept")
async def accept(body: Accept, request: Request, response: Response) -> dict:
    """The owner accepts the terms and the price. The business is made, the owner is signed in,
    and `next` is where the page goes. Public self-serve sign-up being closed does not matter:
    the link is the founder's invitation (D-107)."""
    offer = await _offer(request, body)
    await ratelimit.check(request, "signup-address", ratelimit.SIGNUPS_PER_ADDRESS)
    try:
        _, session, accepted = await sales_link.accept(
            request.app.state.db, offer, body.signup_token, body.owner_name,
            body.accepted_terms, body.quote_id, ratelimit.client_address(request),
            request.headers.get("user-agent", ""), body.lang,
        )
    except SalesLinkError as error:
        raise _refused(error) from error
    except auth.AuthError as error:
        # The one-time token ran out or does not fit this link: the owner asks for a new code.
        raise HTTPException(status_code=401, detail=str(error)) from error
    except onboarding.OnboardingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    response.set_cookie(
        auth.COOKIE, session, max_age=auth.SESSION_DAYS * 86400, httponly=True,
        samesite="lax", secure=get_settings().env != "local", path="/",
    )
    return {"created": True, "quote_accepted": accepted, "next": "/start"}
