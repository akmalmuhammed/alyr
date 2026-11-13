import test from "node:test";
import assert from "node:assert/strict";
import {
  formatQar,
  getAgeBadgeTone,
  getReminderTone,
  calculateCreditUsed,
  getInitials,
  filterCreditAccounts,
  sortCreditAccounts,
} from "./logic.ts";

test("formatQar formats dirhams into QAR with non-breaking spaces", () => {
  assert.equal(formatQar(126400, "en"), "QAR\u00a01,264");
  assert.equal(formatQar(126400, "ar"), "1,264\u00a0ر.ق");
  assert.equal(formatQar(45050, "en"), "QAR\u00a0450.50");
  assert.equal(formatQar(-8000, "en"), "−QAR\u00a080");
});

test("getAgeBadgeTone assigns proper tones based on days", () => {
  assert.equal(getAgeBadgeTone(15), "n");
  assert.equal(getAgeBadgeTone(30), "n");
  assert.equal(getAgeBadgeTone(35), "warn");
  assert.equal(getAgeBadgeTone(60), "warn");
  assert.equal(getAgeBadgeTone(72), "bad");
});

test("getReminderTone respects the 60 and 90 day boundaries", () => {
  assert.equal(getReminderTone(25).toneName, "Gentle");
  assert.equal(getReminderTone(41).toneName, "Gentle");
  assert.equal(getReminderTone(60).toneName, "Firm");
  assert.equal(getReminderTone(72).toneName, "Firm");
  assert.equal(getReminderTone(90).toneName, "Final");
  assert.equal(getReminderTone(112).toneName, "Final");
});

test("calculateCreditUsed computes percentage and headroom correctly", () => {
  const bluefin = calculateCreditUsed(126400, 150000);
  assert.equal(bluefin.percent, 84);
  assert.equal(bluefin.isOver, false);
  assert.equal(bluefin.left, 23600);

  const omar = calculateCreditUsed(48000, 40000);
  assert.equal(omar.percent, 120);
  assert.equal(omar.isOver, true);
  assert.equal(omar.left, 0);
});

test("getInitials extracts initials accurately", () => {
  assert.equal(getInitials("Hana"), "HA");
  assert.equal(getInitials("Bluefin Events"), "BE");
  assert.equal(getInitials("Gulf Courier W.L.L."), "GW");
});

test("filterCreditAccounts filters by search query and filter tab", () => {
  const sample = [
    { id: "1", name: "Bluefin Events", phone: "+974 5500 1122", owes: 126400, limit: 150000, oldestDebtDays: 41, promise: null, lastReminder: null, followsUp: "Hana", tag: null, since: "1" },
    { id: "2", name: "Omar Al-Kuwari", phone: "+974 6600 3344", owes: 48000, limit: 40000, oldestDebtDays: 72, promise: null, lastReminder: null, followsUp: "Hana", tag: null, since: "1" },
    { id: "3", name: "Al-Raya Media", phone: "+974 3300 7788", owes: 0, limit: 50000, oldestDebtDays: 0, promise: null, lastReminder: null, followsUp: "Hana", tag: null, since: "1" },
  ];
  const allDebtors = filterCreditAccounts(sample, { tab: "owe_money", chip: "all" });
  assert.equal(allDebtors.length, 2);

  const searched = filterCreditAccounts(sample, { search: "Bluefin", tab: "owe_money", chip: "all" });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].name, "Bluefin Events");

  const overLimit = filterCreditAccounts(sample, { tab: "owe_money", chip: "over_limit" });
  assert.equal(overLimit.length, 1);
  assert.equal(overLimit[0].name, "Omar Al-Kuwari");
});

test("sortCreditAccounts sorts by balance descending", () => {
  const sample = [
    { id: "1", name: "A", phone: "1", owes: 100, limit: 500, oldestDebtDays: 10, promise: null, lastReminder: null, followsUp: "Hana", tag: null, since: "1" },
    { id: "2", name: "B", phone: "2", owes: 500, limit: 500, oldestDebtDays: 20, promise: null, lastReminder: null, followsUp: "Hana", tag: null, since: "1" },
  ];
  const sorted = sortCreditAccounts(sample, "owes_desc");
  assert.equal(sorted[0].name, "B");
  assert.equal(sorted[1].name, "A");
});
