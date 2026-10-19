"""A shop's document settings (ALY-138, spec 011): who is selling, how its documents look, the
logo and the stamp, the colour, the numbering, and the checks on all of it."""

import io
import json

import pytest
from PIL import Image

from documents_support import configured_shop, issue, issued, make_draft
from pdf_support import page_text
from photo_files import located, photo
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


def settings_of(client) -> dict:
    return client.get("/api/documents/settings").json()["settings"]


def test_a_shop_starts_with_arabic_first_a4_and_nothing_extra(client_factory, monkeypatch):
    fresh = configured_shop(client_factory, monkeypatch, seller={})
    s = settings_of(fresh.owner)
    assert (s["languages"], s["default_audience"], s["layout"], s["currency"]) == (
        "ar_en", "consumer", "a4", "QAR")
    assert (s["tax_enabled"], s["tax_rate_bp"], s["agents_may_issue"]) == (False, 0, False)
    assert (s["show_sku"], s["show_bank"], s["show_signature"]) == (False, False, False)
    assert (s["show_discounts"], s["show_alyr_mark"]) == (True, True)
    assert s["brand_color"] is None and s["has_logo"] is False and s["has_stamp"] is False
    assert "logo_png" not in s and "stamp_png" not in s  # the picture never travels in the settings


def test_the_seller_is_what_the_shop_wrote_and_falls_back_on_the_name_it_was_made_with(
    client_factory, monkeypatch
):
    blank = configured_shop(client_factory, monkeypatch, seller={})
    doc = issued(blank.owner, "receipt")
    assert (doc["seller"]["name"], doc["seller"]["name_ar"]) == ("Qirfa Bakery", "مخبز قرفة")
    assert doc["seller"]["registered"] is False


def test_every_setting_is_checked_with_a_message_in_both_languages(shop):
    def refused(**changes):
        answer = shop.owner.put("/api/documents/settings", json=changes)
        assert answer.status_code in (400, 422), (changes, answer.status_code)
        return answer.json()

    assert refused(business_name="x" * 121)["code"] == "text_too_long"
    assert refused(bank_details="x" * 401)["code"] == "text_too_long"
    assert refused(currency="XXX")["code"] == "currency_unknown"
    assert refused(brand_color="blue")["code"] == "colour_invalid"
    assert refused(brand_color="#12")["code"] == "colour_invalid"
    pale = refused(brand_color="#ffee99")
    assert pale["code"] == "colour_too_light" and pale["message_ar"]
    assert refused(terms={"nonsense": {"en": "x"}})["code"] == "kind_unknown"
    assert refused(terms={"invoice": {"en": "x" * 601}})  # a text of a kind is at most 600
    assert refused(layout="a3")  # not one of the three (the request is not even understood)
    assert refused(tax_rate_bp=10001)["code"] == "amount_too_big"
    assert refused(tax_rate_bp=5.5)  # a rate is whole basis points
    # Nothing that was refused was kept.
    assert settings_of(shop.owner)["business_name"] == "Qirfa Bakery"


def test_a_colour_is_kept_in_lower_case_and_can_be_cleared(shop):
    done = shop.owner.put("/api/documents/settings", json={"brand_color": "#1D4F91"})
    assert done.json()["settings"]["brand_color"] == "#1d4f91"
    cleared = shop.owner.put("/api/documents/settings", json={"brand_color": None})
    assert cleared.json()["settings"]["brand_color"] is None


def test_what_is_not_sent_is_not_changed(shop):
    shop.owner.put("/api/documents/settings", json={"show_sku": True, "footer_en": "Thank you"})
    shop.owner.put("/api/documents/settings", json={"layout": "a5"})
    s = settings_of(shop.owner)
    assert (s["show_sku"], s["footer_en"], s["layout"]) == (True, "Thank you", "a5")
    assert s["business_name"] == "Qirfa Bakery"


def test_settings_changes_are_on_the_activity_record_with_who(shop):
    shop.admin.put("/api/documents/settings", json={"layout": "thermal80", "bank_details": "QA58 ..."})
    rows = owner_sql("select action, detail, actor_name from activity where tenant_id = $1 "
                     "and subject = 'document' and action = 'settings_changed'", shop.tenant_id)
    last = rows[-1]
    assert last["actor_name"] == "Admin"
    detail = json.loads(last["detail"])
    changes = {c["field"]: c for c in detail["changes"]}
    assert changes["layout"]["from"] == "a4" and changes["layout"]["to"] == "thermal80"
    # The bank details are written down as changed, never copied onto the record.
    assert changes["bank_details"] == {"field": "bank_details"}
    assert "QA58" not in last["detail"]


# ── the logo and the stamp ────────────────────────────────────────────────────────────────


def upload(client, which, data, content_type="image/jpeg"):
    return client.put(f"/api/documents/settings/{which}", content=data,
                      headers={"content-type": content_type})


def test_a_logo_is_checked_like_a_product_photo_and_kept_as_a_small_png(shop):
    answer = upload(shop.owner, "logo", located(1600, 1000))
    assert answer.status_code == 200, answer.text
    assert answer.json()["settings"]["has_logo"] is True
    sha = answer.json()["settings"]["logo_sha256"]
    assert len(sha) == 64
    [row] = owner_sql("select logo_png from document_settings where tenant_id = $1", shop.tenant_id)
    png = bytes(row["logo_png"])
    with Image.open(io.BytesIO(png)) as image:
        assert image.format == "PNG" and max(image.size) <= 800
        # The camera and the place the photo was taken are gone.
        assert not image.info.get("exif") and b"FakeCam" not in png
    # It is on the next document, by hash, and drawn on its PDF.
    doc = issued(shop.owner)
    assert doc["seller"]["logo_sha256"] == sha
    data = shop.owner.get(f"/api/documents/{doc['id']}/pdf").content
    assert data.count(b"/Subtype /Image") >= 1
    # Taking it away: the shop has none, and the document already issued keeps its own.
    gone = shop.owner.delete("/api/documents/settings/logo")
    assert gone.json()["settings"]["has_logo"] is False
    assert issued(shop.owner)["seller"]["logo_sha256"] is None
    assert shop.owner.get(f"/api/documents/{doc['id']}").json()["document"]["seller"][
        "logo_sha256"] == sha


def test_a_logo_that_is_not_a_plain_picture_is_refused(shop):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>1</script></svg>'
    refused = upload(shop.owner, "logo", svg, "image/svg+xml")
    assert refused.status_code == 415 and refused.json()["code"] == "photo_markup"
    assert upload(shop.owner, "logo", b"not a picture at all").status_code == 415
    assert upload(shop.owner, "logo", b"").status_code == 422
    huge = upload(shop.owner, "logo", b"\xff\xd8\xff" + b"0" * (2 * 1024 * 1024 + 1))
    assert (huge.status_code, huge.json()["code"]) == (413, "image_too_big")
    assert settings_of(shop.owner)["has_stamp"] is False


def test_the_signature_and_stamp_show_only_when_the_shop_asks_for_them(shop):
    assert upload(shop.owner, "stamp", photo(400, 400, 5)).status_code == 200
    plain = issued(shop.owner)
    before = shop.owner.get(f"/api/documents/{plain['id']}/pdf").content
    assert b"/Subtype /Image" not in before
    shop.owner.put("/api/documents/settings", json={"show_signature": True})
    signed = issued(shop.owner)
    after = shop.owner.get(f"/api/documents/{signed['id']}/pdf").content
    assert b"/Subtype /Image" in after
    assert "Signature" in page_text(after) or "التوقيع" in page_text(after)


def test_the_optional_blocks_show_when_asked(shop):
    shop.owner.put("/api/documents/settings", json={
        "show_bank": True, "bank_details": "Qatar National Bank\nQA58 QNBA 0000 0000 0000 1234 5678 9",
        "header_en": "Fresh every morning", "header_ar": "طازج كل صباح",
        "footer_en": "Open daily 6am to 11pm", "footer_ar": "نعمل يوميًا من 6 صباحًا إلى 11 مساءً",
        "show_sku": True, "show_alyr_mark": False})
    draft = make_draft(shop.owner, "invoice", lines=[
        {"description": "Bread", "description_ar": "خبز", "sku": "BR-001", "quantity": "2",
         "unit_price_minor": 350}])
    done = issue(shop.owner, draft["id"]).json()["document"]
    text = page_text(shop.owner.get(f"/api/documents/{done['id']}/pdf").content)
    assert "QA58 QNBA" in text and "Fresh every morning" in text and "Open daily" in text
    assert "BR-001" in text
    assert "Issued with ALYR" not in text and "صدر عبر" not in text


def test_issued_with_alyr_is_on_by_default_and_the_owner_or_an_admin_can_remove_it(shop):
    """The line at the foot is ALYR's, on by default. It is the shop's paper, so the shop can
    take it off: owners and admins only, on the activity record, on every layout. (English
    business paper, so the read-back of the text is plain.)"""
    shop.owner.put("/api/documents/settings", json={"default_audience": "business",
                                                    "languages": "en"})

    def mark_on(document_id: str) -> bool:
        return "Issued with ALYR" in page_text(
            shop.owner.get(f"/api/documents/{document_id}/pdf").content)

    assert settings_of(shop.owner)["show_alyr_mark"] is True
    first = issued(shop.owner)
    assert mark_on(first["id"])
    shop.owner.put("/api/documents/settings", json={"layout": "thermal80"})
    assert mark_on(issued(shop.owner)["id"])
    shop.owner.put("/api/documents/settings", json={"layout": "a4"})

    # An agent cannot change it.
    assert shop.agent.put("/api/documents/settings", json={"show_alyr_mark": False}
                          ).status_code == 403
    assert settings_of(shop.owner)["show_alyr_mark"] is True

    # An admin can, and it is written down with who and from-to.
    assert shop.admin.put("/api/documents/settings", json={"show_alyr_mark": False}
                          ).status_code == 200
    rows = owner_sql("select detail, actor_name from activity where tenant_id = $1 and "
                     "subject = 'document' and action = 'settings_changed'", shop.tenant_id)
    changes = {c["field"]: c for c in json.loads(rows[-1]["detail"])["changes"]}
    assert rows[-1]["actor_name"] == "Admin"
    assert changes["show_alyr_mark"]["from"] is True and changes["show_alyr_mark"]["to"] is False

    # Gone from new paper on both layouts; paper issued before keeps what it had.
    assert not mark_on(issued(shop.owner)["id"])
    shop.owner.put("/api/documents/settings", json={"layout": "thermal80"})
    assert not mark_on(issued(shop.owner)["id"])
    assert mark_on(first["id"])

    # And the owner can put it back.
    shop.owner.put("/api/documents/settings", json={"show_alyr_mark": True})
    assert mark_on(issued(shop.owner)["id"])
