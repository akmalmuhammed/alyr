"""What every step of a load shares (spec 063)."""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from alyr.core.media import MediaService
from alyr.db import Database
from alyr.demo.build import Made, Person, Refused  # noqa: F401 - the one refusal everywhere
from alyr.demo.model import Shop


@dataclass(frozen=True)
class Target:
    """The business the story is loaded into, as the command found it."""

    id: UUID
    name: str
    name_ar: str
    slug: str
    timezone: str
    business_type: str
    demo_data_allowed: bool
    owner_email: str
    owner_user_id: UUID | None


@dataclass
class Run:
    tenant: Target
    owner: Database  # the database owner: only what the product's role may not do
    app: Database  # the product's role: row-level security holds
    media: MediaService
    now: datetime  # the end of the story: the database's own clock at the start
    since: datetime  # the same moment: everything the product's services stamp is after it
    seed: int
    web_url: str
    photos: str  # "queue": the worker stores them; "now": stored here (local disk)
    sim_number: str = ""
    order_start: int = 1001  # the story's first order number (after any the business has)
    booking_start: int = 101
    renamed: dict | None = None
    shop: Shop | None = None
    made: Made | None = None
    story: object = None
    staff: dict[str, UUID] = field(default_factory=dict)  # member key -> user id
    emails: dict[str, str] = field(default_factory=dict)  # member key -> sign-in address
    names: dict[str, str] = field(default_factory=dict)  # email -> name
    names_ar: dict[str, str] = field(default_factory=dict)
    people: dict[str, Person] = field(default_factory=dict)  # customer name -> person
    assets: dict = field(default_factory=dict)
    created_numbers: list[str] = field(default_factory=list)  # private lines made
    created_users: list[str] = field(default_factory=list)  # staff addresses made
    changed: list[str] = field(default_factory=list)  # what it switched on, in words
    counts: dict = field(default_factory=dict)

    @property
    def id(self) -> UUID:
        return self.tenant.id

    def say(self, text: str) -> None:
        self.changed.append(text)
