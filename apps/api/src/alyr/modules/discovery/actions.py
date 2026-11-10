"""Discovery's actions, on `core/actions.py` (spec 065, D-160).

The one door: the workspace routes are a thin layer over these, and WhatsApp and the MCP
connector call the same actions later, so who may do what is written once.

Roles: `owner` and `admin` do everything. `agent` (staff) may read findings and reviews and start a
check-up, and changes nothing else, unless an owner or admin linked them to a place (a branch
manager, spec 066): then they act on that place's proposals and facts and on nothing else.
Discovery holds no money, so there is nothing to hide from them. The check-up itself (role
`engine`) may prepare proposals and can never approve one. Reads are not put on the activity
record; changes are, with the channel they came through: `start_run`, `set_finding_status`,
`edit_locations`, `set_connection`, and in Phase 2 `proposal.*`, `fact.set`, `managers.set`,
`settings.set`, `asks.opt`.

Everything answers in the reader's language (`lang`), already worded.
"""

import re
from datetime import UTC, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import get_settings
from alyr.core import consent, team
from alyr.core.actions import ADMIN, ALL_ROLES, ENGINE, OWNER, Caller, register
from alyr.modules.discovery import apply as applying
from alyr.modules.discovery import connectors, engine, proposals, rules
from alyr.modules.discovery import facts as facts_module
from alyr.modules.discovery import words as w
from alyr.modules.discovery.connectors import Location, sample
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


async def finding_views(
    conn: asyncpg.Connection, caller: Caller, lang: str, rows
) -> list[dict]:
    """Findings as the reader sees them, with what Phase 2 adds to each: its proposals (the
    caller's places only), the fact it waits for, and whether a change can be prepared."""
    rows = list(rows)
    scope = await proposals.scope_of(conn, caller)
    extras = await proposals.for_findings(conn, caller, scope, lang, rows)
    return [finding_view(r, lang) | extras[r["id"]] for r in rows]


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
    shown = ([next_row] if next_row else []) + rest[:4] + list(done)
    by_id = {v["id"]: v for v in await finding_views(conn, caller, lang, shown)}
    scope = await proposals.scope_of(conn, caller)
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
        "next": by_id[str(next_row["id"])] if next_row else None,
        "up_next": [by_id[str(r["id"])] for r in rest[:4]],
        "done": [by_id[str(r["id"])] for r in done],
        "delta": delta,
        "proposals": await proposals.overview_block(conn, caller, scope, lang),
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
    scope = await proposals.scope_of(conn, caller)
    waiting: dict = {}
    if rows and not scope.nothing:
        waiting = {
            r["finding_id"]: r["n"]
            for r in await conn.fetch(
                "select finding_id, count(*) as n from discovery_proposals "
                "where finding_id = any($1) and status = 'proposed' and expires_at > now() "
                "and ($2::uuid[] is null or location_id = any($2)) group by finding_id",
                [r["id"] for r in rows],
                None if scope.everywhere else list(scope.places),
            )
        }
    return {
        "items": [
            finding_view(r, lang) | {"proposals_waiting": waiting.get(r["id"], 0)} for r in rows
        ],
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
    [view] = await finding_views(conn, caller, lang, [row])
    return view | {
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
        "fixed": await finding_views(conn, caller, lang, fixed),
        "still_open": await finding_views(conn, caller, lang, still),
        "new": await finding_views(conn, caller, lang, new),
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


CHECK_STATES = (rules.PASS, rules.FAIL, rules.NOT_MEASURED)


def _states(checks) -> dict[tuple[str | None, str], str]:
    """A run's kept outcomes as {(place id, or None for the whole business; rule id): state}. A
    rule or a state this code does not know is left out: it is never shown as something else."""
    found: dict[tuple[str | None, str], str] = {}
    for item in checks or []:
        if not isinstance(item, dict):
            continue
        rule, state, place = item.get("rule"), item.get("state"), item.get("location")
        if rule not in rules.RULE_BY_ID or state not in CHECK_STATES:
            continue
        if place is None or isinstance(place, str):
            found[(place, rule)] = state
    return found


def _checks_row(place: str | None, now: dict, before: dict) -> dict:
    checks = {r.id: now[(place, r.id)] for r in rules.RULES if (place, r.id) in now}
    states = list(checks.values())
    return {
        "checks": checks,
        # failed in the check-up before, passes now
        "fixed": [
            rule
            for rule, state in checks.items()
            if state == rules.PASS and before.get((place, rule)) == rules.FAIL
        ],
        "passed": states.count(rules.PASS),
        "failed": states.count(rules.FAIL),
        "not_measured": states.count(rules.NOT_MEASURED),
    }


@register("discovery.checks", ALL_ROLES, MODULE)
async def get_checks(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Every place against every check, from the last finished check-up (spec 065, "Checks per
    place"). A check-up made before outcomes were kept answers `measured: false`."""
    lang = await _lang(conn, args.get("lang"))
    columns = [
        {"id": r.id, "part": r.part, "label": w.pick(w.CHECK_NAMES[r.id], lang)}
        for r in rules.RULES
    ]
    runs = await conn.fetch(
        "select id, finished_at, checks from discovery_runs where status = 'done' "
        "order by created_at desc limit 2"
    )
    last = runs[0] if runs else None
    now = _states(last["checks"]) if last else {}
    answer = {
        "run_id": str(last["id"]) if last else None,
        "finished_at": _iso(last["finished_at"]) if last else None,
        "measured": bool(now),
        "rules": columns,
        "places": [],
        "business": None,
    }
    if not now:
        return answer
    before = _states(runs[1]["checks"]) if len(runs) > 1 else {}
    places = await conn.fetch(
        "select id, name, name_ar from discovery_locations order by position, created_at"
    )
    answer["places"] = [
        {"id": str(p["id"]), "name": p["name_ar"] if lang == "ar" and p["name_ar"] else p["name"]}
        | _checks_row(str(p["id"]), now, before)
        for p in places
    ]
    if any(place is None for place, _ in now):
        answer["business"] = _checks_row(None, now, before)
    return answer


@register("discovery.locations", ALL_ROLES, MODULE)
async def list_locations(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    rows = await conn.fetch("select * from discovery_locations order by position, created_at")
    # Who manages each place (spec 066, for the branch-manager picker): owner and admin only.
    managers: dict = {}
    if caller.role in CHANGERS:
        for m in await conn.fetch(
            "select dm.location_id, u.id, u.name from discovery_location_managers dm "
            "join users u on u.id = dm.user_id order by u.name, u.id"
        ):
            managers.setdefault(m["location_id"], []).append(
                {"user_id": str(m["id"]), "name": m["name"]}
            )
    return {
        "items": [location_view(r) | {"managers": managers.get(r["id"], [])} for r in rows]
    }


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
        # A waiting change is closed with its finding (spec 066): "I did this" and "Skip" never
        # leave a proposal for the owner to approve later.
        if status in ("owner_done", "skipped"):
            await proposals.expire_for_finding(
                conn, row["id"], "finding_done" if status == "owner_done" else "finding_skipped"
            )
    fresh = await conn.fetchrow(f"{_FINDING} where f.id = $1", row["id"])
    return (await finding_views(conn, caller, lang, [fresh]))[0]


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
    if await conn.fetchval(
        "select exists (select 1 from discovery_proposals where status = 'approved' "
        "and not (location_id = any($1)))",
        given,
    ):
        raise DiscoveryError("proposal_in_flight", 409)
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


async def write_sample_facts(conn: asyncpg.Connection) -> int:
    """The fictional owner's own truth for each branch (spec 066), so a proposal has an "after":
    written when the sample is turned on, in the same transaction as the places, and never over a
    fact someone typed. Source `sample`, no `confirmed_by`."""
    written = 0
    rows = await conn.fetch("select * from discovery_locations order by position, created_at")
    for ordinal, row in enumerate(rows):
        place = Location(row["id"], row["name"], row["name_ar"], row["area"], row["place_ref"],
                         row["website_url"], row["whatsapp_e164"], row["is_primary"],
                         row["position"])
        for key, value in (sample.facts_for(place, ordinal) or {}).items():
            done = await conn.execute(
                "insert into discovery_facts (location_id, key, value, source) "
                "values ($1, $2, $3, 'sample') on conflict (tenant_id, location_id, key) "
                "do nothing",
                row["id"], key, value,
            )
            written += done == "INSERT 0 1"
    return written


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
        if kind == sample.KIND:
            await write_sample_facts(conn)
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


# ── Phase 2: proposals, facts, managers, settings (spec 066, D-166) ──────────────────────

READERS = ALL_ROLES  # the engine is not in it: every action that lists ALL_ROLES refuses it
PREPARERS = ALL_ROLES | {ENGINE}  # the check-up prepares proposals; it never approves one


async def _proposal_answer(
    conn: asyncpg.Connection, caller: Caller, lang: str, proposal_id: UUID, already: bool
) -> dict:
    scope = await proposals.scope_of(conn, caller)
    row = await conn.fetchrow(f"{proposals._PROPOSAL} where p.id = $1", proposal_id)
    reviews = await proposals._reviews_of(conn, [row])
    return proposals.view(row, caller, scope, lang, datetime.now(UTC), reviews, already=already)


@register("discovery.proposals", READERS, MODULE)
async def list_proposals(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    scope = await proposals.scope_of(conn, caller)
    return await proposals.list_for(
        conn, caller, scope, lang, args.get("status"), args.get("location_id")
    )


@register("discovery.proposal", READERS, MODULE)
async def get_proposal(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    scope = await proposals.scope_of(conn, caller)
    return await proposals.get_one(conn, caller, scope, lang, args["id"])


@register("discovery.prepare", PREPARERS, MODULE)
async def prepare(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Make the proposals a finding calls for now, or say why there are none."""
    lang = await _lang(conn, args.get("lang"))
    scope = await proposals.scope_of(conn, caller)
    return await proposals.prepare(conn, caller, scope, lang, args["id"])


@register("discovery.approve_proposal", READERS, MODULE)
async def approve_proposal(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """A person's tap on this exact change (its `change_hash`). Refuses the engine, the agent
    door (any channel but the workspace and WhatsApp) and a caller with no login, inside
    `proposals.approve`, whatever the role table says."""
    lang = await _lang(conn, args.get("lang"))
    scope = await proposals.scope_of(conn, caller)
    row, already = await proposals.approve(conn, caller, scope, args["id"], args.get("change_hash"))
    return await _proposal_answer(conn, caller, lang, row["id"], already)


@register("discovery.decline_proposal", READERS, MODULE)
async def decline_proposal(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    scope = await proposals.scope_of(conn, caller)
    row, already = await proposals.decline(conn, caller, scope, args["id"])
    return await _proposal_answer(conn, caller, lang, row["id"], already)


@register("discovery.undo_proposal", READERS, MODULE)
async def undo_proposal(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await _lang(conn, args.get("lang"))
    scope = await proposals.scope_of(conn, caller)
    row, already = await applying.undo(conn, caller, scope, args["id"], args.get("get_connector"))
    return await _proposal_answer(conn, caller, lang, row["id"], already)


async def _place_in_scope(conn: asyncpg.Connection, scope, location_id: UUID) -> asyncpg.Record:
    if scope.nothing:
        raise DiscoveryError("forbidden", 403)
    row = await conn.fetchrow("select * from discovery_locations where id = $1", location_id)
    if row is None or not scope.covers(location_id):
        raise DiscoveryError("not_found", 404)
    return row


@register("discovery.facts", READERS, MODULE)
async def list_facts(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """What has been confirmed about each place the caller manages, with the defaults (a place's
    own name and WhatsApp number) marked as such."""
    scope = await proposals.scope_of(conn, caller)
    if scope.nothing:
        return {"items": []}
    wanted = args.get("location_id")
    if wanted is not None and not scope.covers(wanted):
        raise DiscoveryError("not_found", 404)
    places = [wanted] if wanted else None if scope.everywhere else list(scope.places)
    found = await facts_module.load(conn, places)
    order = {r["id"]: r["position"] for r in await conn.fetch(
        "select id, position from discovery_locations")}
    keys = {k: i for i, k in enumerate(facts_module.KEYS)}
    ordered = sorted(found.values(), key=lambda f: (order.get(f.location_id, 0), keys[f.key]))
    return {"items": [facts_module.view(f) for f in ordered]}


@register("discovery.set_fact", READERS, MODULE)
async def set_fact(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Confirm something about a place. The first half of an approval: from now on a proposal's
    "after" may be this. Then the builder runs for the place's open findings, so the proposal
    appears at once."""
    scope = await proposals.scope_of(conn, caller)
    if not proposals.person_may_decide(caller):
        raise DiscoveryError("forbidden", 403)
    place = await _place_in_scope(conn, scope, args["location_id"])
    key = args["fact_key"]
    value = facts_module.validate(key, args.get("value"))
    await facts_module.write(
        conn, place["id"], key, value, source="owner", user_id=caller.user_id,
        name=caller.name or "—",
    )
    await _record(conn, caller, place["id"], "fact.set", {"key": key})
    kind, writes = await proposals._active_connector(conn)
    if kind is not None:
        findings = await conn.fetch(
            "select * from discovery_findings where status = 'open' "
            "and (location_id = $1 or rule_id = 'name_conflict')",
            place["id"],
        )
        await proposals.build(
            conn, findings, kind=kind, writes=writes, now=datetime.now(UTC),
            who=proposals.Who.of(caller), run_cap=10**6, scope=scope,
        )
    fact = (await facts_module.load(conn, [place["id"]]))[(place["id"], key)]
    return facts_module.view(fact)


@register("discovery.set_managers", CHANGERS, MODULE)
async def set_managers(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Link staff-role members to a place: a branch manager acts on that place's proposals and
    facts and on nothing else. Owner and admin only."""
    place = await conn.fetchrow(
        "select id from discovery_locations where id = $1", args["location_id"]
    )
    if place is None:
        raise DiscoveryError("not_found", 404)
    wanted = list(dict.fromkeys(args["user_ids"]))
    members = await conn.fetch(
        "select u.id, u.name from memberships m join users u on u.id = m.user_id "
        "where m.role = 'agent' and u.id = any($1) "
        "and m.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid",
        wanted,
    )
    if {m["id"] for m in members} != set(wanted):
        raise DiscoveryError("bad_manager")
    await conn.execute(
        "delete from discovery_location_managers where location_id = $1", place["id"]
    )
    for user_id in wanted:
        await conn.execute(
            "insert into discovery_location_managers (location_id, user_id) values ($1, $2)",
            place["id"], user_id,
        )
    await _record(conn, caller, place["id"], "managers.set", {"count": len(wanted)})
    return {"items": [{"user_id": str(m["id"]), "name": m["name"]} for m in members]}


async def _settings_view(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow("select ask_cap_per_day, weekly_run from discovery_settings")
    staff = await conn.fetch(
        "select id, name, phone, user_id, discovery_asks from contacts where role = 'staff' "
        "order by name, id"
    )
    return {
        "ask_cap_per_day": row["ask_cap_per_day"] if row else 3,
        "weekly_run": row["weekly_run"] if row else False,
        # False while the message sent outside WhatsApp's 24-hour window is not approved by Meta.
        "template_ready": get_settings().discovery_ask_template_approved,
        "receivers": [
            {
                "contact_id": str(s["id"]), "name": s["name"], "last4": (s["phone"] or "")[-4:],
                "linked": s["user_id"] is not None, "receives": s["discovery_asks"],
            }
            for s in staff
        ],
    }


@register("discovery.settings", CHANGERS, MODULE)
async def settings(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Read, or change (any of `ask_cap_per_day`, `weekly_run`, `receivers`), Discovery's
    settings. Owner and admin only."""
    changed = [k for k in ("ask_cap_per_day", "weekly_run", "receivers") if args.get(k) is not None]
    if changed:
        cap = args.get("ask_cap_per_day")
        if cap is not None and (isinstance(cap, bool) or not isinstance(cap, int)
                                or not 1 <= cap <= 5):
            raise DiscoveryError("bad_setting")
        receivers = args.get("receivers")
        if receivers is not None:
            known = {r["id"] for r in await conn.fetch(
                "select id from contacts where role = 'staff' and id = any($1)", receivers)}
            if known != set(receivers):
                raise DiscoveryError("bad_setting")
        current = await conn.fetchrow("select ask_cap_per_day, weekly_run from discovery_settings")
        await conn.execute(
            "insert into discovery_settings (ask_cap_per_day, weekly_run) values ($1, $2) "
            "on conflict (tenant_id) do update set ask_cap_per_day = excluded.ask_cap_per_day, "
            "weekly_run = excluded.weekly_run, updated_at = now()",
            cap if cap is not None else (current["ask_cap_per_day"] if current else 3),
            args["weekly_run"] if args.get("weekly_run") is not None
            else (current["weekly_run"] if current else False),
        )
        if receivers is not None:
            newly = await conn.fetch(
                "select id from contacts where role = 'staff' and id = any($1) "
                "and not discovery_asks",
                receivers,
            )
            await conn.execute(
                "update contacts set discovery_asks = (id = any($1)) where role = 'staff'",
                receivers,
            )
            # The owner marking a number to be asked is the number's agreement to be asked.
            for r in newly:
                await consent.record(conn, r["id"], "service", "granted", "discovery_asks_setting")
        await _record(
            conn, caller, await conn.fetchval(f"select {_TENANT}"), "settings.set",
            {"changed": ",".join(changed)},
        )
    return await _settings_view(conn)


@register("discovery.set_my_asks", READERS, MODULE)
async def set_my_asks(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """This person's own number starts or stops receiving asks (PROPOSALS ON and PROPOSALS OFF)."""
    on = bool(args["on"])
    if caller.user_id is None:
        raise DiscoveryError("forbidden", 403)
    contact_id = await conn.fetchval(
        "update contacts set discovery_asks = $2 where user_id = $1 and role = 'staff' "
        "returning id",
        caller.user_id, on,
    )
    if contact_id is not None:
        if on:
            await consent.record(conn, contact_id, "service", "granted", "discovery_asks_setting")
        await _record(conn, caller, caller.user_id, "asks.opt", {"on": on})
    return {"on": on, "linked": contact_id is not None}
