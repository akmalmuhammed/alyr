"""Your account (go-live items 40 and 41, specs/040, D-081): the businesses a person works for and
the switch between them, the email they sign in with, and the download of everything a
business keeps in ALYR (owners only). See `core/account.py` and `core/export.py`."""

import logging
import weakref
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import account, auth, export, mail, ratelimit, team
from alyr.core.auth import Staff
from alyr.db import PoolBusy
from alyr.routes.deps import current_staff

log = logging.getLogger("alyr.account")
router = APIRouter(prefix="/api/account", tags=["your account"])

# Downloads of one business's data in an hour.
EXPORTS_PER_BUSINESS = ratelimit.Limit(5, ratelimit.HOUR)


class Switch(BaseModel):
    business_id: UUID


class NewEmail(BaseModel):
    email: str = Field(min_length=3, max_length=200)


class NewEmailCheck(NewEmail):
    code: str = Field(min_length=4, max_length=12)


def _refused(error: account.AccountError) -> HTTPException:
    status = 429 if error.code == "too_many" else 409 if error.code == "taken" else 422
    headers = {"Retry-After": str(error.retry_after)} if error.retry_after else None
    return HTTPException(
        status_code=status, detail={"code": error.code, "message": str(error)}, headers=headers
    )


def _cookie(response: Response, token: str) -> None:
    response.set_cookie(
        auth.COOKIE, token, max_age=auth.SESSION_DAYS * 86400, httponly=True,
        samesite="lax", secure=get_settings().env != "local", path="/",
    )


@router.get("")
async def mine(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Who is signed in, the businesses they work for, and what they may do here."""
    signed_in = staff.user_id is not None
    return {
        "me": {"name": staff.name, "email": staff.email if signed_in else "", "role": staff.role},
        "signed_in": signed_in,
        "businesses": await account.businesses(request.app.state.db, staff),
        "can_change_email": signed_in,
        "can_export": staff.role == "owner",
    }


@router.post("/switch")
async def switch(
    body: Switch, request: Request, response: Response, staff: Staff = Depends(current_staff)
) -> dict:
    """Open another business the person works for. This browser's session is replaced by one
    in that business."""
    token = request.cookies.get(auth.COOKIE)
    if staff.user_id is None or not token:
        raise HTTPException(status_code=404, detail="no such business")
    if body.business_id == staff.tenant_id:
        return {"business_id": str(body.business_id)}
    try:
        fresh = await account.switch(request.app.state.db, staff, token, body.business_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail="no such business") from error
    _cookie(response, fresh)
    return {"business_id": str(body.business_id)}


@router.post("/email/code")
async def email_code(
    body: NewEmail, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Email a code to the new address. Its owner types it to make the change."""
    await ratelimit.check(request, "code-address", ratelimit.CODES_PER_ADDRESS)
    try:
        code, new = await account.request_email_code(request.app.state.db, staff, body.email)
    except account.AccountError as error:
        raise _refused(error) from error
    answer: dict = {"sent": True, "email": new}
    if mail.configured():
        subject, text, html = account.change_code_message(code, auth.CODE_MINUTES)
        try:
            await mail.send(new, subject, text, html)
        except mail.MailError as error:
            raise HTTPException(
                status_code=503, detail="the code could not be emailed; try again in a minute"
            ) from error
    elif get_settings().env != "local":
        log.error("an email-change code was made but no email provider is configured")
        raise HTTPException(status_code=503, detail="codes cannot be delivered yet")
    if get_settings().env == "local":
        # As for sign-in: on a developer's machine the code comes back too. Never elsewhere.
        answer["dev_code"] = code
    return answer


@router.post("/email")
async def change_email(
    body: NewEmailCheck, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    """Make the new address the person's sign-in email, if the code is right."""
    await ratelimit.check(request, "guess-address", ratelimit.GUESSES_PER_ADDRESS)
    token = request.cookies.get(auth.COOKIE) or ""
    try:
        new = await account.change_email(
            request.app.state.db, staff, token, body.email, body.code
        )
    except account.AccountError as error:
        raise _refused(error) from error
    return {"email": new}


@router.get("/export")
async def download(request: Request, staff: Staff = Depends(current_staff)) -> StreamingResponse:
    """Everything the business keeps in ALYR, as one ZIP. Owners only. Every owner is emailed
    that it was downloaded, and it goes on the activity record, before the first byte is sent."""
    if staff.role != "owner":
        raise HTTPException(status_code=403, detail="Only an owner can download all the data.")
    db = request.app.state.db
    # A place for the download first, so a busy answer does not use up one of the hour's downloads.
    slot = export.take_slot()
    if slot is None:
        raise PoolBusy(0.0, export.DOWNLOADS_AT_ONCE)
    try:
        try:
            await ratelimit.hit(db, "data-export", str(staff.tenant_id), EXPORTS_PER_BUSINESS)
        except ratelimit.TooManyRequests as error:
            raise HTTPException(
                status_code=429, detail="too many downloads; try again in an hour",
                headers={"Retry-After": str(error.retry_after)},
            ) from error
        at = datetime.now(UTC)
        async with db.tenant(staff.tenant_id) as conn:
            slug = await conn.fetchval("select slug from tenants where id = $1", staff.tenant_id)
            if staff.user_id is not None:
                await team.record(
                    conn, "team", staff.user_id, "data_exported", team.actor_of(staff))
            await account.queue_export_notes(conn, staff.user_id)
    except BaseException:
        slot.release()
        raise
    log.info("a business's data was downloaded")
    name = f"alyr-{slug or 'business'}-{at.astimezone(export.DOHA):%Y-%m-%d}.zip"
    body = export.stream(db, request.app.state.media.store, staff.tenant_id, staff.name, at, slot)
    # A stream that is thrown away before it starts never reaches its own `finally`.
    weakref.finalize(body, slot.release)
    return StreamingResponse(
        body,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )
