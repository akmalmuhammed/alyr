"""An order shop's welcome (ALY-272).

A bakery, a restaurant or a shop answered "hello" with "We will reply shortly", so a first
customer had to know to type "menu". Now a greeting, or the first message in 12 hours, gets
the shop's name, the customer's order link and the menu; a question after it gets the
acknowledgement, not the same welcome again. Through the owner's test line: the real inbound
path, the simulator and HTTP."""

from test_consent import owner_sql
from test_onboarding import BASE, new_business

ACK = "Thanks for your message. We will reply shortly."


def say(client, text: str = "", reply_id: str = "") -> dict:
    body = {"reply_id": reply_id} if reply_id else {"text": text}
    return client.post(f"{BASE}/test-chat", json=body).json()["messages"][-1]


def order_shop(client):
    tenant, slug, name = new_business(client, kind="shop")
    made = client.post("/api/items", json={
        "name": "Tea tin", "name_ar": "علبة شاي", "price": 1200, "status": "live",
    })
    assert made.status_code in (200, 201), made.text
    return tenant, slug, name


def titles(message: dict) -> list[str]:
    return [c["title"] for c in message["payload"].get("choices", [])]


def test_hello_gets_the_shop_its_order_link_and_the_menu(client):
    _, slug, name = order_shop(client)
    welcome = say(client, "hello")
    assert welcome["body"].startswith(f"Welcome to {name}. You can order here: ")
    assert f"/s/{slug}?t=" in welcome["body"] and "?c=" not in welcome["body"]
    assert "reply shortly" not in welcome["body"]
    assert titles(welcome) == ["See the menu"]


def test_marhaba_gets_it_in_arabic_and_the_language_is_remembered(client):
    tenant, slug, _ = order_shop(client)
    welcome = say(client, "مرحبا")
    assert welcome["body"].startswith("أهلاً بك في حلاق السد. تقدر تطلب من هنا: ")
    assert f"/s/{slug}?t=" in welcome["body"]
    assert titles(welcome) == ["القائمة"]
    assert say(client, "السلام عليكم")["body"].startswith("أهلاً بك في")
    langs = owner_sql(
        "select lang from contacts where tenant_id = $1 and wa_user_id like 'TEST.%'", tenant
    )
    assert [r["lang"] for r in langs] == ["ar"]


def test_the_menu_button_lists_what_is_on_sale(client):
    order_shop(client)
    say(client, "hi")
    menu = say(client, reply_id="menu")
    assert any("Tea tin" in title for title in titles(menu))


def test_the_menu_button_with_nothing_on_sale_sends_the_order_link(client):
    tenant, slug, _ = order_shop(client)
    owner_sql(
        "update items set status = 'hidden' where tenant_id = $1 and status = 'live'", tenant
    )
    say(client, "hello")
    answer = say(client, reply_id="menu")
    assert answer["body"].startswith("Here is our order page.")
    assert f"/s/{slug}?t=" in answer["body"]


def test_a_first_message_that_is_a_question_gets_the_welcome_too(client):
    _, _, name = order_shop(client)
    assert say(client, "Do you deliver to Wakra?")["body"].startswith(f"Welcome to {name}.")


def test_a_question_after_the_welcome_is_acknowledged_not_welcomed_again(client):
    order_shop(client)
    say(client, "hello")
    assert say(client, "Do you deliver to Wakra?")["body"] == ACK
    # A greeting is always welcomed, however recent the last welcome.
    assert say(client, "Hello!")["body"].startswith("Welcome to")


def test_a_booking_business_keeps_its_own_menu(client):
    _, _, name = new_business(client)  # a salon: bookings, and the Catalog for its products
    menu = say(client, "hello")
    assert menu["body"] == f"Welcome to {name}. How can we help?"
    assert titles(menu) == ["Book a visit", "My booking", "Prices"]
