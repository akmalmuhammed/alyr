"""Drafting: the Composer writes the first message and two follow-ups from the checked brief, the
Critic reads them in a separate call, and code lints them (specs/065).

The greeting, the sender's name, ALYR's legal line and the opt-out sentence are added by code,
never by the model, so every message carries them. The lint runs when a draft is made, when the
founder edits one, and again in the send gateway (check 11).
"""

import re
from uuid import UUID

from alyr.config import Settings
from alyr.outreach import store

MAX_WORDS = 150
MAX_SUBJECT = 70
OPT_OUT = {
    "en": 'If you would rather not hear from me, reply "stop" and I will not write again.',
    # To be read by a native Gulf speaker before the first Arabic message (register row 19).
    "ar": "إذا كنت لا ترغب في رسائل أخرى، ردّ بكلمة «توقف» ولن أراسلك مجدداً.",
}
LINK = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.(?:com|net|org|qa|io|co|ae|sa|me|app)\b", re.I)
TRACKING = re.compile(r"<img|<html|utm_[a-z]+=|[?&](?:mc_|trk|track)", re.I)


def greeting(first_name: str, language: str) -> str:
    if language == "ar":
        return f"مرحباً {first_name}،" if first_name else "مرحباً،"
    return f"Hi {first_name}," if first_name else "Hello,"


def footer(settings: Settings, language: str) -> str:
    return (f"{settings.outreach_from_name}\n{settings.outreach_legal_line}\n\n"
            f"{OPT_OUT[language]}")


def body_of(sentences: list[str], first_name: str, language: str, settings: Settings,
            extra: str = "") -> str:
    text = " ".join(s.strip() for s in sentences if s.strip())
    parts = [greeting(first_name, language), text]
    if extra:
        parts.append(extra)
    parts.append(footer(settings, language))
    return "\n\n".join(parts)


def message_part(body: str, settings: Settings, language: str) -> str:
    """The body without the footer the code adds: what the word limit counts."""
    end = footer(settings, language)
    return body[: -len(end)] if body.endswith(end) else body


def lint(*, step: int, subject: str, body: str, language: str, sentences: list | None,
         kept: set[str], settings: Settings) -> dict:
    """Every rule as a finding `{key, ok, note}`; `ok` when all pass. `problems` repeats the notes
    of the failed ones, for messages."""
    findings: list[dict] = []

    def rule(key: str, ok: bool, note: str) -> None:
        findings.append({"key": key, "ok": bool(ok), "note": "" if ok else note})

    name, legal = settings.outreach_from_name.strip(), settings.outreach_legal_line.strip()
    rule("sender_name", name and name in body,
         "the sender's name is missing" if name else "no sender name (ALYR_OUTREACH_FROM_NAME)")
    rule("legal_line", legal and legal in body,
         "the legal name and address line is missing" if legal
         else "no legal name and address (ALYR_OUTREACH_LEGAL_LINE)")
    rule("opt_out_line", OPT_OUT.get(language, OPT_OUT["en"]) in body,
         "the opt-out sentence is missing")
    words = len(message_part(body, settings, language).split())
    rule("under_150_words", words < MAX_WORDS, f"{words} words; under {MAX_WORDS} please")
    rule("subject_length", (subject.strip() or step != 1) and len(subject) < MAX_SUBJECT,
         "no subject" if not subject.strip() else
         f"subject of {len(subject)} characters; under {MAX_SUBJECT} please")
    if step == 1:
        rule("no_link", not LINK.search(body), "the first message may hold no link")
    rule("no_tracking", not TRACKING.search(body), "a tracking pixel or tracked link")
    if sentences is not None:
        notes = []
        for n, sentence in enumerate(sentences):
            cited = list(sentence.get("claims") or [])
            unknown = [c for c in cited if c not in kept]
            if unknown:
                notes.append(f"sentence {n + 1} cites claims that were not kept: {unknown}")
            needs = sentence.get("kind") == "fact" or (
                sentence.get("kind") != "offer" and re.search(r"\d", sentence.get("text", "")))
            if needs and not [c for c in cited if c in kept]:
                notes.append(f"sentence {n + 1} states a fact and cites nothing")
        rule("uncited_fact", not notes, "; ".join(notes))
    ok = all(f["ok"] for f in findings)
    return {"ok": ok, "findings": findings, "words": words,
            "problems": [f["note"] for f in findings if not f["ok"]]}


CRITIC_KEYS = ("rests_on_brief", "short_plain", "true_to_offer")


def critic_result(answer: dict) -> dict:
    """The Critic's three judgments as findings; `ok` only when all three are there and pass."""
    by_key = {f["key"]: f for f in answer.get("findings") or [] if f.get("key") in CRITIC_KEYS}
    findings = [{"key": key, "ok": bool(by_key.get(key, {}).get("ok", False)),
                 "note": str(by_key.get(key, {}).get("note", "not judged"))[:300]}
                for key in CRITIC_KEYS]
    return {"ok": all(f["ok"] for f in findings), "findings": findings,
            "unsupported_sentences": list(answer.get("unsupported_sentences") or [])}


async def kept_claims(conn, prospect_id: UUID) -> list:
    return await conn.fetch(
        "select claim_key, text, url, quote from outreach_claims where prospect_id = $1 "
        "and kept order by id", prospect_id)


async def save_draft(conn, *, prospect_id: UUID, step: int, subject: str, body: str,
                     language: str, sentences: list | None, critic: dict, lint_result: dict,
                     created_by: str) -> UUID:
    """A new version of a step's draft; the version waiting before it is superseded."""
    await conn.execute(
        "update outreach_drafts set status = 'superseded' where prospect_id = $1 and step = $2 "
        "and status in ('in_review', 'approved')", prospect_id, step)
    version = await conn.fetchval(
        "select coalesce(max(version), 0) + 1 from outreach_drafts where prospect_id = $1 "
        "and step = $2", prospect_id, step)
    return await conn.fetchval(
        "insert into outreach_drafts (prospect_id, step, version, subject, body, language, "
        "sentences, critic, lint, body_hash, created_by) values ($1, $2, $3, $4, $5, $6, $7, "
        "$8, $9, $10, $11) returning id",
        prospect_id, step, version, subject, body, language, sentences, critic, lint_result,
        store.body_hash(subject, body), created_by)


async def compose(engine, prospect_id: UUID) -> str:
    settings, models = engine.settings, engine.models
    async with store.office(engine.db) as conn:
        p = await conn.fetchrow("select * from outreach_prospects where id = $1", prospect_id)
        if p is None or p["stage"] not in ("researched", "drafting", "in_review", "rejected"):
            return p["stage"] if p else "missing"
        if not settings.outreach_offer.strip():
            await store.set_stage(conn, prospect_id, "needs_human",
                                  "no offer text (ALYR_OUTREACH_OFFER)")
            return "needs_human"
        claims = await kept_claims(conn, prospect_id)
        await store.set_stage(conn, prospect_id, "drafting")
    kept = {c["claim_key"] for c in claims}
    language = p["language"]
    brief = "\n".join(
        [f"Business: {p['company']} ({p['business_type'] or 'business'}), {p['country']}",
         f"Writing to: {p['first_name'] or 'the team'}, {p['role'] or 'role unknown'}",
         f"Language: {'Arabic' if language == 'ar' else 'English'}",
         f"ALYR's offer (say nothing beyond it): {settings.outreach_offer}",
         "Claims you may cite:"] + [f"[{c['claim_key']}] {c['text']}" for c in claims])

    problems_note = ""
    for _attempt in range(2):
        drafted = await models.run("composer", brief + problems_note, prospect_id=prospect_id,
                                   max_tokens=2000)
        steps = {int(s["step"]): s["sentences"] for s in drafted["steps"]}
        if not all(n in steps and steps[n] for n in (1, 2, 3)):
            raise store.OutreachError("the composer did not write all three steps")
        subject = drafted["subject"].strip()[:MAX_SUBJECT + 20]
        critic = critic_result(await models.run(
            "critic", brief + "\n\nDraft, one sentence a line:\n" + "\n".join(
                f"{n}. {s['text']}" for n, s in enumerate(steps[1])),
            prospect_id=prospect_id, max_tokens=600))
        if critic["ok"]:
            break
        problems_note = "\n\nA reviewer found these problems in your last draft; fix them:\n" + \
            "\n".join(f"- {f['key']}: {f['note']}" for f in critic["findings"] if not f["ok"])

    async with store.office(engine.db) as conn:
        for step in (1, 2, 3):
            for sentence in steps[step]:
                sentence["text"] = " ".join(sentence["text"].split())
            texts = [s["text"] for s in steps[step]]
            step_subject = subject if step == 1 else f"Re: {subject}"
            body = body_of(texts, p["first_name"], language, settings)
            result = lint(step=step, subject=step_subject, body=body, language=language,
                          sentences=steps[step], kept=kept, settings=settings)
            await save_draft(
                conn, prospect_id=prospect_id, step=step, subject=step_subject, body=body,
                language=language, sentences=steps[step],
                critic=critic if step == 1 else {}, lint_result=result, created_by="model")
        await store.set_stage(conn, prospect_id, "in_review")
    return "in_review"


async def concierge(engine, prospect_id: UUID, label: str) -> UUID | None:
    """A short reply with the booking link for a clear "yes", waiting for the founder."""
    settings = engine.settings
    async with store.office(engine.db) as conn:
        p = await conn.fetchrow("select * from outreach_prospects where id = $1", prospect_id)
        row = await store.settings_row(conn)
        booking = row["booking_url"] or settings.outreach_booking_url
        first = await conn.fetchrow(
            "select subject from outreach_drafts where prospect_id = $1 and step = 1 "
            "order by version desc limit 1", prospect_id)
    if p is None or not booking:
        return None
    answer = await engine.models.run(
        "concierge", f"Label: {label}\nBusiness: {p['company']}\nLanguage: {p['language']}",
        prospect_id=prospect_id, max_tokens=400)
    subject = f"Re: {first['subject']}" if first else "Re: our call"
    body = body_of(answer["sentences"], p["first_name"], p["language"], settings, extra=booking)
    result = lint(step=4, subject=subject, body=body, language=p["language"], sentences=None,
                  kept=set(), settings=settings)
    async with store.office(engine.db) as conn:
        draft = await save_draft(
            conn, prospect_id=prospect_id, step=4, subject=subject, body=body,
            language=p["language"], sentences=None, critic={}, lint_result=result,
            created_by="model")
        await store.event(conn, prospect_id, "concierge_draft")
    return draft
