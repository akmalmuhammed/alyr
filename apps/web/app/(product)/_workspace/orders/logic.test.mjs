import test from "node:test";
import assert from "node:assert/strict";
import {
  orderNo,
  formatPhone,
  isLateNew,
  ageMinutes,
  formatAgeOrDate,
  formatTime,
  itemsSummary,
  nextStep,
  cancelConsequences,
  money,
  timelineSentence,
  queryToFilters,
  filtersToQuery,
} from "./logic.ts";

test("orderNo: prefixes number with #", () => {
  assert.equal(orderNo(1042), "#1042");
  assert.equal(orderNo("1042"), "#1042");
  assert.equal(orderNo("#1042"), "#1042");
});

test("formatPhone: formats Qatar numbers cleanly", () => {
  assert.equal(formatPhone("97455550112"), "+974 5555 0112");
  assert.equal(formatPhone("55550112"), "+974 5555 0112");
});

test("isLateNew: correctly flags orders new and > 15m", () => {
  const now = new Date("2026-11-13T12:00:00Z").getTime();

  // 10 minutes ago -> not late
  const recent = new Date("2026-11-13T11:50:00Z");
  assert.equal(isLateNew("new", recent, now), false);

  // 18 minutes ago -> late
  const late = new Date("2026-11-13T11:42:00Z");
  assert.equal(isLateNew("new", late, now), true);

  // 25 minutes ago but confirmed -> not late
  assert.equal(isLateNew("confirmed", late, now), false);
});

test("ageMinutes: calculates minutes correctly", () => {
  const now = new Date("2026-11-13T12:00:00Z").getTime();
  const created = new Date("2026-11-13T11:42:00Z");
  assert.equal(ageMinutes(created, now), 18);
});

test("formatAgeOrDate: age when today, date when another day", () => {
  const now = new Date("2026-11-13T12:00:00Z").getTime();
  const createdToday = new Date("2026-11-13T11:56:00Z");
  assert.equal(formatAgeOrDate(createdToday, "en", now), "4 min");
  assert.equal(formatAgeOrDate(createdToday, "ar", now), "4 د");

  const createdPast = new Date("2026-11-11T10:00:00Z");
  const pastEn = formatAgeOrDate(createdPast, "en", now);
  assert(pastEn.includes("11") && pastEn.includes("Nov"), `Got ${pastEn}`);
});

test("formatTime: formats HH:MM", () => {
  const d = new Date(2026, 10, 13, 9, 36);
  assert.equal(formatTime(d), "09:36");
});

test("itemsSummary: splits first line and rest", () => {
  const items = [
    { name: "Carnauba wax", name_ar: "شمع كارنوبا", quantity: 1, variant: "250 ml", variant_ar: "250 مل" },
    { name: "Tyre shine", name_ar: "ملمع إطارات", quantity: 1 },
    { name: "Air freshener", name_ar: "معطر جو", quantity: 1, variant: "Oud", variant_ar: "عود" },
  ];

  const enSummary = itemsSummary(items, "en");
  assert.equal(enSummary.line1, "1 × Carnauba wax · 250 ml");
  assert.equal(enSummary.line2, "1 × Tyre shine, 1 × Air freshener · Oud");
  assert.equal(enSummary.count, 3);

  const arSummary = itemsSummary(items, "ar");
  assert.equal(arSummary.line1, "1 × شمع كارنوبا · 250 مل");
  assert.equal(arSummary.line2, "1 × ملمع إطارات, 1 × معطر جو · عود");
});

test("nextStep: returns progression info", () => {
  assert.deepEqual(nextStep("new"), {
    nextStatus: "confirmed",
    labelEn: "Confirm order",
    labelAr: "تأكيد الطلب",
    volt: true,
  });
  assert.deepEqual(nextStep("confirmed"), {
    nextStatus: "ready",
    labelEn: "Mark ready",
    labelAr: "تحديد كجاهز",
    volt: true,
  });
  assert.deepEqual(nextStep("ready"), {
    nextStatus: "done",
    labelEn: "Mark done",
    labelAr: "تحديد كمكتمل",
    volt: true,
  });
  assert.equal(nextStep("done"), null);
  assert.equal(nextStep("cancelled"), null);
});

test("cancelConsequences: checks restocking and refund conditions", () => {
  // New order, paid by link
  const earlyOrder = {
    status: "new",
    payment: "paid",
    total: 18500,
    test: false,
    lines: [{ name: "Item", quantity: 2 }, { name: "Item 2", quantity: 1 }],
  };
  const cons1 = cancelConsequences(earlyOrder);
  assert.equal(cons1.restockDefault, true);
  assert.equal(cons1.restockCount, 3);
  assert.equal(cons1.refundDue, 18500);
  assert.equal(cons1.isCreditReversal, false);

  // Ready order, unpaid
  const readyOrder = {
    status: "ready",
    payment: "unpaid",
    total: 8500,
    lines: [{ name: "Item", quantity: 1 }],
  };
  const cons2 = cancelConsequences(readyOrder);
  assert.equal(cons2.restockDefault, false);
  assert.equal(cons2.refundDue, 0);

  // On account order with document
  const accountOrder = {
    status: "confirmed",
    payment: "on_account",
    total: 5000,
    document: { id: "doc-1" },
  };
  const cons3 = cancelConsequences(accountOrder);
  assert.equal(cons3.isCreditReversal, true);
  assert.equal(cons3.cancelsDocument, true);
});

test("money: formats dirhams to QAR", () => {
  assert.equal(money(8500), "QAR 85");
  assert.equal(money(8550), "QAR 85.50");
  assert.equal(money(18500), "QAR 185");
  assert.equal(money(-2000), "-QAR 20");
  assert.equal(money(37500, "ar"), "375\u00a0ر.ق");
  assert.equal(money(8550, "ar"), "85.50\u00a0ر.ق");
  assert.equal(money(-2000, "ar"), "-20\u00a0ر.ق");
});

test("timelineSentence: formats events with honest wording", () => {
  assert.equal(
    timelineSentence({ action: "placed" }, "Ahmed", "en"),
    "Ahmed placed the order"
  );
  assert.equal(
    timelineSentence({ action: "confirmed", actor_name: "Salma" }, "Ahmed", "en"),
    "Salma confirmed the order"
  );
  assert.equal(
    timelineSentence({ action: "paid", actor_name: "Salma", detail: { method: "cash", amount: 11000 } }, "Ahmed", "en"),
    "Paid, cash, QAR 110. Salma recorded it."
  );
  assert.equal(
    timelineSentence({ action: "took", actor_name: "Auto-reply" }, "Ahmed", "en"),
    "Automatically took the order"
  );
});

test("queryToFilters & filtersToQuery: roundtrips", () => {
  const query = {
    status: "ready",
    payment: "unpaid",
    mode: "pickup",
    q: "ahmed",
    sort: "oldest",
  };
  const filters = queryToFilters(query);
  assert.equal(filters.status, "ready");
  assert.equal(filters.payment, "unpaid");
  assert.equal(filters.mode, "pickup");
  assert.equal(filters.q, "ahmed");
  assert.equal(filters.sort, "oldest");

  const serialized = filtersToQuery(filters);
  assert.equal(serialized.get("status"), "ready");
  assert.equal(serialized.get("payment"), "unpaid");
  assert.equal(serialized.get("mode"), "pickup");
  assert.equal(serialized.get("q"), "ahmed");
  assert.equal(serialized.get("sort"), "oldest");
});
