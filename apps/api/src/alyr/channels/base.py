from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal, Protocol
from uuid import UUID

MessageKind = Literal["text", "buttons", "list", "template", "image", "document"]
TemplateCategory = Literal["utility", "marketing", "authentication"]

MAX_BUTTONS = 3
MAX_LIST_ROWS = 10
# WhatsApp's limit on the text under an image.
MAX_CAPTION = 1024


@dataclass(frozen=True)
class InboundMessage:
    """A message from a customer, in the same shape whichever channel carried it.

    `from_user_id` is WhatsApp's business-scoped user ID. `from_number` can be empty:
    a customer who uses a WhatsApp username may not expose a phone number.

    A photo arrives as kind "image": `media_id` is the channel's name for the file (fetched
    with `Channel.download_media`), `mime_type` what the sender's phone says it is, and
    `text` the caption, if any.
    """

    channel: str
    message_id: str
    to_number_id: str
    kind: str
    from_number: str = ""
    from_user_id: str = ""
    username: str = ""
    profile_name: str = ""
    text: str = ""
    reply_id: str = ""
    media_id: str = ""
    mime_type: str = ""
    received_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        if not (self.from_number or self.from_user_id):
            raise ValueError("an inbound message needs a phone number or a user id")


@dataclass(frozen=True)
class Choice:
    """A button or a row of a list. `description` is the grey line under a list row's title
    (72 characters at most); buttons have none."""

    id: str
    title: str
    description: str = ""


@dataclass(frozen=True)
class OutboundMessage:
    """What a module wants to say, addressed to a contact. The outbound layer turns the
    contact into a phone number or user ID; modules never handle either."""

    to: UUID
    kind: MessageKind = "text"
    body: str = ""
    choices: tuple[Choice, ...] = ()
    template_name: str = ""
    template_category: TemplateCategory | None = None
    # The values for the template's numbered blanks, and the language to send it in.
    template_params: tuple[str, ...] = ()
    lang: str = "en"
    # A picture to go with the message: an image whose caption is `body`, the header of a
    # message with buttons, or the image header of a template that has one. The outbound
    # layer keeps it beside the message, and the delivering job uploads it to the channel
    # and sets `media_id`. A PNG unless `image_type` says JPEG (WhatsApp takes no WebP).
    image: bytes = b""
    image_type: str = "image/png"
    media_id: str = ""
    # A file to go with the message (ALY-139): a PDF sent as a document with `body` as its
    # caption, or the document header of a template that has one. Kept and uploaded like an
    # image. `filename` is what the customer's phone shows, with its extension.
    document: bytes = b""
    filename: str = ""

    def __post_init__(self) -> None:
        if self.kind == "buttons" and not 1 <= len(self.choices) <= MAX_BUTTONS:
            raise ValueError(f"buttons need 1 to {MAX_BUTTONS} choices")
        if self.kind == "list" and not 1 <= len(self.choices) <= MAX_LIST_ROWS:
            raise ValueError(f"lists need 1 to {MAX_LIST_ROWS} choices")
        if self.kind == "template" and not (self.template_name and self.template_category):
            raise ValueError("templates need a name and a category")
        if self.image_type not in ("image/png", "image/jpeg"):
            raise ValueError("WhatsApp takes a PNG or a JPEG")
        if self.kind == "image" and not (self.image or self.media_id):
            raise ValueError("an image message needs an image")
        if self.kind == "image" and len(self.body) > MAX_CAPTION:
            raise ValueError(f"an image caption is at most {MAX_CAPTION} characters")
        if self.kind == "document":
            if not (self.document or self.media_id):
                raise ValueError("a document message needs a file")
            if len(self.body) > MAX_CAPTION:
                raise ValueError(f"a document caption is at most {MAX_CAPTION} characters")
        if self.document and not self.filename:
            raise ValueError("a document needs a file name")
        if self.filename and ("/" in self.filename or "\\" in self.filename
                              or not self.filename.lower().endswith(".pdf")):
            raise ValueError("a document's file name is a plain name ending in .pdf")


@dataclass(frozen=True)
class Address:
    """Where a channel delivers: a phone number when we have one, otherwise the user ID."""

    phone: str | None = None
    user_id: str | None = None

    def __post_init__(self) -> None:
        if not (self.phone or self.user_id):
            raise ValueError("an address needs a phone number or a user id")


class Channel(Protocol):
    name: str

    async def send(
        self, from_number_id: str, message: OutboundMessage, address: Address
    ) -> str | None:
        """Deliver the message. Return the channel's own ID for it, if it has one, so
        later delivery reports can be matched to it."""
        ...

    async def upload_media(self, from_number_id: str, data: bytes, content_type: str) -> str:
        """Store a file with the channel and return the ID a message refers to it by."""
        ...

    async def download_media(self, media_id: str, max_bytes: int) -> tuple[bytes, str]:
        """Fetch a file a customer or staff member sent, by the ID the inbound message
        carried. Returns its bytes and type. Raises if it is larger than `max_bytes`."""
        ...
