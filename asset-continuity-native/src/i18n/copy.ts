import { useMemo } from "react";

import { useLocale } from "@/i18n/LocaleProvider";

const englishCopy = {
  // Existing keys remain available while screens move to the revised navigation.
  home: "Home",
  assets: "Assets",
  family: "Family",
  vault: "Vault",
  everything: "Everything you own",
  privateMap: "One private continuity map",
  nextAction: "Next best action",
  continueRegister: "Continue your critical register",
  captureAsset: "Create Item Passport",
  search: "Search",
  register: "Critical register",
  places: "Places",
  noPlaces: "No Places yet",
  noAssets: "Your register is ready for its first item.",
  addFirst: "Create your first Passport",
  localOnly: "On this device",
  sample: "Sample workspace",
  personal: "Personal workspace",
  language: "Language",
  sync: "Sync diagnostics",
  evidence: "Papers & materials",
  viewPassport: "View Passport",

  // Canonical consumer navigation.
  today: "Today",
  spaces: "Spaces",
  navToday: "Today",
  navTodayA11y: "Today. Review priorities and continue documenting.",
  navItems: "Assets",
  navItemsA11y: "Assets. Browse items and places.",
  navFamily: "Family",
  navFamilyA11y: "Family. Review household members and access.",
  navSearch: "Search",
  navVault: "Vault",
  navVaultA11y: "Vault. Review proof, recovery, privacy and sync.",

  // Canonical consumer nouns.
  place: "Place",
  items: "Items",
  item: "Item",
  proof: "Proof"
} as const;

export type CopyKey = keyof typeof englishCopy;

const arabicCopy = {
  home: "الرئيسية",
  assets: "الأصول",
  family: "العائلة",
  vault: "الخزنة",
  everything: "كل ما تملكه",
  privateMap: "خريطة خاصة تحفظ كل ما تملكه",
  nextAction: "الخطوة التالية",
  continueRegister: "واصل توثيق مقتنياتك المهمة",
  captureAsset: "أنشئ جوازًا لغرض",
  search: "بحث",
  register: "سجل المقتنيات المهمة",
  places: "الأماكن",
  noPlaces: "لم تُضف أي مكان بعد",
  noAssets: "سجلك جاهز لإضافة أول غرض.",
  addFirst: "أنشئ أول جواز لغرض",
  localOnly: "على هذا الجهاز",
  sample: "مساحة تجريبية",
  personal: "مساحتي الخاصة",
  language: "اللغة",
  sync: "حالة المزامنة",
  evidence: "المستندات والإثباتات",
  viewPassport: "عرض الجواز",

  today: "اليوم",
  spaces: "المساحات",
  navToday: "اليوم",
  navTodayA11y: "اليوم. راجع الأولويات وواصل التوثيق.",
  navItems: "الأصول",
  navItemsA11y: "الأصول. تصفّح أغراضك والأماكن التي تحفظها.",
  navFamily: "الأسرة",
  navFamilyA11y: "الأسرة. راجع الأعضاء وصلاحيات الوصول.",
  navSearch: "بحث",
  navVault: "الخزنة",
  navVaultA11y: "الخزنة. راجع الإثباتات والاستعادة والخصوصية والمزامنة.",

  place: "مكان",
  items: "الأغراض",
  item: "غرض",
  proof: "إثبات"
} as const satisfies Record<CopyKey, string>;

export const COPY = {
  en: englishCopy,
  ar: arabicCopy
} as const;

export function useCopy() {
  const { language, locale, ready, rtl, setLanguage } = useLocale();
  return useMemo(
    () => ({
      language,
      locale,
      ready,
      rtl,
      setLanguage,
      text: COPY[language]
    }),
    [language, locale, ready, rtl, setLanguage]
  );
}
