"""The demo shop for ALYR Invoices (ALY-141): Salem Maintenance, a make-believe AC repair and
maintenance business in Doha that uses ALYR for invoices and receipts and nothing else. It is made
by the same command as the Catalog's demo shops (`python -m alyr.seed_catalog_demos`, or
`--only salem`) so one command prepares every demo.

It has a few saved lines (what it writes again and again), three customers, a registered staff
number for the invoice-by-message demo, and a small book of documents: an unpaid invoice with its
payment link, a paid one with its receipt, an unpaid one for a company, and a receipt for a walk-in.
Everything is invented; nothing in it can reach a phone.

Unlike the Catalog's demo shops this one is made once: an issued document can never be deleted
(the database refuses it, for the owner too), so a second run leaves the shop and its papers as
they are and only says so. To see the walk-through from the start again, sign up a new shop with
the "Invoices only" way, which is what the demo is for.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from alyr.core.auth import Staff
from alyr.core.team import Actor
from alyr.db import Database
from alyr.demo.build import Refused
from alyr.modules.documents import customers, payments, sales, saved_lines, service
from alyr.modules.documents import settings as doc_settings
from alyr.modules.items import staff as staff_registry

SALEM_TENANT_ID = UUID("0a1f0000-0000-4000-8000-00000000d201")
SLUG = "salem-maintenance"
NAME, NAME_AR = "Salem Maintenance", "سالم للصيانة"
OWNER = ("owner@demo-salem.example", "Salem Al Naimi")
AGENT = ("agent@demo-salem.example", "Hamad Rashid")
STAFF_PHONE = "97455500141"
KEY = "salem"

LINES = (
    ("AC repair", "صيانة مكيف", "service", 50000),
    ("AC deep clean", "تنظيف مكيف شامل", "service", 35000),
    ("Filter change", "تغيير فلتر", "piece", 12000),
    ("Inspection visit", "زيارة فحص", "service", 15000),
)
# name, name_ar, phone, company, registration, tax id, address, asked for WhatsApp
PEOPLE = (
    ("Ahmed Al Thani", "أحمد آل ثاني", "97455512345", "", "", "", "Al Sadd, Doha", True),
    ("Sara Al Mulla", "سارة المُلا", "97455513399", "", "", "", "The Pearl, Doha", False),
    ("Doha Villas Co.", "شركة فلل الدوحة", "97444001234", "Doha Villas Co.", "100778", "TX-5521",
     "Lusail, Doha", False),
)


def describe(web_url: str, counts: dict | None = None) -> list[str]:
    lines = [f"{NAME} ({NAME_AR}), invoices only, Doha",
             f"    sign in: {OWNER[0]} (owner) or {AGENT[0]} (agent); "
             "the code shows on the sign-in page",
             f"    workspace: {web_url}/app/documents",
             f"    by message: in the simulator send as {STAFF_PHONE} to shop \"{SLUG}\": "
             "invoice Ahmed 500 for AC repair"]
    if counts:
        lines.append("    made: " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    return lines


async def make(owner: Database, app: Database, now: datetime) -> dict:
    """Make Salem Maintenance, or leave it as it is when its papers are already there. Returns
    what it made, in counts (empty when it was left alone)."""
    async with owner.unscoped() as conn:
        for row in await conn.fetch(
            "select id, slug, name from tenants where id = $1 or slug = $2", SALEM_TENANT_ID, SLUG
        ):
            if row["id"] != SALEM_TENANT_ID:
                raise Refused(
                    f"the address “{SLUG}” already belongs to the shop “{row['name']}”, which is "
                    "not the demo. Nothing was changed.")
        await _tenant(conn, now)
    async with app.tenant(SALEM_TENANT_ID) as conn:
        if await conn.fetchval("select count(*) from documents"):
            return {}
    actor = Actor(None, OWNER[1])
    owner_staff = Staff(None, OWNER[1], OWNER[0], "owner", SALEM_TENANT_ID)
    async with app.tenant(SALEM_TENANT_ID) as conn:
        await doc_settings.ensure(conn)
        await doc_settings.update(conn, actor, {
            "business_name": NAME, "business_name_ar": NAME_AR,
            "commercial_registration": "100245", "tax_id": "", "address": "Salwa Road, Doha",
            "address_ar": "طريق سلوى، الدوحة", "phone": "+974 5550 0141", "languages": "ar_en",
            "default_audience": "consumer", "layout": "a4",
            "notes": {"invoice": {"en": "Payment is due within 14 days.",
                                  "ar": "الدفع خلال 14 يوماً من تاريخ الفاتورة."}},
        })
        for name, name_ar, unit, price in LINES:
            await saved_lines.save(conn, owner_staff, {
                "name": name, "name_ar": name_ar, "unit": unit, "price_minor": price})
        people = []
        for name, name_ar, phone, company, registration, tax_id, address, asked in PEOPLE:
            saved = await customers.save(conn, owner_staff, {
                "name": name, "name_ar": name_ar, "phone": phone, "company": company,
                "registration_number": registration, "tax_id": tax_id, "address": address},
                whatsapp_ok=asked)
            people.append(saved)
        # Ahmed wrote to the shop's number a moment ago, so a document reaches him on the test line.
        await conn.execute("update contacts set last_inbound_at = now() where id = $1",
                           UUID(people[0]["id"]))
        await staff_registry.register(conn, "Salem (owner)", STAFF_PHONE, "en", manager=True)

        today = now.astimezone(UTC).date()
        sales_staff = sales.staff_for(SALEM_TENANT_ID, actor)

        async def invoice(person: dict, rows: list[tuple[str, str, str, int, str]], key: str,
                          days: int = 14) -> dict:
            body = {
                "kind": "invoice", "contact_id": person["id"],
                "customer": {k: v for k, v in {
                    "name": person["name"], "name_ar": person["name_ar"],
                    "company": person["company"], "phone": "+" + person["phone"],
                    "registration_number": person["registration_number"],
                    "tax_id": person["tax_id"], "address": person["address"]}.items() if v},
                "due_date": today + timedelta(days=days),
                "lines": [{"description": d, "description_ar": a, "quantity": q, "unit": u,
                           "unit_price_minor": p} for d, a, u, p, q in rows],
            }
            made, _ = await service.create_and_issue(
                conn, sales_staff, body, key=f"demo-salem-{key}")
            return made

        await invoice(people[2], [("AC deep clean", "تنظيف مكيف شامل", "service", 35000, "3")],
                      "inv-villas")
        paid = await invoice(people[0], [("AC repair", "صيانة مكيف", "service", 50000, "1")],
                             "inv-ahmed")
        await payments.record(
            conn, sales_staff, subject="invoice", subject_id=UUID(paid["id"]), amount_minor=None,
            method="cash", reference="", key="demo-salem-pay-1", receipt=True, send=False)
        await invoice(people[1], [("Filter change", "تغيير فلتر", "piece", 12000, "2")],
                      "inv-sara", days=7)
        walk_in = {
            "kind": "receipt", "customer": {"name": "Walk-in customer", "name_ar": "عميل عابر"},
            "lines": [{"description": "Inspection visit", "description_ar": "زيارة فحص",
                       "quantity": "1", "unit": "service", "unit_price_minor": 15000}],
            "payments": [{"method": "cash", "amount_minor": 15000, "reference": ""}],
        }
        await service.create_and_issue(conn, sales_staff, walk_in, key="demo-salem-rc-walkin")
        counts = {
            "customers": len(people), "saved lines": len(LINES),
            "documents": await conn.fetchval(
                "select count(*) from documents where status <> 'draft'"),
        }
    return counts


async def _tenant(conn, now: datetime) -> None:
    """The business row, its client, its private test line, its people and its modules (global
    tables, owner role)."""
    started = now - timedelta(days=30)
    await conn.execute(
        "insert into tenants (id, name, name_ar, slug, business_type, area, onboarding_way, "
        "onboarding_step, onboarded_at, created_at) "
        "values ($1, $2, $3, $4, 'invoices', 'Doha', 'invoices', '', $5, $5) "
        "on conflict (id) do update set name = $2, name_ar = $3, slug = $4, onboarded_at = $5",
        SALEM_TENANT_ID, NAME, NAME_AR, SLUG, started)
    await conn.execute(
        "insert into channel_numbers (number_id, tenant_id, channel) values ($1, $2, 'simulator') "
        "on conflict (number_id) do nothing", f"sim-{SLUG}", SALEM_TENANT_ID)
    if not await conn.fetchval("select client_id from tenants where id = $1", SALEM_TENANT_ID):
        client_id = await conn.fetchval(
            "insert into clients (name, contact_name, contact_email) values ($1, $2, $3) "
            "returning id", NAME, OWNER[1], OWNER[0])
        await conn.execute("update tenants set client_id = $2 where id = $1", SALEM_TENANT_ID,
                           client_id)
    for (email, person), role in ((OWNER, "owner"), (AGENT, "agent")):
        user = await conn.fetchval(
            "insert into users (email, name) values ($1, $2) "
            "on conflict (email) do update set name = excluded.name returning id", email, person)
        await conn.execute(
            "insert into memberships (tenant_id, user_id, role) values ($1, $2, $3) "
            "on conflict do nothing", SALEM_TENANT_ID, user, role)
    for module in ("documents", "payments"):
        await conn.execute(
            "insert into tenant_modules (tenant_id, module_key, enabled_by) "
            "values ($1, $2, 'Demo') on conflict (tenant_id, module_key) "
            "do update set enabled = true",
            SALEM_TENANT_ID, module)
