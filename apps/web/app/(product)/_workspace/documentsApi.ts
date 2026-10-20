// What the Documents screens read and write: the API's shapes (`/api/documents`, specs 011, 013
// and 014), and one way to turn a refusal into a sentence in the person's language. The fetch
// helper, the error type and the money-free pieces are the Catalog's (`catalogApi.ts`): the
// workspace has one way to call the API.

import { ApiError, api } from "./catalogApi";
import type { Lang } from "./documentsLogic";

export { ApiError, api };

export type Pair = { en: string; ar: string };

export type KindInfo = {
  key: string; prefix: string; needs_customer: boolean; needs_registration: boolean;
  payments: "full" | "deposit" | "optional" | "none"; second_date: "due_date" | "valid_until" | null;
  creditable: boolean;
};
export type Access = {
  role: string; can_manage: boolean; can_issue: boolean; can_draft: boolean; can_credit: boolean;
  can_record_payments: boolean;
};
export type Branch = {
  branch_key: string; name: string; name_ar: string; code: string; address: string;
  address_ar: string; phone: string; active: boolean;
};
export type Meta = {
  kinds: KindInfo[]; layouts: string[]; languages: string[]; cash_rounding_steps: number[];
  units: string[]; payment_methods: string[];
  currencies: Record<string, { exponent: number; symbol_ar: string }>;
  retention: { years: number; confirmed: boolean };
  access: Access;
  /** What the form starts from: the shop's own settings that anyone on the team may know. */
  defaults: {
    currency: string; tax_enabled: boolean; tax_rate_bp: number; cash_rounding_minor: number;
    languages: string; default_audience: string; layout: string; show_sku: boolean;
    has_registration: boolean; show_alyr_mark: boolean;
    /** The shop's usual note and terms for each kind, added to a paper that has none of its own. */
    notes: Record<string, Partial<Pair>>; terms: Record<string, Partial<Pair>>;
    has_catalog: boolean;
  };
};

export type DeliveryInfo = {
  state: "none" | "queued" | "sent" | "delivered" | "not_delivered"; count: number;
  last: null | { channel: string; to: string; state: string; reason: string; created_at: string };
};
export type Row = {
  id: string; kind: string; status: "draft" | "issued" | "void"; number: string | null;
  issue_date: string | null; due_date: string | null; currency: string; currency_exponent: number;
  total_minor: number; paid_minor: number; balance_minor: number; customer_name: string;
  customer_name_ar: string; created_at: string; created_by: string; branch: string; source: string;
  related_number: string | null; delivery: DeliveryInfo;
};
export type Totals = {
  count: number;
  money: { currency: string; exponent: number; total_minor: number; credited_minor: number; owing_minor: number }[];
};
export type ListAnswer = {
  documents: Row[]; next_cursor: string | null; has_more: boolean; totals?: Totals; total?: number;
};

export type Customer = {
  name?: string; name_ar?: string; company?: string; phone?: string; email?: string;
  registration_number?: string; tax_id?: string; address?: string; address_ar?: string;
};
export type Line = {
  position?: number; description: string; description_ar: string; sku: string; quantity: string;
  unit: string; unit_price_minor: number; discount_minor: number; tax_rate_bp: number;
  line_net_minor?: number; tax_minor?: number; line_total_minor?: number;
};
export type RecordedPayment = {
  id: string; amount_minor: number; method: string; reference: string; recorded_by: string;
  recorded_at: string; receipt_document_id: string | null;
};
export type Related = { id: string; kind: string; number: string | null; status: string };
export type Detail = {
  id: string; kind: string; status: "draft" | "issued" | "void"; audience: string; languages: string;
  layout: string; currency: string; currency_exponent: number; number: string | null;
  series_key: string | null; issued_at: string | null; issue_date: string | null;
  due_date: string | null; customer: Customer; contact_id: string | null; branch: string;
  seller: null | {
    name: string; name_ar: string; commercial_registration: string; tax_id: string; address: string;
    address_ar: string; phone: string; email: string; registered: boolean;
    branch?: { key: string; name: string; name_ar: string };
  };
  totals: {
    gross_minor: number; discount_minor: number; tax_minor: number; rounding_minor: number;
    total_minor: number; paid_minor: number; balance_minor: number;
  };
  /** As of now: the paper's payments plus those recorded by hand since (the paper never changes). */
  now: { paid_minor: number; balance_minor: number };
  payments: { method: string; amount_minor: number; reference: string }[];
  recorded_payments: RecordedPayment[];
  notes: Partial<Pair>; terms: Partial<Pair>; reason: string; source: string; source_ref: string;
  source_info: null | { kind: string; id: string; number: number | null };
  related: Related | null; credit_notes: { id: string; number: string; total_minor: number; issue_date: string }[];
  children: { id: string; kind: string; number: string | null; status: string; total_minor: number; issue_date: string | null }[];
  voided_by: null | { id: string; number: string };
  lines: Line[];
  content_hash: string | null; pdf: null | { sha256: string; bytes: number };
  created_by: string; created_at: string; issued_by: string | null;
  warnings: { code: string; en: string; ar: string }[];
  delivery: DeliveryInfo;
  retention: null | { years: number; confirmed: boolean; keep_until: string };
  /** The invoice's payment link, when it has one (ALY-141). */
  payment_link: null | { url: string; amount_minor: number; status: "pending" | "paid" | "expired" };
};
export type Delivery = {
  id: string; channel: "whatsapp" | "email"; trigger: "auto" | "staff"; to: string; language: string;
  state: string; reason: string; requested_by: string; created_at: string; updated_at: string;
};
export type ActivityRow = { action: string; detail: Record<string, unknown>; actor: string; at: string };

export type Settings = {
  business_name: string; business_name_ar: string; commercial_registration: string; tax_id: string;
  licence_number: string; address: string; address_ar: string; phone: string; email: string;
  bank_details: string; header_en: string; header_ar: string; footer_en: string; footer_ar: string;
  tax_enabled: boolean; show_sku: boolean; show_discounts: boolean; show_customer_tax_id: boolean;
  show_bank: boolean; show_signature: boolean; show_alyr_mark: boolean; agents_may_issue: boolean;
  auto_receipt_on_payment: boolean; auto_invoice_credit_sales: boolean; auto_deposit_receipt: boolean;
  auto_send_whatsapp: boolean; auto_send_email: boolean; agents_may_record_payments: boolean;
  languages: string; default_audience: string; layout: string; send_mode: "automatic" | "manual";
  currency: string; tax_rate_bp: number; cash_rounding_minor: number; brand_color: string | null;
  terms: Record<string, Partial<Pair>>; notes: Record<string, Partial<Pair>>;
  logo_sha256: string | null; stamp_sha256: string | null; has_logo: boolean; has_stamp: boolean;
  updated_at: string; updated_by: string;
};
export type Series = {
  kind: string; series_key: string; prefix: string; pad: number; yearly_reset: boolean;
  number_year: number | null; last_number: number; next_number: string;
};
export type SettingsChange = { action: string; detail: { changes?: { field: string; from?: unknown; to?: unknown }[]; [k: string]: unknown }; actor: string; at: string };

export type CustomerHit = {
  id: string; name: string; name_ar?: string; company?: string; phone: string | null; email: string;
  lang: string; registration_number?: string; tax_id?: string; address?: string; address_ar?: string;
  price_group: null | { name: string; name_ar: string };
};
/** A customer in the book of the shop's customers (`/api/documents/customers/all`). The money
 *  and the documents are for owners and admins only. */
export type CustomerRow = {
  id: string; name: string; name_ar: string; company: string; phone: string; email: string;
  lang: string; registration_number: string; tax_id: string; address: string; address_ar: string;
  documents?: number; owing_minor?: number; last_at?: string | null;
  recent?: { id: string; kind: string; number: string | null; status: string; total_minor: number;
    currency: string; currency_exponent: number; issue_date: string | null; owing_minor: number }[];
};
export type SavedLine = {
  id: string; name: string; name_ar: string; unit: string; price_minor: number; uses: number;
  last_used_at: string | null;
};
/** What "AC repair 500 for Ahmed 5551 2345" was read as (`POST /api/documents/quick`). */
export type QuickRead = {
  recognised: boolean; kind?: "invoice" | "receipt"; amount_minor?: number | null;
  description?: string; name?: string; phone?: string; method?: string; problems?: string[];
  numbers?: string[]; customer?: CustomerHit | null; candidates?: CustomerHit[];
};
export type CatalogLine = {
  item_id: string; variant_id: string | null; code: number | null; sku: string; description: string;
  description_ar: string; unit: string; unit_price_minor: number; group_price: boolean;
};

/** The draft the form sends (`DraftIn` in the API). */
export type DraftBody = {
  kind: string; branch: string; due_date: string | null; customer: Customer; contact_id: string | null;
  lines: { description: string; description_ar: string; sku: string; quantity: string; unit: string;
    unit_price_minor: number; discount_minor: number; tax_rate_bp: number }[];
  payments: { method: string; amount_minor: number; reference: string }[];
  notes: Pair; terms: Pair; languages?: string; layout?: string;
};

// ── refusals, in the person's language ──────────────────────

/** What the API said about a refusal: its code, the words in both languages, and the field. */
export type Refusal = { code: string; en: string; ar: string; field: string; status: number };

export function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof ApiError)) return null;
  const data = (error.detail ?? {}) as { detail?: unknown; code?: string; message_ar?: string; field?: string };
  const inner = typeof data.detail === "object" && data.detail ? (data.detail as { code?: string; message?: string; message_ar?: string; field?: string }) : null;
  return {
    code: error.code || String(inner?.code ?? data.code ?? ""),
    en: error.message || String(inner?.message ?? ""),
    ar: String((error as ApiError & { ar?: string }).ar ?? inner?.message_ar ?? data.message_ar ?? ""),
    field: String(inner?.field ?? data.field ?? ""),
    status: error.status,
  };
}

/** A refusal as a sentence: the API's own words in the person's language (they are written for
 *  this: specific, and with the way forward), else the screen's general line. */
export function sayRefusal(error: unknown, lang: Lang, fallback: { failed: string; offline: string; forbidden: string; gone: string }): string {
  const r = refusalOf(error);
  if (!r) return fallback.failed;
  if (r.code === "offline") return fallback.offline;
  if (r.status === 403 && !r.code && !r.en) return fallback.forbidden;
  if (r.status === 404 && !r.code && !r.en) return fallback.gone;
  const words = lang === "ar" ? r.ar : r.en;
  return words && words.length < 400 ? words : fallback.failed;
}

/** A fresh key for one attempt to issue, send or record something; the same key is sent again
 *  when the person retries after a dropped connection, so the document is made once. */
export function newKey(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return `${prefix}-${random}`.slice(0, 80);
}

export function pdfUrl(id: string, options: { layout?: string; download?: boolean } = {}): string {
  const p = new URLSearchParams();
  if (options.layout) p.set("layout", options.layout);
  if (options.download) p.set("download", "true");
  const query = p.toString();
  return `/api/documents/${id}/pdf${query ? `?${query}` : ""}`;
}

export function pageUrl(id: string, page: number, width: number, layout?: string): string {
  const p = new URLSearchParams({ format: "png", page: String(page), width: String(width) });
  if (layout) p.set("layout", layout);
  return `/api/documents/${id}/pdf?${p.toString()}`;
}
