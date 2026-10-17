// The design drift check: ALYR's colours and fonts come from design/tokens.json and nowhere
// else. Plain Node 22, no packages. Run by CI and scripts/check.sh.
//
//   node scripts/design-check.mjs
//
// It fails when
//   1. a generated token file is out of date (scripts/tokens-build.mjs --check);
//   2. a hex colour appears in site, product or renderer code outside the generated files:
//      apps/web/app/**/*.{css,ts,tsx} and apps/api/src/**/*.py;
//   3. a font is named outside the tokens: a CSS `font-family` that is not var(…) or inherit, a
//      custom property that lists a font, or a string in TypeScript or Python that is one of
//      the families in design/tokens.json.
// Exceptions are in design/allow.json, each with its reason. Keep that list short.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allow = JSON.parse(readFileSync(join(root, "design", "allow.json"), "utf8"));
const tokens = JSON.parse(readFileSync(join(root, "design", "tokens.json"), "utf8"));
const problems = [];

// 1. generated files
try {
  execFileSync(process.execPath, [join(root, "scripts", "tokens-build.mjs"), "--check"], { stdio: "pipe" });
} catch (error) {
  problems.push(`generated tokens out of date:\n    ${String(error.stderr || error.message).trim().replace(/\n/g, "\n    ")}`);
}

// What to scan
const GENERATED = new Set(["apps/web/app/_tokens/tokens.css", "apps/web/app/_tokens/tokens.ts", "apps/api/src/alyr/brand.py"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "out-site", "__pycache__", ".venv"]);
function files(dir, extensions) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".next")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, extensions));
    else if (extensions.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}
const scan = [
  ...files(join(root, "apps", "web", "app"), [".css", ".ts", ".tsx"]),
  ...files(join(root, "apps", "api", "src"), [".py"]),
].map((p) => relative(root, p).replace(/\\/g, "/")).filter((p) => !GENERATED.has(p));

// Font family names the tokens know (generic keywords are not names).
const GENERIC = new Set(["-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif", "serif", "monospace", "ui-monospace", "ui-sans-serif", "cursive", "fantasy"]);
const FAMILIES = new Set();
for (const stack of Object.values(tokens.font.family)) {
  if (stack && Array.isArray(stack.$value)) for (const name of stack.$value) if (!GENERIC.has(name)) FAMILIES.add(name);
}
const familyNames = [...FAMILIES].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const QUOTED_FAMILY = new RegExp(`["'\`](${familyNames})["'\`]`);
const GENERIC_IN_VALUE = /(^|[\s,])(sans-serif|serif|monospace|ui-monospace|system-ui)(\s*[,;)]|\s*$)/;

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
// In code, a colour sits right after a quote, a colon, a bracket, a comma or an equals sign;
// "Order #1042" in a sentence does not.
const CODE_HEX = /(?:["'`(,:=]\s*)(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))\b/g;

function allowed(file, line, property) {
  return allow.some((entry) =>
    (entry.property && property && entry.property === property) ||
    (entry.file && entry.file === file && (!entry.match || line.includes(entry.match))));
}
function report(file, number, line, what) {
  problems.push(`${file}:${number}: ${what}\n    ${line.trim().slice(0, 160)}`);
}

/** Blank out comments but keep line numbers. */
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

for (const file of scan) {
  const text = readFileSync(join(root, file), "utf8");
  if (file.endsWith(".css")) {
    const lines = stripBlockComments(text).split("\n");
    lines.forEach((line, i) => {
      // every declaration on the line: property: value
      for (const match of line.matchAll(/([a-zA-Z0-9-]+)\s*:\s*([^;{}]+)/g)) {
        const [, property, value] = match;
        if (allowed(file, line, property)) continue;
        if (HEX.test(value)) report(file, i + 1, line, `hex colour in ${property}: use a token (design/tokens.json)`);
        HEX.lastIndex = 0;
        if (property === "font-family" && !/^\s*(var\(--[a-z0-9-]+\)|inherit|initial|unset)\s*(!important)?\s*$/.test(value)) {
          report(file, i + 1, line, "font-family must be a token, var(--…)");
        }
        if (property.startsWith("--") && (QUOTED_FAMILY.test(value) || GENERIC_IN_VALUE.test(value))) {
          report(file, i + 1, line, `custom property ${property} lists a font: use a token`);
        }
      }
    });
    continue;
  }
  // TypeScript and Python
  const python = file.endsWith(".py");
  const lines = (python ? text : stripBlockComments(text)).split("\n");
  lines.forEach((line, i) => {
    const code = python ? line.replace(/^\s*#.*$/, "") : line.replace(/^\s*\/\/.*$/, "");
    if (allowed(file, line)) return;
    for (const match of code.matchAll(CODE_HEX)) report(file, i + 1, line, `hex colour ${match[1]}: use a token (design/tokens.json)`);
    if (QUOTED_FAMILY.test(code)) report(file, i + 1, line, "a font named in code: use a token");
    if (/font-family:(?!\s*(?:["']?\{|var\(|inherit))/.test(code)) report(file, i + 1, line, "font-family must be a token");
  });
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`design check: ${unique.length} problem(s)\n\n${unique.join("\n")}\n\nColours and fonts come from design/tokens.json (design/README.md). A justified exception goes in design/allow.json with its reason.`);
  process.exit(1);
}
console.log(`design check: ${scan.length} files clean; ${allow.length} allowed exception(s)`);
