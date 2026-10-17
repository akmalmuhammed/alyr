"""The weekly report card (ALY-99): a branded image with a short text, from ALYR Agent's
engine, in English and Arabic, sent through the outbound layer with the image uploaded at
send time."""

import asyncio
import json
import re
import struct
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest

from alyr.channels.base import Address, OutboundMessage
from alyr.channels.meta import to_graph_payload
from alyr.config import get_settings
from alyr.core import templates
from alyr.db import Database
from alyr.modules.agent import card, week
from alyr.modules.agent.facts import Facts
from alyr.report_samples import OUT, REPORT_NOW, SAMPLES, render_one, seed
from alyr.seed import DEMO_TENANT_ID, OWNER_PHONE
from conftest import APP_DSN, OWNER_DSN
from test_consent import conversation, owner_sql, say
from test_reports import card_of, future_week, send_week

AI_WORDS = re.compile(r"\b(ai|smart|learns|thinks|noticed|predicts?|intelligen\w*)\b")
WEEK = date(2026, 10, 4)


def png_size(data: bytes) -> tuple[int, int]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", data[16:24])


@pytest.fixture(scope="module")
def samples():
    """The three sample businesses as they stood when their report went out, and each
    one's card data and text in both languages."""

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            await seed(db, OWNER_DSN)
            return {(key, lang): await render_one(db, tenant, lang)
                    for key, tenant in SAMPLES for lang in ("en", "ar")}
        finally:
            await db.close()

    return asyncio.run(go())


@pytest.mark.parametrize("key", ["bakery", "salon", "homeservices"])
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_the_card_renders_for_every_sample_in_both_languages(samples, key, lang):
    data, text = samples[(key, lang)]
    # At WhatsApp's bubble width (about 330 px) no text is smaller than about 9.5 px.
    sizes = [float(v) for v in re.findall(r'font-size="([\d.]+)"', card.svg(data, sample=True))]
    assert min(sizes) >= card.SMALL and min(sizes) * 330 / card.W >= 9.4
    # Every line fits whole: nothing on the card is cut short with an ellipsis.
    for theme in ("carbon", "paper"):
        drawn = card.svg(data, theme, sample=True)
        assert "…" not in drawn, re.findall(r">([^<]*…)<", drawn)
    for theme in ("carbon", "paper"):
        png = card.render(data, theme, sample=True)
        # WhatsApp's 1.91:1 header, about 1080 px wide, well under Meta's 5 MB.
        assert png_size(png) == (1080, 566) and len(png) < 500_000
    assert data["dir"] == ("rtl" if lang == "ar" else "ltr")
    assert data["hero"]["value"] and len(data["days"]) == 7
    assert 2 <= len(data["facts"]) <= 3
    # About eight lines, within WhatsApp's 1,024 characters under an image.
    lines = [line for line in text["caption"].split("\n") if line]
    assert 6 <= len(lines) <= 9 and len(text["caption"]) <= 1024
    assert text["caption"].count("*") % 2 == 0
    if lang == "ar":
        assert all(line.startswith(week.RLM) for line in lines)
    # The template's five blanks: one line each, never empty.
    assert len(text["template"]) == 5
    assert all(value.strip() and "\n" not in value for value in text["template"])
    filled = templates.render("weekly_report_card", lang, text["template"])
    assert filled and len(filled) <= 1024
    words = json.dumps([data, text], ensure_ascii=False).lower()
    assert not AI_WORDS.search(words)


def test_each_sample_leads_with_its_own_business(samples):
    bakery = samples[("bakery", "en")][0]
    salon = samples[("salon", "en")][0]
    home = samples[("homeservices", "en")][0]
    assert bakery["hero"]["key"] == "sales" and bakery["hero"]["unit"] == "QAR"
    assert [f["key"] for f in bakery["facts"]] == ["top_item", "owed", "visits"]
    assert salon["hero"]["key"] == "visits"
    assert [f["key"] for f in salon["facts"]][:2] == ["no_shows", "booked_ahead"]
    assert home["hero"]["label"] == "Jobs"
    assert [f["key"] for f in home["facts"]][:2] == ["no_shows", "owed"]
    # A bakery's report opens with its orders, not with credit accounts.
    caption = samples[("bakery", "en")][1]["caption"].split("\n")
    assert caption[3].startswith("*ALYR Chat*") and caption[5].startswith("*ALYR Accounts*")


@pytest.mark.parametrize("key", ["bakery", "salon", "homeservices"])
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_the_captured_report_samples_match_the_engine(samples, key, lang):
    path = OUT / f"{key}.{lang}.json"
    assert path.exists(), f"run `python -m alyr.report_samples` to capture {path.name}"
    saved = json.loads(path.read_text(encoding="utf-8"))
    data, text = samples[(key, lang)]
    assert saved["sent_at"] == REPORT_NOW.isoformat() and saved["sample"] is True
    assert saved["caption"] == text["caption"] and saved["card"] == data
    for suffix in ("", ".paper"):
        assert png_size((OUT / f"{key}.{lang}{suffix}.png").read_bytes()) == (1080, 566)


# ── the rules, without a database ────────────────────────


def facts(**values) -> Facts:
    base = dict(now=datetime(2026, 10, 10, 20, 59, tzinfo=UTC), modules=frozenset(
        {"orders", "inbox"}), business_type="restaurant",
        started=datetime(2026, 8, 1, tzinfo=UTC))
    return Facts(**(base | values))


def a_week(f: Facts) -> week.Week:
    return week.Week(WEEK, f, f, {"en": "Qirfa Bakery", "ar": "مخبز قرفة"})


def test_a_percentage_only_when_both_weeks_count_twenty_or_more():
    small = week.hero(a_week(facts(orders=25, orders_last=19, sales=250000,
                                   sales_last=190000)), "en")
    assert small["change"] == {"dir": None, "text": "The week before: QAR\u00a01,900"}
    big = week.hero(a_week(facts(orders=25, orders_last=20, sales=250000, sales_last=200000)),
                    "en")
    assert big["change"] == {"dir": "up", "text": "up 25% on the week before"}
    assert big["value"] == "2,500" and big["unit"] == "QAR"
    arabic = week.hero(a_week(facts(orders=20, orders_last=25, sales=200000,
                                    sales_last=250000)), "ar")
    assert arabic["change"] == {"dir": "down", "text": "20% عن الأسبوع السابق"}
    first = week.hero(a_week(facts(started=datetime(2026, 10, 6, tzinfo=UTC), orders=30,
                                   orders_last=0)), "en")
    assert first["change"]["text"] == "First week on ALYR"


def test_the_summary_names_its_measure_and_compares_like_with_like():
    f = facts(orders=25, orders_last=20, sales=250000, sales_last=200000)
    assert week.summary(a_week(f), "en") == (
        "Last week: 25 orders, QAR\u00a02,500. Orders up 25%, sales up 25% on the week before."
    )
    assert week.summary(a_week(f), "ar") == (
        "الأسبوع الماضي: 25 طلباً، 2,500\u00a0ر.ق. الطلبات أكثر بـ25%، والمبيعات أكثر بـ25% "
        "عن الأسبوع الذي قبله."
    )
    quiet = facts(orders=3, orders_last=2)
    assert week.summary(a_week(quiet), "ar") == (
        "الأسبوع الماضي: 3 طلبات، والأسبوع الذي قبله: طلبان."
    )


def test_arabic_counts_agree_and_no_preposition_takes_a_count():
    assert week._unpaid(1, week.people_noun("")) == "عميل واحد لم يسدد بعد"
    assert week._unpaid(2, week.people_noun("")) == "عميلان لم يسددا بعد"
    assert week._unpaid(6, week.people_noun("")) == "6 عملاء لم يسددوا بعد"


def test_the_arabic_card_is_mirrored_and_its_lines_run_right_to_left(samples):
    data = samples[("salon", "ar")][0]
    svg = card.svg(data)
    # Each Arabic line is a right-to-left embedding; the week's range stays left to right.
    assert "\u202b" in svg and "\u202a4–10\u202c" in svg
    # Sunday's bar is on the right: time runs right to left.
    labels = re.findall(r'<text x="([\d.]+)"[^>]*>\u202b(ح|س)\u202c</text>', svg)
    x = {name: float(at) for at, name in labels}
    assert x["ح"] > x["س"]
    english = card.svg(samples[("salon", "en")][0])
    assert "\u202b" not in english


def test_a_long_name_is_made_to_fit():
    text, size = card.fit("Al Mansoura Premium Electrical Trading Company W.L.L.", card.SANS,
                          46, 30, 400, weight=600)
    assert size == 30 and text.endswith("…")
    assert card.width(text, card.SANS, size, 600) <= 400


# ── sending it ────────────────────────────────────────────


def test_a_template_with_an_image_header_carries_the_uploaded_card():
    message = templates.notice(uuid4(), "weekly_report_card", "en", "caption",
                               *templates.CATALOGUE["weekly_report_card"].samples,
                               image=b"png")
    sent = OutboundMessage(**{**message.__dict__, "media_id": "1037543291543636"})
    payload = to_graph_payload(sent, Address(phone="97455500001"))["template"]
    assert payload["components"][0] == {
        "type": "header",
        "parameters": [{"type": "image", "image": {"id": "1037543291543636"}}],
    }
    assert payload["components"][1]["type"] == "body"
    image = OutboundMessage(to=uuid4(), kind="image", body="Hello", media_id="42")
    assert to_graph_payload(image, Address(phone="97455500001"))["image"] == {
        "id": "42", "caption": "Hello"}


def test_an_image_needs_a_short_caption():
    with pytest.raises(ValueError):
        OutboundMessage(to=uuid4(), kind="image", body="x" * 1025, image=b"png")
    with pytest.raises(ValueError):
        OutboundMessage(to=uuid4(), kind="image", body="no picture")


def test_outside_the_window_the_text_template_goes_until_the_card_is_approved(client):
    send_week(client, future_week())
    last = conversation(client, OWNER_PHONE)[-1]
    assert last["kind"] == "template" and last["payload"]["template"] == "weekly_report"
    # The text-only template has no image header, so no card is kept for it.
    assert card_of(OWNER_PHONE) is None


def test_once_approved_the_card_goes_as_the_templates_image_header(client, monkeypatch):
    monkeypatch.setenv("ALYR_REPORT_CARD_TEMPLATE", "true")
    get_settings.cache_clear()
    try:
        send_week(client, future_week())
    finally:
        monkeypatch.delenv("ALYR_REPORT_CARD_TEMPLATE")
        get_settings.cache_clear()
    last = conversation(client, OWNER_PHONE)[-1]
    assert last["kind"] == "template" and last["payload"]["template"] == "weekly_report_card"
    assert last["body"].startswith("Your ALYR weekly report for Al Noor Electricals, ")
    assert len(last["payload"]["params"]) == 5
    assert bytes(card_of(OWNER_PHONE)["data"])[1:4] == b"PNG"
    # Delivered: the simulator took the upload and the message.
    assert last["status"] == "sent"


def test_an_image_is_never_sent_outside_the_window(client):
    say(client, OWNER_PHONE, "report")
    owner_sql("update contacts set last_inbound_at = now() - interval '2 days' "
              "where phone = $1", OWNER_PHONE)

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            contact = await conn.fetchval("select id from contacts where phone = $1",
                                          OWNER_PHONE)
            return await client.app.state.outbound.send(conn, OutboundMessage(
                to=contact, kind="image", body="card", image=b"png"))

    assert client.portal.call(go).blocked == "window_closed"


def test_the_card_template_is_submitted_with_its_image_header_and_sample_values():
    from alyr.templates_sync import ROOT, components

    template = templates.CATALOGUE["weekly_report_card"]
    parts = components(template, template.ar, "4::aW", "ar")
    assert parts[0] == {"type": "HEADER", "format": "IMAGE",
                        "example": {"header_handle": ["4::aW"]}}
    assert parts[1]["example"] == {"body_text": [list(template.samples_ar)]}
    assert len(template.samples_ar) == len(template.samples) == 5
    for lang in ("en", "ar"):
        sample = ROOT / template.header_sample.format(lang=lang)
        assert png_size(sample.read_bytes()) == (1080, 566)
    # Every other template stays a body alone.
    assert [p["type"] for p in components(templates.CATALOGUE["order_ready"], "x", None)] == [
        "BODY"]
