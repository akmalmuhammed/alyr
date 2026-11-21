"""Where Discovery's facts come from, and where a change goes. One interface, so a real source is a
drop-in (spec 065, spec 066).

`sample` is the only connector there is: a fictional business, no network. It reads and, since
Phase 2, writes (`WritableConnector`: the owner's approval changes the made-up listing inside ALYR).
See `specs/065-discovery/spec.md`, "As built", for why `places` is not here.

**`google_business_profile` (kind `gbp`) is an interface and nothing more.** It will implement
`WritableConnector` against Google's Business Profile APIs once ALYR has Google's access (ALY-325,
the founder's application); what it needs is written in `specs/066-discovery-approvals/spec.md`.
There is no class, no settings key, no screen and no network call for it: `gbp` is allowed by the
database's check constraints and is not in `AVAILABLE`, so no shop can turn it on, and `get("gbp")`
refuses.
"""

from alyr.modules.discovery.connectors.base import (
    BudgetExceeded,
    Change,
    Connector,
    ConnectorError,
    Hours,
    Listing,
    Location,
    PlaceSnapshot,
    Receipt,
    Review,
    RunContext,
    Snapshot,
    StateStore,
    Website,
    WritableConnector,
    WriteContext,
    WriteError,
)
from alyr.modules.discovery.connectors.sample import SampleConnector

# What a shop may turn on, in the order the screen offers them.
AVAILABLE: tuple[str, ...] = ("sample",)


def available_for(demo: bool) -> tuple[str, ...]:
    """What THIS shop may turn on. The sample is a made-up business ("Nuqta Car Care", five
    branches, invented hours and reviews): it is offered only to a shop ALYR staff marked as a
    demo or test business in `/ops` (`tenants.demo_data_allowed`, D-169). A real shop is offered
    nothing here: its source is set up by ALYR."""
    return AVAILABLE if demo else ()


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
    "available_for",
    "BudgetExceeded",
    "Change",
    "Connector",
    "ConnectorError",
    "Hours",
    "Listing",
    "Location",
    "PlaceSnapshot",
    "Receipt",
    "Review",
    "RunContext",
    "SampleConnector",
    "Snapshot",
    "StateStore",
    "WritableConnector",
    "Website",
    "WriteContext",
    "WriteError",
    "get",
]
