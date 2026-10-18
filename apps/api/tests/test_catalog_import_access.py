"""Who may import and export the Catalog, which shop sees what, and that the module stays
hidden (ALY-108). The helpers are in test_catalog_import.py."""

from uuid import UUID

import pytest

from alyr.modules.items import columns, exports, import_words, xlsx
from test_catalog_import import (
    BASIC,
    OCTET,
    apply_import,
    do_import,
    items_of,
    join_shop,
    new_shop,
    preview_of,
    table,
    upload,
    xlsx_of,
)
from test_consent import owner_sql
from test_sign_in import sign_in


def tea_rows():
    return table(BASIC, ["Tea", "شاي", "D", 3])


def test_everyone_on_the_team_can_download_but_only_editors_can_import(client):
    shop = new_shop(client)
    done = do_import(client, tea_rows())
    shown = preview_of(client, xlsx_of(table(BASIC, ["Cake", "كيك", "S", 9])))

    join_shop(client, shop, "agent")
    assert client.get("/api/items/export").status_code == 200
    arabic_csv = client.get("/api/items/export", params={"format": "csv", "lang": "ar"})
    assert arabic_csv.status_code == 200
    assert client.get("/api/items/import/template").status_code == 200
    assert client.get("/api/items/import/kinds").status_code == 200
    assert client.get("/api/items/import/recent").status_code == 200
    assert client.get(f"/api/items/import/{done['id']}").status_code == 200
    for call in (
        lambda: upload(client, xlsx_of(tea_rows())),
        lambda: client.post(f"/api/items/import/{shown['id']}/options",
                            json={"on_duplicate": "skip"}),
        lambda: client.put(f"/api/items/import/{shown['id']}/photos", content=b"PK", headers=OCTET),
        lambda: client.delete(f"/api/items/import/{shown['id']}/photos"),
        lambda: apply_import(client, shown),
        lambda: client.delete(f"/api/items/import/{shown['id']}"),
        lambda: client.post("/api/items/import/undo"),
    ):
        refused = call()
        assert refused.status_code == 403, refused.text
    assert [i["name"] for i in items_of(client)] == ["Tea"]

    # The owner allows agents to edit items, and the same agent may import.
    client.cookies.clear()
    sign_in(client, shop["email"])
    assert client.put("/api/items/settings", json={"agents_edit_items": True}).status_code == 200
    join_shop(client, shop, "agent")
    assert apply_import(client, shown).status_code == 200
    assert sorted(i["name"] for i in items_of(client)) == ["Cake", "Tea"]
    assert client.post("/api/items/import/undo").status_code == 200

    # An admin always may.
    join_shop(client, shop, "admin")
    assert upload(client, xlsx_of(tea_rows())).status_code == 200


def test_the_import_and_export_answer_only_where_the_catalog_is_on(client):
    shop = new_shop(client)
    owner_sql("update tenant_modules set enabled = false where tenant_id = $1", shop["tenant"])
    for call in (
        lambda: client.get("/api/items/export"),
        lambda: client.get("/api/items/import/template"),
        lambda: client.get("/api/items/import/kinds"),
        lambda: client.get("/api/items/import/last"),
        lambda: upload(client, xlsx_of(tea_rows())),
    ):
        assert call().status_code == 403
    owner_sql("update tenant_modules set enabled = true where tenant_id = $1", shop["tenant"])
    assert client.get("/api/items/export").status_code == 200


def test_signing_in_is_required_when_the_open_demo_is_off(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    for call in (
        lambda: client.get("/api/items/export"),
        lambda: client.get("/api/items/import/template"),
        lambda: client.post("/api/items/import", content=b"x", headers=OCTET),
        lambda: client.post("/api/items/import/undo"),
    ):
        assert call().status_code == 401


def test_one_shop_cannot_see_preview_apply_discard_or_undo_anothers_imports(client):
    mine = new_shop(client)
    preview_theirs = preview_of(client, xlsx_of(tea_rows()))
    done = do_import(client, table(BASIC, ["Cake", "كيك", "S", 9]))
    other = new_shop(client)
    for call in (
        lambda: client.get(f"/api/items/import/{preview_theirs['id']}"),
        lambda: apply_import(client, preview_theirs),
        lambda: client.delete(f"/api/items/import/{preview_theirs['id']}"),
        lambda: client.post(f"/api/items/import/{preview_theirs['id']}/options",
                            json={"on_duplicate": "skip"}),
        lambda: client.delete(f"/api/items/import/{preview_theirs['id']}/photos"),
        lambda: client.get(f"/api/items/import/{done['id']}"),
    ):
        assert call().status_code == 404
    assert client.get("/api/items/import/last").json() == {"last": None}
    assert client.get("/api/items/import/recent").json() == {"imports": []}
    assert client.post("/api/items/import/undo").status_code == 404
    assert client.get("/api/items/export").status_code == 200
    assert xlsx_rows(client)[1:] == []     # their export holds nothing of this shop's
    # ... and nothing of theirs was touched.
    assert owner_sql("select status from item_imports where id = $1",
                     UUID(preview_theirs["id"]))[0]["status"] == "preview"
    assert owner_sql("select count(*) as n from items where tenant_id = $1",
                     mine["tenant"])[0]["n"] == 1
    assert other["tenant"] != mine["tenant"]


def xlsx_rows(client):
    return xlsx.read(client.get("/api/items/export").content).rows


def test_old_and_surplus_previews_are_cleared_and_applied_imports_are_kept(client):
    shop = new_shop(client)
    first = preview_of(client, xlsx_of(tea_rows()))
    owner_sql("update item_imports set created_at = now() - interval '2 days' where id = $1",
              UUID(first["id"]))
    done = do_import(client, table(BASIC, ["Cake", "كيك", "S", 9]))
    owner_sql("update item_imports set created_at = now() - interval '9 days' where id = $1",
              UUID(done["id"]))
    previews = [preview_of(client, xlsx_of(tea_rows()))["id"] for _ in range(12)]
    left = owner_sql("select id, status from item_imports where tenant_id = $1", shop["tenant"])
    assert sorted(str(r["id"]) for r in left if r["status"] == "preview") == sorted(previews[-10:])
    assert [str(r["id"]) for r in left if r["status"] == "applied"] == [done["id"]]
    assert client.get(f"/api/items/import/{first['id']}").status_code == 404


def test_the_options_are_checked(client):
    new_shop(client)
    assert upload(client, xlsx_of(tea_rows()), on_duplicate="merge").status_code == 422
    shown = preview_of(client, xlsx_of(tea_rows()))
    assert client.post(f"/api/items/import/{shown['id']}/options",
                       json={"on_duplicate": "merge"}).status_code == 422


def test_nothing_the_import_says_or_hands_out_is_labelled_coming_or_beta():
    """The Catalog stays hidden until go-live; what it says when it appears never promises
    what is not there (D-039)."""
    words = ("coming soon", "soon", "beta", "under development", "early access", "قريباً", "قريبا")
    texts = []
    for message in import_words.MESSAGES.values():
        texts += message[1:]
    for kind in columns.KINDS:
        texts += [kind.name.en, kind.name.ar, kind.note.en, kind.note.ar]
    for column in columns.COLUMNS:
        texts += [column.hint.en, column.hint.ar]
    for line in exports.INSTRUCTIONS["lines"]:
        texts += list(line)
    for text in texts:
        lowered = text.lower()
        assert not any(w in lowered for w in words), text


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_every_message_has_both_languages_and_fills_in_its_details(lang):
    for code, (level, english, arabic) in import_words.MESSAGES.items():
        assert level in ("error", "warning", "info") and english and arabic, code
    sample = {
        "value": "abc", "max": 5, "max_tags": 20, "low": 1, "high": 9, "rows": "4, 5", "limit": 7,
        "other": "Tea", "start": "=", "group": "unit", "message": "m", "message_ar": "م",
    }
    for code in import_words.MESSAGES:
        found = import_words.issue(code, "price", **sample)
        sentence = import_words.say(found, lang)
        assert sentence and "{" not in sentence and "}" not in sentence, code
        if lang == "ar":
            assert any(0x600 <= ord(ch) <= 0x6FF for ch in sentence), code
