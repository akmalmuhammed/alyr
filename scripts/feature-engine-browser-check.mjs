// The feature engine, proved in a real browser (ALY-148, specs/012-feature-engine/spec.md).
//
// Signs a bakery owner up through the real onboarding API, then, in headless Edge at 375 px (and
// again at a laptop's width), in English or Arabic, light or dark:
//   * opens Catalog, Features: every feature has its switch and its words, the search finds one,
//     a switch is saved at once with a message, the section is renamed and the layout chosen,
//     and the workspace's navigation and the customer's page take the new name;
//   * opens the item form with a feature off and on: the part is hidden for an item without it
//     and still there for an item that has it;
//   * opens the customer's order page and proves the four extras one by one (quick quantity,
//     the item code, the pickup day, "same as last time") on and off.
// axe-core runs on the screens it opens. Screenshots are written for a person to look at.
//
//   node scripts/feature-engine-browser-check.mjs --lang en --scheme light \
//        --base http://localhost:3141 --api http://127.0.0.1:8251 --out C:/alyr-feat/shots \
//        --profile C:/alyr-feat/p-en --port 9881 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API (ALYR_SIGNUP_OPEN=true, ALYR_PUBLIC_WEB_URL set to --base) on a scratch
// database of its own and a web app pointed at it; never the shared database. It drives only its
// own Edge (its own --profile, a free --port). Short folders: Edge fails quietly with long paths.
// Node 22.18 or newer (it reads the words straight from the .ts copy files).

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/catalogCopy.ts";
import { FEAT } from "../apps/web/app/(product)/_workspace/featuresCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3141";
const API = args.api ?? "http://127.0.0.1:8251";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const OUT = args.out ?? `${tmpdir()}/fe-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/fe-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9882 : 9881));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const WIDE = args.wide === "true";
const t = COPY[LANG];
const f = FEAT[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}/${SCHEME}${WIDE ? "/wide" : ""}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

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
async function signUp(kind) {
  const stamp = Date.now().toString(36);
  const email = `fe-${kind}-${stamp}@shop.example`;
  const code = (await call("/api/onboarding/code", { method: "POST", body: { email }, as: "" })).data.dev_code;
  const verified = await call("/api/onboarding/verify", { method: "POST", body: { email, code }, as: "" });
  const made = await call("/api/onboarding/business", { method: "POST", as: "", body: { accepted_terms: (await call("/api/onboarding/terms/current", { as: "" })).data.current.map((t) => t.id), signup_token: verified.data.signup_token, owner_name: "Hamad", name: `Sweet ${stamp.slice(-4)}`, name_ar: "حلويات الدوحة", type: kind, area: "Al Sadd" } });
  if (made.status !== 200) throw new Error(`could not create a ${kind}: ${made.status} ${JSON.stringify(made.data)}`);
  cookie = made.cookie;
  const state = (await call("/api/onboarding/state")).data;
  return { slug: state.business.slug };
}
const item = (body) => call("/api/items", { method: "POST", body: { status: "live", price: 1500, ...body } });
const setFeature = (key, body) => call(`/api/features/${key}`, { method: "PUT", body });

// ── the page ────────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: WIDE ? 1280 : 375, height: WIDE ? 900 : 812, scheme: SCHEME });
const body = () => b.js("document.body.innerText");
const text = (selector) => b.js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
const count = (selector) => b.js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const press = (label, tag = "button", scope = "document", wait = 300) =>
  b.click(`[...${scope}.querySelectorAll(${JSON.stringify(tag)})].filter(${visible}).find(e => ${norm}(e).includes(${JSON.stringify(label)}) || (e.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}))`, wait);
async function shot(name) { await b.shot(`${OUT}/${LANG}-${SCHEME}${WIDE ? "-wide" : ""}-${name}.png`); log("shot", name); }
async function noSideScroll(what) {
  const wide = await b.js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth ? document.documentElement.scrollWidth : 0");
  check(!wide, `no sideways scrolling on ${what}${wide ? ` (${wide})` : ""}`);
}
async function axe(what) {
  if (!AXE) return;
  const found = await b.axe(AXE);
  if (found === null) return;
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-axe-${what}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: nothing on ${what} (${found.map((v) => v.id).join(", ") || "clean"})`);
}
const unwanted = /\b(coming soon|coming|beta|early access|not yet|under development|capabilit)\w*|قريباً|قريبا|نسخة تجريبية/i;
const pick = (en, ar) => (AR ? ar : en);

async function run() {
  await b.view(WIDE ? 1280 : 375, WIDE ? 900 : 812, !WIDE, SCHEME);
  const shop = await signUp("bakery");
  await b.go(`${BASE}/start`, 400);
  await b.js(`localStorage.setItem('alyr-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)}); localStorage.setItem('alyr-theme', ${JSON.stringify(SCHEME)})`);
  await b.send("Network.clearBrowserCookies");
  await b.send("Network.setCookie", { name: "alyr_session", value: cookie.split("=")[1], url: BASE });

  // Items the shop made: one plain with a code, one made to order, one with sizes.
  await item({ name: "Plain loaf", name_ar: "رغيف", sku: "LOAF-1", stock_rule: "always" });
  await item({ name: "Celebration cake", name_ar: "كيكة مناسبات", stock_rule: "always", price: 18000, schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], lead_days: 1 }] });
  const sized = await item({ name: "Cupcake", name_ar: "كب كيك", stock_rule: "always", variants: [{ name: "Small", name_ar: "صغير" }, { name: "Large", name_ar: "كبير", price_delta: 200 }] });
  check(sized.status === 200, "an item with sizes is accepted while the feature is on");

  // ── the Features screen ──
  await b.go(`${BASE}/app/catalog`, 2500);
  await press(f.open);
  await b.until("!!document.querySelector('.ct-feats')", "the features", 15000);
  let page = await body();
  check(page.includes(f.title) && page.includes(f.intro.slice(0, 40)), "the screen has its title and says what off means");
  check(!unwanted.test(page), "nothing says coming, beta or capability");
  const groups = await text(".ct-feats h3");
  check(groups.length === 6, `six groups of features (${groups.length}: ${groups.join(" | ")})`);
  const switches = await count(".ct-feat [role=switch]");
  check(switches === 20, `twenty switches, one for each feature that has one (${switches})`);
  check(await count(".ct-feat input[type=radio]") === 2, "the sold-out look is a choice of two");
  check((await count(".ct-feat-changes")) === 21, "every feature says what it changes");
  check((await count(".ct-feat-places li")) > 30, "and where");
  await noSideScroll("Features");
  await shot("features");
  await axe("features");

  // search
  await b.click("document.querySelector('.ct-sheet .ct-search input')", 200);
  await b.type(pick("size", "مقاس"));
  await b.sleep(500);
  const found = await text(".ct-feat b");
  check(found.length >= 1 && found.length < 8, `the search narrows the list (${found.join(" | ")})`);
  await shot("features-search");
  await b.clearFocused();
  await b.type(pick("zzzz", "ززززز"));
  await b.sleep(400);
  check((await body()).includes(f.noMatch(pick("zzzz", "ززززز"))), "a search with no match says so");
  await b.clearFocused();
  await b.sleep(300);

  // a switch is saved at once, with a message
  await b.click(`[...document.querySelectorAll('.ct-feat')].find(e => e.querySelector('b').textContent === ${JSON.stringify(pick("Tags and allergens", "الوسوم والمسببات"))}).querySelector('[role=switch]')`, 700);
  check((await body()).includes(f.turnedOff(pick("Tags and allergens", "الوسوم والمسببات"))), "switching tags off says so");
  const tagsNow = (await call("/api/features")).data.groups.flatMap((g) => g.features).find((x) => x.key === "tags");
  check(tagsNow.enabled === false && tagsNow.set_by === "owner", "and it is saved as the owner's choice");
  await shot("features-off");
  // the one that needs another moves with it
  await b.click(`[...document.querySelectorAll('.ct-feat')].find(e => e.querySelector('b').textContent === ${JSON.stringify(pick("Times it can be ordered", "أوقات الطلب"))}).querySelector('[role=switch]')`, 700);
  check((await body()).includes(f.alsoOff(pick("Pickup or delivery day", "يوم الاستلام أو التوصيل"))), "switching the times off also switches the pickup day off, and says so");
  await setFeature("schedule", { enabled: true });
  await setFeature("pickup_date", { enabled: true });
  await setFeature("tags", { enabled: true });

  // the name and the layout
  await b.go(`${BASE}/app/catalog`, 2000);
  await press(f.open);
  await b.until("!!document.querySelector('.ct-feats')", "the features", 15000);
  await press(f.shapeTitle, "summary");
  await b.click("document.querySelectorAll('.ct-sheet .ct-fold-body input')[0]", 100);
  await b.type("Sweet counter");
  await b.click("document.querySelectorAll('.ct-sheet .ct-fold-body input')[1]", 100);
  await b.type("منضدة الحلويات");
  await press(f.layouts.table[0], "button", "document", 200);
  await shot("features-shape");
  await press(f.save, "button", "document", 800);
  const shape = (await call("/api/items/setup")).data;
  check(shape.section.name === "Sweet counter" && shape.section.name_ar === "منضدة الحلويات" && shape.layout.style === "table", "the name and the layout are saved");
  await press(f.close, "button", "document", 600);
  await b.until(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(pick("Sweet counter", "منضدة الحلويات"))})`, "the new name as the screen's title", 8000);
  check(true, "the screen's title takes the shop's own name");
  const nav = await b.js("[...document.querySelectorAll('.sh-side a, .sh-tabbar a')].map(a => a.textContent.trim()).join(' | ')");
  check(nav.includes(pick("Sweet counter", "منضدة الحلويات")), `the navigation takes it too (${nav})`);
  await shot("renamed");
  await call("/api/items/setup", { method: "PUT", body: { section_name: "", section_name_ar: "", layout_style: "" } });

  // ── the item form follows the features ──
  const parts = async () => text(".ct-fold-title");
  await b.go(`${BASE}/app/catalog`, 2000);
  await b.click("document.querySelector('.ct-card .ct-open')", 900);
  await b.until("!!document.querySelector('.ct-fold')", "the item form", 10000);
  let have = await parts();
  check(have.includes(t.variantsTitle) && have.includes(t.tagsTitle) && have.includes(t.optionsTitle), `the form has every part while the features are on (${have.join(" | ")})`);
  await call("/api/features/variants", { method: "PUT", body: { enabled: false } });
  await call("/api/features/options", { method: "PUT", body: { enabled: false } });
  await call("/api/features/tags", { method: "PUT", body: { enabled: false } });
  await b.go(`${BASE}/app/catalog`, 2000);
  await b.click("document.querySelector('.ct-card .ct-open')", 900);
  await b.until("!!document.querySelector('.ct-fold')", "the item form", 10000);
  have = await parts();
  check(!have.includes(t.optionsTitle) && !have.includes(t.tagsTitle), `with options and tags off, an item without them has no such part (${have.join(" | ")})`);
  await shot("item-form-off");
  await b.go(`${BASE}/app/catalog`, 2000);
  const cupcake = `[...document.querySelectorAll('.ct-card')].find(c => c.innerText.includes(${JSON.stringify(pick("Cupcake", "كب كيك"))})).querySelector('.ct-open')`;
  await b.click(cupcake, 900);
  await b.until("!!document.querySelector('.ct-fold')", "the cupcake's form", 10000);
  have = await parts();
  check(have.includes(t.variantsTitle), `an item that has sizes still shows them with the feature off (${have.join(" | ")})`);
  await shot("item-form-keeps-sizes");
  await call("/api/features/variants", { method: "PUT", body: { enabled: true } });
  await call("/api/features/options", { method: "PUT", body: { enabled: true } });
  await call("/api/features/tags", { method: "PUT", body: { enabled: true } });

  // ── the customer's order page reads the four extras ──
  const sent = await call("/api/onboarding/test-chat", { method: "POST", body: { text: "menu" } });
  const message = sent.data.messages?.map((m) => m.body).filter((x) => x.includes("?t=")).at(-1);
  if (!message) throw new Error(`no order link came back: ${JSON.stringify(sent.data).slice(0, 200)}`);
  const link = message.match(/https?:\/\/\S+/)[0].replace(/^https?:\/\/[^/]+/, BASE);
  const customerToken = link.split("?t=")[1];
  const open = async (wait = 1800) => {
    await b.go(link, wait);
    await b.until("!!document.querySelector('.ox-list, [role=row].ox-wrow, .ox-none, .cx-warn')", "the order page", 25000);
    if (AR) {
      await b.click("[...document.querySelectorAll('button')].filter(" + visible + ").find(e => e.textContent.trim() === 'العربية')", 700);
      await b.until("document.documentElement.dir === 'rtl' || document.body.innerText.includes('English')", "Arabic", 8000);
    }
  };
  const laf = pick("Plain loaf", "رغيف");
  const cake = pick("Celebration cake", "كيكة مناسبات");
  const cardFor = (name) => `[...document.querySelectorAll('li.ox-card')].find(c => c.innerText.includes(${JSON.stringify(name)}))`;

  // quick quantity
  await open();
  check(await b.js(`!!(${cardFor(laf)}).querySelector('.ox-add')`), "quick quantity on: the row has its plus");
  await shot("page-on");
  await axe("order-page");
  await call("/api/features/quick_quantity", { method: "PUT", body: { enabled: false } });
  await open();
  check(await b.js(`!(${cardFor(laf)}).querySelector('.ox-add') && !!(${cardFor(laf)}).querySelector('.ox-choose')`), "quick quantity off: the row opens the item instead");
  await shot("page-no-quick");
  await call("/api/features/quick_quantity", { method: "PUT", body: { enabled: true } });

  // the item code
  await open();
  await b.click(`(${cardFor(laf)}).querySelector('.ox-open')`, 900);
  await b.until("!!document.querySelector('.ox-dialog')", "the item sheet", 8000);
  check((await body()).includes("LOAF-1"), "show the item code on: the sheet shows it");
  await press(t.close, "button", "document", 300).catch(() => undefined);
  await call("/api/features/show_sku", { method: "PUT", body: { enabled: false } });
  await open();
  await b.click(`(${cardFor(laf)}).querySelector('.ox-open')`, 900);
  await b.until("!!document.querySelector('.ox-dialog')", "the item sheet", 8000);
  check(!(await body()).includes("LOAF-1"), "show the item code off: the sheet does not");
  await call("/api/features/show_sku", { method: "PUT", body: { enabled: true } });

  // the pickup day, in the review
  // (the order is kept for the tab, so a second visit finds the cake already in it)
  const review = async () => {
    await open();
    if (!(await count(".cx-bar button"))) await b.click(`(${cardFor(cake)}).querySelector('.ox-add, .ox-choose')`, 700);
    await b.until("!!document.querySelector('.cx-bar button')", "the order bar", 8000);
    await b.click("document.querySelector('.cx-bar button')", 1500);
    await b.until("!!document.querySelector('.ox-dialog')", "the review", 8000);
  };
  await review();
  check(await count(".ox-day") > 0, "the pickup day on: the review asks for the day");
  await shot("review-day");
  await call("/api/features/pickup_date", { method: "PUT", body: { enabled: false } });
  await review();
  check(await count(".ox-day") === 0 && (await body()).includes(pick("Earliest day:", "أقرب يوم:")), "the pickup day off: nobody is asked, and the review says the earliest day");
  await shot("review-no-day");
  await call("/api/features/pickup_date", { method: "PUT", body: { enabled: true } });

  // same as last time
  const placed = await call(`/api/store/${shop.slug}/orders`, { method: "POST", as: "", body: { token: customerToken, items: [{ product_id: (await call("/api/items?limit=50")).data.items.find((i) => i.name === "Plain loaf").id, quantity: 1 }], payment: "link" } });
  check(placed.status === 200, `an order is placed for the test customer (${placed.status})`);
  await b.js("sessionStorage.clear()");
  await open();
  check((await text(".ox-again")).length === 1, "same as last time on: the card is on the page");
  await call("/api/features/same_as_last", { method: "PUT", body: { enabled: false } });
  await open();
  check((await text(".ox-again")).length === 0, "same as last time off: the card is gone");
  await call("/api/features/same_as_last", { method: "PUT", body: { enabled: true } });

  // Order on WhatsApp (ALY-136): a visitor with no link of their own, at a shop that has typed
  // its number, is offered the button; switching the feature off takes it away.
  const current = (await call("/api/items/settings")).data;
  await call("/api/items/settings", { method: "PUT", body: { ...current, whatsapp_number: "97455550100" } });
  const waLinks = () => count("a[href^='https://wa.me/97455550100']");
  const visitor = async () => { await b.go(`${BASE}/s/${shop.slug}`, 1800); await b.until("!!document.querySelector('.ox-list, [role=row].ox-wrow, .ox-none, .cx-warn, .cx-bar, .ox-notice')", "the page without a link", 25000); };
  await visitor();
  check((await waLinks()) > 0, "order on WhatsApp on: a visitor with no link is offered the button");
  await shot("page-visitor-wa");
  await call("/api/features/order_on_whatsapp", { method: "PUT", body: { enabled: false } });
  await visitor();
  check((await waLinks()) === 0, "order on WhatsApp off: no button, no number on the page");
  await shot("page-visitor-no-wa");
  await call("/api/features/order_on_whatsapp", { method: "PUT", body: { enabled: true } });
  await visitor();
  check((await waLinks()) > 0, "and back on, the button is back");

  check(b.problems.length === 0, `no errors in the browser console (${b.problems.slice(0, 3).join(" ; ")})`);
}

try {
  await run();
} catch (error) {
  failures.push(`the run stopped: ${error.message}`);
  log("FAIL", error.stack ?? error.message);
  try { await b.shot(`${OUT}/${LANG}-${SCHEME}-stopped.png`); } catch { /* nothing to show */ }
} finally {
  await b.close();
}
console.log(failures.length ? `\n${failures.length} failed:\n- ${failures.join("\n- ")}` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
