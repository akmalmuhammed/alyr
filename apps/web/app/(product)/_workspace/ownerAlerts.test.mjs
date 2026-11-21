// What ALYR sends the signed-in person, and the staff numbers' switches (D-192, D-193, spec 069):
// every word is written in both languages, none names another day than the report's (Sunday, as the
// code runs it), none claims AI, an agent is never offered the report, and the booking messages
// are offered only where the Bookings product is on. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { COPY as CATALOG } from "./catalogCopy.ts";
import { COPY as WHATSAPP } from "./whatsappCopy.ts";

const HERE = import.meta.dirname;
const AI = /\b(ai|smart|intelligen\w*|learns?|predicts?|assistant)\b/i;
const MONDAY = /monday|الاثنين|الإثنين/i;
const ARABIC = /[؀-ۿ]/;

const mine = ["alertsTitle", "alertsHint", "alertReport", "alertReportHint", "alertBookings", "alertBookingsHint", "alertEmail", "alertEmailHint", "alertsNeedLink"];
const staff = ["staffBookings", "staffBookingsHint", "staffReport", "staffReportHint"];

test("every sentence about what ALYR sends you is written in both languages", () => {
  for (const key of mine) {
    assert.ok(WHATSAPP.en[key].length > 0, `en ${key}`);
    assert.match(WHATSAPP.ar[key], ARABIC, `ar ${key}`);
    assert.doesNotMatch(WHATSAPP.ar[key], /QAR/, `ar ${key} says QAR`);
  }
  for (const key of staff) {
    assert.ok(CATALOG.en[key].length > 0, `en ${key}`);
    assert.match(CATALOG.ar[key], ARABIC, `ar ${key}`);
  }
});

test("the report is called a Sunday one, in both languages, and no word names Monday or AI", () => {
  assert.match(WHATSAPP.en.alertReportHint, /Sunday/);
  assert.match(WHATSAPP.ar.alertReportHint, /الأحد/);
  assert.match(CATALOG.en.staffReportHint, /Sunday/);
  assert.match(CATALOG.ar.staffReportHint, /الأحد/);
  for (const [lang, copy, keys] of [["en", WHATSAPP.en, mine], ["ar", WHATSAPP.ar, mine], ["en", CATALOG.en, staff], ["ar", CATALOG.ar, staff]]) {
    for (const key of keys) {
      assert.doesNotMatch(copy[key], MONDAY, `${lang} ${key} names Monday`);
      assert.doesNotMatch(copy[key], AI, `${lang} ${key} says AI`);
    }
  }
});

test("the email never promises the customer's details, and says so", () => {
  assert.match(WHATSAPP.en.alertEmailHint, /leaves out the customer's name and number/);
  assert.match(WHATSAPP.ar.alertEmailHint, /لا يتضمن اسم العميل ولا رقمه/);
});

test("the card offers the report to owners and admins only, the booking messages where Bookings is on, the email to owners", () => {
  const source = readFileSync(join(HERE, "WhatsappLink.tsx"), "utf8");
  assert.match(source, /const manager = role === "owner" \|\| role === "admin"/);
  assert.match(source, /\.\.\.\(manager \? \[\{ key: "weekly_report"/);
  assert.match(source, /\.\.\.\(hasBookings \? \[\{ key: "booking_alerts"/);
  assert.match(source, /hasBookings && role === "owner" \? \[\{ key: "booking_email"/);
  // The two WhatsApp switches are off until a phone is linked; the email does not need one.
  assert.match(source, /key: "weekly_report"[^}]*disabled: !status\.linked/);
  assert.match(source, /key: "booking_email"[^}]*disabled: false/);
});

test("the staff numbers list switches the report and the booking messages, and sends them when a number is added", () => {
  const source = readFileSync(join(HERE, "CatalogSettings.tsx"), "utf8");
  assert.match(source, /change\(n, \{ booking_alerts: next \}\)/);
  assert.match(source, /change\(n, \{ weekly_report: next \}\)/);
  assert.match(source, /booking_alerts: bookings, weekly_report: report/);
});
