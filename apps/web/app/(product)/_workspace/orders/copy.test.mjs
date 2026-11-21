import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ORDERS_COPY } from "./copy.ts";

const { en, ar } = ORDERS_COPY;
const EASTERN = /[٠-٩۰-۹]/;
const money = (lang, n) => (lang === "ar" ? `${n} ر.ق` : `QAR ${n}`);
const BANNED = [/\bAI\b/i, /\bsmart\b/i, /\bassistant\b/i, /\bbot\b/i, /free repl/i, /\bSKU\b/, /\bAt risk\b/i, /\bmagic\b/i, /\bpredict/i, /\bforecast/i, /coming soon/i, /\bbeta\b/i, /\bnot yet\b/i, /\bplanned\b/i, /قريباً/, /ليس بعد/, /قيد التنفيذ/, /الذكاء/, /مساعد/];

/** Sample arguments for each function in the copy, by name: a string, a number, a list, or a filter words object. */
function sample(name, index, lang) {
  if (name === "lateEntry") return [index === 0 ? 1041 : 18, 18, lang];
  if (name === "joinList") return [["#1041 (18 min)", "#1040 (22 min)"]];
  if (name === "filteredBody") return [14, { payment: "paid", mode: "delivery", by: "Yusuf" }];
  if (name === "toastStep") return [1038, "ready", "Mariam", true, lang];
  if (name === "toastCancelled") return [1039, 4, money(lang, 185), true, lang];
  if (name === "placedAt") return ["09:12", "delivery", "today"];
  if (name === "actPaid") return ["Cash", money(lang, 110), "Salma"];
  if (name === "actCancelled") return ["Hana", "", 4];
  if (name === "trackStage") return ["ready", true];
  if (name === "dayFull") return ["Thu 12 Nov"];
  if (name === "toastPaid") return [1032, "Cash", money(lang, 110), lang];
  if (name === "toastStepFailed") return [1041, "New", "Khalid", lang];
  if (name === "marginPct") return [46, money(lang, 170)];
  if (name === "pagerRange") return [1, 14, 14];
  if (name === "showingOf") return [6, 14];
  if (name === "itemsInLines") return [4, 3];
  if (name === "windowOpenNote") return ["Yousef", "09:10"];
  if (name === "cancelTileConfirmedBy") return ["Salma", "09:20"];
  if (name === "cancelTileDelivery") return ["Al Gharafa", "today"];
  if (name === "areaFee") return ["Al Gharafa", money(lang, 15)];
  if (name === "trackingBody") return ["Yousef", "Salma"];
  if (name === "lateOrders") return [2, "#1041 (18 min) and #1040 (22 min)"];
  return null;
}

/** Calls a copy function with plausible arguments, whatever its shape. */
function call(name, fn, lang) {
  const given = sample(name, 0, lang);
  if (given) return fn(...given);
  const args = Array.from({ length: fn.length }, (_, i) => (i === 0 && /^(openOrders|sectionItems|timelineSteps|whStockBack|replyWindowHours|orderTitle|markPaidTitle|cancelTitle|noteConfirm|noteReady|noteDone|toastPaid|toastStepFailed|errAlreadyPaid|waCancelled|pagerRange|showingOf|itemsInLines)/.test(name) ? 12 : i === 0 ? "Aisha" : i === 1 ? 1042 : money(lang, 110)));
  return fn(...args);
}

test("copy: English and Arabic have the same keys, of the same kind, taking the same arguments", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  for (const key of Object.keys(en)) {
    assert.equal(typeof en[key], typeof ar[key], `${key}: kind`);
    if (typeof en[key] === "function") assert.equal(en[key].length, ar[key].length, `${key}: number of arguments`);
  }
});

test("copy: every function answers in both languages with words and no leftovers", () => {
  for (const [name, value] of Object.entries(en)) {
    if (typeof value !== "function") continue;
    for (const [lang, dict] of [["en", en], ["ar", ar]]) {
      const out = call(name, dict[name], lang);
      assert.ok(typeof out === "string" && out.trim().length > 0, `${lang}.${name} answered ${JSON.stringify(out)}`);
      assert.ok(!/undefined|NaN|\[object/.test(out), `${lang}.${name}: ${out}`);
    }
  }
});

test("copy: Arabic has Arabic and no English money, Latin digits only, in every string", () => {
  const strings = [];
  for (const [lang, dict] of [["en", en], ["ar", ar]]) {
    for (const [name, value] of Object.entries(dict)) strings.push([lang, name, typeof value === "function" ? call(name, value, lang) : value]);
  }
  for (const [lang, name, out] of strings) {
    if (typeof out !== "string") continue;
    assert.ok(!EASTERN.test(out), `${lang}.${name} has an Eastern digit`);
    if (lang === "ar") assert.ok(!/\bQAR\b/.test(out), `ar.${name} writes QAR: ${out}`);
  }
});

test("copy: no banned word in either language, and no wording the unfinished-wording test rejects", () => {
  for (const dict of [en, ar]) {
    for (const [name, value] of Object.entries(dict)) {
      const out = typeof value === "function" ? call(name, value, dict === ar ? "ar" : "en") : value;
      for (const pattern of BANNED) assert.ok(!pattern.test(out), `${name}: "${out}" matches ${pattern}`);
    }
  }
});

test("copy.ts: no Eastern digit anywhere in the file, and the Arabic block never says QAR", () => {
  const src = readFileSync(new URL("./copy.ts", import.meta.url), "utf8");
  assert.ok(!EASTERN.test(src));
  const start = src.indexOf("const ar: typeof en = {");
  assert.ok(start > 0, "the Arabic block is found");
  const block = src.slice(start);
  assert.ok(!/QAR/.test(block), "the Arabic block never says QAR");
  assert.ok(/ر\.ق|bidi\("ar"/.test(block), "Arabic amounts come through the formatter");
});

test("copy: the words the product already had reviewed in Arabic are reused", () => {
  assert.equal(ar.btnMarkPaid, "تسجيل كمدفوع");
  assert.equal(ar.btnSaveAsPaid, "حفظ كمدفوع");
  assert.equal(ar.howDidTheyPay, "كيف دفع؟");
  assert.equal(ar.methodCardTerminal, "بطاقة عبر الجهاز");
  assert.equal(ar.showUnconfirmed, "طلبات لم تُؤكَّد بعد");
  assert.equal(en.showUnpaid, "Orders with a payment link still open");
});

test("copy: the sentences that must say a thing say it (honest wording)", () => {
  assert.equal(en.replyWindowHours(23), "Typed replies allowed for 23 more hours");
  assert.equal(en.codeOf("WAX-500"), "Code WAX-500");
  assert.ok(en.openRuleFooter("QAR 4,849").startsWith("By rule:"));
  assert.ok(en.marginRule("QAR 170", "QAR 92").startsWith("By rule:"));
  assert.equal(en.marginTitle, "Margin, from your costs");
  assert.ok(en.refundDueNote("QAR 185").includes("ALYR does not move money"));
  assert.equal(en.filteredBody(14, { payment: "paid", mode: "delivery", by: "Yusuf" }), "None of the 14 open orders is a paid delivery handled by Yusuf.");
  assert.equal(en.filteredBody(3, { payment: "unpaid" }), "None of the 3 open orders is an unpaid order.");
  assert.equal(en.toastStep(1038, "ready", "Mariam", true), "Order #1038 is ready. Mariam was told on WhatsApp.");
  assert.equal(en.toastStep(1038, "ready", "Mariam", false), "Order #1038 is ready. Mariam asked not to get messages, so nobody was told.");
  assert.equal(en.toastStepFailed(1041, "New", "Khalid"), "That did not save. Order #1041 is still New and Khalid has not been told.");
  assert.equal(en.toastCancelled(1039, 4, "QAR 185", true), "Order #1039 is cancelled. 4 items went back to stock. A refund of QAR 185 is due. The sale was taken off the account.");
  assert.equal(en.lateOrders(2, "#1041 (18 min) and #1040 (22 min)"), "2 orders have been new for more than 15 min: #1041 (18 min) and #1040 (22 min). Nobody has confirmed them yet.");
});

test("copy: Arabic counts agree (one, two, three to ten, eleven and more)", () => {
  assert.deepEqual([0, 1, 2, 3, 14].map(ar.openOrders), ["لا توجد طلبات مفتوحة.", "طلب واحد مفتوح.", "طلبان مفتوحان.", "3 طلبات مفتوحة.", "14 طلباً مفتوحاً."]);
  assert.deepEqual([1, 2, 5, 12].map(ar.whStockBack), ["صنف واحد يعود إلى المخزون", "صنفان يعودان إلى المخزون", "5 أصناف تعود إلى المخزون", "12 صنفاً يعود إلى المخزون"]);
  assert.ok(ar.lateOrders(1, "x").includes("لم يؤكده"));
  assert.ok(ar.lateOrders(2, "x").includes("لم يؤكدهما"));
  assert.ok(ar.lateOrders(5, "x").includes("لم يؤكدها"));
});
