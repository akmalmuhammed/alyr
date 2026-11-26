"""The Answers check as a step of the check-up, and what the screens read (spec 068; Discovery 2.0,
DECISIONS 6 and 7, research R4).

`run_step` builds the public questions and, for each switched-on tool and each language, counts a
**pooled run**: the newest complete one of its cell (`pool.py`) or, when there is none, one it asks
now (outside any database transaction) and keeps for the next business. Every answer is counted
for this business by rule (`reading.py`: named or not, with its own name forms), and every cited
passage is checked against what this owner confirmed (`sources.py`). One row per answer is kept in
the business's own `discovery_answers`. It never fails the check-up: a tool that errors makes
`error` rows and the step says so. Nothing here reaches outside ALYR but an engine, the only engine
is the sample one, and the only tables it names are `discovery_*` and `tenants`.

**Not part of the score.** The answers are a sample of what tools say, not a check ALYR can verify,
so they stay out of the weighted score and out of "N of M checks match" (DECISIONS 7). They are
reported on their own, **per tool and per language, never merged**: "named in N of M" with its
range (`stats.py`), a share only from 30 answers, a change only when both check-ups counted 30 or
more from that tool in that language and the ranges do not overlap, and never a position.

The views at the bottom are what `GET /answers`, the overview and the report answer.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.config import get_settings
from alyr.modules.discovery import answer_words as aw
from alyr.modules.discovery import facts as facts_store
from alyr.modules.discovery.answers import engines, pool, questions, reading, sources, stats
from alyr.modules.discovery.answers.engines import AnswersBudgetExceeded, AskContext, EngineError
from alyr.modules.discovery.scoring import AnswersTally
from alyr.modules.items.text import fold

log = logging.getLogger("alyr.discovery")

AI_COST_BUDGET = 60  # units a check-up may spend asking, apart from the listings' own budget
MAX_ENGINES = 3
MAX_ASKS_PER_RUN = 18  # new askings a check-up may make; shared answers cost nothing
# How many times each question is asked in one pooled run. R4 suggests 3 once there are about 12
# questions per trade and language; with 3 questions it stays 1 (the lead's call, with the cost).
ASKS_PER_QUESTION = 1
STOP_AFTER_FAILURES = 3  # in a row, for one engine, in one check-up
MAX_TEXT = 4000
HISTORY = 12
TOP_COMPETITORS = 8
LANGS = ("en", "ar")
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


@dataclass(frozen=True)
class AnswerSettings:
    enabled: bool = False
    trade: str | None = None
    city: str | None = None
    engines: tuple[str, ...] = ("sample",)
    monthly_ask_cap: int = 300
    area: str | None = None


async def load_settings(conn: asyncpg.Connection) -> AnswerSettings:
    row = await conn.fetchrow(
        "select enabled, trade, city, engines, monthly_ask_cap, area "
        "from discovery_answer_settings"
    )
    if row is None:
        return AnswerSettings()
    return AnswerSettings(
        row["enabled"], row["trade"], row["city"], tuple(row["engines"]), row["monthly_ask_cap"],
        row["area"],
    )


async def business_names(conn: asyncpg.Connection) -> tuple[str, ...]:
    """The names to look for: the business's own and each of its places', in both languages. Only
    ever used to count an answer here; never sent anywhere."""
    shop = await conn.fetchrow(f"select name, name_ar from tenants where id = {_TENANT}")
    places = await conn.fetch("select name, name_ar from discovery_locations")
    names = [shop["name"], shop["name_ar"]] if shop else []
    for p in places:
        names += [p["name"], p["name_ar"]]
    return reading.name_forms(*[n for n in names if n])


async def confirmed_phones(conn: asyncpg.Connection) -> frozenset[str]:
    """Every phone and WhatsApp number the owner confirmed (or the place's own number), in the form
    they are compared in. Only used to check a cited passage here."""
    found = await facts_store.load(conn)
    return sources.phone_keys(
        f.value.get("phone", "") for f in found.values() if f.key in ("phone", "whatsapp")
    )


@dataclass
class _Row:
    engine: str
    question: questions.PublicQuestion
    status: str
    error_code: str | None = None
    text: str = ""
    result: reading.Reading | None = None
    cost: int = 0
    repeat: int = 1
    pool_id: UUID | None = None
    sources: list[dict] = field(default_factory=list)
    searches: list[str] = field(default_factory=list)


@dataclass
class _Asking:
    """What one check-up has asked so far, across tools and languages."""

    rows: int = 0
    stopped: bool = False


async def _asked_this_month(conn: asyncpg.Connection, engine: str) -> int:
    """What this business's check-ups paid to ask of a live tool this month. Pooled answers it only
    counted cost nothing and are not counted; the sample costs nothing either."""
    return await conn.fetchval(
        "select count(*) from discovery_answers where engine = $1 and cost_units > 0 "
        "and asked_at >= date_trunc('month', now())",
        engine,
    )


async def _ask(engine, asked_questions, location, ctx: AskContext, state: _Asking,
               failures: list[int]) -> list[pool.Asked]:
    """Ask one language's questions of one engine; `failures` counts errors in a row across the
    engine's languages (one list so the caller sees it)."""
    fresh: list[pool.Asked] = []
    for q in asked_questions:
        for repeat in range(1, ASKS_PER_QUESTION + 1):
            if state.rows >= MAX_ASKS_PER_RUN or state.stopped:
                return fresh
            if failures[0] >= STOP_AFTER_FAILURES:
                return fresh
            try:
                raw = await engine.ask(questions.request_of(q, location), ctx)
            except AnswersBudgetExceeded:
                state.stopped = True
                return fresh
            except EngineError as error:
                failures[0] += 1
                state.rows += 1
                fresh.append(pool.Asked(q, repeat, "error", error.code))
                continue
            except Exception:  # noqa: BLE001 - an engine's failure is a row, never the check-up
                log.exception("discovery answers: engine %s failed", engine.kind)
                failures[0] += 1
                state.rows += 1
                fresh.append(pool.Asked(q, repeat, "error", "engine_failed"))
                continue
            failures[0] = 0
            state.rows += 1
            fresh.append(pool.Asked(
                q, repeat, "ok", None, raw.text[:MAX_TEXT], sources.clean(raw.sources),
                sources.clean_searches(raw.searches), (raw.model or "")[:80], engine.cost_per_call,
            ))
            if engine.live:
                ctx.asked_this_month += 1
    return fresh


async def run_step(
    db, tenant_id, run_id, settings: AnswerSettings, prior_done_runs: int, now: datetime
) -> tuple[AnswersTally | None, str, bool, int]:
    """Count (and where needed ask), and keep. Returns the tally (None when nothing could be
    counted), the one-line summary for the log, whether every answer was had, and the cost in
    units this check-up spent."""
    if not settings.trade or not settings.city:
        return None, aw.STEP["ai.answers.unset"], False, 0
    asked_questions = questions.build(settings.trade, settings.city)
    location = questions.location_of(settings.city, settings.area)
    area = settings.area or ""
    async with db.tenant(tenant_id, readonly=True) as conn:
        forms_names = await business_names(conn)
        confirmed = await confirmed_phones(conn)
        used = {kind: await _asked_this_month(conn, kind) for kind in settings.engines}
    rows: list[_Row] = []
    state = _Asking()
    spent = 0
    for kind in settings.engines[:MAX_ENGINES]:
        try:
            engine = engines.get(kind)
        except EngineError as error:
            rows += [_Row(kind, q, "error", error.code) for q in asked_questions]
            continue
        ctx = AskContext(
            now=now, stage=min(prior_done_runs, 3), cost_budget=AI_COST_BUDGET - spent,
            asked_this_month=used.get(kind, 0), monthly_cap=settings.monthly_ask_cap,
        )
        variant = engines.variant_of(engine, ctx.stage)
        failures = [0]
        for lang in LANGS:
            cell = pool.Cell(settings.trade, settings.city, area, lang, kind, variant)
            async with db.tenant(tenant_id, readonly=True) as conn:
                shared = await pool.find(conn, cell, now)
            paid = shared is None
            if shared is None:
                ours = [q for q in asked_questions if q.lang == lang]
                shared = await _ask(engine, ours, location, ctx, state, failures)
                if shared:
                    complete = len(shared) == len(ours) * ASKS_PER_QUESTION and all(
                        a.status == "ok" for a in shared)
                    async with db.tenant(tenant_id) as conn:
                        await pool.store(conn, cell, shared, complete, now)
            for a in shared:
                ok = a.status == "ok"
                rows.append(_Row(
                    kind, a.question, a.status, a.error_code, a.text,
                    reading.read(a.text, forms_names) if ok else None, a.cost if paid else 0,
                    a.repeat, a.id,
                    sources.checked(a.sources, forms_names, confirmed) if ok else [],
                    list(a.searches) if ok else [],
                ))
        spent += ctx.spent
    async with db.tenant(tenant_id) as conn:
        for r in rows:
            await _keep(conn, run_id, r, area, now)
    counted_n = sum(1 for r in rows if r.status == "ok")
    named = sum(1 for r in rows if r.status == "ok" and r.result and r.result.named)
    ok = all(r.status == "ok" for r in rows) and not state.stopped
    tally = AnswersTally(named, counted_n) if rows else None
    if state.stopped:
        summary = aw.STEP["ai.answers.stopped"].format(asked=len(rows), counted=counted_n)
    elif counted_n == 0:
        summary = aw.STEP["ai.answers.few"].format(asked=len(rows), counted=counted_n)
    else:
        summary = aw.STEP["ai.answers"].format(asked=len(rows), named=named, counted=counted_n)
    return tally, summary, ok, spent


async def _keep(conn: asyncpg.Connection, run_id, row: _Row, area: str, now: datetime) -> None:
    result = row.result
    await conn.execute(
        "insert into discovery_answers (run_id, engine, question_key, lang, question, status, "
        "error_code, answer, named, position, list_size, matched, competitors, cost_units, "
        "asked_at, repeat, pool_answer_id, area, sources, searches) values ($1, $2, $3, $4, $5, "
        "$6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) "
        "on conflict (tenant_id, run_id, engine, question_key, lang, repeat) do nothing",
        run_id, row.engine, row.question.key, row.question.lang, row.question.text, row.status,
        row.error_code, row.text, bool(result and result.named),
        result.position if result else None,
        result.list_size if result else 0, result.matched if result else "",
        list(result.competitors) if result else [], row.cost, now, row.repeat, row.pool_id,
        area, row.sources, row.searches,
    )


# ── what the screens read ───────────────────────────────────────────────────────────────


@dataclass
class _Run:
    run_id: UUID
    asked_at: datetime
    groups: dict[tuple[str, str], dict]  # (engine, lang) -> {named, counted, asked}

    @property
    def named(self) -> int:
        return sum(g["named"] for g in self.groups.values())

    @property
    def counted(self) -> int:
        return sum(g["counted"] for g in self.groups.values())

    @property
    def sample(self) -> bool:
        return all(engine == "sample" for engine, _ in self.groups)


async def _runs(conn: asyncpg.Connection, limit: int, run_ids=None) -> list[_Run]:
    """The check-ups that asked, newest first, each with its counts per tool and language."""
    heads = await conn.fetch(
        "select run_id, min(asked_at) as asked_at from discovery_answers "
        "where ($2::uuid[] is null or run_id = any($2)) "
        "group by run_id order by min(asked_at) desc, run_id limit $1",
        limit, run_ids,
    )
    if not heads:
        return []
    counts = await conn.fetch(
        "select run_id, engine, lang, count(*) as asked, "
        "count(*) filter (where status = 'ok') as counted, "
        "count(*) filter (where status = 'ok' and named) as named "
        "from discovery_answers where run_id = any($1) group by run_id, engine, lang",
        [h["run_id"] for h in heads],
    )
    groups: dict[UUID, dict] = {h["run_id"]: {} for h in heads}
    for c in counts:
        groups[c["run_id"]][(c["engine"], c["lang"])] = {
            "named": c["named"], "counted": c["counted"], "asked": c["asked"]}
    return [_Run(h["run_id"], h["asked_at"], groups[h["run_id"]]) for h in heads]


class _Labels:
    """The owner's names for the tools: "Sample answers", or "Answer tool 1" in the order the shop
    switched them on (then any other found in its history), or a tool's name when naming is
    switched on (DECISIONS 6)."""

    def __init__(self, settings: AnswerSettings, runs: list[_Run], lang: str) -> None:
        seen = [k for r in runs for k, _ in sorted(r.groups)]
        self.numbers = engines.numbering([*settings.engines, *sorted(set(seen))])
        self.named = bool(getattr(get_settings(), "discovery_answers_name_tools", False))
        self.lang = lang

    def __call__(self, kind: str) -> str:
        return engines.label_of(kind, self.lang, self.numbers.get(kind), self.named)


def _order(keys) -> list[tuple[str, str]]:
    return sorted(keys, key=lambda k: (k[0] != "sample", k[0], LANGS.index(k[1])))


def _group_view(key: tuple[str, str], runs: list[_Run], at: int, label, lang: str) -> dict:
    engine, in_lang = key
    g = runs[at].groups[key]
    named, counted_n = g["named"], g["counted"]
    previous = next(((r.run_id, r.groups[key]) for r in runs[at + 1:] if key in r.groups), None)
    since = stats.Count(previous[1]["named"], previous[1]["counted"]) if previous else None
    state = stats.compare(since, stats.Count(named, counted_n))
    rng = stats.range_view(named, counted_n)
    p_rng = stats.range_view(since.named, since.counted) if since else None
    return {
        "engine": engine,
        "engine_label": label(engine),
        "sample": engine == "sample",
        "lang": in_lang,
        "lang_label": aw.pick(aw.LANGS[in_lang], lang),
        "named": named,
        "counted": counted_n,
        "asked": g["asked"],
        "range": rng,
        "share": stats.share(named, counted_n),
        "headline": aw.headline(named, counted_n, counted_n > 0, lang),
        "change": {
            "state": state,
            "reason": aw.change_reason(
                state, lang, previous=since.counted if since else 0, last=counted_n,
                p_range=p_rng, range_=rng),
            "since_run_id": str(previous[0]) if previous else None,
            "since": {"named": since.named, "counted": since.counted, "range": p_rng}
            if since else None,
        },
    }


def _groups(runs: list[_Run], at: int, label, lang: str) -> list[dict]:
    return [_group_view(k, runs, at, label, lang) for k in _order(runs[at].groups)]


def _run_view(run: _Run) -> dict:
    return {"run_id": str(run.run_id), "asked_at": run.asked_at.isoformat(),
            "named": run.named, "counted": run.counted, "sample": run.sample}


def _sources_view(checked_sources, lang: str) -> list[dict]:
    return [s | {"check_label": aw.pick(aw.CHECK[s.get("check", sources.NOT_READ)], lang)}
            for s in checked_sources or ()]


def _answer_view(row: asyncpg.Record, label, lang: str) -> dict:
    """One answer, as third-party text: never a position (R4: "a rank is noise")."""
    return {
        "id": str(row["id"]),
        "engine": row["engine"],
        "engine_label": label(row["engine"]),
        "question_key": row["question_key"],
        "lang": row["lang"],
        "repeat": row["repeat"],
        "question": row["question"],
        "status": row["status"],
        "error": aw.error_text(row["error_code"], lang) if row["status"] == "error" else None,
        "named": row["named"],
        "matched": row["matched"],
        "competitors": list(row["competitors"] or []),
        "text": row["answer"],
        "third_party": True,
        "said_by": label(row["engine"]),
        "sources": _sources_view(row["sources"], lang),
        "searches": list(row["searches"] or []),
        "shared": row["pool_answer_id"] is not None,
    }


def competitors_table(rows: list[asyncpg.Record]) -> list[dict]:
    """Who else was named across a check-up's answers, most often first."""
    seen: dict[str, dict] = {}
    for row in rows:
        if row["status"] != "ok":
            continue
        for name in row["competitors"] or []:
            entry = seen.setdefault(fold(name), {"name": name, "answers": 0})
            entry["answers"] += 1
    ordered = sorted(seen.values(), key=lambda e: (-e["answers"], fold(e["name"])))
    return ordered[:TOP_COMPETITORS]


def _hosts_view(rows: list[asyncpg.Record], label, lang: str) -> list[dict]:
    hosts = sources.aggregate([
        {"status": r["status"], "named": r["named"], "sources": r["sources"],
         "engine": r["engine"], "lang": r["lang"]} for r in rows])
    for h in hosts:
        h["check_label"] = aw.pick(aw.CHECK[h["check"]], lang)
        h["engine_labels"] = [label(k) for k in h["engines"]]
    return hosts


async def overview_block(conn: asyncpg.Connection, lang: str) -> dict | None:
    """The overview's `answers` key: null until the check has been switched on."""
    settings = await load_settings(conn)
    runs = await _runs(conn, HISTORY)
    if not settings.enabled and not runs:
        return None
    label = _Labels(settings, runs, lang)
    last = runs[0] if runs else None
    return {
        "enabled": settings.enabled,
        "measured": bool(last and last.counted),
        "named": last.named if last else 0,
        "counted": last.counted if last else 0,
        "sample": bool(last and last.sample),
        "asked_at": last.asked_at.isoformat() if last else None,
        "groups": [
            {k: g[k] for k in ("engine", "engine_label", "lang", "named", "counted", "range")}
            | {"change": g["change"]["state"]}
            for g in (_groups(runs, 0, label, lang) if last else [])
        ],
    }


async def report_block(conn: asyncpg.Connection, run_ids: list) -> dict | None:
    """The month's report: the counts at the first and the last check-up that asked, and the
    last one's per tool and language (the words are the screen's)."""
    if not run_ids:
        return None
    runs = await _runs(conn, 100, run_ids)
    if not runs:
        return None
    first, last = runs[-1], runs[0]
    label = _Labels(await load_settings(conn), runs, "en")
    return {
        "named": last.named, "counted": last.counted, "sample": last.sample,
        "first": {"named": first.named, "counted": first.counted,
                  "asked_at": first.asked_at.isoformat()},
        "groups": [
            {k: g[k] for k in ("engine", "lang", "named", "counted", "range")}
            | {"change": g["change"]["state"]}
            for g in _groups(runs, 0, label, "en")
        ],
    }


def settings_view(settings: AnswerSettings, lang: str) -> dict:
    return {
        "trade": settings.trade, "city": settings.city, "area": settings.area,
        "engines": list(settings.engines),
        "monthly_ask_cap": settings.monthly_ask_cap,
        "trade_label": questions.label(questions.TRADES, settings.trade, lang),
        "city_label": questions.label(questions.CITIES, settings.city, lang),
        "area_label": questions.area_label(settings.city, settings.area, lang),
    }


def _method(settings: AnswerSettings, last: _Run | None, label, lang: str) -> str:
    kinds = sorted({k for k, _ in last.groups}) if last else list(settings.engines)
    live = [k for k in kinds if k != "sample"]
    live.sort(key=lambda k: label.numbers.get(k, 99))
    place = aw.place_of(
        questions.label(questions.CITIES, settings.city, lang),
        questions.area_label(settings.city, settings.area, lang), lang,
    )
    return aw.method([label(k) for k in live], place, not live, lang)


async def answers_view(conn: asyncpg.Connection, lang: str) -> dict:
    settings = await load_settings(conn)
    runs = await _runs(conn, HISTORY)
    label = _Labels(settings, runs, lang)
    last = previous = None
    if runs:
        head = runs[0]
        rows = await conn.fetch(
            "select * from discovery_answers where run_id = $1 "
            "order by engine, case lang when 'en' then 0 else 1 end, question_key, repeat",
            head.run_id,
        )
        last = _run_view(head) | {
            "groups": _groups(runs, 0, label, lang),
            "answers": [_answer_view(r, label, lang) for r in rows],
            "competitors": competitors_table(rows),
            "sources": _hosts_view(rows, label, lang),
            "searches": sources.searches_table([
                {"status": r["status"], "searches": r["searches"], "lang": r["lang"]}
                for r in rows]),
        }
    if len(runs) > 1:
        previous = _run_view(runs[1])
    asked = (
        [{"key": q.key, "lang": q.lang, "text": q.text}
         for q in questions.build(settings.trade, settings.city)]
        if settings.trade and settings.city else []
    )
    return {
        "enabled": settings.enabled,
        "available": list(engines.AVAILABLE),
        "settings": settings_view(settings, lang),
        "options": {
            "trades": questions.options(questions.TRADES, lang),
            "cities": questions.options(questions.CITIES, lang),
            "areas": {city: questions.options(areas, lang)
                      for city, areas in questions.AREAS.items()},
        },
        "engines": [
            {"kind": k, "label": label(k), "sample": k == "sample", "live": k != "sample"}
            for k in settings.engines
        ],
        "questions": asked,
        "last": last,
        "previous": previous,
        "history": [
            _run_view(r) | {"groups": [
                {k: g[k] for k in ("engine", "lang", "named", "counted", "range")}
                for g in _groups(runs, i, label, lang)]}
            for i, r in enumerate(runs)
        ],
        "headline": aw.headline(
            runs[0].named if runs else None, runs[0].counted if runs else 0,
            bool(runs and runs[0].counted), lang,
        ),
        "method": _method(settings, runs[0] if runs else None, label, lang),
        "range_note": aw.pick(aw.RANGE_NOTE, lang),
        "quote_note": aw.pick(aw.QUOTE_NOTE, lang),
        "sources_title": aw.pick(aw.SOURCES_TITLE, lang),
        "sources_note": aw.pick(aw.SOURCES_NOTE, lang),
        "rule": aw.pick(aw.RULE, lang),
        "limits": aw.pick(aw.LIMITS, lang),
        "caution": aw.pick(aw.CAUTION, lang),
        "sample_note": aw.pick(aw.SAMPLE_MARK, lang),
    }
