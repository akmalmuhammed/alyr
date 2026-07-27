import type { LanguageCode } from "@/domain/model";

import type {
  DeviceAuthCapability,
  DeviceAuthMethod
} from "./types";
import type { VaultLockNotice } from "./state";

interface DeviceAuthCopy {
  readonly eyebrow: string;
  readonly checkingTitle: string;
  readonly checkingBody: string;
  readonly unlockTitle: string;
  readonly unlockBody: string;
  readonly unavailableTitle: string;
  readonly unavailableBody: string;
  readonly unlockAction: string;
  readonly retryAction: string;
  readonly unlockHint: string;
  readonly retryHint: string;
  readonly signOutAction: string;
  readonly promptSubtitle: string;
  readonly promptDescription: string;
  readonly cancelLabel: string;
  readonly fallbackLabel: string;
  readonly notices: Readonly<Record<VaultLockNotice, string>>;
}

const englishBase = {
  eyebrow: "PRIVATE DEVICE ACCESS",
  checkingTitle: "Securing your private record.",
  checkingBody: "Checking this device's protection before opening ALYR.",
  unlockTitle: "Unlock your private record.",
  unavailableTitle: "Protect this device first.",
  unavailableBody:
    "Set a device passcode in Settings, then return and check again.",
  unlockAction: "Unlock ALYR",
  retryAction: "Check device again",
  unlockHint: "Opens the encrypted household vault after device verification",
  retryHint: "Checks whether this device now has a passcode",
  signOutAction: "Sign out instead",
  promptSubtitle: "Private household record",
  promptDescription:
    "Verify on this device to release your ALYR workspace.",
  cancelLabel: "Keep locked",
  fallbackLabel: "Use device passcode",
  notices: {
    cancelled: "ALYR stayed locked.",
    failed: "Device verification did not finish. Try again.",
    "locked-out":
      "Device verification is temporarily locked. Use your device passcode or try again later.",
    "timed-out": "ALYR locked after you were away.",
    "manually-locked": "ALYR was locked."
  }
} as const;

const arabicBase = {
  eyebrow: "وصول خاص على هذا الجهاز",
  checkingTitle: "جارٍ تأمين سجلك الخاص.",
  checkingBody: "يتحقق ALYR من حماية هذا الجهاز قبل فتح سجلك.",
  unlockTitle: "افتح سجلك الخاص.",
  unavailableTitle: "فعّل حماية الجهاز أولاً.",
  unavailableBody:
    "عيّن رمز دخول للجهاز من الإعدادات، ثم ارجع وتحقق مرة أخرى.",
  unlockAction: "فتح ALYR",
  retryAction: "التحقق من الجهاز",
  unlockHint: "يفتح سجل المنزل المشفر بعد التحقق على هذا الجهاز",
  retryHint: "يتحقق مما إذا تم تعيين رمز دخول لهذا الجهاز",
  signOutAction: "تسجيل الخروج بدلاً من ذلك",
  promptSubtitle: "سجل منزلي خاص",
  promptDescription: "تحقق على هذا الجهاز لفتح مساحة عمل ALYR.",
  cancelLabel: "إبقاء السجل مقفلاً",
  fallbackLabel: "استخدام رمز دخول الجهاز",
  notices: {
    cancelled: "بقي ALYR مقفلاً.",
    failed: "لم يكتمل التحقق من الجهاز. حاول مرة أخرى.",
    "locked-out":
      "التحقق من الجهاز مقفل مؤقتًا. استخدم رمز دخول الجهاز أو حاول لاحقًا.",
    "timed-out": "قفل ALYR السجل بعد ابتعادك.",
    "manually-locked": "تم قفل ALYR."
  }
} as const;

function englishUnlockBody(method: DeviceAuthMethod): string {
  switch (method) {
    case "face":
      return "Use Face ID or your device passcode. ALYR never receives your biometric data.";
    case "fingerprint":
      return "Use your fingerprint or device passcode. ALYR never receives your biometric data.";
    case "iris":
      return "Use iris recognition or your device passcode. ALYR never receives your biometric data.";
    case "biometric":
      return "Use device biometrics or your passcode. ALYR never receives your biometric data.";
    case "device-passcode":
      return "Use your device passcode to continue. ALYR never sees the code.";
  }
}

function arabicUnlockBody(method: DeviceAuthMethod): string {
  switch (method) {
    case "face":
      return "استخدم Face ID أو رمز دخول الجهاز. لا يتلقى ALYR بياناتك الحيوية.";
    case "fingerprint":
      return "استخدم بصمة الإصبع أو رمز دخول الجهاز. لا يتلقى ALYR بياناتك الحيوية.";
    case "iris":
      return "استخدم بصمة العين أو رمز دخول الجهاز. لا يتلقى ALYR بياناتك الحيوية.";
    case "biometric":
      return "استخدم التحقق الحيوي أو رمز دخول الجهاز. لا يتلقى ALYR بياناتك الحيوية.";
    case "device-passcode":
      return "استخدم رمز دخول جهازك للمتابعة. لا يطّلع ALYR على الرمز.";
  }
}

export function deviceAuthCopy(
  language: LanguageCode,
  capability: DeviceAuthCapability | null
): DeviceAuthCopy {
  const method =
    capability?.kind === "available"
      ? capability.method
      : "device-passcode";
  if (language === "ar") {
    return {
      ...arabicBase,
      unavailableBody:
        capability?.kind === "unavailable" &&
        capability.reason !== "passcode-not-set"
          ? "تعذر على ALYR تأكيد حماية الجهاز. تحقق من إعدادات الأمان، ثم حاول مرة أخرى."
          : arabicBase.unavailableBody,
      unlockBody: arabicUnlockBody(method)
    };
  }
  return {
    ...englishBase,
    unavailableBody:
      capability?.kind === "unavailable" &&
      capability.reason !== "passcode-not-set"
        ? "ALYR could not confirm device protection. Check your security settings, then try again."
        : englishBase.unavailableBody,
    unlockBody: englishUnlockBody(method)
  };
}
