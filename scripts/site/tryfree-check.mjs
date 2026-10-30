// The "Try it free" check. Plain Node 22, no packages. Run by `pnpm site:check`, after the
// build.
//
//   node scripts/site/tryfree-check.mjs
//
// The button is a build-time switch (`NEXT_PUBLIC_ALYR_TRY_FREE=on`, apps/web/app/_site/site.ts
// `TRY_FREE_LIVE`), off unless set. The build writes which way it went into out-site/version.txt
// ("try-free on" or "try-free off"), and this reads it back, so one script holds both promises.
//
// OFF: merging the button must change nothing a visitor or a crawler sees. No built page, no
// markdown copy and no llms.txt carries the sign-up address, either language's "Try it free"
// words, the markers on the button or the closing call's pair.
//
// ON:
//   1. Every page's header says "Try it free" and links to the sign-up address, and the phone's
//      bar does too.
//   2. Every link to the sign-up is the address and nothing more: no query, no fragment, no
//      marker (/start reads none and the funnel records none, so a marker would mean nothing).
//   3. A page with an opening button (`data-hero-cta`: the homepage, the sector pages, the
//      product pages) opens with "Try it free" first and "Book a check-up" beside it as the
//      outlined twin, and its closing call has the same pair and the line that says what it
//      costs. "Book a check-up" keeps its one name: the same words as the closing call's
//      `action`, in the page's language.
//   4. A page without one (a guide, the company page, the privacy page) keeps its own closing
//      call, and only the header and the bar carry the button.
//
// Words are not judged here: banned-words.mjs reads the same built files and the copy.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadSite, WEB } from "./lib/copy.mjs";

const OUT = join(WEB, "out-site");
const ADDRESS = "https://app.alyr.qa/start";

if (!existsSync(join(OUT, "version.txt"))) {
  console.error("tryfree-check: apps/web/out-site is not built (pnpm site:build).");
  process.exit(1);
}
const stamp = readFileSync(join(OUT, "version.txt"), "utf8");
const mode = /^try-free (on|off)$/m.exec(stamp)?.[1];
if (!mode) {
  console.error('tryfree-check: version.txt has no "try-free on|off" line; scripts/site/stamp.mjs writes it.');
  process.exit(1);
}

const { site, copy } = await loadSite();
const words = { en: copy.en.tryFree, ar: copy.ar.tryFree };

function files(dir, keep) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "_next") return [];
    if (statSync(path).isDirectory()) return files(path, keep);
    return keep(name) ? [path] : [];
  });
}
const rel = (path) => relative(OUT, path).replaceAll("\\", "/");

const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

if (mode === "off") {
  // What a visitor or a crawler reads: the pages, their markdown copies and llms.txt.
  const readable = files(OUT, (name) => /\.(html|md|txt)$/.test(name) && name !== "version.txt");
  const traces = [
    ADDRESS, "app.alyr.qa", words.en.action, words.ar.action, words.en.note, words.ar.note, words.en.bar, words.ar.bar,
    words.en.final.title, words.ar.final.title,
    'data-cta="try-free', "btn-band", "cta-buttons", "try-note", "sp-main",
  ];
  for (const path of readable) {
    const text = readFileSync(path, "utf8");
    for (const trace of traces) if (text.includes(trace)) fail(rel(path), `the switch is off, and the page carries "${trace}"`);
  }
  console.log(`tryfree-check: switch off, ${readable.length} readable files carry no trace of the button`);
} else {
  const pages = files(OUT, (name) => name.endsWith(".html") && name !== "404.html").sort();
  const links = (html, test) =>
    [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter(test);
  const href = (tag) => /\bhref="([^"]*)"/.exec(tag)?.[1] ?? "";
  const cta = (tag) => /\bdata-cta="([^"]*)"/.exec(tag)?.[1] ?? "";
  let hero = 0;
  for (const path of pages) {
    const name = rel(path);
    const html = readFileSync(path, "utf8");
    const locale = name.startsWith("ar/") || name === "ar.html" ? "ar" : "en";
    const w = words[locale];
    const action = copy[locale].home.final.action;

    // 2. every link to the sign-up is the address, nothing more
    for (const tag of links(html, (t) => href(t).includes("app.alyr.qa"))) {
      if (href(tag) !== ADDRESS) fail(name, `a link to the sign-up with more than the address: ${href(tag)}`);
    }

    // 1. the header's button and the bar's
    const header = /<header\b[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";
    const headerTry = links(header, (t) => cta(t) === "try-free-header");
    if (headerTry.length !== 1 || href(headerTry[0]) !== ADDRESS) fail(name, "the header has no single Try it free button to the sign-up");
    if (!new RegExp(`data-cta="try-free-header"[^>]*>\\s*<span>${w.action}</span>`).test(header)) fail(name, `the header's button does not say "${w.action}"`);
    const bar = /<div class="bar"[\s\S]*?<\/div>/.exec(html)?.[0] ?? "";
    const barTry = links(bar, (t) => cta(t) === "try-free-bar");
    if (barTry.length !== 1 || href(barTry[0]) !== ADDRESS) fail(name, "the phone's bar has no single Try it free button to the sign-up");
    if (!bar.includes(`aria-label="${w.bar}"`)) fail(name, `the phone's bar is not named "${w.bar}"`);

    // 3 and 4. the opening and the closing call
    const opening = /data-hero-cta[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1];
    const closing = /<div class="cta-actions[^"]*"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
    if (opening === undefined) {
      if (/data-cta="try-free"/.test(html)) fail(name, "a page without an opening button has a main Try it free button");
      if (!/<h2 class="cta-title"/.test(html)) fail(name, "no closing call");
      continue;
    }
    hero += 1;
    const tryAt = opening.search(/data-cta="try-free"/);
    const lineAt = opening.search(/btn btn-line/);
    if (tryAt === -1) fail(name, "the opening has no Try it free button");
    else if (!opening.includes(ADDRESS)) fail(name, "the opening's Try it free button does not go to the sign-up");
    if (lineAt === -1) fail(name, `the opening has no outlined "${action}"`);
    else if (tryAt !== -1 && tryAt > lineAt) fail(name, "the opening puts the outlined twin before Try it free");
    if (opening.includes("btn-volt") && (opening.match(/btn-volt/g) ?? []).length !== 1) fail(name, "the opening has more than one Volt button");
    const pair = /<div class="cta-buttons">([\s\S]*?)<\/div>/.exec(closing)?.[1] ?? "";
    if (!pair.includes('data-cta="try-free"') || !pair.includes("btn btn-line")) fail(name, "the closing call is not Try it free with the outlined twin");
    if ((pair.match(/btn-volt/g) ?? []).length !== 1) fail(name, "the closing call does not have exactly one Volt button");
    if (!pair.includes(`<span>${action}</span>`)) fail(name, `the closing call's twin does not say "${action}"`);
    if (!/class="try-note is-band"/.test(closing)) fail(name, "the closing call lacks the line that says what Try it free costs");
    if (!html.includes(`<h2 class="cta-title" id="contact-title">${copy[locale].tryFree.final.title}</h2>`)) fail(name, "the closing call's headline is not the pair's own");
    if (!opening.includes(`<span>${w.action}</span>`)) fail(name, `the opening's button does not say "${w.action}"`);
  }
  if (hero < 1 + site.SECTORS.length * 2 + site.PRODUCTS.length * 2) fail("out-site", `only ${hero} pages have an opening with the pair; expected the homepage, every sector page and every product page in both languages`);
  console.log(`tryfree-check: switch on, ${pages.length} pages: header and bar on every page, the pair on ${hero} pages with an opening button`);
}

if (problems.length) {
  console.error(`\ntryfree-check: ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 60)) console.error(`  - ${p}`);
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
  process.exit(1);
}
console.log("tryfree-check: ok");
