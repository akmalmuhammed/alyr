/**
 * The thread as rows to draw (J04): day separators between days, and a "window closed" mark where
 * the customer's 24 hours ran out before the next thing that happened. Pure; the labels are written
 * by the screen in the person's language.
 */

import { WINDOW_MS, dayKey } from "./logic.ts";
import type { ThreadItem } from "./types.ts";

export type TimelineRow =
  | { kind: "day"; key: string; at: string; closedAt?: string }
  | { kind: "window"; key: string; at: string }
  | { kind: "item"; key: string; item: ThreadItem };

export function buildTimeline(items: readonly ThreadItem[]): TimelineRow[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rows: TimelineRow[] = [];
  let day = "";
  let lastInbound: number | null = null;
  let marked = false;

  for (const item of sorted) {
    const at = Date.parse(item.at);

    // The customer's window ran out before this happened: say so once, where it ran out.
    if (lastInbound !== null && !marked && at > lastInbound + WINDOW_MS) {
      const closedAt = new Date(lastInbound + WINDOW_MS).toISOString();
      if (dayKey(closedAt) !== day) {
        day = dayKey(closedAt);
        rows.push({ kind: "day", key: `day-${closedAt}`, at: closedAt, closedAt });
      } else {
        rows.push({ kind: "window", key: `window-${closedAt}`, at: closedAt });
      }
      marked = true;
    }

    if (dayKey(item.at) !== day) {
      day = dayKey(item.at);
      rows.push({ kind: "day", key: `day-${item.at}`, at: item.at });
    }
    rows.push({ kind: "item", key: item.id, item });

    if (item.kind === "message" && item.direction === "in") {
      lastInbound = at;
      marked = false;
    }
  }
  return rows;
}
