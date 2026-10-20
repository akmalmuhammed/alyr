"""The server's Arabic folding against the cases the order page's copy of it must also pass
(specs/005-order-page-v2/fold-cases.json; apps/web/app/(product)/_customer/fold.ts). If one
side changes, the other side's test fails until it follows (ALY-112)."""

import json
from pathlib import Path

import pytest

from alyr.modules.items import text

CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "specs/005-order-page-v2/fold-cases.json")
    .read_text(encoding="utf-8")
)


@pytest.mark.parametrize(("given", "folded"), CASES["fold"])
def test_fold(given, folded):
    assert text.fold(given) == folded


@pytest.mark.parametrize(("query", "words"), CASES["words"])
def test_search_words(query, words):
    assert text.search_words(query) == words


@pytest.mark.parametrize(("query", "fields", "found"), CASES["matches"])
def test_matches(query, fields, found):
    assert text.matches(text.search_words(query), *fields) is found
