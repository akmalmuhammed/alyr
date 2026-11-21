// Tests for the product's formatters (Product UI foundation): money, time, dates, ranges, how
// long ago, the empty value, initials and Arabic agreement, in English and Arabic, all in Doha's
// time. Run with `node --test` from apps/web (the file is also in `pnpm test`).

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  EN_DASH,
  NBSP,
  WEEKDAY_INITIAL,
  agree,
  ago,
  amount,
  counted,
  dateRange,
  formatDate,
  formatDateTime,
  formatTime,
  getClock,
  initials,
  isolate,
  money,
  none,
  range,
  setClock,
  timeRange,
} from "./format.ts";

/** The text with every no-break space as a plain one, so a test reads as the screen does. */
const plain = (text) => text.replaceAll(NBSP, " ");

// Thursday 12 Nov 2026, 09:40 in Doha (UTC+3), the drawings' "now".
const NOW = new Date("2026-11-12T06:40:00Z");

afterEach(() => setClock(24));

// ── money ─────────────────────────────────────────────────

test("money is QAR in English with no .00 and a thousands comma", () => {
  assert.equal(plain(money(8500, "en")), "QAR 85");
  assert.equal(plain(money(8550, "en")), "QAR 85.50");
  assert.equal(plain(money(123400, "en")), "QAR 1,234");
  assert.equal(plain(money(123456, "en")), "QAR 1,234.56");
  assert.equal(plain(money(100000000, "en")), "QAR 1,000,000");
  assert.equal(plain(money(5, "en")), "QAR 0.05");
  assert.equal(plain(money(0, "en")), "QAR 0");
});

test("money in Arabic is the amount, a no-break space, then ر.ق, in Western digits", () => {
  assert.equal(money(8500, "ar"), `85${NBSP}ر.ق`);
  assert.equal(money(8550, "ar"), `85.50${NBSP}ر.ق`);
  assert.equal(money(123400, "ar"), `1,234${NBSP}ر.ق`);
  assert.doesNotMatch(money(123400, "ar"), /[٠-٩]|QAR/);
});

test("the currency never wraps from its number, in either language", () => {
  assert.match(money(8500, "en"), new RegExp(`^QAR${NBSP}85$`));
  assert.match(money(8500, "ar"), new RegExp(`^85${NBSP}ر\\.ق$`));
});

test("paper money keeps two decimals, on a whole amount too", () => {
  assert.equal(plain(money(311000, "en", { paper: true })), "QAR 3,110.00");
  assert.equal(plain(money(311000, "ar", { paper: true })), "3,110.00 ر.ق");
  assert.equal(plain(money(8550, "en", { paper: true })), "QAR 85.50");
  assert.equal(plain(money(0, "en", { paper: true })), "QAR 0.00");
});

test("a Meta rate takes up to three decimals and at least two", () => {
  // 12.4 dirhams is QAR 0.124.
  assert.equal(plain(money(12.4, "en", { rate: true })), "QAR 0.124");
  assert.equal(plain(money(756, "en", { rate: true })), "QAR 7.56");
  assert.equal(plain(money(10, "en", { rate: true })), "QAR 0.10");
  assert.equal(plain(money(8500, "en", { rate: true })), "QAR 85.00");
  assert.equal(plain(money(12.4, "ar", { rate: true })), "0.124 ر.ق");
});

test("a negative amount keeps its minus in front", () => {
  assert.equal(plain(money(-2400, "en")), "-QAR 24");
  assert.equal(plain(money(-2450, "en")), "-QAR 24.50");
  assert.equal(plain(money(-2400, "ar")), "-24 ر.ق");
  assert.equal(plain(money(-0, "en")), "QAR 0");
});

test("an unknown amount is the empty value, not QAR NaN", () => {
  assert.equal(money(null, "en"), "None");
  assert.equal(money(undefined, "ar"), "لا يوجد");
  assert.equal(money(Number.NaN, "en"), "None");
});

test("amount is the number alone", () => {
  assert.equal(amount(8500), "85");
  assert.equal(amount(8550), "85.50");
  assert.equal(amount(1), "0.01");
});

// ── the empty value ───────────────────────────────────────

test("none is a word in each language and never an em dash", () => {
  assert.equal(none("en"), "None");
  assert.equal(none("ar"), "لا يوجد");
  assert.doesNotMatch(none("en") + none("ar"), /—/);
});

// ── time ──────────────────────────────────────────────────

test("time is 24 hour by default, in Doha's clock whatever the device says", () => {
  assert.equal(getClock(), 24);
  assert.equal(formatTime(NOW, "en"), "09:40");
  assert.equal(formatTime(NOW, "ar"), "09:40");
  // Midnight in Doha is 21:00 UTC the day before.
  assert.equal(formatTime("2026-11-11T21:05:00Z", "en"), "00:05");
  assert.equal(formatTime("2026-11-12T10:30:00+03:00", "en"), "10:30");
  assert.equal(formatTime(Date.UTC(2026, 10, 12, 13, 59), "en"), "16:59");
});

test("a time written alone and a time with no zone are kept as the wall shows them", () => {
  assert.equal(formatTime("07:00", "en"), "07:00");
  assert.equal(formatTime("7:05", "en"), "07:05");
  assert.equal(formatTime("2026-11-12T09:40:00", "en"), "09:40");
  assert.equal(formatTime("24:00", "en"), "None");
});

test("one switch flips every time to 12 hour, in both languages", () => {
  setClock(12);
  assert.equal(plain(formatTime(NOW, "en")), "9:40 AM");
  assert.equal(plain(formatTime(NOW, "ar")), "9:40 ص");
  assert.equal(plain(formatTime("2026-11-12T13:30:00Z", "en")), "4:30 PM");
  assert.equal(plain(formatTime("2026-11-12T13:30:00Z", "ar")), "4:30 م");
  assert.equal(plain(formatTime("2026-11-11T21:05:00Z", "en")), "12:05 AM");
  assert.equal(plain(formatTime("2026-11-12T09:00:00Z", "en")), "12:00 PM");
  setClock(24);
  assert.equal(formatTime(NOW, "en"), "09:40");
});

test("a call can ask for a clock without touching the switch", () => {
  assert.equal(plain(formatTime(NOW, "en", { clock: 12 })), "9:40 AM");
  assert.equal(getClock(), 24);
  setClock(12);
  assert.equal(formatTime(NOW, "en", { clock: 24 }), "09:40");
});

test("a time that cannot be read is the empty value", () => {
  assert.equal(formatTime("soon", "en"), "None");
  assert.equal(formatTime(null, "ar"), "لا يوجد");
  assert.equal(formatTime("2026-11-12", "en"), "None");
});

// ── dates ─────────────────────────────────────────────────

test("a date is weekday, day and month, with no year in the current year", () => {
  assert.equal(plain(formatDate(NOW, "en", { now: NOW })), "Thu 12 Nov");
  assert.equal(plain(formatDate("2026-11-12", "en", { now: NOW })), "Thu 12 Nov");
  assert.equal(plain(formatDate("2026-01-01", "en", { now: NOW })), "Thu 1 Jan");
  assert.equal(plain(formatDate(NOW, "ar", { now: NOW })), "الخميس 12 نوفمبر");
});

test("the year appears when it is not the current year, and the weekday is that year's", () => {
  assert.equal(plain(formatDate("2027-02-08", "en", { now: NOW })), "Mon 8 Feb 2027");
  assert.equal(plain(formatDate("2025-12-31", "en", { now: NOW })), "Wed 31 Dec 2025");
  assert.equal(plain(formatDate("2027-02-08", "ar", { now: NOW })), "الاثنين 8 فبراير 2027");
});

test("a date near midnight is read in Doha, not on the device's UTC date", () => {
  // 22:30 UTC on 11 Nov is 01:30 on 12 Nov in Doha.
  assert.equal(plain(formatDate("2026-11-11T22:30:00Z", "en", { now: NOW })), "Thu 12 Nov");
  // And the New Year turns three hours early.
  assert.equal(plain(formatDate("2026-12-31T21:30:00Z", "en", { now: NOW })), "Fri 1 Jan 2027");
});

test("the year rule follows now, also in Doha", () => {
  const lateNewYearsEve = new Date("2026-12-31T21:30:00Z"); // already 2027 in Doha
  assert.equal(plain(formatDate("2027-01-02", "en", { now: lateNewYearsEve })), "Sat 2 Jan");
  assert.equal(plain(formatDate("2026-12-30", "en", { now: lateNewYearsEve })), "Wed 30 Dec 2026");
});

test("year and weekday can be forced or dropped", () => {
  assert.equal(plain(formatDate(NOW, "en", { now: NOW, year: "always" })), "Thu 12 Nov 2026");
  assert.equal(plain(formatDate("2027-02-08", "en", { now: NOW, year: "never" })), "Mon 8 Feb");
  assert.equal(plain(formatDate(NOW, "en", { now: NOW, weekday: false })), "12 Nov");
  assert.equal(plain(formatDate(NOW, "ar", { now: NOW, weekday: false })), "12 نوفمبر");
});

test("a date that cannot be read, or a time alone, is the empty value", () => {
  assert.equal(formatDate("tomorrow", "en"), "None");
  assert.equal(formatDate("09:40", "en"), "None");
  assert.equal(formatDate(undefined, "ar"), "لا يوجد");
});

test("every weekday and month name of 2026 matches the calendar", () => {
  const days = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
  for (let i = 0; i < 7; i++) {
    const day = String(1 + i).padStart(2, "0");
    assert.ok(plain(formatDate(`2026-01-${day}`, "en", { now: NOW })).startsWith(days[i]));
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  months.forEach((name, i) => {
    assert.ok(plain(formatDate(`2026-${String(i + 1).padStart(2, "0")}-10`, "en", { now: NOW })).includes(` ${name}`));
  });
});

test("a date with a time puts a comma between", () => {
  assert.equal(plain(formatDateTime(NOW, "en", { now: NOW })), "Thu 12 Nov, 09:40");
  assert.equal(plain(formatDateTime(NOW, "ar", { now: NOW, clock: 12 })), "الخميس 12 نوفمبر, 9:40 ص");
  assert.equal(formatDateTime("2026-11-12", "en"), "None");
});

test("the one-letter weekdays run from Sunday", () => {
  assert.equal(WEEKDAY_INITIAL.ar.join(" "), "ح ن ث ر خ ج س");
  assert.equal(WEEKDAY_INITIAL.en.length, 7);
});

// ── ranges ────────────────────────────────────────────────

test("a range joins with an en dash and no spaces", () => {
  assert.equal(range("07:00", "22:00"), `07:00${EN_DASH}22:00`);
  assert.equal(range(0, 30), "0–30");
  assert.equal(timeRange("07:00", "22:00", "en"), "07:00–22:00");
  assert.equal(timeRange("07:00", "22:00", "ar"), "07:00–22:00");
  assert.doesNotMatch(range("a", "b"), /—| to /);
});

test("a time range follows the clock switch", () => {
  assert.equal(plain(timeRange("07:00", "22:00", "en", { clock: 12 })), "7:00 AM–10:00 PM");
});

test("a date range collapses a shared month", () => {
  assert.equal(plain(dateRange("2026-11-04", "2026-11-10", "en", { now: NOW })), "4–10 Nov");
  assert.equal(plain(dateRange("2026-10-28", "2026-11-03", "en", { now: NOW })), "28 Oct–3 Nov");
  assert.equal(plain(dateRange("2026-11-04", "2026-11-10", "ar", { now: NOW })), "4–10 نوفمبر");
  assert.equal(plain(dateRange("2026-12-28", "2027-01-03", "en", { now: NOW })), "28 Dec 2026–3 Jan 2027");
  assert.equal(plain(dateRange("2027-02-02", "2027-02-08", "en", { now: NOW })), "2–8 Feb 2027");
  assert.equal(dateRange("x", "2026-11-10", "en"), "None");
});

// ── how long ago ──────────────────────────────────────────

const at = (secondsAgo) => new Date(NOW.getTime() - secondsAgo * 1000);

test("ago is minutes, hours and days", () => {
  assert.equal(plain(ago(at(4 * 60 + 20), "en", NOW)), "4 min");
  assert.equal(plain(ago(at(59 * 60 + 59), "en", NOW)), "59 min");
  assert.equal(plain(ago(at(60 * 60), "en", NOW)), "1 h");
  assert.equal(plain(ago(at(3 * 3600 + 1800), "en", NOW)), "3 h");
  assert.equal(plain(ago(at(24 * 3600), "en", NOW)), "1 d");
  assert.equal(plain(ago(at(2 * 86400 + 5000), "en", NOW)), "2 d");
  assert.equal(plain(ago(at(29 * 86400), "en", NOW)), "29 d");
});

test("ago under a minute is just now, and the future never reads as negative", () => {
  assert.equal(ago(at(0), "en", NOW), "Just now");
  assert.equal(ago(at(59), "en", NOW), "Just now");
  assert.equal(ago(at(-90), "en", NOW), "Just now");
  assert.equal(ago(at(59), "ar", NOW), "الآن");
});

test("ago from a month on is the date", () => {
  assert.equal(plain(ago("2026-10-01T10:00:00Z", "en", NOW)), "Thu 1 Oct");
  assert.equal(plain(ago("2025-10-01T10:00:00Z", "en", NOW)), "Wed 1 Oct 2025");
});

test("ago in Arabic uses the short minute and hour, and agreement for days", () => {
  assert.equal(plain(ago(at(4 * 60), "ar", NOW)), "4 د");
  assert.equal(plain(ago(at(3 * 3600), "ar", NOW)), "3 س");
  assert.equal(ago(at(86400), "ar", NOW), "يوم واحد");
  assert.equal(ago(at(2 * 86400), "ar", NOW), "يومان");
  assert.equal(plain(ago(at(5 * 86400), "ar", NOW)), "5 أيام");
  assert.equal(plain(ago(at(12 * 86400), "ar", NOW)), "12 يوماً");
});

test("ago takes text with a zone and refuses text without an instant", () => {
  assert.equal(plain(ago("2026-11-12T06:30:00Z", "en", NOW)), "10 min");
  assert.equal(plain(ago("2026-11-12T09:30:00+03:00", "en", NOW)), "10 min");
  // No zone means Doha's wall clock.
  assert.equal(plain(ago("2026-11-12T09:30:00", "en", NOW)), "10 min");
  assert.equal(ago("09:30", "en", NOW), "None");
  assert.equal(ago("2026-11-10", "en", NOW), "None");
  assert.equal(ago(null, "ar", NOW), "لا يوجد");
});

// ── agreement ─────────────────────────────────────────────

const ORDERS = { en: ["order", "orders"], ar: ["طلب واحد", "طلبان", "طلبات", "طلباً"] };

test("counted writes the noun with its number in English", () => {
  assert.equal(plain(counted(1, ORDERS, "en")), "1 order");
  assert.equal(plain(counted(0, ORDERS, "en")), "0 orders");
  assert.equal(plain(counted(2, ORDERS, "en")), "2 orders");
  assert.equal(plain(counted(1234, ORDERS, "en")), "1,234 orders");
});

test("counted agrees in Arabic: one, two, three to ten, eleven and up", () => {
  assert.equal(counted(1, ORDERS, "ar"), "طلب واحد");
  assert.equal(counted(2, ORDERS, "ar"), "طلبان");
  assert.equal(plain(counted(3, ORDERS, "ar")), "3 طلبات");
  assert.equal(plain(counted(10, ORDERS, "ar")), "10 طلبات");
  assert.equal(plain(counted(11, ORDERS, "ar")), "11 طلباً");
  assert.equal(plain(counted(99, ORDERS, "ar")), "99 طلباً");
  assert.equal(plain(counted(100, ORDERS, "ar")), "100 طلباً");
  assert.equal(plain(counted(103, ORDERS, "ar")), "103 طلبات");
  assert.equal(plain(counted(0, ORDERS, "ar")), "0 طلبات");
});

test("agree picks a form for one, two or many", () => {
  assert.equal(agree(1, "تغيّب", "تغيّبا", "تغيّبوا"), "تغيّب");
  assert.equal(agree(2, "تغيّب", "تغيّبا", "تغيّبوا"), "تغيّبا");
  assert.equal(agree(7, "تغيّب", "تغيّبا", "تغيّبوا"), "تغيّبوا");
});

// ── initials ──────────────────────────────────────────────

test("initials are the first letters of the first two words, in capitals", () => {
  assert.equal(initials("Hana Saleh"), "HS");
  assert.equal(initials("hana"), "H");
  assert.equal(initials("Gulf Courier W.L.L."), "GC");
  assert.equal(initials("  Omar   Ali  Khan "), "OA");
  assert.equal(initials("Élodie Martin"), "ÉM");
  assert.equal(initials("(Dana) Home Services"), "DH");
});

test("an Arabic name gives one letter, past the article", () => {
  assert.equal(initials("النور للتجارة"), "ن");
  assert.equal(initials("حنا صالح"), "ح");
  assert.equal(initials("ال"), "ا");
});

test("a name that is only a phone number, or nothing, gives the fallback", () => {
  assert.equal(initials("+974 5555 0101"), "·");
  assert.equal(initials(""), "·");
  assert.equal(initials(null), "·");
  assert.equal(initials("   ", "A"), "A");
  assert.equal(initials("+974 5555 0101", "AL"), "AL");
});

// ── isolate ───────────────────────────────────────────────

test("isolate wraps text in a left-to-right isolate", () => {
  assert.equal(isolate("07:00–22:00"), "⁦07:00–22:00⁩");
});
