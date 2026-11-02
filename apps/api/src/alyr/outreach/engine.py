"""The outreach engine's jobs (specs/065, "Jobs"): every one `background=True`, since no customer
waits for them (D-078). Jobs need a business; they are queued on ALYR's own (`store.office`).
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from alyr.config import Settings
from alyr.core import jobs
from alyr.db import Database
from alyr.outreach import compose, erase, gateway, replies, research, sequences, sources, store
from alyr.outreach.llm import Models, OverBudget
from alyr.outreach.providers import Providers, build

log = logging.getLogger("alyr.outreach")

DISCOVER, RESEARCH, COMPOSE, SEND = ("outreach.discover", "outreach.research",
                                     "outreach.compose", "outreach.send")
POLL, DIGEST, ERASE = "outreach.poll_replies", "outreach.digest", "outreach.erase"


class Outreach:
    def __init__(self, db: Database, settings: Settings, providers: Providers | None = None):
        self.db = db
        self.settings = settings
        self.providers = providers or build(settings)
        self.models = Models(db, settings, lambda: self.providers.llm)
        # The gateway's clock (send windows, caps, gaps). Tests set it; nothing else does.
        self.clock = lambda: datetime.now(UTC)

    async def queue(self, conn, kind: str, payload: dict, run_at: datetime | None = None) -> UUID:
        return await jobs.enqueue(conn, kind, payload, run_at)

    def register(self, runner: jobs.JobRunner) -> None:
        runner.register(DISCOVER, self._discover, background=True)
        runner.register(RESEARCH, self._research, self._research_failed, background=True)
        runner.register(COMPOSE, self._compose, self._compose_failed, background=True)
        runner.register(SEND, self._send, background=True)
        runner.register(POLL, self._poll, background=True)
        runner.register(DIGEST, self._digest, background=True)
        runner.register(ERASE, self._erase, background=True)

    async def _later(self, kind: str, payload: dict, when: datetime) -> None:
        async with store.office(self.db) as conn:
            await self.queue(conn, kind, payload, when)

    async def _discover(self, _: UUID, payload: dict) -> None:
        try:
            added = await sources.discover(self, payload["query"], payload["country"],
                                           int(payload.get("limit", 10)),
                                           payload.get("provider", "exa"))
        except OverBudget as stop:
            await self._later(DISCOVER, payload, stop.resume_at)
            return
        async with store.office(self.db) as conn:
            await store.event(conn, None, "discovered", added=added,
                              provider=payload.get("provider", "exa"))

    async def _research(self, _: UUID, payload: dict) -> None:
        try:
            await research.research(self, UUID(payload["prospect_id"]))
        except OverBudget as stop:
            await self._later(RESEARCH, payload, stop.resume_at)

    async def _research_failed(self, _: UUID, payload: dict) -> None:
        async with store.office(self.db) as conn:
            await store.set_stage(conn, UUID(payload["prospect_id"]), "needs_human",
                                  "research failed after every try")

    async def _compose(self, _: UUID, payload: dict) -> None:
        try:
            await compose.compose(self, UUID(payload["prospect_id"]))
        except OverBudget as stop:
            await self._later(COMPOSE, payload, stop.resume_at)

    async def _compose_failed(self, _: UUID, payload: dict) -> None:
        async with store.office(self.db) as conn:
            await store.set_stage(conn, UUID(payload["prospect_id"]), "needs_human",
                                  "drafting failed after every try")

    async def _send(self, _: UUID, payload: dict) -> None:
        await gateway.attempt(self, UUID(payload["intent_id"]))

    async def _poll(self, _: UUID, __: dict) -> None:
        await replies.poll(self)

    async def _digest(self, _: UUID, __: dict) -> None:
        await sequences.digest(self)

    async def _erase(self, _: UUID, __: dict) -> None:
        gone = await erase.erase_due(self)
        if gone:
            log.info("erased the personal data of %s prospects", gone)

    async def tick(self) -> dict:
        return await sequences.tick(self)
