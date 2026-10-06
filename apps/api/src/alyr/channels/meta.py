import hashlib
import hmac
from datetime import UTC, datetime

import httpx

from alyr.channels.base import InboundMessage, OutboundMessage


def verify_signature(app_secret: str, raw_body: bytes, header: str | None) -> bool:
    """Check Meta's X-Hub-Signature-256 header against the raw request body."""
    if not app_secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


def parse_webhook(payload: dict) -> list[InboundMessage]:
    """Pull customer messages out of a Cloud API webhook payload.

    Status updates (sent, delivered, read) carry no `messages` key and are skipped here.
    """
    found: list[InboundMessage] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            number_id = value.get("metadata", {}).get("phone_number_id", "")
            for msg in value.get("messages", []):
                kind = msg.get("type", "")
                text, reply_id = "", ""
                if kind == "text":
                    text = msg.get("text", {}).get("body", "")
                elif kind == "interactive":
                    inter = msg.get("interactive", {})
                    reply = inter.get("button_reply") or inter.get("list_reply") or {}
                    reply_id, text = reply.get("id", ""), reply.get("title", "")
                found.append(
                    InboundMessage(
                        channel="meta",
                        message_id=msg.get("id", ""),
                        to_number_id=number_id,
                        from_number=msg.get("from", ""),
                        kind=kind,
                        text=text,
                        reply_id=reply_id,
                        received_at=datetime.fromtimestamp(int(msg.get("timestamp", "0")), UTC),
                    )
                )
    return found


def to_graph_payload(message: OutboundMessage) -> dict:
    base: dict = {"messaging_product": "whatsapp", "to": message.to_number}
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

    async def send(self, from_number_id: str, message: OutboundMessage) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{self._base}/{from_number_id}/messages",
                headers={"Authorization": f"Bearer {self._token}"},
                json=to_graph_payload(message),
            )
            response.raise_for_status()
