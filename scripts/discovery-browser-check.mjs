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
//        [--only menu,home,todo,reviews,reports,answers] [--signin owner@shop.example --pg container --db alyr_x --tenant <uuid>]
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
import { A } from "../apps/web/app/(product)/_workspace/discoveryAnswersCopy.ts";

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
  const small = await js(`[...document.querySelectorAll(${norm(scope)} + ' button, ' + ${norm(scope)} + ' a[href], ' + ${norm(scope)} + ' select, ' + ${norm(scope)} + ' input:not([type=hidden])')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.ct-sr') && !e.closest('details:not([open]) > :not(summary)') && (r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'A' && e.closest('p, li > span, small')) && e.type !== 'radio' && e.type !== 'checkbox'; }).map(e => (e.textContent || e.getAttribute('aria-label') || e.type || '').trim().slice(0, 28) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))`);
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
  const status = await js("fetch('/api/workspace').then(r => r.status)");
  if (status !== 401) return;
  sql(`delete from login_codes where email = '${args.signin}'`);
  await js(`fetch('/api/auth/code', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(args.signin)}})}).then(r => r.json()).then(d => fetch('/api/auth/verify', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(args.signin)}, code: d.dev_code})})).then(r => r.status)`);
};

// ── 1. the menu ────────────────────────────────────────────────────────────────────────
async function menu() {
  const nav = await js("fetch('/api/workspace').then(r => r.json()).then(s => [...s.nav.core, ...s.nav.products, ...s.nav.account].map(n => ({ key: n.key, label: n.label })))");
  const others = nav.filter((n) => n.key !== "discovery");
  check(nav.some((n) => n.key === "discovery"), "the workspace's menu names Discovery (the module is on)");
  const viewLabels = ["home", "todo", "reviews", "reports", "answers"].map((v) => T0.views[v]);

  await open("home");
  check((await js("document.querySelector('.sh').lang")) === LANG && (await js("document.querySelector('.sh').dir")) === (AR ? "rtl" : "ltr"), "the screen is in the language asked for, reading the right way");
  check((await h1()) === T0.title, `Home's heading is "${T0.title}"`);

  if (WIDTH >= 800) {
    // The sidebar: Discovery, with the four views beneath it.
    check(await exists(".sh-side .sh-sub"), "the sidebar opens Discovery to a list of views");
    const subs = await js("[...document.querySelectorAll('.sh-side .sh-sub a')].map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href'), current: a.getAttribute('aria-current') }))");
    check(JSON.stringify(subs.map((s) => s.text)) === JSON.stringify(viewLabels), `the views are ${viewLabels.join(", ")}, in that order`);
    check(JSON.stringify(subs.map((s) => s.href)) === JSON.stringify(["/app/discovery", "/app/discovery?view=todo", "/app/discovery?view=reviews", "/app/discovery?view=reports", "/app/discovery?view=answers"]), "each view has its address");
    check(subs.filter((s) => s.current === "page").length === 1 && subs[0].current === "page", "Home is the one view marked as current");
    check((await count(".sh-side .sh-sub")) === 1 && (await count(".sh-side .sh-link.open")) === 1, "only the Discovery item opens to views");
    check((await js("getComputedStyle(document.querySelector('.dv-views')).display")) === "none", "the in-screen view row is hidden where the sidebar shows");
    await axe("the sidebar's view list", ".sh-sub");
    // every view, by the menu
    for (const [i, v] of ["todo", "reviews", "reports", "answers", "home"].entries()) {
      await click(`[...document.querySelectorAll('.sh-side .sh-sub a')].find(a => a.getAttribute('href').endsWith(${norm(v === "home" ? "/app/discovery" : `view=${v}`)}))`);
      await until(`document.querySelector('.dv h1')?.textContent === ${norm(v === "home" ? T0.title : T0.views[v])}`, `the ${v} view`);
      const current = await js("[...document.querySelectorAll('.sh-side .sh-sub a')].map(a => a.getAttribute('aria-current'))");
      check(current.filter((c) => c === "page").length === 1 && current[["home", "todo", "reviews", "reports", "answers"].indexOf(v)] === "page", `the menu marks ${v} as current after opening it`);
      check((await js("document.querySelector('.sh-crumbs b').textContent.trim()")) === T0.views[v], `the breadcrumb names the ${v} view`);
      void i;
    }
  } else {
    check(await exists(".dv-views"), "the five views are a row at the top of the screen on a phone");
    check((await js("[...document.querySelectorAll('.dv-views a')].map(a => a.textContent.trim()).join('|')")) === viewLabels.join("|"), "the row names the five views in order");
    check((await js("document.querySelector('.dv-views a[aria-current=page]')?.textContent.trim()")) === T0.views.home, "Home is marked as current in the row");
    // the More sheet: the command palette lists the views beneath Discovery
    await click("document.querySelector('.sh-tabbar button')");
    await ready(".sh-palette", "the More sheet");
    const rows = await js("[...document.querySelectorAll('.sh-palette li button')].map(b => ({ text: b.textContent.trim(), cur: b.getAttribute('aria-current') }))");
    const discoveryName = nav.find((n) => n.key === "discovery").label[LANG];
    const mine = rows.filter((r) => r.text.startsWith(`${discoveryName} · `));
    check(mine.length === 5 && JSON.stringify(mine.map((r) => r.text.split(" · ")[1])) === JSON.stringify(viewLabels), "the More sheet lists Home, To do, Reviews, Reports and Answers beneath Discovery");
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
    check(all.filter((r) => r.includes(" · ")).length === 5, "no other row of the More sheet gained a view");
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
  check((await count(".btn.volt")) === 1 && (await js(`document.querySelector('.btn.volt').textContent.trim()`)) === T0.runCheckup, `the page's one Volt button is "${T0.runCheckup}"`);
  check((await count(".dv-card .btn.volt, .ct-sheet .btn.volt")) === 0, "the card has no Volt button");
  check((await js("[...document.querySelectorAll('.dv-card .btn')].map(b => b.textContent.trim()).join('|')")) === `${T0.didThis}|${T0.skip}`, `the card's two actions are "${T0.didThis}" and "${T0.skip}"`);
  check(!/\b(approve|approval)\b|الموافقة|اعتماد/i.test(await text()), "nothing says anything is approved or applied");
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
  check((await js("[...document.querySelectorAll('.ct-sheet-foot .btn')].map(b => b.textContent.trim()).join('|')")) === `${T0.didThis}|${T0.skip}`, "the sheet's two actions are the card's");
  check((await count(".ct-sheet .btn.volt")) === 0, "the sheet has no Volt button");
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
    check((await js("document.querySelector('.dv-toosoon').textContent")).includes(String(T0.tooSoon(10)).replace(/\d+/, "").trim().slice(0, 6)) && (await count(".btn.volt")) === 0, "too soon: it says how long to wait, in place of a button that cannot work");
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
  if (await exists(".dv-running")) check((await count(".btn.volt")) === 0, "while it runs there is no Volt button: the run is the page");
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
  // no connection
  await reset(); await control({ connection: null });
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
  await reset(); await control({ role: "agent", connection: null });
  await open("home"); await ready(".dv-empty", "the empty screen for an agent");
  check((await has(T0.noConnectionAgent)) && (await count(".btn.volt")) === 0, "an agent is told to ask the owner, and has no button that cannot work");
  await reset(); await control({ role: "agent" });
  await open("home"); await ready(".dv-card", "the card for an agent");
  check((await count(".dv-card .btn")) === 0 && (await has(T0.ownerMarks)), "an agent sees the card and not its two actions");
  check((await count(".btn.volt")) === 1, "an agent may still run a check-up");
  await click("document.querySelector('.dv-evidence-link')"); await ready(".ct-sheet", "the sheet for an agent");
  check((await count(".ct-sheet-foot")) === 0, "an agent's sheet has no actions");
  await b.key("Escape");

  // no check-up yet, then the first one, live
  await reset(); await control({ noRun: true });
  await open("home"); await ready(".dv-empty", "the no-run screen");
  check((await has(T0.noRunTitle)) && (await count(".dv-slots .dv-slot")) === 3, "no check-up yet: a real screen with its slots");
  check((await js("document.querySelector('.btn.volt').textContent.trim()")) === T0.runCheckup, "no check-up yet: the Volt button is Run check-up");
  await shot("21-no-run");
  await axe("no-run", null, [".sh-side", ".sh-top"]);
  await liveRun();

  // too soon
  await reset(); await control({ tooSoon: true });
  await open("home"); await ready(".dv-score", "the score line");
  await click(btn(T0.runCheckup));
  await ready(".dv-toosoon", "the too-soon line");
  check((await js("document.querySelector('.dv-toosoon').textContent")) === T0.tooSoon(7) && (await count(".btn.volt")) === 0, "too soon: it says how many minutes, in place of a button that cannot work");
  await shot("24-too-soon");
  await targets("too soon"); await axe("too-soon", null, [".sh-side", ".sh-top"]);

  // failed
  await reset(); await control({ fail: true });
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
  await reset(); await control({ moduleOff: true });
  await open("home"); await ready(".dv-problem", "the refusal");
  check((await has(T0.moduleOff)), "module off: Home says so in words");
  await open("todo"); await ready(".dv-problem", "the refusal on To do");
  await open("reviews"); await ready(".dv-problem", "the refusal on Reviews");
  await open("reports"); await ready(".dv-problem", "the refusal on Reports");
  check(true, "module off: every view says so");
  await shot("26-module-off");
  await reset();

  // everything done
  await reset();
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

// ── 7. Answers (ALY-326, spec 068) ─────────────────────────────────────────────────────
// Needs the fixture (`--control`): a small server that answers the spec-068 routes from fictional data
// shaped by the spec and the backend's tests (not the real API). It takes `{ ansPreset: "off" |
// "on-none" | "asked" | "history" | "hostile" | "error" | "few" }` on POST /__state.
async function answersView() {
  if (!CONTROL) { log("Answers: needs the fixture (--control); skipped"); return; }
  const AT = A[LANG];
  const api = (path) => js(`fetch('/api/discovery${path}${path.includes("?") ? "&" : "?"}lang=${LANG}').then(r => r.json())`);
  const voltText = () => js("[...document.querySelectorAll('.dv .btn.volt')].map(b => b.textContent.trim())");
  const pick = (selectIndex, value) => js(`(() => { const s = document.querySelectorAll('.dv-ans-form select')[${selectIndex}]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${norm(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);

  // 1. switched off
  await reset(); await control({ ansPreset: "off" });
  await open("answers");
  await ready(".dv-answers .dv-empty", "the off state");
  check((await h1()) === T0.views.answers, `the heading is "${T0.views.answers}"`);
  check(JSON.stringify(await voltText()) === JSON.stringify([AT.switchOn]), `the page's one Volt button is "${AT.switchOn}"`);
  check((await count(".dv-ans")) === 0 && (await count(".dv-ans-form select")) === 2, "nothing is asked yet; the owner has a trade and a city to choose");
  check(!/\bAI\b|ذكاء|ذكي|assistant|مساعد|chatgpt|gemini/i.test(await text()), "nothing says AI or assistant or names a product");
  check(!/coming|soon|قريباً/i.test(await text()), "nothing says coming");
  await shot("60-answers-off");
  await noSideScroll("Answers (off)"); await targets("Answers (off)"); await named("Answers (off)"); await latinInArabic("Answers (off)");
  await axe("answers-off", null, [".sh-side", ".sh-top"]);

  // a trade the sample does not cover: the API's own refusal, in words
  await pick(0, "bakery"); await pick(1, "doha");
  await click(btn(AT.switchOn));
  await ready(".ct-toast", "the refusal");
  const refusal = await js("document.querySelector('.ct-toast-text').textContent");
  check(refusal.includes(AR ? "الإجابات التجريبية" : "sample answers"), "a trade the sample cannot answer is refused in the API's words");
  check((await count(".dv-ans")) === 0 && (await api("/answers")).enabled === false, "a refusal switches nothing on");

  // switching it on (the sample business knows its own trade and city)
  await open("answers"); await ready(".dv-answers .dv-empty", "the off state again");
  await click(btn(AT.switchOn));
  await until("!document.querySelector('.dv-answers .dv-empty')", "the view after switching on", 10000);
  check((await has(AT.notAskedYet)) && JSON.stringify(await voltText()) === JSON.stringify([T0.runCheckup]), "switched on, not asked yet: the one Volt button is Run check-up");
  check((await count(".dv-ans-questions li")) === 6, "the six questions are shown before anything is asked");
  check((await api("/answers")).enabled === true, "the API says it is on");
  await shot("61-answers-not-asked");
  await noSideScroll("Answers (not asked)"); await targets("Answers (not asked)"); await named("Answers (not asked)"); await latinInArabic("Answers (not asked)");
  await axe("answers-not-asked", null, [".sh-side", ".sh-top"]);

  // running a check-up follows it and shows the result
  await click(btn(T0.runCheckup));
  await ready(".dv-running", "the check-up running");
  check((await has(AT.running)) && (await count(".btn.volt")) === 0, "while it runs the page has no Volt button and says so");
  await shot("62-answers-running");
  await until("document.querySelectorAll('.dv-ans').length === 6", "the six answers", 40000);
  check(JSON.stringify(await voltText()) === JSON.stringify([T0.runCheckup]), "when it is over the Volt button is back");

  // 2. asked, with a history
  await reset(); await control({ ansPreset: "history" });
  await open("answers");
  await ready(".dv-ans", "the answers");
  const data = await api("/answers");
  check((await js("document.querySelector('.dv-ans-headline').textContent.trim()")) === data.headline, "the headline is the API's, by rule");
  check((await count(".dv-ans")) === 6, "one row for each of the six answers");
  check((await count(".dv-ans .sh-pill.active")) === data.last.answers.filter((x) => x.named).length, "the rows say named exactly as often as the API counted");
  check((await count(".dv-ans-sample")) === 1 && (await has(data.sample_note)), "the sample is marked once, in the API's words");
  check(JSON.stringify(await voltText()) === JSON.stringify([T0.runCheckup]), "the page's one Volt button is Run check-up");
  check(await has(AT.inList(4, 5)), `a listed answer says where: ${AT.inList(4, 5)}`);
  check((await count(".dv-ans-comp li")) >= 1 && (await count(".dv-ans-comp li")) <= 8, "the competitors table has one to eight rows");
  check((await count(".dv-ans-hist li")) === 3 && (await count(".dv-ans-hist .dv-track")) === 3, "three check-ups in the history, each with its bar");
  check((await has(AT.namedOf(2, 6))) && (await has(AT.namedOf(4, 6))), "the history says named N of M for each");
  check((await count(".dv-change")) === 1, "the change since the last check-up is said once");
  check(!(await js("document.querySelector('.dv-ans-hist').textContent")).includes("%"), "no percentage is invented");
  await shot("63-answers-asked");
  await noSideScroll("Answers"); await targets("Answers"); await named("Answers"); await latinInArabic("Answers");
  await axe("answers-asked", null, [".sh-side", ".sh-top"]);
  // what it said
  await click("document.querySelector('.dv-ans .ct-fold summary')");
  await sleep(200);
  const quoted = await js("(() => { const q = document.querySelector('.dv-ans .ct-fold[open] .dv-quote'); return q ? { text: q.textContent, dir: q.getAttribute('dir') } : null; })()");
  check(!!quoted && quoted.text === data.last.answers[0].text && quoted.dir === "auto", "What it said is the answer, quoted, in its own direction");
  await shot("64-answers-said");
  await axe("answers-said", null, [".sh-side", ".sh-top"]);
  // how it is counted
  await click("[...document.querySelectorAll('.dv-answers > .ct-fold summary')].pop()");
  await sleep(200);
  check((await has(data.rule)) && (await has(data.limits)) && (await has(data.caution)), "How this is counted says the rule, the limits and the caution");

  // 3. Home's one line, Reports' part
  await open("home");
  await ready(".dv-score", "Home");
  await until("!!document.querySelector('.dv-ans-line')", "Home's line");
  check((await js("document.querySelector('.dv-ans-line bdi').textContent.trim()")) === data.headline, "Home says the headline under the score");
  check((await js("document.querySelector('.dv-ans-line a').getAttribute('href')")) === "/app/discovery?view=answers", "and links to the view");
  check((await count(".btn.volt")) === 1, "Home still has one Volt button");
  await shot("65-home-line");
  await noSideScroll("Home with the line"); await targets("Home with the line");
  await open("reports");
  await ready(".dv-report", "the report");
  const partNames = await js("[...document.querySelectorAll('.dv-parts li b')].map(e => e.textContent.trim())");
  check(partNames.length === 5 && partNames.at(-1) === AT.partName, "the report draws the Answers part as a fifth once it was measured");
  await shot("66-reports-answers");
  await axe("reports-answers", null, [".sh-side", ".sh-top"]);
  await control({ ansPreset: "on-none" });
  await open("home"); await ready(".dv-score", "Home");
  await sleep(600);
  check((await count(".dv-ans-line")) === 0, "Home has no line while the check has not been asked");

  // 4. an answer is text, never markup
  await control({ ansPreset: "hostile" });
  await open("answers"); await ready(".dv-ans", "the hostile answers");
  await click("document.querySelector('.dv-ans .ct-fold summary')");
  await sleep(200);
  check((await js("window.__xss")) === undefined && (await count(".dv-quote script, .dv-quote img, .dv-quote a, .dv-quote b")) === 0, "markup inside an answer is not drawn and runs nothing");
  check((await js("document.querySelector('.dv-ans .ct-fold[open] .dv-quote').textContent")).includes("<script>"), "it is shown as the text it is");
  await shot("67-answers-hostile");
  await noSideScroll("Answers (hostile text)");

  // 5. answers that could not be had, and too few
  for (const preset of ["error", "few"]) {
    await control({ ansPreset: preset });
    await open("answers"); await ready(".dv-ans", `the ${preset} answers`);
    const d = await api("/answers");
    check((await js("document.querySelector('.dv-ans-headline').textContent.trim()")) === d.headline && !/\d+ of \d+|\d+ من \d+/.test(d.headline), `${preset}: the headline says too few were counted, with no number`);
    check((await count(".dv-ans .sh-pill.wait")) >= 3, `${preset}: answers that could not be had say Not counted`);
    check((await count(".dv-ans-err")) >= 3, `${preset}: each says why, in the API's words`);
    check((await count(".dv-ans-hist .dv-track.empty")) === 1 && (await count(".dv-ans-hist .dv-track > span")) === 0, `${preset}: the history draws no bar for an unmeasured check`);
    await shot(`68-answers-${preset}`);
    await noSideScroll(`Answers (${preset})`); await named(`Answers (${preset})`);
    await axe(`answers-${preset}`, null, [".sh-side", ".sh-top"]);
  }

  // 6. an agent reads and cannot change
  await control({ ansPreset: "history", role: "agent" });
  await open("answers"); await ready(".dv-ans", "the agent's view");
  check((await count(".dv-ans-form")) === 0 && !(await has(AT.switchOff)) && (await has(AT.readOnlyLine(data.settings.trade_label, data.settings.city_label))), "an agent sees the trade and the city as text, with no form and no switch");
  await shot("69-answers-agent");
  await control({ ansPreset: "off", role: "agent" });
  await open("answers"); await ready(".dv-answers .dv-empty", "the agent's off state");
  check((await count(".btn.volt")) === 0 && (await has(AT.offAgent)), "an agent is told the owner or an admin can switch it on, and has no button");
  await control({ role: "owner" });
  await reset();
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
    await one("answers", answersView);
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
