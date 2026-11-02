// The outreach screens' logic (specs/065, ALY-311), run with `pnpm test`: the bases each country
// allows, a draft's sentences mapped to numbered sources, the prospect filters, the CSV import's
// checks, the forms' checks, and reading the API's stale-hash refusal.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  annotate, basesFor, checkCsv, countriesOffered, filterProspects, freeMailRefused, honeytokenList, isStaleHash,
  leftToday, numberSources, parseCsv, percent, policyFor, prospectErrors, settingsErrors, shortUrl, stageTone, words,
  EMPTY_PROSPECT, POLICY, groupPolicy,
} from "./outreachLogic.ts";
import { FINDING, GATEWAY_CHECK, STAGE, STAGE_ORDER } from "./copy.ts";

test("Qatar and the Gulf allow the five bases and cap autonomy at L1", () => {
  for (const c of ["QA", "SA", "KW", "BH", "OM", "AE", "qa"]) {
    assert.deepEqual(basesFor(c), ["published_business_contact", "existing_relationship", "referral", "opt_in", "inbound"], c);
    assert.equal(policyFor(c).cap, 1, c);
  }
  assert.equal(policyFor("AE").working_days, "Mon to Fri");
  assert.equal(policyFor("AE").hours, "08:30 to 16:30");
  assert.equal(policyFor("QA").working_days, "Sun to Thu");
});

test("legitimate interest is offered only where the policy allows it", () => {
  assert.ok(basesFor("GB").includes("legitimate_interest"));
  assert.ok(basesFor("US").includes("legitimate_interest"));
  assert.ok(basesFor("FR").includes("legitimate_interest"));
  assert.ok(!basesFor("QA").includes("legitimate_interest"));
  assert.deepEqual(basesFor("DE"), ["opt_in", "inbound", "existing_relationship"]);
  assert.deepEqual(basesFor("IT"), ["opt_in", "inbound", "existing_relationship"]);
  assert.ok(basesFor("CA").includes("conspicuous_publication"));
  assert.equal(policyFor("CA").lane, "consent_only");
  assert.equal(policyFor("US").cap, 3);
  assert.equal(policyFor("GB").cap, 2);
});

test("an unknown country is blocked, with no basis to choose", () => {
  for (const c of ["", "ZZ", "IN", "CN"]) {
    assert.equal(policyFor(c).lane, "blocked", c);
    assert.deepEqual(basesFor(c), [], c);
  }
  assert.ok(!countriesOffered().includes("ZZ"));
  assert.equal(countriesOffered()[0], "QA");
});

test("the API's own policy wins over the screen's copy", () => {
  const api = [{ country: "QA", lane: "allowed", bases: ["opt_in"], cap: 1, time_zone: "Asia/Qatar", working_days: "", hours: "", free_mail_refused: true }];
  assert.deepEqual(basesFor("QA", api), ["opt_in"]);
  assert.equal(policyFor("GB", api).lane, "blocked");
  assert.ok(POLICY.length > 30);
});

test("free mail is refused unless the person opted in, wrote first or knows ALYR", () => {
  assert.equal(freeMailRefused("sara@gmail.com", "published_business_contact"), true);
  assert.equal(freeMailRefused("sara@yahoo.co.uk", "referral"), true);
  assert.equal(freeMailRefused("sara@gmail.com", "opt_in"), false);
  assert.equal(freeMailRefused("sara@hotmail.com", "inbound"), false);
  assert.equal(freeMailRefused("sara@outlook.com", "existing_relationship"), false);
  assert.equal(freeMailRefused("sara@dunelight-bakehouse.example", "published_business_contact"), false);
});

const claims = [
  { id: "c1", text: "Bakes sourdough daily", url: "https://dunelight.example/", quote: "sourdough every morning", kept: true, dropped_reason: null },
  { id: "c2", text: "Takes orders on Instagram", url: "https://dunelight.example/order", quote: "DM us to order", kept: true, dropped_reason: null },
  { id: "c3", text: "Has three branches", url: "https://dunelight.example/about", quote: "three branches", kept: false, dropped_reason: "quote not found on the page" },
];

test("sources are numbered in the order the draft first cites them, once each", () => {
  const s = numberSources([
    { text: "Hi Mariam,", claim_ids: [] },
    { text: "I saw you take orders by DM.", claim_ids: ["c2"] },
    { text: "And bake sourdough every morning, which people ask for by DM.", claim_ids: ["c1", "c2"] },
  ], claims);
  assert.deepEqual(s.list.map((x) => [x.n, x.claim.id]), [[1, "c2"], [2, "c1"]]);
  assert.equal(s.number.get("c2"), 1);
  assert.deepEqual(s.missing, []);
});

test("a cited claim that was dropped, or does not exist, is reported missing, not numbered", () => {
  const s = numberSources([{ text: "You have three branches.", claim_ids: ["c3", "c9", "c3"] }], claims);
  assert.deepEqual(s.list, []);
  assert.deepEqual(s.missing, ["c3", "c9"]);
});

test("the body keeps its line breaks and each sentence carries its numbers", () => {
  const body = "Hi Mariam,\n\nI saw you take orders by DM. You bake sourdough every morning.\n\nAkmal";
  const sentences = [
    { text: "Hi Mariam,", claim_ids: [] },
    { text: "I saw you take orders by DM.", claim_ids: ["c2"] },
    { text: "You bake sourdough every morning.", claim_ids: ["c1", "c2"] },
    { text: "A sentence the edit removed.", claim_ids: ["c1"] },
  ];
  const { pieces, unplaced } = annotate(body, sentences, numberSources(sentences, claims));
  assert.equal(pieces.map((p) => p.text).join(""), body);
  const cited = pieces.filter((p) => p.sentence);
  assert.deepEqual(cited.map((p) => p.refs), [[], [1], [1, 2]]);
  assert.deepEqual(unplaced.map((s) => s.text), ["A sentence the edit removed."]);
});

test("the same sentence twice is placed twice, in order", () => {
  const body = "Thanks. More. Thanks.";
  const sentences = [{ text: "Thanks.", claim_ids: [] }, { text: "More.", claim_ids: [] }, { text: "Thanks.", claim_ids: [] }];
  const { pieces, unplaced } = annotate(body, sentences, numberSources(sentences, claims));
  assert.equal(pieces.map((p) => p.text).join(""), body);
  assert.equal(pieces.filter((p) => p.sentence).length, 3);
  assert.deepEqual(unplaced, []);
});

test("words are counted the way the lint counts them", () => {
  assert.equal(words("  Hi Mariam,\n\nshort  note. "), 4);
  assert.equal(words(""), 0);
});

const rows = [
  { id: "1", company: "Dunelight Bakehouse", domain: "dunelight.example", country: "QA", stage: "in_review", contact_first_name: "Mariam", contact_role: "Owner", business_type: "Bakery" },
  { id: "2", company: "Café Tessellé", domain: "tessele.example", country: "GB", stage: "needs_human", contact_first_name: "Tom", contact_role: "Founder", business_type: "Café" },
  { id: "3", company: "Pebblegate Florist", domain: "pebblegate.example", country: "QA", stage: "sending", contact_first_name: "", contact_role: "", business_type: "Florist" },
];

test("filters combine: stage, the 'needs you' group, country and a folded search", () => {
  assert.deepEqual(filterProspects(rows, { stage: "", country: "", q: "" }).map((r) => r.id), ["1", "2", "3"]);
  assert.deepEqual(filterProspects(rows, { stage: "sending", country: "", q: "" }).map((r) => r.id), ["3"]);
  assert.deepEqual(filterProspects(rows, { stage: "attention", country: "", q: "" }).map((r) => r.id), ["1", "2"]);
  assert.deepEqual(filterProspects(rows, { stage: "attention", country: "qa", q: "" }).map((r) => r.id), ["1"]);
  assert.deepEqual(filterProspects(rows, { stage: "", country: "", q: "cafe tess" }).map((r) => r.id), ["2"]);
  assert.deepEqual(filterProspects(rows, { stage: "", country: "", q: "OWNER" }).map((r) => r.id), ["1"]);
  assert.deepEqual(filterProspects(rows, { stage: "", country: "", q: "florist" }).map((r) => r.id), ["3"]);
  assert.deepEqual(filterProspects(rows, { stage: "", country: "US", q: "" }), []);
});

test("CSV is read the RFC 4180 way: quotes, doubled quotes, commas and new lines inside", () => {
  const out = parseCsv('﻿company,notes\r\n"Dunelight, Doha","said ""yes"" once\nthen paused"\r\n\r\nPebblegate,\n');
  assert.deepEqual(out, [["company", "notes"], ["Dunelight, Doha", 'said "yes" once\nthen paused'], ["Pebblegate", ""]]);
});

test("the import says which columns are missing and which rows will be refused", () => {
  const header = "Company,Website,Country,First name,Last name,Role,Email,Basis,Language,Notes,Score";
  const csv = [
    header,
    "Dunelight Bakehouse,https://dunelight.example,QA,Mariam,,Owner,mariam@dunelight.example,published_business_contact,en,",
    ",https://x.example,QA,,,,,referral,en,",
    "Nowhere Ltd,https://n.example,ZZ,,,,,referral,en,",
    "Tessellé,https://tessele.example,DE,,,,,published_business_contact,en,",
    "Pebblegate,https://pebblegate.example,QA,Sara,,,sara@gmail.com,referral,en,",
    "Open Door,https://opendoor.example,GB,,,,,legitimate_interest,en,",
  ].join("\n");
  const c = checkCsv(csv);
  assert.equal(c.rows, 6);
  assert.deepEqual(c.missing, []);
  assert.deepEqual(c.unknown, ["Score"]);
  assert.deepEqual(c.problems.map((p) => p.row), [2, 3, 4, 5]);
  assert.match(c.problems[1].reason, /blocked/);
  assert.match(c.problems[2].reason, /not allowed for DE/);
  assert.match(c.problems[3].reason, /free-mail/);
  assert.deepEqual(checkCsv("company,email\nA,a@b.example").missing, ["website", "country", "basis"]);
});

test("adding by hand needs a basis the country allows, and an https website", () => {
  const good = { ...EMPTY_PROSPECT, company: "Dunelight Bakehouse", website: "https://dunelight.example", country: "QA", basis: "referral" };
  assert.deepEqual(prospectErrors(good), {});
  assert.ok(prospectErrors({ ...good, basis: "" }).basis);
  assert.ok(prospectErrors({ ...good, basis: "legitimate_interest" }).basis);
  assert.ok(prospectErrors({ ...good, country: "ZZ" }).country);
  assert.ok(prospectErrors({ ...good, website: "dunelight.example" }).website);
  assert.ok(prospectErrors({ ...good, contact_email: "mariam@gmail.com" }).contact_email);
  assert.deepEqual(prospectErrors({ ...good, basis: "opt_in", contact_email: "mariam@gmail.com" }), {});
  assert.ok(prospectErrors({ ...good, contact_email: "not an email" }).contact_email);
});

test("settings: a whole-number cap, real addresses as honeytokens, an https booking link", () => {
  const ok = { global_daily_cap: "50", default_level: 1, honeytokens: "trap-one@alyr-check.example\nTRAP-TWO@alyr-check.example", booking_url: "" };
  assert.deepEqual(settingsErrors(ok), {});
  assert.ok(settingsErrors({ ...ok, global_daily_cap: "0" }).global_daily_cap);
  assert.ok(settingsErrors({ ...ok, global_daily_cap: "12.5" }).global_daily_cap);
  assert.ok(settingsErrors({ ...ok, global_daily_cap: "501" }).global_daily_cap);
  assert.match(settingsErrors({ ...ok, honeytokens: "a@b.example\nnope" }).honeytokens, /nope/);
  assert.ok(settingsErrors({ ...ok, booking_url: "http://cal.example/akmal" }).booking_url);
  assert.deepEqual(honeytokenList(" A@b.example, a@b.example\n\nc@d.example "), ["a@b.example", "c@d.example"]);
});

test("only a 409 with the stale_hash code is a stale approval", () => {
  assert.equal(isStaleHash(409, { detail: { code: "stale_hash", message: "changed" } }), true);
  assert.equal(isStaleHash(409, { detail: "conflict" }), false);
  assert.equal(isStaleHash(400, { detail: { code: "stale_hash" } }), false);
  assert.equal(isStaleHash(409, null), false);
});

test("what may still go out today is the lower cap less what went", () => {
  assert.equal(leftToday({ sent: 4, global_cap: 50, mailbox_cap: 10 }), 6);
  assert.equal(leftToday({ sent: 12, global_cap: 50, mailbox_cap: 10 }), 0);
  assert.equal(leftToday({ sent: 3, global_cap: 5, mailbox_cap: 40 }), 2);
});

test("small helpers: percent, short links, stage tones", () => {
  assert.equal(percent(0.734), "73%");
  assert.equal(percent(null), "");
  assert.equal(shortUrl("https://www.dunelight.example/about/"), "dunelight.example/about");
  assert.equal(shortUrl("https://dunelight.example/"), "dunelight.example");
  assert.equal(stageTone("in_review"), "wait");
  assert.equal(stageTone("opted_out"), "bad");
  assert.equal(stageTone("sending"), "active");
  assert.equal(stageTone("new"), "idle");
});

test("every stage, gateway check and lint rule has words", () => {
  assert.equal(STAGE_ORDER.length, Object.keys(STAGE).length);
  for (let n = 1; n <= 11; n++) assert.ok(GATEWAY_CHECK[n], `check ${n}`);
  for (const key of ["uncited_fact", "under_150_words", "subject_length", "no_link", "opt_out_line", "legal_line"]) assert.ok(FINDING[key], key);
});

test("Outreach is in the console's main navigation, and nothing on its screens calls window.confirm", () => {
  const shell = readFileSync(new URL("../Shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /href: "\/ops\/outreach", label: "Outreach"/);
  for (const f of ["page.tsx", "settings/page.tsx", "prospects/ProspectView.tsx"]) {
    const code = readFileSync(new URL(`./${f}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /window\.confirm|\bconfirm\(/, f);
  }
});

test("the country rules shown in settings group countries whose rules are the same", () => {
  const rows = [
    { country: "QA", lane: "allowed", bases: ["opt_in"], cap: 1, time_zone: "Asia/Qatar", working_days: "Sun to Thu", hours: "08:30 to 16:30", free_mail_refused: true },
    { country: "SA", lane: "allowed", bases: ["opt_in"], cap: 1, time_zone: "Asia/Riyadh", working_days: "Sun to Thu", hours: "08:30 to 16:30", free_mail_refused: true },
    { country: "AE", lane: "allowed", bases: ["opt_in"], cap: 1, time_zone: "Asia/Dubai", working_days: "Mon to Fri", hours: "08:30 to 16:30", free_mail_refused: true, note: "to confirm" },
  ];
  const groups = groupPolicy(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].countries, ["QA", "SA"]);
  assert.deepEqual(groups[1].countries, ["AE"]);
  assert.equal(groups[1].note, "to confirm");
  assert.equal("time_zone" in groups[0], false);
  // Every country of the screens' own copy appears exactly once.
  const all = groupPolicy(POLICY).flatMap((g) => g.countries);
  assert.equal(all.length, POLICY.length);
  assert.equal(new Set(all).size, POLICY.length);
});
