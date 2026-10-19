"""From what the database holds to what the PDF engine draws.

The engine (`render/`) knows nothing of rows, settings or hashes: it is given a `Doc`. This
module is the one place a document's rows and a shop's settings become one, which keeps two
promises:

* the PDF of an issued document is made from the same values its hash is made from (the
  snapshots in its row and its lines), never from the shop's *current* settings, except for
  how it looks (the logo, the colour, the header and footer), which are not part of what the
  paper says;
* a person's name, address or a product's description is put on the side of the page its
  script belongs to: Arabic text under Arabic, Latin under English.
"""

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime

from alyr.modules.documents import kinds, words
from alyr.modules.documents.render.context import (
    Bi,
    Brand,
    Doc,
    Line,
    Party,
    Payment,
)
from alyr.modules.documents.render.pen import has_arabic


def bi(text: str = "", text_ar: str = "") -> Bi:
    """One text, or a pair, as a `Bi`. A single text goes on the side its script belongs to:
    what is written in Arabic is the Arabic, anything else is the English."""
    text, text_ar = (text or "").strip(), (text_ar or "").strip()
    if text_ar:
        return Bi(ar=text_ar, en="" if has_arabic(text) else text)
    if has_arabic(text):
        return Bi(ar=text)
    return Bi(en=text)


def pair(value: Mapping | None) -> Bi:
    """A stored {"en": ..., "ar": ...} (notes and terms) as a `Bi`."""
    value = value or {}
    return Bi(ar=(value.get("ar") or "").strip(), en=(value.get("en") or "").strip())


def seller_party(snapshot: Mapping) -> Party:
    return Party(
        name=bi(snapshot.get("name", ""), snapshot.get("name_ar", "")),
        phone=snapshot.get("phone", ""), email=snapshot.get("email", ""),
        address=bi(snapshot.get("address", ""), snapshot.get("address_ar", "")),
        registration=snapshot.get("commercial_registration", ""),
        tax_id=snapshot.get("tax_id", ""), licence=snapshot.get("licence_number", ""),
        branch=bi((snapshot.get("branch") or {}).get("name", ""),
                  (snapshot.get("branch") or {}).get("name_ar", "")),
    )


def customer_party(snapshot: Mapping) -> Party:
    return Party(
        name=bi(snapshot.get("name", ""), snapshot.get("name_ar", "")),
        company=snapshot.get("company", ""), phone=snapshot.get("phone", ""),
        email=snapshot.get("email", ""),
        address=bi(snapshot.get("address", ""), snapshot.get("address_ar", "")),
        registration=snapshot.get("registration_number", ""), tax_id=snapshot.get("tax_id", ""),
    )


def line_view(line: Mapping) -> Line:
    return Line(
        description=bi(line["description"], line["description_ar"]), sku=line["sku"],
        quantity=line["quantity"], unit=line["unit"], unit_price=line["unit_price_minor"],
        discount=line["discount_minor"], tax_rate_bp=line["tax_rate_bp"],
        net=line["line_net_minor"], tax=line["tax_minor"], total=line["line_total_minor"],
    )


def title_for(kind: str, *, taxed: bool) -> Bi:
    """The title on the page. An invoice that carries tax and a tax number says so; with tax
    off (Qatar has none today) it is simply an invoice."""
    title = words.TAX_INVOICE if taxed and kind == "invoice" else words.KIND_TITLES[kind]
    return Bi(ar=title.ar, en=title.en)


def brand_of(settings: Mapping, logo: bytes | None, stamp: bytes | None) -> Brand:
    return Brand(
        colour=settings["brand_color"], logo_png=logo, stamp_png=stamp,
        show_sku=settings["show_sku"], show_discounts=settings["show_discounts"],
        show_customer_tax_id=settings["show_customer_tax_id"], show_bank=settings["show_bank"],
        show_signature=settings["show_signature"], show_alyr_mark=settings["show_alyr_mark"],
        bank_details=settings["bank_details"],
        header=Bi(ar=settings["header_ar"], en=settings["header_en"]),
        footer=Bi(ar=settings["footer_ar"], en=settings["footer_en"]),
    )


def make_doc(
    row: Mapping, lines: Sequence[Mapping], seller: Mapping, brand: Brand, *,
    related: Mapping | None = None, preview: bool = False,
) -> Doc:
    """The page for a document row (an issued one, or a draft being previewed) and its lines.
    `seller` is the document's own copy of the seller, or the shop's settings for a preview."""
    kind = kinds.KINDS[row["kind"]]
    taxed = bool(row["tax_minor"]) and bool(seller.get("tax_id"))
    related_title = Bi()
    related_number = ""
    if related is not None:
        title = words.KIND_TITLES[related["kind"]]
        related_title, related_number = Bi(ar=title.ar, en=title.en), related["number"] or ""
    payments = tuple(
        Payment(p["method"], p["amount_minor"], p.get("reference", ""))
        for p in (row["payments"] or [])
    )
    number = row["number"]
    issued_at = row["issued_at"]
    return Doc(
        kind=row["kind"], title=title_for(row["kind"], taxed=taxed),
        languages=kinds.languages_of(row["languages"]), layout=row["layout"],
        currency=row["currency"], exponent=row["currency_exponent"],
        seller=seller_party(seller), customer=customer_party(row["customer"] or {}),
        lines=tuple(line_view(line) for line in sorted(lines, key=lambda x: x["position"])),
        gross=row["gross_minor"], discount=row["discount_minor"], tax=row["tax_minor"],
        rounding=row["rounding_minor"], total=row["total_minor"], paid=row["paid_minor"],
        balance=row["total_minor"] - row["paid_minor"],
        number=number, issue_date=row["issue_date"], second_date=row["due_date"],
        second_date_label=kind.second_date if row["due_date"] else None,
        payments=payments, notes=pair(row["notes"]), terms=pair(row["terms"]),
        reason=row["reason"], related_title=related_title, related_number=related_number,
        unregistered=not seller.get("registered", False), preview=preview,
        code=(row["content_hash"] or "")[:16], brand=brand,
        created=issued_at if isinstance(issued_at, datetime) else datetime(2026, 1, 1, tzinfo=UTC),
    )
