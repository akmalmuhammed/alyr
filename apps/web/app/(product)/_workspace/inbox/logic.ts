/**
 * Pure domain logic and calculations for the Inbox redesign (J04).
 */

import type { Lang } from "./copy";

export interface ConversationItem {
  id: string;
  name: string;
  phone: string;
  username?: string | null;
  status: "open" | "closed";
  assistant_paused: boolean;
  opted_out: boolean;
  window_open: boolean;
  window_closes_at?: string | null;
  unread: number;
  assigned?: { id: string; name: string } | null;
  last: {
    body: string;
    direction: "in" | "out";
    kind: string;
    status: string;
    created_at: string;
    sent_by?: string;
  };
  mark?: ["wait" | "lock" | "bad", string] | null;
  arabic?: boolean;
}

export interface InboxFilters {
  tab: "open" | "closed";
  chip?: "waiting" | "mine" | "unassigned" | "not_delivered" | "window_closed" | null;
  q?: string;
}

/** Check if the 24-hour messaging window is still open based on last inbound message. */
export function isWindowOpen(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (isNaN(t)) return false;
  const now = Date.now();
  const diffHours = (now - t) / (1000 * 60 * 60);
  return diffHours >= 0 && diffHours < 24;
}

/** Calculate remaining integer hours within the 24-hour window. */
export function windowRemainingHours(lastInboundAt: string | null | undefined): number {
  if (!lastInboundAt) return 0;
  const t = new Date(lastInboundAt).getTime();
  if (isNaN(t)) return 0;
  const deadline = t + 24 * 60 * 60 * 1000;
  const now = Date.now();
  const remainingMs = deadline - now;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (1000 * 60 * 60));
}

/** Format closing timestamp for the 24-hour countdown bar. */
export function formatWindowClosesAt(lastInboundAt: string | null | undefined): string {
  if (!lastInboundAt) return "";
  const t = new Date(lastInboundAt).getTime();
  if (isNaN(t)) return "";
  const deadline = new Date(t + 24 * 60 * 60 * 1000);
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const dayName = days[deadline.getDay()];
  const dayNum = deadline.getDate();
  const monthName = months[deadline.getMonth()];
  const hh = String(deadline.getHours()).padStart(2, "0");
  const mm = String(deadline.getMinutes()).padStart(2, "0");
  return `${dayName} ${dayNum} ${monthName} ${hh}:${mm}`;
}

/** Calculate waiting duration in minutes for inbound customer messages. */
export function getWaitingMinutes(lastMsgTime: string, direction: string): number | null {
  if (direction !== "in") return null;
  const t = new Date(lastMsgTime).getTime();
  if (isNaN(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  const mins = Math.floor(diffMs / 60000);
  return mins;
}

/** Format money with strict currency symbol and non-breaking spaces. */
export function money(amount: number, lang: Lang = "en"): string {
  const formatted = amount.toLocaleString("en-US");
  return lang === "ar" ? `${formatted}\u00a0ر.ق` : `QAR\u00a0${formatted}`;
}

/** Format time in HH:MM format. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Filter conversations in client or fixture mode. */
export function filterConversations(
  items: ConversationItem[],
  filters: InboxFilters,
  currentUserId?: string
): ConversationItem[] {
  return items.filter((item) => {
    // Tab filter
    if (filters.tab !== item.status) return false;

    // Chip filter
    if (filters.chip) {
      if (filters.chip === "waiting") {
        if (!item.mark || item.mark[0] !== "wait") return false;
      } else if (filters.chip === "mine") {
        if (!item.assigned || (currentUserId && item.assigned.id !== currentUserId)) {
          if (item.assigned?.name !== "You") return false;
        }
      } else if (filters.chip === "unassigned") {
        if (item.assigned) return false;
      } else if (filters.chip === "window_closed") {
        if (item.window_open) return false;
      } else if (filters.chip === "not_delivered") {
        if (!item.mark || item.mark[0] !== "bad") return false;
      }
    }

    // Search query
    if (filters.q && filters.q.trim()) {
      const q = filters.q.trim().toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchPhone = item.phone.includes(q);
      const matchBody = item.last.body.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchBody) return false;
    }

    return true;
  });
}
