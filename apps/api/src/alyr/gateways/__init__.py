"""Payment providers (ALY-17, specs/033-payment-adapters): one adapter each, the same interface
(`base.Gateway`). A new provider is a new file here and a line in `registry`; no module
changes."""

from alyr.config import Settings
from alyr.gateways.base import Gateway
from alyr.gateways.simulator import SimulatorGateway


def registry(settings: Settings) -> dict[str, Gateway]:
    """The providers this server may use. Outside a developer machine only live ones: none
    yet, so every shop keeps the stand-in pay page until the first real adapter lands."""
    every: list[Gateway] = [SimulatorGateway()]
    local = settings.env == "local"
    return {g.name: g for g in every if g.live or local}
