// The back office's Discovery form (D-169), run with `pnpm test`: what staff type becomes the plain
// body the API stores, a block left alone is "not checked" and never "nothing there", a review is a
// rating, a date and whether it was answered and nothing else, and the form's words say people
// recorded it (never a connection, never anything automatic or AI).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { T } from "./discoveryOpsCopy.ts";
import { bodyOf, dayText, daysBetween, emptyForm, formFrom, isOld, parseReviews, reviewLine, reviewTally } from "./discoveryOpsLogic.ts";

const HERE = import.meta.dirname;
const TODAY = "2026-11-21";

function filled() {
  const form = emptyForm(TODAY);
  form.where = " the public Maps page ";
  form.listing.state = "found";
  form.listing.claimed = "no";
  form.listing.name = " Rose Salon ";
  form.listing.photos = "3";
  form.listing.rating = "5";
  form.listing.reviewCount = "40";
  form.listing.hours.mode = "none";
  form.listing.categoriesMode = "none";
  form.website.checked = true;
  form.website.url = "https://rose.example";
  form.website.lists = "yes";
  form.website.whatsappMode = "none";
  form.reviews = { checked: true, text: "5, 2026-11-10, no\n2, 2026-11-01, yes\n" };
  form.social.instagram = { link: "https://instagram.com/rose", linked: "no" };
  return form;
}

test("a filled form becomes the plain body the API stores", () => {
  const out = bodyOf(filled());
  assert.equal(out.ok, true);
  assert.deepEqual(out.body, {
    observed_on: TODAY, where: "the public Maps page",
    listing: { found: true, claimed: false, name: "Rose Salon", hours: {}, categories: [], photo_count: 3, review_count: 40, rating: 5 },
    website: { url: "https://rose.example", lists_location: true, whatsapp_link: "" },
    reviews: [{ rating: 5, posted_on: "2026-11-10", replied: false }, { rating: 2, posted_on: "2026-11-01", replied: true }],
    social: { instagram: { url: "https://instagram.com/rose", linked_from_site: false } },
  });
});

test("what was not looked at is left out, so the API reads it as not checked", () => {
  const form = emptyForm(TODAY);
  form.website.checked = true;
  form.website.lists = "no";
  const out = bodyOf(form);
  assert.equal(out.ok, true);
  assert.deepEqual(out.body.website, { lists_location: false });
  assert.equal(out.body.listing, null);
  assert.equal(out.body.reviews, null);
  assert.equal(out.body.social, null);
  // an untouched field inside a looked-at block is not sent either
  const listing = emptyForm(TODAY);
  listing.listing.state = "found";
  assert.deepEqual(bodyOf(listing).body.listing, { found: true });
  // looking and finding none is said out loud
  assert.deepEqual(bodyOf(filled()).body.listing.hours, {});
  assert.deepEqual(bodyOf(filled()).body.website.whatsapp_link, "");
  assert.equal("hours" in bodyOf(filled()).body.website, false);
});

test("a form with nothing recorded, or a looked-at block with nothing in it, is refused", () => {
  assert.equal(bodyOf(emptyForm(TODAY)).ok, false);
  const empty = emptyForm(TODAY);
  empty.website.checked = true;
  assert.match(bodyOf(empty).error, /untick it/);
  const none = emptyForm(TODAY);
  none.listing.state = "missing";
  assert.deepEqual(bodyOf(none).body.listing, { found: false });
  assert.equal(bodyOf({ ...emptyForm(""), listing: none.listing }).ok, false);
});

test("hours are seven days, a closed day is null, and the times are checked", () => {
  const form = emptyForm(TODAY);
  form.listing.state = "found";
  form.listing.hours.mode = "set";
  form.listing.hours.days.fri.closed = true;
  const out = bodyOf(form).body.listing.hours;
  assert.deepEqual(Object.keys(out), ["sat", "sun", "mon", "tue", "wed", "thu", "fri"]);
  assert.equal(out.fri, null);
  assert.deepEqual(out.sat, ["09:00", "21:00"]);
  form.listing.hours.days.sat.open = "22:00";
  assert.match(bodyOf(form).error, /opens before it closes/);
  form.listing.hours.days.sat.open = "9am";
  assert.match(bodyOf(form).error, /07:00 and 22:00/);
});

test("a review line is a rating, a date and whether it was answered, and nothing else", () => {
  const ok = parseReviews("5 2026-11-10 y\n3; 2026-11-02; no\n\n1,2026-10-30,replied", TODAY);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.reviews.map((r) => [r.rating, r.posted_on, r.replied]), [[5, "2026-11-10", true], [3, "2026-11-02", false], [1, "2026-10-30", true]]);
  for (const bad of [
    "5, 2026-11-10, no, Maryam was rude", // words and a name
    "Maryam K. 2026-11-10 no", // a name instead of a rating
    "5, 2026-11-10", // not said whether it was answered
    "6, 2026-11-10, no", // not a star rating
    "4, 10/11/2026, no", // not year-month-day
    "4, 2026-11-30, no", // after the day it was seen
    "4, 2026-11-10, maybe",
  ]) {
    const out = parseReviews(bad, TODAY);
    assert.equal(out.ok, false, bad);
    assert.match(out.error, /^Line 1: /);
  }
  assert.match(parseReviews("5, 2026-11-10, no, rude staff", TODAY).error, /not recorded/);
});

test("the tally under the box counts what was typed, and says nothing while a line is wrong", () => {
  assert.deepEqual(reviewTally("5, 2026-11-10, no\n2, 2026-11-01, yes\n3, 2026-10-01, no", TODAY), { count: 3, replied: 1, low: 2 });
  assert.equal(reviewTally("5, nonsense", TODAY), null);
  assert.deepEqual(reviewTally("", TODAY), { count: 0, replied: 0, low: 0 });
});

test("a new round starts from the last thing recorded, with today's day, and gives back what was typed", () => {
  const week = { sat: ["09:00", "21:00"], sun: null, mon: ["09:00", "21:00"], tue: ["09:00", "21:00"], wed: ["09:00", "21:00"], thu: ["09:00", "21:00"], fri: null };
  const saved = {
    observed_on: "2026-11-19", where: "Maps",
    listing: { found: true, claimed: false, name: "Rose Salon", hours: week, categories: ["Beauty salon"], photo_count: 3, rating: 5, review_count: 40 },
    website: { url: "https://rose.example", whatsapp_link: "", lists_location: true },
    reviews: [{ rating: 5, posted_on: "2026-11-10", replied: false }],
    social: { instagram: { url: "https://instagram.com/rose", linked_from_site: false } },
  };
  const form = formFrom(saved, TODAY);
  assert.equal(form.observedOn, TODAY);
  assert.equal(form.listing.hours.mode, "set");
  assert.equal(form.listing.hours.days.sun.closed, true);
  assert.equal(form.listing.categoriesMode, "set");
  assert.equal(form.website.whatsappMode, "none");
  assert.equal(form.reviews.text, "5, 2026-11-10, no");
  assert.equal(reviewLine({ rating: 2, posted_on: "2026-11-01", replied: true }), "2, 2026-11-01, yes");
  // saved and sent again unchanged: the same facts
  const again = bodyOf(form).body;
  assert.deepEqual(again.listing.hours, week);
  assert.deepEqual(again.reviews, saved.reviews);
  assert.deepEqual(again.website, { url: "https://rose.example", lists_location: true, whatsapp_link: "" });
  // nothing recorded: the empty form
  assert.deepEqual(formFrom(null, TODAY), emptyForm(TODAY));
});

test("days are counted and written plainly", () => {
  assert.equal(daysBetween("2026-11-01", TODAY), 20);
  assert.equal(isOld("2026-11-01", TODAY, 14), true);
  assert.equal(isOld("2026-11-10", TODAY, 14), false);
  assert.equal(dayText("2026-11-01"), "1 Nov 2026");
});

test("the form's words say people recorded it: no connection, nothing live or automatic, no AI", () => {
  const flat = (v) => (typeof v === "function" ? [v(3, 1, 2), v("x", "y", "z")] : v && typeof v === "object" ? Object.values(v).flatMap(flat) : [v]);
  const words = Object.values(T).flatMap(flat).map(String);
  assert.ok(words.length > 40);
  for (const text of words) {
    assert.doesNotMatch(text, /\b(AI|smart|intelligen\w*|assistant|agentic|learns?|predicts?|automatic(ally)?|live|connected to Google)\b/i, text);
    assert.doesNotMatch(text, /…|\.\.\.$/, text);
  }
  assert.match(T.intro, /Nothing is read from Google/);
  assert.match(T.reviewsHelp, /words and name are never recorded/);
  assert.equal(T.noneShown, "None shown");
});

test("the form draws and calls only; every word is in the copy, and it calls only the business in the address", () => {
  const code = readFileSync(join(HERE, "Discovery.tsx"), "utf8");
  const loose = [...code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim()).filter((t) => t && !t.startsWith("//") && !/[=;()&?|]/.test(t));
  assert.deepEqual(loose, []);
  assert.doesNotMatch(code, /\b(aria-label|placeholder|title)="[A-Za-z]/);
  const calls = [...code.matchAll(/api(?:<[^>]*>)?\(`([^`]+)`/g)].map((m) => m[1]);
  assert.ok(calls.length >= 3);
  for (const call of calls) assert.match(call, /^(\$\{base\}|\/api\/admin\/businesses\/\$\{businessId\}\/modules\/discovery)/);
});
