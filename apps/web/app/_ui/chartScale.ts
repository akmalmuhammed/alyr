// The charts' scales: values to points, fractions and arcs. Pure, so `node --test` checks it
// (chartScale.test.mjs). The charts draw in a unit box and let CSS size them, so a point is a
// percentage of the box and the same drawing serves a 28px sparkline and a full-width trend.

export type Point = { x: number; y: number };

export function extent(values: readonly number[], floor?: number): { min: number; max: number } {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { min: 0, max: 1 };
  const min = floor !== undefined ? Math.min(floor, ...finite) : Math.min(...finite);
  const max = Math.max(...finite);
  return { min, max: max === min ? min + 1 : max };
}

/**
 * Values as points in a `width` x `height` box, first value at x = 0 and last at x = width. `pad`
 * keeps the line off the top and bottom edges so its stroke and its last dot are not clipped.
 * Larger values are higher on the page (smaller y). One value sits in the middle of the box.
 */
export function plotPoints(values: readonly number[], width: number, height: number, options: { pad?: number; min?: number; max?: number } = {}): Point[] {
  const pad = options.pad ?? 0;
  const { min, max } = options.min !== undefined || options.max !== undefined
    ? { min: options.min ?? extent(values).min, max: options.max ?? extent(values).max }
    : extent(values);
  const span = max - min || 1;
  const n = values.length;
  return values.map((value, i) => ({
    x: n === 1 ? width / 2 : (i * width) / (n - 1),
    y: pad + (1 - (Math.min(max, Math.max(min, value)) - min) / span) * (height - pad * 2),
  }));
}

export function pointsAttribute(points: readonly Point[], digits = 2): string {
  return points.map((p) => `${round(p.x, digits)},${round(p.y, digits)}`).join(" ");
}

/** The closed polygon under a line, for the faint fill. */
export function areaPolygon(points: readonly Point[], height: number, digits = 2): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${round(first.x, digits)},${round(height, digits)} ${pointsAttribute(points, digits)} ${round(last.x, digits)},${round(height, digits)}`;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Each value as a share of the largest, 0 to 1. A value above zero never rounds away to nothing. */
export function barFractions(values: readonly number[], minVisible = 0.04): number[] {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (v > 0 ? Math.max(minVisible, v / max) : 0));
}

/** A ring's arc as a share of its full circle, 0 to 1, clamped. */
export function ringFraction(value: number, total = 1): number {
  if (!Number.isFinite(value) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}

export type StackPart<T = string> = { value: number; tone: T };

/** Parts of a stacked bar as shares of the whole; zero and negative parts drop out. */
export function stackShares<T>(parts: readonly StackPart<T>[]): { share: number; tone: T; index: number }[] {
  const kept = parts.map((part, index) => ({ part, index })).filter(({ part }) => Number.isFinite(part.value) && part.value > 0);
  const total = kept.reduce((sum, { part }) => sum + part.value, 0);
  if (total === 0) return [];
  return kept.map(({ part, index }) => ({ share: part.value / total, tone: part.tone, index }));
}

/** 0 to 1 as a percentage string for a CSS custom property. */
export function percent(fraction: number, digits = 2): string {
  return `${round(Math.min(1, Math.max(0, fraction)) * 100, digits)}%`;
}
