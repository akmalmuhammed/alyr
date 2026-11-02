"""The engine's outside services, whether each is set up, and a test of each (specs/065,
"Connections"). A test never sends an email and never sends personal data: the model answers a
one-word schema call, Exa runs a one-result search, Google Places one text search, Hunter and
Firecrawl read the account, SMTP signs in without sending, IMAP signs in and counts unread.
"""

from alyr.config import Settings
from alyr.outreach import store

# key: (provider, the settings it needs, optional). The keys are the screens' (ALY-311).
SERVICES = {
    "model": ("Anthropic", ("anthropic_api_key",)),
    "discovery": ("Exa", ("exa_api_key",)),
    "places": ("Google Places (optional)", ("google_places_api_key",)),
    "email_finder": ("Hunter", ("hunter_api_key",)),
    "page_reader": ("Firecrawl (optional)", ("firecrawl_api_key",)),
    "smtp": ("Outreach mailbox, sending (SMTP)", (
        "outreach_smtp_host", "outreach_smtp_user", "outreach_smtp_password", "outreach_from",
        "outreach_from_name")),
    "imap": ("Outreach mailbox, replies (IMAP)", (
        "outreach_imap_host", "outreach_imap_user", "outreach_imap_password")),
    "engine": ("Engine settings", (
        "outreach_legal_line", "outreach_offer", "outreach_booking_url",
        "outreach_unsubscribe_secret", "outreach_unsubscribe_base")),
}


def missing(settings: Settings, key: str) -> list[str]:
    return [f"ALYR_{name.upper()}" for name in SERVICES[key][1] if not getattr(settings, name)]


async def view(engine) -> list[dict]:
    async with store.office(engine.db) as conn:
        last = {r["service"]: r for r in await conn.fetch(
            "select distinct on (service) service, ok, message, at, by_email "
            "from outreach_connection_tests order by service, at desc")}
    shown = []
    for key, (label, _) in SERVICES.items():
        gone = missing(engine.settings, key)
        test = last.get(key)
        provider = label
        if key in ("smtp", "imap"):
            host = getattr(engine.settings, f"outreach_{key}_host")
            provider = host or label
        shown.append({
            "key": key, "provider": provider, "configured": not gone,
            "settings": [{"name": f"ALYR_{name.upper()}", "present": bool(getattr(
                engine.settings, name))} for name in SERVICES[key][1]],
            "simulated": engine.providers.simulated,
            "last_test": {"ok": test["ok"], "message": test["message"],
                          "at": test["at"].isoformat(), "by": test["by_email"]} if test else None,
        })
    return shown


async def test(engine, key: str) -> tuple[bool, str]:
    p = engine.providers
    try:
        if key == "model":
            answer = await engine.models.run("test", "Say ok.", max_tokens=20)
            return True, f"the model answered {answer['word']!r}"
        if key == "discovery":
            found = await p.search.search("bakery in Doha", country="QA", limit=1)
            return True, f"search answered with {len(found)} result"
        if key == "places":
            found = await p.places.places("bakery in Doha", country="QA", limit=1)
            return True, f"places answered with {len(found)} result"
        if key == "email_finder":
            return True, await p.finder.account()
        if key == "page_reader":
            return True, await p.firecrawl.credits()
        if key == "smtp":
            return True, await p.mailbox.test_smtp()
        if key == "imap":
            return True, await p.mailbox.test_imap()
        if key == "engine":
            gone = missing(engine.settings, "engine")
            return (not gone), ("all set" if not gone else "missing: " + ", ".join(gone))
    except Exception as error:  # noqa: BLE001 - the screen shows why, the test does not crash
        return False, f"{type(error).__name__}: {str(error)[:200]}"
    raise KeyError(key)
