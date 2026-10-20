"""What the draft form looks things up in (ALY-146, spec 015): the shop's customers, and lines
from the Catalog.

Both are read only. A line from the Catalog is a *seed*: the form copies its description, code
and price into a line of the draft, and from then on the line is the document's own (issued
paper never reads a price from the Catalog again, spec 011).
"""

import re
from uuid import UUID

import asyncpg

from alyr.modules.documents import kinds
from alyr.modules.documents.customers import NOT_THE_TEST_LINE
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import groups, listing

CUSTOMER_LIMIT = 12
LINE_LIMIT = 12
# Arabic is searched with its common spellings folded (alef forms, ya, ta marbuta), and digits
# typed in Arabic count as digits.
_FOLD = "translate(lower({}), 'أإآىة', 'اااية')"
_WESTERN = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


async def customers(
    conn: asyncpg.Connection, q: str = "", limit: int = CUSTOMER_LIMIT
) -> list[dict]:
    """The shop's customers, found by name or by the digits of a phone number; with nothing
    typed, the ones who wrote most recently."""
    q = (q or "").strip()
    digits = re.sub(r"\D", "", q.translate(_WESTERN))
    where, args = f"c.role = 'customer' and {NOT_THE_TEST_LINE}", []
    if q:
        args.append(q)
        # Name in either language, company and email; Arabic spellings folded (ALY-141).
        haystack = _FOLD.format("c.name || ' ' || c.name_ar || ' ' || c.company || ' ' || "
                                "coalesce(c.email, '')")
        clause = f"position({_FOLD.format('$1')} in {haystack}) > 0"
        if len(digits) >= 3:
            args.append(digits)
            clause += (" or position($2 in regexp_replace(coalesce(c.phone, ''), "
                       "'\\D', '', 'g')) > 0")
        where += f" and ({clause})"
    rows = await conn.fetch(
        "select c.id, c.name, c.name_ar, c.company, c.phone, c.email, c.lang, "
        "c.registration_number, c.tax_id, c.address, c.address_ar, g.name as group_name, "
        "g.name_ar as group_name_ar, coalesce(g.is_default, true) as group_default "
        "from contacts c left join price_groups g on g.id = c.price_group_id "
        f"where {where} order by greatest(c.last_inbound_at, (select max(coalesce(d.issued_at, "
        "d.created_at)) from documents d where d.contact_id = c.id)) desc nulls last, c.name "
        f"limit ${len(args) + 1}",
        *args, max(1, min(limit, 30)))
    return [
        {"id": str(r["id"]), "name": r["name"], "name_ar": r["name_ar"], "company": r["company"],
         "phone": r["phone"], "email": r["email"] or "", "lang": r["lang"],
         "registration_number": r["registration_number"], "tax_id": r["tax_id"],
         "address": r["address"], "address_ar": r["address_ar"],
         "price_group": (None if r["group_default"] else
                         {"name": r["group_name"], "name_ar": r["group_name_ar"]})}
        for r in rows
    ]


def _price(view: dict, variant: dict | None, group_id: str | None) -> int:
    """What this customer pays: their group's price for the size, else its price for the item
    plus the size's difference, else the normal price (a group price replaces a sale price)."""
    delta = variant["price_delta"] if variant else 0
    if group_id:
        prices = {(g["group_id"], g["variant_id"]): g["price"] for g in view["group_prices"]}
        if variant and (group_id, variant["id"]) in prices:
            return prices[(group_id, variant["id"])]
        if (group_id, None) in prices:
            return prices[(group_id, None)] + delta
    return view["current_price"] + delta


async def catalog_lines(
    conn: asyncpg.Connection, q: str = "", contact_id: UUID | None = None,
    limit: int = LINE_LIMIT,
) -> list[dict]:
    """Lines to add from the Catalog, found by name (either language), item code or SKU, priced
    for the customer's price group when a customer is chosen. Samples are never offered, and
    an archived item is not either; a draft or a hidden one can still be written on a paper."""
    clock = await shop_clock.load(conn)
    found = await listing.page(conn, clock, q=q, limit=60)
    group = await groups.group_of(conn, contact_id)
    gid = groups.pricing_id(group)
    gid = str(gid) if gid else None
    lines = []
    for view in found["items"]:
        if view["sample"] or view["status"] in ("archived", "draft"):
            continue
        sizes = [v for v in view["variants"] if v["active"]]
        named = [v for v in sizes if not v["is_default"] or len(sizes) > 1]
        for variant in (named if len(sizes) > 1 else [None]):
            suffix = (variant["name"], variant["name_ar"]) if variant else ("", "")
            lines.append({
                "item_id": view["id"], "variant_id": variant["id"] if variant else None,
                "code": view["code"],
                "sku": (variant["sku"] if variant and variant["sku"] else view["sku"]),
                "description": f"{view['name']} ({suffix[0]})" if suffix[0] else view["name"],
                "description_ar": (f"{view['name_ar']} ({suffix[1] or suffix[0]})"
                                   if suffix[0] and view["name_ar"] else view["name_ar"]),
                "unit": view["unit"] if view["unit"] in kinds.UNITS else "piece",
                "unit_price_minor": _price(view, variant, gid),
                "group_price": bool(gid) and any(
                    g["group_id"] == gid and g["variant_id"] in (None, variant and variant["id"])
                    for g in view["group_prices"]),
            })
            if len(lines) >= limit:
                return lines
    return lines
