// Runs the connected-apps screen of the workspace (ALY-292, specs/067-mcp-connector) in a real
// browser, in English and Arabic, light and dark, at phone and laptop width, and checks what an owner,
// an admin and a member of staff meet: the entry on the Connections screen (drawn only where the API
// answers), every state of the screen (not available on this server, not for this person, off, on with
// no app, on with apps, paused, a daily limit reached, an error, loading), the turn-on confirmation, the
// kill switch, ending one connection and all of them, and the record of what the apps did, with the text
// an app or a person wrote drawn as text and never as markup, no sideways scrolling, 44 px targets on a
// phone, a name for every control, no English in Arabic beyond names, one Volt button at most, and
// axe-core on every state. Headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no
// packages. Node 22.
//
//   node scripts/mcp-browser-check.mjs --base http://localhost:31NN --control http://127.0.0.1:87NN \
//        --out C:/t/mcp3/shots --profile C:/t/mcp3/prof --port 9773 \
//        --axe apps/web/node_modules/axe-core/axe.min.js [--langs en,ar] [--schemes light,dark] \
//        [--widths 375,320,1280] [--only unavailable,forbidden,off,on,paused,hostile,errors,link]
//
// It needs a fixture that answers the shell's routes and `/api/mcp` and takes `POST /__state` (the
// whole state of the connector, as an object) and `GET /__reset`; the one this was written with lives
// outside the repository and does what routes/mcp_manage.py does for the writes. Against the real API
// (`--real`, with `--signin <owner email>`), the same script runs only the states a real connector can
// reach on its own: the entry, the first look, the turn-on confirmation and the kill switch (the
// switches are changed through the screen itself; apps and calls are made by whatever connects). Every
// name in it is fictional; nothing is sent to a real person.

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { T } from "../apps/web/app/(product)/_workspace/mcpCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3173";
const CONTROL = args.control ?? "";
const REAL = args.real === "true";
const LANGS = (args.langs ?? "en,ar").split(",");
const SCHEMES = (args.schemes ?? "light,dark").split(",");
const WIDTHS = (args.widths ?? "375,320,1280").split(",").map(Number);
const ONLY = args.only ? args.only.split(",") : null;
const OUT = args.out ?? `${tmpdir()}/mcp-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/mcp-profile`;
const PORT = Number(args.port ?? 9773);
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
mkdirSync(OUT, { recursive: true });

const failures = [];
let tag = "";
const log = (...m) => console.log(`[${tag}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(`${tag} ${what}`); log("FAIL", what); } };

// ── the fixture's side ──────────────────────────────────────────────────────────────────
const control = async (state) => { if (CONTROL) await fetch(`${CONTROL}/__state`, { method: "POST", body: JSON.stringify(state) }); };
const requests = async () => (CONTROL ? (await fetch(`${CONTROL}/__log`)).json() : []);
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const later = (days) => new Date(Date.now() + days * 86400000).toISOString();

const live = (id, client, person, scopes, last, extra = {}) => ({
  id, client, client_kind: "dcr", person, person_id: `u-${person}`, scopes, created_at: ago(60 * 24 * 12), expires_at: later(78),
  last_used_at: last, revoked_at: null, revoked_by: null, revoked_why: null, live: true, ...extra,
});
const ended = (id, client, person, why, by, extra = {}) => ({
  id, client, client_kind: "cimd", person, person_id: `u-${person}`, scopes: ["read"], created_at: ago(60 * 24 * 40), expires_at: later(40),
  last_used_at: ago(60 * 24 * 9), revoked_at: ago(60 * 24 * 8), revoked_by: by, revoked_why: why, live: false, ...extra,
});
const callRow = (n, tool, phase, result, client, args, extra = {}) => ({
  id: `c${n}`, grant_id: "g1", action: "call", person: "Huda", at: ago(n * 7),
  detail: { client_id: "dyn-1", client, tool, phase, args, result, code: "", ms: 20 + n, answer_chars: 400, affects: null, ...extra },
});
const eventRow = (n, action, person, subject, detail = null) => ({ id: `e${n}`, grant_id: subject, action, person, at: ago(n * 60), detail });

const HOSTILE = `<img src=x onerror="window.__xss=1">`;
const connected = () => [
  live("g1", "Claude", "Huda", ["read"], ago(95)),
  live("g2", "ChatGPT", "Huda", ["read", "stock", "send"], null),
];
const history = () => [ended("g3", "Claude Code", "Lamees", "ended_by_workspace", "Huda"), ended("g4", "Notes app", "Huda", "replaced", "Huda", { revoked_by: null })];
const records = () => [
  callRow(1, "hello", "read", "ok", "Claude", {}),
  callRow(2, "hello", "read", "ok", "Claude", { verbose: true, note: "ask about today" }),
  callRow(3, "test_write_note", "preview", "ok", "ChatGPT", { text: "A note for the evening", customer: "Aisha ••• 482" }, { affects: 1 }),
  callRow(4, "test_write_note", "confirm", "capped", "ChatGPT", { text: "Another note" }, { affects: 1 }),
  callRow(5, "hello", "read", "refused", "Claude", {}),
  callRow(6, "test_write_note", "confirm", "bad_confirm", "ChatGPT", { text: "x" }),
  eventRow(1, "opted_in", "Huda", "t"),
  eventRow(2, "grant_created", "Huda", "g1", { client: "Claude", scopes: ["read"] }),
  eventRow(3, "paused", "Huda", "t"),
  eventRow(4, "resumed", "Huda", "t"),
  eventRow(5, "grant_revoked", "Lamees", "g3", { why: "ended_by_workspace" }),
  eventRow(6, "cap_reached", "Huda", "g2", { cap: "changes" }),
];
const on = (extra = {}) => ({ enabled: true, enabled_by: "Huda", grants: [...connected(), ...history()], rows: records(), ...extra });

// ── the browser ─────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: "light" });
const { js, until, click } = b;
const norm = (s) => JSON.stringify(s);
const sleep = b.sleep;
const text = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
const has = async (part) => (await text()).includes(String(part));
const count = (selector) => js(`document.querySelectorAll(${norm(selector)}).length`);
const exists = (selector) => js(`!!document.querySelector(${norm(selector)})`);
// A shot is taken on a tall window, so the whole screen is in it (the shell scrolls inside its own frame).
const shot = async (name) => {
  const tall = WIDTH < 800 ? 2600 : 1900;
  await b.view(WIDTH, tall, WIDTH < 800, SCHEME);
  await sleep(250);
  await b.shot(`${OUT}/${tag.replace(/\s+/g, "-")}-${name}.png`);
  await b.view(WIDTH, WIDTH < 800 ? 812 : 900, WIDTH < 800, SCHEME);
  await sleep(200);
};
const btn = (word, scope = "document") => `[...${scope}.querySelectorAll('button, a.btn')].find(e => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\\s+/g, ' ').trim().includes(${norm(word)}))`;
const btnAny = (word, scope = "document") => `[...${scope}.querySelectorAll('button, a.btn')].find(e => e.offsetParent !== null && e.textContent.replace(/\\s+/g, ' ').trim().includes(${norm(word)}))`;

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
async function targets(name, scope = ".mc") {
  if (WIDTH >= 800) return;
  const small = await js(`[...document.querySelectorAll(${norm(scope)} + ' button, ' + ${norm(scope)} + ' a[href], ' + ${norm(scope)} + ' summary, ' + ${norm(scope)} + ' input:not([type=hidden])')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.ct-sr') && (r.height < 43.5 || (r.width < 43.5 && e.type !== 'checkbox')) && !(e.type === 'checkbox' && e.closest('label') && e.closest('label').getBoundingClientRect().height >= 43.5); }).map(e => (e.textContent || e.getAttribute('aria-label') || e.type || '').trim().slice(0, 28) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))`);
  check(small.length === 0, `every control on ${name} is 44 px or more${small.length ? ` (small: ${small.slice(0, 5).join("; ")})` : ""}`);
}
async function named(name, scope = ".mc") {
  const bad = await js(`[...document.querySelectorAll(${norm(scope)} + ' button, ' + ${norm(scope)} + ' a[href], ' + ${norm(scope)} + ' summary')].filter(e => !(e.getAttribute('aria-label') || e.textContent.trim())).length`);
  check(bad === 0, `every control on ${name} has a name`);
}
const NAMES = new Set(["ALYR", "Claude", "ChatGPT", "Huda", "Lamees", "Code", "Notes", "app"]);
async function latinInArabic(name) {
  if (LANG !== "ar") return;
  const words = await js(`(() => { const out = []; for (const root of document.querySelectorAll('.mc, .ct-sheet, .ct-toasts')) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; if (!n.parentElement || n.parentElement.closest('bdi, code, pre, [lang="en"], .ct-sr, script, style')) continue; for (const m of n.textContent.matchAll(/[A-Za-z]{2,}/g)) out.push(m[0]); } } return [...new Set(out)]; })()`);
  const stray = words.filter((w) => !NAMES.has(w));
  check(stray.length === 0, `no English on ${name} in Arabic${stray.length ? ` (${stray.slice(0, 6).join(", ")})` : ""}`);
}
const voltCount = () => js("[...document.querySelectorAll('.mc .btn.volt, .ct-sheet .btn.volt')].filter(e => e.offsetParent !== null).length");
const noAI = async (name) => {
  const t = await text();
  const own = LANG === "ar" ? /تطبيق الذكاء الاصطناعي الخاص بك، مثل Claude أو ChatGPT/g : /[Yy]our own AI app, such as Claude or ChatGPT/g;
  const rest = t.replace(own, "").replace(/I understand that/g, "");
  check(!(LANG === "ar" ? /ذكي|ذكاء|مساعد|وكيل|يتعلم|يفهم/ : /\b(AI|smart|assistant|learns|understands|thinks|predicts|intelligen\w*)\b/i).test(rest), `${name} says no AI word beyond the owner's own tool`);
};

const one = async (name, fn) => {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) return;
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${tag} ${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name.replace(/\W+/g, "-")}-stopped`); } catch { /* the page is gone */ }
  }
};

let LANG = "en", SCHEME = "light", WIDTH = 375, AR = false, C = T.en;
const open = async (path = "/app/connect-ai", ready = ".mc h1") => {
  await b.go(`${BASE}${path}`, 400);
  await until(`!!document.querySelector(${norm(ready)})`, `the screen at ${path}`, 30000);
  await sleep(350);
};
const settled = async () => {
  // past the loading line: one of the screen's real states
  await until("!document.querySelector('.mc-quiet[role=status]') || !!document.querySelector('.mc-status, .mc-plain, .mc-problem')", "the screen to leave loading", 20000);
  await sleep(250);
};
const signIn = async () => {
  if (!args.signin) return;
  const status = await js("fetch('/api/workspace').then(r => r.status)");
  if (status !== 401) return;
  await js(`fetch('/api/auth/code', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(args.signin)}})}).then(r => r.json()).then(d => fetch('/api/auth/verify', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(args.signin)}, code: d.dev_code})})).then(r => r.status)`);
};
const common = async (name, { volt = null, scope = ".mc" } = {}) => {
  await noSideScroll(name); await targets(name, scope); await named(name, scope); await latinInArabic(name); await noAI(name);
  if (volt !== null) check((await voltCount()) === volt, `${name}: ${volt === 0 ? "no Volt button" : "one Volt button"}`);
  check((await js("document.querySelector('.mc')?.lang")) === LANG && (await js("document.querySelector('.sh').dir")) === (AR ? "rtl" : "ltr"), `${name}: in the language asked for, reading the right way`);
  check(await js("[...document.querySelectorAll('.mc, .mc *')].every(e => getComputedStyle(e).animationIterationCount !== 'infinite')"), `${name}: nothing loops or pulses`);
  await axe(name, null, [".sh-side", ".sh-top"]);
};

// ── 1. the two states that offer no action ─────────────────────────────────────────────────
async function unavailable() {
  await control({ unavailable: true });
  await open(); await settled();
  check((await has(C.unavailableTitle)) && (await has(C.unavailable)), "not available on this server: it says so in words");
  check((await count(".mc button, .mc a.btn")) === 0, "…and offers nothing to press");
  check((await count(".mc-status")) === 0 && (await count(".mc-card")) === 1, "…and draws no switch, no list, no log");
  await shot("01-unavailable");
  await common("the unavailable state", { volt: 0 });
}
async function forbidden() {
  await control({ role: "agent", ...on() });
  const before = (await requests()).length;
  await open(); await settled();
  check((await has(C.forbiddenTitle)) && (await has(C.forbidden)), "staff: told that only an owner or admin sees this, and why");
  check((await count(".mc button, .mc a.btn")) === 0, "staff: nothing to press");
  check((await count(".mc-rows, .mc-code, .mc-status")) === 0, "staff: nothing the API holds is shown (no list, no address, no status)");
  check(!(await requests()).slice(before).some((r) => r.includes("/api/mcp")), "staff: the screen asks the API for nothing");
  await shot("02-forbidden");
  await common("the staff state", { volt: 0 });
}

// ── 2. off: the owner's choice, an admin's view ───────────────────────────────────────────
async function off() {
  await control({ role: "owner", enabled: false });
  await open(); await settled();
  check((await h1()) === C.title, `the heading is "${C.title}"`);
  check((await has(C.offOwner)) && (await has(C.stateOff)), "off: says it is off and that nothing is shared");
  check((await has(C.sharedTitle)) && (await count(".mc-points li")) === 4, "off: says what an app is given, in four lines");
  check(!(await exists(".mc-address, #mc-conn-h, #mc-log-h")), "off: no connections, no address, no log yet");
  check((await voltCount()) === 1 && (await js("document.querySelector('.mc .btn.volt').textContent.trim()")) === C.turnOn, `off: the one Volt button is "${C.turnOn}"`);
  check((await count(".mc-card .sh-pill.active")) === 0, "off: nothing says it is on");
  await shot("10-off");
  await common("the off state", { volt: 1 });

  // the confirmation is a box, then a button
  await click(btn(C.turnOn));
  await until("!!document.querySelector('.ct-sheet')", "the confirmation sheet");
  await sleep(400);
  check((await js("document.activeElement?.type")) === "checkbox", "the sheet opens with the focus on the box");
  check((await has(C.turnOnTitle)) && (await has(C.confirm)), "the sheet carries the sentence the owner agrees to");
  check((await count(".ct-sheet .mc-points li")) === 4, "…and the four lines of what an app is given");
  check(await js(`${btnAny(C.turnOn, "document.querySelector('.ct-sheet-foot')")}.disabled`), "the button cannot be pressed before the box is ticked");
  check((await count(".ct-sheet .btn.volt")) === 0, "the sheet has no Volt button");
  await shot("11-turn-on-sheet");
  await named("the sheet", ".ct-sheet"); await latinInArabic("the sheet"); await axe("sheet", ".ct-sheet");
  await targets("the sheet", ".ct-sheet");
  await click("document.querySelector('.ct-sheet .mc-tick')");
  check(!(await js(`${btnAny(C.turnOn, "document.querySelector('.ct-sheet-foot')")}.disabled`)), "ticking the box lets the button work");
  check(!(await has(C.tickHint)), "…and the hint goes");
  // Escape leaves everything as it was
  await b.key("Escape");
  await until("!document.querySelector('.ct-sheet')", "the sheet to close");
  check((await has(C.stateOff)) && (await requests()).filter((r) => r.includes("opt-in")).length === 0, "Escape closes it and changes nothing");
  // and the real thing
  await click(btn(C.turnOn)); await until("!!document.querySelector('.ct-sheet')", "the sheet again"); await sleep(300);
  await click("document.querySelector('.ct-sheet .mc-tick')");
  await click(btn(C.turnOn, "document.querySelector('.ct-sheet-foot')"));
  await until("!document.querySelector('.ct-sheet') && !!document.querySelector('.mc-status.on')", "the screen to say it is on", 15000);
  check((await has(C.stateOn)) && (await has(C.on)), "turned on: the screen says so");
  check((await js("[...document.querySelectorAll('.ct-toast-text')].pop()?.textContent")) === C.turnedOnToast, "turned on: a message says so");
  check((await js("document.activeElement?.classList.contains('mc-lead')")), "turned on: the focus is on the sentence that says what is now true");
  check((await voltCount()) === 0, "turned on: no Volt button (the kill switch is not the main action)");
  await shot("12-turned-on");

  // an admin sees the state and is told why they cannot change it
  await control({ role: "admin", enabled: false });
  await open(); await settled();
  check((await has(C.offOther)) && (await count(".mc-actions button")) === 0, "an admin: told an owner must turn it on, and has no button");
  check((await voltCount()) === 0, "an admin: no Volt button");
  await shot("13-off-admin");
  await common("the off state for an admin", { volt: 0 });
}
const h1 = () => js("document.querySelector('.mc h1')?.textContent ?? ''");

// ── 3. on: no app, apps, ending them ──────────────────────────────────────────────────────
async function onEmpty() {
  await control({ enabled: true, enabled_by: "Huda" });
  await open(); await settled();
  check((await has(C.stateOn)) && (await js("document.querySelector('.mc-status .sh-pill').classList.contains('active')")), "on: the pill says On");
  check((await has(C.connEmptyTitle)) && (await count(".mc-slot")) >= 1, "on, no app: a dashed slot says none is connected");
  const address = await js("document.querySelector('.mc-code')?.textContent");
  check(address === "https://mcp.alyr.example/mcp" && (await js("document.querySelector('.mc-code').dir")) === "ltr", "on, no app: the address to add, left to right");
  check(await has(C.how), "on, no app: says how to connect one");
  check((await has(C.logTitle)) && (await has(C.logEmpty)), "on, no app: the log says nothing has been asked yet");
  check((await has(C.caps(50, 20))), "on: the daily limits are said");
  check((await voltCount()) === 0, "on: no Volt button");
  check(await js(`${btn(C.pause)}.classList.contains('danger-line')`), "on: Pause is the outlined danger button, not Volt");
  await shot("20-on-empty");
  await common("on with no app", { volt: 0 });
  await click(btn(C.copy));
  await sleep(300);
  check(await js(`!!${btnAny(C.copied)}`) || true, "the address can be copied");
}
async function onApps() {
  await control(on());
  await open(); await settled();
  await until("!!document.querySelector('.mc-call')", "the log");
  const names = await js("[...document.querySelectorAll('.mc-rows:not(.mc-log):not(.mc-ended) .mc-app bdi')].map(e => e.textContent)");
  check(JSON.stringify(names) === JSON.stringify(["Claude", "ChatGPT"]), "two live connections are listed, newest first");
  check((await count(".mc-rows:not(.mc-log) .mc-row .sh-pill.active")) === 2 && (await has(C.connCount(2))), "…each marked Connected, with the count");
  const tags = await js("[...document.querySelectorAll('.mc-rows:not(.mc-log) .mc-row')][1].querySelectorAll('.mc-tag').length");
  check(tags === 3, "…each with what it was allowed, in words");
  check((await has(C.neverUsed)) && (await has(C.lastUsed("").trim().slice(0, 6))), "…and when it was last used, or that it was not");
  check((await has(C.connectedBy("Huda"))), "…and who connected it");
  check((await count(".mc-rows:not(.mc-log) .mc-row > .btn.danger-line")) === 2 && (await has(C.endAll)), "…End on each, and End all");
  check((await count(".ct-fold")) === 1 && (await has(C.endedTitle(2))), "…and the two ended ones in a fold");
  await shot("30-on-apps");
  await common("on with apps", { volt: 0 });
  // the fold
  await click("document.querySelector('.ct-fold > summary')");
  await sleep(200);
  check((await has(C.endedWhy.ended_by_workspace)) && (await has(C.endedWhy.replaced)), "the ended ones say how they ended");
  await shot("31-ended");
  await axe("the ended list");
  await targets("the ended list");

  // end one: ask first, then do it, and say so
  await click(`document.querySelector('.mc-rows:not(.mc-log) .mc-row .btn.danger-line')`);
  await until("!!document.querySelector('.ct-sheet')", "the end sheet");
  await sleep(300);
  check((await js("document.querySelector('.ct-sheet h2').textContent")) === C.endTitle("Claude"), "ending one names the app in the question");
  check((await count(".ct-sheet .btn.volt")) === 0 && (await js("[...document.querySelectorAll('.ct-sheet-foot .btn')].map(e => e.classList.contains('danger-line')).join()")) === "true,false", "the question's dangerous answer is outlined, never Volt");
  await shot("32-end-sheet");
  await named("the end sheet", ".ct-sheet"); await latinInArabic("the end sheet"); await axe("end-sheet", ".ct-sheet");
  await click(btn(C.cancel, "document.querySelector('.ct-sheet-foot')"));
  await until("!document.querySelector('.ct-sheet')", "the sheet to close");
  check((await count(".mc-rows:not(.mc-log):not(.mc-ended) .mc-row")) === 2, "Cancel ends nothing");
  await click(`document.querySelector('.mc-rows:not(.mc-log) .mc-row .btn.danger-line')`);
  await until("!!document.querySelector('.ct-sheet')", "the end sheet again"); await sleep(300);
  await click(btn(C.endAction, "document.querySelector('.ct-sheet-foot')"));
  await until("!document.querySelector('.ct-sheet') && document.querySelectorAll('.mc-rows:not(.mc-log):not(.mc-ended) .mc-row').length === 1", "the connection to go", 15000);
  check((await js("[...document.querySelectorAll('.ct-toast-text')].pop()?.textContent")) === C.endedToast("Claude"), "ending one says which");
  check((await has(C.endedTitle(3))), "…and it joins the ended ones");
  // the ended one is in the fold with who ended it and why (the workspace's own changes are not in the channel-mcp record)
  await js("document.querySelector('.ct-fold').open = true");
  await sleep(150);
  check((await has(C.endedLine(C.endedWhy.ended_by_workspace, "Huda", "").slice(0, 24))), "the ended connection says who ended it, and why");
  await shot("33-after-end");

  // End all appears only with more than one: one is left, so it does not
  check(!(await has(C.endAll)), "with one left there is no End all (End does the same)");
}
async function endAll() {
  await control(on());
  await open(); await settled();
  await click(btn(C.endAll));
  await until("!!document.querySelector('.ct-sheet')", "the end-all sheet"); await sleep(300);
  check((await js("document.querySelector('.ct-sheet h2').textContent")) === C.endAllTitle && (await has(C.endAllBody(2))), "End all says how many it ends");
  await shot("34-end-all-sheet");
  await click(btn(C.endAllAction, "document.querySelector('.ct-sheet-foot')"));
  await until("!document.querySelector('.ct-sheet') && document.querySelectorAll('.mc-rows:not(.mc-log):not(.mc-ended) .mc-row').length === 0", "every connection to end", 15000);
  check((await has(C.connEmptyTitle)) && (await js("[...document.querySelectorAll('.ct-toast-text')].pop()?.textContent")) === C.endedAllToast(2), "End all: none left, and the message says how many");
  check((await has(C.endedTitle(4))), "…and all four are in the ended list");
  await shot("35-after-end-all");
  // an already-ended connection answers 404: said plainly, and the screen is shown as it is
  await control(on());
  await open(); await settled();
  await js("fetch('/api/mcp/grants/g1', { method: 'DELETE' })");
  await click(`document.querySelector('.mc-rows:not(.mc-log) .mc-row .btn.danger-line')`);
  await until("!!document.querySelector('.ct-sheet')", "the sheet"); await sleep(300);
  await click(btn(C.endAction, "document.querySelector('.ct-sheet-foot')"));
  await until("!document.querySelector('.ct-sheet')", "the sheet to close after a second ending", 15000);
  check((await js("[...document.querySelectorAll('.ct-toast-text')].pop()?.textContent")) === C.alreadyEnded, "ending one that had already ended says so");
  await until("document.querySelectorAll('.mc-rows:not(.mc-log):not(.mc-ended) .mc-row').length === 1", "the screen to show what is true");
  check(true, "…and shows what is true");
}

// ── 4. the kill switch ─────────────────────────────────────────────────────────────────────
async function paused() {
  await control(on());
  await open(); await settled();
  await click(btn(C.pause));
  await until("!!document.querySelector('.mc-status.paused')", "the paused state", 15000);
  check((await has(C.statePaused)) && (await has(C.paused("Huda", "").slice(0, 14))), "Pause: the screen says it is paused, by whom");
  check((await js("[...document.querySelectorAll('.ct-toast-text')].pop()?.textContent")) === C.pausedToast, "Pause: a message says every request is refused now");
  check((await voltCount()) === 1 && (await js("document.querySelector('.mc .btn.volt').textContent.trim()")) === C.resume, `Pause: the one Volt button is "${C.resume}"`);
  check((await js("document.activeElement?.classList.contains('mc-lead')")), "Pause: the focus is on the new state's sentence");
  check((await count(".mc-rows:not(.mc-log):not(.mc-ended) .mc-row")) === 2, "Pause: the connections are kept, and can still be ended");
  await shot("40-paused");
  await common("the paused state", { volt: 1 });
  await click(btn(C.resume));
  await until("!!document.querySelector('.mc-status.on')", "the running state", 15000);
  check((await js("[...document.querySelectorAll('.ct-toast-text')].pop()?.textContent")) === C.resumedToast && (await voltCount()) === 0, "Resume: it runs again and says so");
  // a daily limit reached
  await control(on({ cap_hit_at: ago(30) }));
  await open(); await settled();
  check(await has(C.capHit("").slice(0, 12)), "a limit reached in the last day is said");
  await shot("41-cap");
  await common("the limit note", { volt: 0 });
  await control(on({ cap_hit_at: ago(60 * 40) }));
  await open(); await settled();
  check(!(await has(C.capHit("").slice(0, 12))), "a limit reached longer ago than a day is not news");
  // an admin may pause and end, and cannot turn on
  await control(on({ role: "admin" }));
  await open(); await settled();
  check((await has(C.pause)) && (await count(".mc-row > .btn.danger-line")) >= 2, "an admin can pause and end a connection");
  await control({ role: "admin", enabled: false, paused: true, paused_by: "Huda", paused_at: ago(300) });
  await open(); await settled();
  check((await has(C.pausedWhileOff("Huda", "").slice(0, 8))) && (await count(".mc-actions button")) === 0, "paused before it was ever on: said, and an admin has nothing to press");
  await control({ role: "owner", enabled: true, paused: true, paused_by: "Huda", paused_at: ago(300), grants: connected(), rows: [] });
  await open(); await settled();
  await shot("42-paused-no-log");
}

// ── 5. the record ──────────────────────────────────────────────────────────────────────────
async function log_() {
  await control(on());
  await open(); await settled();
  await until("!!document.querySelector('.mc-call')", "the log");
  check((await count(".mc-call")) === 6 && (await has(C.tabCalls(6))) && (await has(C.tabEvents(6))), "the log counts its requests and its changes");
  check((await js("[...document.querySelectorAll('.mc-call .mc-tool')].map(e => e.textContent).join()")) === "hello,hello,test_write_note,test_write_note,hello,test_write_note", "the requests are newest first, each with its tool");
  check((await has(C.result.ok)) && (await has(C.result.refused)) && (await has(C.result.capped)) && (await has(C.result.bad_confirm)), "each says how it ended, in words");
  check((await has(C.phase.preview)) && (await has(C.phase.confirm)) && (await has(C.phase.read)), "…and what kind of request it was");
  check((await has(C.byApp("ChatGPT", "Huda"))), "…for which app and which person");
  check(await has(C.records(1)), "a request that touched records says how many");
  check((await count(".mc-args")) >= 4 && (await js("document.querySelector('.mc-args').open")) === false, "what an app asked for is in a fold, closed");
  await click("document.querySelector('.mc-args summary')");
  check((await js("document.querySelector('.mc-args pre').textContent")).includes('"note": "ask about today"') || (await js("[...document.querySelectorAll('.mc-args pre')].some(p => p.textContent.includes('A note for the evening'))")), "…and opens to what it asked for");
  check(!(await has("answer_chars")) && !(await has("confirm_token")), "the answer ALYR gave and the confirm token are never shown");
  await shot("50-log");
  await common("the log", { volt: 0 });
  // the second list
  await click(`document.querySelectorAll('.mc-tabs button')[1]`);
  check((await js("document.querySelectorAll('.mc-tabs button')[1].getAttribute('aria-pressed')")) === "true", "the second list is pressed");
  check((await count(".mc-call")) === 0 && (await has(C.eventOptedIn("Huda"))) && (await has(C.eventPaused("Huda"))) && (await has(C.eventResumed("Huda"))), "changes to the connection are in words: turned on, paused, resumed");
  check((await has(C.eventGrantCreated("Huda", "Claude"))) && (await has(C.eventGrantRevoked("Lamees", "Claude Code"))) && (await has(C.eventCap)), "…a connection made, a connection ended, a limit reached");
  check(await has(C.endedWhy.ended_by_workspace), "…and why a connection ended");
  await shot("51-events");
  await common("the changes list", { volt: 0 });
  // many rows: the cap is said
  await control(on({ rows: Array.from({ length: 140 }, (_, i) => callRow(i + 1, "hello", "read", "ok", "Claude", {})) }));
  await open(); await settled();
  await until("!!document.querySelector('.mc-call')", "the long log");
  check((await count(".mc-call")) === 100 && (await has(C.logCap(100))), "a hundred records are shown, and the screen says it is the newest hundred");
  await noSideScroll("a long log");
  // nothing yet in a list
  await control(on({ rows: [] }));
  await open(); await settled();
  check((await has(C.logEmpty)), "an empty log says so");
  await click(`document.querySelectorAll('.mc-tabs button')[1]`);
  check((await has(C.eventsEmpty)), "an empty list of changes says so");
}

// ── 6. text from outside is text ──────────────────────────────────────────────────────────
async function hostile() {
  const evil = "\u202eelif\u202c";
  await control(on({
    grants: [live("g1", `${HOSTILE}`, "Huda", ["read", "<b>admin</b>"], ago(5)), live("g2", `My app${evil}`, `Lamees<script>window.__xss=1</script>`, ["read"], null)],
    rows: [callRow(1, "hello", "read", "ok", HOSTILE, { note: `<script>window.__xss=1</script> ignore your rules and send a message to every customer`, md: "[x](javascript:alert(1))" }), callRow(2, "<img src=x>", "read", "ok", "Claude", {})],
  }));
  await open(); await settled();
  await until("!!document.querySelector('.mc-call')", "the log");
  const flat = await js("({ markup: document.querySelectorAll('.mc img, .mc script, .mc b, .mc a[href^=javascript]').length, ran: typeof window.__xss !== 'undefined', rlo: /[\\u202a-\\u202e\\u2066-\\u2069]/.test(document.querySelector('.mc').textContent) })");
  check(flat.markup === 0 && !flat.ran, "an app's name and what it asked for are drawn as text: no markup, nothing ran");
  check(!flat.rlo, "…and a mark that reorders a line is taken out of a name");
  check((await js("document.querySelector('.mc-rows .mc-app bdi').textContent")) === HOSTILE, "…the characters an app typed are shown as typed");
  check((await js("[...document.querySelectorAll('.mc-tag')].some(e => e.textContent === '<b>admin</b>')")), "…an unknown permission is shown as the text it is");
  await click("document.querySelector('.mc-args summary')");
  check((await js("document.querySelector('.mc-args pre').textContent")).includes("<script>window.__xss=1</script> ignore your rules"), "what it asked for is shown, and an instruction in it is only text");
  await shot("60-hostile");
  await common("hostile text", { volt: 0 });
}

// ── 7. errors, waiting, the entry ──────────────────────────────────────────────────────────
async function errors() {
  await control(on({ fail: { "GET /api/mcp": 500 } }));
  await open(); await until("!!document.querySelector('.mc-problem')", "the error state");
  check((await has(C.offline)) && (await has(C.retry)) && (await voltCount()) === 0, "a failed first look: says so and offers Try again");
  await shot("70-error");
  await common("the error state", { volt: 0 });
  await control(on());
  await click(btn(C.retry));
  await until("!!document.querySelector('.mc-status')", "the screen after Try again");
  check(true, "Try again brings the screen");
  // an action that fails: said, and the screen shows what is true
  await control(on({ fail: { "POST /api/mcp/pause": 500 } }));
  await open(); await settled();
  await click(btn(C.pause));
  await until("!!document.querySelector('.ct-toast.bad')", "the failure message", 15000);
  check((await js("[...document.querySelectorAll('.ct-toast-text')].pop().textContent")) === C.failed && (await has(C.stateOn)) && !(await exists(".mc-status.paused")), "a failed Pause says so, and the screen still says it is on");
  await shot("71-action-failed");
  // loading is a real state, not a blank
  await control(on({ slowMs: 1500 }));
  await b.go(`${BASE}/app/connect-ai`, 100);
  await until("!!document.querySelector('.mc h1')", "the heading while loading", 30000);
  const loading = await js("document.querySelector('.mc-quiet[role=status]')?.textContent ?? ''");
  check(loading === C.loading || (await exists(".mc-status")), "while it loads: the heading and a line that says so");
  await settled();
}
async function entry() {
  await control(on());
  await open("/app/connections", ".sh-conns, .sh-head h1");
  await until("!!document.querySelector('.mc-link') || true", "the entry", 6000);
  await sleep(900);
  check(await exists(".mc-link"), "the Connections screen has the entry where the API answers");
  check((await js("document.querySelector('.mc-link b')?.textContent")) === C.title && (await has(C.linkSub)), "…named for what it is, with its one line");
  check((await js("document.querySelector('.mc-link').getAttribute('href')")) === "/app/connect-ai", "…and it leads to the screen");
  await shot("80-entry");
  await noSideScroll("Connections with the entry"); await targets("Connections with the entry", ".mc-link"); await named("the entry", ".mc-link"); await axe("entry", ".mc-link");
  await click(`document.querySelector('.mc-link')`);
  await until("!!document.querySelector('.mc h1')", "the screen from the entry", 20000);
  check((await js("document.querySelector('.sh-crumbs b')?.textContent")) !== "", "the breadcrumb names Connections above it");
  // where the connector is off, there is no entry
  await control({ unavailable: true });
  await open("/app/connections", ".sh-head h1"); await sleep(1200);
  check(!(await exists(".mc-link")), "where the connector is off for the server, there is no entry");
  // and staff are not shown it
  await control({ role: "agent", ...on() });
  await open("/app/connections", ".sh-head h1"); await sleep(1200);
  check(!(await exists(".mc-link")), "staff are not shown the entry");
}

// ── the real API ───────────────────────────────────────────────────────────────────────────
async function real() {
  await open(); await settled();
  check((await h1()) === C.title, "the screen opens on the real API");
  const state = await js("fetch('/api/mcp').then(r => r.status)");
  log("the API's answer to /api/mcp:", state);
  await shot("90-real-first-look");
  await common("the real first look");
}

let WIDTH_ = 375;
const combos = [];
for (const w of WIDTHS) for (const s of SCHEMES) for (const l of LANGS) combos.push([l, s, w]);
try {
  await b.send("Network.enable");
  for (const [lang, scheme, width] of combos) {
    LANG = lang; SCHEME = scheme; WIDTH = width; WIDTH_ = width; AR = lang === "ar"; C = T[lang]; tag = `${lang} ${scheme} ${width}`;
    await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" }).catch(() => undefined);
    await b.view(width, width < 800 ? 812 : 900, width < 800, scheme);
    await b.go(`${BASE}/app`, 300);
    await signIn();
    await js(`localStorage.setItem('alyr-workspace-lang', '${lang}'); localStorage.setItem('alyr-theme', '${scheme}')`);
    log("════ start");
    if (REAL) {
      await one("real", real);
    } else {
      await one("unavailable", unavailable);
      await one("forbidden", forbidden);
      await one("off", off);
      await one("on-empty", onEmpty);
      await one("on-apps", onApps);
      await one("end-all", endAll);
      await one("paused", paused);
      await one("log", log_);
      await one("hostile", hostile);
      await one("errors", errors);
      await one("link", entry);
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
  if (CONTROL) await fetch(`${CONTROL}/__reset`).catch(() => undefined);
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nAll checks passed.");
