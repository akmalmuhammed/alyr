"""The owner connects their own WhatsApp account through Meta's pop-up (ALY-39, spec 063, D-148).

Off unless `ALYR_EMBEDDED_SIGNUP` is on and the Meta app is configured for it. Three routes, for the
signed-in owner or an admin of the business only:

- `GET config`: whether to show the Connect button, and the public values Meta's pop-up opens with
  (the app's ID, the configuration's ID, the extras for the way the owner chose). No secret.
- `POST complete`: the one-time code and the session message the browser got from Meta. Every claim
  in the message is read back from Meta with the business's own token before anything is stored
  (`core/whatsapp_signup.py`). Answers the go-live list, like the other WhatsApp setup calls.
- `POST cancel`: the owner closed the pop-up, or Meta's flow reported an error. For the trail only.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import readiness, whatsapp_setup, whatsapp_signup
from alyr.core.auth import Staff
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/whatsapp/signup", tags=["whatsapp"])


class Complete(BaseModel):
    # The code the pop-up returned; it lives 30 seconds.
    code: str = Field(min_length=1, max_length=1000)
    event: str = Field(max_length=60)
    waba_id: str = Field(default="", max_length=30)
    phone_number_id: str = Field(default="", max_length=30)
    business_id: str = Field(default="", max_length=30)


class Cancelled(BaseModel):
    event: Literal["CANCEL", "ERROR"]
    step: str = Field(default="", max_length=60)
    error_message: str = Field(default="", max_length=300)
    error_code: str = Field(default="", max_length=30)


def _owner(staff: Staff) -> Staff:
    if staff.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="only the owner connects WhatsApp")
    return staff


async def _way(request: Request, staff: Staff) -> str:
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await whatsapp_setup._way(conn)


@router.get("/config")
async def config(request: Request, staff: Staff = Depends(current_staff)) -> dict:
    _owner(staff)
    settings = get_settings()
    way = await _way(request, staff)
    ok, why = whatsapp_signup.available(settings)
    if not ok:
        return {"available": False, "reason": why}
    if way not in whatsapp_signup.WAYS:
        return {"available": False, "reason": "way"}
    return {"available": True, "reason": "", **whatsapp_signup.browser_config(settings, way)}


@router.post("/complete")
async def complete(
    body: Complete, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _owner(staff)
    way = await _way(request, staff)
    try:
        await whatsapp_signup.complete(
            request.app.state.db, request.app.state.outbound.channels["meta"],
            request.app.state.credentials, get_settings(), staff.tenant_id, staff.name,
            code=body.code, event=body.event, waba_id=body.waba_id,
            phone_number_id=body.phone_number_id, way=way,
        )
    except whatsapp_signup.SignupError as error:
        # The code is worded in the owner's language by the screen; the message is English.
        raise HTTPException(
            status_code=422, detail={"code": error.code, "message": error.message}) from error
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        return await readiness.run(conn, staff.name)


@router.post("/cancel")
async def cancel(
    body: Cancelled, request: Request, staff: Staff = Depends(current_staff)
) -> dict:
    _owner(staff)
    await whatsapp_signup.cancelled(
        request.app.state.db, staff.tenant_id, staff.name, event=body.event, step=body.step,
        error=body.error_message, code=body.error_code)
    return {"ok": True}
