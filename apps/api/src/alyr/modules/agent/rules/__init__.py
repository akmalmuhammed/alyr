"""One file per added Agent rule (docs/work/insights-plan/plan.md, section 4).

A rule file defines two things and nothing else the rest of the Agent has to know about:

    INSIGHT: Insight                      # key, number, kind, module, rule, find, say, action
    async def gather(conn, f) -> None     # one bounded query; puts its numbers in f.extra[KEY]

`find(f)` reads only `f.extra[INSIGHT.key]`, so a test builds `Facts(extra={...})` with no
database. `gather` runs inside `db.tenant()` (row-level security scopes it), and only when the
shop has the rule's module and, for a money rule, the reader may see money. Keep it to one
query, bounded in time (30 to 90 days) and answered from an index whose first column is
`tenant_id`: every open workspace tab asks for these numbers (D-130 to D-132).

To add a rule: write `rules/<key>.py`, import it here and add it to `RULES`. Numbers 26 and
up are free for rules in this folder; each rule takes the one it was assigned.
"""

from types import ModuleType

import asyncpg

from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Insight, applies
from alyr.modules.agent.rules import line_health

# One line per rule file, in the order the file was added.
RULES: tuple[ModuleType, ...] = (line_health,)

INSIGHTS: tuple[Insight, ...] = tuple(r.INSIGHT for r in RULES)


async def gather_all(conn: asyncpg.Connection, f: Facts) -> None:
    for rule in RULES:
        insight = rule.INSIGHT
        if not applies(insight, f.modules) or (insight.money and not f.money):
            continue
        await rule.gather(conn, f)
