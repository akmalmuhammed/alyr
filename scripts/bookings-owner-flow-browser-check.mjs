// The bookings owner's first week, in a real browser (ALY-259, D-140, spec 043): a salon signs up,
// then runs its bookings from the workspace without asking ALYR for anything, and a customer
// books on the booking page what the owner set up. English or Arabic; 1440 and 390 px; light
// and dark; headless Edge over the DevTools protocol (scripts/browser-kit.mjs), no packages.
// Node 22.
//
//   node scripts/bookings-owner-flow-browser-check.mjs --lang en --stages 1 \
//        --base http://localhost:3259 --pg alyr259-pg --db alyr --out C:/t/bk259/shots \
//        --profile C:/t/bk259/p-en --port 9759 --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on its own database (`python -m alyr.migrate`) with sign-up open (a developer
// machine is open) and a web app pointed at it, and `docker` to read and write that database
// (`--pg` names its container). Each run makes its own salon, so it can be run again and again.
// `--stages` says how much of the owner's week to walk: 1 is the services; later stages add the
// opening hours and days off, the desk, and the people and chairs.

import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3259";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const STAGES = String(args.stages ?? "1");
const stage = (n) => STAGES.split(",").some((s) => Number(s) >= n);
const OUT = args.out ?? `${tmpdir()}/bookings-owner-flow-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/bookings-owner-flow-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9760 : 9759));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr";
const PG = args.pg ?? "alyr259-pg";
const SECRET = args.secret ?? ["alyr", "local", "development", "link", "key", "not", "for", "real", "use"].join("-");
const RUN = Date.now().toString(36);
const EMAIL = `owner.${RUN}.${LANG}@flow.example`;
const SHOP = AR ? "استوديو نور للشعر" : "Noor Hair Studio";
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-c", text], { encoding: "utf8" }).trim();

const W = AR
  ? {
    setup: "إعداد الحجوزات", back: "العودة إلى اليوم", services: "الخدمات", addService: "إضافة خدمة", addSave: "إضافة الخدمة",
    save: "حفظ", hide: "إخفاء", show: "إظهار", hideYes: "إخفاء الخدمة", name: "الاسم", nameAr: "الاسم بالعربية",
    thread: "تشذيب الحاجبين", threadEn: "Eyebrow threading", needName: "اكتب اسم الخدمة", badLength: "المدة عدد صحيح من الدقائق",
    needPrice: "النسبة من السعر تحتاج إلى سعر", added: "تمت إضافة الخدمة", saved: "تم حفظ الخدمة", hidden: "أُخفيت الخدمة",
    shown: "الخدمة ظاهرة الآن", hiddenTag: "مخفية", booked: "تم تأكيد", edit: "تعديل", minutes: "دقيقة", qar: "ر.ق",
    onlyThese: "هؤلاء فقط", needWho: "اختر موظفاً أو كرسياً واحداً على الأقل", addPerson: "إضافة", chooseWho: "اختر من يخدمك",
    addSpan: "إضافة فترة", saveHours: "حفظ الساعات", hoursSaved: "تم حفظ ساعات العمل", overlap: "فترتان تتداخلان",
    sameDays: "الساعات نفسها كل يوم", addClosure: "إضافة أيام إجازة", closureSave: "إضافة", chooseDays: "اختر اليومين",
    closureAdded: "تمت إضافة أيام الإجازة", standing: "المحجوز: 1", seeDay: "فتح اليوم", removeClosure: "إزالة",
    closureRemoved: "أُزيلت أيام الإجازة", closedFor: "مغلق: عيد الفطر", closedOn: "المحل مغلق في هذا اليوم", sunday: "الأحد",
    reasonText: "عيد الفطر", whole: "المحل كله",
    addWalkIn: "إضافة حضور مباشر", endsAt: "ينتهي", addBooking: "إضافة الحجز", bookingAdded: "تمت إضافة الحجز",
    toldSent: "يُبلَّغ العميل عبر واتساب", notAgreed: "لم يوافق بعد على رسائل واتساب", tellYourself: "أبلغه بنفسك",
    nowAt: "الآن", move: "تغيير الموعد", movedDone: "تم تغيير الموعد.", cancel: "إلغاء", confirmCancel: "إلغاء الحجز",
    cancelledDone: "تم الإلغاء.", close: "إغلاق",
  }
  : {
    setup: "Set up bookings", back: "Back to the day", services: "Services", addService: "Add a service", addSave: "Add service",
    save: "Save", hide: "Hide", show: "Show", hideYes: "Hide it", name: "Name", nameAr: "Name in Arabic",
    thread: "Eyebrow threading", threadEn: "Eyebrow threading", needName: "Write the service's name", badLength: "The length is a whole number of minutes",
    needPrice: "A share of the price needs the service to have a price", added: "Service added", saved: "Service saved", hidden: "Hidden. Customers no longer see it",
    shown: "Shown on the booking page", hiddenTag: "Hidden", booked: "confirmed", edit: "Edit", minutes: "min", qar: "QAR",
    onlyThese: "Only these", needWho: "Choose at least one person or chair", addPerson: "Add", chooseWho: "Choose who",
    addSpan: "Add hours", saveHours: "Save hours", hoursSaved: "Opening hours saved", overlap: "Two periods overlap",
    sameDays: "Same hours every day", addClosure: "Add days off", closureSave: "Add", chooseDays: "Choose both days",
    closureAdded: "Days off added", standing: "Still booked: 1", seeDay: "Open the day", removeClosure: "Remove",
    closureRemoved: "Day off removed", closedFor: "Closed: Eid al-Fitr", closedOn: "The shop is closed this day", sunday: "Sunday",
    reasonText: "Eid al-Fitr", whole: "The whole shop",
    addWalkIn: "Add a walk-in", endsAt: "Ends", addBooking: "Add booking", bookingAdded: "Booking added",
    toldSent: "The customer is told on WhatsApp", notAgreed: "has not agreed to WhatsApp messages yet", tellYourself: "Tell them yourself",
    nowAt: "Now", move: "Move", movedDone: "Moved.", cancel: "Cancel", confirmCancel: "Cancel the booking",
    cancelledDone: "Cancelled.", close: "Close",
  };

// A booking link for one customer, signed with the development key, as the chat would send it.
const uuidBytes = (id) => Buffer.from(id.replaceAll("-", ""), "hex");
function bookingToken(tenant, contactId) {
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(Math.floor(Date.now() / 1000) + 86400);
  const payload = Buffer.concat([Buffer.from([2, 2]), uuidBytes(contactId), expires]);
  const mac = createHmac("sha256", SECRET).update(Buffer.concat([Buffer.from("alyr-link-v2\0"), uuidBytes(tenant), payload])).digest().subarray(0, 16);
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
async function touchTargets(name) {
  const small = await js("[...document.querySelectorAll('.bk .btn, .bk-partbtn, .bk-check, .bk-field input, .bk-field select')].filter((x) => x.offsetParent && x.getBoundingClientRect().height < 44).map((x) => (x.className || x.tagName) + ':' + Math.round(x.getBoundingClientRect().height))");
  check(small.length === 0, `touch targets are at least 44 px tall on ${name}${small.length ? ` (${small.slice(0, 4).join(", ")})` : ""}`);
}
const run = async (name, fn) => {
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name.replace(/\W+/g, "-")}-stopped`); } catch { /* the page is gone */ }
  }
};
/** A time or a date box takes its value, not typed characters: set it the way the browser does. */
async function setValue(selector, value) {
  await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
/** Fill a field the way a person does: focus it, replace what is there, type. */
async function fill(selector, value) {
  await click(`document.querySelector(${JSON.stringify(selector)})`, 80);
  await b.clearFocused();
  if (value) await b.type(value);
}
const buttonByText = (label, scope = "document") => `[...${scope}.querySelectorAll('button')].find((x) => x.offsetParent && x.textContent.trim() === ${JSON.stringify(label)})`;
const services = async (slug) => (await js(`fetch('/api/book/${slug}').then((r) => r.json()).then((p) => p.services.map((s) => s.name))`));

let tenant = "";
let slug = "";
try {
  await b.send("Emulation.setLocaleOverride", { locale: AR ? "ar-QA" : "en-GB" });

  await run("sign up a new salon through the real sign-up", async () => {
    // Every run makes a salon and asks for codes, and the sign-up is limited per address (ten an
    // hour): this scratch database's counters start from nothing, as a first visit's would.
    sql("delete from rate_hits");
    await b.go(`${BASE}/login`, 800);
    const made = await js(`(async () => {
      localStorage.setItem('alyr-workspace-lang', ${JSON.stringify(LANG)});
      const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const code = (await (await post('/api/onboarding/code', { email: ${JSON.stringify(EMAIL)} })).json()).dev_code;
      const token = (await (await post('/api/onboarding/verify', { email: ${JSON.stringify(EMAIL)}, code })).json()).signup_token;
      const terms = (await (await fetch('/api/onboarding/terms/current')).json()).current.map((t) => t.id);
      const r = await post('/api/onboarding/business', { signup_token: token, owner_name: 'Reem Test', name: ${JSON.stringify(SHOP)}, name_ar: 'استوديو نور للشعر', type: 'salon', area: 'West Bay', accepted_terms: terms, lang: ${JSON.stringify(LANG)} });
      return [r.status, (await r.json()).created]; })()`);
    check(made[0] === 200, "a new salon is made through the sign-up API");
    tenant = made[1];
    slug = sql(`select slug from tenants where id = '${tenant}'`);
    check(Boolean(slug), `the salon has its booking address (/b/${slug})`);
    // The owner's own words in both languages: an Arabic page needs an Arabic shop name.
    sql(`update tenants set name_ar = 'استوديو نور للشعر' where id = '${tenant}'`);
  });

  await run("the day view of a new shop points at the services", async () => {
    await b.go(`${BASE}/app/bookings`, 1800);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    check((await js("document.querySelector('.bk')?.closest('[dir]')?.dir")) === (AR ? "rtl" : "ltr"), "the screen reads in its language's direction");
    check((await js("document.querySelectorAll('.bk-barbtns .btn')[0]?.textContent.trim()")) === W.setup, "the owner sees Set up bookings beside the walk-in button");
    await shot("01-day-1440");
    await noSideScroll("day view 1440");
  });

  await run("services: the setup lists what the sign-up made", async () => {
    await click(buttonByText(W.setup), 1000);
    await until("document.querySelectorAll('.bk-service').length > 0", "the services");
    const count = await js("document.querySelectorAll('.bk-service').length");
    const expected = Number(sql(`select count(*) from services where tenant_id = '${tenant}'`));
    check(count === expected, `every service of the sign-up is listed (${count} of ${expected})`);
    const parts = await js("[...document.querySelectorAll('.bk-partbtn')].map((x) => x.getAttribute('aria-pressed'))");
    check(parts[0] === "true" && parts.length === 4, "the setup has four parts and opens on the services");
    await shot("02-services-1440");
    await noSideScroll("services 1440");
    await axe("services");
  });

  await run("services: add one with its deposit", async () => {
    await click(`document.getElementById('bk-svc-add')`, 500);
    await until("!!document.getElementById('bk-s-new-n')", "the form");
    check(await js("document.activeElement?.id === 'bk-s-new-n'"), "the keyboard lands in the name field");
    // Refused in the page's words, with nothing sent.
    await click(buttonByText(W.addSave), 300);
    check((await text()).includes(W.needName), "an empty name is refused in words");
    await fill("#bk-s-new-n", "Eyebrow threading");
    await fill("#bk-s-new-a", "تشذيب الحاجبين");
    await fill("#bk-s-new-m", "four");
    await click(buttonByText(W.addSave), 300);
    check((await text()).includes(W.badLength), "a length that is not a number is refused in words");
    await fill("#bk-s-new-m", AR ? "٢٠" : "20");
    await fill("#bk-s-new-p", "");
    await js("(() => { const s = document.getElementById('bk-s-new-k'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'percent'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await until("!!document.getElementById('bk-s-new-d')", "the deposit field");
    await fill("#bk-s-new-d", "20");
    await click(buttonByText(W.addSave), 300);
    check((await text()).includes(W.needPrice), "a share of the price with no price is refused in words");
    await shot("03-add-service-error-1440");
    await fill("#bk-s-new-p", AR ? "٣٠٫٥" : "30.5");
    await click(buttonByText(W.addSave), 1200);
    await until("[...document.querySelectorAll('.bk-service-name b')].some((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))", "the new service in the list");
    check((await text()).includes(W.added), "the page says the service was added");
    const row = await js("[...document.querySelectorAll('.bk-service')].find((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))?.querySelector('.bk-facts')?.textContent");
    check(/30\.50/.test(row ?? "") && /20%/.test(row ?? ""), `its length, price and deposit are shown (${row})`);
    const stored = sql(`select price, deposit_kind, deposit_value, name_ar from services where tenant_id = '${tenant}' and name = 'Eyebrow threading'`);
    check(stored === "3050|percent|20|تشذيب الحاجبين", `it is saved in dirhams with both names (${stored})`);
    await shot("04-service-added-1440");
  });

  await run("services: change the price, hide it, show it again", async () => {
    const label = `${W.edit}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)})`, 500);
    await until("!!document.querySelector('[id^=bk-s-][id$=-p]')", "the edit form");
    await fill("[id^=bk-s-][id$=-p]", "35");
    await click(buttonByText(W.save), 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.saved)})`, "the saved message");
    check(sql(`select price from services where tenant_id = '${tenant}' and name = 'Eyebrow threading'`) === "3500", "the new price is saved");
    const deposit = await js("fetch('/api/services').then((r) => r.json()).then((d) => d.services.find((s) => s.name === 'Eyebrow threading').deposit)");
    check(deposit === 700, `the deposit follows the price (20% of QAR 35 is QAR 7: ${deposit})`);
    const hideLabel = `${W.hide}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${hideLabel}"]`)})`, 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.hidden)})`, "the hidden message");
    check(!(await services(slug)).includes("Eyebrow threading"), "a hidden service is gone from the booking page");
    check((await text()).includes(W.hiddenTag), "it stays in the list, marked hidden");
    await shot("05-service-hidden-1440");
    const showLabel = `${W.show}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${showLabel}"]`)})`, 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.shown)})`, "the shown message");
    check((await services(slug)).includes("Eyebrow threading"), "shown again, it is on the booking page");
  });

  await run("services: who does it, once the shop lists two chairs", async () => {
    await click("document.querySelectorAll('.bk-partbtn')[2]", 600);
    await until("!!document.getElementById('bk-new-n')", "the people part");
    for (const chair of ["Chair 1", "Chair 2"]) {
      await fill("#bk-new-n", chair);
      await click(buttonByText(W.addPerson), 900);
    }
    check(Number(sql(`select count(*) from booking_resources where tenant_id = '${tenant}'`)) === 2, "two chairs are added from the People part");
    await click("document.querySelectorAll('.bk-partbtn')[0]", 600);
    const edit = `${W.edit}: ${AR ? "تشذيب الحاجبين" : "Eyebrow threading"}`;
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${edit}"]`)})`, 500);
    await until("!!document.querySelector('.bk-choices')", "the who-does-it choice");
    check(await js("document.querySelector('.bk-choices input[type=radio]').checked"), "a service starts with everyone doing it");
    await click(`[...document.querySelectorAll('.bk-choices label')].find((x) => x.textContent.includes(${JSON.stringify(W.onlyThese)}))`, 300);
    await until("document.querySelectorAll('.bk-doers input[type=checkbox]').length === 2", "the two chairs to choose from");
    await shot("05b-who-does-it-1440");
    await click(buttonByText(W.save), 300);
    check((await text()).includes(W.needWho), "choosing nobody is refused in words");
    await click("document.querySelectorAll('.bk-doers input[type=checkbox]')[1]", 200);
    await click(buttonByText(W.save), 1200);
    await until(`document.body.innerText.includes(${JSON.stringify(W.saved)})`, "the saved message");
    const who = sql(`select r.name from service_resources sr join booking_resources r on r.id = sr.resource_id where sr.tenant_id = '${tenant}'`);
    check(who === "Chair 2", `only Chair 2 does the service (${who})`);
    await b.view(390, 844, true, "light");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    await click(buttonByText(W.setup), 900);
    await until("document.querySelectorAll('.bk-service').length > 0", "the services");
    await click(`document.querySelector(${JSON.stringify(`[aria-label="${edit}"]`)})`, 500);
    await click(`[...document.querySelectorAll('.bk-choices label')].find((x) => x.textContent.includes(${JSON.stringify(W.onlyThese)}))`, 300);
    await noSideScroll("who does it 390");
    await touchTargets("who does it 390");
    await shot("05c-who-does-it-390");
    await b.view(1440, 900, false, "light");
  });

  // A customer of the shop, as the chat would have made one.
  const contact = (() => {
    sql(`insert into contacts (tenant_id, phone, name, lang) values ('${tenant}', '97455${String(Date.now() % 1_000_000).padStart(6, "0")}', 'Mona Test', '${LANG}')`);
    return sql(`select id from contacts where tenant_id = '${tenant}' and name = 'Mona Test'`);
  })();
  const link = () => `${BASE}/b/${slug}?t=${bookingToken(tenant, contact)}`;

  await run("the customer books the new service on the booking page", async () => {
    await b.view(390, 844, true, "light");
    await b.go(link(), 1600);
    await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
    check(await js("[...document.querySelectorAll('.cx-choice')].some((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))"), "the service the owner added is on the booking page");
    await click("[...document.querySelectorAll('.cx-choice')].find((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))", 600);
    check(!(await text()).includes(W.chooseWho), "the page does not ask who when only one chair does the service");
    for (let d = 1; d < 10; d += 1) {
      await click(`document.querySelectorAll('.cx-day')[${d}]`, 900);
      await until("document.querySelectorAll('.cx-time').length > 0 || [...document.querySelectorAll('.cx-note')].length > 0", "the times");
      if (await js("document.querySelectorAll('.cx-time').length > 0")) break;
    }
    await click("document.querySelector('.cx-time')", 600);
    await noSideScroll("booking page 390");
    await shot("06-booking-page-390");
    await click("document.querySelector('.cx-bar .cx-btn')", 1800);
    // A service with a deposit holds the time until it is paid.
    await shot("07-booking-made-390");
    const made = sql(`select service_name, price, deposit, deposit_state from bookings where tenant_id = '${tenant}'`);
    check(made.startsWith("Eyebrow threading|3500|700|due"), `the booking keeps the price and deposit it was made at (${made})`);
    const chair = sql(`select r.name from bookings b join booking_resources r on r.id = b.resource_id where b.tenant_id = '${tenant}'`);
    check(chair === "Chair 2", `it lands on the chair that does the service (${chair})`);
  });

  await run("the new booking is on the owner's day", async () => {
    await b.view(1440, 900, false, "light");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    const day = sql(`select (starts_at at time zone 'Asia/Qatar')::date from bookings where tenant_id = '${tenant}' limit 1`);
    await click(`document.querySelectorAll('.bk-nav button')[2]`, 200);
    for (let i = 0; i < 12; i += 1) {
      if (await js("document.querySelectorAll('.bk-card').length > 0")) break;
      await click("document.querySelectorAll('.bk-nav button')[2]", 500);
    }
    check(await js("document.querySelectorAll('.bk-card').length > 0"), `the booking is on the day view (${day})`);
    await shot("08-owner-sees-booking-1440");
  });

  if (stage(2)) {
    const shopToday = () => sql(`select (now() at time zone 'Asia/Qatar')::date`);
    const bookedDay = () => sql(`select (starts_at at time zone 'Asia/Qatar')::date from bookings where tenant_id = '${tenant}' order by starts_at limit 1`);

    await run("hours: a break on Sunday, refused when the periods overlap", async () => {
      await b.view(1440, 900, false, "light");
      await b.go(`${BASE}/app/bookings`, 1500);
      await until("!!document.querySelector('.bk')", "the Bookings screen");
      await click(buttonByText(W.setup), 900);
      await click("document.querySelectorAll('.bk-partbtn')[1]", 700);
      await until("!!document.getElementById('bk-shop-week-0-o0')", "the week");
      check((await js("document.querySelectorAll('.bk-wday').length")) === 7, "the week has seven days");
      await shot("11-hours-1440");
      await noSideScroll("hours 1440");
      await axe("hours");
      // Sunday: 10:00-13:00 and 16:00-22:00, a break between.
      await click(`document.querySelector('[aria-label="${AR ? "إضافة فترة يوم الأحد" : "Add hours on Sunday"}"]')`, 300);
      await until("!!document.getElementById('bk-shop-week-0-o1')", "a second period");
      await setValue("#bk-shop-week-0-o0", "10:00");
      await setValue("#bk-shop-week-0-c0", "13:00");
      await setValue("#bk-shop-week-0-o1", "12:00");
      await setValue("#bk-shop-week-0-c1", "22:00");
      await click(`document.querySelector('#bk-shop-week-0-c1').closest('form').querySelector('button[type=submit]')`, 400);
      const words = await text();
      check(words.includes(W.overlap) && words.includes(W.sunday), "overlapping periods are refused in words, naming the day");
      await shot("12-hours-overlap-1440");
      await setValue("#bk-shop-week-0-o1", "16:00");
      await click(`document.querySelector('#bk-shop-week-0-c1').closest('form').querySelector('button[type=submit]')`, 1200);
      await until(`document.body.innerText.includes(${JSON.stringify(W.hoursSaved)})`, "the saved message");
      const rows = sql(`select opens::text || '-' || closes::text from business_hours where tenant_id = '${tenant}' and weekday = 0 order by opens`).split("\n");
      check(rows.join(" ") === "10:00:00-13:00:00 16:00:00-22:00:00", `Sunday is saved with its break (${rows.join(" ")})`);
      await click(buttonByText(W.sameDays), 300);
      check((await js("[...document.querySelectorAll('.bk-wday input[type=checkbox]')].every((x) => x.checked)")), "same hours every day opens every day");
    });

    await run("days off: the day of the booking, which stays, and the day view says closed", async () => {
      await b.go(`${BASE}/app/bookings`, 1500);
      await until("!!document.querySelector('.bk')", "the Bookings screen");
      await click(buttonByText(W.setup), 900);
      await click("document.querySelectorAll('.bk-partbtn')[1]", 700);
      await until("!!document.getElementById('bk-closure-add')", "the days-off part");
      check((await js("document.querySelectorAll('.bk-closure').length")) === 0, "a new shop has no days off, and the slot says what goes there");
      await click("document.getElementById('bk-closure-add')", 300);
      await click(buttonByText(W.closureSave), 300);
      check((await text()).includes(W.chooseDays), "no dates are refused in words");
      const day = bookedDay();
      await setValue("#bk-closure-first", day);
      await fill("#bk-closure-reason", "Eid al-Fitr");
      await fill("#bk-closure-reason-ar", "عيد الفطر");
      await shot("13-add-closure-1440");
      await click(buttonByText(W.closureSave), 1400);
      await until("document.querySelectorAll('.bk-closure').length === 1", "the day off in the list");
      const said = await text();
      check(said.includes(W.closureAdded) && said.includes(W.standing), "it says one booking is still booked on that day");
      check(Number(sql(`select count(*) from bookings where tenant_id = '${tenant}' and status = 'booked'`)) === 1, "the booking is still booked");
      await shot("14-closure-added-1440");
      await click(buttonByText(W.seeDay), 1500);
      await until("document.querySelectorAll('.bk-col').length > 0 || document.querySelectorAll('.bk-card').length > 0", "the day view");
      const view = await text();
      check(view.includes(W.closedFor), `the day view says the shop is closed and why (${W.closedFor})`);
      check((await js("document.querySelectorAll('.bk-card').length")) > 0, "the booking is still on that day");
      await shot("15-day-closed-1440");
      check(Number(sql(`select count(*) from booking_closures where tenant_id = '${tenant}'`)) === 1, "one closure is stored");
    });

    await run("days off: the customer is told the shop is closed that day", async () => {
      await b.view(390, 844, true, "light");
      await b.go(link(), 1600);
      await until("document.querySelectorAll('.cx-choice').length > 0", "the services");
      await click("[...document.querySelectorAll('.cx-choice')].find((x) => x.textContent.includes('Eyebrow') || x.textContent.includes('تشذيب'))", 600);
      const offset = Number(sql(`select '${bookedDay()}'::date - '${shopToday()}'::date`));
      await click(`document.querySelectorAll('.cx-day')[${offset}]`, 900);
      await until("document.querySelectorAll('.cx-note').length > 0", "the closed note");
      const note = await text();
      check(note.includes(W.closedOn) && note.includes(W.reasonText), "the page says the shop is closed that day and why");
      check((await js("document.querySelectorAll('.cx-time').length")) === 0, "no times are offered");
      await noSideScroll("booking page closed day 390");
      await shot("16-booking-page-closed-390");
    });

    await run("days off: one person's leave, then taking the shop's closure away", async () => {
      await b.view(1440, 900, false, "light");
      await b.go(`${BASE}/app/bookings`, 1500);
      await until("!!document.querySelector('.bk')", "the Bookings screen");
      await click(buttonByText(W.setup), 900);
      await click("document.querySelectorAll('.bk-partbtn')[1]", 700);
      await until("!!document.getElementById('bk-closure-add')", "the days-off part");
      await click("document.getElementById('bk-closure-add')", 300);
      const later = sql(`select (now() at time zone 'Asia/Qatar')::date + 10`);
      await setValue("#bk-closure-first", later);
      await js("(() => { const s = document.getElementById('bk-closure-who'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, [...s.options].find((o) => o.textContent.includes('Chair 1')).value); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
      await click(buttonByText(W.closureSave), 1400);
      await until("document.querySelectorAll('.bk-closure').length === 2", "the second day off");
      check(sql(`select r.name from booking_closures c join booking_resources r on r.id = c.resource_id where c.tenant_id = '${tenant}'`) === "Chair 1", "the leave is Chair 1's");
      await shot("17-two-closures-1440");
      // Take the shop's closure away: the booking day is open again.
      await click(`document.querySelector('[aria-label^="${W.removeClosure}"][aria-label*="${W.whole}"]')`, 1200);
      await until("document.querySelectorAll('.bk-closure').length === 1", "one day off left");
      check((await text()).includes(W.closureRemoved), "it says the day off was removed");
      check(Number(sql(`select count(*) from booking_closures where tenant_id = '${tenant}' and resource_id is null`)) === 0, "the shop's closure is gone");
    });
  }

  if (stage(3)) {
    const cardButton = (customer, label, what = '') => `(() => { const card = [...document.querySelectorAll('.bk-card')].find((c) => c.textContent.includes(${JSON.stringify(customer)}) && c.textContent.includes(${JSON.stringify(what)})); return card && [...card.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); })()`;
    const toBookingDay = async () => {
      await b.go(`${BASE}/app/bookings`, 1500);
      await until("!!document.querySelector('.bk')", "the Bookings screen");
      for (let i = 0; i < 14 && !(await js("document.querySelectorAll('.bk-card').length > 0")); i += 1) {
        await click("document.querySelectorAll('.bk-nav button')[2]", 600);
      }
      await until("document.querySelectorAll('.bk-card').length > 0", "the day with the booking");
    };
    // Mona wrote to the shop first, so ALYR may message her; Rana (typed in below) never has.
    sql(`update contacts set consent_service = 'granted' where id = '${contact}'`);

    await run("desk: a walk-in for a customer the shop already has, found by name", async () => {
      await b.view(1440, 900, false, "light");
      await toBookingDay();
      await click(`[...document.querySelectorAll('.bk-barbtns button')].find((x) => x.textContent.trim() === ${JSON.stringify(W.addWalkIn)})`, 500);
      await until("!!document.getElementById('bk-add-name')", "the walk-in form");
      await fill("#bk-add-name", "Mon");
      await until("document.querySelectorAll('.bk-match').length > 0", "the matching customers");
      check((await js("document.querySelector('.bk-match').textContent")).includes("Mona Test"), "typing a few letters finds the customer the shop has");
      await shot("18-walk-in-find-1440");
      await click("document.querySelector('.bk-match')", 400);
      check((await js("!!document.querySelector('.bk-picked') && !document.getElementById('bk-add-name')")), "the customer is chosen: no name or number to type");
      await setValue("#bk-add-time", "15:00");
      check((await text()).includes(W.endsAt), "the form says when the visit ends");
      await shot("19-walk-in-chosen-1440");
      await click(buttonByText(W.addBooking), 1600);
      await until(`document.body.innerText.includes(${JSON.stringify(W.bookingAdded)})`, "the added message");
      check(!(await text()).includes(W.toldSent), "a walk-in says nothing about a message: the customer is standing there");
      const row = sql(`select walk_in, contact_id = '${contact}' from bookings where tenant_id = '${tenant}' and status = 'booked' and walk_in`);
      check(row === "t|t", `the walk-in is Mona's, written down as a walk-in (${row})`);
      check(Number(sql(`select count(*) from messages where contact_id = '${contact}' and payload->>'template' = 'booking_confirmed'`)) === 0, "no confirmation was sent for a walk-in");
    });

    await run("desk: a booking by phone for a new customer, who cannot be messaged yet", async () => {
      await click(`[...document.querySelectorAll('.bk-barbtns button')].find((x) => x.textContent.trim() === ${JSON.stringify(W.addWalkIn)})`, 500);
      await until("!!document.getElementById('bk-add-name')", "the form");
      await fill("#bk-add-name", "Rana Newcomer");
      await fill("#bk-add-phone", "55512345");
      await setValue("#bk-add-time", "16:30");
      await click("document.querySelector('.bk-check input')", 300);
      await until("!!document.querySelector('.bk-warn')", "the warning");
      const warning = await js("document.querySelector('.bk-warn').textContent");
      check(warning.includes(W.notAgreed) && warning.includes(W.tellYourself), "before it is added, the form says this customer cannot be messaged yet");
      await shot("20-phone-booking-warning-1440");
      await click(buttonByText(W.addBooking), 1600);
      await until(`document.body.innerText.includes(${JSON.stringify(W.bookingAdded)})`, "the added message");
      const said = await text();
      check(said.includes(W.notAgreed) && said.includes("97455512345"), "afterwards it says nothing was sent and gives the number to call");
      check(sql(`select count(*) from contacts where tenant_id = '${tenant}' and phone = '97455512345'`) === "1", "the new customer is kept");
      check(sql(`select status from messages m join contacts c on c.id = m.contact_id where c.tenant_id = '${tenant}' and c.phone = '97455512345' and m.payload->>'template' = 'booking_confirmed'`) === "blocked", "the confirmation is on the record as not sent");
    });

    await run("desk: move a booking to a free time, the customer is told", async () => {
      await toBookingDay();
      await click(cardButton("Mona Test", W.move, AR ? "تشذيب الحاجبين" : "Eyebrow threading"), 500);
      await until("document.querySelectorAll('.bk-chip').length > 0", "the free times");
      const now = await js("document.querySelector('.bk-form.inline .bk-quiet').textContent");
      check(now.includes(W.nowAt), `the form says where the booking is now (${now})`);
      check((await js("document.querySelectorAll('.bk-chip').length")) > 3, "free times are offered as buttons");
      await shot("21-move-free-times-1440");
      const before = sql(`select starts_at from bookings where tenant_id = '${tenant}' and service_name = 'Eyebrow threading'`);
      await click("document.querySelectorAll('.bk-chip')[3]", 300);
      check((await js("document.querySelectorAll('.bk-chip')[3].getAttribute('aria-pressed')")) === "true", "the chosen time is marked");
      const chosen = await js("document.querySelector('.bk-form.inline input[type=time]').value");
      await click(buttonByText(W.save), 1600);
      await until(`document.body.innerText.includes(${JSON.stringify(W.toldSent)})`, "the told message");
      check((await text()).includes(W.movedDone), "it says the booking moved, and that the customer is told on WhatsApp");
      const after = sql(`select starts_at from bookings where tenant_id = '${tenant}' and service_name = 'Eyebrow threading'`);
      check(after !== before && sql(`select to_char(starts_at at time zone 'Asia/Qatar', 'HH24:MI') from bookings where tenant_id = '${tenant}' and service_name = 'Eyebrow threading'`) === chosen, `it moved to the time that was chosen (${chosen})`);
      check(Number(sql(`select count(*) from messages where contact_id = '${contact}' and payload->>'template' = 'booking_moved' and status <> 'blocked'`)) === 1, "the move notice is on its way to the customer");
    });

    await run("desk: moving or cancelling for a customer who cannot be messaged says so first and after", async () => {
      await toBookingDay();
      await click(cardButton("Rana Newcomer", W.move), 500);
      await until("!!document.querySelector('.bk-form.inline .bk-warn')", "the warning on the move");
      check((await js("document.querySelector('.bk-form.inline .bk-warn').textContent")).includes("97455512345"), "the move form already shows the number to call");
      await b.view(390, 844, true, "light");
      await noSideScroll("move form 390");
      await touchTargets("move form 390");
      await shot("22-move-form-390");
      await b.view(1440, 900, false, "light");
      await click(buttonByText(W.close), 300);
      await click(cardButton("Rana Newcomer", W.cancel), 500);
      await until("!!document.querySelector('.bk-form.inline .bk-warn')", "the warning on the cancel");
      await click(buttonByText(W.confirmCancel), 1600);
      await until(`document.body.innerText.includes(${JSON.stringify(W.cancelledDone)})`, "the cancelled message");
      const said = await text();
      check(said.includes(W.notAgreed) && said.includes(W.tellYourself) && said.includes("97455512345"), "after the cancel it says the customer was not messaged and gives the number");
      check(sql(`select status from bookings b join contacts c on c.id = b.contact_id where c.tenant_id = '${tenant}' and c.phone = '97455512345'`) === "cancelled", "the booking is cancelled all the same");
      await shot("23-cancelled-not-told-1440");
    });

    await run("desk: the phone-width forms, light and dark", async () => {
      for (const scheme of ["light", "dark"]) {
        await b.view(390, 844, true, scheme);
        await toBookingDay();
        await click(`[...document.querySelectorAll('.bk-barbtns button')].find((x) => x.textContent.trim() === ${JSON.stringify(W.addWalkIn)})`, 500);
        await until("!!document.getElementById('bk-add-name')", "the form");
        await fill("#bk-add-name", "Mon");
        await until("document.querySelectorAll('.bk-match').length > 0", "the matches");
        await noSideScroll(`walk-in form 390 ${scheme}`);
        await touchTargets(`walk-in form 390 ${scheme}`);
        await shot(`24-walk-in-390-${scheme}`);
        if (scheme === "dark") await axe("desk-dark");
      }
    });
  }

  await run("phone width, light and dark: no sideways scroll, 44 px targets", async () => {
    for (const scheme of ["light", "dark"]) {
      await b.view(390, 844, true, scheme);
      await b.go(`${BASE}/app/bookings`, 1500);
      await until("!!document.querySelector('.bk')", "the Bookings screen");
      await click(buttonByText(W.setup), 900);
      await until("document.querySelectorAll('.bk-service').length > 0", "the services");
      await noSideScroll(`services 390 ${scheme}`);
      await touchTargets(`services 390 ${scheme}`);
      await shot(`09-services-390-${scheme}`);
      await click(`document.getElementById('bk-svc-add')`, 500);
      await until("!!document.getElementById('bk-s-new-n')", "the form");
      await noSideScroll(`add service form 390 ${scheme}`);
      await touchTargets(`add service form 390 ${scheme}`);
      await shot(`10-add-service-390-${scheme}`);
      if (scheme === "dark") await axe("services-dark");
      if (stage(2)) {
        await click("document.querySelectorAll('.bk-partbtn')[1]", 700);
        await until("!!document.getElementById('bk-shop-week-0-o0')", "the week");
        await noSideScroll(`hours 390 ${scheme}`);
        await touchTargets(`hours 390 ${scheme}`);
        await shot(`11-hours-390-${scheme}`);
        await click("document.getElementById('bk-closure-add')", 400);
        await until("!!document.getElementById('bk-closure-first')", "the days-off form");
        await noSideScroll(`days off form 390 ${scheme}`);
        await touchTargets(`days off form 390 ${scheme}`);
        await shot(`12-days-off-390-${scheme}`);
      }
    }
    await b.view(320, 700, true, "light");
    await b.go(`${BASE}/app/bookings`, 1500);
    await until("!!document.querySelector('.bk')", "the Bookings screen");
    await click(buttonByText(W.setup), 900);
    await until("document.querySelectorAll('.bk-service').length > 0", "the services");
    await noSideScroll("services 320");
  });

  check(b.problems.filter((p) => !/favicon|Hydration|status of 4\d\d/.test(p)).length === 0, `no console errors (${b.problems.slice(0, 3).join(" | ")})`);
} finally {
  await b.close();
}

if (failures.length) {
  console.log(`\n[${LANG}] ${failures.length} failed:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`\n[${LANG}] all checks passed`);
