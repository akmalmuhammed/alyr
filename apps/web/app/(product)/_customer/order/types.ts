// What the order page reads from the API (`GET /api/store/{slug}` and its companions,
// `specs/005-order-page-v2/spec.md`). Amounts are integers in dirhams; the page formats them
// with `../price.ts` and never shows the API's English `*_text` fields.

import type { Lang } from "../price";

export type { Lang };

export type Photo = {
  state: "ready" | "pending" | "failed" | "missing" | "none";
  w: number | null;
  h: number | null;
  /** The 320 px file, for a list. */
  src: string;
  /** Every size, for `srcset`. */
  srcset: string;
  /** The 800 px file. */
  medium?: string;
};

/** A sentence in both languages, from the API. */
export type Words = { en: string; ar: string };

/** One of the shop's own fields a customer may see, with its words in both languages (ALY-148). */
export type OwnField = { key: string; label: string; label_ar: string; kind: string; text: string; text_ar: string; searchable?: boolean };

export type Variant = {
  id: string;
  name: string;
  name_ar: string;
  sku: string;
  price: number;
  price_source: "group" | "normal";
  list_price: number | null;
  left: number | null;
  sold_out: boolean;
  photo?: Photo | null;
  fields?: OwnField[];
};

export type Option = { id: string; name: string; name_ar: string; price_delta: number };

export type Group = {
  id: string;
  name: string;
  name_ar: string;
  required: boolean;
  max_choices: number;
  options: Option[];
};

export type Day = { date: string; label: string; label_ar: string };

/** `quantity` on an item: the API's `qty.rules`. Quantities are exact decimals (`../qty.ts`). */
export type ItemQuantity = { measure: boolean; step: number; min: number; fractions: boolean; show_unit: boolean; chips: number[] };

export type Item = {
  id: string;
  name: string;
  name_ar: string;
  sku: string;
  /** The shop's short number for the item (ALY-136): what a customer sends in the chat. */
  code: number | null;
  category: string;
  description: string;
  description_ar: string;
  unit: string;
  pack_size: number | null;
  min_order: number;
  /** How much may be ordered at a time (ALY-149): sold by weight or volume, the step, the
   *  smallest order, whether a fraction is allowed and the quick quantities to offer. */
  quantity?: ItemQuantity;
  tags: string[];
  /** What this customer pays for the item (its own price, or the cheapest size's with `price_min`). */
  price: number;
  price_min: number;
  price_max: number | null;
  list_price: number | null;
  price_source: "group" | "normal";
  orderable: boolean;
  sold_out: boolean;
  reason: string;
  note: Words | null;
  /** How many are left, only when that is a small number worth telling. */
  left: number | null;
  daily: boolean;
  needs_choice: boolean;
  option_groups: Group[];
  variants: Variant[];
  order_for_dates?: Day[];
  cover: Photo;
  photo_count: number;
  photos?: Photo[];
  fields?: OwnField[];
};

export type Category = { name: string; name_ar: string; count: number };

export type Customer = {
  name: string;
  first_name: string;
  lang: Lang;
  can_use_account: boolean;
  has_last_order: boolean;
};

export type LinkState = { state: "none" | "ok" | "invalid" | "expired"; message: string; message_ar: string };

export type Group2 = { id: string; name: string; name_ar: string; is_default: boolean };

export type Settings = {
  sold_out_display: "grey" | "hide"; wholesale_layout: boolean; whatsapp_number: string;
  /** chat: the number runs on ALYR and the chat reads codes. link: the shop answers itself. */
  whatsapp_mode: "chat" | "link";
};

/** What the shop's type of business says about its page (`GET /api/store/{slug}` → `catalog`,
 *  specs/008): the section's name and how the items are laid out. `null` without the Catalog. */
export type Hints = {
  type: string;
  section: { name: string; name_ar: string };
  layout: { style: "menu" | "grid" | "list" | "table"; pickup_date: boolean; quick_quantity: boolean; same_as_last: boolean; show_sku: boolean };
  sold_out: "grey" | "hide";
  features?: Record<string, boolean>;
};

/** An automatic discount in words, for a quiet line on the page ("10% off orders over QAR 200"). */
export type Offer = { text: string; text_ar: string };

/**
 * What the shop's pricing features say to the page (`GET /api/store/{slug}` → `pricing`). The
 * key is absent while the shop uses none of them, and then the page shows nothing about
 * prices beyond the items'. `discounts` exists only while "Discounts and coupon codes" is on:
 * it is what lets the review show a code box (ALY-150, specs/014-pricing-pack).
 */
export type PricingHints = { discounts?: { offers: Offer[] }; delivery?: DeliveryOptions };

/**
 * One place the shop delivers to, as the order page is offered it (`pricing.delivery.zones`, only
 * while "Delivery and pickup" is on; ALY-150 part 2). `id: null` is the shop's one flat fee
 * (named "Delivery", or "Other areas" beside real zones). Amounts are dirhams, `days` run 0
 * (Sunday) to 6 and empty means every day, `cutoff` is "HH:MM". The `*_text` fields are the API's
 * sentences in both languages ("Order before 2:00 PM", "Wed 21 Oct").
 */
export type Zone = {
  id: string | null; name: string; name_ar: string; fee: number; free_over: number | null; min_order: number;
  days: number[]; days_text: string; days_text_ar: string;
  cutoff: string | null; cutoff_text: string; cutoff_text_ar: string;
  next_day: string | null; next_day_text: string | null; next_day_text_ar: string | null;
};
/** What the shop offers: collecting, delivery, and the areas. At least one of the first two is true. */
export type DeliveryOptions = { pickup: boolean; delivery: boolean; zones: Zone[] };

/** The customer's choice as the API takes it (`fulfilment` on the cart check and the order). */
export type FulfilmentBody = { mode: "pickup" | "delivery"; zone_id: string | null; address: string; note: string };
/**
 * What the shop made of the choice (`pricing.delivery` in the cart check): pickup (no fee), a
 * delivery with its fee, `free` when a fee was waived and the day, or only a `problem`
 * (code, message, message_ar) when the choice cannot be served.
 */
export type DeliveryQuote = {
  mode?: "pickup" | "delivery"; fee?: number; free?: boolean;
  zone?: { id: string | null; name: string; name_ar: string };
  address?: string; note?: string; deliver_on?: string | null; deliver_on_text?: string; deliver_on_text_ar?: string;
  problem?: { code: string; message: string; message_ar: string } | null;
};

export type Store = {
  shop: { name: string; name_ar: string; slug: string; timezone: string; catalog: boolean; whatsapp: string };
  catalog: Hints | null;
  pricing?: PricingHints;
  settings: Settings;
  group: Group2;
  categories: Category[];
  items: Item[];
  total: number;
  offset: number;
  customer: Customer | null;
  link: LinkState;
  table: string;
};

/** What changes while a customer looks (`POST /api/store/{slug}/live`). */
export type LiveItem = Pick<
  Item,
  "id" | "orderable" | "sold_out" | "reason" | "note" | "left" | "price" | "price_min" | "price_max" | "list_price" | "price_source"
> & {
  variants: Pick<Variant, "id" | "price" | "list_price" | "left" | "sold_out">[];
  order_for_dates: Day[] | null;
};

export type Live = { items: LiveItem[]; gone: string[]; group: Group2; sold_out_display: "grey" | "hide" };

/** One line of the cart check: `ok`, or a `code` and what to do about it. */
export type Checked = {
  index: number;
  item_id: string;
  quantity: number;
  variant_id: string | null;
  ok: boolean;
  unit_price?: number;
  line_total?: number;
  /** The item's unit, for a measure (so a number in the sentence can carry it). */
  unit?: string;
  /** With discounts on (ALY-150): what came off this line, and what it comes to after. */
  discount?: number;
  line_total_after?: number;
  code?: string;
  message?: string;
  message_ar?: string;
  left?: number;
  max_quantity?: number;
  old_price?: number;
  new_price?: number;
  minimum?: number;
  pack?: number;
  suggest?: number;
  next_at?: string;
  next_date?: string;
  alternatives?: { item_id: string; variant_id: string | null; name: string; name_ar: string; price: number }[];
};

/** A discount that was applied to the order: a code the customer typed, or an automatic one. */
export type AppliedDiscount = {
  id: string; kind: "coupon" | "auto"; code: string; name: string; name_ar: string;
  text: string; text_ar: string; amount: number; lines: number[];
};
/** How a code the customer typed fared: it took `amount` off, or `reason` and a sentence say why not. */
export type CouponVerdict = {
  code: string; ok: boolean; amount: number; reason?: string; message?: string; message_ar?: string;
};
/** What the order comes to, and why (`pricing` in the cart check, a refusal and a placed order). */
export type Pricing = {
  subtotal: number; discounts: AppliedDiscount[]; discount_total: number; goods: number; coupons: CouponVerdict[];
  /** What is paid: the goods after discounts and the delivery fee. */
  total?: number;
  /** Only while the shop's Delivery and pickup is on. */
  delivery?: DeliveryQuote;
};

/** `total` is what the customer pays: after any discounts. `pricing` exists only while the shop's discounts are on. */
export type Check = { ok: boolean; lines: Checked[]; total: number; pricing?: Pricing };

/**
 * A refusal from the API: a code, a sentence in both languages, and sometimes the lines. A
 * code that does not work (`coupon_*`) names it in `coupon`; both it and `total_changed` carry
 * the figures as they now are in `pricing` (and `total`).
 */
export type Refusal = {
  code: string; message: string; message_ar: string; lines?: Checked[]; coupon?: string; pricing?: Pricing; total?: number;
};

export type Placed = {
  order_id: string;
  number: number;
  total: number;
  payment: "link" | "account";
  pay_url: string | null;
  track_url?: string;
  left_out?: { name: string; name_ar: string; code: string; message: string; message_ar: string }[];
  price_changes?: { name: string; was: number; now: number }[];
  /** What came off, only while the shop's discounts are on. */
  pricing?: Pricing;
};
