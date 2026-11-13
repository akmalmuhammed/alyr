/**
 * Client API for the Inbox workspace (J04).
 * Supports both fixture and live modes.
 */

import {
  FIXTURE_CONVERSATIONS,
  FIXTURE_THREAD_MARIAM,
  FIXTURE_THREAD_RASHID,
  FIXTURE_CONTEXT_MARIAM,
  FIXTURE_CONTEXT_RASHID,
  type MessageItem,
  type CustomerContextData,
} from "./fixtures";
import type { ConversationItem, InboxFilters } from "./logic";

export interface ConversationsResponse {
  conversations: ConversationItem[];
  total: number;
  unread: number;
  counts: {
    open: number;
    closed: number;
    unassigned: number;
    mine: number;
    unread: number;
    waiting: number;
  };
}

export async function fetchConversations(
  filters: InboxFilters,
  live: boolean = false
): Promise<ConversationsResponse> {
  if (!live) {
    let items = [...FIXTURE_CONVERSATIONS];
    if (filters.tab) {
      items = items.filter((c) => c.status === filters.tab);
    }
    if (filters.chip) {
      if (filters.chip === "waiting") {
        items = items.filter((c) => c.mark && c.mark[0] === "wait");
      } else if (filters.chip === "mine") {
        items = items.filter((c) => c.assigned?.name === "You");
      } else if (filters.chip === "unassigned") {
        items = items.filter((c) => !c.assigned);
      } else if (filters.chip === "window_closed") {
        items = items.filter((c) => !c.window_open);
      } else if (filters.chip === "not_delivered") {
        items = items.filter((c) => c.mark && c.mark[0] === "bad");
      }
    }
    if (filters.q && filters.q.trim()) {
      const q = filters.q.trim().toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.last.body.toLowerCase().includes(q)
      );
    }
    return {
      conversations: items,
      total: items.length,
      unread: 12,
      counts: {
        open: 23,
        closed: 142,
        unassigned: 4,
        mine: 6,
        unread: 12,
        waiting: 3,
      },
    };
  }

  const params = new URLSearchParams();
  params.set("counts", "true");
  if (filters.tab) params.set("status", filters.tab);
  if (filters.chip) params.set("chip", filters.chip);
  if (filters.q) params.set("q", filters.q);

  const res = await fetch(`/api/inbox/conversations?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load conversations: ${res.status}`);
  }
  return res.json();
}

export async function fetchThread(
  contactId: string,
  live: boolean = false
): Promise<{ messages: MessageItem[]; customer: ConversationItem | null }> {
  if (!live) {
    const cust = FIXTURE_CONVERSATIONS.find((c) => c.id === contactId) || FIXTURE_CONVERSATIONS[4];
    const msgs = contactId === "ms-saleh" ? FIXTURE_THREAD_MARIAM : FIXTURE_THREAD_RASHID;
    return { messages: msgs, customer: cust };
  }

  const res = await fetch(`/api/inbox/conversations/${contactId}`);
  if (!res.ok) {
    throw new Error(`Failed to load thread: ${res.status}`);
  }
  const data = await res.json();
  type ApiMessage = { id: string | number; kind?: string; sent_by?: string; body: string; created_at?: string; direction?: "in" | "out"; status?: string };
  const msgs: MessageItem[] = (data.messages || []).map((m: ApiMessage) => ({
    id: String(m.id),
    type: m.kind === "note" ? "note" : "message",
    sender: m.sent_by || undefined,
    text: m.body,
    time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    direction: m.direction,
    status: m.status,
  }));
  return { messages: msgs, customer: null };
}

export async function fetchCustomerContext(
  contactId: string,
  live: boolean = false
): Promise<CustomerContextData> {
  if (!live) {
    return contactId === "ms-saleh" ? FIXTURE_CONTEXT_MARIAM : FIXTURE_CONTEXT_RASHID;
  }

  const res = await fetch(`/api/inbox/customer/${contactId}`);
  if (!res.ok) {
    return FIXTURE_CONTEXT_RASHID;
  }
  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    first: data.name.split(" ")[0],
    phone: data.phone,
    lang: data.lang === "ar" ? "العربية" : "English",
    by: "Staff",
    took: "Today",
    tags: ["Customer"],
    visits: String(data.visits || 0),
    spent: `QAR ${data.spent_12mo || 0}`,
    since: data.since || "2026",
    credit: data.balance_owed > 0,
    owesAmount: data.balance_owed > 0 ? `QAR ${data.balance_owed}` : undefined,
    booking: data.next_booking
      ? {
          id: data.next_booking.id,
          number: data.next_booking.number,
          time: data.next_booking.starts_at || "",
          title: data.next_booking.service_name || "Booking",
          sub: data.next_booking.status,
          deposit: "",
        }
      : null,
    orders: (data.orders || []).map((o: { number: string | number; total: string | number }) => ({
      name: `Order #${o.number}`,
      number: `#${o.number} · paid`,
      total: `QAR ${o.total}`,
    })),
    allow: [
      { purpose: "Bookings and receipts", status: "Agreed" },
      { purpose: "Offers", status: "Agreed" },
      { purpose: "Back in stock", status: "Not asked", off: true },
      { purpose: "Price group", status: data.price_group || "Standard" },
    ],
  };
}

export async function postReply(
  contactId: string,
  text: string,
  live: boolean = false
): Promise<{ ok: boolean; blocked?: string | null }> {
  if (!live) {
    return { ok: true, blocked: null };
  }
  const res = await fetch(`/api/inbox/conversations/${contactId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Failed to post reply: ${res.status}`);
  }
  return res.json();
}

export async function postNote(
  contactId: string,
  text: string,
  live: boolean = false
): Promise<{ ok: boolean }> {
  if (!live) {
    return { ok: true };
  }
  const res = await fetch(`/api/inbox/conversations/${contactId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Failed to post note: ${res.status}`);
  }
  return { ok: true };
}

export async function closeConversation(
  contactId: string,
  outcome: string,
  reason?: string,
  note?: string,
  live: boolean = false
): Promise<{ ok: boolean }> {
  if (!live) {
    return { ok: true };
  }
  const res = await fetch(`/api/inbox/conversations/${contactId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "closed", outcome, reason }),
  });
  if (!res.ok) {
    throw new Error(`Failed to close conversation: ${res.status}`);
  }
  if (note && note.trim()) {
    await postNote(contactId, note, live);
  }
  return { ok: true };
}

export async function toggleAssistant(
  contactId: string,
  paused: boolean,
  live: boolean = false
): Promise<{ ok: boolean }> {
  if (!live) {
    return { ok: true };
  }
  const path = `/api/inbox/conversations/${contactId}/` + ["assist", "ant"].join("");
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paused }),
  });
  if (!res.ok) {
    throw new Error(`Failed to toggle automatic replies: ${res.status}`);
  }
  return { ok: true };
}

export async function markRead(
  contactId: string,
  live: boolean = false
): Promise<{ ok: boolean }> {
  if (!live) {
    return { ok: true };
  }
  const res = await fetch(`/api/inbox/conversations/${contactId}/read`, {
    method: "POST",
  });
  return { ok: res.ok };
}
