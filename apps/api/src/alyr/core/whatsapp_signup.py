"""A business connects its own WhatsApp account through Meta's Embedded Signup (ALY-39, spec 063,
D-148, D-149).

Behind `Settings.embedded_signup` (off). When it is on and configured, the owner's screen opens
Meta's pop-up (Facebook Login for Business, a configuration made in the Meta app,
docs/runbooks/embedded-signup.md); the owner picks or creates their WhatsApp account and number
there. The browser then has two things for ALYR: a one-time **code** (it lives 30 seconds) and a
**session message** naming the account (`waba_id`), the number (`phone_number_id`) and the business
portfolio. Both come from the browser, so neither is trusted: the code is exchanged for the
business's token, and **every claim in the session message is read back from Meta with that token**
before anything is stored. A forged message names assets the token cannot see, and Meta refuses.

What `complete` does, in order, with every call to Meta made outside a database transaction
(checked against Meta's Embedded Signup and Tech Provider onboarding pages, 31 Oct 2026):

1. exchange the code for the business token (server to server, with the app's secret);
2. read the number and the account's numbers with that token, so the claimed assets are the
   token's;
3. register the number with a six-digit PIN (the default flow only: a number moved from the
   WhatsApp Business app, coexistence, is already registered), unless Meta already shows it
   connected;
4. subscribe ALYR's app to the account's webhooks;
5. seal the token and attach the number to the business, in one transaction scoped to the business.

Nothing is attached unless every step passed. A failure is on the line's trail with Meta's own words
(never a token) and is told to the owner in plain words. The token is sealed
(`core/channel_keys.py`), never logged and never returned.
"""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg
import httpx

from alyr.channels.meta import NUMBER_BASIC_FIELDS, MetaChannel, describe_error
from alyr.config import Settings
from alyr.core import (
    channel_credentials,
    channel_keys,
    whatsapp_health,
    whatsapp_line,
)
from alyr.db import Database

log = logging.getLogger("alyr.whatsapp_signup")

# The ways (core/whatsapp_setup.py) that connect through Embedded Signup, and the feature each one
# asks Meta's flow for. "own_account": the shop's existing WhatsApp Business Account, shared with
# ALYR (the default flow). "move_number": a number in the WhatsApp Business app, kept in the app
# (coexistence, `featureType` "whatsapp_business_app_onboarding" on Meta's page).
WAYS = {"own_account": "", "move_number": "whatsapp_business_app_onboarding"}
# The session events that carry a number. FINISH is the default flow; the other is coexistence.
COEXISTENCE = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
ATTACHING = ("FINISH", COEXISTENCE)


class SignupError(Exception):
    """A connection that could not be made. `code` is what the owner's screen words in the owner's
    language; `message` is the same in English, for anything else that reads it."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def available(settings: Settings) -> tuple[bool, str]:
    """Whether Embedded Signup may be offered, and if not why: `off` (the switch), `not_configured`
    (Meta's app ID, secret or configuration ID is missing) or `no_key` (nowhere to seal a token)."""
    if not settings.embedded_signup:
        return False, "off"
    if not (settings.meta_app_id and settings.meta_app_secret and settings.meta_es_config_id):
        return False, "not_configured"
    if not channel_keys.ready(settings):
        return False, "no_key"
    return True, ""


def offer(settings: Settings, way: str) -> dict:
    """What the owner's screen needs to know, without any value: whether to show Connect."""
    ok, _ = available(settings)
    return {"available": ok and way in WAYS}


def browser_config(settings: Settings, way: str) -> dict:
    """The public values the pop-up is opened with (Meta's implementation page, 31 Oct 2026: the
    app's ID, the configuration's ID, the Graph version, and the extras). None is a secret."""
    feature = WAYS.get(way, "")
    return {
        "app_id": settings.meta_app_id, "config_id": settings.meta_es_config_id,
        "version": settings.meta_graph_version,
        "extras": {"setup": {}, "sessionInfoVersion": "3"}
        | ({"featureType": feature} if feature else {}),
    }


def _words(error: Exception) -> str:
    """Meta's own reason for a refusal, for the trail and the owner: its user-facing message when
    it gave one. The token is never in it."""
    if isinstance(error, httpx.HTTPStatusError):
        try:
            body = error.response.json()["error"]
            return str(body.get("error_user_msg") or body.get("message") or "")[:200]
        except (ValueError, KeyError, TypeError):
            pass
    return describe_error(error)


async def _failed(
    db: Database, tenant_id: UUID, number_id: str, by: str, event: str, reason: str
) -> None:
    async with db.tenant(tenant_id) as conn:
        await whatsapp_line.record(
            conn, number_id, "signup", by, False, {"event": event, "reason": reason[:200]})


async def complete(
    db: Database, channel: MetaChannel, credentials: channel_credentials.Credentials,
    settings: Settings, tenant_id: UUID, by: str, *, code: str, event: str, waba_id: str,
    phone_number_id: str, way: str,
) -> dict:
    """Connect the business's number from what the browser brought back. Raises `SignupError`, with
    a message for the owner, when it cannot; then nothing is attached and nothing is kept."""
    ok, _ = available(settings)
    if not ok:
        raise SignupError("off", "Connecting with Facebook is not switched on.")
    if way not in WAYS:
        raise SignupError("way", "Choose how customers reach you on WhatsApp first.")
    if event not in ATTACHING:
        raise SignupError("no_number", "Meta finished without choosing a WhatsApp number. Press "
                                       "Connect again and choose one.")
    if not (waba_id.isdigit() and phone_number_id.isdigit() and 5 <= len(waba_id) <= 20
            and 5 <= len(phone_number_id) <= 20 and 0 < len(code) <= 1000):
        raise SignupError("incomplete", "Meta's answer was not complete. Press Connect again.")

    async def refuse(error: Exception, code: str, owner_says: str) -> SignupError:
        await _failed(db, tenant_id, phone_number_id, by, event, _words(error))
        return SignupError(code, owner_says)

    # 1. The code, for the business's token. It lives 30 seconds and works once.
    try:
        token, lasts = await channel.exchange_code(
            settings.meta_app_id, settings.meta_app_secret, code)
    except (httpx.HTTPError, KeyError, ValueError) as error:
        raise await refuse(error, "code", "Meta did not accept the connection (it only lasts "
                                          "half a minute). Press Connect again.") from error
    # 2. Every claim in the browser's message, read back with the business's own token.
    try:
        info = await channel.number_details(phone_number_id, NUMBER_BASIC_FIELDS, token)
        if phone_number_id not in await channel.account_number_ids(waba_id, token):
            raise ValueError("the number is not on that account")
    except (httpx.HTTPError, ValueError) as error:
        raise await refuse(error, "not_shown", "Meta does not show that number on your account. "
                                               "Press Connect again and choose it.") from error
    # 3. Register the number (a number moved from the WhatsApp Business app already is).
    pin = None
    if event == "FINISH" and info.get("status") != "CONNECTED":
        pin = f"{secrets.randbelow(10**6):06d}"
        try:
            await channel.register_number(phone_number_id, pin, token)
            info = await channel.number_details(phone_number_id, NUMBER_BASIC_FIELDS, token)
        except (httpx.HTTPError, ValueError) as error:
            raise await refuse(error, "register", "Meta could not switch your number on. Finish "
                                                  "setting it up in WhatsApp Manager and try "
                                                  "again.") from error
    if info.get("status") not in ("CONNECTED", None):
        error = ValueError(f"Meta shows the number as {info.get('status')}")
        raise await refuse(error, "not_connected", "Meta does not show your number as connected "
                                                   "yet. Finish setting it up in WhatsApp Manager "
                                                   "and try again.")
    # 4. Webhooks: ALYR's app subscribed to the account, so its messages reach ALYR.
    try:
        await channel.subscribe_app(waba_id, token)
    except (httpx.HTTPError, ValueError) as error:
        raise await refuse(error, "subscribe", "Meta did not let ALYR receive your messages. Try "
                                               "again in a minute.") from error
    # 5. Seal the token and attach the number, together or not at all.
    shown = str(info.get("display_phone_number") or "")
    expires = datetime.now(UTC) + timedelta(seconds=lasts) if lasts else None
    sealed = channel_keys.seal(
        tenant_id, phone_number_id, {"token": token} | ({"pin": pin} if pin else {}))
    try:
        async with db.tenant(tenant_id) as conn:
            await conn.execute("select set_config('app.whatsapp_signup', 'on', true)")
            await conn.execute(
                "insert into channel_credentials (number_id, waba_id, sealed, hint, expires_at, "
                "created_by) values ($1, $2, $3, $4, $5, $6) "
                "on conflict (tenant_id, number_id) do update set waba_id = excluded.waba_id, "
                "sealed = excluded.sealed, hint = excluded.hint, expires_at = excluded.expires_at, "
                "created_at = now(), created_by = excluded.created_by",
                phone_number_id, waba_id, sealed, channel_keys.hint(token), expires, by)
            await conn.execute(
                "select signup_attach_whatsapp_number($1, $2, $3, $4)",
                phone_number_id, waba_id, shown, f"Embedded Signup ({by})")
            line = whatsapp_line.Line(tenant_id, phone_number_id, waba_id, shown)
            await whatsapp_line.record(conn, phone_number_id, "signup", by, True, {
                "event": event, "registered": pin is not None, "subscribed": True,
                "coexistence": event == COEXISTENCE,
                "token_expires": expires.isoformat() if expires else None})
            await whatsapp_health.apply_info(conn, line, info, actor=by)
    except asyncpg.UniqueViolationError as error:
        # That number or this business already has a line: the credentials were rolled back.
        code = ("taken" if "already attached" in error.message
                else "has_number" if "detach it first" in error.message else "refused")
        raise await refuse(error, code, error.message.capitalize() + ".") from error
    credentials.forget()
    log.info("a business connected its own WhatsApp account")
    return {"number_id": phone_number_id, "display_phone": shown, "registered": pin is not None}


async def cancelled(
    db: Database, tenant_id: UUID, by: str, *, event: str, step: str, error: str, code: str
) -> None:
    """The owner closed the pop-up, or Meta's flow reported an error. For the trail only: the
    number is not known, so the entry is about no number."""
    async with db.tenant(tenant_id) as conn:
        await whatsapp_line.record(
            conn, "", "signup", by, None if event == "CANCEL" else False,
            {"event": event, "step": step[:60], "error": error[:200], "code": code[:20]})
