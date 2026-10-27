// EN/AR copy parity: every key of the site's words exists in both languages, with the same
// shape (the same keys, the same list lengths, a string where the other has a string), and
// no string is empty. The TypeScript types already make both objects the same type; they do
// not catch a missing optional field, a shorter list (a missing question), or "" (02-dx.md
// P1-2).
//
//   node scripts/site/copy-parity.mjs
//
// Differences that are true on purpose are listed, with a reason each, in
// scripts/site/allow/parity.json. An entry that no longer matches anything fails the check
// too, so the list cannot go stale.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSite, matchPath } from "./lib/copy.mjs";

const allowFile = join(import.meta.dirname, "allow/parity.json");
const allow = JSON.parse(readFileSync(allowFile, "utf8"));
const used = new Set();

const allowed = (kind, path) => {
  const hit = allow[kind]?.find((entry) => matchPath(path, entry.path));
  if (hit) used.add(`${kind}:${hit.path}`);
  return Boolean(hit);
};

const { copy } = await loadSite();
const problems = [];
let strings = 0;

const kindOf = (value) => (Array.isArray(value) ? "list" : value === null ? "null" : typeof value);

function compare(en, ar, path) {
  const ke = kindOf(en);
  const ka = kindOf(ar);
  if (ke === "undefined" || ka === "undefined") {
    const missing = ke === "undefined" ? "English" : "Arabic";
    if (!allowed("onlyOneLanguage", path)) problems.push(`${path}: missing in ${missing}`);
    return;
  }
  if (ke !== ka) {
    if (!allowed("differentShape", path)) problems.push(`${path}: a ${ke} in English, a ${ka} in Arabic`);
    return;
  }
  if (ke === "string") {
    strings += 2;
    for (const [lang, value] of [["English", en], ["Arabic", ar]]) {
      if (value.trim() === "" && !allowed("empty", path)) problems.push(`${path}: empty in ${lang}`);
    }
    return;
  }
  if (ke === "list") {
    if (en.length !== ar.length && !allowed("differentLength", path)) {
      problems.push(`${path}: ${en.length} items in English, ${ar.length} in Arabic`);
    }
    for (let i = 0; i < Math.max(en.length, ar.length); i += 1) compare(en[i], ar[i], `${path}[${i}]`);
    return;
  }
  if (ke === "object") {
    for (const key of new Set([...Object.keys(en), ...Object.keys(ar)])) compare(en[key], ar[key], path ? `${path}.${key}` : key);
  }
  // numbers and booleans: same kind is enough (a sample's count may differ by language only by mistake,
  // but the types already make it a number in both)
}

compare(copy.en, copy.ar, "");

for (const [kind, entries] of Object.entries(allow)) {
  if (kind.startsWith("$")) continue;
  for (const entry of entries) {
    if (!used.has(`${kind}:${entry.path}`)) problems.push(`allow/parity.json: "${entry.path}" (${kind}) no longer matches anything; remove it`);
  }
}

if (problems.length) {
  console.error(`copy-parity: ${problems.length} problem(s) between the English and Arabic copy (apps/web/app/_site/copy*.ts):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("Add the missing words in both languages. Only a difference that is true on purpose belongs in scripts/site/allow/parity.json, with its reason.");
  process.exit(1);
}
console.log(`copy-parity: English and Arabic match (${strings} strings; no empty or one-language ones outside allow/parity.json).`);
