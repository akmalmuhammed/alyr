// The last screen nits (agent P4): phone numbers through the product's one helper, and the place
// names on Checks said without the business name they all share.
// Run: node --test "app/**/*.test.mjs".

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { formatPhone } from "../orders/logic.ts";
import { setupFixture } from "./fixtures2.ts";
import { knownFacts, placeNamer } from "./screens.ts";

const NB = "\u00a0";
// A Qatar number as stored ("+97455550101", "97455550101") or eight digits in one run. A link's
// own path ("wa.me/97455550101") is the link as shown, not a number written out.
const RAW = /\+974\d{8}|(?<![\d/+])974\d{8}|(?<![\d/])\d{8}(?!\d)/;

test("phone numbers on Set up go through formatPhone, however they were stored", () => {
  for (const lang of ["en", "ar"]) {
    const s = setupFixture(lang);
    const facts = s.facts.map((f) => (f.key === "phone" || f.key === "whatsapp" ? { ...f, value: { phone: "+97455550101" } } : f));
    const shown = knownFacts({ place: { ...s.place, whatsapp_e164: "97455550101" }, facts, sourceKind: "google", lang });
    for (const key of ["whatsapp", "phone"]) {
      const fact = shown.find((f) => f.key === key);
      assert.equal(fact.value, `+974${NB}5555${NB}0101`, key);
      assert.equal(fact.ltr, true, key); // drawn left to right inside <bdi> in Arabic
    }
    for (const fact of shown) assert.ok(!RAW.test(`${fact.value} ${fact.sub ?? ""}`), fact.value);
  }
});

test("no Discovery v2 screen writes its own phone formatter", () => {
  const dir = new URL(".", import.meta.url);
  for (const name of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
    const source = readFileSync(new URL(name, dir), "utf8");
    assert.ok(!/\\\+974\(\\d\{4\}\)/.test(source), `${name} formats phone numbers itself: use formatPhone`);
  }
});

test("placeNamer: places that share the business name are said by their branch", () => {
  const name = placeNamer(["Nuqta Car Care - Al Wakra", null, "Nuqta Car Care - Industrial Area", "Nuqta Car Care - Al Wakra"]);
  assert.equal(name("Nuqta Car Care - Al Wakra"), "Al Wakra");
  assert.equal(name("Nuqta Car Care - Industrial Area"), "Industrial Area");
  const ar = placeNamer(["نقطة لعناية السيارات - الوكرة", "نقطة لعناية السيارات - السد"]);
  assert.equal(ar("نقطة لعناية السيارات - السد"), "السد");
  // One place, or names that do not share a head: said in full.
  assert.equal(placeNamer(["Nuqta Car Care - Al Wakra"])("Nuqta Car Care - Al Wakra"), "Nuqta Car Care - Al Wakra");
  const mixed = placeNamer(["Nuqta Car Care - Al Wakra", "Point Car Wash - Lusail"]);
  assert.equal(mixed("Point Car Wash - Lusail"), "Point Car Wash - Lusail");
  assert.equal(placeNamer([])("Lusail"), "Lusail");
});

test("formatPhone is the helper: Qatar in groups of four, held together", () => {
  assert.equal(formatPhone("+97455550999"), `+974${NB}5555${NB}0999`);
  assert.equal(formatPhone("+971501234567"), "+971501234567");
});
