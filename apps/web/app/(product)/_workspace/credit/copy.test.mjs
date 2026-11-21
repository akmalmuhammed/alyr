import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CREDIT_COPY } from "./copy.ts";

const { en, ar } = CREDIT_COPY;

// One set of arguments for every phrase that is a function, so each is called in both languages.
const CASES = {
  ageSummary: ["x"], subtitle: [14, 11], over60Sub: [["Bayview School", "Omar Ali", "Sara Haddad"], 3], promisedSub: [["Noor Abdullah"], 1, "Wed 18 Nov"],
  paidIn: ["November"], paidInSub: [4, "400"], ofLimit: ["6,000"], limitUsedLabel: ["Bluefin Events"],
  promisePassed: ["Mon 9 Nov"], promisePassedShort: ["Mon 9 Nov"], promiseBy: ["Wed 18 Nov"], sent: [2],
  pager: [1, 11, 11, 3, "Mon 9 Nov"], openOrdersSub: [4, "3,442"], withIt: ["5,970", "6,000"],
  paidHow: ["bank_transfer", "Omar"], stickyNote: [7, 11, 3], accountSub: ["+974 5555 0188", "Sat 5 Sep 2026", "Hana"],
  separateDeposit: ["300", 54, "Bluefin Events"], andMore: [2], forDays: ["1,040", "41 days"], sinceToday: ["224"],
  percentUsed: [84], leftBefore: ["236"], overBy: ["80"], since: ["Fri 2 Oct"], promisedOnNothing: ["Mon 2 Nov", 0],
  notPaidSub: [2], owesTotal: ["Bluefin Events"], stageRange: [60, 89], stageNow: [41], stageFrom: ["Tue 1 Dec"],
  eventReminder: ["Gentle", "1,040", "10:11"], promiseUntil: ["Mon 9 Nov"], sendRemindersBy: ["Hana"], nextReminder: ["Gentle", "1,264"],
  windowOpen: ["Wed 11 Nov", "17:52", "Thu 12 Nov", "17:52"], orMore: ["30 days"], matchLine: [6, 3, 3], willBe: [3], areSkipped: [3],
  wroteAt: ["Thu 12 Nov", "07:54", true], skipPromise: ["Wed 18 Nov"], skipRecent: ["Mon 9 Nov 16:20"], skipRecentSub: ["today 16:20"],
  skipStop: ["Wed 21 Oct"], skipStopSub: ["+974 5555 0118"], whatReads: ["Bluefin Events"], promiseTapHelp: ["Thu 19 Nov"],
  viaHelp: ["Bayview School", "template", 9, "Firm"], inTheirLanguage: ["Arabic"], sendN: [3], remindersSent: [3],
  payTitle: ["Bluefin Events"], owesLine: ["Bluefin Events"], oldestSaleOld: ["41 days"], amountError: ["more", "1,264"],
  stillOwed: ["224"], limitTitle: ["Bluefin Events"], owesNow: ["1,264"], usedLeft: [84, "236"], lastPassed: ["Mon 9 Nov"],
  statementSub: ["Bluefin Events"], periodText: ["5 Sep 2026", "12 Nov 2026"], youOweOn: ["12 Nov 2026"], hiddenLines: [2],
  payOnlineHelp: ["Nuqta Car Care"], bankRef: ["ST-2026-0007"], periodAll: ["5 Sep 2026"], periodSince: ["2 Nov 2026"],
  optLink: ["1,264"], onceSent: ["ST-2026-0007"], confirmSendTitle: ["Bluefin Events"], confirmSendBody: ["ST-2026-0007", ["+974 5555 0188"]],
};

/** Every phrase of a language as text: strings as they are, functions called with their case, lists and groups flattened. */
function phrases(dict) {
  const out = [];
  const walk = (key, value) => {
    if (typeof value === "string") out.push([key, value]);
    else if (typeof value === "function") {
      assert.ok(key in CASES, `copy.test.mjs has no case for the phrase "${key}"`);
      const text = value(...CASES[key]);
      assert.equal(typeof text, "string", `${key} must return text`);
      out.push([key, text]);
    } else if (Array.isArray(value)) value.forEach((v, i) => walk(`${key}[${i}]`, v));
    else if (value && typeof value === "object") {
      if (Array.isArray(value.en) && Array.isArray(value.ar)) return; // a noun: its words are checked by the kit's counted()
      for (const [k, v] of Object.entries(value)) walk(`${key}.${k}`, v);
    }
  };
  for (const [key, value] of Object.entries(dict)) walk(key, value);
  return out;
}

test("both languages have the same phrases, of the same kind", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  for (const key of Object.keys(en)) assert.equal(typeof en[key], typeof ar[key], `${key}: kind differs`);
  const flat = (d) => phrases(d).map(([k]) => k).sort();
  assert.deepEqual(flat(en), flat(ar));
});

test("every phrase with arguments has a test case, and none is stale", () => {
  const functions = Object.keys(en).filter((k) => typeof en[k] === "function").sort();
  assert.deepEqual(Object.keys(CASES).sort(), functions);
});

test("no phrase is empty", () => {
  for (const [lang, dict] of Object.entries({ en, ar })) {
    for (const [key, text] of phrases(dict)) assert.ok(text.trim().length > 0, `${lang}.${key} is empty`);
  }
});

test("no banned word, no unfinished wording, in either language", () => {
  const banned = /\b(?:ai|smart|assistant|bot|predicts?|forecast|magic|powered|soon|beta|planned|sku|artificial|intelligen\w*)\b|free replies|ask alyr|health score|at risk|not yet|قريباً|قيد التنفيذ|ليس بعد|(?<![؀-ۿ])(?:ذكي|ذكاء)(?![؀-ۿ])/i;
  for (const [lang, dict] of Object.entries({ en, ar })) {
    for (const [key, text] of phrases(dict)) assert.ok(!banned.test(text), `${lang}.${key}: "${text}"`);
  }
});

test("Arabic has Latin digits only, no «QAR », no Arabic digit separators", () => {
  for (const [key, text] of phrases(ar)) {
    assert.ok(!/[٠-٩۰-۹]/.test(text), `ar.${key} has Eastern digits: "${text}"`);
    assert.ok(!text.includes("QAR "), `ar.${key} writes QAR: "${text}"`);
    assert.ok(!/[٬٫]/.test(text), `ar.${key} has an Arabic separator: "${text}"`);
  }
  assert.equal(readFileSync(new URL("./copy.ts", import.meta.url), "utf8").match(/[٠-٩۰-۹]/g), null, "copy.ts has an Eastern digit");
});

test("no em dash and no sentence that ends in an ellipsis, in either language", () => {
  for (const [lang, dict] of Object.entries({ en, ar })) {
    for (const [key, text] of phrases(dict)) {
      assert.ok(!text.includes("—"), `${lang}.${key} has an em dash`);
      assert.ok(!/(…|\.\.\.)\s*$/.test(text), `${lang}.${key} ends in an ellipsis`);
    }
  }
});

test("a count agrees with its noun in Arabic: one, two, three to ten, eleven and up", () => {
  assert.equal(ar.willBe(1), "سيُذكَّر عميل واحد");
  assert.equal(ar.willBe(2), "سيُذكَّر عميلان");
  assert.equal(ar.willBe(3), "سيُذكَّر 3 عملاء");
  assert.equal(ar.willBe(11), "سيُذكَّر 11 عميلاً");
  assert.equal(ar.sendN(2), "إرسال تذكيرين");
  assert.equal(en.sendN(1), "Send 1 reminder");
  assert.equal(en.sendN(3), "Send 3 reminders");
  assert.equal(en.areSkipped(1), "1 is skipped");
});

test("a range of days keeps its numbers in one run in Arabic", () => {
  assert.match(ar.bucket.d0_30, /^⁦0–30⁩ /);
  assert.match(ar.stageRange(60, 89), /^⁦60–89⁩ /);
  assert.equal(en.bucket.d31_60, "31–60 days");
});

test("the currency prefix is the word in each language", () => {
  assert.equal(en.currency, "QAR");
  assert.equal(ar.currency, "ر.ق");
});
