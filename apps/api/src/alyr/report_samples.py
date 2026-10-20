"""The Sunday report card for the public site's samples (ALY-99).

Seeds the three fictional businesses (Qirfa Bakery, Dafira Salon, Zilal Cooling) as they
stood when their last report went out, Sunday 11 October 2026 at 9:00 in Doha, renders
each one's real report for the week of 4 to 10 October in English and Arabic, and writes:

    apps/web/app/_agent/samples/report/{bakery,salon,homeservices}.{en,ar}.png        Carbon
    apps/web/app/_agent/samples/report/{bakery,salon,homeservices}.{en,ar}.paper.png  Paper
    apps/web/app/_agent/samples/report/{bakery,salon,homeservices}.{en,ar}.json       the text

The site can then show the real output on a phone. The cards carry "SAMPLE", as every
sample screen does (brand.md).

Run with: uv run python -m alyr.report_samples   (after `uv run python -m alyr.migrate`)
Like `alyr.agent_samples`, it replaces the three sample businesses in the database it
runs against; run `python -m alyr.seed_qirfa` and `python -m alyr.seed_bookings` afterwards
to bring them back to today.
"""

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from alyr.agent_samples import SITE
from alyr.config import get_settings
from alyr.db import Database
from alyr.modules import report
from alyr.modules.agent import card, week
from alyr.seed_bookings import HOME, SALON, ensure_sample_tenant, reset_sample
from alyr.seed_qirfa import QIRFA_TENANT_ID, ensure_qirfa_tenant, reset_qirfa

# Sunday 11 October 2026, 9:00 in Doha: when the report for 4 to 10 October went out.
REPORT_NOW = datetime(2026, 10, 11, 6, 0, tzinfo=UTC)
OUT = (Path(__file__).resolve().parents[4] / "apps" / "web" / "app" / "_agent" / "samples"
       / "report")
SAMPLES = (("bakery", QIRFA_TENANT_ID), ("salon", SALON.tenant_id),
           ("homeservices", HOME.tenant_id))


async def seed(db: Database, owner_dsn: str) -> None:
    await ensure_qirfa_tenant(owner_dsn)
    await reset_qirfa(db, now=REPORT_NOW, web_url=SITE)
    for sample in (SALON, HOME):
        await ensure_sample_tenant(owner_dsn, sample, REPORT_NOW, 56)
        await reset_sample(db, sample, REPORT_NOW, web_url=SITE)


async def render_one(db: Database, tenant_id, lang: str) -> tuple[dict, dict]:
    """The card data and the message for one sample, as its owner received them."""
    async with db.tenant(tenant_id) as conn:
        start = report.last_full_week(REPORT_NOW, "Asia/Qatar")
        read = await week.read(conn, start, now=REPORT_NOW)
    return week.card(read, lang), week.message(read, lang)


async def capture(db: Database, owner_dsn: str, out: Path = OUT) -> list[Path]:
    await seed(db, owner_dsn)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for key, tenant_id in SAMPLES:
        for lang in ("en", "ar"):
            data, text = await render_one(db, tenant_id, lang)
            for theme, suffix in (("carbon", ""), ("paper", ".paper")):
                path = out / f"{key}.{lang}{suffix}.png"
                path.write_bytes(card.render(data, theme, sample=True))
                written.append(path)
            path = out / f"{key}.{lang}.json"
            path.write_text(json.dumps({
                "sample": True,
                "sent_at": REPORT_NOW.isoformat(),
                "week": data["week"],
                "caption": text["caption"],
                "lines": text["lines"],
                "template": {"name": "weekly_report_card", "values": text["template"]},
                "card": data,
            }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
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
