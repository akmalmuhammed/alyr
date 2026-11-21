// The HourHeat grid's rule for how dark a cell is. Pure (heat.test.mjs). Counts are bookings (or
// anything countable) per day and hour; a cell's level is 0 for nothing and 1 to 4 for more, and
// the CSS turns a level into a step of the text colour. Closed hours are -1 and have no level.

export const LEVELS = 4;
export const CLOSED = -1;

/**
 * 0 for no bookings; otherwise 1 to 4. With no `max` the level is the count itself, capped at 4 (the
 * drawings' rule: "darker means more"); with a `max` the counts are spread over the four levels so
 * a busy week still shows its shape.
 */
export function heatLevel(count: number, max?: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (max === undefined || max <= LEVELS) return Math.min(LEVELS, Math.ceil(count));
  return Math.min(LEVELS, Math.max(1, Math.ceil((count / max) * LEVELS)));
}

/** The busiest cell, ignoring closed hours. */
export function heatMax(columns: readonly (readonly number[])[]): number {
  let max = 0;
  for (const column of columns) for (const count of column) if (count > max) max = count;
  return max;
}

/** The column and hour of the busiest cell (the first, reading down then across), or null for an empty grid. */
export function busiest(columns: readonly (readonly number[])[]): { column: number; row: number; count: number } | null {
  let best: { column: number; row: number; count: number } | null = null;
  columns.forEach((column, c) => column.forEach((count, r) => {
    if (count > 0 && (!best || count > best.count)) best = { column: c, row: r, count };
  }));
  return best;
}

/** Where the now line falls inside the hour rows, as a fraction of one row down from the top of row `row`. */
export function nowRow(firstHour: number, nowMinutes: number): { row: number; within: number } {
  const hours = nowMinutes / 60 - firstHour;
  const row = Math.floor(hours);
  return { row, within: hours - row };
}
