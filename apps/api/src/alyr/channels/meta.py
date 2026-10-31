"""Meta's WhatsApp Cloud API.

Field names follow Meta's documentation for business-scoped user IDs, checked 7 Oct 2026:
https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/
"""

import asyncio
import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit

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


@dataclass(frozen=True)
class AccountEvent:
    """One change Meta reports about a WhatsApp Business Account (not about a message): a
    template's status, a number's limit, an account restriction. `waba_id` is the account the
    notice is about (`entry.id`); `value` is Meta's own payload for the field, untouched, and
    `core/whatsapp_events.py` reads it. Fields checked against Meta's webhook reference pages,
    31 Oct 2026 (linked from docs/runbooks/whatsapp-line.md)."""

    waba_id: str
    field: str
    value: dict
    time: int = 0


ACCOUNT_FIELDS = frozenset({
    "message_template_status_update", "template_category_update", "message_template_quality_update",
    "phone_number_quality_update", "phone_number_name_update", "account_update", "account_alerts",
    "account_review_update",
})


def parse_account_events(payload: dict) -> list[AccountEvent]:
    found: list[AccountEvent] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            field, value = change.get("field", ""), change.get("value")
            if field in ACCOUNT_FIELDS and isinstance(value, dict) and entry.get("id"):
                found.append(AccountEvent(
                    waba_id=str(entry["id"]), field=field, value=value,
                    time=int(entry.get("time") or 0)))
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
    if message.kind == "document":
        # A file uploaded with the Media API and named by its ID (Meta advises an uploaded ID
        # over a hosted link, and our PDFs are private, so there is no link to give). The
        # file name is what the phone shows; the caption is at most 1,024 characters.
        document = {"id": message.media_id}
        if message.filename:
            document["filename"] = message.filename
        if message.body:
            document["caption"] = message.body
        return base | {"type": "document", "document": document}
    template: dict = {
        "name": message.template_name,
        "language": {"code": "ar" if message.lang == "ar" else "en"},
    }
    components = []
    if message.media_id and message.filename:
        # The template's document header (a receipt or invoice PDF), uploaded at send time.
        components.append({"type": "header", "parameters": [
            {"type": "document", "document": {"id": message.media_id,
                                              "filename": message.filename}}
        ]})
    elif message.media_id:
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


# Where Meta serves a file that was sent to us: the media page gives the address as a
# placeholder, and the addresses it answers with are on lookaside.fbsbx.com. The access token
# goes with the download, so it goes only to Meta's own domains, over https (ALY-278).
MEDIA_HOSTS = ("fbsbx.com", "facebook.com", "whatsapp.net")


def is_meta_media_url(url: object) -> bool:
    if not isinstance(url, str):
        return False
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and any(
        host == domain or host.endswith("." + domain) for domain in MEDIA_HOSTS
    )


# What the line check asks Meta about a number (spec 060). Every one of these is on Meta's
# phone number page; the quality rating and the name's status are what the health screen shows.
NUMBER_BASIC_FIELDS = (
    "display_phone_number,verified_name,status,quality_rating,name_status,code_verification_status"
)


# What the health read asks for besides the basics: the messaging limit (the field Meta's messaging
# limits page names; `messaging_limit_tier` is deprecated), the throughput level and the health
# status (Meta's health status page). Meta fails the whole request when it does not know a field, so
# `number_health` asks again for the basics when it is refused.
HEALTH_FIELDS = (
    NUMBER_BASIC_FIELDS + ",whatsapp_business_manager_messaging_limit,throughput,health_status"
)


def error_code(error: Exception) -> int:
    """Meta's own error code from a refused request, or 0."""
    if isinstance(error, httpx.HTTPStatusError):
        try:
            return int(error.response.json()["error"]["code"])
        except (ValueError, KeyError, TypeError):
            return 0
    return 0


def describe_error(error: Exception) -> str:
    """A refused request to Meta in words a member of staff can act on, without anything
    secret in it. Meta's error codes, from its error codes page: 190 the access token is
    wrong or expired, 10 and 200 to 299 a permission is missing, 100 a field or ID Meta does
    not know, 4, 17, 32, 613 and 80007 too many requests."""
    if isinstance(error, httpx.HTTPStatusError):
        try:
            body = error.response.json()["error"]
            code = int(body.get("code", 0))
            text = str(body.get("error_user_msg") or body.get("message", ""))[:200]
        except (ValueError, KeyError, TypeError):
            return f"Meta answered error {error.response.status_code}"
        if code == 190:
            return ("Meta refused ALYR's access token (it is wrong or has expired); "
                    "docs/runbooks/secret-rotation.md says how to replace it")
        if code == 10 or 200 <= code <= 299:
            return f"ALYR's access token lacks a permission for this account ({text})"
        if code in (4, 17, 32, 613, 80007):
            return "Meta says there were too many requests; try again in a few minutes"
        return text or f"Meta answered error {error.response.status_code}"
    if isinstance(error, httpx.TimeoutException):
        return "Meta did not answer in time"
    if isinstance(error, httpx.HTTPError):
        return "Meta could not be reached"
    return type(error).__name__


class MetaChannel:
    name = "meta"

    def __init__(
        self, access_token: str, graph_version: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._token = access_token
        self._base = f"https://graph.facebook.com/{graph_version}"
        self._transport = transport
        self._client: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _http(self) -> httpx.AsyncClient:
        """One client for every call, so the connection to Meta stays open from one send to
        the next: a client per send paid a new TLS handshake every time (ALY-276). A client
        belongs to the event loop it was made in; a test that runs another loop gets its own."""
        loop = asyncio.get_running_loop()
        if self._client is None or self._loop is not loop:
            more = {"transport": self._transport} if self._transport is not None else {}
            self._client = httpx.AsyncClient(
                timeout=30,
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10), **more,
            )
            self._loop = loop
        return self._client

    async def close(self) -> None:
        if self._client is not None and self._loop is asyncio.get_running_loop():
            await self._client.aclose()
        self._client = None

    async def send(
        self, from_number_id: str, message: OutboundMessage, address: Address
    ) -> str | None:
        response = await self._http().post(
            f"{self._base}/{from_number_id}/messages",
            headers={"Authorization": f"Bearer {self._token}"},
            json=to_graph_payload(message, address),
            timeout=10,
        )
        response.raise_for_status()
        sent = response.json().get("messages") or [{}]
        return sent[0].get("id")

    async def number_info(self, number_id: str) -> dict:
        """What Meta says about one of our WhatsApp numbers, for attaching it to a business
        (ALY-166). Checked against Meta's phone number page, 25 Oct 2026:
        GET /{phone-number-id}?fields=... answers with the number as customers see it, the
        name Meta verified, and `status` (CONNECTED once the number is registered)."""
        response = await self._http().get(
            f"{self._base}/{number_id}",
            headers={"Authorization": f"Bearer {self._token}"},
            params={"fields": "display_phone_number,verified_name,status,quality_rating"},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    async def _read(self, path: str, params: dict | None = None) -> dict:
        response = await self._http().get(
            f"{self._base}/{path}",
            headers={"Authorization": f"Bearer {self._token}"},
            params=params or {}, timeout=10,
        )
        response.raise_for_status()
        return response.json()

    async def number_details(self, number_id: str, fields: str) -> dict:
        """Named fields of one WhatsApp number, for the line check and the health poll
        (spec 060, spec 062). Meta fails the whole request when it does not know one of the
        fields, so a caller that wants more than `NUMBER_BASIC_FIELDS` asks again with those
        when it is refused. Fields checked against Meta's phone number, messaging limits,
        throughput and health status pages, 31 Oct 2026."""
        return await self._read(number_id, {"fields": fields})

    async def number_health(self, number_id: str) -> dict:
        """The number's status, quality rating and name status, and, where Meta will say, its
        messaging limit, throughput and health. A read."""
        try:
            return await self.number_details(number_id, HEALTH_FIELDS)
        except httpx.HTTPStatusError as error:
            if error_code(error) != 100:
                raise
        return await self.number_details(number_id, NUMBER_BASIC_FIELDS)

    async def account_number_ids(self, waba_id: str) -> list[str]:
        """The IDs of every number on a WhatsApp Business Account: GET /{waba-id}/phone_numbers
        (Meta's phone number page, 31 Oct 2026), paged by cursor, at most 2,000 numbers."""
        found: list[str] = []
        after = ""
        for _ in range(10):
            page = await self._read(
                f"{waba_id}/phone_numbers", {"fields": "id", "limit": 200}
                | ({"after": after} if after else {}))
            found += [str(n["id"]) for n in page.get("data", []) if n.get("id")]
            after = page.get("paging", {}).get("cursors", {}).get("after", "")
            if not (after and page.get("paging", {}).get("next")):
                break
        return found

    async def subscribed_app_ids(self, waba_id: str) -> list[str]:
        """The apps subscribed to a WhatsApp Business Account's webhooks:
        GET /{waba-id}/subscribed_apps answers `data[].whatsapp_business_api_data.id`
        (Meta's manage-webhooks page, 31 Oct 2026). Empty means no webhook reaches us."""
        answer = await self._read(f"{waba_id}/subscribed_apps")
        return [
            str(entry["whatsapp_business_api_data"]["id"])
            for entry in answer.get("data", [])
            if entry.get("whatsapp_business_api_data", {}).get("id")
        ]

    # ── message templates of an account (spec 061) ──────────────────────────────────────────
    # Checked against Meta's template management page, 31 Oct 2026: the list takes `fields`,
    # `limit` and paging; creating is POST /{waba-id}/message_templates with `name`,
    # `language`, `category` and `components`; editing is POST /{template-id} with `components`
    # (only an approved, rejected or paused template can be edited).

    async def list_templates(self, waba_id: str) -> list[dict]:
        found: list[dict] = []
        after = ""
        for _ in range(20):
            page = await self._read(f"{waba_id}/message_templates", {
                "fields": "id,name,language,status,category,rejected_reason", "limit": 200,
            } | ({"after": after} if after else {}))
            found += page.get("data", [])
            after = page.get("paging", {}).get("cursors", {}).get("after", "")
            if not (after and page.get("paging", {}).get("next")):
                break
        return found

    async def _write(self, path: str, body: dict) -> dict:
        response = await self._http().post(
            f"{self._base}/{path}", headers={"Authorization": f"Bearer {self._token}"},
            json=body, timeout=30,
        )
        response.raise_for_status()
        return response.json()

    async def create_template(self, waba_id: str, body: dict) -> dict:
        """Submit a new template. Answers `id`, `status` (PENDING) and `category`."""
        return await self._write(f"{waba_id}/message_templates", body)

    async def edit_template(self, template_id: str, components: list[dict]) -> dict:
        return await self._write(template_id, {"components": components})

    async def upload_template_sample(
        self, app_id: str, filename: str, data: bytes, content_type: str
    ) -> str:
        """The handle Meta reviews a template's sample header with (Resumable Upload API, as
        `templates_sync.header_handle` has always done it): start an upload session on the app,
        then send the file's bytes. Meta's guide, checked 17 Oct 2026."""
        headers = {"Authorization": f"Bearer {self._token}"}
        started = await self._http().post(
            f"{self._base}/{app_id}/uploads", headers=headers,
            params={"file_name": filename, "file_length": len(data), "file_type": content_type},
        )
        started.raise_for_status()
        sent = await self._http().post(
            f"{self._base}/{started.json()['id']}", content=data,
            headers={"Authorization": f"OAuth {self._token}", "file_offset": "0"},
        )
        sent.raise_for_status()
        return sent.json()["h"]

    async def download_media(self, media_id: str, max_bytes: int) -> tuple[bytes, str]:
        """Fetch a file that was sent to us. Two requests, checked against Meta's media
        page on 18 Oct 2026: GET /{media-id} answers with a `url` (good for five minutes)
        and the type; GET that url, with the access token, answers with the file. The
        file is read in pieces and dropped as soon as it passes `max_bytes`. Meta's own
        limit for an image is 5 MB. The second request goes only to Meta (`MEDIA_HOSTS`)."""
        headers = {"Authorization": f"Bearer {self._token}"}
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            found = await client.get(f"{self._base}/{media_id}")
            found.raise_for_status()
            info = found.json()
            if int(info.get("file_size") or 0) > max_bytes:
                raise ValueError("the file is larger than we accept")
            if not is_meta_media_url(info.get("url")):
                raise ValueError("the file's address is not one of Meta's")
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
        response = await self._http().post(
            f"{self._base}/{from_number_id}/media",
            headers={"Authorization": f"Bearer {self._token}"},
            data={"messaging_product": "whatsapp", "type": content_type},
            files={"file": (
                {"image/png": "card.png", "application/pdf": "document.pdf"}.get(
                    content_type, "card.jpg"),
                data, content_type)},
        )
        response.raise_for_status()
        return response.json()["id"]
