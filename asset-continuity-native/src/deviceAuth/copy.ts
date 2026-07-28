import type { LanguageCode } from "@/domain/model";

import type {
  DeviceAuthCapability,
  DeviceAuthMethod,
  OnboardingDevicePreflightNotice
} from "./types";
import type { VaultLockNotice } from "./state";

interface DeviceAuthCopy {
  readonly eyebrow: string;
  readonly checkingTitle: string;
  readonly checkingBody: string;
  readonly restoreCheckingTitle: string;
  readonly restoreCheckingBody: string;
  readonly restoreFailedTitle: string;
  readonly restoreFailedBody: string;
  readonly unlockTitle: string;
  readonly unlockBody: string;
  readonly unavailableTitle: string;
  readonly unavailableBody: string;
  readonly unlockAction: string;
  readonly retryAction: string;
  readonly retryRestoreAction: string;
  readonly unlockHint: string;
  readonly retryHint: string;
  readonly retryRestoreHint: string;
  readonly signOutAction: string;
  readonly promptSubtitle: string;
  readonly promptDescription: string;
  readonly cancelLabel: string;
  readonly fallbackLabel: string;
  readonly notices: Readonly<Record<VaultLockNotice, string>>;
}

export interface OnboardingDevicePreflightCopy {
  readonly eyebrow: string;
  readonly checkingTitle: string;
  readonly checkingBody: string;
  readonly readyTitle: string;
  readonly readyBody: string;
  readonly unavailableTitle: string;
  readonly unavailableBody: string;
  readonly bypassedTitle: string;
  readonly bypassedBody: string;
  readonly authorizedTitle: string;
  readonly authorizedBody: string;
  readonly verifyItemAction: string;
  readonly verifyPlaceAction: string;
  readonly checkingAction: string;
  readonly retryAction: string;
  readonly openSettingsAction: string;
  readonly openSettingsHint: string;
  readonly openSettingsError: string;
  readonly preparingAction: string;
  readonly retryStorageAction: string;
  readonly promptTitle: string;
  readonly promptSubtitle: string;
  readonly promptDescription: string;
  readonly cancelLabel: string;
  readonly fallbackLabel: string;
  readonly notices: Readonly<
    Record<OnboardingDevicePreflightNotice, string>
  >;
}

const englishBase = {
  eyebrow: "PRIVATE DEVICE ACCESS",
  checkingTitle: "Securing your private record.",
  checkingBody: "Checking this device's protection before opening ALYR.",
  restoreCheckingTitle: "Restoring your private handoff.",
  restoreCheckingBody:
    "Checking this device for the first item or Place you chose before opening the household vault.",
  restoreFailedTitle: "Resume details need another check.",
  restoreFailedBody:
    "Your household vault is still sealed. Try device storage again so ALYR can resume the exact first record you chose.",
  unlockTitle: "Unlock your private record.",
  unavailableTitle: "Protect this device first.",
  unavailableBody:
    "Set a device passcode in Settings, then return and check again.",
  unlockAction: "Unlock ALYR",
  retryAction: "Check device again",
  retryRestoreAction: "Try device storage again",
  unlockHint: "Opens the encrypted household vault after device verification",
  retryHint: "Checks whether this device now has a passcode",
  retryRestoreHint:
    "Checks this device again for the exact first-record continuation",
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
  restoreCheckingTitle: "جارٍ استعادة نقطة المتابعة الخاصة بك.",
  restoreCheckingBody:
    "يتحقق ALYR من هذا الجهاز لمعرفة الغرض أو المكان الأول الذي اخترته قبل فتح سجل المنزل.",
  restoreFailedTitle: "تحتاج تفاصيل المتابعة إلى فحص آخر.",
  restoreFailedBody:
    "لا يزال سجل المنزل مقفلاً. أعد محاولة قراءة تخزين الجهاز ليعود ALYR إلى السجل الأول الذي اخترته.",
  unlockTitle: "افتح سجلك الخاص.",
  unavailableTitle: "فعّل حماية الجهاز أولاً.",
  unavailableBody:
    "عيّن رمز دخول للجهاز من الإعدادات، ثم ارجع وتحقق مرة أخرى.",
  unlockAction: "فتح ALYR",
  retryAction: "التحقق من الجهاز",
  retryRestoreAction: "إعادة محاولة تخزين الجهاز",
  unlockHint: "يفتح سجل المنزل المشفر بعد التحقق على هذا الجهاز",
  retryHint: "يتحقق مما إذا تم تعيين رمز دخول لهذا الجهاز",
  retryRestoreHint:
    "يتحقق من هذا الجهاز مرة أخرى لاستعادة السجل الأول الذي اخترته",
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

function englishPreflightReadyTitle(method: DeviceAuthMethod): string {
  switch (method) {
    case "face":
      return "Face ID is ready";
    case "fingerprint":
      return "Fingerprint verification is ready";
    case "iris":
      return "Iris verification is ready";
    case "biometric":
      return "Device biometrics are ready";
    case "device-passcode":
      return "Device passcode is ready";
  }
}

function arabicPreflightReadyTitle(method: DeviceAuthMethod): string {
  switch (method) {
    case "face":
      return "Face ID جاهز";
    case "fingerprint":
      return "التحقق ببصمة الإصبع جاهز";
    case "iris":
      return "التحقق ببصمة العين جاهز";
    case "biometric":
      return "التحقق الحيوي على الجهاز جاهز";
    case "device-passcode":
      return "رمز دخول الجهاز جاهز";
  }
}

const englishPreflight: Omit<
  OnboardingDevicePreflightCopy,
  "readyTitle"
> = {
  eyebrow: "DEVICE PROTECTION",
  checkingTitle: "Checking this device",
  checkingBody:
    "ALYR is checking for a device passcode or enrolled biometrics before setup is completed.",
  readyBody:
    "Verification stays on this device; ALYR receives no biometric or passcode. Verify once, then the exact item or Place you selected opens.",
  unavailableTitle: "Device passcode required",
  unavailableBody:
    "Set a device passcode in Settings, then return. Setup and the local workspace stay unchanged until this check passes.",
  bypassedTitle: "Preview protection is limited",
  bypassedBody:
    "Expo Go does not invoke Face ID or a device passcode. Your selected first record still opens next, so use test details only.",
  authorizedTitle: "Device verified",
  authorizedBody:
    "Your private workspace will open directly into the first record you selected.",
  verifyItemAction: "Verify and add my first item",
  verifyPlaceAction: "Verify and add my first Place",
  checkingAction: "Checking device\u2026",
  retryAction: "Check device again",
  openSettingsAction: "Open device Settings",
  openSettingsHint: "Opens device security settings so you can set a passcode",
  openSettingsError:
    "Device Settings did not open. Open Settings manually, set a passcode, then return.",
  preparingAction: "Preparing private record\u2026",
  retryStorageAction: "Try device storage again",
  promptTitle: "Verify to finish ALYR setup",
  promptSubtitle: "Private household record",
  promptDescription:
    "Verify on this device before ALYR completes setup and opens your first private record.",
  cancelLabel: "Keep setup open",
  fallbackLabel: "Use device passcode",
  notices: {
    cancelled:
      "Verification was cancelled. Your setup choices are still here.",
    failed:
      "Device verification did not finish. Nothing was committed; try again.",
    "locked-out":
      "Device verification is temporarily locked. Use the device passcode or try again later."
  }
};

const arabicPreflight: Omit<
  OnboardingDevicePreflightCopy,
  "readyTitle"
> = {
  eyebrow: "حماية الجهاز",
  checkingTitle: "جارٍ التحقق من هذا الجهاز",
  checkingBody:
    "يتحقق ALYR من وجود رمز دخول للجهاز أو تحقق حيوي مسجّل قبل إكمال الإعداد.",
  readyBody:
    "يبقى التحقق على هذا الجهاز ولا يتلقى ALYR بياناتك الحيوية أو رمز الدخول. تحقق مرة واحدة، ثم يُفتح الغرض أو المكان الذي اخترته مباشرة.",
  unavailableTitle: "يلزم تعيين رمز دخول للجهاز",
  unavailableBody:
    "عيّن رمز دخول للجهاز من الإعدادات ثم ارجع. يبقى الإعداد وسجل الجهاز دون تغيير حتى ينجح هذا التحقق.",
  bypassedTitle: "حماية المعاينة محدودة",
  bypassedBody:
    "لا تستخدم معاينة Expo Go بصمة الوجه أو رمز دخول الجهاز. سيُفتح السجل الأول الذي اخترته بعد ذلك، لذا استخدم بيانات تجريبية فقط.",
  authorizedTitle: "تم التحقق من الجهاز",
  authorizedBody:
    "ستُفتح مساحة العمل الخاصة مباشرة على السجل الأول الذي اخترته.",
  verifyItemAction: "تحقق وأضف أول غرض",
  verifyPlaceAction: "تحقق وأضف أول مكان",
  checkingAction: "جارٍ التحقق من الجهاز…",
  retryAction: "التحقق من الجهاز مرة أخرى",
  openSettingsAction: "فتح إعدادات الجهاز",
  openSettingsHint: "يفتح إعدادات أمان الجهاز لتعيين رمز دخول",
  openSettingsError:
    "تعذّر فتح إعدادات الجهاز. افتح الإعدادات يدويًا وعيّن رمز دخول ثم ارجع.",
  preparingAction: "جارٍ تجهيز السجل الخاص…",
  retryStorageAction: "إعادة محاولة فتح مساحة الجهاز",
  promptTitle: "تحقق لإكمال إعداد ALYR",
  promptSubtitle: "سجل منزلي خاص",
  promptDescription:
    "تحقق على هذا الجهاز قبل أن يكمل ALYR الإعداد ويفتح أول سجل خاص بك.",
  cancelLabel: "إبقاء الإعداد مفتوحًا",
  fallbackLabel: "استخدام رمز دخول الجهاز",
  notices: {
    cancelled: "أُلغي التحقق. ما زالت اختيارات الإعداد محفوظة.",
    failed:
      "لم يكتمل التحقق من الجهاز. لم يتم اعتماد أي تغيير؛ حاول مرة أخرى.",
    "locked-out":
      "التحقق من الجهاز مقفل مؤقتًا. استخدم رمز دخول الجهاز أو حاول لاحقًا."
  }
};

export function onboardingDevicePreflightCopy(
  language: LanguageCode,
  capability: DeviceAuthCapability | null
): OnboardingDevicePreflightCopy {
  const method =
    capability?.kind === "available"
      ? capability.method
      : "device-passcode";
  if (language === "ar") {
    return {
      ...arabicPreflight,
      readyTitle: arabicPreflightReadyTitle(method),
      unavailableBody:
        capability?.kind === "unavailable" &&
        capability.reason !== "passcode-not-set"
          ? "تعذر على ALYR تأكيد حماية الجهاز. تحقق من إعدادات الأمان ثم حاول مرة أخرى. لن يُحفظ الإعداد قبل نجاح الفحص."
          : arabicPreflight.unavailableBody
    };
  }
  return {
    ...englishPreflight,
    readyTitle: englishPreflightReadyTitle(method),
    unavailableBody:
      capability?.kind === "unavailable" &&
      capability.reason !== "passcode-not-set"
        ? "ALYR could not confirm device protection. Check your security settings, then try again. Setup will not be saved before the check succeeds."
        : englishPreflight.unavailableBody
  };
}
