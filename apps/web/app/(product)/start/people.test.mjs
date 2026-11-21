// A salon starts as a salon (T9, D-196): the hours step asks for the people who serve at once,
// each service and person has an English and an Arabic name that stay correct when one is edited,
// and the words exist in both languages. Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { COPY } from "./copy.ts";
import { mainKey, nameChange, otherKey } from "./names.ts";

const HERE = import.meta.dirname;
const page = readFileSync(join(HERE, "page.tsx"), "utf8");
const row = { id: "1", name: "Hair colour", name_ar: "صبغ الشعر" };

test("the screen edits the name in its own language and shows the other one under it", () => {
  assert.equal(mainKey("en"), "name");
  assert.equal(otherKey("en"), "name_ar");
  assert.equal(mainKey("ar"), "name_ar");
  assert.equal(otherKey("ar"), "name");
});

test("leaving a name field saves that one field, and only when it changed", () => {
  assert.deepEqual(nameChange("name", row, "  Balayage "), { name: "Balayage" });
  assert.deepEqual(nameChange("name_ar", row, "تلوين الشعر"), { name_ar: "تلوين الشعر" });
  assert.equal(nameChange("name", row, "Hair colour"), null);
  assert.equal(nameChange("name_ar", row, " صبغ الشعر "), null);
});

test("the English name is required and the Arabic one may be cleared", () => {
  assert.equal(nameChange("name", row, "   "), null);
  assert.deepEqual(nameChange("name_ar", row, ""), { name_ar: "" });
  assert.equal(nameChange("name_ar", { ...row, name_ar: "" }, ""), null);
});

test("the people card is on the hours step and every service row has its other-language name", () => {
  const hours = page.slice(page.indexOf('else if (step === "hours")'), page.indexOf('else if (step === "products")'));
  assert.match(hours, /<People /);
  assert.match(page, /<OtherName row=\{s\}/);
  // The old rule "One booking at a time ... always" is only said while there is one person or none.
  assert.match(hours, /t\.hours\.capacityMany/);
});

test("the people words exist in both languages, say what to do, and never end in an ellipsis", () => {
  for (const lang of ["en", "ar"]) {
    const people = COPY[lang].people;
    for (const key of ["title", "sub", "name", "other", "newName", "addIt", "remove", "last", "note"]) {
      assert.ok(people[key] && people[key].trim(), `${lang}.people.${key} is empty`);
      assert.ok(!/…|\.\.\./.test(people[key]), `${lang}.people.${key} ends in an ellipsis`);
    }
    assert.ok(COPY[lang].services.other.trim());
    assert.ok(COPY[lang].hours.capacityMany.trim() && COPY[lang].hours.capacityManySub.trim());
  }
  assert.match(COPY.ar.people.title, /[؀-ۿ]/);
  assert.match(COPY.ar.people.other, /[؀-ۿ]/);
  assert.notEqual(COPY.ar.people.sub, COPY.en.people.sub);
});
