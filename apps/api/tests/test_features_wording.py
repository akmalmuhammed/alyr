"""The shop's own words and layout (ALY-148): the owner names the Catalog's section ("Menu",
"Products", "Price list", "My shop") in English and Arabic and chooses how the order page is laid
out, and the workspace and the customer's page use them."""

from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from test_consent import owner_sql
from test_items import STORE
from test_sign_in import sign_in

RECORD = "/api/items/settings/activity"


def catalog_on() -> None:
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog') "
              "on conflict (tenant_id, module_key) do update set enabled = true", DEMO_TENANT_ID)


def nav_label(client) -> dict:
    nav = client.get("/api/workspace").json()["nav"]["products"]
    return next(s["label"] for s in nav if s["key"] == "catalog")


def test_the_owner_names_the_section_and_the_name_is_used_everywhere(client):
    catalog_on()
    assert client.get("/api/items/setup").json()["section"]["name"] == "Catalog"
    saved = client.put("/api/items/setup", json={"section_name": "My shop",
                                                 "section_name_ar": "متجري"})
    assert saved.status_code == 200, saved.text
    section = saved.json()["section"]
    assert (section["name"], section["name_ar"], section["custom"]) == ("My shop", "متجري", True)
    assert section["template_name"] == "Catalog"
    assert nav_label(client) == {"en": "My shop", "ar": "متجري"}
    assert client.get(STORE).json()["catalog"]["section"] == {
        "name": "My shop", "name_ar": "متجري"}
    # Each language falls back on its own, and an empty name goes back to the template's.
    client.put("/api/items/setup", json={"section_name_ar": ""})
    assert nav_label(client) == {"en": "My shop", "ar": "الكتالوج"}
    client.put("/api/items/setup", json={"section_name": ""})
    assert nav_label(client) == {"en": "Catalog", "ar": "الكتالوج"}
    assert client.get("/api/items/setup").json()["section"]["custom"] is False


def test_the_section_name_is_kept_clean_and_short(client):
    saved = client.put("/api/items/setup", json={"section_name": "  Price   list  "})
    assert saved.json()["section"]["name"] == "Price list"
    assert client.put("/api/items/setup", json={"section_name": "x" * 41}).status_code == 422


def test_the_owner_chooses_the_order_pages_layout_style(client):
    catalog_on()
    assert client.get("/api/items/setup").json()["layout"]["style"] == "grid"
    for style in ("menu", "list", "table"):
        saved = client.put("/api/items/setup", json={"layout_style": style}).json()
        assert saved["layout"]["style"] == style and saved["layout_custom"] is True
        assert client.get(STORE).json()["catalog"]["layout"]["style"] == style
    reset = client.put("/api/items/setup", json={"layout_style": ""}).json()
    assert reset["layout"]["style"] == "grid" and reset["layout_custom"] is False
    assert client.put("/api/items/setup", json={"layout_style": "carousel"}).status_code == 422


def test_wording_and_layout_are_the_owners_to_change_and_are_on_the_record(client):
    client.put("/api/items/setup", json={"section_name": "Menu", "layout_style": "menu"})
    # (the record is shared by the whole run: the newest line is this save)
    newest = next(r for r in client.get(RECORD).json()["activity"] if r["action"] == "settings")
    fields = {c["field"]: (c["from"], c["to"]) for c in newest["detail"]["changes"]}
    assert fields["section_name"] == ("Catalog", "Menu")
    assert fields["layout_style"] == ("grid", "menu")
    sign_in(client, AGENT_EMAIL)
    for body in ({"section_name": "Hacked"}, {"layout_style": "table"}):
        assert client.put("/api/items/setup", json=body).status_code == 403
