"""Staff told about a new order on WhatsApp (go-live checklist item 42, D-079): only the staff
numbers the owner marked for new orders, in their own language, as text inside their 24-hour
window and as the `order_new_staff` template outside it; never for the owner's test order, and
never one shop's order to another shop's staff."""

from uuid import UUID

from alyr.core import jobs, templates
from alyr.modules.orders import staff_alert
from alyr.seed import DEMO_TENANT_ID, OWNER_PHONE, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    catalog_module_on,
    sent,
    window_closed,
)
from test_consent import owner_sql
from test_items import line, mk, order, people


def open_window(phone: str) -> None:
    owner_sql("update contacts set last_inbound_at = now() where phone = $1", phone)


def staff_id(client, phone: str) -> str:
    numbers = client.get("/api/staff-numbers").json()["numbers"]
    return next(n["id"] for n in numbers if n["phone"] == phone)


def tell_new_orders(client, phone: str, on: bool = True) -> dict:
    changed = client.put(f"/api/staff-numbers/{staff_id(client, phone)}",
                         json={"order_alerts": on})
    assert changed.status_code == 200, changed.text
    return changed.json()


def place(client, item: dict, quantity: int = 2, who: int = 0, **more) -> dict:
    placed = order(client, people(client, 3)[who], [line(item, quantity)], **more)
    assert placed.status_code == 200, placed.text
    return placed.json()


def alerts_to(client, phone: str) -> list[dict]:
    return [m for m in sent(client, phone)
            if m["body"].startswith(("New order", "طلب جديد"))
            or (m["payload"] or {}).get("template") == staff_alert.TEMPLATE]


def test_nobody_is_told_until_the_owner_marks_a_number(client):
    item = mk(client, name="Croissant", name_ar="كرواسون", price=900)
    open_window(OWNER_PHONE)
    place(client, item)
    assert alerts_to(client, OWNER_PHONE) == alerts_to(client, STAFF_PHONE) == []
    # And no job was queued for it.
    assert owner_sql("select count(*) as n from jobs where kind = $1", staff_alert.JOB)[0]["n"] == 0


def test_a_marked_number_is_told_what_the_order_holds_and_how_it_goes(client):
    item = mk(client, name="Croissant", name_ar="كرواسون", price=900)
    assert tell_new_orders(client, STAFF_PHONE)["order_alerts"] is True
    open_window(STAFF_PHONE)
    placed = place(client, item, 2)
    number = owner_sql("select number from orders where id = $1",
                       UUID(placed["order_id"]))[0]["number"]
    [alert] = alerts_to(client, STAFF_PHONE)
    assert alert["kind"] == "text"
    lines = alert["body"].split("\n")
    assert lines[0] == f"New order {number} · QAR 18"
    assert lines[1].startswith("From ")
    assert "2 x Croissant" in lines
    assert "Not paid yet" in alert["body"]
    assert lines[-1].startswith("Confirm it in ALYR: ")
    assert lines[-1].endswith("/app/orders?show=unconfirmed")
    # A number not marked is not told.
    assert alerts_to(client, OWNER_PHONE) == []


def test_outside_the_window_it_is_the_template_and_in_arabic_when_asked(client):
    item = mk(client, name="Croissant", name_ar="كرواسون", price=900)
    tell_new_orders(client, STAFF_PHONE)
    owner_sql("update contacts set lang = 'ar' where phone = $1", STAFF_PHONE)
    window_closed(STAFF_PHONE)
    placed = place(client, item, 1)
    number = owner_sql("select number from orders where id = $1",
                       UUID(placed["order_id"]))[0]["number"]
    [alert] = alerts_to(client, STAFF_PHONE)
    assert alert["kind"] == "template"
    assert (alert["payload"]["template"], alert["payload"]["category"]) == (
        "order_new_staff", "utility")
    shop, said_number, total, holds = alert["payload"]["params"]
    assert (said_number, total) == (str(number), "9 ر.ق")
    assert holds.startswith("1 x كرواسون.") and "لم يُدفع بعد" in holds
    assert alert["body"].startswith("طلب جديد في ")


def test_switching_it_off_stops_the_messages(client):
    item = mk(client, name="Croissant", name_ar="كرواسون", price=900)
    tell_new_orders(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    place(client, item)
    assert tell_new_orders(client, STAFF_PHONE, on=False)["order_alerts"] is False
    place(client, item, who=1)
    assert len(alerts_to(client, STAFF_PHONE)) == 1


def test_the_owners_test_order_tells_nobody(client):
    tell_new_orders(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    item = mk(client, name="Croissant", name_ar="كرواسون", price=900)
    tester = people(client, 1)[0]
    owner_sql("update contacts set wa_user_id = 'TEST.' || id::text where id = $1",
              UUID(tester["id"]))
    placed = order(client, tester, [line(item, 1)])
    assert placed.status_code == 200, placed.text
    assert alerts_to(client, STAFF_PHONE) == []


def test_a_long_order_says_how_many_more_lines_it_holds(client):
    tell_new_orders(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    items = [mk(client, name=f"Bun {n}", name_ar=f"كعك {n}", price=100) for n in range(10)]
    placed = order(client, people(client, 1)[0], [line(i, 1) for i in items])
    assert placed.status_code == 200, placed.text
    [alert] = alerts_to(client, STAFF_PHONE)
    shown = [x for x in alert["body"].split("\n") if x.startswith("1 x Bun")]
    assert len(shown) == staff_alert.MAX_LINES
    assert "and 2 more" in alert["body"]


def test_the_template_is_in_the_catalogue_with_four_values():
    template = templates.CATALOGUE["order_new_staff"]
    assert template.category == "utility"
    assert len(template.samples) == len(template.samples_ar) == 4
    assert templates.render("order_new_staff", "en", template.samples).startswith(
        "New order at Al Noor Electricals: order 1001 for QAR 179.")


def test_the_job_does_nothing_for_an_order_that_is_gone(client):
    tell_new_orders(client, STAFF_PHONE)

    async def run():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await jobs.enqueue(conn, staff_alert.JOB,
                               {"order_id": "00000000-0000-4000-8000-000000000000"})

    client.portal.call(run)
    client.portal.call(client.app.state.jobs.drain)
    assert alerts_to(client, STAFF_PHONE) == []
