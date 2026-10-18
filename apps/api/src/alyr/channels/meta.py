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
                text, reply_id, media_id, mime_type = "", "", "", ""
                if kind == "text":
                    text = msg.get("text", {}).get("body", "")
                elif kind == "image":
                    # A photo: its caption is the text, and the file is fetched by its ID.
                    image = msg.get("image", {})
                    text, media_id = image.get("caption", ""), image.get("id", "")
                    mime_type = image.get("mime_type", "")
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
                        media_id=media_id,
                        mime_type=mime_type,
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


@dataclass(frozen=True)
class DeliveryStatus:
    """Meta's report on a message we sent: sent, delivered, read or failed."""

    number_id: str
    message_id: str
    status: str
    error: str = ""


def parse_statuses(payload: dict) -> list[DeliveryStatus]:
    found: list[DeliveryStatus] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            number_id = value.get("metadata", {}).get("phone_number_id", "")
            for status in value.get("statuses", []):
                if not (status.get("id") and status.get("status")):
                    continue
                errors = status.get("errors") or [{}]
                found.append(
                    DeliveryStatus(
                        number_id=number_id,
                        message_id=status["id"],
                        status=status["status"],
                        error=errors[0].get("title", ""),
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
        interactive: dict = {
            "type": "button",
            "body": {"text": message.body},
            "action": {"buttons": buttons},
        }
        if message.media_id:
            # A picture above the text and buttons (an item with its Order button).
            interactive["header"] = {"type": "image", "image": {"id": message.media_id}}
        return base | {"type": "interactive", "interactive": interactive}
    if message.kind == "list":
        rows = [
            {"id": c.id, "title": c.title}
            | ({"description": c.description} if c.description else {})
            for c in message.choices
        ]
        arabic = message.lang == "ar"
        interactive = {
            "type": "list",
            "body": {"text": message.body},
            "action": {
                "button": "اختر" if arabic else "Choose",
                "sections": [{"title": "القائمة" if arabic else "Options", "rows": rows}],
            },
        }
        return base | {"type": "interactive", "interactive": interactive}
    if message.kind == "image":
        image = {"id": message.media_id}
        if message.body:
            image["caption"] = message.body
        return base | {"type": "image", "image": image}
    template: dict = {
        "name": message.template_name,
        "language": {"code": "ar" if message.lang == "ar" else "en"},
    }
    components = []
    if message.media_id:
        # The template's image header, uploaded at send time (`upload_media`).
        components.append({"type": "header", "parameters": [
            {"type": "image", "image": {"id": message.media_id}}
        ]})
    if message.template_params:
        values = [{"type": "text", "text": value} for value in message.template_params]
        components.append({"type": "body", "parameters": values})
    if components:
        template["components"] = components
    return base | {"type": "template", "template": template}


class MetaChannel:
    name = "meta"

    def __init__(self, access_token: str, graph_version: str) -> None:
        self._token = access_token
        self._base = f"https://graph.facebook.com/{graph_version}"

    async def send(
        self, from_number_id: str, message: OutboundMessage, address: Address
    ) -> str | None:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{self._base}/{from_number_id}/messages",
                headers={"Authorization": f"Bearer {self._token}"},
                json=to_graph_payload(message, address),
            )
            response.raise_for_status()
            sent = response.json().get("messages") or [{}]
            return sent[0].get("id")

    async def download_media(self, media_id: str, max_bytes: int) -> tuple[bytes, str]:
        """Fetch a file that was sent to us. Two requests, checked against Meta's media
        page on 18 Oct 2026: GET /{media-id} answers with a `url` (good for five minutes)
        and the type; GET that url, with the access token, answers with the file. The
        file is read in pieces and dropped as soon as it passes `max_bytes`. Meta's own
        limit for an image is 5 MB."""
        headers = {"Authorization": f"Bearer {self._token}"}
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            found = await client.get(f"{self._base}/{media_id}")
            found.raise_for_status()
            info = found.json()
            if int(info.get("file_size") or 0) > max_bytes:
                raise ValueError("the file is larger than we accept")
            body = bytearray()
            async with client.stream("GET", info["url"]) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise ValueError("the file is larger than we accept")
            return bytes(body), info.get("mime_type", "")

    async def upload_media(self, from_number_id: str, data: bytes, content_type: str) -> str:
        """Upload a file with the Media API and return its media ID, which a message
        then refers to. Meta keeps it for 30 days. Checked against Meta's media page,
        17 Oct 2026: POST /{phone-number-id}/media with `messaging_product`, `type`
        and `file` as multipart form data."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self._base}/{from_number_id}/media",
                headers={"Authorization": f"Bearer {self._token}"},
                data={"messaging_product": "whatsapp", "type": content_type},
                files={"file": ("card.png" if content_type == "image/png" else "card.jpg",
                                data, content_type)},
            )
            response.raise_for_status()
            return response.json()["id"]
