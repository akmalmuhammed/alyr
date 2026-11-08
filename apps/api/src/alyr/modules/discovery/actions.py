"""Discovery's actions, on `core/actions.py` (spec 065, D-160).

The one door: the workspace routes are a thin layer over these, and WhatsApp and the MCP
connector call the same actions later, so who may do what is written once.

Roles: `owner` and `admin` do everything. `agent` (staff) may read findings and reviews and start a
check-up, and changes nothing else; Discovery holds no money, so there is nothing to hide from
them. Reads are not put on the activity record; changes are, with the channel they came through:
`start_run`, `set_finding_status`, `edit_locations`, `set_connection`.

Everything answers in the reader's language (`lang`), already worded.
"""

import re
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core import team
from alyr.core.actions import ADMIN, ALL_ROLES, OWNER, Caller, register
from alyr.modules.discovery import connectors, engine, rules
from alyr.modules.discovery import words as w
from alyr.modules.discovery.connectors import sample
from alyr.modules.discovery.errors import DiscoveryError

MODULE = "discovery"
CHANGERS = frozenset({OWNER, ADMIN})
MAX_LOCATIONS = 50
SETTABLE = ("skipped", "open", "owner_done")
DONE_STATUSES = ("owner_done", "verified", "gone")
ALL_STATUSES = w.STATUSES
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"
_ORDER = (
    "case f.severity when 'high' then 0 when 'medium' then 1 else 2 end, "
    "case f.kind when 'agent' then 0 when 'owner' then 1 else 2 end, f.created_at, f.id"
)
_FINDING = (
    "select f.*, l.name as place_name, l.name_ar as place_name_ar "
    "from discovery_findings f left join discovery_locations l on l.id = f.location_id"
)
_NUMBER = re.compile(r"^\+[1-9][0-9]{6,14}$")
_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


# ── how things look to the reader ───────────────────────────────────────────────────────


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


async def _lang(conn: asyncpg.Connection, lang: str | None) -> str:
    """The language asked for, else the business's own (`owner_lang`)."""
    if lang in ("en", "ar"):
        return lang
    found = await conn.fetchval(f"select owner_lang from tenants where id = {_TENANT}")
    return found if found in ("en", "ar") else "en"


def _place(row, lang: str) -> dict | None:
    if row["location_id"] is None:
        return None
    name = row["place_name_ar"] if lang == "ar" and row["place_name_ar"] else row["place_name"]
    return {"id": str(row["location_id"]), "name": name}


def finding_view(row: asyncpg.Record, lang: str) -> dict:
    """A finding: its words in the reader's language, the rule behind it, its evidence."""
    rule_id = row["rule_id"]
    return {
        "id": str(row["id"]),
        "rule_id": rule_id,
        "kind": row["kind"],
        "severity": row["severity"],
        "status": row["status"],
        "title": w.rule_text(rule_id, "title", lang),
        "rule": w.rule_text(rule_id, "rule", lang),
        "why": w.rule_text(rule_id, "why", lang),
        "what_happens": w.rule_text(rule_id, "what_happens", lang),
        "what_is_needed": w.rule_text(rule_id, "what_is_needed", lang),
        "evidence": [w.evidence_view(item, lang) for item in row["evidence"]],
        "location": _place(row, lang),
        "first_seen_at": _iso(row["created_at"]),
        "last_seen_at": _iso(row["last_seen_at"]),
    }


def step_views(steps) -> list[dict]:
    return [
        {
            "seq": s["seq"],
            "tool": s["tool"],
            "summary": s["summary"],
            "ok": s["ok"],
            "started_at": _iso(s["started_at"]),
            "ended_at": _iso(s["ended_at"]),
        }
        for s in steps
    ]


def run_view(row: asyncpg.Record, lang: str, steps: list | None = None) -> dict:
    view = {
        "id": str(row["id"]),
        "status": row["status"],
        "trigger": row["trigger"],
        "connector": row["connector_kind"],
        "score": row["score"],
        "score_parts": row["score_parts"],
        "steps_used": row["steps_used"],
        "step_budget": row["step_budget"],
        "error": (row["error_ar"] if lang == "ar" else row["error"])
        if row["status"] == "failed" else None,
        "error_code": row["error_code"] if row["status"] == "failed" else None,
        "created_at": _iso(row["created_at"]),
        "started_at": _iso(row["started_at"]),
        "finished_at": _iso(row["finished_at"]),
    }
    if steps is not None:
        view["steps"] = step_views(steps)
    return view


def location_view(row: asyncpg.Record) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "name_ar": row["name_ar"],
        "area": row["area"],
        "place_ref": row["place_ref"],
        "website_url": row["website_url"],
        "whatsapp_e164": row["whatsapp_e164"],
        "is_primary": row["is_primary"],
        "position": row["position"],
    }


async def _record(
    conn: asyncpg.Connection, caller: Caller, subject_id: UUID, action: str, detail: dict
) -> None:
    await team.record(
        conn, "discovery", subject_id, action, caller.actor, detail=detail, channel=caller.channel
    )


async def _counts(conn: asyncpg.Connection, location_id: UUID | None = None) -> dict:
    rows = await conn.fetch(
        "select status, count(*) as n from discovery_findings "
        "where ($1::uuid is null or location_id = $1) group by status",
        location_id,
    )
    found = {r["status"]: r["n"] for r in rows}
    return {status: found.get(status, 0) for status in ALL_STATUSES}


# ── reads ───────────────────────────────────────────────────────────────────────────────


@register("discovery.overview", ALL_ROLES, MODULE)
async def get_overview(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    has_connection = bool(
        await conn.fetchval(
            "select exists (select 1 from discovery_connections where status = 'on')"
        )
    )
    last = await conn.fetchrow("select * from discovery_runs order by created_at desc limit 1")
    scored = await conn.fetch(
        "select * from discovery_runs where status = 'done' order by created_at desc limit 2"
    )
    counts = await _counts(conn)
    open_rows = await conn.fetch(f"{_FINDING} where f.status = 'open' order by {_ORDER}")
    next_row = next((r for r in open_rows if r["kind"] == "agent"), None) or (
        open_rows[0] if open_rows else None
    )
    rest = [r for r in open_rows if next_row is None or r["id"] != next_row["id"]]
    done = await conn.fetch(
        f"{_FINDING} where f.status = any($1) order by f.updated_at desc, f.id limit 5",
        list(DONE_STATUSES),
    )
    delta = None
    if len(scored) == 2 and scored[0]["score"] is not None and scored[1]["score"] is not None:
        delta = {
            "score_change": scored[0]["score"] - scored[1]["score"],
            "since_run_id": str(scored[1]["id"]),
        }
    return {
        "has_connection": has_connection,
        "has_run": last is not None,
        "last_run": run_view(last, lang) if last else None,
        "score": scored[0]["score"] if scored else None,
        "score_parts": scored[0]["score_parts"] if scored else None,
        "counts": counts,
        "headline": w.overview_headline(
            counts["open"], sum(1 for r in open_rows if r["severity"] == "high"), bool(scored), lang
        ),
        "next": finding_view(next_row, lang) if next_row else None,
        "up_next": [finding_view(r, lang) for r in rest[:4]],
        "done": [finding_view(r, lang) for r in done],
        "delta": delta,
    }


@register("discovery.findings", ALL_ROLES, MODULE)
async def list_findings(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    status = args.get("status") or "open"
    if status == "done":
        wanted = list(DONE_STATUSES)
    elif status == "all":
        wanted = list(ALL_STATUSES)
    elif status in ALL_STATUSES:
        wanted = [status]
    else:
        raise DiscoveryError("bad_status")
    location_id = args.get("location_id")
    rows = await conn.fetch(
        f"{_FINDING} where f.status = any($1) and ($2::uuid is null or f.location_id = $2) "
        f"order by {_ORDER}",
        wanted,
        location_id,
    )
    return {
        "items": [finding_view(r, lang) for r in rows],
        "counts": await _counts(conn, location_id),
    }


@register("discovery.finding", ALL_ROLES, MODULE)
async def get_finding(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    row = await conn.fetchrow(f"{_FINDING} where f.id = $1", args["id"])
    if row is None:
        raise DiscoveryError("not_found", 404)
    part = rules.RULE_BY_ID[row["rule_id"]].part if row["rule_id"] in rules.RULE_BY_ID else None
    steps = await conn.fetch(
        "select * from discovery_run_steps where run_id = $1 and tool = any($2) order by seq",
        row["last_run_id"],
        ["connector.snapshot", f"rules.{part}"],
    )
    return finding_view(row, lang) | {
        "run_id": str(row["last_run_id"]),
        "steps": step_views(steps),
    }


@register("discovery.reviews", ALL_ROLES, MODULE)
async def list_reviews(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Public reviews, newest first. The text is data: it is returned as it was written and never
    acted on (it reaches no model and no template)."""
    lang = await _lang(conn, args.get("lang"))
    rows = await conn.fetch(
        "select r.*, l.name as place_name, l.name_ar as place_name_ar from discovery_reviews r "
        "join discovery_locations l on l.id = r.location_id "
        "where ($1::uuid is null or r.location_id = $1) and ($2::bool is null or r.replied = $2) "
        "and ($3::int is null or r.rating <= $3) order by r.posted_at desc, r.id limit 200",
        args.get("location_id"),
        args.get("replied"),
        args.get("max_rating"),
    )
    everything = await conn.fetch(
        "select r.location_id, r.rating, r.replied, l.name, l.name_ar from discovery_reviews r "
        "join discovery_locations l on l.id = r.location_id"
    )

    def stats(rows_) -> dict:
        n = len(rows_)
        return {
            "count": n,
            "average": round(sum(r["rating"] for r in rows_) / n, 1) if n else None,
            "unanswered": sum(1 for r in rows_ if not r["replied"]),
        }

    by_location = []
    for location_id in dict.fromkeys(r["location_id"] for r in everything):
        mine = [r for r in everything if r["location_id"] == location_id]
        name = mine[0]["name_ar"] if lang == "ar" and mine[0]["name_ar"] else mine[0]["name"]
        by_location.append({"location": {"id": str(location_id), "name": name}} | stats(mine))
    items = []
    for r in rows:
        name = r["place_name_ar"] if lang == "ar" and r["place_name_ar"] else r["place_name"]
        items.append(
            {
                "id": str(r["id"]),
                "location": {"id": str(r["location_id"]), "name": name},
                "rating": r["rating"],
                "posted_at": _iso(r["posted_at"]),
                "author_name": r["author_name"],
                "body": r["body"],
                "language": r["language"],
                "replied": r["replied"],
                "reply_text": r["reply_text"],
            }
        )
    return {"items": items, "summary": stats(everything) | {"by_location": by_location}}


@register("discovery.report", ALL_ROLES, MODULE)
async def get_report(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """A month in one page: the score at the start and the end, what was fixed, what is still open,
    what is new. Months are the shop's own (its time zone)."""
    lang = await _lang(conn, args.get("lang"))
    month = args.get("month") or ""
    match = _MONTH.match(month)
    if match is None:
        raise DiscoveryError("bad_month")
    year, number = int(match[1]), int(match[2])
    zone = ZoneInfo(
        await conn.fetchval(f"select timezone from tenants where id = {_TENANT}") or "Asia/Qatar"
    )
    first = datetime(year, number, 1, tzinfo=zone)
    after = datetime(year + (number == 12), number % 12 + 1, 1, tzinfo=zone)
    runs = await conn.fetch(
        "select * from discovery_runs where status = 'done' and started_at >= $1 "
        "and started_at < $2 "
        "order by started_at, id",
        first,
        after,
    )
    fixed = still = new = []
    by_part = None
    start = end = change = None
    if runs:
        ids = [r["id"] for r in runs]
        start, end = runs[0]["score"], runs[-1]["score"]
        if len(runs) > 1 and start is not None and end is not None:
            change = end - start
        by_part = runs[-1]["score_parts"]
        new = await conn.fetch(f"{_FINDING} where f.first_run_id = any($1) order by {_ORDER}", ids)
        fixed = await conn.fetch(
            f"{_FINDING} where f.resolved_run_id = any($1) and f.status in ('verified', 'gone') "
            f"order by {_ORDER}",
            ids,
        )
        still = await conn.fetch(
            f"{_FINDING} join discovery_runs fr on fr.id = f.first_run_id "
            f"left join discovery_runs rr on rr.id = f.resolved_run_id "
            f"where fr.created_at <= $1 and (rr.id is null or rr.created_at > $1) "
            f"order by {_ORDER}",
            runs[-1]["created_at"],
        )
    return {
        "month": month,
        "generated_at": datetime.now(UTC).isoformat(),
        "score_start": start,
        "score_end": end,
        "change": change,
        "headline": w.report_headline(month, start, end, len(runs), len(fixed), len(still), lang),
        "fixed": [finding_view(r, lang) for r in fixed],
        "still_open": [finding_view(r, lang) for r in still],
        "new": [finding_view(r, lang) for r in new],
        "by_part": by_part,
        "runs": len(runs),
    }


@register("discovery.run", ALL_ROLES, MODULE)
async def get_run(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    row = await conn.fetchrow("select * from discovery_runs where id = $1", args["id"])
    if row is None:
        raise DiscoveryError("not_found", 404)
    steps = await conn.fetch(
        "select * from discovery_run_steps where run_id = $1 order by seq", row["id"]
    )
    return run_view(row, lang, list(steps))


@register("discovery.latest_run", ALL_ROLES, MODULE)
async def latest_run(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict | None:
    lang = await _lang(conn, args.get("lang"))
    row = await conn.fetchrow("select * from discovery_runs order by created_at desc limit 1")
    if row is None:
        return None
    steps = await conn.fetch(
        "select * from discovery_run_steps where run_id = $1 order by seq", row["id"]
    )
    return run_view(row, lang, list(steps))


@register("discovery.locations", ALL_ROLES, MODULE)
async def list_locations(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    rows = await conn.fetch("select * from discovery_locations order by position, created_at")
    return {"items": [location_view(r) for r in rows]}


@register("discovery.connection", ALL_ROLES, MODULE)
async def get_connection(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    rows = await conn.fetch(
        "select kind, status, created_at from discovery_connections order by created_at"
    )
    on = next((r for r in rows if r["status"] == "on"), None)
    return {
        "kind": on["kind"] if on else None,
        "status": "on" if on else None,
        "available": list(connectors.AVAILABLE),
        "connections": [
            {"kind": r["kind"], "status": r["status"], "created_at": _iso(r["created_at"])}
            for r in rows
        ],
    }


# ── changes ─────────────────────────────────────────────────────────────────────────────


@register("discovery.start_run", ALL_ROLES, MODULE)
async def start_run(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Start a check-up, or return the one already queued or running. Staff may start one."""
    lang = await _lang(conn, args.get("lang"))
    run, created = await engine.start_run(conn, caller.user_id, "manual")
    if created:
        await _record(conn, caller, run["id"], "run.start", {"connector": run["connector_kind"]})
    return run_view(run, lang)


@register("discovery.set_finding_status", CHANGERS, MODULE)
async def set_finding_status(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Only `skipped`, `open` (undo) and `owner_done`: nothing is applied outside ALYR in
    Phase 1, so there is no "approved"."""
    lang = await _lang(conn, args.get("lang"))
    status = args.get("status")
    if status not in SETTABLE:
        raise DiscoveryError("bad_status")
    row = await conn.fetchrow(f"{_FINDING} where f.id = $1 for update of f", args["id"])
    if row is None:
        raise DiscoveryError("not_found", 404)
    if row["status"] in ("verified", "gone"):
        raise DiscoveryError("finding_closed", 409)
    if row["status"] != status:
        await conn.execute(
            "update discovery_findings set status = $2, updated_at = now() where id = $1",
            row["id"],
            status,
        )
        await _record(
            conn,
            caller,
            row["id"],
            "finding.status",
            {"rule_id": row["rule_id"], "from": row["status"], "to": status},
        )
    fresh = await conn.fetchrow(f"{_FINDING} where f.id = $1", row["id"])
    return finding_view(fresh, lang)


def _clean_location(item: dict) -> dict:
    name = (item.get("name") or "").strip()
    if not name:
        raise DiscoveryError("name_required")
    url = (item.get("website_url") or "").strip() or None
    if url and not re.match(r"^https?://[^\s]+$", url, re.I):
        raise DiscoveryError("bad_url")
    number = (item.get("whatsapp_e164") or "").strip().replace(" ", "") or None
    if number and not _NUMBER.match(number):
        raise DiscoveryError("bad_number")
    return {
        "id": item.get("id"),
        "name": name[:160],
        "name_ar": (item.get("name_ar") or "").strip()[:160],
        "area": (item.get("area") or "").strip()[:120],
        "place_ref": (item.get("place_ref") or "").strip()[:200] or None,
        "website_url": url[:300] if url else None,
        "whatsapp_e164": number,
        "is_primary": bool(item.get("is_primary")),
    }


@register("discovery.edit_locations", CHANGERS, MODULE)
async def edit_locations(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Replace the list of places: those with an `id` of this shop are changed, those without are
    added, those left out are removed (with their findings and reviews). At most 50; every one
    needs a name; one is primary."""
    items = args["items"]
    if not items:
        raise DiscoveryError("no_locations")
    if len(items) > MAX_LOCATIONS:
        raise DiscoveryError("too_many_locations", limit=MAX_LOCATIONS)
    cleaned = [_clean_location(i) for i in items]
    if await conn.fetchval(
        "select exists (select 1 from discovery_runs where status in ('queued', 'running'))"
    ):
        raise DiscoveryError("run_in_progress", 409)
    mine = {r["id"] for r in await conn.fetch("select id from discovery_locations")}
    given = [c["id"] for c in cleaned if c["id"] is not None]
    if any(g not in mine for g in given) or len(set(given)) != len(given):
        raise DiscoveryError("unknown_place")
    await conn.execute("delete from discovery_locations where not (id = any($1))", given)
    await conn.execute("update discovery_locations set is_primary = false")
    primary = next((i for i, c in enumerate(cleaned) if c["is_primary"]), 0)
    for position, c in enumerate(cleaned):
        fields = (
            c["name"],
            c["name_ar"],
            c["area"],
            c["place_ref"],
            c["website_url"],
            c["whatsapp_e164"],
            position,
        )
        if c["id"] is None:
            c["id"] = await conn.fetchval(
                "insert into discovery_locations (name, name_ar, area, place_ref, website_url, "
                "whatsapp_e164, position) values ($1, $2, $3, $4, $5, $6, $7) returning id",
                *fields,
            )
        else:
            await conn.execute(
                "update discovery_locations set name = $2, name_ar = $3, area = $4, "
                "place_ref = $5, "
                "website_url = $6, whatsapp_e164 = $7, position = $8 where id = $1",
                c["id"],
                *fields,
            )
    await conn.execute(
        "update discovery_locations set is_primary = true where id = $1", cleaned[primary]["id"]
    )
    await _record(
        conn,
        caller,
        await conn.fetchval(f"select {_TENANT}"),
        "locations.edit",
        {"count": len(cleaned)},
    )
    return await list_locations(conn, caller, {})


async def _ensure_places(conn: asyncpg.Connection, kind: str) -> None:
    """A shop with no places gets some when it turns a connection on: the five fictional branches
    for the sample, one made from the shop's own name otherwise."""
    if await conn.fetchval("select exists (select 1 from discovery_locations)"):
        return
    if kind == sample.KIND:
        for position, item in enumerate(sample.locations_to_create()):
            await conn.execute(
                "insert into discovery_locations (name, name_ar, area, place_ref, website_url, "
                "whatsapp_e164, is_primary, position) values ($1, $2, $3, $4, $5, $6, $7, $8)",
                item["name"],
                item["name_ar"],
                item["area"],
                item["place_ref"],
                item["website_url"],
                item["whatsapp_e164"],
                item["is_primary"],
                position,
            )
        return
    shop = await conn.fetchrow(f"select name, name_ar from tenants where id = {_TENANT}")
    await conn.execute(
        "insert into discovery_locations (name, name_ar, is_primary) values ($1, $2, true)",
        shop["name"],
        shop["name_ar"],
    )


@register("discovery.set_connection", CHANGERS, MODULE)
async def set_connection(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Turn a connector on or off. One is on at a time: turning one on turns the others off."""
    kind, on = args["kind"], bool(args["on"])
    if kind not in connectors.AVAILABLE:
        raise DiscoveryError("bad_connector")
    if on:
        await conn.execute(
            "update discovery_connections set status = 'off', updated_at = now() "
            "where status = 'on' and kind <> $1",
            kind,
        )
        row = await conn.fetchrow(
            "select id, status from discovery_connections where kind = $1 "
            "order by created_at limit 1",
            kind,
        )
        if row is None:
            row_id = await conn.fetchval(
                "insert into discovery_connections (kind, status) values ($1, 'on') returning id",
                kind,
            )
        else:
            row_id = row["id"]
            await conn.execute(
                "update discovery_connections set status = 'on', updated_at = now() where id = $1",
                row_id,
            )
        await _ensure_places(conn, kind)
    else:
        row_id = await conn.fetchval(
            "update discovery_connections set status = 'off', updated_at = now() "
            "where kind = $1 and status = 'on' returning id",
            kind,
        )
    if row_id is not None:
        await _record(
            conn, caller, row_id, "connection.on" if on else "connection.off", {"kind": kind}
        )
    return await get_connection(conn, caller, {})
