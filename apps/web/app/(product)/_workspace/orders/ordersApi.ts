/**
 * Client API for the Orders area (J01).
 *
 * Supports live mode (`live=1` / live API backend) and fixture mode (in-memory mock).
 */

import {
  FIXTURE_ACCESS,
  FIXTURE_OPEN_TOTAL,
  FIXTURE_ORDERS,
  FIXTURE_TEAM,
  getFixtureDetail,
  type OrderDetailFixture,
  type OrderRowFixture,
} from "./fixtures";
import { type OrderFilters, filtersToQuery, isLateNew } from "./logic";

export interface OrdersListResponse {
  slug: string;
  orders: OrderRowFixture[];
  total: number;
  counts: {
    all: number;
    open: number;
    new: number;
    confirmed: number;
    ready: number;
    done: number;
    cancelled: number;
    pickup: number;
    delivery: number;
  };
  late_new: {
    count: number;
    items: Array<{ number: number; minutes: number }>;
  };
  open_total?: number;
  access: {
    can_manage: boolean;
    can_record_payments: boolean;
    can_cancel: boolean;
    receipt_on_payment: boolean;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

class OrdersApiClient {
  private inMemoryOrders = [...FIXTURE_ORDERS];

  async list(filters: OrderFilters, live = false, role = "owner"): Promise<OrdersListResponse> {
    if (live) {
      const q = filtersToQuery(filters);
      const res = await fetch(`/api/orders?${q.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as OrdersListResponse;
    }

    // In-memory fixture filtering
    let list = [...this.inMemoryOrders];

    // Status filter
    const status = filters.status || "open";
    if (status === "open") {
      list = list.filter(
        (o) =>
          o.status === "new" ||
          o.status === "confirmed" ||
          o.status === "ready" ||
          (o.payment === "unpaid" && o.status !== "cancelled")
      );
    } else if (status !== "all") {
      list = list.filter((o) => o.status === status);
    }

    // Payment filter
    if (filters.payment && filters.payment !== "all") {
      list = list.filter((o) => o.payment === filters.payment);
    }

    // Fulfilment mode filter
    if (filters.mode && filters.mode !== "all") {
      list = list.filter((o) => o.fulfilment?.mode === filters.mode);
    }

    // Handled by filter
    if (filters.assigned && filters.assigned !== "all") {
      if (filters.assigned === "none") {
        list = list.filter((o) => !o.assigned);
      } else {
        list = list.filter((o) => o.assigned?.id === filters.assigned);
      }
    }

    // Search query filter (customer, phone, order number, items)
    if (filters.q) {
      const term = filters.q.toLowerCase().trim().replace(/^#/, "");
      list = list.filter((o) => {
        if (String(o.number).includes(term)) return true;
        if (o.customer.toLowerCase().includes(term)) return true;
        if (o.phone.includes(term)) return true;
        return o.items.some(
          (it) =>
            it.name.toLowerCase().includes(term) ||
            (it.name_ar && it.name_ar.toLowerCase().includes(term))
        );
      });
    }

    // Sort
    if (filters.sort === "oldest") {
      list.sort((a, b) => a.number - b.number);
    } else {
      list.sort((a, b) => b.number - a.number);
    }

    const total = list.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paged = list.slice(offset, offset + limit);

    // Calculate counts over inMemoryOrders
    const counts = {
      all: this.inMemoryOrders.length,
      open: this.inMemoryOrders.filter(
        (o) =>
          o.status === "new" ||
          o.status === "confirmed" ||
          o.status === "ready" ||
          (o.payment === "unpaid" && o.status !== "cancelled")
      ).length,
      new: this.inMemoryOrders.filter((o) => o.status === "new").length,
      confirmed: this.inMemoryOrders.filter((o) => o.status === "confirmed").length,
      ready: this.inMemoryOrders.filter((o) => o.status === "ready").length,
      done: this.inMemoryOrders.filter((o) => o.status === "done").length,
      cancelled: this.inMemoryOrders.filter((o) => o.status === "cancelled").length,
      pickup: this.inMemoryOrders.filter((o) => o.fulfilment?.mode === "pickup").length,
      delivery: this.inMemoryOrders.filter((o) => o.fulfilment?.mode === "delivery").length,
    };

    const lateItems = this.inMemoryOrders
      .filter((o) => isLateNew(o.status, o.created_at))
      .map((o) => ({ number: o.number, minutes: 18 }));

    const res: OrdersListResponse = {
      slug: "demo",
      orders: paged,
      total,
      counts,
      late_new: {
        count: lateItems.length,
        items: lateItems.slice(0, 3),
      },
      access: {
        ...FIXTURE_ACCESS,
        can_manage: role !== "agent",
        can_cancel: role !== "agent",
      },
    };

    if (role !== "agent") {
      res.open_total = FIXTURE_OPEN_TOTAL;
    }

    return res;
  }

  async getDetail(idOrNumber: string | number, live = false): Promise<OrderDetailFixture | null> {
    if (live) {
      const res = await fetch(`/api/orders/${idOrNumber}`, {
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as OrderDetailFixture;
    }

    return getFixtureDetail(idOrNumber);
  }

  async setStatus(
    orderId: string,
    status: string,
    restock?: boolean,
    live = false
  ): Promise<{ status: string; stock_returned?: number; refund_due?: number }> {
    if (live) {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, restock }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      return await res.json();
    }

    // In-memory update
    const order = this.inMemoryOrders.find((o) => o.id === orderId);
    if (order) {
      order.status = status as OrderRowFixture["status"];
    }
    return { status, stock_returned: restock ? 1 : 0 };
  }

  async markPaid(
    orderId: string,
    method: "cash" | "bank_transfer" | "cheque" | "card_terminal",
    reference = "",
    live = false
  ): Promise<{ payment: { id: string; amount_minor: number; method: string }; receipt?: unknown }> {
    if (live) {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/orders/${orderId}/paid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ method, reference }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      return await res.json();
    }

    const order = this.inMemoryOrders.find((o) => o.id === orderId);
    if (order) {
      order.payment = "paid";
      delete order.pay_link;
    }
    return {
      payment: { id: "pay-1", amount_minor: order?.total || 0, method },
      receipt: { id: "doc-rc-0004", number: "RC-0004" },
    };
  }

  async assign(orderId: string, userId: string | null, live = false): Promise<void> {
    if (live) {
      const res = await fetch(`/api/orders/${orderId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return;
    }

    const order = this.inMemoryOrders.find((o) => o.id === orderId);
    if (order) {
      if (userId) {
        const member = FIXTURE_TEAM.find((m) => m.id === userId);
        order.assigned = member ? { id: member.id, name: member.name } : undefined;
      } else {
        delete order.assigned;
      }
    }
  }

  async getTeam(live = false): Promise<TeamMember[]> {
    if (live) {
      const res = await fetch("/api/team");
      if (!res.ok) return FIXTURE_TEAM;
      const data = await res.json();
      return data.members || FIXTURE_TEAM;
    }
    return FIXTURE_TEAM;
  }
}

export const ordersApi = new OrdersApiClient();
