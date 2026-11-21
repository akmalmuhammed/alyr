"""The Answers check without a database (spec 068, D-168): the questions are built from closed lists
and carry nothing of a shop; an answer is counted by rule; the sample engine is deterministic and
fictional; a real engine is a gate that is off; the score arithmetic; the words; and the source of
the package is read to prove it reaches nowhere. Each of these fails if someone adds an outside
call, a field to what an engine is sent, or a table the check must not touch."""

import ast
import asyncio
import dataclasses
import re
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from alyr.modules.discovery import answer_words as aw
from alyr.modules.discovery import scoring, words
from alyr.modules.discovery.answers import engines, questions, reading, sample_engine
from alyr.modules.discovery.answers.engines import AskContext, EngineError, LiveEngine
from alyr.modules.discovery.rules import PASS, Outcome

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=UTC)
SRC = Path(__file__).resolve().parents[1] / "src" / "alyr" / "modules" / "discovery"
PACKAGE = sorted((SRC / "answers").glob("*.py"))
FORMS = reading.name_forms("Nuqta Car Care", "نقطة لعناية السيارات", "Nuqta Car Care - Al Sadd")
BANNED = re.compile(
    r"\b(AI|smart|intelligen\w*|learns?|understands?|thinks?|predicts?|forecast\w*|knows?|"
    r"notices?|assistant\w*|agentic|health score|top performer|business intelligence|reads?)\b",
    re.I)
PRODUCTS = re.compile(r"chatgpt|gemini|perplexity|openai|copilot|claude|bard|grok", re.I)


def run(coro):
    return asyncio.run(coro)


def ask(engine, question, stage=0, **more):
    return run(engine.ask(questions.request_of(question), AskContext(NOW, stage=stage, **more)))


# ── the questions ───────────────────────────────────────────────────────────────────────


def test_what_an_engine_is_sent_has_exactly_two_fields_and_nothing_of_a_shop():
    assert [f.name for f in dataclasses.fields(questions.EngineRequest)] == ["text", "lang"]
    assert [f.name for f in dataclasses.fields(questions.PublicQuestion)] == [
        "key", "lang", "text"]


def test_every_trade_and_city_makes_six_built_questions_with_no_digit_name_or_address():
    for trade in questions.TRADES:
        for city in questions.CITIES:
            built = questions.build(trade, city)
            assert [(q.key, q.lang) for q in built] == [
                (k, lang) for lang in ("en", "ar") for k in ("best", "where", "recommended")]
            for q in built:
                assert q.text and not re.search(r"\d|@|http|\+", q.text), q.text
                assert (re.search("[؀-ۿ]", q.text) is not None) == (q.lang == "ar"), q.text
            assert built == questions.build(trade, city)  # the same text every time


def test_a_question_reads_as_the_spec_says():
    en = [q.text for q in questions.build("car_care", "doha") if q.lang == "en"]
    assert en == ["best car care in Doha", "where can I find good car care in Doha?",
                  "recommended car care in Doha"]
    ar = [q.text for q in questions.build("car_care", "doha") if q.lang == "ar"]
    assert ar[0] == "أفضل خدمات العناية بالسيارات في الدوحة"
    assert len(questions.build("bakery", "dubai")) == questions.MAX_QUESTIONS_PER_ENGINE == 6


def test_only_a_key_of_the_closed_lists_makes_a_question():
    for trade, city in (("Car care", "doha"), ("car_care", "Doha"), ("", "doha"),
                        ("car_care; drop table", "doha"), ("car_care", "doha, Nuqta")):
        with pytest.raises(ValueError):
            questions.build(trade, city)


def test_no_health_trade_is_in_the_list_and_every_label_is_in_both_languages():
    assert not {"clinic", "dental", "doctor", "pharmacy"} & set(questions.TRADES)
    for table in (questions.TRADES, questions.CITIES):
        for en, ar in table.values():
            assert en.strip() and ar.strip() and re.search("[؀-ۿ]", ar)


# ── counting an answer ──────────────────────────────────────────────────────────────────

LISTED = """Here are some options:

1. **Sahm Auto Spa** - hand wash
2. **Nuqta Car Care (West Bay)** - five branches
3. **Basma Car Spa** - interior cleaning
"""


def test_the_business_listed_in_a_list_has_a_position_and_the_others_are_competitors():
    r = reading.read(LISTED, FORMS)
    assert (r.named, r.position, r.list_size) == (True, 2, 3)
    assert r.matched == "Nuqta Car Care (West Bay)"
    assert r.competitors == ("Sahm Auto Spa", "Basma Car Spa")


def test_a_branch_name_is_the_business_and_a_legal_suffix_does_not_matter():
    forms = reading.name_forms("Nuqta Car Care W.L.L. - Al Sadd")
    assert reading.read("1. Nuqta Car Care: open daily", forms).position == 1
    assert reading.base_name("Nuqta Car Care W.L.L. - Al Sadd") == "Nuqta Car Care"


def test_named_only_in_a_sentence_is_named_with_no_position():
    r = reading.read("Try Sahm Auto Spa. Nuqta Car Care is also mentioned by some.\n"
                     "1. Sahm Auto Spa\n2. Basma Car Spa", FORMS)
    assert (r.named, r.position, r.list_size) == (True, None, 2)
    assert r.matched == "Nuqta Car Care"
    assert r.competitors == ("Sahm Auto Spa", "Basma Car Spa")


def test_not_named_is_not_named_and_a_lookalike_does_not_count():
    for text in ("1. **Sahm Auto Spa** - hand wash\n2. **Basma Car Spa**",
                 "1. **Nuqta Pharmacy** - medicines\n2. **Nuqta Cafe**",
                 "Nuqta is a word. Car care is a trade.",
                 "1. Nuqta Carcarey\n2. Nokta Car Care"):
        r = reading.read(text, FORMS)
        assert (r.named, r.position, r.matched) == (False, None, ""), text


def test_an_answer_with_no_list_can_name_the_business_but_gives_no_position_or_competitors():
    r = reading.read("The best choice is Nuqta Car Care, with branches across Doha.", FORMS)
    assert (r.named, r.position, r.list_size, r.competitors) == (True, None, 0, ())
    r = reading.read("There are many places. Ask friends.", FORMS)
    assert (r.named, r.list_size, r.competitors) == (False, 0, ())


def test_arabic_is_counted_with_marks_and_the_other_spellings_folded():
    text = "١. **سهم أوتو سبا** - غسيل\n٢. **نُقطة لعنايه السيارات** - فروع\n"
    r = reading.read(text, FORMS)
    assert (r.named, r.position) == (True, 2)
    assert r.competitors == ("سهم أوتو سبا",)
    r = reading.read("- مختبر حياة\n- نقطة لعناية السيارات", FORMS)
    assert (r.named, r.position, r.list_size) == (True, 2, 2)


def test_competitors_are_deduplicated_capped_and_never_a_sentence():
    items = "\n".join(f"{i}. **Place {i}** - x" for i in range(1, 15))
    long = "\n15. This is a whole sentence about something that goes on and on forever and ever"
    r = reading.read(items + "\n3. **Place 3** - again" + long, FORMS)
    assert r.competitors == tuple(f"Place {i}" for i in range(1, 11))
    assert not any("sentence" in c for c in r.competitors)
    assert reading.read("1. **" + "x" * 90 + "**", FORMS).competitors == ("x" * 60,)


def test_a_very_short_name_is_not_looked_for_and_the_longest_comes_first():
    assert reading.name_forms("Zed", "", "Gym") == ()
    assert reading.name_forms("Nuqta Car", "Nuqta Car Care") == ("Nuqta Car Care", "Nuqta Car")


def test_markdown_links_and_bullets_give_the_name_not_the_address():
    r = reading.read("* [Sahm Auto Spa](https://example.test/a) - x\n- Basma Car Spa, Doha", FORMS)
    assert r.competitors == ("Sahm Auto Spa", "Basma Car Spa")


# ── the engines ─────────────────────────────────────────────────────────────────────────


def test_the_registry_has_the_sample_engine_and_the_reserved_names_refuse():
    assert engines.AVAILABLE == ("sample",)
    assert engines.get("sample").kind == "sample"
    for kind in (*engines.RESERVED, "gbp", "", "x"):
        with pytest.raises(EngineError) as error:
            engines.get(kind)
        assert error.value.code == "engine_unavailable"
        assert error.value.en and error.value.ar


def test_the_sample_engine_is_fictional_deterministic_and_has_no_network():
    engine = engines.get("sample")
    assert (engine.live, engine.cost_per_call) == (False, 0)
    q = questions.build("car_care", "doha")[0]
    first = ask(engine, q, stage=2).text
    assert first == ask(engine, q, stage=2).text
    assert ask(engine, q, stage=9).text == ask(engine, q, stage=3).text  # past the last stage
    assert ask(engine, q, stage=-1).text == ask(engine, q, stage=0).text


@pytest.mark.parametrize("stage", [0, 1, 2, 3])
def test_the_sample_names_the_business_in_1_2_4_then_6_of_6_answers(stage):
    named = 0
    for q in questions.build("car_care", "doha"):
        r = reading.read(ask(engines.get("sample"), q, stage=stage).text, FORMS)
        named += r.named
        assert r.list_size == 5
    assert named == (1, 2, 4, 6)[stage] == sample_engine.expected_named(stage)


def test_the_sample_has_all_three_cases_somewhere_listed_in_a_sentence_and_not_named():
    cases = set()
    for q in questions.build("car_care", "doha"):
        r = reading.read(ask(engines.get("sample"), q, stage=2).text, FORMS)
        cases.add("listed" if r.position else "sentence" if r.named else "absent")
    assert cases == {"listed", "sentence", "absent"}


def test_the_sample_only_answers_car_care_in_doha():
    q = questions.build("bakery", "doha")[0]
    with pytest.raises(EngineError) as error:
        ask(engines.get("sample"), q)
    assert error.value.code == "sample_only"
    with pytest.raises(EngineError):
        ask(engines.get("sample"), questions.build("car_care", "dubai")[0])


def test_the_sample_names_no_real_brand_and_the_business_is_the_samples_own():
    for stage in range(4):
        for q in questions.build("car_care", "doha"):
            text = ask(engines.get("sample"), q, stage=stage).text
            assert not PRODUCTS.search(text) and "Auto Fast Track" not in text
    assert sample_engine.BUSINESS[0] == "Nuqta Car Care"


class Settings(SimpleNamespace):
    pass


class FakeLive(LiveEngine):
    kind = "fake"
    key_setting = "fake_key"

    def __init__(self, settings, behaviour=None):
        super().__init__(settings)
        self.calls = []
        self.behaviour = behaviour

    async def _call(self, request, key):
        self.calls.append((request, key))
        if self.behaviour:
            return await self.behaviour()
        return "1. Somewhere"


def live(**more):
    return Settings(**({"discovery_ai_live": True, "fake_key": "k"} | more))


def one_question():
    return questions.build("car_care", "doha")[0]


def test_a_real_engine_with_the_flag_off_makes_no_call():
    engine = FakeLive(Settings(discovery_ai_live=False, fake_key="k"))
    with pytest.raises(EngineError) as error:
        ask(engine, one_question())
    assert error.value.code == "engine_off" and engine.calls == []
    assert FakeLive(Settings(fake_key="k")).live and engine.cost_per_call == 5


def test_a_real_engine_with_no_key_makes_no_call():
    engine = FakeLive(live(fake_key=""))
    with pytest.raises(EngineError) as error:
        ask(engine, one_question())
    assert error.value.code == "engine_no_key" and engine.calls == []


def test_a_real_engine_stops_at_the_monthly_cap_and_at_the_budget_before_the_call():
    engine = FakeLive(live())
    with pytest.raises(EngineError) as error:
        ask(engine, one_question(), asked_this_month=300, monthly_cap=300)
    assert error.value.code == "monthly_cap" and engine.calls == []
    with pytest.raises(EngineError) as error:
        ask(engine, one_question(), cost_budget=4)
    assert error.value.code == "answers_budget" and engine.calls == []
    ctx = AskContext(NOW, cost_budget=10)
    for _ in range(2):
        run(engine.ask(questions.request_of(one_question()), ctx))
    assert ctx.spent == 10 and len(engine.calls) == 2
    with pytest.raises(EngineError):
        run(engine.ask(questions.request_of(one_question()), ctx))
    assert len(engine.calls) == 2


def test_a_real_engine_is_given_the_built_question_and_its_key_and_nothing_else():
    engine = FakeLive(live())
    answer = ask(engine, one_question())
    assert answer.text == "1. Somewhere"
    [(request, key)] = engine.calls
    assert request == questions.EngineRequest("best car care in Doha", "en") and key == "k"


def test_a_slow_or_failing_real_engine_becomes_plain_words_never_its_own_message():
    async def slow():
        await asyncio.sleep(1)

    async def broken():
        raise RuntimeError("secret detail: key=abc123 customer Mariam +97455550123")

    with pytest.raises(EngineError) as error:
        ask(FakeLive(live(), slow), one_question(), timeout=0.01)
    assert error.value.code == "engine_timeout"
    with pytest.raises(EngineError) as error:
        ask(FakeLive(live(), broken), one_question())
    assert error.value.code == "engine_failed"
    assert "abc123" not in error.value.en + error.value.ar
    assert "Mariam" not in error.value.en + error.value.ar


# ── the score ───────────────────────────────────────────────────────────────────────────


def presence_pass():
    import uuid

    return [Outcome("listing_missing", uuid.uuid4(), PASS)]


def test_fewer_than_four_counted_answers_leave_the_part_unmeasured_and_out_of_the_total():
    assert scoring.MIN_ANSWERS == 4
    for tally in (None, scoring.AnswersTally(3, 3), scoring.AnswersTally(0, 0)):
        total, parts = scoring.score(presence_pass(), tally)
        assert parts["ai"] == {"value": None, "measured": False, "weight": 10}
        assert total == 100  # presence alone, its weight renormalised


def test_four_or_more_counted_answers_measure_the_part_by_share_named():
    total, parts = scoring.score(presence_pass(), scoring.AnswersTally(3, 6))
    assert parts["ai"] == {"value": 50, "measured": True, "weight": 10}
    # (100 * 40 + 50 * 10) / 50, the weights renormalised among the measured parts
    assert total == 90
    assert scoring.score(presence_pass(), scoring.AnswersTally(4, 4))[1]["ai"]["value"] == 100
    assert scoring.score(presence_pass(), scoring.AnswersTally(0, 4))[1]["ai"]["value"] == 0


def test_the_share_rounds_half_up_and_is_exact():
    assert scoring.score([], scoring.AnswersTally(5, 8))[1]["ai"]["value"] == 63  # 62.5
    assert scoring.score([], scoring.AnswersTally(1, 6))[1]["ai"]["value"] == 17  # 16.67
    total, _ = scoring.score([], scoring.AnswersTally(2, 6))
    assert total == 33  # only the answers part was measured


def test_the_check_off_changes_nothing_in_a_score():
    outcomes = presence_pass()
    assert scoring.score(outcomes) == scoring.score(outcomes, None)


# ── the words ───────────────────────────────────────────────────────────────────────────


def test_the_answers_words_are_whole_in_both_languages_and_say_no_banned_word():
    texts = aw.all_texts()
    assert texts and all(isinstance(t, str) and t.strip() for t in texts)
    for text in texts:
        assert "…" not in text and "..." not in text, text
        assert not BANNED.search(text), (BANNED.search(text).group(0), text)
        assert not PRODUCTS.search(text), text
    for code, (en, ar) in aw.ERRORS.items():
        assert en != ar and re.search("[؀-ۿ]", ar) and not re.search("[؀-ۿ]", en), code


def test_the_headline_is_a_template_filled_with_numbers_in_both_languages():
    assert aw.headline(4, 6, True, "en") == "Named in 4 of 6 answers."
    assert aw.headline(0, 6, True, "en") == "Not named in any of the 6 answers."
    assert aw.headline(1, 4, True, "en") == "Named in 1 of 4 answers."
    assert aw.headline(4, 6, True, "ar") == "ذُكر نشاطك في 4 من 6 إجابات."
    assert aw.headline(0, 6, True, "ar") == "لم يُذكر نشاطك في أي من 6 إجابات."
    assert aw.headline(None, 0, False, "en") == "Not asked yet."
    assert aw.headline(1, 3, False, "ar") == aw.TOO_FEW[1]


def test_the_step_sentences_and_refusals_are_merged_into_the_modules_words():
    assert set(aw.ERRORS) <= set(words.ERRORS) and set(aw.STEP) <= set(words.STEP_SUMMARIES)
    for text in words.all_texts():
        assert not BANNED.search(text), text


def test_nothing_the_owner_is_told_says_an_assistant_or_a_model_asked():
    for text in aw.all_texts():
        assert "model" not in text.lower() and "نموذج" not in text, text


# ── the package reaches nowhere ─────────────────────────────────────────────────────────

NETWORK = {"httpx", "requests", "aiohttp", "urllib", "http", "socket", "ssl", "smtplib",
           "websockets", "boto3", "anthropic", "openai", "google", "grpc"}
FILES = PACKAGE + [SRC / "answers_actions.py", SRC / "answer_words.py"]
ALLOWED_TABLES = {"discovery_answers", "discovery_answer_settings", "discovery_runs",
                  "discovery_locations", "discovery_connections", "tenants"}


def imports_of(path: Path) -> set[str]:
    found = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom):
            found.add(node.module or "")
            found |= {f"{node.module}.{a.name}" for a in node.names}
    return found


def test_the_scan_sees_the_package_it_guards():
    assert {"questions.py", "reading.py", "engines.py", "sample_engine.py", "service.py",
            "__init__.py"} <= {p.name for p in PACKAGE}


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_no_file_of_the_answers_check_imports_a_network_library_or_a_message_layer(path):
    for name in imports_of(path):
        assert name.split(".")[0] not in NETWORK, (path.name, name)
        assert not name.startswith(("alyr.core.outbound", "alyr.channels", "alyr.core.mail",
                                    "alyr.core.templates", "alyr.modules.inbox",
                                    "alyr.modules.orders", "alyr.modules.ledger")), (
            path.name, name)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_the_answers_check_names_no_table_but_its_own_and_the_business(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if (isinstance(node, ast.Constant) and isinstance(node.value, str)
                and re.match(r"\s*(select|insert|update|delete|with)\b", node.value, re.I)):
            for table in re.findall(r"\b(?:from|join|into|update)\s+([a-z_]+)", node.value):
                assert table == "set" or table in ALLOWED_TABLES, (path.name, table)


def test_what_the_service_hands_an_engine_is_only_a_built_question():
    tree = ast.parse((SRC / "answers" / "service.py").read_text(encoding="utf-8"))
    asks = [n for n in ast.walk(tree) if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Attribute) and n.func.attr == "ask"]
    assert asks, "the service must ask through an engine"
    for call in asks:
        first = call.args[0]
        assert isinstance(first, ast.Call) and ast.unparse(first.func) == "questions.request_of"
        assert len(call.args) == 2 and not call.keywords


def test_no_key_or_provider_is_named_in_the_settings_or_the_package():
    from alyr.config import Settings as RealSettings

    fields = set(RealSettings.model_fields)
    assert RealSettings.model_fields["discovery_ai_live"].default is False
    assert not {f for f in fields if re.search(r"openai|gemini|perplexity|anthropic", f)}
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        assert not re.search(r"sk-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{10,}|api_key", text), path.name
