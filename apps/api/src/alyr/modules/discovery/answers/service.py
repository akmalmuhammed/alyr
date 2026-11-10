"""The Answers check as a step of the check-up, and what the screens read (spec 068).

`run_step` builds the public questions, asks each switched-on engine (outside any database
transaction), counts every answer by rule and keeps one row per answer. It never fails the
check-up: an engine that errors makes `error` rows and the step says so. Nothing here reaches
outside ALYR but an engine, the only engine is the sample one, and the only tables it names are
`discovery_*` and `tenants`.

The views at the bottom are what `GET /answers`, the overview and the report answer.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from fractions import Fraction

import asyncpg

from alyr.modules.discovery import answer_words as aw
from alyr.modules.discovery.answers import engines, questions, reading
from alyr.modules.discovery.answers.engines import AnswersBudgetExceeded, AskContext, EngineError
from alyr.modules.discovery.scoring import MIN_ANSWERS, AnswersTally
from alyr.modules.items.text import fold

log = logging.getLogger("alyr.discovery")

AI_COST_BUDGET = 60  # units a check-up may spend asking, apart from the listings' own budget
MAX_ENGINES = 3
MAX_ASKS_PER_RUN = 18
STOP_AFTER_FAILURES = 3  # in a row, for one engine, in one check-up
MAX_TEXT = 4000
HISTORY = 12
TOP_COMPETITORS = 8
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


@dataclass(frozen=True)
class AnswerSettings:
    enabled: bool = False
    trade: str | None = None
    city: str | None = None
    engines: tuple[str, ...] = ("sample",)
    monthly_ask_cap: int = 300


async def load_settings(conn: asyncpg.Connection) -> AnswerSettings:
    row = await conn.fetchrow(
        "select enabled, trade, city, engines, monthly_ask_cap from discovery_answer_settings"
    )
    if row is None:
        return AnswerSettings()
    return AnswerSettings(
        row["enabled"], row["trade"], row["city"], tuple(row["engines"]), row["monthly_ask_cap"]
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


def half_up_share(named: int, counted: int) -> int | None:
    """The share of counted answers that named the business, 0 to 100; null below the minimum."""
    if counted < MIN_ANSWERS:
        return None
    return int((Fraction(100 * named, counted) + Fraction(1, 2)) // 1)


@dataclass
class _Row:
    engine: str
    question: questions.PublicQuestion
    status: str
    error_code: str | None = None
    text: str = ""
    result: reading.Reading | None = None
    cost: int = 0


async def _asked_this_month(conn: asyncpg.Connection, engine: str) -> int:
    return await conn.fetchval(
        "select count(*) from discovery_answers where engine = $1 "
        "and asked_at >= date_trunc('month', now())",
        engine,
    )


async def run_step(
    db, tenant_id, run_id, settings: AnswerSettings, prior_done_runs: int, now: datetime
) -> tuple[AnswersTally | None, str, bool, int]:
    """Ask, count and keep. Returns the tally (None when nothing could be asked), the one-line
    summary for the log, whether every ask went well, and the cost in units."""
    if not settings.trade or not settings.city:
        return None, aw.STEP["ai.answers.unset"], False, 0
    asked_questions = questions.build(settings.trade, settings.city)
    forms_names: tuple[str, ...]
    async with db.tenant(tenant_id, readonly=True) as conn:
        forms_names = await business_names(conn)
        used = {kind: await _asked_this_month(conn, kind) for kind in settings.engines}
    rows: list[_Row] = []
    spent = 0
    stopped = False
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
        failures = 0
        for q in asked_questions:
            if len(rows) >= MAX_ASKS_PER_RUN or stopped:
                break
            if failures >= STOP_AFTER_FAILURES:
                break
            try:
                raw = await engine.ask(questions.request_of(q), ctx)
            except AnswersBudgetExceeded:
                stopped = True
                break
            except EngineError as error:
                failures += 1
                rows.append(_Row(kind, q, "error", error.code))
                continue
            except Exception:  # noqa: BLE001 - an engine's failure is a row, never the check-up
                log.exception("discovery answers: engine %s failed", kind)
                failures += 1
                rows.append(_Row(kind, q, "error", "engine_failed"))
                continue
            failures = 0
            text = raw.text[:MAX_TEXT]
            rows.append(_Row(
                kind, q, "ok", None, text, reading.read(text, forms_names),
                engine.cost_per_call,
            ))
            if engine.live:
                ctx.asked_this_month += 1
        spent += ctx.spent
    async with db.tenant(tenant_id) as conn:
        for r in rows:
            await _keep(conn, run_id, r, now)
    counted_n = sum(1 for r in rows if r.status == "ok")
    named = sum(1 for r in rows if r.status == "ok" and r.result and r.result.named)
    ok = all(r.status == "ok" for r in rows) and not stopped
    tally = AnswersTally(named, counted_n) if rows else None
    if stopped:
        summary = aw.STEP["ai.answers.stopped"].format(asked=len(rows), counted=counted_n)
    elif counted_n < MIN_ANSWERS:
        summary = aw.STEP["ai.answers.few"].format(asked=len(rows), counted=counted_n)
    else:
        summary = aw.STEP["ai.answers"].format(asked=len(rows), named=named, counted=counted_n)
    return tally, summary, ok, spent


async def _keep(conn: asyncpg.Connection, run_id, row: _Row, now: datetime) -> None:
    result = row.result
    await conn.execute(
        "insert into discovery_answers (run_id, engine, question_key, lang, question, status, "
        "error_code, answer, named, position, list_size, matched, competitors, cost_units, "
        "asked_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) "
        "on conflict (tenant_id, run_id, engine, question_key, lang) do nothing",
        run_id, row.engine, row.question.key, row.question.lang, row.question.text, row.status,
        row.error_code, row.text, bool(result and result.named),
        result.position if result else None,
        result.list_size if result else 0, result.matched if result else "",
        list(result.competitors) if result else [], row.cost, now,
    )


# ── what the screens read ───────────────────────────────────────────────────────────────


async def _tallies(conn: asyncpg.Connection, limit: int, run_ids=None) -> list[asyncpg.Record]:
    return await conn.fetch(
        "select run_id, min(asked_at) as asked_at, "
        "count(*) filter (where status = 'ok') as counted, "
        "count(*) filter (where status = 'ok' and named) as named, "
        "bool_and(engine = 'sample') as sample "
        "from discovery_answers where ($2::uuid[] is null or run_id = any($2)) "
        "group by run_id order by min(asked_at) desc, run_id limit $1",
        limit, run_ids,
    )


def _tally_view(row: asyncpg.Record) -> dict:
    named, counted_n = row["named"], row["counted"]
    share = half_up_share(named, counted_n)
    return {
        "run_id": str(row["run_id"]),
        "asked_at": row["asked_at"].isoformat(),
        "named": named,
        "counted": counted_n,
        "share": share,
        "measured": share is not None,
    }


def _answer_view(row: asyncpg.Record, lang: str) -> dict:
    return {
        "id": str(row["id"]),
        "engine": row["engine"],
        "engine_label": engines.label_of(row["engine"], lang),
        "question_key": row["question_key"],
        "lang": row["lang"],
        "question": row["question"],
        "status": row["status"],
        "error": aw.error_text(row["error_code"], lang) if row["status"] == "error" else None,
        "named": row["named"],
        "position": row["position"],
        "list_size": row["list_size"],
        "matched": row["matched"],
        "competitors": list(row["competitors"] or []),
        "text": row["answer"],
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


def _change(last: dict | None, previous: dict | None) -> dict | None:
    if last and previous and last["share"] is not None and previous["share"] is not None:
        return {"share_change": last["share"] - previous["share"],
                "since_run_id": previous["run_id"]}
    return None


async def overview_block(conn: asyncpg.Connection, lang: str) -> dict | None:
    """The overview's `answers` key: null until the check has been switched on."""
    settings = await load_settings(conn)
    tallies = await _tallies(conn, 2)
    if not settings.enabled and not tallies:
        return None
    last = _tally_view(tallies[0]) if tallies else None
    previous = _tally_view(tallies[1]) if len(tallies) > 1 else None
    return {
        "enabled": settings.enabled,
        "measured": bool(last and last["measured"]),
        "named": last["named"] if last else 0,
        "counted": last["counted"] if last else 0,
        "share": last["share"] if last else None,
        "sample": bool(tallies and tallies[0]["sample"]),
        "change": _change(last, previous),
    }


async def report_block(conn: asyncpg.Connection, run_ids: list) -> dict | None:
    """The month's report: the share at the first and the last check-up that asked."""
    if not run_ids:
        return None
    tallies = await _tallies(conn, 100, run_ids)
    if not tallies:
        return None
    first, last = _tally_view(tallies[-1]), _tally_view(tallies[0])
    return {
        "share_start": first["share"], "share_end": last["share"],
        "named": last["named"], "counted": last["counted"],
        "sample": bool(tallies[0]["sample"]),
    }


def settings_view(settings: AnswerSettings, lang: str) -> dict:
    return {
        "trade": settings.trade, "city": settings.city, "engines": list(settings.engines),
        "monthly_ask_cap": settings.monthly_ask_cap,
        "trade_label": questions.label(questions.TRADES, settings.trade, lang),
        "city_label": questions.label(questions.CITIES, settings.city, lang),
    }


async def answers_view(conn: asyncpg.Connection, lang: str) -> dict:
    settings = await load_settings(conn)
    tallies = await _tallies(conn, HISTORY)
    last = previous = None
    last_rows: list[asyncpg.Record] = []
    if tallies:
        head = _tally_view(tallies[0])
        last_rows = await conn.fetch(
            "select * from discovery_answers where run_id = $1 "
            "order by engine, case lang when 'en' then 0 else 1 end, question_key",
            tallies[0]["run_id"],
        )
        last = head | {
            "sample": bool(tallies[0]["sample"]),
            "answers": [_answer_view(r, lang) for r in last_rows],
            "competitors": competitors_table(last_rows),
        }
    if len(tallies) > 1:
        previous = _tally_view(tallies[1])
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
        },
        "engines": [
            {"kind": k, "label": engines.label_of(k, lang), "sample": k == "sample",
             "live": k != "sample"}
            for k in settings.engines
        ],
        "questions": asked,
        "last": last,
        "previous": previous,
        "change": _change(last, previous),
        "history": [_tally_view(t) for t in tallies],
        "headline": aw.headline(
            last["named"] if last else None, last["counted"] if last else 0,
            bool(last and last["measured"]), lang,
        ),
        "rule": aw.pick(aw.RULE, lang),
        "limits": aw.pick(aw.LIMITS, lang),
        "caution": aw.pick(aw.CAUTION, lang),
        "sample_note": aw.pick(aw.SAMPLE_MARK, lang),
    }
