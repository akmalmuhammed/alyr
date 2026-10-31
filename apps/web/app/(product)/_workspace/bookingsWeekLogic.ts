// The opening-hours week and the days off, as plain functions (ALY-259, D-141, spec 043): the
// week the API holds (a list of periods, 0 is Sunday) becomes seven days the screen edits and
// back, a week is checked in the page's language before it is sent, and a day off is checked
// and written as a range of dates. No React, so `bookingsWeekLogic.test.mjs` runs it under Node. The
// API checks everything again.

export type Period = { weekday: number; opens: string; closes: string };
export type Span = { opens: string; closes: string };
export type Day = { on: boolean; spans: Span[] };

export const DEFAULT_SPAN: Span = { opens: "10:00", closes: "20:00" };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A week's periods as seven days, Sunday first, the periods of a day in the order they start. */
export function weekFrom(periods: Period[]): Day[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const spans = periods
      .filter((p) => p.weekday === weekday)
      .map((p) => ({ opens: p.opens, closes: p.closes }))
      .sort((a, b) => a.opens.localeCompare(b.opens));
    return { on: spans.length > 0, spans: spans.length > 0 ? spans : [{ ...DEFAULT_SPAN }] };
  });
}

/** What the API takes: the periods of the days that are open, nothing for a day that is off. */
export function periodsFrom(week: Day[]): Period[] {
  return week.flatMap((day, weekday) => (day.on ? day.spans.map((s) => ({ weekday, ...s })) : []));
}

export type WeekError = { weekday: number; code: "no_time" | "bad_hours" | "bad_hours_overlap" };

/** The first thing wrong with a week, and on which day; null when it can be saved. */
export function checkWeek(week: Day[]): WeekError | null {
  for (let weekday = 0; weekday < week.length; weekday += 1) {
    const day = week[weekday];
    if (!day.on) continue;
    for (const s of day.spans) {
      if (!TIME.test(s.opens) || !TIME.test(s.closes)) return { weekday, code: "no_time" };
      if (s.closes <= s.opens) return { weekday, code: "bad_hours" };
    }
    const sorted = [...day.spans].sort((a, b) => a.opens.localeCompare(b.opens));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].opens < sorted[i - 1].closes) return { weekday, code: "bad_hours_overlap" };
    }
  }
  return null;
}

/** The first open day's hours on every day: a shop that keeps the same hours all week. */
export function sameEveryDay(week: Day[]): Day[] {
  const first = week.find((d) => d.on) ?? { on: true, spans: [{ ...DEFAULT_SPAN }] };
  return week.map(() => ({ on: true, spans: first.spans.map((s) => ({ ...s })) }));
}

function clock(minutes: number): string {
  const m = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** A day with one more period after its last: an hour after the last closes, four hours long,
 * or the usual hours when there is no room left in the day. */
export function addSpan(day: Day): Day {
  const last = day.spans[day.spans.length - 1];
  const [h, m] = (last?.closes ?? "00:00").split(":").map(Number);
  const start = h * 60 + m + 60;
  const next: Span = start <= 21 * 60 ? { opens: clock(start), closes: clock(start + 240) } : { ...DEFAULT_SPAN };
  return { ...day, spans: [...day.spans, next] };
}

// ── days off ────────────────────────────────────────────────────────────────────────────────

export type ClosureError = "closure_dates" | "bad_closure" | "closure_past";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Two dates (the shop's own calendar days, "YYYY-MM-DD") are a day off that can be added. */
export function checkClosure(first: string, last: string, today: string): ClosureError | null {
  if (!DAY.test(first) || !DAY.test(last)) return "closure_dates";
  if (last < first) return "bad_closure";
  if ((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000 >= 366) return "bad_closure";
  if (last < today) return "closure_past";
  return null;
}

/** "1–5 Nov", "1 Nov", with the year when it is not this year's; Western digits in Arabic. */
export function rangeText(first: string, last: string, lang: "en" | "ar", today: string): string {
  const at = (d: string) => new Date(`${d}T12:00:00Z`);
  const withYear = first.slice(0, 4) !== today.slice(0, 4) || last.slice(0, 4) !== today.slice(0, 4);
  const format = new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
  });
  return first === last ? format.format(at(first)) : format.formatRange(at(first), at(last));
}
