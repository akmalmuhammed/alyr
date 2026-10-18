// Runs the customer's order page (ALY-112) in a real browser at phone width, in English or
// Arabic, light or dark, and checks what a customer experiences: plan scenarios 1 to 7, 11,
// 12 and 14, the pay page's released-order state, the wholesale table, the live refresh, the
// keyboard, the shared-link previews, and axe-core on every state. Headless Edge over the
// DevTools protocol (scripts/browser-kit.mjs), no packages. Node 22.
//
//   node scripts/order-page-browser-check.mjs --lang en --photos C:/t/op/photos \
//        --base http://localhost:3181 --api http://127.0.0.1:8310 --out C:/t/op/shots \
//        --axe C:/t/tools/node_modules/axe-core/axe.min.js
//
// It needs a dev API on its own database (never the shared one) and a web app pointed at it
// (docs/status.md, "Live testing from the laptop"), and `docker` to switch the Catalog module
// on for the demo shop in that database. It resets the demo shop, fills it with a fictional
// kitchen of 30 items (names, descriptions, Arabic names, photos drawn by a script) and walks
// through the scenarios. Options: `--only a,b` runs some of them; `--db alyr_orderpage` and
// `--pg alyrwhatsapp-postgres-1` name the database and its container.
//
// Short folders: Edge fails quietly with long paths, so keep --profile and --out short.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "./browser-kit.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, a, i, list) => (a.startsWith("--") ? [...all, [a.slice(2), list[i + 1]?.startsWith("--") || list[i + 1] === undefined ? "true" : list[i + 1]]] : all), []),
);
const BASE = args.base ?? "http://localhost:3181";
const API = args.api ?? "http://127.0.0.1:8310";
const LANG = args.lang === "ar" ? "ar" : "en";
const AR = LANG === "ar";
const PHOTOS = args.photos ?? "C:/t/op/photos";
const OUT = args.out ?? `${tmpdir()}/order-shots`;
const PROFILE = args.profile ?? `${tmpdir()}/order-profile-${LANG}`;
const PORT = Number(args.port ?? (AR ? 9582 : 9581));
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const AXE = args.axe ?? "";
const DB = args.db ?? "alyr_orderpage";
const PG = args.pg ?? "alyrwhatsapp-postgres-1";
const PERF = args.perf === "true";
const ONLY = PERF ? new Set(["perf"]) : args.only ? new Set(args.only.split(",")) : null;
mkdirSync(OUT, { recursive: true });

const failures = [];
const log = (...m) => console.log(`[${LANG}]`, ...m);
const check = (ok, what) => { if (ok) log("ok  ", what); else { failures.push(what); log("FAIL", what); } };

// ── the shop's side: the API, and the database for what the API cannot do ───────────────
const sql = (text) => execFileSync("docker", ["exec", PG, "psql", "-U", "alyr", "-d", DB, "-At", "-c", text], { encoding: "utf8" }).trim();
async function api(path, method = "GET", body) {
  const response = await fetch(`${API}${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !(body && body.__allow)) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const put = (path, body) => api(path, "PUT", body);
const post = (path, body) => api(path, "POST", body ?? {});

// A fictional kitchen. [English, Arabic, price in QAR, category, description, Arabic description]
const MENU = [
  ["Chicken shawarma", "شاورما دجاج", 12, "Mains", "Grilled chicken, garlic sauce and pickles in warm bread.", "دجاج مشوي مع صلصة الثوم والمخلل في خبز دافئ."],
  ["Beef shawarma", "شاورما لحم", 14, "Mains", "Sliced beef with tahini and onion.", "لحم بقري مقطع مع الطحينة والبصل."],
  ["Falafel plate", "طبق فلافل", 9, "Mains", "Six crisp falafel with hummus and salad.", "ست أقراص فلافل مقرمشة مع الحمص والسلطة."],
  ["Mixed grill", "مشاوي مشكلة", 38, "Mains", "Lamb, chicken and kofta with rice, for sharing.", "لحم ودجاج وكفتة مع الأرز، للمشاركة."],
  ["Chicken biryani", "برياني دجاج", 24, "Mains", "Spiced rice with chicken, raita on the side.", "أرز متبل مع الدجاج ورايتا جانبية."],
  ["Lamb machboos", "مجبوس لحم", 32, "Mains", "Slow-cooked lamb over fragrant rice.", "لحم ضأن مطهو ببطء فوق أرز عطري."],
  ["Fish and rice", "سمك مع أرز", 28, "Mains", "Grilled hammour with lemon rice.", "هامور مشوي مع أرز بالليمون."],
  ["Margherita pizza", "بيتزا مارجريتا", 26, "Mains", "Tomato, mozzarella and basil.", "طماطم وموزاريلا وريحان."],
  ["Beef burger", "برجر لحم", 22, "Mains", "Beef patty, cheddar, lettuce, brioche bun.", "قطعة لحم مع جبن شيدر وخس في خبز بريوش."],
  ["Club sandwich", "كلوب ساندويتش", 20, "Mains", "Triple decker with chicken and egg.", "ساندويتش ثلاث طبقات بالدجاج والبيض."],
  ["Hummus", "حمص", 10, "Starters", "Chickpeas, tahini and olive oil.", "حمص وطحينة وزيت زيتون."],
  ["Tabbouleh", "تبولة", 11, "Starters", "Parsley, tomato, bulgur and lemon.", "بقدونس وطماطم وبرغل وليمون."],
  ["Fattoush", "فتوش", 12, "Starters", "Crisp vegetables with sumac and toasted bread.", "خضار مقرمشة مع السماق والخبز المحمص."],
  ["Lentil soup", "شوربة عدس", 8, "Starters", "Red lentils with cumin and lemon.", "عدس أحمر مع الكمون والليمون."],
  ["Grape leaves", "ورق عنب", 13, "Starters", "Rice-stuffed vine leaves, served cold.", "ورق عنب محشي بالأرز، يُقدّم بارداً."],
  ["Spring rolls", "سبرينغ رول", 14, "Starters", "Vegetable rolls with sweet chilli.", "رولات خضار مع صلصة الفلفل الحلو."],
  ["Cheese fatayer", "فطاير جبن", 12, "Starters", "Baked pastries filled with white cheese.", "معجنات مخبوزة محشوة بالجبن الأبيض."],
  ["Mutabbal", "متبل", 10, "Starters", "Smoked aubergine with tahini.", "باذنجان مشوي مع الطحينة."],
  ["Kunafa", "كنافة", 15, "Desserts", "Warm cheese pastry with sugar syrup.", "عجينة جبن دافئة مع القطر."],
  ["Umm Ali", "أم علي", 14, "Desserts", "Baked pastry pudding with nuts and cream.", "حلوى معجنات مخبوزة مع المكسرات والقشطة."],
  ["Baklava", "بقلاوة", 16, "Desserts", "Layers of pastry, pistachio and honey.", "طبقات من العجين والفستق والعسل."],
  ["Chocolate cake", "كيكة شوكولاتة", 18, "Desserts", "Dark chocolate sponge with ganache.", "كيكة شوكولاتة داكنة مع الغاناش."],
  ["Ice cream", "آيس كريم", 9, "Desserts", "Three scoops: vanilla, pistachio, saffron.", "ثلاث كرات: فانيلا وفستق وزعفران."],
  ["Rice pudding", "مهلبية", 8, "Desserts", "Milk pudding with rose water.", "مهلبية بالحليب وماء الورد."],
  ["Karak tea", "شاي كرك", 3, "Drinks", "Strong spiced tea with milk.", "شاي كرك بالحليب والتوابل."],
  ["Arabic coffee", "قهوة عربية", 6, "Drinks", "Cardamom coffee, served in a dallah.", "قهوة بالهيل تُقدّم في دلة."],
  ["Lemon mint", "ليمون بالنعناع", 12, "Drinks", "Fresh lemon and mint, blended with ice.", "ليمون طازج ونعناع مع الثلج."],
  ["Orange juice", "عصير برتقال", 10, "Drinks", "Squeezed to order.", "برتقال طازج يُعصر عند الطلب."],
  ["Laban", "لبن", 5, "Drinks", "Salted yoghurt drink.", "مشروب لبن مملح."],
  ["Water", "ماء", 2, "Drinks", "Still water, 500 ml.", "ماء، 500 مل."],
];
const CATEGORIES = [["Mains", "الأطباق الرئيسية"], ["Starters", "المقبلات"], ["Desserts", "الحلويات"], ["Drinks", "المشروبات"], ["Specials", "الأصناف الخاصة"]];
const ALLDAYS = [0, 1, 2, 3, 4, 5, 6];

const items = {}; // by English name: the API's item
const nm = (en) => (AR ? (MENU.find((m) => m[0] === en)?.[1] ?? SPECIAL_AR[en] ?? en) : en);
const SPECIAL_AR = {
  "Last slice cheesecake": "آخر قطعة تشيز كيك", "Stock of eight": "ثمانية في المخزون", "Pizza": "بيتزا", "Abaya": "عباية",
  "Nails": "مسامير", "Box of tape": "علبة شريط", "Birthday cake": "كيكة عيد ميلاد", "Breakfast plate": "طبق فطور",
  "Limited biryani": "برياني محدود", "Spare tea": "شاي إضافي", "Race cake": "كيكة السباق",
};

async function seed({ specials = true, photos = true } = {}) {
  await post("/sim/reset");
  sql("update tenants set name = 'Test Kitchen', name_ar = 'مطبخ التجربة' where slug = 'al-noor'");
  sql("insert into tenant_modules (tenant_id, module_key) select id, 'catalog' from tenants where slug = 'al-noor' on conflict (tenant_id, module_key) do update set enabled = true");
  for (const existing of (await api("/api/items?limit=200")).items) await api(`/api/items/${existing.id}`, "DELETE");
  await put("/api/items/settings", { whatsapp_number: "+974 5555 0100", low_stock_at: 5, sold_out_display: "grey", wholesale_layout: false });
  await put("/api/items/categories", CATEGORIES.map(([name, name_ar]) => ({ name, name_ar })));
  const files = readdirSync(PHOTOS).filter((f) => /^dish-\d+\.jpg$/.test(f)).sort();
  for (const [n, [en, ar, price, category, description, description_ar]] of MENU.entries()) {
    const made = await post("/api/items", { name: en, name_ar: ar, price: price * 100, category, description, description_ar, status: "live", stock_rule: "switch" });
    items[en] = made.item;
    if (photos && files[n]) await addPhoto(made.item, `${PHOTOS}/${files[n]}`);
  }
  if (!specials) return;
  const special = async (body, photo) => {
    const made = await post("/api/items", { status: "live", category: "Specials", ...body });
    items[body.name] = made.item;
    if (photo && photos) await addPhoto(made.item, `${PHOTOS}/${files[photo]}`);
    return made.item;
  };
  await special({ name: "Last slice cheesecake", name_ar: "آخر قطعة تشيز كيك", price: 1800, stock_rule: "count", opening_stock: 1, description: "The last slice of the day.", description_ar: "آخر قطعة اليوم." }, 30);
  await special({ name: "Stock of eight", name_ar: "ثمانية في المخزون", price: 500, stock_rule: "count", opening_stock: 8 }, 31);
  await special({ name: "Spare tea", name_ar: "شاي إضافي", price: 300, stock_rule: "switch", description: "A second tea, as an alternative." }, 32);
  await special({
    name: "Pizza", name_ar: "بيتزا", price: 3000, description: "Stone-baked, made to order.", description_ar: "مخبوزة على الحجر وتُحضَّر عند الطلب.",
    option_groups: [
      { name: "Size", name_ar: "الحجم", required: true, options: [{ name: "Small", name_ar: "صغير", price_delta: 0 }, { name: "Large", name_ar: "كبير", price_delta: 800 }] },
      { name: "Extras", name_ar: "إضافات", required: false, max_choices: 2, options: [{ name: "Extra cheese", name_ar: "جبن إضافي", price_delta: 200 }, { name: "Olives", name_ar: "زيتون", price_delta: 200 }] },
    ],
  }, 33);
  await special({
    name: "Abaya", name_ar: "عباية", price: 25000, stock_rule: "count", tags: ["Hand finished"],
    description: "Soft crepe, hand finished.", description_ar: "كريب ناعم بتشطيب يدوي.",
    variants: [{ name: "Black, M", name_ar: "أسود، م", opening_stock: 3 }, { name: "Black, L", name_ar: "أسود، ك", price_delta: 2000, opening_stock: 0 }],
  }, 34);
  await special({ name: "Nails", name_ar: "مسامير", price: 100, unit: "piece", pack_size: 12, min_order: 12, sku: "NL-12" }, 35);
  await special({ name: "Box of tape", name_ar: "علبة شريط", price: 900, unit: "box", pack_size: 12, sku: "TP-12" }, 36);
  await special({ name: "Limited biryani", name_ar: "برياني محدود", price: 2400, stock_rule: "count", opening_stock: 3 }, 37);
  await special({ name: "Breakfast plate", name_ar: "طبق فطور", price: 1600, schedule: [{ weekdays: ALLDAYS, opens: "00:00", closes: "23:59" }], description: "Eggs, labneh and bread.", description_ar: "بيض ولبنة وخبز." }, 38);
  await special({ name: "Birthday cake", name_ar: "كيكة عيد ميلاد", price: 9000, schedule: [{ weekdays: ALLDAYS, lead_days: 1, cutoff: "23:00" }], description: "Made for the day you choose.", description_ar: "تُحضَّر لليوم الذي تختاره." }, 39);
}

async function addPhoto(item, path) {
  const sent = await fetch(`${API}/api/media/photos`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: readFileSync(path) });
  if (!sent.ok) throw new Error(`photo upload failed: ${sent.status}`);
  const asset = (await sent.json()).photo.id;
  await post(`/api/items/${item.id}/photos`, { asset_id: asset });
}

// ── customers and their links, the way the chat makes them ──────────────────────────────
let people = [];
async function loadPeople() {
  people = (await api("/api/ledger/summary")).customers.filter((c) => c.phone);
}
const person = (n) => people[n];
async function linkFor(who, text = AR ? "طلب" : "order") {
  const sent = await post("/sim/messages", { from_number: who.phone, text });
  const body = sent.messages.map((m) => m.body).filter((b) => b.includes("?t=")).at(-1);
  return `${BASE}/s/al-noor?t=${body.split("?t=")[1].split(/\s/)[0]}`;
}

// ── the browser ─────────────────────────────────────────────────────────────────────────
const b = await launch({ edge: EDGE, port: PORT, profile: PROFILE, scheme: "light" });
const { js, until, click, sleep: pause } = b;
const shot = async (name) => { await b.shot(`${OUT}/${LANG}-${name}.png`); log("shot", name); };
const text = (selector) => js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')`);
const count = (selector) => js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const visibleText = () => js("document.body.innerText.replace(/\\s+/g, ' ')");
const sheetText = () => js("(document.querySelector('.ct-sheet')?.innerText ?? '').replace(/\\s+/g, ' ')");
const dialogText = () => js("(document.querySelector('dialog[open]')?.innerText ?? '').replace(/\\s+/g, ' ')");
const names = () => js("[...document.querySelectorAll('.ox-card .ox-name, .ox-wrow .ox-wopen')].map(e => e.textContent.trim())");
async function noSideScroll(name) {
  const wide = await js("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth");
  check(wide <= 0, `no sideways scrolling on ${name}${wide > 0 ? ` (${wide}px too wide)` : ""}`);
}
async function axe(name, scope = null, exclude = []) {
  const found = await b.axe(AXE, scope, exclude);
  if (found === null) { log("axe skipped: give --axe <path to axe.min.js>"); return; }
  writeFileSync(`${OUT}/${LANG}-axe-${name}.json`, JSON.stringify(found, null, 2));
  check(found.filter((v) => v.impact !== "minor").length === 0, `axe: no violations on ${name} (${found.length} found)`);
  for (const v of found) for (const n of v.nodes.slice(0, 3)) log("   axe", v.impact, v.id, n.target, "|", n.why);
}
const row = (en) => `[...document.querySelectorAll('.ox-card, .ox-wrow')].find(r => { const n = r.querySelector('.ox-name, .ox-wopen'); return n && (n.firstChild?.textContent ?? n.textContent).trim() === ${JSON.stringify(nm(en))}; })`;
const inRow = (en, selector) => `(${row(en)})?.querySelector(${JSON.stringify(selector)})`;
const pressText = (words, within = "document") =>
  click(`[...${within}.querySelectorAll('button, a')].filter(e => e.getClientRects().length).find(e => ${JSON.stringify(words)}.some(w => (e.textContent + ' ' + (e.getAttribute('aria-label') ?? '')).replace(/\\s+/g, ' ').includes(w)))`);
const pressExact = (word, within = "document") =>
  click(`[...${within}.querySelectorAll('button, a')].filter(e => e.getClientRects().length).find(e => e.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(word)})`);
const inDialog = (words) => pressText(words, "(document.querySelector('dialog[open]') || document)");
const T = AR
  ? { review: "راجع الطلب", reviewChanged: "راجع التغييرات", accept: "قبول الأسعار الجديدة", soldOut: "نفد", choose: "اختر", close: "إغلاق", again: "اطلب مجدداً وادفع",
      account: "سجّله على حسابي", addToOrder: "أضف إلى الطلب", allGood: "كل شيء متاح", remove: "إزالة", orderAgain: "اطلب مرة أخرى", startOrder: "اطلب عبر واتساب" }
  : { review: "Review order", reviewChanged: "Review changes", accept: "Accept new prices", soldOut: "Sold out", choose: "Choose", close: "Close", again: "Order again and pay",
      account: "Put it on my account", addToOrder: "Add to order", allGood: "Everything is available", remove: "Remove", orderAgain: "Order again", startOrder: "Order on WhatsApp" };
const price = (qar) => (AR ? `${qar} ر.ق` : `QAR ${qar}`);
const fresh = async (url, wait = 700) => { await b.go(`${BASE}/s/al-noor`, 100); await js("sessionStorage.clear()"); await b.go(url, wait); };
const run = async (name, fn) => {
  if (ONLY && !ONLY.has(name)) return;
  if (name === "perf" && !PERF) return; // on its own, against a production build
  try { log(`── ${name}`); await fn(); } catch (error) {
    failures.push(`${name}: ${error.message ?? error}`);
    log("STOPPED", name, error.message ?? error);
    try { await shot(`99-${name}-stopped`); } catch { /* the page is gone */ }
  }
};

try {
  await seed({ specials: !PERF });
  await loadPeople();
  // Ahmed has a credit account with room on it; the other two have none.
  const ahmed = people.find((c) => c.phone === "97455500001");
  const [second, third] = people.filter((c) => c.phone !== "97455500001").slice(0, 2);
  await b.view(375, 812, true, "light");

  // 1. A shared link, opened by anyone: the menu, in order, with photos, and no way to order.
  await run("public", async () => {
    await fresh(`${BASE}/s/al-noor${AR ? "?lang=ar" : ""}`);
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    check((await count(".ox-card")) === 30 + 10, "all 40 items of the shop are listed (30 menu + 10 specials)");
    check((await text(".ox-group > h2")).startsWith(AR ? "الأطباق الرئيسية" : "Mains"), "the first category is the owner's first, with its Arabic name in Arabic");
    check((await js("document.querySelectorAll('.ox-card img[srcset][loading=lazy]').length")) >= 30, "every photo is lazy-loaded from a srcset of sizes");
    check(await js("[...document.querySelectorAll('.ox-card .ox-ph')].every(e => e.getBoundingClientRect().height > 40)"), "every photo box has its shape before the file arrives");
    check((await count(".ox-add, .ox-step, .ox-choose")) === 0, "nobody can add anything without their own link");
    const cta = await js("document.querySelector('.cx-bar a.cx-btn')?.href ?? ''");
    check(cta.startsWith("https://wa.me/97455550100?text=") && cta.includes(AR ? "%D8%B7%D9%84%D8%A8" : "Order"), "the one way to order is the shop's WhatsApp, with the word the chat answers");
    check((await visibleText()).includes(AR ? "مطبخ التجربة" : "Test Kitchen"), "the shop's name leads the page");
    check(!(await visibleText()).includes("QAR") === AR, AR ? "no QAR anywhere on the Arabic page" : "prices read QAR 12");
    await noSideScroll("the public page");
    await shot("01-public");
    await axe("public");
    await b.view(375, 812, true, "dark");
    await b.go(`${BASE}/s/al-noor${AR ? "?lang=ar" : ""}`, 900);
    await shot("02-public-dark");
    await axe("public-dark");
    await b.view(375, 812, true, "light");
  });

  // 14. Arabic spellings find the item; chips filter; a link opens where it points.
  await run("search", async () => {
    await fresh(`${BASE}/s/al-noor${AR ? "?lang=ar" : ""}`);
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    const search = async (typed) => {
      await click("document.querySelector('.ox-search input')", 100);
      await b.clearFocused();
      await b.type(typed);
      await pause(500);
      return names();
    };
    for (const [typed, found] of [["كنافه", "Kunafa"], ["كنافة", "Kunafa"], ["كَنَافَة", "Kunafa"], ["KUNAFA", "Kunafa"], ["ام علي", "Umm Ali"], ["ارز", "Fish and rice"], ["شاورمة", null], ["مهلبيه", "Rice pudding"], ["ايس كريم", "Ice cream"]]) {
      const shown = await search(typed);
      if (found) check(shown.length >= 1 && shown.includes(nm(found)), `scenario 14: “${typed}” finds ${nm(found)}`);
      else check(shown.length === 0 || !shown.includes(nm("Chicken shawarma")), `“${typed}” (a ta marbuta where the shop wrote an alef) is not a false match`);
    }
    await search("كنافه");
    await shot("03-search-arabic-spelling");
    check((await text("#ox-results")).length > 0, "the number of results is announced");
    await search("zzz");
    check((await visibleText()).includes(AR ? "لا شيء يطابق" : "Nothing matches"), "a search with no match says so, with a way back");
    await pressText([AR ? "عرض كل شيء" : "Show everything"]);
    await until("document.querySelectorAll('.ox-card').length >= 30", "everything again");
    await pressText([AR ? "الحلويات" : "Desserts"], "document.querySelector('.ox-chips')");
    await pause(300);
    check((await names()).length === 6 && (await names()).includes(nm("Kunafa")), "a category chip shows that category");
    check(await js("document.querySelector('.ox-chips [aria-pressed=true]')?.textContent.includes(" + JSON.stringify(AR ? "الحلويات" : "Desserts") + ")"), "and says which one is chosen");
    await shot("04-category");
    // A shared item link opens the item; a shared category link opens the category.
    await b.go(`${BASE}/s/al-noor?item=${items["Kunafa"].id}${AR ? "&lang=ar" : ""}`, 900);
    await until("!!document.querySelector('dialog[open]')", "the item opens from its link");
    check((await dialogText()).includes(nm("Kunafa")), "a shared item link opens that item");
    check(await js("document.querySelector('dialog[open] img')?.getAttribute('srcset')?.includes('800w')"), "its photo comes in three sizes");
    await shot("05-item-from-link");
    await axe("item-public", "dialog");
    await b.key("Escape", "Escape", 27);
    await pause(300);
    check(!(await js("!!document.querySelector('dialog[open]')")), "Escape closes it");
    await b.go(`${BASE}/s/al-noor?cat=${encodeURIComponent("Drinks")}${AR ? "&lang=ar" : ""}`, 800);
    check((await names()).length === 6, "a shared category link opens on that category");
  });

  // The customer's own link: add, steppers, minimum and pack, only a few left, the required choice.
  await run("add", async () => {
    await fresh(await linkFor(ahmed, AR ? "طلب" : "order"));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    check((await visibleText()).includes(AR ? "الطلب باسم" : "Ordering as"), "the page knows who is ordering");
    check((await count(".ox-add")) > 20, "every simple item has an add button");
    await click(inRow("Karak tea", ".ox-add"));
    await click(inRow("Karak tea", ".ox-step button:last-child"));
    check((await text(".cx-sum")).includes("2") || (await text(".cx-bar")).length > 0, "the bar shows the order growing");
    check((await js(`(${row("Karak tea")}).querySelector('.ox-step .num').textContent`)) === "2", "the stepper counts to two");
    // Smallest order and pack: nails come by twelve.
    await click(inRow("Nails", ".ox-add"));
    check((await js(`(${row("Nails")}).querySelector('.ox-step .num').textContent`)) === "12", "scenario 6 (page side): the first tap on a pack item adds a whole pack");
    await click(inRow("Nails", ".ox-step button:last-child"));
    check((await js(`(${row("Nails")}).querySelector('.ox-step .num').textContent`)) === "24", "and the next adds another pack");
    await click(inRow("Box of tape", ".ox-add"));
    check((await js(`(${row("Box of tape")}).querySelector('.ox-step .num').textContent`)) === "1", "a box counts by one");
    // Only a few left, said only when true.
    const few = await text(".ox-card.off, .ox-card .ox-pill.few");
    check(few.includes(AR ? "المتبقي 3 فقط" : "Only 3 left") && !few.includes("Only 8 left"), "“only 3 left” is shown where it is true, not for eight");
    await click(inRow("Limited biryani", ".ox-add"));
    await click(inRow("Limited biryani", ".ox-step button:last-child"));
    await click(inRow("Limited biryani", ".ox-step button:last-child"));
    await click(inRow("Limited biryani", ".ox-step button:last-child"));
    check((await js(`(${row("Limited biryani")}).querySelector('.ox-step .num').textContent`)) === "3", "scenario 6: the stepper stops at what is left");
    check((await text(".ox-sr[aria-live]")).includes(AR ? "المتبقي 3 فقط" : "Only 3 left"), "and says why, to a screen reader");
    await shot("06-customer-added");
    await noSideScroll("the customer's page with items added");
    // Scenario 7: the required choice.
    await click(inRow("Pizza", ".ox-choose"));
    await until("!!document.querySelector('dialog[open]')", "the pizza opens");
    await click("document.querySelector('dialog[open] .ox-addbtn')");
    const err = await dialogText();
    check(await js("!!document.querySelector('dialog[open] .ox-field.bad')") && err.includes(AR ? "اختر" : "Choose"), "scenario 7: a missing required choice is marked and named");
    check(await js("document.querySelector('dialog[open] [role=alert]')?.textContent.length > 10"), "and is read out");
    await shot("07-required-choice");
    await axe("item-error", "dialog");
    await click("document.querySelector('dialog[open] .ox-field input[type=radio]:not(:checked)')");
    await click("document.querySelectorAll('dialog[open] .ox-field')[0].querySelectorAll('input')[1]");
    await click("document.querySelector('dialog[open] .ox-addbtn')");
    await pause(400);
    check(!(await js("!!document.querySelector('dialog[open]')")), "with the choice made the pizza goes in");
  });

  // Scenarios 3, 2, 6 and 4 on the way to paying: what changed is shown before payment.
  await run("review", async () => {
    await fresh(await linkFor(ahmed));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    const orders0 = (await api("/api/orders")).orders.length;
    await click(inRow("Karak tea", ".ox-add"));
    await click(inRow("Chicken shawarma", ".ox-add"));
    await click(inRow("Stock of eight", ".ox-add"));
    await click(inRow("Stock of eight", ".ox-step button:last-child"));
    await click(inRow("Stock of eight", ".ox-step button:last-child"));
    await click(inRow("Stock of eight", ".ox-step button:last-child"));
    await click(inRow("Stock of eight", ".ox-step button:last-child"));
    await click(inRow("Stock of eight", ".ox-step button:last-child"));
    await click(inRow("Breakfast plate", ".ox-add"));
    await click(inRow("Spare tea", ".ox-add"));
    // Between add and pay the shop changes four things.
    await put(`/api/items/${items["Karak tea"].id}`, { price: 400 });
    await put(`/api/items/${items["Breakfast plate"].id}`, { schedule: [{ weekdays: ALLDAYS, opens: "03:00", closes: "03:01" }] });
    await post(`/api/items/${items["Stock of eight"].id}/count`, { counted: 4, reason: "Shelf count" });
    await post(`/api/items/${items["Chicken shawarma"].id}/switch`, { available: false });
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("!!document.querySelector('dialog[open] .ox-line')", "the review opens");
    await until("!document.querySelector('dialog[open] .ox-state')?.textContent.includes(" + JSON.stringify(AR ? "جارٍ التحقق" : "Checking") + ")", "the check finishes", 15000);
    const said = await dialogText();
    if (!said.includes(AR ? "3 ر.ق" : "QAR 3")) log("   the review said:", JSON.stringify(said.slice(0, 400)), [...said.slice(0, 120)].map((c) => c.charCodeAt(0).toString(16)).join(" "));
    check(said.includes(AR ? "3 ر.ق" : "QAR 3") && (said.includes(AR ? "كان 3 ر.ق، وأصبح 4 ر.ق" : "Was QAR 3, now QAR 4") || said.includes("4")), "scenario 3: the new price is shown in the review, before payment");
    check((await api("/api/orders")).orders.length === orders0, "…and nothing has been ordered or charged yet");
    check(said.includes(AR ? "نفد" : "sold out") || said.includes(AR ? "لم يعد متاحاً" : "no longer available"), "scenario 2: the item that sold out says so");
    check(await js("document.querySelectorAll('dialog[open] .ox-alts .ox-alt').length > 0"), "…and offers something else from the same category");
    check(said.includes(AR ? "المتبقي من" : "Only 4 of"), "scenario 6: a quantity above what is left is named with the most that can be ordered");
    check(said.includes(AR ? "الساعة 3" : "3:00 AM"), "scenario 4: an item outside its hours says when it can be ordered");
    check(await js("[...document.querySelectorAll('dialog[open] .cx-btn')].filter(e => e.textContent.includes(" + JSON.stringify(T.accept) + ")).length === 1 || [...document.querySelectorAll('dialog[open] .cx-btn')].every(e => e.disabled)"), "payment waits until the changes are looked at");
    await shot("08-review-changes");
    await axe("review-changes", "dialog");
    // Look at each and fix: swap the sold-out item, shrink the quantity, drop the breakfast, accept the price.
    await click("document.querySelector('dialog[open] .ox-alts .ox-alt')");
    await pressText([AR ? "غيّر إلى 4" : "Change to 4"], "document.querySelector('dialog[open]')");
    await pressExact(T.remove, "document.querySelector('dialog[open]')");
    await until("!!document.querySelector('dialog[open]') && [...document.querySelectorAll('dialog[open] .cx-btn')].some(e => e.textContent.includes(" + JSON.stringify(T.accept) + "))", "only the price is left", 15000);
    await inDialog([T.accept]);
    await until("!document.querySelector('dialog[open] .ox-state')?.textContent.includes(" + JSON.stringify(AR ? "جارٍ التحقق" : "Checking") + ") && ![...document.querySelectorAll('dialog[open] .cx-btn')].some(e => e.disabled && e.textContent.includes(" + JSON.stringify(AR ? "ادفع" : "Pay") + "))", "payable again", 15000);
    await shot("09-review-ready");
    check((await dialogText()).includes(T.allGood), "after looking at the changes everything is available at the prices shown");
    check((await api("/api/orders")).orders.length === orders0, "still nothing charged");
    await axe("review-ready", "dialog");
    await b.key("Escape", "Escape", 27);
    await pause(300);
    check(!(await js("!!document.querySelector('dialog[open]')")), "Escape closes the review");
  });

  // 1. Two customers want the last item; the one who pays second keeps the rest of the cart.
  await run("last-item", async () => {
    await fresh(await linkFor(second));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    await click(inRow("Last slice cheesecake", ".ox-add"));
    await click(inRow("Lemon mint", ".ox-add"));
    const first = await fetch(`${API}/api/store/al-noor/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: (await linkFor(third)).split("?t=")[1], payment: "link", items: [{ product_id: items["Last slice cheesecake"].id, quantity: 1 }] }) });
    check(first.ok, "scenario 1: the other customer got the last slice");
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("!!document.querySelector('dialog[open] .ox-line')", "the review opens");
    await until("!!document.querySelector('dialog[open] .ox-line.bad')", "the sold-out line is marked", 15000);
    const said = await dialogText();
    check(said.includes(nm("Lemon mint")), "…and the rest of the cart is still there");
    check(said.includes(AR ? "نفد" : "sold out"), "…and the line says it is sold out");
    await shot("10-last-item");
    await pressExact(T.remove, "document.querySelector('dialog[open]')");
    await until("!document.querySelector('dialog[open] .ox-line.bad') && ![...document.querySelectorAll('dialog[open] .cx-btn')].some(e => e.disabled && /Pay|ادفع/.test(e.textContent))", "payable with the rest", 15000);
    check((await dialogText()).includes(T.allGood), "with the sold-out slice removed the rest can be paid for");
  });

  // 1, at the same moment: one customer taps Pay on the page while another orders the same last
  // item through the API. Exactly one gets it; the other is told, and keeps the rest.
  await run("race", async () => {
    const cake = (await post("/api/items", { name: "Race cake", name_ar: "كيكة السباق", price: 2000, status: "live", category: "Specials", stock_rule: "count", opening_stock: 1 })).item;
    items["Race cake"] = cake;
    await fresh(await linkFor(second));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    await click(inRow("Race cake", ".ox-add"));
    await click(inRow("Lemon mint", ".ox-add"));
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("/Everything|كل شيء/.test(document.querySelector('dialog[open]')?.innerText ?? '')", "ready to pay", 15000);
    const rival = (await linkFor(third)).split("?t=")[1];
    const pay = `[...document.querySelectorAll('dialog[open] .cx-btn')].find(e => !e.disabled && !e.classList.contains('ghost'))`;
    const [rivalStatus] = await Promise.all([
      fetch(`${API}/api/store/al-noor/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: rival, payment: "link", items: [{ product_id: cake.id, quantity: 1 }] }) }).then((r) => r.status),
      click(pay, 50),
    ]);
    await pause(3000);
    const holding = (await api("/api/orders")).orders.filter((o) => o.status !== "cancelled" && o.items.some((i) => i.name === "Race cake"));
    check(holding.length === 1, `scenario 1 at the same moment: exactly one order has the last cake (${holding.length})`);
    const onPayPage = await js("location.pathname.startsWith('/pay/')");
    check((onPayPage && rivalStatus === 409) || (!onPayPage && rivalStatus === 200), `…the other was refused (this page ${onPayPage ? "won" : "lost"}, the rival got ${rivalStatus})`);
    if (!onPayPage) {
      const said = await dialogText();
      check(said.includes(AR ? "نفد" : "sold out") && said.includes(nm("Lemon mint")), "…and the one who lost sees it is sold out and still has the rest of the order");
      await shot("29-race-lost");
    }
    const left = (await api(`/api/items/${cake.id}`)).variants[0].on_hand;
    check(left === 0, "…and the stock is zero, never below");
  });

  // 5. After the cut-off: the next day is offered.
  await run("cutoff", async () => {
    await fresh(await linkFor(second));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    await click(inRow("Birthday cake", ".ox-add"));
    await put(`/api/items/${items["Birthday cake"].id}`, { schedule: [{ weekdays: ALLDAYS, lead_days: 1, cutoff: "00:01" }] });
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("!!document.querySelector('dialog[open] .ox-line')", "the review opens");
    await until("!!document.querySelector('dialog[open] .ox-line.bad') || /Everything|كل شيء/.test(document.querySelector('dialog[open]').innerText)", "the check", 15000);
    const said = await dialogText();
    check(said.includes(AR ? "فات وقت" : "too late") || said.includes(AR ? "أقرب يوم" : "next day"), "scenario 5: after the cut-off the reason is said");
    await shot("11-after-cutoff");
    const offered = await js("[...document.querySelectorAll('dialog[open] .ox-link')].some(e => /Use|استخدم/.test(e.textContent))");
    check(offered, "…and the next day it can be ordered for is offered");
    await put(`/api/items/${items["Birthday cake"].id}`, { schedule: [{ weekdays: ALLDAYS, lead_days: 1, cutoff: "23:00" }] });
  });

  // 11 and 12. On the account, and the same as last time.
  await run("account-and-again", async () => {
    await fresh(await linkFor(ahmed));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    await click(inRow("Hummus", ".ox-add"));
    await click(inRow("Falafel plate", ".ox-add"));
    await click(inRow("Laban", ".ox-add"));
    await post(`/api/items/${items["Hummus"].id}/switch`, { available: false });
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("!!document.querySelector('dialog[open] .ox-line')", "the review opens");
    await until("!!document.querySelector('dialog[open] .ox-line.bad')", "the sold-out line", 15000);
    check(await js("[...document.querySelectorAll('dialog[open] .cx-btn')].filter(e => e.textContent.includes(" + JSON.stringify(T.account) + ")).every(e => e.disabled)"), "scenario 11: the account button waits for the same checks");
    await pressExact(T.remove, "document.querySelector('dialog[open]')");
    await until("![...document.querySelectorAll('dialog[open] .cx-btn')].some(e => e.disabled && e.textContent.includes(" + JSON.stringify(T.account) + "))", "the account button enabled", 15000);
    const before = (await api("/api/ledger/summary")).customers.find((c) => c.id === ahmed.id).balance;
    await inDialog([T.account]);
    await until("!!document.querySelector('.cx-done')", "the order is placed on the account");
    check((await visibleText()).includes(AR ? "تمت إضافته إلى حسابك" : "added to your account"), "the order lands on the account, and the page says so");
    check((await api("/api/ledger/summary")).customers.find((c) => c.id === ahmed.id).balance > before, "the ledger went up by that order");
    await shot("12-on-account");
    // Same as last time, with an item gone.
    await post(`/api/items/${items["Hummus"].id}/switch`, { available: true });
    await post(`/api/items/${items["Falafel plate"].id}/switch`, { available: false });
    await fresh(await linkFor(ahmed));
    await until("!!document.querySelector('.ox-again')", "the same-as-last-time card");
    await shot("13-same-as-last-time");
    await axe("same-as-last-time");
    await pressText([T.again]);
    await until("!!document.querySelector('.cx-done')", "the order is placed in one tap");
    const gone = await visibleText();
    check(gone.includes(AR ? "غير مشمول" : "Not included") && gone.includes(nm("Falafel plate")), "scenario 12: what is gone is named");
    const last = (await api("/api/orders")).orders[0];
    check(last.items.length >= 1 && last.items.every((i) => !i.name.startsWith("Falafel")), "…and the rest was ordered");
    check(await js("!!document.querySelector('a.cx-btn[href^=\"/pay/\"]')"), "…with a way to pay for it");
    await shot("14-same-as-last-time-result");
    await post(`/api/items/${items["Falafel plate"].id}/switch`, { available: true });
  });

  // The pay page: pending, expired (with the way back), and a Pay that finds the link released.
  await run("pay", async () => {
    await fresh(await linkFor(second));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    await click(inRow("Laban", ".ox-add"));
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("!!document.querySelector('dialog[open] .cx-btn:not([disabled])')", "payable", 15000);
    await click(`[...document.querySelectorAll('dialog[open] .cx-btn')].find(e => !e.disabled && !e.classList.contains('ghost'))`);
    await until("location.pathname.startsWith('/pay/')", "the pay page");
    await until("!!document.querySelector('.cx-amount')", "the amount");
    const amount = await text(".cx-amount b");
    check(AR ? amount.includes("ر.ق") && !amount.includes("QAR") : amount.includes("QAR"), "the pay page writes the amount in the page's language");
    check(await js("!!document.querySelector('.cx-btn:not([disabled])')"), "a live Pay button while the order is held");
    await shot("15-pay-pending");
    await axe("pay");
    // The shop (or the hold) releases the order while the page is open; Pay must not be dead.
    const order = (await api("/api/orders")).orders[0];
    await post(`/api/orders/${order.id}/status`, { status: "cancelled" });
    await click("document.querySelector('.cx-btn:not(.ghost):not(.ink)')");
    await until("!!document.querySelector('.cx-done h1') && !document.querySelector('.cx-amount')", "the released state after a Pay that was refused", 10000);
    const released = await visibleText();
    check(released.includes(AR ? "أُلغي هذا الطلب" : "This order was released") && released.includes(AR ? "لم يُخصم" : "Nothing was charged"), "scenario 8 (page side): a pay link whose order was released says so");
    check(await js(`!![...document.querySelectorAll('a.cx-btn')].find(a => a.textContent.includes(${JSON.stringify(T.orderAgain)}) && a.getAttribute('href').startsWith('/s/al-noor'))`), "…with a button back to the shop");
    check(!(await js("!!document.querySelector('.cx-amount')")), "…and no Pay button");
    await shot("16-pay-expired");
    await axe("pay-expired");
    await b.go(`${BASE}${new URL(await js("location.href")).pathname}`, 600);
    check((await visibleText()).includes(AR ? "أُلغي هذا الطلب" : "This order was released"), "opening the link again says the same");
    // The way back keeps this customer's own link for the tab.
    await click(`[...document.querySelectorAll('a.cx-btn')].find(a => a.textContent.includes(${JSON.stringify(T.orderAgain)}))`, 900);
    await until("document.querySelectorAll('.ox-card').length >= 30", "back at the shop");
    check((await js("location.search")).includes("t="), "order again brings the customer back with their own link, so they can order");
  });

  // Wholesale: the table, in two widths.
  await run("wholesale", async () => {
    const group = (await post("/api/price-groups", { name: "Wholesale", name_ar: "الجملة" })).group;
    for (const en of ["Chicken shawarma", "Beef shawarma", "Karak tea", "Nails", "Falafel plate"]) {
      await put(`/api/items/${items[en].id}/group-prices`, { prices: [{ group_id: group.id, variant_id: null, price: Math.round(items[en].price * 0.8) }], reason: "Wholesale" });
    }
    await put(`/api/price-groups/customers/${third.id}`, { group_id: group.id });
    await fresh(await linkFor(third));
    await until("document.querySelectorAll('.ox-wrow').length > 10", "the table");
    check(await js("document.querySelector('[role=table]') !== null && document.querySelectorAll('[role=row]').length > 10"), "a price group gets the compact table");
    check((await text(".ox-wsku")).includes("NL-12"), "the table shows the SKU");
    check((await text(".ox-wrow")).includes(price("11.20")), "and the group's price for the item");
    check((await count(".ox-add")) > 10, "every row has its quantity control");
    await click(inRow("Beef shawarma", ".ox-add"));
    await click(inRow("Beef shawarma", ".ox-step button:last-child"));
    await shot("17-wholesale");
    await noSideScroll("the wholesale table at 375");
    check(await js("[...document.querySelectorAll('.ox-wrow')].every(r => { const b = r.getBoundingClientRect(); return b.left >= -0.5 && b.right <= innerWidth + 0.5; })"), "no row is wider than the screen");
    await axe("wholesale");
    await b.view(320, 640, true, "light");
    await b.go(await js("location.href"), 800);
    await noSideScroll("the wholesale table at 320");
    check(await js("[...document.querySelectorAll('.ox-wrow .ox-step, .ox-wrow .ox-add, .ox-wrow .ox-wprice')].every(e => { const b = e.getBoundingClientRect(); return b.left >= -0.5 && b.right <= innerWidth + 0.5; })"), "the key columns stay inside the screen at 320");
    await shot("18-wholesale-320");
    await b.view(375, 812, true, "light");
    await put(`/api/price-groups/customers/${third.id}`, { group_id: null });
  });

  // The page asks again while it is in front, and not while it is hidden.
  await run("live", async () => {
    await fresh(await linkFor(second));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    let asked = 0;
    b.on("Network.requestWillBeSent", (p) => { if (p.request.url.includes("/api/store/al-noor/live")) asked += 1; });
    await post(`/api/items/${items["Water"].id}/switch`, { available: false });
    const started = Date.now();
    await until(`!!(${row("Water")})?.classList.contains('off')`, "the sold-out item greyed by the refresh", 45000);
    const waited = (Date.now() - started) / 1000;
    check(waited >= 0 && waited <= 36, `live availability: the card was greyed ${waited.toFixed(0)} s after the change, by itself`);
    check((await text("[aria-live=polite]")).includes(AR ? "تم تحديث التوفر" : "Availability updated"), "and a screen reader is told");
    check(asked >= 1, `the refresh asked ${asked} time(s)`);
    await shot("19-live-sold-out");
    // Hidden: no requests.
    await js("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))");
    const before = asked;
    await pause(34000);
    check(asked === before, `while the tab is hidden the page does not ask (${asked - before} requests in 34 s)`);
    // The shop puts the item back while the tab is hidden; coming to the front must ask at
    // once (not after the next 20 to 30 seconds) and show it.
    await post(`/api/items/${items["Water"].id}/switch`, { available: true });
    check(await js(`!!(${row("Water")})?.classList.contains('off')`), "while hidden the card has not changed by itself");
    await js("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))");
    await until(`!(${row("Water")})?.classList.contains('off')`, "it asks at once when it comes back to the front", 8000);
    check(true, "coming back to the front asks at once");
  });

  // The keyboard: reach an item, open it, close it, and land where you were.
  await run("keyboard", async () => {
    await fresh(await linkFor(second));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    await js(`(${row("Hummus")}).querySelector('.ox-open').focus()`);
    await b.key("Enter", "Enter", 13);
    await until("!!document.querySelector('dialog[open]')", "Enter opens the item");
    check(await js("document.querySelector('dialog[open]').contains(document.activeElement)"), "focus moves into the item");
    await b.key("Escape", "Escape", 27);
    await pause(300);
    check(await js("document.activeElement.classList.contains('ox-open') && document.activeElement.closest('.ox-card').textContent.includes(" + JSON.stringify(nm("Hummus")) + ")"), "Escape closes it and focus is back on the item");
    await js(`(${row("Hummus")}).querySelector('.ox-add').focus()`);
    await b.key(" ", "Space", 32);
    await pause(200);
    check((await js(`(${row("Hummus")}).querySelector('.ox-step .num')?.textContent`)) === "1", "the space bar adds an item");
  });

  // Shared links preview as a photo, a name and a price, in the page's own HTML.
  await run("preview", async () => {
    const item = items["Kunafa"];
    for (const agent of ["WhatsApp/2.24.1.78 A", "facebookexternalhit/1.1", "Twitterbot/1.0"]) {
      const html = await (await fetch(`${BASE}/s/al-noor?item=${item.id}`, { headers: { "user-agent": agent } })).text();
      const meta = (property) => html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`))?.[1] ?? "";
      const image = meta("og:image");
      check(meta("og:title").includes("Kunafa") && meta("og:title").includes("QAR 15"), `${agent.split("/")[0]}: the preview has the name and price in its title`);
      check(/^https?:\/\//.test(image) && image.includes("-800.webp"), `${agent.split("/")[0]}: the photo is an absolute address at the 800 px size`);
      check(meta("og:description").includes("15 ر.ق") && meta("twitter:card") === "summary_large_image" && meta("og:url").endsWith(`?item=${item.id}`), `${agent.split("/")[0]}: Arabic price, large card and the item's own address`);
      if (agent.startsWith("WhatsApp")) {
        const got = await fetch(image.replace(/^https?:\/\/[^/]+/, BASE));
        check(got.status === 200 && got.headers.get("content-type") === "image/webp", "the photo itself is public and is a WebP");
      }
    }
    const cat = await (await fetch(`${BASE}/s/al-noor?cat=Drinks`, { headers: { "user-agent": "WhatsApp/2.24" } })).text();
    check(/og:title" content="Drinks/.test(cat), "a category link previews as the category");
  });

  // The tracking page, with a table and Arabic prices.
  await run("track", async () => {
    const link = await (async () => {
      const tokenLink = await linkFor(second, AR ? "طلب طاولة 7" : "Order table 7");
      return tokenLink;
    })();
    check(link.includes("?t="), "a table asked for in the chat comes back as the customer's own link");
    await fresh(link);
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    check((await visibleText()).includes(AR ? "طاولة 7" : "Table 7"), "the page says which table it is for");
    await click(inRow("Arabic coffee", ".ox-add"));
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("!!document.querySelector('dialog[open] .cx-btn:not([disabled])')", "payable", 15000);
    await click(`[...document.querySelectorAll('dialog[open] .cx-btn')].find(e => !e.disabled && !e.classList.contains('ghost'))`);
    await until("location.pathname.startsWith('/pay/')", "the pay page");
    const order = (await api("/api/orders")).orders[0];
    check(order.table === "7", "staff see the table on the order");
    await b.go(`${BASE}/t/${sql("select id from tenants where slug = 'al-noor'")}/${order.id}`, 900);
    await until("!!document.querySelector('.cx-track')", "the tracking page");
    check((await visibleText()).includes(AR ? "طاولة 7" : "Table 7") && (AR ? (await visibleText()).includes("6 ر.ق") : (await visibleText()).includes("QAR 6")), "the tracking page shows the table and prices in the page's language");
    await shot("20-track");
    await axe("track");
  });

  // A shop that has not switched the Catalog on keeps the page it always had.
  await run("legacy", async () => {
    sql("update tenant_modules set enabled = false where module_key = 'catalog' and tenant_id = (select id from tenants where slug = 'al-noor')");
    try {
      await fresh(await linkFor(second));
      await until("document.querySelectorAll('.cx-row').length > 10", "the old list");
      check((await count(".ox-card")) === 0 && (await count(".ox-chips")) === 0, "no new page for a shop without the Catalog: no photos, chips or search");
      check(await js("!!document.querySelector('.cx-cats') || document.querySelectorAll('.cx-section').length > 0"), "the list is by category, as before");
      const shown = await text(".cx-row-text .num");
      check(AR ? shown.includes("ر.ق") && !shown.includes("QAR") : shown.includes("QAR"), "prices are written in the page's language");
      await click("document.querySelector('.cx-add')");
      await click("document.querySelector('.cx-stepper button:last-child')");
      check((await text(".cx-sum")).length > 0, "the bar at the bottom shows the order");
      await shot("28-legacy-page");
      await axe("legacy");
      await click("document.querySelector('.cx-bar .cx-btn:not(.ghost)')");
      await until("location.pathname.startsWith('/pay/')", "the pay page, as before");
      check(true, "ordering goes on to the payment page, as before");
    } finally {
      sql("update tenant_modules set enabled = true where module_key = 'catalog' and tenant_id = (select id from tenants where slug = 'al-noor')");
    }
  });

  // The customer page and its sheets in the dark, with axe.
  await run("dark", async () => {
    await b.view(375, 812, true, "dark");
    await fresh(await linkFor(second));
    await until("document.querySelectorAll('.ox-card').length >= 30", "the menu");
    await click(inRow("Karak tea", ".ox-add"));
    await click(inRow("Pizza", ".ox-choose"));
    await until("!!document.querySelector('dialog[open]')", "the pizza opens");
    await shot("22-dark-item");
    await axe("dark-item", "dialog");
    await click("document.querySelector('dialog[open] .ox-x')");
    await pause(300);
    await click(`[...document.querySelectorAll('.cx-bar button')].find(e => e.textContent.trim())`);
    await until("!!document.querySelector('dialog[open] .ox-line')", "the review opens");
    await until("/Everything|كل شيء/.test(document.querySelector('dialog[open]').innerText)", "the check", 15000);
    await shot("23-dark-review");
    await axe("dark-review", "dialog");
    await b.key("Escape", "Escape", 27);
    await b.view(375, 812, true, "light");
  });

  // The shop's side: the Share sheet, its codes read back from what the browser shows, the
  // print layer, and the three settings.
  await run("share", async () => {
    const { COPY } = await import("../apps/web/app/(product)/_workspace/catalogCopy.ts");
    const { createRequire } = await import("node:module");
    const jsQR = createRequire(import.meta.url)("../apps/web/node_modules/jsqr");
    const ct = COPY[LANG];
    await b.go(`${BASE}/app/catalog`, 1500);
    if (AR) {
      await click(`document.querySelector('.sh-mtop [aria-label="Search or jump to"], .sh-mtop [aria-label="ابحث أو انتقل إلى"]')`, 300);
      await click(`[...document.querySelectorAll('.sh-palette button[role=option]')].find(b => /Switch to Arabic|التبديل إلى العربية|Arabic/.test(b.textContent))`, 600);
    }
    await until("document.querySelectorAll('.ct-card').length > 10", "the Catalog's list", 30000);
    await js("window.__saved = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__saved.push({ type: b.type, size: b.size }); return make(b); }; window.print = () => { window.__printed = document.querySelector('.ct-printsheet')?.innerText ?? ''; };");
    // The whole menu.
    await pressText([ct.share], "document.querySelector('.ct-actions')");
    await until("!!document.querySelector('.ct-sheet .ct-linkbox') && !!document.querySelector('.ct-sheet img.ct-qr[src]')", "the share sheet");
    const decode = async (selector) => {
      const pixels = await js(`new Promise((resolve) => { const img = document.querySelector(${JSON.stringify(selector)}); const draw = () => { const c = document.createElement('canvas'); c.width = c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 600); x.drawImage(img, 0, 0, 600, 600); resolve(Array.from(x.getImageData(0, 0, 600, 600).data)); }; if (img.complete) draw(); else img.onload = draw; })`);
      return jsQR(Uint8ClampedArray.from(pixels), 600, 600)?.data ?? null;
    };
    const link = await js("document.querySelector('.ct-sheet .ct-linkbox').value");
    check(link.endsWith("/s/al-noor"), `the link is the shop's public page (${link})`);
    check(!link.includes("?t=") && !link.includes("?c="), "…with no customer in it");
    check((await decode(".ct-sheet img.ct-qr")) === link, "the QR code on screen reads back as that link");
    check((await js("document.querySelector('.ct-sheet a[href^=\"https://wa.me/?text=\"]')?.href ?? ''")).includes(encodeURIComponent(link)), "Send on WhatsApp carries the link");
    check((await sheetText()).includes("5555 0100"), "the sheet says where an ordering customer is sent");
    await shot("24-share-menu");
    await axe("share-sheet", ".ct-sheet");
    await pressText([ct.downloadSvg], "document.querySelector('.ct-sheet')");
    await pressText([ct.downloadPng], "document.querySelector('.ct-sheet')");
    await pause(500);
    const saved = await js("window.__saved");
    check(saved.some((s) => s.type === "image/svg+xml" && s.size > 500) && saved.some((s) => s.type === "image/png" && s.size > 1000), "SVG and PNG downloads are made");
    // Tables.
    await click("document.querySelector('.ct-sheet .ct-tablesform input')");
    await b.type("1-3, A1");
    await pressText([ct.tablesMake], "document.querySelector('.ct-sheet')");
    await until("document.querySelectorAll('.ct-tablecard').length === 4", "four table codes");
    for (const [n, label] of ["1", "2", "3", "A1"].entries()) {
      const read = await decode(`.ct-tablecard:nth-child(${n + 1}) img`);
      check(read === `${link}?table=${label}`, `the code for table ${label} reads back with the table in its link`);
    }
    await shot("25-share-tables");
    await pressText([ct.printAll], "document.querySelector('.ct-sheet')");
    await until("(window.__printed ?? '').length > 100", "the print layer is built and printing starts", 6000);
    const printed = await js("window.__printed");
    check([ct.tableName("1"), ct.tableName("2"), ct.tableName("3"), ct.tableName("A1")].every((x) => printed.includes(x)) || printed.includes("A1"), "Print all builds a card for each table");
    check(printed.includes("ALYR") && printed.includes("Test Kitchen") && printed.includes("مطبخ التجربة"), "each card has the shop's name in both languages");
    // What the printer is given: only the print layer, dark ink on white, whatever the theme.
    // Looked at on a page as wide as A4's printable area (about 703 px).
    await b.view(703, 1000, false, "dark");
    await b.send("Emulation.setEmulatedMedia", { media: "print" });
    await pause(300);
    const onlyPrint = await js("[...document.body.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.className || e.tagName).join(',')");
    check(onlyPrint.length > 0 && onlyPrint.split(",").every((c) => c.includes("ct-printsheet")), `printing shows only the print layer (${onlyPrint.slice(0, 80)})`);
    const ink = await js("(() => { const s = getComputedStyle(document.querySelector('.ct-printsheet')); return s.color + ' on ' + s.backgroundColor; })()");
    check(ink.startsWith("rgb(21, 23, 26)") && ink.endsWith("rgb(255, 255, 255)"), `dark ink on white even with a dark screen (${ink})`);
    await shot("27-print-sheet");
    await b.view(375, 812, true, "light");
    await js("window.dispatchEvent(new Event('afterprint'))");
    await pause(300);
    check(!(await js("!!document.querySelector('.ct-printsheet')")), "the print layer goes away when printing is done");
    await click("document.querySelector('.ct-sheet .ct-close')");
    await pause(300);
    // An item, and a category.
    await click("document.querySelector('.ct-card .ct-share-btn')");
    await until("!!document.querySelector('.ct-sheet .ct-linkbox')", "the item's share sheet");
    check((await js("document.querySelector('.ct-sheet .ct-linkbox').value")).includes("?item="), "an item's Share gives a link to that item");
    check((await decode(".ct-sheet img.ct-qr")) === (await js("document.querySelector('.ct-sheet .ct-linkbox').value")), "…and its code reads back");
    await js(`(() => { const sel = document.querySelector('.ct-sheet select'); const opt = [...sel.options].find(o => o.value.startsWith('cat:Drinks')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await pause(400);
    check((await js("document.querySelector('.ct-sheet .ct-linkbox').value")).endsWith("?cat=Drinks"), "choosing a category gives its link");
    check((await decode(".ct-sheet img.ct-qr")) === (await js("document.querySelector('.ct-sheet .ct-linkbox').value")), "…and its code reads back");
    await click("document.querySelector('.ct-sheet .ct-close')");
    await pause(300);
    // Settings.
    await pressText([ct.settings], "document.querySelector('.ct-actions')");
    await until("!!document.querySelector('.ct-sheet input[name=ct-soldout]')", "the settings");
    await shot("26-settings");
    await axe("settings", ".ct-sheet");
    await click("document.querySelectorAll('.ct-sheet input[name=ct-soldout]')[1]");
    await click("document.querySelector('.ct-sheet input[inputmode=tel]')");
    await b.clearFocused();
    await b.type("call me");
    await pressText([ct.save], "document.querySelector('.ct-sheet')");
    await pause(600);
    check((await sheetText()).includes(ct.errors.bad_whatsapp), "a number that is not a number is refused in words");
    await click("document.querySelector('.ct-sheet input[inputmode=tel]')");
    await b.clearFocused();
    await b.type("5555 0100");
    await pressText([ct.save], "document.querySelector('.ct-sheet')");
    await until("!document.querySelector('.ct-sheet')", "the settings saved");
    const saved2 = await api("/api/items/settings");
    check(saved2.sold_out_display === "hide" && saved2.whatsapp_number === "97455550100", "the settings were saved (a local number gets the country code)");
    await put("/api/items/settings", { sold_out_display: "grey" });
    // The order list shows the table.
    await b.go(`${BASE}/app/orders`, 1500);
    // The workspace has its own language setting, so either word counts.
    check(/Table|طاولة/.test(await visibleText()), "staff see the table on an order");
  });

  // A slow phone: slow 3G (400 ms, 400 kbit/s each way) and a CPU four times slower, a shop
  // of 30 items with photos, against a production build (`--perf`, on its own web port).
  await run("perf", async () => {
    const link = await linkFor(second);
    await b.js("sessionStorage.clear()").catch(() => undefined);
    await b.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await b.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__p = { fcp: null, lcp: null, tap: null };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__p.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver((l) => { const es = l.getEntries(); window.__p.lcp = es[es.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      const poll = () => { const add = document.querySelector('.ox-add'); if (add && !window.__p.tap) { add.click(); if (document.querySelector('.ox-step')) { window.__p.tap = performance.now(); return; } } setTimeout(poll, 50); };
      document.addEventListener('DOMContentLoaded', poll);` });
    const report = [];
    for (const [name, url, cold] of [["a stranger's first visit (public link), cold", `${BASE}/s/al-noor`, true], ["a customer's first visit, cold", link, true], ["the customer's second visit, warm", link, false]]) {
      await b.send("Network.setCacheDisabled", { cacheDisabled: cold });
      if (cold) await b.send("Network.clearBrowserCache");
      const seen = new Map();
      let on = true;
      b.on("Network.requestWillBeSent", (p) => { if (on) seen.set(p.requestId, { url: p.request.url, type: p.type, bytes: 0, fromCache: false }); });
      b.on("Network.responseReceived", (p) => { const r = seen.get(p.requestId); if (on && r) r.fromCache = Boolean(p.response.fromDiskCache || p.response.fromPrefetchCache); });
      b.on("Network.loadingFinished", (p) => { const r = seen.get(p.requestId); if (on && r) r.bytes = p.encodedDataLength; });
      const raw = await (await fetch(url)).text();
      await b.go(url, 6000);
      const nav = await js("JSON.stringify({ ...window.__p, ttfb: performance.getEntriesByType('navigation')[0].responseStart, dcl: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd, load: performance.getEntriesByType('navigation')[0].loadEventEnd, shown: document.querySelectorAll('.ox-card').length })");
      on = false;
      const rows = [...seen.values()].filter((r) => !r.url.startsWith("data:"));
      const sum = (f) => rows.filter(f).reduce((n, r) => n + r.bytes, 0);
      const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
      const m = JSON.parse(nav);
      report.push({ name, requests: rows.length, total: kb(sum(() => true)), html: kb(sum((r) => r.type === "Document")), js: kb(sum((r) => r.type === "Script")), css: kb(sum((r) => r.type === "Stylesheet")), images: `${rows.filter((r) => r.type === "Image").length} (${kb(sum((r) => r.type === "Image"))})`, api: kb(sum((r) => r.url.includes("/api/") && r.type !== "Image")), fromCache: rows.filter((r) => r.fromCache).length, ttfb_ms: Math.round(m.ttfb), fcp_ms: Math.round(m.fcp), lcp_ms: Math.round(m.lcp), dom_content_loaded_ms: Math.round(m.dcl), load_ms: Math.round(m.load), first_add_works_ms: m.tap ? Math.round(m.tap) : null, items_in_html: (raw.match(/class="ox-card/g) ?? []).length, items_on_screen: m.shown });
    }
    writeFileSync(`${OUT}/${LANG}-perf.json`, JSON.stringify(report, null, 2));
    for (const r of report) log("perf", JSON.stringify(r));
    await shot("21-perf-slow-phone");
    await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await b.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    check(report.every((r) => r.items_in_html >= 30), "the first page of 30 items is in the HTML the phone gets first");
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
void sleep;
if (failures.length) { console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nAll checks passed.");
