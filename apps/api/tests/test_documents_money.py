"""Money on documents (ALY-138, spec 010): whole numbers of the smallest unit, one rounding
rule that the code and the database both keep, and no float anywhere near an amount.

Amounts are dirhams, as everywhere in ALYR (1 QAR = 100): `12700` is QAR 127.00."""

import ast
import random
from decimal import Decimal
from pathlib import Path

import pytest

from alyr.modules.documents import build, money
from documents_support import configured_shop, issue, issued, make_draft
from test_consent import owner_sql

DOCUMENTS = Path(__file__).resolve().parents[1] / "src" / "alyr" / "modules" / "documents"


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


# ── the rounding rule ─────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "quantity,price,discount,rate,expected",
    [
        ("3", 335, 0, 0, (1005, 0, 1005)),
        ("0.5", 335, 0, 0, (168, 0, 168)),      # 167.5 goes up, not to the even number
        ("0.5", 333, 0, 0, (167, 0, 167)),      # 166.5 goes up too
        ("2.5", 1, 0, 0, (3, 0, 3)),            # Python's round() would say 2
        ("1.001", 1000, 0, 0, (1001, 0, 1001)),
        ("12", 350, 0, 0, (4200, 0, 4200)),
        ("2", 4500, 500, 0, (8500, 0, 8500)),
        ("3", 335, 0, 500, (1005, 50, 1055)),   # 50.25 down
        ("1", 1010, 0, 500, (1010, 51, 1061)),  # 50.5 up (banker's rounding would give 50)
        ("1", 100, 0, 1500, (100, 15, 115)),
        ("1", 3, 0, 1500, (3, 0, 3)),           # 0.45 down to nothing
        ("1", 1, 0, 5000, (1, 1, 2)),           # 0.5 up
        ("1", 100, 100, 500, (0, 0, 0)),        # everything discounted
    ],
)
def test_the_rounding_rule(quantity, price, discount, rate, expected):
    assert money.line_amounts(Decimal(quantity), price, discount, rate) == expected


def test_a_discount_larger_than_the_line_is_an_error():
    with pytest.raises(money.MoneyError):
        money.line_amounts(Decimal("1"), 100, 101, 0)


def test_a_float_is_never_accepted_as_money():
    with pytest.raises(money.MoneyError):
        money.line_amounts(Decimal("1"), 10.5, 0, 0)  # type: ignore[arg-type]
    with pytest.raises(money.MoneyError):
        money.line_amounts(1.5, 100, 0, 0)  # type: ignore[arg-type]


def test_the_code_and_the_database_round_the_same_way():
    """The database has the rule as a CHECK on every line; this runs 400 random lines through
    both and compares, so the two cannot drift apart unnoticed."""
    rng = random.Random(2610)
    cases = []
    for _ in range(400):
        quantity = Decimal(rng.randint(1, 999_999)) / Decimal(1000)
        price = rng.randint(0, 2_000_000)
        gross = money.round_half_up(quantity * price)
        discount = rng.randint(0, gross)
        rate = rng.choice([0, 100, 250, 500, 1500, 1234, 9999])
        cases.append((quantity, price, discount, rate))
    rows = owner_sql(
        "select q, p, d, r, round(q * p)::bigint - d as net, "
        "round((round(q * p)::bigint - d)::numeric * r / 10000)::bigint as tax "
        "from unnest($1::numeric[], $2::bigint[], $3::bigint[], $4::int[]) as t(q, p, d, r)",
        [c[0] for c in cases], [c[1] for c in cases], [c[2] for c in cases], [c[3] for c in cases],
    )
    for (quantity, price, discount, rate), row in zip(cases, rows, strict=True):
        net, tax, total = money.line_amounts(quantity, price, discount, rate)
        assert (net, tax) == (row["net"], row["tax"]), (quantity, price, discount, rate)
        assert total == net + tax


# ── what the API accepts ──────────────────────────────────────────────────────────────────


def sale(**line):
    return {"kind": "invoice", "customer": {"name": "Hamad"},
            "lines": [{"description": "Item", "quantity": "1", **line}]}


def test_the_api_takes_whole_minor_units_and_nothing_else(shop):
    for bad in (10.5, 10.0, "100", -1, None, True, money.MAX_MINOR + 1):
        answer = shop.owner.post("/api/documents", json=sale(unit_price_minor=bad))
        assert answer.status_code == 422, (bad, answer.status_code)
    for field in ("discount_minor", "tax_rate_bp"):
        for bad in (1.5, "1", -1):
            answer = shop.owner.post("/api/documents", json=sale(unit_price_minor=100, **{field: bad}))
            assert answer.status_code == 422, (field, bad)
    paid = shop.owner.post("/api/documents", json={
        **sale(unit_price_minor=100), "payments": [{"method": "cash", "amount_minor": 50.5}]})
    assert paid.status_code == 422
    ok = shop.owner.post("/api/documents", json=sale(unit_price_minor=100))
    assert ok.status_code == 201


def test_a_quantity_is_exact_and_travels_as_text(shop):
    draft = shop.owner.post("/api/documents", json=sale(quantity="0.500", unit_price_minor=335))
    document = draft.json()["document"]
    line = document["lines"][0]
    assert line["quantity"] == "0.500" and line["line_net_minor"] == 168  # 167.5 rounded up
    assert isinstance(line["quantity"], str)
    for bad in ("0", "-1", "1.0001", "NaN", "abc", "1000000000"):
        answer = shop.owner.post("/api/documents", json=sale(quantity=bad, unit_price_minor=100))
        assert answer.status_code in (400, 422), bad


def test_every_amount_in_an_answer_is_an_integer(shop):
    doc = issued(shop.owner, "invoice")

    def walk(value, path=""):
        if isinstance(value, float):
            raise AssertionError(f"a float at {path}: {value}")
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, f"{path}.{k}")
        elif isinstance(value, list):
            for i, v in enumerate(value):
                walk(v, f"{path}[{i}]")

    walk(doc)
    walk(shop.owner.get("/api/documents").json())
    for field in ("gross_minor", "discount_minor", "tax_minor", "total_minor", "paid_minor",
                  "balance_minor"):
        assert isinstance(doc["totals"][field], int), field


def test_the_totals_always_add_up(shop):
    rng = random.Random(7)
    for _ in range(12):
        lines = [{"description": f"Line {i}", "quantity": str(Decimal(rng.randint(1, 5000)) / 1000),
                  "unit_price_minor": rng.randint(1, 90_000),
                  "discount_minor": 0} for i in range(rng.randint(1, 8))]
        doc = shop.owner.post("/api/documents", json={"kind": "quote", "lines": lines}
                              ).json()["document"]
        t = doc["totals"]
        assert t["total_minor"] == t["gross_minor"] - t["discount_minor"] + t["tax_minor"]
        assert t["total_minor"] == sum(line["line_total_minor"] for line in doc["lines"])
        assert t["gross_minor"] == sum(line["line_net_minor"] + line["discount_minor"]
                                       for line in doc["lines"])


# ── tax: in the model, off by default ─────────────────────────────────────────────────────


def test_tax_is_off_until_the_shop_turns_it_on(shop):
    line = {"description": "Item", "quantity": "3", "unit_price_minor": 335, "tax_rate_bp": 500}
    refused = shop.owner.post("/api/documents", json={"kind": "quote", "lines": [line]})
    assert (refused.status_code, refused.json()["code"]) == (422, "tax_off")
    assert shop.owner.put("/api/documents/settings", json={"tax_enabled": True,
                                                           "tax_rate_bp": 500}).status_code == 200
    quote = shop.owner.post("/api/documents", json={"kind": "quote", "lines": [line]})
    doc = quote.json()["document"]
    assert doc["lines"][0]["tax_minor"] == 50 and doc["lines"][0]["line_total_minor"] == 1055
    assert doc["totals"] == {"gross_minor": 1005, "discount_minor": 0, "tax_minor": 50,
                             "total_minor": 1055, "paid_minor": 0, "balance_minor": 1055}
    # A draft with tax in it cannot be issued after tax is switched off again.
    shop.owner.put("/api/documents/settings", json={"tax_enabled": False})
    answer = issue(shop.owner, doc["id"])
    assert (answer.status_code, answer.json()["code"]) == (422, "tax_off")


def test_an_invoice_says_tax_invoice_only_with_tax_and_a_tax_number(shop):
    from alyr.modules.documents.render.context import Bi

    assert build.title_for("invoice", taxed=False) == Bi(ar="فاتورة", en="Invoice")
    assert build.title_for("invoice", taxed=True) == Bi(ar="فاتورة ضريبية", en="Tax invoice")
    assert build.title_for("receipt", taxed=True) == Bi(ar="إيصال", en="Receipt")


# ── currencies ────────────────────────────────────────────────────────────────────────────


def test_amounts_are_written_the_way_each_language_writes_them():
    assert money.plain(12700, 2) == "127.00"
    assert money.plain(123456789, 2) == "1,234,567.89"
    assert money.plain(0, 2) == "0.00" and money.plain(5, 2) == "0.05"
    assert money.plain(1250, 3) == "1.250" and money.plain(1_250_000, 3) == "1,250.000"
    assert money.written(12700, "QAR", 2, "en") == "QAR 127.00"
    assert money.written(12700, "QAR", 2, "ar") == "127.00 ر.ق"
    assert money.written(1250, "KWD", 3, "ar") == "1.250 د.ك"
    # Western digits, always: no Arabic-Indic digit anywhere in what a document prints.
    assert not any("٠" <= ch <= "٩" for ch in money.written(1234567, "QAR", 2, "ar"))


def test_a_three_decimal_currency_keeps_its_three_decimals(shop):
    shop.owner.put("/api/documents/settings", json={"currency": "KWD"})
    doc = shop.owner.post("/api/documents", json={
        "kind": "quote", "lines": [{"description": "Item", "quantity": "1",
                                    "unit_price_minor": 1250}]}).json()["document"]
    assert (doc["currency"], doc["currency_exponent"]) == ("KWD", 3)
    assert doc["totals"]["total_minor"] == 1250  # KWD 1.250
    other = shop.owner.post("/api/documents", json={"kind": "quote", "currency": "QAR", "lines": [
        {"description": "Item", "quantity": "1", "unit_price_minor": 1250}]}).json()["document"]
    assert other["currency_exponent"] == 2


# ── the guards that keep floats out ───────────────────────────────────────────────────────


MONEY_MODULES = ("money.py", "prepare.py", "service.py", "canonical.py", "build.py", "numbering.py")


@pytest.mark.parametrize("name", MONEY_MODULES)
def test_no_float_is_used_where_money_is_handled(name):
    """The word `float` appears only inside an `isinstance(..., float)`, the check that
    refuses one; and no float literal is written."""
    tree = ast.parse((DOCUMENTS / name).read_text(encoding="utf-8"))
    refusals = {
        id(arg)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "isinstance"
        for arg in node.args
    }
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id == "float" and id(node) not in refusals:
            raise AssertionError(f"{name}:{node.lineno} uses float")
        if isinstance(node, ast.Constant) and isinstance(node.value, float):
            raise AssertionError(f"{name}:{node.lineno} has a float literal {node.value}")


def test_the_document_tables_have_no_float_column():
    rows = owner_sql(
        "select table_name, column_name, data_type from information_schema.columns "
        "where table_schema = 'public' and table_name in ('documents', 'document_lines', "
        "'document_files', 'document_series', 'document_settings')")
    floats = [(r["table_name"], r["column_name"]) for r in rows
              if r["data_type"] in ("real", "double precision")]
    assert floats == []
    kinds_of = {(r["table_name"], r["column_name"]): r["data_type"] for r in rows}
    assert kinds_of[("documents", "total_minor")] == "bigint"
    assert kinds_of[("document_lines", "unit_price_minor")] == "bigint"
    assert kinds_of[("document_lines", "quantity")] == "numeric"


def test_a_draft_survives_being_saved_and_read_with_every_amount_unchanged(shop):
    draft = make_draft(shop.owner, "receipt")
    again = shop.owner.get(f"/api/documents/{draft['id']}").json()["document"]
    assert again["totals"] == draft["totals"] and again["lines"] == draft["lines"]
