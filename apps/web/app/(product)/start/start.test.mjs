// What the sign-up screens (/start) say in Arabic, and a few things the walk through them found
// (30 Oct 2026): the drawn WhatsApp chat takes the screen's language, an area has an Arabic name,
// the test booking reads as an Arabic sentence, a refused sign-up says why, and a way to write to
// ALYR is always on the screen. Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { COPY } from "./copy.ts";
import { areaName, bookingWhat } from "./format.ts";

const HERE = import.meta.dirname;
const page = readFileSync(join(HERE, "page.tsx"), "utf8");
const chat = readFileSync(join(HERE, "Chat.tsx"), "utf8");
const presets = readFileSync(join(HERE, "../../../../api/src/alyr/presets.py"), "utf8");

test("every area the API offers has a name in Arabic, and English keeps the stored name", () => {
  const block = presets.slice(presets.indexOf("AREAS = ("), presets.indexOf(")", presets.indexOf("AREAS = (")));
  const areas = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(areas.length >= 7, `read ${areas.length} areas from presets.py`);
  for (const area of areas) {
    assert.ok(COPY.ar.areas[area], `${area} has no Arabic name`);
    assert.match(COPY.ar.areas[area], /^[؀-ۿ ]+$/, `${area}: ${COPY.ar.areas[area]} is not Arabic only`);
    assert.equal(areaName(COPY.en.areas, area, "en"), area);
    assert.equal(areaName(COPY.ar.areas, area, "ar"), COPY.ar.areas[area]);
  }
  // An area typed or stored some other way is shown as it is, never lost.
  assert.equal(areaName(COPY.ar.areas, "Somewhere Else", "ar"), "Somewhere Else");
});

test("the drawn chat says its few words in the screen's language", () => {
  assert.deepEqual(Object.keys(COPY.ar.chat).sort(), Object.keys(COPY.en.chat).sort());
  for (const [key, text] of Object.entries(COPY.ar.chat)) {
    if (key === "initials") continue;
    assert.doesNotMatch(text, /[A-Za-z]/, `chat.${key} has English in it: ${text}`);
  }
  assert.doesNotMatch(chat, /<small>Business account<\/small>/);
  assert.doesNotMatch(chat, /return "now"/);
  // Every chat on a /start screen is given the screen's words and a first letter of its own.
  assert.equal([...page.matchAll(/<Chat\b/g)].length, [...page.matchAll(/labels=\{t\.chat\}/g)].length);
  assert.doesNotMatch(page, /initialsOf\(shopName\)/);
});

test("an Arabic screen prints money as the amount then «ر.ق», not QAR", () => {
  const preview = page.slice(page.indexOf("const preview = useMemo"), page.indexOf("// ── screens"));
  // The one helper that writes an amount is the only place that may name QAR.
  const outsideHelper = preview.replace(/\/\/[^\n]*\n/g, "").replace(/const money = [^\n]*\n/, "");
  assert.doesNotMatch(outsideHelper, /QAR/, "the drawn chat writes QAR outside the money helper");
  assert.match(preview, /ر\.ق/);
  assert.match(preview, /money\(/);
});

test("the test booking reads as an Arabic sentence on an Arabic screen", () => {
  const booking = {
    service: "Beard trim & shape", service_ar: "تهذيب اللحية", when_text: "Sat 31 Oct, 10:00 AM", starts_at: "2026-10-31T07:00:00Z",
  };
  assert.equal(bookingWhat(booking, "en"), "Beard trim & shape, Sat 31 Oct, 10:00 AM");
  const ar = bookingWhat(booking, "ar");
  assert.match(ar, /^تهذيب اللحية، /);
  assert.doesNotMatch(ar, /[A-Za-z]/, ar);
  // Qatar's own clock (UTC+3), and the digits are 0 to 9.
  assert.match(ar, /\b31\b/);
  assert.match(ar, /\b10:00\b/);
  assert.doesNotMatch(ar, /[٠-٩]/);
  // A service with no Arabic name, or a booking with no time, still says something whole.
  assert.match(bookingWhat({ ...booking, service_ar: "" }, "ar"), /^Beard trim & shape، /);
  assert.equal(bookingWhat({ service: "Cut", when_text: "Sat 10:00", }, "ar"), "Cut، Sat 10:00");
  assert.match(page, /bookingWhat\(tested, lang\)/);
});

test("a refused sign-up says why, not that the connection is down", () => {
  assert.equal([...page.matchAll(/answer\.status === 429/g)].length, 3, "a code, a wrong-code limit and a new business each answer 429 in words");
  for (const lang of ["en", "ar"]) {
    assert.ok(COPY[lang].account.tooManyTries.trim());
    assert.ok(COPY[lang].basics.tooMany.trim());
    assert.notEqual(COPY[lang].basics.tooMany, COPY[lang].offline);
  }
  assert.doesNotMatch(COPY.ar.basics.tooMany, /[A-Za-z]/);
  assert.doesNotMatch(COPY.ar.account.tooManyTries, /[A-Za-z]/);
});

test("a way to write to ALYR is on every screen, laptop and phone", () => {
  assert.equal(COPY.en.helpMail, "hello@alyr.qa");
  assert.equal(COPY.ar.helpMail, COPY.en.helpMail);
  // The box in the side rail (a laptop) and the line at the foot of the content (everywhere else).
  assert.match(page, /<a className="ob-help" href=\{`mailto:\$\{t\.helpMail\}`\}>/);
  assert.match(page, /className="ob-help-line"/);
  for (const lang of ["en", "ar"]) {
    // No promise of a time, and no "message us" with nowhere to send it.
    assert.doesNotMatch(COPY[lang].helpSub, /hour|minute|ساعة|دقيقة/i);
  }
  const css = readFileSync(join(HERE, "start.css"), "utf8");
  assert.match(css, /@media \(min-width: 1024px\) \{ \.ob-help-line \{ display: none; \} \}/);
});

test("the reminder's stop page names the right address and always has a way on", () => {
  for (const lang of ["en", "ar"]) {
    const body = COPY[lang].resumeStop.body;
    // Sign-up lives on the app's address; the public site has no /start.
    assert.match(body, /app\.alyr\.qa\/start/, body);
    assert.doesNotMatch(body, /(^|[^.\w])alyr\.qa\/start/, body);
    assert.ok(COPY[lang].resumeStop.failedTitle.trim());
  }
  const stop = readFileSync(join(HERE, "stop/page.tsx"), "utf8");
  const failed = stop.slice(stop.indexOf('phase === "failed"'));
  assert.match(failed, /<h1>/, "a link that does not work still has a heading");
  assert.match(failed, /href="\/start"/, "and a way into setup");
  assert.match(failed, /mailto:/, "and a way to write to ALYR");
});

