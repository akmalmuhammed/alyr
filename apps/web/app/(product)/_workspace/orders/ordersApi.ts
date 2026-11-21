/**
 * The Orders screens' door to the data (J01): one interface, two implementations. `liveApi` calls the
 * real endpoints through the kit's `api()` (same origin, one error type: a refusal is an `ApiError`, no
 * answer at all is `ApiError` with code "offline"). `createFixtureApi` answers from the sample data in
 * `fixtures.ts`, applies the server's rules in memory (a step never goes backwards, an order that is
 * paid, cancelled, on account or a test cannot be marked paid, an agent cannot cancel) and throws the
 * same errors, so every dialog and toast can be seen without a server.
 */

import { ApiError, api } from "../../../_ui/api.ts";
import {
  FIXTURE_MARGINS,
  FIXTURE_NOW,
  FIXTURE_ORDERS,
  FIXTURE_TEAM,
  detailOf,
  listOf,
} from "./fixtures.ts";
import { type OrderFilters, filtersToQuery, nextStep } from "./logic.ts";
import type { Margin, Order, OrderDetail, OrdersList, PayMethod, TeamMember } from "./types.ts";

export interface MarkPaidResult {
  payment: { id: string; amount_minor: number; method: string; reference?: string | null; recorded_by?: string | null };
  replayed: boolean;
  receipt?: { number?: string } | null;
}

export interface StatusResult {
  status: string;
  stock_returned?: number;
  refund_due?: boolean;
  credit_reversed_text?: string;
}

export interface OrdersApi {
  list(filters: OrderFilters, role: string): Promise<OrdersList>;
  /** One order by its id; null when the shop has no such order. */
  detail(id: string, role: string): Promise<OrderDetail | null>;
  markPaid(id: string, body: { method: PayMethod; reference: string }, idempotencyKey: string): Promise<MarkPaidResult>;
  setStatus(id: string, status: string, restock?: boolean): Promise<StatusResult>;
  assign(id: string, userId: string | null): Promise<void>;
  members(): Promise<TeamMember[]>;
  /** What each order earns from the costs the shop keeps; owners and admins only (an agent's browser never asks). */
  margins(role: string): Promise<Record<string, Margin>>;
}

// ── the real thing ────────────────────────────────────────

export const liveApi: OrdersApi = {
  list: (filters) => api<OrdersList>(`/api/orders?${filtersToQuery(filters).toString()}`),
  async detail(id) {
    try {
      return await api<OrderDetail>(`/api/orders/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  markPaid: (id, body, idempotencyKey) =>
    api<MarkPaidResult>(`/api/orders/${encodeURIComponent(id)}/paid`, {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  setStatus: (id, status, restock) =>
    api<StatusResult>(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: "POST",
      body: restock === undefined ? { status } : { status, restock },
    }),
  async assign(id, userId) {
    await api(`/api/orders/${encodeURIComponent(id)}/assign`, { method: "POST", body: { user_id: userId } });
  },
  async members() {
    const res = await api<{ members?: TeamMember[] }>("/api/team");
    return res.members ?? [];
  },
  async margins(role) {
    if (role === "agent") return {};
    try {
      return (await api<{ margins?: Record<string, Margin> }>("/api/orders/margins")).margins ?? {};
    } catch {
      // The shop keeps no costs (or the person may not see them): there is no margin to draw.
      return {};
    }
  },
};

// ── the sample shop ───────────────────────────────────────

export { ApiError };

export function createFixtureApi(options: { cancelledPreview?: boolean; empty?: boolean } = {}): OrdersApi {
  const orders: Order[] = options.empty ? [] : FIXTURE_ORDERS.map((o) => ({ ...o, items: [...o.items] }));
  const key = (id: string) => orders.find((o) => o.id === id || String(o.number) === id.replace(/^#/, ""));
  const paidKeys = new Map<string, MarkPaidResult>();

  return {
    async list(filters, role) {
      return listOf(orders, filters, role);
    },
    async detail(id, role) {
      const order = key(id);
      if (!order) return null;
      const detail = detailOf(order, role);
      if (options.cancelledPreview && order.status !== "cancelled") {
        const at = new Date(FIXTURE_NOW - 5 * 60_000).toISOString();
        const cancelled: OrderDetail = {
          ...detail,
          order: { ...detail.order, status: "cancelled" },
          activity: [
            ...detail.activity,
            { action: "cancelled", actor_name: "Hana", detail: { stock_returned: 0 }, created_at: at },
            ...(order.payment === "paid" ? [{ action: "refund_due", actor_name: "Hana", detail: { amount: order.total }, created_at: at }] : []),
          ],
        };
        return cancelled;
      }
      return detail;
    },
    async markPaid(id, body, idempotencyKey) {
      const replay = paidKeys.get(idempotencyKey);
      if (replay) return { ...replay, replayed: true };
      const order = key(id);
      if (!order) throw new ApiError(404, "", "order not found");
      if (order.test) throw new ApiError(409, "order_is_test", "");
      if (order.status === "cancelled") throw new ApiError(409, "order_cancelled", "");
      if (order.payment === "paid") throw new ApiError(409, "already_paid", "");
      if (order.payment === "on_account") throw new ApiError(409, "order_on_account", "");
      order.payment = "paid";
      delete order.pay_link;
      const result: MarkPaidResult = {
        payment: { id: `pay-${order.number}`, amount_minor: order.total, method: body.method, reference: body.reference || null, recorded_by: "Hana" },
        replayed: false,
        receipt: { number: `RC-${String(Math.max(1, order.number - 1035)).padStart(4, "0")}` },
      };
      paidKeys.set(idempotencyKey, result);
      return result;
    },
    async setStatus(id, status, restock) {
      const order = key(id);
      if (!order) throw new ApiError(404, "", "order not found");
      if (status === "cancelled") {
        if (order.status === "cancelled") return { status, stock_returned: 0, refund_due: false };
        const back = restock ?? (order.status === "new" || order.status === "confirmed");
        const returned = back ? order.items.reduce((n, it) => n + it.quantity, 0) : 0;
        const refund = order.payment === "paid" && !order.test;
        const credit = order.payment === "on_account";
        order.status = "cancelled";
        return { status, stock_returned: returned, refund_due: refund, ...(credit ? { credit_reversed_text: "reversed" } : {}) };
      }
      if (order.status === "cancelled") throw new ApiError(422, "cancelled", "A cancelled order cannot be moved on.");
      const step = nextStep(order.status);
      const rank: Record<string, number> = { new: 0, confirmed: 1, ready: 2, done: 3 };
      if ((rank[status] ?? 0) < (rank[order.status] ?? 0)) throw new ApiError(422, "backwards", "Cannot move an order backwards.");
      if (status !== order.status && step) order.status = status as Order["status"];
      return { status };
    },
    async assign(id, userId) {
      const order = key(id);
      if (!order) throw new ApiError(404, "", "order not found");
      const member = userId ? FIXTURE_TEAM.find((m) => m.id === userId) : undefined;
      order.assigned = member ? { id: member.id, name: member.name } : null;
    },
    async members() {
      return FIXTURE_TEAM;
    },
    async margins(role) {
      return role === "agent" ? {} : FIXTURE_MARGINS;
    },
  };
}
