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

export type Store = {
  shop: { name: string; name_ar: string; slug: string; timezone: string; catalog: boolean; whatsapp: string };
  catalog: Hints | null;
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

export type Check = { ok: boolean; lines: Checked[]; total: number };

/** A refusal from the API: a code, a sentence in both languages, and sometimes the lines. */
export type Refusal = { code: string; message: string; message_ar: string; lines?: Checked[] };

export type Placed = {
  order_id: string;
  number: number;
  total: number;
  payment: "link" | "account";
  pay_url: string | null;
  track_url?: string;
  left_out?: { name: string; name_ar: string; code: string; message: string; message_ar: string }[];
  price_changes?: { name: string; was: number; now: number }[];
};
