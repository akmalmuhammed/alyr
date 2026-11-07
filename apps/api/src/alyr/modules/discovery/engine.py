"""The run engine: one check-up, step by step (spec 065).

`start_run` is idempotent: when a run is queued or running it is returned, otherwise a queued run
is made and a `discovery.run` job is queued with it, in the same transaction. The job runs on the
existing jobs worker as `background` work, so a customer's message is always claimed first
(D-078). It loads the places and the connection, asks the connector for a snapshot (one step),
evaluates the rules (one step per family), saves the findings and the reviews, scores, and writes
`done`.

**Every step is a row of `discovery_run_steps`, written in a transaction of its own as the step
ends**, so a run that fails keeps its log, and the owner reads it. **A step budget and a cost
budget stop a runaway** (`run_budget_exceeded`), and so do 200 findings in one run. One run per
shop at a time is enforced by the database (a partial unique index); a manual run may start once
in ten minutes.

Nothing here sends anything, calls `Outbound` or reaches outside ALYR: the connector is the only
thing that could, and Phase 1 has only the sample one.
"""

import logging
import math
from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr.config import get_settings
from alyr.core import jobs
from alyr.db import Database
from alyr.modules.discovery import connectors, rules, scoring
from alyr.modules.discovery.connectors import ConnectorError, Location, RunContext, Snapshot
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.discovery.words import ERRORS, STEP_SUMMARIES

log = logging.getLogger("alyr.discovery")

JOB = "discovery.run"
# What a run may take, per shop, written on the run's own row when it is made.
STEP_BUDGET = 60
COST_BUDGET = 100
MAX_FINDINGS = 200
# A run that has been queued or running this long lost its process; the next start ends it.
STALE_AFTER_SECONDS = 15 * 60
PARTS_WITH_RULES = ("presence", "reviews", "website", "whatsapp")


def clock() -> datetime:
    return datetime.now(UTC)


class RunFailed(Exception):
    """A run that cannot go on, with the code and words to show."""

    def __init__(self, code: str) -> None:
        self.code = code
        self.en, self.ar = ERRORS.get(code, ERRORS["run_failed"])
        super().__init__(self.en)


# ── starting ────────────────────────────────────────────────────────────────────────────


async def start_run(
    conn: asyncpg.Connection, user_id: UUID | None, trigger: str = "manual"
) -> tuple[asyncpg.Record, bool]:
    """The run to watch, and whether this call made it. Raises `no_connection`, `no_locations`
    and `run_too_soon` (429, with `retry_after` in seconds)."""
    settings = get_settings()
    # A run whose process died would block every later start: end it.
    await conn.execute(
        "update discovery_runs set status = 'failed', error_code = 'run_interrupted', error = $1, "
        "finished_at = now() where status in ('queued', 'running') "
        "and created_at < now() - make_interval(secs => $2)",
        ERRORS["run_interrupted"][0],
        STALE_AFTER_SECONDS,
    )
    active = await conn.fetchrow(
        "select * from discovery_runs where status in ('queued', 'running')"
    )
    if active is not None:
        return active, False
    kind = await conn.fetchval(
        "select kind from discovery_connections where status = 'on' "
        "order by created_at desc limit 1"
    )
    if kind is None:
        raise DiscoveryError("no_connection", 409)
    if not await conn.fetchval("select exists (select 1 from discovery_locations)"):
        raise DiscoveryError("no_locations", 409)
    if trigger == "manual":
        waited = await conn.fetchval(
            "select extract(epoch from now() - max(created_at)) from discovery_runs "
            "where trigger = 'manual'"
        )
        gap = settings.discovery_run_gap_seconds
        if waited is not None and waited < gap:
            raise DiscoveryError("run_too_soon", 429, retry_after=max(1, math.ceil(gap - waited)))
    run = await conn.fetchrow(
        "insert into discovery_runs (trigger, connector_kind, step_budget, cost_budget, "
        "created_by) "
        "values ($1, $2, $3, $4, $5) "
        "on conflict (tenant_id) where status in ('queued', 'running') do nothing returning *",
        trigger,
        kind,
        STEP_BUDGET,
        COST_BUDGET,
        user_id,
    )
    if run is None:  # two starts at once: the other one won
        return await conn.fetchrow(
            "select * from discovery_runs where status in ('queued', 'running')"
        ), False
    await jobs.enqueue(conn, JOB, {"run_id": str(run["id"])})
    return run, True


# ── running ─────────────────────────────────────────────────────────────────────────────


class DiscoveryRuns:
    """The job handler: `app.state.jobs.register(JOB, DiscoveryRuns(db).run, background=True)`."""

    def __init__(self, db: Database, get_connector=None) -> None:
        self._db = db
        self._get = get_connector

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        await execute(self._db, tenant_id, UUID(payload["run_id"]), self._get)


class _Log:
    """The run's log: each entry committed on its own, so a failure keeps what came before."""

    def __init__(self, db: Database, tenant_id: UUID, run: asyncpg.Record) -> None:
        self.db, self.tenant_id, self.run_id = db, tenant_id, run["id"]
        self.step_budget, self.cost_budget = run["step_budget"], run["cost_budget"]
        self.seq = run["steps_used"]
        self.cost = run["cost_units"]
        self.tool = "run.start"

    def guard(self, tool: str) -> None:
        """Called before each step: a run that has used its steps stops here."""
        self.tool = tool
        if self.seq >= self.step_budget:
            raise RunFailed("run_budget_exceeded")

    async def add(
        self,
        conn: asyncpg.Connection,
        tool: str,
        summary: str,
        started: datetime,
        ok: bool = True,
        cost: int = 0,
    ) -> None:
        self.seq += 1
        self.cost += cost
        await conn.execute(
            "insert into discovery_run_steps (run_id, seq, tool, summary, ok, cost_units, "
            "started_at, "
            "ended_at) values ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())",
            self.run_id,
            self.seq,
            tool,
            summary[:400],
            ok,
            cost,
            started,
        )
        await conn.execute(
            "update discovery_runs set steps_used = $2, cost_units = $3 where id = $1",
            self.run_id,
            self.seq,
            self.cost,
        )

    async def note(self, tool: str, summary: str, started: datetime, cost: int = 0) -> None:
        async with self.db.tenant(self.tenant_id) as conn:
            await self.add(conn, tool, summary, started, cost=cost)
        # After the row is committed, so the log keeps the step that went over. A connector
        # stops itself before an outside call that would pass the budget (`RunContext.spend`);
        # this is the backstop.
        if self.cost > self.cost_budget:
            raise RunFailed("run_budget_exceeded")


async def execute(db: Database, tenant_id: UUID, run_id: UUID, get_connector=None) -> None:
    """Carry out a queued run. It never raises for a run that fails: the failure is the run's
    state (`failed`, with its plain sentence and its log). Only a broken database comes up."""
    async with db.tenant(tenant_id) as conn:
        run = await conn.fetchrow(
            "update discovery_runs set status = 'running', started_at = now() "
            "where id = $1 and status = 'queued' returning *",
            run_id,
        )
        if run is None:
            return  # another delivery of the job, or a run already ended: nothing to do
    get_connector = get_connector or connectors.get  # looked up now, so a test can swap it
    log_ = _Log(db, tenant_id, run)
    try:
        await _carry_out(db, tenant_id, run, log_, get_connector)
    except (RunFailed, ConnectorError) as error:
        await _fail(db, tenant_id, log_, error.code, error.en, error.ar)
    except Exception:  # noqa: BLE001 - a run's failure is its state, with a plain sentence
        log.exception("discovery run %s failed", run_id)
        await _fail(db, tenant_id, log_, "run_failed", *ERRORS["run_failed"])


async def _fail(
    db: Database, tenant_id: UUID, log_: _Log, code: str, sentence: str, sentence_ar: str
) -> None:
    async with db.tenant(tenant_id) as conn:
        # The failed step is in the log too; the failure itself does not count against the budget.
        log_.seq += 1
        await conn.execute(
            "insert into discovery_run_steps (run_id, seq, tool, summary, ok) "
            "values ($1, $2, $3, $4, false)",
            log_.run_id,
            log_.seq,
            log_.tool,
            sentence[:400],
        )
        await conn.execute(
            "update discovery_runs set status = 'failed', error = $2, error_ar = $6, "
            "error_code = $3, steps_used = $4, cost_units = $5, finished_at = now() "
            "where id = $1",
            log_.run_id,
            sentence,
            code,
            log_.seq,
            log_.cost,
            sentence_ar,
        )


def _summary(tool: str, **values) -> str:
    return STEP_SUMMARIES[tool].format(**values)


def _tally(outcomes: list[rules.Outcome]) -> dict:
    return {
        "passed": sum(o.state == rules.PASS for o in outcomes),
        "failed": sum(o.state == rules.FAIL for o in outcomes),
        "unmeasured": sum(o.state == rules.NOT_MEASURED for o in outcomes),
    }


async def _carry_out(db, tenant_id, run, log_, get_connector) -> None:
    async with db.tenant(tenant_id, readonly=True) as conn:
        connected = await conn.fetchval(
            "select exists (select 1 from discovery_connections where kind = $1 and status = 'on')",
            run["connector_kind"],
        )
        place_rows = await conn.fetch(
            "select * from discovery_locations order by position, created_at"
        )
        prior = await conn.fetchval(
            "select count(*) from discovery_runs where status = 'done' and connector_kind = $1",
            run["connector_kind"],
        )
    if not connected:
        raise RunFailed("no_connection")
    locations = [
        Location(
            r["id"],
            r["name"],
            r["name_ar"],
            r["area"],
            r["place_ref"],
            r["website_url"],
            r["whatsapp_e164"],
            r["is_primary"],
            r["position"],
        )
        for r in place_rows
    ]
    if not locations:
        raise RunFailed("no_locations")

    # 1. The snapshot: the one step that may reach outside (the sample connector never does).
    log_.guard("connector.snapshot")
    started = clock()
    ctx = RunContext(now=started, prior_done_runs=prior, cost_budget=run["cost_budget"] - log_.cost)
    snapshot: Snapshot = await get_connector(run["connector_kind"]).snapshot(locations, ctx)
    await log_.note(
        "connector.snapshot",
        _summary(
            "connector.snapshot",
            places=_count_places(len(snapshot.places)),
            source=_source_name(snapshot.source),
        ),
        started,
        cost=ctx.spent,
    )

    # 2. The rules, one family at a time.
    async with db.tenant(tenant_id, readonly=True) as conn:
        previous = {
            r["fingerprint"]: rules.Previous(r["fingerprint"], r["status"])
            for r in await conn.fetch("select fingerprint, status from discovery_findings")
        }
    rule_ctx = rules.Context(snapshot, locations, previous, now=snapshot.taken_at)
    outcomes: list[rules.Outcome] = []
    for part in PARTS_WITH_RULES:
        tool = f"rules.{part}"
        log_.guard(tool)
        started = clock()
        done = rules.evaluate(rule_ctx, parts=(part,))
        outcomes.extend(done)
        await log_.note(tool, _summary(tool, **_tally(done)), started)

    hits = [o for o in outcomes if o.state == rules.FAIL]
    if len(hits) > MAX_FINDINGS:
        log_.tool = "findings.save"
        raise RunFailed("too_many_findings")

    # 3. Save the findings, in one transaction with their log row.
    log_.guard("findings.save")
    started = clock()
    async with db.tenant(tenant_id) as conn:
        new, kept, closed = await _save_findings(conn, run["id"], outcomes, snapshot)
        await log_.add(
            conn,
            "findings.save",
            _summary("findings.save", new=new, kept=kept, closed=closed),
            started,
        )

    # 4. Save the reviews.
    log_.guard("reviews.save")
    started = clock()
    async with db.tenant(tenant_id) as conn:
        saved = await _save_reviews(conn, run["id"], snapshot)
        await log_.add(conn, "reviews.save", _summary("reviews.save", n=saved), started)

    # 5. Score, and finish.
    log_.guard("score.compute")
    started = clock()
    total, parts = scoring.score(outcomes)
    async with db.tenant(tenant_id) as conn:
        await log_.add(conn, "score.compute", _summary("score.compute"), started)
        await conn.execute(
            "update discovery_runs set status = 'done', score = $2, score_parts = $3, "
            "finished_at = now() where id = $1",
            run["id"],
            total,
            parts,
        )


def _count_places(n: int) -> str:
    return f"{n} place" if n == 1 else f"{n} places"


def _source_name(source: str) -> str:
    return "the sample business" if source == "sample" else source


def _evidence(outcome: rules.Outcome, snapshot: Snapshot) -> list[dict]:
    seen = snapshot.taken_at.isoformat()
    return [
        {
            "label": e.label,
            "value": e.value,
            "where": e.where,
            "seen_at": seen,
            "source": snapshot.source,
        }
        for e in outcome.evidence
    ]


async def _save_findings(
    conn: asyncpg.Connection, run_id: UUID, outcomes: list[rules.Outcome], snapshot: Snapshot
) -> tuple[int, int, int]:
    """Upsert by fingerprint. A rule that stops being true closes its finding (`gone`, or
    `verified` if the owner had marked it done); one that is true again opens it. A finding whose
    rule could not be measured this time is left exactly as it was."""
    rows = {
        r["fingerprint"]: r
        for r in await conn.fetch(
            "select id, fingerprint, status from discovery_findings for update"
        )
    }
    new = kept = closed = 0
    fired = set()
    for outcome in outcomes:
        if outcome.state != rules.FAIL:
            continue
        rule = rules.RULE_BY_ID[outcome.rule_id]
        fired.add(outcome.fingerprint)
        evidence = _evidence(outcome, snapshot)
        before = rows.get(outcome.fingerprint)
        if before is None:
            await conn.execute(
                "insert into discovery_findings (fingerprint, rule_id, location_id, kind, "
                "severity, "
                "evidence, first_run_id, last_run_id) values ($1, $2, $3, $4, $5, $6, $7, $7)",
                outcome.fingerprint,
                rule.id,
                outcome.location_id,
                rule.kind,
                rule.severity,
                evidence,
                run_id,
            )
            new += 1
            continue
        kept += 1
        # Skipped stays skipped; anything the owner or an earlier run closed is open again.
        status = "skipped" if before["status"] == "skipped" else "open"
        await conn.execute(
            "update discovery_findings set status = $2, evidence = $3, kind = $4, severity = $5, "
            "last_run_id = $6, last_seen_at = now(), "
            "resolved_run_id = case when $2 = 'open' then null else resolved_run_id end, "
            "updated_at = case when status <> $2 then now() else updated_at end where id = $1",
            before["id"],
            status,
            evidence,
            rule.kind,
            rule.severity,
            run_id,
        )
    for outcome in outcomes:
        if outcome.state != rules.PASS or outcome.fingerprint in fired:
            continue
        before = rows.get(outcome.fingerprint)
        if before is None or before["status"] in ("verified", "gone"):
            continue
        after = "verified" if before["status"] == "owner_done" else "gone"
        await conn.execute(
            "update discovery_findings set status = $2, resolved_run_id = $3, last_run_id = $3, "
            "updated_at = now() where id = $1",
            before["id"],
            after,
            run_id,
        )
        closed += 1
    return new, kept, closed


async def _save_reviews(conn: asyncpg.Connection, run_id: UUID, snapshot: Snapshot) -> int:
    saved = 0
    for place in snapshot.places:
        for review in place.reviews or []:
            await conn.execute(
                "insert into discovery_reviews (location_id, source, source_ref, rating, "
                "posted_at, "
                "author_name, body, language, replied, reply_text, fetched_run_id) "
                "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) "
                "on conflict (tenant_id, source, source_ref) do update "
                "set rating = excluded.rating, "
                "author_name = excluded.author_name, body = excluded.body, "
                "language = excluded.language, replied = excluded.replied, "
                "reply_text = excluded.reply_text, fetched_run_id = excluded.fetched_run_id",
                place.location_id,
                snapshot.source,
                review.source_ref[:200],
                review.rating,
                review.posted_at,
                review.author_name[:120],
                review.body[:4000],
                review.language if review.language in ("en", "ar") else "en",
                review.replied,
                review.reply_text[:4000],
                run_id,
            )
            saved += 1
    return saved
