// Every word the Features screen says, in English and Arabic, in one place (ALY-148, D-039; the
// Arabic is a draft until a native speaker has been through it, ALY-66). The features' own
// names and descriptions come from the API already written in both languages
// (`alyr/capabilities.py`); this file holds the screen around them. Both languages are written
// against one shape, so a missing Arabic line is a type error, not a hole on a phone.
//
// Owners read "features", never anything else: no "capability", no "module", no "flag".

import type { Lang } from "./catalogCopy";

export type Place = "form" | "list" | "order_page" | "import_export" | "reports" | "chat" | "alerts" | "settings";

const en = {
  open: "Features",
  title: "Features",
  intro: "Switch features on or off to suit your business. A feature you switch off is hidden and does not apply to new items. Nothing you have already made is changed or deleted.",
  startedFrom: (name: string) => `Started from: ${name}`,
  loading: "Loading your features…",
  failed: "Something went wrong. Try again.",
  close: "Close",
  searchLabel: "Search features",
  searchPlaceholder: "Search, for example sizes or alerts",
  noMatch: (q: string) => `No feature matches “${q}”.`,
  clearSearch: "Clear search",
  changesLabel: "What this changes",
  on: "On",
  off: "Off",
  places: {
    form: "Item form", list: "Items list", order_page: "Order page", import_export: "Excel and CSV files",
    reports: "Weekly report", chat: "WhatsApp chat", alerts: "Messages to you", settings: "Settings",
  } as Record<Place, string>,
  needs: (names: string) => `Needs: ${names}`,
  neededBy: (names: string) => `Also used by: ${names}`,
  setByYou: "Set by you",
  turnedOn: (name: string) => `${name} is on`,
  turnedOff: (name: string) => `${name} is off`,
  alsoOn: (names: string) => `Also switched on, because it needs it: ${names}`,
  alsoOff: (names: string) => `Also switched off, because it needs it: ${names}`,
  soldOutLabel: "A sold-out item is",
  soldOutOptions: { grey: "Greyed out", hide: "Left out" } as Record<string, string>,
  soldOutSet: (value: string) => `Sold-out items are ${value.toLowerCase()}`,
  // name and layout
  shapeTitle: "Name and layout",
  shapeHint: "What you call this section in your workspace and on your order page, and how the order page looks.",
  nameEn: "Name in English",
  nameAr: "Name in Arabic",
  nameHint: (name: string) => `Leave empty to use “${name}”.`,
  layoutLabel: "Order page layout",
  layoutOwn: "Suits my business",
  layoutOwnHint: "The layout your type of business starts with.",
  layouts: {
    menu: ["Menu", "A photo beside each name, by category."],
    grid: ["Photo grid", "Two photos to a row. Good for products."],
    list: ["Compact list", "Names and prices, with no photos."],
    table: ["Table", "A row for each item with quick quantities. Good for a price list."],
  } as Record<string, [string, string]>,
  save: "Save name and layout",
  saving: "Saving…",
  saved: "Saved",
  coreTitle: "Always included",
  coreHint: "Every shop has these. They cannot be switched off.",
  toggle: (name: string, on: boolean) => `${name}: ${on ? "on" : "off"}`,
};

export type FeaturesCopy = typeof en;

const ar: FeaturesCopy = {
  open: "الميزات",
  title: "الميزات",
  intro: "شغّل الميزات أو أوقفها بما يناسب نشاطك. الميزة التي توقفها تختفي ولا تنطبق على الأصناف الجديدة. لا يتغير شيء مما أنشأته ولا يُحذف.",
  startedFrom: (name) => `بدأ من: ${name}`,
  loading: "جارٍ تحميل الميزات…",
  failed: "حدث خطأ. حاول مجدداً.",
  close: "إغلاق",
  searchLabel: "ابحث في الميزات",
  searchPlaceholder: "ابحث، مثلاً المقاسات أو التنبيهات",
  noMatch: (q) => `لا توجد ميزة تطابق «${q}».`,
  clearSearch: "مسح البحث",
  changesLabel: "ما الذي يتغير",
  on: "تعمل",
  off: "متوقفة",
  places: {
    form: "نموذج الصنف", list: "قائمة الأصناف", order_page: "صفحة الطلب", import_export: "ملفات Excel وCSV",
    reports: "التقرير الأسبوعي", chat: "محادثة واتساب", alerts: "رسائل إليك", settings: "الإعدادات",
  },
  needs: (names) => `تحتاج إلى: ${names}`,
  neededBy: (names) => `تستخدمها أيضاً: ${names}`,
  setByYou: "من اختيارك",
  turnedOn: (name) => `${name} تعمل`,
  turnedOff: (name) => `${name} متوقفة`,
  alsoOn: (names) => `شُغّلت أيضاً لأنها تحتاج إليها: ${names}`,
  alsoOff: (names) => `أُوقفت أيضاً لأنها تحتاج إليها: ${names}`,
  soldOutLabel: "الصنف النافد يكون",
  soldOutOptions: { grey: "باهتاً", hide: "مخفياً" },
  soldOutSet: (value) => `الأصناف النافدة: ${value}`,
  shapeTitle: "الاسم والتخطيط",
  shapeHint: "ما تسمّي به هذا القسم في مساحة عملك وعلى صفحة الطلب، وكيف تبدو صفحة الطلب.",
  nameEn: "الاسم بالإنجليزية",
  nameAr: "الاسم بالعربية",
  nameHint: (name) => `اتركه فارغاً لاستخدام «${name}».`,
  layoutLabel: "تخطيط صفحة الطلب",
  layoutOwn: "يناسب نشاطي",
  layoutOwnHint: "التخطيط الذي يبدأ به نوع نشاطك.",
  layouts: {
    menu: ["قائمة", "صورة بجانب كل اسم، حسب الفئة."],
    grid: ["شبكة صور", "صورتان في كل صف. مناسبة للمنتجات."],
    list: ["قائمة مختصرة", "أسماء وأسعار بلا صور."],
    table: ["جدول", "صف لكل صنف مع كميات سريعة. مناسب لقائمة الأسعار."],
  },
  save: "حفظ الاسم والتخطيط",
  saving: "جارٍ الحفظ…",
  saved: "تم الحفظ",
  coreTitle: "متوفرة دائماً",
  coreHint: "لدى كل متجر هذه الميزات ولا يمكن إيقافها.",
  toggle: (name, on) => `${name}: ${on ? "تعمل" : "متوقفة"}`,
};

export const FEAT: Record<Lang, FeaturesCopy> = { en, ar };
