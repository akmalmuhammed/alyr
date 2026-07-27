import type {
  LanguageCode,
  PlaceClassification
} from "@/domain/model";

export interface CaptureCopy {
  readonly steps: readonly [
    string,
    string,
    string,
    string
  ];
  readonly quickPassport: string;
  readonly closeCapture: string;
  readonly draftRestored: string;
  readonly draftRestoredBody: string;
  readonly back: string;
  readonly skip: string;
  readonly savePassport: string;
  readonly saving: string;
  readonly assetName: string;
  readonly assetNamePlaceholder: string;
  readonly identityTitle: string;
  readonly identityBody: string;
  readonly category: string;
  readonly categoryChoices: string;
  readonly categoryFeatured: string;
  readonly browseAllCategories: string;
  readonly changeCategory: string;
  readonly searchCategories: string;
  readonly searchCategoriesPlaceholder: string;
  readonly clearCategorySearch: string;
  readonly noCategoryResults: string;
  readonly propertyIsPlace: string;
  readonly categoryGroupLabels: Readonly<Record<string, string>>;
  readonly takePhoto: string;
  readonly choosePhoto: string;
  readonly photo: string;
  readonly photoBody: string;
  readonly continue: string;
  readonly digitalTitle: string;
  readonly digitalBody: string;
  readonly digitalReference: string;
  readonly digitalReferenceBody: string;
  readonly locationTitle: string;
  readonly locationBody: string;
  readonly locationDetail: string;
  readonly locationQuestion: string;
  readonly locationChoices: string;
  readonly exactSpot: string;
  readonly exactSpotDescription: string;
  readonly placeOnly: string;
  readonly placeOnlyDescription: string;
  readonly unknown: string;
  readonly unknownDescription: string;
  readonly locatorClue: string;
  readonly locatorDescription: string;
  readonly locatorPlaceholder: string;
  readonly addPlace: string;
  readonly addPlaceEmpty: string;
  readonly roomOrContainer: string;
  readonly spaceKindLabels: Readonly<
    Record<"room" | "zone" | "container", string>
  >;
  readonly noRooms: string;
  readonly addLocationLater: string;
  readonly addLocationLaterBody: string;
  readonly newPlace: string;
  readonly addNewPlace: string;
  readonly placeDetails: string;
  readonly placeName: string;
  readonly placeNamePlaceholder: string;
  readonly placeClassification: string;
  readonly placeClassificationDescription: string;
  readonly placeClassificationChoices: Readonly<
    Record<
      PlaceClassification,
      {
        readonly label: string;
        readonly description: string;
      }
    >
  >;
  readonly address: string;
  readonly addressDescription: string;
  readonly addressPlaceholder: string;
  readonly region: string;
  readonly regionPlaceholder: string;
  readonly firstSpace: string;
  readonly firstSpaceDescription: string;
  readonly firstSpacePlaceholder: string;
  readonly confirmPropertyPin: string;
  readonly confirmPropertyPinDescription: string;
  readonly savePlace: string;
  readonly saveAndUsePlace: string;
  readonly closePlaceForm: string;
  readonly proof: string;
  readonly proofNotAdded: string;
  readonly removeDocument: string;
  readonly discardTitle: string;
  readonly discardBody: string;
  readonly keepEditing: string;
  readonly discardDraft: string;
  readonly notNow: string;
  readonly openSettings: string;
  readonly fileTooLarge: string;
  readonly fileTooLargeRecovery: string;
  readonly cameraPermission: string;
  readonly cameraPermissionRecovery: string;
  readonly cameraFailed: string;
  readonly cameraFailedRecovery: string;
  readonly photoPermission: string;
  readonly photoPermissionRecovery: string;
  readonly photoFailed: string;
  readonly photoFailedRecovery: string;
  readonly documentFailed: string;
  readonly documentFailedRecovery: string;
  readonly locationPermission: string;
  readonly locationPermissionRecovery: string;
  readonly nameError: string;
  readonly categoryError: string;
  readonly locationError: string;
  readonly exactLocationError: string;
  readonly placeError: string;
  readonly placeNameError: string;
  readonly propertyPinError: string;
  readonly unspecifiedRegion: string;
  readonly noPinNote: string;
  readonly evidenceTitle: string;
  readonly evidenceBody: string;
  readonly readyToAdd: string;
  readonly choosePdf: string;
  readonly fileLimit: string;
  readonly aboutDocument: string;
  readonly aboutDocumentBody: string;
  readonly reviewTitle: string;
  readonly reviewBody: string;
  readonly noPhysicalLocation: string;
  readonly unknownReminder: string;
  readonly placeNeedsDetail: string;
  readonly reviewLocation: string;
  readonly reviewProof: string;
  readonly notAdded: string;
  readonly reviewSaving: string;
  readonly savedDeviceFirst: string;
  readonly privateTitle: string;
  readonly privateBody: string;
  readonly sizeUnavailable: string;
  readonly categoryLabels: Readonly<Record<string, string>>;
}

export const CAPTURE_COPY: Readonly<Record<LanguageCode, CaptureCopy>> = {
  en: {
    steps: ["Details", "Location", "Proof", "Review"],
    quickPassport: "Quick Passport",
    closeCapture: "Close capture",
    draftRestored: "Draft restored",
    draftRestoredBody:
      "Continue where you left off. This draft stays protected on this device until you save or discard it.",
    back: "Back",
    skip: "Skip for now",
    savePassport: "Save Passport",
    saving: "Saving",
    assetName: "Asset name",
    assetNamePlaceholder: "e.g. GMT-Master II",
    identityTitle: "What are you preserving?",
    identityBody: "Give it a clear name and category. You can add more details later.",
    category: "Asset category",
    categoryChoices: "Asset category choices",
    categoryFeatured: "Common choices",
    browseAllCategories: "Browse all categories",
    changeCategory: "Change category",
    searchCategories: "Search asset categories",
    searchCategoriesPlaceholder: "Search categories",
    clearCategorySearch: "Clear category search",
    noCategoryResults: "No categories match this search.",
    propertyIsPlace:
      "Homes, apartments, land, and commercial property are organized separately as Places.",
    categoryGroupLabels: {
      "lifestyle-personal": "Watches & jewelry",
      vehicles: "Vehicles",
      "art-collectibles": "Art & collectibles",
      "home-storage": "Home & personal",
      "digital-records": "Digital & documents"
    },
    takePhoto: "Take photo",
    choosePhoto: "Choose photo",
    photo: "Photo",
    photoBody: "Add one so it is easy to recognize, or skip it for now.",
    continue: "Continue",
    digitalTitle: "No physical location needed",
    digitalBody: "Digital references do not need a room or map pin. Do not store passwords or recovery phrases here.",
    digitalReference: "Digital reference",
    digitalReferenceBody: "You can organize it without adding a physical place.",
    locationTitle: "Where can you retrieve it?",
    locationBody: "Choose what you know today. You can make the location more precise later.",
    locationDetail: "Location detail",
    locationQuestion: "What you know about the item's location",
    locationChoices: "Location detail choices",
    exactSpot: "Exact spot",
    exactSpotDescription: "You know the place and the room, container, or exact spot.",
    placeOnly: "Place only",
    placeOnlyDescription: "You know the property or building, but not the exact spot.",
    unknown: "I don't know yet",
    unknownDescription: "Save the item now and add its location when you remember.",
    locatorClue: "Locator clue",
    locatorDescription: "Optional retrieval detail",
    locatorPlaceholder: "Example: upper drawer, blue case, behind the framed print.",
    addPlace: "Add place",
    addPlaceEmpty: "Add a place here, or choose “I don't know yet” and continue.",
    roomOrContainer: "Room or container",
    spaceKindLabels: {
      room: "Room",
      zone: "Zone",
      container: "Container"
    },
    noRooms: "This place has no rooms yet. Add a helpful note or choose “Place only.”",
    addLocationLater: "Add the location later",
    addLocationLaterBody: "This Passport will keep a reminder so the item is not forgotten.",
    newPlace: "New place",
    addNewPlace: "Add a new place",
    placeDetails: "Place details",
    placeName: "Place name",
    placeNamePlaceholder: "e.g. West Bay Home",
    placeClassification: "How does this Place relate to you?",
    placeClassificationDescription:
      "Only property you explicitly mark as owned enters Portfolio counts and recorded values.",
    placeClassificationChoices: {
      owned_property: {
        label: "Owned property",
        description:
          "This household owns it, so it can appear in Portfolio."
      },
      rented_or_managed: {
        label: "Rented or managed",
        description:
          "Keep it as a Place without treating it as household property."
      },
      storage: {
        label: "Storage location",
        description:
          "A storage unit, warehouse or third-party holding location."
      },
      temporary: {
        label: "Temporary location",
        description:
          "For travel, repair, moving or another short-term location."
      },
      unknown: {
        label: "Not sure yet",
        description:
          "Save the Place now; it stays outside Portfolio until confirmed."
      }
    },
    address: "Address",
    addressDescription: "Street, building, or plot details.",
    addressPlaceholder: "Street or building, optional",
    region: "City or region",
    regionPlaceholder: "e.g. Doha",
    firstSpace: "First room or container",
    firstSpaceDescription: "Add the first room or container to make items easier to find.",
    firstSpacePlaceholder: "e.g. Study",
    confirmPropertyPin: "Confirm the property pin",
    confirmPropertyPinDescription: "Review the visible marker, then confirm this property pin before saving.",
    savePlace: "Save place",
    saveAndUsePlace: "Save and use this place",
    closePlaceForm: "Close place form",
    proof: "Proof",
    proofNotAdded: "Not added",
    removeDocument: "Remove document",
    discardTitle: "Discard this draft?",
    discardBody: "The current capture has not been saved.",
    keepEditing: "Keep editing",
    discardDraft: "Discard draft",
    notNow: "Not now",
    openSettings: "Open Settings",
    fileTooLarge: "File is over 10 MB",
    fileTooLargeRecovery: "Choose a smaller PDF or image. Your original file was not changed.",
    cameraPermission: "Camera permission is off",
    cameraPermissionRecovery: "Continue without a photo or enable camera access in system settings.",
    cameraFailed: "Camera did not open",
    cameraFailedRecovery: "Your draft is preserved. Try the photo library or continue without a photo.",
    photoPermission: "Photo access is off",
    photoPermissionRecovery: "Continue without a photo or enable selected-photo access in system settings.",
    photoFailed: "Photo could not be opened",
    photoFailedRecovery: "Your draft is preserved. Try another image.",
    documentFailed: "Document could not be attached",
    documentFailedRecovery: "Your draft is preserved. Try a PDF or image up to 10 MB.",
    locationPermission: "Location permission is off",
    locationPermissionRecovery: "Continue without a pin or enable location access in system settings.",
    nameError: "Name the item so you can find it again.",
    categoryError: "Choose the category that fits this item.",
    locationError: "Choose what you know about the item's location.",
    exactLocationError: "For an exact spot, choose a place and add a room, container, or helpful note.",
    placeError: "Choose the place you know, or select “I don't know yet.”",
    placeNameError: "Give this place a name, such as West Bay Home.",
    propertyPinError: "Review the visible marker, then confirm this property pin before saving.",
    unspecifiedRegion: "Unspecified region",
    noPinNote: "Without a pin, we will save only the city or region.",
    evidenceTitle: "Add proof or a document",
    evidenceBody: "Add a receipt, certificate, appraisal, or other useful file. You can review or replace it later.",
    readyToAdd: "Ready to add",
    choosePdf: "Choose PDF or image",
    fileLimit: "PDF or image · up to 10 MB",
    aboutDocument: "About this document",
    aboutDocumentBody: "Keep the original file beside this item for future reference.",
    reviewTitle: "Review your Passport",
    reviewBody: "Check the details before saving. You can update them anytime.",
    noPhysicalLocation: "Not needed for this digital reference",
    unknownReminder: "Not known yet · added to Today",
    placeNeedsDetail: "Place needs more detail",
    reviewLocation: "Location",
    reviewProof: "Proof",
    notAdded: "Not added",
    reviewSaving: "Saving",
    savedDeviceFirst: "Saved on this device first",
    privateTitle: "Private by default",
    privateBody: "The record stays in your household. Saving it does not invite anyone, and ALYR always shows whether cloud backup is available.",
    sizeUnavailable: "Size unavailable",
    categoryLabels: {
      "lifestyle.watch": "Watch",
      "lifestyle.jewelry": "Jewelry",
      "vehicle.car": "Car",
      "vehicle.motorcycle": "Motorbike",
      "art.painting": "Painting",
      "art.collectible": "Collectible",
      "home.electronics": "Electronics",
      "home.furniture": "Furniture",
      "home.other": "Personal item",
      "digital.asset": "Digital reference",
      "document.important": "Important document",
      "real-estate": "Real estate",
      "watches-jewelry": "Watches & jewelry",
      "art-collectibles": "Art & collectibles",
      vehicles: "Vehicles",
      electronics: "Electronics",
      documents: "Documents",
      digital: "Digital reference",
      other: "Other"
    }
  },
  ar: {
    steps: ["التفاصيل", "الموقع", "الإثبات", "المراجعة"],
    quickPassport: "جواز سريع",
    closeCapture: "إغلاق التسجيل",
    draftRestored: "تمت استعادة المسودة",
    draftRestoredBody:
      "تابع من حيث توقفت. تبقى هذه المسودة محمية على هذا الجهاز حتى تحفظها أو تتخلص منها.",
    back: "رجوع",
    skip: "تخطي الآن",
    savePassport: "حفظ الجواز",
    saving: "جارٍ الحفظ",
    assetName: "اسم الغرض",
    assetNamePlaceholder: "مثال: ساعة GMT‑Master II",
    identityTitle: "ما الغرض الذي تريد حفظه؟",
    identityBody: "أدخل اسمًا واضحًا وفئة مناسبة. ويمكنك إضافة التفاصيل لاحقًا.",
    category: "فئة الغرض",
    categoryChoices: "خيارات فئة الغرض",
    categoryFeatured: "خيارات شائعة",
    browseAllCategories: "استعراض جميع الفئات",
    changeCategory: "تغيير الفئة",
    searchCategories: "البحث في فئات الأغراض",
    searchCategoriesPlaceholder: "ابحث عن فئة",
    clearCategorySearch: "مسح بحث الفئات",
    noCategoryResults: "لا توجد فئات مطابقة لهذا البحث.",
    propertyIsPlace:
      "تُنظَّم المنازل والشقق والأراضي والعقارات التجارية بشكل منفصل ضمن الأماكن.",
    categoryGroupLabels: {
      "lifestyle-personal": "الساعات والمجوهرات",
      vehicles: "المركبات",
      "art-collectibles": "الفنون والمقتنيات",
      "home-storage": "المنزل والمقتنيات الشخصية",
      "digital-records": "الرقميات والمستندات"
    },
    takePhoto: "التقاط صورة",
    choosePhoto: "اختيار صورة",
    photo: "الصورة",
    photoBody: "أضف صورة ليسهل تمييز الغرض، أو تخطَّها الآن.",
    continue: "متابعة",
    digitalTitle: "لا يحتاج إلى موقع مادي",
    digitalBody: "لا تحتاج المراجع الرقمية إلى غرفة أو دبوس على الخريطة. لا تحفظ كلمات المرور أو عبارات الاسترداد هنا.",
    digitalReference: "مرجع رقمي",
    digitalReferenceBody: "يمكنك تنظيمه من دون إضافة مكان مادي.",
    locationTitle: "أين يمكنك العثور عليه؟",
    locationBody: "اختر ما تعرفه اليوم، ويمكنك زيادة دقة الموقع لاحقًا.",
    locationDetail: "تفاصيل الموقع",
    locationQuestion: "ما الذي تعرفه عن موقع الغرض؟",
    locationChoices: "خيارات تفاصيل الموقع",
    exactSpot: "الموضع الدقيق",
    exactSpotDescription: "تعرف المكان والغرفة أو الحاوية أو الموضع المحدد.",
    placeOnly: "المكان فقط",
    placeOnlyDescription: "تعرف العقار أو المبنى، لكن لا تعرف الموضع الدقيق.",
    unknown: "لا أعرف بعد",
    unknownDescription: "احفظ الغرض الآن وأضف موقعه عندما تتذكر.",
    locatorClue: "دليل الوصول",
    locatorDescription: "تفصيل اختياري يساعد على العثور عليه",
    locatorPlaceholder: "مثال: الدرج العلوي، الحافظة الزرقاء، خلف اللوحة.",
    addPlace: "إضافة مكان",
    addPlaceEmpty: "أضف مكانًا هنا، أو اختر «لا أعرف بعد» وتابع.",
    roomOrContainer: "الغرفة أو الحاوية",
    spaceKindLabels: {
      room: "غرفة",
      zone: "منطقة",
      container: "حاوية"
    },
    noRooms: "لا توجد غرف في هذا المكان بعد. أضف ملاحظة مفيدة أو اختر «المكان فقط».",
    addLocationLater: "أضف الموقع لاحقًا",
    addLocationLaterBody: "سيحتفظ الجواز بتذكير حتى لا يُنسى الغرض.",
    newPlace: "مكان جديد",
    addNewPlace: "إضافة مكان جديد",
    placeDetails: "تفاصيل المكان",
    placeName: "اسم المكان",
    placeNamePlaceholder: "مثال: منزل الخليج الغربي",
    placeClassification: "ما علاقة هذا المكان بك؟",
    placeClassificationDescription:
      "لا يدخل ضمن أعداد المحفظة وقيمها إلا العقار الذي تؤكد أن الأسرة تملكه.",
    placeClassificationChoices: {
      owned_property: {
        label: "عقار مملوك",
        description:
          "تملكه هذه الأسرة، لذا يمكن إدراجه ضمن المحفظة."
      },
      rented_or_managed: {
        label: "مستأجر أو مُدار",
        description:
          "يبقى مكاناً لتنظيم الأغراض من دون احتسابه ضمن عقارات الأسرة."
      },
      storage: {
        label: "موقع تخزين",
        description:
          "وحدة أو مستودع أو موقع تخزين تابع لطرف آخر."
      },
      temporary: {
        label: "موقع مؤقت",
        description:
          "للسفر أو الصيانة أو الانتقال أو أي استخدام قصير المدة."
      },
      unknown: {
        label: "غير متأكد بعد",
        description:
          "يُحفظ كمكان ويبقى خارج المحفظة حتى تؤكد الملكية."
      }
    },
    address: "العنوان",
    addressDescription: "تفاصيل الشارع أو المبنى أو الأرض.",
    addressPlaceholder: "الشارع أو المبنى، اختياري",
    region: "المدينة أو المنطقة",
    regionPlaceholder: "مثال: الدوحة",
    firstSpace: "أول غرفة أو حاوية",
    firstSpaceDescription: "أضف أول غرفة أو حاوية لتسهيل العثور على الأغراض.",
    firstSpacePlaceholder: "مثال: المكتب",
    confirmPropertyPin: "تأكيد دبوس العقار",
    confirmPropertyPinDescription: "راجع العلامة الظاهرة ثم أكّد دبوس العقار قبل الحفظ.",
    savePlace: "حفظ المكان",
    saveAndUsePlace: "حفظ المكان واستخدامه",
    closePlaceForm: "إغلاق نموذج المكان",
    proof: "الإثبات",
    proofNotAdded: "غير مضاف",
    removeDocument: "إزالة المستند",
    discardTitle: "تجاهل هذه المسودة؟",
    discardBody: "لم يُحفظ التسجيل الحالي.",
    keepEditing: "متابعة التعديل",
    discardDraft: "تجاهل المسودة",
    notNow: "ليس الآن",
    openSettings: "فتح الإعدادات",
    fileTooLarge: "حجم الملف يتجاوز 10 م.ب.",
    fileTooLargeRecovery: "اختر ملف PDF أو صورة أصغر. لم يتغير ملفك الأصلي.",
    cameraPermission: "صلاحية الكاميرا متوقفة",
    cameraPermissionRecovery: "تابع من دون صورة أو فعّل الكاميرا من إعدادات النظام.",
    cameraFailed: "تعذر فتح الكاميرا",
    cameraFailedRecovery: "مسودتك محفوظة. جرّب مكتبة الصور أو تابع من دون صورة.",
    photoPermission: "صلاحية الصور متوقفة",
    photoPermissionRecovery: "تابع من دون صورة أو فعّل الوصول إلى الصور المحددة من إعدادات النظام.",
    photoFailed: "تعذر فتح الصورة",
    photoFailedRecovery: "مسودتك محفوظة. جرّب صورة أخرى.",
    documentFailed: "تعذر إرفاق المستند",
    documentFailedRecovery: "مسودتك محفوظة. جرّب ملف PDF أو صورة لا تتجاوز 10 م.ب.",
    locationPermission: "صلاحية الموقع متوقفة",
    locationPermissionRecovery: "تابع من دون دبوس أو فعّل الموقع من إعدادات النظام.",
    nameError: "سمِّ الغرض حتى يسهل العثور عليه لاحقًا.",
    categoryError: "اختر الفئة الأنسب لهذا الغرض.",
    locationError: "اختر ما تعرفه عن موقع الغرض.",
    exactLocationError: "للموضع الدقيق، اختر مكانًا وأضف غرفة أو حاوية أو ملاحظة مفيدة.",
    placeError: "اختر المكان الذي تعرفه أو اختر «لا أعرف بعد».",
    placeNameError: "أدخل اسمًا للمكان، مثل منزل الخليج الغربي.",
    propertyPinError: "راجع العلامة الظاهرة ثم أكّد دبوس العقار قبل الحفظ.",
    unspecifiedRegion: "منطقة غير محددة",
    noPinNote: "من دون دبوس، سنحفظ المدينة أو المنطقة فقط.",
    evidenceTitle: "أضف إثباتًا أو مستندًا",
    evidenceBody: "أضف إيصالًا أو شهادة أو تقييمًا أو ملفًا مفيدًا آخر. ويمكنك مراجعته أو استبداله لاحقًا.",
    readyToAdd: "جاهز للإضافة",
    choosePdf: "اختيار ملف PDF أو صورة",
    fileLimit: "PDF أو صورة · حتى 10 م.ب.",
    aboutDocument: "عن هذا المستند",
    aboutDocumentBody: "احتفظ بالملف الأصلي مع هذا الغرض للرجوع إليه مستقبلًا.",
    reviewTitle: "راجع الجواز",
    reviewBody: "تحقق من التفاصيل قبل الحفظ. ويمكنك تحديثها في أي وقت.",
    noPhysicalLocation: "لا يحتاج هذا المرجع الرقمي إلى موقع",
    unknownReminder: "الموقع غير معروف بعد · أُضيف إلى اليوم",
    placeNeedsDetail: "يحتاج المكان إلى مزيد من التفاصيل",
    reviewLocation: "الموقع",
    reviewProof: "الإثبات",
    notAdded: "غير مضاف",
    reviewSaving: "الحفظ",
    savedDeviceFirst: "يُحفظ على هذا الجهاز أولًا",
    privateTitle: "خاص افتراضيًا",
    privateBody: "يبقى السجل داخل منزلك. لا يدعو الحفظ أي شخص، ويعرض ALYR دائمًا مدى توفر النسخ الاحتياطي السحابي.",
    sizeUnavailable: "الحجم غير متاح",
    categoryLabels: {
      "lifestyle.watch": "ساعة",
      "lifestyle.jewelry": "مجوهرات",
      "vehicle.car": "سيارة",
      "vehicle.motorcycle": "دراجة نارية",
      "property.house": "عقار",
      "art.painting": "لوحة فنية",
      "art.collectible": "مقتنى",
      "home.electronics": "إلكترونيات",
      "home.furniture": "أثاث",
      "home.other": "غرض شخصي",
      "digital.asset": "مرجع رقمي",
      "document.important": "مستند مهم",
      "real-estate": "العقارات",
      "watches-jewelry": "الساعات والمجوهرات",
      "art-collectibles": "الفنون والمقتنيات",
      vehicles: "المركبات",
      electronics: "الإلكترونيات",
      documents: "المستندات",
      digital: "مرجع رقمي",
      other: "أخرى"
    }
  }
};

export function getCaptureCopy(language: LanguageCode): CaptureCopy {
  return CAPTURE_COPY[language];
}

export function localizedCategoryLabel(
  categoryId: string,
  fallback: string,
  language: LanguageCode
): string {
  return CAPTURE_COPY[language].categoryLabels[categoryId] ?? fallback;
}
