// Discovery v2's pure logic (logic.ts) and its words (copy.ts): where a change lands, the days it
// touches, the ticket's sentence, the checks tally, the life of a change and the week's receipts.

import assert from "node:assert/strict";
import { test } from "node:test";
import { T } from "./copy.ts";
import {
  allMatch, askAgainAfter, barUnits, beforeAfter, changedDays, dayKeyAt, exactText, isClosedText, joinNames, keepPolling,
  leadFor, oneDay, railOf, sinceLastWeek, spanText, stageOf, tally, whereOf,
} from "./logic.ts";
import { fixture, FIXTURE_NOW } from "./fixtures.ts";

const en = fixture("en");
const ar = fixture("ar");
const hours = en.waiting[0];
const phone = en.waiting[1];

test("Google is named only when the source is Google; the sample and a recorded listing are your listing", () => {
  assert.equal(whereOf("listing", "google"), "google");
  assert.equal(whereOf("listing", "google_places"), "google");
  assert.equal(whereOf("listing", "sample"), "listing");
  assert.equal(whereOf("listing", "manual"), "listing");
  assert.equal(whereOf("listing", null), "listing");
  assert.equal(whereOf("website", "google"), "website");
});

test("a day's line reads as a range or Closed, in both languages", () => {
  assert.equal(spanText("13:00 to 22:00", "en"), "13:00–22:00");
  assert.equal(spanText("13:00 إلى 22:00", "ar"), "13:00–22:00");
  assert.equal(spanText("closed", "en"), "Closed");
  assert.equal(spanText("مغلق", "ar"), "مغلق");
  assert.ok(isClosedText("closed") && !isClosedText("07:00 to 22:00"));
});

test("only the changed days count, and one changed day is named", () => {
  assert.deepEqual(changedDays(hours.before, hours.after), ["fri"]);
  assert.equal(oneDay(hours), "fri");
  assert.equal(oneDay(phone), null);
  const two = { ...hours, after: { ...hours.after, lines: hours.after.lines.map((l) => (l.day === "sat" ? { ...l, text: "08:00 to 22:00" } : l)) } };
  assert.deepEqual(changedDays(two.before, two.after), ["sat", "fri"]);
  assert.equal(oneDay(two), null);
});

test("the ticket's sentence marks the part to decide", () => {
  assert.deepEqual(leadFor(hours, "google", "en"), { pre: "Google says you’re ", hl: "closed on Fridays", post: "." });
  assert.deepEqual(leadFor(hours, "listing", "en"), { pre: "Your listing says you’re ", hl: "closed on Fridays", post: "." });
  assert.equal(leadFor(ar.waiting[0], "google", "ar").hl, "مغلق أيام الجمعة");
  assert.equal(leadFor(phone, "google", "en").hl, "different phone number");
  const unknown = { ...phone, field: "something_new", title: "Do the new thing" };
  assert.deepEqual(leadFor(unknown, "google", "en"), { pre: "Do the new thing", hl: "", post: "" });
  const noHours = { ...hours, before: { text: "none", lines: [] } };
  assert.equal(leadFor(noHours, "listing", "en").hl, "no opening hours");
});

test("the exact change is the one day and its new hours, else the after line", () => {
  assert.equal(exactText(hours, "en"), "Friday 13:00–22:00");
  assert.equal(exactText(ar.waiting[0], "ar"), "الجمعة ⁦13:00–22:00⁩");
  assert.equal(exactText(phone, "en"), "+974 5555 0101");
  assert.deepEqual(beforeAfter(hours, "en"), { before: "Closed", after: "13:00–22:00" });
  assert.deepEqual(beforeAfter({ ...phone, before: { text: "none", lines: [] } }, "en"), { before: "No phone number", after: "+974 5555 0101" });
});

test("the tally counts measured checks only, and nothing without a finished check-up", () => {
  assert.deepEqual(tally(en.checks), { matched: 10, measured: 14, notMeasured: 2, total: 16 });
  assert.equal(tally(null), null);
  assert.equal(tally({ ...en.checks, measured: false }), null);
  const places = { ...en.checks, business: null, places: [{ id: "a", name: "A", ...en.checks.business }, { id: "b", name: "B", ...en.checks.business }] };
  assert.deepEqual(tally(places), { matched: 20, measured: 28, notMeasured: 4, total: 32 });
  const both = { ...places, business: en.checks.business };
  assert.deepEqual(tally(both), { matched: 30, measured: 42, notMeasured: 6, total: 48 });
  const none = { ...en.checks, business: { checks: Object.fromEntries(en.checks.rules.map((r) => [r.id, "not_measured"])), fixed: [] } };
  assert.equal(tally(none), null);
});

test("the life of a change follows the API's status and verification", () => {
  const base = { decided: { by: "Hana", channel: "portal", at: "2026-11-12T06:41:00Z" }, applied_at: null, verification: null };
  assert.equal(stageOf({ status: "proposed", verification: null }), "waiting");
  assert.deepEqual(railOf({ ...base, status: "approved" }).map((s) => s.state), ["done", "now", "todo", "todo"]);
  assert.deepEqual(railOf({ ...base, status: "applied", applied_at: "x", verification: "pending" }).map((s) => s.state), ["done", "done", "now", "todo"]);
  assert.deepEqual(railOf({ ...base, status: "applied", applied_at: "x", verification: "confirmed" }).map((s) => s.state), ["done", "done", "done", "ok"]);
  assert.deepEqual(railOf({ ...base, status: "applied", applied_at: "x", verification: "not_confirmed" }).map((s) => s.state), ["done", "done", "done", "attn"]);
  assert.deepEqual(railOf({ ...base, status: "failed" }).map((s) => s.state), ["done", "attn", "todo", "todo"]);
  assert.equal(railOf({ ...base, status: "approved" })[0].at, "2026-11-12T06:41:00Z");
  assert.ok(keepPolling({ status: "approved" }, 0));
  assert.ok(!keepPolling({ status: "applied" }, 0));
  assert.ok(!keepPolling({ status: "approved" }, 20));
});

test("the week's receipts are the sent and undone changes of the last 7 days, newest first", () => {
  const rows = sinceLastWeek(en.recent, FIXTURE_NOW);
  assert.deepEqual(rows.map((p) => p.id), ["p-category", "p-name"]);
  const old = { ...en.recent[0], id: "old", applied_at: "2026-10-01T06:00:00Z" };
  const declined = { ...en.recent[0], id: "no", status: "declined" };
  assert.deepEqual(sinceLastWeek([old, declined, ...en.recent], FIXTURE_NOW).map((p) => p.id), ["p-category", "p-name"]);
  assert.ok(allMatch(en.recent));
  assert.ok(!allMatch([{ status: "applied", verification: "pending" }]));
  assert.ok(!allMatch([]));
});

test("names join with or and and, in both languages", () => {
  assert.equal(joinNames(["Hana", "Omar"], "en"), "Hana or Omar");
  assert.equal(joinNames(["Hana", "Omar", "Sara"], "en", "and"), "Hana, Omar and Sara");
  assert.equal(joinNames(["هناء", "عمر"], "ar"), "هناء أو عمر");
  assert.equal(joinNames(["Hana"], "en"), "Hana");
  assert.equal(joinNames([], "en"), "");
});

test("small helpers: the cool-off date, bar steps, today's weekday in Doha", () => {
  assert.equal(askAgainAfter(0), 14 * 864e5);
  assert.deepEqual(barUnits([2, 1, 3, 1]), [2, 1, 3, 1]);
  assert.deepEqual(barUnits([0, 20, 10]), [0, 8, 4]);
  assert.equal(dayKeyAt(FIXTURE_NOW), "thu");
  assert.equal(dayKeyAt(Date.parse("2026-11-12T21:30:00Z")), "fri");
});

test("the brief's sentence agrees with the count in both languages", () => {
  assert.equal(T.en.needs(1), "One thing needs you this week.");
  assert.equal(T.en.needs(3), "Three things need you this week.");
  assert.equal(T.en.needs(12), "12 things need you this week.");
  assert.equal(T.en.left(2), "Two things left this week.");
  assert.equal(T.ar.needs(1), "أمر واحد يحتاجك هذا الأسبوع.");
  assert.equal(T.ar.left(2), "أمران متبقيان هذا الأسبوع.");
  assert.match(T.ar.needs(3), /^3 أمور/);
  assert.match(T.ar.needs(11), /^11 أمراً/);
});

test("no word of the screen's copy is an AI word, an ellipsis or an em dash", () => {
  const banned = /\b(AI|smart|intelligen|learns|understands|thinks|predicts|forecast|assistant|agentic)\b|—|\.\.\./i;
  const walk = (value, path) => {
    if (typeof value === "string") assert.ok(!banned.test(value), `${path}: ${value}`);
    else if (typeof value === "function") {
      let out;
      for (const args of [[2, 3, 4, 5], ["fri", "13:00–22:00", "google", "Hana"], ["Rule text", "google"]]) {
        try { out = value(...args); break; } catch { /* another shape of arguments */ }
      }
      if (typeof out === "string") walk(out, path);
      else if (out && typeof out === "object") for (const [k, v] of Object.entries(out)) walk(v, `${path}.${k}`);
    } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
  };
  walk(T.en, "en");
  walk(T.ar, "ar");
  assert.deepEqual(Object.keys(T.ar).sort(), Object.keys(T.en).sort());
});

// ── polish pass: Change it, the life of a change, a removed before ──

test("Change it starts from the proposed value and sends the whole week with only that day changed", async () => {
  const { afterFromDraft, draftFor, draftText } = await import("./logic.ts");
  const d = draftFor(hours);
  assert.deepEqual(d, { kind: "hours", day: "fri", open: "13:00", close: "22:00" });
  const week = afterFromDraft(hours, { ...d, open: "13:30" });
  assert.deepEqual(week.fri, ["13:30", "22:00"]);
  assert.deepEqual(week.sat, ["07:00", "22:00"]);
  assert.equal(Object.keys(week).length, 7);
  assert.equal(afterFromDraft(hours, { ...d, open: "23:00" }), null, "a day that closes before it opens is not sent");
  assert.equal(draftText(hours, { ...d, open: "13:30" }, "en"), "Friday 13:30–22:00");
  const arWeek = afterFromDraft(ar.waiting[0], draftFor(ar.waiting[0]));
  assert.deepEqual(arWeek.fri, ["13:00", "22:00"], "read from the Arabic lines too");
  const phone = en.waiting[1];
  assert.deepEqual(afterFromDraft(phone, { kind: "phone", phone: "+974 5555 0199" }), { phone: "+97455550199" });
  assert.equal(afterFromDraft(phone, { kind: "phone", phone: "call me" }), null);
  const choice = { ...phone, edit: { kind: "choice", options: [{ category: "Car wash" }, { category: "Car detailing" }] }, after: { text: "Car detailing", lines: [], removed: false } };
  assert.deepEqual(draftFor(choice), { kind: "choice", index: 1 });
  assert.deepEqual(afterFromDraft(choice, { kind: "choice", index: 0 }), { category: "Car wash" });
  assert.equal(draftFor({ ...hours, edit: null }), null, "not drawn where the API does not allow it");
});

test("Change it for hours that differ on several days: the whole week, each day editable", async () => {
  const { afterFromDraft, draftFor, draftText } = await import("./logic.ts");
  const line = (day, text) => ({ day, text });
  const days = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
  const many = { ...hours,
    before: { text: "None", lines: [], removed: false },
    after: { text: "Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00", lines: days.map((d) => line(d, d === "fri" ? "13:00–22:00" : "07:00–22:00")), removed: false } };
  const d = draftFor(many);
  assert.equal(d.kind, "week");
  assert.deepEqual(d.days.fri, { open: "13:00", close: "22:00" });
  assert.deepEqual(d.days.sat, { open: "07:00", close: "22:00" });
  const edited = { ...d, days: { ...d.days, fri: { open: "14:00", close: "23:00" }, sun: null } };
  const week = afterFromDraft(many, edited);
  assert.deepEqual(week.fri, ["14:00", "23:00"]);
  assert.equal(week.sun, null, "a day marked closed is sent as closed");
  assert.equal(Object.keys(week).length, 7);
  assert.equal(afterFromDraft(many, { ...d, days: { ...d.days, mon: { open: "22:00", close: "07:00" } } }), null);
  assert.equal(draftText(many, edited, "en"), "these hours");
  assert.equal(draftText(many, edited, "ar"), "هذه الساعات");
});

test("the life of a change follows the loop: Google's review, refused, changed back", () => {
  const at = "2026-11-12T07:00:00Z";
  const sent = { status: "applied", verification: "pending", decided: null, applied_at: at };
  assert.deepEqual(railOf({ ...sent, life: { state: "pending_review", at, text: "" }, life_history: [{ state: "pending_review", at, text: "" }] }).map((s) => s.state), ["done", "done", "now", "todo"]);
  assert.deepEqual(railOf({ ...sent, life: { state: "rejected", at, text: "" }, life_history: [] }).map((s) => s.state), ["done", "done", "attn", "todo"]);
  assert.deepEqual(railOf({ ...sent, life: { state: "changed_back", at, text: "" }, life_history: [] }).map((s) => s.state), ["done", "done", "done", "attn"]);
  assert.equal(stageOf({ ...sent, life: { state: "live", at, text: "" } }), "live");
  assert.equal(stageOf({ ...sent, life: { state: "changed_back", at, text: "" } }), "notLive");
});

test("a before removed after 30 days says so in both languages, never None or empty", () => {
  const gone = { ...hours, before: { text: "removed after 30 days (Google's terms)", lines: [], removed: true } };
  assert.equal(beforeAfter(gone, "en").before, "Removed after 30 days");
  assert.equal(beforeAfter(gone, "ar").before, "حُذف بعد 30 يومًا");
  assert.ok(beforeAfter(gone, "en").after);
});

test("numbers in the v2 screens are Western digits: nothing is formatted with an Arabic locale", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const here = new URL(".", import.meta.url);
  for (const name of readdirSync(here).filter((n) => /\.(ts|tsx)$/.test(n))) {
    const text = readFileSync(new URL(name, here), "utf8");
    assert.doesNotMatch(text, /toLocaleString\(\s*\)|toLocaleString\(\s*["']ar|Intl\.\w+Format\(\s*["']ar(?![^"']*nu-latn)/, name);
  }
});

test("the ticket's sentence follows what was found: nothing there, or something different (every ask kind)", () => {
  const side = (text, lines = []) => ({ text, lines, removed: false });
  const lead = (field, before, lang = "en") => { const l = leadFor({ field, before: side(before), after: side("x"), title: "t" }, "website", lang); return `${l.pre}${l.hl}${l.post}`; };
  assert.equal(lead("whatsapp_link", "none"), "Your website has no WhatsApp link.");
  assert.equal(lead("whatsapp_link", "https://wa.me/97455550999"), "Your website’s WhatsApp link goes to a different number.");
  assert.equal(lead("whatsapp_link", "https://wa.me/97455550999", "ar"), "رابط واتساب في موقعك يوصل إلى رقم مختلف.");
  assert.equal(lead("whatsapp_link", "لا شيء", "ar"), "موقعك بلا رابط واتساب.");
  assert.equal(lead("phone", "none"), "Your website shows no phone number.");
  assert.equal(lead("phone", "+974 5555 0110"), "Your website shows a different phone number.");
  assert.equal(lead("name", "none"), "Your website shows no business name.");
  assert.equal(lead("name", "Nuqta Car Wash"), "Your website spells your name differently.");
  assert.equal(lead("category", "none"), "Your website has no main category.");
  assert.equal(lead("category", "Car repair"), "Your website shows a different main category.");
});
