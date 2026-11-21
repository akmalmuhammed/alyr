// The pure half of the Table: sorting, selection and row-focus maths. No React, so `node --test`
// runs it (tableLogic.test.mjs). Sorting is done by the screen or the server and handed to the Table as
// rows already in order; these helpers are for the screens that sort what they already hold.

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
export type SortValue = string | number | boolean | Date | null | undefined;

/** The cycle a click on a sortable header takes: ascending, descending, off; another column starts ascending. */
export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

export function ariaSort(sort: SortState, key: string): "ascending" | "descending" | "none" {
  if (!sort || sort.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

function rank(value: SortValue): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/**
 * Stable sort. Empty values go last whichever way the column runs, numbers compare as numbers, and
 * text compares as a person reads it (case and accents ignored, "order 9" before "order 10").
 */
export function sortRows<R>(rows: readonly R[], value: (row: R) => SortValue, sort: SortState, locale = "en"): R[] {
  if (!sort) return [...rows];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: rank(value(row)) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.index - b.index;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const result = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : collator.compare(String(a.v), String(b.v));
      return result === 0 ? a.index - b.index : result * sign;
    })
    .map((entry) => entry.row);
}

// ── selection ───────────────────────────────────────────────────────────────

export type Selected = ReadonlySet<string>;
export type SelectionState = "none" | "some" | "all";

export function selectionState(selected: Selected, keys: readonly string[]): SelectionState {
  if (keys.length === 0) return "none";
  let count = 0;
  for (const key of keys) if (selected.has(key)) count += 1;
  return count === 0 ? "none" : count === keys.length ? "all" : "some";
}

export function toggleOne(selected: Selected, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** The header checkbox: everything shown when not all of it is selected, otherwise nothing shown. */
export function toggleAll(selected: Selected, keys: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (selectionState(selected, keys) === "all") for (const key of keys) next.delete(key);
  else for (const key of keys) next.add(key);
  return next;
}

/** Shift-click: every row between the last one clicked and this one takes the state of this one. */
export function selectRange(selected: Selected, keys: readonly string[], from: string, to: string, on: boolean): Set<string> {
  const a = keys.indexOf(from);
  const b = keys.indexOf(to);
  if (a < 0 || b < 0) return toggleOne(selected, to);
  const next = new Set(selected);
  for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) {
    if (on) next.add(keys[i]);
    else next.delete(keys[i]);
  }
  return next;
}

/** After the rows change (a filter, a page), what was selected and is gone is forgotten. */
export function pruneSelection(selected: Selected, keys: readonly string[]): Set<string> {
  const present = new Set(keys);
  return new Set([...selected].filter((key) => present.has(key)));
}

// ── keyboard row focus ──────────────────────────────────────────────────────

const PAGE = 8;

/** Where focus goes from row `index` for an arrow, Home, End or Page key; null for any other key. */
export function moveRowFocus(index: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  switch (key) {
    case "ArrowDown": return Math.min(last, index + 1);
    case "ArrowUp": return Math.max(0, index - 1);
    case "Home": return 0;
    case "End": return last;
    case "PageDown": return Math.min(last, index + PAGE);
    case "PageUp": return Math.max(0, index - PAGE);
    default: return null;
  }
}

// ── paging ──────────────────────────────────────────────────────────────────

/** 1-based first and last row shown on a page, for "1 to 25 of 212". An empty list is 0 to 0. */
export function pageRange(page: number, size: number, total: number): { from: number; to: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  if (total <= 0) return { from: 0, to: 0, pages };
  const at = Math.min(Math.max(1, page), pages);
  return { from: (at - 1) * size + 1, to: Math.min(total, at * size), pages };
}

/** Deterministic skeleton widths (percent of the cell) so rows do not look stamped and never jump on re-render. */
export function skeletonWidth(row: number, col: number): number {
  const steps = [62, 84, 48, 72, 56, 90, 40, 68];
  return steps[(row * 3 + col * 5) % steps.length];
}
