import { useMemo } from "react";

import { useLocale } from "@/i18n/LocaleProvider";

export const STARTUP_COPY = {
  en: {
    application: "Starting Heldat",
    workspace: "Preparing your private workspace",
    fontErrorEyebrow: "TEXT RECOVERY",
    fontErrorTitle: "Continue with system text",
    fontErrorBody:
      "Heldat's custom type did not load. Your records are unaffected; continue now and restart later to restore the intended type.",
    fontErrorAction: "Continue to Heldat"
  },
  ar: {
    application: "جارٍ تشغيل Heldat",
    workspace: "جارٍ تجهيز مساحتك الخاصة",
    fontErrorEyebrow: "استعادة النص",
    fontErrorTitle: "المتابعة بخط النظام",
    fontErrorBody:
      "لم يتم تحميل خط Heldat المخصص. سجلاتك لم تتأثر؛ تابع الآن وأعد تشغيل التطبيق لاحقًا لاستعادة الخط المقصود.",
    fontErrorAction: "المتابعة إلى Heldat"
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
