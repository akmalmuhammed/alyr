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
// - the rest are in scripts/site/banned-words.json, with the word "rule" (founder, 25 Oct 2026);
// - the content audit's mechanical style patterns too (its "style" block), in the copy only.
// A use that is true (a fictional customer asking "when are you coming?") is listed in
// scripts/site/allow/banned.json with its reason; an entry that matches nothing fails.
//
// Prices are allowed only behind NEXT_PUBLIC_ALYR_OFFER=on:
// - in the copy, a price may sit only in a line the offer switch hides;
// - in a build made with the offer off, no price may appear, and no line the switch hides.
// The one exception is the pricing page (ALY-301), which shows its prices whatever the switch
// says: allow/banned.json "pricePages" names its copy (pricing.**), its built pages and its
// markdown copies, and excuses nothing else.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadSite, matchPath, REPO, walk, WEB } from "./lib/copy.mjs";

const onlyCopy = process.argv.includes("--copy");
const out = join(WEB, "out-site");
const honestyFile = join(REPO, ".claude/skills/alyr-design/honesty.md");
const config = JSON.parse(readFileSync(join(import.meta.dirname, "banned-words.json"), "utf8"));
const allow = JSON.parse(readFileSync(join(import.meta.dirname, "allow/banned.json"), "utf8"));
const problems = [];
const pricePages = allow.pricePages;
const pricePagesUsed = { copy: false, files: new Set(), sections: new Set() };

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
    // The pricing page's own words may hold prices (allow/banned.json "pricePages").
    const priced = pricePages.copy.some((pattern) => matchPath(path, pattern));
    if (priced) pricePagesUsed.copy = true;
    if (!gated && !priced) {
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

// ------------------------------------------------------------------ the style

// The content audit's patterns that a regular expression can find (docs/content-audit/01-audit.md
// section 4; the rules themselves are in alyr-site-page, "Words that read as written by a
// machine"). Copy only, by path: a label is a string whose last key is one of
// `style.labelKeys` ("items" only inside a product page's inside.groups); questions, answers,
// sample data and drawings of screens are skipped (`style.skip`). A line kept on purpose is
// listed in allow/banned.json under "style" with its path, the pattern's name and its reason.
const style = config.style;
const stylePatterns = style.patterns.map((p) => ({ ...p, regex: new RegExp(p.re, `u${p.flags ?? ""}`) }));
const lastKey = (path) => path.replace(/\[\d+\]/g, "").split(".").at(-1);
const isLabel = (path) => {
  const key = lastKey(path);
  if (!style.labelKeys.includes(key)) return false;
  return key !== "items" || /\.inside\.groups\[\d+\]\.items\[\d+\]$/.test(path);
};
const isBody = (path) => ["body", "lead", "statement"].includes(lastKey(path));
const styleSkipped = (path) => style.skip.some((pattern) => matchPath(path, pattern));
const styleUsed = new Set();
function styleAllowed(path, name) {
  const hit = (allow.style ?? []).find((entry) => entry.pattern === name && matchPath(path, entry.path));
  if (hit) styleUsed.add(hit);
  return Boolean(hit);
}
// Lines the founder kept on purpose (the hero's slogan, the footer, ALYR Agent's heading;
// 02-decisions.md): the style patterns pass over them, and the check fails if one changes, so
// a change to a kept line is made knowingly and its entry updated with it.
const kept = allow.kept ?? [];
const keptValue = (path) => {
  const [locale, ...rest] = path.split(".");
  const value = rest.join(".").split(/\.|\[(\d+)\]/).filter(Boolean).reduce((node, key) => node?.[key], copy[locale]);
  return Array.isArray(value) ? value.join(" ") : value;
};
for (const entry of kept) {
  if (keptValue(entry.path) !== entry.text) problems.push(`allow/banned.json: the kept line ${entry.path} is no longer "${entry.text}" (${entry.reason}). If it changed on purpose, update or remove its entry`);
}
const isKept = (path) => kept.some((entry) => path === entry.path || path.startsWith(`${entry.path}[`));
let styleStrings = 0;
for (const locale of ["en", "ar"]) {
  walk(copy[locale], (path, value) => {
    if (styleSkipped(path) || isKept(`${locale}.${path}`)) return;
    styleStrings += 1;
    const text = normalize(value);
    for (const p of stylePatterns) {
      if (p.scope === "label" && !isLabel(path)) continue;
      if (p.scope === "body" && !isBody(path)) continue;
      if (p.except?.includes(lastKey(path))) continue;
      const m = text.match(p.regex);
      if (m && !styleAllowed(`${locale}.${path}`, p.name)) {
        problems.push(`copy.${locale}.${path}: ${p.name} ("${m[0].trim().slice(0, 60)}"): ${p.why}. In "${value.slice(0, 140)}"`);
      }
    }
  });
}
for (const entry of allow.style ?? []) {
  if (!styleUsed.has(entry)) problems.push(`allow/banned.json: the style entry for ${entry.path} (${entry.pattern}) no longer matches anything; remove it`);
}

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
    // llms-full.txt holds every markdown copy; the price check leaves out the pricing page's own
    // two, and reads the rest. (The word check reads all of it.)
    let priceText = text;
    if (name === "llms-full.txt") {
      const blocks = text.split(/\n---\n\n(?=<!-- )/);
      priceText = blocks
        .filter((block) => {
          const head = block.split("\n", 1)[0];
          const address = head.match(/^<!-- (\S+) -->$/)?.[1];
          const section = address && pricePages.sections.find((s) => new URL(address).pathname === s);
          if (section) pricePagesUsed.sections.add(section);
          return !section;
        })
        .join("\n---\n\n");
    }
    for (const t of terms) {
      for (const m of text.matchAll(t.re)) {
        const around = window(text, m.index, m[0].length);
        if (!allowedHit(t.term, around, "html")) problems.push(`out-site/${name}: "${m[0].trim()}" (${t.why}) in "…${around.trim()}…"`);
      }
    }
    if (offer === "off") {
      if (pricePages.files.includes(name)) {
        pricePagesUsed.files.add(name);
        checkPrices(`out-site/${name}`, text, window, { shapes: false });
      } else {
        checkPrices(`out-site/${name}`, priceText, window);
      }
    }
  }
  if (offer === "off") {
    // Only the scripts a public page loads: `.next/static` also holds the product's own chunks
    // (workspace, back office), which never reach a visitor of the site.
    const loaded = new Set();
    for (const page of files(out, (p) => p.endsWith(".html") && !relative(out, p).startsWith("_next"))) {
      for (const m of readFileSync(page, "utf8").matchAll(/\/_next\/static\/[^"'\s)\\]+\.js/g)) loaded.add(m[0].slice(1));
    }
    for (const file of files(join(out, "_next/static"), (p) => p.endsWith(".js") && loaded.has(relative(out, p).replaceAll("\\", "/")))) {
      builtFiles += 1;
      checkPrices(`out-site/${relative(out, file).replaceAll("\\", "/")}`, normalize(pageText(readFileSync(file, "utf8"))), window);
    }
  }
}

function checkPrices(name, text, window, { shapes = true } = {}) {
  for (const re of shapes ? prices : []) {
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

// The pricing page's allowance must be in use, or it is stale (copy without prices, a build
// without those files).
if (!pricePagesUsed.copy) problems.push("allow/banned.json: pricePages.copy matches no copy; remove it");
if (!onlyCopy && offer === "off") {
  for (const file of pricePages.files) if (!pricePagesUsed.files.has(file)) problems.push(`allow/banned.json: pricePages.files lists ${file}, which the build does not have`);
  for (const section of pricePages.sections) if (!pricePagesUsed.sections.has(section)) problems.push(`allow/banned.json: pricePages.sections lists ${section}, which llms-full.txt does not hold`);
}

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
  `banned-words: clean. ${terms.length} words, ${prices.length} price shapes, ${stylePatterns.length} style patterns over ${styleStrings} labels and lines; ${copyStrings} copy strings` +
    (onlyCopy ? "." : `, ${builtFiles} built files (offer ${offer}).`),
);
