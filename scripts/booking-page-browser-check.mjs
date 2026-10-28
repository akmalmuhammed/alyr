// Runs the customer's booking page (ALY-133) in a real browser at phone width, in English or
// Arabic, and checks what a customer experiences with each kind of link: a good one (the page
// greets them and books for them), an expired one, a tampered one, an order link forwarded
// from the same customer, the old `?c=<contact id>` link, and the public link with no
// customer. A link that cannot be used must give a clear, friendly page that says to ask the
// shop for a new one, never an error. Headless Edge over the DevTools protocol
// (scripts/browser-kit.mjs), no packages. Node 22.
//
//   node scripts/booking-page-browser-check.mjs --lang en --base http://localhost:3141 \
//        --api http://127.0.0.1:8341 --out C:/t/lk/shots --profile C:/t/lk/p-en --port 9631 \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on its own database (never the shared one) and a web app pointed at it
// (docs/status.md, "Live testing from the laptop"), and `docker` to set the shop's WhatsApp
// number in that database (`--db`, `--pg`). It resets the demo shop first. A good link comes
// from the chat simulator, as a customer gets one; the expired one is signed here with the
// development key (`--secret`), which also checks that the token format is what the API reads.
// The Edge it starts uses its own profile folder (`--profile`) and a debugging port nobody
// else is on (`--port`); keep both short, because Edge fails quietly with long paths.

import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3141";
const API = args.api ?? "http://127.0.0.1:8341";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const OUT = args.out ?? `${tmpdir()}/booking-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/booking-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9632 : 9631));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr_links_dev";
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
async function api(path, method = "GET", body) {
  const response = await fetch(`${API}${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const setWhatsapp = (digits) => sql(`insert into shop_settings (tenant_id, whatsapp_number) values ('${TENANT}', '${digits}') on conflict (tenant_id) do update set whatsapp_number = '${digits}'`);

// A token signed here, to a layout the API did not hand us: version 2, a purpose, the contact,
// an expiry, and the first 16 bytes of HMAC-SHA256 over a context, the shop and the payload.
const b64u = (buffer) => buffer.toString("base64url");
const uuidBytes = (id) => Buffer.from(id.replaceAll("-", ""), "hex");
function sign(contactId, { purpose = 2, expiresAt }) {
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(expiresAt);
  const payload = Buffer.concat([Buffer.from([2, purpose]), uuidBytes(contactId), expires]);
  const mac = createHmac("sha256", SECRET).update(Buffer.concat([Buffer.from("alyr-link-v2\0"), uuidBytes(TENANT), payload])).digest().subarray(0, 16);
  return `${b64u(payload)}.${b64u(mac)}`;
}
const now = () => Math.floor(Date.now() / 1000);
const contactIn = (token) => {
  const bytes = Buffer.from(token.split(".")[0], "base64url");
  const hex = bytes.subarray(2, 18).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
async function chatLink(phone, words, page) {
  const sent = await api("/sim/messages", "POST", { from_number: phone, text: words });
  const body = sent.messages.map((m) => m.body).filter((x) => x.includes(`/${page}/${SLUG}?t=`)).at(-1);
  return body.split("?t=")[1].split(/\s/)[0];
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

// What the page sent to the API: the address, the header with the customer's link, the body.
const sent = [];
b.on("Network.requestWillBeSent", (p) => {
  if (p.request.url.includes("/api/book/")) sent.push({ method: p.request.method, url: p.request.url, link: p.request.headers["x-order-link"] ?? p.request.headers["X-Order-Link"] ?? null, body: p.request.postData ?? null });
});

const WORDS = AR
  ? { greeting: "الحجز باسم", expired: "انتهت صلاحية رابط الحجز", invalid: "رابط الحجز هذا غير صالح", confirm: "تأكيد الحجز", booked: "تم تأكيد الحجز", ask: "راسل المتجر على واتساب", start: "للحجز، ابدأ من واتساب", open: "افتح هذه الصفحة من الرابط", wa: "https://wa.me/97455550100?text=%D8%AD%D8%AC%D8%B2" }
  : { greeting: "Booking as", expired: "This booking link has expired", invalid: "This booking link is not valid", confirm: "Confirm booking", booked: "confirmed", ask: "Message the shop on WhatsApp", start: "To book, start on WhatsApp", open: "Open this page from the link in your chat", wa: "https://wa.me/97455550100?text=Book" };
const askLink = () => js("document.querySelector('a.cx-btn[href^=\"https://wa.me/\"]')?.href ?? ''");

/** The page for a link that cannot be used: friendly words, the way to ask, nothing to book with. */
async function friendly(name, url, sentence) {
  await b.go(url, 900);
  await until("!!document.querySelector('.cx-warn[role=alert]')", "the notice");
  const text = await visibleText();
  check(text.includes(sentence), `${name}: says "${sentence}"`);
  check(text.includes(AR ? "رابط جديد" : "get a new one"), `${name}: says to get a new one`);
  check((await count("[role=radiogroup], .cx-bar, .cx-time, .cx-choice")) === 0, `${name}: nothing to book with`);
  check(!/error|exception|undefined|null|404|500|Traceback|\{"detail"/i.test(text), `${name}: no error dump`);
  check((await js("document.querySelector('.cx')?.lang")) === LANG, `${name}: the page is in ${AR ? "Arabic" : "English"}`);
  check((await js("document.querySelector('.cx')?.dir")) === (AR ? "rtl" : "ltr"), `${name}: reads ${AR ? "right to left" : "left to right"}`);
  await noSideScroll(name);
}

try {
  await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" });
  await b.send("Emulation.setUserAgentOverride", { userAgent: await js("navigator.userAgent"), acceptLanguage: AR ? "ar-QA,ar" : "en-GB,en" });
  await api("/sim/reset", "POST", {});
  setWhatsapp("");
  const people = (await api("/api/ledger/summary")).customers.filter((c) => c.phone);
  const me = AR ? people[1] : people.find((c) => c.phone === "97455500001") ?? people[0];
  await b.view(375, 812, true, "light");

  // The customer asks to book in their chat (in Arabic, so their language is remembered) and
  // gets their own link. Another customer gets an order link, which the first could forward.
  const good = await chatLink(me.phone, AR ? "أريد حجز موعد" : "I want to book a visit", "b");
  const orderToken = await chatLink(me.phone, AR ? "اطلب" : "order", "s");
  const mine = contactIn(good);
  check(mine === me.id, "the link the chat sent names this customer");
  check(contactIn(orderToken) === mine, "…and an order link of theirs would show the same contact ID to whoever holds it");
  check(good.split(".").length === 2 && !good.includes(mine), "the booking link holds a token, not the contact ID");
  // Signed here with the key and the layout, so the API's reading is checked against another maker.
  const signedHere = sign(mine, { expiresAt: now() + 3600 });
  const probe = await (await fetch(`${API}/api/book/${SLUG}`, { headers: { "x-order-link": signedHere } })).json();
  check(probe.link.state === "ok" && probe.customer.name === me.name, "a token signed outside the API (same layout, same key) is read as good");
  const expired = sign(mine, { expiresAt: now() - 60 });
  const tampered = good.slice(0, -3) + (good.endsWith("AAA") ? "BBB" : "AAA");
  const forwarded = orderToken;

  // 1. A good link: greeted by name, in their language, and a booking made through the page.
  await run("good link", async () => {
    await b.go(`${BASE}/b/${SLUG}?t=${good}`, 900);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    const text = await visibleText();
    check(text.includes(WORDS.greeting) && text.includes(me.name), `greets the customer by name (${me.name})`);
    check((await js("document.querySelector('.cx')?.lang")) === LANG, "opens in the customer's own language");
    check((await count(".cx-choice")) === 3, "the three services are listed");
    check(!text.includes(WORDS.open), "no 'open this page from your chat' notice");
    check((await js("document.querySelector('meta[name=referrer]')?.content")) === "no-referrer", "the page tells the browser to send no referrer");
    await noSideScroll("the good link");
    await shot("01-good-link");
    await axe("good-link");

    // The page sent the customer's link in a header, never in an address, and no contact ID.
    const calls = sent.filter((c) => c.method === "GET");
    check(calls.length > 0 && calls.every((c) => !c.url.includes("?t=") && !c.url.includes(good) && !c.url.includes(mine)), "no request address of the page holds the token or the contact ID");
    check(calls[0].link === good, "…the token went in the X-Order-Link header");

    // Choose a service, a day with free times, a time; then book.
    await click("document.querySelector('.cx-choice')");
    await until("document.querySelectorAll('.cx-day').length > 0", "the days");
    let times = 0;
    for (let i = 1; i < 10 && times === 0; i++) {
      await click(`document.querySelectorAll('.cx-day')[${i}]`);
      await until("!!(document.querySelector('.cx-time') || document.querySelector('.cx-note'))", "the times");
      times = await count(".cx-time");
    }
    check(times > 0, `free times are shown (${times})`);
    await click("document.querySelector('.cx-time')");
    await until("!!document.querySelector('.cx-bar')", "the confirm bar");
    check((await js("document.querySelector('.cx-bar .cx-btn').disabled")) === false, "Confirm is enabled for a customer who has a link");
    await shot("02-good-link-chosen");
    await click("document.querySelector('.cx-bar .cx-btn')");
    await until("!!document.querySelector('.cx-done')", "the confirmation");
    const done = await visibleText();
    check(done.includes(WORDS.booked), "the booking is confirmed on the page");
    await shot("03-booked");
    const post = sent.find((c) => c.method === "POST");
    check(post && JSON.parse(post.body).token === good && !("contact_id" in JSON.parse(post.body)) && !post.body.includes(mine), "the booking request carries the token and no contact ID");
    const listed = await api(`/api/bookings?first=${new Date().toISOString().slice(0, 10)}&last=${new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)}`);
    check(listed.bookings.length === 1 && listed.bookings[0].customer === me.name, "the shop's diary has the booking, under this customer");
    await axe("booked");
  });

  // 2. A link that has expired: a calm page that says so and says what to do.
  await run("expired link", async () => {
    await friendly("expired link", `${BASE}/b/${SLUG}?t=${expired}`, WORDS.expired);
    check((await askLink()) === "", "no WhatsApp button while the shop has no number on record");
    await shot("04-expired-no-number");
    setWhatsapp("97455550100");
    await b.go(`${BASE}/b/${SLUG}?t=${expired}`, 900);
    await until("!!document.querySelector('.cx-warn[role=alert]')", "the notice");
    check((await askLink()) === WORDS.wa, "with the shop's number, a button opens the shop's WhatsApp with the word the chat answers");
    check((await visibleText()).includes(WORDS.ask), "…and says what it is for");
    await shot("05-expired");
    await axe("expired");
    // The same page, dark.
    await b.view(375, 812, true, "dark");
    await b.go(`${BASE}/b/${SLUG}?t=${expired}`, 900);
    await shot("06-expired-dark");
    await b.view(375, 812, true, "light");
  });

  // 3. A tampered link, a forwarded order link, and the old bare-contact-ID link: all "not valid".
  await run("tampered link", async () => {
    await friendly("tampered link", `${BASE}/b/${SLUG}?t=${tampered}`, WORDS.invalid);
    await shot("07-tampered");
    await axe("tampered");
  });
  await run("order link forwarded", async () => {
    await friendly("forwarded order link", `${BASE}/b/${SLUG}?t=${forwarded}`, WORDS.invalid);
    await shot("08-order-link");
  });
  await run("old contact ID link", async () => {
    await friendly("old ?c= link", `${BASE}/b/${SLUG}?c=${mine}`, WORDS.invalid);
    await shot("09-old-link");
    check(sent.filter((c) => c.url.includes(mine)).length === 0, "the old link's contact ID was never sent anywhere");
  });
  await run("garbage link", async () => {
    await friendly("garbage link", `${BASE}/b/${SLUG}?t=${encodeURIComponent("<b>x</b> ünï")}`, WORDS.invalid);
    await friendly("empty-ish link", `${BASE}/b/${SLUG}?t=.`, WORDS.invalid);
  });

  // 4. The public link: the services and the times for anyone; nobody can book; the way to a link.
  await run("public link", async () => {
    await b.go(`${BASE}/b/${SLUG}`, 900);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    const text = await visibleText();
    check(text.includes(WORDS.start), "says to start on WhatsApp for a booking link of your own");
    check((await askLink()) === WORDS.wa, "…with the button to the shop's WhatsApp");
    check(!text.includes(WORDS.greeting), "the page does not name anyone");
    await click("document.querySelector('.cx-choice')");
    await until("document.querySelectorAll('.cx-day').length > 0", "the days");
    let times = 0;
    for (let i = 1; i < 10 && times === 0; i++) {
      await click(`document.querySelectorAll('.cx-day')[${i}]`);
      await until("!!(document.querySelector('.cx-time') || document.querySelector('.cx-note'))", "the times");
      times = await count(".cx-time");
    }
    await click("document.querySelector('.cx-time')");
    await until("!!document.querySelector('.cx-bar')", "the confirm bar");
    check((await js("document.querySelector('.cx-bar .cx-btn').disabled")) === true, "Confirm is disabled without a customer");
    await shot("10-public");
    await axe("public");
    setWhatsapp("");
    await b.go(`${BASE}/b/${SLUG}`, 900);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    check((await visibleText()).includes(WORDS.open), "with no number on record it says to open the page from the link in the chat");
  });

  // 5. The link stops working while the page is open: the booking is refused and the page says so.
  await run("link runs out while open", async () => {
    setWhatsapp("97455550100");
    await b.send("Fetch.enable", { patterns: [{ urlPattern: `*/api/book/${SLUG}`, requestStage: "Request" }] });
    const swap = (p) => {
      if (p.request.method !== "POST") return b.send("Fetch.continueRequest", { requestId: p.requestId });
      // The same booking, with the link replaced by one that has just run out.
      const body = JSON.parse(p.request.postData);
      body.token = expired;
      return b.send("Fetch.continueRequest", { requestId: p.requestId, postData: Buffer.from(JSON.stringify(body)).toString("base64") });
    };
    b.on("Fetch.requestPaused", swap);
    const second = people.find((c) => c.id !== me.id);
    const another = await chatLink(second.phone, AR ? "أريد حجز موعد" : "I want to book a visit", "b");
    await b.go(`${BASE}/b/${SLUG}?t=${another}${AR ? "&lang=ar" : ""}`, 900);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    await click("document.querySelector('.cx-choice')");
    await until("document.querySelectorAll('.cx-day').length > 0", "the days");
    let times = 0;
    for (let i = 3; i < 12 && times === 0; i++) {
      await click(`document.querySelectorAll('.cx-day')[${i % 14}]`);
      await until("!!(document.querySelector('.cx-time') || document.querySelector('.cx-note'))", "the times");
      times = await count(".cx-time");
    }
    await click("document.querySelector('.cx-time')");
    await until("!!document.querySelector('.cx-bar')", "the confirm bar");
    await click("document.querySelector('.cx-bar .cx-btn')");
    await until("!!document.querySelector('.cx-warn[role=alert]')", "the notice");
    const text = await visibleText();
    check(text.includes(WORDS.expired), "a link that ran out while open turns the page into the friendly 'expired' page");
    check((await count(".cx-done")) === 0, "…and no booking is shown as made");
    const diary = await api(`/api/bookings?first=${new Date().toISOString().slice(0, 10)}&last=${new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)}`);
    check(diary.bookings.filter((x) => x.customer === second.name).length === 0, "…and none was made");
    await shot("11-ran-out-while-open");
    await b.send("Fetch.disable");
  });

  check(b.problems.length === 0, `no errors in the browser's console (${b.problems.length})`);
  for (const p of b.problems.slice(0, 8)) log("   ", p);
} catch (error) {
  failures.push(String(error.message ?? error));
  log("STOPPED:", error.message ?? error);
  try { await b.shot(`${OUT}/${LANG}-99-where-it-stopped.png`); } catch { /* the page is gone */ }
} finally {
  setWhatsapp("");
  await b.close();
}
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nAll checks passed.");
