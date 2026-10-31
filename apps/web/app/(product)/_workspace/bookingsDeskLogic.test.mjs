// Tests for the desk's small functions (ALY-259, D-142): the end of a visit, and the sentence that
// says what became of the message to the customer, in both languages. A customer who cannot be
// messaged is told to staff before and after, with the number to call. Run with `node --test`
// from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOKINGS } from "./bookingsCopy.ts";
import { addMinutes, answerFor, reasonFor, warningFor } from "./bookingsDeskLogic.ts";

const en = BOOKINGS.en;
const ar = BOOKINGS.ar;

test("a visit ends on the clock, past the hour and past midnight", () => {
  assert.equal(addMinutes("16:15", 45), "17:00");
  assert.equal(addMinutes("09:30", 90), "11:00");
  assert.equal(addMinutes("23:30", 60), "00:30");
  assert.equal(addMinutes("", 30), "");
});

test("a move or a cancel says the customer is told when the message went", () => {
  const told = { sent: true, reason: null, phone: null };
  assert.equal(answerFor(en.moved, told, en), "Moved. The customer is told on WhatsApp.");
  assert.match(answerFor(ar.cancelled, told, ar), /^تم الإلغاء\. يُبلَّغ العميل عبر واتساب\.$/);
});

test("a message that could not go says why and gives the number", () => {
  const told = { sent: false, reason: "no_consent", phone: "97455500001" };
  assert.equal(
    answerFor(en.moved, told, en),
    "Moved. The customer has not agreed to WhatsApp messages yet, so nothing was sent. Tell them yourself: 97455500001.",
  );
  const stop = { sent: false, reason: "opted_out", phone: null };
  assert.equal(
    answerFor(en.cancelled, stop, en),
    "Cancelled. The customer asked not to be messaged, so nothing was sent. Tell them yourself.",
  );
  const arabic = answerFor(ar.moved, told, ar);
  assert.match(arabic, /لم يوافق بعد على رسائل واتساب/);
  assert.match(arabic, /97455500001/);
  assert.doesNotMatch(arabic, /[٠-٩]/, "Western digits in Arabic");
});

test("a reason nobody wrote words for still says it could not be messaged", () => {
  const told = { sent: false, reason: "something_new", phone: null };
  assert.match(answerFor(en.moved, told, en), /could not be messaged/);
  assert.match(answerFor(ar.moved, told, ar), /تعذّرت مراسلته/);
});

test("a walk-in says nothing about a message: nothing was sent", () => {
  assert.equal(answerFor(en.added, null, en), "Booking added.");
});

test("the warning before an action is for a customer who cannot be messaged, and only then", () => {
  assert.equal(warningFor("granted", "97455500001", en), "");
  assert.equal(
    warningFor("unknown", "97455500001", en),
    "This customer has not agreed to WhatsApp messages yet, so ALYR cannot message them. Tell them yourself: 97455500001.",
  );
  assert.match(warningFor("revoked", null, en), /asked not to be messaged/);
  assert.match(warningFor("unknown", "97455500001", ar), /هذا العميل لم يوافق بعد/);
  assert.equal(reasonFor("revoked"), "opted_out");
  assert.equal(reasonFor("unknown"), "no_consent");
});
