// The second-factor screens (ALY-125, D-136), run with `pnpm test`: reading the API's answer, the
// shapes of typed codes, and the words in both languages.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COPY, codesLeftText, minutesText } from "./factorCopy.ts";
import { codesFile, digits, gateOf, groups, isSecondFactorAnswer, minutesToWait, recovery } from "./factorLogic.ts";
import { landing } from "../login/next.ts";
import jsQR from "jsqr";
import { color } from "../../_tokens/tokens.ts";
import { ascii, pixels } from "../_workspace/qr.ts";

const required = (extra) => ({ detail: { code: "second_factor_required", message: "x", ...extra } });

test("only the second-factor 403 is staff who have not done the second step", () => {
  assert.equal(isSecondFactorAnswer(403, required({ enrolled: true })), true);
  assert.equal(isSecondFactorAnswer(403, { detail: "ALYR staff only" }), false);
  assert.equal(isSecondFactorAnswer(401, required({})), false);
  assert.equal(isSecondFactorAnswer(403, { detail: { code: "enrolment_closed" } }), false);
  assert.equal(isSecondFactorAnswer(403, null), false);
  assert.equal(isSecondFactorAnswer(403, {}), false);
});

test("an account with an authenticator is asked for a code; one without sees setup only when it is open", () => {
  assert.equal(gateOf(required({ enrolled: true, enrolment_open: false })), "prompt");
  assert.equal(gateOf(required({ enrolled: false, enrolment_open: true })), "enrol");
  assert.equal(gateOf(required({ enrolled: false, enrolment_open: false })), "closed");
  assert.equal(gateOf(null), "closed");
  assert.equal(gateOf({}), "closed");
});

test("staff who must still pass the second step are sent on to the console, not to the workspace", async () => {
  const isStaff = async () => isSecondFactorAnswer(403, required({ enrolled: true }));
  assert.equal(await landing("/ops/audit", isStaff), "/ops/audit");
  const stranger = async () => isSecondFactorAnswer(403, { detail: "ALYR staff only" });
  assert.equal(await landing("/ops/audit", stranger), "/app");
});

test("a typed code is only digits, six at most; a recovery code is grouped in fours", () => {
  assert.equal(digits(" 123 456 789"), "123456");
  assert.equal(digits("12a3-4"), "1234");
  assert.equal(recovery("abcd efgh jklm xyz"), "ABCD-EFGH-JKLM");
  assert.equal(recovery("ab"), "AB");
  assert.equal(recovery("abcdefgh"), "ABCD-EFGH");
  assert.equal(recovery("abcd-efgh-jklm"), "ABCD-EFGH-JKLM");
  assert.equal(groups("JBSWY3DPEHPK3PXP"), "JBSW Y3DP EHPK 3PXP");
});

test("the recovery codes file says what it is and holds one code a line", () => {
  assert.equal(codesFile(["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF"], "Head"), "Head\n\nAAAA-BBBB-CCCC\nDDDD-EEEE-FFFF\n");
});

test("a wait is whole minutes and never zero", () => {
  assert.equal(minutesToWait(0), 1);
  assert.equal(minutesToWait(61), 2);
  assert.equal(minutesToWait(600), 10);
});

test("every English word has an Arabic one, of the same kind", () => {
  assert.deepEqual(Object.keys(COPY.ar).sort(), Object.keys(COPY.en).sort());
  for (const key of Object.keys(COPY.en)) {
    assert.equal(typeof COPY.ar[key], typeof COPY.en[key], key);
    if (typeof COPY.en[key] === "string") assert.ok(COPY.en[key].length > 0 && COPY.ar[key].length > 0, key);
  }
});

test("the Arabic has no QAR, no ellipsis and no kashida; neither language promises 'soon'", () => {
  const strings = (lang) => Object.values(COPY[lang]).map((v) => (typeof v === "function" ? v(3) : v));
  for (const text of strings("ar")) {
    assert.doesNotMatch(text, /QAR|…|\.\.\./, text);
    assert.doesNotMatch(text, /ـ/, text);
    assert.doesNotMatch(text, /قريباً/, text);
  }
  for (const text of strings("en")) assert.doesNotMatch(text, /\bsoon\b|…|\.\.\./i, text);
  const arabic = strings("ar").filter((t) => /[؀-ۿ]/.test(t));
  assert.ok(arabic.length >= strings("ar").length - 2, "almost every Arabic string is written in Arabic");
});

test("counts agree with their nouns in Arabic and English", () => {
  assert.equal(minutesText(1, "en"), "1 minute");
  assert.equal(minutesText(10, "en"), "10 minutes");
  assert.equal(minutesText(1, "ar"), "دقيقة واحدة");
  assert.equal(minutesText(2, "ar"), "دقيقتين");
  assert.equal(minutesText(5, "ar"), "5 دقائق");
  assert.equal(minutesText(11, "ar"), "11 دقيقة");
  assert.equal(codesLeftText(0, "ar"), "لم يبقَ أي رمز");
  assert.equal(codesLeftText(1, "ar"), "بقي رمز واحد");
  assert.equal(codesLeftText(2, "ar"), "بقي رمزان");
  assert.equal(codesLeftText(10, "ar"), "بقي 10 رموز");
  assert.equal(codesLeftText(1, "en"), "1 code left");
  assert.equal(codesLeftText(9, "en"), "9 codes left");
});

test("the setup square reads back, with an independent decoder, as the key link the API made", () => {
  const link = "otpauth://totp/ALYR%3Aops%40alyr.example?secret=J77HNSWIKF5DWNOJKZ2MCMAK4T7FQMSC&issuer=ALYR&algorithm=SHA1&digits=6&period=30";
  const colours = { dark: color.brand.carbon, light: color.ink.white };
  for (const scale of [4, 8]) {
    const { width, height, data } = pixels(link, scale, colours);
    const found = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
    assert.ok(found, `no code found at ${scale}`);
    assert.equal(found.data, ascii(link));
    const url = new URL(found.data);
    assert.equal(url.protocol, "otpauth:");
    assert.equal(url.searchParams.get("secret"), "J77HNSWIKF5DWNOJKZ2MCMAK4T7FQMSC");
    assert.equal(url.searchParams.get("period"), "30");
    assert.equal(url.searchParams.get("digits"), "6");
  }
});
