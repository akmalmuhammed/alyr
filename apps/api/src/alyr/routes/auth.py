"""Sign-in, sign-out and the shop's team."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import auth, mail
from alyr.core.auth import Staff
from alyr.routes.deps import current_staff

log = logging.getLogger("alyr.auth")
router = APIRouter(prefix="/api", tags=["auth"])


class CodeRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)


class CodeCheck(CodeRequest):
    code: str = Field(min_length=4, max_length=12)


class NewMember(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    name: str = Field(min_length=1, max_length=120)
    role: str = "agent"


class RoleChange(BaseModel):
    role: str


def _me(staff: Staff) -> dict:
    return {
        "signed_in": staff.user_id is not None,
        "id": str(staff.user_id) if staff.user_id else None,
        "name": staff.name, "email": staff.email, "role": staff.role,
    }


@router.post("/auth/code")
async def send_code(body: CodeRequest, request: Request) -> dict:
    """Always answers the same way, whether or not the email has an account."""
    settings = get_settings()
    try:
        code = await auth.request_code(request.app.state.db, body.email)
    except auth.TooManyCodes as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    answer: dict = {"sent": True}
    if code is not None and mail.configured():
        subject, text, html = mail.sign_in_message(code, auth.CODE_MINUTES)
        try:
            await mail.send(auth.clean_email(body.email), subject, text, html)
        except mail.MailError as error:
            raise HTTPException(
                status_code=503, detail="the code could not be emailed; try again in a minute"
            ) from error
    if settings.env == "local":
        # On a developer's machine the code is also handed back, so the sign-in page can
        # show it without an inbox. Never outside local.
        answer["dev_code"] = code
    elif code is not None and not mail.configured():
        log.error("a sign-in code was created but no email provider is configured")
        raise HTTPException(status_code=503, detail="sign-in codes cannot be delivered yet")
    return answer


@router.post("/auth/verify")
async def verify(body: CodeCheck, request: Request, response: Response) -> dict:
    db = request.app.state.db
    try:
        token = await auth.verify_code(db, body.email, body.code)
    except auth.AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    response.set_cookie(
        auth.COOKIE, token, max_age=auth.SESSION_DAYS * 86400, httponly=True,
        samesite="lax", secure=get_settings().env != "local", path="/",
    )
    return _me(await auth.resolve(db, token))


@router.get("/auth/me")
async def me(staff: Staff = Depends(current_staff)) -> dict:
    return _me(staff)


@router.post("/auth/logout")
async def logout(request: Request, response: Response) -> dict:
    token = request.cookies.get(auth.COOKIE)
    if token:
        await auth.sign_out(request.app.state.db, token)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"signed_in": False}


def _refuse(error: Exception) -> HTTPException:
    if isinstance(error, PermissionError):
        return HTTPException(status_code=403, detail=str(error))
    if isinstance(error, LookupError):
        return HTTPException(status_code=404, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


@router.get("/team")
async def team(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return {"members": await auth.team(conn), "can_manage": staff.role != "agent"}


@router.post("/team")
async def add_member(
    body: NewMember, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            user_id = await auth.add_member(conn, staff.role, body.email, body.name, body.role)
    except (auth.AuthError, PermissionError) as error:
        raise _refuse(error) from error
    return {"id": str(user_id)}


@router.post("/team/{user_id}/role")
async def change_role(
    user_id: UUID, body: RoleChange, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await auth.change_role(conn, staff.role, user_id, body.role)
    except (auth.AuthError, PermissionError, LookupError) as error:
        raise _refuse(error) from error
    return {"role": body.role}


@router.delete("/team/{user_id}")
async def remove_member(
    user_id: UUID, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    try:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            await auth.remove_member(conn, staff.role, user_id)
    except (auth.AuthError, PermissionError, LookupError) as error:
        raise _refuse(error) from error
    return {"removed": True}
