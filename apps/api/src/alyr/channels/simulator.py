from collections import defaultdict

from alyr.channels.base import OutboundMessage

SIMULATOR_NUMBER_ID = "sim-al-noor"


class SimulatorChannel:
    """Stands in for WhatsApp. Outbound messages are kept in memory for the chat page to read."""

    name = "simulator"

    def __init__(self) -> None:
        self._sent: dict[str, list[OutboundMessage]] = defaultdict(list)

    async def send(self, from_number_id: str, message: OutboundMessage) -> None:
        self._sent[message.to_number].append(message)

    def sent_to(self, number: str) -> list[OutboundMessage]:
        return list(self._sent[number])

    def reset(self) -> None:
        self._sent.clear()
