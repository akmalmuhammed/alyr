import test from "node:test";
import assert from "node:assert/strict";
import {
  BUCKET_KEYS, addBuckets, ageOf, ageTone, allocatePayment, alphabetical, applyPayment, bucketFor, bucketShares, bucketTotal,
  canSeeCredit, checkAmount, chipCounts, csvOf, dohaDay, emptyBuckets, filterAccounts, isWindowOpen, limitUse, openSales,
  paidSince, parseAmount, paymentEntry, paymentsInMonth, planReminders, promiseState, qarText, reminderStages, reminderText,
  reminderTier, settle, signed, sortAccounts, statementOf, summarise, tabCounts, windowClosesAt, withBalance, daysSince,
} from "./logic.ts";
import { ACCOUNTS, BLUEFIN_ENTRIES, PAYMENTS, PREVIEW_NOW as NOW, bookOf, previewData, SHOP } from "./fixtures.ts";

const bluefin = ACCOUNTS.find((a) => a.id === "bluefin");

test("the four age buckets break at 30, 60 and 90 days, as the engine's ageing.py does", () => {
  assert.deepEqual([0, 30, 31, 60, 61, 90, 91].map(bucketFor), ["d0_30", "d0_30", "d31_60", "d31_60", "d61_90", "d61_90", "d90_plus"]);
});

test("bucket shares are whole percent and add to 100; an empty bar is all zero", () => {
  const shares = bucketShares(summarise(ACCOUNTS).buckets);
  assert.equal(bucketTotal(shares), 100);
  assert.deepEqual(shares, { d0_30: 52, d31_60: 26, d61_90: 14, d90_plus: 8 });
  assert.deepEqual(bucketShares(emptyBuckets()), emptyBuckets());
  assert.equal(bucketTotal(bucketShares({ d0_30: 1, d31_60: 1, d61_90: 1, d90_plus: 0 })), 100);
});

test("the band's figures are counted from the accounts, not typed", () => {
  const s = summarise(ACCOUNTS);
  assert.equal(s.owed, 984000);
  assert.equal(s.owing, 11);
  assert.deepEqual(s.buckets, { d0_30: 512000, d31_60: 257000, d61_90: 136000, d90_plus: 79000 });
  assert.equal(s.over60.amount, 215000);
  assert.deepEqual(s.over60.names, ["Bayview School", "Omar Ali", "Sara Haddad"]);
  assert.equal(s.over60.withoutPromise, 3);
  assert.equal(s.promised.amount, 45000);
  assert.deepEqual(s.promised.names, ["Noor Abdullah"]);
  assert.equal(s.promised.passed, 1);
  assert.equal(bucketTotal(s.buckets), s.owed);
});

test("every account's own buckets add up to its balance", () => {
  for (const a of ACCOUNTS) assert.equal(bucketTotal(a.buckets), Math.max(a.balance, 0), a.name);
});

test("an agent never sees credit; an owner and an admin do", () => {
  assert.equal(canSeeCredit("agent"), false);
  assert.equal(canSeeCredit(""), false);
  assert.equal(canSeeCredit(undefined), false);
  assert.equal(canSeeCredit("owner"), true);
  assert.equal(canSeeCredit("admin"), true);
});

test("tabs and chips count what each would show", () => {
  assert.deepEqual(tabCounts(ACCOUNTS), { owe: 11, nothing: 3, all: 14 });
  assert.deepEqual(chipCounts(ACCOUNTS, { tab: "owe", search: "", assignee: "" }), { all: 11, over30: 6, promised: 1, passed: 1, overLimit: 1, stop: 1 });
  const f = { tab: "owe", chip: "all", search: "", assignee: "" };
  assert.equal(filterAccounts(ACCOUNTS, { ...f, chip: "over30" }).length, 6);
  assert.equal(filterAccounts(ACCOUNTS, { ...f, tab: "nothing" }).length, 3);
  assert.deepEqual(filterAccounts(ACCOUNTS, { ...f, search: "0188" }).map((a) => a.name), ["Bluefin Events"]);
  assert.deepEqual(filterAccounts(ACCOUNTS, { ...f, search: "palm" }).map((a) => a.name), ["Palm Court Offices"]);
  assert.deepEqual(filterAccounts(ACCOUNTS, { ...f, assignee: "u-bilal" }).map((a) => a.name), ["Sara Haddad"]);
  assert.equal(filterAccounts(ACCOUNTS, { ...f, search: "zzz" }).length, 0);
});

test("sorting: most owed first by default, oldest debt, or name; ties by name", () => {
  assert.equal(sortAccounts(ACCOUNTS, "owes")[0].name, "Gulf Courier W.L.L.");
  assert.equal(sortAccounts(ACCOUNTS, "oldest")[0].name, "Omar Ali");
  assert.deepEqual(sortAccounts(ACCOUNTS, "name").slice(0, 2).map((a) => a.name), ["Aisha Hamad", "Bayview School"]);
  assert.deepEqual(alphabetical([{ name: "B" }, { name: "A" }]).map((x) => x.name), ["A", "B"]);
});

test("limit use, over the limit and the age tag colours", () => {
  assert.deepEqual(limitUse(126400, 150000), { percent: 84, left: 23600, over: false, hasLimit: true });
  assert.equal(limitUse(48000, 40000).over, true);
  assert.equal(limitUse(48000, 40000).left, 0);
  assert.equal(limitUse(5, null).hasLimit, false);
  assert.equal(limitUse(5, 0).hasLimit, false);
  assert.deepEqual([30, 31, 60, 61].map(ageTone), ["n", "warn", "warn", "bad"]);
});

test("the three reminder tones break at 60 and 90 days", () => {
  assert.deepEqual([0, 59, 60, 89, 90, 400].map(reminderTier), ["gentle", "gentle", "firm", "firm", "final", "final"]);
});

test("a reminder run reaches who the server's rules reach and says why it skips the rest", () => {
  const plan = planReminders(ACCOUNTS, 30, NOW);
  assert.equal(plan.matched, 6);
  assert.deepEqual(plan.go.map((g) => [g.row.name, g.tone, g.via]), [
    ["Bayview School", "firm", "template"],
    ["Bluefin Events", "gentle", "buttons"],
    ["Omar Ali", "final", "buttons"],
  ]);
  const why = Object.fromEntries(plan.skipped.map((s) => [s.row.name, s.reason]));
  assert.deepEqual(why, { "Palm Court Offices": "recent", "Noor Abdullah": "promise", "Sara Haddad": "stop" });
  const palm = plan.skipped.find((s) => s.row.id === "palm-court");
  assert.equal(dohaDay(palm.until), "2026-11-12");
  assert.equal(planReminders(ACCOUNTS, 0, NOW).matched, 11);
  assert.equal(planReminders(ACCOUNTS, 200, NOW).go.length, 0);
});

test("the cooldown ends three days after the last reminder, and a stop is never reminded", () => {
  const later = "2026-11-12T17:00:00+03:00";
  assert.ok(planReminders(ACCOUNTS, 30, later).go.some((g) => g.row.id === "palm-court"));
  assert.ok(!planReminders(ACCOUNTS, 30, later).go.some((g) => g.row.id === "sara-haddad"));
});

test("the 24 hour window decides between buttons and the approved template", () => {
  assert.equal(windowClosesAt(null), null);
  assert.equal(isWindowOpen("2026-11-11T17:52:00+03:00", NOW), true);
  assert.equal(isWindowOpen("2026-11-03T08:30:00+03:00", NOW), false);
  assert.equal(isWindowOpen(null, NOW), false);
});

test("the reminder's wording is the server's, in the customer's language", () => {
  const base = { shop: "Nuqta Car Care", shopAr: "نقطة", amount: 126400, days: 41, tone: "gentle", link: "pay.alyr.qa/x", how: "" };
  assert.equal(
    reminderText({ ...base, lang: "en" }),
    "A friendly reminder from Nuqta Car Care: QAR 1,264 is due. Your oldest unpaid purchase was 41 days ago. Pay here: pay.alyr.qa/x",
  );
  assert.match(reminderText({ ...base, lang: "en", tone: "final" }), /^Final notice from Nuqta Car Care: QAR 1,264 has been overdue for more than 90 days/);
  assert.match(reminderText({ ...base, lang: "en", link: "", how: "You can pay us by cash." }), /ago\. You can pay us by cash\.$/);
  assert.match(reminderText({ ...base, lang: "ar", tone: "firm" }), /^تذكير من نقطة: مبلغ QAR 1,264 متأخر السداد\./);
  assert.equal(qarText(8550), "QAR 85.50");
  assert.equal(qarText(-8000), "-QAR 80");
});

test("Bluefin's book: the running balance, and what is still owed sale by sale (oldest first)", () => {
  assert.deepEqual(withBalance(BLUEFIN_ENTRIES).map((e) => e.owesAfter), [36000, 0, 162000, 154000, 104000, 126400]);
  const open = openSales(BLUEFIN_ENTRIES, NOW);
  assert.deepEqual(open.map((s) => [s.ref, s.amount, s.paid, s.remaining, s.days]), [
    ["INV-2026-0358", 154000, 50000, 104000, 41],
    ["Order #1028", 22400, 0, 22400, 0],
  ]);
  assert.deepEqual(ageOf(BLUEFIN_ENTRIES, NOW), { balance: 126400, oldestDays: 41, buckets: { d0_30: 22400, d31_60: 104000, d61_90: 0, d90_plus: 0 } });
  assert.equal(signed({ kind: "reversal", amount: 8000 }), -8000);
  const { splits } = settle(BLUEFIN_ENTRIES, NOW);
  assert.deepEqual(splits.map((s) => [s.sale, s.amount]), [["INV-2026-0297", 36000], ["INV-2026-0358", 50000]]);
});

test("every sample account's book reads back to the figures the list shows", () => {
  for (const a of ACCOUNTS) {
    const aged = ageOf(bookOf(a), NOW);
    assert.equal(aged.balance, a.balance, `${a.name} balance`);
    assert.equal(aged.oldestDays, a.oldestDays, `${a.name} age`);
    assert.deepEqual(aged.buckets, a.buckets, `${a.name} buckets`);
  }
});

test("a payment pays the oldest sale first, and says what is still owed", () => {
  const open = openSales(BLUEFIN_ENTRIES, NOW);
  const full = allocatePayment(open, 104000);
  assert.deepEqual(full.lines.map((l) => [l.ref, l.applied, l.left]), [["INV-2026-0358", 104000, 0], ["Order #1028", 0, 22400]]);
  assert.equal(full.owesAfter, 22400);
  assert.equal(allocatePayment(open, 126400).owesAfter, 0);
  assert.deepEqual(allocatePayment(open, 50000).lines.map((l) => l.left), [54000, 22400]);
  assert.equal(allocatePayment(open, 0).owesAfter, 126400);
  assert.equal(allocatePayment(open, 110000).lines[1].applied, 6000);
});

test("an amount is read from what was typed, and checked against what they owe", () => {
  assert.equal(parseAmount("1,040"), 104000);
  assert.equal(parseAmount(" 12.5 "), 1250);
  assert.equal(parseAmount("١٬٠٤٠"), 104000);
  assert.equal(parseAmount("1.234"), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(""), null);
  assert.deepEqual(checkAmount("1,040", 126400), { ok: true, amount: 104000 });
  assert.deepEqual(checkAmount("", 126400), { ok: false, reason: "empty" });
  assert.deepEqual(checkAmount("0", 126400), { ok: false, reason: "zero" });
  assert.deepEqual(checkAmount("1,265", 126400), { ok: false, reason: "more" });
  assert.deepEqual(checkAmount("1,264", 126400), { ok: true, amount: 126400 });
});

test("recording a payment lowers the balance, re-reads the age and ends the promise; nothing else changes", () => {
  const entry = paymentEntry({ amount: 104000, method: "bank_transfer", reference: "TRX-1", by: "Hana", at: NOW }, "p1");
  assert.equal(entry.kind, "payment");
  const row = applyPayment(bluefin, [...BLUEFIN_ENTRIES, entry], NOW);
  assert.equal(row.balance, 22400);
  assert.equal(row.oldestDays, 0);
  assert.deepEqual(row.buckets, { d0_30: 22400, d31_60: 0, d61_90: 0, d90_plus: 0 });
  assert.equal(row.promisePassed, false);
  assert.equal(row.promisedUntil, null);
  assert.equal(row.name, bluefin.name);
  assert.equal(bluefin.balance, 126400, "the original row is untouched");
  const noor = ACCOUNTS.find((a) => a.id === "noor-abdullah");
  assert.equal(applyPayment(noor, bookOf(noor), NOW).promisedUntil, null);
});

test("a promise is none, open or passed; paid since counts only payments after it", () => {
  assert.equal(promiseState(bluefin), "passed");
  assert.equal(promiseState(ACCOUNTS.find((a) => a.id === "noor-abdullah")), "open");
  assert.equal(promiseState(ACCOUNTS[0]), "none");
  assert.equal(paidSince(BLUEFIN_ENTRIES, "2026-11-02T10:12:00+03:00"), 0);
  assert.equal(paidSince(BLUEFIN_ENTRIES, "2026-10-01T00:00:00+03:00"), 50000);
  assert.equal(paidSince(BLUEFIN_ENTRIES, null), 0);
});

test("the reminder stages start on the day the oldest sale reaches 60 and 90 days", () => {
  const sale = openSales(BLUEFIN_ENTRIES, NOW)[0].at;
  const stages = reminderStages(41, sale);
  assert.deepEqual(stages.map((s) => s.current), [true, false, false]);
  assert.equal(dohaDay(stages[1].startsAt), "2026-12-01");
  assert.equal(dohaDay(stages[2].startsAt), "2026-12-31");
  assert.equal(reminderStages(95, sale)[2].current, true);
});

test("the statement counts every line of the period; hiding paid lines only shortens the table", () => {
  const all = statementOf(BLUEFIN_ENTRIES, NOW, { from: null, to: NOW, showPaid: true });
  assert.deepEqual([all.opening, all.put, all.paid, all.owes], [0, 212400, 86000, 126400]);
  assert.equal(all.lines.length, 6);
  assert.deepEqual(all.buckets, { d0_30: 22400, d31_60: 104000, d61_90: 0, d90_plus: 0 });
  const short = statementOf(BLUEFIN_ENTRIES, NOW, { from: null, to: NOW, showPaid: false });
  assert.deepEqual([short.opening, short.put, short.paid, short.owes], [0, 212400, 86000, 126400]);
  assert.equal(short.hidden, 2);
  assert.deepEqual(short.lines.map((l) => l.ref), ["INV-2026-0358", "CN-2026-0009", "PL-2026-100782", "Order #1028"]);
  const since = statementOf(BLUEFIN_ENTRIES, NOW, { from: "2026-11-02T00:00:00+03:00", to: NOW, showPaid: true });
  assert.deepEqual([since.opening, since.put, since.paid, since.owes, since.lines.length], [104000, 22400, 0, 126400, 1]);
  for (const s of [all, short, since]) assert.equal(s.opening + s.put - s.paid, s.owes);
});

test("payments in a month, the CSV, and days since", () => {
  assert.equal(paymentsInMonth(PAYMENTS, "2026-11").reduce((s, p) => s + p.amount, 0), 248000);
  assert.equal(paymentsInMonth(PAYMENTS, "2026-10").length, 0);
  assert.equal(csvOf([["a", 'b "q"'], ["1", "2"]]), '"a","b ""q"""\r\n"1","2"\r\n');
  assert.equal(daysSince("2026-10-02T09:12:00+03:00", NOW), 41);
  assert.equal(daysSince("2027-01-01T00:00:00+03:00", NOW), 0);
  assert.deepEqual(addBuckets(emptyBuckets(), { d0_30: 1, d31_60: 2, d61_90: 3, d90_plus: 4 }), { d0_30: 1, d31_60: 2, d61_90: 3, d90_plus: 4 });
  assert.equal(BUCKET_KEYS.length, 4);
});

test("the preview data is whole: shop, team, rows, books", () => {
  const d = previewData();
  assert.equal(d.rows.length, 14);
  assert.equal(Object.keys(d.books).length, 14);
  assert.equal(d.shop.name, SHOP.name);
  assert.equal(d.now, NOW);
});

test("the ledger API's answers are read as they are, with no sample data filled in", async () => {
  const { rowsFromSummary, entriesFromApi, reminderResult, paymentBody } = await import("./creditMap.ts");
  const rows = rowsFromSummary({
    shop: { name: "Nuqta Car Care", name_ar: null }, outstanding: 5,
    customers: [{ id: "c1", name: "A", phone: "+974 5555 0001", lang: "ar", balance: 500, oldest_days: 12, buckets: { d0_30: 500, d31_60: 0, d61_90: 0, d90_plus: 0 },
      over_limit: false, opted_out: true, promised_until: null, promise_passed: true, last_reminded_at: null, assigned: null }],
  });
  assert.equal(rows[0].balance, 500);
  assert.equal(rows[0].creditLimit, null, "the summary does not send the limit, so none is shown");
  assert.equal(rows[0].remindersSent, null);
  assert.equal(rows[0].lang, "ar");
  assert.equal(rows[0].optedOut, true);
  const book = entriesFromApi([
    { kind: "payment", amount: 300, note: "", created_by: "Hana", created_at: "2026-11-02T10:00:00+03:00", document: { number: "R-1" } },
    { kind: "sale", amount: 800, note: "x", created_by: "Omar", created_at: "2026-10-01T10:00:00+03:00" },
    { kind: "reversal", amount: 100, note: "", created_by: "Omar", created_at: "2026-10-03T10:00:00+03:00" },
  ]);
  assert.deepEqual(book.map((e) => [e.kind, e.amount, e.ref]), [["payment", 300, "R-1"], ["sale", 800, ""], ["reversal", 100, ""]]);
  assert.deepEqual(reminderResult({ sent: 3, skipped_promised: 1, skipped_recent: 2, skipped_opted_out: 0 }), { sent: 3, skippedPromised: 1, skippedRecent: 2, skippedOptedOut: 0 });
  assert.deepEqual(paymentBody({ accountId: "c1", amount: 100, method: "cash", reference: "" }), { subject: "credit", id: "c1", amount_minor: 100, method: "cash", reference: "" });
});
