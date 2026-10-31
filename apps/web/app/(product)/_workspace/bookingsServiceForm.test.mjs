// Tests for the Bookings services form (ALY-259, D-140): a price typed the way an owner types it
// becomes dirhams without a float, Arabic digits are read, and the form is refused in the right
// place before anything is sent. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { blankForm, checkForm, formFromService, parseQar, parseWhole, qarText } from "./bookingsServiceForm.ts";

test("a price is read from the text, never through a float", () => {
  assert.equal(parseQar("150"), 15000);
  assert.equal(parseQar("12.5"), 1250);
  assert.equal(parseQar("12.55"), 1255);
  assert.equal(parseQar("0.05"), 5);
  assert.equal(parseQar("8.30"), 830);
  assert.equal(parseQar(" 20 "), 2000);
});

test("Arabic digits, the Arabic decimal mark and a comma are read", () => {
  assert.equal(parseQar("١٥٠"), 15000);
  assert.equal(parseQar("١٢٫٥"), 1250);
  assert.equal(parseQar("12,5"), 1250);
  assert.equal(parseQar("۱۲٫۵۰"), 1250);
  assert.equal(parseWhole("٤٥"), 45);
});

test("what is not an amount is refused", () => {
  for (const text of ["", "abc", "-5", "12.555", "1,500", "12.", ".5", "1e3", "12 30"]) {
    assert.equal(parseQar(text), null, JSON.stringify(text));
  }
  assert.equal(parseWhole("4.5"), null);
  assert.equal(parseWhole(""), null);
});

test("dirhams are written the way they are typed", () => {
  assert.equal(qarText(15000), "150");
  assert.equal(qarText(1250), "12.5");
  assert.equal(qarText(1255), "12.55");
  assert.equal(qarText(5), "0.05");
  assert.equal(qarText(10000), "100");
  assert.equal(parseQar(qarText(830)), 830);
});

const good = { ...blankForm(), name: "Haircut", minutes: "45", price: "80" };

test("a good form becomes the request, with the price in dirhams", () => {
  const checked = checkForm(good, false);
  assert.equal(checked.error, null);
  assert.deepEqual(checked.body, {
    name: "Haircut", name_ar: "", duration_minutes: 45, price: 8000,
    deposit_kind: "none", deposit_value: 0,
  });
});

test("a service with no price is allowed and shows none", () => {
  const checked = checkForm({ ...good, price: "" }, false);
  assert.equal(checked.error, null);
  assert.equal(checked.body.price, 0);
});

test("the name, the length and the price are each checked", () => {
  assert.equal(checkForm({ ...good, name: "   " }, false).error, "bad_name");
  assert.equal(checkForm({ ...good, minutes: "4" }, false).error, "bad_duration");
  assert.equal(checkForm({ ...good, minutes: "601" }, false).error, "bad_duration");
  assert.equal(checkForm({ ...good, minutes: "" }, false).error, "bad_duration");
  assert.equal(checkForm({ ...good, price: "eighty" }, false).error, "bad_price");
});

test("a fixed deposit is at least QAR 1 and not over the price", () => {
  const fixed = (deposit) => checkForm({ ...good, depositKind: "fixed", deposit }, false);
  assert.equal(fixed("20").body.deposit_value, 2000);
  assert.equal(fixed("80").error, null);
  assert.equal(fixed("80.5").error, "bad_deposit");
  assert.equal(fixed("0.5").error, "bad_deposit");
  assert.equal(fixed("").error, "bad_deposit");
  // With no price to compare to, any amount from QAR 1 is allowed.
  assert.equal(checkForm({ ...good, price: "", depositKind: "fixed", deposit: "500" }, false).error, null);
});

test("a share of the price is 1 to 100 and needs a price", () => {
  const share = (deposit, price = "80") => checkForm({ ...good, price, depositKind: "percent", deposit }, false);
  assert.equal(share("25").body.deposit_value, 25);
  assert.equal(share("0").error, "bad_deposit");
  assert.equal(share("101").error, "bad_deposit");
  assert.equal(share("12.5").error, "bad_deposit");
  assert.equal(share("25", "").error, "deposit_needs_price");
});

test("who does it is sent only for a shop with people or chairs", () => {
  assert.equal("resource_ids" in checkForm(good, false).body, false);
  assert.deepEqual(checkForm(good, true).body.resource_ids, []);
  assert.deepEqual(checkForm({ ...good, everyone: false, chosen: ["a", "b"] }, true).body.resource_ids, ["a", "b"]);
  assert.equal(checkForm({ ...good, everyone: false, chosen: [] }, true).error, "bad_who");
});

test("a service opens in the form as it is, minus people who are switched off", () => {
  const service = {
    id: "s1", name: "Colour", name_ar: "صبغة", duration_minutes: 90, price: 25050, active: true,
    deposit_kind: "percent", deposit_value: 30, deposit: 7515, resource_ids: ["a", "gone"], upcoming: 2,
  };
  const form = formFromService(service, ["a", "b"]);
  assert.deepEqual(form, {
    name: "Colour", nameAr: "صبغة", minutes: "90", price: "250.5", depositKind: "percent",
    deposit: "30", everyone: false, chosen: ["a"],
  });
  const fixed = formFromService({ ...service, deposit_kind: "fixed", deposit_value: 5000, resource_ids: [] }, ["a"]);
  assert.equal(fixed.deposit, "50");
  assert.equal(fixed.everyone, true);
  // Saved untouched, it is the same request the API already holds.
  assert.equal(checkForm(fixed, true).body.price, 25050);
});
