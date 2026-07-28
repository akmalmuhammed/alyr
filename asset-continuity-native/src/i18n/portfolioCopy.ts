import type {
  LanguageCode,
  LiabilityKind,
  NativeLiability
} from "@/domain/model";
import type { NetPositionStatus } from "@/domain/netPosition";

export interface PortfolioExperienceCopy {
  readonly netPosition: {
    readonly eyebrow: string;
    readonly noTotal: string;
    readonly introduction: string;
    readonly showAmounts: string;
    readonly hideAmounts: string;
    readonly assets: string;
    readonly liabilities: string;
    readonly net: string;
    readonly currenciesSeparate: string;
    readonly boundary: string;
    readonly explain: string;
    readonly hideExplanation: string;
    readonly explanationTitle: string;
    readonly explanationLines: readonly string[];
    readonly status: Readonly<Record<NetPositionStatus, string>>;
    readonly reviewRequired: string;
    readonly exactUnavailable: string;
    readonly asOfRange: (oldest: string, newest: string) => string;
  };
  readonly liabilities: {
    readonly title: string;
    readonly subtitle: string;
    readonly add: string;
    readonly active: string;
    readonly archived: string;
    readonly currentBalance: string;
    readonly noBalance: string;
    readonly balanceNeedsReview: string;
    readonly reviewBalance: string;
    readonly noActiveTitle: string;
    readonly noActiveBody: string;
    readonly confirmNone: string;
    readonly confirmNoneTitle: string;
    readonly confirmNoneBody: string;
    readonly confirmNoneAction: string;
    readonly noneConfirmed: string;
    readonly noneConfirmedUntil: (date: string) => string;
    readonly noneReviewExpired: string;
    readonly noneReviewChangedTitle: string;
    readonly noneReviewChangedBody: string;
    readonly archivedCount: (count: number) => string;
  };
  readonly create: {
    readonly eyebrow: string;
    readonly title: string;
    readonly introduction: string;
    readonly name: string;
    readonly namePlaceholder: string;
    readonly nameDescription: string;
    readonly nameError: string;
    readonly category: string;
    readonly categoryDescription: string;
    readonly categoryError: string;
    readonly amount: string;
    readonly amountPlaceholder: string;
    readonly amountDescription: string;
    readonly showAmount: string;
    readonly hideAmount: string;
    readonly currency: string;
    readonly currencyDescription: string;
    readonly otherCurrency: string;
    readonly other: string;
    readonly currencyError: string;
    readonly asOf: string;
    readonly dateDescription: string;
    readonly datePlaceholder: string;
    readonly dateError: string;
    readonly futureDateError: string;
    readonly save: string;
    readonly savingHint: string;
    readonly truthTitle: string;
    readonly truthBody: string;
    readonly discardTitle: string;
    readonly discardBody: string;
    readonly keepEditing: string;
    readonly discard: string;
  };
  readonly detail: {
    readonly eyebrow: string;
    readonly notFound: string;
    readonly notFoundBody: string;
    readonly status: string;
    readonly balance: string;
    readonly balanceAsOf: (date: string) => string;
    readonly noBalance: string;
    readonly addBalance: string;
    readonly updateBalance: string;
    readonly edit: string;
    readonly saveDetails: string;
    readonly cancel: string;
    readonly concurrentUpdateTitle: string;
    readonly concurrentUpdateBody: string;
    readonly reloadUpdatedDetails: string;
    readonly confirmReplace: string;
    readonly replaceConfirmed: string;
    readonly history: string;
    readonly historyBody: string;
    readonly current: string;
    readonly previous: string;
    readonly archive: string;
    readonly restore: string;
    readonly markPaidOff: string;
    readonly paidOffTitle: string;
    readonly paidOffBody: string;
    readonly paidOffConfirm: string;
    readonly paidOffRecorded: string;
    readonly delete: string;
    readonly deleteTitle: string;
    readonly deleteBody: string;
    readonly deleteConfirm: string;
    readonly deleteCancel: string;
    readonly archivedNotice: string;
    readonly dataBoundary: string;
  };
  readonly balance: {
    readonly eyebrow: string;
    readonly title: string;
    readonly introduction: string;
    readonly current: string;
    readonly noCurrent: string;
    readonly save: string;
    readonly update: string;
    readonly concurrentUpdateTitle: string;
    readonly concurrentUpdateBody: string;
    readonly reloadUpdatedBalance: string;
    readonly confirmReplace: string;
    readonly replaceConfirmed: string;
    readonly truthTitle: string;
    readonly truthBody: string;
  };
  readonly common: {
    readonly back: string;
    readonly current: string;
    readonly previous: string;
    readonly active: string;
    readonly archived: string;
    readonly queued: string;
    readonly synced: string;
    readonly onDevice: string;
    readonly needsAttention: string;
  };
}

const ENGLISH: PortfolioExperienceCopy = {
  netPosition: {
    eyebrow: "TRACKED NET POSITION",
    noTotal: "Review to calculate",
    introduction:
      "A dated view of the assets and liabilities you chose to record.",
    showAmounts: "Show tracked financial amounts",
    hideAmounts: "Hide tracked financial amounts",
    assets: "Recorded assets",
    liabilities: "Recorded liabilities",
    net: "Tracked net position",
    currenciesSeparate: "Currencies stay separate. No exchange rate is applied.",
    boundary:
      "Recorded assets minus recorded liabilities—not a bank balance, live valuation or complete statement of net worth.",
    explain: "How this is calculated",
    hideExplanation: "Hide calculation details",
    explanationTitle: "Calculation boundary",
    explanationLines: [
      "The latest dated value recorded for each active asset, property and liability.",
      "Each currency is calculated independently; currencies are never combined.",
      "Missing values stay missing and are never treated as zero.",
      "Taxes, selling costs, unrecorded accounts and market movement remain outside this view."
    ],
    status: {
      empty: "Start with one asset or liability to build this view.",
      "assets-unvalued":
        "Your register has assets, but no dated asset values yet.",
      "liabilities-unreviewed":
        "Review liabilities before treating this as a net position.",
      partial:
        "Some assets have no recorded value and remain outside the calculation.",
      recorded: "Recorded asset and liability coverage is current.",
      stale: "One or more liability balances need a fresh review.",
      "exact-total-unavailable":
        "An exact total is outside the supported calculation range."
    },
    reviewRequired: "Liability review required",
    exactUnavailable: "Exact total unavailable",
    asOfRange: (oldest, newest) =>
      oldest === newest
        ? `Records dated ${newest}`
        : `Records dated ${oldest}–${newest}`
  },
  liabilities: {
    title: "Liabilities",
    subtitle:
      "Mortgages, loans, cards and other obligations recorded by your household.",
    add: "Add liability",
    active: "Active",
    archived: "Archived",
    currentBalance: "Current recorded balance",
    noBalance: "Balance not recorded",
    balanceNeedsReview: "Balance needs review",
    reviewBalance: "Review balance",
    noActiveTitle: "No active liabilities recorded",
    noActiveBody:
      "Add an obligation, or confirm that you currently track none. The confirmation expires after 90 days.",
    confirmNone: "I have none to record",
    confirmNoneTitle: "Confirm no liabilities",
    confirmNoneBody:
      "This records a dated household review. It is not financial verification and will ask for review again in 90 days.",
    confirmNoneAction: "Confirm for today",
    noneConfirmed: "No liabilities recorded",
    noneConfirmedUntil: (date) => `Reviewed; check again by ${date}`,
    noneReviewExpired: "Your no-liabilities review has expired.",
    noneReviewChangedTitle: "Liability activity changed",
    noneReviewChangedBody:
      "Your previous no-liabilities review is no longer current. Review again to confirm the household still has none.",
    archivedCount: (count) =>
      `${count} archived ${count === 1 ? "liability" : "liabilities"}`
  },
  create: {
    eyebrow: "FINANCIAL CONTINUITY",
    title: "Add a liability",
    introduction:
      "Record the obligation and the latest balance you know. ALYR does not connect to an account or estimate the balance.",
    name: "Liability name",
    namePlaceholder: "Home mortgage",
    nameDescription: "Use a name your household will recognize.",
    nameError: "Enter a liability name.",
    category: "Category",
    categoryDescription: "Choose the closest practical category.",
    categoryError: "Choose a category.",
    amount: "Recorded balance",
    amountPlaceholder: "125000.00",
    amountDescription:
      "Enter the outstanding balance as a positive amount. It will be subtracted in net position.",
    showAmount: "Show balance while typing",
    hideAmount: "Hide balance while typing",
    currency: "Currency",
    currencyDescription: "Choose a currency or enter a three-letter ISO code.",
    otherCurrency: "Other currency",
    other: "Other",
    currencyError: "Enter a supported three-letter currency code.",
    asOf: "Balance date",
    dateDescription: "Use YYYY-MM-DD.",
    datePlaceholder: "2026-07-28",
    dateError: "Enter a valid calendar date as YYYY-MM-DD.",
    futureDateError: "The balance date cannot be in the future.",
    save: "Add liability",
    savingHint: "Saves the liability and first dated balance to this device.",
    truthTitle: "What this means",
    truthBody:
      "This is a household-entered balance, not a lender statement or verified payoff amount. Keep the source document separately when it matters.",
    discardTitle: "Discard this liability?",
    discardBody: "The name, category and balance have not been saved.",
    keepEditing: "Keep editing",
    discard: "Discard"
  },
  detail: {
    eyebrow: "LIABILITY RECORD",
    notFound: "Liability not found",
    notFoundBody:
      "This liability is not available in the current household.",
    status: "Status",
    balance: "Recorded balance",
    balanceAsOf: (date) => `As of ${date}`,
    noBalance: "No balance has been recorded.",
    addBalance: "Record balance",
    updateBalance: "Record updated balance",
    edit: "Edit details",
    saveDetails: "Save details",
    cancel: "Cancel",
    concurrentUpdateTitle: "Newer details arrived",
    concurrentUpdateBody:
      "These liability details changed on another device. Your draft is preserved. Reload the updated details or confirm that your draft should replace them before saving.",
    reloadUpdatedDetails: "Reload updated details",
    confirmReplace: "Confirm replace",
    replaceConfirmed:
      "Replacement confirmed. Save details to apply your draft.",
    history: "Balance history",
    historyBody:
      "Every balance entry is appended and remains immutable in this dated history.",
    current: "Current",
    previous: "Previous",
    archive: "Archive liability",
    restore: "Restore liability",
    markPaidOff: "Mark paid off",
    paidOffTitle: "Record this liability as paid off?",
    paidOffBody:
      "ALYR will append a zero balance dated today. Earlier balances remain in history; this does not verify lender closure.",
    paidOffConfirm: "Record zero balance",
    paidOffRecorded: "Paid off balance recorded",
    delete: "Delete liability",
    deleteTitle: "Delete this liability and its balance history?",
    deleteBody:
      "This removes the record from this household. The deletion is queued for your other devices.",
    deleteConfirm: "Delete permanently",
    deleteCancel: "Keep liability",
    archivedNotice:
      "Archived liabilities stay in history and are excluded from tracked net position.",
    dataBoundary:
      "Balances are user-entered records. ALYR does not verify account ownership, interest, payoff fees or lender data."
  },
  balance: {
    eyebrow: "LIABILITY BALANCE",
    title: "Record updated balance",
    introduction:
      "Add a new dated balance. Earlier entries remain in history.",
    current: "Current recorded balance",
    noCurrent: "No balance recorded yet",
    save: "Record balance",
    update: "Record updated balance",
    concurrentUpdateTitle: "A newer balance arrived",
    concurrentUpdateBody:
      "This liability received a newer balance on another device. Your draft is preserved. Load the newer balance or confirm that your draft should be recorded after it.",
    reloadUpdatedBalance: "Load newer balance",
    confirmReplace: "Confirm my draft",
    replaceConfirmed:
      "Draft confirmed. Record the balance to append your dated entry.",
    truthTitle: "Dated assertion",
    truthBody:
      "Enter the balance shown by your own source. ALYR does not contact the lender or calculate interest."
  },
  common: {
    back: "Back",
    current: "Current",
    previous: "Previous",
    active: "Active",
    archived: "Archived",
    queued: "Queued",
    synced: "Synced",
    onDevice: "On this device",
    needsAttention: "Needs attention"
  }
};

const ARABIC: PortfolioExperienceCopy = {
  netPosition: {
    eyebrow: "صافي المركز المسجّل",
    noTotal: "راجِع البيانات للاحتساب",
    introduction:
      "عرض مؤرّخ للأصول والالتزامات التي اخترت تسجيلها.",
    showAmounts: "إظهار المبالغ المالية المسجّلة",
    hideAmounts: "إخفاء المبالغ المالية المسجّلة",
    assets: "الأصول المسجّلة",
    liabilities: "الالتزامات المسجّلة",
    net: "صافي المركز المسجّل",
    currenciesSeparate:
      "تبقى كل عملة مستقلة ولا يُطبّق أي سعر صرف.",
    boundary:
      "الأصول المسجّلة ناقص الالتزامات المسجّلة؛ وليس رصيدًا مصرفيًا أو تقييمًا مباشرًا أو بيانًا كاملًا لصافي الثروة.",
    explain: "كيف يُحتسب هذا الرقم؟",
    hideExplanation: "إخفاء تفاصيل الاحتساب",
    explanationTitle: "حدود الاحتساب",
    explanationLines: [
      "أحدث قيمة مؤرخة مسجّلة لكل أصل وعقار والتزام نشط.",
      "يُحتسب كل مبلغ ضمن عملته؛ ولا تُدمج العملات.",
      "تبقى القيم الناقصة ناقصة ولا تُعامل كأنها صفر.",
      "لا يشمل العرض الضرائب أو تكاليف البيع أو الحسابات غير المسجّلة أو تحرّكات السوق."
    ],
    status: {
      empty: "ابدأ بأصل أو التزام واحد لبناء هذا العرض.",
      "assets-unvalued":
        "يتضمن سجلك أصولًا، لكن بلا قيم أصول مؤرخة حتى الآن.",
      "liabilities-unreviewed":
        "راجِع الالتزامات قبل اعتماد هذا الرقم كمركز صافٍ.",
      partial:
        "بعض الأصول بلا قيمة مسجّلة، لذلك تبقى خارج الاحتساب.",
      recorded: "تغطية الأصول والالتزامات المسجّلة محدثة.",
      stale: "تحتاج أرصدة بعض الالتزامات إلى مراجعة جديدة.",
      "exact-total-unavailable":
        "يتجاوز الإجمالي الدقيق نطاق الاحتساب المدعوم."
    },
    reviewRequired: "مراجعة الالتزامات مطلوبة",
    exactUnavailable: "الإجمالي الدقيق غير متاح",
    asOfRange: (oldest, newest) =>
      oldest === newest
        ? `السجلات بتاريخ ${newest}`
        : `تواريخ السجلات من ${oldest} إلى ${newest}`
  },
  liabilities: {
    title: "الالتزامات",
    subtitle:
      "الرهن والقروض والبطاقات وغيرها من الالتزامات التي تسجّلها الأسرة.",
    add: "إضافة التزام",
    active: "نشط",
    archived: "مؤرشف",
    currentBalance: "الرصيد المسجّل الحالي",
    noBalance: "لم يُسجّل الرصيد",
    balanceNeedsReview: "الرصيد بحاجة إلى مراجعة",
    reviewBalance: "مراجعة الرصيد",
    noActiveTitle: "لا توجد التزامات نشطة مسجّلة",
    noActiveBody:
      "أضف التزامًا، أو أكّد أنك لا تسجّل أي التزام حاليًا. تنتهي صلاحية التأكيد بعد ٩٠ يومًا.",
    confirmNone: "لا يوجد لدي ما أسجّله",
    confirmNoneTitle: "تأكيد عدم وجود التزامات",
    confirmNoneBody:
      "يسجّل هذا مراجعة مؤرخة للأسرة. ليس تحققًا ماليًا، وستظهر المراجعة مجددًا بعد ٩٠ يومًا.",
    confirmNoneAction: "التأكيد بتاريخ اليوم",
    noneConfirmed: "لا توجد التزامات مسجّلة",
    noneConfirmedUntil: (date) => `تمت المراجعة؛ راجِع مجددًا قبل ${date}`,
    noneReviewExpired: "انتهت صلاحية مراجعة عدم وجود التزامات.",
    noneReviewChangedTitle: "تغيّر نشاط التزامات",
    noneReviewChangedBody:
      "لم تعد مراجعتك السابقة لعدم وجود التزامات سارية بعد نشاط لاحق. راجِع مجددًا لتأكيد أن الأسرة ما زالت بلا التزامات.",
    archivedCount: (count) => `التزامات مؤرشفة: ${count}`
  },
  create: {
    eyebrow: "الاستمرارية المالية",
    title: "إضافة التزام",
    introduction:
      "سجّل الالتزام وأحدث رصيد تعرفه. لا يتصل ALYR بالحساب ولا يقدّر الرصيد.",
    name: "اسم الالتزام",
    namePlaceholder: "رهن المنزل",
    nameDescription: "استخدم اسمًا واضحًا لأفراد الأسرة.",
    nameError: "أدخل اسم الالتزام.",
    category: "الفئة",
    categoryDescription: "اختر الفئة العملية الأقرب.",
    categoryError: "اختر فئة.",
    amount: "الرصيد المسجّل",
    amountPlaceholder: "125000.00",
    amountDescription:
      "أدخل الرصيد المستحق كمبلغ موجب؛ وسيُطرح عند احتساب صافي المركز.",
    showAmount: "إظهار الرصيد أثناء الكتابة",
    hideAmount: "إخفاء الرصيد أثناء الكتابة",
    currency: "العملة",
    currencyDescription:
      "اختر عملة أو أدخل رمز ISO من ثلاثة أحرف.",
    otherCurrency: "عملة أخرى",
    other: "أخرى",
    currencyError: "أدخل رمز عملة مدعومًا من ثلاثة أحرف.",
    asOf: "تاريخ الرصيد",
    dateDescription: "استخدم الصيغة YYYY-MM-DD.",
    datePlaceholder: "2026-07-28",
    dateError: "أدخل تاريخًا صحيحًا بالصيغة YYYY-MM-DD.",
    futureDateError: "لا يمكن أن يكون تاريخ الرصيد في المستقبل.",
    save: "إضافة الالتزام",
    savingHint: "يحفظ الالتزام وأول رصيد مؤرخ على هذا الجهاز.",
    truthTitle: "معنى هذا السجل",
    truthBody:
      "هذا رصيد أدخلته الأسرة، وليس كشفًا من الجهة الممولة أو مبلغ سداد نهائيًا موثقًا. احتفظ بالمستند الداعم منفصلًا عند الحاجة.",
    discardTitle: "هل تريد تجاهل هذا الالتزام؟",
    discardBody: "لم يُحفظ الاسم أو الفئة أو الرصيد.",
    keepEditing: "متابعة التعديل",
    discard: "تجاهل"
  },
  detail: {
    eyebrow: "سجل الالتزام",
    notFound: "الالتزام غير موجود",
    notFoundBody: "هذا الالتزام غير متاح ضمن الأسرة الحالية.",
    status: "الحالة",
    balance: "الرصيد المسجّل",
    balanceAsOf: (date) => `بتاريخ ${date}`,
    noBalance: "لم يُسجّل رصيد بعد.",
    addBalance: "تسجيل الرصيد",
    updateBalance: "تسجيل رصيد محدّث",
    edit: "تعديل التفاصيل",
    saveDetails: "حفظ التفاصيل",
    cancel: "إلغاء",
    concurrentUpdateTitle: "وصل تحديث أحدث",
    concurrentUpdateBody:
      "تغيّرت تفاصيل هذا الالتزام على جهاز آخر. بقيت مسودتك محفوظة. حمّل التفاصيل الأحدث أو أكّد استبدالها بمسودتك قبل الحفظ.",
    reloadUpdatedDetails: "تحميل التفاصيل الأحدث",
    confirmReplace: "تأكيد الاستبدال",
    replaceConfirmed:
      "تم تأكيد الاستبدال. احفظ التفاصيل لتطبيق مسودتك.",
    history: "سجل الأرصدة",
    historyBody:
      "يُضاف كل رصيد كقيد جديد ثابت، مع الاحتفاظ بالسجل المؤرخ كاملًا.",
    current: "الحالي",
    previous: "السابق",
    archive: "أرشفة الالتزام",
    restore: "استعادة الالتزام",
    markPaidOff: "تسجيل السداد الكامل",
    paidOffTitle: "هل تريد تسجيل سداد هذا الالتزام؟",
    paidOffBody:
      "سيضيف ALYR رصيدًا صفريًا بتاريخ اليوم. تبقى الأرصدة السابقة في السجل، ولا يُعد ذلك تحققًا من إغلاق الحساب لدى الجهة الممولة.",
    paidOffConfirm: "تسجيل رصيد صفري",
    paidOffRecorded: "تم تسجيل رصيد السداد",
    delete: "حذف الالتزام",
    deleteTitle: "حذف الالتزام وسجل أرصدته؟",
    deleteBody:
      "يُزال السجل من هذه الأسرة، وتُدرج عملية الحذف لأجهزتك الأخرى.",
    deleteConfirm: "حذف نهائي",
    deleteCancel: "الاحتفاظ بالالتزام",
    archivedNotice:
      "تبقى الالتزامات المؤرشفة في السجل وتُستبعد من صافي المركز المسجّل.",
    dataBoundary:
      "الأرصدة سجلات أدخلها المستخدم. لا يتحقق ALYR من ملكية الحساب أو الفوائد أو رسوم السداد أو بيانات الجهة الممولة."
  },
  balance: {
    eyebrow: "رصيد الالتزام",
    title: "تسجيل رصيد محدّث",
    introduction:
      "أضف رصيدًا جديدًا مؤرخًا، مع الاحتفاظ بالقيود السابقة في السجل.",
    current: "الرصيد المسجّل الحالي",
    noCurrent: "لم يُسجّل رصيد بعد",
    save: "تسجيل الرصيد",
    update: "تسجيل رصيد محدّث",
    concurrentUpdateTitle: "وصل رصيد أحدث",
    concurrentUpdateBody:
      "وصل رصيد أحدث لهذا الالتزام من جهاز آخر. بقيت مسودتك محفوظة. حمّل الرصيد الأحدث أو أكّد تسجيل مسودتك بعده.",
    reloadUpdatedBalance: "تحميل الرصيد الأحدث",
    confirmReplace: "تأكيد مسودتي",
    replaceConfirmed:
      "تم تأكيد المسودة. سجّل الرصيد لإضافة القيد المؤرخ.",
    truthTitle: "إقرار مؤرّخ",
    truthBody:
      "أدخل الرصيد من مصدرك. لا يتواصل ALYR مع الجهة الممولة ولا يحتسب الفوائد."
  },
  common: {
    back: "رجوع",
    current: "الحالي",
    previous: "السابق",
    active: "نشط",
    archived: "مؤرشف",
    queued: "قيد المزامنة",
    synced: "متزامن",
    onDevice: "على هذا الجهاز",
    needsAttention: "بحاجة إلى اهتمام"
  }
};

export function getPortfolioExperienceCopy(
  language: LanguageCode
): PortfolioExperienceCopy {
  return language === "ar" ? ARABIC : ENGLISH;
}

const LIABILITY_KIND_LABELS: Readonly<
  Record<LanguageCode, Readonly<Record<LiabilityKind, string>>>
> = {
  en: {
    mortgage: "Mortgage",
    "vehicle-loan": "Vehicle loan",
    "personal-loan": "Personal loan",
    "credit-card": "Credit card",
    "education-loan": "Education loan",
    installment: "Installment plan",
    tax: "Tax obligation",
    business: "Business liability",
    "family-debt": "Family debt",
    other: "Other liability"
  },
  ar: {
    mortgage: "رهن عقاري",
    "vehicle-loan": "تمويل مركبة",
    "personal-loan": "قرض شخصي",
    "credit-card": "بطاقة ائتمانية",
    "education-loan": "قرض تعليمي",
    installment: "خطة تقسيط",
    tax: "التزام ضريبي",
    business: "التزام تجاري",
    "family-debt": "دين عائلي",
    other: "التزام آخر"
  }
};

export function liabilityKindLabel(
  kind: LiabilityKind,
  language: LanguageCode
): string {
  return LIABILITY_KIND_LABELS[language][kind];
}

export function liabilityLifecycleLabel(
  liability: Pick<NativeLiability, "lifecycleStatus">,
  language: LanguageCode
): string {
  const copy = getPortfolioExperienceCopy(language);
  return liability.lifecycleStatus === "archived"
    ? copy.common.archived
    : copy.common.active;
}
