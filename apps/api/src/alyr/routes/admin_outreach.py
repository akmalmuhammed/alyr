"""The back office's outreach routes (ALY-310, specs/065): ALYR's own selling, staff only.

Under `/api/admin/outreach`, behind the same check as the rest of `/api/admin` (ALYR staff, signed
in within 12 hours, and the second factor while it is required). Every change writes the
back-office audit log in the same transaction. The screens (ALY-311) read only these shapes.

Public, outside `/api/admin`: `GET` and `POST /o/unsubscribe/{token}`, the one-click unsubscribe
every outreach message carries (RFC 8058).
"""

import html
import json
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from alyr.core import backoffice
from alyr.core.auth import Staff
from alyr.outreach import connections, policy, sequences, sources, store, unsubscribe
from alyr.outreach.engine import DISCOVER, RESEARCH
from alyr.routes.admin import platform_admin

router = APIRouter(prefix="/api/admin/outreach", tags=["back office: outreach"])
public = APIRouter(tags=["outreach: unsubscribe"])

MAX_IMPORT_BYTES = 10_000_000
Basis = Literal["published_business_contact", "existing_relationship", "referral", "opt_in",
                "inbound", "legitimate_interest", "conspicuous_publication"]


# ── what the screens send ──────────────────────────────────
# The answers follow apps/web/app/(product)/ops/outreach/types.ts (ALY-311) field for field.


class NewProspect(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    website: str = Field(default="", max_length=300)
    country: str = Field(min_length=2, max_length=2)
    contact_first_name: str = Field(default="", max_length=60)
    contact_last_name: str = Field(default="", max_length=60)
    contact_role: str = Field(default="", max_length=80)
    contact_email: str = Field(default="", max_length=200)
    # Needed with an email; without one, research finds the address the business publishes and
    # proposes `published_business_contact`, which the founder confirms by approving.
    basis: Basis | Literal[""] = ""
    basis_note: str = Field(default="", max_length=500)
    language: Literal["en", "ar"] = "en"
    notes: str = Field(default="", max_length=2000)


class ProspectChange(BaseModel):
    contact_first_name: str | None = Field(default=None, max_length=60)
    contact_last_name: str | None = Field(default=None, max_length=60)
    contact_role: str | None = Field(default=None, max_length=80)
    contact_email: str | None = Field(default=None, max_length=200)
    basis: Basis | Literal[""] | None = None
    basis_note: str | None = Field(default=None, max_length=500)
    language: Literal["en", "ar"] | None = None
    level: int | None = Field(default=None, ge=0, le=3)
    notes: str | None = Field(default=None, max_length=2000)
    disqualify: str | None = Field(default=None, max_length=300)


class Import(BaseModel):
    """A CSV (company, website, country, first_name, last_name, role, email, basis, language,
    notes), or an Overture Maps places GeoJSON file as text or as the object itself."""
    csv: str | None = Field(default=None, max_length=MAX_IMPORT_BYTES)
    geojson: str | dict | None = None
    release: str = Field(default="", max_length=40)
    country: str = Field(default="QA", min_length=2, max_length=2)


class Discover(BaseModel):
    query: str = Field(min_length=3, max_length=200)
    country: str = Field(min_length=2, max_length=2)
    limit: int = Field(default=10, ge=1, le=25)
    provider: Literal["exa", "places"] = "exa"


class SettingsChange(BaseModel):
    global_daily_cap: int | None = Field(default=None, ge=0, le=1000)
    default_level: int | None = Field(default=None, ge=0, le=3)
    honeytokens: list[str] | None = Field(default=None, max_length=50)
    booking_url: str | None = Field(default=None, max_length=300)


class KillSwitch(BaseModel):
    on: bool
    reason: str = Field(default="", max_length=300)


class Approve(BaseModel):
    body_hash: str = Field(min_length=64, max_length=64)
    with_follow_ups: bool = False


class Edit(BaseModel):
    subject: str = Field(max_length=200)
    body: str = Field(min_length=1, max_length=5000)


class Reason(BaseModel):
    reason: str = Field(default="", max_length=300)


class Note(BaseModel):
    note: str = Field(default="", max_length=1000)


# ── how rows are shown ─────────────────────────────────────

STEP_WAIT = {2: 3, 3: 7}
STAFF_EVENTS = ("approved", "edited", "rejected", "paused", "resumed")
VERIFIER = ("valid", "accept_all", "invalid", "disposable", "unknown")
ACTIVITY = {"send": "sent", "refusal": "gateway", "reply": "reply"}
OUTCOMES = {"hold": "held", "block": "blocked", "reschedule": "rescheduled", "trip": "blocked",
            "stop": "waiting", "pause": "paused", "duplicate": "dropped"}


def _engine(request: Request):
    return request.app.state.outreach


def _office(request: Request):
    return store.office(request.app.state.db)


def _by(staff: Staff) -> str:
    return staff.email or "local demo"


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def _refused(error: Exception, status: int = 409) -> HTTPException:
    return HTTPException(status_code=status, detail={
        "code": getattr(error, "code", "refused"), "message": str(error)})


def _row(r, default_level: int) -> dict:
    requested = r["level"] if r["level"] is not None else default_level
    verification = r["email_verification"]
    return {
        "id": str(r["id"]), "company": r["company"], "website": r["website"],
        "domain": r["domain"], "country": r["country"], "lane": policy.lane(r["country"]),
        "business_type": r["business_type"], "source": r["source"], "stage": r["stage"],
        "stage_reason": r["stage_reason"], "paused": r["paused"],
        "contact_first_name": r["first_name"], "contact_role": r["role"],
        # null when nobody verified it (typed, imported, or published on the business's site)
        "email_verifier": verification if verification in VERIFIER else None,
        "basis": r["basis"] or None, "level": policy.level(requested, r["country"]),
        "fit_score": r["fit_score"], "updated_at": r["updated_at"].isoformat(),
        "erased": r["erased_at"] is not None,
    }


def _detail_row(r, default_level: int) -> dict:
    return {**_row(r, default_level), "source_url": r["source_url"],
            "source_ref": r["source_ref"], "contact_last_name": r["last_name"],
            "contact_email": r["email"] or "", "email_source": r["email_source"] or None,
            "basis_note": r["basis_note"], "language": r["language"],
            "fit_reason": r["fit_reason"], "notes": r["notes"],
            "paused_reason": "paused by staff" if r["paused"] else ""}


def _check(c) -> dict | None:
    if not c:
        return None
    return {"ok": bool(c.get("ok")), "findings": list(c.get("findings") or [])}


def _sentences(d) -> list[dict]:
    """Each sentence with the claims it rests on, as it appears in the body: the greeting and the
    opt-out line rest on none. A text a person wrote has no sentences of the model's."""
    shown = []
    first_line = d["body"].split("\n", 1)[0]
    if first_line:
        shown.append({"text": first_line, "claim_ids": []})
    for s in d["sentences"] or []:
        text = " ".join(str(s.get("text", "")).split())
        if text and text in d["body"]:
            shown.append({"text": text, "claim_ids": list(s.get("claims") or [])})
    tail = d["body"].rstrip().rsplit("\n", 1)[-1]
    if tail and tail != first_line:
        shown.append({"text": tail, "claim_ids": []})
    return shown


def _draft(d) -> dict:
    booking = d["step"] == 4
    return {
        "id": str(d["id"]), "prospect_id": str(d["prospect_id"]),
        "kind": "booking_reply" if booking else "sequence", "step": 1 if booking else d["step"],
        "version": d["version"], "subject": d["subject"], "body": d["body"],
        "language": d["language"], "sentences": _sentences(d), "critic": _check(d["critic"]),
        "lint": _check(d["lint"]) or {"ok": False, "findings": []},
        "body_hash": d["body_hash"], "status": d["status"], "reason": d["reason"],
        "created_by": d["created_by"], "created_at": d["created_at"].isoformat(),
        "wait_working_days": None if booking else STEP_WAIT.get(d["step"]),
    }


def _claim(c) -> dict:
    return {"id": c["claim_key"], "text": c["text"], "url": c["url"], "quote": c["quote"],
            "kept": c["kept"], "dropped_reason": None if c["kept"] else (c["why"] or "dropped")}


def _reply(r) -> dict:
    labels = [x for x in (r["label"] or "").split(",") if x and r["kind"] == "read"]
    waiting = None
    if r["needs_founder"] and r["handled_at"] is None:
        if r["confidence"] is not None and r["confidence"] < 0.8:
            waiting = "low_confidence"
        elif len(labels) > 1:
            waiting = "several_labels"
        elif labels and labels[0] in ("interested", "question"):
            waiting = labels[0]
        else:
            waiting = "other"
    return {
        "id": str(r["id"]), "prospect_id": str(r["prospect_id"]) if r["prospect_id"] else None,
        "company": r["company"] or "", "contact_first_name": r["first_name"] or "",
        "step": r["step"], "received_at": r["received_at"].isoformat(), "subject": r["subject"],
        "body": r["body"], "kind": r["kind"],
        "label": labels[0] if labels else (r["kind"] if r["kind"] == "opt_out" else None),
        "other_labels": labels[1:], "confidence": r["confidence"],
        "waiting_because": waiting,
        "booking_draft_id": str(r["booking_draft_id"]) if r["booking_draft_id"] else None,
        "handled_by": r["handled_by"], "handled_at": _iso(r["handled_at"]), "note": r["note"],
    }


REPLY_SQL = (
    "select r.*, p.company, p.first_name, s.step, "
    "(select d.id from outreach_drafts d where d.prospect_id = r.prospect_id and d.step = 4 "
    " and d.status = 'in_review' order by d.version desc limit 1) as booking_draft_id "
    "from outreach_replies r left join outreach_prospects p on p.id = r.prospect_id "
    "left join outreach_sends s on s.id = r.send_id ")


async def _get_prospect(conn, prospect_id: UUID):
    row = await conn.fetchrow("select * from outreach_prospects where id = $1", prospect_id)
    if row is None:
        raise HTTPException(status_code=404, detail="no such prospect")
    return row


async def _today(conn, engine) -> dict:
    from alyr.outreach.gateway import ramp_cap

    s = engine.settings
    row = await store.settings_row(conn)
    box = await store.mailbox(conn, s.outreach_from, s.outreach_from_name)
    now = engine.clock()
    start = datetime.combine(now.astimezone(sequences.DOHA).date(), datetime.min.time(),
                             sequences.DOHA)
    sent = await conn.fetchval("select count(*) from outreach_sends where sent_at >= $1", start)
    queued = await conn.fetchval(
        "select count(*) from outreach_intents where status in ('queued', 'rescheduled')")
    first = box["first_send_on"] if box else None
    week = (max(0, (now.astimezone(sequences.DOHA).date() - first).days) // 7 + 1) if first else 1
    return {"sent": sent, "global_cap": row["daily_cap"],
            "mailbox_cap": ramp_cap(first, now.astimezone(sequences.DOHA).date()),
            "ramp_week": week, "queued": queued}


def _kill(row) -> dict:
    return {"on": row["kill_switch"], "reason": row["kill_reason"], "by": row["kill_by"],
            "at": _iso(row["kill_at"])}


# ── overview, connections, settings ───────────────────────


@router.get("/overview")
async def overview(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    engine = _engine(request)
    s = engine.settings
    async with _office(request) as conn:
        row = await store.settings_row(conn)
        stages = {r["stage"]: r["n"] for r in await conn.fetch(
            "select stage, count(*) as n from outreach_prospects group by stage")}
        box = await store.mailbox(conn, s.outreach_from, s.outreach_from_name)
        counts = await conn.fetchrow(
            "select (select count(*) from outreach_drafts where status = 'in_review') as review, "
            "(select count(*) from outreach_replies where needs_founder and handled_at is null) "
            " as replies, "
            "(select count(*) from outreach_intents where status = 'queued') as queued, "
            "(select count(*) from outreach_intents where status = 'held') as held, "
            "(select count(*) from outreach_intents where status = 'rescheduled') as rescheduled")
        today = await _today(conn, engine)
    links = await connections.view(engine)
    return {
        "enabled": s.outreach == "on",
        "kill_switch": _kill(row),
        "stages": {stage: stages[stage] for stage in store.STAGES if stage in stages},
        "review_waiting": counts["review"], "replies_waiting": counts["replies"],
        "today": today,
        "queues": {"queued": counts["queued"], "held": counts["held"],
                   "rescheduled": counts["rescheduled"]},
        "mailbox": {"from_address": box["from_address"], "paused": box["paused_at"] is not None,
                    "paused_reason": box["paused_reason"]} if box else None,
        "connections": [{"key": c["key"], "configured": c["configured"],
                         "ok": c["last_test"]["ok"] if c["last_test"] else None} for c in links],
        "simulated": engine.providers.simulated,
    }


@router.get("/connections")
async def connection_list(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    return {"connections": await connections.view(_engine(request))}


@router.post("/connections/{key}/test")
async def connection_test(key: str, request: Request,
                          staff: Staff = Depends(platform_admin)) -> dict:
    if key not in connections.SERVICES:
        raise HTTPException(status_code=404, detail="no such connection")
    ok, message = await connections.test(_engine(request), key)
    async with _office(request) as conn:
        at = await conn.fetchval(
            "insert into outreach_connection_tests (service, ok, message, by_email) "
            "values ($1, $2, $3, $4) returning at", key, ok, message, _by(staff))
        await backoffice.audit(conn, staff, "outreach.connection_test", "outreach_connection",
                               key, detail={"ok": ok})
    return {"key": key, "ok": ok, "message": message, "at": at.isoformat(), "by": _by(staff)}


DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _days(days: tuple[int, ...]) -> str:
    if len(days) == 5 and days == tuple(sorted(days)) and days[-1] - days[0] == 4:
        return f"{DAY_NAMES[days[0]]} to {DAY_NAMES[days[-1]]}"
    return f"{DAY_NAMES[days[0]]} to {DAY_NAMES[days[-1]]}"


def _settings_view(row, s) -> dict:
    return {
        "kill_switch": _kill(row), "global_daily_cap": row["daily_cap"],
        "default_level": row["default_level"], "honeytokens": list(row["honeytokens"] or []),
        "booking_url": row["booking_url"], "booking_url_default": s.outreach_booking_url,
        "updated_by": row["updated_by"], "updated_at": _iso(row["updated_at"]),
        "models": {"fast": s.outreach_model_fast, "draft": s.outreach_model_draft},
        "daily_model_usd": s.outreach_daily_model_usd,
        "policy": [{"country": c.code, "lane": c.lane, "bases": list(c.bases), "cap": c.cap,
                    "time_zone": c.zone, "working_days": _days(c.days),
                    "hours": f"{c.opens:%H:%M} to {c.closes:%H:%M}",
                    "free_mail_refused": c.refuse_free_mail, "note": c.note}
                   for c in policy.COUNTRIES.values()],
    }


@router.get("/settings")
async def get_settings_(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        return _settings_view(await store.settings_row(conn), _engine(request).settings)


@router.put("/settings")
async def put_settings(body: SettingsChange, request: Request,
                       staff: Staff = Depends(platform_admin)) -> dict:
    changes = body.model_dump(exclude_none=True)
    if "global_daily_cap" in changes:
        changes["daily_cap"] = changes.pop("global_daily_cap")
    if "honeytokens" in changes:
        changes["honeytokens"] = sorted({h.strip().lower() for h in changes["honeytokens"]
                                         if "@" in h})
    if changes.get("booking_url") and not changes["booking_url"].startswith("https://"):
        raise HTTPException(status_code=422, detail="the booking link must start with https://")
    async with _office(request) as conn:
        for name, value in changes.items():
            await conn.execute(f"update outreach_settings set {name} = $1", value)
        await conn.execute("update outreach_settings set updated_by = $1, updated_at = now()",
                           _by(staff))
        await backoffice.audit(conn, staff, "outreach.settings", "outreach_settings", "",
                               detail={k: (len(v) if k == "honeytokens" else v)
                                       for k, v in changes.items()})
        return _settings_view(await store.settings_row(conn), _engine(request).settings)


@router.post("/kill-switch")
async def kill_switch(body: KillSwitch, request: Request,
                      staff: Staff = Depends(platform_admin)) -> dict:
    if body.on and not body.reason.strip():
        raise HTTPException(status_code=422, detail="say why")
    async with _office(request) as conn:
        await conn.execute(
            "update outreach_settings set kill_switch = $1, kill_reason = $2, kill_at = now(), "
            "kill_by = $3", body.on, body.reason.strip() if body.on else "", _by(staff))
        await backoffice.audit(conn, staff, "outreach.kill_switch", "outreach_settings", "",
                               detail={"on": body.on, "reason": body.reason})
        return _kill(await store.settings_row(conn))


@router.post("/mailbox/resume")
async def mailbox_resume(request: Request, staff: Staff = Depends(platform_admin)) -> dict:
    """Only a person resumes a mailbox the gateway paused (the engine may only pause)."""
    s = _engine(request).settings
    async with _office(request) as conn:
        box = await store.mailbox(conn, s.outreach_from, s.outreach_from_name)
        if box is None:
            raise HTTPException(status_code=409, detail="no outreach mailbox is configured")
        await conn.execute(
            "update outreach_mailboxes set paused_at = null, paused_reason = '' where id = $1",
            box["id"])
        await backoffice.audit(conn, staff, "outreach.mailbox_resumed", "outreach_mailbox",
                               box["id"], detail={"was": box["paused_reason"]})
    return {"paused": False}


# ── prospects ──────────────────────────────────────────────


@router.get("/prospects")
async def prospects(
    request: Request, stage: str = Query(default="", max_length=20),
    country: str = Query(default="", max_length=2), q: str = Query(default="", max_length=100),
    _: Staff = Depends(platform_admin),
) -> dict:
    async with _office(request) as conn:
        default = (await store.settings_row(conn))["default_level"]
        rows = await conn.fetch(
            "select * from outreach_prospects where ($1 = '' or stage = $1) "
            "and ($2 = '' or country = upper($2)) and ($3 = '' or company ilike '%' || $3 || '%' "
            "or domain ilike '%' || $3 || '%') order by updated_at desc limit 500",
            stage, country, q)
    return {"prospects": [_row(r, default) for r in rows]}


def _internal(fields: dict) -> dict:
    """The screens' contact_* names to the table's."""
    names = {"contact_first_name": "first_name", "contact_last_name": "last_name",
             "contact_role": "role", "contact_email": "email"}
    return {names.get(k, k): v for k, v in fields.items()}


@router.post("/prospects")
async def add_prospect(body: NewProspect, request: Request,
                       staff: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        try:
            pid = await sources.add(conn, _internal(body.model_dump()), source="manual",
                                    created_by=_by(staff), require_basis=True)
        except sources.Refused as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        await backoffice.audit(conn, staff, "outreach.prospect_added", "outreach_prospect", pid)
    return {"id": str(pid)}


@router.post("/prospects/import")
async def import_prospects(body: Import, request: Request,
                           staff: Staff = Depends(platform_admin)) -> dict:
    """`{csv}` or `{geojson, release}`; a CSV field that holds GeoJSON is read as GeoJSON too."""
    if body.geojson is not None:
        text = body.geojson if isinstance(body.geojson, str) else json.dumps(body.geojson)
    elif body.csv is not None:
        text = body.csv
    else:
        raise HTTPException(status_code=422, detail="send csv or geojson")
    if len(text) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="at most 10 MB")
    async with _office(request) as conn:
        try:
            result = await sources.import_file(conn, text.lstrip("﻿"),
                                               created_by=_by(staff), release=body.release,
                                               country=body.country.upper())
        except sources.Refused as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        await backoffice.audit(conn, staff, "outreach.import", "outreach_prospect", "",
                               detail={"source": result["source"], "added": len(result["added"]),
                                       "skipped": len(result["skipped"]),
                                       "release": body.release})
    return {"added": len(result["added"]), "ids": result["added"],
            "skipped": result["skipped"], "source": result["source"]}


@router.post("/discover")
async def discover(body: Discover, request: Request,
                   staff: Staff = Depends(platform_admin)) -> dict:
    if policy.lane(body.country) == policy.BLOCKED:
        raise HTTPException(status_code=422, detail="that country is not in the outreach policy")
    async with _office(request) as conn:
        job = await _engine(request).queue(conn, DISCOVER, {
            "query": body.query, "country": body.country.upper(), "limit": body.limit,
            "provider": body.provider})
        await backoffice.audit(conn, staff, "outreach.discover", "outreach_prospect", "",
                               detail=body.model_dump())
    return {"queued": True, "job_id": str(job)}


@router.get("/prospects/{prospect_id}")
async def prospect_detail(prospect_id: UUID, request: Request,
                          _: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        p = await _get_prospect(conn, prospect_id)
        default = (await store.settings_row(conn))["default_level"]
        claims = await conn.fetch(
            "select * from outreach_claims where prospect_id = $1 order by id", prospect_id)
        found = await conn.fetch(
            "select email, source_url, kind, found_at from outreach_found_emails "
            "where prospect_id = $1 order by id", prospect_id)
        drafts = await conn.fetch(
            "select * from outreach_drafts where prospect_id = $1 "
            "order by created_at desc, step desc, version desc", prospect_id)
        approvals = await conn.fetch(
            "select a.* from outreach_approvals a join outreach_drafts d on d.id = a.draft_id "
            "where d.prospect_id = $1 order by a.at", prospect_id)
        intents = await conn.fetch(
            "select * from outreach_intents where prospect_id = $1 order by step", prospect_id)
        sends = await conn.fetch(
            "select s.*, i.draft_id from outreach_sends s join outreach_intents i "
            "on i.id = s.intent_id where s.prospect_id = $1 order by s.sent_at", prospect_id)
        replies = await conn.fetch(REPLY_SQL + "where r.prospect_id = $1 order by r.received_at",
                                   prospect_id)
        events = await conn.fetch(
            "select kind, detail, at from outreach_events where prospect_id = $1 "
            "and kind <> 'model' order by at desc, id desc", prospect_id)
        pages = await conn.fetch(
            "select url, fetched_at, fetched_by from outreach_pages where prospect_id = $1",
            prospect_id)
    return {
        **_detail_row(p, default),
        "claims": [_claim(c) for c in claims],
        "pages": [{"url": r["url"], "fetched_at": r["fetched_at"].isoformat(),
                   "by": r["fetched_by"]} for r in pages],
        "published_emails": [{"email": r["email"], "source_url": r["source_url"],
                              "kind": r["kind"], "found_at": r["found_at"].isoformat()}
                             for r in found],
        "drafts": [_draft(d) for d in drafts],
        "approvals": [{"id": str(a["id"]), "draft_id": str(a["draft_id"]),
                       "body_hash": a["body_hash"], "by": a["staff_email"],
                       "at": a["at"].isoformat()} for a in approvals],
        "intents": [{"id": str(i["id"]), "step": i["step"], "draft_id": str(i["draft_id"]),
                     "run_at": i["run_at"].isoformat(), "status": i["status"],
                     "last_check": i["last_check"], "last_result": i["last_result"]}
                    for i in intents],
        "sends": [{"id": str(x["id"]), "draft_id": str(x["draft_id"]), "step": x["step"],
                   "sent_at": x["sent_at"].isoformat(), "message_id": x["message_id"],
                   "status": x["status"]} for x in sends],
        "replies": [_reply(r) for r in replies],
        "events": [{"at": e["at"].isoformat(), "kind": e["kind"],
                    # Who on the staff did it is on the audit log; the timeline holds no address.
                    "actor": "staff" if e["kind"] in STAFF_EVENTS else "engine",
                    "detail": e["detail"]} for e in events],
    }


@router.patch("/prospects/{prospect_id}")
async def change_prospect(prospect_id: UUID, body: ProspectChange, request: Request,
                          staff: Staff = Depends(platform_admin)) -> dict:
    changes = _internal(body.model_dump(exclude_none=True))
    disqualify = changes.pop("disqualify", None)
    async with _office(request) as conn:
        p = await _get_prospect(conn, prospect_id)
        if "email" in changes:
            email = changes["email"].strip().lower()
            if email:
                if not sources.EMAIL.match(email):
                    raise HTTPException(status_code=422, detail="that email is not valid")
                row = await store.settings_row(conn)
                if store.honeytoken(row, email):
                    raise HTTPException(status_code=422, detail="that address may not be used")
            changes["email"] = email or None
            changes["email_hash"] = store.email_hash(email) if email else None
            changes["email_source"] = "manual" if email else ""
            changes["email_verification"] = ""
        for name, value in changes.items():
            await conn.execute(
                f"update outreach_prospects set {name} = $2, updated_at = now() where id = $1",
                prospect_id, value)
        if disqualify is not None:
            await store.stop_sequence(conn, prospect_id, "disqualified",
                                      disqualify or "disqualified by staff")
        elif p["stage"] == "needs_human" and {"email", "basis", "basis_note"} & set(changes):
            await store.set_stage(conn, prospect_id, "new", "changed by staff")
        await backoffice.audit(conn, staff, "outreach.prospect_changed", "outreach_prospect",
                               prospect_id, detail={"fields": sorted(changes),
                                                    "disqualify": disqualify is not None})
    return {"ok": True}


@router.post("/prospects/{prospect_id}/research")
async def research_prospect(prospect_id: UUID, request: Request,
                            staff: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        p = await _get_prospect(conn, prospect_id)
        if p["stage"] in store.FINISHED or p["stage"] in store.ACTIVE:
            raise HTTPException(status_code=409, detail=f"the prospect is {p['stage']}")
        job = await _engine(request).queue(conn, RESEARCH, {"prospect_id": str(prospect_id)})
        await backoffice.audit(conn, staff, "outreach.research", "outreach_prospect",
                               prospect_id)
    return {"queued": True, "job_id": str(job)}


@router.post("/prospects/{prospect_id}/pause")
async def pause(prospect_id: UUID, request: Request,
                staff: Staff = Depends(platform_admin)) -> dict:
    return await _pause(request, staff, prospect_id, True)


@router.post("/prospects/{prospect_id}/resume")
async def resume(prospect_id: UUID, request: Request,
                 staff: Staff = Depends(platform_admin)) -> dict:
    return await _pause(request, staff, prospect_id, False)


async def _pause(request: Request, staff: Staff, prospect_id: UUID, paused: bool) -> dict:
    async with _office(request) as conn:
        await _get_prospect(conn, prospect_id)
        await conn.execute(
            "update outreach_prospects set paused = $2, updated_at = now() where id = $1",
            prospect_id, paused)
        await store.event(conn, prospect_id, "paused" if paused else "resumed")
        await backoffice.audit(conn, staff, "outreach.paused" if paused else "outreach.resumed",
                               "outreach_prospect", prospect_id)
    return {"paused": paused}


# ── review ─────────────────────────────────────────────────


@router.get("/review")
async def review(request: Request, _: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        default = (await store.settings_row(conn))["default_level"]
        firsts = await conn.fetch(
            "select * from outreach_drafts d where status = 'in_review' and (step in (1, 4) or "
            "not exists (select 1 from outreach_drafts f where f.prospect_id = d.prospect_id "
            "and f.step = 1 and f.status = 'in_review')) order by created_at limit 100")
        items = []
        for d in firsts:
            p = await conn.fetchrow("select * from outreach_prospects where id = $1",
                                    d["prospect_id"])
            claims = await conn.fetch(
                "select * from outreach_claims where prospect_id = $1 order by id",
                d["prospect_id"])
            follow = await conn.fetch(
                "select distinct on (step) * from outreach_drafts where prospect_id = $1 "
                "and step in (2, 3) and status = 'in_review' and $2 = 1 "
                "order by step, version desc", d["prospect_id"], d["step"])
            refusal = policy.basis_refusal(p["country"], p["basis"], p["basis_note"],
                                           p["email"] or "", p["email_source"] == "published")
            shown = _detail_row(p, default)
            items.append({
                "draft": _draft(d), "follow_ups": [_draft(f) for f in follow],
                "prospect": {k: shown[k] for k in (
                    "id", "company", "website", "domain", "country", "lane", "business_type",
                    "contact_first_name", "contact_role", "email_verifier", "basis",
                    "basis_note", "level", "fit_score", "fit_reason", "language",
                    "email_source")},
                "claims": [_claim(c) for c in claims if c["kept"]],
                "dropped_claims": sum(1 for c in claims if not c["kept"]),
                "waiting_since": d["created_at"].isoformat(),
                "basis_problem": refusal or None,
                "warnings": (["the address accepts any mail (accept_all): it may bounce"]
                             if p["email_verification"] == "accept_all" else [])
                + (["a free-mail address published on the business's own site"]
                   if p["email"] and policy.free_mail(p["email"]) else []),
            })
    return {"items": items}


@router.post("/drafts/{draft_id}/approve")
async def approve(draft_id: UUID, body: Approve, request: Request,
                  staff: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        try:
            approved = await sequences.approve(_engine(request), conn, draft_id, body.body_hash,
                                               body.with_follow_ups, _by(staff))
        except sequences.Refused as error:
            raise _refused(error, 404 if error.code == "not_found" else 409) from error
        await backoffice.audit(conn, staff, "outreach.approved", "outreach_draft", draft_id,
                               detail={"drafts": approved,
                                       "with_follow_ups": body.with_follow_ups})
    return {"approved": approved}


@router.post("/drafts/{draft_id}/edit")
async def edit(draft_id: UUID, body: Edit, request: Request,
               staff: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        try:
            result = await sequences.edit(_engine(request), conn, draft_id, body.subject.strip(),
                                          body.body.replace("\r\n", "\n"), _by(staff))
        except sequences.Refused as error:
            raise _refused(error, 404 if error.code == "not_found" else 409) from error
        await backoffice.audit(conn, staff, "outreach.edited", "outreach_draft", draft_id,
                               detail={"new": result["id"]})
        draft = await conn.fetchrow("select * from outreach_drafts where id = $1",
                                    UUID(result["id"]))
    return {"id": result["id"], "lint": _check(result["lint"]), "draft": _draft(draft)}


@router.post("/drafts/{draft_id}/reject")
async def reject(draft_id: UUID, body: Reason, request: Request,
                 staff: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        try:
            await sequences.reject(conn, draft_id, body.reason)
        except sequences.Refused as error:
            raise _refused(error, 404 if error.code == "not_found" else 409) from error
        await backoffice.audit(conn, staff, "outreach.rejected", "outreach_draft", draft_id,
                               detail={"reason": body.reason})
    return {"rejected": True}


# ── replies and activity ───────────────────────────────────


@router.get("/replies")
async def reply_list(request: Request, handled: bool = False,
                     _: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        rows = await conn.fetch(
            REPLY_SQL + "where r.needs_founder and (r.handled_at is not null) = $1 "
            "order by r.received_at desc limit 200", handled)
    return {"replies": [_reply(r) for r in rows]}


@router.post("/replies/{reply_id}/handled")
async def reply_handled(reply_id: UUID, body: Note, request: Request,
                        staff: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        done = await conn.fetchval(
            "update outreach_replies set handled_by = $2, handled_at = now(), note = $3 "
            "where id = $1 returning true", reply_id, _by(staff), body.note)
        if not done:
            raise HTTPException(status_code=404, detail="no such reply")
        await backoffice.audit(conn, staff, "outreach.reply_handled", "outreach_reply", reply_id)
    return {"handled": True}


def _activity_kind(kind: str, detail: dict) -> str | None:
    if kind == "sent":
        return "send"
    if kind == "gateway":
        return "refusal"
    if kind == "reply":
        return "reply"
    if kind == "stage" and detail.get("after") in ("opted_out", "bounced"):
        return "opt_out" if detail["after"] == "opted_out" else "bounce"
    return None


def _activity_words(kind: str, detail: dict) -> str:
    if kind == "refusal":
        return str(detail.get("reason") or "")
    if kind == "reply":
        return ", ".join(detail.get("labels") or []) or "a reply"
    if kind in ("opt_out", "bounce"):
        return str(detail.get("reason") or "")
    return "sent"


@router.get("/activity")
async def activity(request: Request, kind: str = Query(default="", max_length=30),
                   _: Staff = Depends(platform_admin)) -> dict:
    async with _office(request) as conn:
        rows = await conn.fetch(
            "select e.id, e.kind, e.detail, e.at, e.prospect_id, p.company, p.erased_at "
            "from outreach_events e left join outreach_prospects p on p.id = e.prospect_id "
            "where e.kind in ('sent', 'gateway', 'reply') or (e.kind = 'stage' and "
            "e.detail->>'after' in ('opted_out', 'bounced')) "
            "order by e.at desc, e.id desc limit 500")
        today = await _today(conn, _engine(request))
    items, counts = [], {}
    for r in rows:
        shown = _activity_kind(r["kind"], r["detail"])
        if shown is None or (kind and shown != kind):
            continue
        counts[shown] = counts.get(shown, 0) + 1
        d = r["detail"]
        items.append({
            "id": str(r["id"]), "kind": shown, "at": r["at"].isoformat(),
            "prospect_id": None if r["erased_at"] or not r["prospect_id"]
            else str(r["prospect_id"]),
            "company": r["company"] or "", "step": d.get("step"),
            "check": d.get("check") if shown == "refusal" else None,
            "outcome": OUTCOMES.get(d.get("outcome", ""), d.get("outcome", ""))
            if shown == "refusal" else "",
            "detail": _activity_words(shown, d),
        })
    return {"items": items[:300], "today": today, "counts": counts}


# ── one-click unsubscribe (public) ─────────────────────────


def _page(title: str, text: str, button: bool, token: str = "") -> HTMLResponse:
    form = (f'<form method="post" action="/o/unsubscribe/{html.escape(token)}">'
            '<button type="submit">Unsubscribe · إلغاء الاشتراك</button></form>') if button else ""
    return HTMLResponse(
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<meta name='robots' content='noindex'><title>ALYR</title>"
        "<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;"
        "padding:0 1rem;color:#111;background:#fff}button{font:inherit;padding:.7rem 1.2rem;"
        "border:1px solid #111;background:#111;color:#fff;border-radius:4px;cursor:pointer}"
        "@media (prefers-color-scheme:dark){body{background:#111;color:#eee}"
        "button{background:#eee;color:#111;border-color:#eee}}</style></head><body>"
        f"<h1>{title}</h1><p>{text}</p>{form}</body></html>",
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@public.get("/o/unsubscribe/{token}", response_class=HTMLResponse)
async def unsubscribe_page(token: str, request: Request) -> HTMLResponse:
    if unsubscribe.read(_engine(request).settings, token) is None:
        return _page("This link does not work", "Reply “stop” to the email instead. · "
                     "ردّ بكلمة «توقف» على الرسالة.", False)
    return _page("Stop these emails?", "One press and ALYR will not write to you again. · "
                 "بضغطة واحدة لن تراسلك ALYR مجدداً.", True, token)


@public.post("/o/unsubscribe/{token}", response_class=HTMLResponse)
async def unsubscribe_now(token: str, request: Request) -> HTMLResponse:
    send_id = unsubscribe.read(_engine(request).settings, token)
    if send_id is None or not await unsubscribe.use(_engine(request), send_id):
        return HTMLResponse(_page("This link does not work", "Reply “stop” to the email "
                                  "instead. · ردّ بكلمة «توقف» على الرسالة.", False).body,
                            status_code=404)
    return _page("Done", "You will not hear from ALYR again. · لن تراسلك ALYR مجدداً.", False)
