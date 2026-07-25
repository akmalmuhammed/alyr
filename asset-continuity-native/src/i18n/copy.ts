import { useMemo } from "react";

import { useWorkspace } from "@/state/WorkspaceProvider";

const copy = {
  en: {
    home: "Home",
    assets: "Assets",
    family: "Family",
    vault: "Vault",
    everything: "Everything you own",
    privateMap: "One private continuity map",
    nextAction: "Next best action",
    continueRegister: "Continue your critical register",
    captureAsset: "Create Asset Passport",
    search: "Search",
    register: "Critical register",
    places: "Places",
    noPlaces: "No Places yet",
    noAssets: "Your register is ready for its first asset.",
    addFirst: "Create your first Passport",
    localOnly: "On this device",
    sample: "Sample workspace",
    personal: "Personal workspace",
    language: "Language",
    sync: "Sync diagnostics",
    evidence: "Papers & materials",
    viewPassport: "View Passport"
  },
  ar: {
    home: "الرئيسية",
    assets: "المقتنيات",
    family: "العائلة",
    vault: "الخزنة",
    everything: "كل ما تملكه",
    privateMap: "خريطة خاصة لاستمرارية ممتلكاتك",
    nextAction: "الخطوة التالية",
    continueRegister: "أكمل سجل المقتنيات المهمة",
    captureAsset: "أنشئ جواز مقتنى",
    search: "بحث",
    register: "السجل الأساسي",
    places: "الأماكن",
    noPlaces: "لم تُضف أماكن بعد",
    noAssets: "السجل جاهز لإضافة أول مقتنى.",
    addFirst: "أنشئ أول جواز مقتنى",
    localOnly: "على هذا الجهاز",
    sample: "مساحة تجريبية",
    personal: "مساحتي الخاصة",
    language: "اللغة",
    sync: "حالة المزامنة",
    evidence: "الأوراق والمواد",
    viewPassport: "عرض الجواز"
  }
} as const;

export function useCopy() {
  const { workspace } = useWorkspace();
  const language = workspace?.language ?? "en";
  return useMemo(
    () => ({
      language,
      rtl: language === "ar",
      text: copy[language]
    }),
    [language]
  );
}
