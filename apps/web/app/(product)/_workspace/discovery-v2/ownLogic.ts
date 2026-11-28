// ALYR's own records as the screens draw them (`GET /first-party`, agent C3): orders and bookings
// per weekday over the last 4 weeks, the one point the chart makes (the busiest weekday, the days
// nothing came in), and the bars of the one weekday an hours ask changes. Pure: no React, no fetch,
// so `ownRecords.test.mjs` runs it under `node --test`. Nothing is invented: a product that is not
// switched on is never drawn as a zero, and a tie has no "busiest" day.

import { DAYS, type DayKey, type FirstPartyAnswer, type Proposal } from "../discoveryApi.ts";
import type { FirstParty } from "./adapter.ts";
import type { Counted } from "./copy3.ts";

export type WeekdayTotal = { day: DayKey; orders: number | null; bookings: number | null; total: number; share: number };

export type OwnRecordsView =
  /** Neither orders nor bookings are taken through ALYR. */
  | { state: "off" }
  /** Counted, and nothing came in. */
  | { state: "empty"; from: string | null; to: string | null; readAt: string | null; source: string }
  | {
    state: "content";
    what: Counted;
    weekdays: WeekdayTotal[];
    orders: number | null;
    bookings: number | null;
    /** The one weekday with the most; null when two or more tie for it. */
    busiest: DayKey | null;
    /** Weekdays with nothing at all in the weeks counted. */
    quiet: DayKey[];
    weeks: number;
    from: string | null;
    to: string | null;
    /** False: ALYR started counting inside the window, so the first days may be short. */
    covered: boolean;
    readAt: string | null;
    source: string;
  };

const sum = (values: (number | null)[]): number | null => (values.every((v) => v === null) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0));

/** The page's view of ALYR's own records; null when they could not be read (nothing is drawn). */
export function ownRecords(fp: FirstPartyAnswer | null): OwnRecordsView | null {
  if (!fp) return null;
  const a = fp.activity;
  if (!a || (!a.orders && !a.bookings)) return { state: "off" };
  const from = fp.window?.from ?? a.days[0]?.date ?? null;
  const to = fp.window?.to ?? a.days[a.days.length - 1]?.date ?? null;
  const readAt = a.read_at ?? fp.read_at;
  const source = a.source_label;
  const per = DAYS.map((day) => {
    const mine = a.days.filter((d) => d.weekday === day);
    const orders = a.orders ? sum(mine.map((d) => d.orders)) ?? 0 : null;
    const bookings = a.bookings ? sum(mine.map((d) => d.bookings)) ?? 0 : null;
    return { day, orders, bookings, total: (orders ?? 0) + (bookings ?? 0) };
  });
  const top = Math.max(0, ...per.map((d) => d.total));
  if (top === 0) return { state: "empty", from, to, readAt, source };
  const leaders = per.filter((d) => d.total === top);
  const busiest = leaders.length === 1 ? leaders[0].day : null;
  const lead = per.find((d) => d.day === busiest);
  return {
    state: "content",
    what: a.orders && a.bookings ? "both" : a.orders ? "orders" : "bookings",
    weekdays: per.map((d) => ({ ...d, share: d.total / top })),
    orders: lead?.orders ?? null,
    bookings: lead?.bookings ?? null,
    busiest,
    quiet: per.filter((d) => d.total === 0).map((d) => d.day),
    weeks: fp.window?.weeks ?? 4,
    from, to,
    covered: fp.covered,
    readAt, source,
  };
}

/** The totals over the whole window: what the "Your own data" facts show. */
export function windowTotals(fp: FirstPartyAnswer | null): { orders: number | null; bookings: number | null } | null {
  const a = fp?.activity;
  if (!a || (!a.orders && !a.bookings)) return null;
  return { orders: a.orders ? sum(a.days.map((d) => d.orders)) ?? 0 : null, bookings: a.bookings ? sum(a.days.map((d) => d.bookings)) ?? 0 : null };
}

/** The bars of the one weekday an hours ask changes (`focus`), for the ticket and the Why sheet.
 * Null unless the API answered for this very proposal and the ask changes that one day only. */
export function focusFor(fp: FirstPartyAnswer | null, p: Pick<Proposal, "id" | "field" | "before">, day: DayKey | null): FirstParty | null {
  const f = fp?.focus;
  if (!f || f.proposal_id !== p.id || p.field !== "hours" || !day || f.day !== day || !f.weeks.length) return null;
  // The listing said Closed that day: the before has no time on it.
  const line = p.before.lines.find((l) => l.day === day);
  return {
    day,
    weeks: f.weeks.map((w) => ({ date: w.date, orders: w.orders ?? 0, bookings: w.bookings ?? 0 })),
    listingSaidClosed: !!line && !/\d/.test(line.text),
    from: f.weeks[0]?.date ?? null,
    to: f.weeks[f.weeks.length - 1]?.date ?? null,
    countedAt: fp?.read_at ?? null,
  };
}

/** A number as people write it: «+974 5555 0150» for Qatar (8 digits after +974), else as stored. */
export function phoneText(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  const qa = /^\+974(\d{4})(\d{4})$/.exec(digits);
  return qa ? `+974 ${qa[1]} ${qa[2]}` : raw;
}
