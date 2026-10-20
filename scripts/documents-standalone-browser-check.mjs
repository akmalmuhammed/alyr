// Runs ALYR Invoices, the "Invoices only" way (ALY-141, spec 016), in a real browser at phone
// width, in English or Arabic, light or dark: a new owner signs up with the "Invoices only"
// way, fills in what goes on their invoices, makes the first invoice from one line of text,
// sends a test, gets to the workspace, and there writes a second invoice from one line, saves a
// line and a customer for next time, opens the payment link, reads the QR code on the real page
// back with an independent decoder, pays the link on the stand-in pay page, and makes an invoice by a
// WhatsApp message from the owner's own phone. Every step is timed (the whole sign-up to a sent
// first invoice, the first invoice alone, a second invoice from the workspace) and axe-core runs on
// every state. Headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages.
// Node 22.
//
//   node scripts/documents-standalone-browser-check.mjs --lang en --scheme light \
//        --base http://localhost:3161 --api http://127.0.0.1:8461 --out C:/t/sa/shots \
//        --profile C:/t/sa/p-en --port 9761 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on its own database (never the shared one) with ALYR_INVOICES_FOR_NEW_SHOPS
// on and a web app pointed at it. Everything is fictional; the WhatsApp channel is the simulator;
// nothing reaches Meta, a payment gateway or a person. The Edge it starts uses its own profile
// folder and a debugging port nobody else is on; keep both short.

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync as runProgram } from "node:child_process";
import { launch } from "./browser-kit.mjs";
import { COPY as START } from "../apps/web/app/(product)/start/copy.ts";
import { COPY as DOCS } from "../apps/web/app/(product)/_workspace/documentsCopy.ts";
import { STANDALONE } from "../apps/web/app/(product)/_workspace/standaloneCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3161";
const API = args.api ?? "http://127.0.0.1:8461";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const WIDTH = Number(args.width ?? 375);
const PHONE = WIDTH < 800;
const OUT = args.out ?? `${tmpdir()}/standalone-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/standalone-profile-${LANG}`;
const PORT = Number(args.port ?? 9761);
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const RUN = randomUUID().slice(0, 6);
const S = START[LANG];
const D = DOCS[LANG];
const X = STANDALONE[LANG];
mkdirSync(OUT, { recursive: true });
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const JSQR = readFileSync(require.resolve("jsqr"), "utf8");

const failures = [];
const timings = {};
const log = (...m) => console.log(`[${LANG} ${SCHEME} ${WIDTH}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: WIDTH, height: PHONE ? 812 : 900, scheme: SCHEME });
const { js, until, click } = b;
b.on("Page.javascriptDialogOpening", () => { b.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => undefined); });
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${SCHEME}-${WIDTH}-${name}.png`); log("shot", name); };
const text = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
const norm = (s) => JSON.stringify(s);
const count = (selector) => js(`document.querySelectorAll(${norm(selector)}).length`);

async function noSideScroll(name) {
  const wide = await js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('.sh-scroll')?.scrollWidth ?? 0) - innerWidth");
  check(wide <= 0, `no sideways scrolling on ${name}${wide > 0 ? ` (${wide}px too wide)` : ""}`);
}
async function axe(name, scope = null) {
  const found = await b.axe(AXE, scope, scope ? [] : [".sh-side", ".sh-top"]);
  if (found === null) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-${WIDTH}-axe-${name}.json`, JSON.stringify(found, null, 2));
  // The workspace shell's small grey label (.sh-eyebrow) is on the design system's faint ink and
  // fails contrast on main too: it is reported, not counted against this feature.
  const shell = (n) => String(n.target).includes("sh-eyebrow");
  const mine = found.map((v) => ({ ...v, nodes: v.nodes.filter((n) => !(v.id === "color-contrast" && shell(n))) })).filter((v) => v.nodes.length && v.impact !== "minor");
  check(mine.length === 0, `axe: no violations on ${name} (${mine.length} found, ${found.length - mine.length} known on the workspace shell)`);
  for (const v of mine) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
async function targets(name, scope = "body") {
  const small = await js(`[...document.querySelectorAll(${norm(scope)} + ' button, ' + ${norm(scope)} + ' a[href], ' + ${norm(scope)} + ' select, ' + ${norm(scope)} + ' input:not([type=hidden]):not(.ct-sr):not(.ct-file):not(.ob-file)')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.sh-side') && !e.closest('details:not([open]) > :not(summary)') && !e.closest('.ct-sr') && !e.closest('.ob-rail') && (r.height < 35.5 || r.width < 43.5) && !(e.tagName === 'A' && e.closest('p, li, span, small')) && e.type !== 'radio' && e.type !== 'checkbox' && e.getAttribute('role') !== 'switch'; }).map(e => (e.textContent || e.getAttribute('aria-label') || e.name || e.type || '').trim().slice(0, 28) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))`);
  if (PHONE) check(small.length === 0, `every control on ${name} is big enough to press${small.length ? ` (small: ${small.slice(0, 5).join("; ")})` : ""}`);
}
const run = async (name, fn) => {
  if (args.only && !name.includes(args.only)) return;
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name.replace(/\W+/g, "-")}-stopped`); } catch { /* the page is gone */ }
  }
};
async function fill(find, value) {
  await click(find, 120);
  await b.clearFocused();
  await b.type(value);
  await b.sleep(80);
}
// Finding things the way a person does: by the words on them.
const obField = (label) => `[...document.querySelectorAll('.ob-field')].find(f => f.querySelector('span, legend')?.textContent.trim().startsWith(${norm(label)}))?.querySelector('input, textarea')`;
const obBtn = (word) => `[...document.querySelectorAll('.ob-btn, .ob-link, .ob-chip, .ob-tile')].find(e => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\\s+/g, ' ').trim().includes(${norm(word)}))`;
const btn = (word, scope = "document") => `[...${scope}.querySelectorAll('button, a.btn')].find(e => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\\s+/g, ' ').trim().includes(${norm(word)}))`;
const field = (label, scope = "document") => `[...${scope}.querySelectorAll('.ct-field')].find(f => f.querySelector('label, .ct-label')?.textContent.trim().startsWith(${norm(label)}))?.querySelector('input, textarea, select')`;
const toast = () => js("[...document.querySelectorAll('.ct-toast-text')].map(e => e.textContent).join(' | ')");
const waitToast = (part) => until(`[...document.querySelectorAll('.ct-toast-text')].some(e => e.textContent.includes(${norm(part)}))`, `a message with "${part}"`);
const sheetOpen = () => until("!!document.querySelector('.ct-sheet')", "a sheet");
const sheetGone = () => until("!document.querySelector('.ct-sheet')", "the sheet to close");
const open = async (path, ready = ".dc") => { await b.go(`${BASE}${path}`, 500); await until(`!!document.querySelector(${norm(ready)})`, `the screen ${path}`, 30000); await b.sleep(250); };
const api = async (path, method = "GET", body, headers = {}) => {
  const response = await fetch(`${API}${path}`, { method, headers: body ? { "content-type": "application/json", ...headers } : headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  return { status: response.status, data: await response.json().catch(() => ({})) };
};

const email = `salem-${RUN}@demo-sa.example`;
let slug = "";
let firstInvoice = null;
let signUpStarted = 0;

try {
  await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" });
  // A new owner: no session left from an earlier run in this profile.
  await b.send("Network.clearBrowserCookies");
  await b.go(`${BASE}/start`, 300);
  await js(`localStorage.setItem('alyr-lang', '${LANG}'); localStorage.setItem('alyr-workspace-lang', '${LANG}')`);
  await b.view(WIDTH, PHONE ? 812 : 900, PHONE, SCHEME);

  // 1. Sign up with the "Invoices only" way.
  await run("sign up", async () => {
    signUpStarted = Date.now();
    await b.go(`${BASE}/start`, 600);
    await until("!!document.querySelector('.ob input[type=email]')", "the email field", 30000);
    await shot("01-account");
    await noSideScroll("the account step");
    await fill("document.querySelector('.ob input[type=email]')", email);
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('.ob-devcode')", "the code");
    const code = (await js("document.querySelector('.ob-devcode').textContent")).match(/\d{6}/)[0];
    await fill("document.querySelector('.ob input.ob-code')", code);
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('.ob-tile')", "the types");
    const tiles = await js("[...document.querySelectorAll('.ob-tile')].map(t => t.textContent.replace(/\\s+/g, ' ').trim())");
    check(tiles.some((t) => t.includes("Invoices only") || t.includes("فواتير فقط")), "'Invoices only' is offered once the product lead switches it on");
    const mine = tiles.find((t) => t.includes("Invoices only") || t.includes("فواتير فقط")) ?? "";
    check(mine.includes(S.type.invoicesNote), "its tile says in plain words what it is and what it is not");
    await shot("02-type");
    await axe("type");
    await targets("the type step");
    await click(`[...document.querySelectorAll('.ob-tile')].find(t => t.textContent.includes(${norm(AR ? "فواتير فقط" : "Invoices only")}))`);
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('#ob-form input[required]')", "the business form");
    check((await count(".ob-inline-preview")) === 0, "no WhatsApp preview for a business that does not use WhatsApp for customers");
    await fill(obField(S.basics.owner), "Salem Al Naimi");
    await fill(obField(S.basics.name), "Salem Maintenance");
    await fill(obField(S.basics.nameAr), "سالم للصيانة");
    await shot("03-basics");
    await noSideScroll("the business step");
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('.ob-paper-fold, .ob-fold')", "the details step", 30000);
    slug = await js("fetch('/api/onboarding/state').then(r => r.json()).then(s => s.business.slug)");
    check(Boolean(slug), "the business exists");
  });

  // 2. What goes on the invoices.
  await run("details", async () => {
    await until("!!document.querySelector('.ob-fold')", "the details");
    check((await text()).includes(S.details.title), "the step is 'what goes on your invoices'");
    await shot("04-details");
    await axe("details");
    await targets("the details step");
    await noSideScroll("the details step");
    await fill(obField(S.details.registration), "100245");
    await click("document.querySelector('.ob-fold > summary')");
    await fill(obField(S.details.address), "Salwa Road, Doha");
    await fill(obField(S.details.phone), "+974 5550 0141");
    await shot("05-details-filled");
    await b.js("document.querySelector('.ob-paper-fold')?.setAttribute('open', '')");
    await until("!!document.querySelector('.ob-paper-fold img.ob-paper')", "the sample paper", 30000);
    await b.sleep(900);
    await shot("06-details-sample");
    check(await js("document.querySelector('.ob-paper-fold img.ob-paper')?.naturalWidth > 100"), "a sample of the real paper is drawn from what is typed");
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('.ob-quick')", "the first invoice step", 30000);
  });

  // 3. The first invoice, from one line.
  await run("first invoice", async () => {
    const started = Date.now();
    check((await text()).includes(S.first.titleInvoice), "a shop with a registration number is asked for its first invoice");
    await shot("07-first");
    await axe("first");
    await targets("the first invoice step");
    await fill("document.querySelector('.ob-quick input')", AR ? "صيانة مكيف 500 لأحمد 55512345" : "AC repair 500 for Ahmed 5551 2345");
    await click(obBtn(S.first.quickFill));
    await until("document.querySelector('#ob-form input[inputmode=decimal]')?.value === '500'", "the boxes to fill");
    const boxes = await js("[...document.querySelectorAll('#ob-form input')].map(i => i.value)");
    check(boxes.includes(AR ? "صيانة مكيف" : "AC repair") && boxes.some((v) => v.includes("5551")) && boxes.includes("500"), "one line fills the four boxes");
    await shot("08-first-filled");
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('.ob-success')", "the invoice to be made", 30000);
    timings.firstInvoiceMs = Date.now() - started;
    firstInvoice = await js("fetch('/api/documents?limit=1').then(r => r.json()).then(d => d.documents[0])");
    check(firstInvoice?.number === "INV-0001" && firstInvoice.kind === "invoice", `the first invoice is INV-0001 (${firstInvoice?.number})`);
    await until("document.querySelector('img.ob-paper')?.complete && document.querySelector('img.ob-paper')?.naturalWidth > 100", "the paper");
    await shot("09-first-made");
    await axe("first-made");
    await targets("the made invoice");
    await noSideScroll("the made invoice");
    // The test to the owner's private test line.
    await click(obBtn(S.first.testButton));
    await until("[...document.querySelectorAll('.ob-test-chat .ob-bubble')].length >= 1", "the document to arrive on the test line", 30000);
    check((await text()).includes("INV-0001.pdf"), "the test line shows the PDF arriving, with its name");
    await b.sleep(300);
    await shot("10-first-test");
    await click(obBtn(S.first.copyLink));
    await until(`document.body.innerText.includes(${norm(S.first.copied)})`, "the link copied");
    const wa = await js("document.querySelector('a[href^=\"https://wa.me/\"]')?.href ?? ''");
    check(wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).includes("INV-0001") && decodeURIComponent(wa).includes("/d/"), "the owner can send it from their own WhatsApp: a wa.me link with the message written");
    timings.signUpToSentMs = Date.now() - signUpStarted;
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('.ob-price, .ob-preparing')", "the price step", 30000);
  });

  // 4. The price and going live.
  await run("plan and go live", async () => {
    await shot("11-plan");
    await axe("plan");
    const plan = await text();
    check(plan.includes(S.plan.includesInvoices[0]) || plan.includes(S.plan.preparing), "the price step is for invoices, not bookings");
    check(!plan.includes("Booking assistant") && !plan.includes("مساعد الحجوزات"), "no word of bookings anywhere in it");
    await click("document.querySelector('.ob-btn.primary')");
    await until("!!document.querySelector('.ob-checks')", "go live");
    await shot("12-golive");
    await axe("golive");
    await targets("go live");
    await noSideScroll("go live");
    const live = await text();
    check(live.includes(S.golive.detailsDone) && live.includes(S.golive.firstDone), "the checklist knows the details and the first invoice are done");
    check(live.includes(S.golive.sendTitle) && live.includes(S.golive.whatsappSubInvoices), "it says honestly what is needed to send from their own WhatsApp number");
    check(!/coming|soon|قريباً/i.test(live), "nothing says 'coming'");
    await click("document.querySelector('.ob-btn.primary')");
    await until("location.pathname.startsWith('/app')", "the workspace", 30000);
  });

  // 5. The workspace of an invoices-only shop.
  await run("the workspace", async () => {
    await open("/app", ".sh");
    await b.sleep(900);
    await shot("13-home");
    await axe("home");
    const nav = await js("[...document.querySelectorAll('.sh-tabbar a, .sh-side a')].map(a => a.textContent.trim())");
    check(nav.length > 0 && !nav.some((n) => /Orders|Inbox|Bookings|Catalog|الطلبات|الحجوزات/.test(n)), `only what the shop uses is in the navigation (${[...new Set(nav)].join(", ")})`);
    await open("/app/products", ".sh-products");
    await shot("14-products");
    const products = await text();
    check(products.includes("ALYR Invoices"), "ALYR Invoices is on the Products screen, in use");
    await axe("products");
  });

  // 6. A second invoice from the workspace, from a standing start.
  await run("second invoice", async () => {
    await open("/app/documents");
    await until("!!document.querySelector('.dc-row')", "the list");
    await shot("15-documents");
    await axe("documents");
    const parts = await text();
    check(parts.includes(X.parts.customers) && parts.includes(X.parts.lines), "Documents, Customers and Saved lines are one tap apart");
    const started = Date.now();
    await click(btn(D.newDocument));
    await until("!!document.querySelector('.sa-quick-text')", "the form");
    await fill("document.querySelector('.sa-quick-text')", AR ? "فلتر 120 لأحمد" : "Filter change 120 for Ahmed");
    await click(btn(X.quickFill));
    await until("!!document.querySelector('.dc-picked') && document.querySelector('.ct-bignum')?.value === '120'", "the form to fill");
    check((await text()).includes("Ahmed") || (await text()).includes("أحمد"), "the customer saved at sign-up is found by name");
    await shot("16-form-filled");
    await axe("form");
    await targets("the form");
    await noSideScroll("the form");
    await click(btn(D.issue));
    await sheetOpen();
    await shot("17-issue-sheet");
    await click(btn(D.issueButton));
    await until("!!document.querySelector('.dc-number')", "the issued document");
    timings.secondInvoiceMs = Date.now() - started;
    const number = await js("document.querySelector('.dc-number').textContent.trim()");
    check(number === "INV-0002", `the second invoice is INV-0002 (${number})`);
    await until("document.querySelectorAll('img.dc-sheet').length > 0 && [...document.querySelectorAll('img.dc-sheet')].every(i => i.complete && i.naturalWidth > 0)", "the paper");
    await shot("18-invoice");
    await axe("invoice");
    await noSideScroll("the invoice");
    const view = await text();
    check(view.toLowerCase().includes(X.payLinkTitle.toLowerCase()), "an invoice for a saved customer has a payment link (the stand-in pay page, on this machine)");
  });

  // 7. The QR code on the real page, read back.
  await run("the QR code", async () => {
    const id = await js("new URLSearchParams(location.search).get('d')");
    await b.js(JSQR);
    const link = await js(`fetch('/api/documents/${id}').then(r => r.json()).then(d => d.document.payment_link.url)`);
    const decoded = await js(`(async () => {
      const blob = await (await fetch('/api/documents/${id}/pdf?format=png&width=1500')).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
      return found ? found.data : null;
    })()`);
    check(decoded === link, `the QR code on the real page of the invoice reads back as the payment link (${decoded === link ? "same" : `${decoded} vs ${link}`})`);
  });

  // 8. Saved lines and customers.
  await run("saved lines and customers", async () => {
    await open("/app/documents?view=lines");
    await until("!!document.querySelector('.sa-list, .ct-empty')", "saved lines");
    await shot("19-lines");
    await axe("lines");
    await click(btn(X.linesAdd));
    await sheetOpen();
    await fill(field(X.linesName), "AC repair");
    await fill(field(X.linesNameAr), "صيانة مكيف");
    await fill(field(X.linesPrice), "500");
    await shot("20-line-form");
    await axe("line-form", ".ct-sheet");
    await click(btn(D.save, "document.querySelector('.ct-sheet')"));
    await sheetGone();
    await until("document.querySelectorAll('.sa-row').length >= 1", "the saved line");
    check((await text()).includes("500"), "a saved line is listed with its usual price");

    await open("/app/documents?view=customers");
    await until("!!document.querySelector('.sa-row')", "the customers");
    await shot("21-customers");
    await axe("customers");
    await targets("customers");
    check((await count(".sa-row")) >= 1, "the customer made at sign-up is in the list");
    await click(btn(X.customerAdd));
    await sheetOpen();
    await fill(field(X.customerName), "Doha Villas");
    await fill(field(X.customerPhone), "4400 1234");
    await shot("22-customer-form");
    await axe("customer-form", ".ct-sheet");
    await click(btn(D.save, "document.querySelector('.ct-sheet')"));
    await sheetGone();
    await until("document.querySelectorAll('.sa-row').length >= 2", "the new customer");
    await click(`document.querySelector('.sa-row')`);
    await until("!!document.querySelector('.sa-balance, .sa-facts')", "the customer page");
    await shot("23-customer");
    await axe("customer");
    check((await text()).includes(X.customerNewInvoice), "a customer's page starts an invoice for them");
    await click(btn(X.customerNewInvoice));
    await until("!!document.querySelector('.sa-quick-text') && !!document.querySelector('.dc-picked')", "the form for that customer");
    check(true, "the form opens with the customer chosen");
  });

  // 9. Make another like the first, and "the same as my last one".
  await run("duplicate and copy last", async () => {
    await open("/app/documents");
    await until("!!document.querySelector('.dc-row')", "the list");
    await click("document.querySelector('.dc-row')");
    await until("!!document.querySelector('.dc-number')", "a document");
    await click(btn(X.duplicate));
    await until("document.querySelector('.ct-bignum')?.value !== ''", "the copy");
    const price = await js("document.querySelector('.ct-bignum').value");
    check(price !== "", `"make another like this" fills the lines (${price})`);
    await shot("24-duplicate");
    await open("/app/documents?edit=new");
    await until("!!document.querySelector('.sa-quick-text')", "the form");
    await click(btn(X.copyLast));
    await until("document.querySelector('.ct-bignum')?.value !== ''", "the last one copied");
    check(true, "'the same as my last one' fills the form from the last invoice");
  });

  // 10. The customer pays the link on the stand-in pay page.
  await run("pay the link", async () => {
    const list = (await js("fetch('/api/documents?limit=10&kind=invoice').then(r => r.json())")).documents;
    const second = list.find((d) => d.number === "INV-0002");
    const detail = await js(`fetch('/api/documents/${second.id}').then(r => r.json()).then(d => d.document)`);
    const url = new URL(detail.payment_link.url);
    await b.go(`${BASE}${url.pathname}`, 800);
    await shot("25-pay-page");
    check((await text()).length > 20, "the stand-in pay page opens");
    const done = await js(`fetch(${norm(url.pathname.replace("/pay/", "/api/pay/") + "/complete")}, {method: 'POST'}).then(r => r.status)`);
    check(done === 200, `the stand-in gateway reports the payment (${done})`);
    await open(`/app/documents?d=${second.id}`, ".dc-number");
    await until(`document.body.innerText.includes(${norm(D.money.paid)})`, "the invoice to read paid", 30000);
    await shot("26-paid");
    await axe("paid");
    const body = await text();
    check(body.includes(D.methods.link) && body.includes(X.payLinkPaid), "the invoice shows it was paid through the link, and the link is closed");
  });

  // 11. By message from the owner's own phone (the simulator).
  await run("by message", async () => {
    const phone = "97455500155";
    const reg = await js(`fetch('/api/staff-numbers', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({name: 'Salem (owner)', phone: ${norm(phone)}, lang: ${norm(LANG)}})}).then(r => r.status)`);
    check(reg === 200, "the owner's phone is registered as a staff number");
    const say = async (text, reply_id = "") => (await api("/sim/messages", "POST", { from_number: phone, text, reply_id, shop: slug })).data.messages.filter((m) => m.direction === "out");
    const ask = (await say(AR ? "فاتورة أحمد 250 صيانة" : "invoice Ahmed 250 for AC check")).at(-1);
    if (!ask?.payload?.choices) log("   it answered", JSON.stringify(ask));
    check(ask?.payload?.choices?.length === 3, "ALYR says back what it understood with Yes, Edit and Cancel");
    const yes = ask.payload.choices[0].id;
    const done = (await say("", yes)).at(-1);
    check(/INV-0003/.test(done.body) && done.payload.choices.length === 1, "yes issues INV-0003 and offers Undo");
    await open("/app/documents");
    await until("!!document.querySelector('.dc-row')", "the list");
    check((await text()).includes("INV-0003"), "the invoice made by message is in the workspace's list");
    await shot("27-list-after-message");
    const undone = (await say("", done.payload.choices[0].id)).at(-1);
    check(/CN-0001/.test(undone.body), "Undo cancels it with a credit note");
    await open("/app/documents");
    await until("!!document.querySelector('.dc-row')", "the list");
    check((await text()).includes("CN-0001"), "the credit note is in the list too");
  });

  // 12. The back office can make the same shop whatever the switch says; the form lists the product.
  await run("back office", async () => {
    // The back office is for ALYR staff: this run's owner is made one, in the scratch database
    // named by --admin-db "<postgres container>/<database>" (never the shared one).
    if (!args["admin-db"]) { log("back office skipped: give --admin-db <postgres container>/<scratch database>"); return; }
    const [container, database] = args["admin-db"].split("/");
    runProgram("docker", ["exec", container, "psql", "-U", "alyr", "-d", database, "-c",
      `insert into platform_admins (email) values ('${email.toLowerCase()}') on conflict do nothing`]);
    await b.go(`${BASE}/ops/clients`, 800);
    await until("!!document.querySelector('.ops-check')", "the create form", 30000);
    const boxes = await js("[...document.querySelectorAll('.ops-check')].map(e => e.textContent.trim())");
    check(boxes.includes("ALYR Invoices"), `the back office can switch ALYR Invoices on for a new business (${boxes.join(", ")})`);
    await b.go(`${BASE}/ops/prices`, 800);
    await b.sleep(800);
    await shot("28-back-office-prices");
    const price = await js("fetch('/api/admin/pricing').then(r => r.json())");
    log("   price list keys", JSON.stringify({ items: price.items?.map((i) => i.key), types: price.types?.map((t) => t.key), products: price.products?.map((p) => p.key) }));
    check(JSON.stringify(price).includes("invoices"), "Invoices only is in the back office's list of types");
  });

  log("timings", JSON.stringify(timings));
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-${WIDTH}-timings.json`, JSON.stringify(timings, null, 2));
} finally {
  const problems = b.problems.filter((p) => !/favicon|ResizeObserver|Failed to load resource|net::ERR/i.test(p));
  if (problems.length) log("page problems", problems.slice(0, 8));
  await b.close();
}

if (failures.length) {
  console.log(`\n${failures.length} FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
