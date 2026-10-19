// Runs the page a customer opens from the link we send with their receipt or invoice (ALY-139,
// `/d/<shop>?t=<token>`) in a real browser at phone width, in English or Arabic, light and dark,
// and checks what a customer experiences with each kind of link: a good one (the document, the
// totals, a button that fetches the PDF with the link in a header), a cancelled document, a
// credit note, an expired link, a tampered one, a link made for another page, a link with
// nothing in it, and a shop that does not exist. A link that cannot be used must give a calm
// page that says to ask the shop to send the document again, never an error. Headless Edge over
// the DevTools protocol (scripts/browser-kit.mjs), no packages. Node 22.
//
//   node scripts/document-page-browser-check.mjs --lang en --base http://localhost:31NN \
//        --api http://127.0.0.1:83NN --out C:/t/dp/shots --profile C:/t/dp/p-en --port 9731 \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on its own database (never the shared one) and a web app pointed at it
// (docs/status.md, "Live testing from the laptop"), and `docker` to switch the Documents module
// on for the demo shop in that database (`--db`, `--pg`). The documents are made through the
// API as the demo shop's owner (fictional data); the links are signed here with the development
// key (`--secret`), which also checks that the token layout is what the API reads. The Edge it
// starts uses its own profile folder (`--profile`) and a debugging port nobody else is on
// (`--port`); keep both short, because Edge fails quietly with long paths.

import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3161";
const API = args.api ?? "http://127.0.0.1:8361";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const OUT = args.out ?? `${tmpdir()}/document-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/document-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9732 : 9731));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr_docsales_dev";
const PG = args.pg ?? "alyrwhatsapp-postgres-1";
// The built-in key a developer machine signs with when ALYR_LINK_SECRET is empty (it is in the
// repository; it protects nothing).
const SECRET = args.secret ?? ["alyr", "local", "development", "link", "key", "not", "for", "real", "use"].join("-");
const TENANT = "0a1f0000-0000-4000-8000-00000000a1f0";
const SLUG = "al-noor";
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

// ── the shop's side ─────────────────────────────────────────────────────────────────────
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-c", text], { encoding: "utf8" }).trim();
async function api(path, method = "GET", body, headers = {}) {
  const response = await fetch(`${API}${path}`, { method, headers: body ? { "content-type": "application/json", ...headers } : headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// A token signed here, to a layout the API did not hand us: version 2, a purpose (3 is a
// document), the document's ID, an expiry, and the first 16 bytes of HMAC-SHA256 over a context,
// the shop and the payload.
const b64u = (buffer) => buffer.toString("base64url");
const uuidBytes = (id) => Buffer.from(id.replaceAll("-", ""), "hex");
function sign(subject, { purpose = 3, expiresAt }) {
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(expiresAt);
  const payload = Buffer.concat([Buffer.from([2, purpose]), uuidBytes(subject), expires]);
  const mac = createHmac("sha256", SECRET).update(Buffer.concat([Buffer.from("alyr-link-v2\0"), uuidBytes(TENANT), payload])).digest().subarray(0, 16);
  return `${b64u(payload)}.${b64u(mac)}`;
}
const now = () => Math.floor(Date.now() / 1000);
const good = (id) => sign(id, { expiresAt: now() + 3600 });

async function makeDocuments() {
  await api("/sim/reset", "POST", {});
  sql(`insert into tenant_modules (tenant_id, module_key) values ('${TENANT}', 'documents') on conflict do nothing`);
  await api("/api/documents/settings", "PUT", {
    business_name: "Al Noor Electricals", business_name_ar: "النور للكهربائيات", commercial_registration: "100200",
    address: "Salwa Road, Doha", address_ar: "طريق سلوى، الدوحة", phone: "+974 5555 0100", languages: "ar_en",
  });
  const lines = [
    { description: "Circuit breaker 16 A", description_ar: "قاطع دائرة 16 أمبير", quantity: "2", unit: "piece", unit_price_minor: 4500, discount_minor: 500 },
    { description: "Cable 2.5 mm, 20 m roll", description_ar: "لفة كابل 2.5 ملم، 20 متراً", quantity: "1", unit: "piece", unit_price_minor: 12500 },
    { description: "Delivery within Doha", description_ar: "توصيل داخل الدوحة", quantity: "1", unit: "service", unit_price_minor: 2000 },
  ];
  const total = 2 * 4500 - 500 + 12500 + 2000;
  const customer = { name: "Fatima Al-Kuwari", name_ar: "فاطمة الكواري", phone: "+974 5555 0199" };
  const make = async (body) => (await api("/api/documents", "POST", { ...body, issue: true }, { "Idempotency-Key": `dp-${randomUUID()}` })).document;
  const receipt = await make({ kind: "receipt", customer, lines, payments: [{ method: "cash", amount_minor: total }] });
  const cancelled = await make({ kind: "receipt", customer, lines: lines.slice(0, 1), payments: [{ method: "link", amount_minor: 8500 }] });
  const voided = (await api(`/api/documents/${cancelled.id}/cancel`, "POST", { reason: "Customer changed their mind" }));
  const invoice = await make({ kind: "invoice", customer, lines, payments: [{ method: "bank_transfer", amount_minor: 10000, reference: "TRX-7781" }] });
  return { receipt, cancelled, note: voided.credit_note, invoice, total };
}

// ── the browser ─────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, scheme: "light" });
const { js, until, click } = b;
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${name}.png`); log("shot", name); };
const visibleText = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
const count = (selector) => js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
async function noSideScroll(name) {
  const wide = await js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth");
  check(wide <= 0, `no sideways scrolling on ${name}${wide > 0 ? ` (${wide}px too wide)` : ""}`);
}
async function axe(name) {
  const found = await b.axe(AXE);
  if (found === null) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  writeFileSync(`${OUT}/${LANG}-axe-${name}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: no violations on ${name} (${found.length} found)`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
const run = async (name, fn) => {
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name}-stopped`); } catch { /* the page is gone */ }
  }
};

// What the page sent to the API: the address, the header with the link.
const sent = [];
b.on("Network.requestWillBeSent", (p) => {
  if (p.request.url.includes("/api/d/")) sent.push({ method: p.request.method, url: p.request.url, link: p.request.headers["x-order-link"] ?? p.request.headers["X-Order-Link"] ?? null });
});
const answered = [];
b.on("Network.responseReceived", (p) => {
  if (p.response.url.includes("/api/d/")) answered.push({ url: p.response.url, status: p.response.status, type: p.response.mimeType, headers: p.response.headers });
});

const WORDS = AR
  ? { download: "تنزيل ملف PDF", paid: "مدفوع", due: "المتبقي", cancelled: "أُلغي بإشعار دائن رقم", against: "بخصوص", expired: "انتهت صلاحية هذا الرابط", invalid: "هذا الرابط غير صالح", askAgain: "اطلب من المتجر إرسال المستند إليك مرة أخرى", none: "افتح هذه الصفحة من الرابط الذي أرسلناه لك", notFound: "لم يتم العثور على هذه الصفحة", title: "إيصال", shop: "النور للكهربائيات", total: "الإجمالي" }
  : { download: "Download PDF", paid: "Paid", due: "Balance due", cancelled: "Cancelled by credit note", against: "Against", expired: "This link has expired", invalid: "This link is not valid", askAgain: "Ask the shop to send you the document again", none: "Open this page from the link we sent you", notFound: "This page was not found", title: "Receipt", shop: "Al Noor Electricals", total: "Total" };

/** Open the page the way a customer does (it opens in the document's lead language, Arabic),
 *  then switch to English for the English run, the way a customer would. */
async function open(url, ready = ".cx-main") {
  await b.go(url, 700);
  await until(`!!document.querySelector(${JSON.stringify(ready)})`, "the page");
  const lang = await js("document.querySelector('.cx')?.lang");
  if (lang !== LANG) {
    await click("document.querySelector('.cx-lang')");
    await until(`document.querySelector('.cx')?.lang === ${JSON.stringify(LANG)}`, "the language switch");
  }
}

/** The page for a link that cannot be used: friendly words, no document, no way to download. */
async function friendly(name, url, sentence) {
  await open(url);
  const text = await visibleText();
  check(text.includes(sentence), `${name}: says "${sentence}"`);
  check(!AR || text.includes("المتجر"), `${name}: …and names the shop in Arabic when asked in Arabic`);
  check(AR || text.toLowerCase().includes("ask the shop"), `${name}: says to ask the shop`);
  check((await count("button.cx-btn, .cx-card, .cx-row")) === 0, `${name}: no document, no download button`);
  check(!/error|exception|undefined|null|404|500|Traceback|\{"detail"/i.test(text), `${name}: no error dump`);
  check((await js("document.querySelector('.cx')?.dir")) === (AR ? "rtl" : "ltr"), `${name}: reads ${AR ? "right to left" : "left to right"}`);
  await noSideScroll(name);
}

try {
  await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" });
  await b.send("Emulation.setUserAgentOverride", { userAgent: await js("navigator.userAgent"), acceptLanguage: AR ? "ar-QA,ar" : "en-GB,en" });
  const docs = await makeDocuments();
  await b.view(375, 812, true, "light");
  const token = good(docs.receipt.id);
  const probe = await (await fetch(`${API}/api/d/${SLUG}`, { headers: { "x-order-link": token } })).json();
  check(probe.link.state === "ok" && probe.document.number === docs.receipt.number, "a token signed outside the API (same layout, same key) is read as good");

  // 1. A good link: the document, its totals, and a button for the PDF.
  await run("good link", async () => {
    await open(`${BASE}/d/${SLUG}?t=${token}`, ".cx-card");
    const text = await visibleText();
    check(text.includes(docs.receipt.number), `shows the number (${docs.receipt.number})`);
    check(text.includes(WORDS.title), `shows what it is (${WORDS.title})`);
    check(text.includes(WORDS.shop), `shows the shop's name (${WORDS.shop})`);
    check(text.includes(WORDS.download), `has the button "${WORDS.download}"`);
    check(text.includes(WORDS.paid), `says it is paid ("${WORDS.paid}")`);
    check(text.includes(AR ? "230.00 ر.ق" : "QAR 230.00"), "the total is written the way this language writes money");
    check(AR ? !/QAR/.test(text) : !/ر\.ق/.test(text), "…and only that language's currency");
    check(!text.includes("Fatima") && !text.includes("فاطمة") && !text.includes("5555 0199"), "the page does not name the customer or give a phone number");
    check((await js("document.querySelector('.cx')?.lang")) === LANG, "the page is in the language asked for");
    check((await js("document.querySelector('meta[name=referrer]')?.content")) === "no-referrer", "the page tells the browser to send no referrer");
    check((await js("document.querySelector('meta[name=robots]')?.content")).includes("noindex"), "the page tells search engines not to index it");
    const targets = await js("[...document.querySelectorAll('button, a')].filter(e => e.getBoundingClientRect().width > 0).map(e => Math.round(e.getBoundingClientRect().height))");
    check(targets.every((h) => h >= 32), `buttons are tall enough to press (${targets.join(", ")} px)`);
    await noSideScroll("the good link");
    await shot("01-receipt");
    await axe("receipt");

    // No request address of the page holds the token; it went in the header.
    const calls = sent.filter((c) => c.method === "GET");
    check(calls.length > 0 && calls.every((c) => !c.url.includes("?t=") && !c.url.includes(token) && !c.url.includes(docs.receipt.id)), "no request address of the page holds the token or the document's ID");
    check(calls[0].link === token, "…the token went in the X-Order-Link header");
    const page = answered.find((a) => a.url.endsWith(`/api/d/${SLUG}`));
    check(page && /noindex/.test(page.headers["x-robots-tag"] ?? ""), "the API said noindex");
    check(page && /no-store/.test(page.headers["cache-control"] ?? ""), "…and private, no-store");

    // Download: the button fetches the PDF with the link in the header.
    const before = answered.length;
    await click("[...document.querySelectorAll('button.cx-btn')].find(x => x.textContent.includes(" + JSON.stringify(WORDS.download) + "))");
    await until(`document.querySelectorAll('button.cx-btn').length > 0 && !document.querySelector('button.cx-btn')?.disabled`, "the download to finish");
    const pdf = answered.slice(before).find((a) => a.url.endsWith("/pdf"));
    check(pdf && pdf.status === 200 && pdf.type === "application/pdf", "the button fetched the PDF (200, application/pdf)");
    const asked = sent.filter((c) => c.url.endsWith("/pdf"));
    check(asked.length === 1 && asked[0].link === token && !asked[0].url.includes("?"), "…with the token in the header and not in the address");
    check((await count(".cx-error")) === 0, "…and no error is shown");
    await b.view(375, 812, true, "dark");
    await open(`${BASE}/d/${SLUG}?t=${token}`, ".cx-card");
    await shot("02-receipt-dark");
    await axe("receipt-dark");
    await b.view(320, 640, true, "light");
    await open(`${BASE}/d/${SLUG}?t=${token}`, ".cx-card");
    await noSideScroll("the good link at 320 px");
    await b.view(375, 812, true, "light");
  });

  // 2. An invoice that still has a balance.
  await run("invoice with a balance", async () => {
    await open(`${BASE}/d/${SLUG}?t=${good(docs.invoice.id)}`, ".cx-card");
    const text = await visibleText();
    check(text.includes(docs.invoice.number) && text.includes(WORDS.due), `shows the invoice and its balance ("${WORDS.due}")`);
    check(AR ? text.includes("130.00 ر.ق") : text.includes("QAR 130.00"), "the balance is the total less the 100.00 paid");
    check(AR ? text.includes("تحويل مصرفي") : text.includes("Bank transfer"), "says how the part payment was made");
    await noSideScroll("the invoice");
    await shot("03-invoice-balance");
    await axe("invoice");
  });

  // 3. A cancelled receipt and the credit note that cancelled it.
  await run("cancelled receipt", async () => {
    await open(`${BASE}/d/${SLUG}?t=${good(docs.cancelled.id)}`, ".cx-card");
    const text = await visibleText();
    check(text.includes(WORDS.cancelled) && text.includes(docs.note.number), "says it was cancelled and by which credit note");
    check((await count(".cx-status.off")) === 1, "the cancelled state is a word on a pill, not only a colour");
    await noSideScroll("the cancelled receipt");
    await shot("04-cancelled");
    await axe("cancelled");
    await open(`${BASE}/d/${SLUG}?t=${good(docs.note.id)}`, ".cx-card");
    const note = await visibleText();
    check(note.includes(docs.note.number) && note.includes(WORDS.against) && note.includes(docs.cancelled.number), "the credit note says which document it is against");
    await shot("05-credit-note");
  });

  // 4. A link that has expired, one that was edited, and ones made for other pages.
  await run("expired link", async () => {
    await friendly("expired link", `${BASE}/d/${SLUG}?t=${sign(docs.receipt.id, { expiresAt: now() - 60 })}`, WORDS.expired);
    await shot("06-expired");
    await axe("expired");
    await b.view(375, 812, true, "dark");
    await friendly("expired link, dark", `${BASE}/d/${SLUG}?t=${sign(docs.receipt.id, { expiresAt: now() - 60 })}`, WORDS.expired);
    await shot("07-expired-dark");
    await b.view(375, 812, true, "light");
  });
  await run("tampered link", async () => {
    const t = good(docs.receipt.id);
    await friendly("tampered link", `${BASE}/d/${SLUG}?t=${t.slice(0, -3)}${t.endsWith("AAA") ? "BBB" : "AAA"}`, WORDS.invalid);
    await shot("08-tampered");
    await axe("tampered");
  });
  await run("link for another page", async () => {
    await friendly("order link", `${BASE}/d/${SLUG}?t=${sign(docs.receipt.id, { purpose: 1, expiresAt: now() + 3600 })}`, WORDS.invalid);
    await friendly("booking link", `${BASE}/d/${SLUG}?t=${sign(docs.receipt.id, { purpose: 2, expiresAt: now() + 3600 })}`, WORDS.invalid);
    await shot("09-other-page");
  });
  await run("bare ID and garbage", async () => {
    await friendly("bare document ID", `${BASE}/d/${SLUG}?t=${docs.receipt.id}`, WORDS.invalid);
    await friendly("garbage", `${BASE}/d/${SLUG}?t=${encodeURIComponent("<b>x</b> ünï")}`, WORDS.invalid);
    check(sent.filter((c) => c.url.includes(docs.receipt.id)).length === 0, "the document's ID was never sent anywhere in an address");
  });

  // 5. No link at all, and a shop that does not exist.
  await run("no link", async () => {
    await open(`${BASE}/d/${SLUG}`);
    const text = await visibleText();
    check(text.includes(WORDS.none), `says "${WORDS.none}"`);
    check((await count("button.cx-btn")) === 0, "no download button");
    await noSideScroll("no link");
    await shot("10-no-link");
  });
  await run("unknown shop", async () => {
    await b.go(`${BASE}/d/no-such-shop?t=${token}`, 900);
    await until("!!document.querySelector('.cx-empty')", "the empty page");
    check((await visibleText()).includes(WORDS.notFound) || (await visibleText()).includes("This page was not found"), "an unknown shop gives 'not found'");
  });

  // 6. The link runs out while the page is open: the download says so.
  await run("link runs out while open", async () => {
    const short = sign(docs.receipt.id, { expiresAt: now() + 4 });
    await open(`${BASE}/d/${SLUG}?t=${short}`, ".cx-card");
    await b.sleep(5500);
    await click("[...document.querySelectorAll('button.cx-btn')].find(x => x.textContent.includes(" + JSON.stringify(WORDS.download) + "))");
    await until("!!document.querySelector('.cx-warn[role=alert]')", "the notice");
    const text = await visibleText();
    check(text.includes(WORDS.expired), "a link that ran out while open turns the page into the friendly 'expired' page");
    await shot("11-ran-out-while-open");
  });

  check(b.problems.length === 0, `no errors in the browser's console (${b.problems.length})`);
  for (const p of b.problems.slice(0, 8)) log("   ", p);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED:", error.message ?? error);
  try { await b.shot(`${OUT}/${LANG}-99-where-it-stopped.png`); } catch { /* the page is gone */ }
} finally {
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nAll checks passed.");
