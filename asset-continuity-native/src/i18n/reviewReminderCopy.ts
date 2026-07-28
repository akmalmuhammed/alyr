import type { LanguageCode } from "@/domain/model";

export interface ReviewReminderSettingsCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly toggleLabel: string;
  readonly toggleHint: string;
  readonly enabledStatus: string;
  readonly disabledStatus: string;
  readonly timeLabel: string;
  readonly localTime: string;
  readonly privacyNote: string;
  readonly accountRequired: string;
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
    timeLabel: "Reminder time",
    localTime: "9:00 AM local time",
    privacyNote:
      "The notification says only that a private review is ready.",
    accountRequired:
      "Review reminders become available in your signed-in personal workspace."
  },
  ar: {
    eyebrow: "مراجعات خاصة",
    title: "تذكيرات المراجعة",
    body:
      "تلقَّ إشعارًا هادئًا واحدًا عندما يحين موعد مراجعة إثبات أو قيمة مسجّلة.",
    toggleLabel: "ذكّرني بالمراجعة",
    toggleHint:
      "يحدّد تذكيرًا خاصًا واحدًا على هذا الجهاز. لا تظهر الأسماء أو القيم أو المواقع في الإشعارات.",
    enabledStatus: "مفعّلة",
    disabledStatus: "متوقفة",
    timeLabel: "وقت التذكير",
    localTime: "٩:٠٠ صباحًا بالتوقيت المحلي",
    privacyNote:
      "لا يذكر الإشعار سوى أن مراجعة خاصة جاهزة.",
    accountRequired:
      "تتوفر تذكيرات المراجعة في مساحتك الشخصية بعد تسجيل الدخول."
  }
};

export function reviewReminderSettingsCopy(
  language: LanguageCode
): ReviewReminderSettingsCopy {
  return REVIEW_REMINDER_SETTINGS_COPY[language];
}
