"""What a demo shop is made of, as plain data (ALY-110).

Each demo shop lives in one file under `demo/shops/` and says, in both languages, what the
shop sells, who buys, and how busy it is. `seed_catalog_demos` turns that into rows through
the real services (items, groups, photos) and a believable fortnight of orders and stock
movements (`history.py`). Every name is invented: people go by a first name and an initial,
the way a shop saves them in its phone, and no business is a real one.
"""

from dataclasses import dataclass, field
from uuid import UUID

from alyr.presets_catalog import Choice

__all__ = ["Choice", "Customer", "Product", "Shop", "Size", "qar"]


def qar(riyals: float) -> int:
    """Dirhams from riyals: prices in the data read like prices."""
    return round(riyals * 100)


@dataclass(frozen=True)
class Size:
    """A size, colour or pack of one item. `stock` is the opening count (counted items) or
    the number a day (daily-limit items)."""

    name: str
    name_ar: str
    delta: int = 0  # dirhams added to the item's price
    stock: int = 0
    sku: str = ""
    own_photo: bool = False  # a colour with its own tile
    end: int | None = None  # how many are left at the end of the fortnight (0: sold out)


@dataclass(frozen=True)
class Product:
    key: str  # unique in the shop; draws the tile
    name: str
    name_ar: str
    category: str  # the English name of one of the shop's categories
    price: int  # dirhams
    motif: str = "dots"
    desc: str = ""
    desc_ar: str = ""
    unit: str = "piece"
    rule: str = ""  # empty: the shop type's rule (always, switch, count, daily_limit)
    stock: int = 0  # opening count of a counted item with no sizes
    daily: int | None = None  # the number a day of a daily-limit item with no sizes
    sizes: tuple[Size, ...] = ()
    choices: tuple[Choice, ...] = ()
    tags: tuple[str, ...] = ()
    sku: str = ""
    pack: int | None = None
    min_order: int = 1
    sale: tuple[int, int] | None = None  # (sale price in dirhams, days the sale still runs)
    lead: tuple[int, str] | None = None  # ordered for a date: (days ahead, last time of day)
    window: tuple[str, str] | None = None  # the hours it can be ordered ("07:00", "11:30")
    groups: tuple[tuple[str, int], ...] = ()  # (price group key, that group's price)
    pop: int = 5  # how often it sells, 0 to 10
    state: str = ""  # "", "sold_out", "low", "hidden", "draft"
    photo: bool = True
    low_at: int | None = None  # the item's own low-stock number


@dataclass(frozen=True)
class Customer:
    name: str  # as the shop saved it (Arabic for a customer who writes in Arabic)
    lang: str = "en"
    kind: str = "regular"  # regular | occasional | new | account
    group: str = ""  # price group key; empty is the default group
    credit: int = 0  # credit limit in dirhams; above zero may order on account


@dataclass(frozen=True)
class Shop:
    key: str  # restaurant, bakery, ...
    slug: str
    tenant_id: UUID
    name: str
    name_ar: str
    kind: str  # the business type in presets.py
    area: str
    hue: int  # the shop's colour, in degrees, for its tiles
    whatsapp: str  # the shop's own number, fictional: where a public link sends a customer
    owner: tuple[str, str, str]  # email, name, Arabic name
    agent: tuple[str, str, str]
    products: tuple[Product, ...]
    customers: tuple[Customer, ...] = ()
    groups: tuple[tuple[str, str, str], ...] = ()  # (key, name, Arabic name) besides the default
    extra_categories: tuple[tuple[str, str], ...] = ()
    orders_a_day: float = 8.0
    lines: tuple[int, int] = (1, 3)  # how many different items a basket holds, at least and most
    open_hours: tuple[int, int] = (9, 22)  # when customers order
    day_starts: str = "00:00"  # when the shop's day begins (a daily limit starts again)
    # Appointment businesses: bookings a day instead of orders.
    bookings_a_day: float = 0.0
    notes: dict = field(default_factory=dict)

    @property
    def login(self) -> str:
        return self.owner[0]
