"""Invoices and receipts by a message from the shop's own staff (ALY-141, spec 016).

    invoice Ahmed 500 for AC repair            فاتورة أحمد 500 صيانة مكيف
    receipt Ahmed 500 cash                      Ahmed paid 500 cash

The owner or a member of staff, writing from a phone registered as staff (`items/staff.py`, the
registry the Catalog's commands use), says what to invoice. ALYR reads it (`quick.py`), finds the
customer among the shop's own, and says back what it understood with Yes / Edit / Cancel. Yes
issues it through the engine (`sales.issue`: the same door every document of the shop comes
through, with an idempotency key, so a second Yes is the same invoice) and sends it by the ways
the shop has. For ten minutes after, Undo cancels it with a credit note, in words that say so.

* **Only staff.** A message from any other number never gets here; it is answered like any
  customer's, byte for byte, and nothing it says shows that the command exists. The router
  asks `contact["role"] == "staff"` before it calls this, and so does this.
* **Never a guess.** A name that fits one customer is that customer; one that fits several is a
  numbered question; one that fits none is a question for a phone number (or Skip). Two numbers
  and no currency word is a question. Nothing is issued before a Yes.
* **A customer who has never written to the shop's number cannot be messaged first** (consent,
  hard rule 5). The reply says so and gives the link and a `wa.me` link to send it from the
  person's own phone: the shop is never blocked.
* **A payment recorded against an invoice cannot be undone by message** (recorded payments are
  append-only, spec 013), and the confirmation says so before the Yes.
* **Only while the shop's number runs through ALYR.** This sees the messages that come through
  it; nothing here talks to Meta.

State lives in `document_commands`, one open command per staff number (migration 0044), so a
question can be answered a minute later and a tap on Yes twice issues one document.
"""

import logging
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import quote
from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core import mail, team
from alyr.core.normalise import has_arabic, western_digits
from alyr.modules.documents import (
    customers,
    delivery,
    delivery_words,
    listing,
    money,
    payments,
    quick,
    sales,
    service,
    words,
)
from alyr.modules.documents import settings as doc_settings
from alyr.modules.documents.errors import DocumentError
from alyr.modules.documents.wa_words import frag, say, title
from alyr.modules.items import text

log = logging.getLogger("alyr.documents.wa")

UNDO_MINUTES = 10
OPEN_MINUTES = 15
MAX_OPTIONS = 5

YES = {text.fold(w) for w in ("yes", "y", "ok", "okay", "confirm", "send", "issue", "نعم", "ايوه",
                              "أيوه", "ايوا", "تمام", "موافق", "اصدر", "أصدر", "ارسل", "أرسل")}
NO = {text.fold(w) for w in ("no", "n", "cancel", "stop", "لا", "الغاء", "إلغاء", "الغ", "ألغ")}
EDIT = {text.fold(w) for w in ("edit", "change", "redo", "تعديل", "عدل", "غير")}
SKIP = {text.fold(w) for w in ("skip", "no phone", "none", "تخطي", "تخطى", "بدون", "بدون رقم")}
UNDO = {text.fold(w) for w in ("undo", "تراجع", "تراجعي")}


def language(contact: asyncpg.Record, message: InboundMessage) -> str:
    """The language to answer in: the one the staff member wrote in, else the one on file."""
    if contact["lang"] == "ar":
        return "ar"
    return "ar" if has_arabic(message.text) else "en"


def _plain(contact: asyncpg.Record, body: str, lang: str) -> OutboundMessage:
    return OutboundMessage(to=contact["id"], body=body, lang=lang)


def _buttons(contact: asyncpg.Record, body: str, lang: str, *choices: Choice) -> OutboundMessage:
    return OutboundMessage(to=contact["id"], kind="buttons", body=body, lang=lang,
                           choices=choices)


def _actor(contact: asyncpg.Record) -> team.Actor:
    """A staff number has no sign-in: it is its owner-given name, and it came by WhatsApp."""
    return team.Actor(None, contact["name"], "whatsapp")


# ── the open command ─────────────────────────────────────────────────────────────────────


async def _open(conn: asyncpg.Connection, contact: asyncpg.Record) -> asyncpg.Record | None:
    """The command waiting for an answer from this number, if it is not stale."""
    row = await conn.fetchrow(
        "select * from document_commands where contact_id = $1 and state in ('asking', 'confirm') "
        "order by created_at desc limit 1", contact["id"])
    if row is None:
        return None
    if row["updated_at"] < datetime.now(UTC) - timedelta(minutes=OPEN_MINUTES):
        await conn.execute("update document_commands set state = 'expired', updated_at = now() "
                           "where id = $1", row["id"])
        return _Stale(row)
    return row


class _Stale:
    """A command that waited too long: it is not asked again, but the staff member who answers
    it late is told why nothing happened."""

    def __init__(self, row: asyncpg.Record) -> None:
        self.row = row


async def _store(conn: asyncpg.Connection, contact: asyncpg.Record, state: str, data: dict,
                 cmd_id: UUID | None = None) -> UUID:
    """Keep the command's state; a new command replaces any open one."""
    if cmd_id is None:
        await conn.execute(
            "update document_commands set state = 'cancelled', updated_at = now() "
            "where contact_id = $1 and state in ('asking', 'confirm')", contact["id"])
        return await conn.fetchval(
            "insert into document_commands (contact_id, state, kind, payload) "
            "values ($1, $2, $3, $4) returning id", contact["id"], state, data["kind"], data)
    await conn.execute(
        "update document_commands set state = $2, payload = $3, updated_at = now() where id = $1",
        cmd_id, state, data)
    return cmd_id


# ── entry point ──────────────────────────────────────────────────────────────────────────


async def maybe_handle(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record,
    message: InboundMessage, modules: set[str],
) -> list[OutboundMessage] | None:
    """Answer if this staff message is for the Documents command: a new invoice or receipt, the
    answer to a question or a confirmation, or Undo. Otherwise None, and the other modules see
    the message (the Catalog's commands, the credit ledger)."""
    if contact["role"] != "staff" or "documents" not in modules:
        return None
    lang = language(contact, message)
    reply = message.reply_id
    if reply.startswith("doc:"):
        return await _button(conn, tenant_id, contact, lang, reply)
    if reply or message.kind not in ("text", "interactive"):
        return None
    typed = " ".join(western_digits(message.text).split())
    folded = text.fold(typed)
    open_cmd = await _open(conn, contact)
    if isinstance(open_cmd, _Stale):
        if folded in YES or folded in NO or folded in EDIT:
            return [_plain(contact, say("expired", lang), lang)]
        open_cmd = None
    if open_cmd is not None:
        answered = await _answer(conn, tenant_id, contact, lang, open_cmd, typed, folded)
        if answered is not None:
            return answered
    parsed = quick.parse(message.text, allow_paid="ledger" not in modules)
    if parsed is not None:
        return await _start(conn, tenant_id, contact, lang, parsed)
    if folded in UNDO:
        return await _undo(conn, tenant_id, contact, lang, None, quiet=True)
    return None


# ── a new command ────────────────────────────────────────────────────────────────────────


def _problem(contact: asyncpg.Record, lang: str, parsed: quick.Quick) -> list[OutboundMessage]:
    problem = parsed.problems[0]
    code = {"amount": "ask_amount", "amount_many": "ask_amount_many",
            "amount_decimals": "ask_amount_decimals", "amount_big": "ask_amount_big"}[problem]
    return [_plain(contact, say(code, lang, numbers=", ".join(parsed.numbers)), lang)]


async def _start(conn, tenant_id, contact, lang, parsed: quick.Quick) -> list[OutboundMessage]:
    if parsed.problems:
        return _problem(contact, lang, parsed)
    cfg = await doc_settings.get(conn)
    if parsed.kind == "invoice" and not cfg["commercial_registration"]:
        # An invoice needs the shop's commercial registration number (spec 011): say so now,
        # with what to do, instead of after a Yes.
        error = words.ERRORS["registration_needed"]
        return [_plain(contact, error.get(lang), lang)]
    data = {
        "kind": parsed.kind, "amount_minor": parsed.amount_minor, "description": parsed.description,
        "name": parsed.name, "phone": parsed.phone, "method": parsed.method or "cash",
        "ambiguous": parsed.ambiguous, "lone": parsed.lone, "lang": lang,
        "customer_id": None, "new": None, "walkin": False, "against": None, "asked": "",
    }
    return await _advance(conn, tenant_id, contact, lang, data, None)


# ── finding the customer ─────────────────────────────────────────────────────────────────


def _display(row: asyncpg.Record | dict, lang: str) -> str:
    name = (row["name_ar"] or row["name"]) if lang == "ar" else (row["name"] or row["name_ar"])
    return name or row["company"]


def _digits_tail(phone: str | None) -> str:
    return (phone or "")[-4:]


async def _resolve(conn, contact, lang, data: dict) -> tuple[str, list[asyncpg.Record]] | None:
    """Work out who it is for. Sets what it can on `data` and returns a question as
    (code, options) when a person has to say, or None when it is settled."""
    kind = data["kind"]
    if data["phone"]:
        try:
            digits = customers.clean_phone(data["phone"])
        except DocumentError:
            return "phone_bad", []
        found = await customers.by_phone(conn, digits)
        if found is not None and found["role"] != "customer":
            data["phone"] = ""
            return "team", []
        if found is not None:
            data["customer_id"] = str(found["id"])
            data["shown"] = _display(found, lang)
            return None
        name = customers.bare_name(data["name"] or data["lone"])
        if name:
            data["new"] = {"name": name, "phone": digits}
            data["lone"] = ""
            return None
        data["phone"] = digits
        return "who", []
    typed = []
    if data["ambiguous"] == "lone":
        typed = [("lone", data["lone"])]
    elif data["ambiguous"] == "swap":
        typed = [("name", data["name"]), ("swap", data["description"])]
    elif data["name"]:
        typed = [("name", data["name"])]
    for role, candidate in typed:
        state, rows = await customers.match_name(conn, candidate)
        if state == "none":
            continue
        if role == "swap":                      # it was the second words that named a customer
            data["name"], data["description"] = candidate, data["name"]
        elif role == "lone":
            data["name"], data["description"] = candidate, ""
        data["ambiguous"] = ""
        if state == "many":
            return "pick", rows
        found = rows[0]
        data["customer_id"] = str(found["id"])
        data["shown"] = _display(found, lang)
        return None
    # Nobody by that name. What was typed stays as it was read.
    if data["ambiguous"] == "lone":
        if kind == "invoice":
            data["description"], data["name"] = data["lone"], ""
        else:
            data["description"], data["name"] = "", data["lone"]
    data["ambiguous"] = ""
    data["name"] = customers.bare_name(data["name"])
    if kind == "receipt":
        data["walkin"] = True            # a receipt needs no customer: the name is just typed
        return None
    if not data["name"]:
        return "who", []
    return "unknown", []


def _options_text(rows: list[asyncpg.Record], lang: str) -> str:
    return "\n".join(
        f"{n}. {_display(r, lang)} (…{_digits_tail(r['phone'])})" for n, r in enumerate(rows, 1))


async def _advance(conn, tenant_id, contact, lang, data: dict, cmd_id: UUID | None):
    """Take the command as far as it can go: ask what is missing, or ask for the Yes."""
    if data["customer_id"] is None and data["new"] is None and not data["walkin"]:
        question = await _resolve(conn, contact, lang, data)
        if question is not None:
            code, rows = question
            return await _ask(conn, contact, lang, data, cmd_id, code, rows)
    if data["kind"] == "invoice" and not data["description"]:
        return await _ask(conn, contact, lang, data, cmd_id, "what", [])
    if data["kind"] == "receipt" and data["customer_id"] and data["against"] is None:
        owing = await _open_invoices(conn, UUID(data["customer_id"]))
        usable = [i for i in owing if i["owing_minor"] >= data["amount_minor"]]
        if len(usable) == 1 and len(owing) == 1:
            data["against"] = usable[0]
        elif len(owing) > 1 and usable:
            return await _ask(conn, contact, lang, data, cmd_id, "invoice", usable)
        else:
            data["against"] = {}
    return await _confirm(conn, contact, lang, data, cmd_id)


async def _open_invoices(conn, customer_id: UUID) -> list[dict]:
    rows = await conn.fetch(
        f"select d.id, d.number, {listing.OWING} as owing_minor from documents d "
        f"where d.contact_id = $1 and d.kind = 'invoice' and d.status = 'issued' "
        f"and {listing.OWING} > 0 order by d.issued_at, d.id limit 6", customer_id)
    return [{"id": str(r["id"]), "number": r["number"], "owing_minor": int(r["owing_minor"])}
            for r in rows]


async def _ask(conn, contact, lang, data: dict, cmd_id, code: str, rows) -> list[OutboundMessage]:
    """Ask one question and wait for the answer."""
    who = data["name"] or data["lone"] or ""
    if code == "team":
        await _store(conn, contact, "cancelled", data, cmd_id)
        return [_plain(contact, say("team_number", lang), lang)]
    data["asked"] = code
    if code == "pick":
        data["options"] = [{"id": str(r["id"]), "label": _display(r, lang),
                            "phone": r["phone"] or ""} for r in rows]
    elif code == "invoice":
        data["options"] = [dict(i) for i in rows]
    await _store(conn, contact, "asking", data, cmd_id)
    if code == "phone_bad":
        return [_plain(contact, say("ask_phone_bad", lang), lang)]
    if code == "pick":
        body = say("ask_pick", lang, who=who, options=_options_text(rows, lang))
        choices = tuple(Choice(f"doc:pick:{n}", _clip(_display(r, lang), 24),
                               (r["phone"] or "")[-8:]) for n, r in enumerate(rows, 1))
        return [OutboundMessage(to=contact["id"], kind="list", body=body, lang=lang,
                                choices=choices)]
    if code == "invoice":
        cur = (await doc_settings.get(conn))["currency"]
        exp = money.CURRENCIES[cur].exponent
        lines = [f"{n}. {i['number']} ({money.written(i['owing_minor'], cur, exp, lang)})"
                 for n, i in enumerate(rows, 1)]
        lines.append(f"{len(rows) + 1}. {say('pick_none', lang)}")
        choices = tuple(Choice(f"doc:pick:{n}", _clip(i["number"], 24)) for n, i in
                        enumerate(rows, 1))
        choices += (Choice(f"doc:pick:{len(rows) + 1}", _clip(title("pick_none", lang), 24)),)
        return [OutboundMessage(
            to=contact["id"], kind="list", lang=lang, choices=choices[:10],
            body=say("ask_pick_invoice", lang, who=who, options="\n".join(lines)))]
    if code == "unknown":
        return [_plain(contact, say("ask_phone", lang, who=who), lang)]
    return [_plain(contact, say(f"ask_{code}", lang), lang)]


def _clip(value: str, size: int) -> str:
    return value if len(value) <= size else value[: size - 1] + "…"


# ── asking for the Yes ───────────────────────────────────────────────────────────────────


async def _confirm(conn, contact, lang, data: dict, cmd_id: UUID | None) -> list[OutboundMessage]:
    cfg = await doc_settings.get(conn)
    cur = cfg["currency"]
    exp = money.CURRENCIES[cur].exponent
    amount = money.written(data["amount_minor"], cur, exp, lang)
    description = data["description"]
    what = frag("what_for", lang, what=description) if description else ""
    if data["customer_id"]:
        who = data.get("shown") or data["name"]
        extra = ""
    elif data["new"]:
        who = data["new"]["name"]
        extra = frag("extra_new", lang, phone="+" + data["new"]["phone"])
    else:
        who = data["name"] or ("—")
        extra = frag("extra_unsaved", lang) if data["name"] else ""
    data["asked"] = ""
    cmd_id = await _store(conn, contact, "confirm", data, cmd_id)
    if data["kind"] == "invoice":
        body = say("confirm_invoice", lang, who=who, extra=extra, amount=amount, what=what)
    else:
        against = ""
        if data["against"]:
            against = frag("against", lang, number=data["against"]["number"],
                          owing=money.written(data["against"]["owing_minor"], cur, exp, lang))
        body = say("confirm_receipt", lang, who=who, amount=amount, what=what, against=against,
                   how=frag(f"how_{data['method']}", lang))
    return [_buttons(
        contact, body, lang, Choice(f"doc:yes:{cmd_id}", title("yes", lang)),
        Choice(f"doc:edit:{cmd_id}", title("edit", lang)),
        Choice(f"doc:no:{cmd_id}", title("cancel", lang)))]


# ── answers ──────────────────────────────────────────────────────────────────────────────


async def _button(conn, tenant_id, contact, lang, reply: str) -> list[OutboundMessage] | None:
    parts = reply.split(":")
    action = parts[1] if len(parts) > 1 else ""
    ident = parts[2] if len(parts) > 2 else ""
    if action == "pick":
        row = await _open(conn, contact)
        if row is None or isinstance(row, _Stale):
            return [_plain(contact, say("expired", lang), lang)]
        return await _answer(conn, tenant_id, contact, lang, row, ident, ident) or [
            _plain(contact, say("pick_bad", lang), lang)]
    try:
        cmd_id = UUID(ident)
    except ValueError:
        return [_plain(contact, say("expired", lang), lang)]
    row = await conn.fetchrow(
        "select * from document_commands where id = $1 and contact_id = $2", cmd_id, contact["id"])
    if row is None:
        return [_plain(contact, say("expired", lang), lang)]
    lang = row["payload"].get("lang", lang)
    if action == "undo":
        return await _undo(conn, tenant_id, contact, lang, row)
    if row["state"] == "issued":
        return [_plain(contact, say("already_issued", lang,
                                    number=row["payload"].get("number", "")), lang)]
    if row["state"] != "confirm":
        return [_plain(contact, say("expired", lang), lang)]
    if action == "yes":
        return await _issue(conn, tenant_id, contact, lang, row)
    if action == "edit":
        await _store(conn, contact, "cancelled", row["payload"], row["id"])
        return [_plain(contact, say("edit_again", lang), lang)]
    await _store(conn, contact, "cancelled", row["payload"], row["id"])
    return [_plain(contact, say("cancelled", lang), lang)]


async def _answer(conn, tenant_id, contact, lang, row, typed: str, folded: str):
    """The staff member said something while a command was open. Returns the reply, or None
    when it was not an answer (it may be a new command, or another module's)."""
    data = dict(row["payload"])
    lang = data.get("lang", lang)
    if row["state"] == "confirm":
        if folded in YES:
            return await _issue(conn, tenant_id, contact, lang, row)
        if folded in EDIT:
            await _store(conn, contact, "cancelled", data, row["id"])
            return [_plain(contact, say("edit_again", lang), lang)]
        if folded in NO:
            await _store(conn, contact, "cancelled", data, row["id"])
            return [_plain(contact, say("cancelled", lang), lang)]
        return None
    question = data.get("asked", "")
    if folded in NO:
        await _store(conn, contact, "cancelled", data, row["id"])
        return [_plain(contact, say("cancelled", lang), lang)]
    if quick.parse(typed) is not None and question in ("who", "what", "unknown"):
        return None                      # a whole new command, not an answer
    if question in ("pick", "invoice"):
        options = data.get("options", [])
        pick = typed.strip().rstrip(".)")
        if pick.isdigit() and 1 <= int(pick) <= len(options) + (1 if question == "invoice" else 0):
            n = int(pick)
            if question == "pick":
                data["customer_id"] = options[n - 1]["id"]
                data["shown"] = options[n - 1]["label"]
                data["ambiguous"] = ""
            else:
                data["against"] = options[n - 1] if n <= len(options) else {}
            return await _advance(conn, tenant_id, contact, lang, data, row["id"])
        if question == "pick" and re.fullmatch(r"[+\d][\d\s\-]{6,}", typed):
            data["phone"], data["ambiguous"] = typed, ""
            return await _advance(conn, tenant_id, contact, lang, data, row["id"])
        return [_plain(contact, say("pick_bad", lang), lang)]
    if question == "what":
        data["description"] = typed[:300]
        return await _advance(conn, tenant_id, contact, lang, data, row["id"])
    if question == "who":
        if re.fullmatch(r"[+\d][\d\s\-]{6,}", typed):
            data["phone"] = typed
        else:
            data["name"] = typed[:120]
        return await _advance(conn, tenant_id, contact, lang, data, row["id"])
    if question in ("unknown", "phone_bad"):
        if folded in SKIP:
            data["walkin"] = True
            return await _advance(conn, tenant_id, contact, lang, data, row["id"])
        if re.fullmatch(r"[+\d][\d\s\-]{6,}", typed):
            data["phone"] = typed
            return await _advance(conn, tenant_id, contact, lang, data, row["id"])
        return [_plain(contact, say("ask_phone_bad", lang), lang)]
    return None


# ── issuing ──────────────────────────────────────────────────────────────────────────────


def _customer_json(row: asyncpg.Record | None, data: dict) -> dict:
    if row is None:
        name = data["name"] or (data["new"] or {}).get("name", "")
        return {"name": name} if name else {}
    out = {"name": row["name"], "name_ar": row["name_ar"], "company": row["company"],
           "email": row["email"] or "", "registration_number": row["registration_number"],
           "tax_id": row["tax_id"], "address": row["address"], "address_ar": row["address_ar"]}
    if row["phone"]:
        out["phone"] = "+" + row["phone"]
    return {k: v for k, v in out.items() if v}


async def _issue(conn, tenant_id, contact, lang, row) -> list[OutboundMessage]:
    data = dict(row["payload"])
    actor = _actor(contact)
    staff = sales.staff_for(tenant_id, actor)
    cfg = await doc_settings.get(conn)
    cur = cfg["currency"]
    exp = money.CURRENCIES[cur].exponent
    key = f"wa-cmd:{row['id']}"
    amount = data["amount_minor"]

    customer_row = None
    contact_id: UUID | None = None
    try:
        async with conn.transaction():
            if data["customer_id"]:
                contact_id = UUID(data["customer_id"])
            elif data["new"]:
                saved = await customers.save(conn, staff, data["new"])
                contact_id = UUID(saved["id"])
            if contact_id:
                customer_row = await conn.fetchrow(
                    "select name, name_ar, company, phone, email, registration_number, tax_id, "
                    "address, address_ar, lang from contacts where id = $1", contact_id)
            customer = _customer_json(customer_row, data)
            if data["kind"] == "receipt" and data["against"]:
                done = await payments.record(
                    conn, staff, subject="invoice", subject_id=UUID(data["against"]["id"]),
                    amount_minor=amount, method="card_terminal" if data["method"] == "card"
                    else data["method"], reference="WhatsApp", key=key, receipt=True, send=True)
                document = done["document"]
                if document is None:
                    raise DocumentError(done["receipt_error"] or "error")
            else:
                body = _body(data, cfg, contact_id, customer, row["id"], lang)
                made = await sales.issue(
                    conn, actor, body, key, subject="conversation",
                    subject_id=contact_id or contact["id"], contact_id=contact_id, send=True)
                if made.document is None:
                    raise DocumentError(made.error if made.error in words.ERRORS else "error")
                document = made.document
    except DocumentError as error:
        await _store(conn, contact, "cancelled", data, row["id"])
        return [_plain(contact, words.ERRORS[error.code].get(lang), lang)]

    number = document["number"]
    data["number"] = number
    data["document_id"] = document["id"]
    data["issued_at"] = datetime.now(UTC).isoformat()
    data["undoable"] = not (data["kind"] == "receipt" and data["against"])
    await conn.execute(
        "update document_commands set state = 'issued', payload = $2, document_id = $3, "
        "updated_at = now() where id = $1", row["id"], data, UUID(document["id"]))
    who = (customer_row and _display(customer_row, lang)) or data["name"] or "—"
    sent = await _sent_line(conn, staff, lang, document, customer_row, contact_id, who)
    undo = (frag("undo_hint" if data["kind"] == "invoice" else "undo_hint_receipt", lang,
                minutes=UNDO_MINUTES) if data["undoable"] else "")
    code = "issued_invoice" if data["kind"] == "invoice" else "issued_receipt"
    body_text = say(code, lang, number=number, who=who, sent=sent, undo=undo,
                    amount=money.written(document["totals"]["total_minor"] if data["kind"] ==
                                         "invoice" else amount, cur, exp, lang))
    if not data["undoable"]:
        return [_plain(contact, body_text, lang)]
    return [_buttons(contact, body_text, lang,
                     Choice(f"doc:undo:{row['id']}", title("undo", lang)))]


def _body(data: dict, cfg: dict, contact_id: UUID | None, customer: dict, cmd_id: UUID,
          lang: str) -> dict:
    kind = data["kind"]
    line_text = data["description"] or frag("default_receipt_line", lang)
    body: dict = {
        "kind": kind, "contact_id": contact_id, "customer": customer,
        # The words go on the side of the paper their script belongs to.
        "lines": [{"description": "" if has_arabic(line_text) else line_text,
                   "description_ar": line_text if has_arabic(line_text) else "",
                   "quantity": 1, "unit": "piece", "unit_price_minor": data["amount_minor"]}],
        "source": "manual", "source_ref": f"wa:{cmd_id}",
    }
    if kind == "receipt":
        method = data["method"]
        paid = data["amount_minor"]
        if method == "cash" and cfg["cash_rounding_minor"]:
            # Cash is rounded as the shop's setting says; the receipt is for the rounded total.
            paid += money.round_to_step(paid, cfg["cash_rounding_minor"])
        body["payments"] = [{"method": method, "amount_minor": paid, "reference": "WhatsApp"}]
    return body


async def _sent_line(conn, staff, lang, document, customer_row, contact_id, who) -> str:
    """What happened to the document's delivery, in words: on its way, or how to send it."""
    if customer_row is None:
        link = await delivery.share_link(conn, staff, UUID(document["id"]))
        return frag("no_customer", lang, link=link["url"])
    state = await conn.fetchrow(
        "select consent_service, email, "
        "coalesce(last_inbound_at > now() - interval '24 hours', false) as window_open "
        "from contacts where id = $1", contact_id)
    out = ""
    emailed = bool(state["email"]) and mail.deliverable(state["email"])
    whatsapp = state["consent_service"] != "revoked" and state["window_open"]
    if whatsapp:
        out += frag("sent_whatsapp", lang, who=who)
    if emailed:
        out += frag("sent_email" if whatsapp else "sent_email_only", lang, email=state["email"])
    if not whatsapp:
        link = await delivery.share_link(conn, staff, UUID(document["id"]))
        share = _share(document, customer_row, link, lang)
        out += frag("not_reachable", lang, who=who, share=share)
    return out


def _share(document: dict, customer_row, link: dict, lang: str) -> str:
    """The document's link and, on the next line, a `wa.me` link that opens the person's own
    WhatsApp with the message written, addressed to the customer."""
    shop = (document["seller"] or {}).get("name_ar" if lang == "ar" else "name") \
        or (document["seller"] or {}).get("name", "")
    cur, exp = document["currency"], document["currency_exponent"]
    amount = money.written(document["totals"]["total_minor"], cur, exp, lang)
    message = delivery_words.caption(document["kind"], document["number"], shop, amount,
                                     link["url"], lang)
    digits = customer_row["phone"] if customer_row and customer_row["phone"] else ""
    return f"{link['url']} \nhttps://wa.me/{digits}?text={quote(message)} "


# ── undo ─────────────────────────────────────────────────────────────────────────────────


async def _undo(conn, tenant_id, contact, lang, row, quiet: bool = False):
    """Cancel what this staff member last issued, if it is still within the ten minutes and
    can be: with a credit note, and in words that say so. `quiet` is the plain word "undo",
    which belongs to the Catalog's commands too: if there is nothing of ours to undo it says
    nothing and lets them have it."""
    if row is None:
        row = await conn.fetchrow(
            "select * from document_commands where contact_id = $1 and state = 'issued' "
            "order by updated_at desc limit 1", contact["id"])
        if row is None:
            return None if quiet else [_plain(contact, say("undo_nothing", lang), lang)]
        # The Catalog's own Undo covers what it changed; this one covers invoices. The newer of
        # the two is what "undo" means.
        later = await conn.fetchval(
            "select true from staff_changes where contact_id = $1 and undone_at is null "
            "and created_at > $2 limit 1", contact["id"], row["updated_at"])
        if later and quiet:
            return None
        if not row["payload"].get("undoable", True):
            return [_plain(contact, say("undo_payment", row["payload"].get("lang", lang)), lang)]
    data = dict(row["payload"])
    lang = data.get("lang", lang)
    if row["state"] == "undone":
        return [_plain(contact, say("undo_nothing", lang), lang)]
    if row["state"] != "issued" or not data.get("undoable", True):
        return [_plain(contact, say("undo_nothing", lang), lang)]
    number = data.get("number", "")
    issued = (datetime.fromisoformat(data["issued_at"]) if data.get("issued_at")
              else row["updated_at"])
    if datetime.now(UTC) - issued > timedelta(minutes=UNDO_MINUTES):
        return [_plain(contact, say("undo_late", lang, number=number, minutes=UNDO_MINUTES), lang)]
    actor = _actor(contact)
    staff = sales.staff_for(tenant_id, actor)
    doc_id = UUID(data["document_id"])
    reason = f"Cancelled by {contact['name']} on WhatsApp"
    try:
        note, _replayed = await service.credit_note(
            conn, staff, doc_id, reason=reason, key=f"wa-undo:{row['id']}")
    except DocumentError as error:
        return [_plain(contact, words.ERRORS[error.code].get(lang), lang)]
    await conn.execute("update document_commands set state = 'undone', updated_at = now() "
                       "where id = $1", row["id"])
    told = ""
    contact_id = await conn.fetchval("select contact_id from documents where id = $1", doc_id)
    if contact_id and await _was_sent(conn, doc_id):
        await sales.queue_delivery(conn, note, contact_id, True, actor)
        who = await conn.fetchval("select coalesce(nullif(name, ''), name_ar) from contacts "
                                  "where id = $1", contact_id)
        told = frag("undone_told", lang, who=who)
    return [_plain(contact, say("undone", lang, number=number, credit=note["number"], told=told),
                   lang)]


async def _was_sent(conn, doc_id: UUID) -> bool:
    """Did the customer get (or is the customer getting) the document?"""
    states = [d["state"] for d in await delivery.deliveries_of(conn, doc_id)]
    return any(s in ("queued", "sent", "delivered") for s in states)
