"""Text PostgreSQL cannot store is refused with a 422 before any route runs (pen test 25 Nov,
F-07 and F-08; core/text_input.py). Whole emoji and Arabic still save."""

import json

from alyr.core.text_input import unsavable


def _item(name: str) -> dict:
    return {"name": name, "name_ar": "كعكة", "price": 1, "status": "live"}


def _post(client, path: str, body: dict):
    """JSON as a browser's script sends it, with every non-ASCII character escaped (httpx's own
    encoder cannot write half a surrogate pair)."""
    return client.post(path, content=json.dumps(body), headers={"Content-Type": "application/json"})


def test_a_nul_character_is_refused_with_a_422_and_nothing_is_saved(client):
    before = client.get("/api/items").json()
    refused = client.post("/api/items", json=_item("a\u0000b"))
    assert refused.status_code == 422
    assert refused.json()["detail"]["code"] == "unsavable_text"
    assert refused.json()["detail"]["message_ar"]
    assert client.get("/api/items").json() == before


def test_half_an_emoji_is_refused_anywhere_in_the_body(client):
    for body in (
        _item("A\ud800B"),
        {"document": {"kind": "invoice", "customer": {"name": "A\ud800B"}}},
        {"lines": [{"note": "x\udfffy"}]},
        {"key\u0000": "value"},
    ):
        answer = _post(client, "/api/documents/preview", body)
        assert answer.status_code == 422, body
        assert answer.json()["detail"]["code"] == "unsavable_text"


def test_whole_emoji_arabic_and_a_written_backslash_u_still_save(client):
    # r"a\u0000b" is the six characters a person typed, backslash included, not a NUL.
    for name in ("Cake 🎂", "كيك شوكولاتة", r"a\u0000b", "smile \U0001f600"):
        saved = _post(client, "/api/items", _item(name))
        assert saved.status_code in (200, 201), (name, saved.text)


def test_nul_in_the_address_is_refused(client):
    assert client.get("/api/items?q=a%00b").status_code == 422


def test_the_check_itself():
    assert unsavable({"a": ["ok", {"b": "x\x00"}]})
    assert unsavable("\ud83d")
    assert not unsavable({"a": ["ok", "😀", 1, None, True]})


def test_webhooks_are_left_to_their_own_route(client):
    # Meta would only send a refused message again; the route answers (here: no signature).
    answer = _post(client, "/webhooks/whatsapp", {"entry": [{"text": "a\u0000b"}]})
    assert answer.status_code != 422
