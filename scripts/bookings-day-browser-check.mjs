// Runs the Bookings day view (ALY-27, D-084, spec 033) and the customer's booking and deposit
// pages in a real browser, in English or Arabic, and checks what an owner and a customer meet:
// the day by stylist, a walk-in added and a booking moved from the screen, the setup panel,
// then "Anyone" or a person, the deposit and the shop's rule before paying, the held booking,
// the payment page and the paid state. Headless Edge over the DevTools protocol
// (scripts/browser-kit.mjs), no packages. Node 22.
//
//   node scripts/bookings-day-browser-check.mjs --lang en --base http://localhost:3127 \
//        --api http://127.0.0.1:8127 --pg alyr27-pg --out C:/t/bk27/shots --profile C:/t/bk27/p-en \
//        --port 9727 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on its own database with the live salon seeded
// (`python -m alyr.seed_bookings salon`) and a web app pointed at it, and `docker` to read a
// customer of the salon from that database (`--pg`, `--db`). It signs in as the salon's owner
// through the API's local sign-in (a developer machine hands the code back). Run it once per
// language; reseed between runs for the same pictures.

import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3127";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const OUT = args.out ?? `${tmpdir()}/bookings-day-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/bookings-day-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9728 : 9727));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr";
const PG = args.pg ?? "alyr27-pg";
const SECRET = args.secret ?? ["alyr", "local", "development", "link", "key", "not", "for", "real", "use"].join("-");
const TENANT = "0a1f0000-0000-4000-8000-0000000501a0"; // Dafira Salon (fictional)
const SLUG = "dafira";
const OWNER = "lamees@dafira.example";
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-c", text], { encoding: "utf8" }).trim();

// A booking link for one customer, signed with the development key, as the chat would send it.
const uuidBytes = (id) => Buffer.from(id.replaceAll("-", ""), "hex");
function bookingToken(contactId) {
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(Math.floor(Date.now() / 1000) + 86400);
  const payload = Buffer.concat([Buffer.from([2, 2]), uuidBytes(contactId), expires]);
  const mac = createHmac("sha256", SECRET).update(Buffer.concat([Buffer.from("alyr-link-v2\0"), uuidBytes(TENANT), payload])).digest().subarray(0, 16);
  return `${payload.toString("base64url")}.${mac.toString("base64url")}`;
}

const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, width: 1440, height: 900, scheme: "light" });
const { js, until, click } = b;
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${name}.png`); log("shot", name); };
const text = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
async function noSideScroll(name) {
  const wide = await js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth");
  check(wide <= 0, `no sideways scrolling on ${name}${wide > 0 ? ` (${wide}px too wide)` : ""}`);
}
async function axe(name) {
  const found = await b.axe(AXE);
  if (found === null) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  writeFileSync(`${OUT}/${LANG}-axe-${name}.json`, JSON.stringify(found, null, 2));
  const serious = found.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(serious.length === 0, `axe: no serious violations on ${name} (${found.length} found in all)`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
const run = async (name, fn) => {
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name}-stopped`); } catch { /* the page is gone */ }
  }
};
/** Set a React-controlled select or input by its id, as a person choosing would. */
const choose = (id, value) => js(`(() => { const el = document.getElementById(${JSON.stringify(id)}); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); return el.value; })()`);
const W = AR
  ? { reem: "ريم", huda: "هدى", noor: "نور", add: "إضافة حضور مباشر", added: "تمت إضافة الحجز", moved: "تم تغيير الموعد", setup: "إعداد الحجوزات", anyone: "أي أحد", deposit: "عربون", rule: "يحتفظ المحل بالعربون", standIn: "صفحة دفع تجريبية", held: "محجوز لك", pay: "ادفع العربون", paid: "تم دفع", who: "اختر من يخدمك", payTo: "عربون الحجز رقم" }
  : { reem: "Reem", huda: "Huda", noor: "Noor", add: "Add a walk-in", added: "Booking added", moved: "Moved", setup: "Set up bookings", anyone: "Anyone", deposit: "Deposit", rule: "the shop keeps the deposit", standIn: "test payment page", held: "is held for you", pay: "Pay the deposit", paid: "Paid", who: "Choose who", payTo: "Deposit for booking" };

try {
  await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" });

  await run("sign in as the salon's owner", async () => {
    await b.go(`${BASE}/login`, 800);
    const signed = await js(`(async () => {
      localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)});
      // A session this profile already has is reused: sign-in codes are limited per hour.
      const me = await (await fetch('/api/auth/me')).json().catch(() => ({}));
      if (me.email === ${JSON.stringify(OWNER)}) return 200;
      const code = (await (await fetch('/api/auth/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(OWNER)} }) })).json()).dev_code;
      const r = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(OWNER)}, code }) });
      localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)});
      return r.status; })()`);
    check(signed === 200, "signed in through the API's local sign-in");
  });

  await run("the day by stylist, laptop width", async () => {
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("document.querySelectorAll('.bk-col').length > 0", "the day view");
    const heads = await js("[...document.querySelectorAll('.bk-colhead h3')].map((h) => h.textContent)");
    check(JSON.stringify(heads) === JSON.stringify([W.reem, W.huda, W.noor]), `one column per stylist (${heads.join(", ")})`);
    check((await js("document.querySelector('.bk')?.closest('[dir]')?.dir")) === (AR ? "rtl" : "ltr"), "the screen reads in its language's direction");
    check((await js("document.querySelectorAll('.btn.volt').length")) === 1, "one Volt button on the view");
    await noSideScroll("day view 1440");
    await shot("01-day-1440");
    // Tomorrow has visits side by side.
    await click("document.querySelector('.bk-nav button:last-of-type')", 1200);
    await until("document.querySelectorAll('.bk-card').length > 2", "tomorrow's bookings");
    const times = await js("[...document.querySelectorAll('.bk-col')].map((c) => [...c.querySelectorAll('.bk-when')].map((w) => w.textContent.split('–')[0]))");
    const flat = times.flat();
    check(new Set(flat).size < flat.length, "the same time is booked on two stylists");
    check((await text()).includes(W.deposit), "a deposit is shown on a booking");
    await shot("02-tomorrow-1440");
    await axe("day-view");
  });

  await run("a walk-in added from the screen", async () => {
    await click("document.querySelector('.btn.volt')", 500);
    await until("!!document.getElementById('bk-add-service')", "the walk-in form");
    // Before opening: nobody is booked then, and staff may write a walk-in at any minute.
    await choose("bk-add-time", "08:05");
    await click("document.getElementById('bk-add-name')");
    await b.type(AR ? "منى ك." : "Mona K.");
    await click("document.getElementById('bk-add-phone')");
    await b.type("55661234");
    await shot("03-walk-in-form");
    await click("document.querySelector('.bk-form button[type=submit]')", 1500);
    await until(`document.querySelector('.bk-said')?.textContent.includes(${JSON.stringify(W.added)})`, "the walk-in saved");
    check((await text()).includes(AR ? "حضور مباشر" : "Walk-in"), "the walk-in is on the day, marked as one");
  });

  await run("a booking moved to another stylist", async () => {
    await click("[...document.querySelectorAll('.bk-col')][0].querySelector('.bk-card.is-booked .bk-acts button:nth-last-child(2)')", 500);
    const id = await js("document.querySelector('.bk-form.inline select')?.id");
    const other = await js(`[...document.getElementById(${JSON.stringify(id)}).options].map((o) => o.value).filter(Boolean)[2]`);
    await choose(id, other);
    await shot("04-move-form");
    await click("document.querySelector('.bk-form.inline button[type=submit]')", 1500);
    const said = await js("document.querySelector('.bk-said')?.textContent ?? ''");
    const error = await js("document.querySelector('.bk-error')?.textContent ?? ''");
    check(said.includes(W.moved) || error.length > 0, `the move is saved or refused in words (${said || error})`);
  });

  await run("setup, for the owner", async () => {
    await click(`[...document.querySelectorAll('.bk-setup > button')].find((x) => x.textContent.includes(${JSON.stringify(W.setup)}))`, 1200);
    await until("!!document.querySelector('.bk-setup-body h2')", "the setup panel");
    check((await js("document.querySelectorAll('.bk-person').length")) >= 3, "people and services are listed");
    check((await text()).toLowerCase().includes(AR ? "ما يقرؤه العميل" : "the customer reads"), "the rule shows the customer's sentence");
    await shot("05-setup-1440");
    await noSideScroll("setup 1440");
    await axe("setup");
  });

  await run("the day at phone width, light and dark", async () => {
    await b.view(390, 844, true, "light");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("document.querySelectorAll('.bk-col').length > 0", "the day view");
    await noSideScroll("day view 390");
    await shot("06-day-390");
    const small = await js("[...document.querySelectorAll('.bk .btn')].filter((x) => x.offsetParent && x.getBoundingClientRect().height < 44).length");
    check(small === 0, `buttons are at least 44 px tall on a phone (${small} smaller)`);
    await b.view(390, 844, true, "dark");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("document.querySelectorAll('.bk-col').length > 0", "the day view");
    await shot("07-day-390-dark");
    await axe("day-view-dark");
    await b.view(1440, 900, false, "dark");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("document.querySelectorAll('.bk-col').length > 0", "the day view");
    await shot("08-day-1440-dark");
    await b.view(1440, 900, false, "light");
  });

  const contact = sql(`select id from contacts where tenant_id = '${TENANT}' and role = 'customer' and phone is not null and lang = '${LANG}' order by name limit 1`);
  const link = `${BASE}/b/${SLUG}?t=${bookingToken(contact)}`;

  await run("the customer books a person and sees the deposit before paying", async () => {
    await b.view(390, 844, true, "light");
    await b.go(link, 1500);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    await click(`[...document.querySelectorAll('.cx-choice')].find((x) => x.textContent.includes(${JSON.stringify(AR ? "صبغة شعر" : "Hair colour")}))`, 600);
    check((await text()).includes(W.who), "the page asks who, for a service several people do");
    check((await text()).includes(W.anyone), "Anyone is offered");
    await click(`[...document.querySelectorAll('[role=radiogroup][aria-label=${JSON.stringify(W.who)}] .cx-choice')].find((x) => x.textContent.includes(${JSON.stringify(W.huda)}))`, 400);
    // The first day ahead with a free time for her.
    for (let d = 1; d < 10; d += 1) {
      await click(`document.querySelectorAll('.cx-day')[${d}]`, 900);
      await until("document.querySelectorAll('.cx-time').length > 0 || [...document.querySelectorAll('.cx-note')].length > 0", "the times");
      if (await js("document.querySelectorAll('.cx-time').length > 0")) break;
    }
    await click("document.querySelector('.cx-time')", 600);
    const words = await text();
    check(words.includes(W.rule), "the shop's deposit rule is shown before confirming");
    check(words.toLowerCase().includes(W.standIn.toLowerCase()), "it says card payments start with the shop's provider");
    check(!/[\u0660-\u0669]/.test(words), "Western digits only");
    await noSideScroll("booking page 390");
    await js("scrollTo(0, document.documentElement.scrollHeight)");
    await sleep(300);
    const clear = await js("(() => { const d = document.querySelector('.cx-deposit')?.getBoundingClientRect(); const bar = document.querySelector('.cx-bar')?.getBoundingClientRect(); return !!d && !!bar && d.bottom <= bar.top + 1; })()");
    check(clear, "the deposit's rule can be scrolled clear of the bottom bar");
    await shot("09b-booking-deposit-scrolled-390");
    await js("scrollTo(0, 0)");
    await shot("09-booking-deposit-390");
    await axe("booking-page");
    await click("document.querySelector('.cx-bar .cx-btn')", 1500);
    await until(`document.body.innerText.includes(${JSON.stringify(W.held)})`, "the held booking");
    check((await text()).includes(W.huda), "the held booking says who it is with");
    await shot("10-held-390");
    await click("document.querySelector('a.cx-btn[href^=\"/pay/\"]')", 1500);
    await until(`document.body.innerText.includes(${JSON.stringify(W.payTo)})`, "the payment page");
    const pay = await text();
    check(pay.includes(W.rule), "the payment page shows the rule again");
    await shot("11-pay-390");
    await b.view(320, 700, true, "light");
    await noSideScroll("payment page 320");
    await shot("12-pay-320");
    await click("document.querySelector('button.cx-btn')", 1500);
    await until(`document.body.innerText.includes(${JSON.stringify(W.paid)})`, "paid");
    await shot("13-paid-320");
  });

  await run("the booking page at 320 px", async () => {
    await b.view(320, 700, true, "light");
    await b.go(link, 1500);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    await noSideScroll("booking page 320");
    await shot("14-booking-320");
  });
} finally {
  await b.close();
}

if (failures.length) {
  console.log(`\n[${LANG}] ${failures.length} failed:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`\n[${LANG}] all checks passed`);
