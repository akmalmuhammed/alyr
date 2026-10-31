"""The back office's WhatsApp screens: every business's line, and what ALYR staff can do to one
(ALY-166 spec 060; templates, health and Embedded Signup join it in specs 061 to 063).

Attaching and detaching a number are in `routes/admin.py` (spec 023). These are what comes after:
look at every line at once, check one against Meta, send one test message, read its trail.
Every route is for ALYR staff only, and every action that changes or asks something is on the
audit log that nobody can edit.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from alyr.config import get_settings
from alyr.core import backoffice, whatsapp_line
from alyr.core.auth import Staff
from alyr.routes.admin import _admin_call, _by, _in_business, platform_admin

router = APIRouter(prefix="/api/admin", tags=["back office"])


class TestSend(BaseModel):
    contact_id: UUID


def _lines(rows) -> list[dict]:
    return [whatsapp_line.row_view(r) for r in rows]


@router.get("/whatsapp/lines")
async def lines(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    """Every business with a Meta number, and where its line stands."""
    shown = _lines(await _admin_call(request, "select * from admin_whatsapp_lines()"))
    counts = {state: 0 for state in whatsapp_line.STATES if state != "no_number"}
    for line in shown:
        counts[line["state"]] += 1
    return {"lines": shown, "counts": counts}


@router.get("/businesses/{business_id}/whatsapp/line")
async def one_line(
    business_id: UUID, request: Request, _: Staff = Depends(platform_admin)
) -> dict:
    """One business's line, the staff who can be sent a test, and the line's trail."""
    async with _in_business(request, business_id) as conn:
        line = await whatsapp_line.find(conn)
        if line is None:
            return {"line": None, "testers": [], "events": []}
        rows = await conn.fetch("select * from admin_whatsapp_lines()")
        mine = [r for r in rows if r["tenant_id"] == business_id]
        return {
            "line": whatsapp_line.row_view(mine[0]) if mine else None,
            "testers": await whatsapp_line.testers(conn, line),
            "events": await whatsapp_line.trail(conn),
        }


@router.post("/businesses/{business_id}/whatsapp/line/check")
async def check_line(
    business_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Ask Meta about the line and look in our own records. Sends nothing to anyone and changes
    nothing at Meta; the answer is saved and the check is on the trail and the audit log."""
    async with _in_business(request, business_id) as conn:
        line = await whatsapp_line.find(conn)
    if line is None:
        raise HTTPException(status_code=404, detail="this business has no WhatsApp number")
    # Meta is asked with no database transaction open.
    checks = await whatsapp_line.probe(
        request.app.state.outbound.channels["meta"], line, get_settings().meta_app_id)
    async with _in_business(request, business_id) as conn:
        checks += await whatsapp_line.local_checks(conn, line)
        ok = await whatsapp_line.save_check(conn, line, checks, _by(staff))
        await backoffice.audit(
            conn, staff, "whatsapp.checked", "business", business_id, business_id=business_id,
            detail={"number_id": line.number_id, "ok": ok,
                    "failed": [c["key"] for c in checks if c["ok"] is False]},
        )
    return {"ok": ok, "checks": checks}


@router.post("/businesses/{business_id}/whatsapp/line/test")
async def test_line(
    business_id: UUID, body: TestSend, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Send one test text to a member of the shop's staff who has written to the line in the last
    24 hours. It goes through the outbound layer like every message ALYR starts."""
    try:
        async with _in_business(request, business_id) as conn:
            line = await whatsapp_line.find(conn)
            if line is None:
                raise HTTPException(status_code=404, detail="this business has no WhatsApp number")
            sent = await whatsapp_line.send_test(
                conn, request.app.state.outbound, line, body.contact_id, _by(staff))
            await backoffice.audit(
                conn, staff, "whatsapp.test_sent", "business", business_id,
                business_id=business_id, detail={"number_id": line.number_id},
            )
    except whatsapp_line.LineError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    # The test is a queued job like any message; where jobs run inline (a developer machine),
    # run it now. A back-office connection is not a tenant's, so it does not do this by itself.
    after = request.app.state.db.after_commit
    if after is not None:
        await after()
    return sent

