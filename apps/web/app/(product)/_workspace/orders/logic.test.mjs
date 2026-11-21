import test from "node:test";
import assert from "node:assert/strict";
import {
  PAGE_SIZE,
  activityText,
  cancelFacts,
  dayWord,
  effectiveFilters,
  filterWords,
  filtersToQuery,
  firstName,
  formatPhone,
  isAutomatic,
  isLateNew,
  itemLine,
  itemSub,
  itemsSummary,
  methodWord,
  minutesSince,
  nextStep,
  orderNo,
  placedParts,
  queryToFilters,
  replyWindow,
  showFilters,
  statusKey,
  statusTone,
  stepFacts,
  stepIndex,
  timelineEntries,
} from "./logic.ts";

// Thu 12 Nov 2026, 09:40 in Doha
const NOW = Date.parse("2026-11-12T09:40:00+03:00");
const at = (clock, back = 0) => new Date(Date.parse("2026-11-12T00:00:00+03:00") - back * 86_400_000 + (Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))) * 60_000).toISOString();
const NB = " ";

test("orderNo: one hash, whatever the input", () => {
  assert.equal(orderNo(1042), "#1042");
  assert.equal(orderNo("#1042"), "#1042");
});

test("formatPhone: a Qatar mobile in groups with no-break spaces; anything else keeps its plus", () => {
  assert.equal(formatPhone("97455550112"), `+974${NB}5555${NB}0112`);
  assert.equal(formatPhone("55550112"), `+974${NB}5555${NB}0112`);
  assert.equal(formatPhone("+4412345"), "+4412345");
  assert.equal(formatPhone(null), "");
  assert.equal(firstName("Yousef Hassan"), "Yousef");
});

test("late rule: a new order older than 15 minutes, and only a new one", () => {
  assert.equal(isLateNew("new", at("09:25"), NOW), false); // 15 min is not yet late
  assert.equal(isLateNew("new", at("09:24"), NOW), true);
  assert.equal(isLateNew("confirmed", at("08:00"), NOW), false);
  assert.equal(minutesSince(at("09:22"), NOW), 18);
  assert.equal(minutesSince(at("09:50"), NOW), 0, "a clock a little ahead is not negative");
});

test("placed: today shows the age, another day shows the date; Doha's clock whatever the device says", () => {
  assert.deepEqual(placedParts(at("09:36"), "en", NOW), { time: "09:36", sub: `4${NB}min`, today: true });
  assert.deepEqual(placedParts(at("20:15", 1), "en", NOW), { time: "20:15", sub: `Wed 11${NB}Nov`, today: false });
  assert.equal(placedParts(at("09:36"), "ar", NOW).sub, `4${NB}د`);
  assert.equal(placedParts(at("20:15", 1), "ar", NOW).sub, `الأربعاء 11${NB}نوفمبر`);
  assert.equal(dayWord("2026-11-12", "en", NOW), "today");
  assert.equal(dayWord("2026-11-13", "en", NOW), `Fri 13${NB}Nov`);
});

test("items: quantity, name and variant; Arabic names when there are some; options only under the name", () => {
  const wax = { name: "Carnauba wax", name_ar: "شمع الكارنوبا", variant: "250 ml", variant_ar: "250 مل", quantity: 1 };
  const cloth = { name: "Microfibre cloth pack", options: ["Pack of 6", "Grey"], quantity: 2, unit: "piece" };
  assert.equal(itemLine(wax, "en"), "1 × Carnauba wax · 250 ml");
  assert.equal(itemLine(wax, "ar"), "1 × شمع الكارنوبا · 250 مل");
  assert.equal(itemLine(cloth, "en"), "2 × Microfibre cloth pack");
  assert.equal(itemSub(cloth, "en"), "Pack of 6 · Grey");
  assert.equal(itemSub({ ...cloth, options_ar: ["علبة من 6", "رمادي"] }, "ar"), "علبة من 6 · رمادي");
  const s = itemsSummary([wax, cloth, { name: "Tyre shine", quantity: 1 }], "en");
  assert.equal(s.line1, "1 × Carnauba wax · 250 ml");
  assert.equal(s.line2, "2 × Microfibre cloth pack, 1 × Tyre shine");
  assert.equal(s.full, `${s.line1}, ${s.line2}`);
  assert.deepEqual(itemsSummary([], "en"), { line1: "", line2: "", full: "" });
});

test("items: a measure is written with its unit, a count is a bare number", () => {
  assert.equal(itemLine({ name: "Oud oil", quantity: 0.5, unit: "kg", unit_shown: true }, "en"), "0.5 kg × Oud oil");
  assert.equal(itemLine({ name: "Oud oil", quantity: 2, unit: "kg", unit_shown: false }, "en"), "2 × Oud oil");
});

test("steps: one step at a time, never backwards, none after done or cancelled", () => {
  assert.deepEqual(nextStep("new"), { to: "confirmed", label: "btnConfirmOrder" });
  assert.deepEqual(nextStep("confirmed"), { to: "ready", label: "btnMarkReady" });
  assert.deepEqual(nextStep("ready"), { to: "done", label: "btnMarkDone" });
  assert.equal(nextStep("done"), null);
  assert.equal(nextStep("cancelled"), null);
  assert.deepEqual(["new", "confirmed", "ready", "done"].map(stepIndex), [1, 2, 3, 4]);
  assert.deepEqual(["new", "confirmed", "ready", "done", "cancelled"].map(statusTone), ["ink", "n", "ok", "ok", "n"]);
  assert.equal(statusKey("ready"), "stReady");
});

test("stepFacts: when and who, read from the timeline; the automatic actor is nobody's name", () => {
  const facts = stepFacts(
    [
      { action: "placed", actor_name: "Customer", created_at: at("09:12") },
      { action: "confirmed", actor_name: "Salma", created_at: at("09:20") },
      { action: "ready", actor_name: "Assistant", created_at: at("09:30") },
    ],
    at("09:12"),
  );
  assert.equal(facts.placed.at, at("09:12"));
  assert.deepEqual(facts.confirmed, { at: at("09:20"), by: "Salma" });
  assert.deepEqual(facts.ready, { at: at("09:30"), by: null });
  assert.deepEqual(facts.done, { at: null, by: null });
  assert.equal(isAutomatic("Assistant"), true);
  assert.equal(isAutomatic("Salma"), false);
});

test("replyWindow: open with whole hours left, closed, or never written", () => {
  assert.deepEqual(replyWindow("2026-11-13T09:10:00+03:00", NOW), { kind: "open", hours: 23 });
  assert.deepEqual(replyWindow("2026-11-12T09:50:00+03:00", NOW), { kind: "open", hours: 0 });
  assert.deepEqual(replyWindow("2026-11-12T09:00:00+03:00", NOW), { kind: "closed" });
  assert.deepEqual(replyWindow(null, NOW), { kind: "never" });
});

test("cancel: restock defaults on before the order is ready; a refund is due only for a paid order that is not a test", () => {
  const order = { status: "confirmed", payment: "paid", total: 18500, items: [{ quantity: 1 }, { quantity: 2 }, { quantity: 1 }], document: { number: "RC-0004" } };
  assert.deepEqual(cancelFacts(order), { restockDefault: true, restockCount: 4, refundDue: 18500, creditReversal: false, documentNumber: "RC-0004" });
  assert.equal(cancelFacts({ ...order, status: "ready" }).restockDefault, false);
  assert.equal(cancelFacts({ ...order, status: "new" }).restockDefault, true);
  assert.equal(cancelFacts({ ...order, test: true }).refundDue, 0);
  assert.equal(cancelFacts({ ...order, payment: "unpaid" }).refundDue, 0);
  const account = cancelFacts({ ...order, payment: "on_account", document: undefined });
  assert.equal(account.creditReversal, true);
  assert.equal(account.documentNumber, null);
  assert.equal(cancelFacts(order, [{ quantity: 0.5 }, { quantity: 2 }]).restockCount, 2, "a fraction counts the lines, not the units");
});

test("?show= keeps today's meaning", () => {
  assert.deepEqual(showFilters("unconfirmed"), { status: "new" });
  assert.deepEqual(showFilters("ready"), { status: "ready" });
  assert.deepEqual(showFilters("unpaid"), { status: "open", payment: "unpaid" });
  assert.deepEqual(showFilters("paid"), { status: "all", payment: "paid" });
  assert.equal(filtersToQuery({ show: "unpaid" }).toString(), "status=open&payment=unpaid&limit=50");
  // a filter chosen over the preset wins
  assert.equal(effectiveFilters({ show: "unpaid", payment: "paid" }).payment, "paid");
});

test("the list query: the Open tab is sent explicitly (no status would return every order); a page is 50", () => {
  assert.equal(filtersToQuery({}).toString(), "status=open&limit=50");
  assert.equal(PAGE_SIZE, 50);
  const q = filtersToQuery({ status: "done", payment: "paid", mode: "delivery", assigned: "none", q: "  #1039 ", sort: "oldest", offset: 50, limit: 100 });
  assert.equal(q.get("status"), "done");
  assert.equal(q.get("payment"), "paid");
  assert.equal(q.get("mode"), "delivery");
  assert.equal(q.get("assigned"), "none");
  assert.equal(q.get("q"), "#1039");
  assert.equal(q.get("sort"), "oldest");
  assert.equal(q.get("limit"), "100");
  assert.equal(q.get("offset"), "50");
  assert.equal(filtersToQuery({ limit: 9999 }).get("limit"), "200", "the server's page cap");
  assert.equal(filtersToQuery({ q: "x".repeat(200) }).get("q").length, 80);
  assert.equal(filtersToQuery({ payment: "all", mode: "all", assigned: "all" }).has("payment"), false);
});

test("queryToFilters: the preview's short forms, and only what is valid", () => {
  assert.deepEqual(queryToFilters({ tab: "new", pay: "unpaid", by: "u-salma", q: "wax", mode: "delivery" }), { status: "new", payment: "unpaid", assigned: "u-salma", q: "wax", mode: "delivery" });
  assert.deepEqual(queryToFilters({ show: "paid" }), { show: "paid" });
  assert.deepEqual(queryToFilters({ show: "nonsense" }), {});
  assert.deepEqual(queryToFilters({ open: "1042" }), { open: "1042" });
  assert.deepEqual(queryToFilters({ dialog: "paid", for: "1032" }), { dialog: "paid", for: "1032" });
  assert.deepEqual(queryToFilters({ dialog: "weird" }), {});
  assert.deepEqual(queryToFilters({ offset: "50", limit: "100", sort: "oldest" }), { offset: 50, limit: 100, sort: "oldest" });
});

test("filterWords: the active filters as the words of the empty-state sentence", () => {
  const team = [{ id: "u-yusuf", name: "Yusuf Ali", role: "agent" }];
  assert.deepEqual(filterWords({ mode: "delivery", payment: "paid", assigned: "u-yusuf" }, team), { payment: "paid", mode: "delivery", by: "Yusuf" });
  assert.deepEqual(filterWords({ assigned: "none" }, team), { by: null });
  assert.deepEqual(filterWords({}, team), {});
});

test("timeline sentences: the real ones, with the actor's name, in both languages", () => {
  const sentence = (a, lang = "en") => activityText(a, "Yousef Hassan", lang);
  assert.equal(sentence({ action: "placed", actor_name: "Customer" }), "Yousef Hassan placed the order");
  assert.equal(sentence({ action: "took", actor_name: "Salma" }), "Salma took the order");
  assert.equal(sentence({ action: "confirmed", actor_name: "Salma" }), "Salma confirmed the order");
  assert.equal(sentence({ action: "assigned", actor_name: "Hana", detail: { to_name: "Reem" } }), "Hana gave the order to Reem");
  assert.equal(sentence({ action: "assigned", actor_name: "Hana", detail: {} }), "Hana left the order with nobody");
  assert.equal(sentence({ action: "ready", actor_name: "Assistant" }), "Automatically marked the order ready");
  assert.equal(sentence({ action: "paid", actor_name: "Assistant", detail: { method: "link", amount_minor: 18500 } }), `Paid by link, QAR${NB}185.`);
  assert.equal(sentence({ action: "paid", actor_name: "Salma", detail: { method: "cash", amount: 11000 } }), `Paid, cash, QAR${NB}110. Salma recorded it.`);
  assert.equal(sentence({ action: "cancelled", actor_name: "Hana", detail: { reason: "Cancelled by staff", stock_returned: 4 } }), "Hana cancelled the order · Stock went back: 4");
  assert.equal(sentence({ action: "cancelled", actor_name: "Hana", detail: { reason: "Customer changed their mind" } }), "Hana cancelled the order (Customer changed their mind)");
  assert.equal(sentence({ action: "refund_due", actor_name: "Hana", detail: { amount: 18500 } }), `A refund of QAR${NB}185 is due`);
  assert.equal(sentence({ action: "late_payment" }), "A payment arrived after the link ran out");
  assert.equal(sentence({ action: "pay_link_sent" }), "Pay link sent", "an unknown action shows its own word");
  // Arabic: written, with the amount as «185 ر.ق» (never QAR) in an isolate
  const paid = sentence({ action: "paid", actor_name: "Assistant", detail: { method: "link", amount_minor: 18500 } }, "ar");
  assert.ok(paid.includes(`185${NB}ر.ق`) && !paid.includes("QAR"), paid);
  assert.ok(sentence({ action: "ready", actor_name: "Assistant" }, "ar").startsWith("حدّد تلقائياً"));
  assert.equal(methodWord("card_terminal", "en"), "Card machine");
  assert.equal(methodWord(undefined, "ar"), "رابط الدفع");
});

test("timelineEntries: newest first; another day carries its date; only a fresh step is Volt; paid is green, a refund amber", () => {
  const rows = timelineEntries(
    [
      { action: "placed", actor_name: "Customer", created_at: at("20:15", 1) },
      { action: "took", actor_name: "Salma", created_at: at("09:14") },
      { action: "paid", actor_name: "Assistant", detail: { method: "link" }, created_at: at("09:38") },
      { action: "confirmed", actor_name: "Salma", created_at: at("09:39") },
    ],
    "Yousef Hassan",
    "en",
    NOW,
  );
  assert.deepEqual(rows.map((r) => r.text.split(" ")[0]), ["Salma", "Paid", "Salma", "Yousef"]);
  assert.deepEqual(rows.map((r) => r.tone), ["volt", "ok", "n", "n"]);
  assert.equal(rows[0].meta, "09:39 · Salma");
  assert.equal(rows[1].meta, "09:38", "the automatic actor is not named");
  assert.equal(rows[3].meta, `Wed 11${NB}Nov · 20:15`, "the customer is the subject of the sentence, not the meta");
  const old = timelineEntries([{ action: "confirmed", actor_name: "Salma", created_at: at("07:00") }], "X", "en", NOW);
  assert.equal(old[0].tone, "n", "a step more than an hour old is no longer 'just done'");
});
