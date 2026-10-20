"""Nothing a shop owner or a customer reads says a feature is "coming", "in beta", "early access"
or "not yet" (ALY-113, D-039).

The founder does not want a bad first impression: a button, a label, a message or a help text for
something that does not work yet is worse than leaving it out. So a feature appears when it is
built (ALYR Payroll is the example: it is not in `catalog.py` until it works), and this test
fails when a sentence that promises one comes back.

What it reads, in English and Arabic:

* every string in the API (`apps/api/src/alyr`, docstrings and comments left out, the fictional
  demo data of the seeds left out), which is what the workspace, the WhatsApp replies, the order
  page, the booking page, the pay and tracking pages, onboarding and the weekly report say;
* the words of the pages themselves: `apps/web/app/(product)` (the workspace, onboarding, the
  customer pages; not the back office, which only ALYR's own staff open) and the owner's weekly
  view (`apps/web/app/_agent`), comments left out;
* the SQL migrations' strings (comments left out).

What it does not read: the public site (`apps/web/app/_site`), whose wording is the founder's to
choose (the pull request that added this test lists what it says). A phrase that is fine in its
place goes in `ALLOWED` below with the reason, so a new use is a decision and not an accident.
"""

import ast
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / "apps" / "api"
WEB = ROOT / "apps" / "web" / "app"

# Words that promise something that is not there. English first, then Arabic.
FORBIDDEN = re.compile(
    r"""
    \bcoming\b | (?<!as\s)\bsoon\b | \bbeta\b | early[\s-]access | \bpre-?release\b
    | under\s+(development|construction) | in\s+development | work\s+in\s+progress
    | \bplanned\b | \bnot\s+yet\b | \bnot\s+available\s+yet\b | \bunavailable\s+for\s+now\b
    | will\s+be\s+(available|released|built|supported) | \bstay\s+tuned\b
    | \bto\s+be\s+announced\b | \btba\b | \bnext\s+release\b
    | \b(before|until|after|at|by)\s+(the\s+)?(launch|go-?live|go\s+live)\b
    | \breplaced?\s+(this\s+)?before\b
    | قبل\s+الإطلاق | بعد\s+الإطلاق | عند\s+الإطلاق
    | قريب(ا|اً|ًا) | قريباً | نسخة\s+تجريبية | إصدار\s+تجريبي | الوصول\s+المبكر
    | قيد\s+(التطوير|الإنشاء|التنفيذ) | تحت\s+(التطوير|الإنشاء) | ليس\s+بعد
    | غير\s+(متاح|متوفر)\s+بعد | لم\s+يتوفر\s+بعد | سيتوفر | سيتم\s+(إطلاق|توفير)
    | مخطط\s+له
    """,
    re.IGNORECASE | re.VERBOSE,
)

# (file, text that has to be in the line, why it is fine). A line is checked as it is written.
ALLOWED = (
    # "We will reply soon" and "see you soon" are about how fast a person answers, not about
    # a feature that is not built.
    ("modules/router.py", "سنرد عليك قريباً", "an automatic acknowledgement: we will reply soon"),
    ("modules/ledger/chat.py", "سيتواصل معك أحد الموظفين قريباً", "a person will contact you soon"),
    ("core/templates.py", "See you soon", "the end of a reminder to a customer"),
    ("(product)/t/[tenant]/[order]/page.tsx", "طلبك قريباً", "the shop will handle your order soon"),
)


def _allowed(path: str, line: str) -> bool:
    return any(path.endswith(suffix) and text in line for suffix, text, _ in ALLOWED)


def _strip_ts_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    return re.sub(r"(^|\s)//[^\n]*", r"\1", text)


def _strip_sql_comments(text: str) -> str:
    return re.sub(r"--[^\n]*", "", text)


def _python_strings(source: str) -> list[tuple[int, str]]:
    """Every string in a Python file with the line it starts on, docstrings left out."""
    tree = ast.parse(source)
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                docstrings.add(id(first.value))
    return [
        (node.lineno, node.value)
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
        and id(node) not in docstrings
    ]


def _api_files() -> list[Path]:
    src = API / "src" / "alyr"
    skip = ("seed", "doctor")
    return sorted(
        p for p in src.rglob("*.py")
        if "demo" not in p.relative_to(src).parts and not p.name.startswith(skip)
    )


def _web_files() -> list[Path]:
    files = []
    for base in (WEB / "(product)", WEB / "_agent"):
        for p in base.rglob("*"):
            relative = p.relative_to(WEB).parts
            if "ops" in relative or "node_modules" in relative:
                continue
            if p.suffix not in {".ts", ".tsx", ".json"}:
                continue
            files.append(p)
    return sorted(files)


def _hits() -> list[str]:
    found = []
    for path in _api_files():
        shown = path.relative_to(API / "src" / "alyr").as_posix()
        for line_no, value in _python_strings(path.read_text(encoding="utf-8")):
            for line in value.splitlines() or [value]:
                if FORBIDDEN.search(line) and not _allowed(shown, line):
                    found.append(f"{shown}:{line_no}: {line.strip()[:120]}")
    for path in _web_files():
        shown = path.relative_to(WEB).as_posix()
        text = path.read_text(encoding="utf-8")
        if path.suffix != ".json":
            text = _strip_ts_comments(text)
        for line in text.splitlines():
            if FORBIDDEN.search(line) and not _allowed(shown, line):
                found.append(f"{shown}: {line.strip()[:120]}")
    for path in sorted((API / "migrations").glob("*.sql")):
        for line in _strip_sql_comments(path.read_text(encoding="utf-8")).splitlines():
            if FORBIDDEN.search(line):
                found.append(f"migrations/{path.name}: {line.strip()[:120]}")
    return found


def test_nothing_a_shop_or_a_customer_reads_promises_a_feature_that_is_not_built():
    hits = _hits()
    assert not hits, (
        "a sentence says something is coming, in beta or not yet there; remove the feature from "
        "the screen until it works, or, if the sentence is about something else, add it to "
        "ALLOWED with the reason:\n" + "\n".join(hits)
    )


@pytest.mark.parametrize(
    "sentence",
    [
        "Coming soon", "Payroll is coming", "Available in beta", "Early access",
        "Planned for later", "Not yet available", "This is under development",
        "Will be available next month", "A payment gateway replaces this before launch",
        "قريباً", "قريبا", "ستتوفر قريباً", "نسخة تجريبية", "الوصول المبكر", "قيد التطوير",
        "غير متاح بعد", "ليس بعد", "ستحل محلها بوابة قبل الإطلاق",
    ],
)
def test_the_check_catches_the_wording_it_is_for(sentence):
    assert FORBIDDEN.search(sentence), sentence


@pytest.mark.parametrize(
    "sentence",
    [
        "Your order is ready.", "Pay now", "Order table 7", "Sold out", "Back in stock",
        "Mark as paid", "تم تأكيد طلبك", "متوفر", "مباع بالكامل",
    ],
)
def test_the_check_leaves_ordinary_sentences_alone(sentence):
    assert not FORBIDDEN.search(sentence), sentence


def test_the_allowed_list_is_still_in_use():
    """An entry whose text is gone from its file, or that the check would not flag any more, is
    dead weight that could hide a new use."""
    files = {p.relative_to(API / "src" / "alyr").as_posix(): p for p in _api_files()}
    files |= {p.relative_to(WEB).as_posix(): p for p in _web_files()}
    for suffix, text, _ in ALLOWED:
        paths = [p for shown, p in files.items() if shown.endswith(suffix)]
        assert paths, f"{suffix} is not a file any more"
        assert any(text in p.read_text(encoding="utf-8") for p in paths), f"{text!r} is gone"
        assert FORBIDDEN.search(text), f"{text!r} no longer needs an exception"


def test_payroll_is_not_in_the_line_up_until_it_is_built():
    from alyr import catalog

    assert all(p.status in ("available", "included") for p in catalog.PRODUCTS)
    assert "payroll" not in catalog.PRODUCT_BY_KEY
