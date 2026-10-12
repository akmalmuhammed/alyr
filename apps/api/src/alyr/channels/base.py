from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal, Protocol
from uuid import UUID

MessageKind = Literal["text", "buttons", "list", "template"]
TemplateCategory = Literal["utility", "marketing", "authentication"]

MAX_BUTTONS = 3
MAX_LIST_ROWS = 10


@dataclass(frozen=True)
class InboundMessage:
    """A message from a customer, in the same shape whichever channel carried it.

    `from_user_id` is WhatsApp's business-scoped user ID. `from_number` can be empty:
    a customer who uses a WhatsApp username may not expose a phone number.
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
    received_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        if not (self.from_number or self.from_user_id):
            raise ValueError("an inbound message needs a phone number or a user id")


@dataclass(frozen=True)
class Choice:
    id: str
    title: str


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

    def __post_init__(self) -> None:
        if self.kind == "buttons" and not 1 <= len(self.choices) <= MAX_BUTTONS:
            raise ValueError(f"buttons need 1 to {MAX_BUTTONS} choices")
        if self.kind == "list" and not 1 <= len(self.choices) <= MAX_LIST_ROWS:
            raise ValueError(f"lists need 1 to {MAX_LIST_ROWS} choices")
        if self.kind == "template" and not (self.template_name and self.template_category):
            raise ValueError("templates need a name and a category")


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
