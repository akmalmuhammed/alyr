"""Owner asks on WhatsApp: one message to one linked staff number about one proposal (spec 066).

**Official WhatsApp only, through the outbound layer, to the owner or a registered manager number,
never to a customer.** This is the one file of Discovery that names the outbound layer, and the
one that loads contacts, and it loads them only through `receivers`: staff numbers linked to a
login that were marked to receive asks. A test marks a customer as a receiver by hand and expects
nothing; another reads the code and fails if a customer's id could reach a message.

An ask records that a message was sent and what was tapped (`discovery_asks`); it never says whether
the change is approved. That lives in `discovery_proposals.status` only, and a tap on WhatsApp goes
through the same action as the workspace's button (`discovery.approve_proposal`, channel
`whatsapp`), so the two cannot disagree. A typed word never approves: approval on WhatsApp is only
ever a tap on the ask's own button, and that button approves the ask's own `change_hash`.

When an ask is sent (`send_due`): not at night (22:00 to 07:00 on the shop's clock), not past the
shop's daily cap (3 by default) for that person, never while an earlier ask of theirs is open
(24 hours), one ask per proposal per person ever, highest severity first. Inside the person's
24-hour window the ask is a message with three buttons; outside it, it is the template
`discovery_ask`, **only when `ALYR_DISCOVERY_ASK_TEMPLATE_APPROVED` is on** (off until Meta has
approved it). While it is off nothing is sent outside the window and no message is recorded as
blocked: the proposal waits in the workspace and in the morning brief's line. The outbound layer
decides consent, the window and a paused client; this module only decides whether to ask.
"""

import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.config import get_settings
from alyr.core import actions, staff_link, templates
from alyr.modules.discovery import proposal_words as pw
from alyr.modules.discovery import proposals
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.items import alerts
from alyr.modules.items import clock as shop_clock

TEMPLATE = "discovery_ask"
PREFIX = "dc:"
_REPLY = re.compile(r"^dc:([0-9a-f-]{36}):(approve|later|details)$")
OPEN_FOR = timedelta(hours=24)
NEEDS_DAYS_LEFT = timedelta(days=1)
_SEVERITY = "case p.severity when 'high' then 0 when 'medium' then 1 else 2 end"


def _lang(contact: asyncpg.Record) -> str:
    return "ar" if contact["lang"] == "ar" else "en"


def _place(row: asyncpg.Record, lang: str) -> str:
    return row["place_name_ar"] if lang == "ar" and row["place_name_ar"] else row["place_name"]


def _link(proposal_id: UUID | None = None) -> str:
    base = get_settings().workspace_url.rstrip("/")
    if not base:
        return ""
    path = f"{base}/app/discovery?view=proposals"
    return f"{path}&p={proposal_id}" if proposal_id else path


# ── who may be asked ────────────────────────────────────────────────────────────────────


async def receivers(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    """The only contacts an ask can go to: staff numbers linked to a login, marked to receive
    asks, whose service consent is not withdrawn. There is no other way to a contact here."""
    return await conn.fetch(
        "select c.id, c.name, c.lang, c.user_id, "
        "coalesce(c.last_inbound_at > now() - interval '24 hours', false) as window_open "
        "from contacts c where c.role = 'staff' and c.user_id is not null "
        "and c.discovery_asks and c.consent_service <> 'revoked' order by c.name, c.id"
    )


# ── the messages ────────────────────────────────────────────────────────────────────────


def _choices(ask_id: UUID, lang: str, keys=("approve", "later", "details")) -> tuple[Choice, ...]:
    return tuple(
        Choice(f"{PREFIX}{ask_id}:{key}", pw.pick(pw.BUTTONS[key], lang)) for key in keys
    )


def ask_body(row: asyncpg.Record, shop: str, lang: str) -> tuple[str, dict]:
    """The message inside the window: what changes, from what to what, the rule, and that nothing
    changes until the tap. Its two value lines are the ones the workspace shows
    (`proposal_words.change_lines`)."""
    shown = pw.change_lines(row["change"], lang, row["target"])
    place = _place(row, lang)
    rule = pw.lower_first(pw.rule_line(row["rule_id"], row["target"], lang), lang)
    body = pw.lines(
        lang,
        pw.pick(pw.ASK_HEAD, lang).format(shop=shop),
        "",
        pw.pick(pw.ASK_LINE, lang).format(label=shown["field_label"], place=place),
        pw.pick(pw.ASK_NOW, lang).format(where=shown["where"], before=shown["before"]["text"]),
        pw.pick(pw.ASK_PROPOSED, lang).format(after=shown["after"]["text"]),
        "",
        pw.pick(pw.ASK_RULE, lang).format(rule=rule),
        pw.pick(pw.ASK_TAP, lang),
    )
    return body, shown


def ask_message(
    contact: asyncpg.Record, ask_id: UUID, row: asyncpg.Record, shop: str
) -> OutboundMessage:
    """One message. Inside the 24-hour window the outbound layer sends it as the body with three
    buttons; outside it, as the template with the same three buttons (quick replies). The values
    of the template's blanks are one line each and at most 240 characters, never cut."""
    lang = _lang(contact)
    body, shown = ask_body(row, shop, lang)
    return templates.notice(
        contact["id"], TEMPLATE, lang, body, shop, shown["field_label"], _place(row, lang),
        shown["before"]["text"], shown["after"]["text"], choices=_choices(ask_id, lang),
    )


def details_message(
    contact: asyncpg.Record, ask: asyncpg.Record, row: asyncpg.Record, shop: str,
    rating: int | None = None,
) -> OutboundMessage:
    """"See details": every line of the change and the link, with Approve and Not now again."""
    lang = _lang(contact)
    shown = pw.change_lines(row["change"], lang, row["target"])

    def side(which: str) -> list[str]:
        item = shown[which]
        names = pw.DAY_LONG_AR if lang == "ar" else pw.DAY_SHORT_EN
        return [f"{names[pw.WEEK.index(r['day'])]} {r['text']}" for r in item["lines"]] or [
            item["text"]
        ]

    link = _link(row["id"])
    body = pw.lines(
        lang,
        pw.pick(pw.DETAIL_HEAD, lang).format(shop=shop, title=pw.title(
            row["type"], row["target"], _place(row, lang), lang, rating)),
        "",
        pw.pick(pw.DETAIL_NOW, lang).format(where=shown["where"]),
        *side("before"),
        "",
        pw.pick(pw.DETAIL_PROPOSED, lang),
        *side("after"),
        "",
        pw.pick(pw.ASK_TAP, lang),
        *([pw.pick(pw.DETAIL_LINK, lang).format(link=link)] if link else []),
    )
    return OutboundMessage(
        to=contact["id"], kind="buttons", body=body[:1024],
        choices=_choices(ask["id"], lang, ("approve", "later")), lang=lang,
    )


# ── sending ─────────────────────────────────────────────────────────────────────────────


async def send_due(conn: asyncpg.Connection, outbound, now: datetime | None = None) -> int:
    """Ask the people who should be asked, now. Returns how many asks went out. Called by the
    worker's sweep every hour and once after each check-up."""
    now = now or datetime.now(UTC)
    shop = await shop_clock.load(conn, now)
    if alerts.in_quiet_hours(shop.local):
        return 0  # the next hourly pass after 07:00 sends it
    cap = await conn.fetchval("select ask_cap_per_day from discovery_settings") or 3
    names = await conn.fetchrow(
        "select name, name_ar from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    template_ready = get_settings().discovery_ask_template_approved
    sent = 0
    for person in await receivers(conn):
        caller = await staff_link.caller_for(conn, person["id"])
        if caller is None:
            continue  # the role is read now, not remembered
        scope = await proposals.scope_of(conn, caller)
        if scope.nothing:
            continue
        made_today = await conn.fetchval(
            "select count(*) from discovery_asks where contact_id = $1 "
            "and (created_at at time zone $2)::date = $3",
            person["id"], shop.tz.key, shop.today,
        )
        if made_today >= cap:
            continue
        if await conn.fetchval(
            "select exists (select 1 from discovery_asks a join discovery_proposals p "
            "on p.id = a.proposal_id where a.contact_id = $1 and a.status = 'queued' "
            "and p.status = 'proposed' and a.created_at > $2)",
            person["id"], now - OPEN_FOR,
        ):
            continue  # one open ask at a time
        row = await conn.fetchrow(
            f"{proposals._PROPOSAL} where p.status = 'proposed' and p.expires_at > $1 "
            "and not exists (select 1 from discovery_asks a where a.proposal_id = p.id "
            "and a.contact_id = $2) "
            "and (p.proposed_by is distinct from $3 or p.proposed_at <= $4) "
            "and ($5::uuid[] is null or p.location_id = any($5)) "
            f"order by {_SEVERITY}, p.proposed_at, p.id limit 1",
            now + NEEDS_DAYS_LEFT, person["id"], person["user_id"], now - timedelta(hours=1),
            None if scope.everywhere else list(scope.places),
        )
        if row is None:
            continue
        if not person["window_open"] and not template_ready:
            continue  # nothing outside the window until Meta has approved the template
        lang = _lang(person)
        shop_name = names["name_ar"] if lang == "ar" and names["name_ar"] else names["name"]
        ask_id = await conn.fetchval(
            "insert into discovery_asks (id, proposal_id, contact_id, user_id, change_hash, lang, "
            "sent_as, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8) "
            "on conflict (tenant_id, proposal_id, contact_id) do nothing returning id",
            uuid4(), row["id"], person["id"], person["user_id"], row["change_hash"], lang,
            "buttons" if person["window_open"] else "template", now,
        )
        if ask_id is None:
            continue
        result = await outbound.send(conn, ask_message(person, ask_id, row, shop_name))
        if result.blocked:
            await conn.execute(
                "update discovery_asks set status = 'closed', closed_reason = $2, message_id = $3 "
                "where id = $1",
                ask_id, f"blocked_{result.blocked}"[:60], result.message_id,
            )
            continue
        await conn.execute(
            "update discovery_asks set message_id = $2 where id = $1", ask_id, result.message_id
        )
        sent += 1
    return sent


async def notify_result(conn: asyncpg.Connection, outbound, proposal_id: UUID) -> bool:
    """Tell the person who approved on WhatsApp how it went: applied, or not applied. Sent only
    while their 24-hour window is open and only as an ordinary message, never a template."""
    row = await conn.fetchrow(f"{proposals._PROPOSAL} where p.id = $1", proposal_id)
    if row is None or row["decided_channel"] != "whatsapp" or row["decided_by"] is None:
        return False
    contact = await conn.fetchrow(
        "select id, lang, consent_service, "
        "coalesce(last_inbound_at > now() - interval '24 hours', false) as window_open "
        "from contacts where user_id = $1 and role = 'staff'",
        row["decided_by"],
    )
    if contact is None or not contact["window_open"] or contact["consent_service"] == "revoked":
        return False
    lang = _lang(contact)
    shown = pw.change_lines(row["change"], lang, row["target"])
    tz = await conn.fetchval(
        "select timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    if row["status"] == "applied":
        until = row["undo_until"]
        text = pw.pick(pw.REPLY["applied" if until else "applied_no_undo"], lang).format(
            what=shown["field_label"], place=_place(row, lang), after=shown["after"]["text"],
            date=pw.shop_date(until, tz, lang) if until else "",
        )
    elif row["status"] == "failed":
        text = pw.pick(pw.REPLY["failed"], lang).format(
            reason=pw.failure(row["failure_code"], row["target"], lang, short=True)
        )
    else:
        return False
    await outbound.send(conn, OutboundMessage(to=contact["id"], body=pw.lines(lang, text)))
    return True


class Notifier:
    """What the worker hands to the apply job: the function that sends a result."""

    def __init__(self, outbound) -> None:
        self._outbound = outbound

    async def __call__(self, conn: asyncpg.Connection, proposal_id: UUID) -> None:
        await notify_result(conn, self._outbound, proposal_id)


class Sender:
    """What the worker hands to the sweep and to the engine: ask whoever should be asked now."""

    def __init__(self, outbound) -> None:
        self._outbound = outbound

    async def __call__(self, conn: asyncpg.Connection, now: datetime | None = None) -> int:
        return await send_due(conn, self._outbound, now)


# ── a tap ───────────────────────────────────────────────────────────────────────────────


def parse_reply(reply_id: str) -> tuple[UUID, str] | None:
    found = _REPLY.match(reply_id or "")
    if found is None:
        return None
    try:
        return UUID(found.group(1)), found.group(2)
    except ValueError:
        return None


async def handle_reply(
    conn: asyncpg.Connection, contact: asyncpg.Record, message: InboundMessage
) -> list[OutboundMessage] | None:
    """A staff number tapped a button of an ask. Called first by the owner chat for a staff
    contact whose reply id starts with `dc:`; anything else is left to the other modules.

    1. The ask is loaded under the shop's row-level security. Not found, or not this number's: the
       same "no longer available", so a forwarded button or a guessed id learns nothing.
    2. The person behind the number is read now (the role is not remembered).
    3. Approve is `discovery.approve_proposal` with the ask's own hash and channel `whatsapp`;
       Not now leaves the proposal exactly as it is; See details sends every line of the change.
    """
    parsed = parse_reply(message.reply_id)
    if parsed is None or contact["role"] != "staff":
        return None
    ask_id, tap = parsed
    lang = _lang(contact)

    def say(key: str, **values) -> list[OutboundMessage]:
        text = pw.pick(pw.REPLY[key], lang).format(**values)
        return [OutboundMessage(to=contact["id"], body=pw.lines(lang, text))]

    ask = await conn.fetchrow("select * from discovery_asks where id = $1", ask_id)
    if ask is None or ask["contact_id"] != contact["id"]:
        return say("gone")
    caller = await staff_link.caller_for(conn, contact["id"])
    if caller is None:
        return say("not_linked")
    row = await conn.fetchrow(f"{proposals._PROPOSAL} where p.id = $1", ask["proposal_id"])
    if row is None:
        return say("gone")
    tz = await conn.fetchval(
        "select timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )

    if tap == "approve":
        try:
            data = await actions.run(
                conn, caller, "discovery.approve_proposal", id=row["id"],
                change_hash=ask["change_hash"], lang=lang,
            )
        except DiscoveryError as error:
            if error.code in ("proposal_closed", "retry_limit"):
                return say("closed")
            if error.code in ("not_found", "forbidden"):
                return say("other_branch")
            return say("gone")
        except (actions.NotAllowed, actions.NotSwitchedOn):
            return say("gone")
        await conn.execute(
            "update discovery_asks set status = 'answered', answer = 'approve', "
            "closed_reason = null, answered_at = now() where id = $1",
            ask_id,
        )
        if data["already"]:
            return say("already")
        return say("approved", what=data["field_label"], place=data["location"]["name"])

    if row["status"] != "proposed":
        return say("closed")
    await conn.execute(
        "update discovery_asks set status = 'answered', answer = $2, answered_at = now() "
        "where id = $1 and status = 'queued'",
        ask_id, tap,
    )
    if tap == "later":
        return say("later", date=pw.shop_date(row["expires_at"], tz, lang))
    shop = await conn.fetchrow(
        "select name, name_ar from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    name = shop["name_ar"] if lang == "ar" and shop["name_ar"] else shop["name"]
    review = None
    if row["type"] == "reply_to_review":
        review = await conn.fetchrow(
            "select rating from discovery_reviews where location_id = $1 and source_ref = $2",
            row["location_id"], row["subject_ref"],
        )
    return [details_message(contact, ask, row, name, review["rating"] if review else None)]


# ── what PROPOSALS answers ──────────────────────────────────────────────────────────────


def waiting_lines(data: dict, lang: str) -> list[str]:
    """The PROPOSALS command: how many wait for this person, up to five of them one to a line,
    and the workspace link. Read only."""
    waiting = [p for p in data["items"] if p["status"] == "proposed"]
    if not waiting:
        return [pw.pick(pw.REPLY["nothing"], lang)]
    n = data["waiting"] or len(waiting)
    out = [pw.pick(pw.REPLY["waiting_head"], lang).format(n=pw.n_changes(n, lang))]
    for index, p in enumerate(waiting[:5], start=1):
        out.append(f"{index}. {p['field_label']}, {p['location']['name']}")
    if n > 5:
        out.append(pw.pick(pw.REPLY["more"], lang).format(n=n - 5))
    link = _link()
    if link:
        out += ["", pw.pick(pw.REPLY["open"], lang).format(link=link)]
    return out
