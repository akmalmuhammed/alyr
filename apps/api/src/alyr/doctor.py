"""Is everything a live demo needs actually working? One line per check, and what to do
about anything that is not. Read-only: it changes nothing here or on Meta.

    scripts/demo.sh check        (runs this inside the API container)
    python -m alyr.doctor
"""

import asyncio
import sys

import asyncpg
import httpx

from alyr.config import get_settings
from alyr.core.templates import CATALOGUE
from alyr.migrate import MIGRATIONS
from alyr.seed import DEMO_SLUG

OK, BAD, WARN = "  ok ", "  !! ", "  -- "


class Report:
    def __init__(self) -> None:
        self.failed = 0

    def line(self, mark: str, text: str, fix: str = "") -> None:
        print(f"{mark}{text}")
        if fix:
            print(f"       → {fix}")
        if mark == BAD:
            self.failed += 1


async def _database(report: Report) -> None:
    settings = get_settings()
    try:
        conn = await asyncpg.connect(settings.migration_url, timeout=5)
    except Exception as error:  # noqa: BLE001 - any failure here means the same thing
        report.line(
            BAD,
            f"Database unreachable ({type(error).__name__})",
            "Start it: docker compose up -d postgres",
        )
        return
    try:
        done = {r["name"] for r in await conn.fetch("select name from schema_migrations")}
        missing = sorted(p.name for p in MIGRATIONS.glob("*.sql") if p.name not in done)
        if missing:
            report.line(
                BAD,
                f"Database is missing migrations: {', '.join(missing)}",
                "scripts/api-in-docker.sh uv run python -m alyr.migrate",
            )
        else:
            report.line(OK, f"Database up to date ({len(done)} migrations)")
        shop = await conn.fetchval("select name from tenants where slug = $1", DEMO_SLUG)
        report.line(
            OK if shop else BAD,
            f"Demo shop: {shop or 'not found'}",
            "" if shop else "scripts/demo.sh reset",
        )
    finally:
        await conn.close()


async def _meta(report: Report, http: httpx.AsyncClient) -> None:
    s = get_settings()
    if not (s.meta_access_token and s.meta_phone_number_id and s.meta_waba_id):
        report.line(
            BAD, "Meta values are not set in apps/api/.env", "See docs/status.md, 'Meta values'"
        )
        return
    graph = f"https://graph.facebook.com/{s.meta_graph_version}"
    auth = {"Authorization": f"Bearer {s.meta_access_token}"}
    number = (
        await http.get(
            f"{graph}/{s.meta_phone_number_id}",
            params={"fields": "display_phone_number,verified_name,quality_rating"},
            headers=auth,
        )
    ).json()
    if "error" in number:
        report.line(
            BAD,
            f"Meta refused the access token: {number['error'].get('message', '')}",
            "Make a new system-user token in Meta Business settings",
        )
        return
    report.line(
        OK,
        f"WhatsApp number {number.get('display_phone_number')} "
        f"({number.get('verified_name')}), quality {number.get('quality_rating')}",
    )
    found, url = (
        {},
        f"{graph}/{s.meta_waba_id}/message_templates?fields=name,language,status&limit=200",
    )
    while url:
        page = (await http.get(url, headers=auth)).json()
        for item in page.get("data", []):
            found[(item["name"], item["language"])] = item["status"]
        url = page.get("paging", {}).get("next")
    wanted = [(name, lang) for name in CATALOGUE for lang in ("en", "ar")]
    approved = sum(1 for key in wanted if found.get(key) == "APPROVED")
    if approved == len(wanted):
        report.line(OK, f"Message templates: all {approved} approved")
    else:
        report.line(
            WARN,
            f"Message templates: {approved} of {len(wanted)} approved",
            "Updates sent 24 hours after a customer's last message fail until approved",
        )


async def _reachable(
    report: Report, http: httpx.AsyncClient, label: str, url: str, fix: str
) -> None:
    try:
        answer = await http.get(url)
        good = answer.status_code < 400
        report.line(
            OK if good else BAD,
            f"{label}: {url} answered {answer.status_code}",
            "" if good else fix,
        )
    except httpx.HTTPError as error:
        report.line(BAD, f"{label}: {url} unreachable ({type(error).__name__})", fix)


async def main() -> int:
    s = get_settings()
    report = Report()
    print("ALYR demo check\n")
    await _database(report)
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as http:
        await _meta(report, http)
        await _reachable(
            report,
            http,
            "Webhook from the internet",
            "https://api.alyr.online/health",
            "Start the tunnel: cloudflared tunnel run alyr-dev",
        )
        public = s.public_web_url.rstrip("/")
        if "localhost" in public or "127.0.0.1" in public:
            report.line(
                WARN,
                f"Links in chats point to {public}, which a phone cannot open",
                "Set ALYR_PUBLIC_WEB_URL=https://app.alyr.online in apps/api/.env",
            )
        else:
            await _reachable(
                report,
                http,
                "Customer pages from the internet",
                f"{public}/s/{DEMO_SLUG}",
                "Start the web app (pnpm dev in apps/web) and the tunnel",
            )
    print(
        "\nReady for a live demo."
        if not report.failed
        else f"\n{report.failed} problem(s) to fix before a live demo."
    )
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
