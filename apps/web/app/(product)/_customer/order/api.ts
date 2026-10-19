// The order page's calls (`apps/api/src/alyr/routes/store.py`). A refusal comes back as a
// `Refusal` (a code and a sentence in both languages), so the page can show the API's own
// words in the customer's language.

import type { Check, FulfilmentBody, Item, Live, Placed, Refusal, Store } from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, readonly refusal: Refusal | null) {
    super(refusal?.message ?? `HTTP ${status}`);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, null);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail;
    throw new ApiError(response.status, detail && typeof detail === "object" && "code" in detail ? (detail as Refusal) : null);
  }
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

export type Wanted = { q?: string; category?: string | null; offset?: number; limit?: number };

// The customer's link goes in a header, not in the address, so no request log of ours holds it.
// A token is plain ASCII; anything else cannot be a header (fetch would throw), and cannot be
// ours, so it is sent as one the API will call invalid.
const headerToken = (token: string) => (/^[\w.-]{1,200}$/.test(token) ? token : "invalid");
const asCustomer = (token: string | null): RequestInit => (token ? { headers: { "x-order-link": headerToken(token) } } : {});

export function loadStore(slug: string, token: string | null, table: string, wanted: Wanted = {}): Promise<Store> {
  const query = new URLSearchParams();
  if (table) query.set("table", table);
  if (wanted.q) query.set("q", wanted.q);
  if (wanted.category !== undefined && wanted.category !== null) query.set("category", wanted.category);
  if (wanted.offset) query.set("offset", String(wanted.offset));
  query.set("limit", String(wanted.limit ?? 48));
  return call<Store>(`/api/store/${slug}?${query}`, asCustomer(token));
}

export const loadItem = (slug: string, id: string, token: string | null) =>
  call<{ item: Item }>(`/api/store/${slug}/items/${id}`, asCustomer(token)).then((r) => r.item);

export const loadLive = (slug: string, ids: string[], token: string | null) =>
  call<Live>(`/api/store/${slug}/live`, post({ ids, token }));

export type CartBody = {
  items: { product_id: string; quantity: number; variant_id?: string | null; option_ids?: string[]; expected_price?: number }[];
  for_date?: string | null;
  /** The codes the customer typed (only while the shop's discounts are on; at most 3). */
  coupons?: string[];
  /** How the order reaches the customer (only while the shop's Delivery and pickup is on). The
   *  check needs the mode and the area only; the order also takes the address and the note. */
  fulfilment?: Partial<FulfilmentBody>;
};

export const checkCart = (slug: string, body: CartBody, token: string | null) =>
  call<Check>(`/api/store/${slug}/cart/check`, post({ ...body, token }));

/** `expected_total` is the total the customer was shown: if the order now comes to something else it is refused with the new figures. */
export const placeOrder = (
  slug: string, body: CartBody & { payment: "link" | "account"; table?: string; expected_total?: number }, token: string,
) =>
  call<Placed>(`/api/store/${slug}/orders`, post({ ...body, token }));

export const orderAgain = (slug: string, payment: "link" | "account", token: string) =>
  call<Placed>(`/api/store/${slug}/orders/repeat`, post({ payment, token }));
