// "Order on WhatsApp" (ALY-136, D-039): the message a customer's order becomes, and the link that
// opens WhatsApp with it already typed. No screen in this file, so each rule can be tested.
//
// The link is `https://wa.me/<number>?text=<the message, UTF-8 percent-encoded>`. The message
// has two shapes, chosen by the shop (Catalog settings, "How customers order"):
//
//   chat  The shop's number is connected to ALYR, and the chat reads item codes
//         (`modules/items/codes.py`). The message is kept under 140 characters, the limit Meta
//         states for its short links and QR codes, with the codes in the middle so a customer
//         who edits the start or the end does not break it:
//           Hello Al Noor, I would like to order (item codes): #214 x2, #305. Thank you!
//         `#214` is a code however the words around it change. A longer order goes in several
//         messages, each one a part; the chat adds them to one draft order.
//   link  The shop keeps its own number and a person reads the message. It is laid out to be
//         read at a glance: one line for each item with its code, quantity and price, then
//         the total and the customer's name when known. It is longer than 140 characters for
//         more than a couple of items (the limit is for QR codes and short links, which this
//         is not); past about 900 characters it is split in parts.
//
// The same pure functions are used by the item sheet, the bar under the list and the review.

import { fmtQty, fmtQtyUnit, lineTotal, milli } from "../qty.ts";

export type Lang = "en" | "ar";
export type Mode = "chat" | "link";

export const CHAT_LIMIT = 140;
export const LINK_LIMIT = 900;

/** One thing in the order, as the message needs it. */
export type WaLine = {
  code: number | null;
  qty: number;
  name: string;
  name_ar: string;
  /** The size or colour, in both languages, if there is one. */
  variant: string;
  variant_ar: string;
  /** The extras chosen, in both languages. */
  extras: { name: string; name_ar: string }[];
  /** The price of one, size and extras included, in dirhams. */
  unit: number;
  /** The item's unit (kg, ml...), so a measure's quantity can say it. */
  unitKey?: string;
};

export type WaOrder = {
  shop: { name: string; name_ar: string };
  lang: Lang;
  mode: Mode;
  lines: WaLine[];
  /** How the page writes an amount (`formatPrice` bound to the language). */
  money: (dirhams: number) => string;
  customer?: string;
  table?: string;
};

export type WaPart = { text: string; href: string; items: number };
type Piece = { text: string; items: number };

const pick = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar || en : en || ar);

/** The link that opens WhatsApp on `number` (digits with the country code) with `text` typed. */
export function waHref(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** A name the chat can safely read around: three or more digits in a row would look like a code. */
function safeName(name: string): string {
  return /\d{3,}/.test(name) ? "" : name.trim();
}

const clip = (text: string, size: number) => (text.length <= size ? text : `${text.slice(0, size - 1)}…`);

// ── chat: codes only ──────────────────────────────────────

function chatToken(line: WaLine, lang: Lang, withHint: boolean): string {
  const hint = withHint ? pick(lang, line.variant, line.variant_ar).replace(/[()]/g, "").trim() : "";
  // A quantity other than one is written after the code, `x2` or `x0.5` (Western digits, a point).
  return `#${line.code}${hint ? ` (${clip(hint, 14)})` : ""}${milli(line.qty) !== 1000 ? ` x${fmtQty(line.qty)}` : ""}`;
}

/** The templates, richest first. `{shop}` and `{codes}` are filled in; the first that fits wins. */
function chatTemplates(lang: Lang, shop: string): { head: string; tail: string; hints: boolean }[] {
  const name = clip(shop, 30);
  if (lang === "ar") {
    return [
      { head: name ? `مرحباً ${name}، أرغب بطلب (أكواد الأصناف): ` : "أرغب بطلب (أكواد الأصناف): ", tail: ". شكراً", hints: true },
      { head: name ? `مرحباً ${name}، أرغب بطلب (أكواد الأصناف): ` : "أرغب بطلب (أكواد الأصناف): ", tail: ".", hints: false },
      { head: "طلب (أكواد الأصناف): ", tail: "", hints: false },
      { head: "طلب: ", tail: "", hints: false },
    ];
  }
  return [
    { head: name ? `Hello ${name}, I would like to order (item codes): ` : "I would like to order (item codes): ", tail: ". Thank you!", hints: true },
    { head: name ? `Hello ${name}, I would like to order (item codes): ` : "I would like to order (item codes): ", tail: ".", hints: false },
    { head: "Order (item codes): ", tail: "", hints: false },
    { head: "Order: ", tail: "", hints: false },
  ];
}

function chatParts(order: WaOrder): Piece[] {
  const lines = order.lines.filter((l) => l.code !== null && l.qty > 0);
  if (lines.length === 0) return [];
  const sep = order.lang === "ar" ? "، " : ", ";
  const shop = safeName(pick(order.lang, order.shop.name, order.shop.name_ar));
  const make = (group: WaLine[], t: { head: string; tail: string; hints: boolean }) =>
    `${t.head}${group.map((l) => chatToken(l, order.lang, t.hints)).join(sep)}${t.tail}`;
  const templates = chatTemplates(order.lang, shop);
  for (const t of templates) {
    const text = make(lines, t);
    if (text.length <= CHAT_LIMIT) return [{ text, items: lines.length }];
  }
  // Too long for one message even in the shortest form: parts, each numbered, each with the
  // shortest head. The chat puts them in one draft order.
  const parts: WaLine[][] = [];
  const shortest = templates[templates.length - 1];
  const reserve = " (9/9)".length;
  let current: WaLine[] = [];
  for (const line of lines) {
    const tryGroup = [...current, line];
    if (current.length > 0 && make(tryGroup, shortest).length + reserve > CHAT_LIMIT) {
      parts.push(current);
      current = [line];
    } else current = tryGroup;
  }
  if (current.length) parts.push(current);
  return parts.map((group, i) => ({
    text: `${shortest.head.trimEnd().replace(/:$/, "")} (${i + 1}/${parts.length}): ${group.map((l) => chatToken(l, order.lang, false)).join(sep)}`,
    items: group.length,
  }));
}

// ── link: for a person ────────────────────────────────────

function linkLine(line: WaLine, order: WaOrder): string {
  const name = pick(order.lang, line.name, line.name_ar);
  const extras = line.extras.map((e) => pick(order.lang, e.name, e.name_ar));
  const detail = [pick(order.lang, line.variant, line.variant_ar), ...extras].filter(Boolean).join(order.lang === "ar" ? "، " : ", ");
  const code = line.code !== null ? `#${line.code} ` : "";
  // The quantity carries its unit when it is a measure: `x0.5 kg`.
  const amount = line.unitKey ? fmtQtyUnit(line.qty, line.unitKey, order.lang) : fmtQty(line.qty);
  return `${code}${name}${detail ? ` (${detail})` : ""} x${amount} - ${order.money(lineTotal(line.unit, line.qty))}`;
}

function linkParts(order: WaOrder): Piece[] {
  const lines = order.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) return [];
  const ar = order.lang === "ar";
  const shop = pick(order.lang, order.shop.name, order.shop.name_ar);
  const total = lines.reduce((sum, l) => sum + lineTotal(l.unit, l.qty), 0);
  const head = (n: number, of: number) => {
    const part = of > 1 ? ` (${n}/${of})` : "";
    return ar ? `طلب من صفحة ${shop}${part}` : `Order from the ${shop} page${part}`;
  };
  const foot: string[] = [];
  if (order.table) foot.push(ar ? `طاولة ${order.table}` : `Table ${order.table}`);
  if (order.customer) foot.push(ar ? `الاسم: ${order.customer}` : `Name: ${order.customer}`);
  const totalLine = ar ? `الإجمالي: ${order.money(total)}` : `Total: ${order.money(total)}`;
  const groups: WaLine[][] = [];
  let current: WaLine[] = [];
  let size = head(1, 9).length + totalLine.length + foot.join("\n").length + 8;
  for (const line of lines) {
    const length = linkLine(line, order).length + 1;
    if (current.length > 0 && size + length > LINK_LIMIT) {
      groups.push(current);
      current = [];
      size = head(1, 9).length + totalLine.length + foot.join("\n").length + 8;
    }
    current.push(line);
    size += length;
  }
  if (current.length) groups.push(current);
  return groups.map((group, i) => {
    const last = i === groups.length - 1;
    const body = group.map((l) => linkLine(l, order));
    // Every part carries the whole order's total on its last line only.
    return {
      text: [head(i + 1, groups.length), ...body, ...(last ? [totalLine, ...foot] : [])].join("\n"),
      items: group.length,
    };
  });
}

/** The messages for an order, each with the link that opens WhatsApp on it. One part unless
 *  the order is too long for one message. No lines (or no line with a code, in chat mode) gives none. */
export function waParts(number: string, order: WaOrder): WaPart[] {
  const pieces = order.mode === "chat" ? chatParts(order) : linkParts(order);
  return pieces.map(({ text, items }) => ({ text, href: waHref(number, text), items }));
}
