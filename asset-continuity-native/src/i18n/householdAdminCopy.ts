import { useMemo } from "react";

import { useLocale } from "@/i18n/LocaleProvider";

export const HOUSEHOLD_ADMIN_COPY = {
  en: {
    refresh: "Refresh access",
    refreshing: "Refreshing access",
    refreshed: "Cloud roster current",
    refreshFailedTitle: "Access needs a refresh",
    refreshFailedBody:
      "The last verified roster stays hidden until ALYR confirms your active membership.",
    peopleSection: "Active access",
    pendingSection: "Pending invitations",
    pendingName: "Unclaimed invitation",
    pendingDescription: "No account has accepted this code yet.",
    manageHint: "Opens role and access controls",
    previewTitle: "Session-only household",
    previewBody:
      "Expo Go shows sample roles. Member changes do not create or remove shared cloud access.",
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
    done: "Done"
  },
  ar: {
    refresh: "تحديث الصلاحيات",
    refreshing: "جارٍ تحديث الصلاحيات",
    refreshed: "قائمة السحابة محدّثة",
    refreshFailedTitle: "تحتاج الصلاحيات إلى تحديث",
    refreshFailedBody:
      "تظل آخر قائمة موثّقة مخفية حتى يؤكد ALYR عضويتك النشطة.",
    peopleSection: "الصلاحيات النشطة",
    pendingSection: "الدعوات المعلّقة",
    pendingName: "دعوة لم تُستخدم",
    pendingDescription: "لم يقبل أي حساب هذا الرمز بعد.",
    manageHint: "يفتح إعدادات الدور والصلاحيات",
    previewTitle: "أسرة مؤقتة لهذه الجلسة",
    previewBody:
      "يعرض Expo Go أدوارًا تجريبية. تغييرات الأعضاء لا تنشئ صلاحيات سحابية مشتركة ولا تزيلها.",
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
    done: "تم"
  }
} as const;

export function useHouseholdAdminCopy() {
  const { language } = useLocale();
  return useMemo(() => HOUSEHOLD_ADMIN_COPY[language], [language]);
}
