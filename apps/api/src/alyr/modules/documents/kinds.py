"""The kinds of document, and what each one asks for.

Eight kinds share one engine and one table. What differs is small and written here, so the
service has no `if kind == ...` ladder: a kind says whether it needs a named customer, whether
the seller must have a commercial registration number, how it treats money received, and what
its second date means.
"""

from dataclasses import dataclass

# How a kind treats payments received:
#   full      the money has been paid in full (a receipt)
#   deposit   some money has been received, the document says how much
#   optional  none, part or all may have been paid (an invoice)
#   none      no payment is recorded on this kind
FULL, DEPOSIT, OPTIONAL, NONE = "full", "deposit", "optional", "none"


@dataclass(frozen=True)
class Kind:
    key: str
    prefix: str
    needs_customer: bool
    # The seller must have a commercial registration number to issue this kind.
    needs_registration: bool
    payments: str
    # What the second date is called: "due_date" (an invoice), "valid_until" (a quote), or None.
    second_date: str | None = None
    # A delivery note may carry no prices at all.
    allows_zero_total: bool = False
    # The kinds a credit note can cancel.
    creditable: bool = False
    needs_reason: bool = False


KINDS: dict[str, Kind] = {
    k.key: k for k in (
        Kind("receipt", "RC", needs_customer=False, needs_registration=False, payments=FULL,
             creditable=True),
        Kind("invoice", "INV", needs_customer=True, needs_registration=True, payments=OPTIONAL,
             second_date="due_date", creditable=True),
        Kind("quote", "QT", needs_customer=True, needs_registration=False, payments=NONE,
             second_date="valid_until"),
        Kind("delivery_note", "DN", needs_customer=True, needs_registration=False,
             payments=NONE, allows_zero_total=True),
        Kind("statement", "ST", needs_customer=True, needs_registration=False, payments=OPTIONAL,
             allows_zero_total=True),
        # A credit note copies its customer from the document it cancels (which may be a
        # walk-in receipt with no name), so it asks for none of its own.
        Kind("credit_note", "CN", needs_customer=False, needs_registration=False, payments=NONE,
             needs_reason=True),
        Kind("deposit_receipt", "DR", needs_customer=True, needs_registration=False,
             payments=DEPOSIT, creditable=True),
        Kind("proforma", "PF", needs_customer=True, needs_registration=True, payments=NONE,
             second_date="valid_until"),
    )
}
KIND_KEYS = tuple(KINDS)

LAYOUTS = ("a4", "a5", "thermal80")
LANGUAGES = ("ar_en", "en_ar", "ar", "en")
AUDIENCES = ("consumer", "business")
SOURCES = ("order", "booking", "ledger_payment", "manual", "external")
PAYMENT_METHODS = ("cash", "card", "bank_transfer", "link", "credit", "cheque", "other")
UNITS = ("piece", "kg", "g", "l", "m", "box", "pack", "portion", "hour", "day", "service")

# How long a shop must keep its documents. NOT CONFIRMED: a third-party source says ten years;
# the lawyer's answer is ALY-51. Whatever the answer, ALYR never deletes an issued document
# (the database refuses), so this number only says what the shop is told. Change it here, and
# in the spec, when ALY-51 answers.
RETENTION_YEARS = 10
RETENTION_CONFIRMED = False


def languages_of(setting: str) -> tuple[str, ...]:
    """The languages a document carries, the one it leads with first."""
    return {"ar_en": ("ar", "en"), "en_ar": ("en", "ar"), "ar": ("ar",), "en": ("en",)}[setting]


def has_arabic(setting: str) -> bool:
    return "ar" in languages_of(setting)
