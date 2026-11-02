"""Research: read a business's own pages, keep only claims whose quote is on the page, qualify it,
and find the address to write to (specs/065, "The citation contract" and "Finding the email").

Order of the address, first that applies:
1. One the founder typed or imported, with its source.
2. One the business publishes on its own site (a mailto: link, the page's text, schema.org
   `email`), with the exact page it was read from: a named or role address on its own domain
   first; a free-mail address only if published there, and flagged. The basis defaults to
   `published_business_contact`, which the founder confirms when he approves. Never guessed.
3. The email finder (Hunter), for addresses it saw on the web (with sources), verified.
4. Otherwise a person decides (`needs_human`).
"""

import hashlib
import re
from urllib.parse import urlsplit
from uuid import UUID

from alyr.outreach import llm, policy, store
from alyr.outreach.providers.web import FetchError
from alyr.outreach.sources import website_of

MAX_PAGES = 5
PAGE_CHARS = 50_000
MODEL_PAGE_CHARS = 12_000
MIN_KEPT = 2
WANTED = ("contact", "about", "product", "menu", "shop", "services", "store",
          "اتصل", "من-نحن", "about-us")
ROLE_LOCALS = {"info", "sales", "hello", "contact", "office", "admin", "enquiries", "enquiry",
               "inquiries", "orders", "order", "support", "marketing", "team", "mail", "booking",
               "bookings", "reservations", "reception", "care", "customercare", "service"}
GOOD_ROLES = re.compile(r"owner|founder|director|general manager|\bgm\b|manager|marketing|ceo|"
                        r"managing|partner|head", re.I)
NO_DOMAINS = {"example.com", "sentry.io", "wixpress.com", "domain.com", "email.com"}


def fold(text: str) -> str:
    return " ".join((text or "").lower().split())


def _same_site(url: str, domain: str) -> bool:
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    return bool(domain) and (host == domain or host.endswith("." + domain))


def pick_pages(home_url: str, links: tuple[str, ...], domain: str) -> list[str]:
    """Up to four more of the business's own pages: contact, about, products or menu first,
    then one more found on the home page."""
    own = [link.split("#")[0] for link in links if _same_site(link, domain)]
    own = [link for link in dict.fromkeys(own) if link.rstrip("/") != home_url.rstrip("/")]
    chosen = [link for link in own if any(w in link.lower() for w in WANTED)][:3]
    rest = [link for link in own if link not in chosen]
    return chosen + rest[:1]


def classify_email(email: str, domain: str) -> str:
    local, _, at = email.lower().rpartition("@")
    if at in policy.FREE_MAIL:
        return "free_mail"
    if domain and (at == domain or at.endswith("." + domain)):
        return "role" if local in ROLE_LOCALS else "named"
    return "other_domain"


def check_claims(claims: list[dict], pages: dict[str, str]) -> list[dict]:
    """The citation contract: a claim is kept only if its quote is on the page it names, after
    folding whitespace and case. Two claims at most share one quote."""
    folded = {url.rstrip("/"): fold(text) for url, text in pages.items()}
    checked, seen = [], set()
    for n, claim in enumerate(claims):
        key = str(claim.get("id") or f"c{n + 1}")[:20]
        if key in seen:
            key = f"c{n + 1}x"
        seen.add(key)
        quote, url = fold(claim.get("quote", "")), str(claim.get("url", "")).rstrip("/")
        if url not in folded:
            kept, why = False, "the page it names was not read"
        elif len(quote) < 12:
            kept, why = False, "the quote is too short to check"
        elif quote not in folded[url]:
            kept, why = False, "the quote is not on the page"
        else:
            kept, why = True, ""
        checked.append({"key": key, "text": str(claim.get("text", ""))[:400],
                        "url": str(claim.get("url", ""))[:500],
                        "quote": str(claim.get("quote", ""))[:600], "kept": kept, "why": why})
    return checked


def brief_text(prospect, claims: list[dict]) -> str:
    lines = [f"Business: {prospect['company']}", f"Country: {prospect['country']}",
             f"Type: {prospect['business_type'] or 'unknown'}", "Claims (checked on its pages):"]
    lines += [f"[{c['key']}] {c['text']}" for c in claims if c["kept"]]
    return "\n".join(lines)


async def research(engine, prospect_id: UUID) -> str:
    """Research one prospect, and queue its drafting when it qualifies. Returns its stage."""
    db, models, web = engine.db, engine.models, engine.providers.web
    async with store.office(db) as conn:
        p = await conn.fetchrow("select * from outreach_prospects where id = $1", prospect_id)
        if p is None or p["stage"] in store.FINISHED or p["erased_at"] is not None:
            return p["stage"] if p else "missing"
        await store.set_stage(conn, prospect_id, "researching")
        if policy.lane(p["country"]) == policy.BLOCKED:
            await store.set_stage(conn, prospect_id, "disqualified", "country_blocked")
            return "disqualified"
        if not p["website"]:
            await store.set_stage(conn, prospect_id, "needs_human", "no website")
            return "needs_human"

    domain = p["domain"] or store.domain_of(p["website"])
    home = website_of("https://" + re.sub(r"^[a-z]+://", "", p["website"], flags=re.I))
    pages: dict[str, str] = {}
    found: dict[str, str] = {}  # email: the page it was published on
    fetched_by: dict[str, str] = {}
    to_read, links = [home], ()
    while to_read and len(pages) < MAX_PAGES:
        url = to_read.pop(0)
        try:
            page = await web.fetch(url)
        except FetchError:
            if not pages:
                async with store.office(db) as conn:
                    await store.set_stage(conn, prospect_id, "needs_human",
                                          "the website could not be read")
                return "needs_human"
            continue
        text = llm.scrub(page.text)[:PAGE_CHARS]
        pages[page.url] = text
        fetched_by[page.url] = page.by
        for email in page.emails:
            found.setdefault(email, page.url)
        if len(pages) == 1:
            links = page.links
            to_read = pick_pages(page.url, links, domain)

    user = brief_text(p, []).split("Claims")[0] + "\n" + "\n".join(
        f"<<<PAGE url={url}>>>\n{text[:MODEL_PAGE_CHARS]}\n<<<END PAGE>>>"
        for url, text in pages.items())
    answer = await models.run("researcher", user, prospect_id=prospect_id, max_tokens=3000)
    claims = check_claims(answer.get("claims") or [], pages)
    kept = [c for c in claims if c["kept"]]

    async with store.office(db) as conn:
        await conn.execute("delete from outreach_pages where prospect_id = $1", prospect_id)
        await conn.execute("delete from outreach_claims where prospect_id = $1", prospect_id)
        for url, text in pages.items():
            await conn.execute(
                "insert into outreach_pages (prospect_id, url, text_hash, text, fetched_by) "
                "values ($1, $2, $3, $4, $5)", prospect_id, url,
                hashlib.sha256(text.encode()).hexdigest(), text, fetched_by[url])
        for c in claims:
            await conn.execute(
                "insert into outreach_claims (prospect_id, claim_key, text, url, quote, kept, why) "
                "values ($1, $2, $3, $4, $5, $6, $7)",
                prospect_id, c["key"], c["text"], c["url"], c["quote"], c["kept"], c["why"])
        for email, source in found.items():
            if email.rpartition("@")[2] in NO_DOMAINS:
                continue
            await conn.execute(
                "insert into outreach_found_emails (prospect_id, email, source_url, kind) "
                "values ($1, $2, $3, $4) on conflict (prospect_id, email) do nothing",
                prospect_id, email, source, classify_email(email, domain))
        await conn.execute(
            "update outreach_prospects set domain = $2, business_type = case when "
            "business_type = '' then $3 else business_type end, updated_at = now() where id = $1",
            prospect_id, domain, str(answer.get("business_type") or "")[:80])
        await store.event(conn, prospect_id, "researched", pages=len(pages), claims=len(claims),
                          kept=len(kept), published_emails=len(found))
        if len(kept) < MIN_KEPT:
            await store.set_stage(conn, prospect_id, "needs_human",
                                  f"too little evidence: {len(kept)} claims kept")
            return "needs_human"
        p = await conn.fetchrow("select * from outreach_prospects where id = $1", prospect_id)

    fit = await models.run("qualifier", brief_text(p, claims), prospect_id=prospect_id,
                           max_tokens=300)
    score = max(0, min(100, int(fit["fit_score"])))
    async with store.office(db) as conn:
        await conn.execute(
            "update outreach_prospects set fit_score = $2, fit_reason = $3 where id = $1",
            prospect_id, score, str(fit["reason"])[:300])
    stage = await choose_email(engine, prospect_id)
    if stage != "researched":
        return stage
    async with store.office(db) as conn:
        await engine.queue(conn, "outreach.compose", {"prospect_id": str(prospect_id)})
    return stage


async def choose_email(engine, prospect_id: UUID) -> str:
    """Settle the address and its basis; `researched` when the prospect may be drafted for."""
    async with store.office(engine.db) as conn:
        p = await conn.fetchrow("select * from outreach_prospects where id = $1", prospect_id)
        settings = await store.settings_row(conn)
        email, source, verification = p["email"], p["email_source"], p["email_verification"]
        basis, note = p["basis"], p["basis_note"]
        if not email:
            rows = await conn.fetch(
                "select email, source_url, kind from outreach_found_emails where prospect_id = $1 "
                "and kind <> 'other_domain' order by case kind when 'named' then 0 "
                "when 'role' then 1 else 2 end, id", prospect_id)
            for row in rows:
                if store.honeytoken(settings, row["email"]):
                    await store.event(conn, prospect_id, "honeytoken_refused", step="research")
                    continue
                email, source, verification = row["email"], "published", "published"
                basis = basis or "published_business_contact"
                note = note or (row["source_url"] + (" (free-mail address, published on its own "
                                                     "site: check it)" if row["kind"] ==
                                                     "free_mail" else ""))
                break

    if not email:
        email, source, verification, found_basis, found_note = await _from_finder(engine, p)
        basis, note = basis or found_basis, note or found_note

    async with store.office(engine.db) as conn:
        if email and store.honeytoken(settings, email):
            await store.event(conn, prospect_id, "honeytoken_refused", step="finder")
            email = None
        if not email:
            await store.set_stage(conn, prospect_id, "needs_human",
                                  "no published or verified email")
            return "needs_human"
        if await store.suppressed(conn, email):
            await store.set_stage(conn, prospect_id, "disqualified", "on the suppression list")
            return "disqualified"
        await conn.execute(
            "update outreach_prospects set email = $2, email_hash = $3, email_source = $4, "
            "email_verification = $5, basis = $6, basis_note = $7, updated_at = now() "
            "where id = $1",
            prospect_id, email.lower(), store.email_hash(email), source, verification or "",
            basis or "", (note or "")[:500])
        refusal = policy.basis_refusal(p["country"], basis or "", note or "", email,
                                       source == "published")
        if refusal:
            await store.set_stage(conn, prospect_id, "needs_human", refusal)
            return "needs_human"
        await store.set_stage(conn, prospect_id, "researched")
        return "researched"


async def _from_finder(engine, p) -> tuple:
    """An address from the email finder: only ones it saw on the web, verified. Personal ones
    only with `valid`; `accept_all` is allowed with a warning; anything else is refused."""
    finder = engine.providers.finder
    domain = p["domain"] or store.domain_of(p["website"])
    if not domain:
        return None, "", "", "", ""
    try:
        people = await finder.domain_search(domain)
    except Exception as error:  # noqa: BLE001 - no address is an answer, not a failure
        async with store.office(engine.db) as conn:
            await store.event(conn, p["id"], "finder_failed", reason=type(error).__name__)
        return None, "", "", "", ""
    people = [x for x in people if x.source_domains]  # seen somewhere, never a guessed pattern
    people.sort(key=lambda x: (x.type != "personal" or not GOOD_ROLES.search(x.position),
                               x.type != "personal"))
    for person in people[:5]:
        status = await finder.verify(person.email)
        if status == "valid" or status == "accept_all":
            if person.email.rpartition("@")[2] != domain and \
                    not person.email.endswith("." + domain):
                continue
            if domain in person.source_domains:
                basis, note = "published_business_contact", f"seen by the finder on {domain}"
            elif "legitimate_interest" in (policy.country(p["country"]).bases
                                           if policy.country(p["country"]) else ()) and \
                    p["country"] not in policy.EU:
                basis, note = "legitimate_interest", "found by the finder on the web"
            else:
                basis, note = "", ""
            async with store.office(engine.db) as conn:
                await conn.execute(
                    "update outreach_prospects set first_name = case when first_name = '' "
                    "then $2 else first_name end, last_name = case when last_name = '' then $3 "
                    "else last_name end, role = case when role = '' then $4 else role end "
                    "where id = $1",
                    p["id"], person.first_name[:60], person.last_name[:60], person.position[:80])
            return person.email, "finder", status, basis, note
    return None, "", "", "", ""
