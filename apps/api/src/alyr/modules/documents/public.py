"""What a customer's hosted document page may show (ALY-139).

The link's token names one issued document at one shop (`core/links.py`, purpose `document`);
this is the one place that turns that document into the page's content. It answers with what
the customer already holds on the PDF and a little less: the number and kind, the date, the
shop's name, the lines and the totals, how it was paid, and whether it has since been cancelled
by a credit note. No contact, no phone number, no email, no branch, no staff name, no hash, no
other document, and not the customer's own name (the PDF has it; the page is a summary that
may be forwarded). Everything is read inside the shop's scope, so another shop's document is
not found whatever the token says.
"""

from uuid import UUID

import asyncpg

from alyr.modules.documents import kinds, money, words
from alyr.modules.documents.service import LINE_COLUMNS


def _pair(text) -> dict:
    return {"en": text.en, "ar": text.ar}


async def page(conn: asyncpg.Connection, doc_id: UUID) -> dict | None:
    """The document as its page shows it, or None when there is no such issued document (a
    draft is not a document yet)."""
    row = await conn.fetchrow(
        "select id, kind, status, number, issue_date, currency, currency_exponent, languages, "
        "gross_minor, discount_minor, tax_minor, rounding_minor, total_minor, paid_minor, "
        "balance_minor, payments, seller, voided_by_document_id, related_document_id, "
        "number_authority from documents where id = $1 and status in ('issued', 'void') "
        "and withdrawn_at is null", doc_id)
    if row is None:
        return None
    lines = await conn.fetch(
        f"select {', '.join(LINE_COLUMNS)} from document_lines where document_id = $1 "
        "order by position", doc_id)
    voided_by = related = None
    if row["voided_by_document_id"]:
        voided_by = await conn.fetchval(
            "select number from documents where id = $1", row["voided_by_document_id"])
    if row["related_document_id"] and row["kind"] == "credit_note":
        related = await conn.fetchval(
            "select number from documents where id = $1", row["related_document_id"])
    seller = row["seller"] or {}
    return {
        "kind": row["kind"], "title": _pair(words.KIND_TITLES[row["kind"]]),
        "number": row["number"], "status": row["status"],
        "issue_date": row["issue_date"].isoformat(),
        "currency": row["currency"], "exponent": row["currency_exponent"],
        # How an Arabic page writes it after the amount: «ر.ق» (the English page writes the code).
        "currency_ar": money.CURRENCIES[row["currency"]].symbol_ar
        if row["currency"] in money.CURRENCIES else row["currency"],
        "languages": row["languages"], "lead": kinds.languages_of(row["languages"])[0],
        "seller": {"name": seller.get("name", ""), "name_ar": seller.get("name_ar", "")},
        "lines": [
            {"description": line["description"], "description_ar": line["description_ar"],
             "quantity": money.quantity_text(line["quantity"]),
             "unit": _pair(words.UNITS[line["unit"]]),
             "unit_price_minor": line["unit_price_minor"],
             "line_total_minor": line["line_total_minor"]}
            for line in lines
        ],
        "totals": {
            "gross_minor": row["gross_minor"], "discount_minor": row["discount_minor"],
            "tax_minor": row["tax_minor"], "rounding_minor": row["rounding_minor"],
            "total_minor": row["total_minor"], "paid_minor": row["paid_minor"],
            "balance_minor": row["balance_minor"],
        },
        "payments": [
            {"method": _pair(words.PAYMENT_METHODS[p["method"]]),
             "amount_minor": p["amount_minor"]}
            for p in (row["payments"] or [])
        ],
        "voided_by": voided_by, "against": related,
        # Numbered by the shop's other system and only delivered by ALYR (ALY-142).
        "external": row["number_authority"] == "external",
    }


async def pdf(conn: asyncpg.Connection, doc_id: UUID) -> tuple[bytes, str] | None:
    """The PDF and the number it is named for, for an issued document of this shop."""
    row = await conn.fetchrow(
        "select d.number, f.content from documents d join document_files f "
        "on f.document_id = d.id where d.id = $1 and d.status in ('issued', 'void') "
        "and d.withdrawn_at is null", doc_id)
    if row is None:
        return None
    return bytes(row["content"]), row["number"]
