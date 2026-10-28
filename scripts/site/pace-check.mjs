// The pace check: every timed piece on the public site takes its time from the pace tokens
// (design/tokens.json, motion.pace), so the founder tunes them all with one value, `pace`.
// Plain Node 22, no packages. Run by `pnpm site:check`.
//
//   node scripts/site/pace-check.mjs
//
// It fails on a literal duration (anything but 0s) in
//   - an `animation`, `transition` or their `-duration` / `-delay` in apps/web/app/_site/*.css;
//   - a GSAP `duration:` or `stagger:`, a `setTimeout(…, n)`, or a time divided by a number
//     (`/ 1600`) in apps/web/app/_site/*.ts(x).
// Use `--play-*`, `--play-stagger`, `--read-word`, `--dwell-*` in CSS and `PLAY` from
// `_site/pace.ts` in scripts; an interaction (hover, press, menu) uses `--dur-*`. Exceptions are
// in scripts/site/allow/pace.json, each with its reason.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "./lib/copy.mjs";

const SITE = join(REPO, "apps", "web", "app", "_site");
const allow = JSON.parse(readFileSync(join(import.meta.dirname, "allow", "pace.json"), "utf8")).allow;
const used = new Set();
const problems = [];

const TIME = /(?<![\w.-])(?:\d+\.?\d*|\.\d+)m?s\b/g;
const isZero = (literal) => parseFloat(literal) === 0;
const blank = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

function allowed(file, line) {
  const hit = allow.find((entry) => entry.file === file && line.includes(entry.match));
  if (hit) used.add(hit);
  return Boolean(hit);
}

for (const name of readdirSync(SITE).sort()) {
  const file = `apps/web/app/_site/${name}`;
  const path = join(SITE, name);
  if (name.endsWith(".css")) {
    blank(readFileSync(path, "utf8")).split("\n").forEach((line, i) => {
      for (const [, property, value] of line.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)) {
        if (!/^(animation|transition)(-duration|-delay)?$/.test(property)) continue;
        const literals = (value.match(TIME) ?? []).filter((t) => !isZero(t));
        if (literals.length && !allowed(file, line)) {
          problems.push(`${file}:${i + 1}: ${literals.join(", ")} in ${property}: use a pace token (--play-*, --play-stagger)\n    ${line.trim().slice(0, 150)}`);
        }
      }
    });
  } else if (/\.tsx?$/.test(name)) {
    readFileSync(path, "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "");
      const hits = [
        ...code.matchAll(/\b(duration|stagger)\s*:\s*\d/g),
        ...code.matchAll(/setTimeout\([^;]*,\s*[1-9][\d_]*\s*\)/g),
        ...code.matchAll(/\)\s*\/\s*[1-9]\d{2,}\b/g),
      ];
      if (hits.length && !allowed(file, line)) {
        problems.push(`${file}:${i + 1}: a literal time in a script: use PLAY from _site/pace.ts\n    ${line.trim().slice(0, 150)}`);
      }
    });
  }
}

const stale = allow.filter((entry) => !used.has(entry));
for (const entry of stale) problems.push(`scripts/site/allow/pace.json: "${entry.match}" in ${entry.file} no longer matches anything: remove it`);

if (problems.length) {
  console.error(`pace check: ${problems.length} problem(s)\n\n${problems.join("\n")}\n\nTimed pieces take their time from design/tokens.json, motion.pace (alyr-design/motion.md).`);
  process.exit(1);
}
console.log(`pace check: every timed piece on the site follows --pace (${allow.length} reviewed exceptions)`);
