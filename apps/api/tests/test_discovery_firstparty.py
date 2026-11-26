"""First-party checks (Discovery 2.0, workstream C): what only ALYR can know, because only ALYR
holds the shop's own orders, bookings, pages and confirmed number.

Each rule answers pass, fail with evidence, or not measured, and never fires on missing data. These
run the rules directly on hand-built contexts; `test_discovery_firstparty_facts.py` reads the facts
from PostgreSQL through the tenant's own connection.
"""

import re
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import uuid4

import pytest

from alyr.modules.discovery import firstparty, rules
from alyr.modules.discovery import words as words_module
from alyr.modules.discovery import words_firstparty as fw
from alyr.modules.discovery.connectors import Listing, Location, Website
from discovery_support import listing, location, place, website
from firstparty_support import (
    BOOKING,
    CLOSED_FRIDAY,
    FRIDAYS,
    ORDER,
    REAL_HOURS,
    TODAY,
    WA_LINK,
    WHATSAPP,
    activity,
    check,
    context,
    facts,
    nuqta_activity,
    single,
)

FAIL, PASS, NM = rules.FAIL, rules.PASS, rules.NOT_MEASURED
IDS = ("hours_vs_activity", "own_links_present", "whatsapp_number_mismatch",
       "bilingual_name_rule", "season_due")


def nuqta(**more):
    return location("Nuqta Car Care - West Bay", "West Bay", whatsapp=WHATSAPP, **more)


def at(loc, **parts):
    """One place: its listing (closed on Friday unless said) and no website unless given."""
    parts.setdefault("lst", listing(hours=CLOSED_FRIDAY))
    return loc, place(loc, **parts)


# ── the registry ──────────────────────────────────────────────────────────────────────────


def test_five_first_party_rules_with_the_same_rule_type_and_no_clash_with_the_twelve():
    assert tuple(r.id for r in firstparty.FIRSTPARTY_RULES) == IDS
    for rule in firstparty.FIRSTPARTY_RULES:
        assert isinstance(rule, rules.Rule)
        assert rule.part in rules.PARTS and rule.part != "ai", rule.id
        assert rule.kind in rules.KIND_ORDER and rule.severity in rules.SEVERITY_ORDER
        assert rule.weight >= 1
        assert rule.id not in rules.RULE_BY_ID
    assert set(firstparty.RULE_BY_ID) == set(IDS)


def test_every_rule_is_not_measured_when_there_are_no_first_party_facts():
    loc = nuqta()
    ctx = context(at(loc, web=website()), fp=None)
    for rule in firstparty.FIRSTPARTY_RULES:
        assert {o.state for o in rule.check(ctx)} == {NM}, rule.id


def test_a_context_without_the_field_at_all_is_not_measured_either():
    """Before the engine sets `first_party`, a rule must not fail on the missing attribute."""
    loc = nuqta()
    ctx = rules.Context(context(at(loc)).snapshot, [loc], {}, None)
    for rule in firstparty.FIRSTPARTY_RULES:
        assert {o.state for o in rule.check(ctx)} == {NM}, rule.id


# ── hours_vs_activity: the Nuqta Car Care Friday case ────────────────────────────────────


def test_closed_on_friday_on_the_listing_with_orders_and_bookings_on_every_friday_fires():
    loc = nuqta()
    fp = facts(confirmed_hours={loc.id: REAL_HOURS})
    got = single("hours_vs_activity", context(at(loc), fp=fp))
    assert got.state == FAIL and got.location_id == loc.id
    values = [(e.label, e.value, e.where) for e in got.evidence]
    assert ("fp_listing_day", "~fp_day:fri:closed", "listing") in values
    per_date = [v for v in values if v[0] == "fp_outside_listing"]
    assert [v[1] for v in per_date] == [
        "~fp_act:2026-10-30:2:3", "~fp_act:2026-11-06:1:2",
        "~fp_act:2026-11-13:3:4", "~fp_act:2026-11-20:1:2",
    ]
    assert all(v[2] == "alyr_records" for v in per_date)
    orders = sum(int(v[1].split(":")[2]) for v in per_date)
    bookings = sum(int(v[1].split(":")[3]) for v in per_date)
    assert (orders, bookings) == (7, 11)
    # The value a proposal would use is the owner's, never the activity's.
    assert ("fp_confirmed_hours", rules.hours_text(REAL_HOURS), "business") in values


def test_without_confirmed_hours_the_finding_asks_the_owner_to_confirm_them():
    loc = nuqta()
    got = single("hours_vs_activity", context(at(loc), fp=facts()))
    assert got.state == FAIL
    assert got.evidence[-1] == rules.Evidence("fp_confirmed_hours", "~fp_not_confirmed",
                                              "business")


def test_three_of_the_four_fridays_is_enough_and_two_is_not():
    loc = nuqta()
    three = activity({FRIDAYS[0]: {15: 1}, FRIDAYS[2]: {15: 1}, FRIDAYS[3]: {15: 1}}, {})
    two = activity({FRIDAYS[0]: {15: 1}, FRIDAYS[3]: {15: 1}}, {FRIDAYS[3]: {16: 2}})
    assert single("hours_vs_activity", context(at(loc), fp=facts(activity=three))).state == FAIL
    assert single("hours_vs_activity", context(at(loc), fp=facts(activity=two))).state == PASS


def test_a_day_with_nothing_still_appears_in_the_evidence_with_its_zeros():
    loc = nuqta()
    three = activity({FRIDAYS[0]: {15: 1}, FRIDAYS[2]: {15: 1}, FRIDAYS[3]: {15: 1}}, {})
    got = single("hours_vs_activity", context(at(loc), fp=facts(activity=three)))
    assert rules.Evidence("fp_outside_listing", "~fp_act:2026-11-06:0:0", "alyr_records") in (
        got.evidence)


def test_closing_earlier_than_the_activity_fires_and_activity_inside_the_hours_does_not():
    loc = nuqta()
    early = REAL_HOURS | {"thu": ("07:00", "20:00")}
    thursdays = [TODAY - timedelta(days=7 * n) for n in range(1, 5)]
    late = activity({}, {d: {20: 1, 21: 1} for d in thursdays[:3]})
    inside = activity({}, {d: {19: 2} for d in thursdays})
    got = single("hours_vs_activity", context(at(loc, lst=listing(hours=early)),
                                              fp=facts(activity=late)))
    assert got.state == FAIL
    assert rules.Evidence("fp_listing_day", "~fp_day:thu:07:00-20:00", "listing") in got.evidence
    ok = single("hours_vs_activity", context(at(loc, lst=listing(hours=early)),
                                             fp=facts(activity=inside)))
    assert ok.state == PASS


def test_an_hour_that_only_partly_overlaps_the_listed_hours_is_counted_as_inside():
    """By hour band: 13:00 to 14:00 touches a listing that opens at 13:30, so it is not counted."""
    loc = nuqta()
    late_open = REAL_HOURS | {"fri": ("13:30", "22:00")}
    busy = activity({d: {13: 1} for d in FRIDAYS}, {})
    got = single("hours_vs_activity", context(at(loc, lst=listing(hours=late_open)),
                                              fp=facts(activity=busy)))
    assert got.state == PASS


def test_the_website_hours_are_checked_too():
    loc = nuqta()
    got = single("hours_vs_activity", context(
        at(loc, lst=listing(hours=REAL_HOURS), web=website(hours=CLOSED_FRIDAY)), fp=facts()))
    assert got.state == FAIL
    labels = {e.label for e in got.evidence}
    assert "fp_website_day" in labels and "fp_listing_day" not in labels


def test_a_day_the_owner_confirmed_as_listed_is_left_alone():
    """The owner said Friday is closed; orders placed on a Friday (online) do not reopen it."""
    loc = nuqta()
    fp = facts(confirmed_hours={loc.id: CLOSED_FRIDAY})
    assert single("hours_vs_activity", context(at(loc), fp=fp)).state == PASS


def test_matching_hours_pass():
    loc = nuqta()
    got = single("hours_vs_activity", context(at(loc, lst=listing(hours=REAL_HOURS)), fp=facts()))
    assert got.state == PASS


@pytest.mark.parametrize("why, fp_more, lst", [
    ("less than 4 weeks of ALYR records", {"measured_from": TODAY - timedelta(days=20)}, None),
    ("no records at all", {"measured_from": None}, None),
    ("neither orders nor bookings switched on", {"activity": None}, None),
    ("the listing has no hours", {}, listing(hours=None)),
    ("the listing shows no hours at all", {}, listing(hours={})),
    ("there is no listing", {}, Listing(found=False)),
])
def test_hours_vs_activity_is_not_measured_when_it_cannot_tell(why, fp_more, lst):
    loc = nuqta()
    parts = {"lst": lst} if lst is not None else {}
    got = single("hours_vs_activity", context(at(loc, **parts), fp=facts(**fp_more)))
    assert got.state == NM, why


def test_with_two_places_orders_cannot_be_put_on_one_branch_so_nothing_is_measured():
    a, b = nuqta(), location("Nuqta Car Care - Al Wakra", "Al Wakra")
    got = check("hours_vs_activity", context(at(a), at(b), fp=facts()))
    assert {(o.location_id, o.state) for o in got} == {(a.id, NM), (b.id, NM)}


def test_only_bookings_switched_on_counts_bookings_and_says_nothing_of_orders():
    loc = nuqta()
    fp = facts(activity=nuqta_activity(orders_on=False))
    got = single("hours_vs_activity", context(at(loc), fp=fp))
    assert got.state == FAIL
    assert rules.Evidence("fp_outside_listing", "~fp_act:2026-10-30:-:3", "alyr_records") in (
        got.evidence)


# ── own_links_present ─────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class LinkedWebsite(Website):
    """The website snapshot once workstream E adds the links it found on the pages."""

    links: list[str] | None = None
    whatsapp_links: list[str] | None = None


@dataclass(frozen=True)
class LinkedListing(Listing):
    """A listing source that reports the links it shows (a later connector)."""

    links: list[str] | None = None


def linked_listing(**more) -> LinkedListing:
    base = listing(hours=REAL_HOURS)
    fields = {f: getattr(base, f) for f in base.__dataclass_fields__}
    return LinkedListing(**(fields | more))


def linked_website(**more) -> LinkedWebsite:
    base = website()
    fields = {f: getattr(base, f) for f in base.__dataclass_fields__}
    return LinkedWebsite(**(fields | more))


def test_all_three_links_on_the_website_pass_with_a_token_and_another_scheme_ignored():
    loc = nuqta()
    web = linked_website(links=[f"{BOOKING.replace('https', 'http')}?t=abc", f"{ORDER}/"],
                         whatsapp_link=WA_LINK)
    got = single("own_links_present", context(at(loc, lst=listing(), web=web), fp=facts()))
    assert got.state == PASS


def test_a_missing_booking_link_on_the_website_fails_and_shows_the_link_to_add():
    loc = nuqta()
    web = linked_website(links=[ORDER, "https://instagram.com/nuqta"], whatsapp_link=WA_LINK)
    got = single("own_links_present", context(at(loc, web=web), fp=facts()))
    assert got.state == FAIL
    assert got.evidence == (
        rules.Evidence("fp_booking_link", "~fp_missing", "website"),
        rules.Evidence("fp_expected_booking", BOOKING, "alyr_pages"),
    )


def test_a_page_of_another_shop_on_alyr_does_not_count():
    loc = nuqta()
    web = linked_website(links=["https://web.test/b/other-shop", ORDER], whatsapp_link=WA_LINK)
    got = single("own_links_present", context(at(loc, web=web), fp=facts()))
    assert got.state == FAIL


def test_the_listing_is_checked_when_its_source_reports_links():
    loc = nuqta()
    lst = linked_listing(links=[BOOKING], whatsapp_link="")
    got = single("own_links_present", context(at(loc, lst=lst), fp=facts()))
    assert got.state == FAIL
    assert [(e.label, e.where) for e in got.evidence if e.value == "~fp_missing"] == [
        ("fp_order_link", "listing"), ("fp_whatsapp_link", "listing")]


def test_without_a_links_field_only_the_whatsapp_link_is_measured():
    """Today's snapshot has no list of links: booking and order links are not measured, never
    reported missing."""
    loc = nuqta()
    got = single("own_links_present", context(at(loc, web=website(whatsapp_link="")), fp=facts()))
    assert got.state == FAIL
    assert [e.label for e in got.evidence] == ["fp_whatsapp_link", "fp_expected_whatsapp"]
    fine = single("own_links_present", context(at(loc, web=website(whatsapp_link=WA_LINK)),
                                               fp=facts()))
    assert fine.state == PASS


def test_a_whatsapp_link_to_another_number_is_left_to_the_number_check():
    loc = nuqta()
    got = single("own_links_present", context(
        at(loc, web=website(whatsapp_link="https://wa.me/97455550999")), fp=facts()))
    assert got.state == PASS


def test_a_link_the_business_does_not_have_is_never_asked_for():
    loc = nuqta()
    fp = facts(links=firstparty.OwnLinks(None, ORDER, None))
    web = linked_website(links=[ORDER], whatsapp_link="")
    assert single("own_links_present", context(at(loc, web=web), fp=fp)).state == PASS


@pytest.mark.parametrize("why, fp_more, parts", [
    ("no links of its own", {"links": firstparty.OwnLinks(None, None, None)},
     {"web": website(whatsapp_link="")}),
    ("nothing measured: no website and the listing has no links field", {}, {}),
    ("an unreachable website", {}, {"web": website(reachable=False, whatsapp_link="")}),
])
def test_own_links_present_is_not_measured_when_it_cannot_tell(why, fp_more, parts):
    loc = nuqta()
    got = single("own_links_present", context(at(loc, **parts), fp=facts(**fp_more)))
    assert got.state == NM, why


# ── whatsapp_number_mismatch ──────────────────────────────────────────────────────────────


def test_a_whatsapp_link_on_the_listing_to_another_number_fires():
    loc = nuqta()
    wrong = "https://wa.me/97455550999"
    got = single("whatsapp_number_mismatch",
                 context(at(loc, lst=listing(whatsapp_link=wrong)), fp=facts()))
    assert got.state == FAIL
    assert got.evidence == (
        rules.Evidence("listing_whatsapp", wrong, "listing"),
        rules.Evidence("fp_confirmed_whatsapp", WHATSAPP, "business"),
    )


@pytest.mark.parametrize("link", [
    "https://wa.me/97455550150",
    "https://wa.me/+974 5555 0150".replace(" ", ""),
    "https://api.whatsapp.com/send?phone=0097455550150",
    "https://wa.me/٩٧٤٥٥٥٥٠١٥٠",  # Arabic-Indic digits are the same number
    "https://wa.me/55550150",
])
def test_the_same_number_written_another_way_passes(link):
    loc = nuqta()
    got = single("whatsapp_number_mismatch", context(at(loc, web=website(whatsapp_link=link)),
                                                     fp=facts()))
    assert got.state == PASS, link


def test_every_whatsapp_number_the_website_shows_is_checked():
    loc = nuqta()
    web = linked_website(whatsapp_link=WA_LINK, whatsapp_links=[WA_LINK, "97455550999"])
    got = single("whatsapp_number_mismatch", context(at(loc, web=web), fp=facts()))
    assert got.state == FAIL
    assert rules.Evidence("website_whatsapp", "97455550999", "website") in got.evidence


@pytest.mark.parametrize("why, fp_more, parts", [
    ("no confirmed number", {"whatsapp": None}, {"web": website(whatsapp_link="https://wa.me/1")}),
    ("no WhatsApp link anywhere", {}, {"web": website(whatsapp_link="")}),
    ("nothing read", {}, {}),
])
def test_whatsapp_number_mismatch_is_not_measured_when_there_is_nothing_to_compare(
        why, fp_more, parts):
    loc = nuqta()
    got = single("whatsapp_number_mismatch", context(at(loc, **parts), fp=facts(**fp_more)))
    assert got.state == NM, why


# ── bilingual_name_rule ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name", [
    "Nuqta Car Care | نقطة للعناية بالسيارات",
    "Nuqta Car Care / نقطة للعناية بالسيارات",
    "نقطة للعناية بالسيارات - Nuqta Car Care",
    "Nuqta Car Care نقطة للعناية بالسيارات",
    "NUQTA CAR CARE (نُقطة للعناية بالسيارات)",  # case and a diacritic do not hide it
    "Nuqta Car Care - West Bay | نقطة للعناية بالسيارات",  # the branch is not part of the name
])
def test_a_listing_name_that_repeats_the_business_name_in_both_scripts_fires(name):
    loc = nuqta()
    got = single("bilingual_name_rule", context(at(loc, lst=listing(name=name)), fp=facts()))
    assert got.state == FAIL, name
    assert got.evidence[0] == rules.Evidence("listing_name", name, "listing")
    assert {e.label for e in got.evidence[1:]} == {"fp_name_en", "fp_name_ar"}


def test_hamza_and_taa_marbuta_spellings_are_one_arabic_name():
    loc = nuqta()
    fp = facts(name_ar="مغسلة الأمانة")
    got = single("bilingual_name_rule", context(
        at(loc, lst=listing(name="Nuqta Car Care | مغسله الامانه")), fp=fp))
    assert got.state == FAIL


@pytest.mark.parametrize("name", ["Nuqta Car Care", "نقطة للعناية بالسيارات"])
def test_one_script_passes(name):
    loc = nuqta()
    assert single("bilingual_name_rule", context(at(loc, lst=listing(name=name)),
                                                 fp=facts())).state == PASS


@pytest.mark.parametrize("why, name, fp_more", [
    ("an Arabic part that is not the business's Arabic name", "Nuqta Car Care مغسلة", {}),
    ("no Arabic name confirmed", "Nuqta Car Care | نقطة", {"name_ar": ""}),
    ("no listing name", None, {}),
])
def test_bilingual_name_rule_never_fires_on_what_it_cannot_tell(why, name, fp_more):
    loc = nuqta()
    got = single("bilingual_name_rule", context(at(loc, lst=listing(name=name)),
                                                fp=facts(**fp_more)))
    assert got.state == NM, why


def test_the_places_own_arabic_name_counts_as_confirmed():
    loc = Location(uuid4(), "Nuqta Car Care - West Bay", "نقطة", "West Bay",
                   whatsapp_e164=WHATSAPP)
    got = single("bilingual_name_rule", context(at(loc, lst=listing(name="Nuqta Car Care | نقطة")),
                                                fp=facts(name_ar="")))
    assert got.state == FAIL


# ── season_due ────────────────────────────────────────────────────────────────────────────


def season_on(day: date, **more) -> rules.Outcome:
    loc = nuqta()
    return single("season_due", context(at(loc), fp=facts(today=day, **more)))


def test_the_calendar_holds_the_expected_dates_and_national_day_every_year():
    seasons = {(s.key, s.expected) for s in firstparty.SEASONS}
    assert ("national_day", date(2026, 12, 18)) in seasons
    assert ("national_day", date(2027, 12, 18)) in seasons
    assert ("ramadan", date(2027, 2, 8)) in seasons  # 1 Ramadan 1448, Umm al-Qura
    for season in firstparty.SEASONS:
        assert season.key in fw.SEASON_NAMES


def test_national_day_is_due_three_weeks_before_and_until_the_day():
    assert season_on(date(2026, 11, 26)).state == PASS
    got = season_on(date(2026, 11, 27))
    assert got.state == FAIL and got.location_id is None
    assert got.evidence == (
        rules.Evidence("fp_season", "~fp_season:national_day:2026-12-18:fixed", "alyr_calendar"),)
    assert season_on(date(2026, 12, 18)).state == FAIL
    assert season_on(date(2026, 12, 19)).state == PASS


def test_ramadan_is_due_four_weeks_before_the_expected_start():
    assert season_on(date(2027, 1, 10)).state == PASS
    got = season_on(date(2027, 1, 11))
    assert got.state == FAIL
    assert got.evidence[0].value == "~fp_season:ramadan:2027-02-08:expected"


def test_eid_is_due_only_once_it_is_announced_and_then_shows_the_announced_day():
    assert season_on(date(2027, 3, 8)).state == PASS
    announced = tuple(
        firstparty.Season(s.key, s.expected, s.lead_days, s.fixed, date(2027, 3, 8),
                          date(2027, 3, 10))
        if s.key == "eid_al_fitr" else s
        for s in firstparty.SEASONS
    )
    got = season_on(date(2027, 3, 8), seasons=announced)
    assert got.state == FAIL
    assert got.evidence[0].value == "~fp_season:eid_al_fitr:2027-03-10:announced"


def test_an_announced_ramadan_is_asked_again_up_to_its_announced_start():
    announced = tuple(
        firstparty.Season(s.key, s.expected, s.lead_days, s.fixed, date(2027, 2, 7),
                          date(2027, 2, 9))
        if s.key == "ramadan" else s
        for s in firstparty.SEASONS
    )
    got = season_on(date(2027, 2, 9), seasons=announced)
    assert got.state == FAIL
    assert got.evidence[0].value == "~fp_season:ramadan:2027-02-09:announced"
    assert season_on(date(2027, 2, 10), seasons=announced).state == PASS


def test_alyr_never_guesses_a_date_the_calendar_does_not_hold():
    assert season_on(TODAY, seasons=()).state == NM
    past = (firstparty.Season("national_day", date(2025, 12, 18), 21, True),)
    assert season_on(TODAY, seasons=past).state == NM


# ── words ─────────────────────────────────────────────────────────────────────────────────

BANNED = re.compile(
    r"\b(AI|smart|intelligen\w*|learns?|understands?|thinks?|predicts?|forecast\w*|knows?|"
    r"notices?|assistant|agentic|health score|top performer|business intelligence|reads?)\b",
    re.I)
ARABIC = re.compile(r"[؀-ۿ]")


def test_every_rule_has_every_field_in_both_languages():
    assert set(fw.RULE_WORDS) == set(IDS) == set(fw.CHECK_NAMES)
    for rule_id, fields in fw.RULE_WORDS.items():
        assert set(fields) == {"title", "rule", "why", "what_happens", "what_is_needed"}, rule_id
        for en, ar in fields.values():
            assert en.strip() and ARABIC.search(ar), rule_id
        assert fields["what_happens"][0].lower().startswith(("nothing", "no")), rule_id


def test_nothing_is_empty_none_has_an_ellipsis_or_an_ai_word():
    for text in fw.all_texts():
        assert isinstance(text, str) and text.strip(), repr(text)
        assert "…" not in text and "..." not in text, text
        assert not BANNED.search(text), (BANNED.search(text).group(0), text)


def test_no_key_clashes_with_the_existing_words():
    assert not set(fw.LABELS) & set(words_module.LABELS)
    assert not set(fw.WHERE) & set(words_module.WHERE)
    assert not set(fw.VALUES) & set(words_module.VALUES)


@pytest.mark.parametrize("value, en, ar", [
    ("~fp_act:2026-11-20:2:3", "Fri 20 Nov 2026: 2 orders, 3 bookings",
     "جمعة 20 نوفمبر 2026: طلبان، 3 حجوزات"),
    ("~fp_act:2026-11-06:1:0", "Fri 6 Nov 2026: 1 order, 0 bookings",
     "جمعة 6 نوفمبر 2026: طلب واحد، 0 حجوزات"),
    ("~fp_act:2026-10-30:-:11", "Fri 30 Oct 2026: 11 bookings", "جمعة 30 أكتوبر 2026: 11 حجزاً"),
    ("~fp_act:2026-10-30:7:-", "Fri 30 Oct 2026: 7 orders", "جمعة 30 أكتوبر 2026: 7 طلبات"),
    ("~fp_day:fri:closed", "Fri: closed", "جمعة: مغلق"),
    ("~fp_day:thu:07:00-20:00", "Thu: 07:00-20:00", "خميس: 07:00-20:00"),
    ("~fp_season:national_day:2026-12-18:fixed", "Qatar National Day, 18 Dec 2026",
     "اليوم الوطني لقطر، 18 ديسمبر 2026"),
    ("~fp_season:ramadan:2027-02-08:expected", "Ramadan, expected to start around 8 Feb 2027",
     "رمضان، يُتوقع أن يبدأ نحو 8 فبراير 2027"),
    ("~fp_season:eid_al_fitr:2027-03-10:announced",
     "Eid al-Fitr, starting 10 Mar 2027 as announced",
     "عيد الفطر، يبدأ في 10 مارس 2027 حسب الإعلان"),
    ("~fp_missing", "Not there", "غير موجود"),
    ("~fp_not_confirmed", "Not confirmed yet", "لم تُؤكَّد بعد"),
])
def test_markers_are_worded_in_both_languages(value, en, ar):
    assert fw.value_text(value, "en") == en
    assert fw.value_text(value, "ar") == ar


def test_a_value_that_is_not_a_first_party_marker_is_left_to_words_py():
    assert fw.value_text("~days:sat,sun", "en") is None
    assert fw.value_text("Nuqta Car Care", "ar") is None


def every_outcome() -> list[rules.Outcome]:
    """Every rule failing at least once, from the scenarios above."""
    loc = nuqta()
    web = linked_website(links=[], whatsapp_link="", whatsapp_links=["97455550999"])
    lst = listing(hours=CLOSED_FRIDAY, name="Nuqta Car Care | نقطة للعناية بالسيارات",
                  whatsapp_link="https://wa.me/97455550999")
    ctx = context(at(loc, lst=lst, web=web), fp=facts(today=date(2026, 11, 30)))
    out = [o for rule in firstparty.FIRSTPARTY_RULES for o in rule.check(ctx)]
    out += check("hours_vs_activity", context(at(loc), fp=facts(confirmed_hours={
        loc.id: REAL_HOURS})))
    return out


def test_every_piece_of_evidence_the_rules_produce_is_worded_in_both_languages():
    out = every_outcome()
    assert {o.rule_id for o in out if o.state == FAIL} == set(IDS)
    for o in out:
        for e in o.evidence:
            for lang in ("en", "ar"):
                label = fw.LABELS.get(e.label) or words_module.LABELS.get(e.label)
                where = fw.WHERE.get(e.where) or words_module.WHERE.get(e.where)
                assert label and where, (e.label, e.where)
                value = fw.value_text(e.value, lang)
                if value is None:
                    value = words_module.value_text(e.value, lang)
                assert value and not value.startswith("~"), (e.value, lang)
