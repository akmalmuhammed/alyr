// Discounts and coupon codes, proved in a real browser (ALY-150, specs/014-pricing-pack/spec.md,
// part 1). Headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages.
// At 375 px, in English or Arabic, light or dark (one language and one scheme per run):
//   * the workspace: the Discounts button appears only with the feature on; the sheet empty,
//     a rule made through the form, the list with every state, the form for each kind of value
//     (percentage, amount, buy some get some free) and for chosen items and categories, a
//     refusal from the form and one from the API shown beside Save, pause, resume, end (it asks
//     first), make a copy;
//   * the Orders list: a discounted order shows the goods, each discount in words and the total,
//     and an order without a discount reads as before;
//   * the customer's order page: the offer line, the code box in the review, a code applied
//     (a chip with what it takes off, the lines struck through, the Items line, the discount
//     line, the total, the pay button), a code that fails with the shop's own sentence under the
//     box, the total changing between the check and the tap, a code stopping between them, and
//     the order placed at the total that was shown;
//   * the tracking page: subtotal, discount lines and total, and an order without a discount
//     unchanged;
//   * the feature switched off: nothing about it is left in the workspace or on the page.
// axe-core runs on every screen it opens. Screenshots are written for a person to look at.
//
//   node scripts/pricing-browser-check.mjs --lang en --scheme light \
//        --base http://localhost:3191 --api http://127.0.0.1:8331 --out C:/t/p1/shots \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on a scratch database of its own (it resets the demo shop Al Noor in it and
// turns the Catalog and Discounts on) and the web app pointed at it; never the shared database.
// It drives only its own Edge (its own --profile and a random free --port). Short folders: Edge
// fails quietly with long paths. Node 22.18 or newer (it reads the words from the .ts copy files).

import { mkdirSync, writeFileSync } from "node:fs";
import { launch, trackPath } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { PRICING } from "../apps/web/app/(product)/_workspace/pricingCopy.ts";
import { T as ORDER } from "../apps/web/app/(product)/_customer/order/copy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3191";
const API = args.api ?? "http://127.0.0.1:8331";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const OUT = args.out ?? "C:/t/p1/shots";
const PROFILE = args.profile ?? `C:/t/p1/prof-${LANG}-${SCHEME}`;
const PORT = Number(args.port ?? 20000 + Math.floor(Math.random() * 20000));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "C:/t/tools/node_modules/axe-core/axe.min.js";
const p = PRICING[LANG];
const t = COPY[LANG];
const o = ORDER[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}/${SCHEME}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const pick = (en, ar) => (AR ? ar : en);
const money = (dirhams) => {
  const whole = Math.floor(dirhams / 100);
  const part = dirhams % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `${grouped}${part ? `.${String(part).padStart(2, "0")}` : ""}`;
  return AR ? `${text} ر.ق` : `QAR ${text}`;
};

// ── the shop's side ─────────────────────────────────────────────────────────────────────
async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const must = async (path, opts) => {
  const r = await call(path, opts);
  if (r.status >= 300) throw new Error(`${opts?.method ?? "GET"} ${path} -> ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
};
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 16);

let tenant = "";
let items = [];
let people = [];
const itemNamed = (en) => items.find((i) => i.name.startsWith(en));
async function seed() {
  await call("/sim/reset", { method: "POST" });
  const shops = (await must("/api/admin/businesses")).businesses;
  tenant = shops.find((s) => s.slug === "al-noor").id;
  await must(`/api/admin/businesses/${tenant}/modules/catalog`, { method: "POST", body: { enabled: true } });
  await must("/api/features/discounts", { method: "PUT", body: { enabled: true } });
  items = (await must("/api/items?limit=100")).items;
  people = (await must("/api/ledger/summary")).customers.filter((c) => c.phone).slice(0, 4);
}
const rule = (body) => must("/api/discounts", { method: "POST", body: {
  kind: "coupon", code: "", name: "", name_ar: "", value_type: "percent", scope: "order", item_ids: [], categories: [],
  min_order: 0, usage_limit: null, per_customer_limit: null, starts_at: null, ends_at: null, stackable: false, group_id: null, ...body,
} }).then((r) => r.rule);
async function linkFor(who) {
  const sent = await must("/sim/messages", { method: "POST", body: { from_number: who.phone, text: "order" } });
  const body = sent.messages.map((m) => m.body).filter((x) => x.includes("?t=")).at(-1);
  return `${BASE}/s/al-noor?t=${body.split("?t=")[1].split(/\s/)[0]}`;
}
const tokenOf = (link) => link.split("?t=")[1];
const orderVia = (link, lines, coupons = []) => call("/api/store/al-noor/orders", { method: "POST", body: {
  token: tokenOf(link), payment: "link", items: lines.map(([item, quantity]) => ({ product_id: item.id, quantity })), coupons,
} });

// ── the page ────────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: SCHEME });
const body = () => b.js("document.body.innerText.replace(/\\s+/g, ' ')");
const text = (selector) => b.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
const count = (selector) => b.js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const sheetText = () => b.js("(document.querySelector('.ct-sheet')?.innerText ?? '').replace(/\\s+/g, ' ')");
const dialogText = () => b.js("(document.querySelector('dialog[open]')?.innerText ?? '').replace(/\\s+/g, ' ')");
const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const press = (label, scope = "document", wait = 300, tag = "button") =>
  b.click(`[...${scope}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(label)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`, wait);
const inSheet = "document.querySelector('.ct-sheet')";
const inDialog = "document.querySelector('dialog[open]')";
/** The control a label names, inside the open sheet or dialog. */
const control = (label, scope = inSheet) => `[...${scope}.querySelectorAll('label')].find(l => ${norm}(l).startsWith(${JSON.stringify(label)}))?.control`;
async function fill(label, value, scope = inSheet) {
  await b.click(control(label, scope), 120);
  await b.clearFocused();
  if (value) await b.type(value);
  await b.sleep(80);
}
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${SCHEME}-${name}.png`); log("shot", name); };
async function noSideScroll(what) {
  const wide = await b.js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth ? document.documentElement.scrollWidth : 0");
  check(!wide, `no sideways scrolling on ${what}${wide ? ` (${wide})` : ""}`);
}
async function axe(what, scope = null) {
  const found = await b.axe(AXE, scope);
  if (found === null) { log("axe skipped"); return; }
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-axe-${what}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: nothing on ${what} (${found.map((v) => v.id).join(", ") || "clean"})`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
/** Things a thumb has to hit that are under 44 px either way (a checkbox is its label). */
async function smallTargets(scope, what) {
  // (A switch is 26 px tall and has a 44 px press area drawn around it, as in every Catalog sheet.)
  const small = await b.js(`(() => [...${scope}.querySelectorAll('button:not([role=switch]), a[href], input, select, summary')].filter(${visible}).map((e) => {
    const box = (e.matches('input[type=checkbox], input[type=radio]') ? (e.closest('label') ?? e) : e).getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height), what: (e.getAttribute('aria-label') || e.textContent || e.name || e.type || '').trim().slice(0, 30) };
  }).filter((x) => x.w < 44 || x.h < 44))()`);
  check(small.length === 0, `every target is 44 px or more on ${what}${small.length ? ` (${JSON.stringify(small)})` : ""}`);
}
const unwanted = /\b(coming soon|coming|beta|early access|not yet|under development|capabilit)\w*|قريباً|قريبا|نسخة تجريبية|[\u{1F300}-\u{1FAFF}]/iu;
const tall = async (height, fn) => {
  await b.view(375, height, true, SCHEME);
  try { await fn(); } finally { await b.view(375, 812, true, SCHEME); }
};
const closeSheet = () => press(p.close, inSheet, 400);
// A person would dismiss a message that sits over what they want to press next.
const clearToasts = () => b.js("document.querySelectorAll('.ct-toast-x').forEach((x) => x.click())").then(() => b.sleep(150));
/** A customer's page opens in the language they chat in; the language switch in its header sets it. */
async function ensureLang() {
  if ((await b.js("document.querySelector('.cx')?.getAttribute('lang')")) !== LANG) await b.click("document.querySelector('.cx-lang')", 600);
  await b.sleep(300);
}
const PAY ="document.querySelector('dialog[open] .ox-dfoot .cx-btn:not(.ghost)')";

async function openDiscounts() {
  await b.go(`${BASE}/app/catalog`, 2200);
  await b.until("!![...document.querySelectorAll('.ct-actions button')].find(e => e.textContent.includes(" + JSON.stringify(p.open) + "))", "the Discounts button", 20000);
  await press(p.open, "document.querySelector('.ct-actions')", 500);
  await b.until("!!document.querySelector('.ct-sheet')", "the sheet");
}

async function workspace() {
  // The button is there only with the feature on, and a feature that is off draws nothing.
  await b.go(`${BASE}/app`, 400);
  await b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-theme', ${JSON.stringify(SCHEME)})`);
  await must("/api/features/discounts", { method: "PUT", body: { enabled: false } });
  await b.go(`${BASE}/app/catalog`, 2200);
  await b.until("!!document.querySelector('.ct-actions')", "the Catalog", 20000);
  check(!(await text(".ct-actions button")).some((x) => x.includes(p.open)), "no Discounts button while the feature is off");
  const refused = await call("/api/discounts");
  check(refused.status === 422 && refused.data.detail?.code === "feature_off", "the API answers feature_off while it is off");
  await must("/api/features/discounts", { method: "PUT", body: { enabled: true } });

  // 1. empty
  await openDiscounts();
  check((await text(".ct-actions button")).some((x) => x.includes(p.open)), "the Discounts button is in the Catalog's actions once the feature is on");
  let page = await sheetText();
  check(page.includes(p.title) && page.includes(p.emptySlot) && page.includes(p.add), "empty: the sheet says what will show here and offers Add");
  check(page.includes(p.givenNone), "empty: the header says nothing has been given away");
  check(!unwanted.test(page), "empty: nothing says coming, beta or capability, and there is no emoji");
  await noSideScroll("the empty Discounts sheet");
  await smallTargets(inSheet, "the empty sheet");
  await shot("d-empty");
  await axe("d-empty");

  // 2. a coupon made through the form
  await press(p.add, inSheet, 400);
  await b.until("!!document.querySelector('#pr-form')", "the form");
  page = await sheetText();
  check(page.includes(p.newTitle) && page.includes(p.codeHint), "the form says what a code is (3 to 24 letters or numbers)");
  await fill(p.code, "ramadan 10");
  check((await b.js(`${control(p.code)}.value`)) === "RAMADAN10", "a code is shown in capitals with no spaces as it is typed");
  await fill(p.name, "Ramadan");
  await fill(p.nameAr, "رمضان");
  await fill(p.percent, "10");
  await fill(p.minOrder, "100");
  await fill(p.usageLimit, "100");
  await fill(p.perCustomer, "1");
  await noSideScroll("the form");
  await smallTargets(inSheet, "the form");
  await shot("f-percent");
  await tall(1900, async () => { await b.sleep(250); await shot("f-percent-full"); });
  await axe("f-percent");
  // a refusal beside Save before anything is sent
  await fill(p.percent, "150");
  await press(p.save, inSheet, 300);
  page = await sheetText();
  check(page.includes(p.err.percent) && page.includes(p.fixFields), "a percentage over 100 is refused in words, beside the field and beside Save");
  check((await b.js(`${control(p.percent)}.getAttribute('aria-invalid')`)) === "true", "…and the field is marked invalid for a screen reader");
  await shot("f-error-field");
  await fill(p.percent, "10");
  await press(p.save, inSheet, 900);
  await b.until("!document.querySelector('#pr-form')", "back to the list");
  page = await sheetText();
  check(page.includes("RAMADAN10") && page.includes(p.states.active), "the rule appears in the list, Active");
  check(page.includes(AR ? "10%" : "10%"), "…with the rule in words from the API");
  await shot("d-first");

  // 3. the other rules, from the API, to show every state
  const cable = itemNamed("Cable 1.5");
  const cable25 = itemNamed("Cable 2.5");
  const breaker = itemNamed("Breaker 16");
  const ids = {};
  ids.auto = await rule({ kind: "auto", name: "Weekend offer", name_ar: "عرض نهاية الأسبوع", percent: 10, min_order: 20000 });
  ids.scheduled = await rule({ code: "EID25", value_type: "amount", amount: 2500, starts_at: day(20), ends_at: day(30), name: "Eid", name_ar: "العيد" });
  ids.paused = await rule({ code: "HOLD5", value_type: "amount", amount: 500, stackable: true });
  await must(`/api/discounts/${ids.paused.id}/pause`, { method: "POST" });
  ids.once = await rule({ code: "LAST1", value_type: "amount", amount: 1000, usage_limit: 1 });
  ids.old = await rule({ code: "OLD20", percent: 20 });
  ids.free = await rule({ code: "BUY2GET1", value_type: "free_units", buy_qty: 2, get_qty: 1, scope: "selected", categories: ["Breakers"], per_customer_limit: 2 });
  ids.items = await rule({ code: "TAKE5", value_type: "amount", amount: 500, scope: "selected", item_ids: [cable.id, breaker.id], stackable: true, ends_at: day(40) });
  // used: LAST1 once (it is then used up), RAMADAN10 by a first order
  const link = await linkFor(people[0]);
  const used = await orderVia(link, [[breaker, 1]], ["LAST1"]);
  check(used.status === 200, `an order uses the last use of LAST1 (${used.status})`);
  await must(`/api/discounts/${ids.old.id}/end`, { method: "POST" });

  await b.go(`${BASE}/app/catalog`, 2000);
  await openDiscounts();
  page = await sheetText();
  for (const [state, label] of Object.entries(p.states)) check(page.includes(label), `the list shows a rule that is ${label}`);
  check(page.includes(p.used(1, money(1000))), "a used rule says how many times and what it has given");
  check(page.includes(p.usedNone), "a rule not used yet says so");
  check(page.includes(p.limitTotal(1)) && page.includes(p.limitEach(2)), "limits are said in plain words");
  check(page.includes(p.combinable) && page.includes(p.onlyItems(`${AR ? cable.name_ar : cable.name}${AR ? "، " : ", "}${AR ? breaker.name_ar : breaker.name}`)), "chosen items are named, and 'can be combined' is said");
  check(page.includes(AR ? "العيد" : "Eid"), "a name is shown with the code");
  check(page.includes(p.given(money(1000))), "the header says the total given away");
  check(!unwanted.test(page), "the list says nothing like coming, beta or capability");
  await noSideScroll("the Discounts list");
  await tall(2600, async () => { await b.sleep(250); await shot("d-list"); });
  await smallTargets(inSheet, "the list");
  await axe("d-list");

  // 4. pause, resume, end (asks first), copy
  const card = (code) => `[...document.querySelectorAll('.pr-rule')].find(e => e.querySelector('.pr-code')?.textContent === ${JSON.stringify(code)})`;
  await press(p.pauseNamed("RAMADAN10"), `${card("RAMADAN10")}`, 700);
  await b.until(`${card("RAMADAN10")}.textContent.includes(${JSON.stringify(p.states.paused)})`, "RAMADAN10 paused");
  check(true, "Pause: the rule is now Paused");
  await clearToasts();
  await press(p.resumeNamed("RAMADAN10"), `${card("RAMADAN10")}`, 700);
  await b.until(`${card("RAMADAN10")}.textContent.includes(${JSON.stringify(p.states.active)})`, "RAMADAN10 active again");
  check(true, "Resume: the rule is Active again");
  await clearToasts();
  await press(p.endNamed("TAKE5"), `${card("TAKE5")}`, 400);
  check((await b.js(`${card("TAKE5")}.querySelector('[role=alertdialog]')?.innerText`))?.includes(p.endAsk("TAKE5").slice(0, 20)), "End asks first, in words, and says it is for good");
  await shot("d-end-ask");
  await press(p.endKeep, `${card("TAKE5")}`, 300);
  check((await b.js(`${card("TAKE5")}.textContent.includes(${JSON.stringify(p.states.ended)})`)) === false, "Keep it leaves the rule as it was");
  await clearToasts();
  await press(p.endNamed("TAKE5"), `${card("TAKE5")}`, 400);
  await clearToasts();
  await press(p.endConfirm, `${card("TAKE5")}`, 800);
  await b.until(`${card("TAKE5")}.textContent.includes(${JSON.stringify(p.states.ended)})`, "TAKE5 ended");
  const buttons = await b.js(`[...${card("TAKE5")}.querySelectorAll('button')].map(e => e.textContent.trim())`);
  check(buttons.length === 1 && buttons[0] === p.copy, `an ended rule offers only 'Make a copy' (${buttons.join(" | ")})`);
  await clearToasts();
  await press(p.copyNamed("TAKE5"), `${card("TAKE5")}`, 500);
  await b.until("!!document.querySelector('#pr-form')", "the copy form");
  page = await sheetText();
  check(page.includes(p.copyTitle) && page.includes(p.copyHint) && page.includes(p.copyDatesCleared), "Make a copy opens the form with a note: choose a new code, and the dates were left empty");
  check((await b.js(`${control(p.code)}.value`)) === "", "the copy's code is empty: a new one must be chosen");
  check(page.includes(p.scopeSelected[0]) && (await b.js("[...document.querySelectorAll('#pr-form input[type=checkbox]')].filter(e => e.checked).length")) === 2, "…and the rest is copied (the two chosen items are ticked)");
  await shot("f-copy");
  // the API's own sentence beside Save: a code that is taken
  await fill(p.code, "ramadan10");
  await press(p.save, inSheet, 900);
  page = await sheetText();
  check(page.includes(pick("You already have a discount with this code.", "لديك خصم بهذا الرمز بالفعل.")), "a taken code is refused with the API's sentence, beside Save");
  check((await b.js("!!document.querySelector('.ct-sheet-foot [role=alert]')")), "…in the footer, next to the buttons");
  await shot("f-error-api");
  await fill(p.code, "TAKE5B");
  await press(p.save, inSheet, 900);
  await b.until("!document.querySelector('#pr-form')", "the copy saved");
  check((await sheetText()).includes("TAKE5B"), "the copy is saved under its new code");

  // 5. the form for each kind of value
  await press(p.add, inSheet, 400);
  await b.until("!!document.querySelector('#pr-form')", "the form");
  await press(p.gives.amount[0], "document.querySelector('#pr-form')", 250, "label");
  await fill(p.amount, "12.50");
  check((await b.js(`${control(p.amount)}.value`)) === "12.50", "an amount in riyals takes two decimals");
  await shot("f-amount");
  await press(p.gives.free_units[0], "document.querySelector('#pr-form')", 250, "label");
  await b.until(`!!${control(p.buy)}`, "buy and get");
  await shot("f-free");
  await press(p.kindAuto[0], "document.querySelector('#pr-form')", 250, "label");
  check((await b.js(`!![...document.querySelectorAll('#pr-form label')].find(l => ${norm}(l).startsWith(${JSON.stringify(p.code)}))`)) === false, "an automatic discount has no code field");
  await press(p.scopeSelected[0], "document.querySelector('#pr-form')", 500, "label");
  await b.until("!!document.querySelector('.pr-items li')", "the items to choose from", 15000);
  await press(p.save, inSheet, 300);
  check((await sheetText()).includes(p.err.scope), "chosen items with nothing chosen is refused in words");
  await shot("f-error-scope");
  await press("Cables", "document.querySelector('#pr-form')", 200, "label");
  await b.click("document.querySelector('.pr-items input[type=checkbox]')", 200);
  check((await b.js("document.querySelectorAll('.pr-pick input:checked').length")) === 2, "a category and an item can be chosen together");
  await b.click("document.querySelector('.pr-itemsearch')", 100);
  await b.type(pick("cable", "كيبل"));
  await b.sleep(200);
  check((await count(".pr-items li")) >= 1, "the items can be searched by name");
  await shot("f-scope");
  await tall(2200, async () => { await b.sleep(250); await shot("f-scope-full"); });
  await axe("f-scope");
  await smallTargets(inSheet, "the chosen-items form");
  await press(p.cancel, inSheet, 400);
  await b.until("!document.querySelector('#pr-form')", "back to the list");
  await closeSheet();
}

async function orders() {
  // Orders: one with a discount, one without.
  const first = await linkFor(people[1]);
  const second = await linkFor(people[2]);
  const placed = await orderVia(first, [[itemNamed("Cable 1.5"), 2]], ["ramadan 10"]);
  check(placed.status === 200 && placed.data.pricing?.discount_total > 0, `a discounted order is placed (${placed.status}, off ${placed.data.pricing?.discount_total})`);
  await orderVia(second, [[itemNamed("Switch 1"), 1]]);
  await b.go(`${BASE}/app/orders`, 2200);
  await b.until("!!document.querySelector('table')", "the orders", 20000);
  const sums = await count(".pr-sum");
  const total = await count("tbody tr");
  check(sums === 2 && total >= 3, `only the discounted orders show discount lines (${sums} of ${total} orders)`);
  const sum = (await text(".pr-sum")).filter((x) => x.includes("RAMADAN10"));
  check(sum.length === 1 && sum[0].includes("RAMADAN10") && sum[0].includes(p.order.items) && sum[0].includes(p.order.total), "it shows the goods, the code with its rule in words, and the total");
  check(sum[0].includes(money(placed.data.pricing.discount_total)), "…the amount taken off");
  await noSideScroll("Orders");
  await shot("orders");
  // (The table's own headers and the shell's landmarks are older than this work; axe is run on what is new.)
  await axe("orders", ".pr-sum");
}

async function customer() {
  const cable = itemNamed("Cable 1.5");
  const link = await linkFor(people[3]);
  await b.go(`${BASE}/s/al-noor`, 100);
  await b.js("sessionStorage.clear()");
  await b.go(link, 900);
  await b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)})`);
  await b.until("!!document.querySelector('.ox-list, .ox-wrow')", "the order page", 25000);
  // The page opens in the customer's language; set it by the switch when it is not.
  await ensureLang();
  const offers = await text(".ox-offers li");
  check(offers.length === 1 && offers[0].includes("10%"), `the page tells the automatic discount in words (${offers.join(" | ")})`);
  await shot("c-page");
  await axe("c-page");

  // add the cable twice and open the review
  const add = (name) => `[...document.querySelectorAll('.ox-card, .ox-wrow')].find(r => r.textContent.includes(${JSON.stringify(name)}))`;
  for (const _ of [1, 2]) await b.click(`${add(AR ? cable.name_ar : cable.name)}.querySelector('.ox-add, .ox-step button:last-child')`, 350);
  await b.until("!![...document.querySelectorAll('.cx-bar button, .cx-bar a')].length", "the bar", 8000);
  await press(o.review, "document", 600);
  await b.until("!!document.querySelector('dialog[open] .ox-coupon')", "the code box", 15000);
  await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the first check", 15000);
  let dlg = await dialogText();
  check(dlg.includes(o.codeLabel) && dlg.includes(o.codeApply), "the review has a Discount code box and an Apply button");
  await shot("c-review-plain");

  // a code applied (typed in lowercase with a space; Enter applies it)
  await b.click("document.querySelector('#ox-coupon-in')", 150);
  await b.type("ramadan 10");
  await b.key("Enter", "Enter", 13);
  await b.until("!!document.querySelector('dialog[open] .ox-codechip .ox-chipoff') && /[0-9]/.test(document.querySelector('dialog[open] .ox-codechip .ox-chipoff').textContent)", "the chip with its amount", 15000);
  await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the check with the code");
  dlg = await dialogText();
  const chips = await text(".ox-codechip");
  check(chips.length === 1 && chips[0].includes("RAMADAN10"), `the code shows as a chip in capitals (${chips.join("|")})`);
  const off = Number((await b.js("document.querySelector('dialog[open] .ox-brk .ox-sum.off .num')?.textContent.replace(/[^0-9.]/g, '') ?? ''")) || 0);
  check(off > 0 && chips[0].includes(String(off)), `the chip says what it takes off (${off})`);
  check(dlg.includes(o.subtotal) && dlg.includes(o.total), "the review shows the Items line, the discount line and the Total");
  check(await b.js("!!document.querySelector('dialog[open] .ox-lafter s')"), "the line shows its price struck through, then what it comes to");
  const goods = cable.price * 2;
  const taken = Math.round(goods * 0.10);
  check(dlg.includes(money(goods - taken)) , `the total is after the discount (${money(goods - taken)})`);
  check((await text("dialog[open] .cx-btn:not(.ghost)")).some((x) => x.includes(money(goods - taken))), "the pay button shows the total after the discount");
  await noSideScroll("the review with a code");
  // (The quantity steppers are 40 px wide in the review as it was; the code box and its chips are new.)
  await smallTargets("document.querySelector('dialog[open] .ox-coupon')", "the code box and its chips");
  await shot("c-review-applied");
  await axe("c-review-applied", "dialog[open]");

  // a code that is not known, one that ended, one that has not started: the shop's sentence under the box
  const failing = [["nope", "c-review-unknown"], ["old20", "c-review-ended"], ["eid25", "c-review-notstarted"]];
  for (const [typed, name] of failing) {
    await b.click("document.querySelector('#ox-coupon-in')", 150);
    await b.clearFocused();
    await b.type(typed);
    await b.key("Enter", "Enter", 13);
    await b.until("!!document.querySelector('dialog[open] #ox-coupon-err')", `the sentence for ${typed}`, 15000);
    await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the check after");
    const say = await text("dialog[open] #ox-coupon-err");
    const wanted = typed === "nope" ? pick("We do not recognise the code NOPE.", "لا نعرف الرمز NOPE.") : typed === "old20" ? pick("This code ended", "انتهى هذا الرمز") : pick("This code starts", "يبدأ هذا الرمز");
    check(say[0]?.includes(wanted), `${typed.toUpperCase()}: the shop's sentence is under the box (${say[0]})`);
    check((await count("dialog[open] .ox-codechip")) === 1, "…and the failed code is not in the order");
    check(await b.js("document.querySelector('dialog[open] #ox-coupon-in').getAttribute('aria-invalid') === 'true'"), "…the box is marked invalid");
    check(!(await b.js("!!document.querySelector('.ct-toast, [role=status].toast')")), "…and it is not a toast");
    await shot(name);
  }
  await axe("c-review-failed", "dialog[open]");
  // typing again clears the sentence
  await b.click("document.querySelector('#ox-coupon-in')", 100);
  await b.clearFocused();
  await b.type("x");
  check((await count("dialog[open] #ox-coupon-err")) === 0, "typing again clears the sentence");
  await b.clearFocused();

  // the total changes between the check and the tap: the shop changes the percentage
  const dis = (await must("/api/discounts")).rules;
  const ram = dis.find((r) => r.code === "RAMADAN10");
  await must(`/api/discounts/${ram.id}`, { method: "PUT", body: {
    kind: "coupon", code: "RAMADAN10", name: "Ramadan", name_ar: "رمضان", value_type: "percent", percent: 20, scope: "order", item_ids: [], categories: [],
    min_order: 10000, usage_limit: 100, per_customer_limit: 1, starts_at: null, ends_at: null, stackable: false, group_id: null,
  } });
  await b.click(PAY, 900);
  await b.until("!!document.querySelector('dialog[open] .ox-err.summary')", "the changed-total sentence", 15000);
  await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the new check");
  dlg = await dialogText();
  const newTaken = Math.round(goods * 0.20);
  check(dlg.includes(pick("The total changed to", "تغيّر الإجمالي إلى")) || (await text("dialog[open] .ox-err.summary"))[0].includes(money(goods - newTaken)), `the page says the total changed (${(await text("dialog[open] .ox-err.summary"))[0]})`);
  check(dlg.includes(money(goods - newTaken)), `…and now shows the new total ${money(goods - newTaken)}, with nothing charged`);
  check((await count("dialog[open]")) === 1 && (await b.js("location.pathname.startsWith('/s/')")), "…the customer is still in the review");
  await shot("c-review-total-changed");
  await axe("c-review-total-changed", "dialog[open]");

  // the code stops working between the check and the tap: it leaves the order, the reason is under the box
  await must(`/api/discounts/${ram.id}/pause`, { method: "POST" });
  await b.click(PAY, 900);
  await b.until("!!document.querySelector('dialog[open] #ox-coupon-err')", "the reason under the box", 15000);
  await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the check without the code");
  check((await count("dialog[open] .ox-codechip")) === 0, "a code that stopped working is out of the order");
  check((await text("dialog[open] #ox-coupon-err"))[0].includes(pick("This code is not available right now.", "هذا الرمز غير متاح حالياً.")), "…with the shop's reason under the box");
  await shot("c-review-code-gone");
  await must(`/api/discounts/${ram.id}/resume`, { method: "POST" });

  // place it with the code, at the total that was shown
  await b.click("document.querySelector('#ox-coupon-in')", 150);
  await b.clearFocused();
  await b.type("ramadan10");
  await b.key("Enter", "Enter", 13);
  await b.until("!!document.querySelector('dialog[open] .ox-codechip .ox-chipoff') && /[0-9]/.test(document.querySelector('dialog[open] .ox-codechip .ox-chipoff').textContent)", "the chip back", 15000);
  await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the check");
  const shownPay = (await text("dialog[open] .cx-btn:not(.ghost)"))[0];
  await b.click(PAY, 500);
  await b.until("location.pathname.startsWith('/pay/') || !!document.querySelector('.cx-done, .ox-discount-line')", "the order placed", 20000);
  const orders = (await must("/api/orders")).orders;
  const mine = orders.find((x) => x.discount_total);
  const last = orders.filter((x) => x.discount_total).sort((a, c) => c.number - a.number)[0];
  check(last && last.total === goods - newTaken, `the order was placed at the total that was shown (${last?.total} = ${goods - newTaken}; button said ${shownPay})`);
  check(last?.discounts?.[0]?.code === "RAMADAN10", "…with the code on it");

  // the tracking page
  await b.go(`${BASE}${trackPath(tenant, "al-noor", last.id)}`, 1500);
  await b.until("!!document.querySelector('.cx-card')", "the tracking page", 20000);
  await ensureLang();
  const trackText = await body();
  check(trackText.includes(ORDERS_TRACK.subtotal) && trackText.includes("RAMADAN10") && trackText.includes(money(last.total)), "tracking: the goods, the code with its rule and the total");
  check(trackText.includes(`−${money(last.discount_total)}`) || trackText.includes(money(last.discount_total)), "…and what came off");
  check(!unwanted.test(await text(".cx-section").then((x) => x.join(" "))), "tracking: the order's lines say nothing like coming, beta or capability");
  await noSideScroll("tracking");
  await tall(1500, async () => { await b.sleep(250); await shot("t-discount"); });
  await axe("t-discount");
  // an order with no discount reads as before
  const plain = orders.find((x) => !x.discount_total);
  await b.go(`${BASE}${trackPath(tenant, "al-noor", plain.id)}`, 1500);
  await b.until("!!document.querySelector('.cx-card')", "the plain tracking page", 20000);
  check((await count(".cx-row")) >= 2 && !(await body()).includes("RAMADAN10"), "tracking: an order without a discount has no discount rows");
  await tall(1500, async () => { await b.sleep(250); await shot("t-plain"); });
  void mine;
}

const ORDERS_TRACK = { subtotal: AR ? "الأصناف" : "Items" };

async function off() {
  // The feature switched off: nothing is left of it in the workspace or on the page.
  await must("/api/features/discounts", { method: "PUT", body: { enabled: false } });
  const store = await must("/api/store/al-noor?limit=1");
  check(!("pricing" in store), "off: the order page's data has no pricing key");
  const link = await linkFor(people[3]);
  await b.go(`${BASE}/s/al-noor`, 100);
  await b.js("sessionStorage.clear()");
  await b.go(link, 900);
  await b.until("!!document.querySelector('.ox-list, .ox-wrow')", "the order page", 25000);
  await ensureLang();
  check((await count(".ox-offers")) === 0, "off: no offers line");
  const cable = itemNamed("Cable 1.5");
  const add = (name) => `[...document.querySelectorAll('.ox-card, .ox-wrow')].find(r => r.textContent.includes(${JSON.stringify(name)}))`;
  await b.click(`${add(AR ? cable.name_ar : cable.name)}.querySelector('.ox-add, .ox-step button:last-child')`, 350);
  await press(o.review, "document", 600);
  await b.until("!!document.querySelector('dialog[open] .ox-lines')", "the review", 15000);
  await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the check", 15000);
  check((await count("dialog[open] .ox-coupon, dialog[open] .ox-brk, dialog[open] .ox-lafter")) === 0, "off: the review has no code box and no discount lines");
  await shot("c-off");
  await b.go(`${BASE}/app/catalog`, 2200);
  await b.until("!!document.querySelector('.ct-actions')", "the Catalog", 20000);
  check(!(await text(".ct-actions button")).some((x) => x.includes(p.open)), "off: no Discounts button");
  await must("/api/features/discounts", { method: "PUT", body: { enabled: true } });
}

async function run() {
  await b.view(375, 812, true, SCHEME);
  await seed();
  await workspace();
  await orders();
  await customer();
  await off();
  void t;
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
