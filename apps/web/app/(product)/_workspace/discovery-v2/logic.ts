// Pure logic of Discovery v2: where a change lands, which days of the week it touches, the
// sentence that leads the ticket, the checks tally, the life of a change and the receipts of the
// week. No React and no browser globals, so `logic.test.mjs` runs it under `node --test`.

import type { ChecksAnswer, ChecksRow, DayKey, Proposal, Side } from "../discoveryApi.ts";
import { isolate } from "../../../_ui/format.ts";
import { T, type D2Lang, type WhereKey } from "./copy.ts";

export type LeadParts = { pre: string; hl: string; post: string };

/** Where a change lands. "Google" only when the source is Google: the sample and a listing ALYR
 * staff recorded are "your listing" (the API's words never say Google either). */
export function whereOf(target: string, sourceKind: string | null | undefined): WhereKey {
  if (target === "website") return "website";
  return (sourceKind ?? "").toLowerCase().startsWith("google") ? "google" : "listing";
}

const TIME = /(\d{1,2}:\d{2})\D+(\d{1,2}:\d{2})/;

/** A day's line as the screens write it: «13:00–22:00», or «Closed» for a day with no hours. */
export function spanText(text: string, lang: D2Lang): string {
  const hit = TIME.exec(text);
  if (hit) return `${hit[1]}–${hit[2]}`;
  return isClosedText(text) ? T[lang].closed : text;
}

/** A day line with no time in it is a closed day ("closed", «مغلق», or empty). */
export const isClosedText = (text: string): boolean => !/\d/.test(text);

/** The days whose line differs between before and after, in the API's order (Saturday first). */
export function changedDays(before: Side, after: Side): DayKey[] {
  const was = new Map(before.lines.map((l) => [l.day, l.text]));
  return after.lines.filter((l) => (was.get(l.day) ?? "") !== l.text).map((l) => l.day);
}

const lineOf = (side: Side, day: DayKey) => side.lines.find((l) => l.day === day)?.text ?? "";

/** The one changed day of an hours proposal, or null when none or several change. */
export function oneDay(p: Pick<Proposal, "field" | "before" | "after">): DayKey | null {
  if (p.field !== "hours") return null;
  const days = changedDays(p.before, p.after);
  return days.length === 1 ? days[0] : null;
}

const empty = (text: string) => !text.trim() || /^(none|no reply|لا شيء|لا رد)$/i.test(text.trim());

/** The ticket's sentence, with the part to decide marked for the Volt highlighter. A proposal the
 * screens have no sentence for leads with its own title and no highlight. */
export function leadFor(p: Pick<Proposal, "field" | "before" | "after" | "title">, where: WhereKey, lang: D2Lang): LeadParts {
  const t = T[lang];
  switch (p.field) {
    case "hours": {
      if (!p.before.lines.length) return t.leadNoHours(where);
      const day = oneDay(p);
      if (day) return isClosedText(lineOf(p.before, day)) ? t.leadClosed(where, day) : t.leadDayHours(where, day);
      return t.leadHours(where);
    }
    case "phone": return t.leadPhone(where);
    case "name": return t.leadName(where);
    case "category": return empty(p.before.text) ? t.leadNoCategory(where) : t.leadCategory(where);
    case "whatsapp_link": return t.leadNoWhatsapp(where);
    case "review_reply": return t.leadReview;
    default: return { pre: p.title, hl: "", post: "" };
  }
}

/** The value being decided, short: «Friday 13:00–22:00» for one day of hours, else the after line. */
export function exactText(p: Pick<Proposal, "field" | "before" | "after">, lang: D2Lang): string {
  const day = oneDay(p);
  if (day) return `${lang === "ar" ? dayAr(day) : dayEn(day)} ${lang === "ar" ? isolate(spanText(lineOf(p.after, day), lang)) : spanText(lineOf(p.after, day), lang)}`;
  return p.after.text;
}
const dayEn = (d: DayKey) => ({ sat: "Saturday", sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" })[d];
const dayAr = (d: DayKey) => ({ sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة" })[d];

/** The before and after values of the one changed day, or of the whole change. */
export function beforeAfter(p: Pick<Proposal, "field" | "before" | "after">, lang: D2Lang): { before: string; after: string } {
  const day = oneDay(p);
  if (day) return { before: spanText(lineOf(p.before, day), lang), after: spanText(lineOf(p.after, day), lang) };
  return { before: empty(p.before.text) ? T[lang].none : p.before.text, after: p.after.text };
}

// ── checks ─────────────────────────────────────────────

export type Tally = { matched: number; measured: number; notMeasured: number; total: number };

function rowTally(row: ChecksRow, rules: readonly string[]): Tally {
  let matched = 0, failed = 0, notMeasured = 0;
  for (const id of rules) {
    const state = row.checks[id];
    if (state === "pass") matched++;
    else if (state === "fail") failed++;
    else if (state === "not_measured") notMeasured++;
  }
  return { matched, measured: matched + failed, notMeasured, total: matched + failed + notMeasured };
}

/** "10 of 14 checks match": the business's own row and every place's row, summed (the API keeps
 * business-wide checks on the business row and the rest on each place). A check that was not measured is never in the 14 (spec: never say a number it did not
 * measure). Null when there was no finished check-up or nothing was measured. */
export function tally(answer: ChecksAnswer | null): Tally | null {
  if (!answer || !answer.measured) return null;
  const rules = answer.rules.map((r) => r.id);
  const rows = [...(answer.business ? [answer.business] : []), ...answer.places];
  if (!rows.length) return null;
  const sum = rows.map((r) => rowTally(r, rules)).reduce((a, b) => ({
    matched: a.matched + b.matched, measured: a.measured + b.measured, notMeasured: a.notMeasured + b.notMeasured, total: a.total + b.total,
  }));
  return sum.measured > 0 ? sum : null;
}

// ── the life of a change ───────────────────────────────

export type Stage = "waiting" | "approved" | "sent" | "live" | "notLive" | "failed" | "undone" | "declined" | "expired";

/** Where a proposal is in its life, from the API's status and verification. */
export function stageOf(p: Pick<Proposal, "status" | "verification">): Stage {
  switch (p.status) {
    case "proposed": return "waiting";
    case "approved": return "approved";
    case "applied": return p.verification === "confirmed" ? "live" : p.verification === "not_confirmed" ? "notLive" : "sent";
    case "failed": return "failed";
    case "undone": return "undone";
    case "declined": return "declined";
    default: return "expired";
  }
}

export type RailState = "done" | "now" | "todo" | "ok" | "attn";
export type RailStep = { key: "approved" | "sent" | "pending" | "live"; state: RailState; at: string | null };

/** The four steps of the approved track (Approved, Sent, Pending review, Live and checked). */
export function railOf(p: Pick<Proposal, "status" | "verification" | "decided" | "applied_at">): RailStep[] {
  const stage = stageOf(p);
  const decidedAt = p.decided?.at ?? null;
  const steps: RailStep[] = [
    { key: "approved", state: "todo", at: decidedAt },
    { key: "sent", state: "todo", at: p.applied_at },
    { key: "pending", state: "todo", at: null },
    { key: "live", state: "todo", at: null },
  ];
  const set = (...states: RailState[]) => states.forEach((s, i) => { steps[i].state = s; });
  if (stage === "approved") set("done", "now");
  else if (stage === "sent") set("done", "done", "now");
  else if (stage === "live") set("done", "done", "done", "ok");
  else if (stage === "notLive") set("done", "done", "done", "attn");
  else if (stage === "failed") set("done", "attn");
  return steps;
}

/** Whether to keep reading a just-approved proposal: until it is sent or stops, at most 20 reads. */
export const keepPolling = (p: Pick<Proposal, "status"> | null, polls: number): boolean =>
  !!p && p.status === "approved" && polls < 20;

// ── the week's receipts ────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const at = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NaN);

/** The changes of the last 7 days: sent (applied) or undone proposals, newest first. */
export function sinceLastWeek<P extends Pick<Proposal, "status" | "applied_at" | "decided" | "undone">>(items: readonly P[], now: number): P[] {
  const when = (p: P) => {
    const t = at(p.status === "undone" ? p.undone?.at ?? p.applied_at : p.applied_at ?? p.decided?.at);
    return Number.isNaN(t) ? null : t;
  };
  return items
    .filter((p) => (p.status === "applied" || p.status === "undone"))
    .filter((p) => { const t = when(p); return t !== null && now - t <= WEEK_MS && t <= now + 60_000; })
    .sort((a, b) => (when(b) ?? 0) - (when(a) ?? 0));
}

/** "All still match." only when every sent change was confirmed by a later check. */
export const allMatch = (items: readonly Pick<Proposal, "status" | "verification">[]): boolean =>
  items.length > 0 && items.every((p) => p.status === "applied" && p.verification === "confirmed");

/** «Hana or Omar», «Hana, Omar or Sara»; Arabic «هناء أو عمر». */
export function joinNames(names: readonly string[], lang: D2Lang, last: "or" | "and" = "or"): string {
  const t = T[lang];
  const clean = names.filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(t.listSep)}${last === "or" ? t.or : t.and}${clean[clean.length - 1]}`;
}

/** When ALYR may ask again after Not now: the API's 14-day cool-off (proposals.py COOL_OFF). */
export const COOL_OFF_DAYS = 14;
export const askAgainAfter = (now: number): number => now + COOL_OFF_DAYS * 24 * 60 * 60 * 1000;

/** The bar heights of the first-party chart in steps of one order or booking each; scaled down
 * only when the busiest day would not fit (`maxUnits` steps). A day with any is at least one step. */
export function barUnits(values: readonly number[], maxUnits = 8): number[] {
  const top = Math.max(1, ...values);
  if (top <= maxUnits) return values.map((v) => Math.max(0, v));
  return values.map((v) => (v <= 0 ? 0 : Math.max(1, Math.round((v / top) * maxUnits))));
}

const WEEKDAY_KEY: Record<string, DayKey> = { Sat: "sat", Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri" };
/** Today's weekday in Doha (the shop's clock), whatever the device says. */
export function dayKeyAt(ms: number): DayKey {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Qatar" }).format(new Date(ms));
  return WEEKDAY_KEY[name] ?? "sat";
}
