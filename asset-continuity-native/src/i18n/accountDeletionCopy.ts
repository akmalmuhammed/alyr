import type {
  ApiErrorCode,
  HouseholdRole
} from "@alyr/contracts";
import { useMemo } from "react";

import type { LanguageCode } from "@/domain/model";

import { useLocale } from "./LocaleProvider";

const english = {
  vault: {
    deleteAccount: "Delete account and data",
    deleteAccountMeta: "Re-authentication required · irreversible",
    resetPreview: "Reset test session",
    resetPreviewMeta: "Clears this device’s test workspace · no cloud account"
  },
  signed: {
    eyebrow: "ACCOUNT DELETION",
    title: "Delete this account",
    intro:
      "Review the household consequences, verify your password, then confirm the signed-in email.",
    selectedAccount: "Selected account",
    householdConsequence: "Household consequence",
    pendingTitle: "Unsynced changes will be lost",
    pendingBody:
      "This device still has local changes waiting. Export anything you need before continuing.",
    password: "Current password",
    passwordDescription:
      "ALYR verifies it on the server and does not store it.",
    confirmationEmail: "Type the signed-in email",
    confirmationDescription:
      "This must exactly match the account shown above.",
    acknowledgement:
      "I understand this permanently deletes the account and eligible household data.",
    delete: "Delete account permanently",
    deleting: "Deleting account…",
    finishLocalCleanup: "Finish clearing this device",
    localCleanupFailure:
      "The cloud account was deleted, but this device did not finish clearing its protected vault. Keep ALYR open and try the local cleanup again.",
    ownerConsequence: (householdName: string) =>
      `If this account is the only active member of “${householdName}”, ALYR permanently deletes that household, every Place, item, proof file and invitation. If another person still has access, deletion stops until ownership is transferred.`,
    memberConsequence: (householdName: string) =>
      `This account leaves “${householdName}”. The owner keeps the household, its Places, items and proof. Historical records remain without this account as their attributed actor.`,
    multiHousehold:
      "The server reviews every household linked to this account, not only the one open on this device.",
    error: {
      authentication:
        "Sign in again, then reopen account deletion from the Vault.",
      password: "That password did not verify this account.",
      ownership:
        "Transfer ownership of every shared household, then return here.",
      rate: "Too many verification attempts. Wait, then try again.",
      offline:
        "The account service is not reachable. Your account and local vault remain unchanged.",
      validation:
        "Review the account email, password and acknowledgement.",
      unexpected:
        "Deletion did not complete. The local vault remains on this device."
    }
  },
  preview: {
    eyebrow: "TEST SESSION",
    title: "Reset this preview",
    intro:
      "This preview has no cloud account. Reset removes its test workspace and attachments from this running app, then returns to Welcome.",
    sampleTitle: "Sample workspace",
    sampleBody:
      "The sample items are demonstrations. Reset clears them together with anything you added during this session.",
    personalTitle: "Personal test workspace",
    personalBody:
      "Reset clears every Place, item and attachment entered during this test session.",
    acknowledgement:
      "I understand this clears the current test workspace on this device.",
    action: "Reset test session",
    resetting: "Resetting test session…",
    error:
      "The test workspace did not finish clearing. Keep ALYR open and try again."
  },
  common: {
    cancel: "Cancel",
    openingWorkspace: "Opening the protected workspace…"
  }
} as const;

const arabic = {
  vault: {
    deleteAccount: "حذف الحساب والبيانات",
    deleteAccountMeta: "يتطلب إعادة التحقق · إجراء نهائي",
    resetPreview: "إعادة ضبط جلسة الاختبار",
    resetPreviewMeta:
      "يمسح مساحة الاختبار على هذا الجهاز · لا يوجد حساب سحابي"
  },
  signed: {
    eyebrow: "حذف الحساب",
    title: "حذف هذا الحساب",
    intro:
      "راجع أثر الحذف على المنزل، ثم تحقّق بكلمة المرور وأكّد بريد الحساب المسجّل.",
    selectedAccount: "الحساب المحدد",
    householdConsequence: "أثر الحذف على المنزل",
    pendingTitle: "ستُفقد التغييرات غير المتزامنة",
    pendingBody:
      "لا تزال على هذا الجهاز تغييرات محلية قيد الانتظار. صدّر ما تحتاج إليه قبل المتابعة.",
    password: "كلمة المرور الحالية",
    passwordDescription:
      "يتحقق منها ALYR على الخادم ولا يحتفظ بها.",
    confirmationEmail: "اكتب بريد الحساب المسجّل",
    confirmationDescription:
      "يجب أن يطابق تمامًا الحساب الظاهر أعلاه.",
    acknowledgement:
      "أفهم أن هذا الإجراء يحذف الحساب نهائيًا وبيانات المنازل المؤهلة للحذف.",
    delete: "حذف الحساب نهائيًا",
    deleting: "جارٍ حذف الحساب…",
    finishLocalCleanup: "إكمال مسح هذا الجهاز",
    localCleanupFailure:
      "حُذف الحساب السحابي، لكن هذا الجهاز لم يُكمل مسح خزنته المحمية. أبقِ ALYR مفتوحًا وأعد محاولة المسح المحلي.",
    ownerConsequence: (householdName: string) =>
      `إذا كان هذا الحساب العضو النشط الوحيد في «${householdName}»، يحذف ALYR المنزل وكل الأماكن والأغراض وملفات الإثبات والدعوات نهائيًا. إذا بقي شخص آخر لديه صلاحية، يتوقف الحذف إلى أن تُنقل الملكية.`,
    memberConsequence: (householdName: string) =>
      `يغادر هذا الحساب «${householdName}». يحتفظ المالك بالمنزل وأماكنه وأغراضه وإثباتاته، وتبقى السجلات التاريخية من دون نسبة صاحب هذا الحساب إليها.`,
    multiHousehold:
      "يراجع الخادم كل منزل مرتبط بهذا الحساب، وليس المنزل المفتوح على هذا الجهاز فقط.",
    error: {
      authentication:
        "سجّل الدخول مجددًا، ثم افتح حذف الحساب من الخزنة.",
      password: "كلمة المرور لم تثبت هوية هذا الحساب.",
      ownership:
        "انقل ملكية كل منزل مشترك، ثم عد إلى هذه الشاشة.",
      rate: "محاولات تحقق كثيرة. انتظر قليلًا ثم أعد المحاولة.",
      offline:
        "خدمة الحساب غير متاحة الآن. يبقى الحساب والخزنة المحلية من دون تغيير.",
      validation:
        "راجع بريد الحساب وكلمة المرور وإقرار الحذف.",
      unexpected:
        "لم يكتمل الحذف. تبقى الخزنة المحلية على هذا الجهاز."
    }
  },
  preview: {
    eyebrow: "جلسة اختبار",
    title: "إعادة ضبط هذه المعاينة",
    intro:
      "لا تتضمن هذه المعاينة حسابًا سحابيًا. تمسح إعادة الضبط مساحة الاختبار ومرفقاتها من التطبيق الحالي، ثم تعيدك إلى شاشة الترحيب.",
    sampleTitle: "مساحة نموذجية",
    sampleBody:
      "الأغراض النموذجية للعرض فقط. تمسح إعادة الضبط هذه البيانات وكل ما أضفته خلال الجلسة.",
    personalTitle: "مساحة اختبار شخصية",
    personalBody:
      "تمسح إعادة الضبط كل مكان وغرض ومرفق أُدخل خلال جلسة الاختبار.",
    acknowledgement:
      "أفهم أن هذا يمسح مساحة الاختبار الحالية على هذا الجهاز.",
    action: "إعادة ضبط جلسة الاختبار",
    resetting: "جارٍ إعادة ضبط جلسة الاختبار…",
    error:
      "لم يكتمل مسح مساحة الاختبار. أبقِ ALYR مفتوحًا وأعد المحاولة."
  },
  common: {
    cancel: "إلغاء",
    openingWorkspace: "جارٍ فتح مساحة العمل المحمية…"
  }
} as const;

export type AccountDeletionCopy = typeof english;

export function accountDeletionErrorMessage(
  code: ApiErrorCode,
  language: LanguageCode,
  serverMessage: string
): string {
  const copy = language === "ar" ? arabic : english;
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
    case "SESSION_EXPIRED":
      return copy.signed.error.authentication;
    case "AUTHORIZATION_DENIED":
      return serverMessage.toLowerCase().includes("password")
        ? copy.signed.error.password
        : copy.signed.error.authentication;
    case "CONFLICT_REQUIRES_REVIEW":
      return copy.signed.error.ownership;
    case "RATE_LIMITED":
      return copy.signed.error.rate;
    case "OFFLINE":
    case "STORAGE_UNAVAILABLE":
      return copy.signed.error.offline;
    case "VALIDATION_FAILED":
      return copy.signed.error.validation;
    default:
      return copy.signed.error.unexpected;
  }
}

export function accountHouseholdConsequence(
  role: HouseholdRole,
  householdName: string,
  language: LanguageCode
): string {
  const copy = language === "ar" ? arabic : english;
  return role === "owner"
    ? copy.signed.ownerConsequence(householdName)
    : copy.signed.memberConsequence(householdName);
}

export function useAccountDeletionCopy() {
  const locale = useLocale();
  return useMemo(
    () => ({
      ...locale,
      copy: locale.language === "ar" ? arabic : english
    }),
    [locale]
  );
}
