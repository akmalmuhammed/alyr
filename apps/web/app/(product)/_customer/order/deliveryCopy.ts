// Every word the order page says about collecting and delivery, in English and Arabic, in one
// place (ALY-150 part 2, specs/014-pricing-pack; the Arabic is a draft until a native speaker
// has been through it, ALY-66). The components hold no text. Shown only while the shop has
// "Delivery and pickup" on. Amounts are written by `../price.ts` («QAR 15», «15 ر.ق») and put
// in an isolate here so their digits keep their order inside an Arabic sentence.

import type { Lang } from "../price";

/** Keeps an amount in one run inside a sentence of the other direction. */
const iso = (text: string) => `⁨${text}⁩`;

const en = {
  title: "How do you want to get it?",
  // ── the two ways ─────────────────────────────────────
  pickup: "Pickup",
  pickupHint: "You collect it from the shop. No fee.",
  delivery: "Delivery",
  deliveryHint: "We bring it to you.",
  pickupOnly: "Pickup only",
  pickupOnlyHint: "You collect your order from the shop. No fee.",
  deliveryOnly: "Delivery only",
  deliveryOnlyHint: "We bring your order to you.",
  // ── the areas ────────────────────────────────────────
  areaLegend: "Where do we deliver?",
  free: "Free",
  freeOver: (amount: string) => `Free over ${iso(amount)}`,
  minimum: (amount: string) => `Minimum order ${iso(amount)}`,
  deliversEvery: "Delivers every day",
  delivers: (days: string) => `Delivers ${days}`,
  oneArea: (name: string) => `Delivery to ${name}`,
  // ── the address ──────────────────────────────────────
  address: "Address",
  addressHint: "Area, street, house or building",
  note: "Note for the delivery (optional)",
  noteHint: "For example: call when you arrive.",
  // ── what is missing ──────────────────────────────────
  needMode: "Choose pickup or delivery to continue.",
  needZone: "Choose where we deliver to.",
  needAddress: "Write the address to deliver to.",
  // ── in the order's sums ──────────────────────────────
  items: "Items",
  deliveryTo: (name: string) => `Delivery to ${name}`,
  deliveryFee: "Delivery",
  feeFree: "Free",
  today: "today",
  tomorrow: "tomorrow",
  onToday: "Delivery today",
  onTomorrow: "Delivery tomorrow",
  onDay: (day: string) => `Delivery on ${day}`,
  nudge: (amount: string) => `Add ${iso(amount)} more for free delivery`,
  freeReached: (amount: string) => `Free delivery on orders over ${iso(amount)}`,
  picking: "Pickup from the shop",
  checking: "Checking…",
};

export type DeliveryCopy = typeof en;

const ar: DeliveryCopy = {
  title: "كيف تريد استلام طلبك؟",
  pickup: "الاستلام من المتجر",
  pickupHint: "تستلم طلبك من المتجر. دون رسوم.",
  delivery: "التوصيل",
  deliveryHint: "نوصّل الطلب إليك.",
  pickupOnly: "الاستلام من المتجر فقط",
  pickupOnlyHint: "تستلم طلبك من المتجر. دون رسوم.",
  deliveryOnly: "التوصيل فقط",
  deliveryOnlyHint: "نوصّل طلبك إليك.",
  areaLegend: "أين نوصّل؟",
  free: "مجاناً",
  freeOver: (amount) => `مجاني للطلبات فوق ${iso(amount)}`,
  minimum: (amount) => `الحد الأدنى للطلب ${iso(amount)}`,
  deliversEvery: "يوصّل كل يوم",
  delivers: (days) => `يوصّل ${days}`,
  oneArea: (name) => `التوصيل إلى ${name}`,
  address: "العنوان",
  addressHint: "المنطقة، الشارع، رقم المنزل أو المبنى",
  note: "ملاحظة للتوصيل (اختيارية)",
  noteHint: "مثلاً: اتصل عند وصولك.",
  needMode: "اختر الاستلام من المتجر أو التوصيل للمتابعة.",
  needZone: "اختر منطقة التوصيل.",
  needAddress: "اكتب عنوان التوصيل.",
  items: "الأصناف",
  deliveryTo: (name) => `التوصيل إلى ${name}`,
  deliveryFee: "التوصيل",
  feeFree: "مجاناً",
  today: "اليوم",
  tomorrow: "غداً",
  onToday: "التوصيل اليوم",
  onTomorrow: "التوصيل غداً",
  onDay: (day) => `التوصيل يوم ${day}`,
  nudge: (amount) => `أضف ${iso(amount)} للحصول على توصيل مجاني`,
  freeReached: (amount) => `توصيل مجاني للطلبات فوق ${iso(amount)}`,
  picking: "الاستلام من المتجر",
  checking: "جارٍ التحقق…",
};

export const D: Record<Lang, DeliveryCopy> = { en, ar };

/** "Delivery on Wed 21 Oct", "Delivery tomorrow": the API says "today", "tomorrow" or a date. */
export function dayWords(text: string | null | undefined, lang: Lang): string {
  const d = D[lang];
  const day = (text ?? "").trim();
  if (!day) return "";
  if (day === d.today) return d.onToday;
  if (day === d.tomorrow) return d.onTomorrow;
  return d.onDay(day);
}
