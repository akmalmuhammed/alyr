"""Proposals: one exact change to one place's public presence, waiting for a person (spec 066).

**The guarantee this file protects: nothing outside ALYR is changed, and nothing is sent to anyone
but the owner's own team, without a person's tap on that exact change.**

A proposal is made by a rule from a finding and a fact the owner confirmed (never by a person's free
text and never by a model). `plan` is pure: it says which changes a finding calls for, from the
values the finding saw (`observed`), the facts and what the connector can write. `build` makes them
(idempotent, with the cool-off and the caps). `approve` is the only way a proposal becomes
`approved`, and it refuses the engine, the agent door, any channel but the workspace and WhatsApp,
and a caller with no login. `status` is changed here and in `apply.py` and nowhere else (a test
reads the SQL of the whole module).

Every function takes a tenant-scoped connection.
"""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.core import jobs, team
from alyr.core.actions import ADMIN, AGENT, ENGINE, OWNER, Caller
from alyr.modules.discovery import connectors, rules
from alyr.modules.discovery import facts as facts_module
from alyr.modules.discovery import proposal_words as pw
from alyr.modules.discovery import words as w
from alyr.modules.discovery.connectors.base import hours_to_json, same
from alyr.modules.discovery.errors import DiscoveryError

APPLY_JOB = "discovery.apply"
LIVE = ("proposed", "approved")
STATUSES = ("proposed", "approved", "declined", "expired", "applied", "failed", "undone")
EXPIRES_AFTER = timedelta(days=14)
COOL_OFF = timedelta(days=14)
MAX_LIVE_PER_SHOP = 50
MAX_PER_RUN = 25
MAX_LIVE_REPLIES = 3
RETRY_LIMIT = 3
FACT_KEY = {"hours": "hours", "phone": "phone", "category": "category", "whatsapp_link": "whatsapp"}
_ORDER = "case severity when 'high' then 0 when 'medium' then 1 else 2 end"


# ── who may do what: roles and the branch scope ─────────────────────────────────────────


@dataclass(frozen=True)
class Scope:
    """Which places a caller may act on: all of them (owner, admin, the engine) or the places a
    staff-role member was linked to (`discovery_location_managers`). Read fresh on every call."""

    everywhere: bool
    places: frozenset = frozenset()

    def covers(self, location_id: UUID) -> bool:
        return self.everywhere or location_id in self.places

    @property
    def nothing(self) -> bool:
        return not self.everywhere and not self.places


async def scope_of(conn: asyncpg.Connection, caller: Caller) -> Scope:
    if caller.role in (OWNER, ADMIN, ENGINE):
        return Scope(True)
    if caller.role == AGENT and caller.user_id is not None:
        rows = await conn.fetch(
            "select location_id from discovery_location_managers where user_id = $1",
            caller.user_id,
        )
        return Scope(False, frozenset(r["location_id"] for r in rows))
    return Scope(False)


def person_may_decide(caller: Caller) -> bool:
    """Only a person at a door that shows them the change may approve: the workspace or their own
    linked WhatsApp number. Not the engine, not the agent door (any other channel), not a caller
    with no login. Independent of the role table, so a mistake there cannot let one through."""
    return caller.user_id is not None and caller.channel in ("portal", "whatsapp")


def channel_of(caller: Caller) -> str:
    """The activity record's channel: where a person acted, else ALYR itself."""
    return caller.channel if caller.channel in ("portal", "whatsapp") else "system"


def actor_of(caller: Caller) -> team.Actor:
    return team.ALYR if caller.role == ENGINE else caller.actor


# ── the hash and the shape of a change ──────────────────────────────────────────────────


def change_hash(
    ptype: str, target: str, location_id: UUID, subject_ref: str, field_: str, after: object
) -> str:
    """The same intended change always has the same hash. `before` is left out on purpose: the
    live value may shift, and a change the owner declined is still the same change."""
    canonical = json.dumps(
        {"type": ptype, "target": target, "location_id": str(location_id),
         "subject_ref": subject_ref, "field": field_, "after": after},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Draft:
    """One change a finding calls for, before it is made."""

    type: str
    target: str
    field: str
    location_id: UUID
    subject_ref: str
    before: object
    after: object

    @property
    def change(self) -> dict:
        return {"field": self.field, "before": self.before, "after": self.after}

    @property
    def hash(self) -> str:
        return change_hash(
            self.type, self.target, self.location_id, self.subject_ref, self.field, self.after
        )

    @property
    def key(self) -> tuple:
        return (self.type, self.target, self.subject_ref)


@dataclass
class Plan:
    drafts: list[Draft] = field(default_factory=list)
    # (fact key, place id): the confirmed value this finding's proposal waits for.
    needs_fact: tuple[str, UUID] | None = None
    # Why there is nothing to make: no_proposal, closed, cannot_write, nothing.
    reason: str = ""


# ── what a finding saw (for the "before") ───────────────────────────────────────────────


def _listing_values(listing) -> dict:
    out: dict = {}
    if not listing.found:
        return out
    if listing.hours is not None:
        out["hours"] = hours_to_json(listing.hours)
    if listing.phone is not None:
        out["phone"] = {"phone": listing.phone}
    if listing.categories is not None:
        out["category"] = {"category": listing.categories[0] if listing.categories else ""}
    if listing.name is not None:
        out["name"] = {"name": listing.name}
    if listing.whatsapp_link is not None:
        out["whatsapp_link"] = {"url": listing.whatsapp_link}
    return out


def _website_values(web) -> dict:
    out: dict = {}
    if web is None or web.reachable is False:
        return out
    if web.hours is not None:
        out["hours"] = hours_to_json(web.hours)
    if web.phone is not None:
        out["phone"] = {"phone": web.phone}
    if web.whatsapp_link is not None:
        out["whatsapp_link"] = {"url": web.whatsapp_link}
    return out


def observed_for(rule_id: str, location_id, snapshot, locations) -> dict:
    """The few values a rule compared, as plain data, for the places it concerns:
    `{"<place id>": {"listing": {field: value}, "website": {field: value}}}`. Only the fields a
    proposal of this rule would change are kept, and only those that were measured: a field
    that is not here was not measured, and no proposal is made on it."""
    wanted: dict[str, set] = {"listing": set(), "website": set()}
    for _type, field_, target in rules.PROPOSES.get(rule_id, ()):
        if field_ != "review_reply":
            wanted[target].add(field_)
    if not any(wanted.values()):
        return {}
    places = [location_id] if location_id is not None else [loc.id for loc in locations]
    out: dict = {}
    for place_id in places:
        place = snapshot.of(place_id)
        if place is None:
            continue
        seen = {
            "listing": _listing_values(place.listing),
            "website": _website_values(place.website),
        }
        kept = {
            target: {f: v for f, v in seen[target].items() if f in wanted[target]}
            for target in ("listing", "website")
        }
        kept = {target: values for target, values in kept.items() if values}
        if kept:
            out[str(place_id)] = kept
    return out


# ── planning: which changes a finding calls for ─────────────────────────────────────────


def _whatsapp_link(fact_value: dict) -> dict:
    return {"url": "https://wa.me/" + fact_value["phone"].lstrip("+")}


def plan(
    finding: asyncpg.Record, locations: dict, facts: dict, writes, reviews: list, now: datetime,
) -> Plan:
    """Pure. `locations` is `id -> row`, `facts` the facts loaded for the shop (`facts.load`),
    `writes` the `(target, field)` pairs the active connector can write, `reviews` the place's
    review rows (only the reply rule reads them)."""
    rule_id = finding["rule_id"]
    if rule_id not in rules.PROPOSES:
        return Plan(reason="no_proposal")
    if finding["status"] != "open":
        return Plan(reason="closed")
    candidates = rules.writable(rule_id, writes)
    if not candidates:
        return Plan(reason="cannot_write")
    observed = finding["observed"] or {}
    out = Plan(reason="nothing")

    if rule_id == "name_conflict":
        (ptype, field_, target), = candidates
        for place_id_text, seen in observed.items():
            place_id = UUID(place_id_text)
            place = locations.get(place_id)
            before = seen.get("listing", {}).get("name")
            fact = facts.get((place_id, "name"))
            if place is None or before is None or fact is None:
                continue
            if rules.name_key(before["name"], place["area"]) == rules.name_key(
                fact.value["name"], place["area"]
            ):
                continue
            out.drafts.append(
                Draft(ptype, target, field_, place_id, "", before, {"name": fact.value["name"]})
            )
        return out

    place_id = finding["location_id"]
    place = locations.get(place_id)
    if place is None:
        return out
    if rule_id == "review_unanswered":
        (ptype, field_, target), = candidates
        for review in reviews:
            text, template = pw.reply_text(
                review["rating"], review["language"], place["whatsapp_e164"]
            )
            out.drafts.append(
                Draft(ptype, target, field_, place_id, review["source_ref"], {"reply": ""},
                      {"reply": text, "template": template})
            )
        return out

    seen = observed.get(str(place_id), {})
    for ptype, field_, target in candidates:
        before = seen.get(target, {}).get(field_)
        if before is None:
            continue  # not measured: no proposal on it
        fact = facts.get((place_id, FACT_KEY[field_]))
        if fact is None:
            out.needs_fact = out.needs_fact or (FACT_KEY[field_], place_id)
            continue
        after = _whatsapp_link(fact.value) if field_ == "whatsapp_link" else fact.value
        if same(field_, before, after):
            continue
        out.drafts.append(Draft(ptype, target, field_, place_id, "", before, after))
    return out


# ── building ────────────────────────────────────────────────────────────────────────────


@dataclass
class Who:
    """Who is preparing proposals: the check-up, or a person (or the agent door acting for one)."""

    kind: str  # engine | agent
    user_id: UUID | None
    actor: team.Actor
    channel: str  # the activity record's: portal, whatsapp, system

    @classmethod
    def of(cls, caller: Caller) -> "Who":
        if caller.role == ENGINE:
            return cls("engine", None, team.ALYR, "system")
        # The agent door (any channel but the workspace and WhatsApp) prepares as `agent`; a
        # person pressing "Prepare change" is the rules' own work at their request: `engine`,
        # with `proposed_by` naming them.
        kind = "agent" if caller.channel not in ("portal", "whatsapp") else "engine"
        return cls(kind, caller.user_id, actor_of(caller), channel_of(caller))


@dataclass
class Result:
    made: list = field(default_factory=list)
    kept: list = field(default_factory=list)
    cooled: int = 0
    capped: int = 0
    closed: int = 0  # proposals closed because their finding is gone
    plans: dict = field(default_factory=dict)  # finding id -> Plan


async def _active_connector(conn: asyncpg.Connection):
    kind = await conn.fetchval(
        "select kind from discovery_connections where status = 'on' "
        "order by created_at desc limit 1"
    )
    if kind is None:
        return None, frozenset()
    try:
        connector = connectors.get(kind)
    except connectors.ConnectorError:
        return kind, frozenset()
    return kind, frozenset(getattr(connector, "writes", None) or ())


async def _cool_hashes(conn: asyncpg.Connection, now: datetime) -> set:
    since = now - COOL_OFF
    rows = await conn.fetch(
        "select distinct change_hash from discovery_proposals where "
        "(status = 'declined' and decided_at > $1) "
        "or (status = 'expired' and expire_reason = 'time' and updated_at > $1) "
        "or (status = 'undone' and undone_at > $1) "
        "or (status = 'applied' and verification in ('pending', 'not_confirmed') "
        "and updated_at > $1)",
        since,
    )
    return {r["change_hash"] for r in rows}


async def _unanswered(conn: asyncpg.Connection, place_id: UUID, now: datetime) -> list:
    """The place's low reviews with no reply, older than a week, oldest first."""
    return await conn.fetch(
        "select source_ref, rating, language from discovery_reviews where location_id = $1 "
        "and rating <= $2 and not replied and posted_at < $3 order by posted_at, id limit 20",
        place_id, rules.LOW_STARS, now - rules.UNANSWERED_AFTER,
    )


async def _replies_for(conn: asyncpg.Connection, findings, now: datetime) -> dict:
    out: dict = {}
    for f in findings:
        if f["rule_id"] == "review_unanswered" and f["location_id"] is not None:
            out[f["id"]] = await _unanswered(conn, f["location_id"], now)
    return out


async def make_plans(
    conn: asyncpg.Connection, findings, writes, now: datetime
) -> dict[UUID, Plan]:
    locations = {r["id"]: r for r in await conn.fetch("select * from discovery_locations")}
    facts = await facts_module.load(conn)
    reviews = await _replies_for(conn, findings, now)
    return {
        f["id"]: plan(f, locations, facts, writes, reviews.get(f["id"], []), now)
        for f in findings
    }


async def build(
    conn: asyncpg.Connection, findings, *, kind: str, writes, now: datetime, who: Who,
    run_id: UUID | None = None, run_cap: int | None = None, scope: Scope | None = None,
) -> Result:
    """Make the proposals the findings call for. Idempotent: a second call, a second press or a
    retried job makes no second live proposal (the partial unique index). A change already
    declined, expired by time, undone or applied and not confirmed in the last 14 days is not
    made again; a shop holds at most 50 live proposals and a check-up makes at most 25."""
    result = Result()
    if not findings or kind is None:
        return result
    plans = await make_plans(conn, findings, writes, now)
    result.plans = plans
    cool = await _cool_hashes(conn, now)
    live = {
        (r["finding_id"],) + (r["type"], r["target"], r["subject_ref"]): r
        for r in await conn.fetch(
            "select * from discovery_proposals where status = any($1)", list(LIVE)
        )
    }
    live_total = len(live)
    cap = MAX_PER_RUN if run_cap is None else run_cap
    for finding in findings:
        drafts = plans[finding["id"]].drafts
        replies_live = sum(
            1 for (fid, ptype, *_), _row in live.items()
            if fid == finding["id"] and ptype == "reply_to_review"
        )
        for draft in drafts:
            if scope is not None and not scope.covers(draft.location_id):
                continue  # a branch manager prepares only their own place's changes
            key = (finding["id"],) + draft.key
            existing = live.get(key)
            if existing is not None:
                if existing["change_hash"] == draft.hash:
                    result.kept.append(existing["id"])
                    continue
                if existing["status"] != "proposed":
                    result.kept.append(existing["id"])  # approved: leave it to apply or fail
                    continue
                await expire(conn, [existing["id"]], "superseded", team.ALYR)
                del live[key]
                live_total -= 1
            if draft.hash in cool:
                result.cooled += 1
                continue
            if draft.type == "reply_to_review" and replies_live >= MAX_LIVE_REPLIES:
                continue
            if live_total >= MAX_LIVE_PER_SHOP or len(result.made) >= cap:
                result.capped += 1
                continue
            new_id = await conn.fetchval(
                "insert into discovery_proposals (finding_id, location_id, type, target, "
                "connector_kind, subject_ref, change, change_hash, severity, proposer_kind, "
                "proposed_by, run_id, proposed_at, expires_at) "
                "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) "
                "on conflict (tenant_id, finding_id, type, target, subject_ref) "
                "where status in ('proposed', 'approved') do nothing returning id",
                finding["id"], draft.location_id, draft.type, draft.target, kind,
                draft.subject_ref, draft.change, draft.hash, finding["severity"], who.kind,
                who.user_id, run_id, now, now + EXPIRES_AFTER,
            )
            if new_id is None:  # two builders at once: the other one won
                other = await conn.fetchval(
                    "select id from discovery_proposals where finding_id = $1 and type = $2 "
                    "and target = $3 and subject_ref = $4 and status = any($5)",
                    finding["id"], draft.type, draft.target, draft.subject_ref, list(LIVE),
                )
                if other is not None:
                    result.kept.append(other)
                continue
            live[key] = {"id": new_id, "status": "proposed", "change_hash": draft.hash,
                         "finding_id": finding["id"], "type": draft.type, "target": draft.target,
                         "subject_ref": draft.subject_ref}
            live_total += 1
            if draft.type == "reply_to_review":
                replies_live += 1
            result.made.append(new_id)
            await team.record(
                conn, "discovery", new_id, "proposal.propose", who.actor,
                detail={"type": draft.type, "target": draft.target, "rule_id": finding["rule_id"],
                        "by": who.kind},
                channel=who.channel,
            )
    return result


# ── closing: expiry and asks ────────────────────────────────────────────────────────────


async def close_asks(conn: asyncpg.Connection, proposal_ids: list, reason: str) -> None:
    """A proposal that left `proposed` closes its open asks, so a late tap finds a closed ask."""
    await conn.execute(
        "update discovery_asks set status = 'closed', closed_reason = $2 "
        "where proposal_id = any($1) and status = 'queued'",
        proposal_ids, reason,
    )


async def expire(
    conn: asyncpg.Connection, ids: list, reason: str, actor: team.Actor = team.ALYR
) -> int:
    """`proposed` becomes `expired` (never anything else), with the reason on the record. Only
    `time` starts the cool-off (`_cool_hashes` reads `expire_reason`)."""
    rows = await conn.fetch(
        "update discovery_proposals set status = 'expired', expire_reason = $2, updated_at = now() "
        "where id = any($1) and status = 'proposed' returning id, change_hash",
        ids, reason,
    )
    for row in rows:
        await team.record(
            conn, "discovery", row["id"], "proposal.expire", actor,
            detail={"reason": reason}, channel="system",
        )
    if rows:
        await close_asks(conn, [r["id"] for r in rows], "expired")
    return len(rows)


async def expire_for_finding(conn: asyncpg.Connection, finding_id: UUID, reason: str) -> int:
    ids = [r["id"] for r in await conn.fetch(
        "select id from discovery_proposals where finding_id = $1 and status = 'proposed'",
        finding_id,
    )]
    return await expire(conn, ids, reason) if ids else 0


async def expire_closed_findings(conn: asyncpg.Connection) -> int:
    """A check-up that no longer finds the problem closes the proposal that was for it. An
    `approved` one is left to apply or fail by itself (it will almost always fail `stale_before`,
    which is correct)."""
    ids = [r["id"] for r in await conn.fetch(
        "select p.id from discovery_proposals p join discovery_findings f on f.id = p.finding_id "
        "where p.status = 'proposed' and f.status in ('gone', 'verified')"
    )]
    return await expire(conn, ids, "finding_gone") if ids else 0


async def expire_due(conn: asyncpg.Connection, now: datetime) -> int:
    ids = [r["id"] for r in await conn.fetch(
        "select id from discovery_proposals where status = 'proposed' and expires_at <= $1", now
    )]
    return await expire(conn, ids, "time") if ids else 0


# ── the check-up's two steps ────────────────────────────────────────────────────────────


async def build_step(
    conn: asyncpg.Connection, run: asyncpg.Record, kind: str, writes, now: datetime
) -> Result:
    """`proposals.build`: close what the check-up no longer finds, then make the proposals every
    open finding calls for."""
    closed = await expire_closed_findings(conn)
    findings = await conn.fetch(
        "select * from discovery_findings where status = 'open' "
        "order by case severity when 'high' then 0 when 'medium' then 1 else 2 end, created_at, id"
    )
    result = await build(
        conn, findings, kind=kind, writes=writes, now=now, who=Who("engine", None, team.ALYR,
                                                                    "system"),
        run_id=run["id"],
    )
    result.closed = closed
    return result


async def verify_step(conn: asyncpg.Connection, run: asyncpg.Record) -> tuple[int, int]:
    """`proposals.verify`: of the changes that were applied before this check-up began, those whose
    finding this check-up decided: closed means the change is confirmed, found again means it is
    not. Nothing is called fixed until a check-up measured it."""
    rows = await conn.fetch(
        "select p.id, f.status as finding_status from discovery_proposals p "
        "join discovery_findings f on f.id = p.finding_id "
        "where p.status = 'applied' and p.verification = 'pending' and p.applied_at < $2 "
        "and f.last_run_id = $1 and f.status <> 'owner_done'",
        run["id"], run["started_at"],
    )
    confirmed = again = 0
    for row in rows:
        ok = row["finding_status"] in ("verified", "gone")
        confirmed += ok
        again += not ok
        await conn.execute(
            "update discovery_proposals set verification = $2, verified_run_id = $3, "
            "updated_at = now() where id = $1",
            row["id"], "confirmed" if ok else "not_confirmed", run["id"],
        )
        await team.record(
            conn, "discovery", row["id"], "proposal.verify", team.ALYR,
            detail={"result": "confirmed" if ok else "not_confirmed"}, channel="system",
        )
    return confirmed, again


# ── the views ───────────────────────────────────────────────────────────────────────────


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def _place_name(row, lang: str) -> str:
    return row["place_name_ar"] if lang == "ar" and row["place_name_ar"] else row["place_name"]


_PROPOSAL = (
    "select p.*, f.rule_id, f.evidence, l.name as place_name, l.name_ar as place_name_ar, "
    "l.whatsapp_e164 from discovery_proposals p "
    "join discovery_findings f on f.id = p.finding_id "
    "join discovery_locations l on l.id = p.location_id"
)


async def _reviews_of(conn: asyncpg.Connection, rows) -> dict:
    wanted = [(r["location_id"], r["subject_ref"]) for r in rows if r["type"] == "reply_to_review"]
    if not wanted:
        return {}
    found = await conn.fetch(
        "select location_id, source_ref, rating, posted_at, author_name, body, language "
        "from discovery_reviews where location_id = any($1) and source_ref = any($2)",
        [x[0] for x in wanted], [x[1] for x in wanted],
    )
    return {(r["location_id"], r["source_ref"]): r for r in found}


def _can(row, caller: Caller, scope: Scope, now: datetime, undoable: bool) -> dict:
    status = row["status"]
    mine = scope.covers(row["location_id"]) and caller.role != ENGINE
    open_ = status == "proposed" and row["expires_at"] > now
    retry = status == "failed" and row["apply_attempts"] < RETRY_LIMIT
    return {
        "approve": bool(mine and person_may_decide(caller) and (open_ or retry)),
        "decline": bool(mine and (open_ or status == "failed")),
        "undo": bool(
            mine and status == "applied" and row["undo_until"] and row["undo_until"] > now
            and undoable
        ),
    }


def _undoable(kind: str, target: str, field_: str) -> bool:
    try:
        return (target, field_) in getattr(connectors.get(kind), "undoable", frozenset())
    except connectors.ConnectorError:
        return False


def view(
    row, caller: Caller, scope: Scope, lang: str, now: datetime, reviews: dict, *,
    already: bool = False, history: list | None = None,
) -> dict:
    change = row["change"]
    lines = pw.change_lines(change, lang, row["target"])
    review = reviews.get((row["location_id"], row["subject_ref"]))
    place = _place_name(row, lang)
    out = {
        "id": str(row["id"]),
        "finding_id": str(row["finding_id"]),
        "rule_id": row["rule_id"],
        "type": row["type"],
        "target": row["target"],
        "status": row["status"],
        "severity": row["severity"],
        "title": pw.title(row["type"], row["target"], place, lang,
                          review["rating"] if review else None),
        "why": w.rule_text(row["rule_id"], "why", lang),
        "rule": pw.rule_line(row["rule_id"], row["target"], lang),
        "location": {"id": str(row["location_id"]), "name": place},
        "field": change["field"],
        "field_label": lines["field_label"],
        "where": lines["where"],
        "before": lines["before"],
        "after": lines["after"],
        "change_hash": row["change_hash"],
        "context": {"review": {
            "rating": review["rating"], "posted_at": _iso(review["posted_at"]),
            "author_name": review["author_name"], "body": review["body"],
            "language": review["language"],
        }} if review else None,
        "evidence": [w.evidence_view(e, lang) for e in row["evidence"]],
        "proposer": row["proposer_kind"],
        "proposed_at": _iso(row["proposed_at"]),
        "expires_at": _iso(row["expires_at"]),
        "decided": {
            "by": row["decided_name"], "channel": row["decided_channel"],
            "at": _iso(row["decided_at"]),
        } if row["decided_at"] and row["status"] != "expired" else None,
        "undone": {
            "by": row["undone_name"], "channel": "portal", "at": _iso(row["undone_at"]),
        } if row["undone_at"] else None,
        "applied_at": _iso(row["applied_at"]),
        "undo_until": _iso(row["undo_until"]),
        "failure": {
            "code": row["failure_code"],
            "message": pw.failure(row["failure_code"], row["target"], lang),
        } if row["status"] == "failed" and row["failure_code"] else None,
        "verification": row["verification"],
        "expire_reason": row["expire_reason"] if row["status"] == "expired" else None,
        "sample": row["connector_kind"] == "sample",
        "can": _can(row, caller, scope, now,
                    _undoable(row["connector_kind"], row["target"], change["field"])),
        "already": already,
    }
    if history is not None:
        out["history"] = history
    return out


async def views(
    conn: asyncpg.Connection, rows, caller: Caller, scope: Scope, lang: str,
    *, now: datetime | None = None, already: bool = False,
) -> list[dict]:
    now = now or datetime.now().astimezone()
    reviews = await _reviews_of(conn, rows)
    return [view(r, caller, scope, lang, now, reviews, already=already) for r in rows]


async def history(conn: asyncpg.Connection, proposal_id: UUID, lang: str) -> list[dict]:
    """The activity rows of one proposal, worded, newest last."""
    out = []
    for r in await conn.fetch(
        "select action, detail, actor_name, channel, created_at from activity "
        "where subject = 'discovery' and subject_id = $1 and action like 'proposal.%' "
        "order by created_at, id",
        proposal_id,
    ):
        detail = r["detail"] or {}
        action = r["action"]
        via = pw.pick(pw.VIA[r["channel"]], lang) if r["channel"] in pw.VIA else ""
        if action == "proposal.propose":
            key = "proposal.propose.engine" if detail.get("by") == "engine" and (
                r["actor_name"] == "ALYR") else "proposal.propose.person"
        elif action == "proposal.expire":
            key = f"proposal.expire.{detail.get('reason', 'time')}"
        elif action == "proposal.verify":
            key = f"proposal.verify.{detail.get('result', 'confirmed')}"
        else:
            key = action
        pair = pw.HISTORY.get(key)
        if pair is None:
            continue
        reason = pw.failure(detail.get("code"), detail.get("target", "listing"), lang,
                            short=True) if action == "proposal.fail" else ""
        out.append({
            "at": _iso(r["created_at"]),
            "event": action.removeprefix("proposal."),
            "by": r["actor_name"],
            "channel": r["channel"],
            "text": pw.pick(pair, lang).format(name=r["actor_name"], via=via, reason=reason),
        })
    return out


# ── reads ───────────────────────────────────────────────────────────────────────────────

_GROUPS = {
    "live": ("proposed", "approved"),
    "done": ("applied", "undone"),
    "closed": ("declined", "expired", "failed"),
    "all": STATUSES,
}


async def list_for(
    conn: asyncpg.Connection, caller: Caller, scope: Scope, lang: str, status: str | None,
    location_id: UUID | None,
) -> dict:
    wanted = _GROUPS.get(status or "live") or ((status,) if status in STATUSES else None)
    if wanted is None:
        raise DiscoveryError("bad_status")
    now = datetime.now().astimezone()
    if scope.nothing:
        return {"items": [], "counts": {s: 0 for s in STATUSES}, "waiting": 0}
    places = None if scope.everywhere else list(scope.places)
    rows = await conn.fetch(
        f"{_PROPOSAL} where p.status = any($1) and ($2::uuid is null or p.location_id = $2) "
        "and ($3::uuid[] is null or p.location_id = any($3)) "
        "order by p.proposed_at desc, p.id desc limit 100",
        list(wanted), location_id, places,
    )
    counted = await conn.fetch(
        "select status, count(*) as n from discovery_proposals "
        "where ($1::uuid is null or location_id = $1) "
        "and ($2::uuid[] is null or location_id = any($2)) "
        "group by status",
        location_id, places,
    )
    found = {r["status"]: r["n"] for r in counted}
    waiting = 0
    if person_may_decide(caller):
        waiting = await conn.fetchval(
            "select count(*) from discovery_proposals where status = 'proposed' "
            "and expires_at > $1 and ($2::uuid[] is null or location_id = any($2))",
            now, places,
        )
    reviews = await _reviews_of(conn, rows)
    return {
        "items": [view(r, caller, scope, lang, now, reviews) for r in rows],
        "counts": {s: found.get(s, 0) for s in STATUSES},
        "waiting": waiting,
    }


async def get_one(
    conn: asyncpg.Connection, caller: Caller, scope: Scope, lang: str, proposal_id: UUID
) -> dict:
    if scope.nothing:
        raise DiscoveryError("not_found", 404)
    row = await conn.fetchrow(f"{_PROPOSAL} where p.id = $1", proposal_id)
    if row is None or not scope.covers(row["location_id"]):
        raise DiscoveryError("not_found", 404)
    now = datetime.now().astimezone()
    return view(row, caller, scope, lang, now, await _reviews_of(conn, [row]),
                history=await history(conn, proposal_id, lang))


async def overview_block(conn: asyncpg.Connection, caller: Caller, scope: Scope, lang: str):
    """The overview's `proposals`: how many wait, are being applied, failed, and the next one the
    caller may approve. None for a caller who cannot list."""
    if scope.nothing:
        return None
    now = datetime.now().astimezone()
    places = None if scope.everywhere else list(scope.places)
    counts = await conn.fetchrow(
        "select count(*) filter (where status = 'proposed' and expires_at > $1) as waiting, "
        "count(*) filter (where status = 'approved') as approved, "
        "count(*) filter (where status = 'failed') as failed from discovery_proposals "
        "where ($2::uuid[] is null or location_id = any($2))",
        now, places,
    )
    next_row = None
    if person_may_decide(caller):
        next_row = await conn.fetchrow(
            f"{_PROPOSAL} where p.status = 'proposed' and p.expires_at > $1 "
            "and ($2::uuid[] is null or p.location_id = any($2)) "
            "order by case p.severity when 'high' then 0 when 'medium' then 1 else 2 end, "
            "p.proposed_at, p.id limit 1",
            now, places,
        )
    return {
        "waiting": counts["waiting"], "approved": counts["approved"], "failed": counts["failed"],
        "next": view(next_row, caller, scope, lang, now, await _reviews_of(conn, [next_row]))
        if next_row else None,
    }


async def for_findings(
    conn: asyncpg.Connection, caller: Caller, scope: Scope, lang: str, finding_rows
) -> dict[UUID, dict]:
    """What each finding says about proposals (new keys on a Finding): its proposals of the last
    30 days (newest first, at most 6, only places the caller manages), `needs_fact`,
    `can_propose`."""
    now = datetime.now().astimezone()
    ids = [f["id"] for f in finding_rows]
    out = {i: {"proposals": [], "needs_fact": None, "can_propose": False} for i in ids}
    if not ids:
        return out
    kind, writes = await _active_connector(conn)
    places = None if scope.everywhere else list(scope.places)
    rows = await conn.fetch(
        f"{_PROPOSAL} where p.finding_id = any($1) and p.proposed_at > $2 "
        "and ($3::uuid[] is null or p.location_id = any($3)) "
        "order by p.proposed_at desc, p.id desc",
        ids, now - timedelta(days=30), places,
    ) if not scope.nothing else []
    reviews = await _reviews_of(conn, rows)
    grouped: dict = {}
    for r in rows:
        if len(grouped.setdefault(r["finding_id"], [])) < 6:
            grouped[r["finding_id"]].append(view(r, caller, scope, lang, now, reviews))
    locations = {r["id"]: r for r in await conn.fetch("select * from discovery_locations")}
    facts = await facts_module.load(conn) if kind else {}
    for f in finding_rows:
        entry = out[f["id"]]
        entry["proposals"] = grouped.get(f["id"], [])
        if kind is None or f["status"] != "open" or f["rule_id"] not in rules.PROPOSES:
            continue
        if f["rule_id"] == "review_unanswered":
            entry["can_propose"] = bool(rules.writable(f["rule_id"], writes))
            continue
        found = plan(f, locations, facts, writes, [], now)
        if found.needs_fact and scope.covers(found.needs_fact[1]):
            entry["needs_fact"] = {
                "key": found.needs_fact[0], "location_id": str(found.needs_fact[1]),
            }
        entry["can_propose"] = bool(found.drafts or found.needs_fact) and (
            scope.everywhere or any(scope.covers(d.location_id) for d in found.drafts)
            or entry["needs_fact"] is not None
        )
    return out


# ── prepare (by hand) ───────────────────────────────────────────────────────────────────


async def prepare(
    conn: asyncpg.Connection, caller: Caller, scope: Scope, lang: str, finding_id: UUID
) -> dict:
    """"Prepare change" now, for one finding: the live proposals it has, new or existing. 422
    `needs_fact` (with `key` and `location_id`), 409 `nothing_to_propose`, 409
    `connector_cannot_write`, 409 `finding_closed`."""
    if scope.nothing:
        raise DiscoveryError("forbidden", 403)
    row = await conn.fetchrow("select * from discovery_findings where id = $1 for update",
                              finding_id)
    if row is None or (row["location_id"] is not None and not scope.covers(row["location_id"])):
        raise DiscoveryError("not_found", 404)
    if row["status"] != "open":
        raise DiscoveryError("finding_closed", 409)
    kind, writes = await _active_connector(conn)
    if kind is None or not rules.writable(row["rule_id"], writes):
        raise DiscoveryError(
            "connector_cannot_write" if row["rule_id"] in rules.PROPOSES else "nothing_to_propose",
            409,
        )
    now = datetime.now().astimezone()
    who = Who.of(caller)
    result = await build(
        conn, [row], kind=kind, writes=writes, now=now, who=who, run_cap=10**6, scope=scope
    )
    found = result.plans[row["id"]]
    # A person on a branch only gets what is theirs.
    live = await conn.fetch(
        f"{_PROPOSAL} where p.finding_id = $1 and p.status = any($2) "
        "and ($3::uuid[] is null or p.location_id = any($3)) order by p.proposed_at, p.id",
        row["id"], list(LIVE), None if scope.everywhere else list(scope.places),
    )
    if not live:
        if found.needs_fact is not None and scope.covers(found.needs_fact[1]):
            raise DiscoveryError(
                "needs_fact", 422, key=found.needs_fact[0], location_id=str(found.needs_fact[1])
            )
        raise DiscoveryError("nothing_to_propose", 409)
    return {"items": await views(conn, live, caller, scope, lang, now=now)}


# ── approve, decline ────────────────────────────────────────────────────────────────────


async def _locked(
    conn: asyncpg.Connection, caller: Caller, scope: Scope, proposal_id: UUID
) -> asyncpg.Record:
    if scope.nothing:
        raise DiscoveryError("forbidden", 403)
    row = await conn.fetchrow(
        "select * from discovery_proposals where id = $1 for update", proposal_id
    )
    if row is None or not scope.covers(row["location_id"]):
        raise DiscoveryError("not_found", 404)
    return row


async def approve(
    conn: asyncpg.Connection, caller: Caller, scope: Scope, proposal_id: UUID,
    given_hash: str | None,
) -> tuple[asyncpg.Record, bool]:
    """The one way a proposal becomes `approved`: a person's tap on this exact change.

    Returns the row and whether it was already approved (a double tap does nothing). The row is
    locked, so two taps at the same instant are one approval and one apply job."""
    if not person_may_decide(caller):
        raise DiscoveryError("forbidden", 403)
    row = await _locked(conn, caller, scope, proposal_id)
    status = row["status"]
    if status in ("declined", "expired", "undone"):
        raise DiscoveryError("proposal_closed", 409)
    if given_hash != row["change_hash"]:
        raise DiscoveryError("proposal_changed", 409)
    if status in ("approved", "applied"):
        return row, True
    now = datetime.now().astimezone()
    if status == "proposed" and row["expires_at"] <= now:
        raise DiscoveryError("proposal_closed", 409)
    if status == "failed" and row["apply_attempts"] >= RETRY_LIMIT:
        raise DiscoveryError("retry_limit", 409)
    row = await conn.fetchrow(
        "update discovery_proposals set status = 'approved', decided_by = $2, decided_name = $3, "
        "decided_channel = $4, decided_at = now(), failure_code = null, apply_started_at = null, "
        "updated_at = now() where id = $1 returning *",
        proposal_id, caller.user_id, caller.name or "—", caller.channel,
    )
    await jobs.enqueue(conn, APPLY_JOB, {"proposal_id": str(proposal_id)},
                       max_attempts=RETRY_LIMIT)
    await close_asks(conn, [proposal_id], "proposal_decided")
    await team.record(
        conn, "discovery", proposal_id, "proposal.approve", caller.actor,
        detail={"type": row["type"], "retry": status == "failed"}, channel=channel_of(caller),
    )
    return row, False


async def decline(
    conn: asyncpg.Connection, caller: Caller, scope: Scope, proposal_id: UUID
) -> tuple[asyncpg.Record, bool]:
    if not person_may_decide(caller):
        raise DiscoveryError("forbidden", 403)
    row = await _locked(conn, caller, scope, proposal_id)
    status = row["status"]
    if status == "declined":
        return row, True
    if status in ("expired", "undone"):
        raise DiscoveryError("proposal_closed", 409)
    if status in ("approved", "applied"):
        raise DiscoveryError("proposal_decided", 409)
    row = await conn.fetchrow(
        "update discovery_proposals set status = 'declined', decided_by = $2, decided_name = $3, "
        "decided_channel = $4, decided_at = now(), updated_at = now() where id = $1 returning *",
        proposal_id, caller.user_id, caller.name or "—", caller.channel,
    )
    await close_asks(conn, [proposal_id], "proposal_decided")
    await team.record(
        conn, "discovery", proposal_id, "proposal.decline", caller.actor,
        detail={"type": row["type"]}, channel=channel_of(caller),
    )
    return row, False

