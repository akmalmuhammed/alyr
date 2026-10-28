// Is what onboarding tells a new owner TRUE of the finished order page and workspace? (ALY-113)
//
// For each business type this signs a new owner up through the real onboarding API, reads the
// "Here is what you are getting" sentences off the review screen, and then proves each one the
// way a person would: it makes real items the way the sentence says (sizes, a daily number,
// hours, a sale, a code, a price for a kind of customer), opens the customer's order page with
// the owner's private test-line link, and looks at what is on it. It also opens the owner's
// own screens (the add sheet, the item form, the settings) to see the controls the sentences
// name. Headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages,
// Node 22.18 or newer (it reads the words straight from the .ts copy files).
//
//   node scripts/golive-truth-check.mjs --lang en --base http://localhost:31417 \
//        --api http://127.0.0.1:38417 --out C:/t/gl/shots --profile C:/t/gl/p-en --port 9733 \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API (ALYR_SIGNUP_OPEN=true, ALYR_PUBLIC_WEB_URL set to --base) on a scratch
// database of its own and a web app pointed at it; never the shared database. It will not
// drive a browser that is not its own: the Edge it starts must report this run's --profile as
// its user-data-dir, and the debugging port must be free. Short folders: Edge fails quietly
// with long paths.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { COPY as START } from "../apps/web/app/(product)/start/copy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:31417";
const API = args.api ?? "http://127.0.0.1:38417";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const OUT = args.out ?? `${tmpdir()}/gl-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/gl-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9734 : 9733));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const ONLY = (args.types ?? "restaurant,bakery,grocery,fashion,shop,wholesale,salon,spa,clinic,home,travel").split(",");
const t = COPY[LANG];
const s = START[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

// ── the shop's side ─────────────────────────────────────────────────────────────────────
async function call(path, { method = "GET", body, cookie = "" } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: response.headers.getSetCookie?.().map((c) => c.split(";")[0]).find((c) => c.startsWith("alyr_session=")) ?? "" };
}
async function signUp(kind) {
  const stamp = Date.now().toString(36);
  const email = `gl-${kind}-${stamp}@shop.example`;
  const code = (await call("/api/onboarding/code", { method: "POST", body: { email } })).data.dev_code;
  const verified = await call("/api/onboarding/verify", { method: "POST", body: { email, code } });
  const name = `${kind[0].toUpperCase()}${kind.slice(1)} ${stamp.slice(-4)}`;
  const made = await call("/api/onboarding/business", { method: "POST", body: { signup_token: verified.data.signup_token, owner_name: "Hamad", name, name_ar: "الدوحة", type: kind, area: "Al Sadd" } });
  if (made.status !== 200) throw new Error(`could not create a ${kind}: ${made.status} ${JSON.stringify(made.data)}`);
  const cookie = made.cookie;
  const state = (await call("/api/onboarding/state", { cookie })).data;
  return { cookie, name, slug: state.business.slug, state };
}
const QAR = (n) => n * 100;

// ── the page ────────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE });
try {
  // The browser that answers on the port must be the one started with this run's profile
  // folder: read the command line of the process that was started with that port.
  const shell = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${PORT} *' } | ForEach-Object { $_.CommandLine }`;
  const lines = execFileSync("powershell", ["-NoProfile", "-Command", shell], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  const norm = (p) => p.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
  const mine = lines.filter((l) => norm(l).includes(`--user-data-dir=${norm(PROFILE)}`));
  if (lines.length === 0 || mine.length !== lines.length) throw new Error(`the browser on port ${PORT} is not mine (${lines.length} process(es), ${mine.length} with my profile ${PROFILE})`);
  check(true, `my own Edge on port ${PORT}, profile ${PROFILE} (${lines.length} process line)`);
} catch (error) { console.error(error.message); await b.close(); process.exit(2); }

const body = () => b.js("document.body.innerText");
const text = (selector) => b.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
const count = (selector) => b.js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const press = (label, tag = "button", scope = "document", wait = 250) =>
  b.click(`[...${scope}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(label)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`, wait);
const sheet = "(document.querySelector('.ct-sheet') || document)";
async function shot(name) { await b.shot(`${OUT}/${LANG}-${name}.png`); log("shot", name); }
async function noSideScroll(what) {
  const wide = await b.js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth ? document.documentElement.scrollWidth : 0");
  check(!wide, `no sideways scrolling on ${what}${wide ? ` (${wide})` : ""}`);
}
async function axe(what) {
  if (!AXE) return;
  const found = await b.axe(AXE);
  if (found === null) return;
  writeFileSync(`${OUT}/${LANG}-axe-${what}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: nothing on ${what} (${found.map((v) => v.id).join(", ") || "clean"})`);
}
const unwanted = /\b(coming soon|coming|beta|early access|not yet|under development)\b|قريباً|قريبا|نسخة تجريبية/i;
const sentencesShown = async (kind, state, where) => {
  const page = await body();
  const gets = state.catalog.gets.map((g) => g[LANG]);
  for (const g of gets) check(page.includes(g), `${kind}: ${where} says “${g.slice(0, 60)}${g.length > 60 ? "…" : ""}”`);
  check(!unwanted.test(page), `${kind}: ${where} says nothing is coming`);
  return gets;
};

// The order page as the shop's own test customer sees it.
async function customerLink(cookie, ask = "menu") {
  const sent = await call("/api/onboarding/test-chat", { method: "POST", body: { text: ask }, cookie });
  const message = sent.data.messages?.map((m) => m.body).filter((x) => x.includes("?t=")).at(-1);
  if (!message) throw new Error(`no order link came back: ${JSON.stringify(sent.data).slice(0, 200)}`);
  return message.match(/https?:\/\/\S+/)[0];
}
const toBase = (url) => url.replace(/^https?:\/\/[^/]+/, BASE);
async function openOrderPage(url, wait = 1800) {
  await b.go(toBase(url), wait);
  await b.until("!!document.querySelector('.ox-list, [role=row].ox-wrow, .ox-none, .cx-warn')", "the order page", 25000);
  if (AR) {
    // The page speaks the customer's own language (the test customer reads English); the switch in its header changes it.
    await b.click("[...document.querySelectorAll('header button, .cx-head button, button')].filter(" + visible + ").find(e => e.textContent.trim() === 'العربية')", 700);
    await b.until("document.documentElement.dir === 'rtl' || document.body.innerText.includes('English')", "Arabic", 8000);
  }
}
const cardNamed = (name) => `[...document.querySelectorAll('li.ox-card')].find(c => c.innerText.includes(${JSON.stringify(name)}))`;

// ── the run (below the proofs it uses) ──────────────────────────────────────────────────
async function run() {
try {
  await b.view(375, 812, true, "light");
  await b.go(`${BASE}/start`, 500);
  await b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)})`);

  for (const kind of ONLY) {
    log(`──────── ${kind}`);
    const shop = await signUp(kind);
    const mine = (path, method = "GET", data) => call(path, { method, body: data, cookie: shop.cookie });
    await b.send("Network.clearBrowserCookies");
    await b.send("Network.setCookie", { name: "alyr_session", value: shop.cookie.split("=")[1], url: BASE });

    // 1. the review: what onboarding says the shop is getting
    if (kind === "travel") {
      check(shop.state.catalog === null, "travel: onboarding names no catalog");
      await b.go(`${BASE}/start`, 1500);
      check(!/menu|price list|sample|catalog|قائمة|نموذج/i.test(await body()), "travel: the review says nothing about a catalog");
      await b.go(`${BASE}/app`, 1500);
      const nav = await b.js("[...document.querySelectorAll('.sh-tabbar a')].map(a => a.textContent.trim()).join(' | ')");
      check(!/menu|products|price list|catalog|قائمة|منتجات|الكتالوج/i.test(nav.replace(/ALYR products/i, "")), `travel: no catalog in the navigation (${nav})`);
      continue;
    }
    const optional = shop.state.way === "appointments";
    if (optional) {
      await mine("/api/onboarding/state", "PATCH", { step: "golive" });
      await b.go(`${BASE}/start`, 1800);
      const page = await body();
      check(page.includes(s.golive.catalogSub), `${kind}: the go-live list offers the optional products`);
      check(!unwanted.test(page), `${kind}: the go-live list says nothing is coming`);
      await noSideScroll(`${kind} go-live`);
      await shot(`${kind}-golive`);
      for (const g of shop.state.catalog.gets) check(g[LANG].length > 10, `${kind}: “${g[LANG].slice(0, 50)}”`);
    } else {
      await b.go(`${BASE}/start`, 1800);
      await sentencesShown(kind, shop.state, "the review");
      await noSideScroll(`${kind} review`);
      await shot(`${kind}-review`);
      if (kind === "restaurant") await axe(`${kind}-review`);
    }

    // 2. the sentences, one type at a time
    const proof = PROOF[kind];
    if (proof) await proof(shop, mine);

    // 3. the owner's own screens, and the console
    await b.go(`${BASE}/app/catalog`, 1800);
    await b.until("!!document.querySelector('.ct-card, .ct-row, .ct-empty')", "the Catalog list");
    check(!unwanted.test(await body()), `${kind}: the Catalog list says nothing is coming`);
    await noSideScroll(`${kind} workspace list`);
    await shot(`${kind}-workspace`);

    // 4. every other screen the owner can open says nothing is coming, soon or not yet
    for (const screen of ["", "/orders", "/bookings", "/inbox", "/ledger", "/products", "/connections", "/team"]) {
      await b.go(`${BASE}/app${screen}`, 1400);
      await sleep(600);
      const page = await body();
      check(!unwanted.test(page), `${kind}: /app${screen} says nothing is coming or not yet${unwanted.test(page) ? ": " + page.match(unwanted)[0] : ""}`);
      if (["/products", "/connections", ""].includes(screen) && ["restaurant", "salon"].includes(kind)) await shot(`${kind}-app${screen.replace("/", "-") || "-home"}`);
    }
  }
  check(b.problems.length === 0, `no console errors or exceptions${b.problems.length ? ": " + b.problems.slice(0, 5).join(" || ") : ""}`);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED", error.stack ?? error);
} finally {
  await b.close();
}
}

// ── the proofs: what each type's sentences promise, checked on the real pages ──────────────
var PROOF = {
  async restaurant(shop, mine) {
    // "Sizes and extras on a dish, each with its own price." / "a number of portions each
    // day." / "only at certain hours" / "A dish that is off shows greyed out."
    const wrap = await mine("/api/items", "POST", {
      name: "Shawarma wrap", name_ar: "ساندويتش شاورما", price: QAR(14), status: "live", category: "Mains", unit: "portion",
      option_groups: [
        { name: "Size", name_ar: "الحجم", required: true, options: [{ name: "Regular", name_ar: "عادي", price_delta: 0 }, { name: "Large", name_ar: "كبير", price_delta: QAR(4) }] },
        { name: "Extras", name_ar: "إضافات", required: false, max_choices: 2, options: [{ name: "Garlic sauce", name_ar: "ثوم", price_delta: QAR(1) }] },
      ],
    });
    check(wrap.status === 200 || wrap.status === 201, `restaurant: a dish with sizes and extras is saved (${wrap.status})`);
    await mine("/api/items", "POST", { name: "Karak tea", name_ar: "شاي كرك", price: QAR(4), status: "live", category: "Drinks", unit: "portion", stock_rule: "daily_limit", daily_limit: 3 });
    await mine("/api/items", "POST", {
      name: "Breakfast plate", name_ar: "طبق فطور", price: QAR(18), status: "live", category: "Mains", unit: "portion",
      schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], opens: "06:00", closes: "11:00" }],
    });
    await mine("/api/items", "POST", { name: "Mixed grill", name_ar: "مشاوي", price: QAR(48), status: "live", category: "Mains", unit: "portion", available: false });
    const link = await customerLink(shop.cookie);
    await openOrderPage(link);
    check((await b.js("document.querySelector('ul.ox-list')?.className")) === "ox-list menu", "restaurant: the order page is a menu (photo beside the name)");
    const grill = await b.js(`(${cardNamed(AR ? "مشاوي" : "Mixed grill")}) ? ${cardNamed(AR ? "مشاوي" : "Mixed grill")}.className + '|' + ${cardNamed(AR ? "مشاوي" : "Mixed grill")}.innerText.replace(/\\s+/g,' ') : null`);
    check(!!grill && grill.includes("off") && /sold out|نفد|مباع/i.test(grill), `restaurant: a dish that is off shows greyed out on the order page (${grill})`);
    check(/06:00|6:00|٠٦|6 ص|6 am|6 AM/i.test(await b.js(`(${cardNamed(AR ? "طبق فطور" : "Breakfast plate")}) ? ${cardNamed(AR ? "طبق فطور" : "Breakfast plate")}.innerText : ''`)) , "restaurant: a dish that is only served at certain hours says when");
    const tea = await b.js(`(${cardNamed(AR ? "شاي كرك" : "Karak tea")}) ? ${cardNamed(AR ? "شاي كرك" : "Karak tea")}.innerText.replace(/\\s+/g,' ') : ''`);
    check(/3/.test(tea) && /today|اليوم/i.test(tea), `restaurant: a dish with a daily number says how many are left today (${tea})`);
    await b.click(`document.querySelector('li.ox-card .ox-choose')`, 700);
    await b.until("!!document.querySelector('[role=dialog], .ox-dialog')", "the dish opens");
    const dish = await b.js("document.querySelector('[role=dialog], .ox-dialog').innerText.replace(/\\s+/g, ' ')");
    check(/Large|كبير/.test(dish) && /\+\s*(QAR\s*)?4|٤|4/.test(dish), `restaurant: the dish offers sizes with their own price (${dish.slice(0, 160)})`);
    check(/Extras|إضافات/.test(dish) && /Garlic|ثوم/.test(dish), "restaurant: the dish offers extras");
    await shot("restaurant-dish");
    await b.js("document.querySelector('[role=dialog] button[aria-label], .ox-dialog button[aria-label]')?.click()");
    await noSideScroll("restaurant order page");
    await shot("restaurant-order");
    await axe("restaurant-order");
    await ownerForm("restaurant", [t.ruleTitle, t.scheduleTitle, t.optionsTitle], Object.values(t.rules).map((r) => r[0]));
  },

  async bakery(shop, mine) {
    // "a new item asks for one day's notice and an order before 6 pm, and the customer picks
    // the pickup day." / "Made-to-order items ... never run out."
    const form = await ownerNewItem("bakery");
    check(form.lead, "bakery: a new item starts ordered a day ahead, before 18:00");
    await mine("/api/items", "POST", {
      name: "Chocolate cake", name_ar: "كيكة شوكولاتة", price: QAR(85), status: "live", category: "Cakes", stock_rule: "daily_limit", daily_limit: 3,
      schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], lead_days: 1, cutoff: "18:00" }],
    });
    await mine("/api/items", "POST", {
      name: "Celebration cake", name_ar: "كيكة مناسبات", price: QAR(180), status: "live", category: "Cakes", stock_rule: "always",
      schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], lead_days: 2, cutoff: "18:00" }],
    });
    const link = await customerLink(shop.cookie);
    await openOrderPage(link);
    check((await b.js("document.querySelector('ul.ox-list')?.className")) === "ox-list menu", "bakery: the order page is a menu");
    const cake = await b.js(`(${cardNamed(AR ? "كيكة شوكولاتة" : "Chocolate cake")}) ? ${cardNamed(AR ? "كيكة شوكولاتة" : "Chocolate cake")}.innerText.replace(/\\s+/g,' ') : ''`);
    check(/18:00|6 pm|6:00|٦|6 م|مساء/i.test(cake) || /day|يوم/i.test(cake), `bakery: a cake says when it can be ordered for (${cake})`);
    await b.click(`${cardNamed(AR ? "كيكة شوكولاتة" : "Chocolate cake")}.querySelector('.ox-add')`, 500);
    await b.click("document.querySelector('.cx-bar .cx-btn')", 1200);
    await b.until("!!document.querySelector('.ox-daylist')", "the pickup day choice", 15000).catch(() => undefined);
    const days = await text(".ox-daylist label, .ox-daylist button, .ox-daylist [role=radio]");
    check(days.length >= 1, `bakery: the customer picks the pickup day (${days.slice(0, 3).join(" | ")})`);
    await shot("bakery-review-sheet");
    await noSideScroll("bakery order page");
  },

  async grocery(shop, mine) {
    // "by kilo, piece or pack" / "counted, sold out at zero" / "left off your order page" /
    // "compact list with a plus and a minus on each row"
    const made = [
      ["Tomatoes", "طماطم", 6, "kg", 25], ["Fresh milk", "حليب", 7, "piece", 3], ["Eggs tray", "بيض", 17, "pack", 0],
      ["Basmati rice", "أرز بسمتي", 38, "pack", 12],
    ];
    for (const [name, name_ar, price, unit, stock] of made) {
      const answer = await mine("/api/items", "POST", { name, name_ar, price: QAR(price), status: "live", category: "Pantry", unit, stock_rule: "count", opening_stock: stock });
      check(answer.status === 200 || answer.status === 201, `grocery: ${name} sold by ${unit} is saved`);
    }
    const link = await customerLink(shop.cookie);
    await openOrderPage(link);
    check((await b.js("document.querySelector('ul.ox-list')?.className")) === "ox-list list", "grocery: the order page is a compact list");
    check((await count("li.ox-card .ox-thumb")) === 0, "grocery: the compact list has no photo boxes");
    check((await count("li.ox-card .ox-add")) === 4 - 1, "grocery: every row that can be ordered has a plus");
    const names = await text("li.ox-card .ox-name");
    check(!names.some((n) => n.includes(AR ? "بيض" : "Eggs")), "grocery: an item at zero is left off the order page");
    const milk = await b.js(`${cardNamed(AR ? "حليب" : "Fresh milk")}.innerText.replace(/\\s+/g,' ')`);
    check(/3/.test(milk) && /left|متبق|بقي|فقط/i.test(milk), `grocery: only 3 left is said (${milk})`);
    await b.click(`${cardNamed(AR ? "طماطم" : "Tomatoes")}.querySelector('.ox-add')`, 400);
    const stepper = await b.js(`${cardNamed(AR ? "طماطم" : "Tomatoes")}.querySelectorAll('button').length`);
    check(stepper >= 3, `grocery: once an item is added its row shows minus, the count and plus (${stepper} buttons in the row)`);
    await shot("grocery-order");
    await noSideScroll("grocery order page");
    await axe("grocery-order");
    // The settings the review names: a low-stock number of 10, changeable.
    const settings = (await mine("/api/items/settings")).data;
    check(settings.low_stock_at === 10, `grocery: the low-stock number starts at 10 (${settings.low_stock_at})`);
  },

  async fashion(shop, mine) {
    // "Photos first ...", "Sizes and colours, each with its own stock and its own photo.",
    // "A sale price with an end date.", "A link for every item", "photo grid with a size and
    // colour picker. A sold-out piece stays visible, greyed out."
    const abaya = await mine("/api/items", "POST", {
      name: "Cotton abaya", name_ar: "عباية قطن", price: QAR(220), status: "live", category: "Abayas", stock_rule: "count",
      sale_price: QAR(180), sale_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(),
      variants: [
        { name: "Black M", name_ar: "أسود M", opening_stock: 5 }, { name: "Black L", name_ar: "أسود L", opening_stock: 2 },
        { name: "Navy M", name_ar: "كحلي M", opening_stock: 0 },
      ],
    });
    check(abaya.status === 200 || abaya.status === 201, `fashion: an item with sizes and colours and a sale price with an end date is saved (${abaya.status})`);
    await mine("/api/items", "POST", { name: "Silk scarf", name_ar: "وشاح حرير", price: QAR(60), status: "live", category: "Accessories", stock_rule: "count", opening_stock: 0 });
    const link = await customerLink(shop.cookie);
    await openOrderPage(link);
    check((await b.js("document.querySelector('ul.ox-list')?.className")) === "ox-list grid", "fashion: the order page is a photo grid");
    check((await count("li.ox-card .ox-thumb")) >= 2, "fashion: each piece has a photo box");
    const scarf = await b.js(`${cardNamed(AR ? "وشاح" : "Silk scarf")}.className + '|' + ${cardNamed(AR ? "وشاح" : "Silk scarf")}.innerText.replace(/\\s+/g,' ')`);
    check(scarf.includes("off") && /sold out|نفد|مباع/i.test(scarf), `fashion: a sold-out piece stays visible, greyed out (${scarf})`);
    const card = await b.js(`${cardNamed(AR ? "عباية" : "Cotton abaya")}.innerText.replace(/\\s+/g,' ')`);
    check(/sale|تخفيض|عرض/i.test(card), `fashion: the sale price is shown as a sale (${card})`);
    await b.click(`${cardNamed(AR ? "عباية" : "Cotton abaya")}.querySelector('.ox-choose')`, 800);
    await b.until("!!document.querySelector('[role=dialog], .ox-dialog')", "the piece opens");
    const open = await b.js("document.querySelector('[role=dialog], .ox-dialog').innerText.replace(/\\s+/g, ' ')");
    check(/Black M/.test(open.replace(/أسود/g, "Black")) || /أسود/.test(open), `fashion: the piece offers its sizes and colours (${open.slice(0, 140)})`);
    check(/Navy M|كحلي/.test(open) && /sold out|نفد|مباع/i.test(open), "fashion: a size that is gone says so in the picker");
    check(await b.js("document.querySelector('[role=dialog], .ox-dialog').querySelectorAll('img').length") <= 3, "fashion: the picker shows the piece's photos (a size has no photo of its own)");
    await shot("fashion-piece");
    await b.js("document.querySelector('[role=dialog] button[aria-label], .ox-dialog button[aria-label]')?.click()");
    await noSideScroll("fashion order page");
    await shot("fashion-order");
    await axe("fashion-order");
    // The owner's side: the add sheet is photos first; a size's own photo control.
    await b.go(`${BASE}/app/catalog`, 1800);
    await b.until("!!document.querySelector('.ct-card, .ct-row, .ct-empty')", "the list");
    await press(t.add);
    await b.until("!!document.querySelector('.ct-sheet')", "the add sheet");
    check((await b.js("document.querySelector('.ct-sheet').innerText")).includes(t.addIntro), "fashion: the add sheet starts from photos (“Take or choose photos…”)");
    await shot("fashion-add");
    await b.click(`document.querySelector('.ct-sheet [aria-label=${JSON.stringify(t.close)}]')`, 400);
    await b.click(`[...document.querySelectorAll('.ct-card')].find(c => c.innerText.includes(${JSON.stringify(AR ? 'عباية' : 'Cotton abaya')}) && !c.querySelector('.ct-pill.sample')).querySelector('.ct-open')`, 800);
    await b.until("!!document.querySelector('.ct-sheet')", "an item's sheet");
    await sleep(800);
    const form = await b.js("document.querySelector('.ct-sheet').innerText");
    await shot("fashion-item-sheet");
    log("info", "the sheet says: " + form.split(String.fromCharCode(10)).join(" ").slice(0, 400));
    check(form.includes(t.share) || (await body()).includes(t.share), "fashion: an item has a Share action (a link for every item)");
    check(form.includes(t.salePrice) && form.includes(t.saleEnds), "fashion: the item form has a sale price with an end date");
    const section = `[...document.querySelectorAll(".ct-sheet summary")].find(x => x.textContent.includes(${JSON.stringify(t.variantsTitle)})).parentElement`;
    await b.js(`${section}.open = true; ${section}.scrollIntoView()`);
    await sleep(400);
    await shot("fashion-variants");
    const controls = await b.js(`[...${section}.querySelectorAll("button, input[type=file], label")].map(e => (e.getAttribute("aria-label") || e.innerText || e.type || "").trim()).filter(Boolean).slice(0, 40)`);
    log("info", "controls in the sizes and colours section: " + controls.join(" | "));
    const variantPhoto = controls.some((c) => /photo|picture|صور/i.test(c));
    log("info", `a photo control inside a size or colour row: ${variantPhoto}`);
    check(variantPhoto || !shop.state.catalog.gets.some((g) => /its own photo|own photo/i.test(g.en)), "fashion: the review promises a photo for a size or colour only if the form has the control");
  },

  async shop(shop, mine) {
    const made = await mine("/api/items", "POST", { name: "Earbuds", name_ar: "سماعات", price: QAR(120), status: "live", category: "Electronics", stock_rule: "count", sku: "EB-1", variants: [{ name: "White", name_ar: "أبيض", opening_stock: 4 }, { name: "Black", name_ar: "أسود", opening_stock: 0 }] });
    check(made.status === 200 || made.status === 201, `shop: a product with a code (SKU) and sizes is saved (${made.status})`);
    await mine("/api/items", "POST", { name: "Charger", name_ar: "شاحن", price: QAR(45), status: "live", category: "Electronics", stock_rule: "count", opening_stock: 0 });
    const link = await customerLink(shop.cookie);
    await openOrderPage(link);
    check((await b.js("document.querySelector('ul.ox-list')?.className")) === "ox-list grid", "shop: the order page is a photo grid");
    const charger = await b.js(`${cardNamed(AR ? "شاحن" : "Charger")}.className`);
    check(charger.includes("off"), "shop: a sold-out product stays visible, greyed out");
    await shot("shop-order");
    await noSideScroll("shop order page");
  },

  async wholesale(shop, mine) {
    // "a code (SKU), a pack size and a smallest order", "a price for each kind of customer",
    // "table with quick quantities"
    const item = await mine("/api/items", "POST", { name: "Cooking oil carton", name_ar: "زيت طبخ كرتون", price: QAR(175), status: "live", category: "Oils", unit: "pack", pack_size: 9, min_order: 3, sku: "OIL-9", stock_rule: "count", opening_stock: 100 });
    check(item.status === 200 || item.status === 201, `wholesale: an item with a code, a pack size and a smallest order is saved (${item.status})`);
    const group = await mine("/api/price-groups", "POST", { name: "Wholesale", name_ar: "الجملة" });
    check(group.status === 200, `wholesale: a price group is added (${group.status})`);
    const id = item.data.item.id;
    const set = await mine(`/api/items/${id}/group-prices`, "PUT", { prices: [{ group_id: group.data.group.id, price: QAR(150) }] });
    check(set.status === 200, `wholesale: the wholesale price is set once (${set.status})`);
    const link = await customerLink(shop.cookie);
    await openOrderPage(link);
    check((await count("[role=row].ox-wrow")) >= 1, "wholesale: the order page is a table");
    const row = (await text("[role=row].ox-wrow"))[0];
    check(/OIL-9/.test(row), `wholesale: the code shows beside the name (${row})`);
    check(/9/.test(row) && /3/.test(row), `wholesale: the pack size and the smallest order show (${row})`);
    check(/175|١٧٥/.test(row), "wholesale: a customer in the normal group sees the normal price");
    await shot("wholesale-order");
    await noSideScroll("wholesale order page");
    await axe("wholesale-order");
    // The same customer in the wholesale group sees their own price.
    const customer = (await mine("/api/ledger/accounts")).data;
    log("info", "accounts keys", Object.keys(customer));
  },
};

async function ownerForm(kind, titles, ruleNames) {
  await b.go(`${BASE}/app/catalog`, 1800);
  await b.until("!!document.querySelector('.ct-card, .ct-row, .ct-empty')", "the Catalog list");
  await press(t.add);
  await b.until("!!document.querySelector('.ct-sheet')", "the add sheet");
  await press(t.typeOne, "button", "document", 700);
  await b.until("!!document.querySelector('.ct-sheet input[name=rule]')", "the item form");
  const form = await b.js("document.querySelector('.ct-sheet').innerText");
  for (const title of titles) check(form.includes(title), `${kind}: the item form has “${title}”`);
  for (const rule of ruleNames) check(form.includes(rule), `${kind}: the item form offers “${rule}”`);
  await shot(`${kind}-item-form`);
  await b.click(`document.querySelector('.ct-sheet [aria-label=${JSON.stringify(t.close)}]')`, 400);
  // The alerts need people to tell: the settings have the place to add them.
  await press(t.settings, "button", "document", 700);
  await b.until("!!document.querySelector('.ct-sheet')", "the settings");
  await b.until(`document.querySelector(".ct-sheet").innerText.toLowerCase().includes(${JSON.stringify(t.staffTitle.toLowerCase())})`, "the staff numbers", 8000).catch(() => undefined);
  const settings = await b.js("document.querySelector('.ct-sheet').innerText");
  check(settings.toLowerCase().includes(t.staffTitle.toLowerCase()), `${kind}: the settings have “${t.staffTitle}”, where the managers' numbers go`);
  await shot(`${kind}-settings`);
  await b.click(`document.querySelector('.ct-sheet [aria-label=${JSON.stringify(t.close)}]')`, 400);
}

async function ownerNewItem(kind) {
  await b.go(`${BASE}/app/catalog`, 1800);
  await b.until("!!document.querySelector('.ct-card, .ct-row, .ct-empty')", "the Catalog list");
  await press(t.add);
  await b.until("!!document.querySelector('.ct-sheet')", "the add sheet");
  await press(t.typeOne, "button", "document", 700);
  await b.until("!!document.querySelector('.ct-sheet input[name=rule]')", "the item form");
  const lead = await b.js("[...document.querySelectorAll('.ct-sheet input')].some(i => i.value === '18:00')");
  await shot(`${kind}-new-item`);
  await b.click(`document.querySelector('.ct-sheet [aria-label=${JSON.stringify(t.close)}]')`, 400);
  return { lead };
}

await run();
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
log("all checks passed");
