// Runs the order path of onboarding (ALY-164, D-063, spec 027) in a real browser at phone width:
// the "What you sell" step and the "Pickup, delivery and payment" step, in English or Arabic,
// light and dark, then at 320 px. No packages: scripts/browser-kit.mjs drives headless Edge
// over the DevTools protocol with Node 22's own WebSocket and fetch. Node 22.18 or newer (it
// reads the screens' words straight from start/copy.ts).
//
//   node scripts/order-onboarding-browser-check.mjs --lang en --base http://localhost:3147 \
//        --out C:/t/oo/shots --profile C:/t/oo/p-en --port 9391 \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API and web app on a scratch database (docs/status.md, "Live testing from the
// laptop"; never the shared one), with ALYR_SIGNUP_OPEN=true, and with the order path switched
// on: `presets.BUILT_WAYS` listing "orders" (it does not until the test order is built) and the
// back office's switch for the bakery set to self-serve. For each pass it signs up a new bakery
// through the real onboarding API (the dev API hands back the email code), puts the session in
// the browser, and:
//   * products: the starter list is there with its samples marked, every field has a label, a
//     target is at least 44 px, nothing scrolls sideways; with every sample unticked Continue is
//     off and the screen says why; an own item with no Arabic name is refused in words, then
//     added with one; one sample dropped and one price changed; Continue keeps the rest as
//     live items (the API says so);
//   * handover: delivery on with a fee, one more way to pay; Continue saves it (the API says
//     so) and the go-live checks for content and payments turn green;
//   * the test order (ALY-168): on the private test line the owner says "menu", the chat gives
//     their own order link, the link opens the real order page, an order is placed with it, the
//     screen says it works and offers "Mark it ready", the customer's message shows in the chat,
//     finishing cancels the order, and the workspace's Orders list shows it marked Test without
//     a way to mark it paid. The scratch API must have ALYR_PUBLIC_WEB_URL set to --base, so the
//     link in the chat opens this web app.
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";
import { COPY as START } from "../apps/web/app/(product)/start/copy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3147";
const LANG = args.lang === "ar" ? "ar" : "en";
const OUT = args.out ?? `${tmpdir()}/oo-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/oo-profile-${LANG}`;
const PORT = Number(args.port ?? (LANG === "ar" ? 9392 : 9391));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const s = START[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 375, height: 812, scheme: "light" });

async function post(path, body, cookie = "") {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: response.headers.getSetCookie?.().map((c) => c.split(";")[0]).find((c) => c.startsWith("alyr_session=")) ?? "" };
}
const apiAs = async (cookie, path, method = "GET", body, headers = {}) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...headers, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json().catch(() => ({})) };
};
async function signUp(tag) {
  const stamp = Date.now().toString(36);
  const email = `owner-${tag}-${stamp}@shop.example`;
  const code = (await post("/api/onboarding/code", { email })).data.dev_code;
  const verified = await post("/api/onboarding/verify", { email, code });
  const accepted_terms = (await (await fetch(`${BASE}/api/onboarding/terms/current`)).json()).current.map((t) => t.id);
  const made = await post("/api/onboarding/business", {
    accepted_terms,
    signup_token: verified.data.signup_token, owner_name: "Hamad", name: `Bakery ${stamp.slice(-4)}`, name_ar: "مخبز الدوحة", type: "bakery", area: "Al Sadd",
  });
  if (made.status !== 200) throw new Error(`could not create a bakery: ${made.status} ${JSON.stringify(made.data)}`);
  await b.send("Network.clearBrowserCookies");
  await b.send("Network.setCookie", { name: "alyr_session", value: made.cookie.split("=")[1], url: BASE });
  return made.cookie;
}

const visible = "(e => e.getClientRects().length > 0)";
const norm = "(e => e.textContent.replace(/\\s+/g, ' ').trim())";
const mainButton = "[...document.querySelectorAll('.ob-btn.primary')].filter(" + visible + ")[0]";
const title = () => b.js("document.querySelector('.ob-main h1')?.innerText ?? ''");
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${b.scheme}-${name}.png`); log("shot", name); };

async function layout(name) {
  const wide = await b.js(`(() => { const out = []; const w = innerWidth; if (Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > w) out.push('page ' + document.documentElement.scrollWidth + '>' + w); for (const sel of ['.ob-main', '.ob-items', '.ob-handover']) for (const el of document.querySelectorAll(sel)) if (el.scrollWidth > el.clientWidth + 1) out.push(sel + ' ' + el.scrollWidth + '>' + el.clientWidth); return out.join(', '); })()`);
  check(wide === "", `${name}: nothing scrolls sideways at ${await b.js("innerWidth")} px${wide ? " (" + wide + ")" : ""}`);
  if (wide) {
    const past = await b.js(`[...document.querySelectorAll('.ob-main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 6).map(e => { const r = e.getBoundingClientRect(); return e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 30) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' "' + e.textContent.trim().slice(0, 24) + '"'; }).join(' | ')`);
    log("   past the edge:", past);
  }
}
async function targetsAndLabels(name) {
  const small = await b.js(`(() => { const out = []; const sel = '.ob-main button, .ob-main input:not([type=checkbox]), .ob-main label.ob-keep, .ob-main .ob-btn, .ob-main a:not(p a), .ob-actions button, .ob-actions a'; for (const el of new Set(document.querySelectorAll(sel))) { if (!(${visible})(el)) continue; const r = el.getBoundingClientRect(); if (r.height < 43.5 || r.width < 43.5) out.push((el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } return out.join(', '); })()`);
  check(small === "", `${name}: every button, field and link is at least 44 px${small ? " (" + small + ")" : ""}`);
  const unlabelled = await b.js(`(() => [...document.querySelectorAll('.ob-main input')].filter(${visible}).filter(i => !(i.labels && i.labels.length) && !i.getAttribute('aria-label')).map(i => i.outerHTML.slice(0, 80)).join(' | '))()`);
  check(unlabelled === "", `${name}: every field has a name${unlabelled ? " (" + unlabelled + ")" : ""}`);
  const cut = await b.js(`(() => [...document.querySelectorAll('.ob-main *')].filter(e => { const c = getComputedStyle(e); return (c.textOverflow === 'ellipsis' || c.overflow === 'hidden') && e.scrollWidth > e.clientWidth + 1 && e.textContent.trim(); }).map(e => e.className || e.tagName).slice(0, 4).join(', '))()`);
  check(cut === "", `${name}: no text is cut off${cut ? " (" + cut + ")" : ""}`);
}
async function axe(name) {
  if (!AXE) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  const found = await b.axe(AXE);
  check(found !== null && found.filter((v) => v.impact !== "minor").length === 0, `${name}: axe finds no violations (${found?.length ?? "?"} found)`);
  for (const v of found ?? []) for (const n of v.nodes.slice(0, 4)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
const typeInto = async (find, text) => { await b.click(find); await b.clearFocused(); await b.type(text); await b.sleep(120); };
const rowsNow = (cookie) => apiAs(cookie, "/api/items?limit=200").then((r) => r.data.items ?? []);

async function tryPass(scheme, tag) {
  await b.view(375, 812, true, scheme);
  log(`── the test order, ${scheme}`);
  const cookie = await signUp(`${tag}-${scheme}`);
  const mine = (path, method, body) => apiAs(cookie, path, method, body);
  // What the first two steps leave behind: an item on sale and a way to pay.
  const item = await mine("/api/items", "POST", { name: "Date cake", name_ar: "كيكة التمر", price: 4000, status: "live" });
  check(item.status < 300, `an own item is on sale (${item.status})`);
  await mine("/api/onboarding/steps/payments", "PATCH", { choice: "cash_transfer" });
  await mine("/api/onboarding/state", "PATCH", { step: "try" });
  await b.go(`${BASE}/start`, 2500);
  await b.until(`document.querySelector('.ob-main h1')?.innerText === ${JSON.stringify(s.tryOrder.title)}`, "the try step", 60000);
  check((await b.js("document.querySelector('.ob-main .ob-sub')?.innerText ?? ''")) === s.tryOrder.sub, "try: it says what to do on the private test line");
  check((await b.js("document.querySelector('.ob-main [role=status]')?.innerText ?? ''")).includes(s.tryOrder.waiting), `try: it waits (“${s.tryOrder.waiting}”)`);
  check(await b.js("[...document.querySelectorAll('.ob-btn.primary')].filter(e => e.getClientRects().length)[0].disabled"), "try: Continue is off until an order has come in");
  check(!/coming|soon|beta|قريب/i.test(await b.js("document.querySelector('.ob-main').innerText")), "try: nothing says something is coming");
  await layout("try"); await targetsAndLabels("try"); await shot("try");
  await axe(`try (${scheme})`);
  await b.view(320, 640, true, scheme);
  await b.sleep(300);
  await layout("try at 320"); await targetsAndLabels("try at 320"); await shot("try-320");
  await b.view(375, 812, true, scheme);
  await b.sleep(300);

  // "menu" on the test line: the chat answers with the owner's own link
  const chip = (word) => `[...document.querySelectorAll('.ob-suggest .ob-chip')].find(e => ${norm}(e) === ${JSON.stringify(word)})`;
  await b.click(chip(s.tryOrder.suggestions[1]), 400);
  const linkPattern = "/https?:\\/\\/\\S+\\/s\\/\\S+\\?t=\\S+/";
  await b.until(`${linkPattern}.test(document.querySelector('.ob-inline-chat')?.innerText ?? '')`, "the order link in the chat", 40000);
  const link = await b.js(`(document.querySelector('.ob-inline-chat').innerText.match(${linkPattern}) || [''])[0]`);
  check(link !== "", "try: “menu” gets the owner's own order link in the chat");
  const url = new URL(link);
  const slug = url.pathname.split("/")[2];
  const token = url.searchParams.get("t");
  check(!/[?&]c=/.test(link), "try: the link carries a signed token, never a contact ID");
  await shot("try-chat");

  // the link opens the real order page, as that customer
  await b.go(link, 2500);
  await b.until("document.querySelectorAll('.ox-card').length > 0", "the real order page", 60000);
  check(!/not valid|expired|منتهي|غير صالح/i.test(await b.js("document.body.innerText")), "try: the link opens the shop's real order page");
  const page = (await apiAs("", `/api/store/${slug}`, "GET", undefined, { "x-order-link": token })).data;
  const cake = (page.products ?? []).find((p) => p.name === "Date cake");
  check(!!cake, "try: the order page lists the owner's item");
  const place = (extra = {}) => post(`/api/store/${slug}/orders`, { token, items: [{ product_id: cake.id, quantity: 2 }], payment: "link", ...extra });
  let placed = await place();
  if (placed.status !== 200) placed = await place({ for_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) });
  check(placed.status === 200, `try: the order is placed with that link (${placed.status} ${JSON.stringify(placed.data).slice(0, 120)})`);

  // back in /start: it works, and the owner marks it ready
  await b.go(`${BASE}/start`, 2500);
  await b.until("!!document.querySelector('.ob-success')", "the success line", 60000);
  const order = (await mine("/api/orders")).data.orders.find((o) => o.test);
  check(!!order && order.status === "new" && order.payment === "unpaid", "try: the order is in the list, marked test, unpaid (no money moves)");
  const amount = order.total % 100 === 0 ? String(order.total / 100) : (order.total / 100).toFixed(2);
  const money = LANG === "ar" ? `${amount} ر.ق` : `QAR ${amount}`;
  check((await b.js("document.querySelector('.ob-success b').innerText")) === s.tryOrder.worked(order.number, money), `try: it says “${s.tryOrder.worked(order.number, money)}”`);
  check(await b.js("![...document.querySelectorAll('.ob-btn.primary')].filter(e => e.getClientRects().length)[0].disabled"), "try: Continue is on");
  await layout("try, ordered"); await targetsAndLabels("try, ordered"); await shot("try-ordered");
  await axe(`try, ordered (${scheme})`);
  await b.click(`[...document.querySelectorAll('.ob-main button')].find(e => ${norm}(e) === ${JSON.stringify(s.tryOrder.ready)})`, 500);
  await b.until(`(document.querySelector('.ob-main')?.innerText ?? '').includes(${JSON.stringify(s.tryOrder.readyDone)})`, "marked ready", 30000);
  check((await mine("/api/orders")).data.orders.find((o) => o.test).status === "ready", "try: Mark it ready moved the order to ready");
  const ready = LANG === "ar" ? `الطلب رقم ${order.number} جاهز` : `Order #${order.number} is ready`;
  await b.until(`(document.querySelector('.ob-inline-chat')?.innerText ?? '').includes(${JSON.stringify(ready)})`, "the customer's message in the chat", 30000);
  check(true, `try: the customer's message “${ready}” is in the test chat`);
  const checks = Object.fromEntries(((await mine("/api/onboarding/readiness")).data.checks ?? []).map((c) => [c.key, c.status]));
  check(checks.test === "done", `the go-live list shows the test order done (${checks.test})`);
  const agent = (await mine("/api/agent?lang=en")).data;
  check(!JSON.stringify(agent).includes(`#${order.number}`), "try: the owner's Agent view says nothing about the test order");

  // finishing: cancelled, and the workspace marks it Test and offers no way to mark it paid
  const finished = await mine("/api/onboarding/finish", "POST");
  check(finished.status === 200 && finished.data.test_orders_cancelled === 1, `finishing cancels the test order (${JSON.stringify(finished.data)})`);
  await b.go(`${BASE}/app/orders`, 2500);
  await b.until("document.querySelectorAll('.norow').length > 0", "the Orders list", 60000);
  const testWord = LANG === "ar" ? "طلب تجريبي" : "Test order";
  check(await b.js(`[...document.querySelectorAll('.norow .pill')].some(e => e.innerText.trim() === ${JSON.stringify(testWord)})`), `orders: the test order is marked “${testWord}”`);
  check(await b.js("![...document.querySelectorAll('.norow button')].some(e => /mark.*paid|تسجيل.*دفع|دفع/i.test(e.innerText))"), "orders: no way to mark the test order paid");
  await layout("orders list"); await shot("orders-test");
}

async function pass(scheme, tag) {
  await b.view(375, 812, true, scheme);
  log(`── ${scheme}`);
  const cookie = await signUp(`${tag}-${scheme}`);
  const state = (await apiAs(cookie, "/api/onboarding/state")).data;
  check(state.way === "orders" && state.step === "products", `a new bakery starts on the order path, at "What you sell" (${state.way}/${state.step})`);
  const samples = state.catalog?.samples ?? 0;

  // ── products ─────────────────────────────────────────────────────────────────────────
  await b.go(`${BASE}/start`, 2500);
  await b.until(`document.querySelectorAll('.ob-item').length >= ${samples} && ${samples} > 0`, "the starter list", 60000);
  check((await title()) === s.products.title, `products: the title is “${s.products.title}”`);
  check(await b.js(`document.querySelector('.ob')?.getAttribute('dir') === '${LANG === "ar" ? "rtl" : "ltr"}' || document.documentElement.dir === '${LANG === "ar" ? "rtl" : "ltr"}' || !!document.querySelector('[dir=${LANG === "ar" ? "rtl" : "ltr"}]')`), `products: the screen reads ${LANG === "ar" ? "right to left" : "left to right"}`);
  const rows = await b.js("document.querySelectorAll('.ob-item').length");
  check(rows === samples, `products: the ${samples} starter items are listed (${rows})`);
  check((await b.js("document.querySelectorAll('.ob-item .ob-item-name small').length")) === samples, `products: each says it is an example`);
  if (LANG === "ar") check(await b.js("/[\\u0600-\\u06FF]/.test(document.querySelector('.ob-item .ob-item-name').innerText)"), "products: the names are Arabic");
  check(!/coming|soon|beta|قريب/i.test(await b.js("document.querySelector('.ob-main').innerText")), "products: nothing says something is coming");
  await layout("products"); await targetsAndLabels("products"); await shot("products");
  await axe(`products (${scheme})`);

  // every sample unticked: Continue is off and the screen says why
  for (let i = 0; i < samples; i++) await b.click(`document.querySelectorAll('.ob-item .ob-keep')[${i}]`, 120);
  check(await b.js(`${mainButton}.disabled`), "products: with nothing on sale Continue is off");
  check((await b.js("document.querySelector('.ob-main [role=status]')?.innerText ?? ''")).includes(s.products.needOne), `products: it says “${s.products.needOne}”`);
  await shot("products-none");
  for (let i = 0; i < samples; i++) await b.click(`document.querySelectorAll('.ob-item .ob-keep')[${i}]`, 120);
  check(await b.js(`!${mainButton}.disabled`), "products: ticking them again turns Continue back on");

  // an own item with no Arabic name is refused in words
  const form = (n) => `document.querySelectorAll('.ob-own-form input')[${n}]`;
  await typeInto(form(0), "Date cake");
  await typeInto(form(2), "40");
  await b.click("document.querySelector('.ob-own-form button[type=submit]')", 900);
  const refused = await b.js("document.querySelector('.ob-main [role=alert]')?.innerText ?? ''");
  const named = (await rowsNow(cookie)).filter((i) => i.name === "Date cake");
  if (named.length === 0) check(refused.includes(s.products.arabicNeeded), `products: an own item with no Arabic name is refused in words (“${refused.slice(0, 60)}”)`);
  else log("note", "the API took an own item with no Arabic name; the screen's refusal text is not shown");
  await typeInto(form(1), "كيكة التمر");
  await b.click("document.querySelector('.ob-own-form button[type=submit]')", 1200);
  const own = (await rowsNow(cookie)).find((i) => i.name === "Date cake");
  check(own && own.status === "live" && own.price === 4000 && own.name_ar === "كيكة التمر", `products: the added item is on sale at QAR 40 with its Arabic name (${own ? own.status + "/" + own.price : "missing"})`);
  check(await b.js("document.querySelectorAll('.ob-item').length") === samples + 1, "products: it appears in the list");
  check(await b.js("document.querySelector('.ob-own-form input').value === ''"), "products: the form is empty again for the next one");

  // drop the last sample, change the first sample's price, continue
  await b.click(`document.querySelectorAll('.ob-item .ob-keep')[${samples - 1}]`, 150);
  const firstPrice = "([...document.querySelectorAll('.ob-item')].find(r => r.querySelector('.ob-keep')).querySelector('input[inputmode=decimal]'))";
  await typeInto(firstPrice, LANG === "ar" ? "١٢٫٥" : "12.5");
  await shot("products-edited");
  await b.click(mainButton, 400);
  await b.until(`document.querySelector('.ob-main h1')?.innerText === ${JSON.stringify(s.handover.title)}`, "the handover step", 40000);
  const after = await rowsNow(cookie);
  check(after.length === samples, `products: the dropped sample is gone and the rest stay (${after.length} of ${samples})`);
  check(after.every((i) => i.sample === false && i.status === "live"), "products: every kept item is the shop's own and on sale");
  check(after.some((i) => i.price === 1250 && i.name !== "Date cake"), "products: the price typed on a kept sample (12.5) was saved as 1250 dirhams");
  check(after.find((i) => i.name === "Date cake")?.price === 4000, "products: the item added before it kept its own price");
  const moved = (await apiAs(cookie, "/api/onboarding/state")).data;
  check(moved.step === "handover", `products: the owner is now on the next step (${moved.step})`);

  // ── handover ─────────────────────────────────────────────────────────────────────────
  check((await title()) === s.handover.title, `handover: the title is “${s.handover.title}”`);
  check(await b.js(`!document.querySelector('.ob-main input')`), "handover: delivery's fee fields are hidden until delivery is chosen");
  check(await b.js(`[...document.querySelectorAll('.ob-chip')].filter(${visible}).map(e => e.getAttribute('aria-pressed')).join() === 'true,false,true,true,false'`), "handover: pickup, cash and transfer start on");
  await layout("handover"); await targetsAndLabels("handover"); await shot("handover");
  await axe(`handover (${scheme})`);
  const chip = (word) => `[...document.querySelectorAll('.ob-chip')].find(e => ${norm}(e) === ${JSON.stringify(word)})`;
  await b.click(chip(s.handover.delivery), 300);
  await b.until("document.querySelectorAll('.ob-main input').length === 2", "the fee fields");
  await typeInto("document.querySelectorAll('.ob-main input')[0]", "10");
  await typeInto("document.querySelectorAll('.ob-main input')[1]", "100");
  await b.click(chip(s.handover.card), 200);
  await layout("handover with delivery"); await targetsAndLabels("handover with delivery");
  await shot("handover-delivery");
  // pickup off and delivery off: refused in words
  await b.click(chip(s.handover.pickup), 150);
  await b.click(chip(s.handover.delivery), 150);
  check((await b.js("document.querySelector('.ob-main [role=alert]')?.innerText ?? ''")).includes(s.handover.needGet) && await b.js(`${mainButton}.disabled`), `handover: with no way to get it Continue is off and it says “${s.handover.needGet}”`);
  await b.click(chip(s.handover.pickup), 150);
  await b.click(chip(s.handover.delivery), 250);
  await b.click(mainButton, 400);
  await b.until("location.pathname === '/start' && document.querySelector('.ob-main h1')?.innerText !== " + JSON.stringify(s.handover.title), "past the handover step", 40000);
  const shop = (await apiAs(cookie, "/api/delivery")).data;
  check(shop.delivery === true && shop.pickup === true && shop.flat_fee === 1000 && shop.flat_free_over === 10000, `handover: pickup and delivery are saved (fee ${shop.flat_fee}, free over ${shop.flat_free_over})`);
  const paid = (await apiAs(cookie, "/api/orders-payment-ways")).data;
  check(paid.online === false && [...paid.ways].sort().join() === "bank_transfer,card_terminal,cash", `handover: the three ways to pay are saved (${(paid.ways ?? []).join()})`);
  const checks = Object.fromEntries(((await apiAs(cookie, "/api/onboarding/readiness")).data.checks ?? []).map((c) => [c.key, c.status]));
  check(checks.content === "done" && checks.payments === "done", `the go-live list shows the items and the payment ways done (${checks.content}/${checks.payments})`);
  check(checks.test === "todo" && checks.whatsapp === "todo", "the steps still to come stay open (test, whatsapp)");

  // back, and the saved values are what the screen shows (resume)
  await apiAs(cookie, "/api/onboarding/state", "PATCH", { step: "handover" });
  await b.go(`${BASE}/start`, 2500);
  await b.until(`document.querySelector('.ob-main h1')?.innerText === ${JSON.stringify(s.handover.title)}`, "the handover step again", 40000);
  await b.until("document.querySelectorAll('.ob-main input').length === 2", "delivery remembered");
  check(await b.js("[...document.querySelectorAll('.ob-main input')].map(i => i.value).join() === '10,100'"), "handover: coming back shows the fee and the free-over amount that were saved");
  check(await b.js(`[...document.querySelectorAll('.ob-chip')].filter(${visible}).map(e => e.getAttribute('aria-pressed')).join() === 'true,true,true,true,true'`), "handover: and the choices that were saved");
  return cookie;
}

try {
  await b.go(`${BASE}/start`, 1500);
  await b.js(`localStorage.setItem('alyr-lang', '${LANG}'); localStorage.setItem('alyr-workspace-lang', '${LANG}')`);
  await pass("light", "a");
  await pass("dark", "b");
  // 320 px: the narrowest phone, the same two steps (the saved shop from the pass above is on handover).
  await b.view(320, 640, true, "light");
  await b.go(`${BASE}/start`, 2500);
  await b.until("!!document.querySelector('.ob-main h1')", "the screen at 320 px", 40000);
  await layout("handover at 320"); await targetsAndLabels("handover at 320"); await shot("handover-320");
  const cookie = (await b.send("Network.getCookies", { urls: [BASE] })).cookies.find((c) => c.name === "alyr_session");
  await apiAs(`alyr_session=${cookie.value}`, "/api/onboarding/state", "PATCH", { step: "products" });
  await b.go(`${BASE}/start`, 2500);
  await b.until("document.querySelectorAll('.ob-item').length > 0", "products at 320 px", 40000);
  await layout("products at 320"); await targetsAndLabels("products at 320"); await shot("products-320");
  await tryPass("light", "c");
  await tryPass("dark", "d");
  check(b.problems.length === 0, `no console errors or exceptions${b.problems.length ? ": " + b.problems.slice(0, 5).join(" || ") : ""}`);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED", error.stack ?? error);
} finally {
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
log("all checks passed");
