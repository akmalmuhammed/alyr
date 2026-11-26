// The typed adapter between the Discovery API and the v2 screens. `buildThisWeek` turns the answers
// the API gives today (overview, proposals, checks, facts, team) into what This week draws. What
// the approved design shows but the API does not send yet arrives in `Extras`, one optional field
// per missing piece with the workstream that adds it; when a field is absent its part of the screen
// is not drawn (never faked). Each is listed in D:\alyr-discovery-build\api-gaps.md.
//
// Pure: no React, no fetch, so `adapter.test.mjs` runs it under `node --test`.

import { initials } from "../../../_ui/format.ts";
import type { ChecksAnswer, DayKey, Fact, Finding, Overview, Proposal, TeamMember } from "../discoveryApi.ts";
import type { D2Lang, WhereKey } from "./copy.ts";
import { beforeAfter, changedDays, exactText, leadFor, oneDay, sinceLastWeek, spanText, tally, whereOf, type LeadParts, type Tally } from "./logic.ts";

// ── what the API does not send yet ─────────────────────

/** TODO(C): orders and bookings on the last weeks' same weekday, from `first_party_facts`
 * (CONTRACTS.md, rule contract). Drawn as the annotated bars and the "In ALYR" evidence. */
export type FirstPartyWeek = { date: string; orders: number; bookings: number };
export type FirstParty = { day: DayKey; weeks: FirstPartyWeek[]; listingSaidClosed: boolean; from: string | null; to: string | null; countedAt: string | null };

/** TODO(F): what the live listing read shows around the hours (Places connector, wave 2). */
export type ListingExtras = { rating: number | null; reviews: number | null; category: string; openLine: string | null };

/** TODO(B): checks matched on the run before, and what one ask would also fix (packs, engine). */
export type PreviousTally = { matched: number; at: string };
export type AlsoFixes = { checks: number; from: number; to: number; of: number };

export type Extras = {
  firstParty?: Record<string, FirstParty>;
  listing?: Record<string, ListingExtras>;
  previous?: PreviousTally;
  alsoFixes?: Record<string, AlsoFixes>;
  /** TODO(D): when the weekly check runs next. */
  nextCheckAt?: string;
};

// ── what the screens draw ──────────────────────────────

export type Tone = "h" | "o" | "n";
export type Person = { name: string; initial: string; tone: Tone; role: string };
export type Confirmed = { text: string; by: string; at: string | null };

export type AskView = {
  p: Proposal;
  index: number;
  of: number;
  where: WhereKey;
  lead: LeadParts;
  /** The one weekday an hours change touches, or null. */
  day: DayKey | null;
  days: DayKey[];
  exact: string;
  before: string;
  after: string;
  place: string;
  confirmed: Confirmed | null;
  firstParty: FirstParty | null;
  listing: ListingExtras | null;
  alsoFixes: AlsoFixes | null;
};

export type ReceiptRow =
  | { kind: "change"; p: Proposal; where: WhereKey; what: string; before: string; after: string; when: string | null }
  | { kind: "you"; f: Finding; when: string | null };

export type ViewState = "content" | "empty" | "noRun" | "noConnection";

export type ThisWeekView = {
  state: ViewState;
  sourceKind: string;
  sample: boolean;
  recordedOn: string | null;
  checkedAt: string | null;
  tally: Tally | null;
  previous: PreviousTally | null;
  asks: AskView[];
  owner: Finding[];
  /** Asks and owner tasks together: the "of N" of every ticket. */
  total: number;
  receipts: ReceiptRow[];
  approvers: Person[];
  nextCheckAt: string | null;
  latest: Proposal | null;
};

export type ThisWeekInput = {
  overview: Overview;
  waiting: readonly Proposal[];
  recent: readonly Proposal[];
  checks: ChecksAnswer | null;
  facts: readonly Fact[];
  team: readonly TeamMember[] | null;
  extras?: Extras;
  now: number;
  lang: D2Lang;
};

const TONES: Tone[] = ["h", "o", "n"];

/** The people who may approve: owners and managers in the team, owner first. Empty when the team
 * could not be read (the receipt line then leaves the names out). */
export function approversOf(team: readonly TeamMember[] | null): Person[] {
  if (!team) return [];
  const rank = (role: string) => (role === "owner" ? 0 : role === "admin" ? 1 : 2);
  return team
    .filter((m) => m.role === "owner" || m.role === "admin")
    .sort((a, b) => rank(a.role) - rank(b.role))
    .map((m, i) => ({ name: m.name, initial: initials(m.name), tone: TONES[Math.min(i, 2)], role: m.role }));
}

/** The tone of a person's avatar: the same person keeps the same colour across the page. */
export function toneOf(name: string, people: readonly Person[]): Tone {
  return people.find((p) => p.name === name)?.tone ?? "n";
}

/** What the owner confirmed for the field (and the day) of this proposal. */
export function confirmedFor(p: Proposal, facts: readonly Fact[], lang: D2Lang): Confirmed | null {
  const key = p.field === "whatsapp_link" ? "whatsapp" : p.field;
  const fact = facts.find((f) => f.key === key && (!p.location || f.location_id === p.location.id) && !f.default);
  if (!fact) return null;
  let text = "";
  if (p.field === "hours") {
    const day = oneDay(p);
    const v = day ? fact.value[day] : null;
    if (day && Array.isArray(v) && v.length === 2) text = spanText(`${v[0]} ${v[1]}`, lang);
    else if (day && (v === null || v === undefined || (Array.isArray(v) && !v.length))) text = spanText("", lang);
    else text = p.after.text;
  } else {
    const v = Object.values(fact.value).find((x) => typeof x === "string");
    text = typeof v === "string" ? v : p.after.text;
  }
  return { text, by: fact.confirmed_by_name, at: fact.confirmed_at };
}

export function askView(p: Proposal, index: number, of: number, input: Pick<ThisWeekInput, "facts" | "extras" | "lang"> & { sourceKind: string }): AskView {
  const where = whereOf(p.target, input.sourceKind);
  const ba = beforeAfter(p, input.lang);
  return {
    p, index, of, where,
    lead: leadFor(p, where, input.lang),
    day: oneDay(p),
    days: p.field === "hours" ? changedDays(p.before, p.after) : [],
    exact: exactText(p, input.lang),
    before: ba.before,
    after: ba.after,
    place: p.location?.name ?? "",
    confirmed: confirmedFor(p, input.facts, input.lang),
    firstParty: input.extras?.firstParty?.[p.id] ?? null,
    listing: input.extras?.listing?.[p.id] ?? null,
    alsoFixes: input.extras?.alsoFixes?.[p.id] ?? null,
  };
}

const latestOf = (items: readonly Proposal[]): Proposal | null => {
  const when = (p: Proposal) => Date.parse(p.applied_at ?? p.decided?.at ?? "") || 0;
  const sorted = items.filter((p) => p.status === "approved" || p.status === "applied").sort((a, b) => when(b) - when(a));
  return sorted[0] ?? null;
};

export function buildThisWeek(input: ThisWeekInput): ThisWeekView {
  const { overview, now } = input;
  const sourceKind = overview.source?.kind ?? "";
  const waiting = input.waiting.filter((p) => p.status === "proposed");
  const owner = [overview.next, ...overview.up_next].filter((f): f is Finding => !!f && f.kind === "owner" && f.status === "open");
  const total = waiting.length + owner.length;
  const asks = waiting.map((p, i) => askView(p, i + 1, total, { ...input, sourceKind }));

  const changes: ReceiptRow[] = sinceLastWeek(input.recent, now).map((p) => {
    const where = whereOf(p.target, sourceKind);
    const ba = beforeAfter(p, input.lang);
    return { kind: "change", p, where, what: p.field_label, before: ba.before, after: ba.after, when: p.status === "undone" ? p.undone?.at ?? p.applied_at : p.applied_at };
  });
  const week = 7 * 24 * 60 * 60 * 1000;
  const yours: ReceiptRow[] = overview.done
    .filter((f) => f.kind === "owner" && (f.status === "owner_done" || f.status === "verified"))
    .filter((f) => { const t = Date.parse(f.last_seen_at ?? ""); return !Number.isNaN(t) && now - t <= week; })
    .map((f) => ({ kind: "you", f, when: f.last_seen_at }));
  const receipts = [...changes, ...yours].sort((a, b) => (Date.parse(b.when ?? "") || 0) - (Date.parse(a.when ?? "") || 0));

  let state: ViewState = "content";
  if (!overview.has_connection) state = "noConnection";
  else if (!overview.has_run) state = "noRun";
  else if (!total && !receipts.length) state = "empty";

  return {
    state,
    sourceKind,
    sample: sourceKind === "sample",
    recordedOn: sourceKind === "manual" ? overview.source?.observed_on ?? null : null,
    checkedAt: input.checks?.finished_at ?? overview.last_run?.finished_at ?? null,
    tally: tally(input.checks),
    previous: input.extras?.previous ?? null,
    asks,
    owner,
    total,
    receipts,
    approvers: approversOf(input.team),
    nextCheckAt: input.extras?.nextCheckAt ?? null,
    latest: latestOf([...input.waiting, ...input.recent]),
  };
}
