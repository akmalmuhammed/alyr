"""The back office's WhatsApp screens: every business's line, and what ALYR staff can do to one
(ALY-166 spec 060; templates, health and Embedded Signup join it in specs 061 to 063).

Attaching and detaching a number are in `routes/admin.py` (spec 023). These are what comes after:
look at every line at once, check one against Meta, send one test message, read its trail.
Every route is for ALYR staff only, and every action that changes or asks something is on the
audit log that nobody can edit.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from alyr.config import get_settings
from alyr.core import backoffice, whatsapp_health, whatsapp_line, whatsapp_templates
from alyr.core.auth import Staff
from alyr.routes.admin import _admin_call, _by, _in_business, platform_admin

router = APIRouter(prefix="/api/admin", tags=["back office"])


class TestSend(BaseModel):
    contact_id: UUID


class Submit(BaseModel):
    # "name" for both languages of a template, or "name:ar" for one; empty means every one the
    # plan would send.
    names: list[str] = Field(default_factory=list, max_length=100)


def _lines(rows) -> list[dict]:
    return [whatsapp_line.row_view(r) for r in rows]


@router.get("/whatsapp/lines")
async def lines(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    """Every business with a Meta number, and where its line stands."""
    shown = _lines(await _admin_call(request, "select * from admin_whatsapp_lines()"))
    # How many of the templates ALYR needs stand where, per business (spec 061).
    tally: dict[str, dict[str, int]] = {}
    for r in await _admin_call(request, "select * from admin_whatsapp_template_counts()"):
        tally.setdefault(str(r["tenant_id"]), {})[r["status"]] = r["n"]
    for line in shown:
        by_status = tally.get(line["business_id"], {})
        line["templates"] = {
            "wanted": len(whatsapp_templates.WANTED), "by_status": by_status,
            "problems": sum(by_status.get(s, 0) for s in whatsapp_templates.PROBLEMS),
        }
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


# ── message templates on the business's account (spec 061) ────────────────────────────────


def _only(names: list[str]) -> set[tuple[str, str]] | None:
    """The (name, language) pairs a request names, or None for "all"."""
    if not names:
        return None
    wanted = set()
    for item in names:
        name, _, language = item.partition(":")
        if name not in whatsapp_templates.CATALOGUE:
            raise HTTPException(status_code=422, detail=f"ALYR has no template called {name}")
        for lang in ([language] if language else whatsapp_templates.LANGUAGES):
            if lang not in whatsapp_templates.LANGUAGES:
                raise HTTPException(status_code=422, detail=f"ALYR sends en and ar, not {lang}")
            wanted.add((name, lang))
    return wanted


async def _template_view(conn, line: whatsapp_line.Line) -> dict:
    settings = get_settings()
    rows = whatsapp_templates.inventory(await whatsapp_templates.stored(conn, line))
    return {
        "waba_id": line.waba_id, "rows": rows, "counts": whatsapp_templates.counts(rows),
        "submit_on": settings.template_submit,
        "plan": [p for p in whatsapp_templates.plan(rows, settings) if p["action"] != "nothing"],
    }


@router.get("/businesses/{business_id}/whatsapp/templates")
async def templates_view(
    business_id: UUID, request: Request, _: Staff = Depends(platform_admin)
) -> dict:
    """Every template ALYR needs on this business's account and where Meta has it, what a
    submission would do, and whether submitting is switched on. Reads only ALYR's records."""
    async with _in_business(request, business_id) as conn:
        line = await whatsapp_line.find(conn)
        if line is None:
            return {"line": None}
        return await _template_view(conn, line)


@router.post("/businesses/{business_id}/whatsapp/templates/sync")
async def templates_sync(
    business_id: UUID, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Ask Meta which templates the account has and keep what it says. A read: nothing is sent
    to Meta but the question."""
    async with _in_business(request, business_id) as conn:
        line = await whatsapp_line.find(conn)
    if line is None:
        raise HTTPException(status_code=404, detail="this business has no WhatsApp number")
    try:
        listing = await whatsapp_templates.read_from_meta(
            request.app.state.outbound.channels["meta"], line)
    except whatsapp_templates.TemplateError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    async with _in_business(request, business_id) as conn:
        done = await whatsapp_templates.apply_listing(conn, line, listing, _by(staff))
        await backoffice.audit(
            conn, staff, "whatsapp.templates_synced", "business", business_id,
            business_id=business_id, detail={"number_id": line.number_id, **done})
        return await _template_view(conn, line)


@router.post("/businesses/{business_id}/whatsapp/templates/submit")
async def templates_submit(
    business_id: UUID, body: Submit, request: Request, staff: Staff = Depends(platform_admin)
) -> dict:
    """Submit to Meta the templates the plan says to create or send again. **Switched off** until
    the founder allows it (`ALYR_TEMPLATE_SUBMIT`): then it refuses with 409 and nothing is sent.
    A template held back for the founder's go is never sent. Meta's answer for each template is
    recorded as it comes, and the whole is on the line's trail and the audit log."""
    settings = get_settings()
    try:
        whatsapp_templates.require_on(settings)
    except whatsapp_templates.SubmitOff as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    only = _only(body.names)
    try:
        async with _in_business(request, business_id) as conn:
            line = await whatsapp_line.find(conn)
            if line is None:
                raise HTTPException(status_code=404, detail="this business has no WhatsApp number")
            todo = await whatsapp_templates.to_submit(conn, line, settings, only)
    except whatsapp_templates.TemplateError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    channel = request.app.state.outbound.channels["meta"]
    outcomes: list[whatsapp_templates.Outcome] = []
    for item in todo:
        # One template at a time, each recorded when Meta answers; no connection is held open.
        outcome, answer = await whatsapp_templates.send(channel, settings, line, item)
        outcomes.append(outcome)
        if answer is not None:
            async with _in_business(request, business_id) as conn:
                await whatsapp_templates.record_sent(conn, line, item, answer)
        if whatsapp_templates.rate_limited(outcome):
            break
    async with _in_business(request, business_id) as conn:
        summary = await whatsapp_templates.record_batch(conn, line, outcomes, _by(staff))
        await backoffice.audit(
            conn, staff, "whatsapp.templates_submitted", "business", business_id,
            business_id=business_id, detail={"number_id": line.number_id, **summary})
        view = await _template_view(conn, line)
    return view | {"results": [
        {"name": o.name, "language": o.language, "result": o.result, "note": o.note}
        for o in outcomes]}


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
    checks, info = await whatsapp_line.probe(
        request.app.state.outbound.channels["meta"], line, get_settings().meta_app_id)
    async with _in_business(request, business_id) as conn:
        if info is not None:
            # What Meta said about the number is its health too (spec 062).
            await whatsapp_health.apply_info(conn, line, info, _by(staff))
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

