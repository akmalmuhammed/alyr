import hashlib

from alyr.channels.base import Address, OutboundMessage

SIMULATOR_NUMBER_ID = "sim-al-noor"


class SimulatorChannel:
    """Stands in for WhatsApp. Nothing leaves the machine: the chat page reads the
    conversation from the messages table, which the outbound layer writes for every channel."""

    name = "simulator"

    async def send(
        self, from_number_id: str, message: OutboundMessage, address: Address
    ) -> str | None:
        return None

    async def upload_media(self, from_number_id: str, data: bytes, content_type: str) -> str:
        # Nothing leaves the machine; the image stays in `message_media`.
        return f"sim-{hashlib.sha256(data).hexdigest()[:16]}"
