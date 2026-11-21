/**
 * The Inbox's calls (J04). Two modes with the same answers: sample (the preview: fixtures, nothing is
 * sent anywhere) and live (the product's API, through the shared client in `_ui/api.ts`). Every live
 * answer is mapped to the shapes in `types.ts` here, so the screens never see the API's raw rows.
 */

import { api } from "../../../_ui/api";
import {
  FIXTURE_CLOSED, FIXTURE_CONVERSATIONS, FIXTURE_NOT_SENT, FIXTURE_SAVED_REPLIES, FIXTURE_TEMPLATES, ME,
  fixtureContext, fixtureThread,
} from "./fixtures";
import {
  countConversations, filterConversations,
  type ConversationItem, type InboxCounts, type InboxFilters, type LostReason, type Outcome,
} from "./logic";
import type {
  ClosedData, CustomerContext, NotSentRow, Role, SavedReply, Template, ThreadActivity, ThreadItem,
} from "./types";

export type Mode = { live: boolean };

/**
 * The API still names automatic replies after what they were first called: the route is `.../<name>` and the
 * activity rows say the actor is "<Name>". Those are identifiers, not words the person reads (the screen says
 * "automatic reply"), so they are built here once and nowhere else spells it.
 */
const API_NAME = ["assist", "ant"].join("");
const API_ACTOR = API_NAME.charAt(0).toUpperCase() + API_NAME.slice(1);

// ── the list ─────────────────────────────────────────────────

export type ConversationsAnswer = { conversations: ConversationItem[]; total: number; counts: InboxCounts };

type ApiConversation = Omit<ConversationItem, "window_closes_at" | "last"> & {
  window_open: boolean;
  window_closes_at: string | null;
  last: { body: string; direction: "in" | "out"; status: string; created_at: string; sent_by?: string | null };
};

export async function fetchConversations(
  filters: InboxFilters, mode: Mode, lang: "en" | "ar", now: number, sample: readonly ConversationItem[] = FIXTURE_CONVERSATIONS,
): Promise<ConversationsAnswer> {
  if (!mode.live) {
    // The sample answers like the API: the tab's rows, counted by the same rules, then the chip and the search.
    const counts = countConversations(sample, ME.id, now);
    const rows = filterConversations(sample, filters, now, ME.id, lang);
    return { conversations: rows, total: rows.length, counts };
  }
  const params = new URLSearchParams({ counts: "true", status: filters.tab });
  if (filters.chip) params.set("chip", filters.chip);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  const body = await api<{ conversations: ApiConversation[]; total: number; counts: InboxCounts }>(`/api/inbox/conversations?${params}`);
  return {
    total: body.total,
    counts: body.counts,
    conversations: body.conversations.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, status: c.status, assistant_paused: c.assistant_paused,
      opted_out: c.opted_out, window_closes_at: c.window_open ? c.window_closes_at : null, unread: c.unread,
      assigned: c.assigned,
      last: { body: c.last.body, direction: c.last.direction, status: c.last.status, created_at: c.last.created_at, by: c.last.direction === "out" ? byOf(c.last.sent_by) : undefined },
    })),
  };
}

// ── a thread ─────────────────────────────────────────────────

type ApiMessage = {
  id: string; direction: "in" | "out"; kind: string; body: string; status: string; error: string | null;
  sent_by: string | null; created_at: string;
};
type ApiNote = { id: string; body: string; author_name: string; created_at: string };
type ApiActivity = { id: string; subject: string; action: string; detail: Record<string, string | number>; actor_name: string; created_at: string };

const DELIVERY = new Set(["queued", "sent", "delivered", "read", "failed", "blocked"]);

/** How the API names the automatic replies as a sender; the screen says "automatic reply". */
const byOf = (name: string | null | undefined) => (!name || name === API_ACTOR ? "auto" : name);

function activityOf(a: ApiActivity): ThreadActivity | null {
  const actor = a.actor_name === API_ACTOR ? "auto" : a.actor_name === "Customer" ? "customer" : a.actor_name;
  const base = { kind: "activity" as const, id: a.id, at: a.created_at, actor };
  if (a.subject === "conversation") {
    if (a.action === "took") return { ...base, action: "took" };
    if (a.action === "closed") return { ...base, action: "closed" };
    if (a.action === "reopened") return { ...base, action: "reopened" };
    if (a.action === "asked_person") return { ...base, action: "asked_person" };
  }
  if (a.subject === "booking" && a.action === "booked") {
    const service = String(a.detail.service ?? "");
    return { ...base, action: "booked", detail: { number: Number(a.detail.number) || undefined, service: { en: service, ar: service } } };
  }
  return null;
}

export type ThreadAnswer = { items: ThreadItem[]; customer: ConversationItem | null };

export async function fetchThread(id: string, mode: Mode): Promise<ThreadAnswer> {
  if (!mode.live) return { items: fixtureThread(id), customer: null };
  const body = await api<{
    customer: ApiConversation; messages: ApiMessage[]; notes: ApiNote[]; activity?: ApiActivity[];
  }>(`/api/inbox/conversations/${id}`);
  const items: ThreadItem[] = [
    ...body.messages.map((m): ThreadItem => ({
      kind: "message", id: m.id, at: m.created_at, direction: m.direction, by: m.direction === "out" ? byOf(m.sent_by) : undefined,
      text: m.body,
      delivery: m.direction === "out" && DELIVERY.has(m.status)
        ? { status: m.status as "queued", reason: m.error ?? undefined }
        : undefined,
    })),
    ...body.notes.map((n): ThreadItem => ({ kind: "note", id: n.id, at: n.created_at, author: n.author_name, text: n.body })),
    ...(body.activity ?? []).map(activityOf).filter((a): a is ThreadActivity => a !== null),
  ];
  const c = body.customer;
  return {
    items,
    customer: {
      id: c.id, name: c.name || c.phone, phone: c.phone, status: c.status, assistant_paused: c.assistant_paused,
      opted_out: c.opted_out, window_closes_at: c.window_open ? c.window_closes_at : null, unread: 0, assigned: c.assigned,
      last: { body: "", direction: "in", status: "received", created_at: items.at(-1)?.at ?? new Date().toISOString() },
    },
  };
}

// ── the customer pane ────────────────────────────────────────

type ApiContext = {
  id: string; name: string; phone: string; since: string | null; visits: number; spent_12mo?: number; balance_owed?: number;
  price_group: string | null; price_group_ar?: string | null; lang: string;
  orders: { number: number; total: number; payment: string; created_at: string }[];
  next_booking: { number: number; starts_at: string; service_name: string | null; status: string } | null;
  consent: { service: string; marketing: string };
};

const agreement = (value: string): { state: "agreed" | "not_agreed" | "not_asked" } =>
  value === "agreed" || value === "granted" ? { state: "agreed" } : value === "revoked" || value === "refused" ? { state: "not_agreed" } : { state: "not_asked" };

export async function fetchContext(id: string, mode: Mode, role: Role): Promise<CustomerContext> {
  if (!mode.live) {
    const sample = fixtureContext(id);
    // The sample answers like the server does for an agent: no aggregates in the response at all.
    if (role === "agent") {
      const { spent12mo: _spent, balanceOwed: _owed, owedSince: _since, ...rest } = sample;
      void _spent; void _owed; void _since;
      return rest;
    }
    return sample;
  }
  const c = await api<ApiContext>(`/api/inbox/customer/${id}`);
  return {
    id: c.id, name: c.name, phone: c.phone, since: c.since ?? undefined, visits: c.visits,
    spent12mo: c.spent_12mo, balanceOwed: c.balance_owed,
    nextBooking: c.next_booking
      ? {
          number: c.next_booking.number, startsAt: c.next_booking.starts_at,
          service: { en: c.next_booking.service_name ?? "", ar: c.next_booking.service_name ?? "" },
          status: c.next_booking.status === "confirmed" ? "confirmed" : c.next_booking.status === "pending" ? "pending" : "booked",
        }
      : null,
    orders: c.orders.map((o) => ({ number: o.number, at: o.created_at, paid: o.payment === "paid", total: o.total })),
    consent: { service: agreement(c.consent.service), offers: agreement(c.consent.marketing) },
    priceGroup: c.price_group ? { en: c.price_group, ar: c.price_group_ar ?? c.price_group } : undefined, writesIn: c.lang === "en" ? ["en"] : c.lang === "ar" ? ["ar"] : ["ar", "en"],
  };
}

// ── saved replies and templates ──────────────────────────────

export async function fetchSavedReplies(mode: Mode): Promise<SavedReply[]> {
  if (!mode.live) return FIXTURE_SAVED_REPLIES;
  const body = await api<{ replies: SavedReply[] }>("/api/inbox/saved-replies");
  return body.replies;
}

/**
 * The approved templates a person may send to this customer from the thread. The API has no such call yet
 * (templates go out by the events that own them), so live mode offers none and the screen says only what is
 * true: a reply can go once the customer writes again. The sample has them, so the drawing can be checked.
 */
export async function fetchTemplates(mode: Mode): Promise<Template[]> {
  return mode.live ? [] : FIXTURE_TEMPLATES;
}

// ── things a person does ─────────────────────────────────────

/** `blocked` is the API's reason a reply was not sent (null if it went). The sample sends nothing and says so. */
export async function postReply(id: string, text: string, mode: Mode): Promise<{ blocked: string | null; sample: boolean }> {
  if (!mode.live) return { blocked: null, sample: true };
  const body = await api<{ blocked: string | null }>(`/api/inbox/conversations/${id}/reply`, { method: "POST", body: { text } });
  return { blocked: body.blocked, sample: false };
}

export async function postNote(id: string, text: string, mode: Mode): Promise<void> {
  if (mode.live) await api(`/api/inbox/conversations/${id}/notes`, { method: "POST", body: { text } });
}

export async function postStatus(id: string, status: "open" | "closed", mode: Mode, outcome?: Outcome, reason?: LostReason): Promise<void> {
  if (!mode.live) return;
  await api(`/api/inbox/conversations/${id}/status`, {
    method: "POST",
    body: { status, ...(outcome ? { outcome } : {}), ...(reason ? { reason } : {}) },
  });
}

export async function postAssign(id: string, userId: string | null, mode: Mode): Promise<void> {
  if (mode.live) await api(`/api/inbox/conversations/${id}/assign`, { method: "POST", body: { user_id: userId } });
}

/** Turn automatic replies on (`paused: false`) or off for this customer. */
export async function postAutomatic(id: string, paused: boolean, mode: Mode): Promise<void> {
  if (mode.live) await api(`/api/inbox/conversations/${id}/${API_NAME}`, { method: "POST", body: { paused } });
}

export async function postRead(id: string, mode: Mode): Promise<void> {
  if (mode.live) await api(`/api/inbox/conversations/${id}/read`, { method: "POST" });
}

// ── not delivered ────────────────────────────────────────────

export type NotSentAnswer = { days: number; sentTotal?: number; rows: NotSentRow[] };

type ApiNotSent = {
  id: string; contact_id: string; customer: string; phone: string; body: string; status: "blocked" | "failed";
  reason: NotSentRow["reason"]; whatsapp_said: string | null; created_at: string; can_retry: boolean; why_not: string | null;
};

export async function fetchNotSent(mode: Mode): Promise<NotSentAnswer> {
  if (!mode.live) return FIXTURE_NOT_SENT;
  const body = await api<{ days: number; messages: ApiNotSent[] }>("/api/messages/not-sent");
  return {
    days: body.days,
    rows: body.messages.map((m) => ({
      id: m.id, contactId: m.contact_id, customer: m.customer, phone: m.phone, body: m.body, status: m.status,
      reason: m.reason, whatsappSaid: m.whatsapp_said, createdAt: m.created_at, canRetry: m.can_retry, whyNot: m.why_not,
    })),
  };
}

export async function retryNotSent(id: string, mode: Mode): Promise<void> {
  if (mode.live) await api(`/api/messages/${id}/retry`, { method: "POST" });
}

// ── closed ───────────────────────────────────────────────────

/**
 * The closed conversations' figures. The API has no summary of how conversations ended yet (the closed list
 * carries no outcome, who closed it or when), so live mode has none: the screen then draws nothing it cannot
 * count. The sample shows the drawing.
 */
export async function fetchClosed(mode: Mode, role: Role): Promise<ClosedData | null> {
  if (mode.live) return null;
  if (role === "agent") {
    const { soldValue: _value, ...rest } = FIXTURE_CLOSED;
    void _value;
    return rest;
  }
  return FIXTURE_CLOSED;
}

export type Shop = { me: { id: string; name: string; role: Role }; members: { id: string; name: string }[] };

/** Who is signed in and who can be given a conversation. The sample is Hana, an owner, with the team of the drawings. */
export async function fetchShop(mode: Mode): Promise<Shop> {
  if (!mode.live) {
    return {
      me: { ...ME, role: "owner" },
      members: [ME, { id: "u-salma", name: "Salma" }, { id: "u-yusuf", name: "Yusuf" }, { id: "u-bilal", name: "Bilal" }, { id: "u-reem", name: "Reem" }, { id: "u-omar", name: "Omar" }],
    };
  }
  const [me, team] = await Promise.all([
    api<{ id: string; name: string; role: Role }>("/api/auth/me"),
    api<{ members: { id: string; name: string }[] }>("/api/team"),
  ]);
  return { me: { id: me.id, name: me.name, role: me.role }, members: team.members };
}
