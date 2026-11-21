// The product UI check: the redesign's scales, button and words, held by a ratchet. Plain Node 22,
// no packages. Run by CI (the `web` job) and scripts/check.sh; needs no browser.
//
//   node scripts/ui-check.mjs               check (exit 1 on a problem)
//   node scripts/ui-check.mjs --verbose     also list every off-scale value with file:line
//   node scripts/ui-check.mjs --update      write the ratchet file with today's (lower) counts
//   node scripts/ui-check.mjs --root <dir>  check another checkout (the tests use a fixture)
//
// What it checks, over apps/web/app/(product)/** and apps/web/app/_ui/**
// (test files are skipped, and so is everything under _site, _agent and (site*)):
//
//   RATCHET (per file, counted in design/ui-ratchet.json; never allowed to go up, and a file
//   that goes down must say so with --update, so the number cannot creep back):
//     font-size   a literal font size (px or rem) that is not a step of the product's type
//                 scale (font.size.ui in design/tokens.json: 11 12 13 14 15 16 18 20 24 28 32 36 56)
//     radius      a literal border radius that is not on the radius scale (0, 2, 4, 6, 8, 10, 12)
//     space       a literal padding or gap that is not on the UI space scale (--ui-space-*: 2 4 6 8
//                 10 12 14 16 20 24 32) or the site's --space-N steps; 0 is always fine
//     btn         a CSS rule for a `.btn` or `.xx-btn` class: the product has four button systems
//                 and the redesign replaces them with one, in _ui. A file that is not in the
//                 ratchet file may define none
//     <phrase>    a banned phrase in code or copy (see PHRASES): "Ask ALYR", "free replies", the AI
//                 words in honesty.md, "Powered by", "At risk", "coming soon", "beta", "SKU", a money
//                 amount ending in .00, and an em dash used as an empty value
//   A value written as var(--…) is never counted. A new file starts at zero.
//
//   HARD (no ratchet; any hit fails):
//     In _ui/**: a hex colour, rgb()/hsl() colour, or px/rem length literal (media and container
//     queries, whose breakpoints cannot be tokens, are exempt), any banned phrase, and any em dash
//     outside a comment. _ui reads tokens only.
//
// The ratchet file, design/ui-ratchet.json, is `{ "files": { "<path from the repo root>": { "<rule>": <count> } } }`,
// one file per line and sorted, so two branches lowering different files merge cleanly. The
// rules are the names above. To lower a count: fix the values, run `node scripts/ui-check.mjs --update`,
// commit the file. `--update` refuses to raise a count or add a file with a hit; a deliberate
// exception for a file that is moving house is made by editing the JSON by hand, in review.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const rootArg = args.indexOf("--root");
const root = rootArg >= 0 ? resolve(args[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verbose = flag("--verbose");
const update = flag("--update");
const RATCHET = join(root, "design", "ui-ratchet.json");

// ── the scales, read from the tokens ──────────────────────

const tokens = JSON.parse(readFileSync(join(root, "design", "tokens.json"), "utf8"));
/** A token's value in px ("13px", ".5rem", "1.5rem"), or null when it is not a plain length. */
function px(value) {
  const hit = /^(-?\d*\.?\d+)(px|rem)$/.exec(String(value).trim());
  return hit ? Number(hit[1]) * (hit[2] === "rem" ? 16 : 1) : null;
}
function scale(group, skip = []) {
  const out = new Set();
  for (const [key, token] of Object.entries(group)) {
    if (key.startsWith("$") || skip.includes(key) || !token || typeof token !== "object" || !("$value" in token)) continue;
    const value = px(token.$value);
    if (value !== null) out.add(value);
  }
  return out;
}
const SCALE = {
  "font-size": scale(tokens.font.size.ui),
  // Not the site's pill or the drawn phone: those are not the product's shapes.
  radius: new Set([0, ...scale(tokens.radius, ["pill", "phone", "panel", "round"])]),
  space: new Set([0, ...scale(tokens.space.ui), ...scale(tokens.space)]),
};

// ── what to read ──────────────────────────────────────────

const APP = join(root, "apps", "web", "app");
const SKIP = new Set(["node_modules", ".next", "out-site"]);
function walk(dir, test, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".next")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, test, out);
    else if (test(name)) out.push(path);
  }
  return out;
}
const rel = (path) => relative(root, path).replace(/\\/g, "/");
const isTest = (name) => /\.test\.[a-z]+$/.test(name);
const scope = [join(APP, "(product)"), join(APP, "_ui")];
const cssFiles = scope.flatMap((dir) => walk(dir, (n) => n.endsWith(".css")));
const codeFiles = scope.flatMap((dir) => walk(dir, (n) => /\.(ts|tsx)$/.test(n) && !isTest(n)));
const inUi = (file) => rel(file).startsWith("apps/web/app/_ui/");

// ── reading text ──────────────────────────────────────────

const blank = (m) => m.replace(/[^\n]/g, " ");
const stripCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, blank);
/** Code with comments blanked (line numbers kept). A `//` inside a string such as "https://" survives: it is only a comment after whitespace or at the line's start. */
const stripCodeComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[\s;{}(,])\/\/.*$/gm, (m, lead) => lead + blank(m.slice(lead.length)));
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
/** `var(--x, fallback)` with nesting one level deep: its contents are not a literal of this file. */
const stripVar = (value) => value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, " ");
/** The px or rem lengths written in a value, as px, skipping zero. */
function lengths(value) {
  const out = [];
  for (const m of stripVar(value).matchAll(/(?<![\w.#-])(-?\d*\.?\d+)(px|rem)\b/g)) {
    const n = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
    if (n !== 0) out.push({ n, text: m[0] });
  }
  return out;
}

// ── the counts ────────────────────────────────────────────

/** found[file][rule] = [{ line, text }] */
const found = new Map();
function hit(file, rule, line, text) {
  const byRule = found.get(file) ?? new Map();
  found.set(file, byRule);
  const list = byRule.get(rule) ?? [];
  byRule.set(rule, list);
  list.push({ line, text: text.trim().slice(0, 140) });
}
const hard = []; // problems that are never a count

const PROPERTY_RULE = (property) => {
  if (property === "font-size") return "font-size";
  if (/^(border(-[a-z]+){0,2}-radius)$/.test(property)) return "radius";
  if (/^(padding(-[a-z]+)*|gap|row-gap|column-gap|grid-gap)$/.test(property)) return "space";
  return null;
};

for (const path of cssFiles) {
  const file = rel(path);
  const text = stripCssComments(readFileSync(path, "utf8"));
  const ui = inUi(path);
  // Declarations: property: value up to a ; or }. A selector's `a:hover {` never reaches one.
  for (const m of text.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const [whole, property, value] = m;
    const line = lineOf(text, m.index);
    if (property.startsWith("--") === false) {
      const rule = PROPERTY_RULE(property);
      if (rule) {
        for (const { n, text: literal } of lengths(value)) {
          if (!SCALE[rule].has(n)) hit(file, rule, line, `${property}: ${literal}`);
        }
      }
    }
    if (ui) {
      for (const { text: literal } of lengths(value)) hard.push(`${file}:${line}: ${literal} in ${property}: _ui reads tokens only (a length is a token: --ui-space-*, --ui-size-*, --radius-*, --rule-hairline)`);
      if (/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgb|rgba|hsl|hsla)\(/.test(stripVar(value))) {
        hard.push(`${file}:${line}: a colour literal in ${property}: _ui reads tokens only`);
      }
    }
    void whole;
  }
  // Button systems: a rule whose selector names `.btn` or `.xx-btn`.
  if (!ui) {
    for (const m of text.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)) {
      if (/\.(?:[a-z0-9]+-)*btn\b/.test(m[2])) hit(file, "btn", lineOf(text, m.index + m[1].length), m[2].replace(/\s+/g, " "));
    }
  }
}

// Banned phrases, in code and copy.
const PHRASES = [
  ["ask-alyr", /\bAsk ALYR\b/i],
  ["free-replies", /\bfree repl(?:y|ies)\b/i],
  // "AI" in capitals only (a lower-case "ai" is part of other words); the rest in any case.
  ["ai-word", /\bAI\b/],
  ["ai-word", /\b(?:artificial intelligence|smart|intelligent|intelligence|learns|understands|thinks|predicts|forecasts?|forecast(?:ed|ing)|knows|notices|I noticed|assistant|agentic|copilot|health score|top performer|magic)\b/i],
  // honesty.md's Arabic words, whole words only: Arabic has no \b, a letter on either side means a longer word.
  ["ai-word-ar", /(?<![؀-ۿ])(?:ذكي|ذكاء|يتعلم|يفهم|يتوقع|خوارزمية|مساعد)(?![؀-ۿ])/],
  ["powered", /\bpowered by\b/i],
  ["at-risk", /\bat risk\b/i],
  ["coming-soon", /\bcoming soon\b/i],
  ["beta", /\bbeta\b/i],
  ["sku", /\bSKUs?\b/],
  ["money-00", /\b\d[\d,]*\.00\b/],
  ["em-dash-placeholder", /(["'`>])\s*—\s*(["'`<])/],
];
for (const path of codeFiles) {
  const file = rel(path);
  const text = stripCodeComments(readFileSync(path, "utf8"));
  const ui = inUi(path);
  text.split("\n").forEach((line, i) => {
    const seen = new Set();
    for (const [rule, pattern] of PHRASES) {
      if (seen.has(rule) || !pattern.test(line)) continue;
      seen.add(rule);
      if (ui) hard.push(`${file}:${i + 1}: banned wording (${rule}) in _ui: ${line.trim().slice(0, 120)}`);
      else hit(file, rule, i + 1, line);
    }
    if (!ui) return;
    if (/—/.test(line)) hard.push(`${file}:${i + 1}: an em dash in _ui: use a full stop, a colon, a comma or None`);
    // As design-check.mjs reads a colour in code: a hex right after a quote, colon, bracket, comma or equals sign.
    if (/["'`(,:=]\s*#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/.test(line)) hard.push(`${file}:${i + 1}: a hex colour in _ui: use a token`);
    if (/\b(?:rgb|rgba|hsl|hsla)\(/.test(line)) hard.push(`${file}:${i + 1}: a colour function in _ui: use a token`);
    // A length inside a string or template (an inline style): a token, not a number.
    const quoted = [...line.matchAll(/(["'`])(?:(?!\1).)*\1/g)].map((m) => m[0]).join(" ");
    for (const { text: literal } of lengths(quoted)) hard.push(`${file}:${i + 1}: ${literal} in _ui: use a token (var(--ui-space-*), var(--ui-size-*), var(--radius-*))`);
  });
}

// ── the ratchet file ──────────────────────────────────────

const current = {};
for (const [file, byRule] of [...found].sort(([a], [b]) => (a < b ? -1 : 1))) {
  current[file] = Object.fromEntries([...byRule].sort(([a], [b]) => (a < b ? -1 : 1)).map(([rule, list]) => [rule, list.length]));
}
let allowed = {};
try {
  allowed = JSON.parse(readFileSync(RATCHET, "utf8")).files ?? {};
} catch {
  if (!update) hard.push("design/ui-ratchet.json is missing or unreadable: run `node scripts/ui-check.mjs --update` once and commit it");
}

const totals = {};
for (const counts of Object.values(current)) for (const [rule, n] of Object.entries(counts)) totals[rule] = (totals[rule] ?? 0) + n;

const raised = [];
const lowered = [];
for (const file of new Set([...Object.keys(current), ...Object.keys(allowed)])) {
  const now = current[file] ?? {};
  const was = allowed[file] ?? {};
  for (const rule of new Set([...Object.keys(now), ...Object.keys(was)])) {
    const a = now[rule] ?? 0;
    const b = was[rule] ?? 0;
    if (a > b) raised.push({ file, rule, now: a, was: b });
    else if (a < b) lowered.push({ file, rule, now: a, was: b });
  }
}

if (update) {
  // The first write (no file yet) records today's counts; after that it only lowers.
  if (raised.length && existsSync(RATCHET)) {
    console.error(`ui check: --update only lowers counts; ${raised.length} went up:\n${raised.map(describe).join("\n")}`);
    process.exit(1);
  }
  const lines = Object.entries(current).map(([file, counts]) => `    ${JSON.stringify(file)}: ${JSON.stringify(counts).replace(/,/g, ", ").replace(/:/g, ": ").replace(/^\{/, "{ ").replace(/\}$/, " }")}`);
  const text = `{\n  "$description": "The product UI ratchet (scripts/ui-check.mjs): per file, how many off-scale font sizes, radii and gaps, button-system rules and banned phrases the code still has. Counts only go down. Fix values, then run node scripts/ui-check.mjs --update.",\n  "files": {\n${lines.join(",\n")}\n  }\n}\n`;
  writeFileSync(RATCHET, text);
  console.log(`ui check: wrote design/ui-ratchet.json (${Object.keys(current).length} files, ${lowered.length} counts lowered)`);
  process.exit(0);
}

function describe({ file, rule, now, was }) {
  const examples = (found.get(file)?.get(rule) ?? []).slice(0, 4).map((e) => `      line ${e.line}: ${e.text}`).join("\n");
  return `  ${file}: ${rule} ${was} -> ${now}${examples ? `\n${examples}` : ""}`;
}

const problems = [];
if (hard.length) problems.push(`${hard.length} hard problem(s):\n${[...new Set(hard)].map((h) => `  ${h}`).join("\n")}`);
if (raised.length) {
  problems.push(
    `${raised.length} count(s) went up (an off-scale value, a new button rule or a banned phrase; use a token, the one button system in _ui, and the words in honesty.md):\n${raised.map(describe).join("\n")}`,
  );
}
if (lowered.length) {
  problems.push(
    `${lowered.length} count(s) went down: good. Run \`node scripts/ui-check.mjs --update\` and commit design/ui-ratchet.json so they cannot creep back:\n${lowered.map(({ file, rule, now, was }) => `  ${file}: ${rule} ${was} -> ${now}`).join("\n")}`,
  );
}

if (verbose) {
  for (const [file, byRule] of found) for (const [rule, list] of byRule) for (const e of list) console.log(`${file}:${e.line}: ${rule}: ${e.text}`);
}
if (problems.length) {
  console.error(`ui check failed\n\n${problems.join("\n\n")}`);
  process.exit(1);
}
const summary = Object.entries(totals).map(([rule, n]) => `${rule} ${n}`).join(", ");
console.log(`ui check: ${cssFiles.length} stylesheets and ${codeFiles.length} code files; ratchet holds (${summary || "nothing counted"})`);
