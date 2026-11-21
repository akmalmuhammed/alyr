import test from "node:test";
import assert from "node:assert/strict";
import {
  WAITING_MINUTES, countConversations, daysBetween, filterConversations, isWaiting, phoneGroups, pickText, rowMark, rowStamp,
  waitingMinutes, windowDeadline, windowHoursLeft, windowMinutesLeft, windowOpen,
} from "./logic.ts";
import { buildTimeline } from "./thread.ts";

// Thu 12 Nov 2026, 09:48 in Doha. Every function below takes this as an argument: none reads the clock.
const NOW = Date.parse("2026-11-12T09:48:00+03:00");
const at = (day, hhmm) => `2026-11-${String(day).padStart(2, "0")}T${hhmm}:00+03:00`;

const row = (id, over = {}) => ({
  id, name: id, phone: "+974 5555 0000", status: "open", assistant_paused: false, opted_out: false,
  window_closes_at: at(13, "09:27"), unread: 0, assigned: null,
  last: { body: "hello", direction: "in", status: "received", created_at: at(12, "09:27") },
  ...over,
});

test("the window is open until its deadline and says so from the deadline alone", () => {
  assert.equal(windowOpen(at(13, "09:27"), NOW), true);
  assert.equal(windowOpen(at(12, "09:47"), NOW), false);
  assert.equal(windowOpen(null, NOW), false);
  assert.equal(windowOpen(undefined, NOW), false);
  assert.equal(windowOpen("not a time", NOW), false);
});

test("the deadline is 24 hours after the customer's last message", () => {
  assert.equal(windowDeadline(at(10, "18:14")), new Date(Date.parse(at(11, "18:14"))).toISOString());
  assert.equal(windowDeadline(null), null);
});

test("hours left are rounded down, never up, so the screen does not promise more than there is", () => {
  // 09:48 to Fri 09:27 is 23 hours 39 minutes.
  assert.equal(windowHoursLeft(at(13, "09:27"), NOW), 23);
  assert.equal(windowHoursLeft(at(12, "11:00"), NOW), 1);
  assert.equal(windowHoursLeft(at(12, "10:30"), NOW), 0);
  assert.equal(windowHoursLeft(null, NOW), 0);
  assert.equal(windowMinutesLeft(at(12, "10:30"), NOW), 42);
  assert.equal(windowMinutesLeft(at(13, "09:27"), NOW), 0);
});

test("waiting follows the rule the API and Home use: unanswered for 10 minutes", () => {
  assert.equal(WAITING_MINUTES, 10);
  const fresh = row("a", { last: { body: "x", direction: "in", status: "received", created_at: at(12, "09:44") } });
  const old = row("b", { last: { body: "x", direction: "in", status: "received", created_at: at(12, "09:27") } });
  assert.equal(waitingMinutes(fresh, NOW), 4);
  assert.equal(isWaiting(fresh, NOW), false);
  assert.equal(isWaiting(old, NOW), true);
  assert.deepEqual(rowMark(old, NOW), { kind: "waiting", tone: "warn", minutes: 21 });
  // Answered, or closed, is not waiting.
  const answered = row("c", { last: { body: "x", direction: "out", status: "read", created_at: at(12, "09:40") } });
  assert.equal(waitingMinutes(answered, NOW), null);
  assert.equal(isWaiting(row("d", { status: "closed" }), NOW), false);
});

test("a customer whose window has closed is not 'waiting': a typed reply cannot go, so the row says template only", () => {
  const closed = row("e", { window_closes_at: null, last: { body: "x", direction: "in", status: "received", created_at: at(10, "14:00") } });
  assert.equal(isWaiting(closed, NOW), false);
  assert.deepEqual(rowMark(closed, NOW), { kind: "template_only", tone: "n" });
});

test("a message that did not go is the first thing a row says", () => {
  const failed = row("f", { window_closes_at: null, last: { body: "x", direction: "out", status: "blocked", created_at: at(11, "19:05") } });
  assert.deepEqual(rowMark(failed, NOW), { kind: "not_delivered", tone: "bad" });
  assert.equal(rowMark(row("g", { last: { body: "x", direction: "out", status: "read", created_at: at(12, "09:40") } }), NOW), null);
});

test("counts use the same rules as the filters", () => {
  const items = [
    row("w", { last: { body: "x", direction: "in", status: "received", created_at: at(12, "09:27") }, unread: 2 }),
    row("m", { assigned: { id: "me", name: "Hana" }, last: { body: "x", direction: "out", status: "read", created_at: at(12, "09:30") } }),
    row("c", { status: "closed" }),
    row("n", { window_closes_at: null, last: { body: "x", direction: "out", status: "failed", created_at: at(11, "19:05") } }),
  ];
  const counts = countConversations(items, "me", NOW);
  assert.deepEqual(counts, { open: 3, closed: 1, waiting: 1, mine: 1, unassigned: 2, unread: 1, not_delivered: 1, window_closed: 1 });
  for (const [chip, key] of [["waiting", "waiting"], ["mine", "mine"], ["unassigned", "unassigned"], ["not_delivered", "not_delivered"], ["window_closed", "window_closed"]]) {
    assert.equal(filterConversations(items, { tab: "open", chip }, NOW, "me").length, counts[key], chip);
  }
});

test("tab, search by name, number and words, in the language the page is in", () => {
  const items = [
    row("rashid", { name: "Rashid Mahmoud", phone: "+974 5555 0134" }),
    row("auto", { name: "Layla", last: { body: { en: "Booked. Full wash", ar: "تم الحجز. غسيل كامل" }, direction: "out", status: "read", created_at: at(12, "09:36"), by: "auto" } }),
    row("old", { name: "Omar", status: "closed" }),
  ];
  assert.equal(filterConversations(items, { tab: "open" }, NOW).length, 2);
  assert.equal(filterConversations(items, { tab: "closed" }, NOW)[0].name, "Omar");
  assert.equal(filterConversations(items, { tab: "open", q: "RASHID" }, NOW)[0].name, "Rashid Mahmoud");
  assert.equal(filterConversations(items, { tab: "open", q: "5555 0134" }, NOW)[0].name, "Rashid Mahmoud");
  assert.equal(filterConversations(items, { tab: "open", q: "5555  0134" }, NOW)[0].name, "Rashid Mahmoud");
  assert.equal(filterConversations(items, { tab: "open", q: "غسيل" }, NOW, null, "ar")[0].name, "Layla");
  assert.equal(filterConversations(items, { tab: "open", q: "غسيل" }, NOW, null, "en").length, 0);
  assert.equal(filterConversations(items, { tab: "open", q: "ceramc" }, NOW).length, 0);
  assert.equal(filterConversations(items, { tab: "open", chip: "mine" }, NOW, null).length, 0, "no signed-in person, no 'mine'");
});

test("the phone groups waiting customers first and names the oldest", () => {
  const items = [
    row("a", { last: { body: "x", direction: "in", status: "received", created_at: at(12, "09:27") } }),
    row("b", { last: { body: "x", direction: "in", status: "received", created_at: at(12, "09:33") } }),
    row("c", { last: { body: "x", direction: "out", status: "read", created_at: at(12, "09:38") } }),
  ];
  const groups = phoneGroups(items, NOW);
  assert.deepEqual(groups.waiting.map((c) => c.id), ["a", "b"]);
  assert.deepEqual(groups.rest.map((c) => c.id), ["c"]);
  assert.equal(groups.oldest, 21);
});

test("a row's stamp is the time today, the weekday within a week, then the date, always on Doha's clock", () => {
  assert.equal(rowStamp(at(12, "09:38"), "en", NOW), "09:38");
  assert.equal(rowStamp("2026-11-12T00:30:00+03:00", "en", NOW), "00:30");
  // 22:30 UTC on the 11th is 01:30 on the 12th in Doha, whatever zone the device is in.
  assert.equal(rowStamp("2026-11-11T22:30:00Z", "en", NOW), "01:30");
  assert.equal(rowStamp(at(11, "19:05"), "en", NOW), "Wed");
  assert.equal(rowStamp(at(11, "19:05"), "ar", NOW), "الأربعاء");
  assert.equal(rowStamp("2026-10-20T10:00:00+03:00", "en", NOW), "Tue 20 Oct");
});

test("days between are Doha calendar days, not 24-hour spans", () => {
  assert.equal(daysBetween("2026-11-11T23:50:00+03:00", NOW), 1);
  assert.equal(daysBetween("2026-10-28T10:00:00+03:00", NOW), 15);
  assert.equal(daysBetween(NOW, NOW), 0);
  // 21:30 UTC on the 11th is already the 12th in Doha.
  assert.equal(daysBetween("2026-11-11T21:30:00Z", NOW), 0);
});

test("pickText takes a language of ALYR's own line and leaves a person's words as written", () => {
  assert.equal(pickText("As written", "ar"), "As written");
  assert.equal(pickText({ en: "Paid", ar: "تم الدفع" }, "ar"), "تم الدفع");
});

test("the thread gets a separator per day and one mark where the window ran out", () => {
  const items = [
    { kind: "message", id: "1", at: at(10, "18:12"), direction: "in", text: "a" },
    { kind: "message", id: "2", at: at(10, "18:14"), direction: "in", text: "b" },
    { kind: "message", id: "3", at: at(11, "19:05"), direction: "out", text: "c" },
    { kind: "message", id: "4", at: at(11, "19:30"), direction: "out", text: "d" },
  ];
  const rows = buildTimeline(items);
  assert.deepEqual(rows.map((r) => r.kind), ["day", "item", "item", "day", "item", "item"]);
  // The second day's separator is the window closing (Tue 18:14 + 24 h = Wed 18:14), before the reply that could not go.
  assert.equal(rows[3].closedAt, new Date(Date.parse(at(11, "18:14"))).toISOString());
  // Only once: the next message does not repeat it.
  assert.equal(rows.filter((r) => r.kind === "window" || r.closedAt).length, 1);
});

test("a window that closed on the same day as the next message is a mark, not a second day line", () => {
  const rows = buildTimeline([
    { kind: "message", id: "1", at: at(11, "08:00"), direction: "in", text: "a" },
    { kind: "message", id: "2", at: at(12, "08:30"), direction: "out", text: "b" },
    { kind: "message", id: "3", at: at(12, "09:00"), direction: "out", text: "c" },
  ]);
  assert.deepEqual(rows.map((r) => r.kind), ["day", "item", "day", "item", "item"]);
  const within = buildTimeline([
    { kind: "message", id: "1", at: at(11, "08:00"), direction: "in", text: "a" },
    { kind: "message", id: "2", at: at(11, "08:30"), direction: "out", text: "b" },
  ]);
  assert.equal(within.some((r) => r.kind === "window" || r.closedAt), false, "within the 24 hours there is no mark");
  // The deadline falls on a day that already has a separator: a mark, not a second day line.
  const same = buildTimeline([
    { kind: "message", id: "1", at: at(11, "08:00"), direction: "in", text: "a" },
    { kind: "note", id: "n", at: at(12, "07:00"), author: "Salma", text: "x" },
    { kind: "message", id: "2", at: at(12, "09:00"), direction: "out", text: "b" },
  ]);
  assert.deepEqual(same.map((r) => r.kind), ["day", "item", "day", "item", "window", "item"]);
});

test("a customer writing again reopens the window, and the mark can appear again after it", () => {
  const rows = buildTimeline([
    { kind: "message", id: "1", at: at(8, "08:00"), direction: "in", text: "a" },
    { kind: "message", id: "2", at: at(9, "09:00"), direction: "out", text: "b" },
    { kind: "message", id: "3", at: at(9, "09:10"), direction: "in", text: "c" },
    { kind: "message", id: "4", at: at(10, "10:00"), direction: "out", text: "d" },
  ]);
  assert.equal(rows.filter((r) => r.closedAt || r.kind === "window").length, 2);
});
