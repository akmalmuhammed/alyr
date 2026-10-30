"""Where the home's "setup steps left" row leads (CJ-24 of the go-live audit): to a screen that can
do the step, never to the Orders list for "Add your menu or price list", which cannot add one."""

from uuid import UUID

from alyr.modules.agent import view
from test_agent import busy
from test_consent import owner_sql
from test_onboarding import new_business


def step_row(setup, lang="en"):
    return next(n for n in view.render(busy(setup=setup), lang)["needs"]["items"]
                if n["key"] == "setup")


def a_step(key, **over):
    return {"key": key, "label": {"en": "Do the thing", "ar": "افعل الشيء"}, "done": False,
            "screen": "", "connection": ""} | over


NAME = {"en": "ALYR Chat", "ar": "ALYR Chat"}


def test_a_step_with_a_screen_leads_there():
    assert step_row([(NAME, [a_step("products", screen="catalog")])])["href"] == "/app/catalog"


def test_a_connection_leads_to_connections():
    row = step_row([(NAME, [a_step("whatsapp", connection="whatsapp")])])
    assert row["href"] == "/app/connections"


def test_a_step_only_alyr_can_do_leads_to_the_help_box_not_to_connections():
    row = step_row([(NAME, [a_step("products")])])
    assert row["href"] == "/app#ask"
    assert step_row([(NAME, [a_step("products")])], "ar")["href"] == "/app#ask"


def test_the_orders_step_names_the_catalog_where_there_is_one_and_no_screen_where_there_is_not(
    client,
):
    tenant, _, _ = new_business(client, kind="bakery")

    def step():
        steps = [s for p in client.get("/api/workspace").json()["products"] for s in p["steps"]]
        return next(s for s in steps if s["key"] == "products")

    assert step()["screen"] == "catalog" and step()["label"]["en"] == "Add your menu"

    # Without the Catalog the Orders screen cannot add a menu, so the step names no screen: the
    # shell offers "Ask ALYR" and the home's row leads to the help box.
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'catalog'",
              UUID(tenant))
    without = step()
    assert without["screen"] == "" and without["label"]["en"] == "Add your menu or price list"
