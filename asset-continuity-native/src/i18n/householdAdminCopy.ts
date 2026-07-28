import { useMemo } from "react";
import type { ApiErrorCode } from "@alyr/contracts";

import { useLocale } from "@/i18n/LocaleProvider";

export const HOUSEHOLD_ADMIN_COPY = {
  en: {
    refresh: "Refresh access",
    refreshHint: "Checks the latest verified household roster.",
    refreshing: "Refreshing access",
    refreshed: "Cloud roster current",
    refreshIdle: "Cloud roster not checked yet",
    refreshFailedTitle: "Access needs a refresh",
    refreshFailedBody:
      "The last verified roster stays hidden until ALYR confirms your active membership.",
    peopleSection: "Active access",
    pendingSection: "Pending invitations",
    pendingName: "Unclaimed invitation",
    pendingDescription: "No account has accepted this code yet.",
    manageHint: "Opens role and access controls",
    previewTitle: "Sample household",
    previewBody:
      "These people and roles are examples stored with this isolated sample. They do not represent shared cloud access.",
    memberNavigationTitle: "Manage access",
    memberEyebrow: "HOUSEHOLD ACCESS",
    roleTitle: "Choose their role",
    roleBody:
      "Use the smallest level of access this person needs. Every change is recorded.",
    currentRole: "Current role",
    editor: "Editor",
    editorDescription:
      "Can add and maintain Places, items and proof. Cannot manage people.",
    viewer: "Viewer",
    viewerDescription:
      "Can read the household register without changing records.",
    saveRole: "Save role",
    saving: "Saving access",
    removeTitle: "Remove household access",
    removeBody:
      "This person immediately loses names, counts, files and search results from this household.",
    removeAction: "Remove access",
    removeConfirmTitle: "Remove this person?",
    removeConfirmBody:
      "Their active membership will be revoked immediately. Household records stay with the owner.",
    cancel: "Keep access",
    transferTitle: "Transfer ownership",
    transferBody:
      "The new owner gains member controls. You become an Editor and lose the ability to manage people.",
    transferAction: "Transfer ownership",
    transferConfirmTitle: "Make this person the owner?",
    transferConfirmBody:
      "This takes effect immediately. You become an Editor and only the new owner can manage household access.",
    transferConfirmAction: "Confirm transfer",
    cancelInviteTitle: "Cancel invitation",
    cancelInviteBody:
      "The shared code stops working immediately. No active member is removed.",
    cancelInviteAction: "Cancel invitation",
    cancelInviteConfirmTitle: "Cancel this invitation?",
    cancelInviteConfirmBody:
      "Anyone holding the code will no longer be able to join this household.",
    keepInvite: "Keep invitation",
    successRole: "Role updated",
    successRemoved: "Access removed",
    successInvite: "Invitation cancelled",
    successTransfer: "Ownership transferred",
    failureTitle: "Access was not changed",
    failureBody:
      "Your selection was preserved. Refresh the roster, then review the latest access state.",
    errorRetry:
      "Refresh access and try again.",
    errorReview:
      "Return to Family and review your account or role.",
    errorFallback:
      "ALYR could not verify household access.",
    errorByCode: {
      AUTHENTICATION_REQUIRED:
        "Sign-in confirmation is needed before household access can be managed.",
      AUTHORIZATION_DENIED:
        "Your current household role does not permit this change.",
      CONFLICT_REQUIRES_REVIEW:
        "The household roster changed on another device.",
      IDEMPOTENCY_CONFLICT:
        "This request conflicts with an access change already recorded.",
      INVALID_COMMAND:
        "ALYR could not apply this access request.",
      INVALID_CURSOR:
        "ALYR could not verify the latest roster position.",
      INVALID_FILE:
        "ALYR rejected unexpected data in this access request.",
      NOT_FOUND:
        "This member or invitation is no longer in the household roster.",
      OFFLINE:
        "ALYR could not reach the household service.",
      QUOTA_EXCEEDED:
        "The household service has reached its current capacity.",
      RATE_LIMITED:
        "Too many access requests were sent in a short period.",
      SESSION_EXPIRED:
        "Your account session no longer matches this household.",
      STORAGE_UNAVAILABLE:
        "Household access is temporarily unavailable.",
      UNSUPPORTED_CONTRACT_VERSION:
        "This app version no longer matches the household service.",
      VALIDATION_FAILED:
        "ALYR could not verify the household service response."
    } satisfies Record<ApiErrorCode, string>,
    done: "Done"
  },
  ar: {
    refresh: "تحديث الصلاحيات",
    refreshHint: "يتحقق من أحدث قائمة موثّقة لأفراد الأسرة.",
    refreshing: "جارٍ تحديث الصلاحيات",
    refreshed: "قائمة السحابة محدّثة",
    refreshIdle: "لم يتم التحقق من قائمة السحابة بعد",
    refreshFailedTitle: "تحتاج الصلاحيات إلى تحديث",
    refreshFailedBody:
      "تظل آخر قائمة موثّقة مخفية حتى يؤكد ALYR عضويتك النشطة.",
    peopleSection: "الصلاحيات النشطة",
    pendingSection: "الدعوات المعلّقة",
    pendingName: "دعوة لم تُستخدم",
    pendingDescription: "لم يقبل أي حساب هذا الرمز بعد.",
    manageHint: "يفتح إعدادات الدور والصلاحيات",
    previewTitle: "أسرة نموذجية",
    previewBody:
      "هؤلاء الأشخاص وأدوارهم أمثلة محفوظة مع هذا النموذج المعزول، ولا تمثل صلاحيات سحابية مشتركة.",
    memberNavigationTitle: "إدارة الصلاحيات",
    memberEyebrow: "صلاحيات الأسرة",
    roleTitle: "حدّد دوره",
    roleBody:
      "اختر أقل مستوى من الصلاحيات يحتاج إليه هذا الشخص. يُسجّل كل تغيير.",
    currentRole: "الدور الحالي",
    editor: "محرّر",
    editorDescription:
      "يمكنه إضافة الأماكن والأغراض والإثباتات وصيانتها، ولا يمكنه إدارة الأشخاص.",
    viewer: "مشاهد",
    viewerDescription:
      "يمكنه قراءة سجل الأسرة من دون تغيير السجلات.",
    saveRole: "حفظ الدور",
    saving: "جارٍ حفظ الصلاحيات",
    removeTitle: "إزالة صلاحية الأسرة",
    removeBody:
      "يفقد هذا الشخص فورًا أسماء هذه الأسرة وأعدادها وملفاتها ونتائج البحث فيها.",
    removeAction: "إزالة الصلاحية",
    removeConfirmTitle: "هل تريد إزالة هذا الشخص؟",
    removeConfirmBody:
      "تُلغى عضويته النشطة فورًا، وتبقى سجلات الأسرة لدى المالك.",
    cancel: "إبقاء الصلاحية",
    transferTitle: "نقل الملكية",
    transferBody:
      "يحصل المالك الجديد على إدارة الأعضاء. تصبح أنت محرّرًا وتفقد إدارة الأشخاص.",
    transferAction: "نقل الملكية",
    transferConfirmTitle: "هل تريد تعيين هذا الشخص مالكًا؟",
    transferConfirmBody:
      "يُطبّق التغيير فورًا. تصبح أنت محرّرًا، ويستطيع المالك الجديد وحده إدارة صلاحيات الأسرة.",
    transferConfirmAction: "تأكيد النقل",
    cancelInviteTitle: "إلغاء الدعوة",
    cancelInviteBody:
      "يتوقف الرمز المشترك عن العمل فورًا، ولا تُزال عضوية نشطة.",
    cancelInviteAction: "إلغاء الدعوة",
    cancelInviteConfirmTitle: "هل تريد إلغاء هذه الدعوة؟",
    cancelInviteConfirmBody:
      "لن يتمكن أي شخص يحمل الرمز من الانضمام إلى هذه الأسرة.",
    keepInvite: "إبقاء الدعوة",
    successRole: "تم تحديث الدور",
    successRemoved: "تمت إزالة الصلاحية",
    successInvite: "تم إلغاء الدعوة",
    successTransfer: "تم نقل الملكية",
    failureTitle: "لم يتغير الوصول",
    failureBody:
      "تم الاحتفاظ باختيارك. حدّث القائمة ثم راجع أحدث حالة للصلاحيات.",
    errorRetry:
      "حدّث الصلاحيات ثم حاول مرة أخرى.",
    errorReview:
      "ارجع إلى الأسرة وراجع حسابك أو دورك.",
    errorFallback:
      "تعذّر على ALYR التحقق من صلاحيات الأسرة.",
    errorByCode: {
      AUTHENTICATION_REQUIRED:
        "يلزم تأكيد تسجيل الدخول قبل إدارة صلاحيات الأسرة.",
      AUTHORIZATION_DENIED:
        "دورك الحالي في الأسرة لا يسمح بهذا التغيير.",
      CONFLICT_REQUIRES_REVIEW:
        "تغيّرت قائمة الأسرة على جهاز آخر.",
      IDEMPOTENCY_CONFLICT:
        "يتعارض هذا الطلب مع تغيير مسجّل سابقًا في الصلاحيات.",
      INVALID_COMMAND:
        "تعذّر على ALYR تطبيق طلب الصلاحيات هذا.",
      INVALID_CURSOR:
        "تعذّر على ALYR التحقق من أحدث موضع في القائمة.",
      INVALID_FILE:
        "رفض ALYR بيانات غير متوقعة في طلب الصلاحيات.",
      NOT_FOUND:
        "لم يعد هذا العضو أو هذه الدعوة موجودًا في قائمة الأسرة.",
      OFFLINE:
        "تعذّر على ALYR الاتصال بخدمة الأسرة.",
      QUOTA_EXCEEDED:
        "بلغت خدمة الأسرة سعتها الحالية.",
      RATE_LIMITED:
        "أُرسلت طلبات صلاحيات كثيرة خلال وقت قصير.",
      SESSION_EXPIRED:
        "لم تعد جلسة حسابك مطابقة لهذه الأسرة.",
      STORAGE_UNAVAILABLE:
        "صلاحيات الأسرة غير متاحة مؤقتًا.",
      UNSUPPORTED_CONTRACT_VERSION:
        "لم يعد إصدار التطبيق هذا متوافقًا مع خدمة الأسرة.",
      VALIDATION_FAILED:
        "تعذّر على ALYR التحقق من استجابة خدمة الأسرة."
    } satisfies Record<ApiErrorCode, string>,
    done: "تم"
  }
} as const;

export type HouseholdAccessErrorLike = {
  readonly code?: unknown;
  readonly retryable?: boolean;
};

export function householdAccessErrorMessage(
  error: HouseholdAccessErrorLike | null | undefined,
  language: "en" | "ar"
): string {
  const copy = HOUSEHOLD_ADMIN_COPY[language];
  const code = error?.code;
  const specific =
    typeof code === "string" &&
    Object.prototype.hasOwnProperty.call(copy.errorByCode, code)
      ? copy.errorByCode[code as keyof typeof copy.errorByCode]
      : copy.errorFallback;
  const guidance =
    error?.retryable === false ? copy.errorReview : copy.errorRetry;
  return `${specific} ${guidance}`;
}

export function useHouseholdAdminCopy() {
  const { language } = useLocale();
  return useMemo(() => HOUSEHOLD_ADMIN_COPY[language], [language]);
}
