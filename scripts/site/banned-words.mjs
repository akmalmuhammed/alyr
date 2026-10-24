// The site's honesty rules as a check (alyr-design/honesty.md): no AI words, nothing
// "coming", no Payroll, no "Early access", and no price while the offer switch is off.
//
//   node scripts/site/banned-words.mjs            the copy, then apps/web/out-site
//   node scripts/site/banned-words.mjs --copy     the copy only (no build needed)
//
// Where it looks:
// - the copy: every string of copy.ts (and copyShelf.ts, copyDocs.ts), English and Arabic,
//   by its path;
// - the built site: every page, the markdown copies, llms.txt and llms-full.txt, sitemap and
//   robots, including the text inside the pages' inline scripts (machines read those too),
//   and, for prices only, the JavaScript in _next/static.
//
// The words:
// - the AI words are read from honesty.md section 1 itself, so the prose and the check
//   cannot drift (if that section's format changes, this fails and says so);
// - the rest are in scripts/site/banned-words.json.
// A use that is true (a fictional customer asking "when are you coming?") is listed in
// scripts/site/allow/banned.json with its reason; an entry that matches nothing fails.
//
// Prices are allowed only behind NEXT_PUBLIC_ALYR_OFFER=on:
// - in the copy, a price may sit only in a line the offer switch hides;
// - in a build made with the offer off, no price may appear, and no line the switch hides.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadSite, matchPath, REPO, walk, WEB } from "./lib/copy.mjs";

const onlyCopy = process.argv.includes("--copy");
const out = join(WEB, "out-site");
const honestyFile = join(REPO, ".claude/skills/alyr-design/honesty.md");
const config = JSON.parse(readFileSync(join(import.meta.dirname, "banned-words.json"), "utf8"));
const allow = JSON.parse(readFileSync(join(import.meta.dirname, "allow/banned.json"), "utf8"));
const problems = [];

// ------------------------------------------------------------------ the words

/** The AI words of honesty.md section 1: the "- **Words:**" and "- **Arabic:**" bullets. */
function honestyWords() {
  const lines = readFileSync(honestyFile, "utf8").split(/\r?\n/);
  const bullet = (label) => {
    const start = lines.findIndex((line) => line.startsWith(`- **${label}:**`));
    if (start < 0) return null;
    let text = lines[start].slice(`- **${label}:**`.length);
    for (let i = start + 1; i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*- /.test(lines[i]); i += 1) {
      text += ` ${lines[i].trim()}`;
    }
    return text
      .replace(/\([^)]*\)/g, "")
      .split(/[,،]/)
      .map((word) => word.replace(/["“”.]/g, "").trim())
      .filter(Boolean);
  };
  const en = bullet("Words");
  const ar = bullet("Arabic");
  if (!en?.length || !ar?.length) {
    console.error(`banned-words: could not read the AI words from ${relative(REPO, honestyFile)} (section 1, the "- **Words:**" and "- **Arabic:**" bullets). If the file was reworded, update honestyWords() in this script to match.`);
    process.exit(1);
  }
  return [
    ...en.map((term) => ({ term, lang: "en", why: "AI word (honesty.md section 1)" })),
    ...ar.map((term) => ({ term, lang: "ar", why: "AI word (honesty.md section 1)" })),
  ];
}

const ARABIC_MARKS = /[ً-ٰٟـ]/g;
const normalize = (text) => text.normalize("NFC").replace(ARABIC_MARKS, "").replace(/[  ]/g, " ");
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Arabic words take the article and the joined prepositions in front (الذكاء، بالذكاء، للذكاء،
// وذكي); only the adjectives also take the feminine and plural endings (ذكية).
const AR_ENDINGS = { "ذكي": "(?:ة|ات)?", "خوارزمية": "|خوارزميات" };

function matcher({ term, lang }) {
  const t = normalize(term);
  if (lang === "ar") {
    const ending = AR_ENDINGS[t] ?? "";
    const body = ending.startsWith("|") ? `(?:${escape(t)}${ending})` : `${escape(t)}${ending}`;
    return new RegExp(`(?<![\\p{L}\\p{M}])(?:[وفبلك]?(?:ال|لل)?)${body}(?![\\p{L}\\p{M}])`, "gu");
  }
  const words = t.split(/\s+/).map(escape).join("\\s+");
  // "AI" and other short capitals only as capitals: "ai" inside a word or a class name is not the word.
  const caseSensitive = /^[A-Z]{2,3}$/.test(t);
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${words}(?![\\p{L}\\p{N}_-])`, caseSensitive ? "gu" : "giu");
}

const terms = [...honestyWords(), ...config.terms].map((entry) => ({ ...entry, re: matcher(entry) }));
const prices = config.prices.patterns.map((source) => new RegExp(source, "giu"));

// ------------------------------------------------------------------ the allowlist

const used = new Set();
function allowedHit(term, context, where) {
  const text = normalize(context).toLowerCase();
  const hit = allow.words.find(
    (entry) =>
      normalize(entry.term).toLowerCase() === normalize(term).toLowerCase() &&
      (entry.where ?? "both") !== (where === "copy" ? "html" : "copy") &&
      text.includes(normalize(entry.context).toLowerCase()),
  );
  if (hit) used.add(hit);
  return Boolean(hit);
}

// ------------------------------------------------------------------ the copy

/** Lines that only show with the offer on, by the component that hides them. */
function offerOnly(path, parents) {
  const parent = parents.at(-1);
  // A question or row with `offer: true` (HomePage.tsx and ProductKit.tsx filter on item.offer).
  if (parents.some((p) => p && !Array.isArray(p) && p.offer === true)) return true;
  // meta.<page>.description, when the page has a descriptionNoOffer (document.tsx).
  if (path.endsWith(".description") && parent && "descriptionNoOffer" in parent) return true;
  // hero.facts, when there is a factsNoOffer (HomePage.tsx Hero).
  if (/\.facts\[\d+\]$/.test(path) && parents.at(-2) && "factsNoOffer" in parents.at(-2)) return true;
  // The rest are listed, each with the line of code that hides it.
  return allow.offerOnly.some((entry) => matchPath(path, entry.path) && used.add(entry));
}

const { copy } = await loadSite();
const offerStrings = new Set();
const shownStrings = new Set();
let copyStrings = 0;

for (const locale of ["en", "ar"]) {
  walk(copy[locale], (path, value, parents) => {
    copyStrings += 1;
    const where = `copy.${locale}.${path}`;
    const text = normalize(value);
    for (const t of terms) {
      for (const m of text.matchAll(t.re)) {
        if (!allowedHit(t.term, text, "copy")) problems.push(`${where}: "${m[0].trim()}" (${t.why}) in "${value.slice(0, 140)}"`);
      }
    }
    const gated = offerOnly(path, parents);
    (gated ? offerStrings : shownStrings).add(text.trim());
    if (!gated) {
      for (const re of prices) {
        for (const m of text.matchAll(re)) {
          if (!allowedHit(m[0], text, "copy")) {
            problems.push(`${where}: a price ("${m[0]}") in a line that shows with the offer off. Prices belong only in lines behind NEXT_PUBLIC_ALYR_OFFER=on (honesty.md section 6): "${value.slice(0, 140)}"`);
          }
        }
      }
    }
  });
}
// A line hidden by the switch that is also used where it always shows is not offer-only.
for (const text of shownStrings) offerStrings.delete(text);

// ------------------------------------------------------------------ the built site

function files(dir, keep) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, keep) : keep(path) ? [path] : [];
  });
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** The words a reader or a machine gets from a page: text, the attributes that carry words,
 * and the strings inside inline scripts (Next's page data), with HTML and JSON escapes undone. */
function pageText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:img|meta|a|button|input|svg|div|span|section|figure|nav|link|area)\b[^>]*>/gi, (tag) => {
      const words = [...tag.matchAll(/\s(?:alt|title|aria-label|aria-description|content|placeholder)="([^"]*)"/gi)].map((m) => m[1]);
      return ` ${words.join(" ")} `;
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code) => {
      if (code[0] === "#") return String.fromCodePoint(code[1] === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ");
}

let builtFiles = 0;
let offer = "off";
if (!onlyCopy) {
  let version = "";
  try {
    version = readFileSync(join(out, "version.txt"), "utf8");
  } catch {
    console.error("banned-words: apps/web/out-site/version.txt is missing. Build the site first: pnpm site:build (or run with --copy).");
    process.exit(1);
  }
  offer = /^offer on$/m.test(version) ? "on" : "off";
  const window = (text, index, length) => text.slice(Math.max(0, index - 120), index + length + 120).replace(/\s+/g, " ");

  for (const file of files(out, (p) => /\.(html|md|txt|xml)$/.test(p) && !relative(out, p).startsWith("_next"))) {
    builtFiles += 1;
    const name = relative(out, file).replaceAll("\\", "/");
    const raw = readFileSync(file, "utf8");
    const text = normalize(file.endsWith(".html") ? pageText(raw) : raw);
    for (const t of terms) {
      for (const m of text.matchAll(t.re)) {
        const around = window(text, m.index, m[0].length);
        if (!allowedHit(t.term, around, "html")) problems.push(`out-site/${name}: "${m[0].trim()}" (${t.why}) in "…${around.trim()}…"`);
      }
    }
    if (offer === "off") checkPrices(`out-site/${name}`, text, window);
  }
  if (offer === "off") {
    for (const file of files(join(out, "_next/static"), (p) => p.endsWith(".js"))) {
      builtFiles += 1;
      checkPrices(`out-site/${relative(out, file).replaceAll("\\", "/")}`, normalize(pageText(readFileSync(file, "utf8"))), window);
    }
  }
}

function checkPrices(name, text, window) {
  for (const re of prices) {
    for (const m of text.matchAll(re)) {
      const around = window(text, m.index, m[0].length);
      if (!allowedHit(m[0], around, "html")) problems.push(`${name}: a price ("${m[0]}") in a build made with the offer off: "…${around.trim()}…"`);
    }
  }
  for (const line of offerStrings) {
    // Short offer-only labels ("ALYR Agent and ALYR Shelf") also occur inside ordinary lines; whole sentences do not.
    if (line.length >= 40 && text.includes(line)) problems.push(`${name}: a line that should only show with the offer on is in a build made with the offer off: "${line.slice(0, 140)}"`);
  }
}

// ------------------------------------------------------------------ the result

for (const entry of [...allow.words, ...allow.offerOnly]) {
  if (!used.has(entry)) problems.push(`allow/banned.json: the entry for "${entry.term ?? entry.path}" no longer matches anything; remove it`);
}

if (problems.length) {
  console.error(`banned-words: ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "Reword the line in copy.ts (honesty.md says what to say instead). Only a use that is true belongs in scripts/site/allow/banned.json, with its reason.",
  );
  process.exit(1);
}
console.log(
  `banned-words: clean. ${terms.length} words, ${prices.length} price shapes; ${copyStrings} copy strings` +
    (onlyCopy ? "." : `, ${builtFiles} built files (offer ${offer}).`),
);
