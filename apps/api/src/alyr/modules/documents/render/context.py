"""What the PDF engine is given: a finished document as plain values, with no database and no
settings lookups behind it. The engine draws exactly this and nothing else, which is what
makes its output the same every time for the same input.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal


@dataclass(frozen=True)
class Bi:
    """A text in each language. Either may be empty."""

    ar: str = ""
    en: str = ""

    def get(self, lang: str) -> str:
        return self.ar if lang == "ar" else self.en


@dataclass(frozen=True)
class Party:
    """The seller or the customer, as written on the paper."""

    name: Bi = Bi()
    company: str = ""
    phone: str = ""
    email: str = ""
    address: Bi = Bi()
    registration: str = ""
    tax_id: str = ""
    licence: str = ""
    # The branch the paper is issued from, named (never for the main branch).
    branch: Bi = Bi()


@dataclass(frozen=True)
class Line:
    description: Bi
    sku: str
    quantity: Decimal
    unit: str
    unit_price: int
    discount: int
    tax_rate_bp: int
    net: int
    tax: int
    total: int


@dataclass(frozen=True)
class Payment:
    method: str
    amount: int
    reference: str = ""


@dataclass(frozen=True)
class Brand:
    """How this shop's documents look."""

    colour: str | None = None
    logo_png: bytes | None = None
    stamp_png: bytes | None = None
    show_sku: bool = False
    show_discounts: bool = True
    show_customer_tax_id: bool = True
    show_bank: bool = False
    show_signature: bool = False
    show_alyr_mark: bool = True
    bank_details: str = ""
    header: Bi = Bi()
    footer: Bi = Bi()


@dataclass(frozen=True)
class Doc:
    kind: str
    title: Bi
    # The languages on the page, the one it leads with first: ("ar", "en"), ("en",), ...
    languages: tuple[str, ...]
    layout: str  # a4, a5 or thermal80
    currency: str
    exponent: int
    seller: Party
    customer: Party
    lines: tuple[Line, ...]
    gross: int
    discount: int
    tax: int
    total: int
    paid: int
    balance: int
    # Cash rounding: its own line, a few minor units up or down, already in the total.
    rounding: int = 0
    # None for a preview: it has no number and says so.
    number: str | None = None
    issue_date: date | None = None
    # The second date, and which kind of date it is ("due_date" or "valid_until").
    second_date: date | None = None
    second_date_label: str | None = None
    payments: tuple[Payment, ...] = ()
    notes: Bi = Bi()
    terms: Bi = Bi()
    reason: str = ""
    # For a credit note: what it cancels.
    related_title: Bi = Bi()
    related_number: str = ""
    # The seller has no commercial registration number: the page says so.
    unregistered: bool = False
    # The shop's own system numbered this document; ALYR only delivers it, and says so (ALY-142).
    external: bool = False
    preview: bool = False
    # The first 16 hex digits of the content hash, printed so the paper can be checked.
    code: str = ""
    brand: Brand = field(default_factory=Brand)
    # The invoice's payment link, when it has one (ALY-141): drawn as a QR code in the corner
    # the layouts keep free, with "Scan to pay online" and the amount due beside it.
    pay_url: str = ""
    # Written into the PDF's own properties; the same input gives the same file.
    created: datetime | None = None

    @property
    def primary(self) -> str:
        return self.languages[0]

    @property
    def secondary(self) -> str | None:
        return self.languages[1] if len(self.languages) > 1 else None

    @property
    def rtl(self) -> bool:
        return self.languages[0] == "ar"
