"""Google's text is kept at most 30 days (Discovery 2.0; research R2 section 8, R6 section 3.1).

Google lets a place ID be kept for good. What its Business Profile APIs return may be stored "for
no more than 30 calendar days", and its Places terms do not let names, addresses or reviews be
copied and saved at all (a Places connector stores only the place ID and shows the rest live). This
is the sweep's step that holds the line for whatever a Google source did store: once it is older
than `KEEP_FOR`, its text is removed, in each shop's own transaction.

What is removed (only rows whose source is Google's, `base.GOOGLE_SOURCES`):
* a stored review's reviewer name, text and the reply shown under it (`discovery_reviews`), when
  the check-up that last read it is older than 30 days; its stars, date, whether it was answered
  and its id stay, since they are what the rules count;
* the value of each piece of a finding's evidence read on the listing or in its reviews (a name, a
  phone, hours, a rating), which becomes `~removed` ("Removed after 30 days"); the markers ALYR
  wrote itself (`~none`, `~days:...`) stay;
* the values a finding compared for its proposal (`discovery_findings.observed`), so no proposal is
  made from text that old (the next check-up reads them again);
* the "before" of a proposal (`discovery_proposals.change`), once it is decided or closed, any undo
  window has passed and the last thing that happened to it is older than 30 days.

What stays: place IDs (`discovery_locations.place_ref`), what the owner confirmed
(`discovery_facts`), and ALYR's own work: a proposal's "after" (the value or the reply text the
owner approved), its hash, who decided and when, its receipt. A hand-recorded round (`manual`,
D-169) and the sample are not Google's and are left alone.
"""

import json
from datetime import datetime, timedelta

import asyncpg

from alyr.modules.discovery.connectors import base

KEEP_FOR = timedelta(days=30)
REMOVED = "~removed"
# Evidence read on these is Google's when its source is; "website" is the owner's own site and
# "business" what the owner set.
GOOGLE_PLACES = ("listing", "reviews")
# A proposal in these may still be approved, applied or undone: its "before" is still needed.
OPEN_PROPOSALS = ("proposed", "approved")


def _google(sources) -> list[str]:
    return sorted(sources if sources is not None else base.GOOGLE_SOURCES)


def strip_evidence(items: list[dict], sources, cutoff: datetime) -> tuple[list[dict], bool]:
    """A finding's evidence with Google's values older than `cutoff` removed, and whether anything
    changed."""
    out, changed = [], False
    for item in items:
        old = item.get("seen_at") and datetime.fromisoformat(item["seen_at"]) < cutoff
        value = item.get("value") or ""
        if (
            old and item.get("source") in sources and item.get("where") in GOOGLE_PLACES
            and value and not value.startswith("~")
        ):
            item, changed = {**item, "value": REMOVED}, True
        out.append(item)
    return out, changed


async def expire_google_text(
    conn: asyncpg.Connection, now: datetime, sources=None
) -> dict[str, int]:
    """Remove the Google text of this shop that is older than `KEEP_FOR`. Runs inside the shop's
    tenant transaction; returns how many rows of each kind it changed."""
    google = _google(sources)
    cutoff = now - KEEP_FOR
    done = {"reviews": 0, "findings": 0, "proposals": 0}

    reviews = await conn.execute(
        "update discovery_reviews r set author_name = '', body = '', reply_text = '' "
        "where r.source = any($1::text[]) "
        "and (r.author_name <> '' or r.body <> '' or r.reply_text <> '') "
        "and coalesce((select coalesce(x.finished_at, x.started_at, x.created_at) "
        "from discovery_runs x where x.id = r.fetched_run_id), '-infinity') < $2",
        google, cutoff,
    )
    done["reviews"] = int(reviews.split()[-1])

    rows = await conn.fetch(
        "select f.id, f.evidence, f.observed, f.last_seen_at, r.connector_kind "
        "from discovery_findings f left join discovery_runs r on r.id = f.last_run_id "
        "where f.last_seen_at < $1",
        cutoff,
    )
    for row in rows:
        evidence, changed = strip_evidence(_json(row["evidence"]), google, cutoff)
        observed = _json(row["observed"])
        if observed and row["connector_kind"] in google and row["last_seen_at"] < cutoff:
            observed, changed = {}, True
        if changed:
            await conn.execute(
                "update discovery_findings set evidence = $2, observed = $3 where id = $1",
                row["id"], evidence, observed,
            )
            done["findings"] += 1

    proposals = await conn.execute(
        "update discovery_proposals set change = jsonb_set(change, '{before}', "
        "'{\"removed\": true}'::jsonb) "
        "where connector_kind = any($1::text[]) and status <> all($3::text[]) "
        "and change -> 'before' is distinct from '{\"removed\": true}'::jsonb "
        "and (undo_until is null or undo_until < $4) "
        "and greatest(proposed_at, decided_at, applied_at, undone_at) < $2",
        google, cutoff, list(OPEN_PROPOSALS), now,
    )
    done["proposals"] = int(proposals.split()[-1])
    return done


def _json(value):
    return json.loads(value) if isinstance(value, str) else value
