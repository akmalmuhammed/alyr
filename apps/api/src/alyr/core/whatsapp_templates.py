"""The message templates on a business's WhatsApp account, and where each one stands (ALY-172,
spec 061, D-146).

ALYR's own wording is `core/templates.py`: what each template says, in English and Arabic. Meta
must approve each one on the account a business's number is on before ALYR may send it outside a
customer's 24-hour window. This module keeps what Meta says about every one of them, per business,
and can submit the ones Meta lacks.

**Reading is free; submitting is the founder's.** `sync` only reads from Meta. `submit` is a
Meta-facing action, so it is behind `Settings.template_submit` (off) and refuses outright while it
is off; what it would send can always be seen first (`plan`). A template written but not yet
cleared by the founder (`Template.held`) is never submitted, whatever the switch says.

A template is, for the screen: `draft` (ALYR has it; Meta has not been sent it: no row is kept for
those), `submitted` (Meta is reviewing it), `approved`, `rejected` (with Meta's reason), `paused`,
`flagged`, `disabled` or `deleted`. Names, languages, categories, statuses and Meta's reasons are
stored; wording never is.

Meta calls are made outside any database transaction. Functions that take a connection need one
scoped to the business.
"""

from dataclasses import dataclass
from pathlib import Path

import asyncpg
import httpx

from alyr import templates_sync
from alyr.channels.meta import MetaChannel, describe_error
from alyr.config import Settings
from alyr.core import whatsapp_line
from alyr.core.templates import CATALOGUE, Template

LANGUAGES = ("en", "ar")
WANTED: tuple[tuple[str, str], ...] = tuple((n, lang) for n in CATALOGUE for lang in LANGUAGES)
PROBLEMS = ("rejected", "paused", "flagged", "disabled")

# What a status Meta lists a template with means for ALYR. Meta's words, checked 31 Oct 2026
# (message_template_status_update and template management pages): PENDING and IN_APPEAL are in
# review; PENDING_DELETION, DELETED and ARCHIVED mean it cannot be sent; LIMIT_EXCEEDED means the
# account holds too many templates to take another.
LISTED = {
    "APPROVED": "approved", "PENDING": "submitted", "IN_APPEAL": "submitted",
    "REJECTED": "rejected", "PAUSED": "paused", "FLAGGED": "flagged", "DISABLED": "disabled",
    "PENDING_DELETION": "deleted", "DELETED": "deleted", "ARCHIVED": "deleted",
    "LIMIT_EXCEEDED": "rejected",
}
# What an event in a `message_template_status_update` notice means. LOCKED and UNARCHIVED change
# nothing we show (a locked template cannot be edited; an unarchived one returns to what it was,
# which the next sync reads).
EVENTS = {**LISTED, "REINSTATED": "approved"}


class SubmitOff(Exception):
    """Submitting is switched off; the message says what to do."""


class TemplateError(Exception):
    """A request about templates that cannot be carried out; safe to show staff."""


def _status(word: str) -> str:
    # A status Meta adds later is shown as submitted (in Meta's hands) with its own word.
    return LISTED.get(word.upper(), "submitted")


# ── what the screen shows ─────────────────────────────────────────────────────────────────


def _row(stored: asyncpg.Record | None, name: str, language: str, known: Template | None) -> dict:
    if stored is None:
        needs = bool(known and known.header in ("image", "document"))
        return {
            "name": name, "language": language, "category": known.category if known else "",
            "status": "draft", "meta_status": "", "reason": "", "advice": "",
            "held": known.held if known else "", "needs_sample": needs, "in_catalogue": True,
            "status_at": None, "submitted_at": None,
        }
    return {
        "name": name, "language": language, "category": stored["category"],
        "status": stored["status"], "meta_status": stored["meta_status"],
        "reason": stored["reason"], "advice": stored["advice"],
        "held": known.held if known else "", "needs_sample": False,
        "in_catalogue": stored["in_catalogue"],
        "status_at": stored["status_at"].isoformat() if stored["status_at"] else None,
        "submitted_at": stored["submitted_at"].isoformat() if stored["submitted_at"] else None,
    }


def inventory(stored: list[asyncpg.Record]) -> list[dict]:
    """Every template ALYR needs on the account, in the catalogue's order, with where Meta has it,
    then any Meta has that ALYR does not. Rows with a problem come first within their group."""
    by_key = {(r["name"], r["language"]): r for r in stored}
    rows = [_row(by_key.get(key), key[0], key[1], CATALOGUE[key[0]]) for key in WANTED]
    rows += [
        _row(r, r["name"], r["language"], None)
        for r in stored if (r["name"], r["language"]) not in set(WANTED)
    ]
    return rows


def counts(rows: list[dict]) -> dict:
    """How many of the templates ALYR needs stand where, and how many are held back."""
    wanted = [r for r in rows if r["in_catalogue"]]
    tally: dict[str, int] = {}
    for r in wanted:
        tally[r["status"]] = tally.get(r["status"], 0) + 1
    return {
        "wanted": len(wanted), "by_status": tally,
        "held": sum(1 for r in wanted if r["held"] and r["status"] == "draft"),
        "extra": sum(1 for r in rows if not r["in_catalogue"]),
    }


async def stored(conn: asyncpg.Connection, line: whatsapp_line.Line) -> list[asyncpg.Record]:
    return await conn.fetch(
        "select name, language, category, status, meta_status, meta_id, reason, advice, "
        "in_catalogue, submitted_at, status_at, synced_at from whatsapp_templates "
        "where waba_id = $1 order by name, language", line.waba_id,
    )


def plan(
    rows: list[dict], settings: Settings, only: set[tuple[str, str]] | None = None
) -> list[dict]:
    """What a submission would do for each template ALYR needs, and why it would not:
    `create` (Meta has none), `edit` (Meta refused it; it is sent again as now worded),
    `held` (the founder has not cleared it), `needs_app_id` (it has a sample header and the Meta
    app's ID is not set), or `nothing` (Meta already has it, in any state)."""
    out = []
    for r in rows:
        if not r["in_catalogue"] or (only is not None and (r["name"], r["language"]) not in only):
            continue
        if r["status"] == "draft":
            action = ("held" if r["held"]
                      else "needs_app_id" if r["needs_sample"] and not settings.meta_app_id
                      else "create")
        elif r["status"] == "rejected":
            sample = bool(CATALOGUE[r["name"]].header)
            action = ("held" if r["held"]
                      else "needs_app_id" if sample and not settings.meta_app_id else "edit")
        else:
            action = "nothing"
        out.append({"name": r["name"], "language": r["language"], "category": r["category"],
                    "action": action, "reason": r["held"] if action == "held" else ""})
    return out


# ── reading from Meta ─────────────────────────────────────────────────────────────────────


async def apply_listing(
    conn: asyncpg.Connection, line: whatsapp_line.Line, listing: list[dict], actor: str
) -> dict:
    """Make the business's rows say what Meta listed. A template Meta no longer lists has no row.
    Answers how many changed, for the trail."""
    before = {(r["name"], r["language"]): r["status"] for r in await stored(conn, line)}
    seen = set()
    changed = 0
    for item in listing:
        name, language = str(item.get("name", "")), str(item.get("language", ""))
        if not (name and language):
            continue
        seen.add((name, language))
        status = _status(str(item.get("status", "")))
        reason = str(item.get("rejected_reason") or "")
        await conn.execute(
            "insert into whatsapp_templates (waba_id, name, language, category, status, "
            "meta_status, meta_id, reason, in_catalogue, synced_at) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) "
            "on conflict (tenant_id, waba_id, name, language) do update set "
            "category = excluded.category, status = excluded.status, "
            "meta_status = excluded.meta_status, meta_id = excluded.meta_id, "
            "reason = case when excluded.reason = '' "
            "         and whatsapp_templates.status = excluded.status "
            "         then whatsapp_templates.reason else excluded.reason end, "
            "in_catalogue = excluded.in_catalogue, synced_at = now(), "
            "status_at = case when whatsapp_templates.status = excluded.status "
            "         then whatsapp_templates.status_at else now() end",
            line.waba_id, name, language, str(item.get("category", "")).lower(), status,
            str(item.get("status", "")), str(item.get("id", "")),
            "" if reason in ("", "NONE") else reason, (name, language) in set(WANTED),
        )
        changed += before.get((name, language)) != status
    gone = [key for key in before if key not in seen]
    for name, language in gone:
        await conn.execute(
            "delete from whatsapp_templates where waba_id = $1 and name = $2 and language = $3",
            line.waba_id, name, language)
    now = counts(inventory(await stored(conn, line)))
    await whatsapp_line.record(conn, line.number_id, "templates_synced", actor, True, {
        "changed": changed, "gone": len(gone), "listed": len(listing),
        "approved": now["by_status"].get("approved", 0), "wanted": now["wanted"]})
    return {"changed": changed, "gone": len(gone), "listed": len(listing)}


async def read_from_meta(channel: MetaChannel, line: whatsapp_line.Line) -> list[dict]:
    """The templates Meta has on the account (a read; sends nothing)."""
    if not line.waba_id:
        raise TemplateError(
            "This line has no WhatsApp Business Account ID saved, so Meta cannot be asked about "
            "its templates. Detach it and attach it again with the ID.")
    try:
        return await channel.list_templates(line.waba_id)
    except httpx.HTTPError as error:
        raise TemplateError(describe_error(error)) from error


# ── submitting to Meta (off until the founder says so) ────────────────────────────────────


@dataclass(frozen=True)
class Outcome:
    name: str
    language: str
    result: str  # submitted | resubmitted | refused
    note: str = ""


def require_on(settings: Settings) -> None:
    """Submitting is refused outright while the switch is off, before anything else is done."""
    if not settings.template_submit:
        raise SubmitOff("Submitting templates to Meta is switched off. Nothing was sent. "
                        "The founder switches it on (ALYR_TEMPLATE_SUBMIT) when ALYR may submit.")


async def to_submit(
    conn: asyncpg.Connection, line: whatsapp_line.Line, settings: Settings,
    only: set[tuple[str, str]] | None = None,
) -> list[dict]:
    """The templates a submission would send: the plan's `create` and `edit` entries, each with
    the ID Meta gave it when it is an edit."""
    if not line.waba_id:
        raise TemplateError("This line has no WhatsApp Business Account ID saved.")
    held = await stored(conn, line)
    ids = {(r["name"], r["language"]): r["meta_id"] for r in held}
    return [
        p | {"meta_id": ids.get((p["name"], p["language"]), "")}
        for p in plan(inventory(held), settings, only) if p["action"] in ("create", "edit")
    ]


async def send(
    channel: MetaChannel, settings: Settings, line: whatsapp_line.Line, item: dict
) -> tuple[Outcome, dict | None]:
    """Send one template to Meta, the only call in ALYR that writes to Meta's template API. Needs
    no database connection, so none is held open while Meta answers. Returns what happened and,
    when Meta took it, Meta's answer (`id`, `status`, `category`)."""
    name, language = item["name"], item["language"]
    template = CATALOGUE[name]
    text = template.ar if language == "ar" else template.en
    try:
        handle = None
        if template.header in ("image", "document"):
            filename, data = templates_sync.sample_file(template, language)
            handle = await channel.upload_template_sample(
                settings.meta_app_id, filename, data,
                "application/pdf" if Path(filename).suffix == ".pdf" else "image/png")
        components = templates_sync.components(template, text, handle, language)
        if item["action"] == "edit" and item["meta_id"]:
            await channel.edit_template(item["meta_id"], components)
            return Outcome(name, language, "resubmitted"), {
                "id": item["meta_id"], "status": "PENDING", "category": item["category"]}
        answer = await channel.create_template(line.waba_id, {
            "name": name, "language": language, "category": template.category.upper(),
            "components": components})
    except httpx.HTTPError as error:
        return Outcome(name, language, "refused", describe_error(error)), None
    return Outcome(name, language, "submitted"), answer


def rate_limited(outcome: Outcome) -> bool:
    return outcome.result == "refused" and "too many requests" in outcome.note


async def record_sent(
    conn: asyncpg.Connection, line: whatsapp_line.Line, item: dict, answer: dict
) -> None:
    """Meta's answer is the truth: a template it took is recorded as submitted, in Meta's hands."""
    name, language = item["name"], item["language"]
    await conn.execute(
        "insert into whatsapp_templates (waba_id, name, language, category, status, "
        "meta_status, meta_id, in_catalogue, submitted_at, synced_at) "
        "values ($1, $2, $3, $4, $5, $6, $7, true, now(), now()) "
        "on conflict (tenant_id, waba_id, name, language) do update set "
        "category = excluded.category, status = excluded.status, "
        "meta_status = excluded.meta_status, "
        "meta_id = case when excluded.meta_id = '' then whatsapp_templates.meta_id "
        "          else excluded.meta_id end, reason = '', advice = '', "
        "submitted_at = now(), status_at = now(), synced_at = now()",
        line.waba_id, name, language,
        str(answer.get("category") or CATALOGUE[name].category).lower(),
        _status(str(answer.get("status", "PENDING"))), str(answer.get("status", "PENDING")),
        str(answer.get("id", "")),
    )


async def record_batch(
    conn: asyncpg.Connection, line: whatsapp_line.Line, outcomes: list[Outcome], actor: str
) -> dict:
    """The submission as one entry on the line's trail: how many Meta took and how many not."""
    took = [o for o in outcomes if o.result != "refused"]
    summary = {
        "submitted": len(took), "refused": len(outcomes) - len(took),
        "names": sorted({o.name for o in took})[:40],
    }
    await whatsapp_line.record(
        conn, line.number_id, "templates_submitted", actor, bool(took) or not outcomes, summary)
    return summary


# ── what Meta tells us by webhook ─────────────────────────────────────────────────────────


async def apply_status_event(
    conn: asyncpg.Connection, line: whatsapp_line.Line, value: dict
) -> bool:
    """A `message_template_status_update` notice (Meta's webhook reference, 31 Oct 2026): the
    template's new status, and why when it was refused or paused. Written to the business's own
    row, made if it is not there. Returns whether anything was recorded."""
    name, language = str(value.get("message_template_name", "")), str(
        value.get("message_template_language", ""))
    event = str(value.get("event", "")).upper()
    status = EVENTS.get(event)
    if not (name and language and status):
        return False
    other = value.get("other_info") or {}
    info = value.get("rejection_info") or {}
    reason = str(value.get("reason") or "")
    if reason == "NONE":
        reason = ""
    if status == "paused" and not reason:
        reason = str(other.get("title") or "")
    if status == "disabled" and not reason:
        reason = "DISABLED"
    if status == "approved":
        reason = ""
    advice = str(info.get("recommendation") or other.get("description") or "")
    await conn.execute(
        "insert into whatsapp_templates (waba_id, name, language, category, status, meta_status, "
        "meta_id, reason, advice, in_catalogue) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) "
        "on conflict (tenant_id, waba_id, name, language) do update set status = excluded.status, "
        "meta_status = excluded.meta_status, reason = excluded.reason, advice = excluded.advice, "
        "category = case when excluded.category = '' then whatsapp_templates.category "
        "           else excluded.category end, "
        "meta_id = case when excluded.meta_id = '' then whatsapp_templates.meta_id "
        "          else excluded.meta_id end, status_at = now()",
        line.waba_id, name, language, str(value.get("message_template_category", "")).lower(),
        status, event, str(value.get("message_template_id", "")), reason[:200], advice[:500],
        (name, language) in set(WANTED),
    )
    await whatsapp_line.record(
        conn, line.number_id, "template", "ALYR", status == "approved" or (
            None if status == "submitted" else False),
        {"name": name, "language": language, "status": status, "reason": reason[:200]})
    return True


async def apply_category_event(
    conn: asyncpg.Connection, line: whatsapp_line.Line, value: dict
) -> bool:
    """A `template_category_update` notice: Meta changed (or will change, in about a day) the
    category of a template. A utility template Meta calls marketing is billed and limited as
    marketing, so the person reading the line is told."""
    name, language = str(value.get("message_template_name", "")), str(
        value.get("message_template_language", ""))
    new = str(value.get("new_category", "")).lower()
    coming = str(value.get("correct_category", "")).lower()
    if not (name and language and (new or coming)):
        return False
    if not coming:
        await conn.execute(
            "update whatsapp_templates set category = $4 where waba_id = $1 and name = $2 "
            "and language = $3", line.waba_id, name, language, new)
    await whatsapp_line.record(conn, line.number_id, "template", "ALYR", False if (
        coming or new == "marketing") else None, {
        "name": name, "language": language, "category": new,
        **({"will_become": coming} if coming else {})})
    return True
