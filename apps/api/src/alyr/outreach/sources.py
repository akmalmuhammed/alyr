"""Where prospects come from (specs/065): typed by the founder, imported (CSV, or an Overture Maps
places file as GeoJSON), or discovered (a web search through Exa, or Google Places Text Search).

Nothing here scrapes a directory, a map or a social network (founder, 2 Nov 2026): a discovered
business's own website is the only page the engine reads, and only to research it.

Google Places (its terms as the founder read them, 2 Nov 2026): only the place ID and the name are
kept; the website Google gives is fetched by our own fetcher and kept only once it loads; no
address, phone, rating or position is stored.

Overture Maps places (CDLA Permissive 2.0 / Apache 2.0, docs.overturemaps.org/guides/places, read
2 Nov 2026): a GeoJSON file from the Overture Explorer ("Download Visible") or the DuckDB query in
docs/runbooks/outreach-setup.md. Entries under 0.7 confidence, or without a website and an email,
are skipped; the release is recorded with the source.
"""

import csv
import io
import json
import re
from uuid import UUID

from alyr.outreach import policy, store
from alyr.outreach.providers.web import FetchError

CSV_COLUMNS = ("company", "website", "country", "first_name", "last_name", "role", "email",
               "basis", "language", "notes")
MAX_ROWS = 2000
MIN_CONFIDENCE = 0.7
EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$")


class Refused(Exception):
    """This prospect cannot be added; the message is safe to show."""


def website_of(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    if not re.match(r"^https?://", text, re.I):
        text = "https://" + text
    text = text.split("#")[0][:300]
    if re.fullmatch(r"https?://[^/?]+", text, re.I):
        text += "/"
    return text


async def add(conn, data: dict, *, source: str, created_by: str, require_basis: bool) -> UUID:
    company = str(data.get("company") or "").strip()[:200]
    if not company:
        raise Refused("a company name is needed")
    country = str(data.get("country") or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", country):
        raise Refused("a two-letter country code is needed (QA, SA, GB, ...)")
    if policy.lane(country) == policy.BLOCKED:
        raise Refused(f"{country} is not in the outreach policy")
    basis = str(data.get("basis") or "").strip()
    if basis and basis not in policy.BASES:
        raise Refused(f"basis must be one of: {', '.join(policy.BASES)}")
    language = str(data.get("language") or "en").strip().lower() or "en"
    if language not in ("en", "ar"):
        raise Refused("language is en or ar")
    website = website_of(str(data.get("website") or ""))
    email = str(data.get("email") or "").strip().lower() or None
    if email and not EMAIL.match(email):
        raise Refused("that email address is not valid")
    if require_basis and email and not basis:
        raise Refused("a basis is needed with an email (how ALYR may write to this contact)")
    settings = await store.settings_row(conn)
    if email and store.honeytoken(settings, email):
        await store.event(conn, None, "honeytoken_refused", step=source)
        raise Refused("that address may not be used")
    if email and await store.suppressed(conn, email):
        raise Refused("that address asked not to be written to")
    domain = store.domain_of(website) if website else (store.domain_of(email) if email else "")
    if domain and await conn.fetchval(
        "select true from outreach_prospects where domain = $1 and erased_at is null", domain
    ):
        raise Refused(f"{domain} is already a prospect")
    pid = await conn.fetchval(
        "insert into outreach_prospects (company, website, domain, country, business_type, "
        "source, source_url, source_ref, first_name, last_name, role, email, email_hash, "
        "email_source, basis, basis_note, language, notes, created_by) values ($1, $2, $3, $4, "
        "$5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) returning id",
        company, website, domain, country, str(data.get("business_type") or "")[:80], source,
        str(data.get("source_url") or "")[:500], str(data.get("source_ref") or "")[:200],
        str(data.get("first_name") or "").strip()[:60],
        str(data.get("last_name") or "").strip()[:60], str(data.get("role") or "").strip()[:80],
        email, store.email_hash(email) if email else None,
        (str(data.get("email_source") or source) if email else ""), basis,
        str(data.get("basis_note") or "")[:500], language, str(data.get("notes") or "")[:2000],
        created_by)
    await store.event(conn, pid, "added", source=source)
    return pid


def is_geojson(text: str) -> bool:
    head = text.lstrip()[:200]
    return head.startswith("{") and '"FeatureCollection"' in text[:5000] or \
        head.startswith("{") and '"features"' in text[:5000]


def _json_field(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value


def overture_rows(text: str, country: str) -> tuple[list[dict], list[dict]]:
    """Prospect rows from an Overture places GeoJSON file, and the entries skipped with why.
    Phones, addresses, socials and positions are not taken: email is the only channel."""
    data = json.loads(text)
    rows, skipped = [], []
    for n, feature in enumerate(data.get("features") or []):
        props = feature.get("properties") or {}
        names = _json_field(props.get("names")) or {}
        name = names.get("primary") if isinstance(names, dict) else str(names or "")
        confidence = props.get("confidence")
        websites = _json_field(props.get("websites")) or []
        emails = _json_field(props.get("emails")) or []
        taxonomy = _json_field(props.get("taxonomy")) or _json_field(props.get("categories")) or {}
        addresses = _json_field(props.get("addresses")) or []
        where = ""
        if isinstance(addresses, list) and addresses and isinstance(addresses[0], dict):
            where = str(addresses[0].get("country") or "")
        if not name:
            skipped.append({"row": n + 1, "reason": "no name"})
            continue
        if not isinstance(confidence, int | float) or confidence < MIN_CONFIDENCE:
            skipped.append({"row": n + 1, "reason": "confidence under 0.7"})
            continue
        website = websites[0] if isinstance(websites, list) and websites else ""
        email = emails[0] if isinstance(emails, list) and emails else ""
        if not website and not email:
            skipped.append({"row": n + 1, "reason": "no website and no email"})
            continue
        rows.append({
            "company": name, "website": website, "email": email,
            "country": (where or country).upper(),
            "business_type": (taxonomy.get("primary") if isinstance(taxonomy, dict) else "")
            or "",
            "source_ref": str(props.get("id") or feature.get("id") or ""),
            # A business's own listing: its published contact, which the founder confirms.
            "basis": "published_business_contact" if email else "",
            "basis_note": "listed in Overture Maps places" if email else "",
            "email_source": "overture",
        })
    return rows, skipped


async def import_file(conn, text: str, *, created_by: str, release: str = "",
                      country: str = "QA") -> dict:
    added, skipped = [], []
    if is_geojson(text):
        try:
            rows, skipped = overture_rows(text, country)
        except ValueError as error:
            raise Refused("that GeoJSON file could not be read") from error
        source = "overture"
        for row in rows:
            row["source_url"] = f"overture {release}".strip()
    else:
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames or "company" not in [f.strip().lower() for f in
                                                      reader.fieldnames]:
            raise Refused("the CSV needs a header row with at least: company, country, basis")
        rows = [{(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
                for r in reader]
        source = "import"
    if len(rows) > MAX_ROWS:
        raise Refused(f"at most {MAX_ROWS} rows at a time")
    for n, row in enumerate(rows):
        try:
            async with conn.transaction():
                added.append(str(await add(conn, row, source=source, created_by=created_by,
                                           require_basis=source == "import")))
        except Refused as error:
            skipped.append({"row": n + 1, "reason": str(error)})
    return {"source": source, "added": added, "skipped": skipped}


async def discover(engine, query: str, country: str, limit: int, provider: str) -> int:
    """Find businesses for a query and queue their research. Returns how many were added."""
    web = engine.providers.web
    candidates: list[dict] = []
    if provider == "places":
        for place in await engine.providers.places.places(query, country=country, limit=limit):
            if place.website:
                candidates.append({"company": place.name, "website": place.website,
                                   "source": "places", "source_ref": place.place_id,
                                   "source_url": ""})
    else:
        found = await engine.providers.search.search(query, country=country, limit=limit)
        if not found:
            return 0
        listing = "\n".join(f"[{n}] {f.title.strip()[:120]} | {f.url}\n    {f.text[:300]}"
                            for n, f in enumerate(found))
        picked = await engine.models.run("scout", f"Search: {query}\nCountry: {country}\n"
                                         f"Results:\n{listing}", max_tokens=1500)
        for c in picked["candidates"]:
            if c.get("keep") and 0 <= c["index"] < len(found):
                candidates.append({"company": c["company"] or found[c["index"]].title,
                                   "website": c["website"] or found[c["index"]].url,
                                   "business_type": c["business_type"], "source": "discovery",
                                   "source_url": found[c["index"]].url, "source_ref": ""})
    added = 0
    for c in candidates[:limit]:
        home = website_of(c["website"])
        found_home = re.match(r"^https?://[^/?#]+", home)
        if not found_home:
            continue
        try:
            page = await web.fetch(found_home.group(0) + "/")
        except FetchError:
            continue  # kept only once our own fetcher has read it
        c["website"] = re.match(r"^https?://[^/]+", page.url).group(0) + "/"
        async with store.office(engine.db) as conn:
            try:
                async with conn.transaction():
                    pid = await add(conn, {**c, "country": country}, source=c["source"],
                                    created_by="discovery", require_basis=False)
            except Refused:
                continue
            await engine.queue(conn, "outreach.research", {"prospect_id": str(pid)})
            added += 1
    return added
