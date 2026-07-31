import type { LanguageCode } from "@/domain/model";

export interface ReviewReminderSettingsCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly toggleLabel: string;
  readonly toggleHint: string;
  readonly enabledStatus: string;
  readonly disabledStatus: string;
  readonly noReviewStatus: string;
  readonly permissionBlockedStatus: string;
  readonly cleanupPendingStatus: string;
  readonly loadingStatus: string;
  readonly errorStatus: string;
  readonly timeLabel: string;
  readonly localTime: string;
  readonly privacyNote: string;
  readonly accountRequired: string;
  readonly permissionDeniedTitle: string;
  readonly permissionDeniedBody: string;
  readonly permissionDeniedAction: string;
}

export const REVIEW_REMINDER_SETTINGS_COPY: Readonly<
  Record<LanguageCode, ReviewReminderSettingsCopy>
> = {
  en: {
    eyebrow: "PRIVATE REVIEWS",
    title: "Review reminders",
    body:
      "Get one quiet notification when proof or a recorded value is due for review.",
    toggleLabel: "Remind me to review",
    toggleHint:
      "Schedules one private on-device reminder. Names, values and locations stay out of notifications.",
    enabledStatus: "On",
    disabledStatus: "Off",
    noReviewStatus: "No review due",
    permissionBlockedStatus: "Notifications off",
    cleanupPendingStatus: "Finishing notification cleanup",
    loadingStatus: "Checking",
    errorStatus: "Try again",
    timeLabel: "Reminder time",
    localTime: "9:00 AM local time",
    privacyNote:
      "The notification says only that a private review is ready.",
    accountRequired:
      "Review reminders become available in your signed-in personal workspace.",
    permissionDeniedTitle: "Notifications are off",
    permissionDeniedBody:
      "Allow Heldat notifications in device Settings, then turn the reminder on again.",
    permissionDeniedAction: "OK"
  },
  ar: {
    eyebrow: "مراجعة خاصة",
    title: "تذكيرات المراجعة",
    body:
      "استلم إشعارًا هادئًا واحدًا عندما يحين موعد مراجعة إثبات أو قيمة مسجّلة.",
    toggleLabel: "ذكّرني بالمراجعة",
    toggleHint:
      "يجدول تذكيرًا خاصًا واحدًا على هذا الجهاز. لا تظهر الأسماء أو القيم أو المواقع في الإشعار.",
    enabledStatus: "مفعّل",
    disabledStatus: "متوقف",
    noReviewStatus: "لا توجد مراجعة مستحقة",
    permissionBlockedStatus: "الإشعارات متوقفة",
    cleanupPendingStatus: "جارٍ إنهاء إيقاف الإشعار",
    loadingStatus: "جارٍ التحقق",
    errorStatus: "أعد المحاولة",
    timeLabel: "وقت التذكير",
    localTime: "٩:٠٠ صباحًا بالتوقيت المحلي",
    privacyNote:
      "لا يذكر الإشعار سوى أن مراجعة خاصة جاهزة.",
    accountRequired:
      "تتوفر التذكيرات في مساحة شخصية مسجّل الدخول إليها.",
    permissionDeniedTitle: "الإشعارات متوقفة",
    permissionDeniedBody:
      "اسمح بإشعارات Heldat من إعدادات الجهاز، ثم فعّل التذكير مرة أخرى.",
    permissionDeniedAction: "حسنًا"
  }
};

export function reviewReminderSettingsCopy(
  language: LanguageCode
): ReviewReminderSettingsCopy {
  return REVIEW_REMINDER_SETTINGS_COPY[language];
}
