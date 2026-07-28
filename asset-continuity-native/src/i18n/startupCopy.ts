import { useMemo } from "react";

import { useLocale } from "@/i18n/LocaleProvider";

export const STARTUP_COPY = {
  en: {
    application: "Starting ALYR",
    workspace: "Preparing your private workspace",
    fontErrorEyebrow: "TEXT RECOVERY",
    fontErrorTitle: "Continue with system text",
    fontErrorBody:
      "ALYR's custom type did not load. Your records are unaffected; continue now and restart later to restore the intended type.",
    fontErrorAction: "Continue to ALYR"
  },
  ar: {
    application: "جارٍ تشغيل ALYR",
    workspace: "جارٍ تجهيز مساحتك الخاصة",
    fontErrorEyebrow: "استعادة النص",
    fontErrorTitle: "المتابعة بخط النظام",
    fontErrorBody:
      "لم يتم تحميل خط ALYR المخصص. سجلاتك لم تتأثر؛ تابع الآن وأعد تشغيل التطبيق لاحقًا لاستعادة الخط المقصود.",
    fontErrorAction: "المتابعة إلى ALYR"
  }
} as const;

export function useStartupCopy() {
  const { language, rtl } = useLocale();
  return useMemo(
    () => ({
      copy: STARTUP_COPY[language],
      rtl
    }),
    [language, rtl]
  );
}
