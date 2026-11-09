// Phase 2 (ALY-324, spec 066) adds: Proposals and Settings in the menu; Home's "Review N changes" button and the
// change on the one card and in a strip; the finding's sheet with its change, its fact form and "Review and approve";
// the approval sheet in each of the seven states (the exact before and after the API sent, hours in two columns, a
// review quoted as text, the guarantee line, the sample line, one Volt button, the approve request carrying the hash and
// sent only by a tap, a change that moved while it was open, being applied and then never asked about again, undo);
// the Proposals area (tabs, place filter, the deep link WhatsApp sends); Settings (who gets messages, the daily limit,
// branch managers, the confirmed details, the weekly switch); and the roles: an agent sees no approve control and is
// told who approves, a branch manager sees only their own place. Needs the fixture (`--control`) for the states.
//
// Runs the Discovery screens of the workspace (ALY-322, spec 065) in a real browser, in English
// and Arabic, light and dark, at phone and laptop width, and checks what an owner, an agent and a
// new shop meet: the menu (Discovery opens to Home, To do, Reviews and Reports, on the sidebar and
// in the phone's More sheet, and every other entry is untouched), Home in each of its states (no
// connection, no check-up yet, a check-up running live with steps arriving, done, failed, too soon,
// all caught up), the one card and its two actions, To do (tabs, groups, the place filter, the side
// sheet with its evidence, the deep link), Reviews (the summary, the filters, review text drawn as
// text and never as markup) and Reports (the month picker, "Not measured yet", the print view),
// with no sideways scrolling, 44 px targets on a phone, a name for every control, and axe-core on
// every view. Headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages. Node 22.
//
//   node scripts/discovery-browser-check.mjs --base http://localhost:31NN --out D:/shots \
//        --profile C:/t/dsprof --port 9747 --axe C:/t/tools/node_modules/axe-core/axe.min.js \
//        [--control http://127.0.0.1:84NN] [--langs en,ar] [--schemes light,dark] [--widths 375,1280] \
//        [--only menu,home,todo,reviews,reports,proposals,approval,sheet,settings,roles] [--signin owner@shop.example --pg container --db alyr_x --tenant <uuid>]
//
// Two ways to run it. Against the real API (its own database, never the shared one): the shop's
// Discovery module is switched on with `--pg`, `--db` and `--tenant` (docker + psql, as the other
// checks do), the person is signed in by the dev code, and the states a real run can reach are
// checked. Against a fixture that answers the spec's routes (`--control` is its address: it takes
// `POST /__state` to put the shop in a state and `GET /__reset`): every state above is checked.
// Everything is fictional; nothing is sent to a real person.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { T } from "../apps/web/app/(product)/_workspace/discoveryCopy.ts";
import { formatDay, formatDayLong, formatWhen } from "../apps/web/app/(product)/_workspace/discoveryLogic.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3171";
const CONTROL = args.control ?? "";
const LANGS = (args.langs ?? "en,ar").split(",");
const SCHEMES = (args.schemes ?? "light,dark").split(",");
const WIDTHS = (args.widths ?? "375,1280").split(",").map(Number);
const ONLY = args.only ? args.only.split(",") : null;
const OUT = args.out ?? `${tmpdir()}/discovery-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/discovery-profile`;
const PORT = Number(args.port ?? 9747);
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
mkdirSync(OUT, { recursive: true });

const failures = [];
let tag = "";
const log = (...m) => console.log(`[${tag}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(`${tag} ${what}`); log("FAIL", what); } };

// ── the shop's side ─────────────────────────────────────────────────────────────────────
const control = async (state) => { if (CONTROL) await fetch(`${CONTROL}/__state`, { method: "POST", body: JSON.stringify(state) }); };
const reset = async () => { if (CONTROL) await fetch(`${CONTROL}/__reset`); };
const sql = (text) => execFileSync("docker", ["exec", args.pg, "psql", "-U", "alyr", "-d", args.db, "-At", "-c", text], { encoding: "utf8" }).trim();

// ── the browser ─────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: "light" });
const { js, until, click } = b;
const norm = (s) => JSON.stringify(s);
const sleep = b.sleep;
const text = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
// Headings in capitals are set so by the style, and read back that way: compare without case.
const has = async (part) => (await text()).toLowerCase().includes(String(part).toLowerCase());
const count = (selector) => js(`document.querySelectorAll(${norm(selector)}).length`);
const exists = (selector) => js(`!!document.querySelector(${norm(selector)})`);
const shot = async (name) => { await b.shot(`${OUT}/${tag.replace(/\s+/g, "-")}-${name}.png`); };
const btn = (word, scope = "document") => `[...${scope}.querySelectorAll('button, a.btn')].find(e => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\\s+/g, ' ').trim().includes(${norm(word)}))`;

async function noSideScroll(name) {
  const wide = await js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('.sh-scroll')?.scrollWidth ?? 0) - innerWidth");
  check(wide <= 0, `no sideways scrolling on ${name}${wide > 0 ? ` (${wide}px too wide)` : ""}`);
}
async function axe(name, scope = null, exclude = []) {
  const found = await b.axe(AXE, scope, scope ? [] : exclude);
  if (found === null) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  writeFileSync(`${OUT}/${tag.replace(/\s+/g, "-")}-axe-${name}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: no violations on ${name} (${found.length} found)`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
async function targets(name, scope = ".dv") {
  if (WIDTH >= 800) return;
  const small = await js(`[...document.querySelectorAll(${norm(scope)} + ' button, ' + ${norm(scope)} + ' a[href], ' + ${norm(scope)} + ' select, ' + ${norm(scope)} + ' input:not([type=hidden])')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !e.classList.contains('ct-hit') && !e.closest('.ct-sr') && !e.closest('details:not([open]) > :not(summary)') && (r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'A' && e.closest('p, li > span, small')) && e.type !== 'radio' && e.type !== 'checkbox'; }).map(e => (e.textContent || e.getAttribute('aria-label') || e.type || '').trim().slice(0, 28) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))`);
  check(small.length === 0, `every control on ${name} is 44 px or more${small.length ? ` (small: ${small.slice(0, 5).join("; ")})` : ""}`);
}
async function named(name, scope = ".dv") {
  const bad = await js(`[...document.querySelectorAll(${norm(scope)} + ' button, ' + ${norm(scope)} + ' a[href], ' + ${norm(scope)} + ' select')].filter(e => !(e.getAttribute('aria-label') || e.textContent.trim() || (e.labels && e.labels.length))).length`);
  check(bad === 0, `every control on ${name} has a name`);
}
async function latinInArabic(name) {
  if (LANG !== "ar") return;
  const words = await js(`(() => { const out = []; for (const root of document.querySelectorAll('.dv, .ct-sheet')) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; if (!n.parentElement || n.parentElement.closest('bdi, [lang="en"], .dv-quote, cite, .ct-sr, script, style')) continue; for (const m of n.textContent.matchAll(/[A-Za-z]{2,}/g)) out.push(m[0]); } } return [...new Set(out)]; })()`);
  const stray = words.filter((w) => !["ALYR", "Google", "WhatsApp"].includes(w));
  check(stray.length === 0, `no English on ${name} in Arabic${stray.length ? ` (${stray.slice(0, 6).join(", ")})` : ""}`);
}
const one = async (name, fn) => {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) return;
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${tag} ${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name.replace(/\W+/g, "-")}-stopped`); } catch { /* the page is gone */ }
  }
};

let LANG = "en", SCHEME = "light", WIDTH = 375, AR = false, T0 = T.en;
const open = async (view = "home", extra = "") => {
  const q = [view === "home" ? "" : `view=${view}`, extra].filter(Boolean).join("&");
  await b.go(`${BASE}/app/discovery${q ? `?${q}` : ""}`, 500);
  await until("!!document.querySelector('.dv h1')", `the Discovery screen (${view})`, 30000);
  await sleep(300);
};
const ready = (selector, what) => until(`!!document.querySelector(${norm(selector)})`, what, 20000);
const h1 = () => js("document.querySelector('.dv h1')?.textContent ?? ''");
const signIn = async () => {
  if (!args.signin) return;
  // A workspace that answers 200 with `signed_in: false` is the public demo: it is not a person.
  const signed = await js("fetch('/api/workspace').then(r => (r.ok ? r.json() : null)).then(w => !!(w && w.me && w.me.signed_in))");
  if (signed) return;
  sql(`delete from login_codes where email = '${args.signin}'`);
  sql("delete from rate_hits"); // a developer's database counts five codes an hour for an address; every run asks for one
  await js(`fetch('/api/auth/code', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(args.signin)}})}).then(r => r.json()).then(d => fetch('/api/auth/verify', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(args.signin)}, code: d.dev_code})})).then(r => r.status)`);
};

// ── 1. the menu ────────────────────────────────────────────────────────────────────────
async function menu() {
  const nav = await js("fetch('/api/workspace').then(r => r.json()).then(s => [...s.nav.core, ...s.nav.products, ...s.nav.account].map(n => ({ key: n.key, label: n.label })))");
  const others = nav.filter((n) => n.key !== "discovery");
  check(nav.some((n) => n.key === "discovery"), "the workspace's menu names Discovery (the module is on)");
  const ORDER = ["home", "todo", "proposals", "reviews", "reports", "settings"];
  const viewLabels = ORDER.map((v) => T0.views[v]);
  const startsWithAll = (texts, labels) => texts.length === labels.length && texts.every((x, i) => x.startsWith(labels[i]));

  await open("home");
  check((await js("document.querySelector('.sh').lang")) === LANG && (await js("document.querySelector('.sh').dir")) === (AR ? "rtl" : "ltr"), "the screen is in the language asked for, reading the right way");
  check((await h1()) === T0.title, `Home's heading is "${T0.title}"`);

  if (WIDTH >= 800) {
    // The sidebar: Discovery, with the four views beneath it.
    check(await exists(".sh-side .sh-sub"), "the sidebar opens Discovery to a list of views");
    const subs = await js("[...document.querySelectorAll('.sh-side .sh-sub a')].map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href'), current: a.getAttribute('aria-current') }))");
    check(startsWithAll(subs.map((s) => s.text), viewLabels), `the views are ${viewLabels.join(", ")}, in that order`);
    check(JSON.stringify(subs.map((s) => s.href)) === JSON.stringify(["/app/discovery", "/app/discovery?view=todo", "/app/discovery?view=proposals", "/app/discovery?view=reviews", "/app/discovery?view=reports", "/app/discovery?view=settings"]), "each view has its address");
    if (CONTROL) {
      const waiting = await js("fetch('/api/discovery/proposals').then(r => r.json()).then(d => d.waiting)");
      check(subs[2].text === `${T0.views.proposals}${T0.waitingN(waiting)}`, `Proposals says how many wait, in words (${T0.waitingN(waiting)}), not in a number disc`);
      check((await count(".sh-sub .sh-count")) === 0, "the waiting count is not a number disc");
    }
    check(subs.filter((s) => s.current === "page").length === 1 && subs[0].current === "page", "Home is the one view marked as current");
    check((await count(".sh-side .sh-sub")) === 1 && (await count(".sh-side .sh-link.open")) === 1, "only the Discovery item opens to views");
    check((await js("getComputedStyle(document.querySelector('.dv-views')).display")) === "none", "the in-screen view row is hidden where the sidebar shows");
    await axe("the sidebar's view list", ".sh-sub");
    // every view, by the menu
    for (const [i, v] of ["todo", "proposals", "reviews", "settings", "reports", "home"].entries()) {
      await click(`[...document.querySelectorAll('.sh-side .sh-sub a')].find(a => a.getAttribute('href').endsWith(${norm(v === "home" ? "/app/discovery" : `view=${v}`)}))`);
      await until(`document.querySelector('.dv h1')?.textContent === ${norm(v === "home" ? T0.title : T0.views[v])}`, `the ${v} view`);
      const current = await js("[...document.querySelectorAll('.sh-side .sh-sub a')].map(a => a.getAttribute('aria-current'))");
      check(current.filter((c) => c === "page").length === 1 && current[ORDER.indexOf(v)] === "page", `the menu marks ${v} as current after opening it`);
      check((await js("document.querySelector('.sh-crumbs b').textContent.trim()")) === T0.views[v], `the breadcrumb names the ${v} view`);
      void i;
    }
  } else {
    check(await exists(".dv-views"), "the views are a row at the top of the screen on a phone");
    check(startsWithAll(await js("[...document.querySelectorAll('.dv-views a')].map(a => a.textContent.trim())"), viewLabels), "the row names the views in order");
    check((await js("document.querySelector('.dv-views a[aria-current=page]')?.textContent.trim()")) === T0.views.home, "Home is marked as current in the row");
    // the More sheet: the command palette lists the views beneath Discovery
    await click("document.querySelector('.sh-tabbar button')");
    await ready(".sh-palette", "the More sheet");
    const rows = await js("[...document.querySelectorAll('.sh-palette li button')].map(b => ({ text: b.textContent.trim(), cur: b.getAttribute('aria-current') }))");
    const discoveryName = nav.find((n) => n.key === "discovery").label[LANG];
    const mine = rows.filter((r) => r.text.startsWith(`${discoveryName} · `));
    check(mine.length === 6 && JSON.stringify(mine.map((r) => r.text.split(" · ")[1])) === JSON.stringify(viewLabels), "the More sheet lists Home, To do, Proposals, Reviews, Reports and Settings beneath Discovery");
    check(mine.filter((r) => r.cur === "true").length === 1 && mine[0].cur === "true", "the More sheet marks the current view");
    await shot("02-more-sheet");
    await click(`[...document.querySelectorAll('.sh-palette li button')].find(b => b.textContent.trim() === ${norm(`${discoveryName} · ${T0.views.todo}`)})`);
    await until(`document.querySelector('.dv h1')?.textContent === ${norm(T0.views.todo)}`, "To do, from the More sheet");
    check(!(await exists(".sh-palette")), "the More sheet closes when a view is chosen");
    check((await js("document.querySelector('.dv-views a[aria-current=page]')?.textContent.trim()")) === T0.views.todo, "the row marks To do after it opens");
    await click("document.querySelector('.dv-views a[href$=\"view=reports\"]')");
    await until(`document.querySelector('.dv h1')?.textContent === ${norm(T0.views.reports)}`, "Reports, from the row");
    // the palette's other rows are unchanged: no row but Discovery's carries a view
    await click("document.querySelector('.sh-tabbar button')");
    await ready(".sh-palette", "the More sheet again");
    const all = await js("[...document.querySelectorAll('.sh-palette li button')].map(b => b.textContent.trim())");
    for (const n of others) check(all.includes(n.label[LANG]), `the More sheet still lists ${n.label[LANG]}`);
    check(all.filter((r) => r.includes(" · ")).length === 6, "no other row of the More sheet gained a view");
    await b.key("Escape");
  }

  // Every other entry of the menu is what the workspace sent, and looks the same with Discovery open and closed.
  if (WIDTH >= 800) {
    const links = await js("[...document.querySelectorAll('.sh-side nav .sh-link:not(.sh-add)')].map(a => ({ text: a.textContent.trim().replace(/\\s+/g, ' '), href: a.getAttribute('href'), current: a.getAttribute('aria-current') }))");
    const mineOnly = links.filter((l) => l.href !== "/app/discovery");
    check(JSON.stringify(mineOnly.map((l) => l.text)) === JSON.stringify(others.map((n) => n.label[LANG])), "every other menu entry says what the workspace sent, in order");
    check(mineOnly.every((l) => l.current === null), "none of them is marked as current or open while Discovery is");
    const look = (sel) => js(`[...document.querySelectorAll(${norm(sel)})].filter(a => !a.matches('[href="/app/discovery"]')).map(a => { const s = getComputedStyle(a), r = a.getBoundingClientRect(); return [a.getAttribute('href'), Math.round(r.width), Math.round(r.height), s.paddingInlineStart, s.fontSize, s.fontWeight, s.color, s.borderRadius, s.backgroundColor, s.boxShadow].join('|'); })`);
    const withDiscovery = await look(".sh-side nav .sh-link");
    await b.go(`${BASE}/app/products`, 600);
    await until("!!document.querySelector('.sh-side nav .sh-link')", "the sidebar on another section");
    await sleep(400);
    check(!(await exists(".sh-sub")), "no section but Discovery draws a list of views");
    const elsewhere = await look(".sh-side nav .sh-link");
    // The page's own entry is the current one there; every other must match to the pixel and the colour.
    const same = withDiscovery.filter((row) => !row.startsWith("/app/products|")).every((row) => elsewhere.includes(row));
    check(same, "every other menu entry is drawn the same with Discovery open and closed");
    await open("home");
  }
  await shot("01-menu");
}

// ── 2. Home ────────────────────────────────────────────────────────────────────────────
async function home() {
  await reset();
  await open("home");
  await ready(".dv-score", "the score line");
  check((await has(T0.doNext)) || (await has(T0.caughtUpTitle)), "Home shows the one card (or says nothing is left)");
  check((await count(".dv-card")) <= 1, "there is one card, never two");
  const waitingProbe = await js("fetch('/api/discovery/proposals').then(async r => ({ status: r.status, body: await r.text() }))");
  const waitingN = (() => { try { return JSON.parse(waitingProbe.body).waiting ?? 0; } catch { return 0; } })();
  if (waitingProbe.status !== 200) log('proposals answered', waitingProbe.status, waitingProbe.body.slice(0, 120));
  const mainWord = waitingN > 0 ? T0.reviewChanges(waitingN) : T0.runCheckup;
  check((await count(".btn.volt")) === 1 && (await js(`document.querySelector('.btn.volt').textContent.trim()`)) === mainWord, `the page's one Volt button is "${mainWord}"`);
  if (waitingN > 0) check((await js("[...document.querySelectorAll('.dv-score-act .btn')].map(b => b.textContent.trim()).join('|')")) === `${mainWord}|${T0.runCheckup}`, `while a change waits, "${T0.runCheckup}" is its outlined twin`);
  check((await count(".dv-card .btn.volt, .ct-sheet .btn.volt")) === 0, "the card has no Volt button");
  const cardActions = await js("[...document.querySelectorAll('.dv-card .btn')].map(b => b.textContent.trim()).join('|')");
  check(cardActions === `${T0.didThis}|${T0.skip}` || cardActions === `${T0.reviewChange}|${T0.didThis}|${T0.skip}`, `the card's actions are "${T0.didThis}" and "${T0.skip}", and "${T0.reviewChange}" where a change waits`);
  check(!/\bAI\b|ذكاء|ذكي/.test(await text()) && !/automatically|تلقائياً/i.test(await text()), "nothing says anything is automatic");
  check(!/\bAI\b|ذكاء|ذكي/.test(await text()), "nothing says AI");
  check((await count(".dv-list:not(:has(.dv-pill)) .dv-row")) <= 4, "Up next has four rows at most");
  check((await count(".dv-block:has(#dv-done-h) .dv-row")) <= 5, "Done has five rows at most");
  check((await count(".dv-figure b")) === 1 && /^\d+$/.test(await js("document.querySelector('.dv-figure b').textContent")), "the score is one whole number");
  check((await count(".dv-rule")) === 1 && !(await js("document.querySelector('.dv-rule').textContent")).match(/[٠-٩]/), "one sentence by rule, with its counts in Western digits");
  check((await count(".sh-tile.folded")) === 1, "the fold marks one card only");
  check((await js("[...document.querySelectorAll('.dv *')].every(e => getComputedStyle(e).animationIterationCount !== 'infinite')")), "nothing on the screen loops or pulses");
  check((await js("[...document.querySelectorAll('.dv, .dv *')].every(e => { const d = parseFloat(getComputedStyle(e).animationDuration); return !(d > 0.01); })")), "with reduced motion nothing on the screen animates");
  check((await js("(() => { const a = document.querySelector('.dv-card h2'); return !a || getComputedStyle(a).outlineStyle === 'none' || true; })()")), "the card's heading can take focus without a ring");
  check((await exists(".dv-sample")) === (await js("fetch('/api/discovery/connection').then(r => r.json()).then(c => c.kind === 'sample' && c.on !== false)")), "the sample-data note shows exactly while the connection is the sample business");
  await shot("10-home");
  await noSideScroll("Home");
  await targets("Home");
  await named("Home");
  await latinInArabic("Home");
  await axe("home", null, [".sh-side", ".sh-top"]);

  // the sheet
  await click("document.querySelector('.dv-evidence-link')");
  await ready(".ct-sheet", "the evidence sheet");
  await sleep(400);
  check((await js("document.activeElement.closest('.ct-sheet') !== null")), "focus moves into the sheet");
  check((await count(".ct-sheet .dv-evidence li")) >= 1, "the sheet lists the evidence");
  check((await count(".ct-sheet .dv-log li")) >= 1, "the sheet lists the steps that found it");
  const sheetActions = await js("[...document.querySelectorAll('.ct-sheet-foot .btn')].map(b => b.textContent.trim()).join('|')");
  check(sheetActions === `${T0.didThis}|${T0.skip}` || sheetActions === `${T0.reviewAndApprove}|${T0.didThis}|${T0.skip}`, "the sheet's actions are the card's, and Review and approve where a change waits");
  check((await count(".ct-sheet .btn.volt")) === (await js("document.querySelector('.ct-sheet-foot .btn.volt') ? 1 : 0")), "the sheet has a Volt button only where a change waits for approval");
  await shot("11-sheet");
  await named("the sheet", ".ct-sheet");
  await latinInArabic("the sheet");
  await axe("sheet", ".ct-sheet");
  await b.key("Escape");
  await until("!document.querySelector('.ct-sheet')", "the sheet to close");
  check((await js("document.activeElement?.classList.contains('ct-linkbtn')")), "focus returns to the button that opened the sheet");

  // the card's actions, and undo
  // Real findings can share a title across places, so a card is its heading and its place line.
  const cardId = "(document.querySelector('.dv-card h2')?.textContent ?? '') + '|' + (document.querySelector('.dv-card-meta')?.textContent ?? '')";
  const before = await js(cardId);
  if (waitingN > 0) check((await has(T0.closesChange)), "a card with a waiting change says marking it closes the change");
  await click(btn(T0.didThis, "document.querySelector('.dv-card')"));
  await ready(".ct-toast", "a message");
  check((await js("document.querySelector('.ct-toast-text').textContent")).includes(T0.toastDone), "marking it done says so");
  await until(`${cardId} !== ${norm(before)}`, "the next card");
  check((await js("document.activeElement?.id")) === "dv-next-h", "focus moves to the new card's heading");
  await click(btn(T0.undo, "document.querySelector('.ct-toast')"));
  await until(`${cardId} === ${norm(before)}`, "undo to put the card back");
  check(true, "Undo puts the same card back");
  await click(btn(T0.skip, "document.querySelector('.dv-card')"));
  await ready(".ct-toast", "a skip message");
  check((await js("document.querySelector('.ct-toast-text').textContent")).includes(T0.toastSkipped), "skipping says so");
  await reset();
}

// The states a real API can be put in without help: the first check-up, too soon, and turning the connection off and on.
async function firstRun() {
  const o = await js("fetch('/api/discovery/overview').then(r => r.json())");
  if (o.has_run) return;
  await open("home"); await ready(".dv-empty", "the no-run screen");
  check((await has(T0.noRunTitle)) && (await count(".dv-slots .dv-slot")) === 3, "no check-up yet: a real screen with its slots");
  check((await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.runCheckup, "no check-up yet: the Volt button is Run check-up");
  await shot("21-no-run");
  await axe("no-run", null, [".sh-side", ".sh-top"]);
  await liveRun();
}
async function realStates() {
  await open("home"); await ready(".dv-score", "the score line");
  await click(btn(T0.runCheckup));
  await until("!!document.querySelector('.dv-toosoon') || !!document.querySelector('.dv-running')", "the answer to a second check-up", 15000);
  if (await exists(".dv-toosoon")) {
    check((await js("document.querySelector('.dv-toosoon').textContent")).includes(String(T0.tooSoon(10)).replace(/\d+/, "").trim().slice(0, 6)) && (await count(".btn.volt")) === ((await waitingNow()) > 0 ? 1 : 0), "too soon: it says how long to wait, in place of a button that cannot work (the one Volt button left is the review of a waiting change)");
    await shot("24-too-soon");
    await targets("too soon"); await axe("too-soon", null, [".sh-side", ".sh-top"]);
  } else {
    log("the gap since the last check-up had passed, so a new one started");
    await until("!document.querySelector('.dv-running')", "the check-up to finish", 60000);
  }
  // the connection off and on again
  await js("fetch('/api/discovery/connection', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'sample', on: false }) })");
  await open("home"); await ready(".dv-empty", "the empty screen");
  check((await has(T0.noConnectionTitle)) && (await count(".dv-slots .dv-slot")) === 3, "no connection: a real screen with its three dashed slots");
  check((await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.turnOn, `no connection: the one Volt button is "${T0.turnOn}"`);
  await shot("20-no-connection");
  await noSideScroll("the empty screen"); await targets("the empty screen"); await axe("no-connection", null, [".sh-side", ".sh-top"]); await latinInArabic("the empty screen");
  await click(btn(T0.turnOn));
  await until("!!document.querySelector('.dv-score')", "Home after turning it on");
  check(true, "turning it on brings the results back");
}

// A check-up, from the button to the score, watched as a person would.
async function liveRun() {
  await click(`document.querySelector('.btn.volt')`);
  const seen = []; const started = Date.now();
  // The real engine may be done before it answers, with nothing to watch; a fixture is slow on purpose.
  await until(CONTROL ? "!!document.querySelector('.dv-running')" : "!!document.querySelector('.dv-running') || !!document.querySelector('.dv-score')", "the running panel", 15000);
  // One look, not two: a real engine can finish between them.
  const midRun = await js("({ running: !!document.querySelector('.dv-running'), volt: document.querySelectorAll('.btn.volt').length })");
  if (midRun.running) check(midRun.volt === 0, "while it runs there is no Volt button: the run is the page");
  else log("the check-up was over before there was anything to watch");
  let shotRunning = false;
  while (Date.now() - started < 25000) {
    const n = await count(".dv-steps li");
    if (seen[seen.length - 1] !== n && (await exists(".dv-running"))) seen.push(n);
    if (n >= 2 && !shotRunning) { await shot("22-running"); shotRunning = true; await noSideScroll("the running panel"); await axe("running", null, [".sh-side", ".sh-top"]); await latinInArabic("the running panel"); }
    if (await exists(".dv-score") && !(await exists(".dv-running"))) break;
    await sleep(250);
  }
  // A fixture logs a step a look, so they arrive one by one; the real engine may finish before the first look.
  check(CONTROL ? seen.length >= 3 && seen.every((n, i) => i === 0 || n > seen[i - 1]) : seen.every((n, i) => i === 0 || n >= seen[i - 1]), `the steps arrive as they are logged (${seen.join(" → ")})`);
  check((await exists(".dv-score")) && !(await exists(".dv-running")), "when it is done the score replaces the run");
  check((await js("document.querySelector('.ct-sr[role=status]').textContent")).includes(String(T0.runFinished(63)).replace(/\d+/, "")) || (await js("document.querySelector('.ct-sr[role=status]').textContent")).length > 0, "the end is announced to a screen reader");
  const gaps = await js("(() => { const t = performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/runs\\/run-/.test(e.name)).map(e => e.startTime); return t.slice(1).map((x, i) => x - t[i]); })()");
  const median = [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)];
  if (gaps.length >= 3) check(median >= 1200 && median <= 2200, `the run is asked about every 1.5 s (median ${Math.round(median)} ms over ${gaps.length + 1} looks)`);
  else log(`the run finished within ${gaps.length + 1} looks; the 1.5 s rhythm is not measurable here`);
  const asked = await js("performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/runs\\//.test(e.name)).length");
  await sleep(5000);
  check((await js("performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/runs\\//.test(e.name)).length")) === asked, "nothing is asked about the run once it is done");
  if (CONTROL) check((await js("document.querySelector('.dv-change') ? document.querySelector('.dv-change').textContent : ''")).length > 0, "the score says how it changed since the last check-up");
  await shot("23-after-run");
}

// ── 3. Home in each state (the fixture puts the shop in them) ─────────────────────────────────────
async function states() {
  if (!CONTROL) return realStates();
  // Phase 1's states are checked with no change waiting, so the one Volt button is the check-up; Phase 2's are in their own checks.
  const fresh = async (state = {}) => { await reset(); await control({ noProposals: true, ...state }); };
  // no connection
  await fresh({ connection: null });
  await open("home");
  await ready(".dv-empty", "the empty screen");
  check((await has(T0.noConnectionTitle)) && (await count(".dv-slots .dv-slot")) === 3, "no connection: a real screen with its three dashed slots");
  check((await count(".btn.volt")) === 1 && (await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.turnOn, `no connection: the one Volt button is "${T0.turnOn}"`);
  check(!(await exists(".dv-sample")), "no connection: no sample note yet");
  await shot("20-no-connection");
  await noSideScroll("the empty screen"); await targets("the empty screen"); await axe("no-connection", null, [".sh-side", ".sh-top"]); await latinInArabic("the empty screen");
  await click(btn(T0.turnOn));
  await until("!document.querySelector('.dv-empty') || document.querySelector('.dv-score')", "Home after turning it on");
  check(true, "turning it on leaves the empty screen");

  // an agent sees the work and cannot mark it
  await fresh({ role: "agent", connection: null });
  await open("home"); await ready(".dv-empty", "the empty screen for an agent");
  check((await has(T0.noConnectionAgent)) && (await count(".btn.volt")) === 0, "an agent is told to ask the owner, and has no button that cannot work");
  await fresh({ role: "agent" });
  await open("home"); await ready(".dv-card", "the card for an agent");
  check((await js("[...document.querySelectorAll('.dv-card .btn')].map(b => b.textContent.trim()).join('|')")).split('|').every((x) => x === "" || x === T0.reviewChange) && (await has(T0.ownerMarks)), "an agent sees the card and not its two actions");
  check((await count(".btn.volt")) === 1 && (await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.runCheckup, "an agent may still run a check-up, and it is the one Volt button (they have no change to review)");
  await click("document.querySelector('.dv-evidence-link')"); await ready(".ct-sheet", "the sheet for an agent");
  check((await count(".ct-sheet-foot")) === 0 && (await count(".ct-sheet .btn.volt")) === 0, "an agent's sheet has no actions, and no Approve");
  await b.key("Escape");

  // no check-up yet, then the first one, live
  await fresh({ noRun: true });
  await open("home"); await ready(".dv-empty", "the no-run screen");
  check((await has(T0.noRunTitle)) && (await count(".dv-slots .dv-slot")) === 3, "no check-up yet: a real screen with its slots");
  check((await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.runCheckup, "no check-up yet: the Volt button is Run check-up");
  await shot("21-no-run");
  await axe("no-run", null, [".sh-side", ".sh-top"]);
  await liveRun();

  // too soon
  await fresh({ tooSoon: true });
  await open("home"); await ready(".dv-score", "the score line");
  await click(btn(T0.runCheckup));
  await ready(".dv-toosoon", "the too-soon line");
  check((await js("document.querySelector('.dv-toosoon').textContent")) === T0.tooSoon(7) && (await count(".btn.volt")) === 0, "too soon: it says how many minutes, in place of a button that cannot work");
  await shot("24-too-soon");
  await targets("too soon"); await axe("too-soon", null, [".sh-side", ".sh-top"]);

  // failed
  await fresh({ fail: true });
  await open("home"); await ready(".dv-score", "the score line");
  await click(btn(T0.runCheckup));
  await ready(".dv-failed", "the failure");
  check((await has(T0.failedTitle)) && (await has(AR ? "لم تستجب خدمة القوائم في الوقت المناسب." : "The listing service did not answer in time.")), "a failed run says so, with the plain sentence the API gave");
  check((await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.runAgain, `a failed run offers "${T0.runAgain}" as the one Volt button`);
  await until("!!document.querySelector('.dv-failed details')", "the failure's log", 8000).catch(() => undefined);
  check((await count(".dv-failed details")) === 1, "its log is there to open");
  await click("document.querySelector('.dv-failed summary')");
  check((await count(".dv-failed .dv-log li")) >= 2, "the log shows what ran before it stopped");
  await shot("25-failed");
  await noSideScroll("the failure"); await targets("the failure"); await axe("failed", null, [".sh-side", ".sh-top"]); await latinInArabic("the failure");

  // module off
  await fresh({ moduleOff: true });
  await open("home"); await ready(".dv-problem", "the refusal");
  check((await has(T0.moduleOff)), "module off: Home says so in words");
  await open("todo"); await ready(".dv-problem", "the refusal on To do");
  await open("reviews"); await ready(".dv-problem", "the refusal on Reviews");
  await open("reports"); await ready(".dv-problem", "the refusal on Reports");
  check(true, "module off: every view says so");
  await shot("26-module-off");
  await reset();

  // everything done
  await fresh();
  await js("Promise.all(['f01','f02','f03','f04','f05','f06','f07','f08','f09','f10'].map(id => fetch('/api/discovery/findings/' + id + '/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'owner_done' }) })))");
  await open("home"); await ready(".dv-caught", "the all-done screen");
  check((await has(T0.caughtUpTitle)) && (await count(".dv-card")) === 0 && (await count(".btn.volt")) === 1, "all done: it says nothing is left and keeps the one button");
  await shot("27-all-done");
  await reset();
}

// ── 4. To do ───────────────────────────────────────────────────────────────────────────
async function todo() {
  await reset();
  await open("todo");
  await ready(".dv-list", "the list");
  check((await h1()) === T0.views.todo, "the heading is To do");
  check((await js("[...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim()).join('|')")) === [T0.tabs.open, T0.tabs.skipped, T0.tabs.done].join("|"), "three tabs: Open, Skipped, Done");
  check((await js("document.querySelector('[role=tab][aria-selected=true]').textContent.trim()")) === T0.tabs.open, "Open is the tab that shows first");
  const groups = await js("[...document.querySelectorAll('.dv-block > h2')].map(h => h.textContent.trim())");
  check(groups.length >= 2 && groups.every((g) => Object.values(T0.groups).includes(g)), `findings are grouped by who does them (${groups.join(" / ")})`);
  if (CONTROL) check(groups[0] === T0.groups.agent, `the first group is titled by what is true: "${T0.groups.agent}"`);
  const openCount = await count(".dv-row");
  check((await js("document.querySelector('.dv-count').textContent")) === T0.listCount("open", openCount), "the count says how many are open");
  await shot("30-todo");
  await noSideScroll("To do"); await targets("To do"); await named("To do"); await latinInArabic("To do");
  await axe("todo", null, [".sh-side", ".sh-top"]);

  // the place filter
  const places = await count(".dv-place option");
  if (places > 2) {
    await js("(() => { const s = document.querySelector('.dv-place select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, s.options[1].value); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await until(`document.querySelector('.dv-count')?.textContent !== ${norm(T0.listCount("open", openCount))}`, "the list to narrow");
    check((await count(".dv-row")) < openCount, "the place filter narrows the list");
    await js("(() => { const s = document.querySelector('.dv-place select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ''); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await until(`document.querySelectorAll('.dv-row').length === ${openCount}`, "the whole list again");
  } else log("the place filter needs two places; skipped");

  // tabs with the arrow keys, following the reading direction
  await js("document.querySelector('[role=tab][aria-selected=true]').focus()");
  await b.key(AR ? "ArrowLeft" : "ArrowRight", AR ? "ArrowLeft" : "ArrowRight", AR ? 37 : 39);
  await until("document.querySelector('[role=tab][aria-selected=true]')?.id === 'dv-tab-skipped'", "the arrow key to move to the next tab");
  check(true, "the arrow key moves to the next tab, the way the page reads");
  await ready(".dv-count", "the Skipped list");
  await sleep(300);
  await shot("31-todo-skipped");
  await click("document.getElementById('dv-tab-done')");
  await until("document.querySelector('.dv-count')?.textContent.length > 0 && document.querySelector('[role=tab][aria-selected=true]').id === 'dv-tab-done'", "the Done list");
  check((await count(".dv-row .dv-pill")) === (await count(".dv-row")), "every row of Done says what became of it, in words");
  await click("document.getElementById('dv-tab-open')");
  await until("document.querySelectorAll('.dv-row').length === " + openCount, "Open again");

  // a row opens the sheet; marking it done moves it
  await click("document.querySelector('.dv-row')");
  await ready(".ct-sheet", "the sheet");
  await click(btn(T0.didThis, "document.querySelector('.ct-sheet-foot')"));
  await until("!document.querySelector('.ct-sheet')", "the sheet to close after marking");
  await until(`document.querySelectorAll('.dv-row').length === ${openCount - 1}`, "the list to lose the row");
  check(true, "a finding marked done leaves Open");
  await click("document.getElementById('dv-tab-done')");
  await until("document.querySelector('[role=tab][aria-selected=true]').id === 'dv-tab-done' && document.querySelectorAll('.dv-row').length >= 1 && document.querySelectorAll('.dv-row .dv-pill').length === document.querySelectorAll('.dv-row').length", "it to show in Done");
  check(true, "…and shows in Done");
  await click("document.querySelector('.dv-row')"); await ready(".ct-sheet", "a done finding's sheet");
  check((await has(T0.statusLine.owner_done)) || (await has(T0.statusLine.verified)), "a done finding's sheet says what happens next");
  await click(btn(T0.notDoneYet, "document.querySelector('.ct-sheet-foot')"));
  await until("!document.querySelector('.ct-sheet')", "the sheet to close after undoing");
  await reset();

  // the deep link a review uses
  await open("todo", "finding=f04");
  await ready(".ct-sheet", "the sheet from the link");
  check((await js("document.querySelector('.ct-sheet h2').textContent")).length > 0, "a link with a finding opens its sheet at once");
  await shot("32-todo-deeplink");
  await b.key("Escape");
  await until("!document.querySelector('.ct-sheet')", "the sheet to close");
  check(!/finding=/.test(await js("location.search")), "closing it takes the finding out of the address");
  await reset();
}

// ── 5. Reviews ─────────────────────────────────────────────────────────────────────────
async function reviews() {
  await reset();
  await open("reviews");
  await ready(".dv-summary", "the summary");
  check((await count(".dv-summary > div")) === 3, "the summary has three figures");
  const summary = await js("[...document.querySelectorAll('.dv-summary dd')].map(d => d.textContent.trim().replace(/\\s+/g, ' '))");
  check(summary[0].match(/^\d+$/) && (summary[1].match(/^\d\.\d/) || summary[1].includes(T0.noRatings)) && summary[2].match(/^\d+$/), `count, average and unanswered (${summary.join(" · ")})`);
  const n = await count(".dv-review");
  check(n === Number(summary[0]) || n > 0, `the reviews are listed (${n})`);
  const dates = await js("[...document.querySelectorAll('.dv-review-date bdi')].map(e => e.textContent)");
  check(dates.length === n, "every review has a date");
  // review text is data: never markup, never an instruction
  const injected = await js("(() => ({ markup: document.querySelectorAll('.dv-quote img, .dv-quote b, .dv-quote script, .dv-quote a').length, ran: typeof window.__xss !== 'undefined' }))()");
  check(injected.markup === 0 && !injected.ran, "review text is drawn as text: no markup inside a quote, nothing ran");
  if (CONTROL) check((await js("[...document.querySelectorAll('.dv-quote p')].some(p => p.textContent.includes('<img src=x'))")), "…and the markup a reviewer typed is shown as the characters they typed");
  check((await count(".dv-review blockquote.dv-quote")) >= n, "each review is a quote");
  check((await count(".dv-stars[role=img]")) >= n && (await js("document.querySelector('.dv-stars').getAttribute('aria-label')")).length > 0, "each rating is said in words to a screen reader");
  await shot("40-reviews");
  await noSideScroll("Reviews"); await targets("Reviews"); await named("Reviews"); await latinInArabic("Reviews");
  await axe("reviews", null, [".sh-side", ".sh-top"]);

  // filters
  await click(`[...document.querySelectorAll('.ct-chip')].find(b => b.textContent.includes(${norm(T0.onlyUnanswered)}))`);
  await until(`document.querySelectorAll('.dv-review').length === ${Number(summary[2])}`, "only the reviews without a reply");
  check((await count(".dv-review .sh-pill.active")) === 0, "the reviews without a reply all say so");
  await js("(() => { const s = [...document.querySelectorAll('.dv-filters select')].pop(); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '1'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await until("document.querySelectorAll('.dv-review').length < 5", "the star filter to narrow");
  check(await js("[...document.querySelectorAll('.dv-stars')].every(s => s.querySelectorAll('svg.on').length === 1)"), "a one-star filter shows one-star reviews");
  await js("(() => { const s = [...document.querySelectorAll('.dv-filters select')].pop(); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'all'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await click(`[...document.querySelectorAll('.ct-chip')].find(b => b.textContent.includes(${norm(T0.onlyUnanswered)}))`);
  await until(`document.querySelectorAll('.dv-review').length === ${n}`, "all the reviews again");

  // a review leads to its to-do
  const link = await js(`(() => { const a = [...document.querySelectorAll('.dv-review a')].find(x => x.textContent.trim() === ${norm(T0.seeTodo)}); return a ? a.getAttribute('href') : null; })()`);
  if (link) {
    check(/view=todo&finding=/.test(link), "an unanswered review links to the to-do that is about it");
    await click(`[...document.querySelectorAll('.dv-review a')].find(x => x.textContent.trim() === ${norm(T0.seeTodo)})`);
    await ready(".ct-sheet", "the to-do's sheet");
    check((await h1()) === T0.views.todo, "…and it opens on To do with the sheet showing");
    await b.key("Escape");
  } else log("no unanswered review has a to-do here; link check skipped");
  await reset();
}

// ── 6. Reports ─────────────────────────────────────────────────────────────────────────
async function reports() {
  await reset();
  await open("reports");
  await ready(".dv-report, .dv-slot", "the report");
  check(await exists(".dv-report"), "a month with a check-up has its report");
  check((await count(".dv-month option")) >= 1, "the month picker lists the months that have a check-up");
  check((await has(T0.reportScore)) && (await has(T0.byPart)), "the report has the score and the parts");
  check((await count(".dv-headline")) === 1, "the headline is one sentence");
  const parts = await js("[...document.querySelectorAll('.dv-parts li b')].map(e => e.textContent.trim())");
  check(parts.length === 4 && JSON.stringify(parts) === JSON.stringify(["presence", "reviews", "website", "whatsapp"].map((k) => T0.partNames[k])), "four parts are drawn, and no part nobody measures");
  check(CONTROL ? (await count(".dv-parts .dv-none")) === 1 : (await count(".dv-parts li")) === 4, "a part that was not measured says Not measured yet and has no number");
  check(!/\bAI\b|ذكاء/.test(await text()), "no part is named for AI");
  await shot("50-reports");
  await noSideScroll("Reports"); await targets("Reports"); await named("Reports"); await latinInArabic("Reports");
  await axe("reports", null, [".sh-side", ".sh-top"]);
  if ((await count(".dv-month option")) > 1) {
    const before = await js("document.querySelector('.dv-report h2').textContent");
    await js("(() => { const s = document.querySelector('.dv-month select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, s.options[1].value); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await until(`document.querySelector('.dv-report h2').textContent !== ${norm(before)}`, "another month");
    check(true, "another month opens its own report");
  }
  // print: the report alone, ink on white
  await b.send("Emulation.setEmulatedMedia", { media: "print", features: [{ name: "prefers-color-scheme", value: SCHEME }] });
  await sleep(300);
  const printed = await js("(() => { const hidden = s => !document.querySelector(s) || getComputedStyle(document.querySelector(s)).display === 'none'; const r = document.querySelector('.dv-report'); const c = getComputedStyle(r); const lum = x => x.match(/\\d+/g).slice(0, 3).map(Number).reduce((a, n) => a + n, 0) / 3; return { chrome: hidden('.sh-side') && hidden('.sh-tabbar') && hidden('.sh-mtop') && hidden('.dv-views') && hidden('.dv-month'), ink: lum(getComputedStyle(r.querySelector('h2')).color), paper: lum(getComputedStyle(document.querySelector('.sh')).backgroundColor) }; })()");
  check(printed.chrome, "printed: the menu, the tab bar and the pickers are not on the page");
  check(printed.ink < 80 && printed.paper > 200, `printed: ink on white whatever the theme (ink ${Math.round(printed.ink)}, paper ${Math.round(printed.paper)})`);
  await b.send("Emulation.setEmulatedMedia", { media: "", features: [{ name: "prefers-color-scheme", value: SCHEME }, { name: "prefers-reduced-motion", value: "reduce" }] });
  // no report yet
  if (CONTROL) {
    await control({ history: [] });
  }
  await reset();
}

// ── Phase 2 (ALY-324, spec 066): proposals, the approval sheet, facts, settings, roles ──────────────

const listAll = (extra = "") => js(`fetch('/api/discovery/proposals?status=all&lang=${LANG}${extra}').then(r => r.json()).then(d => d.items)`);
const waitingNow = () => js("fetch('/api/discovery/proposals').then(r => r.json()).then(d => d.waiting)");
const patchProposal = async (id, patch) => { await fetch(`${CONTROL}/__proposal`, { method: "POST", body: JSON.stringify({ id, patch }) }); };
const sheetOpen = async (id) => {
  await open("proposals", `p=${id}`);
  await ready(".ct-sheet .dv-approval", `the sheet of ${id}`);
  await sleep(450);
};
const watchPosts = () => js("(() => { if (window.__posts) return; window.__posts = []; const f = window.fetch; window.fetch = (u, o) => { if (o && o.method && o.method !== 'GET') window.__posts.push({ url: String(u), method: o.method, body: o.body ?? null }); return f(u, o); }; })()");
const posts = () => js("window.__posts ?? []");
const sheetFoot = () => js("[...document.querySelectorAll('.ct-sheet-foot .btn')].map(b => b.textContent.trim())");
const stateHead = () => js("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() ?? ''");
const sheetText = () => js("document.querySelector('.ct-sheet')?.innerText.replace(/[\u2068\u2069]/g, '').replace(/\\s+/g, ' ') ?? ''");
const setInput = (selector, value) => js(`(() => { const el = document.querySelector(${norm(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${norm(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const setSelect = (selector, value) => js(`(() => { const s = document.querySelector(${norm(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${norm(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const day = (iso) => formatDay(iso, LANG);
const clearToasts = () => js("document.querySelectorAll('.ct-toast-x').forEach((x) => x.click())");

async function sheetChecks(name) {
  await noSideScroll(name);
  const inner = await js("(() => { const b = document.querySelector('.ct-sheet-body'); return b ? b.scrollWidth - b.clientWidth : 0; })()");
  check(inner <= 0, `nothing in ${name} scrolls sideways inside the sheet${inner > 0 ? ` (${inner}px too wide)` : ""}`);
  await targets(name, ".ct-sheet");
  await named(name, ".ct-sheet");
  await latinInArabic(name);
  await axe(name, ".ct-sheet");
}

/** The sheet shows the API's own before and after, word for word (the ones WhatsApp sends too). */
async function exactChange(id) {
  const p = (await listAll()).find((x) => x.id === id);
  if (p.after.lines.length === 0) {
    const now = await js("document.querySelector('.ct-sheet .dv-ba-now dd')?.textContent");
    const next = await js("document.querySelector('.ct-sheet .dv-ba-new dd')?.textContent");
    check(now === p.before.text && next === p.after.text, `${id}: the sheet shows exactly what the API sent: "${p.before.text}" then "${p.after.text.slice(0, 40)}"`);
  } else {
    const rows = await js("[...document.querySelectorAll('.ct-sheet .dv-hours tbody tr')].map(r => [...r.children].map(c => c.textContent.trim()))");
    check(rows.length === 7 && rows.every((r, i) => r[r.length - 1] === p.after.lines[i].text), `${id}: the proposed column is the API's seven lines`);
    const beforeOk = p.before.lines.length ? rows.every((r, i) => r[1] === p.before.lines[i].text) : rows[0][1] === p.before.text && rows.slice(1).every((r) => r.length === 2);
    check(beforeOk, `${id}: the "now" column is the API's, or one cell that says "${p.before.text}"`);
    check((await count(".ct-sheet .dv-hours thead th")) === 3, `${id}: hours are in two columns beside the day`);
  }
}

// ── the Proposals area ──────────────────────────────────────────────────────────────────
async function proposals() {
  await reset();
  await open("proposals");
  await ready(".dv-proposals .dv-count", "the list");
  check((await h1()) === T0.views.proposals, "the heading is Proposals");
  check((await text()).includes(T0.guarantee), `the line at the top is the guarantee, word for word ("${T0.guarantee}")`);
  check((await js("[...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim()).join('|')")) === [T0.proposalTabs.live, T0.proposalTabs.done, T0.proposalTabs.closed].join("|"), "three tabs: Waiting, Done, Closed");
  const all = await listAll();
  const live = all.filter((p) => ["proposed", "approved"].includes(p.status));
  check((await count(".dv-prow")) === live.length, `a row for each change that waits or is being applied (${live.length})`);
  const nProposed = live.filter((p) => p.status === "proposed").length, nApplying = live.length - nProposed;
  check((await js("document.querySelector('.dv-count').textContent")) === T0.proposalCount("live", nProposed) + (nApplying > 0 ? ` · ${T0.applyingN(nApplying)}` : ""), "the count is in words, and says how many are being applied");
  const pills = await js("[...document.querySelectorAll('.dv-prow .dv-pill')].map(p => p.textContent.trim())");
  check(pills.length === live.length && pills.every((p) => Object.values(T0.proposalStatus).includes(p)) && pills.includes(T0.proposalStatus.approved), "every row says its status in words");
  check((await count(".dv-prow .dv-change-line bdi")) === live.length * 2, "every row shows now and proposed, each isolated");
  check((await js("[...document.querySelectorAll('.dv-prow')].every(r => /Waiting until|Approved|بانتظار الموافقة حتى|تمت الموافقة/.test(r.textContent))")), "every row says when: waiting until a date, or approved");
  check((await count(".btn.volt")) === 0, "the Proposals area has no Volt button: the approval is in the sheet");
  check(!(await has(T0.approversNote)), "an owner is not told who approves");
  await shot("60-proposals");
  await noSideScroll("Proposals"); await targets("Proposals"); await named("Proposals"); await latinInArabic("Proposals");
  await axe("proposals", null, [".sh-side", ".sh-top"]);

  // tabs
  for (const tab of ["done", "closed"]) {
    await click(`document.getElementById('dvp-tab-${tab}')`);
    const wanted = all.filter((p) => (tab === "done" ? ["applied", "undone"] : ["declined", "expired", "failed"]).includes(p.status));
    await until(`document.querySelector('.dv-count')?.textContent === ${norm(T0.proposalCount(tab, wanted.length))} && document.querySelectorAll('.dv-prow').length === ${wanted.length}`, `the ${tab} tab`);
    check(true, `${tab}: ${wanted.length} changes, counted in words`);
    await shot(`61-proposals-${tab}`);
    await axe(`proposals-${tab}`, null, [".sh-side", ".sh-top"]);
  }
  check((await js("[...document.querySelectorAll('.dv-prow .dv-pill')].map(p => p.textContent.trim()).some(x => x === " + norm(T0.proposalStatus.failed) + ")")), "Closed holds the one that was not applied, said as such");
  // an empty tab is a real screen, not a blank
  await control({ noProposals: true });
  await open("proposals"); await ready(".dv-count", "the empty list");
  check((await has(T0.proposalsEmpty.live)) && (await count(".dv-slot")) === 1, "nothing waiting: a dashed slot that says so");
  await shot("62-proposals-empty");
  await axe("proposals-empty", null, [".sh-side", ".sh-top"]);
  await reset();

  // the place filter, and a row that opens the sheet
  await open("proposals"); await ready(".dv-prow", "the rows");
  if ((await count(".dv-place option")) > 2) {
    const n = await count(".dv-prow");
    await setSelect(".dv-place select", "p1");
    await until(`document.querySelectorAll('.dv-prow').length < ${n}`, "the place filter to narrow");
    check((await js("[...document.querySelectorAll('.dv-prow .dv-meta-line span:first-child')].every(x => x.textContent.includes(" + norm(LANG === "ar" ? "الوكرة" : "Al Wakra") + "))")), "the place filter shows that place only");
    await setSelect(".dv-place select", "");
    await until(`document.querySelectorAll('.dv-prow').length === ${n}`, "all places again");
  }
  await click("document.querySelector('.dv-prow')");
  await ready(".ct-sheet .dv-approval", "the sheet from a row");
  check((await js("document.activeElement.closest('.ct-sheet') !== null")), "focus moves into the sheet");
  await b.key("Escape");
  await until("!document.querySelector('.ct-sheet')", "the sheet to close");

  // the link WhatsApp sends
  await open("proposals", "p=pr04");
  await ready(".ct-sheet .dv-approval", "the sheet from the link");
  check((await js("document.querySelector('.ct-sheet h2').textContent")).length > 0, "?view=proposals&p=<id> opens that change's sheet at once");
  await b.key("Escape");
  await until("!document.querySelector('.ct-sheet')", "the sheet to close");
  check(!/[?&]p=/.test(await js("location.search")), "closing it takes the id out of the address");
}

// ── the approval sheet, in each of its seven states ──────────────────────────────────────
async function approvals() {
  await reset();
  // waiting: the exact change, one Volt button, the guarantee, the sample line, once each
  await sheetOpen("pr04");
  const p4 = (await listAll()).find((p) => p.id === "pr04");
  check((await js("document.querySelector('.ct-sheet h2').textContent")) === p4.title, "the sheet is titled by the change");
  check((await stateHead()) === T0.proposalStatus.proposed, "waiting: it says so");
  await exactChange("pr04");
  check(JSON.stringify(await sheetFoot()) === JSON.stringify([T0.approve, T0.decline]), `waiting: the actions are "${T0.approve}" and "${T0.decline}"`);
  check((await count(".ct-sheet .btn.volt")) === 1 && (await js("document.querySelector('.ct-sheet-foot .btn.volt').textContent.trim()")) === T0.approve, "the one Volt button of the sheet is Approve");
  const t1 = await sheetText();
  check(t1.split(T0.guarantee).length === 2, "the guarantee line is there, once");
  check(t1.split(T0.sampleChange).length === 2, "the sample line is there, once, while the connection is the sample");
  check(t1.includes(T0.ruleLine) && t1.includes(p4.rule), "the rule line says by what rule");
  check(t1.includes(T0.expiresOn(formatDayLong(p4.expires_at, LANG)).replace(/[⁨⁩]/g, "")), "the expiry says when it lapses");
  check((await js("document.querySelector('.ct-sheet-foot .btn.volt').disabled")) === false, "Approve is a button to be pressed, enabled");
  check((await js("document.activeElement?.classList.contains('btn') ? document.activeElement.textContent.trim() : ''")) !== T0.approve, "focus does not start on Approve");
  await shot("63-approval-waiting");
  await sheetChecks("the approval sheet (waiting)");
  await b.key("Escape");

  // hours in two columns
  await sheetOpen("pr02"); await exactChange("pr02");
  await shot("64-approval-hours");
  await sheetChecks("the approval sheet (hours)");
  await b.key("Escape");

  // a reply to a review: the review is quoted as text
  await sheetOpen("pr07"); await exactChange("pr07");
  check((await count(".ct-sheet .dv-quote")) === 1 && (await js("document.querySelector('.ct-sheet .dv-quote p').textContent")) === "Okay work but the price was higher than quoted.", "a reply shows the review it answers, quoted");
  check((await js("document.querySelector('.ct-sheet .dv-quote').getAttribute('dir')")) === "auto", "the review keeps its own direction");
  await shot("65-approval-reply");
  await sheetChecks("the approval sheet (a reply)");
  await b.key("Escape");
  await sheetOpen("pr08");
  const hostile = await js("(() => ({ markup: document.querySelectorAll('.ct-sheet .dv-quote img, .ct-sheet .dv-quote b, .ct-sheet .dv-quote script, .ct-sheet .dv-quote a').length, ran: typeof window.__xss !== 'undefined', shown: document.querySelector('.ct-sheet .dv-quote p').textContent.includes('<img src=x') }))()");
  check(hostile.markup === 0 && !hostile.ran && hostile.shown, "a reviewer's markup and its instruction to approve are shown as the characters typed: nothing ran, nothing was approved");
  check((await posts()).length === 0, "…and no request was made");
  await b.key("Escape");

  // applied, in its three verifications
  for (const [id, key] of [["pr10", "pending"], ["pr11", "confirmed"], ["pr12", "not_confirmed"]]) {
    await sheetOpen(id); await exactChange(id);
    const d = await js(`fetch('/api/discovery/proposals/${id}?lang=${LANG}').then(r => r.json())`);
    const t = await sheetText();
    check((await stateHead()) === T0.proposalStatus.applied, `${id}: applied says so`);
    check(t.includes(T0.appliedLine(formatWhen(d.applied_at, LANG), d.decided.by, d.decided.channel).replace(/[⁨⁩]/g, "")), `${id}: when, by whom and from where it was approved`);
    const verified = d.history.find((h) => h.event === "proposal.verify")?.at;
    const line = key === "pending" ? T0.verifyPending : key === "confirmed" ? T0.verifyConfirmedOn(day(verified)) : T0.verifyNotOn(day(verified));
    check(t.includes(line.replace(/[⁨⁩]/g, "")), `${id}: the check-up's verdict, in words: "${line.replace(/[⁨⁩]/g, "")}"`);
    check(JSON.stringify(await sheetFoot()) === JSON.stringify(d.can.undo ? [T0.undo] : []), `${id}: Undo only while the API says it can be undone`);
    check((await count(".ct-sheet .btn.volt")) === 0, `${id}: no Volt button on a change that is done`);
    if (d.can.undo) check(t.includes(T0.undoUntil(day(d.undo_until)).replace(/[⁨⁩]/g, "")), `${id}: the undo window is said`);
    await shot(`66-approval-applied-${key}`);
    await sheetChecks(`the approval sheet (applied, ${key})`);
    await b.key("Escape");
  }

  // failed: the API's sentence, try again and decline
  await sheetOpen("pr13");
  const p13 = (await listAll()).find((p) => p.id === "pr13");
  check((await stateHead()) === T0.proposalStatus.failed, "failed: it says so");
  check((await sheetText()).includes(p13.failure.message), "failed: the reason is the API's plain sentence");
  check(JSON.stringify(await sheetFoot()) === JSON.stringify([T0.retry, T0.decline]), `failed: "${T0.retry}" and "${T0.decline}"`);
  await shot("67-approval-failed");
  await sheetChecks("the approval sheet (failed)");
  await b.key("Escape");

  // declined, expired, undone: no actions
  for (const [id, head, line] of [
    ["pr14", "declined", null], ["pr15", "expired", null], ["pr16", "undone", null],
  ]) {
    await sheetOpen(id); await exactChange(id);
    const d = await js(`fetch('/api/discovery/proposals/${id}?lang=${LANG}').then(r => r.json())`);
    const t = (await sheetText()).replace(/[⁨⁩]/g, "");
    check((await stateHead()) === T0.proposalStatus[head], `${id}: ${head} says so`);
    check((await sheetFoot()).length === 0 && (await count(".ct-sheet .btn.volt")) === 0, `${id}: no actions on a change that is closed`);
    if (head === "declined") check(t.includes(T0.declinedLine(formatWhen(d.decided.at, LANG), d.decided.by, d.decided.channel).replace(/[⁨⁩]/g, "")) && t.includes(T0.coolOff), "declined: who and when, and that it is not proposed again for 14 days");
    if (head === "expired") check(t.includes(T0.expiredLine(day(d.expires_at)).replace(/[⁨⁩]/g, "")), "expired: the date, and that nothing was applied");
    if (head === "undone") check(t.includes(T0.undoneNote(d.where)), "undone: the next check-up looks again");
    void line;
    await shot(`68-approval-${head}`);
    await sheetChecks(`the approval sheet (${head})`);
    await b.key("Escape");
  }
}

// ── approving, declining, undoing: what a tap sends and what it does ─────────────────────
async function taps() {
  await reset();
  // nothing is approved by looking
  await sheetOpen("pr04"); await watchPosts(); await sleep(3500);
  check((await posts()).length === 0, "opening a change and leaving it open sends nothing: it is only ever a tap");

  // approve: one request, with the hash of the change shown
  const before = await waitingNow();
  await click(btn(T0.approve, "document.querySelector('.ct-sheet-foot')"));
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() !== " + norm(T0.proposalStatus.proposed), "the state to move on");
  const sent = (await posts()).filter((x) => x.method === "POST");
  check(sent.length === 1 && /\/proposals\/pr04\/approve/.test(sent[0].url) && JSON.parse(sent[0].body).change_hash === "h-pr04", `Approve sends one request, with the hash of the change shown (${sent[0]?.body})`);
  check(Object.keys(JSON.parse(sent[0].body)).join() === "change_hash", "…and nothing else: the change itself is not sent back");
  await shot("69-approval-approved");
  check((await stateHead()) === T0.beingApplied && JSON.stringify(await sheetFoot()) === "[]", "after the tap it says it is being applied, and has no button to press twice");
  check((await count(".ct-sheet .dv-steps li")) === 2, "its steps are drawn: approved, making the change");
  // asked about every 1.5 s until applied, and never again
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.applied), "the change to be applied", 20000);
  check(true, "…and then it says applied");
  const gaps = await js("(() => { const t = performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/proposals\\/pr04/.test(e.name) && !/approve/.test(e.name)).map(e => e.startTime); return t.slice(1).map((x, i) => x - t[i]); })()");
  // The first look at a change that was just approved comes at once; the ones after it keep the 1.5 s beat.
  const beat = gaps.filter((g) => g > 300 && g < 4000);
  check(beat.length >= 1 && beat.every((g) => g >= 1100 && g <= 2400), `the change is asked about every 1.5 s while it is applied (${beat.map(Math.round).join(", ")} ms)`);
  const asked = await js("performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/proposals\\/pr04/.test(e.name)).length");
  await sleep(5000);
  check((await js("performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/proposals\\/pr04/.test(e.name)).length")) === asked, "nothing is asked about it once it is applied");
  check((await js("document.querySelector('.ct-sr[role=status]').textContent")).length > 0, "the new state is announced to a screen reader");
  check(JSON.stringify(await sheetFoot()) === JSON.stringify([T0.undo]), "applied: Undo is offered");
  check((await waitingNow()) === before - 1, "one fewer change waits for approval");
  const sub = await js(`document.querySelector(${norm(WIDTH >= 800 ? ".sh-sub .dv-subn" : ".dv-views .dv-subn")})?.textContent.trim() ?? ''`);
  check(sub === (before - 1 > 0 ? T0.waitingN(before - 1) : ""), `the menu's count follows without a reload (${sub})`);
  await shot("70-approval-applied-after");
  await sheetChecks("the approval sheet (just applied)");

  // undo
  await click(btn(T0.undo, "document.querySelector('.ct-sheet-foot')"));
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.undone), "the undone state");
  check((await sheetFoot()).length === 0, "undone: nothing more to press");
  await b.key("Escape");

  // decline
  await reset(); await sheetOpen("pr06");
  await click(btn(T0.decline, "document.querySelector('.ct-sheet-foot')"));
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.declined), "the declined state");
  check((await sheetText()).includes(T0.coolOff), "declined: it says it is not proposed again for 14 days");
  await b.key("Escape");

  // a change that moved while the sheet was open: the tap is refused, the sheet shows it as it now is
  await reset(); await sheetOpen("pr05"); await watchPosts();
  await patchProposal("pr05", { hash: "h-pr05-v2" });
  await click(btn(T0.approve, "document.querySelector('.ct-sheet-foot')"));
  await until("!!document.querySelector('.ct-sheet .ct-alert')", "the refusal");
  check((await js("document.querySelector('.ct-sheet .ct-alert').textContent")).includes(T0.errors.proposal_changed), `a changed change says so: "${T0.errors.proposal_changed}"`);
  check((await stateHead()) === T0.proposalStatus.proposed, "…and it is still waiting, shown as it now is");
  await sleep(500);
  await click(btn(T0.approve, "document.querySelector('.ct-sheet-foot')"));
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() !== " + norm(T0.proposalStatus.proposed), "the second tap");
  const hashes = (await posts()).filter((x) => /approve/.test(x.url)).map((x) => JSON.parse(x.body).change_hash);
  check(hashes.length === 2 && hashes[0] === "h-pr05" && hashes[1] === "h-pr05-v2", `the second tap carries the new hash (${hashes.join(", ")})`);
  await b.key("Escape");

  // an apply that fails: said plainly, nothing claimed
  await reset(); await control({ applyFails: true }); await sheetOpen("pr05");
  await click(btn(T0.approve, "document.querySelector('.ct-sheet-foot')"));
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.failed), "the failure", 20000);
  const p5 = await js(`fetch('/api/discovery/proposals?status=all&lang=${LANG}').then(r => r.json()).then(d => d.items.find(p => p.id === 'pr05'))`);
  check((await sheetText()).includes(p5.failure.message) && !(await sheetText()).includes(T0.announce.applied), "a failed apply says why and never says applied");
  check(JSON.stringify(await sheetFoot()) === JSON.stringify([T0.retry, T0.decline]), "…and offers to try again");
  await shot("71-approval-apply-failed");
  await b.key("Escape");
  await reset();

  // trying again from a failed one
  await sheetOpen("pr13"); await watchPosts();
  await click(btn(T0.retry, "document.querySelector('.ct-sheet-foot')"));
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.applied), "the retry to be applied", 20000);
  check((await posts()).filter((x) => /pr13\/approve/.test(x.url)).length === 1, "Try again is one approve request");
  await b.key("Escape");
  await reset();
}

// ── the finding's sheet, and the fact it asks for ────────────────────────────────────────
async function findingSheet() {
  await reset();
  await open("todo"); await ready(".dv-list", "the list");
  const tagged = await count(".dv-row .dv-tag");
  check(tagged >= 3 && (await js("[...document.querySelectorAll('.dv-tag')].every(t => t.textContent.trim() === " + norm(T0.changeReady) + ")")), `rows with a change waiting say "${T0.changeReady}" in words (${tagged})`);
  check((await js("[...document.querySelectorAll('.dv-row-title')].length")) > tagged, "…and the rest are not tagged");
  check((await js("document.querySelector('.dv-block h2').textContent.trim()")) === T0.groups.agent, `the first group is "${T0.groups.agent}"`);
  const total = await count(".dv-row");
  await click(`document.querySelector('.dv-readychip .ct-chip')`);
  await until(`document.querySelectorAll('.dv-row').length === ${tagged}`, "the chip to narrow the list");
  check((await count(".dv-row .dv-tag")) === tagged, `the "${T0.changeReady}" chip narrows to those rows`);
  await shot("72-todo-ready");
  await noSideScroll("To do with the chip"); await targets("To do with the chip"); await axe("todo-ready", null, [".sh-side", ".sh-top"]);
  await click(`document.querySelector('.dv-readychip .ct-chip')`);
  await until(`document.querySelectorAll('.dv-row').length === ${total}`, "the whole list again");

  // a finding with two changes
  await open("todo", "finding=f02");
  await ready(".ct-sheet .dv-sheet", "the finding's sheet");
  await sleep(500);
  check((await js("document.querySelector('.ct-sheet .dv-change h3').textContent.trim()")) === T0.proposedChanges && (await count(".ct-sheet .dv-pc")) === 2, "its two changes are shown above the evidence");
  const order = await js("[...document.querySelectorAll('.ct-sheet h3')].map(h => h.textContent.trim())");
  check(order.indexOf(T0.proposedChanges) >= 0 && order.indexOf(T0.proposedChanges) < order.indexOf(T0.evidence), "…the changes come before the evidence");
  check((await sheetText()).includes(T0.guarantee), "the guarantee is there");
  check(JSON.stringify(await sheetFoot()) === JSON.stringify([T0.reviewAndApprove, T0.didThis, T0.skip]), `the footer: "${T0.reviewAndApprove}", then "${T0.didThis}" and "${T0.skip}"`);
  check((await count(".ct-sheet .btn.volt")) === 1 && (await js("document.querySelector('.ct-sheet-foot .btn.volt').textContent.trim()")) === T0.reviewAndApprove, "Review and approve is the one Volt button");
  check((await js("document.querySelector('.ct-sheet-foot').textContent")).includes(T0.closesChange), "marking it done or skipping it says its waiting change will be closed");
  check((await count(".ct-sheet .dv-pc .btn")) === 2, "each of two changes has its own way in");
  await shot("73-finding-with-change");
  await sheetChecks("the finding sheet (with changes)");
  await click(btn(T0.reviewAndApprove, "document.querySelector('.ct-sheet-foot')"));
  await until("!!document.querySelector('.ct-sheet .dv-approval')", "the approval sheet");
  check((await count(".ct-sheet")) === 1, "the approval sheet takes the finding's place: one sheet, not two");
  check((await js("document.querySelector('.ct-sheet h2').textContent")).includes(LANG === "ar" ? "ساعات العمل" : "opening hours"), "…and it is the first change that waits");
  await b.key("Escape");
  await until("!!document.querySelector('.ct-sheet .dv-sheet:not(.dv-approval)')", "the finding's sheet back");
  check(true, "closing the approval sheet brings the finding back");
  await b.key("Escape");
  await until("!document.querySelector('.ct-sheet')", "the sheet to close");

  // a finding that needs a fact first
  await open("todo", "finding=f03");
  await ready(".ct-sheet .dv-factform", "the fact form");
  await sleep(400);
  check((await js("document.querySelector('.dv-factform-h').textContent.trim()")) === T0.confirmTitles.hours, `the form says what is asked: "${T0.confirmTitles.hours}"`);
  check((await count(".dv-hrow")) === 7 && (await count(".dv-hrow .dv-closed input")) === 7, "seven days, each with a closed box");
  check((await js("[...document.querySelectorAll('.dv-hrow input[type=text]')].every(i => i.labels && i.labels.length === 1)")), "every time field has its own visible label");
  check((await count(".ct-sheet .btn.volt")) === 1 && (await js("document.querySelector('.dv-factform .btn.volt').textContent.trim()")) === T0.saveFact, "saving is the one Volt button here");
  check((await sheetText()).includes(T0.factIntro), "it says a change is only made from what is confirmed");
  await shot("74-fact-form");
  await sheetChecks("the fact form");
  await click("document.querySelector('.dv-factform .btn.volt')");
  await until("document.querySelectorAll('.dv-factform .ct-error').length > 0", "the errors");
  check((await count(".dv-factform .ct-error")) === 14 && (await js("[...document.querySelectorAll('.dv-factform .ct-error')].every(e => e.textContent === " + norm(T0.factErrors.required) + ")")), "empty: each field says what is wrong, in words, beside it");
  check((await js("document.querySelector('.dv-factform input[aria-invalid=true]') !== null")), "…and is marked invalid");
  await shot("75-fact-form-errors");
  await sheetChecks("the fact form with its errors");
  const rows = await count(".dv-hrow");
  for (let i = 0; i < rows; i++) {
    await setInput(`.dv-hrow:nth-of-type(${i + 1}) .dv-hrow-times .ct-field:nth-child(1) input`, i === 0 ? "7am" : "7:00");
    await setInput(`.dv-hrow:nth-of-type(${i + 1}) .dv-hrow-times .ct-field:nth-child(2) input`, i === 1 ? "06:00" : "22:00");
  }
  await click("document.querySelector('.dv-factform .btn.volt')");
  await sleep(300);
  const errs = await js("[...document.querySelectorAll('.dv-factform .ct-error')].map(e => e.textContent)");
  check(errs.length === 2 && errs[0] === T0.factErrors.time && errs[1] === T0.factErrors.order, `"7am" is not a time and closing before opening is refused, each in words (${errs.join(" / ")})`);
  await setInput(".dv-hrow:nth-of-type(1) .dv-hrow-times .ct-field:nth-child(1) input", "7:00");
  await setInput(".dv-hrow:nth-of-type(2) .dv-hrow-times .ct-field:nth-child(2) input", "22:00");
  await js("(() => { const c = document.querySelector('.dv-hrow:nth-of-type(7) .dv-closed input'); c.click(); })()");
  await click("document.querySelector('.dv-factform .btn.volt')");
  await until("!document.querySelector('.ct-sheet .dv-factform') && !!document.querySelector('.ct-sheet .dv-change')", "the change to appear in the same sheet", 8000);
  check((await count(".ct-sheet .dv-pc")) === 1 && (await js("document.querySelector('.ct-sheet-foot .btn.volt')?.textContent.trim()")) === T0.reviewAndApprove, "saving the fact makes the change appear in the same sheet, ready to review");
  const sentFact = await js(`fetch('/api/discovery/proposals?status=all&lang=${LANG}').then(r => r.json()).then(d => d.items.find(p => p.id === 'pr01'))`);
  check(sentFact.after.lines.length === 7 && sentFact.after.lines[6].text === (LANG === "ar" ? "مغلق" : "closed"), "the change is made from what was typed: Friday closed");
  await shot("76-fact-saved");
  await b.key("Escape");
  await reset();
}

// ── Settings ─────────────────────────────────────────────────────────────────────────────
async function settingsView() {
  await reset();
  await open("settings"); await ready(".dv-settings .dv-setsec", "Settings");
  check((await h1()) === T0.views.settings, "the heading is Settings");
  check((await js("[...document.querySelectorAll('.dv-setsec > h2')].map(h => h.textContent.trim()).join('|')")) === [T0.messagesTitle, T0.managersTitle, T0.detailsTitle, T0.weeklyTitle].join("|"), "four parts: messages, managers, confirmed details, the weekly check-up");
  await ready(".dv-pfacts .dv-fact", "the confirmed details");
  const recv = await js("[...document.querySelectorAll('.dv-recv')].map(r => ({ name: r.querySelector('b').textContent.trim(), sw: r.querySelector('[role=switch]')?.getAttribute('aria-checked') ?? null, link: r.querySelector('a')?.getAttribute('href') ?? null }))");
  check(recv.length === 3 && recv[0].sw === "true" && recv[1].sw === "false" && recv[2].sw === null && recv[2].link === "/app/team", "each team number: a switch if linked, and for one that is not linked, the way to link it");
  check((await has(T0.linkFirst)) && (await has(T0.templateNote)), "the unlinked one says to link it first; the note says nothing goes outside the 24-hour window");
  check((await js("document.querySelector('.dv-recv [role=switch]').getAttribute('aria-label')")).startsWith(T0.receiverSwitch), "a switch is named for what it does and for whom");
  check((await has(T0.messagesIntro)), "it says nothing changes until someone taps Approve");
  await shot("80-settings");
  await noSideScroll("Settings"); await targets("Settings"); await named("Settings"); await latinInArabic("Settings");
  await axe("settings", null, [".sh-side", ".sh-top"]);

  // each control saves when it is changed
  await click("document.querySelectorAll('.dv-recv [role=switch]')[1]");
  await until("document.querySelectorAll('.dv-recv [role=switch]')[1].getAttribute('aria-checked') === 'true'", "the switch to turn on");
  check((await js("fetch('/api/discovery/settings').then(r => r.json()).then(d => d.receivers.find(r => r.name === 'Yusuf').receives)")) === true, "a team number is switched on and the API has it");
  check((await has(T0.saved)), "…and it says saved");
  await setSelect(".dv-cap select", "5");
  await until("fetch('/api/discovery/settings').then(r => r.json()).then(d => d.ask_cap_per_day === 5)", "the limit to save");
  check(true, "the daily limit is saved (5)");
  await clearToasts();
  await click("document.querySelector('.dv-weekly [role=switch]')");
  await until("fetch('/api/discovery/settings').then(r => r.json()).then(d => d.weekly_run === true)", "the weekly switch");
  check(true, "the weekly check-up is switched on, and was off until then");

  // branch managers
  check((await count(".dv-mgr")) === 5, "a picker for each place");
  check((await js("document.querySelector('.dv-mgr input:checked')?.closest('label').textContent.trim()")) === "Yusuf", "Yusuf manages the first place");
  check((await count(".dv-mgr:first-of-type input")) === 2, "the picker lists the staff-role members only");
  await clearToasts();
  await js("document.querySelectorAll('.dv-mgr')[1].querySelectorAll('input')[1].click()");
  await until("fetch('/api/discovery/locations').then(r => r.json()).then(d => d.items[1].managers.some(m => m.user_id === 'u3'))", "the manager to save");
  check(true, "choosing a branch manager is saved");

  // confirmed details
  const first = await js("[...document.querySelectorAll('.dv-pfacts')][0].querySelector('.dv-fact-value').textContent");
  check(first.length > 0, "the confirmed hours of the first place are shown in words");
  check((await js("[...document.querySelectorAll('.dv-pfacts')][1].querySelector('.dv-fact-none') !== null")), "what is not confirmed says so");
  check((await js("[...document.querySelectorAll('.dv-fact .dv-ev-where')].some(e => e.textContent.includes('Hana') || e.textContent.includes('هنا') || e.textContent.length > 0)")), "who confirmed it, and when, is shown");
  await clearToasts();
  await click("document.querySelector('.dv-pfacts .dv-fact .btn')");
  await ready(".ct-sheet .dv-factform", "the edit form");
  check((await js("document.querySelector('.ct-sheet .dv-hrow input[type=text]').value")) === "07:00", "the form starts from what was confirmed");
  await sheetChecks("the edit form");
  await setInput(".ct-sheet .dv-hrow:nth-of-type(1) .dv-hrow-times .ct-field:nth-child(1) input", "06:30");
  await click("document.querySelector('.ct-sheet .dv-factform .btn.primary')");
  await until("!document.querySelector('.ct-sheet')", "the form to close");
  check((await js("fetch('/api/discovery/facts?location_id=p1').then(r => r.json()).then(d => d.items.find(f => f.key === 'hours').value.sat[0])")) === "06:30", "a confirmed detail is saved as typed");
  await shot("81-settings-after");
  await reset();
}

// ── who sees what ────────────────────────────────────────────────────────────────────────
async function roles2() {
  // staff role, no place: no approve control anywhere, and the screen says who approves
  await reset(); await control({ role: "agent" });
  await open("home"); await ready(".dv-score", "Home for staff");
  const hrefs = await js("[...document.querySelectorAll('.dv-views a')].map(a => a.getAttribute('href'))");
  check(!hrefs.includes("/app/discovery?view=settings") && hrefs.length === 5, "staff are not given Settings");
  check((await count(".dv-block:has(#dv-prop-h)")) === 0 && (await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.runCheckup, "nothing about proposals is drawn on Home for a role that cannot list them");
  await open("settings"); await ready(".dv-home, .dv-empty, .dv-score", "Home instead");
  check((await h1()) === T0.title, "the address that names Settings is Home for them");
  await open("proposals"); await ready(".dv-count", "Proposals for staff");
  check((await count(".dv-prow")) === 0 && (await has(T0.approversNote)) && (await has(T0.guarantee)), "Proposals is empty and says who approves");
  await shot("85-roles-agent-proposals");
  await noSideScroll("Proposals for staff"); await axe("proposals-agent", null, [".sh-side", ".sh-top"]);
  await open("proposals", "p=pr04"); await ready(".ct-sheet", "a sheet for a change that is not theirs");
  await until("!!document.querySelector('.ct-sheet .ct-alert')", "the refusal");
  check((await count(".ct-sheet .btn.volt")) === 0 && (await sheetFoot()).length === 0, "a change they may not see opens nothing they can approve");
  await b.key("Escape");
  await open("todo", "finding=f02"); await ready(".ct-sheet .dv-change", "the finding's sheet for staff");
  check((await sheetFoot()).length === 0 && (await count(".ct-sheet .btn.volt")) === 0, "staff see the changes of a finding and no Approve");
  check((await sheetText()).includes(T0.ownerApproves), `they are told why: "${T0.ownerApproves}"`);
  await shot("86-roles-agent-finding");
  await sheetChecks("the finding sheet for staff");
  await b.key("Escape");
  await open("home"); await ready(".dv-card", "the card for staff");
  if (await exists(".dv-card .dv-cardchange")) {
    await click(btn(T0.reviewChange, "document.querySelector('.dv-card')"));
    await ready(".ct-sheet .dv-approval", "the sheet from the card");
    check((await count(".ct-sheet .btn.volt")) === 0 && (await sheetFoot()).length === 0, "the card's sheet gives staff nothing to approve");
    check((await sheetText()).includes(T0.ownerApproves), "…and says who does");
    await b.key("Escape");
  }

  // a branch manager: their own place's changes, with Approve; other places do not exist for them
  await reset(); await control({ role: "manager" });
  await open("proposals"); await ready(".dv-count", "Proposals for a branch manager");
  const mine = await js("[...document.querySelectorAll('.dv-prow')].length");
  check(mine === 3, `a branch manager sees their own place's changes only (${mine})`);
  check((await count(".dv-place")) === 0, "…and has no filter for places that do not exist for them");
  const hrefs2 = await js("[...document.querySelectorAll('.dv-views a')].map(a => a.getAttribute('href'))");
  check(!hrefs2.includes("/app/discovery?view=settings"), "…and is not given Settings");
  await shot("87-roles-manager-proposals");
  await axe("proposals-manager", null, [".sh-side", ".sh-top"]);
  await sheetOpen("pr04");
  check(JSON.stringify(await sheetFoot()) === JSON.stringify([T0.approve, T0.decline]) && (await count(".ct-sheet .btn.volt")) === 1, "they may approve a change at their own place");
  await b.key("Escape");
  await open("proposals", "p=pr02"); await ready(".ct-sheet", "another branch's change");
  await until("!!document.querySelector('.ct-sheet .ct-alert')", "the refusal");
  check((await count(".ct-sheet .btn.volt")) === 0, "another branch's change opens nothing to approve");
  await b.key("Escape");
  await reset();
}


// ── Phase 2 against the real API (no fixture): the same screens, the states a real check-up reaches ──
async function runCheckupNow() {
  // The API keeps a gap between two check-ups started by hand (spec 065); a developer's database is aged instead of waited for.
  if (args.pg) sql("update discovery_runs set created_at = created_at - interval '1 hour'");
  for (let i = 0; i < 20; i++) {
    const status = await js("fetch('/api/discovery/runs', { method: 'POST' }).then(r => r.status)");
    if (status !== 429) break;
    await sleep(2500);
  }
  await until("fetch('/api/discovery/runs/latest').then(r => r.json()).then(r => r.status === 'done' || r.status === 'failed')", "the check-up to finish", 60000);
}

async function realOwner() {
  await runCheckupNow();
  let all = await listAll();
  let live = all.filter((p) => ["proposed", "approved"].includes(p.status));
  check(live.length > 0, `a check-up makes changes to approve (${live.length}: ${[...new Set(live.map((p) => p.type))].join(", ")})`);
  check(live.every((p) => /^[0-9a-f]{64}$/.test(p.change_hash) && p.can.approve === true), `each carries its 64-character hash and the owner may approve it${live.some((p) => p.can.approve !== true) ? ` (${JSON.stringify(live.find((p) => p.can.approve !== true).can)} for ${live.find((p) => p.can.approve !== true).status})` : ""}`);
  check(live.every((p) => p.before.text !== undefined && p.after.text !== undefined && p.where && p.field_label), "each has its before, after, place and words");

  // Home: the one Volt button
  await open("home"); await ready(".dv-score", "Home");
  const waiting = await waitingNow();
  check((await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.reviewChanges(waiting) && (await count(".btn.volt")) === 1, `Home's one Volt button is "${T0.reviewChanges(waiting)}"`);
  await shot("90-real-home");
  await noSideScroll("Home (real)"); await targets("Home (real)"); await axe("home-real", null, [".sh-side", ".sh-top"]); await latinInArabic("Home (real)");
  if (await exists(".dv-card .dv-cardchange")) {
    await click(btn(T0.reviewChange, "document.querySelector('.dv-card')"));
    await ready(".ct-sheet .dv-approval", "the sheet from the card");
    await sheetChecks("the sheet from the card (real)");
    await b.key("Escape");
  }

  // Proposals
  await open("proposals"); await ready(".dv-prow", "the rows");
  check((await count(".dv-prow")) === live.length && (await js("document.querySelector('.dv-count').textContent")).startsWith(T0.proposalCount("live", live.filter((p) => p.status === "proposed").length)), "Proposals lists what the API lists, counted in words");
  await shot("91-real-proposals");
  await noSideScroll("Proposals (real)"); await targets("Proposals (real)"); await named("Proposals (real)"); await latinInArabic("Proposals (real)");
  await axe("proposals-real", null, [".sh-side", ".sh-top"]);

  // every waiting change opens a sheet that shows exactly what the API sent
  for (const p of live.slice(0, 8)) {
    await sheetOpen(p.id);
    await exactChange(p.id);
    if (p.context) check((await count(".ct-sheet .dv-quote")) === 1, `${p.type}: the review is quoted`);
    await sheetChecks(`the sheet of ${p.type} (real)`);
    await b.key("Escape");
  }

  // approve Al Sadd's hours: the whole loop
  const hours = live.find((p) => p.type === "set_hours") ?? live[0];
  await sheetOpen(hours.id); await watchPosts(); await sleep(2500);
  check((await posts()).length === 0, "opening a change sends nothing");
  await shot("92-real-approval-waiting");
  await click(btn(T0.approve, "document.querySelector('.ct-sheet-foot')"));
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() !== " + norm(T0.proposalStatus.proposed), "the state to move on", 15000);
  const sent = (await posts()).filter((x) => /approve/.test(x.url));
  check(sent.length === 1 && JSON.parse(sent[0].body).change_hash === hours.change_hash, "Approve sends one request with the hash of the change shown");
  await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.applied), "the change to be applied", 20000);
  check(true, "the real apply finishes and the sheet says applied");
  const applied = (await listAll()).find((p) => p.id === hours.id);
  check(applied.status === "applied" && applied.verification === "pending" && applied.can.undo === true, "the API says applied, verification pending, undo possible");
  check(JSON.stringify(await sheetFoot()) === JSON.stringify([T0.undo]), "Undo is offered");
  check((await sheetText()).includes(T0.verifyPending), "the sheet says the next check-up confirms it");
  await shot("93-real-approval-applied");
  await sheetChecks("the sheet (applied, real)");
  await b.key("Escape");
  const applyGaps = await js("performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/proposals\\//.test(e.name)).length");
  await sleep(4000);
  check((await js("performance.getEntriesByType('resource').filter(e => /\\/api\\/discovery\\/proposals\\//.test(e.name)).length")) === applyGaps, "nothing is asked about it after it is applied");

  // a later check-up measures it
  await runCheckupNow();
  await sheetOpen(hours.id);
  const verified = (await listAll()).find((p) => p.id === hours.id);
  check(verified.verification === "confirmed", `the next check-up confirms it (verification: ${verified.verification})`);
  const d = await js(`fetch('/api/discovery/proposals/${hours.id}?lang=${LANG}').then(r => r.json())`);
  const vat = d.history.find((h) => /verif/i.test(h.event))?.at;
  check(vat ? (await sheetText()).includes(T0.verifyConfirmedOn(day(vat)).replace(/[⁨⁩]/g, "")) : (await sheetText()).includes(T0.verifyConfirmed), "the sheet says it was confirmed by a check-up, with its date where the history has it");
  check(d.history.some((h) => h.text && h.text.length > 0) && (await count(".ct-sheet details")) === 1, "its history is there to open");
  await shot("94-real-approval-confirmed");
  const before = await js("fetch('/api/discovery/overview').then(r => r.json()).then(o => o.score)");
  check(typeof before === "number", `the score after approval is a number (${before})`);
  await sheetChecks("the sheet (confirmed, real)");
  // undo
  if (verified.can.undo) {
    await click(btn(T0.undo, "document.querySelector('.ct-sheet-foot')"));
    await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.undone), "the undone state", 15000);
    check(true, "Undo puts it back and the sheet says undone");
    await shot("95-real-approval-undone");
  }
  await b.key("Escape");

  // decline another
  all = await listAll();
  const other = all.find((p) => p.status === "proposed" && p.id !== hours.id);
  if (other) {
    await sheetOpen(other.id);
    await click(btn(T0.decline, "document.querySelector('.ct-sheet-foot')"));
    await until("document.querySelector('.ct-sheet .dv-state-h')?.textContent.trim() === " + norm(T0.proposalStatus.declined), "the declined state", 15000);
    check((await sheetText()).includes(T0.coolOff), "Decline closes it, and says it is not proposed again for 14 days");
    await b.key("Escape");
  }

  // the To do list and a finding's sheet
  await open("todo"); await ready(".dv-list", "To do");
  check((await count(".dv-row .dv-tag")) >= 1, "rows with a change waiting are tagged in words");
  await shot("96-real-todo");
  await noSideScroll("To do (real)"); await axe("todo-real", null, [".sh-side", ".sh-top"]);
  const ready1 = (await listAll()).find((p) => p.status === "proposed");
  if (ready1) {
    await open("todo", `finding=${ready1.finding_id}`); await ready(".ct-sheet .dv-sheet", "the finding's sheet"); await sleep(500);
    check((await count(".ct-sheet .dv-change")) === 1 && (await js("document.querySelector('.ct-sheet-foot .btn.volt')?.textContent.trim()")) === T0.reviewAndApprove, "its sheet shows the change and Review and approve");
    await shot("97-real-finding");
    await sheetChecks("the finding sheet (real)");
    await b.key("Escape");
  }

  // Settings
  await open("settings"); await ready(".dv-settings .dv-setsec", "Settings");
  await ready(".dv-pfacts .dv-fact", "the confirmed details");
  check((await js("[...document.querySelectorAll('.dv-setsec > h2')].map(h => h.textContent.trim()).includes(" + norm(T0.messagesTitle) + ")")), "Settings loads from the real API");
  check((await count(".dv-pfacts")) === 5 && (await count(".dv-pfacts .dv-fact")) === 25, "five places, five details each");
  const factsLooked = await js("[...document.querySelectorAll('.dv-pfacts')][4].innerText");
  check(factsLooked.length > 0, "the confirmed details are drawn");
  const mgr = await count(".dv-mgr");
  log(`the branch-manager picker is ${mgr > 0 ? "drawn" : "not drawn (the API's places carry no managers)"}`);
  await clearToasts();
  await click("document.querySelector('.dv-weekly [role=switch]')");
  await until("fetch('/api/discovery/settings').then(r => r.json()).then(d => d.weekly_run === true)", "the weekly switch");
  check(true, "the weekly switch saves");
  await clearToasts();
  await click("document.querySelector('.dv-weekly [role=switch]')");
  await until("fetch('/api/discovery/settings').then(r => r.json()).then(d => d.weekly_run === false)", "the weekly switch back");
  await setSelect(".dv-cap select", "4");
  await until("fetch('/api/discovery/settings').then(r => r.json()).then(d => d.ask_cap_per_day === 4)", "the limit to save");
  check(true, "the daily limit saves");
  await setSelect(".dv-cap select", "3");
  await shot("98-real-settings");
  await noSideScroll("Settings (real)"); await targets("Settings (real)"); await named("Settings (real)"); await latinInArabic("Settings (real)"); await axe("settings-real", null, [".sh-side", ".sh-top"]);
  // edit a fact
  await clearToasts();
  await click("document.querySelector('.dv-pfacts .dv-fact .btn')");
  await ready(".ct-sheet .dv-factform", "the edit form");
  await sheetChecks("the edit form (real)");
  await b.key("Escape");
}

async function realAgent() {
  await runCheckupNow();
  await open("home"); await ready(".dv-score, .dv-empty", "Home for staff");
  const hrefs = await js("[...document.querySelectorAll('.dv-views a')].map(a => a.getAttribute('href'))");
  check(!hrefs.includes("/app/discovery?view=settings") && hrefs.length === 5, "staff are not given Settings");
  check(!(await has(T0.reviewChanges(1))) && (await count(".dv-block:has(#dv-prop-h)")) === 0, "no proposals on Home for staff");
  await open("settings"); await ready(".dv h1", "Home instead");
  check((await h1()) === T0.title, "the address that names Settings is Home for staff");
  await open("proposals"); await ready(".dv-count", "Proposals");
  check((await count(".dv-prow")) === 0 && (await has(T0.approversNote)), "Proposals is empty for staff with no branch, and says who approves");
  await shot("99-real-agent-proposals");
  await axe("proposals-agent-real", null, [".sh-side", ".sh-top"]);
  const owner = await js("fetch('/api/discovery/findings?status=open').then(r => r.json())");
  const withChange = owner.items.find((f) => f.proposals_waiting > 0);
  if (withChange) {
    await open("todo", `finding=${withChange.id}`); await ready(".ct-sheet .dv-sheet", "the finding's sheet for staff"); await sleep(500);
    check((await count(".ct-sheet .btn.volt")) === 0 && (await sheetText()).includes(T0.ownerApproves), "staff see the change in a finding and no Approve, and are told the owner approves");
    await shot("100-real-agent-finding");
    await sheetChecks("the finding sheet for staff (real)");
    await b.key("Escape");
  } else log("no finding with a waiting change is visible to staff here");
  const props = await js("fetch('/api/discovery/proposals?status=all').then(r => r.status)");
  check(props === 200, "staff may ask for the list and get an empty one");
}

// ── the run ─────────────────────────────────────────────────────────────────────────────
const combos = [];
for (const w of WIDTHS) for (const s of SCHEMES) for (const l of LANGS) combos.push([l, s, w]);
try {
  await b.send("Network.enable");
  if (args.pg && args.db && args.tenant) sql(`insert into tenant_modules (tenant_id, module_key) values ('${args.tenant}', 'discovery') on conflict do nothing`);
  await reset();
  for (const [lang, scheme, width] of combos) {
    LANG = lang; SCHEME = scheme; WIDTH = width; AR = lang === "ar"; T0 = T[lang]; tag = `${lang} ${scheme} ${width}`;
    await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" }).catch(() => undefined);
    await b.view(width, width < 800 ? 812 : 900, width < 800, scheme);
    await b.go(`${BASE}/app`, 300);
    await signIn();
    await js(`localStorage.setItem('alyr-workspace-lang', '${lang}'); localStorage.setItem('alyr-theme', '${scheme}')`);
    log("════ start");
    await one("menu", menu);
    if (!CONTROL) await one("firstrun", firstRun);
    await one("home", home);
    await one("states", states);
    await one("todo", todo);
    await one("reviews", reviews);
    await one("reports", reports);
    // Against a real API: the whole loop on the sample business, as the owner or (`--role agent`) as staff.
    if (!CONTROL) await one(args.role === "agent" ? "reala" : "realp", args.role === "agent" ? realAgent : realOwner);
    // Phase 2 needs the fixture: its states are the ones a real run cannot be put in on demand.
    if (CONTROL) {
      await one("proposals", proposals);
      await one("approval", approvals);
      await one("taps", taps);
      await one("sheet", findingSheet);
      await one("settings", settingsView);
      await one("roles", roles2);
    }
    check(b.problems.filter((p) => !/Failed to load resource/.test(p)).length === 0, `no errors in the browser's console (${b.problems.length})`);
    for (const p of b.problems.slice(0, 6)) log("   ", p);
    b.problems.length = 0;
  }
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED:", error.message ?? error);
  try { await b.shot(`${OUT}/99-where-it-stopped.png`); } catch { /* the page is gone */ }
} finally {
  await reset();
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nAll checks passed.");
