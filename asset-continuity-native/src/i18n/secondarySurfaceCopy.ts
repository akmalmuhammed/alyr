import { useMemo } from "react";

import {
  atlasPinDisclosure,
  type AtlasPinDisclosure
} from "@/domain/atlas";
import type { LanguageCode } from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";
import { RecoveryKitError } from "@/recovery/types";
import { recoveryErrorMessage } from "@/recovery/uiMessages";
import type { RecoveryUnavailableReason } from "@/recovery/journey";

export type AssetListStateKey =
  | "archived"
  | "ready"
  | "needs-location"
  | "needs-proof"
  | "add-photo"
  | "in-progress";

interface RecoveryUnavailableCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly nextStep: string;
}

interface SecondarySurfaceCopy {
  readonly atlas: {
    readonly eyebrow: string;
    readonly title: string;
    readonly intro: string;
    readonly viewLabel: string;
    readonly globe: string;
    readonly list: string;
    readonly selectedRegion: string;
    readonly noMappedRegion: string;
    readonly mappedPlace: string;
    readonly mappedPlaces: string;
    readonly pinSelectHint: string;
    readonly dragHint: string;
    readonly previousPlace: string;
    readonly nextPlace: string;
    readonly noPropertyPins: string;
    readonly addPinToBegin: string;
    readonly selectedPlace: string;
    readonly openPlace: string;
    readonly openPlaceHint: string;
    readonly atlasStart: string;
    readonly addFirstPin: string;
    readonly firstPinBody: string;
    readonly addPlace: string;
    readonly locationWorkTitle: string;
    readonly locationWorkHint: string;
    readonly noItemsTitle: string;
    readonly noItemsBody: string;
    readonly everyPlace: string;
    readonly listBody: string;
    readonly openExactPlaceHint: string;
    readonly selected: string;
    readonly noPlacesTitle: string;
    readonly noPlacesBody: string;
    readonly pinNeededNoCoordinate: string;
  };
  readonly recovery: {
    readonly create: {
      readonly eyebrow: string;
      readonly title: string;
      readonly intro: string;
      readonly successEyebrow: string;
      readonly successTitle: string;
      readonly successBody: string;
      readonly protectedEyebrow: string;
      readonly protectedTitle: string;
      readonly protectedBody: string;
      readonly backupNeededTitle: string;
      readonly backupNeededBody: string;
      readonly shareSheetReturnedTitle: string;
      readonly shareSheetReturnedBody: string;
      readonly confirmExternalCopy: string;
      readonly confirmExternalCopyHint: string;
      readonly confirmedAt: string;
      readonly verification: string;
      readonly file: string;
      readonly size: string;
      readonly protectedFiles: string;
      readonly protection: string;
      readonly sha256: string;
      readonly share: string;
      readonly createAnother: string;
      readonly protectsEyebrow: string;
      readonly protectsTitle: string;
      readonly protectsBody: string;
      readonly choosePassphrase: string;
      readonly choosePassphraseBody: string;
      readonly passphrase: string;
      readonly confirmPassphrase: string;
      readonly minimumError: string;
      readonly mismatchError: string;
      readonly create: string;
      readonly createHint: string;
      readonly footnote: string;
    };
    readonly import: {
      readonly eyebrow: string;
      readonly title: string;
      readonly intro: string;
      readonly completeTitle: string;
      readonly completeBody: string;
      readonly openVault: string;
      readonly replaceTitle: string;
      readonly keepCurrent: string;
      readonly replaceAndRestore: string;
      readonly previewEyebrow: string;
      readonly previewTitle: string;
      readonly previewBody: string;
      readonly created: string;
      readonly items: string;
      readonly places: string;
      readonly proofRecords: string;
      readonly protectedFiles: string;
      readonly kitId: string;
      readonly sha256: string;
      readonly dangerBody: string;
      readonly confirmationLabel: string;
      readonly reviewReplacement: string;
      readonly chooseDifferent: string;
      readonly localCheckEyebrow: string;
      readonly localCheckTitle: string;
      readonly localCheckBody: string;
      readonly openVerify: string;
      readonly openVerifyBody: string;
      readonly passphrase: string;
      readonly chooseVerify: string;
      readonly chooseVerifyHint: string;
    };
    readonly unavailable: Readonly<
      Record<RecoveryUnavailableReason, RecoveryUnavailableCopy>
    >;
  };
  readonly assetList: {
    readonly openHint: string;
    readonly digitalLocation: string;
    readonly unknownLocation: string;
    readonly states: Readonly<
      Record<
        AssetListStateKey,
        {
          readonly label: string;
          readonly accessibilityLabel: string;
        }
      >
    >;
    readonly dueFallback: string;
    readonly dueFallbackAccessibility: string;
  };
  readonly portfolio: {
    readonly preparing: string;
    readonly preparingDetail: string;
    readonly unavailableTitle: string;
    readonly unavailableDetail: string;
    readonly unavailablePreserved: string;
    readonly continueSetup: string;
  };
}

export const SECONDARY_SURFACE_COPY: Readonly<
  Record<LanguageCode, SecondarySurfaceCopy>
> = {
  en: {
    atlas: {
      eyebrow: "PRIVATE LOCATION OVERVIEW",
      title: "Atlas",
      intro:
        "See where your Places are, then open the property record for exact retrieval details and documents.",
      viewLabel: "Atlas view",
      globe: "Globe",
      list: "List",
      selectedRegion: "SELECTED REGION",
      noMappedRegion: "No mapped region",
      mappedPlace: "MAPPED PLACE",
      mappedPlaces: "MAPPED PLACES",
      pinSelectHint: "Selects and centers this Place",
      dragHint:
        "Drag to explore. Use previous and next Place for an exact selection.",
      previousPlace: "Previous Place",
      nextPlace: "Next Place",
      noPropertyPins: "NO PROPERTY PINS",
      addPinToBegin: "Add a Place pin to begin",
      selectedPlace: "SELECTED PLACE",
      openPlace: "Open Place",
      openPlaceHint: "Opens documents, spaces and retrieval details",
      atlasStart: "ATLAS START",
      addFirstPin: "Add your first property pin",
      firstPinBody:
        "Homes, plots, offices and storage locations appear here after you place their pins.",
      addPlace: "Add a Place",
      locationWorkTitle: "Location records to finish",
      locationWorkHint: "Opens the matching filtered register",
      noItemsTitle: "No items assigned here",
      noItemsBody:
        "This Place has a property pin, but no active Passport points to it yet.",
      everyPlace: "Every Place",
      listBody:
        "This accessible list stays complete when a pin is unplaced or on the far side of the globe.",
      openExactPlaceHint: "Opens the exact Place record",
      selected: "SELECTED",
      noPlacesTitle: "No Places recorded",
      noPlacesBody:
        "Start with a home, apartment, plot, office or storage location.",
      pinNeededNoCoordinate: "Pin needed · no coordinate recorded"
    },
    recovery: {
      create: {
        eyebrow: "PORTABLE ENCRYPTED COPY",
        title: "Create Recovery Kit",
        intro:
          "Protect a local copy of this household register and its on-device proof with a passphrase only you know.",
        successEyebrow: "VERIFIED ENCRYPTED FILE",
        successTitle: "Encrypted kit created on this device",
        successBody:
          "Heldat read the stored encrypted bytes again and matched their SHA-256 checksum. This local file is not yet an independent backup.",
        protectedEyebrow: "INDEPENDENT COPY CONFIRMED",
        protectedTitle: "Recovery backup protected",
        protectedBody:
          "You confirmed that another encrypted copy is stored outside Heldat on this device. Keep its passphrase separately.",
        backupNeededTitle: "Save another copy before leaving",
        backupNeededBody:
          "A kit inside Heldat can be lost with this device. Share it to Files, a trusted drive or another device, then confirm below.",
        shareSheetReturnedTitle: "Did you save it somewhere else?",
        shareSheetReturnedBody:
          "Returning from the share sheet does not prove that a copy was saved. Confirm only after you can find the .alyrkit file outside Heldat.",
        confirmExternalCopy: "I saved another copy",
        confirmExternalCopyHint:
          "Confirms that an encrypted copy now exists outside Heldat on this device",
        confirmedAt: "External copy confirmed",
        verification: "Verification",
        file: "File",
        size: "Size",
        protectedFiles: "Protected files",
        protection: "Protection",
        sha256: "SHA-256",
        share: "Share encrypted kit",
        createAnother: "Create another kit",
        protectsEyebrow: "WHAT THIS PROTECTS",
        protectsTitle: "Register, Places and proof",
        protectsBody:
          "The passphrase is processed with Argon2id. The resulting key protects the kit with AES-256-GCM. Heldat does not save the passphrase.",
        choosePassphrase: "Choose a passphrase",
        choosePassphraseBody:
          "Use 12 or more characters. Store it separately; Heldat has no reset link for a local Recovery Kit.",
        passphrase: "Passphrase",
        confirmPassphrase: "Confirm passphrase",
        minimumError: "Use at least 12 characters.",
        mismatchError: "The two passphrases do not match.",
        create: "Create encrypted kit",
        createHint:
          "Creates and verifies one encrypted Heldat Recovery Kit",
        footnote:
          "This is a file you control, not automatic cloud backup. Keep a second copy somewhere you trust."
      },
      import: {
        eyebrow: "VERIFY BEFORE REPLACE",
        title: "Restore Recovery Kit",
        intro:
          "Open an encrypted .alyrkit file, review its authenticated summary, then choose whether it should replace this local workspace.",
        completeTitle: "Recovery complete",
        completeBody:
          "The verified household register replaced the previous local workspace.",
        openVault: "Open Vault",
        replaceTitle: "Replace this local workspace?",
        keepCurrent: "Keep current data",
        replaceAndRestore: "Replace and restore",
        previewEyebrow: "AUTHENTICATED PREVIEW",
        previewTitle: "Kit decrypted and verified",
        previewBody:
          "AES-GCM authentication, container structure and every included checksum passed. No change has been applied yet.",
        created: "Created",
        items: "Items",
        places: "Places",
        proofRecords: "Proof records",
        protectedFiles: "Protected files",
        kitId: "Kit ID",
        sha256: "SHA-256",
        dangerBody:
          "Restore replaces the current local workspace. It does not merge records. A failed transaction rolls back before the imported workspace becomes visible.",
        confirmationLabel: "Destructive confirmation",
        reviewReplacement: "Review final replacement",
        chooseDifferent: "Choose a different kit",
        localCheckEyebrow: "PRIVATE LOCAL CHECK",
        localCheckTitle: "Nothing changes during preview",
        localCheckBody:
          "The selected encrypted file is read into bounded memory. Heldat does not create a plaintext temporary workspace or proof file.",
        openVerify: "Open and verify",
        openVerifyBody:
          "Enter the passphrase first. The file picker accepts one Heldat Recovery Kit up to 64 MB.",
        passphrase: "Recovery Kit passphrase",
        chooseVerify: "Choose kit and verify",
        chooseVerifyHint:
          "Opens the file picker, decrypts one Recovery Kit in memory, and shows a preview without restoring"
      },
      unavailable: {
        "preview-runtime": {
          eyebrow: "RECOVERY PROTECTION",
          title: "Recovery Kit is available in the installed Heldat app",
          description:
            "This personal preview does not include the device-grade encryption and protected storage required for a Recovery Kit. Nothing has been exported or restored.",
          nextStep:
            "Continue testing the rest of Heldat here. Recovery stays off in this preview."
        },
        "argon2id-unavailable": {
          eyebrow: "RECOVERY PROTECTION",
          title: "Recovery protection is not available in this build",
          description:
            "This build is missing the device-grade protection required to create or open a Recovery Kit. Nothing has been exported or restored.",
          nextStep:
            "Install a newer signed Heldat build before using Recovery Kit."
        },
        "vault-locked": {
          eyebrow: "RECOVERY PROTECTION",
          title: "Unlock the private vault first",
          description:
            "Heldat has not opened the encrypted household register, so no Recovery Kit has been exported or restored.",
          nextStep: "Unlock the vault, then return to Recovery Kit."
        }
      }
    },
    assetList: {
      openHint: "Opens this Asset Passport",
      digitalLocation: "No physical location needed",
      unknownLocation: "Location unknown",
      states: {
        archived: {
          label: "Archived",
          accessibilityLabel: "Archived Passport"
        },
        ready: {
          label: "Ready",
          accessibilityLabel: "Passport ready"
        },
        "needs-location": {
          label: "Needs location",
          accessibilityLabel: "Passport needs a location"
        },
        "needs-proof": {
          label: "Needs proof",
          accessibilityLabel: "Passport needs supporting proof"
        },
        "add-photo": {
          label: "Add photo",
          accessibilityLabel: "Passport needs a primary photo"
        },
        "in-progress": {
          label: "In progress",
          accessibilityLabel: "Passport in progress"
        }
      },
      dueFallback: "Review due",
      dueFallbackAccessibility: "Evidence review due"
    },
    portfolio: {
      preparing: "Preparing portfolio",
      preparingDetail: "Reading your on-device register.",
      unavailableTitle: "Set up your portfolio",
      unavailableDetail:
        "Finish the private workspace setup before opening this view.",
      unavailablePreserved:
        "Setup did not finish. Any local data already saved was preserved.",
      continueSetup: "Continue setup"
    }
  },
  ar: {
    atlas: {
      eyebrow: "نظرة خاصة على المواقع",
      title: "الأطلس",
      intro:
        "اعرف أين توجد أماكنك، ثم افتح سجل العقار للوصول إلى تفاصيل العثور والمستندات.",
      viewLabel: "طريقة عرض الأطلس",
      globe: "الكرة الأرضية",
      list: "القائمة",
      selectedRegion: "المنطقة المحددة",
      noMappedRegion: "لا توجد منطقة مثبتة",
      mappedPlace: "مكان مثبت",
      mappedPlaces: "أماكن مثبتة",
      pinSelectHint: "يحدد هذا المكان ويضعه في مركز العرض",
      dragHint:
        "اسحب لاستكشاف الخريطة. استخدم المكان السابق أو التالي لتحديد دقيق.",
      previousPlace: "المكان السابق",
      nextPlace: "المكان التالي",
      noPropertyPins: "لا توجد دبابيس للعقارات",
      addPinToBegin: "أضف دبوسًا لمكان للبدء",
      selectedPlace: "المكان المحدد",
      openPlace: "فتح المكان",
      openPlaceHint: "يفتح المستندات والمساحات وتفاصيل العثور",
      atlasStart: "ابدأ الأطلس",
      addFirstPin: "أضف أول دبوس لعقار",
      firstPinBody:
        "تظهر المنازل والأراضي والمكاتب ومواقع التخزين هنا بعد تثبيت دبابيسها.",
      addPlace: "إضافة مكان",
      locationWorkTitle: "سجلات المواقع التي تحتاج إلى إكمال",
      locationWorkHint: "يفتح السجل المصفّى المطابق",
      noItemsTitle: "لا توجد أغراض مسندة هنا",
      noItemsBody:
        "لهذا المكان دبوس عقار، لكن لا يشير إليه أي جواز نشط بعد.",
      everyPlace: "جميع الأماكن",
      listBody:
        "تبقى هذه القائمة الميسّرة كاملة حتى إذا لم يُثبت الدبوس أو كان المكان في الجهة الأخرى من الكرة الأرضية.",
      openExactPlaceHint: "يفتح سجل المكان الدقيق",
      selected: "محدد",
      noPlacesTitle: "لا توجد أماكن مسجلة",
      noPlacesBody:
        "ابدأ بمنزل أو شقة أو أرض أو مكتب أو موقع تخزين.",
      pinNeededNoCoordinate: "يحتاج إلى دبوس · لم تُسجل إحداثيات"
    },
    recovery: {
      create: {
        eyebrow: "نسخة مشفرة قابلة للنقل",
        title: "إنشاء حزمة استرداد",
        intro:
          "احمِ نسخة محلية من سجل الأسرة وإثباتاته المحفوظة على الجهاز بعبارة مرور لا يعرفها سواك.",
        successEyebrow: "ملف مشفّر تم التحقق منه",
        successTitle: "أُنشئت حزمة مشفّرة على هذا الجهاز",
        successBody:
          "أعادت Heldat قراءة البيانات المشفّرة وطابقت بصمة SHA-256. هذا الملف المحلي ليس نسخة احتياطية مستقلة بعد.",
        protectedEyebrow: "تم تأكيد النسخة المستقلة",
        protectedTitle: "نسخة الاستعادة الاحتياطية محمية",
        protectedBody:
          "أكدتَ حفظ نسخة مشفّرة أخرى خارج Heldat على هذا الجهاز. احتفظ بعبارة المرور في مكان منفصل.",
        backupNeededTitle: "احفظ نسخة أخرى قبل المغادرة",
        backupNeededBody:
          "قد تُفقد الحزمة الموجودة داخل Heldat مع هذا الجهاز. شاركها إلى تطبيق الملفات أو مساحة موثوقة أو جهاز آخر، ثم أكد ذلك أدناه.",
        shareSheetReturnedTitle: "هل حفظت النسخة في مكان آخر؟",
        shareSheetReturnedBody:
          "العودة من نافذة المشاركة لا تثبت حفظ نسخة. أكد فقط بعد العثور على ملف .alyrkit خارج Heldat.",
        confirmExternalCopy: "حفظت نسخة أخرى",
        confirmExternalCopyHint:
          "يؤكد وجود نسخة مشفّرة خارج Heldat على هذا الجهاز",
        confirmedAt: "تم تأكيد النسخة الخارجية",
        verification: "التحقق",
        file: "الملف",
        size: "الحجم",
        protectedFiles: "الملفات المحمية",
        protection: "الحماية",
        sha256: "SHA-256",
        share: "مشاركة الحزمة المشفرة",
        createAnother: "إنشاء حزمة أخرى",
        protectsEyebrow: "ما الذي تحميه هذه الحزمة",
        protectsTitle: "السجل والأماكن والإثباتات",
        protectsBody:
          "تُعالج عبارة المرور باستخدام Argon2id، ثم يحمي المفتاح الناتج الحزمة بتشفير AES-256-GCM. لا تحفظ Heldat عبارة المرور.",
        choosePassphrase: "اختر عبارة مرور",
        choosePassphraseBody:
          "استخدم 12 حرفًا أو أكثر واحفظها في مكان منفصل؛ لا يوجد رابط لإعادة تعيين عبارة مرور حزمة الاسترداد المحلية.",
        passphrase: "عبارة المرور",
        confirmPassphrase: "تأكيد عبارة المرور",
        minimumError: "استخدم 12 حرفًا على الأقل.",
        mismatchError: "عبارتا المرور غير متطابقتين.",
        create: "إنشاء الحزمة المشفرة",
        createHint:
          "ينشئ حزمة استرداد Heldat مشفرة واحدة ويتحقق منها",
        footnote:
          "هذا ملف تتحكم فيه، وليس نسخًا احتياطيًا سحابيًا تلقائيًا. احتفظ بنسخة ثانية في مكان تثق به."
      },
      import: {
        eyebrow: "تحقق قبل الاستبدال",
        title: "استعادة حزمة الاسترداد",
        intro:
          "افتح ملف .alyrkit مشفرًا وراجع ملخصه الموثق، ثم قرر ما إذا كان سيستبدل مساحة العمل المحلية.",
        completeTitle: "اكتملت الاستعادة",
        completeBody:
          "استبدل سجل الأسرة الذي تم التحقق منه مساحة العمل المحلية السابقة.",
        openVault: "فتح الخزنة",
        replaceTitle: "استبدال مساحة العمل المحلية؟",
        keepCurrent: "الاحتفاظ بالبيانات الحالية",
        replaceAndRestore: "الاستبدال والاستعادة",
        previewEyebrow: "معاينة موثقة",
        previewTitle: "فُك تشفير الحزمة وتم التحقق منها",
        previewBody:
          "نجح توثيق AES-GCM وفحص بنية الحاوية وكل البصمات المضمّنة. لم يُطبق أي تغيير بعد.",
        created: "تاريخ الإنشاء",
        items: "الأغراض",
        places: "الأماكن",
        proofRecords: "سجلات الإثبات",
        protectedFiles: "الملفات المحمية",
        kitId: "معرّف الحزمة",
        sha256: "SHA-256",
        dangerBody:
          "تستبدل الاستعادة مساحة العمل المحلية الحالية ولا تدمج السجلات. عند فشل المعاملة، تتراجع العملية قبل إظهار مساحة العمل المستوردة.",
        confirmationLabel: "تأكيد الاستبدال",
        reviewReplacement: "مراجعة الاستبدال النهائي",
        chooseDifferent: "اختيار حزمة أخرى",
        localCheckEyebrow: "فحص محلي خاص",
        localCheckTitle: "لا يتغير شيء أثناء المعاينة",
        localCheckBody:
          "يُقرأ الملف المشفر المحدد في ذاكرة محدودة. لا تنشئ Heldat مساحة عمل مؤقتة أو ملف إثبات بنص مكشوف.",
        openVerify: "الفتح والتحقق",
        openVerifyBody:
          "أدخل عبارة المرور أولًا. يقبل منتقي الملفات حزمة استرداد Heldat واحدة حتى 64 م.ب.",
        passphrase: "عبارة مرور حزمة الاسترداد",
        chooseVerify: "اختيار الحزمة والتحقق",
        chooseVerifyHint:
          "يفتح منتقي الملفات ويفك تشفير حزمة استرداد واحدة في الذاكرة ويعرض معاينة من دون استعادة"
      },
      unavailable: {
        "preview-runtime": {
          eyebrow: "حماية الاسترداد",
          title: "تتوفر حزمة الاسترداد في تطبيق Heldat المثبت",
          description:
            "لا تتضمن هذه المعاينة الشخصية تشفير الجهاز والتخزين المحمي اللازمين لحزمة الاسترداد. لم يُصدّر أو يُستعد أي شيء.",
          nextStep:
            "تابع اختبار بقية Heldat هنا. تبقى الاستعادة متوقفة في هذه المعاينة."
        },
        "argon2id-unavailable": {
          eyebrow: "حماية الاسترداد",
          title: "حماية الاسترداد غير متوفرة في هذا الإصدار",
          description:
            "يفتقد هذا الإصدار حماية الجهاز اللازمة لإنشاء حزمة استرداد أو فتحها. لم يُصدّر أو يُستعد أي شيء.",
          nextStep:
            "ثبّت إصدارًا أحدث وموقّعًا من Heldat قبل استخدام حزمة الاسترداد."
        },
        "vault-locked": {
          eyebrow: "حماية الاسترداد",
          title: "افتح الخزنة الخاصة أولًا",
          description:
            "لم تفتح Heldat سجل الأسرة المشفر، لذلك لم يُصدّر أو يُستعد أي شيء.",
          nextStep: "افتح الخزنة، ثم ارجع إلى حزمة الاسترداد."
        }
      }
    },
    assetList: {
      openHint: "يفتح جواز هذا الغرض",
      digitalLocation: "لا يحتاج إلى موقع مادي",
      unknownLocation: "الموقع غير معروف",
      states: {
        archived: {
          label: "مؤرشف",
          accessibilityLabel: "جواز مؤرشف"
        },
        ready: {
          label: "جاهز",
          accessibilityLabel: "الجواز جاهز"
        },
        "needs-location": {
          label: "يحتاج إلى موقع",
          accessibilityLabel: "الجواز يحتاج إلى موقع"
        },
        "needs-proof": {
          label: "يحتاج إلى إثبات",
          accessibilityLabel: "الجواز يحتاج إلى إثبات داعم"
        },
        "add-photo": {
          label: "أضف صورة",
          accessibilityLabel: "الجواز يحتاج إلى صورة رئيسية"
        },
        "in-progress": {
          label: "قيد الإكمال",
          accessibilityLabel: "الجواز قيد الإكمال"
        }
      },
      dueFallback: "المراجعة مستحقة",
      dueFallbackAccessibility: "مراجعة الإثبات مستحقة"
    },
    portfolio: {
      preparing: "جارٍ تجهيز المحفظة",
      preparingDetail: "تُقرأ سجلاتك المحفوظة على هذا الجهاز.",
      unavailableTitle: "أكمل إعداد محفظتك",
      unavailableDetail:
        "أكمل إعداد مساحة العمل الخاصة قبل فتح هذا العرض.",
      unavailablePreserved:
        "لم يكتمل الإعداد. حُفظت أي بيانات محلية سبق تسجيلها.",
      continueSetup: "متابعة الإعداد"
    }
  }
};

const numberFormatters = new Map<LanguageCode, Intl.NumberFormat>();

export function formatLocalizedNumber(
  value: number,
  language: LanguageCode
): string {
  let formatter = numberFormatters.get(language);
  if (!formatter) {
    formatter = new Intl.NumberFormat(
      language === "ar" ? "ar-QA" : "en-GB",
      { maximumFractionDigits: 1 }
    );
    numberFormatters.set(language, formatter);
  }
  return formatter.format(value);
}

function arabicCount(
  value: number,
  forms: {
    readonly zero: string;
    readonly one: string;
    readonly two: string;
    readonly few: string;
    readonly many: string;
  }
): string {
  if (value === 0) return forms.zero;
  if (value === 1) return forms.one;
  if (value === 2) return forms.two;
  const plural = new Intl.PluralRules("ar").select(value);
  return `${formatLocalizedNumber(value, "ar")} ${
    plural === "few" ? forms.few : forms.many
  }`;
}

export function atlasItemCount(
  count: number,
  language: LanguageCode
): string {
  if (language === "en") return `${count} ${count === 1 ? "item" : "items"}`;
  return arabicCount(count, {
    zero: "لا أغراض",
    one: "غرض واحد",
    two: "غرضان",
    few: "أغراض",
    many: "غرضًا"
  });
}

export function atlasPlaceCount(
  count: number,
  language: LanguageCode
): string {
  if (language === "en") return `${count} ${count === 1 ? "Place" : "Places"}`;
  return arabicCount(count, {
    zero: "لا أماكن",
    one: "مكان واحد",
    two: "مكانان",
    few: "أماكن",
    many: "مكانًا"
  });
}

export function atlasMappedPlaceCount(
  count: number,
  language: LanguageCode
): string {
  if (language === "en") {
    return `${count} mapped ${count === 1 ? "Place" : "Places"}`;
  }
  if (count === 0) return "لا توجد أماكن مثبتة";
  if (count === 1) return "مكان واحد مثبت";
  if (count === 2) return "مكانان مثبتان";
  return `${formatLocalizedNumber(count, "ar")} أماكن مثبتة`;
}

export function atlasMappedPlaceLabel(
  count: number,
  language: LanguageCode
): string {
  if (language === "en") return count === 1 ? "mapped Place" : "mapped Places";
  if (count === 1) return "مكان مثبت";
  if (count === 2) return "مكانان مثبتان";
  return "أماكن مثبتة";
}

export function atlasSpaceCount(
  count: number,
  language: LanguageCode
): string {
  if (language === "en") return `${count} ${count === 1 ? "space" : "spaces"}`;
  return arabicCount(count, {
    zero: "لا مساحات",
    one: "مساحة واحدة",
    two: "مساحتان",
    few: "مساحات",
    many: "مساحة"
  });
}

export function atlasPositionLabel(
  current: number,
  total: number,
  language: LanguageCode
): string {
  if (language === "en") return `${current} OF ${total}`;
  return `${formatLocalizedNumber(current, "ar")} من ${formatLocalizedNumber(
    total,
    "ar"
  )}`;
}

export function atlasItemsAt(
  placeName: string,
  language: LanguageCode
): string {
  return language === "ar"
    ? `الأغراض في \u2068${placeName}\u2069`
    : `Items at ${placeName}`;
}

export function atlasLocationWork(
  kind: "unpinned" | "review" | "unplaced",
  count: number,
  language: LanguageCode
): string {
  if (language === "en") {
    if (kind === "unpinned") {
      return `${count} ${count === 1 ? "Place needs" : "Places need"} a pin`;
    }
    if (kind === "review") {
      return `${count} ${count === 1 ? "pin needs" : "pins need"} review`;
    }
    return `${count} ${count === 1 ? "item has" : "items have"} no Place`;
  }
  if (kind === "unpinned") {
    if (count === 1) return "مكان واحد يحتاج إلى دبوس";
    if (count === 2) return "مكانان يحتاجان إلى دبوس";
    return `${formatLocalizedNumber(count, "ar")} أماكن تحتاج إلى دبابيس`;
  }
  if (kind === "review") {
    if (count === 1) return "دبوس واحد يحتاج إلى مراجعة";
    if (count === 2) return "دبوسان يحتاجان إلى مراجعة";
    return `${formatLocalizedNumber(count, "ar")} دبابيس تحتاج إلى مراجعة`;
  }
  if (count === 1) return "غرض واحد بلا مكان";
  if (count === 2) return "غرضان بلا مكان";
  return `${formatLocalizedNumber(count, "ar")} أغراض بلا مكان`;
}

export function atlasGlobeAccessibilityLabel(
  mappedCount: number,
  visibleCount: number,
  selected: { readonly name: string; readonly region: string } | null,
  language: LanguageCode
): string {
  if (language === "en") {
    return `Globe overview. ${atlasMappedPlaceCount(
      mappedCount,
      language
    )}. ${visibleCount} on the visible hemisphere.${
      selected
        ? ` Selected Place: ${selected.name}, ${selected.region}.`
        : ""
    }`;
  }
  const selection = selected
    ? ` المكان المحدد: \u2068${selected.name}\u2069، \u2068${selected.region}\u2069.`
    : "";
  return `نظرة على الكرة الأرضية. ${atlasMappedPlaceCount(
    mappedCount,
    language
  )}. ${atlasPlaceCount(
    visibleCount,
    language
  )} في النصف الظاهر.${selection}`;
}

export function localizedAtlasPinDisclosure(
  location: AtlasPinDisclosure,
  language: LanguageCode
): string {
  if (language === "en") return atlasPinDisclosure(location);

  const accuracy =
    location.horizontalAccuracyMeters !== null &&
    Number.isFinite(location.horizontalAccuracyMeters) &&
    location.horizontalAccuracyMeters >= 0
      ? Math.round(location.horizontalAccuracyMeters)
      : null;

  if (location.precision === "locality_only") {
    return location.confirmedAt === null
      ? "المنطقة فقط · يحتاج إلى تأكيد"
      : "المنطقة فقط · لا يوجد دبوس دقيق";
  }

  if (
    location.locationSource === "user_pin" ||
    location.locationSource === "manual_coordinates"
  ) {
    return location.confirmedAt === null
      ? "دبوس موضوع يدويًا · يحتاج إلى تأكيد"
      : "دبوس موضوع يدويًا · لا توجد دقة GPS مقاسة";
  }

  if (location.locationSource === "device_gps") {
    const method =
      location.precision === "approximate"
        ? "دبوس GPS تقريبي"
        : "دبوس GPS";
    if (location.confirmedAt === null) {
      return `${method} · يحتاج إلى تأكيد`;
    }
    return accuracy === null
      ? `${method} مؤكد · لم تُسجل الدقة`
      : `${method} مؤكد · الدقة المقاسة ±${formatLocalizedNumber(
          accuracy,
          "ar"
        )} م`;
  }

  return location.confirmedAt === null
    ? "مصدر الدبوس غير مسجل · يحتاج إلى تأكيد"
    : "مصدر الدبوس غير مسجل";
}

export function getRecoveryUnavailableCopy(
  reason: RecoveryUnavailableReason,
  language: LanguageCode
): RecoveryUnavailableCopy {
  return SECONDARY_SURFACE_COPY[language].recovery.unavailable[reason];
}

export function localizedRecoveryErrorMessage(
  error: unknown,
  language: LanguageCode
): string {
  if (language === "en") return recoveryErrorMessage(error);
  if (!(error instanceof RecoveryKitError)) {
    return "لم تكتمل عملية حزمة الاسترداد. حُفظت بياناتك الحالية.";
  }
  switch (error.code) {
    case "AUTHENTICATION_FAILED":
      return "عبارة المرور غير صحيحة أو تغيرت حزمة الاسترداد. لم تُستعد أي بيانات.";
    case "CORRUPT_CONTAINER":
      return "هذا الملف ليس حزمة استرداد Heldat سليمة. لم تُستعد أي بيانات.";
    case "UNSUPPORTED_VERSION":
      return "تحتاج حزمة الاسترداد هذه إلى إصدار أحدث ومتوافق من Heldat.";
    case "INVALID_PASSPHRASE":
      return "استخدم عبارة مرور من 12 حرفًا على الأقل.";
    case "LIMIT_EXCEEDED":
      return "تتجاوز حزمة الاسترداد حدود الحجم المسموحة في النسخة التجريبية.";
    case "CRYPTO_UNAVAILABLE":
      return "حماية الاسترداد غير متوفرة في هذا الإصدار.";
    case "RESTORE_REJECTED":
      return "لم تُطبق الاستعادة لأن فحص الأمان النهائي لم ينجح. حُفظت بياناتك الحالية.";
    case "STORAGE_FAILED":
      return "تعذرت قراءة حزمة الاسترداد المشفرة أو حفظها. حُفظت بياناتك الحالية.";
    default:
      return "لم يكتمل التحقق من حزمة الاسترداد. حُفظت بياناتك الحالية.";
  }
}

export function formatRecoveryByteSize(
  bytes: number,
  language: LanguageCode
): string {
  const units =
    language === "ar"
      ? { bytes: "بايت", kilobytes: "ك.ب.", megabytes: "م.ب." }
      : { bytes: "B", kilobytes: "KB", megabytes: "MB" };
  if (bytes < 1024) {
    return `${formatLocalizedNumber(bytes, language)} ${units.bytes}`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatLocalizedNumber(
      Math.round(bytes / 1024),
      language
    )} ${units.kilobytes}`;
  }
  return `${formatLocalizedNumber(
    Math.round((bytes / (1024 * 1024)) * 10) / 10,
    language
  )} ${units.megabytes}`;
}

export function formatRecoveryDate(
  value: string,
  language: LanguageCode
): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(
    language === "ar" ? "ar-QA" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  ).format(parsed);
}

export function recoveryConfirmationDescription(
  token: string,
  language: LanguageCode
): string {
  return language === "ar"
    ? `اكتب \u2066${token}\u2069 لفتح التأكيد النهائي.`
    : `Type ${token} to unlock the final confirmation.`;
}

export function recoveryReplaceAlertBody(
  householdName: string,
  language: LanguageCode
): string {
  return language === "ar"
    ? `سيستبدل هذا سجل الأسرة الحالي بسجل «\u2068${householdName}\u2069». لن تُدمج مساحة العمل المحلية الحالية.`
    : `This replaces the current household register with “${householdName}”. The current local workspace is not merged.`;
}

export function shouldStackSecondaryMetadata(
  width: number,
  fontScale: number
): boolean {
  return width <= 360 || fontScale >= 1.2;
}

export function getAssetListStateCopy(
  state: AssetListStateKey,
  language: LanguageCode
) {
  return SECONDARY_SURFACE_COPY[language].assetList.states[state];
}

export function formatEvidenceDeadline(
  value: string,
  language: LanguageCode
): {
  readonly label: string;
  readonly accessibilityLabel: string;
} {
  const copy = SECONDARY_SURFACE_COPY[language].assetList;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      label: copy.dueFallback,
      accessibilityLabel: copy.dueFallbackAccessibility
    };
  }
  const locale = language === "ar" ? "ar-QA" : "en-GB";
  const compact = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short"
  }).format(date);
  const full = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
  return language === "ar"
    ? {
        label: `يستحق ${compact}`,
        accessibilityLabel: `موعد مراجعة الإثبات ${full}`
      }
    : {
        label: `Due ${compact}`,
        accessibilityLabel: `Evidence deadline ${full}`
      };
}

export function assetListAccessibilityLabel(
  assetName: string,
  category: string,
  state: string,
  location: string,
  language: LanguageCode
): string {
  return language === "ar"
    ? `\u2068${assetName}\u2069، ${category}، ${state}، الموقع: \u2068${location}\u2069`
    : `${assetName}, ${category}, ${state}, ${location}`;
}

export function getSecondarySurfaceCopy(
  language: LanguageCode
): SecondarySurfaceCopy {
  return SECONDARY_SURFACE_COPY[language];
}

export function useSecondarySurfaceCopy() {
  const { language, locale, rtl } = useLocale();
  return useMemo(
    () => ({
      copy: SECONDARY_SURFACE_COPY[language],
      language,
      locale,
      rtl
    }),
    [language, locale, rtl]
  );
}
