import type {
  LanguageCode,
  NativePlace,
  NativeRoom
} from "@/domain/model";

type LocationSource = NativePlace["locationSource"];
type SpaceKind = NativeRoom["kind"];

interface SpaceKindCopy {
  readonly label: string;
  readonly description: string;
}

export interface PlaceManagementCopy {
  readonly common: {
    readonly back: string;
    readonly keepEditing: string;
    readonly discard: string;
    readonly genericSaveError: string;
  };
  readonly placeEdit: {
    readonly screenTitle: string;
    readonly notFoundTitle: string;
    readonly notFoundBody: string;
    readonly discardTitle: string;
    readonly discardBody: string;
    readonly discardAction: string;
    readonly save: string;
    readonly kicker: string;
    readonly heading: string;
    readonly body: string;
    readonly nameLabel: string;
    readonly namePlaceholder: string;
    readonly regionLabel: string;
    readonly regionPlaceholder: string;
    readonly addressLabel: string;
    readonly addressDescription: string;
    readonly addressPlaceholder: string;
    readonly pinPreserved: string;
    readonly noPin: string;
    readonly source: string;
    readonly pinInstruction: string;
    readonly localTitle: string;
    readonly localBody: string;
  };
  readonly spaceEdit: {
    readonly screenTitleEdit: string;
    readonly screenTitleCreate: string;
    readonly notFoundTitle: string;
    readonly notFoundBody: string;
    readonly discardTitle: string;
    readonly discardBody: string;
    readonly discardAction: string;
    readonly save: string;
    readonly add: string;
    readonly headingEdit: string;
    readonly headingCreate: string;
    readonly createBody: string;
    readonly nameLabel: string;
    readonly namePlaceholder: string;
    readonly type: string;
    readonly inside: string;
    readonly insideBody: string;
    readonly topLevel: string;
    readonly noParent: string;
    readonly localTitle: string;
    readonly localBodyCreate: string;
    readonly localBodyEdit: string;
    readonly kinds: Readonly<Record<SpaceKind, SpaceKindCopy>>;
  };
  readonly placePin: {
    readonly screenTitle: string;
    readonly notFoundTitle: string;
    readonly notFoundBody: string;
    readonly discardTitle: string;
    readonly discardBody: string;
    readonly permissionTitle: string;
    readonly permissionBody: string;
    readonly notNow: string;
    readonly openSettings: string;
    readonly confirmationTitle: string;
    readonly confirmationBody: string;
    readonly save: string;
    readonly saveWithoutPin: string;
    readonly body: string;
  };
  readonly sourceLabels: Readonly<Record<LocationSource, string>>;
}

const ENGLISH_COPY: PlaceManagementCopy = {
  common: {
    back: "Back",
    keepEditing: "Keep editing",
    discard: "Discard",
    genericSaveError:
      "The update was not saved. Your edits are still here; review them and try again."
  },
  placeEdit: {
    screenTitle: "Edit Place",
    notFoundTitle: "Place not found",
    notFoundBody:
      "This Place is not available in the current household.",
    discardTitle: "Discard Place changes?",
    discardBody: "The name and address edits have not been saved.",
    discardAction: "Discard changes",
    save: "Save Place",
    kicker: "PLACE RECORD",
    heading: "Edit the useful basics",
    body:
      "Use names your household will recognise. Property coordinates and their provenance remain unchanged here.",
    nameLabel: "Place name",
    namePlaceholder: "West Bay home",
    regionLabel: "Region",
    regionPlaceholder: "Doha",
    addressLabel: "Address summary",
    addressDescription:
      "A retrieval-friendly summary; it does not replace the exact pin.",
    addressPlaceholder: "Building, street, district or plot reference",
    pinPreserved: "PROPERTY PIN PRESERVED",
    noPin: "No property-level pin",
    source: "Source",
    pinInstruction:
      "Adjust the marker only from the dedicated property-pin flow.",
    localTitle: "Saved to this device first",
    localBody:
      "Remote Place-metadata sync is not marked complete until the reviewed cloud contract supports these fields."
  },
  spaceEdit: {
    screenTitleEdit: "Edit space",
    screenTitleCreate: "Add space",
    notFoundTitle: "Space not found",
    notFoundBody:
      "This room, zone or container is not available in the selected Place.",
    discardTitle: "Discard space changes?",
    discardBody: "This room, zone or container has not been saved.",
    discardAction: "Discard changes",
    save: "Save space",
    add: "Add space",
    headingEdit: "Edit retrieval space",
    headingCreate: "Add a retrieval space",
    createBody:
      "Use the level someone would need when physically retrieving an item.",
    nameLabel: "Space name",
    namePlaceholder: "Study, archive cabinet or upper drawer",
    type: "Type",
    inside: "Inside",
    insideBody:
      "Optional. Nest a zone or container beneath the space someone reaches first.",
    topLevel: "Top level in this Place",
    noParent: "No parent space",
    localTitle: "Local-first hierarchy",
    localBodyCreate:
      "New spaces enter the current sync outbox after they are saved on this device.",
    localBodyEdit:
      "Edits stay explicitly on this device until the reviewed space-update command is available.",
    kinds: {
      room: {
        label: "Room",
        description: "A named interior area"
      },
      zone: {
        label: "Zone",
        description: "A section within a larger space"
      },
      container: {
        label: "Container",
        description: "A cabinet, safe, box or drawer"
      }
    }
  },
  placePin: {
    screenTitle: "Property pin",
    notFoundTitle: "Place not found",
    notFoundBody:
      "This location is not available in the current household.",
    discardTitle: "Discard pin changes?",
    discardBody: "The property pin has not been saved.",
    permissionTitle: "Location permission is off",
    permissionBody:
      "Allow location access in Settings, or enter the coordinates manually.",
    notNow: "Not now",
    openSettings: "Open Settings",
    confirmationTitle: "Confirm the property pin",
    confirmationBody:
      "Review the visible marker, then use “Confirm this property pin” before saving.",
    save: "Save property pin",
    saveWithoutPin: "Save without a pin",
    body:
      "Place the marker on the intended property. GPS accuracy describes the phone reading, not a survey boundary."
  },
  sourceLabels: {
    device_gps: "Device GPS",
    user_pin: "Pin placed by you",
    manual_coordinates: "Coordinates entered manually",
    not_set: "Not set"
  }
};

const ARABIC_COPY: PlaceManagementCopy = {
  common: {
    back: "رجوع",
    keepEditing: "متابعة التعديل",
    discard: "تجاهل",
    genericSaveError:
      "لم يُحفظ التحديث. ما زالت تعديلاتك ظاهرة؛ راجعها ثم حاول مرة أخرى."
  },
  placeEdit: {
    screenTitle: "تعديل المكان",
    notFoundTitle: "المكان غير موجود",
    notFoundBody: "هذا المكان غير متاح ضمن المنزل الحالي.",
    discardTitle: "هل تريد تجاهل تعديلات المكان؟",
    discardBody: "لم تُحفظ تعديلات الاسم والعنوان.",
    discardAction: "تجاهل التعديلات",
    save: "حفظ المكان",
    kicker: "سجل المكان",
    heading: "عدّل البيانات الأساسية",
    body:
      "استخدم أسماء يتعرّف إليها أفراد المنزل. تبقى إحداثيات العقار ومصدرها كما هي في هذا التعديل.",
    nameLabel: "اسم المكان",
    namePlaceholder: "منزل الخليج الغربي",
    regionLabel: "المنطقة",
    regionPlaceholder: "الدوحة",
    addressLabel: "ملخص العنوان",
    addressDescription:
      "وصف يساعد على الوصول إلى المكان؛ ولا يحل محل الدبوس الدقيق.",
    addressPlaceholder: "المبنى أو الشارع أو الحي أو مرجع قطعة الأرض",
    pinPreserved: "دبوس العقار محفوظ",
    noPin: "لا يوجد دبوس على مستوى العقار",
    source: "المصدر",
    pinInstruction: "عدّل العلامة من مسار دبوس العقار المخصص فقط.",
    localTitle: "يُحفظ على هذا الجهاز أولاً",
    localBody:
      "لا تظهر مزامنة بيانات المكان البعيدة مكتملة حتى يدعم العقد السحابي المُراجع هذه الحقول."
  },
  spaceEdit: {
    screenTitleEdit: "تعديل المساحة",
    screenTitleCreate: "إضافة مساحة",
    notFoundTitle: "المساحة غير موجودة",
    notFoundBody:
      "هذه الغرفة أو النطاق أو الحاوية غير متاحة في المكان المحدد.",
    discardTitle: "هل تريد تجاهل تعديلات المساحة؟",
    discardBody: "لم تُحفظ هذه الغرفة أو المنطقة أو الحاوية.",
    discardAction: "تجاهل التعديلات",
    save: "حفظ المساحة",
    add: "إضافة المساحة",
    headingEdit: "عدّل مساحة الوصول",
    headingCreate: "أضف مساحة للوصول",
    createBody:
      "اختر المستوى الذي يحتاج إليه شخص للوصول فعليًا إلى الغرض.",
    nameLabel: "اسم المساحة",
    namePlaceholder: "غرفة المكتب أو خزانة الأرشيف أو الدرج العلوي",
    type: "النوع",
    inside: "داخل",
    insideBody:
      "اختياري. ضع النطاق أو الحاوية تحت أول مساحة يصل إليها الشخص.",
    topLevel: "المستوى الأعلى في هذا المكان",
    noParent: "بلا مساحة رئيسية",
    localTitle: "تسلسل محلي أولاً",
    localBodyCreate:
      "تدخل المساحات الجديدة قائمة انتظار المزامنة بعد حفظها على هذا الجهاز.",
    localBodyEdit:
      "تبقى التعديلات على هذا الجهاز بوضوح حتى يتوفر أمر تحديث المساحة المُراجع.",
    kinds: {
      room: {
        label: "غرفة",
        description: "مساحة داخلية مسماة"
      },
      zone: {
        label: "نطاق",
        description: "جزء ضمن مساحة أكبر"
      },
      container: {
        label: "حاوية",
        description: "خزانة أو خزنة أو صندوق أو درج"
      }
    }
  },
  placePin: {
    screenTitle: "دبوس العقار",
    notFoundTitle: "المكان غير موجود",
    notFoundBody: "هذا الموقع غير متاح ضمن المنزل الحالي.",
    discardTitle: "هل تريد تجاهل تعديلات الدبوس؟",
    discardBody: "لم يُحفظ دبوس العقار.",
    permissionTitle: "الوصول إلى الموقع متوقف",
    permissionBody:
      "اسمح بالوصول إلى الموقع من الإعدادات، أو أدخل الإحداثيات يدويًا.",
    notNow: "ليس الآن",
    openSettings: "فتح الإعدادات",
    confirmationTitle: "أكّد دبوس العقار",
    confirmationBody:
      "راجع العلامة الظاهرة، ثم اختر «أكّد دبوس هذا العقار» قبل الحفظ.",
    save: "حفظ دبوس العقار",
    saveWithoutPin: "الحفظ بلا دبوس",
    body:
      "ضع العلامة على العقار المقصود. توضّح دقة GPS قراءة الهاتف، ولا تمثل حدود المسح العقاري."
  },
  sourceLabels: {
    device_gps: "موقع الجهاز (GPS)",
    user_pin: "دبوس حددته أنت",
    manual_coordinates: "إحداثيات أُدخلت يدويًا",
    not_set: "غير محدد"
  }
};

export const PLACE_MANAGEMENT_COPY: Readonly<
  Record<LanguageCode, PlaceManagementCopy>
> = {
  en: ENGLISH_COPY,
  ar: ARABIC_COPY
};

export function getPlaceManagementCopy(
  language: LanguageCode
): PlaceManagementCopy {
  return PLACE_MANAGEMENT_COPY[language];
}

export function formatSpaceKind(
  kind: SpaceKind,
  language: LanguageCode
): string {
  return PLACE_MANAGEMENT_COPY[language].spaceEdit.kinds[kind].label;
}

export function spaceUsageSummary(
  count: number,
  language: LanguageCode
): string {
  const normalized = Math.max(0, Math.trunc(count));
  if (language === "en") {
    return `${normalized} ${
      normalized === 1 ? "item uses" : "items use"
    } this stable space ID. Renaming it keeps those locations connected.`;
  }

  if (normalized === 0) {
    return "لا ترتبط أغراض بمعرّف هذه المساحة الثابت. سيبقى تغيير الاسم متصلاً بالمواقع الحالية.";
  }
  if (normalized === 1) {
    return "يرتبط غرض واحد بمعرّف هذه المساحة الثابت. سيبقى موقعه متصلاً عند تغيير الاسم.";
  }
  if (normalized === 2) {
    return "يرتبط غرضان بمعرّف هذه المساحة الثابت. سيبقى موقعاهما متصلين عند تغيير الاسم.";
  }

  const formatted = new Intl.NumberFormat("ar-QA", {
    useGrouping: false
  }).format(normalized);
  if (normalized >= 3 && normalized <= 10) {
    return `ترتبط ${formatted} أغراض بمعرّف هذه المساحة الثابت. ستبقى مواقعها متصلة عند تغيير الاسم.`;
  }
  return `يرتبط ${formatted} غرضًا بمعرّف هذه المساحة الثابت. ستبقى مواقعها متصلة عند تغيير الاسم.`;
}

const ARABIC_ERROR_MAP: Readonly<Record<string, string>> = {
  "Choose a workspace before updating a Place.":
    "اختر منزلاً قبل تحديث المكان.",
  "Choose a workspace before adding a space.":
    "اختر منزلاً قبل إضافة مساحة.",
  "Choose a workspace before updating a space.":
    "اختر منزلاً قبل تحديث المساحة.",
  "This Place is not available in the current household.":
    "هذا المكان غير متاح ضمن المنزل الحالي.",
  "Place name is required.": "أدخل اسم المكان.",
  "Place name must be 80 characters or fewer.":
    "يجب ألا يتجاوز اسم المكان ٨٠ حرفًا.",
  "Region is required.": "أدخل المنطقة.",
  "Region must be 80 characters or fewer.":
    "يجب ألا يتجاوز اسم المنطقة ٨٠ حرفًا.",
  "Address summary must be 240 characters or fewer.":
    "يجب ألا يتجاوز ملخص العنوان ٢٤٠ حرفًا.",
  "Space name is required.": "أدخل اسم المساحة.",
  "Space name must be 80 characters or fewer.":
    "يجب ألا يتجاوز اسم المساحة ٨٠ حرفًا.",
  "Choose a parent space inside this Place.":
    "اختر مساحة رئيسية داخل هذا المكان.",
  "A space cannot sit inside itself or one of its children.":
    "لا يمكن وضع المساحة داخل نفسها أو داخل إحدى مساحاتها الفرعية.",
  "The current space hierarchy contains a cycle.":
    "يتضمن تسلسل المساحات الحالي حلقة غير صالحة.",
  "This space is not available inside the selected Place.":
    "هذه المساحة غير متاحة داخل المكان المحدد.",
  "Choose valid latitude and longitude coordinates.":
    "أدخل إحداثيات صحيحة لخطّي العرض والطول.",
  "Confirm the visible property pin before saving it.":
    "أكّد دبوس العقار الظاهر قبل حفظه.",
  "The device GPS reading is missing its accuracy.":
    "لا تتضمن قراءة GPS دقة الجهاز.",
  "A manually placed pin must remain user-placed.":
    "يجب أن يبقى الدبوس اليدوي مصنفًا كدبوس حدده المستخدم.",
  "The update could not be saved.":
    "لم يُحفظ التحديث. ما زالت تعديلاتك ظاهرة."
};

export function placeManagementErrorMessage(
  message: string,
  language: LanguageCode
): string {
  if (language === "en") return message;
  return ARABIC_ERROR_MAP[message] ?? ARABIC_COPY.common.genericSaveError;
}

export function isolateCoordinates(
  latitude: number,
  longitude: number
): string {
  return `\u2066${latitude.toFixed(6)}, ${longitude.toFixed(6)}\u2069`;
}
