// The words the redesigned shell says around a screen, in English and Arabic: what is not already
// in `shellCopy.ts` (the navigation's own labels come from the API, the search and sign-out words
// from the shared shell copy). The screens' words live beside each screen.

import type { Lang } from "./lang";

export const NS = {
  en: {
    skip: "Skip to the page",
    mainNav: "Main",
    classic: "Classic view",
    classicHint: "Open this section in the classic look",
    theme: (name: string) => `Theme: ${name}. Change it`,
    themes: { auto: "Auto", light: "Light", dark: "Dark" },
    searchTitle: "Search screens and actions",
    closeSearch: "Close",
    demo: "Demo",
    accountViews: { account: "Your account", privacy: "Data and privacy" },
    topBar: "Top bar",
  },
  ar: {
    skip: "انتقل إلى الصفحة",
    mainNav: "الرئيسية",
    classic: "العرض السابق",
    classicHint: "افتح هذا القسم بالشكل السابق",
    theme: (name: string) => `السمة: ${name}. غيّرها`,
    themes: { auto: "تلقائي", light: "فاتح", dark: "داكن" },
    searchTitle: "ابحث في الشاشات والإجراءات",
    closeSearch: "إغلاق",
    demo: "عرض تجريبي",
    accountViews: { account: "حسابك", privacy: "البيانات والخصوصية" },
    topBar: "الشريط العلوي",
  },
} satisfies Record<Lang, unknown>;
