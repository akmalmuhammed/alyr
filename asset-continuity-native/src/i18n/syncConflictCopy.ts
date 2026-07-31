import type { LanguageCode } from "@/domain/model";

const copy = {
  en: {
    back: "Back",
    title: "Review sync differences",
    intro:
      "Your edit is preserved on this iPhone. Compare the two sources before choosing what the household register should keep.",
    allClearTitle: "The register is aligned",
    allClearBody:
      "There are no differences waiting for your review.",
    returnToVault: "Return to Vault",
    difference: "Difference",
    localSource: "This iPhone",
    localSourceDetail: "Your protected local edit",
    cloudSource: "Household cloud",
    cloudSourceDetail: "Server-confirmed record",
    cloudVersion: "Cloud version",
    cloudUnavailable:
      "The cloud value was not included in the verified change. Open the record and review it manually.",
    waitingTitle: "Waiting for cloud acknowledgement",
    waitingBody:
      "Your reviewed local edit has a new idempotent operation. This difference stays here until the server confirms it.",
    keepCloud: "Keep cloud record",
    reapplyLocal: "Reapply my edit",
    reviewManually: "Open record",
    keepCloudConfirmTitle: "Use the cloud record?",
    keepCloudConfirmBody:
      "The verified cloud value will replace the conflicting local field on this iPhone. Other local records stay unchanged.",
    reapplyConfirmTitle: "Reapply your local edit?",
    reapplyConfirmBody:
      "Heldat will send a new versioned operation. The difference remains visible until the cloud acknowledges it.",
    cancel: "Cancel",
    confirmCloud: "Use cloud",
    confirmLocal: "Reapply edit",
    resolutionFailedTitle: "Review was not saved",
    resolutionFailedBody:
      "Your local edit and this difference are still preserved. Try again after the current sync finishes.",
    permissionDetail:
      "Your current household role rejected this edit. Open household access to review the permitted action.",
    provenanceHint:
      "Local and cloud sources are shown separately; no value from another household is loaded."
  },
  ar: {
    back: "رجوع",
    title: "مراجعة اختلافات المزامنة",
    intro:
      "تعديلك محفوظ على هذا الآيفون. قارن المصدرين قبل اختيار ما يجب الاحتفاظ به في سجل الأسرة.",
    allClearTitle: "السجل متطابق",
    allClearBody: "لا توجد اختلافات بانتظار مراجعتك.",
    returnToVault: "العودة إلى الخزنة",
    difference: "اختلاف",
    localSource: "هذا الآيفون",
    localSourceDetail: "تعديلك المحلي المحمي",
    cloudSource: "سحابة الأسرة",
    cloudSourceDetail: "سجل مؤكد من الخادم",
    cloudVersion: "إصدار السحابة",
    cloudUnavailable:
      "لم تتضمن الاستجابة المؤكدة قيمة السحابة. افتح السجل وراجعه يدويًا.",
    waitingTitle: "بانتظار تأكيد السحابة",
    waitingBody:
      "أُنشئت عملية جديدة وآمنة للتكرار لتعديلك المحلي. سيبقى الاختلاف ظاهرًا حتى يؤكده الخادم.",
    keepCloud: "الاحتفاظ بسجل السحابة",
    reapplyLocal: "إعادة تطبيق تعديلي",
    reviewManually: "فتح السجل",
    keepCloudConfirmTitle: "استخدام سجل السحابة؟",
    keepCloudConfirmBody:
      "ستحل قيمة السحابة المؤكدة محل الحقل المحلي المختلف على هذا الآيفون. لن تتغير السجلات المحلية الأخرى.",
    reapplyConfirmTitle: "إعادة تطبيق تعديلك المحلي؟",
    reapplyConfirmBody:
      "سيرسل Heldat عملية جديدة بإصدار محدّث. سيبقى الاختلاف ظاهرًا حتى تؤكده السحابة.",
    cancel: "إلغاء",
    confirmCloud: "استخدام السحابة",
    confirmLocal: "إعادة التطبيق",
    resolutionFailedTitle: "لم تُحفظ المراجعة",
    resolutionFailedBody:
      "ما زال تعديلك المحلي وهذا الاختلاف محفوظين. حاول مجددًا بعد انتهاء المزامنة الحالية.",
    permissionDetail:
      "رفض دورك الحالي في الأسرة هذا التعديل. افتح صلاحيات الأسرة لمراجعة الإجراء المسموح.",
    provenanceHint:
      "يُعرض المصدر المحلي والسحابي كلٌ على حدة، ولا تُحمّل أي قيمة من أسرة أخرى."
  }
} as const;

export function syncConflictCopy(language: LanguageCode) {
  return copy[language];
}
