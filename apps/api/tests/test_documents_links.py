"""The hosted page of an issued document and its link (ALY-139): signed, made for this page only,
shop-bound, with a life of its own, no bare IDs, and a calm answer for a link that does not work.
The same pattern as the order and booking links (ALY-112, ALY-133), tested the same way.
"""

import json
import re
import time
from uuid import UUID, uuid4

import pytest

from alyr.core import links
from documents_sales_support import (
    customer,
    documents,
    pay_by_link,
    placed,
    run_in_app,
    sales_shop,
)
from order_links import booking_token
from test_consent import owner_sql

DAY = 86400


@pytest.fixture
def paid(client_factory, monkeypatch):
    """A shop with one paid order: its receipt, a link to it, and the customer."""
    shop = sales_shop(client_factory, monkeypatch)
    who = customer(shop, "Huda Al-Naimi", email=None)
    pay_by_link(shop, placed(shop, who))
    [receipt] = documents(shop)
    return shop, who, receipt, mint(shop, receipt["id"])


def mint(shop, doc_id, **more) -> str:
    return links.mint(shop.tenant_id, UUID(str(doc_id)), purpose=links.DOCUMENT, **more)


def page(shop, slug=None, token=None, header=True):
    path = f"/api/d/{slug or shop.slug}"
    if token is None:
        return shop.owner.get(path)
    return shop.owner.get(path, headers={"X-Order-Link": token}) if header \
        else shop.owner.get(path, params={"t": token})


def pdf(shop, token, slug=None, header=True):
    path = f"/api/d/{slug or shop.slug}/pdf"
    if token is None:
        return shop.owner.get(path)
    return shop.owner.get(path, headers={"X-Order-Link": token}) if header \
        else shop.owner.get(path, params={"t": token})


# ------------------------------------------------------------ a good link


def test_a_good_link_shows_the_document_and_nothing_about_the_customer(paid):
    shop, who, receipt, token = paid
    answer = page(shop, token=token)
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["link"] == {"state": "ok", "message": "", "message_ar": ""}
    assert body["shop"] == {"name": "Qirfa Bakery", "name_ar": "مخبز قرفة"}
    doc = body["document"]
    assert (doc["kind"], doc["number"], doc["status"]) == ("receipt", "RC-0001", "issued")
    assert doc["title"] == {"en": "Receipt", "ar": "إيصال"}
    assert doc["totals"]["total_minor"] == doc["totals"]["paid_minor"] == 4200
    assert doc["lines"][0]["description"] == "Fresh Arabic bread"
    assert doc["lines"][0]["description_ar"] == "خبز عربي طازج"
    assert doc["payments"][0]["method"] == {"en": "Payment link", "ar": "رابط دفع"}
    assert doc["lead"] == "ar" and doc["seller"]["name_ar"] == "مخبز قرفة"
    # Nothing that names a person, a contact, a number, a branch, a staff member or the record.
    text = json.dumps(body, ensure_ascii=False)
    for secret in (who.name, who.phone, who.id, "content_hash", "issued_by", "Owner", "contact",
                   "customer", "branch", "pdf_sha256", str(receipt["id"])):
        assert secret not in text, secret


def test_the_page_is_private_and_not_indexed(paid):
    shop, _, _, token = paid
    answer = page(shop, token=token)
    assert answer.headers["cache-control"] == "private, no-store"
    assert answer.headers["x-robots-tag"] == "noindex, nofollow"
    assert answer.headers["vary"] == "X-Order-Link"
    assert pdf(shop, token).headers["x-robots-tag"] == "noindex, nofollow"


def test_the_pdf_is_the_stored_document_byte_for_byte(paid):
    shop, _, receipt, token = paid
    answer = pdf(shop, token)
    assert answer.status_code == 200
    stored = owner_sql("select content from document_files where document_id = $1", receipt["id"])[0]["content"]
    assert answer.content == bytes(stored) and answer.content.startswith(b"%PDF")
    assert answer.headers["content-type"] == "application/pdf"
    assert answer.headers["content-disposition"] == 'attachment; filename="RC-0001.pdf"'
    assert answer.headers["cache-control"] == "private, no-store"
    assert answer.headers["x-content-type-options"] == "nosniff"
    assert answer.headers["referrer-policy"] == "no-referrer"


def test_the_token_is_read_from_the_header_and_from_the_address_for_a_tool(paid):
    shop, _, _, token = paid
    assert page(shop, token=token, header=False).json()["link"]["state"] == "ok"
    assert pdf(shop, token, header=False).status_code == 200


def test_a_cancelled_document_still_opens_and_says_which_credit_note_cancelled_it(paid):
    shop, _, receipt, token = paid
    shop.owner.post(f"/api/documents/{receipt['id']}/cancel", json={"reason": "Wrong order"})
    doc = page(shop, token=token).json()["document"]
    assert (doc["status"], doc["voided_by"]) == ("void", "CN-0001")
    note = documents(shop, kind="credit_note")[0]
    seen = page(shop, token=mint(shop, note["id"])).json()["document"]
    assert (seen["kind"], seen["against"]) == ("credit_note", "RC-0001")


def test_the_link_in_the_message_the_customer_got_is_the_link_that_works(paid, client_factory):
    shop, who, receipt, _ = paid
    from documents_sales_support import document_messages

    [message] = document_messages(who)
    url = re.search(r"http://web\.test/d/(\S+)\?t=(\S+) \.", message["body"])
    assert url, message["body"]
    slug, token = url.groups()
    assert slug == shop.slug
    good = page(shop, token=token)
    assert good.json()["document"]["number"] == "RC-0001"
    assert pdf(shop, token).status_code == 200
    # It runs out when the settings say: ninety days, not the order link's sixty.
    expires = owner_sql("select link_expires_at, created_at from document_deliveries where tenant_id = $1",
                        shop.tenant_id)[0]
    assert 89 * DAY < (expires["link_expires_at"] - expires["created_at"]).total_seconds() < 91 * DAY
    assert links.read(token, shop.tenant_id, purpose=links.DOCUMENT).expires_at - time.time() < 91 * DAY


# ------------------------------------------------------------ a link that does not work


def refused(answer, state, code):
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["document"] is None
    assert body["link"]["state"] == state
    assert body["link"]["message"] and body["link"]["message_ar"]
    assert "ask the shop" in body["link"]["message"].lower()
    assert "المتجر" in body["link"]["message_ar"]


def test_no_link_shows_no_document(paid):
    shop, *_ = paid
    answer = page(shop)
    assert answer.status_code == 200 and answer.json()["document"] is None
    assert answer.json()["link"]["state"] == "none"
    refused_pdf = pdf(shop, None)
    assert (refused_pdf.status_code, refused_pdf.json()["detail"]["code"]) == (403, "bad_link")


def test_an_expired_link_says_so_kindly_and_gives_no_document(paid):
    shop, _, receipt, _ = paid
    old = mint(shop, receipt["id"], now=time.time() - 100 * DAY)         # a 90-day life, 100 days ago
    refused(page(shop, token=old), "expired", "expired_link")
    answer = pdf(shop, old)
    assert (answer.status_code, answer.json()["detail"]["code"]) == (403, "expired_link")
    assert answer.json()["detail"]["message_ar"]


def test_a_link_just_inside_its_life_still_works(paid):
    shop, _, receipt, _ = paid
    almost = mint(shop, receipt["id"], now=time.time() - 89 * DAY)
    assert page(shop, token=almost).json()["document"]["number"] == "RC-0001"


def test_an_edited_link_is_not_valid(paid):
    shop, _, receipt, token = paid
    body, _, mac = token.partition(".")
    flipped = body + "." + ("A" if mac[0] != "A" else "B") + mac[1:]
    refused(page(shop, token=flipped), "invalid", "bad_link")
    assert pdf(shop, flipped).json()["detail"]["code"] == "bad_link"
    # The ID of another document put in the same envelope.
    other = mint(shop, uuid4())
    swapped = other.partition(".")[0] + "." + mac
    refused(page(shop, token=swapped), "invalid", "bad_link")
    for junk in ("x", "a.b", "." + mac, body + ".", "💥", "A" * 250):
        # In the address, because a header can only carry ASCII.
        assert page(shop, token=junk, header=False).json()["document"] is None, junk


def test_a_bare_document_id_opens_nothing(paid):
    shop, _, receipt, _ = paid
    refused(page(shop, token=str(receipt["id"])), "invalid", "bad_link")
    assert pdf(shop, str(receipt["id"])).status_code == 403
    assert shop.owner.get(f"/api/d/{shop.slug}/{receipt['id']}").status_code == 404
    assert shop.owner.get(f"/api/d/{receipt['id']}").status_code == 404
    assert shop.owner.get(f"/api/d/{shop.slug}", params={"id": str(receipt["id"])}).json()["document"] is None


def test_an_order_link_forwarded_to_someone_opens_no_document(paid):
    shop, who, _, _ = paid
    refused(page(shop, token=who.token), "invalid", "bad_link")
    assert pdf(shop, who.token).status_code == 403
    refused(page(shop, token=booking_token(who.id, shop.tenant_id)), "invalid", "bad_link")


def test_a_token_with_the_documents_id_but_made_for_another_page_opens_nothing_here(paid):
    shop, _, receipt, _ = paid
    for purpose in (links.ORDER, links.BOOKING):
        made = links.mint(shop.tenant_id, UUID(str(receipt["id"])), purpose=purpose)
        refused(page(shop, token=made), "invalid", "bad_link")


def test_a_document_link_opens_nothing_on_the_order_or_booking_pages(paid):
    shop, _, receipt, token = paid
    store = shop.owner.get(f"/api/store/{shop.slug}", headers={"X-Order-Link": token})
    assert store.status_code == 200 and store.json()["link"]["state"] == "invalid"
    assert store.json().get("customer") in (None, {}) or store.json()["customer"] is None
    booking = shop.owner.get(f"/api/book/{shop.slug}", headers={"X-Order-Link": token})
    assert booking.json()["link"]["state"] == "invalid" and booking.json()["customer"] is None
    posted = shop.owner.post(f"/api/store/{shop.slug}/orders", json={
        "token": token, "payment": "link", "items": [{"product_id": str(uuid4()), "quantity": 1}]})
    assert posted.status_code == 403 and posted.json()["detail"]["code"] == "bad_link"


def test_a_link_for_one_shop_opens_nothing_at_another(client_factory, monkeypatch):
    mine = sales_shop(client_factory, monkeypatch)
    theirs = sales_shop(client_factory, monkeypatch)
    pay_by_link(mine, placed(mine, customer(mine)))
    pay_by_link(theirs, placed(theirs, customer(theirs)))
    [mine_doc], [their_doc] = documents(mine), documents(theirs)
    token = mint(mine, mine_doc["id"])
    # At the other shop's address, the token is worthless...
    refused(page(theirs, token=token), "invalid", "bad_link")
    assert pdf(theirs, token).status_code == 403
    # ...and a token for the other shop's document, signed for them, cannot be used at mine.
    refused(page(mine, token=mint(theirs, their_doc["id"])), "invalid", "bad_link")
    # Even a token signed for my shop that names their document finds nothing: row-level security.
    forged = links.mint(mine.tenant_id, UUID(str(their_doc["id"])), purpose=links.DOCUMENT)
    refused(page(mine, token=forged), "invalid", "bad_link")
    assert pdf(mine, forged).status_code == 403


def test_a_draft_is_not_a_document_and_has_no_page(paid):
    shop, *_ = paid
    draft = shop.owner.post("/api/documents", json={
        "kind": "invoice", "customer": {"name": "Salem"},
        "lines": [{"description": "Cake", "quantity": "1", "unit_price_minor": 1000}]}).json()["document"]
    refused(page(shop, token=mint(shop, draft["id"])), "invalid", "bad_link")
    assert pdf(shop, mint(shop, draft["id"])).status_code == 403


def test_an_unknown_shop_is_not_found_and_a_shop_without_the_module_has_no_page(client_factory, monkeypatch, paid):
    shop, _, _, token = paid
    assert page(shop, slug="no-such-shop-here", token=token).status_code == 404
    assert pdf(shop, token, slug="no-such-shop-here").status_code == 404
    owner_sql("update tenant_modules set enabled = false where tenant_id = $1 and module_key = 'documents'",
              shop.tenant_id)
    assert page(shop, token=token).status_code == 404
    assert pdf(shop, token).status_code == 404


def test_the_link_secret_is_the_one_all_links_share_but_the_purpose_is_inside_the_signature(paid):
    """A token cannot be turned from one page's into another's by changing its purpose byte."""
    shop, _, receipt, token = paid
    import base64

    body, _, mac = token.partition(".")
    raw = bytearray(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    raw[1] = 1                                      # claim it is an order link
    spoof = base64.urlsafe_b64encode(bytes(raw)).rstrip(b"=").decode() + "." + mac
    with pytest.raises(links.LinkError) as caught:
        links.read(spoof, shop.tenant_id, purpose=links.ORDER)
    assert caught.value.code == "bad_signature"
    refused(page(shop, token=spoof), "invalid", "bad_link")


def test_the_page_reads_the_document_inside_the_shop_it_was_asked_in(paid):
    """The same token read in the app's own scope for another shop finds no row."""
    shop, _, receipt, _ = paid
    from alyr.modules.documents import public

    found = run_in_app(shop.owner, shop.tenant_id, lambda conn: public.page(conn, UUID(str(receipt["id"]))))
    assert found["number"] == "RC-0001"
    fresh = owner_sql("insert into tenants (name) values ('Elsewhere') returning id")[0]["id"]
    nothing = run_in_app(shop.owner, fresh, lambda conn: public.page(conn, UUID(str(receipt["id"]))))
    assert nothing is None
