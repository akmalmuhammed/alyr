"""The canonical form of an issued document, and its hash.

A document's hash is the SHA-256 of its content as canonical JSON: keys sorted, no spaces,
UTF-8 with Arabic written as Arabic (not as escapes), money as integers, quantities as text
with exactly three decimals, instants in UTC with microseconds. Nothing in it depends on the
order a database returns rows in, on the machine, or on when it is computed, so the same
content always gives the same hash, and anyone holding the content can check the hash.

What is in it is *what the paper says*: who, what, how much, when, the number. What is not:
how it was drawn (the layout, the brand colour, the picture bytes: only their hashes, inside
the seller), who pressed the button, and its status (a document is cancelled later by a credit
note and its content has not changed, so its hash must not). The version is part of the hash:
a later layout of this JSON is a new version, and an old document keeps verifying as the
version it was issued under.

Floats are refused: money and quantities are exact, and a float in here would make the hash
depend on how a language prints it.
"""

import hashlib
import json
from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

HASH_VERSION = 1


class CanonicalError(TypeError):
    """Something that has no single canonical spelling was put in a document."""


def _default(value: object) -> object:
    if isinstance(value, float):
        raise CanonicalError("a float cannot be part of a document's hash")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            raise CanonicalError("an instant needs a time zone")
        return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value.quantize(Decimal("0.001")), "f")
    raise CanonicalError(f"cannot hash a {type(value).__name__}")


def _check_no_floats(value: object) -> None:
    """`default` is only called for types json cannot do itself, and json does floats."""
    if isinstance(value, float):
        raise CanonicalError("a float cannot be part of a document's hash")
    if isinstance(value, Mapping):
        for item in value.values():
            _check_no_floats(item)
    elif isinstance(value, Sequence) and not isinstance(value, str | bytes):
        for item in value:
            _check_no_floats(item)


def canonical_bytes(content: object) -> bytes:
    _check_no_floats(content)
    return json.dumps(
        content, default=_default, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def line_content(line: Mapping) -> dict:
    return {
        "position": line["position"],
        "description": line["description"],
        "description_ar": line["description_ar"],
        "sku": line["sku"],
        "quantity": line["quantity"],
        "unit": line["unit"],
        "unit_price_minor": line["unit_price_minor"],
        "discount_minor": line["discount_minor"],
        "tax_rate_bp": line["tax_rate_bp"],
        "line_net_minor": line["line_net_minor"],
        "tax_minor": line["tax_minor"],
        "line_total_minor": line["line_total_minor"],
    }


def content_of(doc: Mapping, lines: Sequence[Mapping]) -> dict:
    """What an issued document says, from its row and its lines (as the database holds them
    or as the issuing code has just worked them out: the two must be the same, and
    `verify` in the service checks that they are)."""
    return {
        "v": HASH_VERSION,
        "id": doc["id"],
        "kind": doc["kind"],
        "number": doc["number"],
        "series_key": doc["series_key"],
        "number_year": doc["number_year"],
        "seq": doc["seq"],
        "issued_at": doc["issued_at"],
        "issue_date": doc["issue_date"],
        "due_date": doc["due_date"],
        "audience": doc["audience"],
        "languages": doc["languages"],
        "currency": doc["currency"],
        "currency_exponent": doc["currency_exponent"],
        "customer": doc["customer"],
        "seller": doc["seller"],
        "contact_id": doc["contact_id"],
        "gross_minor": doc["gross_minor"],
        "discount_minor": doc["discount_minor"],
        "tax_minor": doc["tax_minor"],
        "total_minor": doc["total_minor"],
        "paid_minor": doc["paid_minor"],
        "payments": doc["payments"],
        "notes": doc["notes"],
        "terms": doc["terms"],
        "reason": doc["reason"],
        "source": doc["source"],
        "source_ref": doc["source_ref"],
        "related_document_id": doc["related_document_id"],
        "lines": [line_content(line) for line in sorted(lines, key=lambda x: x["position"])],
    }


def hash_content(content: object) -> str:
    return sha256_hex(canonical_bytes(content))
