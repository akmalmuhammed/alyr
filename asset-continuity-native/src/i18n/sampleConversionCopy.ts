import type { LanguageCode } from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";

const english = {
  back: "Back to Vault",
  reviewEyebrow: "PERSONAL RECORD",
  reviewTitle: "Make ALYR yours.",
  reviewBody:
    "Start with an empty household record, then add one item or Place that matters.",
  consequenceTitle: "Before you continue",
  sampleRemovedTitle: "The sample is replaced",
  sampleRemovedBody:
    "Its items, Places, proof and recorded values leave this running preview.",
  localOnlyTitle: "Your new record stays local",
  localOnlyBody:
    "This creates a personal preview workspace on this device. It does not create an account, cloud backup or family membership.",
  sessionTitle: "Use test information",
  sessionBody:
    "Expo Go keeps this workspace for the current preview session and may reset it when the session ends.",
  confirm: "Create personal workspace",
  confirming: "Creating workspace",
  keepSample: "Keep exploring the sample",
  failure:
    "Your personal workspace was not created. The sample is still available. Try again.",
  readyEyebrow: "YOUR RECORD IS READY",
  readyTitle: "What should ALYR remember first?",
  readyBody:
    "Choose one useful starting point. You can add the other from Today at any time.",
  firstItem: "Add my first item",
  firstItemBody:
    "Create an Asset Passport with its identity, photo, exact location and optional proof.",
  firstPlace: "Add my first Place",
  firstPlaceBody:
    "Save a home, apartment, plot or storage location and confirm its pin.",
  goToday: "Go to Today",
  localTruth: "Preview session · on this device · no cloud account"
} as const;

type WidenStrings<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends object
      ? WidenStrings<T[K]>
      : T[K];
};

const arabic = {
  back: "العودة إلى الخزنة",
  reviewEyebrow: "سجلك الشخصي",
  reviewTitle: "اجعل ALYR سجلك الخاص.",
  reviewBody:
    "ابدأ بسجل منزلي فارغ، ثم أضف غرضًا أو مكانًا يهمك.",
  consequenceTitle: "قبل المتابعة",
  sampleRemovedTitle: "سيُستبدل النموذج",
  sampleRemovedBody:
    "ستُزال أغراض النموذج وأماكنه وإثباتاته وقيمه المسجلة من جلسة المعاينة الحالية.",
  localOnlyTitle: "سيبقى سجلك الجديد محليًا",
  localOnlyBody:
    "يُنشئ هذا الإجراء مساحة معاينة شخصية على هذا الجهاز، من دون إنشاء حساب أو نسخة احتياطية سحابية أو عضوية عائلية.",
  sessionTitle: "استخدم بيانات تجريبية",
  sessionBody:
    "يحتفظ Expo Go بهذه المساحة خلال جلسة المعاينة الحالية، وقد تُصفّر عند انتهاء الجلسة.",
  confirm: "إنشاء مساحة شخصية",
  confirming: "جارٍ إنشاء المساحة",
  keepSample: "متابعة استكشاف النموذج",
  failure:
    "لم تُنشأ مساحتك الشخصية، ولا يزال النموذج متاحًا. حاول مرة أخرى.",
  readyEyebrow: "سجلك جاهز",
  readyTitle: "ما أول شيء تريد أن يتذكره ALYR؟",
  readyBody:
    "اختر نقطة بداية مفيدة، ويمكنك إضافة الخيار الآخر من شاشة اليوم في أي وقت.",
  firstItem: "إضافة أول غرض",
  firstItemBody:
    "أنشئ جواز غرض يتضمن هويته وصورته وموقعه الدقيق وإثباتًا اختياريًا.",
  firstPlace: "إضافة أول مكان",
  firstPlaceBody:
    "احفظ منزلًا أو شقة أو أرضًا أو موقع تخزين، ثم أكّد موضعه على الخريطة.",
  goToday: "الانتقال إلى اليوم",
  localTruth: "جلسة معاينة · على هذا الجهاز · من دون حساب سحابي"
} as const satisfies WidenStrings<typeof english>;

export const SAMPLE_CONVERSION_COPY = {
  en: english,
  ar: arabic
} as const satisfies Record<
  LanguageCode,
  WidenStrings<typeof english>
>;

export function useSampleConversionCopy() {
  const locale = useLocale();
  return {
    ...locale,
    copy: SAMPLE_CONVERSION_COPY[locale.language]
  };
}
