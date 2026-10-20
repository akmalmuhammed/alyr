// Delivery and pickup, proved in a real browser (ALY-150, specs/014-pricing-pack/spec.md, part 2).
// Headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages. At 375 px, in
// English or Arabic, light or dark (one language and one scheme per run):
//   * the workspace: no Delivery button while the feature is off; the sheet empty (the two ways,
//     the shop-wide fee, the zones as a dashed slot); delivery switched on with nothing to charge by
//     is refused in the shop's words; a zone made through the form (a refusal first, then days and a
//     cut-off), listed in plain words; the shop-wide fee (a refusal, then saved); archive asks first,
//     the archived fold, restore; archiving the only place you deliver to is refused;
//   * the customer's review: no choice yet (Pay stays off), pickup, delivery (the areas, no address
//     yet, the address focused, free-over nudge, the fee as its own line with the day, a minimum the
//     goods do not reach, free delivery, delivery together with a discount code whose judgement is on
//     the goods after the discount), the choice kept over a reload, the fee changing between the
//     check and the tap, the order placed at the total that was shown; one way offered only; and the
//     readable WhatsApp order that says the choice;
//   * the Orders list: the pill, the area, address, note, day and fee line on each order that has a
//     choice, the filter chips only when one does, an old order unchanged;
//   * the tracking page: how it reaches the customer, the address, the fee line and the day; and an
//     order without a choice unchanged;
//   * the feature switched off: nothing about it is left in the workspace or on the page.
// axe-core runs on every screen it opens. Screenshots are written for a person to look at.
//
//   node scripts/delivery-browser-check.mjs --lang en --scheme light \
//        --base http://localhost:3192 --api http://127.0.0.1:8332 --out C:/t/p2/shots \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on a scratch database of its own (it resets the demo shop Al Noor in it and
// turns the Catalog, Discounts and Delivery on and off) and the web app pointed at it; never the
// shared database. It drives only its own Edge (its own --profile and a random free --port). Short
// folders: Edge fails quietly with long paths. Node 22.18 or newer (it reads the words from the .ts
// copy files).

import { mkdirSync, writeFileSync } from "node:fs";
import { launch } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { DELIVERY } from "../apps/web/app/(product)/_workspace/deliveryCopy.ts";
import { clock12, daysLine } from "../apps/web/app/(product)/_workspace/deliveryForm.ts";
import { T as ORDER } from "../apps/web/app/(product)/_customer/order/copy.ts";
import { D as CUSTOMER } from "../apps/web/app/(product)/_customer/order/deliveryCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3192";
const API = args.api ?? "http://127.0.0.1:8332";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const OUT = args.out ?? "C:/t/p2/shots";
const PROFILE = args.profile ?? `C:/t/p2/prof-${LANG}-${SCHEME}`;
const PORT = Number(args.port ?? 20000 + Math.floor(Math.random() * 20000));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "C:/t/tools/node_modules/axe-core/axe.min.js";
const d = DELIVERY[LANG];
const t = COPY[LANG];
const o = ORDER[LANG];
const c = CUSTOMER[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}/${SCHEME}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const pick = (en, ar) => (AR ? ar : en);
const iso = (x) => `⁨${x}⁩`;
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

let tenant = "";
let items = [];
let people = [];
const itemNamed = (en) => items.find((i) => i.name.startsWith(en));
const ZONE = { name: "Al Wakra", name_ar: "الوكرة", fee: 1500, free_over: 20000, min_order: 5000, cutoff: "14:00", days: [0, 3] };
let wakra = null;
let doha = null;
async function seed() {
  await call("/sim/reset", { method: "POST" });
  const shops = (await must("/api/admin/businesses")).businesses;
  tenant = shops.find((s) => s.slug === "al-noor").id;
  await must(`/api/admin/businesses/${tenant}/modules/catalog`, { method: "POST", body: { enabled: true } });
  await must("/api/features/delivery_fees", { method: "PUT", body: { enabled: false } });
  await must("/api/features/discounts", { method: "PUT", body: { enabled: true } });
  await must("/api/discounts", { method: "POST", body: {
    kind: "coupon", code: "SAVE20", name: "Save 20", name_ar: "وفّر 20", value_type: "percent", percent: 20, scope: "order", item_ids: [], categories: [],
    min_order: 0, usage_limit: null, per_customer_limit: null, starts_at: null, ends_at: null, stackable: false, group_id: null,
  } });
  // The shop's own number, answering itself: the review then offers the readable order on WhatsApp.
  await must("/api/items/settings", { method: "PUT", body: { whatsapp_number: "97455500100", whatsapp_mode: "link" } });
  items = (await must("/api/items?limit=100")).items;
  people = (await must("/api/ledger/summary")).customers.filter((x) => x.phone).slice(0, 4);
  // An order made before delivery was on: it has no choice on it and must read as it always did.
  const before = await orderVia(await linkFor(people[2]), [[itemNamed("Switch 1"), 1]]);
  if (before.status !== 200) throw new Error(`the first order was refused: ${JSON.stringify(before.data).slice(0, 200)}`);
}
async function linkFor(who) {
  const sent = await must("/sim/messages", { method: "POST", body: { from_number: who.phone, text: "order" } });
  const body = sent.messages.map((m) => m.body).filter((x) => x.includes("?t=")).at(-1);
  return `${BASE}/s/al-noor?t=${body.split("?t=")[1].split(/\s/)[0]}`;
}
const tokenOf = (link) => link.split("?t=")[1];
const checkVia = (link, lines, fulfilment, coupons = []) => call("/api/store/al-noor/cart/check", { method: "POST", body: {
  token: tokenOf(link), items: lines.map(([item, quantity]) => ({ product_id: item.id, quantity })), coupons, ...(fulfilment ? { fulfilment } : {}),
} });
const orderVia = (link, lines, fulfilment, coupons = [], expected = undefined) => call("/api/store/al-noor/orders", { method: "POST", body: {
  token: tokenOf(link), payment: "link", items: lines.map(([item, quantity]) => ({ product_id: item.id, quantity })), coupons,
  ...(fulfilment ? { fulfilment } : {}), ...(expected !== undefined ? { expected_total: expected } : {}),
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
const control = (label, scope = inSheet) => `[...${scope}.querySelectorAll('label')].find(l => ${norm}(l).startsWith(${JSON.stringify(label)}))?.control`;
async function fill(label, value, scope = inSheet) {
  await b.click(control(label, scope), 120);
  await b.clearFocused();
  if (value) await b.type(value);
  await b.sleep(80);
}
/** A time input takes no typing: set it the way the browser's own picker does. */
async function setTime(label, value) {
  await b.js(`(() => { const el = ${control(label)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
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
/** Things a thumb has to hit that are under 44 px either way (a checkbox or radio is its label). */
async function smallTargets(scope, what) {
  const small = await b.js(`(() => [...${scope}.querySelectorAll('button:not([role=switch]), a[href], input:not([type=hidden]), select, textarea, summary')].filter(${visible}).map((e) => {
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
const closeSheet = () => press(d.done, inSheet, 400);
const clearToasts = () => b.js("document.querySelectorAll('.ct-toast-x').forEach((x) => x.click())").then(() => b.sleep(150));
async function ensureLang() {
  if ((await b.js("document.querySelector('.cx')?.getAttribute('lang')")) !== LANG) await b.click("document.querySelector('.cx-lang')", 600);
  await b.sleep(300);
}
const PAY = "document.querySelector('dialog[open] .ox-dfoot .cx-btn:not(.ghost)')";
const payState = () => b.js(`(() => { const p = ${PAY}; return p ? { text: p.innerText.replace(/\\s+/g, ' ').trim(), disabled: p.disabled } : null; })()`);
const checkDone = () => b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the check", 15000);

async function openDelivery() {
  await b.go(`${BASE}/app/catalog`, 2200);
  await b.until("!!document.querySelector('.ct-actions')", "the Catalog", 20000);
  await b.until("!![...document.querySelectorAll('.ct-actions button')].find(e => e.textContent.includes(" + JSON.stringify(d.open) + "))", "the Delivery button", 20000);
  await press(d.open, "document.querySelector('.ct-actions')", 500);
  await b.until("!!document.querySelector('.ct-sheet') && !!document.querySelector('.ct-sheet [role=switch]')", "the sheet", 20000);
}
const switchOn = (label) => b.js(`document.querySelector('.ct-sheet [role=switch][aria-label=${JSON.stringify(label)}]')?.getAttribute('aria-checked')`);
const switchClick = (label) => b.click(`document.querySelector('.ct-sheet [role=switch][aria-label=${JSON.stringify(label)}]')`, 700);
const card = (name) => `[...document.querySelectorAll('.dl-zone')].find(e => e.querySelector('b')?.textContent.trim() === ${JSON.stringify(name)})`;

async function workspace() {
  await b.go(`${BASE}/app`, 400);
  await b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-theme', ${JSON.stringify(SCHEME)})`);
  // off: nothing drawn, and the API says so
  await b.go(`${BASE}/app/catalog`, 2200);
  await b.until("!!document.querySelector('.ct-actions')", "the Catalog", 20000);
  check(!(await text(".ct-actions button")).some((x) => x.includes(d.open)), "no Delivery button while the feature is off");
  const refused = await call("/api/delivery");
  check(refused.status === 422 && refused.data.detail?.code === "feature_off", "the API answers feature_off while it is off");
  await must("/api/features/delivery_fees", { method: "PUT", body: { enabled: true } });

  // 1. empty
  await openDelivery();
  check((await text(".ct-actions button")).some((x) => x.includes(d.open)), "the Delivery button is in the Catalog's actions once the feature is on");
  let page = await sheetText();
  check(page.includes(d.title) && page.includes(d.pickup[0]) && page.includes(d.delivery[0]), "empty: the sheet has the two ways");
  check(page.includes(d.guard), "empty: the rules of the two switches are said in plain words");
  check(page.includes(d.flatTitle) && page.includes(d.flatHint), "empty: the shop-wide fee is described (one fee; with zones it is 'Other areas')");
  check(page.includes(d.zonesEmpty) && page.includes(d.addZone), "empty: the zones show a slot that says what will appear, and Add");
  check((await switchOn(d.pickup[0])) === "true" && (await switchOn(d.delivery[0])) === "false", "empty: collecting is on and delivery is off, as a new shop has them");
  check(!unwanted.test(page), "empty: nothing says coming, beta or capability, and there is no emoji");
  await noSideScroll("the empty Delivery sheet");
  await smallTargets(inSheet, "the empty sheet");
  await shot("d-empty");
  await tall(1900, async () => { await b.sleep(250); await shot("d-empty-full"); });
  await axe("d-empty");

  // 2. delivery switched on with nothing to charge by: the shop's own sentence beside the switches
  await switchClick(d.delivery[0]);
  await b.until("!!document.querySelector('.ct-sheet .dl-set [role=alert]')", "the refusal", 8000);
  page = await text(".ct-sheet .dl-set [role=alert]");
  check(page[0].includes(pick("To deliver, add a zone or set a flat delivery fee.", "للتوصيل، أضف منطقة أو حدد رسوم توصيل ثابتة.")), `delivery with nothing to charge by is refused with the shop's sentence (${page[0]})`);
  check((await switchOn(d.delivery[0])) === "false", "…and the switch stays off");
  await shot("d-need-fee");
  await axe("d-need-fee");

  // 3. a zone through the form: a refusal first
  await press(d.addZone, inSheet, 500);
  await b.until("!!document.querySelector('#dl-form')", "the zone form");
  page = await sheetText();
  check(page.includes(d.newTitle) && page.includes(d.daysLegend) && page.includes(d.cutoffLabel), "the zone form asks the name, fee, free over, minimum, days and cut-off");
  await press(d.save, inSheet, 300);
  page = await sheetText();
  check(page.includes(d.err.name) && page.includes(d.err.fee) && page.includes(d.fixFields), "an empty form is refused in words, beside the fields and beside Save");
  check((await b.js("document.querySelectorAll('#dl-form [aria-invalid=true]').length")) === 2, "…and both fields are marked invalid for a screen reader");
  await shot("z-error-field");
  await fill(d.name, ZONE.name);
  await fill(d.nameAr, ZONE.name_ar);
  await fill(d.zoneFee, "15");
  await fill(d.zoneFreeOver, "200");
  await fill(d.zoneMin, "50");
  await press(d.daysFull[0], "document.querySelector('#dl-form')", 150, "label");
  await press(d.daysFull[3], "document.querySelector('#dl-form')", 150, "label");
  await setTime(d.cutoffLabel, "14:00");
  check((await b.js("[...document.querySelectorAll('.dl-day input')].filter(e => e.checked).length")) === 2, "two days are chosen");
  await noSideScroll("the zone form");
  await smallTargets(inSheet, "the zone form");
  await shot("z-form");
  await tall(2300, async () => { await b.sleep(250); await shot("z-form-full"); });
  await axe("z-form");
  await press(d.save, inSheet, 900);
  await b.until("!document.querySelector('#dl-form')", "back to the sheet");
  page = await sheetText();
  const nameShown = pick(ZONE.name, ZONE.name_ar);
  const facts = [
    d.freeOver(money(20000)), d.minimum(money(5000)),
    d.delivers(daysLine([0, 3], d.daysShort, d.daySep, "")), d.cutoff(clock12("14:00", d.am, d.pm)),
  ];
  check(page.includes(nameShown) && page.includes(money(1500)), "the zone is listed with its fee");
  for (const fact of facts) check(page.includes(fact), `…and says '${fact}'`);
  const saved = (await must("/api/delivery")).zones[0];
  check(saved && saved.fee === 1500 && saved.free_over === 20000 && saved.min_order === 5000 && saved.cutoff === "14:00" && saved.days.join() === "0,3", `the API holds whole dirhams, the days and the cut-off (${JSON.stringify(saved)})`);
  wakra = saved;
  await clearToasts();
  await shot("d-one-zone");

  // 4. a second zone from the API, a refusal and a save of the shop-wide fee
  doha = (await must("/api/delivery/zones", { method: "POST", body: { name: "Doha", name_ar: "الدوحة", fee: 2500, free_over: null, min_order: 0, cutoff: null, days: [] } })).zone;
  await closeSheet();
  await openDelivery();
  page = await sheetText();
  check(page.includes(pick("Doha", "الدوحة")) && page.includes(d.everyDay), "a zone with no days says it delivers every day");
  await fill(d.flatFee, "abc");
  await press(d.flatSave, inSheet, 300);
  page = await sheetText();
  check(page.includes(d.flatErr.fee), "a fee that is not an amount is refused in words, beside the field");
  await shot("d-flat-error");
  await fill(d.flatFee, "30");
  await fill(d.flatFreeOver, "300");
  await press(d.flatSave, inSheet, 900);
  await b.until(`(document.querySelector('.ct-toast')?.textContent ?? '').includes(${JSON.stringify(d.flatSaved)})`, "the fee saved");
  const flatSaved = await must("/api/delivery");
  check(flatSaved.flat_fee === 3000 && flatSaved.flat_free_over === 30000, `the shop-wide fee is saved in whole dirhams (${flatSaved.flat_fee}, ${flatSaved.flat_free_over})`);
  await clearToasts();

  // 5. delivery on, now that there is something to charge by
  await switchClick(d.delivery[0]);
  await b.until(`(document.querySelector('.ct-toast')?.textContent ?? '').includes(${JSON.stringify(d.switchSaved)})`, "the switch saved");
  check((await switchOn(d.delivery[0])) === "true" && (await must("/api/delivery")).delivery === true, "delivery switches on once there is a zone or a fee");
  await clearToasts();
  await tall(2600, async () => { await b.sleep(250); await shot("d-list"); });
  await smallTargets(inSheet, "the list");
  await noSideScroll("the Delivery list");
  await axe("d-list");

  // 6. archive asks first; the archived fold; restore
  await press(d.archiveNamed(pick("Doha", "الدوحة")), card(pick("Doha", "الدوحة")), 400);
  check((await b.js(`${card(pick("Doha", "الدوحة"))}.querySelector('[role=alertdialog]')?.innerText`))?.includes(d.archiveAsk(pick("Doha", "الدوحة")).slice(0, 18)), "Archive asks first, and says orders already placed keep the name");
  await shot("d-archive-ask");
  await press(d.archiveKeep, card(pick("Doha", "الدوحة")), 300);
  check((await must("/api/delivery")).zones.length === 2, "Keep it leaves the zone as it was");
  await press(d.archiveNamed(pick("Doha", "الدوحة")), card(pick("Doha", "الدوحة")), 400);
  await press(d.archiveConfirm, card(pick("Doha", "الدوحة")), 900);
  await b.until("(document.querySelectorAll('.dl-zone').length) >= 1 && !!document.querySelector('.ct-fold')", "the archived fold");
  await clearToasts();
  page = await sheetText();
  check(page.includes(d.archived(1)), "the archived zone is in a fold of its own");
  await b.click("document.querySelector('.ct-fold summary')", 400);
  await shot("d-archived");
  await press(d.restoreNamed(pick("Doha", "الدوحة")), "document.querySelector('.ct-fold')", 900);
  await b.until("!document.querySelector('.ct-fold')", "restored");
  check((await must("/api/delivery")).zones.length === 2, "Restore brings the zone back");
  await clearToasts();

  // 7. the only place you deliver to cannot be archived while delivery is on
  await must("/api/delivery", { method: "PUT", body: { flat_fee: null, flat_free_over: null } });
  await must(`/api/delivery/zones/${doha.id}/archive`, { method: "POST" });
  await closeSheet();
  await openDelivery();
  await press(d.archiveNamed(nameShown), card(nameShown), 400);
  await press(d.archiveConfirm, card(nameShown), 900);
  await b.until(`!!${card(nameShown)}.querySelector('[role=alertdialog] [role=alert]')`, "the refusal", 8000);
  const last = await b.js(`${card(nameShown)}.querySelector('[role=alertdialog] [role=alert]').innerText`);
  const wanted = (await call(`/api/delivery/zones/${wakra.id}/archive`, { method: "POST" })).data.detail;
  check(wanted?.code === "last_zone" && last.includes(AR ? wanted.message_ar : wanted.message), `archiving the only place you deliver to is refused in the shop's words (${last})`);
  await shot("d-last-zone");
  await closeSheet();
  await must(`/api/delivery/zones/${doha.id}/restore`, { method: "POST" });
  await must("/api/delivery", { method: "PUT", body: { flat_fee: 3000, flat_free_over: 30000 } });
}

// ── the customer's review ───────────────────────────────────────────────────────────────
const addTo = (name) => `[...document.querySelectorAll('.ox-card, .ox-wrow')].find(r => r.textContent.includes(${JSON.stringify(name)}))`;
let link = "";
/** The order page with this cart in it, the review open and asked once. `keepChoice` leaves what the customer chose. */
async function review(lines, { keepChoice = false } = {}) {
  await b.go(`${BASE}/s/al-noor`, 100);
  await b.js(`sessionStorage.removeItem('alyr-order:al-noor'); ${keepChoice ? "" : "sessionStorage.removeItem('alyr-fulfil:al-noor');"}`);
  await b.go(link, 900);
  await b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)})`);
  await b.until("!!document.querySelector('.ox-list, .ox-wrow')", "the order page", 25000);
  await ensureLang();
  for (const [item, qty] of lines) {
    for (let i = 0; i < qty; i++) await b.click(`${addTo(AR ? item.name_ar : item.name)}.querySelector('.ox-add, .ox-step button:last-child')`, 350);
  }
  await b.until("!![...document.querySelectorAll('.cx-bar button, .cx-bar a')].length", "the bar", 8000);
  await press(o.review, "document", 600);
  await b.until("!!document.querySelector('dialog[open] .ox-lines')", "the review", 15000);
  await checkDone();
}
const radio = (label) => press(label, "document.querySelector('dialog[open] .ox-ful')", 400, "label");
const reviewTotal = () => b.js("document.querySelector('dialog[open] .ox-total')?.textContent.replace(/\\s+/g, ' ').trim()");

async function customer() {
  const cable15 = itemNamed("Cable 1.5");
  const cable25 = itemNamed("Cable 2.5");
  const switches = itemNamed("Switch 1");
  link = await linkFor(people[3]);
  const wakraName = pick("Al Wakra", "الوكرة");

  // the page tells nothing new until the review
  await b.go(`${BASE}/s/al-noor`, 100);
  await b.js("sessionStorage.clear()");
  await b.go(link, 900);
  await b.until("!!document.querySelector('.ox-list, .ox-wrow')", "the order page", 25000);
  await ensureLang();
  const store = await must("/api/store/al-noor?limit=1");
  check(store.pricing?.delivery?.zones?.length === 3 && store.pricing.delivery.pickup && store.pricing.delivery.delivery, "on: the order page's data lists pickup, delivery and three places (two zones and 'Other areas')");

  // A. nothing chosen yet: both ways offered, Pay stays off
  await review([[cable15, 1]]);
  let dlg = await dialogText();
  check(dlg.includes(c.title) && dlg.includes(c.pickup) && dlg.includes(c.delivery), "the review asks 'How do you want to get it?' with Pickup and Delivery");
  check((await count("dialog[open] .ox-ful input[type=radio]")) === 2, "both ways are a radio group of two");
  check(dlg.includes(c.needMode), "with nothing chosen it says what to do");
  let pay = await payState();
  check(pay?.disabled === true, "…and Pay stays off");
  check(!dlg.includes(o.fixFirst), "…without blaming the items");
  check((await count("dialog[open] .ox-ful textarea")) === 0, "…and asks no address yet");
  await noSideScroll("the review with no choice");
  await smallTargets("document.querySelector('dialog[open] .ox-ful')", "the choice");
  await shot("c-choice-none");
  await axe("c-choice-none", "dialog[open]");

  // B. pickup
  await radio(c.pickup);
  await checkDone();
  pay = await payState();
  check(pay && !pay.disabled && pay.text.includes(money(cable15.price)), `pickup: Pay is on and shows the goods (${pay?.text})`);
  check((await count("dialog[open] .ox-brk.fee")) === 0, "pickup: there is no fee line");
  check((await b.js("document.querySelector('dialog[open] input[type=radio]:checked')?.closest('label').textContent.includes(" + JSON.stringify(c.pickup) + ")")) === true, "pickup: the chosen way is marked");
  await shot("c-pickup");

  // C. delivery: the areas, no address yet
  await radio(c.delivery);
  await b.until("(document.querySelectorAll('dialog[open] input[name$=\"-zone\"]').length) === 3", "the three places");
  dlg = await dialogText();
  check(dlg.includes(c.areaLegend) && dlg.includes(wakraName) && dlg.includes(pick("Doha", "الدوحة")) && dlg.includes(pick("Other areas", "مناطق أخرى")), "delivery: the areas are listed, with 'Other areas' for the shop-wide fee");
  check(dlg.includes(money(1500)) && dlg.includes(money(2500)) && dlg.includes(money(3000)), "…each with its fee");
  check(dlg.includes(c.freeOver(money(20000))) && dlg.includes(c.minimum(money(5000))), "…and 'free over', and the minimum order");
  check(dlg.includes(c.delivers(pick("Sun, Wed", "الأحد، الأربعاء"))) && dlg.includes(pick("Order before 2:00 PM", "اطلب قبل 2:00 م")), "…and the days and the cut-off in words");
  check(dlg.includes(c.needZone), "…and it says to choose where we deliver to");
  pay = await payState();
  check(pay?.disabled === true, "delivery with no area: Pay is off");
  await shot("c-zones");
  await tall(1700, async () => { await b.sleep(250); await shot("c-zones-full"); });
  await axe("c-zones", "dialog[open]");

  await radio(wakraName);
  await checkDone();
  await b.sleep(300);
  check((await b.js("document.activeElement?.tagName")) === "TEXTAREA", "an area chosen: the address box takes focus");
  dlg = await dialogText();
  check(dlg.includes(c.address) && dlg.includes(c.addressHint) && dlg.includes(c.note), "…with its label, its hint (area, street, house or building) and an optional note");
  check(dlg.includes(c.needAddress), "…and a plain hint says to write the address");
  pay = await payState();
  check(pay?.disabled === true, "no address yet: Pay is off");
  const feeRow = await text("dialog[open] .ox-brk.fee");
  check(feeRow[0]?.includes(c.deliveryTo(wakraName)) && feeRow[0].includes(money(1500)), `the fee is a line of its own (${feeRow[0]})`);
  const quote = (await checkVia(link, [[cable15, 1]], { mode: "delivery", zone_id: wakra.id })).data;
  const dayWord = pick(quote.pricing.delivery.deliver_on_text, quote.pricing.delivery.deliver_on_text_ar);
  check(feeRow[0].includes(dayWord.replace(/^(today|tomorrow|اليوم|غداً)$/, "$1")), `…with the delivery day from the shop (${dayWord})`);
  const more = 20000 - cable15.price;
  check(feeRow[0].includes(c.nudge(money(more))), `…and what to add for free delivery (${money(more)})`);
  await noSideScroll("the review with an area chosen");
  await shot("c-no-address");

  // D. the address typed
  await b.type("Street 5, villa 12");
  await b.sleep(150);
  await b.click("document.querySelectorAll('dialog[open] .ox-ful textarea')[1]", 100);
  await b.type(pick("Call at the gate", "اتصل عند البوابة"));
  await b.sleep(300);
  await checkDone();
  pay = await payState();
  check(pay && !pay.disabled && pay.text.includes(money(cable15.price + 1500)), `with the address, Pay is on and shows the total with the fee (${pay?.text})`);
  check((await reviewTotal()) === money(cable15.price + 1500), "the total line is the goods plus the fee");
  check(!(await dialogText()).includes(c.needAddress), "the hint about the address is gone");
  await shot("c-delivery-nudge");
  await axe("c-delivery-nudge", "dialog[open]");
  const kept = await b.js("sessionStorage.getItem('alyr-fulfil:al-noor')");
  check(kept && JSON.parse(kept).address === "Street 5, villa 12" && JSON.parse(kept).mode === "delivery", "the choice is kept in this tab's session for this shop");

  // the readable WhatsApp order says it
  const wa = await b.js("[...document.querySelectorAll('dialog[open] a[href*=\"wa.me\"]')].map(a => decodeURIComponent(a.href.split('text=')[1] || ''))");
  const waWords = pick("Delivery to Al Wakra: Street 5, villa 12", "التوصيل إلى الوكرة: Street 5, villa 12");
  check(wa.length === 1 && wa[0].includes(waWords) && wa[0].includes(pick("Note: Call at the gate", "ملاحظة: اتصل عند البوابة")), `the readable WhatsApp order carries the choice (${JSON.stringify(wa[0])?.slice(0, 160)})`);

  // E. a reload keeps it
  await b.go(link, 1200);
  await b.until("!!document.querySelector('.ox-list, .ox-wrow')", "the order page again", 25000);
  await ensureLang();
  await press(o.review, "document", 600);
  await b.until("!!document.querySelector('dialog[open] .ox-ful')", "the review again", 15000);
  await checkDone();
  check((await b.js("document.querySelector('dialog[open] input[name$=\"-zone\"]:checked')?.closest('label').textContent.includes(" + JSON.stringify(wakraName) + ")")) === true, "a refresh keeps the area chosen");
  check((await b.js("document.querySelector('dialog[open] .ox-ful textarea').value")) === "Street 5, villa 12", "…and the address written");

  // F. the fee changes between the check and the tap
  await must(`/api/delivery/zones/${wakra.id}`, { method: "PUT", body: { ...ZONE, fee: 2000 } });
  await b.click(PAY, 900);
  await b.until("!!document.querySelector('dialog[open] .ox-err.summary')", "the changed-total sentence", 15000);
  await checkDone();
  dlg = await dialogText();
  check(dlg.includes(pick("The total changed to", "تغيّر الإجمالي إلى")) || (await text("dialog[open] .ox-err.summary"))[0].includes(money(cable15.price + 2000)), `the page says the total changed (${(await text("dialog[open] .ox-err.summary"))[0]})`);
  check((await reviewTotal()) === money(cable15.price + 2000), `…and now shows the new total ${money(cable15.price + 2000)}, with nothing charged`);
  await shot("c-fee-changed");
  await must(`/api/delivery/zones/${wakra.id}`, { method: "PUT", body: ZONE });

  // G. below the minimum of this area: the shop's own sentence, no fee line, Pay off
  await review([[switches, 2]], { keepChoice: true });
  await b.until("!!document.querySelector('dialog[open] .ox-ful textarea')", "the area kept", 8000);
  dlg = await dialogText();
  const minimumWords = pick("Delivery to Al Wakra needs an order of at least QAR 50.", "التوصيل إلى الوكرة يتطلب طلباً لا يقل عن 50 ر.ق.");
  check(dlg.includes(minimumWords), "below the minimum: the shop's own sentence is shown");
  pay = await payState();
  check(pay?.disabled === true, "…and Pay is off");
  check((await count("dialog[open] .ox-brk.fee")) === 0, "…and there is no fee line for an order that cannot be delivered");
  await shot("c-minimum");
  await axe("c-minimum", "dialog[open]");

  // H. free delivery: the goods reach the free-over amount
  await review([[cable25, 1]], { keepChoice: true });
  await b.until("!!document.querySelector('dialog[open] .ox-brk.fee .num')", "the fee line", 10000);
  const freeRow = (await text("dialog[open] .ox-brk.fee"))[0];
  check(freeRow.includes(c.feeFree) && !freeRow.includes(c.nudge("")), `free delivery: the fee line says Free (${freeRow})`);
  check((await reviewTotal()) === money(cable25.price) && (await payState()).text.includes(money(cable25.price)), "…and the total is the goods alone");
  await shot("c-free");

  // I. delivery with a discount code: free-over is judged on the goods after the discount
  await b.click("document.querySelector('#ox-coupon-in')", 150);
  await b.type("save20");
  await b.key("Enter", "Enter", 13);
  await b.until("!!document.querySelector('dialog[open] .ox-codechip .ox-chipoff') && /[0-9]/.test(document.querySelector('dialog[open] .ox-codechip .ox-chipoff').textContent)", "the chip", 15000);
  await checkDone();
  const after = cable25.price - Math.round(cable25.price * 0.2);
  const rows = await text("dialog[open] .ox-brk");
  check(rows.length === 2 && rows[0].includes(o.subtotal) && rows[0].includes("SAVE20") && rows[1].includes(c.deliveryTo(wakraName)) && rows[1].includes(money(1500)), `with a code: Items, the discount and then the fee, in that order (${rows.join(" | ")})`);
  check(rows[1].includes(c.nudge(money(20000 - after))), `…the goods after the discount (${money(after)}) are below the free-over amount, so it asks for ${money(20000 - after)} more`);
  check((await reviewTotal()) === money(after + 1500) && (await payState()).text.includes(money(after + 1500)), `…and the total is the goods after the discount plus the fee (${money(after + 1500)})`);
  await noSideScroll("the review with a code and a fee");
  await shot("c-delivery-code");
  await axe("c-delivery-code", "dialog[open]");
  await tall(1900, async () => { await b.sleep(250); await shot("c-delivery-code-full"); });

  // J. place it at the total that was shown
  await b.click(PAY, 500);
  await b.until("location.pathname.startsWith('/pay/') || !!document.querySelector('.cx-done, .ox-discount-line')", "the order placed", 20000);
  const orders = (await must("/api/orders")).orders;
  const placed = orders.filter((x) => x.fulfilment?.mode === "delivery").sort((a, z) => z.number - a.number)[0];
  check(placed && placed.total === after + 1500 && placed.discount_total === cable25.price - after && placed.fulfilment.fee === 1500, `the order was placed at the total that was shown (${placed?.total} = ${after + 1500})`);
  check(placed?.fulfilment?.zone === "Al Wakra" && placed.fulfilment.address === "Street 5, villa 12" && placed.fulfilment.note === pick("Call at the gate", "اتصل عند البوابة") && !!placed.fulfilment.deliver_on, `…with the area, address, note and day on it (${JSON.stringify(placed?.fulfilment)})`);

  // K. a pickup order and a shop-wide-fee order by the API, for the lists
  const pickupOrder = await orderVia(link, [[switches, 1]], { mode: "pickup" });
  check(pickupOrder.status === 200, `a pickup order is placed (${pickupOrder.status})`);
  const otherOrder = await orderVia(link, [[cable15, 1]], { mode: "delivery", zone_id: null, address: "Industrial Area, street 12", note: "" });
  check(otherOrder.status === 200, `an order to 'Other areas' is placed (${otherOrder.status})`);
  const refusedNoAddress = await orderVia(link, [[cable15, 1]], { mode: "delivery", zone_id: null, address: "", note: "" });
  check(refusedNoAddress.status === 422 && refusedNoAddress.data.detail?.code === "address_required", "the order itself refuses a delivery with no address (address_required)");
}

async function oneWay() {
  // Only one way offered: it is said, not asked.
  const cable15 = itemNamed("Cable 1.5");
  await must("/api/delivery", { method: "PUT", body: { delivery: false } });
  await review([[cable15, 1]]);
  let dlg = await dialogText();
  check(dlg.includes(c.pickupOnly) && dlg.includes(c.pickupOnlyHint) && (await count("dialog[open] .ox-ful input[type=radio]")) === 0, "pickup only: it is a statement, not a one-option control");
  let pay = await payState();
  check(pay && !pay.disabled, "pickup only: Pay is on with nothing to choose");
  await shot("c-pickup-only");
  await axe("c-pickup-only", "dialog[open]");
  await must("/api/delivery", { method: "PUT", body: { delivery: true } });
  // delivery only, with the shop-wide fee alone: one place, said as a statement
  await must(`/api/delivery/zones/${wakra.id}/archive`, { method: "POST" });
  const zones = (await must("/api/delivery")).zones;
  for (const z of zones) await must(`/api/delivery/zones/${z.id}/archive`, { method: "POST" }).catch(() => undefined);
  await must("/api/delivery", { method: "PUT", body: { pickup: false } });
  await review([[cable15, 1]]);
  dlg = await dialogText();
  check(dlg.includes(c.deliveryOnly) && (await count("dialog[open] .ox-ful input[type=radio]")) === 0, "delivery only: it is a statement");
  check(dlg.includes(c.deliveryFee) && dlg.includes(money(3000)), "…the one place is the shop-wide fee, named 'Delivery'");
  check(!dlg.includes(c.oneArea("Delivery")) && !dlg.includes(c.deliveryTo("Delivery")), "…and never 'Delivery to Delivery'");
  check((await b.js("document.activeElement?.tagName")) === "TEXTAREA" || (await count("dialog[open] .ox-ful textarea")) === 2, "…and the address is asked straight away");
  await shot("c-delivery-only");
  await axe("c-delivery-only", "dialog[open]");
  // put it back
  await must("/api/delivery", { method: "PUT", body: { pickup: true } });
  for (const z of [wakra, doha]) await must(`/api/delivery/zones/${z.id}/restore`, { method: "POST" });
}

// ── the workspace's orders and the tracking page ────────────────────────────────────────
async function ordersAndTracking() {
  await b.go(`${BASE}/app/orders`, 2200);
  await b.until("!!document.querySelector('table')", "the orders", 20000);
  const rows = await count("tbody tr");
  const fulfilled = (await must("/api/orders")).orders.filter((x) => x.fulfilment);
  check(await b.js("!!document.querySelector('.dl-filter')"), "the Orders list has the filter, because some order has a choice on it");
  check(JSON.stringify(await text(".dl-filter label")) === JSON.stringify([d.order.all, d.order.pickups, d.order.deliveries]), "…All, Pickup, Delivery");
  const pills = await text("tbody .pill.none");
  check(pills.filter((x) => x === d.order.delivery).length >= 2 && pills.some((x) => x === d.order.pickup), `each order with a choice has its pill (${pills.join(" | ")})`);
  const how = await text(".dl-how");
  check(how.some((x) => x.includes(pick("Street 5, villa 12", "Street 5, villa 12")) && x.includes(d.order.to(pick("Al Wakra", "الوكرة")))), `a delivery shows its area and address (${how[0]})`);
  check(how.some((x) => x.includes(d.order.note(iso(pick("Call at the gate", "اتصل عند البوابة"))))), "…and the customer's note");
  const plain = (await must("/api/orders")).orders.filter((x) => !x.fulfilment);
  check(plain.length > 0 && rows === plain.length + fulfilled.length, `orders without a choice are listed as before (${plain.length} of ${rows})`);
  const sum = (await text(".pr-sum")).find((x) => x.includes("SAVE20"));
  const mine = fulfilled.find((x) => x.discount_total);
  check(sum && sum.includes(o.subtotal) && sum.includes(d.order.fee(pick("Al Wakra", "الوكرة"))) && sum.includes(pick("Total", "الإجمالي")), `a delivery with a discount shows Items, the discount, the fee and the Total (${sum})`);
  check(mine && sum && sum.includes(money(mine.fulfilment.fee)) && sum.includes(money(mine.total)), "…and the lines add up to the total shown");
  const other = (await text(".pr-sum")).find((x) => x.includes(d.order.fee(pick("Other areas", "مناطق أخرى"))));
  check(!!other && other.includes(money(3000)), `a delivery with no discount shows Items, the fee and the Total (${other})`);
  await noSideScroll("Orders");
  await shot("o-list");
  await axe("o-list", ".dl-filter, .dl-how, .pr-sum");
  await smallTargets("document.querySelector('.dl-filter')", "the filter chips");

  await press(d.order.pickups, "document.querySelector('.dl-filter')", 400, "label");
  let shown = await count("tbody tr");
  check(shown === fulfilled.filter((x) => x.fulfilment.mode === "pickup").length && shown >= 1, `Pickup shows only pickup orders (${shown})`);
  await shot("o-pickup");
  await press(d.order.deliveries, "document.querySelector('.dl-filter')", 400, "label");
  shown = await count("tbody tr");
  check(shown === fulfilled.filter((x) => x.fulfilment.mode === "delivery").length, `Delivery shows only deliveries (${shown})`);
  await press(d.order.all, "document.querySelector('.dl-filter')", 400, "label");
  check((await count("tbody tr")) === rows, "All shows every order again");

  // the tracking page: a delivery, a pickup, an order with no choice
  const delivery = fulfilled.filter((x) => x.fulfilment.mode === "delivery").sort((a, z) => a.number - z.number)[0];
  await b.go(`${BASE}/t/${tenant}/${delivery.id}`, 1500);
  await b.until("!!document.querySelector('.cx-card')", "the tracking page", 20000);
  await ensureLang();
  let page = await body();
  check(page.includes(pick("How you get it", "كيف يصلك طلبك")) && page.includes(pick("Street 5, villa 12", "Street 5, villa 12")), "tracking: how it reaches the customer, and the address");
  check(page.includes(pick("Delivery to Al Wakra", "التوصيل إلى الوكرة")) && page.includes(money(delivery.fulfilment.fee)) && page.includes(money(delivery.total)), "tracking: the fee line and the total");
  check(page.includes(pick("Delivery day", "يوم التوصيل")), "tracking: the delivery day");
  if (delivery.discount_total) check(page.includes(pick("Items", "الأصناف")) && page.includes("SAVE20"), "tracking: the goods and the discount are still there");
  // (The page's own older line "will pick up your order shortly" says «قريباً» in Arabic; what this work adds is checked.)
  check(!unwanted.test((await text(".cx-section")).join(" ")), "tracking: what the order lists says nothing like coming, beta or capability");
  await noSideScroll("tracking (delivery)");
  await tall(1700, async () => { await b.sleep(250); await shot("t-delivery"); });
  await axe("t-delivery");
  const pickup = fulfilled.find((x) => x.fulfilment.mode === "pickup");
  await b.go(`${BASE}/t/${tenant}/${pickup.id}`, 1500);
  await b.until("!!document.querySelector('.cx-card')", "the pickup tracking page", 20000);
  await ensureLang();
  page = await body();
  check(page.includes(pick("Pickup", "الاستلام من المتجر")) && !page.includes(pick("Delivery day", "يوم التوصيل")) && !page.includes(pick("Delivery to", "التوصيل إلى")), "tracking: a pickup says Pickup and has no delivery lines");
  await tall(1500, async () => { await b.sleep(250); await shot("t-pickup"); });
  const old = plain[0];
  await b.go(`${BASE}/t/${tenant}/${old.id}`, 1500);
  await b.until("!!document.querySelector('.cx-card')", "the old tracking page", 20000);
  await ensureLang();
  page = await body();
  check(!page.includes(pick("How you get it", "كيف يصلك طلبك")), "tracking: an order with no choice reads as before");
  await tall(1500, async () => { await b.sleep(250); await shot("t-plain"); });
}

async function off() {
  // The feature switched off: nothing is left of it in the workspace or on the page.
  await must("/api/features/delivery_fees", { method: "PUT", body: { enabled: false } });
  const store = await must("/api/store/al-noor?limit=1");
  check(!store.pricing?.delivery, "off: the order page's data has no delivery");
  const cable15 = itemNamed("Cable 1.5");
  await review([[cable15, 1]]);
  check((await count("dialog[open] .ox-ful, dialog[open] .ox-brk.fee")) === 0, "off: the review has no choice and no fee line");
  const pay = await payState();
  check(pay && !pay.disabled && pay.text.includes(money(cable15.price)), `off: Pay is on at the goods (${pay?.text})`);
  const wa = await b.js("[...document.querySelectorAll('dialog[open] a[href*=\"wa.me\"]')].map(a => decodeURIComponent(a.href.split('text=')[1] || ''))");
  check(wa.every((x) => !/Pickup|Delivery|الاستلام|التوصيل/.test(x)), "off: the readable WhatsApp order says nothing about it");
  await shot("c-off");
  const refused = await call("/api/store/al-noor/cart/check", { method: "POST", body: { token: tokenOf(link), items: [{ product_id: cable15.id, quantity: 1 }], fulfilment: { mode: "pickup" } } });
  check(refused.status === 422 && refused.data.detail?.code === "feature_off", "off: a choice sent to the shop anyway is refused (feature_off)");
  await b.go(`${BASE}/app/catalog`, 2200);
  await b.until("!!document.querySelector('.ct-actions')", "the Catalog", 20000);
  check(!(await text(".ct-actions button")).some((x) => x.includes(d.open)), "off: no Delivery button");
  await b.go(`${BASE}/app/orders`, 2200);
  await b.until("!!document.querySelector('table')", "the orders", 20000);
  check(true, "off: the orders list still opens");
  await shot("o-off");
  await must("/api/features/delivery_fees", { method: "PUT", body: { enabled: true } });
}

async function run() {
  await b.view(375, 812, true, SCHEME);
  await seed();
  await workspace();
  await customer();
  await oneWay();
  await ordersAndTracking();
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
