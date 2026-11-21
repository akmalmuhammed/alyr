"""Arabic money, counts and dates in what customers are sent (the first client's audit, T20): an
order's confirmation and the chat's price list wrote "QAR" in Arabic, hours and minutes did not
agree with their number («3 ساعة»), and an Arabic date had no weekday ("30/10 17:00")."""

import json
import re
from datetime import datetime

import pytest

from alyr.core.words import MINUTES, counted
from alyr.modules.bookings import service, words
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
from test_bookings import book, service_id, times
from test_consent import conversation, owner_sql, say
from test_orders import customer, place, product

ENGLISH_DAYS = {"Mon": "الاثنين", "Tue": "الثلاثاء", "Wed": "الأربعاء", "Thu": "الخميس",
                "Fri": "الجمعة", "Sat": "السبت", "Sun": "الأحد"}
ARABIC_MONTHS = ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس",
                 "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر")


def arabic_customer():
    owner_sql("update contacts set lang = 'ar' where tenant_id = $1 and phone = $2",
              DEMO_TENANT_ID, AHMED_PHONE)


# ── money ───────────────────────────────────────────────────────────────────────────────


def test_an_order_by_link_is_confirmed_in_riyals_not_qar(client):
    arabic_customer()
    say(client, AHMED_PHONE, "مرحبا")  # the customer wrote: their 24 hours are open
    order = place(client, customer(client)["id"], [(product(client, "LED panel"), 2)],
                  "link").json()
    body = conversation(client)[-1]["body"]
    assert body.startswith(f"تم استلام الطلب رقم {order['number']}.")
    assert "QAR" not in body
    assert re.search(r"2 x .+  [\d,.]+ ر\.ق\n", body), body       # the line
    assert re.search(r"الإجمالي: [\d,.]+ ر\.ق\n", body), body     # the total


def test_an_order_on_account_says_the_balance_in_riyals(client):
    arabic_customer()
    say(client, AHMED_PHONE, "مرحبا")
    place(client, customer(client)["id"], [(product(client, "LED panel"), 4)], "account")
    body = conversation(client)[-1]["body"]
    assert re.search(r"رصيدك الآن [\d,.]+ ر\.ق\.", body), body
    assert "QAR" not in body


def test_the_template_after_the_window_carries_riyals_in_arabic(client):
    arabic_customer()
    owner_sql("update contacts set last_inbound_at = now() - interval '2 days' "
              "where tenant_id = $1 and phone = $2", DEMO_TENANT_ID, AHMED_PHONE)
    place(client, customer(client)["id"], [(product(client, "LED panel"), 1)], "link")
    [row] = owner_sql(
        "select m.kind, m.payload from messages m join contacts c on c.id = m.contact_id "
        "where c.tenant_id = $1 and c.phone = $2 and m.direction = 'out' "
        "order by m.created_at desc limit 1", DEMO_TENANT_ID, AHMED_PHONE)
    assert row["kind"] == "template"
    payload = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])
    params = payload["params"]
    assert any("ر.ق" in p for p in params), params
    assert not any("QAR" in p for p in params), params


def test_the_same_order_in_english_still_says_qar(client):
    say(client, AHMED_PHONE, "hello")
    place(client, customer(client)["id"], [(product(client, "LED panel"), 2)], "link")
    body = conversation(client)[-1]["body"]
    assert "Total: QAR " in body and "ر.ق" not in body


def test_the_price_list_in_the_chat_is_in_riyals_and_counts_minutes_in_arabic(client):
    arabic_customer()
    ar = say(client, AHMED_PHONE, reply_id="prices")[-1]["body"]
    assert "QAR" not in ar
    assert re.search(r"Electrician site visit: 150 ر\.ق \(60 دقيقة\)", ar) or re.search(
        r": 150 ر\.ق \(60 دقيقة\)", ar), ar
    owner_sql("update contacts set lang = 'en' where tenant_id = $1 and phone = $2",
              DEMO_TENANT_ID, AHMED_PHONE)
    en = say(client, AHMED_PHONE, reply_id="prices")[-1]["body"]
    assert "Electrician site visit: QAR 150 (60 min)" in en


@pytest.mark.parametrize("n,wanted", [
    (1, "دقيقة واحدة"), (2, "دقيقتان"), (3, "3 دقائق"), (10, "10 دقائق"),
    (11, "11 دقيقة"), (30, "30 دقيقة"), (45, "45 دقيقة"), (60, "60 دقيقة"), (90, "90 دقيقة"),
])
def test_minutes_agree_with_their_number(n, wanted):
    assert counted(n, MINUTES, "ar") == wanted


# ── the cancel window's hours ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("hours,plain,by", [
    (1, "ساعة واحدة", "بساعة واحدة"), (2, "ساعتين", "بساعتين"),
    (3, "3 ساعات", "بـ3 ساعات"), (10, "10 ساعات", "بـ10 ساعات"),
    (11, "11 ساعة", "بـ11 ساعة"), (24, "24 ساعة", "بـ24 ساعة"), (48, "48 ساعة", "بـ48 ساعة"),
])
def test_hours_agree_with_their_number_after_min_and_ba(hours, plain, by):
    assert words.hours_ar(hours) == plain and words.hours_ar(hours, by=True) == by


def terms(hours, no_show="keep", late="keep"):
    return {"cancel_hours": hours, "no_show": no_show, "late_cancel": late}


def test_the_deposit_rule_counts_its_hours_in_arabic_and_english():
    ar = words.terms_sentence(terms(3), True)
    assert "بأقل من 3 ساعات" in ar and "بـ3 ساعات أو أكثر" in ar and "3 ساعة" not in ar
    assert "بأقل من ساعتين" in words.terms_sentence(terms(2), True)
    assert "بأقل من ساعة واحدة" in words.terms_sentence(terms(1, "keep", "refund"), True)
    assert "بأقل من 24 ساعة" in words.terms_sentence(terms(24, "refund", "keep"), True)
    en = words.terms_sentence(terms(1), False)
    assert "less than 1 hour before" in en and "Cancel 1 hour or more before" in en
    assert "less than 6 hours before" in words.terms_sentence(terms(6), False)


# ── dates ───────────────────────────────────────────────────────────────────────────────


def test_every_weekday_is_the_real_one_in_arabic():
    # 21 Nov 2026 is a Saturday.
    week = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]
    for offset, name in enumerate(week):
        assert service.arabic_when(datetime(2026, 11, 21 + offset, 9, 5)).startswith(
            f"{name} {21 + offset} نوفمبر"), name


@pytest.mark.parametrize("when,wanted", [
    (datetime(2026, 10, 13, 20, 30), "الثلاثاء 13 أكتوبر، 8:30 م"),
    (datetime(2026, 10, 13, 0, 5), "الثلاثاء 13 أكتوبر، 12:05 ص"),
    (datetime(2026, 10, 13, 12, 0), "الثلاثاء 13 أكتوبر، 12:00 م"),
    (datetime(2026, 1, 1, 9, 30), "الخميس 1 يناير، 9:30 ص"),
    (datetime(2026, 12, 31, 23, 59), "الخميس 31 ديسمبر، 11:59 م"),
])
def test_an_arabic_time_has_its_weekday_and_the_hour_with_sabah_or_masaa(when, wanted):
    assert service.arabic_when(when) == wanted


def test_the_customers_next_booking_in_arabic_has_the_same_weekday_as_in_english(client):
    sid = service_id(client)
    booked = book(client, sid, times(client, sid)[0]).json()
    english = booked["when_text"]                       # "Sun 22 Nov, 8:00 AM"
    arabic_customer()
    card = say(client, AHMED_PHONE, "حجزي")[-1]["body"]
    day = ENGLISH_DAYS[english.split()[0]]
    assert re.search(rf"{day} \d+ ({'|'.join(ARABIC_MONTHS)})، \d+:\d\d [صم]\.", card), card
    assert "/" not in card
    assert str(int(english.split()[1])) in card         # the same day of the month
