"""The shapes every Agent rule is made of. Kept apart from `insights.py` so a rule in
`rules/` can import them without importing the 21 rules that also import `rules/`."""

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass, field

from alyr.catalog import Text
from alyr.core.words import CUSTOMERS, Noun
from alyr.modules.agent.facts import Facts, Row


@dataclass(frozen=True)
class Action:
    label: Text
    href: str


@dataclass
class Finding:
    rows: list[Row] = field(default_factory=list)
    noun: Noun = CUSTOMERS
    numbers: dict = field(default_factory=dict)
    # How many the rule counted, when that is not the number of rows (weeks, replies).
    total: int | None = None

    @property
    def n(self) -> int:
        return self.total if self.total is not None else len(self.rows)

    def fingerprint(self, key: str) -> str:
        """Changes when the counted records or their numbers change, so a card set
        aside with "Not now" comes back when there is something new to see."""
        data = {
            "key": key, "ids": sorted(r.id for r in self.rows),
            "numbers": {k: str(v) for k, v in sorted(self.numbers.items())},
        }
        return hashlib.sha1(json.dumps(data).encode()).hexdigest()[:16]


Say = Callable[[Finding, Facts, str], tuple[list, list | None]]


@dataclass(frozen=True)
class Insight:
    key: str
    number: int  # its row in the research catalogue
    kind: str  # task | money | knowledge
    module: str
    rule: Text
    find: Callable[[Facts], Finding | None]
    say: Say
    action: Action | None = None
    status: Text | None = None
    money: bool = False


def applies(insight: Insight, modules: frozenset) -> bool:
    return any(m in modules for m in insight.module.split("|"))
