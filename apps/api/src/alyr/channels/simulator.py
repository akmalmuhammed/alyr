import hashlib

from alyr.channels.base import Address, OutboundMessage

SIMULATOR_NUMBER_ID = "sim-al-noor"


class SimulatorChannel:
    """Stands in for WhatsApp. Nothing leaves the machine: the chat page reads the
    conversation from the messages table, which the outbound layer writes for every channel.

    A photo "sent" from the simulator is kept in `inbox` under the ID the inbound message
    carries, and `download_media` hands it back, the way Meta's Media API would."""

    name = "simulator"

    def __init__(self) -> None:
        self.inbox: dict[str, tuple[bytes, str]] = {}

    def keep(self, media_id: str, data: bytes, content_type: str) -> None:
        self.inbox[media_id] = (data, content_type)

    async def download_media(self, media_id: str, max_bytes: int) -> tuple[bytes, str]:
        if media_id not in self.inbox:
            raise LookupError("no such file")
        data, content_type = self.inbox[media_id]
        if len(data) > max_bytes:
            raise ValueError("the file is larger than we accept")
        return data, content_type

    async def send(
        self, from_number_id: str, message: OutboundMessage, address: Address
    ) -> str | None:
        return None

    async def upload_media(self, from_number_id: str, data: bytes, content_type: str) -> str:
        # Nothing leaves the machine; the image stays in `message_media`.
        return f"sim-{hashlib.sha256(data).hexdigest()[:16]}"
