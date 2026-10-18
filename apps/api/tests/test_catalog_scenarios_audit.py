"""What the scenario audit of ALY-110 found without a test of its own (specs/009-catalog-
scenarios/spec.md has the table of all 30).

The photo store being down (scenario 25) was tested for the photo (it waits and retries, the
item still works) but never for what the plan says: that *orders keep working with placeholder
tiles*. This does it through the customer's real path.
"""

from photo_files import photo
from test_catalog_screens import put_photo
from test_items import counted, drain, fresh, line, on_hand, order, pay, people, reconciled
from test_media import Switchable, make_due, upload
from test_order_page import shop


def cover_of(client, name: str) -> dict:
    return next(r for r in shop(client, category="Photos")["items"] if r["name"] == name)["cover"]


def test_scenario_25_orders_keep_working_with_a_placeholder_while_the_photo_store_is_down(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "3600")
    client = client_factory()
    store = Switchable(client.app.state.media.store.root)
    client.app.state.media.store = store
    item = counted(client, 3, name="Kunafa", name_ar="كنافة", category="Photos")

    store.down = True
    waiting = upload(client, photo(800, 600, 6))
    assert waiting.status_code == 202  # taken in, to be written when the store is back
    assert put_photo(client, item, waiting.json()["photo"]["id"]).status_code in (200, 201)

    # What the customer sees: the dish with a drawn tile, never a broken picture.
    cover = cover_of(client, "Kunafa")
    assert cover["state"] == "pending" and cover["srcset"] == ""
    # What the owner sees in the Catalog: the same placeholder.
    assert fresh(client, item)["cover"]["state"] == "pending"

    # The customer orders and pays; the stock moves and the log adds up; nothing waits for the store.
    placed = order(client, people(client)[0], [line(item, 2)])
    assert placed.status_code == 200, placed.text
    assert pay(client, placed.json()).json() == {"status": "paid"}
    assert on_hand(client, item) == 1 and reconciled(client)

    # The store comes back: the photo is written without anyone uploading it again, the page
    # uses it, and the order is as it was.
    store.down = False
    make_due()
    drain(client)
    assert cover_of(client, "Kunafa")["state"] == "ready"
    assert on_hand(client, item) == 1 and reconciled(client)
