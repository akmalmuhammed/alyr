// The Google Maps link of each place (workstream F): the API's answer is read defensively, and the
// words exist in both languages.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGooglePlace } from "./api2.ts";
import { T2 } from "./copy2.ts";

test("the answer gives on, and each place with its place ID or none", () => {
  const v = parseGooglePlace({
    on: true,
    places: [
      { id: "a", name: "Test Bakery", name_ar: "مخبز", area: "Al Sadd", place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4" },
      { id: "b", name: "Second", name_ar: "", area: "", place_id: null },
      { name: "no id" },
    ],
  });
  assert.equal(v.on, true);
  assert.deepEqual(v.places.map((p) => [p.id, p.placeId]), [["a", "ChIJN1t_tDeuEmsRUsoyG83frY4"], ["b", null]]);
});

test("anything but a clear true is off, so the field stays hidden", () => {
  for (const raw of [null, {}, { on: "true" }, { on: 1 }, []]) assert.equal(parseGooglePlace(raw).on, false);
});

test("every word of the field is there in English and Arabic", () => {
  const keys = ["gmTitle", "gmSub", "gmPlaceholder", "gmSave", "gmSaving", "gmSaved", "gmCleared", "gmNone"];
  for (const key of keys) {
    assert.ok(T2.en[key] && T2.ar[key], key);
  }
  assert.notEqual(T2.en.gmSub, T2.ar.gmSub);
  assert.match(T2.ar.gmLabel("Test Bakery"), /Test Bakery/);
  assert.match(T2.en.gmHave("ChIJ1"), /ChIJ1/);
});
