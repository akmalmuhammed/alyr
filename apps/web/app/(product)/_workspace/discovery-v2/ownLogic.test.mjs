// The final screen pass (agent P3): the first-party parser, check sentences, ALYR's own records as
// the chart draws them, the bars of an hours ask, empty values named by field, and the new words.
// Run: node --test "app/**/*.test.mjs".

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChecks, parseFirstParty } from "../discoveryApi.ts";
import { focusFor, ownRecords, phoneText, windowTotals } from "./ownLogic.ts";
import { buildChecks, linesOf, sentenceOf } from "./screens.ts";
import { beforeAfter, emptyBefore, noneOf } from "./logic.ts";
import { T3 } from "./copy3.ts";

/** Counts keep their noun with a no-break space; compare as plain spaces. */
const sp = (s) => s.replace(/\u00a0/g, " ");
const WEEKDAYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
const days = (fn) => Array.from({ length: 28 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 9, 31 + i)).toISOString().slice(0, 10);
  const weekday = WEEKDAYS[i % 7];
  return { date, weekday, ...fn(weekday, i) };
});
const SRC = { source: "alyr_records", source_label: "ALYR's records of orders and bookings", read_at: "2026-11-28T11:46:51Z" };
const ANSWER = {
  read_at: "2026-11-28T11:46:51Z", timezone: "Asia/Qatar", window: { from: "2026-10-31", to: "2026-11-27", weeks: 4 }, covered: true, counts_only: false,
  activity: { orders: true, bookings: true, days: days((w) => ({ orders: w === "thu" ? 3 : w === "fri" ? 0 : 1, bookings: w === "thu" ? 2 : 0 })), hours: { thu: { orders: Array(24).fill(0), bookings: Array(24).fill(0) } }, ...SRC },
  links: { booking: "http://localhost/b/al-noor", order: "http://localhost/s/al-noor", whatsapp: "https://wa.me/97455550150", source: "alyr_pages", source_label: "The business's pages on ALYR", read_at: "2026-11-28T11:46:51Z" },
  whatsapp: { number: "+97455550150", source: "sample", source_label: "Sample data", read_at: "2026-11-28T11:46:51Z" },
  names: { en: "Al Noor Electricals", ar: "النور للكهربائيات", source: "business", source_label: "The business's details in ALYR", read_at: "2026-11-28T11:46:51Z" },
  focus: null,
  revenue: 12345, total_qar: 99,
};

test("parseFirstParty reads the counts, the pages, the number and the names, and nothing else", () => {
  const fp = parseFirstParty(ANSWER);
  assert.equal(fp.activity.days.length, 28);
  assert.equal(fp.activity.days[5].weekday, "thu");
  assert.deepEqual(fp.window, { from: "2026-10-31", to: "2026-11-27", weeks: 4 });
  assert.equal(fp.links.booking, "http://localhost/b/al-noor");
  assert.equal(fp.whatsapp.number, "+97455550150");
  assert.equal(fp.names.ar, "النور للكهربائيات");
  // A money figure, or any key the screens do not know, is never carried.
  assert.equal(JSON.stringify(fp).includes("12345"), false);
  assert.equal("revenue" in fp, false);
});

test("staff get the counts alone, whatever the answer carries", () => {
  const fp = parseFirstParty({ ...ANSWER, counts_only: true });
  assert.equal(fp.counts_only, true);
  assert.equal(fp.links, null);
  assert.equal(fp.whatsapp, null);
  assert.equal(fp.names, null);
  assert.equal(fp.activity.days.length, 28);
});

test("a product that is off is null, never a zero; a broken answer is empty, not a crash", () => {
  const fp = parseFirstParty({ ...ANSWER, activity: { ...ANSWER.activity, bookings: false } });
  assert.equal(fp.activity.days.every((d) => d.bookings === null), true);
  assert.deepEqual(parseFirstParty(null), { read_at: null, timezone: "Asia/Qatar", window: null, covered: false, counts_only: false, activity: null, links: null, whatsapp: null, names: null, focus: null });
  const bad = parseFirstParty({ activity: { orders: true, days: [{ date: "yesterday", orders: 3 }, { date: "2026-11-01", weekday: "sun", orders: -2 }] } });
  assert.deepEqual(bad.activity.days, [{ date: "2026-11-01", weekday: "sun", orders: null, bookings: null }]);
});

test("the focus of an hours ask is read with its weeks", () => {
  const fp = parseFirstParty({ ...ANSWER, focus: { proposal_id: "p1", day: "fri", weeks: [{ date: "2026-11-06", orders: 2, bookings: 3 }, { date: "nope", orders: 1, bookings: 1 }] } });
  assert.deepEqual(fp.focus, { proposal_id: "p1", day: "fri", weeks: [{ date: "2026-11-06", orders: 2, bookings: 3 }] });
  assert.equal(parseFirstParty({ ...ANSWER, focus: { proposal_id: "p1", day: null, weeks: [] } }).focus.day, null);
});

test("the week: per weekday, the busiest day, the quiet days and the one sentence", () => {
  const view = ownRecords(parseFirstParty(ANSWER));
  assert.equal(view.state, "content");
  assert.equal(view.weekdays.map((d) => d.day).join(","), WEEKDAYS.join(","));
  const thu = view.weekdays.find((d) => d.day === "thu");
  assert.deepEqual([thu.orders, thu.bookings, thu.total, thu.share], [12, 8, 20, 1]);
  assert.equal(view.busiest, "thu");
  assert.deepEqual(view.quiet, ["fri"]);
  assert.equal(sp(T3.en.pointQuiet(view.quiet, view.busiest, view.orders, view.bookings, view.weeks)), "Thursdays were the busiest, with 12 orders and 8 bookings in 4 weeks; nothing came in on Fridays.");
  assert.match(T3.ar.pointQuiet(view.quiet, view.busiest, view.orders, view.bookings, view.weeks), /الخميس/);
  assert.deepEqual(windowTotals(parseFirstParty(ANSWER)), { orders: 32, bookings: 8 });
});

test("a tie has no busiest day; nothing counted is the empty state; no products is off", () => {
  const tie = ownRecords(parseFirstParty({ ...ANSWER, activity: { ...ANSWER.activity, days: days(() => ({ orders: 1, bookings: 0 })) } }));
  assert.equal(tie.busiest, null);
  assert.equal(T3.en.pointAll(tie.what, tie.busiest, tie.orders, tie.bookings, 4), "Orders or bookings came in on every day of the week.");
  const none = ownRecords(parseFirstParty({ ...ANSWER, activity: { ...ANSWER.activity, days: days(() => ({ orders: 0, bookings: 0 })) } }));
  assert.equal(none.state, "empty");
  assert.equal(ownRecords(parseFirstParty({ ...ANSWER, activity: null })).state, "off");
  assert.equal(ownRecords(null), null);
});

test("an hours ask gets its weekday's bars only for itself and only for one day", () => {
  const fp = parseFirstParty({ ...ANSWER, focus: { proposal_id: "p1", day: "fri", weeks: [{ date: "2026-11-06", orders: 2, bookings: null }] } });
  const p = { id: "p1", field: "hours", before: { text: "Fri: Closed", lines: [{ day: "fri", text: "Closed" }], removed: false } };
  const bars = focusFor(fp, p, "fri");
  assert.deepEqual(bars.weeks, [{ date: "2026-11-06", orders: 2, bookings: 0 }]);
  assert.equal(bars.listingSaidClosed, true);
  assert.equal(focusFor(fp, { ...p, id: "p2" }, "fri"), null);
  assert.equal(focusFor(fp, p, "thu"), null);
  assert.equal(focusFor(fp, p, null), null);
  assert.equal(focusFor(fp, { ...p, before: { text: "", lines: [], removed: false } }, "fri").listingSaidClosed, false);
});

test("phone numbers are written as people write them", () => {
  assert.equal(phoneText("+97455550150"), "+974 5555 0150");
  assert.equal(phoneText("+971501234567"), "+971501234567");
});

const CHECKS = {
  run_id: "r1", finished_at: "2026-11-28T11:46:00Z", measured: true,
  rules: [{ id: "hours_missing", part: "presence", label: "Hours shown", pack: "core" }, { id: "own_links_present", part: "presence", label: "Booking and order links", pack: "core", first_party: true }],
  places: [
    { id: "a", name: "Nuqta - West Bay", checks: { hours_missing: "pass", own_links_present: "not_measured" }, fixed: [], sentences: { hours_missing: { sentence_en: "Your Google listing shows opening hours.", sentence_ar: "صفحتك على Google تعرض ساعات العمل." }, own_links_present: { sentence_en: "Links to your booking and order pages on ALYR: Not measured.", sentence_ar: "روابط صفحتَي الحجز والطلب الخاصتين بك على ALYR: لم يُقَس." }, made_up: { sentence_en: "x", sentence_ar: "y" } } },
    { id: "b", name: "Nuqta - Lusail", checks: { hours_missing: "pass" }, fixed: [], sentences: { hours_missing: { sentence_en: "Your Google listing shows opening hours.", sentence_ar: "صفحتك على Google تعرض ساعات العمل." } } },
  ],
  business: { checks: {}, fixed: [] },
};

test("check rows carry their sentences; a check the row does not have, or half a sentence, is left out", () => {
  const a = parseChecks(CHECKS);
  assert.deepEqual(Object.keys(a.places[0].sentences), ["hours_missing", "own_links_present"]);
  assert.equal("sentences" in a.business, false);
  const half = parseChecks({ ...CHECKS, places: [{ ...CHECKS.places[1], sentences: { hours_missing: { sentence_en: "Only English." } } }] });
  assert.equal("sentences" in half.places[0], false);
});

test("Checks draws the sentence in the reader's language, one line for the same sentence at several places", () => {
  const view = buildChecks({ checks: parseChecks(CHECKS), findings: [], packs: [], block: null, waiting: [], titles: { core: "Core", own: "Own" }, lang: "ar" });
  const lines = linesOf(view.groups.find((g) => g.id === "core").rows);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].sentence, "صفحتك على Google تعرض ساعات العمل.");
  assert.deepEqual(lines[0].places, ["Nuqta - West Bay", "Nuqta - Lusail"]);
  const own = view.groups.find((g) => g.id === "own").rows[0];
  // "Not measured" is the pill's word: the sentence says what was looked at.
  assert.equal(own.sentence, "روابط صفحتَي الحجز والطلب الخاصتين بك على ALYR");
  assert.equal(sentenceOf({ en: "Links to your pages: Not measured.", ar: "" }, "nm", "en"), "Links to your pages");
  assert.equal(sentenceOf(undefined, "ok", "en"), null);
});

test("an empty value is named for what it is, never a bare None", () => {
  const p = (field, text) => ({ field, before: { text, lines: [], removed: false }, after: { text: "Car wash", lines: [], removed: false } });
  assert.equal(beforeAfter(p("category", ""), "en").before, "No category");
  assert.equal(beforeAfter(p("review_reply", "no reply"), "ar").before, "بلا رد");
  assert.equal(noneOf("something_new", "en"), "Empty");
  assert.equal(emptyBefore(p("category", "None")), true);
  assert.equal(emptyBefore(p("category", "Car repair")), false);
  for (const lang of ["en", "ar"]) for (const v of Object.values(T3[lang].noneOf)) assert.notEqual(v.toLowerCase(), "none");
});

test("the new words exist in both languages and say nothing ALYR must not say", () => {
  assert.deepEqual(Object.keys(T3.ar).sort(), Object.keys(T3.en).sort());
  const banned = /\b(AI|smart|intelligen\w*|learns?|understands?|thinks?|predicts?|forecast|knows?|noticed|assistant|agentic)\b|\b(I|we|our|my)\b/i;
  const sample = (lang) => {
    const t = T3[lang];
    return [
      t.ownTitle, t.ownSub("Sat 31 Oct", "Fri 27 Nov"), t.pointAll("both", "thu", 3, 2, 4), t.pointQuiet(["fri", "sat"], "thu", 3, 2, 4), t.ownEmptyTitle, t.ownEmptyBody,
      t.ownOffTitle, t.ownOffBody, t.ownPartial, t.factsTitle, t.countsOnly, t.neTitle, t.neSub("car care in Doha", 3, 3, 1), t.whyBody(3, 33),
      t.nextAt("Sat 5 Dec 14:46"), t.nextManual, t.replyTo(3, "Lina W."), t.replyLang("ar"), t.sameCount(17),
    ];
  };
  for (const line of sample("en")) assert.equal(banned.test(line), false, line);
  for (const lang of ["en", "ar"]) for (const line of sample(lang)) assert.equal(/\.\.\.|…/.test(line), false, line);
  assert.equal(sp(T3.en.neSub("car care in Doha", 3, 3, 1)), "A share is named only from 30 answers per answer tool in each language. About car care in Doha, there are 3 answers in English and 3 answers in Arabic so far, from 1 answer tool.");
  assert.equal(sp(T3.en.whyBody(3, 33)), "With 3 answers, one answer more or less moves a share by 33 points. With 30, it moves it by about 3, so a share starts to say something.");
});
