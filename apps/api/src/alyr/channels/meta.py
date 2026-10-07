"""Meta's WhatsApp Cloud API.

Field names follow Meta's documentation for business-scoped user IDs, checked 7 Oct 2026:
https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from alyr.channels.base import Address, InboundMessage, OutboundMessage


def verify_signature(app_secret: str, raw_body: bytes, header: str | None) -> bool:
    """Check Meta's X-Hub-Signature-256 header against the raw request body."""
    if not app_secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


def parse_webhook(payload: dict) -> list[InboundMessage]:
    """Pull customer messages out of a Cloud API webhook payload.

    Status updates (sent, delivered, read) carry no `messages` key and are skipped here.
    A message from a username-only customer has `from_user_id` and no `from`.
    """
    found: list[InboundMessage] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            number_id = value.get("metadata", {}).get("phone_number_id", "")
            profiles: dict[str, dict] = {}
            for contact in value.get("contacts", []):
                profile = contact.get("profile", {})
                for key in (contact.get("user_id"), contact.get("wa_id")):
                    if key:
                        profiles[key] = profile
            for msg in value.get("messages", []):
                kind = msg.get("type", "")
                text, reply_id = "", ""
                if kind == "text":
                    text = msg.get("text", {}).get("body", "")
                elif kind == "interactive":
                    inter = msg.get("interactive", {})
                    reply = inter.get("button_reply") or inter.get("list_reply") or {}
                    reply_id, text = reply.get("id", ""), reply.get("title", "")
                phone, user_id = msg.get("from", ""), msg.get("from_user_id", "")
                if not (phone or user_id):
                    continue
                profile = profiles.get(user_id) or profiles.get(phone) or {}
                found.append(
                    InboundMessage(
                        channel="meta",
                        message_id=msg.get("id", ""),
                        to_number_id=number_id,
                        kind=kind,
                        from_number=phone,
                        from_user_id=user_id,
                        username=profile.get("username", ""),
                        profile_name=profile.get("name", ""),
                        text=text,
                        reply_id=reply_id,
                        received_at=datetime.fromtimestamp(int(msg.get("timestamp", "0")), UTC),
                    )
                )
    return found


@dataclass(frozen=True)
class UserIdUpdate:
    """Meta's notice that a customer's user ID changed, usually after a new phone number."""

    waba_id: str
    number_id: str
    previous: str
    current: str
    phone: str


def parse_user_id_updates(payload: dict) -> list[UserIdUpdate]:
    found: list[UserIdUpdate] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for update in value.get("user_id_update", []):
                ids = update.get("user_id", {})
                if ids.get("previous") and ids.get("current"):
                    found.append(
                        UserIdUpdate(
                            waba_id=entry.get("id", ""),
                            number_id=value.get("metadata", {}).get("phone_number_id", ""),
                            previous=ids["previous"],
                            current=ids["current"],
                            phone=update.get("wa_id", ""),
                        )
                    )
    return found


def to_graph_payload(message: OutboundMessage, address: Address) -> dict:
    base: dict = {"messaging_product": "whatsapp", "recipient_type": "individual"}
    # Meta takes a phone number in `to`, or a business-scoped user ID in `recipient`.
    if address.phone:
        base["to"] = address.phone
    else:
        base["recipient"] = address.user_id
    if message.kind == "text":
        return base | {"type": "text", "text": {"body": message.body}}
    if message.kind == "buttons":
        buttons = [
            {"type": "reply", "reply": {"id": c.id, "title": c.title}} for c in message.choices
        ]
        interactive = {
            "type": "button",
            "body": {"text": message.body},
            "action": {"buttons": buttons},
        }
        return base | {"type": "interactive", "interactive": interactive}
    if message.kind == "list":
        rows = [{"id": c.id, "title": c.title} for c in message.choices]
        interactive = {
            "type": "list",
            "body": {"text": message.body},
            "action": {"button": "Choose", "sections": [{"title": "Options", "rows": rows}]},
        }
        return base | {"type": "interactive", "interactive": interactive}
    # Template parameters and language are added with template management (ALY-20).
    template = {"name": message.template_name, "language": {"code": "en"}}
    return base | {"type": "template", "template": template}


class MetaChannel:
    name = "meta"

    def __init__(self, access_token: str, graph_version: str) -> None:
        self._token = access_token
        self._base = f"https://graph.facebook.com/{graph_version}"

    async def send(
        self, from_number_id: str, message: OutboundMessage, address: Address
    ) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{self._base}/{from_number_id}/messages",
                headers={"Authorization": f"Bearer {self._token}"},
                json=to_graph_payload(message, address),
            )
            response.raise_for_status()
