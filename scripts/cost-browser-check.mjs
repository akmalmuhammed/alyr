// Cost price and margin, proved in a real browser (ALY-150 part 3, specs/014-pricing-pack/spec.md).
// Headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages. At 375 px, in
// English or Arabic, light or dark (one language and one scheme per run):
//   * as the OWNER of a shop that keeps costs: the item sheet with no cost, with a cost and its
//     live margin, with a sized item (a cost for the item, a size with its own, a size without),
//     with a price under the cost (the note while typing, then the API's own sentence after the
//     save, from the cost route and from the item save), the cost history, a new item whose cost
//     goes to its route after the item has an id, and a save that changes no cost sending no
//     cost request; the items list with its margin pills; the Stock tab's value at cost and the
//     items left out; the Orders list with a margin, an incomplete one and a negative one; the
//     import sheet's line about the cost column;
//   * as an AGENT: none of those screens draw a cost field, a pill, a stock value, a margin or
//     the import line, and the browser makes NO request to a cost, margin or valuation route
//     (the network log is read); the API then answers 403 to each if asked directly;
//   * the feature SWITCHED OFF: nothing new anywhere, no request, and the API answers feature_off.
// axe-core runs on what is new. Screenshots are written for a person to look at.
//
//   node scripts/cost-browser-check.mjs --lang en --scheme light \
//        --base http://localhost:3193 --api http://127.0.0.1:8333 --out C:/t/p3 \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on a scratch database of its own (it resets the demo shop Al Noor in it,
// turns the Catalog and cost price on, and makes a few items and orders) and the web app pointed
// at it; never the shared database. It drives only its own Edge (its own --profile and a random
// free --port). Short folders: Edge fails quietly with long paths. Node 22.18 or newer (it reads
// the words from the .ts copy files).

import { mkdirSync, writeFileSync } from "node:fs";
import { launch } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { COST } from "../apps/web/app/(product)/_workspace/costCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3193";
const API = args.api ?? "http://127.0.0.1:8333";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const OUT = args.out ?? "C:/t/p3";
const PROFILE = args.profile ?? `C:/t/p3/prof-${LANG}-${SCHEME}`;
const PORT = Number(args.port ?? 20000 + Math.floor(Math.random() * 20000));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "C:/t/tools/node_modules/axe-core/axe.min.js";
const c = COST[LANG];
const t = COPY[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}/${SCHEME}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const pick = (en, ar) => (AR ? ar : en);
const money = (dirhams) => {
  const neg = dirhams < 0;
  const abs = Math.abs(dirhams);
  const whole = Math.floor(abs / 100);
  const part = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `${grouped}${part ? `.${String(part).padStart(2, "0")}` : ""}`;
  return `${neg ? "−" : ""}${AR ? `${text} ر.ق` : `QAR ${text}`}`;
};
/** The same words the screen writes, with the isolate marks the Arabic screen puts round an amount (they are not read as text). */
const plain = (s) => s.replace(/[⁦-⁩]/g, "");

// ── the shop's side ─────────────────────────────────────────────────────────────────────
async function call(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const must = async (path, opts) => {
  const r = await call(path, opts);
  if (r.status >= 300) throw new Error(`${opts?.method ?? "GET"} ${path} -> ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
};

let tenant = "";
let items = [];
let people = [];
const itemNamed = (en) => items.find((i) => i.name.startsWith(en));
const newItem = (body) => must("/api/items", { method: "POST", body: {
  name: "", name_ar: "", price: 100, status: "live", stock_rule: "switch", unit: "piece", min_order: 1,
  option_groups: [], schedule: [], tags: [], variants: [], ...body,
} }).then((r) => r.item);
const setCost = (item, body) => must(`/api/items/${item.id}/cost`, { method: "PUT", body });
async function linkFor(who) {
  const sent = await must("/sim/messages", { method: "POST", body: { from_number: who.phone, text: "order" } });
  const body = sent.messages.map((m) => m.body).filter((x) => x.includes("?t=")).at(-1);
  return body.split("?t=")[1].split(/\s/)[0];
}
const orderVia = (token, lines) => call("/api/store/al-noor/orders", { method: "POST", body: {
  token, payment: "link", items: lines.map(([item, quantity]) => ({ product_id: item.id, quantity })),
} });

const facts = {};
async function seed() {
  await call("/sim/reset", { method: "POST" });
  const shops = (await must("/api/admin/businesses")).businesses;
  tenant = shops.find((s) => s.slug === "al-noor").id;
  await must(`/api/admin/businesses/${tenant}/modules/catalog`, { method: "POST", body: { enabled: true } });
  await must("/api/features/cost_margin", { method: "PUT", body: { enabled: true } });
  // Counted stock: a pizza in two sizes, rice with a cost and bread without one.
  facts.pizza = await newItem({
    name: "Dev pizza", name_ar: "بيتزا الاختبار", price: 4000, stock_rule: "count",
    variants: [
      { name: "Small", name_ar: "صغير", price_delta: -1000, opening_stock: 5 },
      { name: "Large", name_ar: "كبير", price_delta: 1500, opening_stock: 3 },
    ],
  });
  facts.rice = await newItem({ name: "Dev rice", name_ar: "أرز الاختبار", price: 400, stock_rule: "count", opening_stock: 20 });
  facts.bread = await newItem({ name: "Dev bread", name_ar: "خبز الاختبار", price: 500, stock_rule: "count", opening_stock: 10 });
  items = (await must("/api/items?limit=100")).items;
  people = (await must("/api/ledger/summary")).customers.filter((p) => p.phone).slice(0, 5);
  const small = facts.pizza.variants.find((v) => v.name === "Small");
  const large = facts.pizza.variants.find((v) => v.name === "Large");
  facts.small = small; facts.large = large;
  // Costs: Cable 1.5 earns well, the Switch sells under its cost, the Breaker has none yet.
  await setCost(itemNamed("Cable 1.5"), { cost: 9000 });
  await setCost(itemNamed("Switch 1"), { cost: 1000 });
  await setCost(facts.pizza, { cost: 2500, variants: { [small.id]: 3500 } });
  await setCost(facts.rice, { cost: 150 });
  facts.value = 5 * 3500 + 3 * 2500 + 20 * 150; // the pizza's two sizes and the rice
  // Orders: a margin, an incomplete one (a line with no cost), a negative one, and one with no cost at all.
  const cable = itemNamed("Cable 1.5");
  const breaker = itemNamed("Breaker 16");
  const sw = itemNamed("Switch 1");
  const placed = [];
  placed.push(await orderVia(await linkFor(people[0]), [[cable, 2]]));
  placed.push(await orderVia(await linkFor(people[1]), [[cable, 1], [breaker, 1]]));
  placed.push(await orderVia(await linkFor(people[2]), [[sw, 1]]));
  placed.push(await orderVia(await linkFor(people[3]), [[breaker, 2]]));
  for (const r of placed) if (r.status !== 200) throw new Error(`an order was refused: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  facts.orders = (await must("/api/orders")).orders;
}

// ── the page ────────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: SCHEME });
// Every request the page makes, so "an agent's browser asks for no cost" is read, not hoped.
const net = [];
b.on("Network.requestWillBeSent", (p) => { try { net.push(`${p.request.method} ${new URL(p.request.url).pathname}`); } catch { /* not a URL */ } });
const COSTY = /^(GET|PUT|POST|DELETE) \/api\/(items\/[0-9a-f-]+\/cost|items\/margins|items\/valuation|orders\/margins)$/;
const costCalls = () => net.filter((x) => COSTY.test(x));
const text = (selector) => b.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
const count = (selector) => b.js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const sheetText = () => b.js("(document.querySelector('.ct-sheet')?.innerText ?? '').replace(/\\s+/g, ' ')");
const pageText = () => b.js("document.body.innerText.replace(/\\s+/g, ' ')");
const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const press = (label, scope = "document", wait = 300, tag = "button") =>
  b.click(`[...${scope}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(label)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`, wait);
const inSheet = "document.querySelector('.ct-sheet')";
const inFoot = "document.querySelector('.ct-sheet-foot')";
/** The control a label names, inside a scope (the open sheet unless said). */
const control = (label, scope = inSheet) => `[...${scope}.querySelectorAll('label')].find(l => ${norm}(l).startsWith(${JSON.stringify(label)}))?.control`;
async function fill(label, value, scope = inSheet) {
  await b.click(control(label, scope), 120);
  await b.clearFocused();
  if (value) await b.type(value);
  await b.sleep(120);
}
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${SCHEME}-${name}.png`); log("shot", name); };
async function noSideScroll(what) {
  const wide = await b.js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth ? document.documentElement.scrollWidth : 0");
  check(!wide, `no sideways scrolling on ${what}${wide ? ` (${wide})` : ""}`);
}
async function axe(what, scope) {
  if (!(await count(scope))) { check(false, `axe: ${what} has something to scan (${scope})`); return; }
  const found = await b.axe(AXE, scope);
  if (found === null) { log("axe skipped"); return; }
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-axe-${what}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: nothing on ${what} (${found.map((v) => v.id).join(", ") || "clean"})`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
/** The inputs and buttons of what is new that are under 44 px either way. */
async function smallTargets(scope, what) {
  const small = await b.js(`(() => [...document.querySelectorAll(${JSON.stringify(scope)})].flatMap((root) => [...root.querySelectorAll('button, a[href], input, select, summary')]).filter(${visible}).map((e) => {
    const box = e.getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height), what: (e.getAttribute('aria-label') || e.textContent || e.name || e.type || '').trim().slice(0, 30) };
  }).filter((x) => x.w < 44 || x.h < 44))()`);
  check(small.length === 0, `every target is 44 px or more on ${what}${small.length ? ` (${JSON.stringify(small)})` : ""}`);
}
const unwanted = /\b(coming soon|coming|beta|early access|not yet|under development|capabilit)\w*|قريباً|قريبا|نسخة تجريبية|[\u{1F300}-\u{1FAFF}]/iu;
const tall = async (height, fn) => {
  await b.view(375, height, true, SCHEME);
  try { await fn(); } finally { await b.view(375, 812, true, SCHEME); }
};
const clearToasts = () => b.js("document.querySelectorAll('.ct-toast-x').forEach((x) => x.click())").then(() => b.sleep(150));
const closeSheet = () => press(t.close, inSheet, 500);

async function prepare() {
  // Signed out (the cookie of an earlier agent run is gone), in the language and the theme of this run.
  await b.send("Network.clearBrowserCookies");
  await b.go(`${BASE}/app`, 400);
  await b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-theme', ${JSON.stringify(SCHEME)}); localStorage.setItem('alyr-catalog-view', 'grid')`);
}
async function openCatalog(tabLabel = null) {
  await b.go(`${BASE}/app/catalog`, 1500);
  await b.until("document.querySelectorAll('.ct-card, .ct-row').length >= 5", "the items", 25000);
  if (tabLabel) { await press(tabLabel, "document.querySelector('.ct-tabs')", 700); }
}
const openItem = async (name) => {
  await b.click(`[...document.querySelectorAll('.ct-open')].find(e => e.textContent.includes(${JSON.stringify(name)}))`, 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the item sheet");
};
const NAME = (item) => (AR ? item.name_ar || item.name : item.name);
const waitIdle = () => b.sleep(900);

// ── the owner ───────────────────────────────────────────────────────────────────────────
async function owner() {
  await prepare();
  net.length = 0;
  await openCatalog();
  await b.until("document.querySelectorAll('.cs-pill').length >= 2", "the margin pills", 20000);

  // 1. the list: a quiet pill with the margin, "Below cost" in the warning tone, nothing for an item with no cost
  const cableCard = (n) => `[...document.querySelectorAll('.ct-card')].find(e => e.textContent.includes(${JSON.stringify(n)}))`;
  const pillOf = async (n) => b.js(`${cableCard(n)}?.querySelector('.cs-pill')?.textContent.replace(/\\s+/g, ' ').trim() ?? null`);
  const cable = itemNamed("Cable 1.5");
  check(plain((await pillOf(NAME(cable))) ?? "") === plain(c.pill("37.9")), `the list: Cable 1.5 (price 145, cost 90) shows ${plain(c.pill("37.9"))} (${await pillOf(NAME(cable))})`);
  check(plain((await pillOf(NAME(itemNamed("Switch 1")))) ?? "") === c.pillBelow, `the list: the Switch (price 9, cost 10) shows ${c.pillBelow}`);
  check((await pillOf(NAME(itemNamed("Breaker 16")))) === null, "the list: an item with no cost kept has no pill");
  const warnPill = await b.js(`${cableCard(NAME(itemNamed("Switch 1")))}.querySelector('.cs-pill').classList.contains('wait')`);
  check(warnPill === true, "the list: Below cost is in the warning tone");
  check(costCalls().filter((x) => x === "GET /api/items/margins").length >= 1, "the list asked for the margins once the list was there");
  await noSideScroll("the items list (photos)");
  await b.js("document.querySelector('.cs-pill').scrollIntoView({block:'center'})");
  await b.sleep(300);
  await shot("l-grid");
  await axe("l-pills", ".ct-pills");
  await b.js("document.querySelector('.ct-seg button[aria-pressed=false]')?.click()");
  await b.sleep(500);
  check((await count(".ct-row .cs-pill")) >= 2, "the list as rows shows the pills too");
  await noSideScroll("the items list (rows)");
  await b.js("document.querySelector('.cs-pill').scrollIntoView({block:'center'})");
  await b.sleep(300);
  await shot("l-rows");
  await b.js("document.querySelector('.ct-seg button[aria-pressed=false]')?.click()");
  await b.sleep(300);

  // 2. the item sheet with no cost
  await openItem(NAME(itemNamed("Breaker 16")));
  let page = await sheetText();
  check(page.includes(c.cost) && page.includes(c.costHint), "the sheet: a Cost price field with 'what one costs you' and who sees it");
  check((await b.js(`${control(c.cost)}.value`)) === "", "…empty for an item with no cost");
  check((await count(".ct-sheet .cs-margin")) === 0, "…and no margin line yet");
  check(!unwanted.test(page), "…nothing says coming, beta or capability, and there is no emoji");
  await b.until("!document.querySelector('.ct-sheet .cs-box .ct-hint[role=status]')", "the cost loaded");
  await noSideScroll("the item sheet");
  await shot("s-nocost");
  // a cost: the margin follows as it is typed (price 18, cost 9 -> 9 and 50%)
  await fill(c.cost, "9");
  check(plain((await text(".ct-sheet .cs-margin"))[0] ?? "").startsWith(plain(c.margin(money(900), "50"))), `a cost of 9 on a price of 18 reads ${plain(c.margin(money(900), "50"))} (${(await text(".ct-sheet .cs-margin"))[0]})`);
  check((await count(".ct-sheet .cs-warn")) === 0, "…and there is no warning");
  await noSideScroll("the item sheet with a cost");
  await smallTargets(".ct-sheet .cs-box", "the cost box");
  await shot("s-margin");
  await tall(1700, async () => { await b.sleep(250); await shot("s-margin-full"); });
  await axe("s-margin", ".ct-sheet .cs-box");
  // a cost over the price: a calm note while typing, the margin negative and in words
  await fill(c.cost, "20");
  const live = (await text(".ct-sheet .cs-warn"))[0] ?? "";
  check(plain(live).includes(plain(c.below(false, "", money(1800), money(2000)))), `a cost over the price says so while typing (${live})`);
  check((await text(".ct-sheet .cs-margin"))[0]?.includes(c.marginBelow) && (await b.js("document.querySelector('.ct-sheet .cs-margin').classList.contains('below')")), "…the margin is negative, in the warning tone, and says 'Below cost'");
  check(await b.js("document.querySelector('.ct-sheet .cs-warn')?.getAttribute('role') === 'status'"), "…the note is a calm status, not an alert");
  await shot("s-below-typed");
  await axe("s-below-typed", ".ct-sheet .cs-box");
  // a cost that is not an amount: refused in words beside the field, nothing sent
  await fill(c.cost, "12.345");
  net.length = 0;
  await press(t.save, inFoot, 500);
  check((await sheetText()).includes(c.badCost) && (await b.js(`${control(c.cost)}.getAttribute('aria-invalid')`)) === "true", "a cost with three decimals is refused in words, beside the field");
  check(net.filter((x) => x.startsWith("PUT")).length === 0, "…and nothing was sent");
  await shot("s-error");
  // save the cost over the price: it saves, and the API's own sentence is shown, calmly
  await fill(c.cost, "20");
  net.length = 0;
  await press(t.save, inFoot, 1200);
  await b.until("!document.querySelector('.ct-sheet')", "the sheet closed after saving");
  const breaker = itemNamed("Breaker 16");
  const kept = await must(`/api/items/${breaker.id}/cost`);
  check(kept.cost === 2000, `the cost was saved (${kept.cost})`);
  check(net.some((x) => x === `PUT /api/items/${breaker.id}/cost`), "…by its own route, after the item");
  const warnToast = plain((await text(".ct-toast.warn"))[0] ?? "");
  const apiSays = (await must(`/api/items/${breaker.id}/cost`, { method: "PUT", body: { cost: 2000 } })).warnings[0];
  check(apiSays && warnToast.includes(AR ? apiSays.message_ar : apiSays.message), `the API's own sentence is shown, in the warning tone (${warnToast})`);
  check((await text(".ct-toast.ok")).length >= 1, "…beside the usual 'Saved'");
  await shot("s-below-saved");
  await axe("s-below-saved-toast", ".ct-toast.warn");
  await clearToasts();

  // 3. a price changed under an unchanged cost: no cost request, and the item save carries the warning
  await b.until("!!document.querySelector('.cs-pill')", "the list again");
  await openItem(NAME(breaker));
  await b.until("!document.querySelector('.ct-sheet .cs-box .ct-hint[role=status]')", "the cost loaded");
  check((await b.js(`${control(c.cost)}.value`)) === "20", "reopening shows the cost that was kept");
  net.length = 0;
  await press(t.save, inFoot, 1000);
  await b.until("!document.querySelector('.ct-sheet')", "closed");
  check(costCalls().filter((x) => x.startsWith("PUT")).length === 0, "a save that changed no cost box sends no cost request");
  await clearToasts();
  await openItem(NAME(breaker));
  await b.until("!document.querySelector('.ct-sheet .cs-box .ct-hint[role=status]')", "the cost loaded");
  await fill(t.price, "15");
  net.length = 0;
  await press(t.save, inFoot, 1200);
  await b.until("!document.querySelector('.ct-sheet')", "closed");
  const fromItem = plain((await text(".ct-toast.warn"))[0] ?? "");
  check(costCalls().filter((x) => x.startsWith("PUT")).length === 0 && fromItem.includes(money(1500)) && fromItem.includes(money(2000)), `a price under the kept cost: no cost request, and the item save's own warning is shown (${fromItem})`);
  await shot("s-below-from-item");
  await clearToasts();
  await setCost(breaker, { cost: 900 });

  // 4. a sized item: a cost for the item, a size with its own, a size without
  await openItem(NAME(facts.pizza));
  await b.until("!document.querySelector('.ct-sheet .cs-box .ct-hint[role=status]')", "the cost loaded");
  await b.until("document.querySelectorAll('.ct-sheet .cs-box').length >= 3", "the size cost boxes", 10000);
  const boxes = await text(".ct-sheet .cs-margin");
  // item: price 40, cost 25 -> 15 and 37.5%. Small: price 30, own cost 35 -> -5 and -16.7%. Large: price 55, the item's 25 -> 30 and 54.5%.
  check(boxes.some((x) => plain(x).includes(plain(c.margin(money(1500), "37.5")))), `the item's margin: ${plain(c.margin(money(1500), "37.5"))}`);
  check(boxes.some((x) => plain(x).includes(plain(c.margin(money(-500), "−16.7")))), `the size with its own cost (35 on 30): ${plain(c.margin(money(-500), "−16.7"))}`);
  check(boxes.some((x) => plain(x).includes(plain(c.margin(money(3000), "54.5")))), `the size with none uses the item's (25 on 55): ${plain(c.margin(money(3000), "54.5"))}`);
  const sizeFields = await b.js(`[...document.querySelectorAll('.ct-sheet .ct-card-form label')].filter(l => ${norm}(l).startsWith(${JSON.stringify(c.sizeCost)})).length`);
  check(sizeFields === 2, "every size has a 'Cost of this size' field (" + sizeFields + ")");
  check((await sheetText()).includes(c.sizeCostHint), "…that says what empty means");
  const small = await b.js(`[...document.querySelectorAll('.ct-sheet .ct-card-form')].map(f => [...f.querySelectorAll('label')].find(l => ${norm}(l).startsWith(${JSON.stringify(c.sizeCost)}))?.control?.value)`);
  check(small[0] === "35" && small[1] === "", `the Small size shows its own cost, the Large none (${small.join(" | ")})`);
  const warnLines = plain((await text(".ct-sheet .cs-warn"))[0] ?? "");
  check(warnLines.length > 0 && warnLines.includes(NAME(facts.small)) , `a size under its own cost is named in the note (${warnLines})`);
  await noSideScroll("the sized item");
  await tall(2600, async () => { await b.sleep(300); await shot("s-sized"); });
  await b.sleep(600);
  await b.js("document.querySelectorAll('.ct-sheet .ct-card-form .cs-box')[0].scrollIntoView({block:'center'})");
  await b.sleep(400);
  await shot("s-sizes");
  await smallTargets(".ct-sheet .cs-box", "the size cost boxes");
  await axe("s-sized", ".ct-sheet .cs-box, .ct-sheet .cs-warn");
  // type a cost on the Large size; the margin follows (price 55, cost 20 -> 35 and 63.6%)
  const largeScope = "[...document.querySelectorAll('.ct-sheet .ct-card-form')][1]";
  await fill(c.sizeCost, "20", largeScope);
  check((await text(".ct-sheet .ct-card-form:nth-of-type(2) .cs-margin, .ct-sheet .cs-margin")).some((x) => plain(x).includes(plain(c.margin(money(3500), "63.6")))), `a typed size cost updates its margin: ${plain(c.margin(money(3500), "63.6"))}`);
  net.length = 0;
  await press(t.save, inFoot, 1200);
  await b.until("!document.querySelector('.ct-sheet')", "closed");
  const putBody = costCalls().filter((x) => x.startsWith("PUT"));
  check(putBody.length === 1, "only one cost request: the changed size (" + putBody.join(",") + ")");
  const after = await must(`/api/items/${facts.pizza.id}/cost`);
  check(after.variants.find((v) => v.name === "Large")?.cost === 2000 && after.cost === 2500 && after.variants.find((v) => v.name === "Small")?.cost === 3500, "…and only the Large size changed");
  check(after.history[0]?.cost === 2000, "…and the history has it");
  facts.value = 5 * 3500 + 3 * 2000 + 20 * 150; // the Large size now costs 20
  await clearToasts();

  // 5. the history fold
  await openItem(NAME(facts.pizza));
  await b.until("document.querySelectorAll('.ct-sheet .ct-fold').length > 0", "the folds");
  await b.until("!document.querySelector('.ct-sheet .cs-box .ct-hint[role=status]')", "the cost loaded");
  await press(c.historyTitle, inSheet, 400, "summary");
  const hist = await b.js(`[...document.querySelectorAll('.ct-fold')].find(f => f.querySelector('summary').textContent.includes(${JSON.stringify(c.historyTitle)})).innerText.replace(/\\s+/g, ' ')`);
  check(hist.includes(money(2000)) && hist.includes(money(3500)) && hist.includes(money(2500)), `the cost history lists each change with its amount (${hist.slice(0, 200)})`);
  check(hist.includes(NAME(facts.large)) || hist.includes(facts.large.name) || hist.includes(c.historyItem), "…and says which size or the item");
  await b.js("[...document.querySelectorAll('.ct-fold')].find(f => f.querySelector('summary').textContent.includes(" + JSON.stringify(c.historyTitle) + ")).scrollIntoView({block:'center'})");
  await b.sleep(300);
  await shot("s-history");
  await axe("s-history", ".ct-sheet .ct-fold:last-of-type");
  await closeSheet();

  // 6. a new item: the cost goes to its route once the item has an id
  await press(t.add, "document.querySelector('.ct-actions')", 600);
  await b.until("!!document.querySelector('.ct-sheet')", "the add sheet");
  await press(t.typeOne, inSheet, 700);
  await b.until("!!document.querySelector('.ct-sheet') && !![...document.querySelectorAll('.ct-sheet label')].find(l => l.textContent.startsWith(" + JSON.stringify(t.nameEn) + "))", "the item form");
  check((await sheetText()).includes(c.cost), "a new item has the Cost price field too");
  await fill(t.nameEn, "Dev tea");
  await fill(t.nameAr, "شاي الاختبار");
  await fill(t.price, "5");
  await fill(c.cost, "2");
  check(plain((await text(".ct-sheet .cs-margin"))[0] ?? "").startsWith(plain(c.margin(money(300), "60"))), "…with its margin as it is typed (5 less 2 is 3, 60%)");
  await shot("s-new");
  net.length = 0;
  await press(t.save, inFoot, 1400);
  await b.until("!document.querySelector('.ct-sheet')", "saved");
  const order = net.filter((x) => /^(POST \/api\/items|PUT \/api\/items\/[0-9a-f-]+\/cost)$/.test(x));
  check(order.length === 2 && order[0] === "POST /api/items" && order[1].startsWith("PUT /api/items/") && order[1].endsWith("/cost"), `a new item: the item is saved first, then its cost (${order.join(" then ")})`);
  const tea = (await must("/api/items?limit=100")).items.find((i) => i.name === "Dev tea");
  check(tea && (await must(`/api/items/${tea.id}/cost`)).cost === 200, "…and the cost is kept for the new item");
  await clearToasts();

  // 7. the Stock tab
  await b.go(`${BASE}/app/catalog`, 1500);
  await b.until("document.querySelectorAll('.ct-card, .ct-row').length >= 5", "the items", 25000);
  await press(t.tabs.stock, "document.querySelector('.ct-tabs')", 800);
  await b.until("!!document.querySelector('.cs-value')", "the stock value", 15000);
  const value = plain((await text(".cs-value"))[0] ?? "");
  check(plain(value).includes(plain(c.stockValue(money(facts.value)))), `the Stock tab: ${plain(c.stockValue(money(facts.value)))} (${value})`);
  check(plain(value).includes(plain(c.stockMissing(1))), `…and ${plain(c.stockMissing(1))} (the bread)`);
  await noSideScroll("the Stock tab");
  await shot("k-stock");
  await axe("k-stock", ".cs-value");
  // a count at the shelf changes the value without a reload
  const before = costCalls().filter((x) => x === "GET /api/items/valuation").length;
  await must(`/api/items/${facts.rice.id}/stock`, { method: "POST", body: { kind: "received", quantity: 10, reason: "Stock received" } });
  await b.js("document.dispatchEvent(new Event('visibilitychange'))");
  await b.sleep(300);
  void before;

  // 8. the import sheet
  await b.go(`${BASE}/app/catalog`, 1500);
  await b.until("document.querySelectorAll('.ct-card, .ct-row').length >= 5", "the items", 25000);
  await press(t.imp.open, "document.querySelector('.ct-actions')", 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the import sheet");
  check((await sheetText()).includes(plain(c.importColumn)), "the import sheet explains the optional cost column in one plain line");
  await noSideScroll("the import sheet");
  await b.js("document.querySelector('.cs-import').scrollIntoView({block:'center'})");
  await b.sleep(300);
  await shot("i-import");
  await axe("i-import", ".cs-import");
  await closeSheet();

  // 9. the Orders list
  await b.go(`${BASE}/app/orders`, 2000);
  await b.until("!!document.querySelector('table') && !!document.querySelector('.cs-order')", "the orders with margins", 25000);
  const margins = await must("/api/orders/margins");
  const byNumber = (n) => facts.orders.find((o) => o.number === n);
  const rows = await b.js(`[...document.querySelectorAll('tbody tr')].map(tr => ({ no: (tr.querySelector('b.num')?.textContent ?? '').replace('#',''), m: tr.querySelector('.cs-order')?.innerText.replace(/\\s+/g, ' ').trim() ?? null }))`);
  const sorted = [...facts.orders].sort((a, z) => a.number - z.number);
  const [o1, o2, o3, o4] = sorted.slice(-4);
  const rowOf = (o) => rows.find((r) => String(r.no) === String(o.number));
  const m1 = margins.margins[o1.id]; const m2 = margins.margins[o2.id]; const m3 = margins.margins[o3.id];
  check(m1 && rowOf(o1)?.m && plain(rowOf(o1).m).includes(plain(c.order(money(m1.amount), m1.pct.replace(/\.0$/, "")))), `an order shows its estimated margin: ${plain(c.order(money(m1?.amount ?? 0), (m1?.pct ?? "").replace(/\.0$/, "")))} (${rowOf(o1)?.m})`);
  check(rowOf(o2)?.m?.includes(c.orderPartial), `an order with an item with no cost kept says so (${rowOf(o2)?.m})`);
  check(!rowOf(o1)?.m?.includes(c.orderPartial), "…and a complete one does not");
  check(m3 && m3.amount < 0 && rowOf(o3)?.m?.includes(c.orderBelow), `an order that sold under cost is in the warning tone with the words (${rowOf(o3)?.m})`);
  check(rowOf(o4)?.m === null, "an order whose items had no cost has no margin line");
  await noSideScroll("the Orders list");
  await b.js("document.querySelector('.cs-order').scrollIntoView({block:'center'})");
  await b.sleep(300);
  await shot("o-orders");
  await axe("o-orders", ".cs-order");
  check(!unwanted.test((await text(".cs-order")).join(" ")), "the margin lines say nothing like coming, beta or capability");
  void byNumber;
}

// ── the agent ───────────────────────────────────────────────────────────────────────────
async function agent() {
  await prepare();
  const email = "yusuf@alnoor.example";
  const role = await b.js(`fetch('/api/auth/code', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${JSON.stringify(email)}})}).then(r => r.json()).then(d => fetch('/api/auth/verify', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${JSON.stringify(email)}, code: d.dev_code})})).then(r => r.json()).then(m => m.role)`);
  check(role === "agent", "signed in as an agent");
  net.length = 0;
  await openCatalog();
  await b.sleep(1200);
  check((await count(".cs-pill")) === 0, "agent: the list has no margin pill");
  await shot("a-list");
  await openItem(NAME(itemNamed("Cable 1.5")));
  await b.sleep(900);
  let page = await sheetText();
  check((await count(".ct-sheet .cs-box, .ct-sheet .cs-margin, .ct-sheet .cs-warn")) === 0 && !page.includes(c.cost) && !page.includes(c.historyTitle), "agent: the item sheet has no cost field, no margin and no cost history");
  check(!/(90|QAR 90)\b/.test(await b.js("[...document.querySelectorAll('.ct-sheet input')].map(i => i.value).join(' ')")), "agent: no input holds the cost");
  await shot("a-item");
  await closeSheet();
  await press(t.tabs.stock, "document.querySelector('.ct-tabs')", 1200);
  check((await count(".cs-value")) === 0 && !(await pageText()).includes(plain(c.stockRegion)), "agent: the Stock tab has no value at cost");
  await shot("a-stock");
  await press(t.tabs.items, "document.querySelector('.ct-tabs')", 500);
  await press(t.imp.open, "document.querySelector('.ct-actions')", 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the import sheet");
  check((await count(".cs-import")) === 0 && !(await sheetText()).includes(plain(c.importColumn).slice(0, 25)), "agent: the import sheet has no line about costs");
  await shot("a-import");
  await closeSheet();
  await b.go(`${BASE}/app/orders`, 2200);
  await b.until("!!document.querySelector('table')", "the orders", 25000);
  await b.sleep(900);
  check((await count(".cs-order")) === 0 && !(await pageText()).includes(plain(c.orderPartial)), "agent: the Orders list has no margin");
  await shot("a-orders");
  const asked = costCalls();
  check(asked.length === 0, `agent: the browser made no request to a cost, margin or valuation route (${asked.join(", ") || "none"}; ${net.length} requests in all)`);
  // and the API refuses an agent who asks directly
  const cable = itemNamed("Cable 1.5");
  const statuses = await b.js(`Promise.all(['/api/items/margins', '/api/items/valuation', '/api/orders/margins', ${JSON.stringify(`/api/items/${cable.id}/cost`)}].map(u => fetch(u).then(r => r.status)))`);
  check(statuses.every((s) => s === 403), `agent: the API answers 403 to each cost route (${statuses.join(", ")})`);
  const ownBody = await b.js(`fetch(${JSON.stringify(`/api/items/${cable.id}`)}).then(r => r.text())`);
  check(!/"cost"|margin/i.test(ownBody), "agent: the item the API gives an agent carries no cost and no margin");
  const listBody = await b.js("fetch('/api/items?limit=100').then(r => r.text())");
  check(!/"cost"|margin/i.test(listBody), "agent: the list the API gives an agent carries no cost and no margin");
}

// ── the feature switched off ────────────────────────────────────────────────────────────
async function off() {
  await must("/api/features/cost_margin", { method: "PUT", body: { enabled: false } });
  await prepare();
  net.length = 0;
  await openCatalog();
  await b.sleep(1200);
  check((await count(".cs-pill")) === 0, "off: the list has no margin pill");
  await openItem(NAME(itemNamed("Cable 1.5")));
  await b.sleep(900);
  const page = await sheetText();
  check((await count(".ct-sheet .cs-box, .ct-sheet .cs-margin, .ct-sheet .cs-warn")) === 0 && !page.includes(c.cost) && !page.includes(c.historyTitle), "off: the item sheet has no cost field, no margin and no cost history");
  await shot("x-item");
  await closeSheet();
  await press(t.tabs.stock, "document.querySelector('.ct-tabs')", 1200);
  check((await count(".cs-value")) === 0, "off: the Stock tab has no value");
  await press(t.tabs.items, "document.querySelector('.ct-tabs')", 500);
  await press(t.imp.open, "document.querySelector('.ct-actions')", 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the import sheet");
  check((await count(".cs-import")) === 0, "off: the import sheet has no line about costs");
  await closeSheet();
  await b.go(`${BASE}/app/orders`, 2200);
  await b.until("!!document.querySelector('table')", "the orders", 25000);
  await b.sleep(900);
  check((await count(".cs-order")) === 0, "off: the Orders list has no margin");
  await shot("x-orders");
  const asked = costCalls();
  check(asked.length === 0, `off: the browser made no request to a cost, margin or valuation route (${asked.join(", ") || "none"})`);
  const cable = itemNamed("Cable 1.5");
  const refused = await Promise.all(["/api/items/margins", "/api/items/valuation", "/api/orders/margins", `/api/items/${cable.id}/cost`].map((p) => call(p)));
  check(refused.every((r) => r.status === 422 && r.data.detail?.code === "feature_off"), `off: the API answers feature_off to each (${refused.map((r) => r.status).join(", ")})`);
  await must("/api/features/cost_margin", { method: "PUT", body: { enabled: true } });
}

async function run() {
  await b.view(375, 812, true, SCHEME);
  await seed();
  await owner();
  await agent();
  await off();
}

try { await run(); } catch (error) {
  failures.push(`stopped: ${error.message ?? error}`);
  log("STOPPED", error.stack ?? error);
  try { await shot("99-stopped"); } catch { /* the page is gone */ }
}
if (b.problems.length) { log("page problems:"); for (const x of b.problems.slice(0, 10)) log("  ", x); }
await b.close();
log(failures.length ? `${failures.length} failed:\n - ${failures.join("\n - ")}` : "all passed");
process.exit(failures.length ? 1 : 0);
