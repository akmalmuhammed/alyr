// Types and helpers shared by the back-office screens (D-027, D-032). Amounts are in
// dirhams, as the API sends them: 100 is QAR 1.
import type { Access } from "./ClientAccess";

export type Text = { en: string; ar: string };

export type Business = {
  id: string; name: string; slug: string; type: string; type_name: string; area: string;
  way: string; modules: string[]; products: string[]; onboarding_step: string; onboarded: boolean;
  steps: string[]; whatsapp_connected: boolean; open_requests: number; members: number;
  created_at: string; price_mode: string;
};

export type Kind = "monthly" | "one_time";
export type Line = {
  id?: string; business_id: string | null; business?: string; item_key: string | null;
  name: string; name_ar: string; kind: Kind; quantity: number; unit_price: number;
};
export type Totals = {
  monthly_subtotal: number; discount: number; monthly_total: number; period_total: number;
  one_time_total: number; monthly_total_text: string; one_time_total_text: string;
};
export type Quote = {
  id: string; number: number; status: "draft" | "published" | "accepted" | "superseded" | "withdrawn";
  period_months: number; discount_pct: number; show_promise: boolean; note: string;
  updated_at: string; updated_by: string; published_at: string | null; accepted_at: string | null;
  accepted_by: string; lines: Line[]; totals: Totals;
};
// A lead's plan (ALY-216): the client has no business yet; this is what it will become.
export type Prospect = { type: string; name_ar: string; area: string };
// A sales link for a lead, and what came of it (ALY-216). `url` only while it is live.
export type SalesLinkState = {
  id: string; state: "live" | "expired" | "revoked" | "used"; created_at: string; created_by: string;
  expires_at: string; opens: number; first_opened_at: string | null; last_opened_at: string | null;
  verified_at: string | null; claimed_at: string | null; business: string; revoked_at: string | null;
  revoked_by: string; revoked_reason: "" | "by_hand" | "replaced" | "email_changed"; url: string | null;
};
export type ClientSummary = {
  id: string; name: string; contact_name: string; contact_email: string; contact_phone: string;
  note: string; price_mode: "automatic" | "prepared" | null; created_at: string;
  prospect: Prospect | null;
  // Where the plan stood at the last hourly check (ALY-218); '' before the first.
  billing_state?: string; cancels_on?: string | null;
  businesses: Business[];
  quote: { id: string; number: number; status: Quote["status"]; totals: Totals } | null;
};
export type ClientDetail = Omit<ClientSummary, "quote"> & {
  quotes: Quote[]; draft_preview: Line[]; effective_price_mode: "automatic" | "prepared";
  // Whether the client's products are open, and what they paid (ALY-212, D-051).
  access?: Access;
};

export type Item = {
  key: string; name: string; name_ar: string; kind: Kind; price: number; price_text: string;
  // US cents for a card payment through Paddle (D-074); null: the riyal price at the peg.
  price_usd: number | null;
  applies: string; active: boolean; sort: number; updated_at: string; updated_by: string;
};
export type TypeRow = {
  key: string; name: string; name_ar: string; icon: string;
  availability: "self_serve" | "with_alyr" | "hidden"; price_mode: "automatic" | "prepared";
  can_self_serve: boolean;
};
export type Pricing = {
  items: Item[]; types: TypeRow[]; promise: Text;
  products: { key: string; name: string; status: string }[]; modules: { key: string; name: string }[];
};

export async function api<T>(url: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T; error: string }> {
  const response = await fetch(url, {
    method, cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  const detail = (data as { detail?: unknown }).detail;
  const said = detail && typeof detail === "object" ? (detail as { message?: unknown }).message : undefined;
  const error = response.ok ? "" : typeof detail === "string" ? detail : typeof said === "string" ? said : "That did not work. Check the fields.";
  return { ok: response.ok, status: response.status, data: data as T, error };
}

export function qar(dirhams: number): string {
  const sign = dirhams < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(dirhams) / 100);
  const part = Math.abs(dirhams) % 100;
  return `${sign}QAR ${whole.toLocaleString("en-US")}${part ? `.${String(part).padStart(2, "0")}` : ""}`;
}

// QAR as typed (for example "449" or "12.50") to dirhams; NaN if it is not a number.
export function toDirhams(value: string): number {
  const n = Number(value.replace(/,/g, "").trim());
  return value.trim() === "" || Number.isNaN(n) ? Number.NaN : Math.round(n * 100);
}

export function fromDirhams(dirhams: number): string {
  return Number.isNaN(dirhams) ? "" : (dirhams / 100).toString();
}

// The same sums the API makes, so the editor shows the total before it is saved.
export function totals(lines: Line[], periodMonths: number, discountPct: number) {
  const sum = (kind: Kind) => lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const monthly = Math.max(sum("monthly"), 0);
  const discount = Math.round((monthly * discountPct) / 100);
  const monthlyTotal = monthly - discount;
  return { monthly, discount, monthlyTotal, periodTotal: monthlyTotal * periodMonths, once: Math.max(sum("one_time"), 0) };
}

export const STEP_NAME: Record<string, string> = {
  services: "What you offer", hours: "Hours and rules", try: "Try it", assisted: "Setup with ALYR",
  plan: "Plan", golive: "Go live",
};

export function appliesLabel(applies: string, pricing?: Pick<Pricing, "products" | "modules">): string {
  if (applies === "each_business") return "Every business";
  if (applies === "each_client") return "Once per client";
  if (applies === "manual") return "Added by hand";
  if (applies === "extra_product") return "Each product a business adds beyond its first";
  const [kind, key] = applies.split(":");
  const name = (kind === "product" ? pricing?.products : pricing?.modules)?.find((x) => x.key === key)?.name ?? key;
  return kind === "product" ? `Businesses using ${name}` : `Businesses with ${name} on`;
}

export const STATUS_LABEL: Record<Quote["status"], string> = {
  draft: "Draft · only ALYR sees it", published: "Published · waiting for the owner", accepted: "Accepted",
  superseded: "Replaced by a newer price", withdrawn: "Withdrawn",
};
