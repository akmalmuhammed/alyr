// Fixtures for the Discovery v2 preview and tests, shaped exactly like the API's answers
// (discoveryApi.ts types), for one fictional car care business ("Nuqta Car Care", the approved
// prototype's sample world). The API words its own sentences in the reader's language, so the
// fixtures do too. `extras` is what the API does not send yet (adapter.ts `Extras`); the preview
// draws it to show the approved design, the product hides it until the workstream lands.
//
// The clock is the prototype's: Thursday 12 November 2026, 09:40 in Doha.

import type { ChecksAnswer, Fact, Finding, Overview, Proposal, Side, TeamMember } from "../discoveryApi.ts";
import type { Extras } from "./adapter.ts";
import type { D2Lang } from "./copy.ts";

export const FIXTURE_NOW = Date.parse("2026-11-12T06:40:00Z");
const iso = (s: string) => new Date(Date.parse(s)).toISOString();

const PLACE = { en: "Nuqta Car Care", ar: "نقطة للعناية بالسيارات" };
const LOCATION_ID = "0b3c6c0e-5a7e-4c62-9a52-1a2f3e4d5c01";

const W = {
  en: { to: "to", closed: "closed", none: "none", sat: "Sat", thu: "Thu", fri: "Fri" },
  ar: { to: "إلى", closed: "مغلق", none: "لا شيء", sat: "السبت", thu: "الخميس", fri: "الجمعة" },
};

function hoursSide(lang: D2Lang, friday: string | null): Side {
  const w = W[lang];
  const span = `07:00 ${w.to} 22:00`;
  const fri = friday ? `${friday.replace("–", ` ${w.to} `)}` : w.closed;
  return {
    text: `${w.sat} ${w.to} ${w.thu} ${span}${lang === "ar" ? "؛ " : "; "}${w.fri} ${fri}`,
    lines: (["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const).map((day) => ({ day, text: day === "fri" ? fri : span })),
  };
}
const plain = (text: string): Side => ({ text, lines: [] });

function proposal(over: Partial<Proposal> & Pick<Proposal, "id" | "field" | "field_label" | "before" | "after">): Proposal {
  return {
    finding_id: `f-${over.id}`, rule_id: "hours_conflict", type: "set_hours", target: "listing", status: "proposed", severity: "high",
    title: "", why: "", rule: "", location: { id: LOCATION_ID, name: PLACE.en }, where: "the listing", change_hash: `hash-${over.id}`,
    context: null, evidence: [], proposer: "rule", proposed_at: iso("2026-11-12T06:40:00Z"), expires_at: iso("2026-11-26T06:40:00Z"),
    decided: null, undone: null, applied_at: null, undo_until: null, failure: null, verification: null, sample: false,
    can: { approve: true, decline: true, undo: false }, already: false,
    ...over,
  };
}

function finding(over: Partial<Finding> & Pick<Finding, "id" | "title">): Finding {
  return {
    rule_id: "whatsapp_link_missing", kind: "owner", severity: "medium", status: "open", why: "", what_happens: "", what_is_needed: "",
    evidence: [], location: { id: LOCATION_ID, name: PLACE.en }, first_seen_at: iso("2026-11-12T06:40:00Z"), last_seen_at: iso("2026-11-12T06:40:00Z"),
    steps: [], proposals: [], needs_fact: null, can_propose: false, proposals_waiting: 0,
    ...over,
  };
}

export type Fixture = {
  overview: Overview;
  waiting: Proposal[];
  recent: Proposal[];
  checks: ChecksAnswer;
  facts: Fact[];
  team: TeamMember[];
  extras: Extras;
};

export function fixture(lang: D2Lang, source: "google" | "sample" = "google"): Fixture {
  const ar = lang === "ar";
  const place = PLACE[lang];
  const location = { id: LOCATION_ID, name: place };
  const hours = proposal({
    id: "p-hours", field: "hours", field_label: ar ? "ساعات العمل" : "Opening hours", location,
    title: ar ? `ضبط ساعات العمل في ${place}` : `Set the opening hours at ${place}`,
    why: ar ? "تختلف ساعات الجمعة على الملف التجاري عن الساعات التي أكّدتها." : "Friday hours on the listing differ from the hours you confirmed.",
    rule: ar ? "يعرض الملف التجاري ساعات تختلف عن التي أكّدتها لهذا الفرع." : "The listing shows different hours from the ones you confirmed for this branch.",
    before: hoursSide(lang, null), after: hoursSide(lang, "13:00–22:00"),
    evidence: [
      { label: ar ? "الجمعة" : "Friday", value: ar ? "مغلق" : "Closed", where: ar ? "صفحة Google" : "Google page", seen_at: iso("2026-11-12T06:40:00Z"), day_only: false },
      { label: ar ? "الجمعة" : "Friday", value: "13:00–22:00", where: ar ? "موقعك" : "Your website", seen_at: iso("2026-11-12T06:40:00Z"), day_only: false },
    ],
  });
  const phone = proposal({
    id: "p-phone", field: "phone", field_label: ar ? "رقم الهاتف" : "Phone number", rule_id: "phone_conflict", type: "set_phone", severity: "medium", location,
    title: ar ? `تصحيح رقم الهاتف في ${place}` : `Correct the phone number at ${place}`,
    why: ar ? "من يتصل من الملف التجاري يصل إلى رقم لم تؤكّده." : "Callers from the listing reach a number you did not confirm.",
    rule: ar ? "يعرض الملف التجاري رقم هاتف يختلف عن الذي أكّدته لهذا الفرع." : "The listing shows a different phone number from the one you confirmed for this branch.",
    before: plain("+974 5555 0110"), after: plain("+974 5555 0101"),
    proposed_at: iso("2026-11-12T06:40:00Z"),
  });
  const link = finding({
    id: "f-link", title: ar ? "أضف رابط واتساب إلى موقعك." : "Add the WhatsApp link to your website.",
    what_is_needed: ar ? "لا يوجد رابط واتساب على nuqtacarcare.qa. لا تستطيع ALYR تغيير موقع لا تستضيفه." : "nuqtacarcare.qa has no WhatsApp link. ALYR can’t change a website it doesn’t host.",
    what_happens: ar ? "يبحث الفحص التالي عنه في موقعك." : "The next check looks for it on your website.",
  });
  const category = proposal({
    id: "p-category", field: "category", field_label: ar ? "التصنيف الرئيسي" : "Main category", rule_id: "category_missing", type: "set_category", status: "applied", location,
    before: plain(W[lang].none), after: plain(ar ? "غسيل السيارات" : "Car wash"),
    decided: { by: ar ? "هناء" : "Hana", channel: "portal", at: iso("2026-11-09T07:10:00Z") }, applied_at: iso("2026-11-09T07:11:00Z"),
    undo_until: iso("2026-11-16T07:11:00Z"), verification: "confirmed", can: { approve: false, decline: false, undo: true },
  });
  const name = proposal({
    id: "p-name", field: "name", field_label: ar ? "اسم المنشأة" : "Business name", rule_id: "name_conflict", type: "set_name", status: "applied", location,
    before: plain("Nuqta Car Wash"), after: plain("Nuqta Car Care"),
    decided: { by: ar ? "عمر" : "Omar", channel: "whatsapp", at: iso("2026-11-09T06:30:00Z") }, applied_at: iso("2026-11-09T06:31:00Z"),
    undo_until: iso("2026-11-16T06:31:00Z"), verification: "confirmed", can: { approve: false, decline: false, undo: true },
  });
  const doneFindings = [
    finding({ id: "f-site-phone", rule_id: "phone_conflict", status: "verified", title: ar ? "رقم الهاتف على موقعك" : "Phone number on your website", last_seen_at: iso("2026-11-07T05:40:00Z") }),
    finding({ id: "f-site-hours", rule_id: "hours_conflict", status: "verified", title: ar ? "ساعات الجمعة على موقعك" : "Friday hours on your website", last_seen_at: iso("2026-11-07T05:40:00Z") }),
  ];
  const finished = iso("2026-11-12T06:40:00Z");
  const rules = Array.from({ length: 16 }, (_, i) => ({ id: `rule_${i + 1}`, part: (["presence", "website", "whatsapp", "reviews"] as const)[i % 4], label: `Check ${i + 1}` }));
  const states = ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "fail", "fail", "fail", "fail", "not_measured", "not_measured"] as const;
  return {
    overview: {
      has_connection: true, source: { kind: source, observed_on: null, days_old: null, old: false }, demo: true,
      has_run: true, last_run: { id: "run-1", status: "done", trigger: "weekly", score: null, score_parts: null, started_at: iso("2026-11-12T06:38:00Z"), finished_at: finished, error: null, steps: [] },
      score: null, headline: "", score_parts: null, counts: { open: 4, skipped: 0, owner_done: 0, verified: 2 },
      next: null, up_next: [link], done: doneFindings, delta: null,
      proposals: { waiting: 2, approved: 0, failed: 0, next: hours },
    },
    waiting: [hours, phone],
    recent: [category, name],
    checks: { run_id: "run-1", finished_at: finished, measured: true, rules, places: [], business: { checks: Object.fromEntries(rules.map((r, i) => [r.id, states[i]])), fixed: [] } },
    facts: [{
      location_id: LOCATION_ID, key: "hours", source: "owner", confirmed_by_name: ar ? "هناء" : "Hana", confirmed_at: iso("2026-11-10T15:12:00Z"), default: false,
      value: { sat: ["07:00", "22:00"], sun: ["07:00", "22:00"], mon: ["07:00", "22:00"], tue: ["07:00", "22:00"], wed: ["07:00", "22:00"], thu: ["07:00", "22:00"], fri: ["13:00", "22:00"] },
    }],
    team: [{ id: "u-hana", name: ar ? "هناء" : "Hana", role: "owner" }, { id: "u-omar", name: ar ? "عمر" : "Omar", role: "admin" }],
    extras: {
      firstParty: {
        [hours.id]: {
          day: "fri", listingSaidClosed: true, from: "13:00", to: "22:00", countedAt: finished,
          weeks: [
            { date: iso("2026-10-16T09:00:00Z"), orders: 2, bookings: 3 },
            { date: iso("2026-10-23T09:00:00Z"), orders: 1, bookings: 2 },
            { date: iso("2026-10-30T09:00:00Z"), orders: 3, bookings: 4 },
            { date: iso("2026-11-06T09:00:00Z"), orders: 1, bookings: 2 },
          ],
        },
      },
      listing: { [hours.id]: { rating: 4.6, reviews: 212, category: ar ? "مغسلة سيارات في الدوحة" : "Car wash in Doha", openLine: ar ? "يغلق 22:00" : "Closes 22:00" } },
      previous: { matched: 8, at: iso("2026-11-05T06:40:00Z") },
      alsoFixes: { [hours.id]: { checks: 2, from: 10, to: 12, of: 14 } },
      nextCheckAt: iso("2026-11-19T06:40:00Z"),
    },
  };
}

/** The hours ask as it is a moment after Hana approved it and ALYR sent it. */
export function approvedHours(f: Fixture, lang: D2Lang): Proposal {
  const p = f.waiting[0];
  return {
    ...p, status: "applied", decided: { by: lang === "ar" ? "هناء" : "Hana", channel: "portal", at: iso("2026-11-12T06:41:00Z") },
    applied_at: iso("2026-11-12T06:41:00Z"), undo_until: iso("2026-11-19T06:41:00Z"), verification: "pending",
    can: { approve: false, decline: false, undo: true },
  };
}
