// The :has() check. Plain Node 22, no packages. Run by `pnpm site:check`, after the build.
//
//   node scripts/site/has-check.mjs
//
// 1. No `:not()` inside a `:has()` argument in the public site's CSS.
// 2. The marks the server puts in place of the old `:root:has(...)` and `main:has(...)` rules
//    agree with the page in every built file (apps/web/out-site): the header carries
//    `data-hero` exactly when the page has the opening's own button (`data-hero-cta`), and
//    <main> carries `data-product` exactly when the page has the product bar (`.pbar`). Shell
//    sets both from the page's key, so a page that gains or loses either part is caught here.
//
// Why 1: with a :not() inside :has(), Chromium cannot tell from an inserted element that it does
// not match, so every DOM insertion anywhere on the page re-styles every element the rest of the
// selector could reach. Measured on 28 Oct 2026 (headless Edge, CPU slowed 4x): the Agent
// figure's four `:has(.af-more:not([open]))` rules made one insertion on `/` cost about 180 ms
// and re-style 2,991 of 3,513 elements; written as
// `:where(:has(.af-more)):not(:has(.af-more[open]))`, 0.5 ms. A :not() around a :has() is fine;
// plain classes, attributes and `>` inside are fine.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "./lib/copy.mjs";

const APP = join(REPO, "apps", "web", "app");
const DIRS = ["_site", "(site)", "(site-ar)"];
const blank = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(path));
    else if (entry.name.endsWith(".css")) out.push(path);
  }
  return out;
}

/** Every `:has(...)` argument in a piece of CSS, with the offset where it starts. */
function hasArguments(css) {
  const found = [];
  for (let at = css.indexOf(":has("); at !== -1; at = css.indexOf(":has(", at + 1)) {
    let depth = 0;
    let end = at + 4;
    for (; end < css.length; end++) {
      if (css[end] === "(") depth++;
      else if (css[end] === ")" && --depth === 0) break;
    }
    found.push({ at, argument: css.slice(at + 5, end) });
  }
  return found;
}

const problems = [];
let count = 0;
for (const dir of DIRS) {
  for (const path of cssFiles(join(APP, dir)).sort()) {
    const file = path.slice(REPO.length + 1).replace(/\\/g, "/");
    const css = blank(readFileSync(path, "utf8"));
    for (const { at, argument } of hasArguments(css)) {
      count++;
      if (!argument.includes(":not(")) continue;
      const line = css.slice(0, at).split("\n").length;
      const text = css.split("\n")[line - 1].trim();
      problems.push(`${file}:${line}: :not() inside :has(${argument})\n    ${text.slice(0, 150)}`);
    }
  }
}

const OUT = join(REPO, "apps", "web", "out-site");
const pages = [];
if (!existsSync(OUT)) problems.push("apps/web/out-site is not built: run pnpm site:build first");
else for (const dir of [OUT, join(OUT, "ar")]) {
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".html")).sort()) pages.push(join(dir, name));
}
const opening = (html, tag) => html.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0] ?? "";
const carries = (tag, name) => new RegExp(`\\s${name}(?=[\\s=>])`).test(tag);
for (const path of pages) {
  const file = path.slice(REPO.length + 1).replace(/\\/g, "/");
  const html = readFileSync(path, "utf8");
  const header = opening(html, "header");
  const main = opening(html, "main");
  if (!header || !main) continue;
  const heroButton = /\sdata-hero-cta(?=[\s=>])/.test(html);
  if (carries(header, "data-hero") !== heroButton) {
    problems.push(`${file}: the header ${heroButton ? "lacks" : "carries"} data-hero, but the page ${heroButton ? "has" : "does not have"} the opening's button (data-hero-cta): fix \`hero\` in Shell.tsx`);
  }
  const productBar = /\sclass="pbar"/.test(html);
  if (carries(main, "data-product") !== productBar) {
    problems.push(`${file}: <main> ${productBar ? "lacks" : "carries"} data-product, but the page ${productBar ? "has" : "does not have"} the product bar (.pbar): fix \`product\` in Shell.tsx`);
  }
}

if (problems.length) {
  console.error(`:has() check: ${problems.length} problem(s)\n\n${problems.join("\n")}\n\n` +
    "Write \":where(:has(.x)):not(:has(.x[open]))\" instead of \":has(.x:not([open]))\" (the same specificity): a :not() inside :has() makes every DOM insertion re-style the page (scripts/site/has-check.mjs says why).");
  process.exit(1);
}
console.log(`:has() check: ${count} :has() arguments on the site, none with a :not() inside; the header's and <main>'s marks agree with ${pages.length} built pages`);
