from alyr.channels.base import Address, OutboundMessage

SIMULATOR_NUMBER_ID = "sim-al-noor"


class SimulatorChannel:
    """Stands in for WhatsApp. Nothing leaves the machine: the chat page reads the
    conversation from the messages table, which the outbound layer writes for every channel."""

    name = "simulator"

    async def send(
        self, from_number_id: str, message: OutboundMessage, address: Address
    ) -> None:
        return None
