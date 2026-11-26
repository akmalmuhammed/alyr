"""Where Discovery's facts come from, and where a change goes. One interface, so a real source is a
drop-in (spec 065, spec 066).

Two connectors exist. `sample` is a fictional business, no network: it reads and, since Phase 2,
writes (`WritableConnector`: the owner's approval changes the made-up listing inside ALYR), and
only a demo shop may turn it on. `manual` (D-169) is what ALYR staff recorded on a remote audit of a
real business: it reads only, makes no proposal, and only ALYR staff switch it on, from the back
office, for one business. See `specs/065-discovery/spec.md`, "As built", for why `places` is not
here.

**`website` (Discovery 2.0) is not a connection but an addition** (`extras_for`): for every place
with a website address, a check-up also reads the business's own site (robots.txt honoured, its own
host only, at most 20 pages, no form) and joins what it says to the connection's snapshot with
`merge`. It is the one file of `modules/discovery` that reaches outside ALYR, and it only reads.

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
from alyr.modules.discovery.connectors.manual import ManualConnector
from alyr.modules.discovery.connectors.sample import SampleConnector
from alyr.modules.discovery.connectors.website import SiteWebsite, WebsiteConnector, merge

# What a shop may turn on, in the order the screen offers them.
AVAILABLE: tuple[str, ...] = ("sample",)
# What only ALYR staff turn on, from the back office (`routes/admin_discovery.py`), for one
# business.
# No owner, admin or app door offers it.
STAFF_ONLY: tuple[str, ...] = ("manual",)


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
    if kind == "manual":
        return ManualConnector()
    raise ConnectorError(
        "connector_unavailable",
        "That source is not available.",
        "هذا المصدر غير متاح.",
    )


def extras_for(kind: str, locations: list[Location]) -> tuple[Connector, ...]:
    """The sources a check-up adds to its connection's snapshot (Discovery 2.0): the business's own
    website (`website.py`), read for every place that has a website address, whatever the
    connection. Never for the fictional `sample` business: its addresses are made up, and a made-up
    address may be someone's real site. The engine reads each one after the connection's snapshot
    and joins it with `merge`, which keeps what the connection already said."""
    if kind == "sample":
        return ()
    if any((location.website_url or "").strip() for location in locations):
        return (WebsiteConnector(),)
    return ()


__all__ = [
    "AVAILABLE",
    "STAFF_ONLY",
    "available_for",
    "BudgetExceeded",
    "Change",
    "Connector",
    "ConnectorError",
    "Hours",
    "Listing",
    "Location",
    "ManualConnector",
    "PlaceSnapshot",
    "Receipt",
    "Review",
    "RunContext",
    "SampleConnector",
    "SiteWebsite",
    "Snapshot",
    "StateStore",
    "WebsiteConnector",
    "WritableConnector",
    "Website",
    "WriteContext",
    "WriteError",
    "extras_for",
    "get",
    "merge",
]
