"""ALYR Agent on the workspace home (ALY-99): the dashboard's view, and "Not now".

The view is read in the signed-in person's business only, and a person whose role may
not see money (the agent role) gets it without money (`02-data.md` §9).
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from alyr import catalog
from alyr.config import get_settings
from alyr.core.auth import Staff
from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY
from alyr.routes.deps import current_staff

router = APIRouter(prefix="/api/agent", tags=["agent"])

# The home screen's dashboard is a summary of the week: a little older than the inbox is fine.
AGENT_SECONDS = 15.0


class NotNow(BaseModel):
    key: str = Field(min_length=1, max_length=40)
    fingerprint: str = Field(min_length=1, max_length=40)


@router.get("")
async def agent_view(
    request: Request,
    lang: str = Query("en", pattern="^(en|ar)$"),
    staff: Staff = Depends(current_staff),
) -> dict:
    settings = get_settings()
    now = None
    if settings.env == "local" and settings.agent_clock:
        now = datetime.fromisoformat(settings.agent_clock)
    async def compute() -> dict:
        async with request.app.state.db.tenant(staff.tenant_id) as conn:
            return await view.build(conn, staff, lang, now=now)

    # Several people's tabs on the home screen ask every few seconds; the view says who it is for
    # (their first name, whether they see money), so the answer is kept per person.
    return await request.app.state.poll.get_json(
        staff.tenant_id, ("agent", lang, staff.user_id, staff.role), compute,
        seconds=AGENT_SECONDS)


@router.post("/not-now")
async def not_now(body: NotNow, request: Request, staff: Staff = Depends(current_staff)) -> dict:
    """Set a knowledge card aside until its numbers change or until Sunday."""
    if staff.role not in catalog.MANAGERS:
        raise HTTPException(
            status_code=403, detail="Only the owner or an admin can set it aside."
        )
    insight = INSIGHT_BY_KEY.get(body.key)
    if insight is None or insight.kind != "knowledge":
        raise HTTPException(
            status_code=422, detail="Only a suggestion to know can be set aside."
        )
    async with request.app.state.db.tenant(staff.tenant_id) as conn:
        tz = await conn.fetchval(
            "select timezone from tenants "
            "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
        # Until the next Sunday begins, in the shop's own time.
        clock = Facts(now=datetime.now(UTC), tz=tz or "Asia/Qatar")
        until = clock.at(clock.week_start) + timedelta(days=7)
        await conn.execute(
            "insert into agent_snoozes (insight_key, fingerprint, until, created_by) "
            "values ($1, $2, $3, $4) on conflict (tenant_id, insight_key) do update "
            "set fingerprint = excluded.fingerprint, until = excluded.until, "
            "created_by = excluded.created_by, created_at = now()",
            body.key, body.fingerprint, until, staff.name,
        )
    return {"until": until.isoformat()}
