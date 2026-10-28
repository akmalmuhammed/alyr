// The :has() check: no `:not()` inside a `:has()` argument in the public site's CSS.
// Plain Node 22, no packages. Run by `pnpm site:check`.
//
//   node scripts/site/has-check.mjs
//
// Why: with a :not() inside :has(), Chromium cannot tell from an inserted element that it does
// not match, so every DOM insertion anywhere on the page re-styles every element the rest of the
// selector could reach. Measured on 28 Oct 2026 (headless Edge, CPU slowed 4x): the Agent
// figure's four `:has(.af-more:not([open]))` rules made one insertion on `/` cost about 180 ms
// and re-style 2,991 of 3,513 elements; written as
// `:where(:has(.af-more)):not(:has(.af-more[open]))`, 0.5 ms. A :not() around a :has() is fine;
// plain classes, attributes and `>` inside are fine.

import { readFileSync, readdirSync } from "node:fs";
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

if (problems.length) {
  console.error(`:has() check: ${problems.length} problem(s)\n\n${problems.join("\n")}\n\n` +
    "Write \":where(:has(.x)):not(:has(.x[open]))\" instead of \":has(.x:not([open]))\" (the same specificity): a :not() inside :has() makes every DOM insertion re-style the page (scripts/site/has-check.mjs says why).");
  process.exit(1);
}
console.log(`:has() check: ${count} :has() arguments on the site, none with a :not() inside`);
