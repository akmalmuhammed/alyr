/**
 * Pure business logic and formatting helpers for the Orders area (J01).
 *
 * All functions are pure and covered by `logic.test.mjs`.
 */

export interface OrderItemLine {
  name: string;
  name_ar?: string;
  quantity: number;
  unit?: string;
  unit_shown?: boolean;
  variant?: string;
  variant_ar?: string;
  sku?: string;
  price?: number;
  line_total?: number;
  discount?: number;
  fields?: Record<string, unknown>;
  options?: string[];
  options_ar?: string[];
}

export interface OrderFilters {
  status?: string; // "open" | "new" | "confirmed" | "ready" | "done" | "cancelled" | "all"
  payment?: string; // "all" | "paid" | "unpaid" | "on_account"
  mode?: string; // "all" | "pickup" | "delivery"
  assigned?: string; // user id | "none" | "all"
  q?: string;
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
  open?: string; // order number for drawer
  detail?: string; // order number for detail page
  dialog?: "paid" | "cancel" | null;
  forOrder?: string; // order number or id for dialog
}

export interface CancelConsequences {
  restockDefault: boolean;
  restockCount: number;
  refundDue: number; // in dirhams
  isCreditReversal: boolean;
  cancelsDocument: boolean;
}

export interface NextStepInfo {
  nextStatus: "confirmed" | "ready" | "done";
  labelEn: string;
  labelAr: string;
  volt: boolean;
}

/**
 * Format order number as `#1042`.
 */
export function orderNo(num: number | string): string {
  const str = String(num).replace(/^#/, "");
  return `#${str}`;
}

/**
 * Format phone as `+974 5555 0112` or similar readable form.
 */
export function formatPhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("974") && cleaned.length === 11) {
    return `+974 ${cleaned.slice(3, 7)} ${cleaned.slice(7)}`;
  }
  if (cleaned.length === 8) {
    return `+974 ${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
  }
  return raw.startsWith("+") ? raw : `+${raw}`;
}

/**
 * Check if order is new and older than 15 minutes.
 */
export function isLateNew(status: string, createdAt: string | Date, nowMs = Date.now()): boolean {
  if (status !== "new") return false;
  const createdMs = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(createdMs)) return false;
  const diffMinutes = (nowMs - createdMs) / (60 * 1000);
  return diffMinutes > 15;
}

/**
 * Age in minutes.
 */
export function ageMinutes(createdAt: string | Date, nowMs = Date.now()): number {
  const createdMs = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / (60 * 1000)));
}

/**
 * Format age or date.
 * If placed today: age (e.g. "4 min" / "4 د").
 * If placed on another day: short date (e.g. "Wed 11 Nov" / "الأربعاء 11 نوفمبر").
 */
export function formatAgeOrDate(
  createdAt: string | Date,
  lang: "en" | "ar",
  nowMs = Date.now()
): string {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const now = new Date(nowMs);

  const isSameDay =
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate();

  if (isSameDay) {
    const mins = ageMinutes(created, nowMs);
    if (mins < 1) return lang === "ar" ? "الآن" : "just now";
    if (mins < 60) return lang === "ar" ? `${mins} د` : `${mins} min`;
    const hours = Math.floor(mins / 60);
    return lang === "ar" ? `${hours} س` : `${hours} h`;
  }

  // Other day: e.g. "Wed 11 Nov"
  const locale = lang === "ar" ? "ar-QA" : "en-GB";
  return created.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Format time HH:MM (e.g. 09:36).
 */
export function formatTime(isoStr: string | Date): string {
  const d = typeof isoStr === "string" ? new Date(isoStr) : isoStr;
  if (Number.isNaN(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Format items into line 1, line 2, and full summary.
 */
export function itemsSummary(
  items: OrderItemLine[],
  lang: "en" | "ar"
): { line1: string; line2: string; full: string; count: number } {
  if (!items || items.length === 0) {
    return { line1: "", line2: "", full: "", count: 0 };
  }

  const formatLine = (item: OrderItemLine) => {
    const name = lang === "ar" && item.name_ar ? item.name_ar : item.name;
    const variant = lang === "ar" && item.variant_ar ? item.variant_ar : item.variant;
    const qty = `${item.quantity} × `;
    const variantPart = variant ? ` · ${variant}` : "";
    return `${qty}${name}${variantPart}`;
  };

  const line1 = formatLine(items[0]);
  const rest = items.slice(1).map(formatLine);
  const line2 = rest.join(", ");
  const full = [line1, ...rest].join(", ");
  const count = items.reduce((sum, it) => sum + (it.quantity || 1), 0);

  return { line1, line2, full, count };
}

/**
 * Next step workflow action.
 */
export function nextStep(status: string): NextStepInfo | null {
  switch (status) {
    case "new":
      return {
        nextStatus: "confirmed",
        labelEn: "Confirm order",
        labelAr: "تأكيد الطلب",
        volt: true,
      };
    case "confirmed":
      return {
        nextStatus: "ready",
        labelEn: "Mark ready",
        labelAr: "تحديد كجاهز",
        volt: true,
      };
    case "ready":
      return {
        nextStatus: "done",
        labelEn: "Mark done",
        labelAr: "تحديد كمكتمل",
        volt: true,
      };
    default:
      return null;
  }
}

/**
 * Calculate consequences of cancelling an order.
 */
export function cancelConsequences(order: {
  status: string;
  payment: string;
  total: number;
  test?: boolean;
  document?: unknown;
  lines?: OrderItemLine[];
  items?: OrderItemLine[];
}): CancelConsequences {
  const isEarly = order.status === "new" || order.status === "confirmed";
  const lines = order.lines || order.items || [];
  const restockCount = lines.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const refundDue = order.payment === "paid" && !order.test ? order.total : 0;
  const isCreditReversal = order.payment === "on_account";
  const cancelsDocument = Boolean(order.document);

  return {
    restockDefault: isEarly,
    restockCount,
    refundDue,
    isCreditReversal,
    cancelsDocument,
  };
}

/**
 * Format money in QAR from dirhams (integer, 100 = QAR 1).
 * English: "QAR 375" (or "QAR 375.50"); Arabic: "375\u00a0ر.ق".
 */
export function money(dirhams: number, lang: "en" | "ar" = "en"): string {
  const qar = Math.abs(dirhams) / 100;
  const formatted = qar.toLocaleString("en-US", {
    minimumFractionDigits: dirhams % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (lang === "ar") {
    return `${dirhams < 0 ? "-" : ""}${formatted}\u00a0ر.ق`;
  }
  const prefix = dirhams < 0 ? "-QAR " : "QAR ";
  return `${prefix}${formatted}`;
}

/**
 * Format activity timeline sentence.
 */
export function timelineSentence(
  event: {
    action: string;
    actor_name?: string;
    detail?: Record<string, unknown>;
    created_at?: string;
  },
  customerName: string,
  lang: "en" | "ar"
): string {
  const actor = event.actor_name === "Auto-reply"
    ? (lang === "ar" ? "تلقائياً" : "Automatically")
    : event.actor_name || (lang === "ar" ? "النظام" : "System");

  const detail = event.detail || {};

  switch (event.action) {
    case "placed":
      return lang === "ar"
        ? `قام ${customerName} بإنشاء الطلب`
        : `${customerName} placed the order`;
    case "took":
      return lang === "ar" ? `استلم ${actor} الطلب` : `${actor} took the order`;
    case "assigned": {
      const to = detail.to_name || detail.to || "";
      if (to) {
        return lang === "ar"
          ? `أسند ${actor} الطلب إلى ${to}`
          : `${actor} gave the order to ${to}`;
      }
      return lang === "ar"
        ? `أزال ${actor} إسناد الطلب`
        : `${actor} left the order with nobody`;
    }
    case "confirmed":
      return lang === "ar"
        ? `قام ${actor} بتأكيد الطلب`
        : `${actor} confirmed the order`;
    case "ready":
      return lang === "ar"
        ? `حدد ${actor} الطلب كجاهز`
        : `${actor} marked the order ready`;
    case "done":
      return lang === "ar"
        ? `حدد ${actor} الطلب كمكتمل`
        : `${actor} marked the order done`;
    case "paid": {
      const method = String(detail.method || "link");
      const methodMapEn: Record<string, string> = {
        cash: "cash",
        bank_transfer: "bank transfer",
        card_terminal: "card machine",
        cheque: "cheque",
        link: "link",
      };
      const methodMapAr: Record<string, string> = {
        cash: "نقداً",
        bank_transfer: "تحويل بنكي",
        card_terminal: "جهاز نقاط البيع",
        cheque: "شيك",
        link: "رابط الدفع",
      };
      const amount = typeof detail.amount === "number" ? money(detail.amount) : "";
      if (method === "link") {
        return lang === "ar"
          ? `تم الدفع عبر الرابط${amount ? `، ${amount}` : ""}.`
          : `Paid by link${amount ? `, ${amount}` : ""}.`;
      }
      const mText = (lang === "ar" ? methodMapAr[method] : methodMapEn[method]) || method;
      return lang === "ar"
        ? `تم الدفع (${mText})${amount ? `، ${amount}` : ""}. سجله ${actor}.`
        : `Paid, ${mText}${amount ? `, ${amount}` : ""}. ${actor} recorded it.`;
    }
    case "cancelled": {
      const reason = detail.reason ? ` (${detail.reason})` : "";
      const stock = detail.stock_returned
        ? (lang === "ar" ? ` · أعيدت البضاعة إلى المخزون: ${detail.stock_returned}` : ` · Stock went back: ${detail.stock_returned}`)
        : "";
      return lang === "ar"
        ? `ألغى ${actor} الطلب${reason}${stock}`
        : `${actor} cancelled the order${reason}${stock}`;
    }
    case "refund_due": {
      const amt = typeof detail.amount === "number" ? money(detail.amount) : "";
      return lang === "ar"
        ? `يستحق استرداد بقيمة ${amt}`
        : `A refund of ${amt} is due`;
    }
    case "late_payment":
      return lang === "ar"
        ? "وصل الدفع بعد انتهاء صلاحية الرابط"
        : "A payment arrived after the link ran out";
    default:
      return event.action.charAt(0).toUpperCase() + event.action.slice(1);
  }
}

/**
 * Map query params to filter object.
 */
export function queryToFilters(params: Record<string, string | undefined>): OrderFilters {
  const filters: OrderFilters = {};

  if (params.status) filters.status = params.status;
  else if (params.show) filters.status = params.show;

  if (params.payment) filters.payment = params.payment;
  if (params.mode) filters.mode = params.mode;
  if (params.assigned) filters.assigned = params.assigned;
  if (params.q) filters.q = params.q;
  if (params.sort === "oldest" || params.sort === "newest") filters.sort = params.sort;

  if (params.limit) {
    const l = parseInt(params.limit, 10);
    if (!Number.isNaN(l)) filters.limit = l;
  }
  if (params.offset) {
    const o = parseInt(params.offset, 10);
    if (!Number.isNaN(o)) filters.offset = o;
  }

  if (params.open) filters.open = params.open;
  if (params.detail) filters.detail = params.detail;
  if (params.dialog === "paid" || params.dialog === "cancel") filters.dialog = params.dialog;
  if (params.for) filters.forOrder = params.for;

  return filters;
}

/**
 * Serialize filters to query parameters.
 */
export function filtersToQuery(filters: OrderFilters): URLSearchParams {
  const q = new URLSearchParams();

  if (filters.status && filters.status !== "open") q.set("status", filters.status);
  if (filters.payment && filters.payment !== "all") q.set("payment", filters.payment);
  if (filters.mode && filters.mode !== "all") q.set("mode", filters.mode);
  if (filters.assigned && filters.assigned !== "all") q.set("assigned", filters.assigned);
  if (filters.q) q.set("q", filters.q);
  if (filters.sort && filters.sort !== "newest") q.set("sort", filters.sort);
  if (filters.limit && filters.limit !== 25) q.set("limit", String(filters.limit));
  if (filters.offset && filters.offset > 0) q.set("offset", String(filters.offset));

  if (filters.open) q.set("open", filters.open);
  if (filters.detail) q.set("detail", filters.detail);
  if (filters.dialog) q.set("dialog", filters.dialog);
  if (filters.forOrder) q.set("for", filters.forOrder);

  return q;
}
