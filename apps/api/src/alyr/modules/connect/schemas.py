"""The shape of a connected sale: what another system sends (ALY-142, spec 015).

One model for the open API and for a CSV import, so a sale from a file is checked by exactly the
rules a sale from a till is. Strict on purpose: an unknown field is refused (a misspelt
`unit_price_minor` must not be quietly ignored), money is a whole number of the currency's
smallest unit (`10.5` is refused, not rounded), and every text has a limit. The body as a whole
is limited to 512 KB and 200 lines by the route and by this model.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt

from alyr.modules.documents import money

Minor = Annotated[StrictInt, Field(ge=0, le=money.MAX_MINOR,
                                   description="Whole minor units: 100 is QAR 1.00")]
Kind = Literal["receipt", "invoice", "quote", "proforma", "delivery_note", "credit_note",
               "deposit_receipt"]
Method = Literal["cash", "card", "bank_transfer", "link", "credit", "cheque", "other"]
Unit = Literal["piece", "kg", "g", "l", "m", "box", "pack", "portion", "hour", "day", "service"]
MAX_LINES = 200
MAX_BODY_BYTES = 512 * 1024


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CustomerIn(Strict):
    phone: str = Field(min_length=1, max_length=40,
                       description="International format: +97455550123")
    name: str = Field(default="", max_length=120)
    name_ar: str = Field(default="", max_length=120)
    company: str = Field(default="", max_length=120)
    tax_id: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=300)
    address_ar: str = Field(default="", max_length=300)


class LineIn(Strict):
    description: str = Field(default="", max_length=300)
    description_ar: str = Field(default="", max_length=300)
    sku: str = Field(default="", max_length=40)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unit: Unit = "piece"
    unit_price_minor: Minor
    discount_minor: Minor = 0
    tax_rate_bp: StrictInt = Field(default=0, ge=0, le=10000, description="500 is 5%")


class TotalsIn(Strict):
    total_minor: Minor = Field(description="What the other system printed as the total")
    tax_minor: Minor | None = None
    discount_minor: Minor | None = None
    rounding_minor: StrictInt | None = Field(
        default=None, ge=-1000, le=1000,
        description="The other system's own cash rounding line, already in the total")


class PaymentIn(Strict):
    method: Method
    amount_minor: Annotated[StrictInt, Field(gt=0, le=money.MAX_MINOR)]
    reference: str = Field(default="", max_length=80)
    paid_at: datetime | None = None


class SaleIn(Strict):
    external_sale_id: str = Field(min_length=1, max_length=120,
                                  description="The other system's own ID for this sale")
    kind: Kind = "receipt"
    external_document_number: str | None = Field(
        default=None, max_length=80,
        description="The number the other system gave the document (required when it numbers "
                    "this kind)")
    credits_sale_id: str | None = Field(
        default=None, max_length=120,
        description="For a credit note: the external_sale_id of the sale it credits")
    reason: str = Field(default="", max_length=300)
    customer: CustomerIn
    lines: list[LineIn] = Field(min_length=1, max_length=MAX_LINES)
    totals: TotalsIn
    payment: PaymentIn | Literal["unpaid"] | None = None
    currency: str | None = Field(default=None, pattern="^[A-Z]{3}$")
    branch: str = Field(default="main", pattern="^[a-z0-9]{1,12}$")
    language: Literal["ar", "en"] | None = Field(
        default=None, description="The customer's language, for the message (a hint)")
    sold_at: datetime | None = None
    due_date: date | None = None
    send: bool | None = Field(
        default=None, description="true: send it to the customer on WhatsApp now; false: do "
        "not; leave out to follow the shop's settings")
