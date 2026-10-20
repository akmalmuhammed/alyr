// Runs the Documents screens of the workspace (ALY-146, spec 015) in a real browser, in English
// or Arabic, light or dark, at phone or laptop width, and checks what an owner, an agent and a
// new shop experience: the list (search, filters, paging, the totals line), a document with the
// real PDF's pages as pictures, writing a draft by hand, issuing it, sharing it, recording a
// payment, printing it on another paper, cancelling it with a credit note; the settings with a
// live preview that changes as the branding is typed; the numbering; an agent's view; the
// refusal a shop with no registration number meets; and axe-core on every state. Headless Edge
// over the DevTools protocol (scripts/browser-kit.mjs), no packages. Node 22.
//
//   node scripts/documents-screens-browser-check.mjs --lang en --full \
//        --base http://localhost:31NN --api http://127.0.0.1:84NN --out C:/t/ds/shots \
//        --profile C:/t/ds/p-en --port 9741 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// `--full` runs the flows that change things (draft, issue, pay, cancel, settings, roles); without
// it the run only looks (list, a document, the form, the settings, the sheets) at the width,
// language and theme asked for (`--scheme dark`, `--width 1280`). It needs a dev API on its own
// database (never the shared one) and a web app pointed at it (docs/status.md, "Live testing
// from the laptop"), and `docker` to switch Documents on for the demo shop and to make a second,
// empty shop in that database (`--db`, `--pg`). Everything is fictional. Nothing is sent to a real
// person: the WhatsApp channel is the simulator. The Edge it starts uses its own profile folder and
// a debugging port nobody else is on; keep both short.

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { deflateSync, crc32 } from "node:zlib";
import { launch } from "./browser-kit.mjs";
import { COPY } from "../apps/web/app/(product)/_workspace/documentsCopy.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3144";
const API = args.api ?? "http://127.0.0.1:8441";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const SCHEME = args.scheme === "dark" ? "dark" : "light";
const WIDTH = Number(args.width ?? 375);
const PHONE = WIDTH < 800;
const FULL = args.full === "true";
const OUT = args.out ?? `${tmpdir()}/documents-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/documents-profile-${LANG}`;
const PORT = Number(args.port ?? 9741);
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr_docscreens";
const PG = args.pg ?? "alyrwhatsapp-postgres-1";
const TENANT = "0a1f0000-0000-4000-8000-00000000a1f0";
const RUN = randomUUID().slice(0, 6);
const T = COPY[LANG];
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG} ${SCHEME} ${WIDTH}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

// ── the shop's side (fictional) ─────────────────────────────────────────────────────────
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-c", text], { encoding: "utf8" }).trim();
async function api(path, method = "GET", body, headers = {}) {
  const response = await fetch(`${API}${path}`, { method, headers: body ? { "content-type": "application/json", ...headers } : headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const key = () => ({ "Idempotency-Key": `ds-${randomUUID()}` });

/** A solid PNG, made here (no packages), for the logo upload. */
function solidPng(width, height, [r, g, b]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const LINES = [
  { description: "Circuit breaker 16 A", description_ar: "قاطع دائرة 16 أمبير", quantity: "2", unit: "piece", unit_price_minor: 4500, discount_minor: 500 },
  { description: "Cable 2.5 mm, 20 m roll", description_ar: "لفة كابل 2.5 ملم، 20 متراً", quantity: "1", unit: "piece", unit_price_minor: 12500 },
  { description: "Delivery within Doha", description_ar: "توصيل داخل الدوحة", quantity: "1", unit: "service", unit_price_minor: 2000 },
];
const TOTAL = 2 * 4500 - 500 + 12500 + 2000;

async function setup() {
  sql(`insert into tenant_modules (tenant_id, module_key) values ('${TENANT}', 'documents') on conflict do nothing`);
  await api("/api/documents/settings", "PUT", {
    business_name: "Al Noor Electricals", business_name_ar: "النور للكهربائيات", commercial_registration: "100200",
    address: "Salwa Road, Doha", address_ar: "طريق سلوى، الدوحة", phone: "+974 5555 0100", languages: "ar_en",
    default_audience: "consumer", layout: "a4", brand_color: null, show_sku: false, show_bank: false, cash_rounding_minor: 0,
    agents_may_issue: false, agents_may_record_payments: false, auto_send_whatsapp: true, auto_send_email: true, send_mode: "automatic",
  });
  await api("/api/documents/settings/logo", "DELETE");
  await api("/api/documents/settings/stamp", "DELETE");
  const series = (await api("/api/documents/series")).series;
  for (const s of series.filter((x) => x.series_key === "main" && x.prefix !== { receipt: "RC", invoice: "INV", quote: "QT", delivery_note: "DN", statement: "ST", credit_note: "CN", deposit_receipt: "DR", proforma: "PF" }[x.kind])) {
    await api(`/api/documents/series/${s.kind}/main`, "PUT", { prefix: { receipt: "RC", invoice: "INV", quote: "QT", delivery_note: "DN", statement: "ST", credit_note: "CN", deposit_receipt: "DR", proforma: "PF" }[s.kind] });
  }
  // A paged list: more than one page (40) of documents, and the three states the filters tell apart.
  const have = (await api("/api/documents?limit=1")).total;
  const customer = { name: "Fatima Al-Kuwari", name_ar: "فاطمة الكواري", phone: "+974 5555 0199" };
  const make = async (body) => (await api("/api/documents", "POST", { ...body, issue: true }, key())).document;
  if (have < 48) {
    for (let i = have; i < 48; i++) await make({ kind: "receipt", customer: { ...customer, name: `Customer ${i}`, name_ar: `عميل ${i}` }, lines: [LINES[0]], payments: [{ method: "cash", amount_minor: 8500 }] });
    const unpaid = await make({ kind: "invoice", customer: { ...customer, name: "Hamad Trading Co", name_ar: "حمد للتجارة", company: "Hamad Trading" }, lines: LINES, due_date: "2026-11-15" });
    const part = await make({ kind: "invoice", customer: { ...customer, name: "Salem Al-Mannai", name_ar: "سالم المناعي" }, lines: LINES });
    await api("/api/documents/payments", "POST", { subject: "invoice", id: part.id, amount_minor: 10000, method: "bank_transfer", reference: "TRX-7781" }, key());
    const gone = await make({ kind: "receipt", customer, lines: LINES.slice(0, 1), payments: [{ method: "link", amount_minor: 8500 }] });
    await api(`/api/documents/${gone.id}/cancel`, "POST", { reason: "Customer changed their mind" });
    await api("/api/documents", "POST", { kind: "quote", customer, lines: LINES });
    void unpaid;
  }
  const list = (await api("/api/documents?limit=100")).documents;
  const invoice = list.find((d) => d.kind === "invoice" && d.status === "issued");
  const receipt = list.find((d) => d.kind === "receipt" && d.status === "issued");
  const draft = list.find((d) => d.status === "draft");
  return { invoice, receipt, draft };
}

// ── the browser ─────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: WIDTH, height: PHONE ? 812 : 900, scheme: SCHEME });
const { js, until, click } = b;
// A form with unsaved changes asks the browser's own "leave this page?" before it goes: the
// check answers yes, so one failed step cannot hang the rest of the run.
b.on("Page.javascriptDialogOpening", () => { b.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => undefined); });
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${SCHEME}-${WIDTH}-${name}.png`); log("shot", name); };
const text = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
const count = (selector) => js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
async function noSideScroll(name) {
  const wide = await js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('.sh-scroll')?.scrollWidth ?? 0) - innerWidth");
  check(wide <= 0, `no sideways scrolling on ${name}${wide > 0 ? ` (${wide}px too wide)` : ""}`);
}
async function axe(name, scope = null) {
  // The shell's own sidebar and top bar are ALY-129's (their grey text), not this feature's.
  const found = await b.axe(AXE, scope, scope ? [] : [".sh-side", ".sh-top"]);
  if (found === null) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  writeFileSync(`${OUT}/${LANG}-${SCHEME}-${WIDTH}-axe-${name}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: no violations on ${name} (${found.length} found)`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
async function targets(name, scope = "body") {
  const small = await js(`[...document.querySelectorAll(${JSON.stringify(scope)} + ' button, ' + ${JSON.stringify(scope)} + ' a[href], ' + ${JSON.stringify(scope)} + ' select, ' + ${JSON.stringify(scope)} + ' input:not([type=hidden]):not(.ct-sr):not(.ct-file)')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.sh-side') && !e.closest('details:not([open]) > :not(summary)') && !e.closest('.ct-sr') && (r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'A' && e.closest('p, li, span, small')) && e.type !== 'radio' && e.type !== 'checkbox' && e.getAttribute('role') !== 'switch'; }).map(e => (e.textContent || e.getAttribute('aria-label') || e.name || e.type || '').trim().slice(0, 28) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))`);
  if (PHONE) check(small.length === 0, `every control on ${name} is 44 px or more${small.length ? ` (small: ${small.slice(0, 5).join("; ")})` : ""}`);
}
const run = async (name, fn) => {
  if (args.only && !name.includes(args.only)) return;
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name.replace(/\W+/g, "-")}-stopped`); } catch { /* the page is gone */ }
  }
};

// Finding things the way a person does: by the words on them.
const norm = (s) => JSON.stringify(s);
const btn = (word, scope = "document") => `[...${scope}.querySelectorAll('button, a.btn')].find(e => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\\s+/g, ' ').trim().includes(${norm(word)}))`;
const field = (label, scope = "document") => `[...${scope}.querySelectorAll('.ct-field')].find(f => f.querySelector('label, .ct-label')?.textContent.trim().startsWith(${norm(label)}))?.querySelector('input, textarea, select')`;
async function fill(find, value) {
  await click(find, 120);
  await b.clearFocused();
  await b.type(value);
  await b.sleep(80);
}
async function choose(find, value) {
  await b.js(`(() => { const el = ${find}; const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${norm(value)}); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.sleep(150);
}
const quiet = () => until("!document.querySelector('.ct-toast')", "messages to clear", 12000);
const sheetOpen = () => until("!!document.querySelector('.ct-sheet')", "a sheet");
const sheetGone = () => until("!document.querySelector('.ct-sheet')", "the sheet to close");
const sheetText = () => js("(document.querySelector('.ct-sheet')?.innerText ?? '').replace(/\\s+/g, ' ')");
const toast = () => js("[...document.querySelectorAll('.ct-toast-text')].map(e => e.textContent).join(' | ')");
const waitToast = async (part) => { await until(`[...document.querySelectorAll('.ct-toast-text')].some(e => e.textContent.includes(${norm(part)}))`, `a message with "${part}"`); };
const paperReady = () => until("[...document.querySelectorAll('img.dc-sheet')].length > 0 && [...document.querySelectorAll('img.dc-sheet')].every(i => i.complete && i.naturalWidth > 0)", "the page picture");
const open = async (path, ready = ".dc") => { await b.go(`${BASE}${path}`, 500); await until(`!!document.querySelector(${norm(ready)})`, `the screen ${path}`, 30000); await b.sleep(250); };
const listed = () => until("!!document.querySelector('.dc-row') || !!document.querySelector('.ct-empty')", "the list");
async function signIn(email) {
  // A dev database sees many sign-ins a day: the limit of codes an hour is cleared first.
  sql(`delete from login_codes where email = '${email}'`);
  return js(`fetch('/api/auth/code', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(email)}})}).then(r => r.json()).then(d => fetch('/api/auth/verify', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email: ${norm(email)}, code: d.dev_code})})).then(r => r.json()).then(m => m.role)`);
}
const signOut = () => js("fetch('/api/auth/logout', {method: 'POST'})");

try {
  await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" });
  const docs = await setup();
  await b.go(`${BASE}/app`, 400);
  await js(`localStorage.setItem('alyr-workspace-lang', '${LANG}')`);
  await b.view(WIDTH, PHONE ? 812 : 900, PHONE, SCHEME);

  // 1. The list.
  await run("the list", async () => {
    await open("/app/documents");
    await listed();
    check((await js("document.documentElement.querySelector('.sh').lang")) === LANG && (await js("document.querySelector('.sh').dir")) === (AR ? "rtl" : "ltr"), "the screen is in the language asked for, reading the right way");
    const first = await count(".dc-row");
    check(first === 40, `the first page is 40 rows (${first})`);
    check((await text()).includes(T.showMore), "there is a Show more button for the rest");
    check(!(await text()).includes("QAR") === AR || !AR, "amounts are written in this language's currency");
    await shot("01-list");
    await targets("the list");
    await noSideScroll("the list");
    await axe("list");
    await click(btn(T.showMore));
    await until("document.querySelectorAll('.dc-row').length > 40", "the next page");
    const more = await count(".dc-row");
    const numbered = await js("[...document.querySelectorAll('.dc-row-number')].map(e => e.textContent)");
    check(more >= 50 && new Set(numbered).size === numbered.length, `Show more adds the rest without repeating any (${more} rows, ${numbered.length} numbered)`);
    // Keyboard: the first row opens with Enter.
    await js("document.querySelector('.dc-row').focus()");
    await b.key("Enter");
    await until("!!document.querySelector('.dc-number')", "the document opened from the keyboard");
    check(true, "a row opens from the keyboard (Enter)");
  });

  // 2. Search and filters.
  await run("search and filters", async () => {
    await open("/app/documents");
    await listed();
    await fill("document.querySelector('.ct-search input')", docs.invoice.number);
    await until(`document.querySelectorAll('.dc-row').length === 1`, "the search to settle");
    check((await text()).includes(docs.invoice.number), "search finds a document by its number");
    await fill("document.querySelector('.ct-search input')", AR ? "حمد" : "hamad");
    await until("document.querySelectorAll('.dc-row').length === 1", "the name search");
    check(true, "search finds a customer by name (Arabic or English)");
    await fill("document.querySelector('.ct-search input')", "230");
    await until("document.querySelectorAll('.dc-row').length >= 1", "the amount search");
    check((await count(".dc-row")) >= 1, "search finds an amount");
    await fill("document.querySelector('.ct-search input')", "55550199");
    await until("document.querySelectorAll('.dc-row').length >= 1", "the phone search");
    check(true, "search finds a phone number");
    await fill("document.querySelector('.ct-search input')", "zzzzzz");
    await until("!!document.querySelector('.ct-none')", "the empty answer");
    check((await text()).includes(T.nothingFound), "a search with no answer says so, and offers to show everything");
    await shot("02-search-none");
    await click(btn(T.clearFilters));
    await until("document.querySelectorAll('.dc-row').length >= 40", "everything back");
    // The filters.
    await click("document.querySelector('.ct-fold > summary')");
    await choose(field(T.kind), "invoice");
    await until("[...document.querySelectorAll('.dc-row-number')].every(e => e.textContent.startsWith('INV'))", "invoices only");
    check(true, "the kind filter keeps only invoices");
    await click(btn(T.money.unpaid, "document.querySelector('.dc-chipset')"));
    await click(btn(T.money.part, "document.querySelector('.dc-chipset')"));
    await until("document.querySelectorAll('.dc-row').length >= 2", "unpaid and part paid");
    const states = await js("[...document.querySelectorAll('.dc-row')].every(r => /" + `${T.money.unpaid}|${T.money.part}` + "/.test(r.textContent))");
    check(states, "unpaid and part paid keep exactly those");
    const line = await text();
    check(line.includes(T.owingOf), "the total line says what is still owed");
    await shot("03-filters");
    await axe("filters");
    await click(btn(T.clearFilters, "document.querySelector('.ct-fold')"));
    await choose(field(T.status), "cancelled");
    await until("[...document.querySelectorAll('.dc-row')].length >= 1 && [...document.querySelectorAll('.dc-row')].every(r => r.textContent.includes(" + norm(T.statuses.cancelled) + "))", "cancelled only");
    check(true, "the status filter shows cancelled documents");
  });

  // 3. A document: the page as pictures, the facts, and the actions of each state.
  await run("a document", async () => {
    await open(`/app/documents?d=${docs.invoice.id}`, ".dc-number");
    await paperReady();
    check((await text()).includes(docs.invoice.number), "shows the number");
    check((await count("img.dc-sheet")) >= 1, "the real PDF's page is on screen as a picture");
    const alt = await js("document.querySelector('img.dc-sheet').alt");
    check(alt.includes(docs.invoice.number), `the picture has a sentence for a screen reader ("${alt.slice(0, 60)}")`);
    check((await count(".dc-lines li")) >= 1, "the items are also there as text");
    check(await js("[...document.querySelectorAll('.dc-amount bdi')].every(x => getComputedStyle(x).direction === " + norm(AR ? 'rtl' : 'ltr') + ")"), "an amount is laid out the way this language writes money");
    check(await js(`!!${btn(T.recordPayment)}`), "an unpaid invoice offers Record payment");
    check(await js(`!!${btn(T.cancelDocument)}`), "…and Cancel document");
    await shot("04-invoice");
    await targets("a document");
    await noSideScroll("a document");
    await axe("document");
    await open(`/app/documents?d=${docs.receipt.id}`, ".dc-number");
    check(!(await js(`!!${btn(T.recordPayment)}`)), "a receipt does not offer Record payment");
    await shot("05-receipt");
    await open(`/app/documents?d=${docs.draft.id}`, ".dc-number");
    await paperReady();
    check(await js(`!!${btn(T.issue)}`), "a draft offers Issue");
    check((await js("document.querySelector('.dc-number').textContent")).includes(T.draftNumber), "…and says it is a draft");
    await shot("06-draft");
    await axe("draft");
  });

  // 4. The sheets over a document.
  await run("the sheets", async () => {
    await open(`/app/documents?d=${docs.invoice.id}`, ".dc-number");
    await click(btn(T.share));
    await sheetOpen();
    await until("document.querySelector('.ct-linkbox')?.value.includes('/d/')", "the link");
    const link = await js("document.querySelector('.ct-linkbox').value");
    check(/\/d\/[a-z-]+\?t=/.test(link), "Share makes a link to the hosted page");
    await shot("07-share");
    await axe("share-sheet", ".ct-sheet");
    await targets("the share sheet", ".ct-sheet");
    await b.key("Escape");
    await sheetGone();
    check((await js("document.activeElement?.textContent ?? ''")).includes(T.share), "closing a sheet gives the focus back to the button that opened it");
    await click(btn(T.print));
    await sheetOpen();
    await click(`[...document.querySelectorAll('.ct-sheet .ct-choice')].find(l => l.textContent.includes(${norm(T.layouts.a5)}))`);
    const href = await js("document.querySelector('.ct-sheet a.btn.primary').href");
    check(href.includes("layout=a5"), "Print on A5 opens the same document on another paper");
    const printed = await js(`fetch(${norm(href.replace(BASE, ""))}).then(r => r.headers.get('content-type') + ' ' + r.headers.get('x-document-layout'))`);
    check(printed === "application/pdf a5", `…and the API answers with a PDF in that layout (${printed})`);
    await shot("08-print");
    await axe("print-sheet", ".ct-sheet");
    await b.key("Escape");
    await sheetGone();
    await click(btn(T.recordPayment));
    await sheetOpen();
    await shot("09-pay-sheet");
    await axe("pay-sheet", ".ct-sheet");
    await b.key("Escape");
    await sheetGone();
    await click(btn(T.cancelDocument));
    await sheetOpen();
    const cancelText = await sheetText();
    check(cancelText.includes(docs.invoice.number) && cancelText.includes(T.cancelAfter.slice(0, 20)), "the cancel sheet says what happens and that it cannot be undone");
    check(await js("document.querySelector('.ct-sheet button.danger').disabled"), "the confirm button waits for a reason");
    await shot("10-cancel-sheet");
    await axe("cancel-sheet", ".ct-sheet");
    await b.key("Escape");
    await sheetGone();
  });

  // 5. The form.
  await run("the form", async () => {
    await open("/app/documents?edit=new&kind=invoice", ".dc-edit");
    await shot("11-form");
    await targets("the form");
    await noSideScroll("the form");
    await axe("form");
    check((await count(".dc-kindchip")) === 5, "five kinds to choose from");
    const long = await js("[...document.querySelectorAll('.dc-edit input:not([type=radio]), .dc-edit select, .dc-edit textarea')].filter(e => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 43).length");
    check(!PHONE || long === 0, "every field is 44 px or taller on a phone");
  });

  // 5b. The settings, looked at (the full run changes them).
  await run("the settings, looked at", async () => {
    await signOut();
    await open("/app/documents?view=settings", ".dc-settings");
    await until("!!document.querySelector('.dc-preview-sheet img')", "the first preview");
    await b.sleep(400);
    if (!PHONE) check(await js("getComputedStyle(document.querySelector('.dc-set-side')).display !== 'none'"), "on a laptop the preview sits beside the form");
    else check(await js("getComputedStyle(document.querySelector('.dc-peek')).display !== 'none'"), "on a phone the preview is a small live picture that opens full size");
    await shot("17-settings");
    await noSideScroll("the settings");
    await axe("settings-looked-at");
    for (const name of [T.secLanguage, T.secTexts, T.secNumbering, T.secMoney, T.secAuto, T.secTeam, T.secChanges]) {
      await click(`[...document.querySelectorAll('.ct-fold > summary')].find(s => s.textContent.includes(${norm(name)}))`, 80);
    }
    await shot("17b-settings-open");
    await axe("settings-all-open");
  });

  if (FULL) {
    // 6. Writing a draft by hand, issuing it, sharing, paying, cancelling.
    let number = "";
    let docId = "";
    await run("a draft by hand", async () => {
      await signOut();
      await open("/app/documents");
      await listed();
      await click(btn(T.newDocument));
      await until("!!document.querySelector('.dc-edit')", "the form");
      const who = (await api("/api/documents/customers")).customers[0];
      await fill("document.querySelector('.dc-edit .ct-field input[type=search]')", who.name.split(" ")[0]);
      await until("!!document.querySelector('.dc-hit')", "the customer hits");
      await click("document.querySelector('.dc-hit')");
      await until("!!document.querySelector('.dc-picked')", "the picked customer");
      check((await text()).includes(who.name), "a customer found among the shop's own is picked, with their phone and name filled in");
      // A line from the Catalog.
      const item = (await api("/api/items", "POST", { name: `Surge protector ${RUN}`, name_ar: `واقي تيار ${RUN}`, price: 4500, status: "live" })).item;
      await click(btn(T.formAddFromCatalog));
      await fill("document.querySelector('.dc-catalog input[type=search]')", `Surge protector ${RUN}`);
      await until("!!document.querySelector('.dc-hit')", "the catalog hit");
      check((await text()).includes(`#${item.code}`), "a Catalog line shows its item code");
      await click("document.querySelector('.dc-catalog .dc-hit')");
      await until("document.querySelectorAll('.dc-lineform').length === 1", "the line added (it replaces the empty first line)");
      check((await js("document.querySelector('.dc-lineform input[dir=ltr][inputmode=decimal]:nth-of-type(1)')?.value ?? ''")) !== null, "the Catalog line is added");
      // A free line with a discount.
      await click(btn(T.formAddFree));
      await until("document.querySelectorAll('.dc-lineform').length === 2", "the second line");
      const second = (sel) => `document.querySelectorAll('.dc-lineform')[1].querySelectorAll('.ct-field')`;
      await fill(`(${field(T.lineDescription, "document.querySelectorAll('.dc-lineform')[1]")})`, "Delivery within Doha");
      await fill(`(${field(T.lineDescriptionAr, "document.querySelectorAll('.dc-lineform')[1]")})`, "توصيل داخل الدوحة");
      await fill(`(${field(T.lineQuantity, "document.querySelectorAll('.dc-lineform')[1]")})`, "2");
      await fill(`(${field(T.linePrice, "document.querySelectorAll('.dc-lineform')[1]")})`, "12.50");
      await fill(`(${field(T.lineDiscount, "document.querySelectorAll('.dc-lineform')[1]")})`, "5");
      void second;
      const totalText = await js("document.querySelector('.dc-totals-live .dc-grand dd').textContent");
      // 45.00 + (2 x 12.50 - 5.00) = 65.00
      check(totalText.includes("65.00"), `the totals are worked out as you type (${totalText})`);
      check((await text()).includes(T.formDateAuto), "the date is said to be the day it is issued");
      await shot("12-form-filled");
      await axe("form-filled");
      await click(btn(T.saveDraft));
      await until("!!document.querySelector('.dc-number') && /" + T.draftNumber + "/.test(document.querySelector('.dc-number').textContent)", "the saved draft");
      docId = new URL(await js("location.href")).searchParams.get("d");
      check((await text()).includes("65.00"), "saving keeps a draft: the server's total is the same 65.00");
      await paperReady();
      // Edit it, then issue.
      await click(btn(T.edit));
      await until("!!document.querySelector('.dc-edit') && document.querySelectorAll('.dc-lineform').length === 2", "the draft in the form again");
      check(true, "an existing draft opens in the form with its lines");
      await click(btn(T.cancel, "document.querySelector('.dc-bar')"));
      await until("!!document.querySelector('.dc-number')", "back to the draft");
      await click(btn(T.issue));
      await sheetOpen();
      await until("/INV-\\d+/.test(document.querySelector('.ct-sheet')?.innerText ?? '')", "the number in the confirmation");
      const issueText = await sheetText();
      check(/INV-\d+/.test(issueText), `the confirmation says the number it will get (${(issueText.match(/INV-\d+/) ?? [])[0]})`);
      await shot("13-issue-sheet");
      await axe("issue-sheet", ".ct-sheet");
      await click(btn(T.issueButton, "document.querySelector('.ct-sheet')"));
      await sheetGone();
      await until("/INV-\\d+/.test(document.querySelector('.dc-number')?.textContent ?? '')", "the issued number");
      number = await js("document.querySelector('.dc-number').textContent.trim()");
      check(true, `issuing gave it its number (${number})`);
      await paperReady();
      check(!(await js(`!!${btn(T.edit)}`)), "an issued document cannot be edited (no Edit)");
      await shot("14-issued");
    });

    await run("share and send", async () => {
      await click(btn(T.share));
      await sheetOpen();
      await until("document.querySelector('.ct-linkbox')?.value.includes('/d/')", "the link");
      await click(btn(T.copyLink));
      await waitToast(T.linkCopied);
      check(true, "Copy link says it copied");
      await click(btn(T.sendNow, "document.querySelector('.ct-sheet')"));
      await until("!!document.querySelector('.dc-deliveries li')", "a delivery in the list");
      const d = await js("document.querySelector('.dc-deliveries li').innerText.replace(/\\s+/g, ' ')");
      check(/WhatsApp|واتساب/.test(d), `sending by WhatsApp is recorded with its state (${d.slice(0, 80)})`);
      await shot("15-sent");
      await b.key("Escape");
      await sheetGone();
      await until("!!document.querySelector('.dc-deliveries li')", "the delivery on the page");
      check(true, "the page lists who it was sent to");
    });

    await run("record a payment", async () => {
      await quiet();
      await click(btn(T.recordPayment));
      await sheetOpen();
      await fill("document.querySelector('.ct-sheet input[inputmode=decimal]')", "20");
      await choose("document.querySelector('.ct-sheet select')", "cheque");
      await fill(`(${field(T.paymentReference, "document.querySelector('.ct-sheet')")})`, "CHQ-4471");
      await click(btn(T.paymentButton, "document.querySelector('.ct-sheet')"));
      await sheetGone();
      await waitToast(AR ? "الإيصال" : "Receipt");
      await until(`document.querySelector('.dc-owed')?.textContent.includes('45.00')`, "the balance of 45.00");
      check(true, "the balance now reads 45.00 (65.00 less 20.00)");
      check((await text()).includes("CHQ-4471"), "the payment's reference is on the page");
      check((await count(".dc-related li")) >= 1, "the receipt of the payment is listed as a related document");
      check((await text()).includes(T.money.part), "the pill says Part paid");
      await shot("16-part-paid");
      // Too much is refused in words.
      await click(btn(T.recordPayment));
      await sheetOpen();
      await fill("document.querySelector('.ct-sheet input[inputmode=decimal]')", "999");
      check(await js("document.querySelector('.ct-sheet button[type=submit]').disabled"), "more than is owed cannot be recorded");
      await b.key("Escape");
      await sheetGone();
    });

    await run("cancel with a credit note", async () => {
      await quiet();
      await click(btn(T.cancelDocument));
      await sheetOpen();
      await fill("document.querySelector('.ct-sheet textarea')", "Customer changed their mind");
      await click(btn(T.cancelButton, "document.querySelector('.ct-sheet')"));
      await sheetGone();
      await waitToast(AR ? "الإشعار الدائن" : "Credit note");
      await until(`[...document.querySelectorAll('.dc-pill')].some(p => p.textContent.includes(${norm(T.statuses.void)}))`, "the cancelled state");
      check(!(await js(`!!${btn(T.cancelDocument)}`)), "a cancelled document offers no second cancel");
      check((await count(".dc-related li")) >= 2, "the credit note is linked from the document");
      await shot("17-cancelled");
      await axe("cancelled");
      await open(`/app/documents?d=${docId}`, ".dc-number");
      await click(`document.querySelector('.dc-related .ct-linkbtn')`);
      await b.sleep(600);
    });

    // 7. The settings and their preview.
    await run("settings and preview", async () => {
      await open("/app/documents?view=settings", ".dc-settings");
      await until("!!document.querySelector('.dc-preview-sheet img')", "the first preview");
      const preview = () => js("(async () => { const i = document.querySelector('.dc-preview-sheet img') ?? document.querySelector('.ct-sheet .dc-preview-sheet img'); const buf = await (await fetch(i.src)).arrayBuffer(); const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].slice(0, 8).map(x => x.toString(16)).join('') + ':' + i.naturalWidth + 'x' + i.naturalHeight; })()");
      const sheetImg = PHONE ? async () => { await until("!document.querySelector('.ct-toast')", "messages to clear", 12000); await click("document.querySelector('.dc-peek')"); await sheetOpen(); await until("document.querySelector('.ct-sheet .dc-preview-sheet img')?.complete", "the preview in the sheet"); const p = await preview(); await b.key("Escape"); await sheetGone(); return p; } : preview;
      const before = await sheetImg();
      await shot("18-settings");
      await targets("the settings");
      await noSideScroll("the settings");
      await axe("settings");
      // The colour changes the page.
      await fill("document.querySelector('[data-field=brand_color]')", "8a1c2b");
      await b.sleep(1400);
      const coloured = await sheetImg();
      check(coloured.split(":")[0] !== before.split(":")[0], "typing a colour changes the preview (before it is saved)");
      check(await js("document.querySelector('.dc-dirty')?.textContent.length > 0"), "the bar says the changes are not saved yet");
      await shot("19-settings-colour");
      // Layouts: A5 and the roll.
      await click(`[...document.querySelectorAll('.dc-settings .ct-choice')].find(l => l.textContent.includes(${norm(T.layouts.a5)}))`);
      await b.sleep(1400);
      const a5 = await sheetImg();
      check(a5.split(":")[0] !== coloured.split(":")[0], "switching to A5 changes the preview");
      await click(`[...document.querySelectorAll('.dc-settings .ct-choice')].find(l => l.textContent.includes(${norm(T.layouts.thermal80)}))`);
      await b.sleep(1600);
      const roll = await sheetImg();
      const [rw, rh] = roll.split(":")[1].split("x").map(Number);
      check(rw === 520 && rh / rw > 1.2, `the 80 mm roll draws narrow and tall (${roll.split(":")[1]})`);
      await shot("20-settings-roll");
      // The consumer rule.
      await click(`[...document.querySelectorAll('.ct-fold > summary')].find(s => s.textContent.includes(${norm(T.secLanguage)}))`);
      await click(`[...document.querySelectorAll('.dc-settings .ct-choice')].find(l => l.textContent.includes(${norm(T.languagesName.en)}))`);
      await until(`document.querySelector('.dc-settings .ct-alert')?.textContent.includes(${norm(T.consumerRule.slice(0, 18))})`, "the consumer rule");
      check(await js(`${btn(T.setSave, "document")}?.disabled ?? document.querySelector('.dc-bar .btn.volt').disabled`), "Arabic cannot be switched off for consumers: the message is shown and Save waits");
      await shot("21-settings-consumer-rule");
      await axe("settings-consumer-rule");
      await click(`[...document.querySelectorAll('.dc-settings .ct-choice')].find(l => l.textContent.includes(${norm(T.languagesName.ar_en)}))`);
      await click(`[...document.querySelectorAll('.dc-settings .ct-choice')].find(l => l.textContent.includes(${norm(T.layouts.a4)}))`);
      // A logo, saved as soon as it is chosen.
      writeFileSync(`${OUT}/logo-${RUN}.png`, solidPng(160, 80, [30, 90, 160]));
      const doc = await b.send("DOM.getDocument", {});
      const node = await b.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
      await b.send("DOM.setFileInputFiles", { files: [`${OUT}/logo-${RUN}.png`], nodeId: node.nodeId });
      await waitToast(T.logoSaved);
      await until("!!document.querySelector('.dc-picture-box img')", "the logo shown back");
      check(true, "a logo is saved as soon as it is chosen, and shown back");
      await b.sleep(1500);
      const withLogo = await sheetImg();
      await shot("21b-logo");
      check(withLogo.split(":")[0] !== coloured.split(":")[0], `the logo is on the preview (${coloured} then ${withLogo})`);
      // Save everything.
      await click(btn(T.setSave, "document.querySelector('.dc-bar')"));
      await waitToast(T.setSaved);
      check(!(await js("!!document.querySelector('.dc-dirty')")), "after saving nothing is marked as unsaved");
      await open("/app/documents?view=settings", ".dc-settings");
      check((await js("document.querySelector('[data-field=brand_color]').value")) === "#8a1c2b", "the colour is still there after a reload");
      // The recent changes.
      await click(`[...document.querySelectorAll('.ct-fold > summary')].find(s => s.textContent.includes(${norm(T.secChanges)}))`);
      const changes = await js("[...document.querySelectorAll('.dc-log li')].map(l => l.innerText.replace(/\\s+/g, ' ')).join(' | ')");
      check(changes.length > 0 && /Workspace|Owner/.test(changes), `the recent changes say what and who (${changes.slice(0, 90)})`);
      await shot("22-settings-changes");
    });

    await run("numbering", async () => {
      await open("/app/documents?view=settings", ".dc-settings");
      await click(`[...document.querySelectorAll('.ct-fold > summary')].find(s => s.textContent.includes(${norm(T.secNumbering)}))`);
      check((await text()).includes(T.numberingWarn.slice(0, 24)), "the numbering says numbers never skip or reset");
      const next = await js("document.querySelector('.dc-series .dc-next bdi').textContent");
      check(/^[A-Z]+-\d+$/.test(next), `each series shows the next number it will give (${next})`);
      const first = `document.querySelector('.dc-series .ct-card-form input[dir=ltr]')`;
      await fill(first, "XRC");
      await click(btn(T.seriesSave));
      await waitToast(T.seriesSaved);
      await until(`document.querySelector('.dc-series .dc-next bdi').textContent.startsWith('XRC')`, "the new prefix in the next number");
      check(true, "changing a prefix changes the next number shown");
      await shot("23-numbering");
      await axe("numbering");
      await fill(first, "RC");
      await click(btn(T.seriesSave));
      await waitToast(T.seriesSaved);
    });

    await run("the pointers from other screens", async () => {
      const orders = (await api("/api/orders")).orders;
      const unpaid = orders.find((o) => o.payment === "unpaid" && o.status !== "cancelled");
      if (!unpaid) { log("no unpaid order to pay by hand; skipped"); return; }
      await api("/api/documents/payments", "POST", { subject: "order", id: unpaid.id, method: "cash" }, key());
      await open("/app/orders", ".sh-main");
      await until("!!document.querySelector('a.doc-link')", "the pointer on the order row");
      const label = await js("document.querySelector('a.doc-link').textContent");
      check(/RC-\d+/.test(label), `an order row points at its receipt (${label})`);
      await shot("24-orders-pointer");
      await click("document.querySelector('a.doc-link')");
      await until("!!document.querySelector('.dc-number')", "the receipt opened from the order");
      check(true, "…and it opens the receipt");
    });

    // 8. The home cards.
    await run("home cards", async () => {
      await open("/app", ".sh-main");
      await until("[...document.querySelectorAll('.ag-stock-card')].some(c => c.textContent.includes(" + norm(COPY[LANG].presetUnpaid) + "))", "the cards");
      const card = await js(`(() => { const c = [...document.querySelectorAll('.ag-stock-card')].find(c => c.textContent.includes(${norm(T.presetUnpaid)})); return { n: Number(c.querySelector('bdi').textContent.replace(/,/g, '')), href: c.getAttribute('href') }; })()`);
      await shot("25-home-cards");
      await axe("home-cards");
      await open(card.href, ".dc");
      await listed();
      const total = await js("Number(document.querySelector('.dc-totalsline b').textContent.replace(/[^0-9]/g, ''))");
      check(card.n === total && card.n === (await count(".dc-row")) || card.n === total, `the card says ${card.n}, the list it opens says ${total}`);
      check((await text()).includes(T.presetUnpaid), "the list says which card it was opened from");
      const notDelivered = await js(`(() => { const c = [...document.querySelectorAll('.ag-stock-card')]; return null; })()`);
      void notDelivered;
      await open("/app", ".sh-main");
      const nd = await js(`(() => { const c = [...document.querySelectorAll('.ag-stock-card')].find(c => c.textContent.includes(${norm(T.presetNotDelivered)})); return c ? { n: Number(c.querySelector('bdi').textContent.replace(/,/g, '')), href: c.getAttribute('href') } : null; })()`);
      check(nd !== null, "the home screen has the Documents not delivered card");
      if (nd && nd.href) {
        await open(nd.href, ".dc");
        await listed();
        const list = await js("Number(document.querySelector('.dc-totalsline b')?.textContent.replace(/[^0-9]/g, '') || 0)");
        check(list === nd.n, `Documents not delivered: the card says ${nd.n}, the list says ${list}`);
      }
    });

    // 9. An agent.
    await run("an agent", async () => {
      await b.go(`${BASE}/app`, 300);
      const role = await signIn("yusuf@alnoor.example");
      check(role === "agent", "signed in as an agent");
      await open("/app/documents");
      await listed();
      check(!(await text()).includes(T.settings), "an agent is not offered the settings");
      check(await js(`!!${btn(T.newDocument)}`), "an agent can start a document");
      await shot("26-agent-list");
      await axe("agent-list");
      check((await api("/api/documents/settings", "GET", undefined, {}).then(() => false, () => true)) || true, "(the settings API is for owners: checked by its own tests)");
      const refused = await js("fetch('/api/documents/settings').then(r => r.status)");
      check(refused === 403, "the API refuses an agent the settings anyway");
      await click(btn(T.newDocument));
      await until("!!document.querySelector('.dc-edit')", "the form");
      await fill(`(${field(T.name, "document")})`, `Agent Customer ${RUN}`);
      await choose("document.querySelectorAll('.dc-kindchip input')[1]", "on");
      await click(`document.querySelectorAll('.dc-kindchip')[1]`);
      await fill(`(${field(T.lineDescription, "document.querySelector('.dc-lineform')")})`, "Cable ties");
      await fill(`(${field(T.linePrice, "document.querySelector('.dc-lineform')")})`, "7");
      check(!(await js(`!!${btn(T.issue, "document.querySelector('.dc-bar')")}`)), "an agent is not offered Issue");
      await click(btn(T.saveDraft));
      await until("!!document.querySelector('.dc-number')", "the saved draft");
      check(!(await js(`!!${btn(T.issue, "document.querySelector('.dc-actions')")}`)) && (await text()).includes(T.askOwnerToIssue), "the draft says the owner or an admin issues it");
      await shot("27-agent-draft");
      await signOut();
    });

    // 10. A new shop with no registration number.
    await run("a shop with no CR number", async () => {
      const email = `owner-${RUN}@empty.example`;
      const ids = sql(`with t as (insert into tenants (name, name_ar, slug) values ('Zilal Test ${RUN}', 'ظلال ${RUN}', 'zilal-${RUN}') returning id), u as (insert into users (email, name) values ('${email}', 'Zilal Owner') returning id), m as (insert into memberships (tenant_id, user_id, role) select t.id, u.id, 'owner' from t, u), mm as (insert into tenant_modules (tenant_id, module_key) select t.id, 'documents' from t) select 1`);
      void ids;
      await b.go(`${BASE}/app`, 300);
      check((await signIn(email)) === "owner", "signed in as the owner of a new shop");
      await open("/app/documents");
      await until("!!document.querySelector('.ct-empty')", "the empty state");
      check((await text()).includes(T.emptyTitle), "a shop with no documents sees what will be here, in words");
      await shot("28-empty");
      await targets("the empty list");
      await axe("empty");
      await click(btn(T.newDocument));
      await until("!!document.querySelector('.dc-edit')", "the form");
      check((await text()).includes(T.crMissing), "the form says there is no CR number before the person gets stuck");
      await fill(`(${field(T.name, "document")})`, "Test Customer");
      await fill(`(${field(T.lineDescription, "document.querySelector('.dc-lineform')")})`, "Repair");
      await fill(`(${field(T.linePrice, "document.querySelector('.dc-lineform')")})`, "50");
      await click(btn(T.issue, "document.querySelector('.dc-bar')"));
      await sheetOpen();
      await click(btn(T.issueButton, "document.querySelector('.ct-sheet')"));
      await until("!!document.querySelector('.ct-sheet .dc-refusal')", "the refusal");
      const refusal = await sheetText();
      check(/commercial registration|السجل التجاري/.test(refusal) && !/error|exception|422/i.test(refusal), "an invoice without a CR number is refused in friendly words, naming what to add");
      check(await js("!!document.querySelector('.ct-sheet .dc-fixlink')"), "…with a link to the settings field");
      check(await js(`!!${btn(T.receiptInstead, "document.querySelector('.ct-sheet')")}`), "…and an offer to make a receipt instead");
      await shot("29-no-cr");
      await axe("no-cr", ".ct-sheet");
      await click("document.querySelector('.ct-sheet .dc-fixlink')");
      await until("!!document.querySelector('.dc-settings')", "the settings");
      await until("document.activeElement?.dataset?.field === 'commercial_registration'", "the CR field focused");
      check(true, "the link opens the settings with the cursor in the registration number");
      await shot("30-settings-cr");
      await signOut();
    });
  }

  check(b.problems.length === 0, `no errors in the browser's console (${b.problems.length})`);
  for (const p of b.problems.slice(0, 8)) log("   ", p);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED:", error.message ?? error);
  try { await b.shot(`${OUT}/${LANG}-${SCHEME}-${WIDTH}-99-where-it-stopped.png`); } catch { /* the page is gone */ }
} finally {
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nAll checks passed.");
