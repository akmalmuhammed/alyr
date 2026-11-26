"""Pooled answers: one asking per (trade, city, area, language, tool) shared by every business in
that group (DECISIONS 7, research R4 section 2.5).

The questions hold nothing of any business, so the same question asked of the same tool from the
same place is the same question for every bakery in Doha. A check-up first looks for a **complete**
pooled run of its cell (every question answered) started within `FRESH` and made with the same
variant (a live tool's model, the sample's stage); if there is one, it counts those answers and
asks nothing. Otherwise it asks, and keeps what it asked here for the next business. Cost then
grows with the number of cells, not of businesses.

The two tables are global and hold no tenant_id: a question, an answer (third-party text), the
hosts, titles and passages the tool cited and the searches it ran. Never a business's name, never
a count for a business: that is in the business's own `discovery_answers` rows. Row-level security
lets a check-up read and add, never change or delete. Two check-ups of the same cell at the same
moment may both ask: both runs are kept and the newer one is shared, which costs an asking and
breaks nothing.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.modules.discovery.answers import questions

FRESH = timedelta(days=6)
_ORDER = {key: i for i, key in enumerate(questions.TEMPLATES)}


@dataclass(frozen=True)
class Cell:
    trade: str
    city: str
    area: str
    lang: str
    engine: str
    variant: str


@dataclass
class Asked:
    """One answer of a pooled run, as asked or as found."""

    question: questions.PublicQuestion
    repeat: int
    status: str
    error_code: str | None = None
    text: str = ""
    sources: list[dict] = field(default_factory=list)
    searches: list[str] = field(default_factory=list)
    model: str = ""
    cost: int = 0
    id: UUID | None = None


async def find(conn: asyncpg.Connection, cell: Cell, now: datetime) -> list[Asked] | None:
    """The answers of the newest complete pooled run of the cell, or None."""
    run = await conn.fetchrow(
        "select id from answer_pool_runs where trade = $1 and city = $2 and area = $3 "
        "and lang = $4 and engine = $5 and variant = $6 and complete and started_at > $7 "
        "order by started_at desc limit 1",
        cell.trade, cell.city, cell.area, cell.lang, cell.engine, cell.variant, now - FRESH,
    )
    if run is None:
        return None
    rows = await conn.fetch(
        "select * from answer_pool where pool_run_id = $1", run["id"]
    )
    found = [
        Asked(
            questions.PublicQuestion(r["question_key"], r["lang"], r["question"]), r["repeat"],
            r["status"], r["error_code"], r["answer"], list(r["sources"] or []),
            list(r["searches"] or []), r["model"], r["cost_units"], r["id"],
        )
        for r in rows
    ]
    return sorted(found, key=lambda a: (_ORDER.get(a.question.key, 99), a.repeat))


async def store(
    conn: asyncpg.Connection, cell: Cell, asked: list[Asked], complete: bool, now: datetime
) -> None:
    """Keep a pooled run and its answers; each `Asked` gets its row's id."""
    run_id = await conn.fetchval(
        "insert into answer_pool_runs (trade, city, area, lang, engine, variant, "
        "complete, started_at) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
        cell.trade, cell.city, cell.area, cell.lang, cell.engine, cell.variant, complete, now,
    )
    for a in asked:
        a.id = await conn.fetchval(
            "insert into answer_pool (pool_run_id, question_key, lang, question, "
            "repeat, status, error_code, answer, sources, searches, model, cost_units, asked_at) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id",
            run_id, a.question.key, a.question.lang, a.question.text, a.repeat, a.status,
            a.error_code, a.text, a.sources, a.searches, a.model, a.cost, now,
        )
