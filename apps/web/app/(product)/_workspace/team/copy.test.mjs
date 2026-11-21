import test from "node:test";
import assert from "node:assert/strict";
import { T } from "./copy.ts";

// Every string the screens can say, in both languages: plain strings as they are, functions called with
// representative arguments (one, two and many for the counts).
function sayAll(lang) {
  const out = [];
  const walk = (key, value) => {
    if (typeof value === "string") out.push([key, value]);
    else if (typeof value === "function") {
      const tries = [
        [1, "Nuqta Car Care", 1], [2, "Nuqta Car Care", 2], [7, "Nuqta Car Care", 3], [0, null, 0], ["Yusuf", "Agent"], [1, 12, 0],
        [7, ["Hana", "Omar"]], [true], [{ sold: 1, booked: 2, answered: 3, lost: 4 }, 5], [10], [12, 0, 1],
      ];
      const results = [];
      for (const args of tries) {
        try { results.push(value(...args)); } catch { /* these arguments are not this function's */ }
      }
      for (const r of results) {
        if (typeof r === "string") out.push([key, r]);
        else if (Array.isArray(r)) for (const pair of r) for (const s of pair) out.push([key, s]);
      }
    } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(`${key}.${k}`, v);
  };
  for (const [key, value] of Object.entries(T[lang])) walk(key, value);
  return out;
}

test("English and Arabic have the same keys, and the same kind of value under each", () => {
  const kinds = (bag) => Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, typeof v === "object" ? Object.keys(v).sort().join(",") : typeof v]));
  assert.deepEqual(kinds(T.ar), kinds(T.en));
});

test("every string says something, and says it in the right script", () => {
  for (const [key, value] of sayAll("en")) assert.ok(value.trim().length > 0, `en ${key} is empty`);
  for (const [key, value] of sayAll("ar")) {
    assert.ok(value.trim().length > 0, `ar ${key} is empty`);
    // Names, "ALYR" and numbers are Latin; a whole sentence with no Arabic letter is an English leak.
    if (key !== "signingSigned" && value.length > 14 && !/^[\d\s.,·–-]+$/.test(value)) assert.match(value, /[؀-ۿ]/, `ar ${key} has no Arabic: ${value}`);
  }
});

test("Western digits everywhere, and money is never written QAR in Arabic", () => {
  for (const [key, value] of sayAll("ar")) {
    assert.doesNotMatch(value, /[٠-٩۰-۹]/, `Eastern digits in ar ${key}: ${value}`);
    assert.doesNotMatch(value, /QAR/, `QAR on an Arabic screen in ${key}: ${value}`);
  }
  assert.match(T.en.statSalesSub(3, 291200), /QAR 2,912/);
  assert.match(T.ar.statSalesSub(3, 291200), /2,912 ر\.ق/);
});

test("honest wording: none of the banned words or unfinished phrases, in either language", () => {
  const banned = [
    /\bAI\b/, /\bsmart\b/i, /\bintelligen/i, /\bassistant\b/i, /\bbot\b/i, /\bpredict/i, /\bforecast/i, /\bmagic/i, /\bpowered\b/i,
    /ask alyr/i, /free replies/i, /at risk/i, /\bSKU\b/, /health score/i, /\bsoon\b/i, /\bbeta\b/i, /not yet/i, /\bplanned\b/i, /\bnew\b/i,
    /leaderboard/i, /top performer/i, /\brank(?:ed|ing)? (?:by|first)/i,
    /ذكي/, /مساعد/, /قريباً/, /قيد التنفيذ/, /ليس بعد/, /وكيل/,
  ];
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of sayAll(lang)) {
      for (const pattern of banned) assert.doesNotMatch(value, pattern, `${lang} ${key}: "${value}" matches ${pattern}`);
    }
  }
});

test("the report never ranks: the rule says so, and says A to Z", () => {
  assert.match(T.en.weekRule, /never ranks/);
  assert.match(T.en.weekRule, /A to Z/);
  assert.match(T.ar.weekRule, /أبجدياً/);
});

test("no em dash stands for an empty value, no exclamation marks", () => {
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of sayAll(lang)) {
      assert.doesNotMatch(value, /—\s*$/, `${lang} ${key} ends in an em dash`);
      assert.doesNotMatch(value, /!/, `${lang} ${key} has an exclamation mark`);
    }
  }
});

test("Arabic counts agree with their number", () => {
  assert.match(T.ar.peopleSub(1, "X"), /^شخص واحد يمكنه/);
  assert.match(T.ar.peopleSub(2, "X"), /^شخصان يمكنهما/);
  assert.match(T.ar.peopleSub(7, "X"), /^7 أشخاص يمكنهم/);
  assert.match(T.ar.peopleSub(12, "X"), /^12 شخصاً يمكنهم/);
  assert.match(T.ar.waitingBanner(1, 5, 0), /^عميل واحد ينتظر/);
  assert.match(T.ar.waitingBanner(2, 5, 0), /^عميلان ينتظران/);
  assert.match(T.ar.removeConversationsResult(2), /^محادثتان تعودان/);
});

test("a sentence about waiting customers names only what it counted", () => {
  assert.equal(T.en.waitingBanner(3, 12, 1), "3 customers are waiting for an answer, the longest 12 min. 1 of them has nobody on it yet.");
  assert.equal(T.en.waitingBanner(1, 4, 0), "1 customer is waiting for an answer, the longest 4 min.");
  assert.doesNotMatch(T.en.waitingBanner(3, 12, 0), /nobody/);
});

test("removing someone says only what the server does: sign-in ends, open conversations go back to nobody", () => {
  assert.match(T.en.removeSignInResult, /at once/i);
  assert.match(T.en.removeConversationsResult(2), /go back to Unassigned/);
  assert.equal(T.en.removeConversationsResult(0), "None are open");
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of sayAll(lang)) if (key.startsWith("remove")) assert.doesNotMatch(value, /shift|مناوب|calendar|جدول/i, `${lang} ${key}`);
  }
});

test("the invite says what is true: an email with how to sign in, no password, no resend promised", () => {
  assert.match(T.en.inviteBulletEmail, /emails them how to sign in/);
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of sayAll(lang)) if (key.startsWith("invite")) assert.doesNotMatch(value, /send (it|the email) again|إعادة الإرسال/i, `${lang} ${key}`);
  }
});
