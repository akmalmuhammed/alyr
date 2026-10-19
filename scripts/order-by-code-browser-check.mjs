// Item codes and "Order on WhatsApp" in a real browser (ALY-136, D-039), at phone width (375 px),
// in English or Arabic, light or dark: the customer's order page for someone with no link of
// their own (cards with codes, the list, the item sheet, the bar), the message each button
// would open WhatsApp with (read back from the link: under 140 characters in "chat" mode, a
// readable order in "link" mode), the ordering customer's review, a shop with no WhatsApp number
// (no button), and the owner's screens (the code in the list and the edit sheet, the codes in
// the share sheet, "How customers order" in the settings). Headless Edge over the DevTools
// protocol (scripts/browser-kit.mjs), no packages. Node 22.18 or newer.
//
//   node scripts/order-by-code-browser-check.mjs --lang en --base http://localhost:3136 \
//        --db alyr136_dev --token <a customer's order-link token of demo-restaurant> \
//        --out C:/t/c136 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs the demo shops (`python -m alyr.seed_catalog_demos --only restaurant`) in a scratch
// database (never the shared one), a dev API on it and a web app pointed at that API
// (docs/demo.md), and `docker` to read and set a few rows in that database (the shop's WhatsApp
// number and mode). It exits with an error if any check fails. Short folders: Edge fails quietly
// with long paths.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3136";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const OUT = args.out ?? `${tmpdir()}/c136`;
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr136_dev";
const PG = args.pg ?? "alyrwhatsapp-postgres-1";
const SLUG = args.shop ?? "demo-restaurant";
const TOKEN = args.token ?? "";
const NUMBER = "97455500100";
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}/${SCHEME}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-c", text], { encoding: "utf8" }).trim();
const shopId = sql(`select id from tenants where slug = '${SLUG}'`);
const setShop = (set) => sql(`update shop_settings set ${set} where tenant_id = '${shopId}'`);

// ── in-page checks (plain code, installed into the page) ────────────────────────────────────
function installHelpers() {
  const css = (e) => getComputedStyle(e);
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const s = css(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (n.hasAttribute("inert") || n.getAttribute("aria-hidden") === "true") return false;
    }
    return true;
  };
  const describe = (e) => {
    const text = (e.getAttribute("aria-label") || e.textContent || e.value || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const cls = typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${e.tagName.toLowerCase()}${cls}${text ? ` “${text}”` : ""}`;
  };
  const layer = () => document.querySelector("dialog[open]") ?? document.querySelector(".ct-sheet") ?? document.body;
  window.__c = {
    describe, layer,
    small(root = layer()) {
      const out = [];
      for (const e of root.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=switch]")) {
        if (!shown(e)) continue;
        let box = e.getBoundingClientRect();
        const label = e.closest("label");
        if (label && e.matches("input[type=checkbox], input[type=radio]")) box = label.getBoundingClientRect();
        if (e.matches("a") && css(e).display === "inline" && e.parentElement && e.parentElement.textContent.trim() !== e.textContent.trim()) continue;
        // The review's steppers are 40 px wide (ALY-112): named, not new here.
        if (box.width < 43.5 || box.height < 43.5) out.push({ el: (e.closest(".ox-lqty:not(.full)") ? "ox-lqty " : "") + describe(e), w: Math.round(box.width), h: Math.round(box.height) });
      }
      return out;
    },
    clipped(root = layer()) {
      const out = [];
      for (const e of root.querySelectorAll("*")) {
        if (!shown(e) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const s = css(e);
        if (s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) out.push({ el: describe(e), why: "ellipsis" });
        else if (s.webkitLineClamp && s.webkitLineClamp !== "none" && e.scrollHeight > e.clientHeight + 1 && !e.matches(".ox-desc")) out.push({ el: describe(e), why: "clamped" });
      }
      return out;
    },
    sideways() {
      const out = [];
      if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1) out.push("page " + document.documentElement.scrollWidth + ">" + innerWidth);
      for (const e of document.querySelectorAll("main, .sh-main, .ct-sheet, .ct-sheet-body, dialog[open], .cx, .ox")) {
        if (e.scrollWidth > e.clientWidth + 1 && shown(e) && css(e).overflowX !== "auto" && css(e).overflowX !== "scroll") out.push(describe(e) + " " + e.scrollWidth + ">" + e.clientWidth);
      }
      return out;
    },
  };
  return true;
}

async function freePort() {
  for (let i = 0; i < 40; i++) {
    const port = 9600 + Math.floor(Math.random() * 300);
    const taken = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
    if (!taken) return port;
  }
  throw new Error("no free debugging port");
}
const port = await freePort();
const b = await launch({ edge: EDGE, port, profile: `${OUT}/p${port}`, scheme: SCHEME });

async function settle(wait = 700) {
  await sleep(wait);
  await b.js("document.fonts && document.fonts.ready.then(() => true)").catch(() => undefined);
  await b.js(`(${installHelpers.toString()})()`);
}
async function go(path, wait = 900) {
  await b.go(path.startsWith("http") ? path : `${BASE}${path}`, 400);
  await settle(wait);
}
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const vis = "(e => e.getClientRects().length > 0)";
const press = (text, within = "document", tag = "button", wait = 350) =>
  b.click(`[...${within}.querySelectorAll(${JSON.stringify(tag)})].filter(${vis}).find(e => ${norm}(e).includes(${JSON.stringify(text)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(text)}))`, wait);
const shot = (name) => b.shot(`${OUT}/${LANG}-${SCHEME}-${name}.png`);

// What every screen must be: nothing sideways, nothing clipped, 44 px targets, axe clean.
async function audit(name, { smallOk = [] } = {}) {
  const [sideways, clipped, small] = await Promise.all([b.js("__c.sideways()"), b.js("__c.clipped()"), b.js("__c.small()")]);
  check(sideways.length === 0, `${name}: no sideways scrolling ${JSON.stringify(sideways)}`);
  check(clipped.length === 0, `${name}: no text cut off ${JSON.stringify(clipped)}`);
  // Known and not new here: the language button of the customer frame is 32 px high, the workspace's
  // switches draw a 44 px hit area with ::before (this crude measure sees the box), and the review's
  // steppers are 40 px wide (ALY-112). They are listed, not hidden.
  const KNOWN = ["button.cx-lang", "sh-switch", "ox-lqty"];
  const real = small.filter((s) => !smallOk.some((ok) => s.el.includes(ok)) && !KNOWN.some((k) => s.el.includes(k)));
  const known = small.filter((s) => KNOWN.some((k) => s.el.includes(k)));
  if (known.length) log("note", `${name}: ${known.length} known small control(s), as before this work`);
  check(real.length === 0, `${name}: every control is 44 px ${JSON.stringify(real)}`);
  if (AXE) {
    const violations = await b.axe(AXE, null, []);
    check(!violations || violations.length === 0, `${name}: axe finds nothing ${violations && violations.length ? JSON.stringify(violations).slice(0, 700) : ""}`);
  }
}

const waLink = () => b.js("(() => { const a = [...document.querySelectorAll('a[href^=\"https://wa.me/\"]')].find(e => e.getClientRects().length > 0); return a ? a.href : ''; })()");
const decode = (href) => decodeURIComponent(href.split("?text=")[1] ?? "");
const hasArabic = (text) => /[؀-ۿ]/.test(text);

// ── 1. a visitor, the shop's number runs on ALYR ("chat") ────────────────────────────────────
setShop(`whatsapp_number = '${NUMBER}', whatsapp_mode = 'chat'`);
await go(`/s/${SLUG}?lang=${LANG}`);
const codeLines = await b.js("[...document.querySelectorAll('.ox-codeline')].map(e => e.textContent.replace(/\\s+/g, ' ').trim()).slice(0, 3)");
check(codeLines.length === 3 && codeLines.every((l) => /\d{3}/.test(l)), `cards show their code ${JSON.stringify(codeLines)}`);
check(await b.js("document.querySelectorAll('.ox-add, .ox-choose').length > 5"), "a visitor can pick items when the shop has a WhatsApp number");
await shot("1-visitor-list");
await audit("visitor list");

// Add three items with the plus buttons (the first three that need no choice).
const picked = await b.js(`(() => { const out = []; for (const card of document.querySelectorAll('.ox-card')) { const add = card.querySelector('.ox-add'); if (!add) continue; out.push(card.querySelector('.ox-codeline .num')?.textContent); add.click(); if (out.length === 3) break; } return out; })()`);
await sleep(400);
check(picked.length === 3, `three items added ${JSON.stringify(picked)}`);
const href1 = await waLink();
const text1 = decode(href1);
check(href1.startsWith(`https://wa.me/${NUMBER}?text=`), "the bar opens WhatsApp on the shop's number");
check(text1.length <= 140, `the message is under 140 characters (${text1.length}): ${JSON.stringify(text1)}`);
check(picked.every((c) => text1.includes(`#${c}`)), "the message names the three codes");
check(AR ? hasArabic(text1) : !hasArabic(text1), "the message is in the page's language");
await shot("2-visitor-bar");
await audit("visitor bar");

await press(AR ? "عرض قائمتي" : "See my list", "document", "button");
await b.until("!!document.querySelector('dialog[open]')", "list sheet");
await sleep(300);
await shot("3-visitor-list-sheet");
await audit("list sheet");
check((await b.js("[...document.querySelectorAll('dialog[open] .ox-line')].length")) === 3, "the list sheet shows the three items");
await b.js("document.querySelector('dialog[open] .ox-step button:last-child').click()");
await sleep(300);
const text2 = decode(await b.js("document.querySelector('dialog[open] a[href^=\"https://wa.me/\"]').href"));
check(/x2/.test(text2), `a second one of the first item changes the message: ${JSON.stringify(text2)}`);
await b.key("Escape", "Escape", 27);
await sleep(300);

// One item: its sheet has the button for that item, with the size when it has one.
const firstId = await b.js("document.querySelector('.ox-card .ox-open')?.closest('li') ? 'x' : ''");
void firstId;
await press("", "document.querySelector('.ox-card')", "button", 700);
await b.until("!!document.querySelector('dialog[open] .ox-addbtn')", "item sheet");
await sleep(300);
const sheetLink = await b.js("document.querySelector('dialog[open] a[href^=\"https://wa.me/\"]')?.href ?? ''");
check(sheetLink.startsWith(`https://wa.me/${NUMBER}?text=`), "the item sheet has Order on WhatsApp");
check(/#\d{3}/.test(decode(sheetLink)), `...with that item's code: ${JSON.stringify(decode(sheetLink))}`);
check((await b.js("document.querySelector('dialog[open] .ox-meta')?.textContent ?? ''")).match(/\d{3}/) !== null, "the sheet names the code");
await shot("4-item-sheet");
await audit("item sheet");
await b.key("Escape", "Escape", 27);
await sleep(300);

// A shared item link opens the sheet by itself, with the same button.
const itemId = sql(`select id from items where tenant_id = '${shopId}' and status = 'live' and code is not null order by code limit 1 offset 4`);
await go(`/s/${SLUG}?item=${itemId}&lang=${LANG}`, 1500);
await b.until("!!document.querySelector('dialog[open] .ox-addbtn')", "shared item sheet");
check((await b.js("!!document.querySelector('dialog[open] a[href^=\"https://wa.me/\"], dialog[open] button.ox-addbtn')")), "a shared item link opens the item with its button");
await shot("5-shared-item");

// ── 2. a shop that answers itself ("link"): the message is an order a person can read ───────
setShop("whatsapp_mode = 'link'");
await go(`/s/${SLUG}?lang=${LANG}`);
await b.js(`(() => { let n = 0; for (const add of document.querySelectorAll('.ox-card .ox-add')) { add.click(); if (++n === 3) break; } })()`);
await sleep(400);
const linkText = decode(await waLink());
check(linkText.split("\n").length >= 5, `the message has a line for each item, a total and a head: ${JSON.stringify(linkText)}`);
check((AR ? /الإجمالي: .* ر\.ق/ : /Total: QAR/).test(linkText), "it states the total in the page's currency");
check(!(AR && linkText.includes("QAR")), "no QAR on the Arabic page's message");
await shot("6-link-mode-bar");
setShop("whatsapp_mode = 'chat'");

// ── 3. a customer with their own link: they order here, and may send it on WhatsApp ─────────
if (TOKEN) {
  await go(`/s/${SLUG}?t=${TOKEN}&lang=${LANG}`, 1200);
  await b.js(`(() => { let n = 0; for (const add of document.querySelectorAll('.ox-card .ox-add')) { add.click(); if (++n === 2) break; } })()`);
  await sleep(400);
  await b.click("document.querySelector('.cx-bar .cx-btn')", 600);
  await b.until("!!document.querySelector('dialog[open] .ox-dfoot')", "review sheet");
  await sleep(1200);
  const reviewLink = await b.js("document.querySelector('dialog[open] a[href^=\"https://wa.me/\"]')?.href ?? ''");
  check(reviewLink.startsWith(`https://wa.me/${NUMBER}?text=`), "the review offers to send the order on WhatsApp instead");
  check(/#\d{3}/.test(decode(reviewLink)), `...with the codes: ${JSON.stringify(decode(reviewLink))}`);
  await shot("7-review");
  await audit("review");
}

// ── 4. a shop with no WhatsApp number: no button, nothing to pick ───────────────────────────
setShop("whatsapp_number = ''");
await go(`/s/${SLUG}?lang=${LANG}`);
check((await b.js("document.querySelectorAll('a[href^=\"https://wa.me/\"]').length")) === 0, "no WhatsApp button without the shop's number");
check((await b.js("document.querySelectorAll('.ox-add').length")) === 0, "no add buttons for a visitor without a way to send");
await shot("8-no-number");
await audit("no number");
setShop(`whatsapp_number = '${NUMBER}'`);

// ── 5. the owner's side ─────────────────────────────────────────────────────────────────────
const owner = `owner@demo-${SLUG.replace("demo-", "")}.example`;
sql(`delete from login_codes where email = '${owner}'`);
const sign = async () => {
  const post = (path, body) => fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const code = (await (await post("/api/auth/code", { email: owner })).json()).dev_code;
  const verified = await post("/api/auth/verify", { email: owner, code });
  const cookie = verified.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { verified, cookie };
};
const { verified, cookie } = await sign();
check(verified.ok, "the owner signs in");
await go("/login");
for (const piece of cookie.split("; ")) {
  const [name, ...rest] = piece.split("=");
  await b.send("Network.setCookie", { name, value: rest.join("="), url: BASE });
}
await b.js(`localStorage.setItem('alyr-workspace-lang', '${LANG}')`);
await go("/app/catalog", 1500);
const codeSpans = await b.js("[...document.querySelectorAll('.ct-code')].length");
check(codeSpans > 5, `the list shows each item's code (${codeSpans})`);
await shot("9-workspace-list");
await audit("workspace list", { smallOk: [] });

await b.click("document.querySelector('.ct-open')", 900);
await b.until("!!document.querySelector('.ct-codebox')", "edit sheet with the code");
const box = await b.js("document.querySelector('.ct-codebox').textContent.replace(/\\s+/g, ' ')");
check(/\d{3}/.test(box), `the edit sheet shows the code ${JSON.stringify(box)}`);
check(!(await b.js("!!document.querySelector('.ct-codebox input')")), "the code cannot be edited");
await shot("10-edit-sheet-code");
await audit("edit sheet");
await b.key("Escape", "Escape", 27);
await sleep(400);
if (await b.js("!!document.querySelector('.ct-sheet')")) {
  await b.js("[...document.querySelectorAll('.ct-sheet button')].find(e => /^(Leave|Discard|ترك|تجاهل)/.test(e.textContent.trim()))?.click()");
  await sleep(300);
}

await b.click("document.querySelector('.ct-share-btn')", 900);
await b.until("!!document.querySelector('.ct-codelist')", "share sheet with the codes");
check((await b.js("document.querySelectorAll('.ct-codelist li').length")) >= 1, "the share sheet lists the item's code");
await shot("11-share-sheet-codes");
await audit("share sheet");
await b.key("Escape", "Escape", 27);
await sleep(400);

await go("/app/catalog", 1500);
await b.click("[...document.querySelectorAll('button')].find(e => e.getClientRects().length && (e.getAttribute('aria-label') || e.textContent).match(/Settings|الإعدادات/))", 900);
await b.until("!!document.querySelector('.ct-how')", "settings with How customers order");
await b.js("document.querySelector('.ct-how').scrollIntoView({block:'start'})");
await sleep(300);
await shot("12-settings-how");
await audit("settings");
// With the number empty the owner is told what to do.
const hint = await b.js("document.querySelector('.ct-how .ct-alert')?.textContent ?? ''");
check(hint === "", "no warning while the shop has its number");
await b.close();
console.log(failures.length ? `\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
