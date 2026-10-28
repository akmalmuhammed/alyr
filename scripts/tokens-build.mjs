// Build ALYR's design tokens: design/tokens.json -> CSS, TypeScript and Python.
// Plain Node 22, no packages. design/README.md explains the format.
//
//   node scripts/tokens-build.mjs           write the generated files
//   node scripts/tokens-build.mjs --check   fail if any generated file is out of date
//
// Outputs (each headed "generated, do not edit"):
//   apps/web/app/_tokens/tokens.css   custom properties: :root light, then the two dark blocks
//   apps/web/app/_tokens/tokens.ts    values for TypeScript (next/og cards, SVG fills, theme-color)
//   apps/api/src/alyr/brand.py        values for Python (the report card, emails)
//
// It also refuses a token file that breaks its own rules: every reference must resolve, and
// a colour outside the `color` primitives must be a reference, so each literal colour is
// named exactly once.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "design", "tokens.json");
const OUT = {
  css: join(root, "apps", "web", "app", "_tokens", "tokens.css"),
  ts: join(root, "apps", "web", "app", "_tokens", "tokens.ts"),
  py: join(root, "apps", "api", "src", "alyr", "brand.py"),
};
const EXT = "qa.alyr";
const GENERIC = new Set(["-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif", "serif", "monospace", "ui-monospace", "ui-sans-serif", "ui-serif", "cursive", "fantasy"]);

const source = JSON.parse(readFileSync(SOURCE, "utf8"));
const errors = [];

// ── read the tree ─────────────────────────────────────────
/** Every token, in file order: { path, type, value, dark, rtl, css (name or null), description } */
const tokens = [];
const byPath = new Map();

function walk(node, path, inherited) {
  const ext = node.$extensions?.[EXT] ?? {};
  const here = {
    type: node.$type ?? inherited.type,
    prefix: "cssPrefix" in ext ? ext.cssPrefix : inherited.prefix,
  };
  if ("$value" in node) {
    const key = path[path.length - 1];
    let css = null;
    if (ext.css === false) css = null;
    else if (typeof ext.css === "string") css = ext.css;
    else if (here.prefix !== undefined && here.prefix !== null) css = `${here.prefix}${key}`;
    const token = {
      path: path.join("."), key, type: here.type, value: node.$value,
      dark: ext.dark, rtl: ext.rtl, nextFont: ext.nextFont, paced: ext.paced === true, css, description: node.$description,
    };
    tokens.push(token);
    byPath.set(token.path, token);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") || typeof child !== "object" || child === null) continue;
    walk(child, [...path, key], here);
  }
}
walk(source, [], { type: undefined, prefix: undefined });

// ── resolve references ────────────────────────────────────
const REF = /\{([^}]+)\}/g;
const isRef = (value) => typeof value === "string" && /^\{[^}]+\}$/.test(value);

/** The raw value of a token in a mode, following references, with the mode falling back to light. */
function raw(token, mode, seen = new Set()) {
  if (seen.has(token.path)) {
    errors.push(`circular reference at ${token.path}`);
    return "";
  }
  seen.add(token.path);
  const value = mode === "dark" && token.dark !== undefined ? token.dark : token.value;
  return deref(value, mode, seen, token.path);
}
function deref(value, mode, seen, from) {
  if (isRef(value)) {
    const target = byPath.get(value.slice(1, -1));
    if (!target) {
      errors.push(`${from}: ${value} does not exist`);
      return "";
    }
    return raw(target, mode, new Set(seen));
  }
  if (typeof value === "string" && /\{[^}]+\}/.test(value)) {
    return value.replace(REF, (_, path) => {
      const target = byPath.get(path);
      if (!target) {
        errors.push(`${from}: {${path}} does not exist`);
        return "";
      }
      return String(raw(target, mode, new Set(seen)));
    });
  }
  return value;
}

// ── the token file's own rules ────────────────────────────
const literalSeen = new Map();
for (const token of tokens) {
  if (token.type !== "color") continue;
  const primitive = token.path.startsWith("color.");
  for (const [mode, value] of [["light", token.value], ["dark", token.dark]]) {
    if (value === undefined) continue;
    if (!primitive && !isRef(value)) {
      errors.push(`${token.path} (${mode}): a colour outside the primitives must be a reference, not ${value}`);
    }
    if (primitive) {
      const key = String(value).toLowerCase().replace(/\s+/g, "");
      if (literalSeen.has(key)) errors.push(`${token.path}: ${value} is already named ${literalSeen.get(key)}`);
      else literalSeen.set(key, token.path);
    }
  }
}
const cssNames = new Map();
for (const token of tokens) {
  if (!token.css) continue;
  if (cssNames.has(token.css)) errors.push(`--${token.css} is emitted by both ${cssNames.get(token.css)} and ${token.path}`);
  cssNames.set(token.css, token.path);
}

// ── the pace ──────────────────────────────────────────────
// A token marked `paced` is multiplied by motion.pace.pace: in CSS as calc(… * var(--pace)), so
// the one custom property tunes them all at run time; in TypeScript and Python already
// multiplied, for timers and GSAP.
const PACE = byPath.get("motion.pace.pace");
for (const token of tokens) {
  if (!token.paced) continue;
  if (!PACE) errors.push(`${token.path} is paced, but motion.pace.pace does not exist`);
  if (token.type !== "duration") errors.push(`${token.path}: only a duration can be paced`);
}
/** "432ms" or "1.2s" times the pace, as milliseconds. */
function pacedData(token) {
  const value = String(raw(token, "light"));
  const number = parseFloat(value) * (value.endsWith("ms") ? 1 : 1000) * Number(raw(PACE, "light"));
  return `${Math.round(number * 100) / 100}ms`;
}

// ── formatting ────────────────────────────────────────────
const NEXT_FONT = new Map();
for (const token of tokens) {
  if (token.type === "fontFamily" && token.nextFont) NEXT_FONT.set(token.value[0], token.nextFont);
}
const quote = (name) => (GENERIC.has(name) ? name : `"${name}"`);
function cssValue(token, mode) {
  if (token.paced && PACE) {
    const base = isRef(token.value) ? `var(--${byPath.get(token.value.slice(1, -1))?.css})` : String(token.value);
    return `calc(${base} * var(--${PACE.css}))`;
  }
  const value = raw(token, mode);
  switch (token.type) {
    case "fontFamily":
      return value.map((name) => (NEXT_FONT.has(name) ? `var(${NEXT_FONT.get(name)})` : quote(name))).join(", ");
    case "cubicBezier":
      return `cubic-bezier(${value.join(", ")})`;
    default:
      return String(value);
  }
}
/** JSON-ish value for TypeScript and Python: arrays stay arrays, numbers stay numbers. */
function dataValue(token, mode) {
  if (token.paced && PACE) return pacedData(token);
  const value = raw(token, mode);
  if (token.type === "cubicBezier") return `cubic-bezier(${value.join(", ")})`;
  return value;
}

// ── CSS ───────────────────────────────────────────────────
const HEADER_CSS = "/* Generated from design/tokens.json by scripts/tokens-build.mjs. Do not edit: change the\n   JSON and run `node scripts/tokens-build.mjs`. design/README.md says how to use these. */\n";
function buildCss() {
  const emitted = tokens.filter((t) => t.css);
  const light = emitted.map((t) => `  --${t.css}: ${cssValue(t, "light")};`);
  const dark = emitted
    .filter((t) => t.dark !== undefined && cssValue(t, "dark") !== cssValue(t, "light"))
    .map((t) => `--${t.css}: ${cssValue(t, "dark")};`);
  const rtl = emitted.filter((t) => t.rtl !== undefined).map((t) => `--${t.css}: ${t.rtl};`);
  const block = (indent, lines) => lines.map((line) => `${indent}${line}`).join("\n");
  return [
    HEADER_CSS,
    ":root {",
    "  color-scheme: light;",
    ...light,
    "}",
    rtl.length ? `[dir="rtl"] {\n${block("  ", rtl)}\n}` : "",
    "",
    "/* Dark, twice and identical: for a dark device with no choice made, and for a dark choice",
    "   (`data-theme` on <html>, set before the first paint from localStorage `alyr-theme`).",
    "   `data-theme=\"light\"` keeps a page light on a dark device. */",
    "@media (prefers-color-scheme: dark) {",
    "  :root:not([data-theme=\"light\"]) {",
    "    color-scheme: dark;",
    block("    ", dark),
    "  }",
    "}",
    ":root[data-theme=\"dark\"] {",
    "  color-scheme: dark;",
    block("  ", dark),
    "}",
    "",
  ].filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n");
}

// ── TypeScript and Python data ────────────────────────────
/** The token tree with values in one mode. Only tokens with a dark value appear in dark. */
function tree(mode, groups) {
  const out = {};
  for (const token of tokens) {
    const [group] = token.path.split(".");
    if (!groups.includes(group)) continue;
    if (mode === "dark" && token.dark === undefined) continue;
    const keys = token.path.split(".");
    let node = out;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    node[keys[keys.length - 1]] = dataValue(token, mode);
  }
  return out;
}
const ALL = Object.keys(source).filter((k) => !k.startsWith("$"));

function buildTs() {
  const light = tree("light", ALL);
  const dark = tree("dark", ALL);
  const lines = [
    "// Generated from design/tokens.json by scripts/tokens-build.mjs. Do not edit: change the",
    "// JSON and run `node scripts/tokens-build.mjs`. design/README.md says how to use these.",
    "// In CSS, use the custom properties in tokens.css instead; these are for code that cannot",
    "// read CSS (images drawn with next/og, SVG fills, theme-color).",
    "",
  ];
  for (const group of ALL) {
    lines.push(`export const ${camel(group)} = ${JSON.stringify(light[group], null, 2)} as const;`, "");
  }
  lines.push("/** Every token that changes in dark mode, with its dark value. */");
  lines.push(`export const dark = ${JSON.stringify(dark, null, 2)} as const;`, "");
  return lines.join("\n");
}
const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function py(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) return `(${value.map((v) => py(v)).join(", ")}${value.length === 1 ? "," : ""})`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => `${pad}    ${JSON.stringify(k)}: ${py(v, indent + 4)},`);
    return `{\n${entries.join("\n")}\n${pad}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
/** A font stack as one CSS string with no spaces after commas, for inline HTML (emails). */
const compactStack = (stack) => stack.map((name) => (GENERIC.has(name) ? name : name.includes(" ") ? `'${name}'` : name)).join(",");

function buildPy() {
  const light = tree("light", ALL);
  const dark = tree("dark", ALL);
  const families = light.font.family;
  const sections = [
    ['COLOR', light.color, "The primitives. Prefer the semantic names (LIGHT, DARK) or a component's own."],
    ['LIGHT', light.semantic, "The semantic colours in the light theme."],
    ['DARK', { ...light.semantic, ...dark.semantic }, "The semantic colours in the dark theme."],
    ['CARD', light.component.card, "The Sunday report card's two themes (modules/agent/card.py)."],
    ['EMAIL', light.component.email, "The emails' colours (core/mail.py, modules/report.py)."],
    ['FONT', families, "Font stacks, the face first."],
    ['CSS_FONT', Object.fromEntries(Object.entries(families).map(([k, v]) => [k, compactStack(v)])), "Font stacks as inline CSS for emails."],
    ['FONT_FILE', light.font.file, "The font files images are rendered with."],
    ['SIZE', light.font.size, "Type sizes."],
  ];
  const lines = [
    '"""ALYR design tokens for Python: the report card and the emails.',
    "",
    "Generated from design/tokens.json by scripts/tokens-build.mjs. Do not edit: change the JSON",
    "and run `node scripts/tokens-build.mjs`. design/README.md says how to use these.",
    '"""',
    "",
  ];
  for (const [name, value, doc] of sections) {
    lines.push(`# ${doc}`, `${name} = ${py(value)}`, "");
  }
  return lines.join("\n");
}

// ── write or check ────────────────────────────────────────
const outputs = { [OUT.css]: buildCss(), [OUT.ts]: buildTs(), [OUT.py]: buildPy() };
if (errors.length) {
  console.error(`design/tokens.json has ${errors.length} problem(s):\n  ${[...new Set(errors)].join("\n  ")}`);
  process.exit(1);
}
const check = process.argv.includes("--check");
let stale = 0;
for (const [file, text] of Object.entries(outputs)) {
  const name = file.slice(root.length + 1).replace(/\\/g, "/");
  let current = null;
  try {
    current = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  } catch {}
  if (check) {
    if (current !== text) {
      console.error(`out of date: ${name}`);
      stale++;
    }
  } else if (current !== text) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    console.log(`wrote ${name}`);
  }
}
if (check && stale) {
  console.error("Run `node scripts/tokens-build.mjs` and commit the result.");
  process.exit(1);
}
if (check) console.log(`tokens: ${tokens.length} tokens, generated files up to date`);
