"""The run engine: one check-up, step by step (spec 065).

`start_run` is idempotent: when a run is queued or running it is returned, otherwise a queued run
is made and a `discovery.run` job is queued with it, in the same transaction. The job runs on the
existing jobs worker as `background` work, so a customer's message is always claimed first
(D-078). It loads the places, the connection and the business's check pack (`packs/`), asks the
connector for a snapshot (one step), reads ALYR's own records once (`firstparty`, when installed),
evaluates the rules of the pack (one step per part), saves the findings and the reviews, scores,
and writes `done` with the pack it ran.

**Every step is a row of `discovery_run_steps`, written in a transaction of its own as the step
ends**, so a run that fails keeps its log, and the owner reads it. **A step budget and a cost
budget stop a runaway** (`run_budget_exceeded`), and so do 200 findings in one run. One run per
shop at a time is enforced by the database (a partial unique index); a manual run may start once
in ten minutes.

Nothing here sends anything, calls `Outbound` or reaches outside ALYR: the connector is the only
thing that could, and there is only the sample one. Since Phase 2 (spec 066) a check-up also
prepares proposals from what it found and checks the ones that were applied: two more steps,
`proposals.build` and `proposals.verify`, after the findings and the reviews are saved. A check-up
never approves or applies anything.
"""

import importlib
import logging
import math
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr.config import get_settings
from alyr.core import jobs
from alyr.db import Database
from alyr.modules.discovery import (
    answer_words,
    connectors,
    observations,
    packs,
    proposals,
    rules,
    scoring,
)
from alyr.modules.discovery import words as _words
from alyr.modules.discovery.answers import service as answers
from alyr.modules.discovery.apply import load_overrides
from alyr.modules.discovery.connectors import ConnectorError, Location, RunContext, Snapshot
from alyr.modules.discovery.connectors.manual import STALE_AFTER_DAYS
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.discovery.packs import store as pack_store
from alyr.modules.discovery.words import ERRORS, STEP_SUMMARIES

log = logging.getLogger("alyr.discovery")


def _optional(name: str):
    """A module of the first-party checks (workstream C), or None while it is not installed. Only
    its own absence is tolerated: an error inside it still stops the API at start."""
    try:
        return importlib.import_module(f"alyr.modules.discovery.{name}")
    except ModuleNotFoundError as error:
        if error.name != f"alyr.modules.discovery.{name}":
            raise
        return None


_firstparty = _optional("firstparty")
# Their words join the module's own tables, through this one import (CONTRACTS.md).
_firstparty_words = _optional("words_firstparty")
if _firstparty_words is not None:
    for _table in ("RULE_WORDS", "CHECK_NAMES", "LABELS", "WHERE", "VALUES", "ERRORS",
                   "HAND_WHAT_HAPPENS_BY_RULE", "STEP_SUMMARIES"):
        if hasattr(_firstparty_words, _table):
            getattr(_words, _table).update(getattr(_firstparty_words, _table))

FIRSTPARTY_RULES: tuple[rules.Rule, ...] = tuple(
    getattr(_firstparty, "FIRSTPARTY_RULES", ()) if _firstparty is not None else ()
)
# Every rule a check-up may run, and the packs that choose among them. `PACKS` is read at call time
# (`engine.PACKS`), so a new pack handed to `packs.Registry.from_data` runs with no other change.
ALL_RULES: tuple[rules.Rule, ...] = rules.RULES + FIRSTPARTY_RULES
RULE_BY_ID: dict[str, rules.Rule] = {r.id: r for r in ALL_RULES}
PACKS = packs.Registry.from_data(
    packs.PACKS, [r.id for r in ALL_RULES], [r.id for r in FIRSTPARTY_RULES]
)

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


async def is_demo(conn: asyncpg.Connection) -> bool:
    """Whether ALYR staff marked this shop as a demo or test business (`/ops`, audited). Only such
    a shop may use the fictional `sample` source (D-169): it is the one flag the back office
    already sets for made-up data, and a shop never sets it for itself (the app role cannot write
    `tenants`)."""
    return bool(
        await conn.fetchval(
            "select demo_data_allowed from tenants "
            "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
    )


async def start_run(
    conn: asyncpg.Connection, user_id: UUID | None, trigger: str = "manual",
    by_staff: bool = False,
) -> tuple[asyncpg.Record, bool]:
    """The run to watch, and whether this call made it. Raises `no_connection`, `no_locations`
    and `run_too_soon` (429, with `retry_after` in seconds).

    **A hand-recorded source is run by ALYR staff, from the back office, and only then**
    (`by_staff`, D-169): the owner's button, a schedule and every other door would only read the
    same observation again and call it a check-up. Staff record, run, find a slip and record again,
    so the ten-minute gap between manual runs does not apply to them (one run at a time still
    holds)."""
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
    if kind == "sample" and not await is_demo(conn):
        # A sample connection left on a shop that is not a demo shop (the mark was taken off, or it
        # was switched on before the guard): it must never produce a check-up about invented data.
        raise DiscoveryError("sample_not_allowed", 409)
    if not await conn.fetchval("select exists (select 1 from discovery_locations)"):
        raise DiscoveryError("no_locations", 409)
    if kind == "manual":
        if not by_staff:
            raise DiscoveryError("manual_staff_runs", 409)
        if not await conn.fetchval("select exists (select 1 from discovery_observations)"):
            raise DiscoveryError("nothing_recorded", 409)
    if trigger == "manual" and not by_staff:
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

    def __init__(
        self, db: Database, get_connector=None,
        after_done: Callable[[UUID], Awaitable[None]] | None = None,
    ) -> None:
        self._db = db
        self._get = get_connector
        self._after = after_done

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        await execute(self._db, tenant_id, UUID(payload["run_id"]), self._get, self._after)


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


async def execute(
    db: Database, tenant_id: UUID, run_id: UUID, get_connector=None,
    after_done: Callable[[UUID], Awaitable[None]] | None = None,
) -> None:
    """Carry out a queued run. It never raises for a run that fails: the failure is the run's
    state (`failed`, with its plain sentence and its log). Only a broken database comes up.
    `after_done` runs once a check-up has finished (the worker hands in the one that asks the
    owner about what the check-up prepared); it can never fail the run."""
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
        return
    except Exception:  # noqa: BLE001 - a run's failure is its state, with a plain sentence
        log.exception("discovery run %s failed", run_id)
        await _fail(db, tenant_id, log_, "run_failed", *ERRORS["run_failed"])
        return
    if after_done is not None:
        try:
            await after_done(tenant_id)
        except Exception:  # noqa: BLE001 - what follows a check-up never fails it
            log.exception("what follows discovery run %s failed", run_id)


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
        # What the sample business's owner changed by approving proposals: loaded here, so the
        # connector still does no I/O. A real source has none.
        overrides = await load_overrides(conn) if run["connector_kind"] == "sample" else {}
        # What ALYR staff recorded, for the `manual` source: loaded here, so the connector does no
        # I/O.
        seen = await observations.latest(conn) if run["connector_kind"] == "manual" else {}
        demo = await is_demo(conn)
        selection = await pack_store.selection(conn, PACKS)
    if not connected:
        raise RunFailed("no_connection")
    if run["connector_kind"] == "sample" and not demo:
        raise RunFailed("sample_not_allowed")  # the mark came off after the run was queued
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
    connector = get_connector(run["connector_kind"])
    ctx = RunContext(
        now=started, prior_done_runs=prior, cost_budget=run["cost_budget"] - log_.cost,
        overrides=overrides, observations=seen,
    )
    snapshot: Snapshot = await connector.snapshot(locations, ctx)
    # What the source can change: a finding's kind is `agent` only while it can change that.
    # A pack's `never_edit` fields (a clinic's service text) are taken out of what it may write, so
    # no proposal is ever made for them.
    writes = packs.allowed_writes(
        frozenset(getattr(connector, "writes", None) or ()), selection.never_edit
    )
    by_hand = bool(getattr(connector, "by_hand", False))
    await log_.note(
        "connector.snapshot",
        _snapshot_sentence(snapshot, len(locations), started),
        started,
        cost=ctx.spent,
    )

    # 1b. What each place's own website says (Discovery 2.0, `connectors/website.py`): read for
    # every place with a website address, never for the fictional sample, and joined without
    # overriding what the connection said. One logged step per added source.
    # The public Google listing (`connectors/places.py`) is added the same way, its calls counted
    # on the run's cost.
    for extra in connectors.extras_for(run["connector_kind"], locations):
        tool = f"connector.{extra.kind}"
        log_.guard(tool)
        started = clock()
        spent = ctx.spent
        read = await extra.snapshot(locations, ctx)
        snapshot = connectors.merge(snapshot, read)
        await log_.note(tool, extra.sentence(read), started, cost=ctx.spent - spent)

    # 2. The rules of the business's pack, one part at a time.
    async with db.tenant(tenant_id, readonly=True) as conn:
        previous = {
            r["fingerprint"]: rules.Previous(r["fingerprint"], r["status"])
            for r in await conn.fetch("select fingerprint, status from discovery_findings")
        }
    first_party = await _first_party(db, tenant_id, clock())
    rule_ctx = rules.Context(
        snapshot, locations, previous, now=snapshot.taken_at, first_party=first_party,
        pack=selection.key,
    )
    outcomes: list[rules.Outcome] = []
    chosen = [RULE_BY_ID[rule_id] for rule_id in selection.rule_ids]
    for part in _parts(chosen):
        tool = f"rules.{part}"
        log_.guard(tool)
        started = clock()
        done = [o for rule in chosen if rule.part == part for o in rule.check(rule_ctx)]
        outcomes.extend(done)
        sentence = tool if tool in STEP_SUMMARIES else "rules.more"
        await log_.note(tool, _summary(sentence, **_tally(done)), started)

    hits = [o for o in outcomes if o.state == rules.FAIL]
    if len(hits) > MAX_FINDINGS:
        log_.tool = "findings.save"
        raise RunFailed("too_many_findings")

    # 3. Save the findings, in one transaction with their log row.
    log_.guard("findings.save")
    started = clock()
    async with db.tenant(tenant_id) as conn:
        new, kept, closed = await _save_findings(
            conn, run["id"], outcomes, snapshot, locations, writes, by_hand
        )
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
        saved = await _save_reviews(conn, run["id"], snapshot, by_hand)
        await log_.add(conn, "reviews.save", _summary("reviews.save", n=saved), started)

    # 5. Proposals: prepare what the findings call for, from the facts the owner confirmed. A
    # check-up only proposes; it never approves and never applies.
    log_.guard("proposals.build")
    started = clock()
    async with db.tenant(tenant_id) as conn:
        built = await proposals.build_step(conn, run, run["connector_kind"], writes, started)
        await log_.add(
            conn,
            "proposals.build",
            _summary(
                "proposals.build", made=len(built.made), kept=len(built.kept), closed=built.closed
            ),
            started,
        )

    # 6. Check the changes that were applied before this check-up began.
    log_.guard("proposals.verify")
    started = clock()
    async with db.tenant(tenant_id) as conn:
        confirmed, again = await proposals.verify_step(conn, run)
        await log_.add(
            conn,
            "proposals.verify",
            _summary("proposals.verify", confirmed=confirmed, again=again),
            started,
        )

    # 7. Phase 3 (spec 068): only when the Answers check is switched on, ask the public questions
    # and count the answers. It never fails the check-up: an engine's failure is a row and a
    # sentence in the log, and the part is then measured on what was counted, or not at all.
    tally = None
    async with db.tenant(tenant_id, readonly=True) as conn:
        answer_settings = await answers.load_settings(conn)
    if answer_settings.enabled:
        log_.guard("ai.answers")
        started = clock()
        try:
            tally, sentence, ok, spent = await answers.run_step(
                db, tenant_id, run["id"], answer_settings, prior, started
            )
        except Exception:  # noqa: BLE001 - what is asked of other tools never fails a check-up
            log.exception("discovery answers step failed for run %s", run["id"])
            tally, sentence, ok, spent = None, answer_words.STEP["ai.answers.failed"], False, 0
        async with db.tenant(tenant_id) as conn:
            await log_.add(conn, "ai.answers", sentence, started, ok=ok, cost=spent)

    # 8. Score, and finish.
    log_.guard("score.compute")
    started = clock()
    total, parts = scoring.score(outcomes, tally, RULE_BY_ID)
    async with db.tenant(tenant_id) as conn:
        await log_.add(conn, "score.compute", _summary("score.compute"), started)
        await conn.execute(
            "update discovery_runs set status = 'done', score = $2, score_parts = $3, "
            "checks = $4, pack = $5, finished_at = now() where id = $1",
            run["id"],
            total,
            parts,
            _checks(outcomes, selection),
            selection.record(),
        )


def _parts(chosen: list[rules.Rule]) -> list[str]:
    """The parts to log, in order: the four of Phase 1 always (a pack that skips every rule of one
    still logs it, with nothing checked), then any other part a pack's rules use."""
    extra = [p for p in dict.fromkeys(r.part for r in chosen) if p not in PARTS_WITH_RULES]
    return list(PARTS_WITH_RULES) + extra


async def _first_party(db: Database, tenant_id: UUID, now: datetime):
    """What ALYR's own records say, read once per check-up (`firstparty.first_party_facts`), in a
    transaction of its own. None when the first-party checks are not installed or the read fails:
    their rules are then `not_measured`, never guessed, and the check-up goes on."""
    if _firstparty is None or not hasattr(_firstparty, "first_party_facts"):
        return None
    try:
        async with db.tenant(tenant_id, readonly=True) as conn:
            return await _firstparty.first_party_facts(conn, tenant_id, now)
    except Exception:  # noqa: BLE001 - a missing input is "not measured", not a failed check-up
        log.exception("discovery first-party facts failed for %s", tenant_id)
        return None


def _checks(
    outcomes: list[rules.Outcome], selection: packs.Selection | None = None
) -> list[dict]:
    """What each rule found at each place, kept with the run so a screen can tell a check
    that passed from one that was not measured (spec 065, "Checks per place"). The same
    rule outcomes the score was made of; the Answers check (spec 068) is counted apart and
    is not in this list. Each says which pack brought it, for "N of M checks match" per pack."""
    owner = selection.owner if selection is not None else {}
    return [
        {
            "rule": o.rule_id,
            "location": str(o.location_id) if o.location_id else None,
            "state": o.state,
            "pack": owner.get(o.rule_id, "core"),
        }
        for o in outcomes
    ]


def _count_places(n: int) -> str:
    return f"{n} place" if n == 1 else f"{n} places"


def _source_name(source: str) -> str:
    return "the sample business" if source == "sample" else source


def _snapshot_sentence(snapshot: Snapshot, asked: int, now: datetime) -> str:
    """The log's sentence for the first step. A hand-recorded source says so, and which day it was
    looked at, and says plainly when that is old: it never reads as if ALYR looked today."""
    if snapshot.source != "manual":
        return _summary(
            "connector.snapshot",
            places=_count_places(len(snapshot.places)),
            source=_source_name(snapshot.source),
        )
    day = snapshot.taken_at.date()
    age = (now.date() - day).days
    sentence = _summary(
        "connector.snapshot.manual",
        places=_count_places(len(snapshot.places)),
        day=f"{day.day} {day.strftime('%b')} {day.year}",
    )
    if len(snapshot.places) < asked:
        sentence += " " + _summary(
            "connector.snapshot.manual.missing", others=_count_places(asked - len(snapshot.places))
        )
    if age > STALE_AFTER_DAYS:
        sentence += " " + _summary("connector.snapshot.manual.old", days=age)
    return sentence


def _evidence(outcome: rules.Outcome, snapshot: Snapshot) -> list[dict]:
    # The day it was seen: a hand-recorded place carries its own, so an old observation is never
    # dated by the check-up that read it.
    place = snapshot.of(outcome.location_id) if outcome.location_id else None
    seen = (place.observed_at if place and place.observed_at else snapshot.taken_at).isoformat()
    # What the business's own website said was read from it, at the time it was read, whatever
    # the connection of the run (Discovery 2.0).
    site = place.website if place and isinstance(place.website, connectors.SiteWebsite) else None
    # What Google's public listing said, read live (`connectors/places.py`): labelled `google`, so
    # `retention.py` removes it after 30 days, and dated when it was read. A finding about the
    # whole business (the name) quotes each place's listing: Google's if any place's was.
    live = [p.listing for p in snapshot.places if isinstance(p.listing, connectors.PlacesListing)]
    google = (
        place.listing if place and isinstance(place.listing, connectors.PlacesListing)
        else live[0] if live and place is None else None
    )

    def when(where: str) -> str:
        if site and where == "website" and site.read_at:
            return site.read_at.isoformat()
        if google and where == "listing" and google.read_at:
            return google.read_at.isoformat()
        return seen

    def source(where: str) -> str:
        if site and where == "website":
            return "website"
        if google and where == "listing":
            return google.source
        return snapshot.source

    return [
        {
            "label": e.label,
            "value": e.value,
            "where": e.where,
            "seen_at": when(e.where),
            "source": source(e.where),
        }
        for e in outcome.evidence
    ]


def _recorded_after(snapshot: Snapshot, location_id: UUID | None) -> datetime | None:
    """When staff last recorded what this finding is about: its place's observation, or for a
    finding about the whole business the newest of any place."""
    if location_id is not None:
        place = snapshot.of(location_id)
        return place.recorded_at if place else None
    times = [p.recorded_at for p in snapshot.places if p.recorded_at]
    return max(times) if times else None


async def _save_findings(
    conn: asyncpg.Connection, run_id: UUID, outcomes: list[rules.Outcome], snapshot: Snapshot,
    locations: list[Location] | None = None, writes=frozenset(), by_hand: bool = False,
) -> tuple[int, int, int]:
    """Upsert by fingerprint. A rule that stops being true closes its finding (`gone`, or
    `verified` if the owner had marked it done); one that is true again opens it. A finding whose
    rule could not be measured this time is left exactly as it was.

    **A hand-recorded source (`by_hand`) cannot look again by itself.** A finding the owner marked
    done stays marked, waiting, until staff record an observation after that; the check-up that
    only re-reads the old observation does not reopen it, and one that reads a newer observation
    either verifies it (the rule now passes) or reopens it (it still fails)."""
    rows = {
        r["fingerprint"]: r
        for r in await conn.fetch(
            "select id, fingerprint, status, updated_at from discovery_findings for update"
        )
    }
    new = kept = closed = 0
    fired = set()
    for outcome in outcomes:
        if outcome.state != rules.FAIL:
            continue
        rule = RULE_BY_ID[outcome.rule_id]
        fired.add(outcome.fingerprint)
        evidence = _evidence(outcome, snapshot)
        kind = rules.effective_kind(rule, writes, by_hand)
        observed = proposals.observed_for(rule.id, outcome.location_id, snapshot, locations or [])
        before = rows.get(outcome.fingerprint)
        if before is None:
            await conn.execute(
                "insert into discovery_findings (fingerprint, rule_id, location_id, kind, "
                "severity, "
                "evidence, observed, first_run_id, last_run_id) "
                "values ($1, $2, $3, $4, $5, $6, $7, $8, $8)",
                outcome.fingerprint,
                rule.id,
                outcome.location_id,
                kind,
                rule.severity,
                evidence,
                observed,
                run_id,
            )
            new += 1
            continue
        kept += 1
        # Skipped stays skipped; anything the owner or an earlier run closed is open again.
        status = "skipped" if before["status"] == "skipped" else "open"
        if by_hand and before["status"] == "owner_done":
            recorded = _recorded_after(snapshot, outcome.location_id)
            if recorded is not None and recorded <= before["updated_at"]:
                status = "owner_done"  # no newer observation: nothing has looked again
        await conn.execute(
            "update discovery_findings set status = $2, evidence = $3, kind = $4, severity = $5, "
            "last_run_id = $6, last_seen_at = now(), observed = $7, "
            "resolved_run_id = case when $2 = 'open' then null else resolved_run_id end, "
            "updated_at = case when status <> $2 then now() else updated_at end where id = $1",
            before["id"],
            status,
            evidence,
            kind,
            rule.severity,
            run_id,
            observed,
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


async def _save_reviews(
    conn: asyncpg.Connection, run_id: UUID, snapshot: Snapshot, by_hand: bool = False
) -> int:
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
                "posted_at = case when discovery_reviews.source = 'manual' "
                "then excluded.posted_at else discovery_reviews.posted_at end, "
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
    if by_hand:
        # A recorded round is the whole picture of a place's reviews: ones from an earlier round
        # that this one does not hold (a correction, or "reviews not checked") are not kept.
        await conn.execute(
            "delete from discovery_reviews where source = $1 and fetched_run_id is distinct "
            "from $2",
            snapshot.source, run_id,
        )
    return saved
