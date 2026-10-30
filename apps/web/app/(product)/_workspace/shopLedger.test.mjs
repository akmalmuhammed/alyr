// The Team screen no longer asks for the credit accounts of a shop that has none (found by the
// end-to-end test of 30 Oct). Run with `pnpm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { asksLedgerSummary, shopNameShown } from "./shopLedger.ts";

test("a shop without the credit accounts module does not ask for their summary", () => {
  assert.equal(asksLedgerSummary(["bookings", "catalog", "inbox", "payments"]), false);
  assert.equal(asksLedgerSummary([]), false);
});

test("a shop with the module asks, and so does the demo, which has no list of modules", () => {
  assert.equal(asksLedgerSummary(["inbox", "ledger"]), true);
  assert.equal(asksLedgerSummary(undefined), true);
});

test("the shop's name comes from the summary, else from the workspace, in the language shown", () => {
  const summary = { name: "Al Noor Electricals", name_ar: "النور للإلكترونيات" };
  const business = { name: "Dafira Salon", name_ar: "صالون دافيرا" };
  assert.equal(shopNameShown("en", summary, business), "Al Noor Electricals");
  assert.equal(shopNameShown("ar", summary, business), "النور للإلكترونيات");
  assert.equal(shopNameShown("en", undefined, business), "Dafira Salon");
  assert.equal(shopNameShown("ar", undefined, business), "صالون دافيرا");
});

test("Arabic falls back to the English name, and nothing known shows nothing", () => {
  assert.equal(shopNameShown("ar", undefined, { name: "Dafira Salon", name_ar: "" }), "Dafira Salon");
  assert.equal(shopNameShown("ar", undefined, { name: "Dafira Salon" }), "Dafira Salon");
  assert.equal(shopNameShown("en", undefined, undefined), "");
});
