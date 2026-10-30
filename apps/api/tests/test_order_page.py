"""The customer's order page, version 2 (ALY-112, D-039; specs/005-order-page-v2): what the
public API tells the page, as a customer meets it. Plan scenarios 1 to 7, 11, 12 and 14 are
proved on the page itself by scripts/order-page-browser-check.mjs; the API behind each is in
test_catalog_scenarios.py. Here: the page's data (categories in the owner's order, a page at
a time, Arabic search, the stock that is and is not told, sold-out items greyed or left out,
plain words for hours and cut-offs, photos in every state, sizes and their prices), what
refreshes, the preview a shared link shows, tables on orders, and the Arabic that never
says "QAR"."""

from datetime import datetime, time
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest

from alyr.modules.items import notes
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.service import Loaded
from alyr.modules.orders import page as page_module
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from order_links import token
from photo_files import photo
from test_consent import owner_sql, say
from test_items import EVERY_DAY, STORE, counted, detail, line, mk, order, people
from test_media import upload
from test_orders import customer
from test_price_groups import make_group, put_in, set_price
from test_track import tracked as track_of

QATAR = ZoneInfo("Asia/Qatar")
LIVE = f"{STORE}/live"


@pytest.fixture(autouse=True)
def clean():
    def clear():
        for table in ("media_ops", "media_links", "media_assets", "media_usage"):
            owner_sql(f"delete from {table}")
        owner_sql("delete from tenant_modules where module_key = 'catalog'")

    clear()
    yield
    clear()


def shop(client, **query) -> dict:
    answer = client.get(STORE, params=query)
    assert answer.status_code == 200, answer.text
    return answer.json()


def names(rows: list[dict]) -> list[str]:
    return [r["name"] for r in rows]


def row(client, item: dict, **query) -> dict:
    return next(r for r in shop(client, **query)["items"] if r["id"] == item["id"])


def settings(client, **values) -> dict:
    """Change the shop's settings. How a sold-out item looks (`sold_out_display`) is the
    business type's setting, saved with `PUT /api/items/setup` (ALY-107)."""
    sold_out = values.pop("sold_out_display", None)
    if sold_out is not None:
        done = client.put("/api/items/setup", json={"sold_out": sold_out})
        assert done.status_code == 200, done.text
    answer = client.put("/api/items/settings", json=values)
    assert answer.status_code == 200, answer.text
    return answer.json()


def with_photo(client, item: dict, seed: int = 1, size=(900, 600)) -> str:
    stored = upload(client, photo(*size, seed))
    assert stored.status_code in (200, 201), stored.text
    asset = stored.json()["photo"]["id"]
    attached = client.post(f"/api/items/{item['id']}/photos", json={"asset_id": asset})
    assert attached.status_code == 200
    return asset


# ── the shop and its choices ─────────────────────────────


def test_the_page_says_whether_the_shop_has_the_catalog_and_where_to_message_it(client):
    first = shop(client)
    assert first["shop"]["catalog"] is False and first["shop"]["whatsapp"] == ""
    assert first["settings"] == {
        "sold_out_display": "grey", "wholesale_layout": False, "whatsapp_number": "",
        "whatsapp_mode": "chat", "pay": {"online": True, "ways": []},
    }
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')",
              DEMO_TENANT_ID)
    settings(client, whatsapp_number="+974 5555 0100", wholesale_layout=True,
             sold_out_display="hide")
    again = shop(client)
    assert again["shop"]["catalog"] is True and again["shop"]["whatsapp"] == "97455550100"
    assert again["settings"]["sold_out_display"] == "hide" and again["settings"]["wholesale_layout"]


def test_the_whatsapp_number_is_kept_as_digits_with_the_country_code(client):
    assert settings(client, whatsapp_number="5555 0100")["whatsapp_number"] == "97455550100"
    assert settings(client, whatsapp_number="00974-5555-0100")["whatsapp_number"] == "97455550100"
    assert settings(client, whatsapp_number="+٩٧٤ ٥٥٥٥ ٠١٠٠")["whatsapp_number"] == "97455550100"
    for bad in ("12345", "call me", "+974 5555 01001234567"):
        refused = client.put("/api/items/settings", json={"whatsapp_number": bad})
        assert refused.status_code == 422 and detail(refused)["code"] == "bad_whatsapp", bad
    assert settings(client, whatsapp_number="")["whatsapp_number"] == ""
    assert client.put("/api/items/setup", json={"sold_out": "blink"}).status_code == 422


def test_only_owners_and_admins_change_what_the_page_does(client):
    from alyr.seed import AGENT_EMAIL
    from test_sign_in import sign_in
    sign_in(client, AGENT_EMAIL)
    refused = client.put("/api/items/settings", json={"wholesale_layout": True})
    assert refused.status_code == 403
    assert client.put("/api/items/setup", json={"sold_out": "hide"}).status_code == 403


# ── categories, pages and search ─────────────────────────


def test_items_come_in_the_owners_category_order_and_the_page_counts_each(client):
    for name, category in (("Pie", "Desserts"), ("Latte", "Drinks"), ("Tea", "Drinks"),
                           ("Shawarma", "Mains")):
        mk(client, name=name, name_ar=f"{name} ع", category=category)
    client.put("/api/items/categories", json=[
        {"name": "Mains", "name_ar": "الأطباق الرئيسية"}, {"name": "Drinks", "name_ar": "مشروبات"},
        {"name": "Desserts", "name_ar": "حلويات"},
    ])
    page = shop(client)
    ours = [c for c in page["categories"] if c["name"] in ("Mains", "Drinks", "Desserts")]
    assert [(c["name"], c["name_ar"], c["count"]) for c in ours] == [
        ("Mains", "الأطباق الرئيسية", 1), ("Drinks", "مشروبات", 2), ("Desserts", "حلويات", 1),
    ]
    # The categories the owner never ordered (the demo's cables) come after theirs.
    assert [c["name"] for c in page["categories"][:3]] == ["Mains", "Drinks", "Desserts"]
    listed = [r["category"] for r in page["items"]]
    assert listed.index("Mains") < listed.index("Drinks") < listed.index("Desserts")
    assert names(shop(client, category="Drinks")["items"]) == ["Latte", "Tea"]


def test_a_page_at_a_time_with_the_whole_total(client):
    for n in range(7):
        mk(client, name=f"Cake {n}", name_ar=f"كعكة {n}", category="Bakery", sort=n)
    first = shop(client, category="Bakery", limit=3)
    assert (first["total"], first["offset"], names(first["items"])) == (
        7, 0, ["Cake 0", "Cake 1", "Cake 2"])
    second = shop(client, category="Bakery", limit=3, offset=3)
    assert names(second["items"]) == ["Cake 3", "Cake 4", "Cake 5"]
    last = shop(client, category="Bakery", limit=3, offset=6)
    assert (last["total"], names(last["items"])) == (7, ["Cake 6"])
    # Without a limit every item comes, as the first order page expected.
    assert len(shop(client, category="Bakery")["items"]) == 7
    # The categories are counted over the whole shop, whatever page was asked for.
    assert next(c for c in first["categories"] if c["name"] == "Bakery")["count"] == 7
    assert client.get(STORE, params={"limit": 0}).status_code == 422
    assert client.get(STORE, params={"limit": 5000}).status_code == 422


def test_the_page_takes_three_connections_and_makes_only_the_rows_it_sends(
    client_factory, monkeypatch
):
    """ALY-276 PERF-6: one page took six connections from the pool (the module check twice,
    the shop, the page, the Catalog's switch, the pricing) and made every item's row."""
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    for n in range(6):
        mk(client, name=f"Bun {n}", name_ar=f"كعك {n}", category="Buns", sort=n)
    pool = client.app.state.db.pool
    taken = []
    real_acquire = type(pool).acquire

    def acquire(self, *args, **kwargs):
        taken.append(1)
        return real_acquire(self, *args, **kwargs)

    made = []
    real_row = page_module.public_row

    def public_row(entry, *args, **kwargs):
        made.append(entry.item["name"])
        return real_row(entry, *args, **kwargs)

    monkeypatch.setattr(type(pool), "acquire", acquire)
    monkeypatch.setattr(page_module, "public_row", public_row)
    answer = shop(client, category="Buns", limit=2, offset=2)
    # The module check (the shop by its address, then the module), then the page itself.
    assert len(taken) == 3
    assert names(answer["items"]) == made == ["Bun 2", "Bun 3"]
    assert answer["total"] == 6
    # A search reads every item's words, so it makes every row it searches, not only the
    # one it sends.
    made.clear()
    found = shop(client, q="bun", category="Buns", limit=1)
    assert (names(found["items"]), found["total"]) == (["Bun 0"], 6)
    assert len(made) == 6


def test_scenario_14_arabic_search_finds_the_item_in_any_common_spelling(client):
    kunafa = mk(client, name="Kunafa", name_ar="كنافة", category="Sweets", sku="K-7",
                description_ar="حلوى بالجبن")
    rice = mk(client, name="Basmati rice", name_ar="أرز بسمتي", category="Sweets")
    mk(client, name="Karak", name_ar="كرك", category="Sweets")
    for spelling in ("كنافه", "كنافة", "كَنَافَة", "كنــافة", "KUNAFA", "kunaf", "k-7", "بالجبن"):
        found = names(shop(client, q=spelling, category="Sweets")["items"])
        assert found == ["Kunafa"], spelling
    for spelling in ("ارز", "أرز", "إرز", "ٱرز", "بسمتى", "بسمتي ارز"):
        found = names(shop(client, q=spelling, category="Sweets")["items"])
        assert found == ["Basmati rice"], spelling
    assert shop(client, q="لا يوجد", category="Sweets")["items"] == []
    assert shop(client, q="لا يوجد")["total"] == 0
    # Every word must be found, in the name or anywhere else the customer might look.
    assert names(shop(client, q="كنافه جبن")["items"]) == ["Kunafa"]
    assert names(shop(client, q="rice كنافة")["items"]) == []
    assert row(client, kunafa, q="كنافه")["name_ar"] == "كنافة"
    assert rice["id"] not in [r["id"] for r in shop(client, q="كنافه")["items"]]


# ── stock: tell it only when it is true and small ────────


def test_only_a_few_left_is_told_and_only_when_it_is_true(client):
    plenty = counted(client, 40, name="Plenty", name_ar="كثير", category="Stock")
    few = counted(client, 3, name="Few", name_ar="قليل", category="Stock")
    mk(client, name="Batch", name_ar="دفعة", category="Stock", stock_rule="daily_limit",
       daily_limit=4)
    always = mk(client, name="Made", name_ar="مصنوع", category="Stock", stock_rule="always")
    page = shop(client, category="Stock")
    by_name = {r["name"]: r for r in page["items"]}
    assert by_name["Plenty"]["left"] is None  # it would tell a competitor the shop's stock
    assert by_name["Few"]["left"] == 3 and by_name["Few"]["daily"] is False
    assert by_name["Batch"]["left"] == 4 and by_name["Batch"]["daily"] is True
    assert by_name["Made"]["left"] is None
    # The threshold is the shop's own low-stock number.
    settings(client, low_stock_at=50)
    assert row(client, plenty, category="Stock")["left"] == 40
    settings(client, low_stock_at=0)
    assert row(client, few, category="Stock")["left"] is None
    settings(client, low_stock_at=5)
    # Selling one changes the words; selling out takes them away.
    ahmed = people(client, 1)[0]
    assert order(client, ahmed, [line(few, 3)]).status_code == 200
    gone = next(r for r in shop(client, category="Stock")["unavailable"] if r["id"] == few["id"])
    assert (gone["left"], gone["sold_out"], gone["orderable"]) == (0, True, False)
    assert always["id"]


def test_the_exact_stock_never_leaves_the_server_for_a_well_stocked_item(client):
    counted(client, 31337, name="Heap", name_ar="كومة", category="Stock")
    assert "31337" not in client.get(STORE).text
    assert "31337" not in client.get(STORE, params={"limit": 48}).text
    assert "31337" not in client.post(LIVE, json={"ids": [str(uuid4())]}).text


# ── sold out: greyed or left out ─────────────────────────


def test_a_sold_out_item_is_listed_greyed_or_left_out_as_the_shop_chooses(client):
    tea = mk(client, name="Tea", name_ar="شاي", category="Hot")
    mk(client, name="Coffee", name_ar="قهوة", category="Hot")
    client.post(f"/api/items/{tea['id']}/switch", json={"available": False})
    greyed = shop(client, category="Hot")
    assert names(greyed["items"]) == ["Coffee", "Tea"]
    gone = next(r for r in greyed["items"] if r["name"] == "Tea")
    assert (gone["sold_out"], gone["orderable"], gone["reason"]) == (True, False, "off")
    assert names(greyed["products"]) == ["Coffee"] and names(greyed["unavailable"]) == ["Tea"]
    assert next(c for c in greyed["categories"] if c["name"] == "Hot")["count"] == 2

    settings(client, sold_out_display="hide")
    hidden = shop(client, category="Hot")
    assert names(hidden["items"]) == ["Coffee"] and hidden["total"] == 1
    assert next(c for c in hidden["categories"] if c["name"] == "Hot")["count"] == 1
    # The refresh calls it gone, so a page that has it drops it.
    assert client.post(LIVE, json={"ids": [tea["id"]]}).json()["gone"] == [tea["id"]]


def test_an_item_outside_its_hours_is_always_listed_with_when_it_is_back(client):
    now = datetime.now(QATAR)
    other_days = [d for d in EVERY_DAY if d != (now.weekday() + 1) % 7]
    breakfast = mk(client, name="Breakfast", name_ar="فطور", category="Hours", schedule=[
        {"weekdays": other_days, "opens": "06:00", "closes": "11:00"}])
    settings(client, sold_out_display="hide")
    listed = row(client, breakfast, category="Hours")
    assert listed["orderable"] is False and listed["sold_out"] is False
    assert listed["note"]["en"].startswith("Ready tomorrow from 6 am")
    assert listed["note"]["ar"].startswith("متاح غداً من الساعة 6 ص")


# ── the words for hours, lead times and cut-offs ─────────


def at(day: int, hour: int, minute: int = 0) -> datetime:
    """A moment on the shop's wall clock. 18 Oct 2026 is a Sunday."""
    return datetime(2026, 10, day, hour, minute, tzinfo=QATAR)


def say_it(windows: list[dict], when: datetime, **item) -> dict | None:
    base = {"weekdays": set(range(7)), "opens": None, "closes": None, "lead_days": 0,
            "cutoff": None, "valid_from": None, "valid_to": None, "closed": False}
    entry = Loaded(
        {"status": "live", "stock_rule": "switch", "available": True, **item},
        [{"id": uuid4(), "active": True, "is_default": True, "on_hand": 0, "daily_limit": None,
          "price_delta": 0}],
        [], [{**base, **w} for w in windows], {},
    )
    clock = ShopClock(when, QATAR)
    return notes.note(entry, entry.state(clock), clock)


def test_hours_are_said_the_way_a_customer_says_them():
    breakfast = [{"opens": time(6), "closes": time(11)}]
    assert say_it(breakfast, at(18, 4)) == {
        "en": "Ready from 6 am", "ar": "متاح من الساعة 6 ص"}
    assert say_it(breakfast, at(18, 12)) == {
        "en": "Ready tomorrow from 6 am", "ar": "متاح غداً من الساعة 6 ص"}
    assert say_it(breakfast, at(18, 9)) == {
        "en": "Available until 11 am", "ar": "متاح حتى الساعة 11 ص"}
    evening = [{"opens": time(17, 30), "closes": time(23)}]
    assert say_it(evening, at(18, 10))["en"] == "Ready from 5:30 pm"
    assert say_it(evening, at(18, 10))["ar"] == "متاح من الساعة 5:30 م"
    # Not every day: the day it comes back is named.
    weekdays = [{"weekdays": {1, 2, 3}, "opens": time(6), "closes": time(11)}]  # Mon to Wed
    friday = say_it(weekdays, at(23, 12))  # Fri 23 Oct
    assert friday["en"] == "Ready Mon 26 Oct from 6 am"
    assert friday["ar"] == "متاح الاثنين 26 أكتوبر من الساعة 6 ص"


def test_a_cutoff_and_a_lead_time_are_said_with_the_day_the_order_is_for():
    # "Order before 2 pm for tomorrow": a day ahead, cut-off 2 pm.
    day_ahead = [{"lead_days": 1, "cutoff": time(14)}]
    assert say_it(day_ahead, at(18, 10)) == {
        "en": "Order before 2 pm for tomorrow",
        "ar": "اطلب قبل الساعة 2 م ليكون جاهزاً غداً",
    }
    # Too late today: the next day it can be for, and the cut-off is tomorrow's.
    late = say_it(day_ahead, at(18, 15))
    assert late["en"] == "Order before 2 pm tomorrow for Tue 20 Oct"
    assert late["ar"] == "اطلب قبل الساعة 2 م غداً ليكون جاهزاً الثلاثاء 20 أكتوبر"
    # Same day.
    assert say_it([{"cutoff": time(14)}], at(18, 10))["en"] == "Order before 2 pm for today"
    # A longer lead names the day to order by.
    three = say_it([{"lead_days": 3, "cutoff": time(18), "weekdays": {5}}], at(18, 10))
    assert three["en"] == "Order before 6 pm on Tue 20 Oct for Fri 23 Oct"
    assert three["ar"].startswith("اطلب قبل الساعة 6 م يوم الثلاثاء 20 أكتوبر")
    # A lead with no cut-off.
    ahead = say_it([{"lead_days": 1}], at(18, 10))
    assert ahead["en"] == "Order ahead: next available tomorrow"


def test_no_note_when_there_is_nothing_to_say():
    assert say_it([], at(18, 10)) is None  # no hours at all
    assert say_it([{"opens": time(6)}], at(18, 10)) is None  # open all day from 6
    assert say_it([], at(18, 10), available=False) is None  # sold out: the label says it
    closed = say_it([{"closed": True}], at(18, 10))
    assert closed == {"en": "Not available right now", "ar": "غير متاح حالياً"}


def test_a_made_to_order_item_offers_the_days_it_can_be_ordered_for(client):
    cake = mk(client, name="Cake", name_ar="كيكة", category="Orders", schedule=[
        {"lead_days": 1, "cutoff": "18:00", "weekdays": [0, 1, 2, 3, 4, 6]}])  # not Friday
    shown = row(client, cake, category="Orders")
    assert shown["orderable"] is True
    dates = shown["order_for_dates"]
    assert 1 <= len(dates) <= 14
    assert all("Fri" not in d["label"] for d in dates)
    assert all(d["label_ar"] and d["date"] for d in dates)
    assert shown["note"]["en"].startswith("Order before 6 pm")


# ── photos, in every state ───────────────────────────────


def test_a_photo_is_drawn_from_its_sizes_and_a_missing_or_waiting_one_is_a_tile(client):
    plain = mk(client, name="Plain", name_ar="سادة", category="Photos")
    shot = mk(client, name="Shot", name_ar="مصورة", category="Photos")
    waiting = mk(client, name="Waiting", name_ar="ينتظر", category="Photos")
    broken = mk(client, name="Broken", name_ar="معطلة", category="Photos")
    asset = with_photo(client, shot)
    with_photo(client, waiting, 2)
    with_photo(client, broken, 3)
    owner_sql("update media_assets set state = 'pending' where id <> $1 and id in "
              "(select asset_id from media_links where owner_id = $2)", UUID(asset),
              UUID(waiting["id"]))
    owner_sql("update media_assets set state = 'failed' where id in "
              "(select asset_id from media_links where owner_id = $1)", UUID(broken["id"]))

    cover = {r["name"]: r["cover"] for r in shop(client, category="Photos")["items"]}
    assert cover["Plain"]["state"] == "missing" and cover["Plain"]["src"] == ""
    assert cover["Waiting"]["state"] == "pending" and cover["Waiting"]["srcset"] == ""
    assert cover["Broken"]["state"] == "failed" and cover["Broken"]["w"] is None
    ready = cover["Shot"]
    assert ready["state"] == "ready" and (ready["w"], ready["h"]) == (900, 600)
    assert ready["src"].startswith("/api/media/file/shops/")
    assert [part.split(" ")[1] for part in ready["srcset"].split(", ")] == ["320w", "800w", "900w"]
    assert client.get(ready["src"]).headers["content-type"] == "image/webp"
    assert plain["id"]


def test_one_item_comes_with_every_ready_photo(client):
    item = mk(client, name="Gallery", name_ar="معرض", category="Photos")
    for seed in (1, 2, 3):
        with_photo(client, item, seed)
    one = client.get(f"{STORE}/items/{item['id']}").json()["item"]
    assert len(one["photos"]) == 3 == one["photo_count"]
    assert one["cover"] == one["photos"][0]
    assert client.get(f"{STORE}/items/{uuid4()}").status_code == 404
    client.post(f"/api/items/{item['id']}/status", json={"status": "hidden"})
    assert client.get(f"{STORE}/items/{item['id']}").status_code == 404


# ── sizes, options and prices ────────────────────────────


def test_sizes_show_both_ends_of_their_prices_and_a_sold_out_size_says_so(client):
    abaya = mk(client, name="Abaya", name_ar="عباية", price=25000, stock_rule="count",
               category="Sizes", variants=[
                   {"name": "M", "name_ar": "م", "opening_stock": 3},
                   {"name": "L", "name_ar": "ك", "price_delta": 2000, "opening_stock": 0},
               ])
    shown = row(client, abaya, category="Sizes")
    assert (shown["price"], shown["price_min"], shown["price_max"]) == (25000, 25000, 27000)
    assert shown["needs_choice"] is True and shown["orderable"] is True
    sizes = {v["name"]: v for v in shown["variants"]}
    assert (sizes["M"]["price"], sizes["M"]["left"], sizes["M"]["sold_out"]) == (25000, 3, False)
    assert (sizes["L"]["price"], sizes["L"]["left"], sizes["L"]["sold_out"]) == (27000, 0, True)
    one_size = mk(client, name="Scarf", name_ar="وشاح", price=5000, category="Sizes")
    plain = row(client, one_size, category="Sizes")
    assert (plain["price_min"], plain["price_max"], plain["needs_choice"]) == (5000, None, False)


def test_a_required_choice_makes_the_item_need_a_choice(client):
    pizza = mk(client, name="Pizza", name_ar="بيتزا", price=3000, category="Choices",
               option_groups=[{"name": "Size", "name_ar": "الحجم", "required": True, "options": [
                   {"name": "Small", "name_ar": "صغير", "price_delta": 0},
                   {"name": "Large", "name_ar": "كبير", "price_delta": 800}]}])
    shown = row(client, pizza, category="Choices")
    assert shown["needs_choice"] is True
    group = shown["option_groups"][0]
    assert group["required"] and [o["price_delta"] for o in group["options"]] == [0, 800]
    assert group["options"][1]["price_delta_text"] == "QAR 8"


def test_a_group_price_shows_only_on_the_customers_own_link(client):
    cable = mk(client, name="Cable", name_ar="كابل", price=1000, category="Prices", sale_price=900)
    retail, buyer = people(client, 2)
    group = make_group(client)
    set_price(client, cable, group, 800)
    put_in(client, buyer, group)
    public = row(client, cable, category="Prices")
    assert (public["price"], public["list_price"], public["price_source"]) == (900, 1000, "normal")
    theirs = row(client, cable, category="Prices", t=token(buyer["id"]))
    assert (theirs["price"], theirs["price_source"], theirs["normal_price"]) == (800, "group", 900)
    assert theirs["list_price"] == 900  # crossed out beside it
    other = row(client, cable, category="Prices", t=token(retail["id"]))
    assert other["price"] == 900
    # The refresh and the single item agree with the page.
    live = client.post(LIVE, json={"ids": [cable["id"]], "token": token(buyer["id"])}).json()
    assert live["items"][0]["price"] == 800 and live["group"]["id"] == group["id"]
    one = client.get(f"{STORE}/items/{cable['id']}", params={"t": token(buyer["id"])}).json()
    assert one["item"]["price"] == 800


# ── the refresh ──────────────────────────────────────────


def test_the_refresh_sends_only_what_changes_while_a_customer_looks(client):
    few = counted(client, 4, name="Few", name_ar="قليل", category="Live")
    tea = mk(client, name="Tea", name_ar="شاي", category="Live", price=300)
    first = client.post(LIVE, json={"ids": [few["id"], tea["id"]]}).json()
    assert {r["id"]: r["left"] for r in first["items"]} == {few["id"]: 4, tea["id"]: None}
    assert set(first["items"][0]) >= {"orderable", "sold_out", "note", "left", "price", "variants"}
    assert "name" not in first["items"][0]  # small on purpose
    client.put(f"/api/items/{tea['id']}", json={"price": 350})
    client.post(f"/api/items/{few['id']}/switch", json={"available": False})
    refreshed = client.post(LIVE, json={"ids": [few["id"], tea["id"]]}).json()["items"]
    again = {r["id"]: r for r in refreshed}
    assert (again[few["id"]]["sold_out"], again[few["id"]]["orderable"]) == (True, False)
    assert again[tea["id"]]["price"] == 350
    archived = mk(client, name="Old", name_ar="قديم", category="Live")
    client.delete(f"/api/items/{archived['id']}")
    ghost = str(uuid4())
    answer = client.post(LIVE, json={"ids": [archived["id"], ghost]}).json()
    assert sorted(answer["gone"]) == sorted([archived["id"], ghost]) and answer["items"] == []
    assert client.post(LIVE, json={"ids": []}).status_code == 422
    assert client.post(LIVE, json={"ids": [str(uuid4())] * 201}).status_code == 422


# ── a link's preview ─────────────────────────────────────


def test_a_shared_item_link_previews_its_photo_name_and_price(client):
    item = mk(client, name="Chicken shawarma", name_ar="شاورما دجاج", price=1200,
              category="Mains", description="Grilled, with garlic sauce.")
    with_photo(client, item)
    preview = client.get(f"{STORE}/share", params={"item": item["id"]}).json()
    assert preview["kind"] == "item"
    assert preview["title"] == "Chicken shawarma · QAR 12"
    assert "شاورما دجاج · 12 ر.ق" in preview["description"]
    assert "Grilled, with garlic sauce." in preview["description"]
    assert preview["url"] == f"http://web.test/s/{DEMO_SLUG}?item={item['id']}"
    image = preview["image"]
    # The photo is an absolute, public address at the 800 px size.
    assert image["url"].startswith("http://web.test/api/media/file/shops/")
    assert image["url"].endswith("-800.webp") and (image["width"], image["height"]) == (800, 533)
    assert client.get(image["url"].removeprefix("http://web.test")).status_code == 200
    assert preview["price"] == "QAR 12" and preview["price_ar"] == "12 ر.ق"
    # Always the normal price: a link someone shares is public.
    buyer = people(client, 1)[0]
    group = make_group(client)
    set_price(client, item, group, 700)
    put_in(client, buyer, group)
    assert client.get(f"{STORE}/share", params={"item": item["id"]}).json()["price"] == "QAR 12"


def test_a_range_of_sizes_writes_both_prices_and_never_says_from(client):
    abaya = mk(client, name="Abaya", name_ar="عباية", price=25000, category="Mains", variants=[
        {"name": "M", "name_ar": "م"}, {"name": "L", "name_ar": "ك", "price_delta": 2000}])
    preview = client.get(f"{STORE}/share", params={"item": abaya["id"]}).json()
    assert preview["price"] == "QAR 250 - 270" and preview["price_ar"] == "250 - 270 ر.ق"
    assert "from" not in preview["title"].lower() and "starts" not in preview["description"].lower()


def test_a_category_or_the_shop_previews_with_a_photo_from_inside(client):
    first = mk(client, name="Latte", name_ar="لاتيه", category="Cold drinks")
    mk(client, name="Iced tea", name_ar="شاي مثلج", category="Cold drinks")
    with_photo(client, first)
    category = client.get(f"{STORE}/share", params={"category": "Cold drinks"}).json()
    assert category["kind"] == "category" and category["title"].startswith("Cold drinks")
    assert "Latte" in category["description"] and category["image"]["url"].endswith("-800.webp")
    assert category["url"] == f"http://web.test/s/{DEMO_SLUG}?cat=Cold%20drinks"
    whole = client.get(f"{STORE}/share").json()
    assert whole["kind"] == "shop" and whole["title"] == "Al Noor Electricals"
    assert whole["url"] == f"http://web.test/s/{DEMO_SLUG}"
    # An item that is not on sale falls back to the shop's own preview.
    hidden = mk(client, name="Secret", name_ar="سري", status="hidden")
    assert client.get(f"{STORE}/share", params={"item": hidden["id"]}).json()["kind"] == "shop"
    assert client.get("/api/store/no-such-shop/share").status_code == 404


def test_a_sold_out_item_says_so_in_its_preview(client):
    tea = mk(client, name="Tea", name_ar="شاي", price=300)
    client.post(f"/api/items/{tea['id']}/switch", json={"available": False})
    preview = client.get(f"{STORE}/share", params={"item": tea["id"]}).json()
    assert preview["description"].startswith("Tea is sold out.")


# ── tables ───────────────────────────────────────────────


def test_an_order_from_a_tables_link_carries_the_table_to_staff(client):
    tea = mk(client, name="Tea", name_ar="شاي", price=300)
    ahmed = people(client, 1)[0]
    signed = token(ahmed["id"], table="7")
    page = client.get(STORE, params={"t": signed}).json()
    assert page["table"] == "7"
    placed = client.post(f"{STORE}/orders", json={
        "token": signed, "payment": "link", "items": [line(tea)]}).json()
    assert placed["table"] == "7"
    listed = next(o for o in client.get("/api/orders").json()["orders"]
                  if o["number"] == placed["number"])
    assert listed["table"] == "7"
    tracked = track_of(client, placed)
    assert tracked["table"] == "7" and tracked["total"] == 300
    # A link without a table says none; the table in a public link is only a label.
    plain = client.post(f"{STORE}/orders", json={
        "token": token(ahmed["id"]), "payment": "link", "items": [line(tea)], "table": "3"}).json()
    assert plain["table"] == "3"
    none = client.post(f"{STORE}/orders", json={
        "token": token(ahmed["id"]), "payment": "link", "items": [line(tea)]}).json()
    assert none["table"] == ""
    # The signed table wins over anything typed into the request.
    wins = client.post(f"{STORE}/orders", json={
        "token": signed, "payment": "link", "items": [line(tea)], "table": "99"}).json()
    assert wins["table"] == "7"


def test_a_table_asked_for_in_the_chat_goes_into_the_customers_own_link(client):
    reply = say(client, AHMED_PHONE, "Order table 7")[-1]["body"]
    assert "table 7" in reply
    signed = reply.split("?t=")[1].split()[0]
    assert client.get(STORE, params={"t": signed}).json()["table"] == "7"
    arabic = say(client, AHMED_PHONE, "طلب طاولة ١٢")[-1]["body"]
    assert "طاولة 12" in arabic
    again = arabic.split("?t=")[1].split()[0]
    assert client.get(STORE, params={"t": again}).json()["table"] == "12"
    assert "table" not in say(client, AHMED_PHONE, "order")[-1]["body"]
    assert customer(client)["id"] not in reply


# ── words a customer reads, in Arabic ────────────────────


def test_pack_sizes_are_sold_in_whole_packs_except_for_boxes_and_packs(client):
    nails = mk(client, name="Nails", name_ar="مسامير", price=100, unit="piece", pack_size=12)
    box = mk(client, name="Box of tape", name_ar="علبة شريط", price=900, unit="box", pack_size=12)
    ahmed = people(client, 1)[0]
    refused = order(client, ahmed, [line(nails, 5)])
    assert (refused.status_code, detail(refused)["code"]) == (422, "not_pack_multiple")
    assert detail(refused)["message"] == "Nails is sold in packs of 12. Choose 12."
    assert detail(refused)["message_ar"] == "«مسامير» يُباع في عبوات من 12. اختر 12."
    assert detail(refused)["lines"][0]["suggest"] == 12
    assert order(client, ahmed, [line(nails, 24)]).status_code == 200
    assert order(client, ahmed, [line(box, 5)]).status_code == 200  # a box is already a pack


def test_nothing_the_order_page_says_is_coming_soon_or_in_beta():
    """The founder's rule (D-039): a customer never meets a screen that says a feature is
    coming. This reads every file the order page is made of, in both languages."""
    root = Path(__file__).resolve().parents[3]
    customer = root / "apps" / "web" / "app" / "(product)" / "_customer"
    files = [
        *sorted(customer.rglob("*.ts")), *sorted(customer.rglob("*.tsx")),
        *sorted(customer.rglob("*.css")),
        root / "apps" / "api" / "src" / "alyr" / "modules" / "items" / "notes.py",
        root / "apps" / "api" / "src" / "alyr" / "modules" / "items" / "text.py",
    ]
    assert len(files) > 12
    words = (
        "coming soon", "under development", "beta", "early access", "قريباً", "قريبا",
        "تحت التطوير",
    )
    for path in files:
        written = path.read_text(encoding="utf-8").lower()
        for word in words:
            assert word not in written, f"{path.name} says “{word}”"


def test_the_arabic_a_customer_reads_never_says_qar(client):
    ahmed = customer(client)
    cable = mk(client, name="Cable", name_ar="كابل", price=900_000)
    over = client.post(f"{STORE}/orders", json={
        "token": token(ahmed["id"]), "payment": "account", "items": [line(cable)]})
    assert (over.status_code, detail(over)["code"]) == (409, "over_limit")
    limit = owner_sql("select credit_limit from contacts where id = $1", UUID(ahmed["id"]))[0][0]
    assert f"QAR {limit // 100:,}" in detail(over)["message"]
    assert f"{limit // 100:,} ر.ق" in detail(over)["message_ar"]
    assert "QAR" not in detail(over)["message_ar"]
    stranger_phone = "97455500123"
    say(client, stranger_phone, "hello")
    stranger = customer(client, stranger_phone)
    no_account = client.post(f"{STORE}/orders", json={
        "token": token(stranger["id"]), "payment": "account", "items": [line(cable)]})
    assert detail(no_account)["code"] == "no_account" and detail(no_account)["message_ar"].strip()
    assert "حساب" in detail(no_account)["message_ar"]
    nobody = client.post(f"{STORE}/orders", json={
        "token": token(uuid4()), "payment": "link", "items": [line(cable)]})
    assert (nobody.status_code, detail(nobody)["code"]) == (404, "unknown_customer")
    assert "واتساب" in detail(nobody)["message_ar"]


def test_the_cart_check_names_what_is_wrong_in_both_languages_with_the_numbers(client):
    few = counted(client, 2, name="Few", name_ar="قليل", price=500)
    ahmed = people(client, 1)[0]
    checked = client.post(f"{STORE}/cart/check", json={
        "items": [line(few, 5, expected_price=400)], "token": token(ahmed["id"])}).json()
    bad = checked["lines"][0]
    assert bad["code"] == "not_enough" and bad["max_quantity"] == 2
    assert bad["message"] == "Only 2 of Few left. Please order 2 or fewer."
    assert "2" in bad["message_ar"] and "قليل" in bad["message_ar"]
    price = client.post(f"{STORE}/cart/check", json={
        "items": [line(few, 1, expected_price=400)]}).json()["lines"][0]
    assert (price["code"], price["old_price"], price["new_price"]) == ("price_changed", 400, 500)
    assert "من 4 ر.ق إلى 5 ر.ق" in price["message_ar"]


def test_the_payment_page_says_a_released_order_is_expired(client):
    """The pay page reads `status`; a link whose hold ran out says `expired` (ALY-102)."""
    cake = counted(client, 2, name="Cake", name_ar="كعكة", price=500)
    ahmed = people(client, 1)[0]
    placed = order(client, ahmed, [line(cake)]).json()
    tenant_id, payment_id = placed["pay_url"].split("/pay/")[1].split("/")
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["status"] == "pending"
    owner_sql("update payment_requests set status = 'expired' where id = $1", UUID(payment_id))
    shown = client.get(f"/api/pay/{tenant_id}/{payment_id}").json()
    assert (shown["status"], shown["amount"]) == ("expired", 500)
    assert client.post(f"/api/pay/{tenant_id}/{payment_id}/complete").status_code == 409
