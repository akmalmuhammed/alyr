import type { LanguageCode } from "@/domain/model";

export type AssetEditFocus = "photo" | "evidence" | "location" | "identity";

export interface AssetPhotoPreviewCopy {
  readonly illustrativeSampleLabel: (assetName: string) => string;
  readonly newPrimaryPhotoLabel: (assetName: string) => string;
  readonly currentPrimaryPhotoLabel: (assetName: string) => string;
  readonly openingProtectedPhoto: string;
  readonly protectedPhotoError: string;
  readonly sampleCategoryArtwork: string;
  readonly photoProtectedOnDevice: string;
  readonly noPrimaryPhoto: string;
  readonly sampleMetadataOnly: string;
  readonly selectedPhotoProtection: string;
}

export interface AssetEditCopy {
  readonly updatePassport: string;
  readonly passportNotFound: string;
  readonly passportNotFoundBody: string;
  readonly heading: Readonly<Record<AssetEditFocus, string>>;
  readonly guidance: Readonly<
    Record<AssetEditFocus, (assetName: string) => string>
  >;
  readonly saveLabel: Readonly<Record<AssetEditFocus, string>>;
  readonly saveHint: Readonly<
    Record<
      AssetEditFocus,
      {
        readonly ready: string;
        readonly blocked: string;
      }
    >
  >;
  readonly discardTitle: string;
  readonly discardBody: string;
  readonly keepEditing: string;
  readonly discardChanges: string;
  readonly changeCategory: string;
  readonly transition: Readonly<
    Record<
      "physical-to-virtual" | "virtual-to-physical",
      {
        readonly title: string;
        readonly message: string;
      }
    >
  >;
  readonly saveFailed: string;
  readonly digitalLocationNotNeeded: string;
  readonly readyToProtect: string;
  readonly noFileSelected: string;
  readonly privateFileLimit: string;
  readonly chooseAnotherFile: string;
  readonly chooseFile: string;
  readonly itemName: string;
  readonly itemNamePlaceholder: string;
  readonly categoryChoiceHint: string;
  readonly locationChoiceHint: string;
  readonly place: string;
  readonly addPlaceHint: string;
  readonly placeChoiceHint: string;
  readonly roomOrSpace: string;
  readonly roomChoiceHint: string;
  readonly retrievalClue: string;
  readonly retrievalCluePlaceholder: string;
  readonly retrievalTruth: (placeName: string) => string;
  readonly placePinDebtTitle: string;
  readonly placePinDebtBody: string;
  readonly reviewPlacePin: string;
  readonly reviewPlacePinHint: string;
  readonly photoSelected: (fileName: string, size: string) => string;
  readonly proofSelected: (fileName: string, size: string) => string;
  readonly photoPreview: AssetPhotoPreviewCopy;
}

/**
 * Unicode bidi isolation keeps user-entered names and filenames from
 * reordering punctuation in surrounding English or Arabic sentences.
 */
export function isolateDynamicText(value: string): string {
  return `\u2068${value}\u2069`;
}

export const ASSET_EDIT_COPY: Readonly<
  Record<LanguageCode, AssetEditCopy>
> = {
  en: {
    updatePassport: "Update Passport",
    passportNotFound: "Passport not found",
    passportNotFoundBody:
      "This record is not available in the current household.",
    heading: {
      photo: "Add a primary photo",
      evidence: "Attach useful proof",
      location: "Confirm the retrieval location",
      identity: "Finish the item identity"
    },
    guidance: {
      photo: (assetName) =>
        `Choose one clear image that helps your household recognize ${isolateDynamicText(assetName)}.`,
      evidence: () =>
        "A receipt, appraisal, certificate, or useful document is enough.",
      location: () =>
        "Record only what you know. Heldat keeps an unknown location visible.",
      identity: () =>
        "Use a specific name and the closest category. Both remain editable."
    },
    saveLabel: {
      photo: "Save photo",
      evidence: "Save proof",
      location: "Save location",
      identity: "Save identity"
    },
    saveHint: {
      photo: {
        ready: "Saves the selected photo to this Passport.",
        blocked: "Take or choose a photo before saving."
      },
      evidence: {
        ready: "Protects the selected proof with this Passport.",
        blocked: "Choose a PDF or image before saving."
      },
      location: {
        ready: "Saves this retrieval location.",
        blocked:
          "Change the location and complete the required Place or retrieval detail."
      },
      identity: {
        ready: "Saves this name and category.",
        blocked: "Change the name or category before saving."
      }
    },
    discardTitle: "Discard these changes?",
    discardBody: "This Passport has not been updated yet.",
    keepEditing: "Keep editing",
    discardChanges: "Discard changes",
    changeCategory: "Change category",
    transition: {
      "physical-to-virtual": {
        title: "Remove this item’s physical location?",
        message:
          "Saving clears its Place, space, retrieval clue, and property-pin link. The Place and its pin stay in your household."
      },
      "virtual-to-physical": {
        title: "Start with an unresolved physical location?",
        message:
          "Saving marks this item’s physical location as unresolved. Add a Place and retrieval clue after changing the category."
      }
    },
    saveFailed:
      "The update was not saved. Your changes are still here; try again.",
    digitalLocationNotNeeded:
      "Digital references do not need a physical retrieval location.",
    readyToProtect: "ready to protect",
    noFileSelected: "No file selected",
    privateFileLimit:
      "PDF or image · up to 10 MB · private to this household",
    chooseAnotherFile: "Choose another file",
    chooseFile: "Choose a file",
    itemName: "Item name",
    itemNamePlaceholder: "A name your household will recognize",
    categoryChoiceHint: "Selects this item category.",
    locationChoiceHint: "Sets what is known about this item’s location.",
    place: "Place",
    addPlaceHint: "Creates a Place, then returns it to this item.",
    placeChoiceHint: "Uses this Place for the item.",
    roomOrSpace: "Room or space",
    roomChoiceHint: "Uses this room or space for the item.",
    retrievalClue: "Retrieval clue",
    retrievalCluePlaceholder: "e.g. upper drawer, blue case",
    retrievalTruth: (placeName) =>
      `This saves the indoor retrieval clue. Property-pin accuracy is managed on ${isolateDynamicText(placeName)}.`,
    placePinDebtTitle: "Confirm the Place pin",
    placePinDebtBody:
      "The indoor retrieval detail can be saved now. Until this Place has a confirmed precise pin, the Passport saves the location as needing detail—not exact.",
    reviewPlacePin: "Review Place pin",
    reviewPlacePinHint:
      "Opens the Place pin editor. Your unsaved item changes stay on this screen.",
    photoSelected: (fileName, size) =>
      `${isolateDynamicText(fileName)}, ${size}, ready to save as the primary photo.`,
    proofSelected: (fileName, size) =>
      `${isolateDynamicText(fileName)}, ${size}, ready to protect as proof.`,
    photoPreview: {
      illustrativeSampleLabel: (assetName) =>
        `Illustrative sample image for ${isolateDynamicText(assetName)}`,
      newPrimaryPhotoLabel: (assetName) =>
        `New primary photo for ${isolateDynamicText(assetName)}`,
      currentPrimaryPhotoLabel: (assetName) =>
        `Current primary photo of ${isolateDynamicText(assetName)}`,
      openingProtectedPhoto: "Opening protected photo…",
      protectedPhotoError: "Protected photo could not be opened",
      sampleCategoryArtwork: "Sample category artwork",
      photoProtectedOnDevice: "Photo protected on this device",
      noPrimaryPhoto: "No primary photo yet",
      sampleMetadataOnly:
        "The sample record has photo metadata but no local image file.",
      selectedPhotoProtection:
        "A selected image is protected when you save it."
    }
  },
  ar: {
    updatePassport: "تحديث الجواز",
    passportNotFound: "الجواز غير موجود",
    passportNotFoundBody:
      "هذا السجل غير متاح ضمن المنزل الحالي.",
    heading: {
      photo: "إضافة صورة رئيسية",
      evidence: "إرفاق إثبات مفيد",
      location: "تأكيد موضع العثور على الغرض",
      identity: "استكمال هوية الغرض"
    },
    guidance: {
      photo: (assetName) =>
        `اختر صورة واضحة تساعد أفراد منزلك على تمييز ${isolateDynamicText(assetName)}.`,
      evidence: () =>
        "يكفي إرفاق إيصال أو تقييم أو شهادة أو مستند مفيد.",
      location: () =>
        "سجّل ما تعرفه فقط. يبقي Heldat الموقع غير المعروف ظاهرًا.",
      identity: () =>
        "استخدم اسمًا محددًا وأقرب فئة مناسبة. ويمكن تعديلهما لاحقًا."
    },
    saveLabel: {
      photo: "حفظ الصورة",
      evidence: "حفظ الإثبات",
      location: "حفظ الموقع",
      identity: "حفظ الهوية"
    },
    saveHint: {
      photo: {
        ready: "يحفظ الصورة المحددة في هذا الجواز.",
        blocked: "التقط صورة أو اخترها قبل الحفظ."
      },
      evidence: {
        ready: "يحمي الإثبات المحدد مع هذا الجواز.",
        blocked: "اختر ملف PDF أو صورة قبل الحفظ."
      },
      location: {
        ready: "يحفظ موضع العثور على الغرض.",
        blocked:
          "غيّر الموقع وأكمل المكان أو تفاصيل الوصول المطلوبة."
      },
      identity: {
        ready: "يحفظ هذا الاسم وهذه الفئة.",
        blocked: "غيّر الاسم أو الفئة قبل الحفظ."
      }
    },
    discardTitle: "تجاهل هذه التغييرات؟",
    discardBody: "لم يُحدّث هذا الجواز بعد.",
    keepEditing: "متابعة التعديل",
    discardChanges: "تجاهل التغييرات",
    changeCategory: "تغيير الفئة",
    transition: {
      "physical-to-virtual": {
        title: "إزالة الموقع المادي لهذا الغرض؟",
        message:
          "سيؤدي الحفظ إلى مسح المكان والمساحة ودليل الوصول ورابط دبوس العقار من الغرض. وسيبقى المكان ودبوسه ضمن منزلك."
      },
      "virtual-to-physical": {
        title: "البدء بموقع مادي غير محدد؟",
        message:
          "سيضع الحفظ علامة «غير محدد» على الموقع المادي لهذا الغرض. أضف مكانًا ودليل وصول بعد تغيير الفئة."
      }
    },
    saveFailed:
      "لم يُحفظ التحديث. بقيت تغييراتك ظاهرة؛ حاول مرة أخرى.",
    digitalLocationNotNeeded:
      "لا تحتاج المراجع الرقمية إلى موضع مادي للعثور عليها.",
    readyToProtect: "جاهز للحماية",
    noFileSelected: "لم يتم اختيار ملف",
    privateFileLimit:
      "PDF أو صورة · حتى 10 م.ب. · خاص بهذا المنزل",
    chooseAnotherFile: "اختيار ملف آخر",
    chooseFile: "اختيار ملف",
    itemName: "اسم الغرض",
    itemNamePlaceholder: "اسم واضح يتعرف عليه أفراد المنزل",
    categoryChoiceHint: "يحدد هذه الفئة للغرض.",
    locationChoiceHint: "يحدد ما هو معروف عن موقع الغرض.",
    place: "المكان",
    addPlaceHint: "ينشئ مكانًا ثم يعيده إلى هذا الغرض.",
    placeChoiceHint: "يستخدم هذا المكان للغرض.",
    roomOrSpace: "الغرفة أو المساحة",
    roomChoiceHint: "يستخدم هذه الغرفة أو المساحة للغرض.",
    retrievalClue: "دليل الوصول",
    retrievalCluePlaceholder: "مثال: الدرج العلوي، الحافظة الزرقاء",
    retrievalTruth: (placeName) =>
      `يحفظ هذا دليل الوصول داخل المكان. تُدار دقة دبوس العقار في ${isolateDynamicText(placeName)}.`,
    placePinDebtTitle: "أكّد دبوس المكان",
    placePinDebtBody:
      "يمكن حفظ دليل الوصول داخل المكان الآن. وحتى يتوفر دبوس دقيق ومؤكد، يُحفظ الموقع على أنه يحتاج إلى تفاصيل، وليس موقعًا دقيقًا.",
    reviewPlacePin: "مراجعة دبوس المكان",
    reviewPlacePinHint:
      "يفتح محرر دبوس المكان. تبقى تغييرات الغرض غير المحفوظة في هذه الشاشة.",
    photoSelected: (fileName, size) =>
      `${isolateDynamicText(fileName)}، ${size}، جاهزة للحفظ كصورة رئيسية.`,
    proofSelected: (fileName, size) =>
      `${isolateDynamicText(fileName)}، ${size}، جاهز للحماية كإثبات.`,
    photoPreview: {
      illustrativeSampleLabel: (assetName) =>
        `صورة توضيحية للعينة: ${isolateDynamicText(assetName)}`,
      newPrimaryPhotoLabel: (assetName) =>
        `الصورة الرئيسية الجديدة للغرض ${isolateDynamicText(assetName)}`,
      currentPrimaryPhotoLabel: (assetName) =>
        `الصورة الرئيسية الحالية للغرض ${isolateDynamicText(assetName)}`,
      openingProtectedPhoto: "جارٍ فتح الصورة المحمية…",
      protectedPhotoError: "تعذر فتح الصورة المحمية",
      sampleCategoryArtwork: "رسم توضيحي لفئة العينة",
      photoProtectedOnDevice: "الصورة محمية على هذا الجهاز",
      noPrimaryPhoto: "لا توجد صورة رئيسية بعد",
      sampleMetadataOnly:
        "يتضمن سجل العينة بيانات للصورة من دون ملف صورة محلي.",
      selectedPhotoProtection:
        "ستُحمى الصورة المحددة عند حفظها."
    }
  }
};

export function getAssetEditCopy(language: LanguageCode): AssetEditCopy {
  return ASSET_EDIT_COPY[language];
}

export function getAssetPhotoPreviewCopy(
  language: LanguageCode
): AssetPhotoPreviewCopy {
  return ASSET_EDIT_COPY[language].photoPreview;
}
