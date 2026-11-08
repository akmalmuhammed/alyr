"""Where Discovery's facts come from. One interface, so a real source is a drop-in (spec 065).

`sample` is the only connector Phase 1 ships: a fictional business, no network. See
`specs/065-discovery/spec.md`, "As built", for why `places` is not here.
"""

from alyr.modules.discovery.connectors.base import (
    BudgetExceeded,
    Connector,
    ConnectorError,
    Hours,
    Listing,
    Location,
    PlaceSnapshot,
    Review,
    RunContext,
    Snapshot,
    Website,
)
from alyr.modules.discovery.connectors.sample import SampleConnector

# What a shop may turn on, in the order the screen offers them.
AVAILABLE: tuple[str, ...] = ("sample",)


def get(kind: str) -> Connector:
    """The connector for a kind a shop has switched on."""
    if kind == "sample":
        return SampleConnector()
    raise ConnectorError(
        "connector_unavailable",
        "That source is not available.",
        "هذا المصدر غير متاح.",
    )


__all__ = [
    "AVAILABLE",
    "BudgetExceeded",
    "Connector",
    "ConnectorError",
    "Hours",
    "Listing",
    "Location",
    "PlaceSnapshot",
    "Review",
    "RunContext",
    "SampleConnector",
    "Snapshot",
    "Website",
    "get",
]
