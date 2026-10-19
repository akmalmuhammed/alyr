"""The three document templates, written for WhatsApp and not submitted (ALY-139): their wording
follows Meta's rules and the utility category, their sample documents are real PDFs the engine
draws, and the sync knows how to create a template that opens with a document.
"""

import re

import pytest

from alyr import document_samples, templates_sync
from alyr.core import templates
from alyr.modules.documents import delivery_words, kinds
from pdf_support import has_letters, page_text

NAMES = ("document_receipt", "document_invoice", "document_credit_note")
# Words that make a message a promotion. A template that carries a customer's own paper is
# utility; one that sells would be refiled by Meta as marketing.
PROMOTIONAL = ("offer", "discount", "sale", "deal", "free", "promo", "% off", "save", "limited",
               "عرض", "خصم", "مجاني", "تخفيض", "وفّر")


@pytest.mark.parametrize("name", NAMES)
def test_each_is_a_utility_template_that_opens_with_a_document(name):
    template = templates.CATALOGUE[name]
    assert template.category == "utility"
    assert template.header == "document" and "{lang}" in template.header_sample
    assert template.consent == ""                       # general service consent, like the others
    assert len(template.samples) == len(template.samples_ar) == 4


@pytest.mark.parametrize("name", NAMES)
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_the_wording_has_enough_words_around_its_blanks_and_nothing_promotional(name, lang):
    template = templates.CATALOGUE[name]
    text = template.en if lang == "en" else template.ar
    others = [w for w in re.sub(r"\{\{\d\}\}", " ", text).split() if w != "."]
    assert len(others) >= 10, (name, lang, len(others))     # Meta refused three blanks in too few words
    assert not any(p in text.lower() for p in PROMOTIONAL), (name, lang)
    assert not text.startswith("{{") and not text.rstrip().endswith("}}")
    # The link is a blank on its own with a space before the full stop, so the phone does not
    # take the stop into the link.
    assert "{{4}} ." in text
    rendered = templates.render(name, lang, templates.CATALOGUE[name].samples_ar if lang == "ar"
                                else templates.CATALOGUE[name].samples)
    assert "{{" not in rendered and "\n" not in rendered


def test_the_arabic_samples_are_arabic_and_the_english_ones_are_not():
    for name in NAMES:
        template = templates.CATALOGUE[name]
        assert any("؀" <= c <= "ۿ" for c in "".join(template.samples_ar))
        assert not any("؀" <= c <= "ۿ" for c in "".join(template.samples)), name


def test_every_kind_this_package_sends_has_a_template_for_outside_the_window():
    for kind in ("receipt", "deposit_receipt", "invoice", "credit_note"):
        assert delivery_words.TEMPLATE_FOR[kind] in templates.CATALOGUE, kind
    assert set(delivery_words.TEMPLATE_FOR) <= set(kinds.KINDS)


def test_the_sample_documents_are_drawn_by_the_engine_and_none_is_kept_in_the_repository():
    drawn = document_samples.draw_all()
    assert set(drawn) == {f"{k}.{lang}.pdf" for k in ("receipt", "invoice", "credit_note")
                          for lang in ("en", "ar")}
    assert document_samples.draw_all() is drawn                    # drawn once, then remembered
    assert not (templates_sync.ROOT / "apps" / "api" / "samples").exists()


@pytest.mark.parametrize("name, kind", [("document_receipt", "receipt"), ("document_invoice", "invoice"),
                                        ("document_credit_note", "credit_note")])
def test_each_template_gets_a_sample_in_each_language_from_the_sync(name, kind):
    template = templates.CATALOGUE[name]
    for lang, title in (("en", delivery_words.title(kind, "en")), ("ar", delivery_words.title(kind, "ar"))):
        file_name, data = templates_sync.sample_file(template, lang)
        assert file_name == f"{kind}.{lang}.pdf"
        assert data.startswith(b"%PDF") and 5_000 < len(data) < 200_000
        text = page_text(data)
        assert (has_letters(text, title) if lang == "ar" else title in text), (name, lang)


def test_a_sample_picture_still_comes_from_its_file():
    name, data = templates_sync.sample_file(templates.CATALOGUE["weekly_report_card"], "en")
    assert name == "bakery.en.png" and data.startswith(b"\x89PNG")


def test_the_sync_describes_a_document_header_the_way_meta_asks_for_it():
    template = templates.CATALOGUE["document_invoice"]
    parts = templates_sync.components(template, template.en, "4::handle", "en")
    assert parts[0] == {"type": "HEADER", "format": "DOCUMENT", "example": {"header_handle": ["4::handle"]}}
    assert parts[1]["type"] == "BODY" and parts[1]["example"] == {"body_text": [list(template.samples)]}
    arabic = templates_sync.components(template, template.ar, "4::h2", "ar")
    assert arabic[1]["example"]["body_text"] == [list(template.samples_ar)]
    # The image-header template keeps working as before.
    image = templates_sync.components(templates.CATALOGUE["weekly_report_card"], "x", "h", "en")
    assert image[0]["format"] == "IMAGE"


def test_a_document_never_reaches_a_text_only_template():
    """Outside the window a receipt needs its template's document header; the outbound layer
    keeps the file for such a template and drops it for one that cannot carry it."""
    from alyr.core.outbound import _header_of

    assert [_header_of(n) for n in NAMES] == ["document"] * 3
    assert _header_of("order_ready") == "" and _header_of("weekly_report_card") == "image"
    assert _header_of("not_a_template") == ""
