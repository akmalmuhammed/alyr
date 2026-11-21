"""Where an answer comes from: the contract, the registry, and the gate for a real engine
(spec 068, "Engines").

**Only the sample engine exists.** It is fictional and has no network. A real engine (OpenAI,
Google, Perplexity or another) is a *contract and a gate*, off:

* `LiveEngine` is the base a provider would implement. It checks the flag
  (`ALYR_DISCOVERY_AI_LIVE`, off), the provider's key (read from settings, none in the repository)
  and the monthly cap, spends the budget before the call, applies a timeout, and turns any failure
  into an `EngineError` with plain words. A provider is one file that fills in `_call`.
* **No provider is written** and nothing stands in for one: `get()` answers only for kinds in
  `AVAILABLE`, and the reserved names refuse. Before a provider is added the founder chooses it
  and reads its current terms (what may be stored, where a question is processed), and ALY-51 and
  ALY-329 answer where a model may run; `docs/data-residency.md` lists it first.

What an engine is sent is an `EngineRequest` (a built public question) and nothing else; no
network library is imported anywhere in this package, and a test reads the source to prove it.
"""

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from alyr.modules.discovery.answers.questions import EngineRequest

AVAILABLE: tuple[str, ...] = ("sample",)
# Names kept for what comes later. They refuse: there is no provider code behind them.
RESERVED: tuple[str, ...] = ("openai", "gemini", "perplexity")
SAMPLE_LABEL = ("Sample answers", "إجابات تجريبية")
CALL_TIMEOUT_SECONDS = 30.0
LIVE_CALL_COST = 5


class EngineError(Exception):
    """An answer that could not be had, with plain words in both languages (nothing a stack
    trace). The call becomes an `error` row and the check-up goes on."""

    def __init__(self, code: str, en: str, ar: str) -> None:
        self.code, self.en, self.ar = code, en, ar
        super().__init__(en)


class AnswersBudgetExceeded(EngineError):
    def __init__(self) -> None:
        super().__init__(
            "answers_budget",
            "The limit for asking was reached, so the rest was not asked.",
            "تم بلوغ حد الأسئلة، لذلك لم تُطرح الأسئلة المتبقية.",
        )


@dataclass(frozen=True)
class RawAnswer:
    text: str


@dataclass
class AskContext:
    """What an engine may know. `stage` is where the sample business stands (the number of
    earlier done check-ups, up to 3). `spend` raises before the call that would pass the budget."""

    now: datetime
    stage: int = 0
    cost_budget: int = 60
    spent: int = 0
    timeout: float = CALL_TIMEOUT_SECONDS
    # What a live engine has already been asked this calendar month, and its cap.
    asked_this_month: int = 0
    monthly_cap: int = 300
    notes: list[str] = field(default_factory=list)

    def spend(self, units: int) -> None:
        if self.spent + units > self.cost_budget:
            raise AnswersBudgetExceeded()
        self.spent += units


class AnswerEngine(Protocol):
    kind: str
    live: bool  # True: it reaches outside ALYR
    cost_per_call: int

    async def ask(self, request: EngineRequest, ctx: AskContext) -> RawAnswer: ...


class LiveEngine(ABC):
    """The contract for an engine that reaches outside ALYR. Nothing implements it yet.

    A provider sets `kind` and `key_setting` (the name of the settings field that holds its key)
    and fills in `_call`, which makes the one outside request for a built public question. It
    never receives anything but the `EngineRequest`.
    """

    kind: str = ""
    key_setting: str = ""
    live = True
    cost_per_call = LIVE_CALL_COST

    def __init__(self, settings) -> None:
        self._settings = settings

    def _key(self) -> str:
        return getattr(self._settings, self.key_setting, "") or ""

    async def ask(self, request: EngineRequest, ctx: AskContext) -> RawAnswer:
        # The gate, in the order that costs least: the flag, the key, the cap, the budget.
        if not getattr(self._settings, "discovery_ai_live", False):
            raise EngineError(
                "engine_off", "Asking outside ALYR is switched off.", "السؤال خارج ALYR متوقف."
            )
        key = self._key()
        if not key:
            raise EngineError(
                "engine_no_key", "This source has no key set.", "لا يوجد مفتاح لهذا المصدر."
            )
        if ctx.asked_this_month >= ctx.monthly_cap:
            raise EngineError(
                "monthly_cap", "This month's limit for asking was reached.",
                "تم بلوغ حد الأسئلة لهذا الشهر.",
            )
        ctx.spend(self.cost_per_call)
        try:
            text = await asyncio.wait_for(self._call(request, key), ctx.timeout)
        except EngineError:
            raise
        except TimeoutError as error:
            raise EngineError(
                "engine_timeout", "The source took too long to answer.",
                "استغرق المصدر وقتاً طويلاً في الإجابة.",
            ) from error
        except Exception as error:  # noqa: BLE001 - nothing a provider raises reaches the owner
            raise EngineError(
                "engine_failed", "The source could not answer.", "تعذّر على المصدر الإجابة."
            ) from error
        return RawAnswer(text)

    @abstractmethod
    async def _call(self, request: EngineRequest, key: str) -> str:
        """The one outside request. Receives the built public question and the key."""


def label_of(kind: str, lang: str) -> str:
    pair = SAMPLE_LABEL if kind == "sample" else (kind, kind)
    return pair[1] if lang == "ar" else pair[0]


def get(kind: str, settings=None) -> AnswerEngine:
    """The engine for a kind a shop has switched on. Only the sample engine exists; a reserved
    name, or anything else, refuses (`engine_unavailable`)."""
    if kind == "sample":
        from alyr.modules.discovery.answers.sample_engine import SampleEngine

        return SampleEngine()
    raise EngineError(
        "engine_unavailable", "That source is not available.", "هذا المصدر غير متاح."
    )
