// The CalendarGrid's maths, in minutes since midnight. Pure, so `node --test` checks it
// (calendarLayout.test.mjs). The grid draws a time axis down the page and a column per person or
// bay; everything that is placed is a start and a length in minutes, turned into a position by CSS
// (`calc(var(--s) / 60 * var(--u-cal-hour))`), so nothing here knows a pixel.

export type Window = { start: number; end: number; length: number };
export type Span = { start: number; end: number };

/** "09:40" to 580. Anything that is not a time gives NaN. */
export function toMinutes(clock: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return Number.NaN;
  return hours * 60 + minutes;
}

/** 580 to "09:40". 24:00 is allowed for the end of a day that closes at midnight. */
export function toClock(minutes: number): string {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function dayWindow(start: string, end: string): Window {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) throw new RangeError(`bad day window ${start}-${end}`);
  return { start: s, end: e, length: e - s };
}

/** A span clipped to the window, as an offset from its top and a length; null when none of it is inside. */
export function placeSpan(win: Window, span: Span): { offset: number; length: number } | null {
  const start = Math.max(win.start, span.start);
  const end = Math.min(win.end, span.end);
  if (end <= start) return null;
  return { offset: start - win.start, length: end - start };
}

/** Whole hours that get a line and a label: the first hour at or after the start, up to the end. */
export function hourTicks(win: Window): number[] {
  const ticks: number[] = [];
  for (let h = Math.ceil(win.start / 60); h * 60 <= win.end; h += 1) ticks.push(h);
  return ticks;
}

/** Where the now line sits, as an offset from the top; null when now is outside the window. */
export function nowOffset(win: Window, now: number): number | null {
  if (now < win.start || now > win.end) return null;
  return now - win.start;
}

/** A booking this short shows its customer and service on one line. */
export const COMPACT_MINUTES = 25;
export const isCompact = (length: number): boolean => length < COMPACT_MINUTES;

export type Laned = { lane: number; lanes: number };

/**
 * Bookings that overlap in one column (a person who takes two at once, a double booking) sit side
 * by side instead of on top of each other. Each cluster of overlapping bookings shares its width
 * equally; a lone booking takes the whole column. Input order is kept for equal starts.
 */
export function layoutLanes<T extends Span & { id: string }>(items: readonly T[]): Map<string, Laned> {
  const sorted = items.map((item, index) => ({ item, index })).sort((a, b) => a.item.start - b.item.start || a.item.end - b.item.end || a.index - b.index);
  const result = new Map<string, Laned>();
  let cluster: { id: string; lane: number }[] = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const member of cluster) result.set(member.id, { lane: member.lane, lanes });
    cluster = [];
    laneEnds = [];
  };

  for (const { item } of sorted) {
    if (item.start >= clusterEnd && cluster.length > 0) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd === -Infinity ? item.end : clusterEnd, item.end);
  }
  if (cluster.length > 0) flush();
  return result;
}

/**
 * The stretches inside the opening hours that nothing takes up: not booked, not an off zone. Only
 * those of `minLength` minutes or more are worth offering ("free until 17:00").
 */
export function freeGaps(win: Window, taken: readonly Span[], minLength = 30, open: Span = { start: win.start, end: win.end }): Span[] {
  const from = Math.max(win.start, open.start);
  const to = Math.min(win.end, open.end);
  if (to <= from) return [];
  const sorted = taken
    .map((t) => ({ start: Math.max(from, t.start), end: Math.min(to, t.end) }))
    .filter((t) => t.end > t.start)
    .sort((a, b) => a.start - b.start);
  const gaps: Span[] = [];
  let cursor = from;
  for (const t of sorted) {
    if (t.start - cursor >= minLength) gaps.push({ start: cursor, end: t.start });
    cursor = Math.max(cursor, t.end);
  }
  if (to - cursor >= minLength) gaps.push({ start: cursor, end: to });
  return gaps;
}

/** Total minutes covered by spans that may overlap: a column's "3 h 30 booked". */
export function coveredMinutes(spans: readonly Span[]): number {
  const sorted = spans.slice().sort((a, b) => a.start - b.start);
  let total = 0;
  let cursor = -Infinity;
  for (const s of sorted) {
    const start = Math.max(s.start, cursor);
    if (s.end > start) total += s.end - start;
    cursor = Math.max(cursor, s.end);
  }
  return total;
}
