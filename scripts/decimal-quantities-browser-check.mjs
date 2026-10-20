// Decimal and weight quantities, proved in a real browser (ALY-149, specs/013-decimal-quantities).
//
// Signs a grocery owner up through the real onboarding API (a new grocery starts with "Sold by
// weight or volume" on), makes a few items (dates by the quarter kilo, oud oil by the 50 ml, rice
// by the whole kilo, water by the bottle, one made to a daily limit), then, in headless Edge at
// 375 px, in English or Arabic, light or dark:
//   * the item form: the unit picker offers the weights and volumes, picking one proposes its
//     usual step, a step and a smallest order can be typed, a fraction for a counted unit is
//     refused in words;
//   * the stock tab and the count sheet: a count of 12.5 shows its difference with its unit;
//   * the customer's order page: the row says "per kg", opening it shows quick amounts and a typed
//     amount, a wrong amount is named and blocks "Add", the stepper moves by the step, the total
//     is rounded once per line, the review shows the line's own total, the order is placed;
//   * the wholesale table: its steppers move by the step;
//   * the same order, read back from the API: the stock moved by exactly what was ordered, the
//     total is the rounded sum, nothing is a float;
//   * a kilo item sold in whole numbers still reads "3", as it always did.
// axe-core runs on the screens it opens. Screenshots are written for a person to look at.
//
//   node scripts/decimal-quantities-browser-check.mjs --lang en --scheme light \
//        --base http://localhost:3149 --api http://127.0.0.1:8249 --out C:/alyr-dq/shots \
//        --profile C:/alyr-dq/p-en --port 9849 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API (ALYR_SIGNUP_OPEN=true, ALYR_PUBLIC_WEB_URL set to --base) on a scratch
// database of its own and a web app pointed at it; never the shared database. It drives only its
// own Edge (its own --profile, a free --port). Short folders: Edge fails quietly with long paths.
// Node 22.18 or newer (it reads the words straight from the .ts copy files).

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { T } from "../apps/web/app/(product)/_customer/order/copy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3149";
const API = args.api ?? "http://127.0.0.1:8249";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const OUT = args.out ?? `${tmpdir()}/dq-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/dq-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9852 : 9851));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const ct = COPY[LANG];
const ox = T[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}/${SCHEME}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const pick = (en, ar) => (AR ? ar : en);

// ── the shop's side ─────────────────────────────────────────────────────────────────────
let cookie = "";
async function call(path, { method = "GET", body, as = cookie } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(as ? { cookie: as } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  const set = response.headers.getSetCookie?.().map((c) => c.split(";")[0]).find((c) => c.startsWith("alyr_session=")) ?? "";
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: set };
}
async function signUp() {
  const stamp = Date.now().toString(36);
  const email = `dq-${stamp}@shop.example`;
  const code = (await call("/api/onboarding/code", { method: "POST", body: { email }, as: "" })).data.dev_code;
  const verified = await call("/api/onboarding/verify", { method: "POST", body: { email, code }, as: "" });
  const made = await call("/api/onboarding/business", { method: "POST", as: "", body: { signup_token: verified.data.signup_token, owner_name: "Hamad", name: `Baqala ${stamp.slice(-4)}`, name_ar: "بقالة الدوحة", type: "grocery", area: "Al Sadd" } });
  if (made.status !== 200) throw new Error(`could not create a grocery: ${made.status} ${JSON.stringify(made.data)}`);
  cookie = made.cookie;
  const state = (await call("/api/onboarding/state")).data;
  return { slug: state.business.slug };
}
const item = async (body) => {
  const made = await call("/api/items", { method: "POST", body: { status: "live", ...body } });
  if (made.status !== 200) throw new Error(`could not make ${body.name}: ${made.status} ${JSON.stringify(made.data)}`);
  return made.data.item;
};

// ── the page ────────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: SCHEME });
const body = () => b.js("document.body.innerText.replace(/\\s+/g, ' ')");
const dialogText = () => b.js("(document.querySelector('dialog[open]')?.innerText ?? '').replace(/\\s+/g, ' ')");
const text = (selector) => b.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
const count = (selector) => b.js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const press = (label, tag = "button", scope = "document", wait = 300) =>
  b.click(`[...${scope}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(label)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`, wait);
async function shot(name) { await b.shot(`${OUT}/${LANG}-${SCHEME}-${name}.png`); log("shot", name); }
async function noSideScroll(what) {
  const wide = await b.js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth ? document.documentElement.scrollWidth : 0");
  check(!wide, `no sideways scrolling on ${what}${wide ? ` (${wide})` : ""}`);
}
async function axe(what, scope = null) {
  if (!AXE) return;
  const found = await b.axe(AXE, scope);
  if (found === null) return;
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-axe-${what}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: nothing on ${what} (${found.map((v) => v.id).join(", ") || "clean"})`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
async function smallTargets(what, scope = "document") {
  const small = await b.js(`[...${scope}.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=switch]')].filter(${visible}).map(e => { let r = e.getBoundingClientRect(); const l = e.closest('label'); if (l && e.matches('input[type=checkbox], input[type=radio]')) r = l.getBoundingClientRect(); return { el: (e.getAttribute('aria-label') || e.textContent || e.className).toString().replace(/\\s+/g, ' ').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.w < 43.5 || x.h < 43.5)`);
  check(small.length === 0, `every target on ${what} is at least 44 px${small.length ? `: ${JSON.stringify(small.slice(0, 5))}` : ""}`);
}
const setLang = async () => b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-theme', ${JSON.stringify(SCHEME)})`);
const unwanted = /\b(coming soon|beta|early access|not yet|under development)\b|قريباً|قريبا|نسخة تجريبية/i;

async function main() {
  await b.view(375, 812, true, SCHEME);
  const shop = await signUp();
  await b.go(`${BASE}/start`, 400);
  await setLang();
  await b.send("Network.clearBrowserCookies");
  await b.send("Network.setCookie", { name: "alyr_session", value: cookie.split("=")[1], url: BASE });

  const features = (await call("/api/features")).data.groups.flatMap((g) => g.features);
  const feature = features.find((x) => x.key === "decimal_quantity");
  check(feature?.enabled === true && feature.name === "Sold by weight or volume" && feature.name_ar === "يُباع بالوزن أو الحجم", "a new grocery has \"Sold by weight or volume\" on, named in both languages");

  // ── 1. the item form ──
  await b.go(`${BASE}/app/catalog`, 2200);
  await press(ct.add, "button", "document", 800);
  await press(ct.typeOne, "button", "document", 900);
  await b.until("!!document.querySelector('.ct-sheet select')", "the item form", 15000);
  const units = await b.js("[...document.querySelectorAll('.ct-sheet select')].find(s => [...s.options].some(o => o.value === 'kg'))?.options.length ?? 0");
  check(units === 11, `the unit picker offers the five counted units and the six measures (${units})`);
  await b.js(`(() => { const s = [...document.querySelectorAll('.ct-sheet select')].find(s => [...s.options].some(o => o.value === 'kg')); s.value = 'kg'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.sleep(300);
  const filled = await b.js("[...document.querySelectorAll('.ct-sheet input')].map(i => i.value)");
  check(filled.filter((v) => v === "0.25").length >= 2, "choosing kilos proposes a step and a smallest order of 0.25");
  const hints = await text(".ct-sheet .ct-hint, .ct-sheet .ct-field-hint");
  check((await body()).includes(ct.stepLabel), "the step has its own label");
  // the shot should show the unit, the step and the smallest order, not the photos at the top
  await b.js("[...document.querySelectorAll('.ct-sheet select')].find(s => [...s.options].some(o => o.value === 'kg'))?.scrollIntoView({ block: 'center' })");
  await b.sleep(300);
  await shot("01-item-form");
  await axe("item-form", "dialog, .ct-sheet");
  await b.js(`(() => { const s = [...document.querySelectorAll('.ct-sheet select')].find(s => [...s.options].some(o => o.value === 'kg')); s.value = 'piece'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.sleep(300);
  const back = await b.js("[...document.querySelectorAll('.ct-sheet input')].map(i => i.value)");
  check(!back.includes("0.25"), "going back to pieces takes the fractions out of the form");
  await press(ct.close, "button", "document", 500);
  if (await count(".ct-leave, .ct-confirm")) await press(ct.discard ?? ct.leave ?? ct.close, "button", "document", 500).catch(() => undefined);

  // ── the shop's items, made through the API ──
  const dates = await item({ name: "Medjool dates", name_ar: "تمر مجدول", price: 1250, unit: "kg", pack_size: 0.25, min_order: 0.25, stock_rule: "count", opening_stock: 12.5, category: "Dried fruit", description: "Soft, sweet dates.", description_ar: "تمر طري وحلو." });
  const oud = await item({ name: "Oud oil", name_ar: "دهن عود", price: 400, unit: "ml", pack_size: 50, min_order: 50, stock_rule: "count", opening_stock: 1250, category: "Perfume" });
  const rice = await item({ name: "Rice by the kilo", name_ar: "أرز بالكيلو", price: 800, unit: "kg", stock_rule: "count", opening_stock: 40, category: "Pantry" });
  const water = await item({ name: "Water bottle", name_ar: "قارورة ماء", price: 200, stock_rule: "count", opening_stock: 24, category: "Pantry" });
  check(dates.quantity.show_unit === true && rice.quantity.show_unit === false && water.quantity.show_unit === false, "an item sold in fractions writes its unit; a kilo sold whole and a bottle do not");

  // ── 2. the stock tab and the count sheet ──
  await b.go(`${BASE}/app/catalog`, 2200);
  await press(ct.tabs.stock, "button", "document", 900);
  await b.until("!!document.querySelector('.ct-stocklist')", "the stock list", 15000);
  const stockTexts = await text(".ct-stockrow");
  check(stockTexts.some((x) => x.includes(pick("12.5 kg", "12.5 كغ"))) && stockTexts.some((x) => x.includes(pick("1250 ml", "1250 مل"))) && stockTexts.some((x) => x.includes("40") && !x.includes(pick("40 kg", "40 كغ"))), `stock reads 12.5 kg, 1250 ml, and 40 for the whole-kilo item (${stockTexts.map((x) => x.slice(0, 40)).join(" | ")})`);
  await shot("02-stock");
  await axe("stock");
  await b.click(`[...document.querySelectorAll('.ct-stockrow')].find(r => r.innerText.includes(${JSON.stringify(pick("Medjool dates", "تمر مجدول"))})).querySelectorAll('button')[2]`, 700);
  await b.until("!!document.querySelector('#ct-stock-form input')", "the count sheet", 8000);
  await b.click("document.querySelector('#ct-stock-form input')", 200);
  await b.type(pick("11.75", "١١٫٧٥"));
  await b.sleep(300);
  const diff = await b.js("document.querySelector('.ct-diff')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  check(diff.includes(pick("0.75 kg", "0.75 كغ")) && diff.includes("−"), `the count shows its difference with the unit (${diff})`);
  await shot("03-count-sheet");
  await axe("count-sheet", ".ct-sheet");
  await smallTargets("the count sheet", "document.querySelector('.ct-sheet')");
  await b.click("document.querySelector('#ct-stock-form input:not(.ct-bignum)')", 200);
  await b.type(pick("Dried out", "جفّ"));
  await b.click("document.querySelector('button[type=submit][form=ct-stock-form]')", 900);
  const counted = (await call(`/api/items/${dates.id}`)).data;
  check(counted.variants[0].on_hand === 11.75, `the count is saved exactly (${counted.variants[0].on_hand})`);
  await call(`/api/items/${dates.id}/count`, { method: "POST", body: { counted: "12.5", reason: "Put back" } });

  // ── 3. the customer's order page ──
  const phone = "97455500123";
  const sent = await call("/sim/messages", { method: "POST", as: "", body: { from_number: phone, text: AR ? "طلب" : "order", shop: shop.slug } });
  const linkBody = sent.data.messages.map((m) => m.body).filter((x) => x.includes("?t=")).at(-1);
  const token = linkBody.split("?t=")[1].split(/\s/)[0];
  const url = `${BASE}/s/${shop.slug}?t=${token}${AR ? "&lang=ar" : ""}`;
  await b.go(`${BASE}/s/${shop.slug}`, 100);
  await b.js("sessionStorage.clear(); localStorage.clear()");
  await setLang();
  await b.go(url, 1200);
  await b.until("document.querySelectorAll('.ox-card').length >= 4", "the page");
  const rows = await text(".ox-card");
  const datesRow = rows.find((x) => x.includes(pick("Medjool dates", "تمر مجدول"))) ?? "";
  check(datesRow.includes(pick("per kg", "لكل كغ")), `a fractional item says what a price is per (${datesRow.slice(0, 80)})`);
  const riceRow = rows.find((x) => x.includes(pick("Rice by the kilo", "أرز بالكيلو"))) ?? "";
  check(!/\bper\b/.test(riceRow) && !riceRow.includes("لكل"), `a kilo sold whole does not (${riceRow.slice(0, 80)})`);
  check((await count(".ox-card .ox-add")) >= 2, "the simple items have their add button (the bottle and the whole-kilo rice)");
  await shot("04-order-page");
  await noSideScroll("the order page");
  await axe("order-page");

  // open the dates: quick amounts and a typed amount
  await b.click(`[...document.querySelectorAll('.ox-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Medjool dates", "تمر مجدول"))})).querySelector('.ox-choose')`, 700);
  await b.until("!!document.querySelector('dialog[open] .ox-chip')", "the quick amounts", 8000);
  const chips = await text("dialog[open] .ox-chip");
  check(chips.join("|") === [pick("0.25 kg", "0.25 كغ"), pick("0.5 kg", "0.5 كغ"), pick("1 kg", "1 كغ")].join("|"), `quick amounts are 0.25 / 0.5 / 1 kg (${chips.join(" | ")})`);
  check((await dialogText()).includes(ox.howMuch) && (await dialogText()).includes(pick("In steps of 0.25 kg, at least 0.25 kg.", "بمضاعفات 0.25 كغ، وبحد أدنى 0.25 كغ.")), "the sheet says the step and the smallest order");
  await shot("05-item-sheet");
  await axe("item-sheet", "dialog");
  await smallTargets("the item sheet", "document.querySelector('dialog[open]')");
  await b.click("document.querySelectorAll('dialog[open] .ox-chip')[1]", 300);
  check((await b.js("document.querySelector('dialog[open] .ox-stepnum')?.textContent.trim()")) === pick("0.5 kg", "0.5 كغ"), "tapping 0.5 kg sets the stepper to 0.5 kg");
  check((await b.js("document.querySelector('dialog[open] .ox-amount input').value")) === "0.5", "and the typed amount says 0.5");
  check((await b.js("document.querySelector('dialog[open] .ox-addbtn').innerText.replace(/\\s+/g, ' ')")).includes(pick("QAR 6.25", "6.25 ر.ق")), "the add button shows the rounded price: QAR 6.25");
  // a wrong amount
  await b.click("document.querySelector('dialog[open] .ox-amount input')", 200);
  await b.clearFocused();
  await b.type("0.3");
  await b.sleep(250);
  let message = await b.js("document.querySelector('dialog[open] .ox-field.ox-how .ox-err')?.innerText ?? ''");
  check(message.includes(pick("sold in steps of 0.25 kg", "بمضاعفات 0.25 كغ")) && message.includes(pick("0.5 kg", "0.5 كغ")), `0.3 is named: ${message}`);
  check(await b.js("document.querySelector('dialog[open] .ox-field.ox-how .ox-err')?.getAttribute('role') === 'alert'"), "and it is read out");
  await shot("06-amount-error");
  await axe("amount-error", "dialog");
  await b.click("document.querySelector('dialog[open] .ox-addbtn')", 300);
  check(await b.js("!!document.querySelector('dialog[open]')"), "Add does nothing while the amount is wrong");
  await b.clearFocused();
  await b.type("0.1234");
  await b.sleep(250);
  message = await b.js("document.querySelector('dialog[open] .ox-field.ox-how .ox-err')?.innerText ?? ''");
  check(message.length > 0, "more than three decimals is refused too");
  await b.clearFocused();
  await b.type(pick("0.75", "٠٫٧٥"));
  await b.sleep(250);
  check((await b.js("document.querySelector('dialog[open] .ox-stepnum')?.textContent.trim()")) === pick("0.75 kg", "0.75 كغ"), `a typed ${pick("0.75", "٠٫٧٥")} is read and the stepper follows`);
  check((await b.js("document.querySelector('dialog[open] .ox-addbtn').innerText.replace(/\\s+/g, ' ')")).includes(pick("QAR 9.38", "9.38 ر.ق")), "0.75 kg at QAR 12.50 is QAR 9.375, rounded up to QAR 9.38");
  await b.click("document.querySelector('dialog[open] .ox-step button:last-child')", 200);
  check((await b.js("document.querySelector('dialog[open] .ox-stepnum')?.textContent.trim()")) === pick("1 kg", "1 كغ"), "plus moves by the step: 1 kg");
  await b.click("document.querySelector('dialog[open] .ox-addbtn')", 700);
  check(!(await b.js("!!document.querySelector('dialog[open]')")), "with a good amount the dates go in the order");
  // oud: millilitres, by fifty
  await b.click(`[...document.querySelectorAll('.ox-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Oud oil", "دهن عود"))})).querySelector('.ox-choose')`, 700);
  await b.until("!!document.querySelector('dialog[open] .ox-chip')", "oud's quick amounts", 8000);
  const oudChips = await text("dialog[open] .ox-chip");
  check(oudChips.join("|") === [pick("50 ml", "50 مل"), pick("100 ml", "100 مل"), pick("250 ml", "250 مل")].join("|"), `oud is offered 50 / 100 / 250 ml (${oudChips.join(" | ")})`);
  await b.click("document.querySelectorAll('dialog[open] .ox-chip')[2]", 300);
  await shot("07-item-sheet-oud");
  await b.click("document.querySelector('dialog[open] .ox-addbtn')", 700);
  // the whole-kilo rice and the bottle: a plain stepper, plain numbers
  await b.click(`[...document.querySelectorAll('.ox-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Rice by the kilo", "أرز بالكيلو"))})).querySelector('.ox-add')`, 300);
  await b.click(`[...document.querySelectorAll('.ox-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Rice by the kilo", "أرز بالكيلو"))})).querySelector('.ox-step button:last-child')`, 300);
  check((await b.js(`[...document.querySelectorAll('.ox-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Rice by the kilo", "أرز بالكيلو"))})).querySelector('.ox-stepnum').textContent.trim()`)) === "2", "a kilo sold whole counts 1, 2 and reads \"2\", as before");
  const bar = await b.js("document.querySelector('.cx-bar-in')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  check(bar.includes(pick("4 items", "4 أصناف")), `the bar counts things, not millilitres: 1 kg + 250 ml + 2 rice = 4 (${bar})`);
  await shot("08-order-page-with-items");
  await noSideScroll("the order page with items");
  // review
  await press(ox.review, "button", "document", 1500);
  await b.until("!!document.querySelector('dialog[open] .ox-line')", "the review", 12000);
  const review = await dialogText();
  check(review.includes(pick("1 kg", "1 كغ")) && review.includes(pick("250 ml", "250 مل")), "the review shows each line with its unit");
  check(review.includes(pick("QAR 12.50", "12.50 ر.ق")) && review.includes(pick("QAR 1,000", "1,000 ر.ق")), "and the line's own total: 1 kg is QAR 12.50, 250 ml is QAR 1,000");
  check(review.includes(pick("QAR 1,028.50", "1,028.50 ر.ق")), `the order's total is the sum of the rounded lines: QAR 12.50 + 1,000 + 2 x 8 rice (${review.slice(-120)})`);
  await shot("09-review");
  await axe("review", "dialog");
  await smallTargets("the review", "document.querySelector('dialog[open]')");
  await b.until("!document.querySelector('dialog[open] .ox-state .ox-quiet')", "the check", 8000);
  await press(ox.pay("").replace(/\s+$/, "").split(" ")[0] || "Pay", "button", "document", 2500);
  await b.sleep(1500);

  // the order in the API
  const orders = (await call("/api/orders")).data;
  const list = Array.isArray(orders) ? orders : orders.orders;
  const placed = list[0];
  check(Boolean(placed), "the order was placed");
  if (placed) {
    const lines = Object.fromEntries(placed.items.map((i) => [i.name, i]));
    check(lines["Medjool dates"]?.quantity === 1 && lines["Medjool dates"]?.unit === "kg" && lines["Medjool dates"]?.unit_shown === true, "dates: 1 kg, unit shown");
    check(lines["Oud oil"]?.quantity === 250 && lines["Oud oil"]?.unit === "ml", "oud: 250 ml");
    check(lines["Rice by the kilo"]?.quantity === 2 && lines["Rice by the kilo"]?.unit_shown === false, "rice: 2, no unit shown");
    check(placed.total === 1250 + 100000 + 1600, `the total is the sum of the rounded lines (${placed.total})`);
  }
  const stock = async (it) => (await call(`/api/items/${it.id}`)).data.variants[0].on_hand;
  check((await stock(dates)) === 11.5 && (await stock(oud)) === 1000 && (await stock(rice)) === 38, `stock moved by exactly what was ordered (${await stock(dates)}, ${await stock(oud)}, ${await stock(rice)})`);

  // ── 4. the wholesale table ──
  await call("/api/items/settings", { method: "PUT", body: { wholesale_layout: true } });
  await b.go(url, 1500);
  await b.until("document.querySelectorAll('.ox-wrow').length >= 4", "the table", 12000);
  const wrow = `[...document.querySelectorAll('.ox-wrow')].find(r => r.innerText.includes(${JSON.stringify(pick("Medjool dates", "تمر مجدول"))}))`;
  await b.click(`(${wrow}).querySelector('.ox-add')`, 300);
  check((await b.js(`(${wrow}).querySelector('.ox-stepnum').textContent.trim()`)) === pick("0.25 kg", "0.25 كغ"), "the table's first tap adds the smallest order, 0.25 kg");
  await b.click(`(${wrow}).querySelector('.ox-step button:last-child')`, 300);
  check((await b.js(`(${wrow}).querySelector('.ox-stepnum').textContent.trim()`)) === pick("0.5 kg", "0.5 كغ"), "and plus moves by the step: 0.5 kg");
  check((await text(`.ox-wrow .ox-per`)).length >= 1, "the table says what the price is per");
  await shot("10-wholesale-table");
  await noSideScroll("the wholesale table");
  await axe("wholesale");
  await smallTargets("the wholesale table", "document.querySelector('.ox-wtable')");
  await call("/api/items/settings", { method: "PUT", body: { wholesale_layout: false } });

  // ── 5. tracking page ──
  const track = placed ? `${BASE}/t/${placed.track_tenant ?? ""}` : "";
  if (placed?.id) {
    const tenant = (await call("/api/workspace")).data?.tenant_id ?? "";
    if (tenant) {
      await b.go(`${BASE}/t/${tenant}/${placed.id}${AR ? "?lang=ar" : ""}`, 1200);
      const t = await body();
      check(t.includes(pick("1 kg", "1 كغ")) && t.includes(pick("250 ml", "250 مل")), "the tracking page reads 1 kg and 250 ml");
      await shot("11-tracking");
      await axe("tracking");
    }
  }

  const page = await body();
  check(!unwanted.test(page), "nothing says coming or beta");
  for (const p of b.problems) { if (!/favicon|Failed to load resource/i.test(p)) failures.push(`browser: ${p}`); }
}

try {
  await main();
} catch (error) {
  failures.push(`stopped: ${error.message ?? error}`);
  log("STOPPED", error.message ?? error);
  try { await shot("99-stopped"); } catch { /* the page is gone */ }
} finally {
  await b.close();
}
log(failures.length ? `${failures.length} failed` : "all passed");
for (const f of failures) log("  -", f);
process.exit(failures.length ? 1 : 0);
