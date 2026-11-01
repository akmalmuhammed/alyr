"""The second factor of ALYR's own staff: set it up, prove it, replace it, make new recovery
codes, turn it off (ALY-125, D-136, `core/second_factor.py`).

These routes use `staff_member`, not `platform_admin`: a person who has not passed the second
factor yet has to be able to pass it, and, while it is not required, to set it up. They never
return a secret except once, when setting up, and never a recovery code except once, when it
is made. Wrong codes answer 401, a paused account 429 with Retry-After, a thing that cannot be
done now 403, and a missing setup 409.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import auth, mail, ratelimit, second_factor, staff_security
from alyr.core.auth import Staff
from alyr.routes.admin import staff_member

router = APIRouter(prefix="/api/admin/factor", tags=["back office"])

ANNOUNCED = "staff-factor-announced"


class Code(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class Current(BaseModel):
    # A code from the authenticator app, or a recovery code. Empty is allowed so the answer for
    # a missing one is the same as for a wrong one.
    current: str = Field(default="", max_length=40)


def _person(staff: Staff) -> str:
    if staff.user_id is None:
        raise HTTPException(status_code=400, detail="sign in as a member of ALYR staff first")
    return staff.email.lower()


def _refuse(error: second_factor.FactorError) -> HTTPException:
    if isinstance(error, second_factor.FactorLocked):
        return HTTPException(
            status_code=429, detail=str(error), headers={"Retry-After": str(error.retry_after)}
        )
    if isinstance(error, second_factor.EnrolmentClosed):
        return HTTPException(
            status_code=403, detail={"code": "enrolment_closed", "message": str(error)}
        )
    if isinstance(error, second_factor.Required):
        return HTTPException(
            status_code=403, detail={"code": "second_factor_required", "message": str(error)}
        )
    if isinstance(error, second_factor.NotEnrolled):
        return HTTPException(
            status_code=409, detail={"code": "not_enrolled", "message": str(error)}
        )
    return HTTPException(status_code=401, detail=str(error))


def _cookie(response: Response, token: str) -> None:
    response.set_cookie(
        auth.COOKIE, token, max_age=auth.SESSION_DAYS * 86400, httponly=True,
        samesite="lax", secure=get_settings().env != "local", path="/",
    )


async def _told(request: Request, staff: Staff, action: str, event: str | None, detail: dict):
    """Write the event to the audit log and email the person. Never raises."""
    db, email = request.app.state.db, staff.email.lower()
    try:
        await staff_security.audit_event(db, email, staff.name, action, detail)
        if event is not None:
            await staff_security.send_email(
                email, mail.staff_factor_message(staff.name, event, datetime.now(UTC))
            )
    except Exception:  # noqa: BLE001  (a note that cannot be written must not undo the change)
        staff_security.log.exception("a staff factor event could not be recorded")


async def _paused(request: Request, staff: Staff) -> None:
    """After a wrong code: if the account is now paused, say so once (audit log and ALYR's alert
    channels). Never raises."""
    db, email = request.app.state.db, staff.email.lower()
    try:
        async with db.unscoped() as conn, conn.transaction():
            await second_factor._turn(conn, email)
            try:
                await second_factor._guard(conn, email)
                return
            except second_factor.FactorLocked:
                pass
            if await ratelimit.count_on(conn, ANNOUNCED, email, ratelimit.TEN_MINUTES):
                return
            await ratelimit.record_on(conn, ANNOUNCED, email)
        await staff_security.audit_event(
            db, email, staff.name, "staff.factor_paused",
            {"short": second_factor.SHORT.count, "daily": second_factor.DAILY.count},
        )
        from alyr.core import alerts

        await alerts.notify(
            "A back-office authenticator is paused",
            "Too many wrong authenticator codes on an ALYR staff account. It is paused until "
            "the oldest has aged out. Nobody has signed in.", urgent=True, tag="lock",
        )
    except Exception:  # noqa: BLE001
        staff_security.log.exception("a paused authenticator could not be announced")


@router.get("")
async def state(request: Request, staff: Staff = Depends(staff_member)) -> dict:
    email = _person(staff)
    return {"email": email, **await second_factor.status(request.app.state.db, email)}


@router.post("/verify")
async def verify(
    body: Code, request: Request, response: Response, staff: Staff = Depends(staff_member)
) -> dict:
    """Pass the second factor with a code from the app or a recovery code. The session gets a
    new cookie; the old value stops working."""
    email = _person(staff)
    db = request.app.state.db
    try:
        kind, fresh = await second_factor.verify(
            db, email, body.code, request.cookies.get(auth.COOKIE, "")
        )
    except second_factor.FactorError as error:
        await _paused(request, staff)
        raise _refuse(error) from error
    _cookie(response, fresh)
    if kind == "recovery":
        await _told(request, staff, "staff.factor_recovery_used", "recovery_used", {})
    return {"verified": True, "used": kind, **await second_factor.status(db, email)}


@router.post("/begin")
async def begin(body: Current, request: Request, staff: Staff = Depends(staff_member)) -> dict:
    """Start setting up an authenticator app: returns the secret, once, to type or scan. A
    replacement needs a current code. Nothing changes until `confirm`."""
    email = _person(staff)
    try:
        secret, replacing = await second_factor.begin(request.app.state.db, email, body.current)
    except second_factor.FactorError as error:
        await _paused(request, staff)
        raise _refuse(error) from error
    return {
        "secret": second_factor.secret_text(secret),
        "link": second_factor.setup_link(email, secret), "replacing": replacing,
    }


@router.post("/confirm")
async def confirm(
    body: Code, request: Request, response: Response, staff: Staff = Depends(staff_member)
) -> dict:
    """The first right code from the new app makes it the working one. Returns the ten recovery
    codes, once; this session passes the factor and gets a new cookie."""
    email = _person(staff)
    try:
        codes, replaced, fresh = await second_factor.confirm(
            request.app.state.db, email, body.code, request.cookies.get(auth.COOKIE, "")
        )
    except second_factor.FactorError as error:
        await _paused(request, staff)
        raise _refuse(error) from error
    _cookie(response, fresh)
    await _told(
        request, staff, "staff.factor_replaced" if replaced else "staff.factor_enrolled",
        "replaced" if replaced else "enrolled", {},
    )
    return {"recovery_codes": codes, "replaced": replaced}


@router.post("/recovery")
async def recovery(body: Current, request: Request, staff: Staff = Depends(staff_member)) -> dict:
    """Ten new recovery codes, once; the old ones stop working. Needs a current code."""
    email = _person(staff)
    try:
        codes = await second_factor.make_recovery_codes(
            request.app.state.db, email, body.current
        )
    except second_factor.FactorError as error:
        await _paused(request, staff)
        raise _refuse(error) from error
    await _told(request, staff, "staff.factor_recovery_new", "recovery_new", {})
    return {"recovery_codes": codes}


@router.post("/disable")
async def disable(body: Current, request: Request, staff: Staff = Depends(staff_member)) -> dict:
    """Turn the authenticator off. Needs a current code, and is refused while the second factor
    is required."""
    email = _person(staff)
    try:
        await second_factor.disable(request.app.state.db, email, body.current)
    except second_factor.FactorError as error:
        await _paused(request, staff)
        raise _refuse(error) from error
    await _told(request, staff, "staff.factor_removed", "removed", {})
    return await second_factor.status(request.app.state.db, email)
