import { useMemo } from "react";

import type { ApiErrorCode } from "@alyr/contracts";

import type { LanguageCode } from "@/domain/model";
import { useLocale } from "./LocaleProvider";

const english = {
  vault: {
    cloudExport: "Create continuity export",
    cloudExportMeta:
      "Verified cloud manifest · available for 7 days",
    localExport: "Export this device’s readable copy",
    localExportMeta: "Current device metadata · not encrypted",
    open: "Open",
    signedAccount: "Signed account"
  },
  screen: {
    eyebrow: "DATA PORTABILITY",
    title: "Create a continuity export",
    intro:
      "Create a point-in-time record of your Places, items, locations, recorded values and proof checksums.",
    scopeTitle: "Included records",
    scopeBody:
      "Every active item in this household, its Place hierarchy, location history, recorded values and proof metadata.",
    originalsTitle: "Proof originals stay private",
    originalsBody:
      "The export includes immutable filenames, sizes and SHA-256 checksums. Photos and documents remain in the private Vault.",
    formatTitle: "File format",
    json: "JSON manifest",
    jsonMeta: "Structured and complete for future import or review.",
    pdf: "PDF summary",
    pdfMeta:
      "Readable summary with the complete JSON manifest attached inside.",
    privacyTitle: "Location and value detail",
    complete: "Complete record",
    completeMeta:
      "Includes addresses, coordinates, descriptions, values and filenames.",
    redacted: "Redacted copy",
    redactedMeta:
      "Removes precise location, free-text details, amounts and filenames.",
    pendingTitle: "Sync before exporting",
    pendingBody:
      "This device has changes waiting for cloud confirmation. Sync them first so the cloud snapshot is current.",
    syncNow: "Sync now",
    create: "Create export",
    creating: "Creating verified export…",
    readyTitle: "Export ready",
    readyBody:
      "ALYR verified the stored byte size and SHA-256 checksum. Share or save the file before it expires.",
    share: "Share export",
    createAnother: "Create another",
    expires: (date: string) => `Available until ${date}`,
    previewTitle: "Cloud export needs a signed account",
    previewBody:
      "Use the readable device copy in Vault during this Expo Go test. Cloud verification activates in the signed app.",
    backToVault: "Back to Vault",
    shareUnavailableTitle: "Sharing is not available",
    shareUnavailableBody:
      "The verified file remains ready. Open this screen from an installed native build to share it.",
    shareFailedTitle: "Export not shared",
    shareFailedBody:
      "The verified cloud file remains unchanged. Keep ALYR open and try sharing again.",
    errorTitle: "Export not created",
    error: {
      authentication: "Sign in again, then reopen this export.",
      permission:
        "Your household role does not allow continuity exports.",
      stale:
        "The selected records changed while the snapshot was created. Sync and try again.",
      size:
        "This export is over the pilot file allowance. Create a redacted copy or reduce the item scope.",
      offline:
        "The export service is not reachable. Your household records remain unchanged.",
      invalid:
        "The export response did not pass ALYR’s integrity checks.",
      unexpected:
        "The export did not finish. Your household records remain unchanged."
    }
  }
} as const;

const arabic = {
  vault: {
    cloudExport: "إنشاء تصدير للاستمرارية",
    cloudExportMeta:
      "بيان سحابي موثّق · متاح لمدة 7 أيام",
    localExport: "تصدير نسخة مقروءة من هذا الجهاز",
    localExportMeta: "بيانات الجهاز الحالي · غير مشفّرة",
    open: "فتح",
    signedAccount: "حساب مسجّل"
  },
  screen: {
    eyebrow: "نقل البيانات",
    title: "إنشاء تصدير للاستمرارية",
    intro:
      "أنشئ سجلًا مؤرخًا للأماكن والأغراض والمواقع والقيم المسجّلة وبصمات الإثبات.",
    scopeTitle: "السجلات المشمولة",
    scopeBody:
      "كل غرض نشط في هذا المنزل، وتسلسل مكانه، وسجل موقعه، وقيمه المسجّلة، وبيانات إثباته.",
    originalsTitle: "تبقى ملفات الإثبات الأصلية خاصة",
    originalsBody:
      "يتضمن التصدير أسماء الملفات وأحجامها وبصمات SHA-256 الثابتة. وتبقى الصور والمستندات في الخزنة الخاصة.",
    formatTitle: "صيغة الملف",
    json: "بيان JSON",
    jsonMeta: "صيغة منظمة وكاملة للاستيراد أو المراجعة مستقبلًا.",
    pdf: "ملخص PDF",
    pdfMeta:
      "ملخص مقروء ومرفق بداخله بيان JSON الكامل.",
    privacyTitle: "تفاصيل الموقع والقيمة",
    complete: "سجل كامل",
    completeMeta:
      "يشمل العناوين والإحداثيات والأوصاف والقيم وأسماء الملفات.",
    redacted: "نسخة منقّحة",
    redactedMeta:
      "تزيل الموقع الدقيق والتفاصيل الحرة والمبالغ وأسماء الملفات.",
    pendingTitle: "زامن قبل التصدير",
    pendingBody:
      "على هذا الجهاز تغييرات تنتظر تأكيد السحابة. زامنها أولًا ليعكس التصدير أحدث سجل.",
    syncNow: "المزامنة الآن",
    create: "إنشاء التصدير",
    creating: "جارٍ إنشاء تصدير موثّق…",
    readyTitle: "التصدير جاهز",
    readyBody:
      "تحقق ALYR من حجم الملف وبصمة SHA-256. احفظ الملف أو شاركه قبل انتهاء صلاحيته.",
    share: "مشاركة التصدير",
    createAnother: "إنشاء تصدير آخر",
    expires: (date: string) => `متاح حتى ${date}`,
    previewTitle: "يتطلب التصدير السحابي حسابًا مسجّلًا",
    previewBody:
      "استخدم النسخة المقروءة من الجهاز في الخزنة خلال اختبار Expo Go. يتفعّل التحقق السحابي في التطبيق الموقّع.",
    backToVault: "العودة إلى الخزنة",
    shareUnavailableTitle: "المشاركة غير متاحة",
    shareUnavailableBody:
      "يبقى الملف الموثّق جاهزًا. افتح هذه الشاشة من تطبيق أصلي مثبّت لمشاركته.",
    shareFailedTitle: "لم تتم مشاركة التصدير",
    shareFailedBody:
      "يبقى الملف السحابي الموثّق دون تغيير. أبقِ ALYR مفتوحًا وحاول المشاركة مجددًا.",
    errorTitle: "لم يتم إنشاء التصدير",
    error: {
      authentication: "سجّل الدخول مجددًا ثم أعد فتح شاشة التصدير.",
      permission: "لا يسمح دورك في المنزل بإنشاء تصدير للاستمرارية.",
      stale:
        "تغيّرت السجلات أثناء إنشاء اللقطة. زامن البيانات وحاول مجددًا.",
      size:
        "يتجاوز هذا التصدير الحد المتاح في النسخة التجريبية. أنشئ نسخة منقّحة أو قلّل نطاق الأغراض.",
      offline:
        "خدمة التصدير غير متاحة الآن. تبقى سجلات المنزل دون تغيير.",
      invalid:
        "لم يجتز رد التصدير اختبارات سلامة البيانات في ALYR.",
      unexpected:
        "لم يكتمل التصدير. تبقى سجلات المنزل دون تغيير."
    }
  }
} as const;

export function exportErrorMessage(
  code: ApiErrorCode,
  language: LanguageCode
): string {
  const copy = language === "ar" ? arabic : english;
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
    case "SESSION_EXPIRED":
      return copy.screen.error.authentication;
    case "AUTHORIZATION_DENIED":
      return copy.screen.error.permission;
    case "CONFLICT_REQUIRES_REVIEW":
    case "IDEMPOTENCY_CONFLICT":
    case "NOT_FOUND":
      return copy.screen.error.stale;
    case "QUOTA_EXCEEDED":
      return copy.screen.error.size;
    case "OFFLINE":
    case "RATE_LIMITED":
    case "STORAGE_UNAVAILABLE":
      return copy.screen.error.offline;
    case "INVALID_FILE":
    case "VALIDATION_FAILED":
    case "UNSUPPORTED_CONTRACT_VERSION":
      return copy.screen.error.invalid;
    default:
      return copy.screen.error.unexpected;
  }
}

export function useExportCopy() {
  const locale = useLocale();
  return useMemo(
    () => ({
      ...locale,
      copy: locale.language === "ar" ? arabic : english
    }),
    [locale]
  );
}
