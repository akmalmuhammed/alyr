"""The ALYR Agent's sample screens for the public site (ALY-99, `03-build-brief.md` §2).

Seeds the three fictional businesses (Qirfa Bakery, Sadaf Salon, Ruwaa Dental Clinic) as
they stood at one fixed moment, reads each one's real `AgentView` as its owner would, and
writes it to `apps/web/app/_agent/samples/{bakery,salon,clinic}.{en,ar}.json`. The site
feeds those files to the same `AgentDashboard` the workspace uses, so the homepage shows
a real screen, captioned as a sample. The moment is fixed, so the files only change when
the engine or the samples do.

Run with: uv run python -m alyr.agent_samples   (after `uv run python -m alyr.migrate`)
It replaces the three sample businesses in the database it runs against: run
`python -m alyr.seed_qirfa` and `python -m alyr.seed_bookings` afterwards to bring them
back to today.
"""

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from alyr.config import get_settings
from alyr.core.auth import Staff
from alyr.db import Database
from alyr.modules.agent import view
from alyr.seed_bookings import CLINIC, SALON, ensure_sample_tenant, reset_sample
from alyr.seed_qirfa import QIRFA_TENANT_ID, ensure_qirfa_tenant, reset_qirfa

# Thursday 15 October 2026, 16:20 in Doha: a weekday afternoon, most of the week behind it.
SAMPLE_NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)
OUT = Path(__file__).resolve().parents[4] / "apps" / "web" / "app" / "_agent" / "samples"
SITE = "https://alyr.qa"


async def _owner(db: Database, tenant_id) -> Staff:
    async with db.tenant(tenant_id) as conn:
        row = await conn.fetchrow(
            "select u.id, u.name, u.email from memberships m join users u on u.id = m.user_id "
            "where m.role = 'owner' order by m.created_at limit 1"
        )
    return Staff(row["id"], row["name"], row["email"], "owner", tenant_id)


async def capture(db: Database, owner_dsn: str, out: Path = OUT) -> list[Path]:
    await ensure_qirfa_tenant(owner_dsn)
    await reset_qirfa(db, now=SAMPLE_NOW, web_url=SITE)
    for sample in (SALON, CLINIC):
        await ensure_sample_tenant(owner_dsn, sample, SAMPLE_NOW, 56)
        await reset_sample(db, sample, SAMPLE_NOW, web_url=SITE)
    written = []
    out.mkdir(parents=True, exist_ok=True)
    for key, tenant_id in (("bakery", QIRFA_TENANT_ID), ("salon", SALON.tenant_id),
                           ("clinic", CLINIC.tenant_id)):
        owner = await _owner(db, tenant_id)
        for lang in ("en", "ar"):
            async with db.tenant(tenant_id) as conn:
                agent_view = await view.build(conn, owner, lang, now=SAMPLE_NOW)
            path = out / f"{key}.{lang}.json"
            path.write_text(
                json.dumps(agent_view, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
            )
            written.append(path)
    return written


async def main() -> None:
    settings = get_settings()
    db = Database(settings.database_url)
    await db.connect()
    try:
        for path in await capture(db, settings.migration_url):
            print("wrote", path)
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
