import { useMemo } from "react";

import type { AuthFailureCode } from "@/auth/types";
import type { LanguageCode } from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";

const english = {
  family: {
    inviteAction: "Invite a person",
    inviteHint:
      "Choose exactly what the person can do, then share a one-time code.",
    ownerOnly:
      "Only the household owner can create invitations. Your current access remains unchanged."
  },
  household: {
    createChoice: "Create my household",
    createDescription:
      "Start a private register that you own and can later share.",
    joinChoice: "Join a household",
    joinDescription:
      "Use a one-time code shared directly by the household owner.",
    joinTitle: "Join an existing household",
    joinBody:
      "Enter the complete code. ALYR will confirm your membership before opening any household records.",
    codeLabel: "Invitation code",
    codeDescription:
      "Codes expire and can be used by one account. Paste it exactly as shared.",
    codePlaceholder: "Enter the one-time code",
    codeRequired: "Enter the complete invitation code.",
    codeEntryAction: "I have an invitation code",
    codeEntryHint:
      "Opens the optional invitation-code field without joining a household.",
    codeEntryCloseAction: "Use my private record instead",
    codeEntryCloseHint:
      "Closes the invitation-code field and keeps private-record creation selected.",
    reviewAction: "Review invitation",
    joinAction: "Join household",
    sampleAction: "Review a sample invitation",
    previewNotice:
      "Expo Go uses a session-only sample. It creates no shared access and resets with the preview session."
  },
  account: {
    signupNotice:
      "This one-time household invitation already grants access. Create the account with the email that will join.",
    createAction: "Create account and continue"
  },
  joinLink: {
    eyebrow: "HOUSEHOLD INVITATION",
    title: "Your invitation is ready",
    body:
      "Continue with the account that should join. ALYR keeps the one-time code protected on this device while you sign in or confirm a new email.",
    existingAction: "Sign in to accept",
    newAction: "Create an account",
    protectingTitle: "Protecting the invitation",
    protectingBody:
      "ALYR is moving the one-time code into encrypted storage on this device.",
    reviewingTitle: "Checking the invitation",
    reviewingBody:
      "ALYR is confirming the household, access level and expiry without joining you yet.",
    reviewTitle: "Review before you join",
    reviewBody:
      "Joining gives this household access to the records you create there. Confirm the household and your assigned role first.",
    householdLabel: "Household",
    accessLabel: "Your access",
    expiresLabel: "Invitation expires",
    joinAction: "Join this household",
    notNowAction: "Not now",
    useAnotherAccount: "Use another account",
    acceptingTitle: "Joining the household",
    acceptingBody:
      "ALYR is confirming this account and its assigned household role.",
    invalidTitle: "This invitation needs a new link",
    invalidBody:
      "Ask the household owner for a current invitation. No household details were opened.",
    retryTitle: "Secure setup needs another try",
    retryBody:
      "The invitation was not opened and no household details were revealed. Try protecting the link on this device again.",
    acceptRetryTitle: "Finishing the invitation needs another try",
    acceptRetryBody:
      "Your protected invitation is still on this device. Try completing membership again; no household details were opened.",
    retryAction: "Try again",
    cancelAction: "Close invitation",
    protectedNotice:
      "The code stays encrypted on this device and is removed after acceptance, rejection, or cancellation.",
    receiptEyebrow: "MEMBERSHIP CONFIRMED",
    receiptTitle: "You joined the household",
    receiptBody:
      "Your assigned access is active. ALYR will open the household register with the same role shown above.",
    receiptAction: "Open household"
  },
  screen: {
    navigationTitle: "Invite a person",
    eyebrow: "HOUSEHOLD ACCESS",
    title: "Choose their access",
    body:
      "Set the smallest role they need. The code appears once and must be shared directly.",
    roleLabel: "Role",
    editor: "Editor",
    editorDescription:
      "Can add and maintain Places, items and proof. Cannot manage members.",
    viewer: "Viewer",
    viewerDescription:
      "Can read the shared register without changing records or members.",
    expiryLabel: "Code expiry",
    expiry24: "24 hours",
    expiry72: "3 days",
    expiry168: "7 days",
    createAction: "Create one-time code",
    resultEyebrow: "INVITATION CREATED",
    resultTitle: "Invitation ready",
    resultBody:
      "Copy or share it now. The code disappears when you leave this screen.",
    householdLabel: "Household",
    householdFallback: "ALYR household",
    expiresAtLabel: "Expires",
    codeLabel: "One-time code",
    copyAction: "Copy code",
    copiedAction: "Code copied",
    copyHint: "Copies the complete code without display spacing.",
    copyFailure:
      "The code was not copied. Use Share invitation to send it directly.",
    volatileNotice:
      "This code is shown once. ALYR does not save it on this device or send it to analytics.",
    shareAction: "Share invitation",
    createAnother: "Create another code",
    previewNotice:
      "Preview invitation only. It creates no cloud membership and lasts only for this running test session.",
    roleConsequenceEditor:
      "This person can change the household register.",
    roleConsequenceViewer:
      "This person can view the household register only."
  },
  errors: {
    account_exists: "This account already exists.",
    confirmation_required: "Confirm this email before continuing.",
    invalid_credentials: "The account details are not correct.",
    invalid_request:
      "The invitation is invalid, expired, used, or not allowed for this account.",
    network_unavailable:
      "The invitation service could not be reached. Your code entry was preserved.",
    pilot_access_denied:
      "Early access must be verified before this account can be created.",
    pilot_access_required:
      "Enter the early access code before creating an account.",
    pilot_capacity_reached:
      "The current early access group is full.",
    rate_limited: "Too many attempts. Wait a moment, then try again.",
    session_missing: "Refresh your account session, then try again.",
    unsupported: "Household invitations are not connected in this build.",
    unexpected:
      "The invitation could not be completed. Your code entry was preserved."
  }
} as const;

const arabic = {
  family: {
    inviteAction: "دعوة شخص",
    inviteHint:
      "حدّد بدقة ما يمكن للشخص فعله، ثم شارك معه رمزًا يُستخدم مرة واحدة.",
    ownerOnly:
      "مالك الأسرة وحده يمكنه إنشاء الدعوات. تبقى صلاحيتك الحالية كما هي."
  },
  household: {
    createChoice: "إنشاء أسرتي",
    createDescription:
      "ابدأ سجلًا خاصًا تملكه ويمكنك مشاركته لاحقًا.",
    joinChoice: "الانضمام إلى أسرة",
    joinDescription:
      "استخدم رمزًا لمرة واحدة شاركه معك مالك الأسرة مباشرةً.",
    joinTitle: "الانضمام إلى أسرة موجودة",
    joinBody:
      "أدخل الرمز كاملًا. سيتحقق ALYR من عضويتك قبل فتح أي سجلات للأسرة.",
    codeLabel: "رمز الدعوة",
    codeDescription:
      "تنتهي صلاحية الرمز ويستخدمه حساب واحد. الصقه كما تمت مشاركته.",
    codePlaceholder: "أدخل الرمز المخصص لمرة واحدة",
    codeRequired: "أدخل رمز الدعوة كاملًا.",
    codeEntryAction: "لديّ رمز دعوة",
    codeEntryHint:
      "يفتح حقل رمز الدعوة الاختياري من دون الانضمام إلى أسرة.",
    codeEntryCloseAction: "استخدام سجلي الخاص بدلًا من ذلك",
    codeEntryCloseHint:
      "يغلق حقل رمز الدعوة ويبقي إنشاء السجل الخاص محددًا.",
    reviewAction: "مراجعة الدعوة",
    joinAction: "الانضمام إلى الأسرة",
    sampleAction: "مراجعة دعوة تجريبية",
    previewNotice:
      "يستخدم Expo Go نموذجًا مؤقتًا للجلسة فقط. لا ينشئ وصولًا مشتركًا ويُصفّر مع انتهاء جلسة المعاينة."
  },
  account: {
    signupNotice:
      "تمنح دعوة الأسرة المخصصة لمرة واحدة صلاحية الوصول بالفعل. أنشئ الحساب بالبريد الإلكتروني الذي سينضم.",
    createAction: "إنشاء الحساب والمتابعة"
  },
  joinLink: {
    eyebrow: "دعوة الأسرة",
    title: "دعوتك جاهزة",
    body:
      "تابع باستخدام الحساب الذي سينضم. يحتفظ ALYR بالرمز المخصص لمرة واحدة محميًا على هذا الجهاز أثناء تسجيل الدخول أو تأكيد بريد جديد.",
    existingAction: "تسجيل الدخول للقبول",
    newAction: "إنشاء حساب",
    protectingTitle: "جارٍ حماية الدعوة",
    protectingBody:
      "ينقل ALYR الرمز المخصص لمرة واحدة إلى مساحة مشفرة على هذا الجهاز.",
    reviewingTitle: "جارٍ التحقق من الدعوة",
    reviewingBody:
      "يتحقق ALYR من الأسرة ومستوى الصلاحية وموعد الانتهاء من دون ضمك بعد.",
    reviewTitle: "راجع الدعوة قبل الانضمام",
    reviewBody:
      "يتيح لك الانضمام إنشاء السجلات داخل هذه الأسرة وفق الصلاحية المحددة. تأكد من الأسرة ودورك أولاً.",
    householdLabel: "الأسرة",
    accessLabel: "صلاحيتك",
    expiresLabel: "تنتهي الدعوة",
    joinAction: "الانضمام إلى هذه الأسرة",
    notNowAction: "ليس الآن",
    useAnotherAccount: "استخدام حساب آخر",
    acceptingTitle: "جارٍ الانضمام إلى الأسرة",
    acceptingBody:
      "يتحقق ALYR من هذا الحساب ومن دور الأسرة المخصص له.",
    invalidTitle: "تحتاج هذه الدعوة إلى رابط جديد",
    invalidBody:
      "اطلب من مالك الأسرة دعوة سارية. لم يتم فتح أي تفاصيل للأسرة.",
    retryTitle: "يحتاج الإعداد الآمن إلى محاولة أخرى",
    retryBody:
      "لم تُفتح الدعوة ولم تظهر أي تفاصيل عن الأسرة. حاول حماية الرابط على هذا الجهاز مرة أخرى.",
    acceptRetryTitle: "يحتاج إكمال الدعوة إلى محاولة أخرى",
    acceptRetryBody:
      "لا تزال الدعوة المحمية محفوظة على هذا الجهاز. حاول إكمال العضوية مرة أخرى؛ لم يتم فتح أي تفاصيل للأسرة.",
    retryAction: "حاول مرة أخرى",
    cancelAction: "إغلاق الدعوة",
    protectedNotice:
      "يبقى الرمز مشفرًا على هذا الجهاز ويُحذف بعد القبول أو الرفض أو الإلغاء.",
    receiptEyebrow: "تم تأكيد العضوية",
    receiptTitle: "انضممت إلى الأسرة",
    receiptBody:
      "أصبحت صلاحيتك المحددة فعالة. سيفتح ALYR سجل الأسرة بالدور الموضح أعلاه.",
    receiptAction: "فتح الأسرة"
  },
  screen: {
    navigationTitle: "دعوة شخص",
    eyebrow: "صلاحيات الأسرة",
    title: "حدّد صلاحياته",
    body:
      "اختر أقل صلاحية يحتاج إليها. يظهر الرمز مرة واحدة ويجب مشاركته مباشرةً.",
    roleLabel: "الدور",
    editor: "محرّر",
    editorDescription:
      "يمكنه إضافة الأماكن والأغراض والإثباتات وصيانتها، ولا يمكنه إدارة الأعضاء.",
    viewer: "مشاهد",
    viewerDescription:
      "يمكنه قراءة السجل المشترك من دون تغيير السجلات أو الأعضاء.",
    expiryLabel: "انتهاء صلاحية الرمز",
    expiry24: "24 ساعة",
    expiry72: "3 أيام",
    expiry168: "7 أيام",
    createAction: "إنشاء رمز لمرة واحدة",
    resultEyebrow: "تم إنشاء الدعوة",
    resultTitle: "الدعوة جاهزة",
    resultBody:
      "انسخ الرمز أو شاركه الآن. لن يظهر مجددًا بعد مغادرة هذه الشاشة.",
    householdLabel: "الأسرة",
    householdFallback: "أسرة ALYR",
    expiresAtLabel: "تنتهي الصلاحية",
    codeLabel: "الرمز المخصص لمرة واحدة",
    copyAction: "نسخ الرمز",
    copiedAction: "تم نسخ الرمز",
    copyHint: "ينسخ الرمز كاملًا من دون مسافات العرض.",
    copyFailure:
      "لم يتم نسخ الرمز. استخدم مشاركة الدعوة لإرساله مباشرةً.",
    volatileNotice:
      "يظهر هذا الرمز مرة واحدة. لا يحفظه ALYR على هذا الجهاز ولا يرسله إلى التحليلات.",
    shareAction: "مشاركة الدعوة",
    createAnother: "إنشاء رمز آخر",
    previewNotice:
      "هذه دعوة معاينة فقط. لا تُنشئ عضوية سحابية ويستمر الرمز خلال جلسة الاختبار الحالية فقط.",
    roleConsequenceEditor:
      "يمكن لهذا الشخص تعديل سجل الأسرة.",
    roleConsequenceViewer:
      "يمكن لهذا الشخص عرض سجل الأسرة فقط."
  },
  errors: {
    account_exists: "هذا الحساب موجود بالفعل.",
    confirmation_required: "أكّد هذا البريد الإلكتروني قبل المتابعة.",
    invalid_credentials: "بيانات الحساب غير صحيحة.",
    invalid_request:
      "الدعوة غير صالحة أو منتهية أو مستخدمة أو غير مسموحة لهذا الحساب.",
    network_unavailable:
      "تعذر الوصول إلى خدمة الدعوات. تم الاحتفاظ بالرمز الذي أدخلته.",
    pilot_access_denied:
      "يجب التحقق من الوصول المبكر قبل إنشاء هذا الحساب.",
    pilot_access_required:
      "أدخل رمز الوصول المبكر قبل إنشاء الحساب.",
    pilot_capacity_reached:
      "اكتملت مجموعة الوصول المبكر الحالية.",
    rate_limited: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
    session_missing: "حدّث جلسة حسابك ثم حاول مجددًا.",
    unsupported: "الدعوات الأسرية غير متصلة في هذه النسخة.",
    unexpected:
      "تعذر إكمال الدعوة. تم الاحتفاظ بالرمز الذي أدخلته."
  }
} as const;

export const INVITE_COPY = { en: english, ar: arabic } as const;

export function useInviteCopy() {
  const { language } = useLocale();
  return useMemo(() => INVITE_COPY[language], [language]);
}

export function inviteFailureMessage(
  code: AuthFailureCode,
  language: LanguageCode
): string {
  return INVITE_COPY[language].errors[code];
}

function isolate(value: string): string {
  return `\u2068${value}\u2069`;
}

export function groupInvitationCode(code: string): readonly string[] {
  const compactCode = code.replace(/[\s-]+/gu, "");
  if (!compactCode) return [];
  return compactCode.match(/.{1,4}/gu) ?? [compactCode];
}

export function formatInvitationExpiry(
  expiresAt: string,
  language: LanguageCode
): string {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return expiresAt;

  return new Intl.DateTimeFormat(
    language === "ar" ? "ar-QA" : "en-QA",
    {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }
  ).format(expiry);
}

export function invitationShareMessage(
  householdName: string,
  code: string,
  role: "editor" | "viewer",
  expiresAt: string,
  language: LanguageCode,
  joinUrl?: string
): string {
  const formattedExpiry = formatInvitationExpiry(expiresAt, language);
  const roleLabel =
    role === "editor"
      ? INVITE_COPY[language].screen.editor
      : INVITE_COPY[language].screen.viewer;
  if (language === "ar") {
    return `دعوة ALYR للانضمام إلى ${isolate(householdName)} بدور ${roleLabel}.\n${joinUrl ? `افتح الدعوة: ${isolate(joinUrl)}\n` : ""}الرمز: ${isolate(code)}\nتنتهي الصلاحية: ${formattedExpiry}`;
  }
  return `ALYR invitation to join ${householdName} as ${roleLabel}.\n${joinUrl ? `Open invitation: ${joinUrl}\n` : ""}Code: ${code}\nExpires: ${formattedExpiry}`;
}
