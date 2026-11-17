// The pure parts of the Discovery screens (ALY-322, spec 065; Phase 2, ALY-324, spec 066): which
// view the address names, which state the Home screen is in, when to stop asking about a run or a
// change that is being applied, how findings group, which months a report can be asked for, what a
// person may do with a proposal, how a fact (the real hours, phone, category, name) is typed and
// checked, and how a time, a month or a step is written in a person's language. No React and no
// fetch: `discovery.test.mjs` runs these under `node --test`.
//
// Times are the shop's (Doha) and written with Western digits in Arabic too (alyr-design,
// arabic.md); a time never says "ago", because "5 min ago" goes stale on a screen nobody
// refreshes.

import type { Lang } from "./lang";
import {
  DAYS, DiscoveryError, KINDS, PARTS_SHOWN,
  type Connection, type DayKey, type FactKey, type Finding, type HistoryRow, type Kind, type Overview, type PartKey, type Proposal,
  type ProposalStatus, type Run, type Step,
} from "./discoveryApi.ts";
import { T } from "./discoveryCopy.ts";

// ── the four views and the address that carries them ────

export const VIEWS = ["home", "todo", "proposals", "reviews", "reports", "answers", "settings"] as const;
export type View = (typeof VIEWS)[number];

/** The views a person is given: Settings is for the owner and an admin only. */
export function viewsFor(canManage: boolean): readonly View[] {
  return canManage ? VIEWS : VIEWS.filter((v) => v !== "settings");
}

/** The view an address names (`?view=`); anything else, or nothing, is Home. A view the person is not given is Home too. */
export function readView(param: string | null | undefined, canManage = true): View {
  return (viewsFor(canManage) as readonly string[]).includes(param ?? "") ? (param as View) : "home";
}

/** The address of a view. Home is the plain section address. `extra` carries `finding=` and the like. */
export function viewHref(view: View, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (view !== "home") p.set("view", view);
  for (const [key, value] of Object.entries(extra)) if (value) p.set(key, value);
  const text = p.toString();
  return `/app/discovery${text ? `?${text}` : ""}`;
}

/**
 * The views that open beneath a section in the menu. Only Discovery has any: every other
 * section of the workspace gets an empty list, so its menu entry is drawn exactly as before.
 */
export function subItems(sectionKey: string, canManage = false): readonly View[] {
  return sectionKey === "discovery" ? viewsFor(canManage) : [];
}

// ── Home ────────────────────────────────────────────────

export type HomeState = "noConnection" | "noRun" | "caughtUp" | "content";

/** What the Home screen shows under its heading, from the overview alone. */
export function homeState(o: Overview): HomeState {
  if (!o.has_connection) return "noConnection";
  const c = o.counts;
  const worked = c.open + c.skipped + c.owner_done + c.verified > 0 || o.score !== null;
  // A first run that failed leaves nothing to show: the same page as before it, plus the failure.
  if (!worked) return "noRun";
  if (!o.next && o.up_next.length === 0) return "caughtUp";
  return "content";
}

export const isRunning = (run: Run | null | undefined): boolean => !!run && (run.status === "queued" || run.status === "running");
export const isFinished = (run: Run | null | undefined): boolean => !!run && (run.status === "done" || run.status === "failed");

// ── following a run ─────────────────────────────────────

/** How often a run is asked about while it is on screen (spec: every 1.5 s). */
export const POLL_MS = 1500;
/** Four minutes of asking. Past it the screen says it is slow and stops; nothing polls for ever. */
export const MAX_POLLS = 160;

/** Whether to ask again: not once the run is done or failed, and not past the limit. */
export function pollDecision(run: Run | null, polls: number): "poll" | "stop" | "slow" {
  if (isFinished(run)) return "stop";
  return polls >= MAX_POLLS ? "slow" : "poll";
}

/** Whole minutes a refusal asks the person to wait: never 0, and rounded up. */
export function minutesFrom(seconds: number | null): number {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.max(1, Math.ceil(seconds / 60));
}

// ── how a step is worded ────────────────────────────────

export type StepKind = { kind: "snapshot" } | { kind: "rules"; family: PartKey | null } | { kind: "other"; word: "start" | "findings" | "reviews" | "score" | "answers" | null };

/**
 * What a logged step is, from its `tool` ("connector.snapshot", "rules.evaluate…"). The log's own
 * sentences are English, so an Arabic screen says the step in its own words where the tool is
 * known, and only falls back to the sentence where it is not.
 */
export function stepKind(tool: string): StepKind {
  const t = tool.trim().toLowerCase();
  if (t.startsWith("connector.")) return { kind: "snapshot" };
  if (t.startsWith("rules.")) {
    const rest = t.slice("rules.".length);
    return { kind: "rules", family: PARTS_SHOWN.find((part) => rest.includes(part)) ?? null };
  }
  const word = ({ "run.start": "start", "findings.save": "findings", "reviews.save": "reviews", "score.compute": "score", "ai.answers": "answers" } as const)[t as "run.start"];
  return { kind: "other", word: word ?? null };
}

// ── the to-do list ──────────────────────────────────────

/** Findings grouped by who does them, in the order agent, owner, process; empty groups are left out. */
export function groupByKind(items: readonly Finding[]): { kind: Kind; items: Finding[] }[] {
  return KINDS.map((kind) => ({ kind, items: items.filter((f) => f.kind === kind) })).filter((g) => g.items.length > 0);
}

// ── reviews ─────────────────────────────────────────────

export type StarFilter = "all" | "3" | "2" | "1";

/** The query a review filter makes (`max_rating`, `replied=false`, `location_id`). */
export function reviewQuery(filter: { place: string; stars: StarFilter; unanswered: boolean }) {
  return {
    location_id: filter.place || undefined,
    max_rating: filter.stars === "all" ? undefined : Number(filter.stars),
    replied: filter.unanswered ? false : undefined,
  };
}

/** One decimal place, as an average is said ("4.2"); Western digits in both languages. */
export function averageText(value: number | null): string {
  return value === null ? "" : value.toFixed(1);
}

// ── reports ─────────────────────────────────────────────

const doha = (options: Intl.DateTimeFormatOptions, tag = "en-GB") =>
  new Intl.DateTimeFormat(tag, { timeZone: "Asia/Qatar", ...options });

/** The `yyyy-mm` of the last `n` calendar months in Doha, this month first. */
export function lastMonths(now: Date, n: number): string[] {
  const parts = doha({ year: "numeric", month: "2-digit" }).formatToParts(now);
  let year = Number(parts.find((p) => p.type === "year")?.value);
  let month = Number(parts.find((p) => p.type === "month")?.value);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return out;
}

const locale = (lang: Lang) => (lang === "ar" ? "ar-QA-u-ca-gregory-nu-latn" : "en-GB");

/** "November 2026" / «نوفمبر 2026». */
export function monthName(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

// ── times ───────────────────────────────────────────────

function dayParts(date: Date, lang: Lang, now: Date) {
  const fmt = doha({ day: "numeric", month: lang === "ar" ? "long" : "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, locale(lang));
  const get = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  const thisYear = doha({ year: "numeric" }, locale(lang)).format(now);
  return { day: get("day"), month: get("month"), year: get("year"), time: `${get("hour")}:${get("minute")}`, sameYear: get("year") === thisYear };
}

/** "7 Nov · 14:20" (with the year when it is not this one); null for a time that is not one. */
export function formatWhen(iso: string | null, lang: Lang, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = dayParts(date, lang, now);
  return `${p.day} ${p.month}${p.sameYear ? "" : ` ${p.year}`} · ${p.time}`;
}

/** "7 Nov", with the year when it is not this one. */
export function formatDay(iso: string | null, lang: Lang, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = dayParts(date, lang, now);
  return `${p.day} ${p.month}${p.sameYear ? "" : ` ${p.year}`}`;
}

// ── places and connections ──────────────────────────────

export const placeName = (place: { name: string; name_ar: string }, lang: Lang): string =>
  (lang === "ar" ? place.name_ar || place.name : place.name || place.name_ar);

/** Whether what the screens show comes from the sample business (and must say so, once). */
export const isSample = (connection: Connection | null): boolean => !!connection && connection.on && connection.kind === "sample";

/** The steps of a run in the order they were logged. */
export const inOrder = (steps: readonly Step[]): Step[] => [...steps].sort((a, b) => a.seq - b.seq);

// ── what a refusal says ─────────────────────────────────

/** The sentence for a refusal, in the person's language: the screen's own words where it has them. */
export function sayError(error: unknown, lang: Lang): string {
  const t = T[lang];
  if (!(error instanceof DiscoveryError)) return t.failed;
  if (error.code === "offline") return t.offline;
  if (error.code === "module_off") return t.moduleOff;
  // A change that was updated or closed while it was on screen says so in words of ours, whatever the API sent.
  if (error.code === "proposal_changed" || error.code === "proposal_closed") return t.errors[error.code];
  if (error.status === 403) return t.forbidden;
  if (lang === "ar") return error.messageAr || t.failed;
  return error.code !== "bad_answer" && error.message && error.message.length < 200 ? error.message : t.failed;
}

/** A logged step in words: the log's own sentence in English, the screen's words in Arabic. */
export function stepText(step: Step, lang: Lang): { text: string; foreign: boolean } {
  const t = T[lang];
  const k = stepKind(step.tool);
  const known = k.kind === "snapshot" ? t.stepSnapshot : k.kind === "rules" ? t.stepRules(k.family) : k.word ? t.stepOther[k.word] : "";
  if (lang === "en") return { text: step.summary || known || step.tool, foreign: false };
  return known ? { text: known, foreign: false } : { text: step.summary || step.tool, foreign: true };
}

/** A value that is only digits and their marks (a phone number, a time) keeps its own direction. */
export const isNumeric = (value: string): boolean => /^[\d+\s().:\-–/]+$/.test(value.trim()) && /\d/.test(value);

// ── proposals: what a person may do, and what state to show ─

export type ProposalTab = "live" | "done" | "closed";
export const PROPOSAL_TABS: readonly ProposalTab[] = ["live", "done", "closed"];

/** Waiting for a person, or approved and being applied: the two that are not over. */
export const isLive = (p: Proposal): boolean => p.status === "proposed" || p.status === "approved";
/** The ones of a finding that wait for a tap. */
export const waitingProposals = (f: Pick<Finding, "proposals">): Proposal[] => f.proposals.filter((p) => p.status === "proposed");
export const liveProposals = (f: Pick<Finding, "proposals">): Proposal[] => f.proposals.filter(isLive);

/**
 * Whether the Approve button is drawn: the API says this person may (`can.approve`), the change is
 * one that waits or one to try again, and it carries the hash the tap must send. Nothing else makes
 * an approval: not a role worked out here, not a status.
 */
export const mayApprove = (p: Proposal): boolean => p.can.approve && p.change_hash !== "" && (p.status === "proposed" || p.status === "failed");

/** How many proposals a tab holds, from the answer's counts. */
export function tabCount(counts: Record<ProposalStatus, number>, tab: ProposalTab): number {
  if (tab === "live") return counts.proposed + counts.approved;
  if (tab === "done") return counts.applied + counts.undone;
  return counts.declined + counts.expired + counts.failed;
}

/** Whether to ask again about a change that was approved: until it is applied or failed, and never for ever. */
export function proposalPollDecision(p: Pick<Proposal, "status"> | null, polls: number): "poll" | "stop" | "slow" {
  if (!p || p.status !== "approved") return "stop";
  return polls >= MAX_POLLS ? "slow" : "poll";
}

/** The time of the last history row whose event matches; null where there is none. */
export function eventAt(history: readonly HistoryRow[], pattern: RegExp): string | null {
  const rows = history.filter((h) => pattern.test(h.event) && h.at);
  return rows.length ? rows[rows.length - 1].at : null;
}

/** The date of the check-up that confirmed or did not confirm a change, from its history; null where it is not there. */
export const verifiedAt = (history: readonly HistoryRow[]): string | null => eventAt(history, /verif/i);

/** The pill of a status: Volt-washed only for done, warm while something waits, plain once over. */
export function proposalPillClass(status: ProposalStatus): "active" | "wait" | "bad" | "quiet" {
  if (status === "applied") return "active";
  if (status === "proposed" || status === "approved") return "wait";
  if (status === "failed") return "bad";
  return "quiet";
}

/** The findings of a list that have a change waiting. */
export const withChange = (items: readonly Finding[]): Finding[] => items.filter((f) => f.proposals_waiting > 0 || waitingProposals(f).length > 0);

// ── hours as words (the same grouping the API uses, spec 066 "Fields of a proposal") ─

const hasKey = (value: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

/**
 * "Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00": consecutive days with the same hours are one
 * run, a closed day says so, and no hours at all is "none". Used for a fact, which the API sends as
 * plain values; a proposal's own text always comes from the API.
 */
export function hoursText(value: Record<string, unknown>, lang: Lang): string {
  const t = T[lang];
  const hoursOf = (key: DayKey): string | null => {
    const v = value[key];
    return Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "string" ? `${v[0]}|${v[1]}` : null;
  };
  if (!DAYS.some((d) => hasKey(value, d))) return t.noneText;
  const runs: { from: DayKey; to: DayKey; hours: string | null }[] = [];
  for (const d of DAYS) {
    const h = hoursOf(d);
    const last = runs[runs.length - 1];
    if (last && last.hours === h) last.to = d;
    else runs.push({ from: d, to: d, hours: h });
  }
  return runs
    .map((r) => {
      const days = r.from === r.to ? t.daysShort[r.from] : `${t.daysShort[r.from]} ${t.to} ${t.daysShort[r.to]}`;
      const what = r.hours === null ? t.closedWord : r.hours.replace("|", ` ${t.to} `);
      return `${days} ${what}`;
    })
    .join(lang === "ar" ? "؛ " : "; ");
}

// ── a fact, typed ───────────────────────────────────────

export type DayDraft = { closed: boolean; open: string; close: string };
export type HoursDraft = Record<DayKey, DayDraft>;
export type HoursError = "required" | "time" | "order";
export type HoursErrors = Partial<Record<DayKey, { open?: HoursError; close?: HoursError }>>;
export type TextError = "required" | "phone" | "long";

/** The seven rows of the hours form, from the confirmed hours (or empty, when there are none). */
export function hoursDraft(value: Record<string, unknown> | null): HoursDraft {
  const out = {} as HoursDraft;
  for (const d of DAYS) {
    const v = value?.[d];
    if (Array.isArray(v) && v.length === 2) out[d] = { closed: false, open: String(v[0] ?? ""), close: String(v[1] ?? "") };
    else out[d] = { closed: value !== null && hasKey(value, d), open: "", close: "" };
  }
  return out;
}

/** "7:00" and "07:00" are the same time; anything else is not a time. 24-hour, no seconds. */
export function normalizeTime(text: string): string | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * The hours the form describes, as the API takes them (`{"sat": ["07:00","22:00"], "fri": null, ...}`),
 * or what is wrong with each field of each day. Closing after opening, on the same day: no overnight
 * shifts yet (the API answers 422 `bad_hours` too).
 */
export function hoursValue(draft: HoursDraft): { value: Record<string, [string, string] | null> | null; errors: HoursErrors } {
  const value: Record<string, [string, string] | null> = {};
  const errors: HoursErrors = {};
  for (const d of DAYS) {
    const row = draft[d];
    if (row.closed) { value[d] = null; continue; }
    const e: { open?: HoursError; close?: HoursError } = {};
    const open = row.open.trim() === "" ? null : normalizeTime(row.open);
    const close = row.close.trim() === "" ? null : normalizeTime(row.close);
    if (row.open.trim() === "") e.open = "required"; else if (open === null) e.open = "time";
    if (row.close.trim() === "") e.close = "required"; else if (close === null) e.close = "time";
    if (!e.open && !e.close && open !== null && close !== null && close <= open) e.close = "order";
    if (e.open || e.close) errors[d] = e;
    else value[d] = [open as string, close as string];
  }
  return { value: Object.keys(errors).length ? null : value, errors };
}

/** A phone number as typed (spaces, dashes and brackets allowed) in the form the API takes: `+` and 7 to 15 digits. */
export function phoneValue(text: string): string | null {
  const cleaned = text.replace(/[\s().-]/g, "");
  return /^\+\d{7,15}$/.test(cleaned) ? cleaned : null;
}

/** A one-line fact (phone, WhatsApp, category, name) as the API takes it, or what is wrong. */
export function textFact(key: Exclude<FactKey, "hours">, text: string): { value: Record<string, string> | null; error: TextError | null } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null, error: "required" };
  if (key === "phone" || key === "whatsapp") {
    const phone = phoneValue(trimmed);
    return phone ? { value: { phone }, error: null } : { value: null, error: "phone" };
  }
  const max = key === "category" ? 80 : 160;
  if (trimmed.length > max) return { value: null, error: "long" };
  return { value: { [key]: trimmed }, error: null };
}

/** The one line a one-line fact holds, for the form to start from. */
export function factText(key: Exclude<FactKey, "hours">, value: Record<string, unknown> | null): string {
  if (!value) return "";
  const v = key === "phone" || key === "whatsapp" ? value.phone : value[key];
  return typeof v === "string" ? v : "";
}

// ── long dates, for an expiry ───────────────────────────

/** "Tue 24 Nov" / «الثلاثاء 24 نوفمبر», with the year when it is not this one; Western digits. */
export function formatDayLong(iso: string | null, lang: Lang, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const fmt = doha({ weekday: lang === "ar" ? "long" : "short", day: "numeric", month: lang === "ar" ? "long" : "short", year: "numeric" }, locale(lang));
  const get = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  const thisYear = doha({ year: "numeric" }, locale(lang)).format(now);
  return `${get("weekday")} ${get("day")} ${get("month")}${get("year") === thisYear ? "" : ` ${get("year")}`}`;
}

/** The date a proposal's row says, by its status: when it waits until, or when it was decided, applied, undone or expired. */
export function proposalWhen(p: Proposal, lang: Lang, now: Date = new Date()): string {
  const day = (iso: string | null) => formatDay(iso, lang, now);
  switch (p.status) {
    case "proposed": return formatDayLong(p.expires_at, lang, now);
    case "approved": return day(p.decided?.at ?? null);
    case "applied": return day(p.applied_at);
    case "declined": return day(p.decided?.at ?? null);
    case "expired": return day(p.expires_at);
    case "undone": return day(p.undone?.at ?? null);
    default: return day(p.decided?.at ?? p.applied_at);
  }
}

/** A finding's applied change, if it has one: its note says whether a check-up has confirmed it yet. */
export function appliedNoteKey(f: Pick<Finding, "proposals">): "none" | "pending" | "confirmed" | "not_confirmed" | null {
  const applied = f.proposals.find((p) => p.status === "applied");
  if (!applied) return null;
  return applied.verification ?? "none";
}
