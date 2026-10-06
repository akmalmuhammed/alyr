from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal, Protocol

MessageKind = Literal["text", "buttons", "list", "template"]
TemplateCategory = Literal["utility", "marketing", "authentication"]

MAX_BUTTONS = 3
MAX_LIST_ROWS = 10


@dataclass(frozen=True)
class InboundMessage:
    """A message from a customer, in the same shape whichever channel carried it."""

    channel: str
    message_id: str
    to_number_id: str
    from_number: str
    kind: str
    text: str = ""
    reply_id: str = ""
    received_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class Choice:
    id: str
    title: str


@dataclass(frozen=True)
class OutboundMessage:
    to_number: str
    kind: MessageKind = "text"
    body: str = ""
    choices: tuple[Choice, ...] = ()
    template_name: str = ""
    template_category: TemplateCategory | None = None

    def __post_init__(self) -> None:
        if self.kind == "buttons" and not 1 <= len(self.choices) <= MAX_BUTTONS:
            raise ValueError(f"buttons need 1 to {MAX_BUTTONS} choices")
        if self.kind == "list" and not 1 <= len(self.choices) <= MAX_LIST_ROWS:
            raise ValueError(f"lists need 1 to {MAX_LIST_ROWS} choices")
        if self.kind == "template" and not (self.template_name and self.template_category):
            raise ValueError("templates need a name and a category")


class Channel(Protocol):
    name: str

    async def send(self, from_number_id: str, message: OutboundMessage) -> None: ...
