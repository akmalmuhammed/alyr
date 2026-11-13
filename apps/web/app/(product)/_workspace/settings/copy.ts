// Scoped copy definitions for J10 Settings: Your account, Data and privacy
// Strict honest copy in English and Arabic. Zero marketing or AI buzzwords.
// Formatted currency uses non-breaking space (QAR\u00a0... / ...\u00a0ر.ق).

export interface SettingsCopy {
  // Navigation & Page headers
  settingsTitle: string;
  accountTab: string;
  privacyTab: string;
  businessTab: string;
  addressTab: string;
  messagesTab: string;
  notificationsTab: string;

  // Your account screen
  accountTitle: string;
  accountSubtitle: string;
  saveChanges: string;
  savedDate: string;
  discard: string;

  // You panel
  youSection: string;
  rolesLink: string;
  ownerBadge: string;
  yourNameLabel: string;
  replyNameLabel: string;
  replyNameHelp: string;
  whatsappLabel: string;
  whatsappLinkedTag: string;
  whatsappHelp: string;
  roleLabel: string;
  roleHelp: string;

  // Sign-in email panel
  signInEmailSection: string;
  changeEmailBtn: string;
  magicCodeHelp: string;
  lastSignInLabel: string;

  // Devices panel
  devicesSection: string;
  signOutEverywhere: string;
  deviceCount: string;
  thisDeviceTag: string;
  signOutBtn: string;
  deviceDurationNote: string;

  // Your businesses panel
  businessesSection: string;
  businessesSubtitle: string;
  openNowTag: string;
  openBtn: string;
  businessSeparationNote: string;

  // Language & Appearance & Notices & Sign out
  languageSection: string;
  languageHelp: string;
  englishOption: string;
  englishSub: string;
  arabicOption: string;
  arabicSub: string;

  appearanceSection: string;
  lightOption: string;
  darkOption: string;
  autoOption: string;

  noticesSection: string;
  noticesLink: string;
  noticeWorkspace: string;
  noticeWorkspaceSub: string;
  noticeWhatsapp: string;
  noticeBoth: string;
  noticeHelp: string;

  signOutSection: string;
  signOutSubtitle: string;
  signOutDeviceBtn: string;

  // Data and privacy screen
  privacyTitle: string;
  privacySubtitle: string;
  downloadAllBtn: string;
  actionConfirmNotice: string;

  // Your data panel
  yourDataSection: string;
  yourDataSubtitle: string;
  incCustomers: string;
  incCatalog: string;
  incDocuments: string;
  incTeam: string;
  zipDescription: string;
  lastDownloadLabel: string;
  whoCanDownloadLabel: string;
  moneyLabel: string;
  moneyDetail: string;
  leftOutLabel: string;
  leftOutDetail: string;
  colDownloaded: string;
  colBy: string;
  colSize: string;
  colFollowed: string;
  downloadRuleNote: string;

  // Customer data requests panel
  requestsSection: string;
  requestsCount: string;
  recordRequestBtn: string;
  colAsked: string;
  colCustomer: string;
  colAskedFor: string;
  colState: string;
  colHandledBy: string;
  requestsRuleNote: string;

  // Terms panel
  termsSection: string;
  termsSubtitle: string;
  colDocument: string;
  colVersion: string;
  colAccepted: string;
  readItLink: string;
  replacedNote: string;

  // Close account panel
  closeAccountSection: string;
  closeAccountDescription: string;
  closeAccountBtn: string;
  closeAccountOwnersOnly: string;

  // What ALYR keeps panel
  keepsSection: string;
  keptInLabel: string;
  keptInValue: string;
  convOrdersLabel: string;
  convOrdersValue: string;
  docsLabel: string;
  docsValue: string;
  afterCloseLabel: string;
  afterCloseValue: string;
  staffSeeLabel: string;
  staffSeeValue: string;
  noCardDetailsNote: string;

  // Customers and consent panel
  consentSection: string;
  customersLink: string;
  onRecordLabel: string;
  saidStopLabel: string;
  forgottenLabel: string;
  waitingForgetLabel: string;
  consentRuleNote: string;

  // Change email dialog
  changeEmailTitle: string;
  stepNewAddress: string;
  stepCode: string;
  nowTag: string;
  newTag: string;
  codeInstruction: string;
  codeExpiryNotice: string;
  resendCountdown: string;
  safetyOldAddress: string;
  safetySignOutOthers: string;
  useAnotherAddressBtn: string;
  confirmChangeEmailBtn: string;

  // Close account dialog
  closeAccountModalTitle: string;
  closeBusinessSummary: string;
  whatHappensSection: string;
  stepToday: string;
  stepTodayDesc: string;
  stepNotice: string;
  stepNoticeDesc: string;
  stepClose: string;
  stepCloseDesc: string;
  stepErase: string;
  stepEraseDesc: string;
  closeWarningBanner: string;
  copyConfirmationCheck: string;
  copyConfirmationSub: string;
  emailCodeNotice: string;
  keepAccountBtn: string;
  confirmCloseBtn: string;

  // States
  loadingTitle: string;
  loadingSubtitle: string;
  agentRestrictedTitle: string;
  agentRestrictedSubtitle: string;
  agentPermissionsNote: string;
  offlineBannerText: string;
  backToWorkspace: string;
}

export const SETTINGS_COPY: { en: SettingsCopy; ar: SettingsCopy } = {
  en: {
    settingsTitle: "Settings",
    accountTab: "Your account",
    privacyTab: "Data and privacy",
    businessTab: "Business",
    addressTab: "Address and hours",
    messagesTab: "Messages",
    notificationsTab: "Notifications",

    accountTitle: "Your account",
    accountSubtitle: "Your name, how you sign in, where you are signed in and how the workspace looks for you.",
    saveChanges: "Save changes",
    savedDate: "Saved Wed 4 Nov",
    discard: "Discard",

    youSection: "You",
    rolesLink: "Team · Roles",
    ownerBadge: "Owner",
    yourNameLabel: "Your name",
    replyNameLabel: "Name on your replies",
    replyNameHelp: 'Customers see "Hana: ..." when replies are signed.',
    whatsappLabel: "Your WhatsApp",
    whatsappLinkedTag: "LINKED 3 SEP",
    whatsappHelp: "For your own alerts and the Sunday report.",
    roleLabel: "Role",
    roleHelp: "Only another owner can change it.",

    signInEmailSection: "Sign-in email",
    changeEmailBtn: "Change",
    magicCodeHelp: "ALYR emails a 6-digit code to this address each time you sign in. There is no password to remember or to leak.",
    lastSignInLabel: "LAST SIGN-IN",

    devicesSection: "Where you are signed in",
    signOutEverywhere: "Sign out everywhere else",
    deviceCount: "3 devices",
    thisDeviceTag: "This device",
    signOutBtn: "Sign out",
    deviceDurationNote: "A sign-in lasts 30 days on each device. Changing your sign-in email signs you out everywhere else.",

    businessesSection: "Your businesses",
    businessesSubtitle: "signing in opens the one you used last",
    openNowTag: "Open now",
    openBtn: "Open",
    businessSeparationNote: "Each business keeps its own customers, orders and team. Opening one reloads the workspace.",

    languageSection: "Language",
    languageHelp: "kept with your account, on every device",
    englishOption: "English",
    englishSub: "Left to right",
    arabicOption: "العربية",
    arabicSub: "Right to left",

    appearanceSection: "Appearance",
    lightOption: "Light",
    darkOption: "Dark",
    autoOption: "As the device",

    noticesSection: "Where you get your alerts",
    noticesLink: "What you are told",
    noticeWorkspace: "In the workspace",
    noticeWorkspaceSub: "Bell and badges",
    noticeWhatsapp: "On WhatsApp",
    noticeBoth: "Both",
    noticeHelp: "What you can ask from WhatsApp: TODAY, ORDERS, BOOKINGS, OWED, REPORT, HELP. Each word works in English or Arabic.",

    signOutSection: "Sign out",
    signOutSubtitle: "Sign out of this device. You come back with a new code from your email.",
    signOutDeviceBtn: "Sign out",

    privacyTitle: "Data and privacy",
    privacySubtitle: "Your own copy of everything, what customers asked about their data, the terms you accepted, and closing the account.",
    downloadAllBtn: "Download all data",
    actionConfirmNotice: "Each action here asks first",

    yourDataSection: "Your data",
    yourDataSubtitle: "everything this business keeps in ALYR",
    incCustomers: "Customers, messages, orders, bookings and credit accounts",
    incCatalog: "The catalog, prices, stock and its history",
    incDocuments: "Every document's PDF, your logo and stamp, and the catalog's photos",
    incTeam: "The team, the settings and the activity record",
    zipDescription: "One ZIP of CSV files that Excel opens, Arabic intact, with a note on how to read them. To keep your own copy, give an accountant, or take elsewhere.",
    lastDownloadLabel: "Last download",
    whoCanDownloadLabel: "Who can download",
    moneyLabel: "Money",
    moneyDetail: "Dirhams, 100 = QAR\u00a01",
    leftOutLabel: "Left out",
    leftOutDetail: "Sign-in codes, card details",
    colDownloaded: "Downloaded",
    colBy: "By",
    colSize: "Size",
    colFollowed: "What followed",
    downloadRuleNote: "By rule: every owner and admin gets an email each time the data is downloaded, and the download is listed here.",

    requestsSection: "Customer data requests",
    requestsCount: "6 since September",
    recordRequestBtn: "Record a request",
    colAsked: "Asked",
    colCustomer: "Customer",
    colAskedFor: "Asked for",
    colState: "State",
    colHandledBy: "Handled by",
    requestsRuleNote: 'By rule: a customer can be forgotten once no order is open and no booking is ahead. Issued documents are kept with the name replaced by "Forgotten customer".',

    termsSection: "Terms you accepted",
    termsSubtitle: "asked once for each new version",
    colDocument: "Document",
    colVersion: "Version",
    colAccepted: "Accepted",
    readItLink: "Read it",
    replacedNote: "Replaced",

    closeAccountSection: "Close the account",
    closeAccountDescription: "Closing ends the plan with seven days' notice. Everything works until then. After that ALYR sends nothing more on WhatsApp and charges nothing more, and your data stays 60 days for you to download before it is erased.",
    closeAccountBtn: "Close the account",
    closeAccountOwnersOnly: "Owners only. Asks you to confirm.",

    keepsSection: "What ALYR keeps",
    keptInLabel: "Kept in",
    keptInValue: "Google Cloud, Doha",
    convOrdersLabel: "Conversations and orders",
    convOrdersValue: "While the account is open",
    docsLabel: "Issued documents",
    docsValue: "While the account is open",
    afterCloseLabel: "After the account closes",
    afterCloseValue: "60 days, then erased",
    staffSeeLabel: "ALYR staff see",
    staffSeeValue: "Counts, never message text",
    noCardDetailsNote: "Payments go straight to your own provider account. ALYR holds no money and no card details.",

    consentSection: "Customers and consent",
    customersLink: "Customers",
    onRecordLabel: "Customers on record",
    saidStopLabel: "Said STOP",
    forgottenLabel: "Forgotten",
    waitingForgetLabel: "Waiting to be forgotten",
    consentRuleNote: "Only the customer can agree to messages or offers. Nobody on the team can tick it for them.",

    changeEmailTitle: "Change your sign-in email",
    stepNewAddress: "New address",
    stepCode: "Code from the email",
    nowTag: "NOW",
    newTag: "NEW",
    codeInstruction: "We emailed a code to the new address. Type it here to make it your sign-in email.",
    codeExpiryNotice: "Works for 10 minutes · 5 tries",
    resendCountdown: "Send a new code in 0:38",
    safetyOldAddress: "We tell your old address, so nobody can change it behind your back.",
    safetySignOutOthers: "You are signed out on your 2 other devices. This one stays signed in.",
    useAnotherAddressBtn: "Use another address",
    confirmChangeEmailBtn: "Change my sign-in email",

    closeAccountModalTitle: "Close the Nuqta Car Care account?",
    closeBusinessSummary: "7 people · 1,284 customers · on ALYR since 1 Sep 2026",
    whatHappensSection: "What happens, and when",
    stepToday: "Today",
    stepTodayDesc: "You ask to close. Hana and Omar get an email. Nothing else changes.",
    stepNotice: "Until Thu 19 Nov",
    stepNoticeDesc: "Seven days' notice. Everything works as usual and you can change your mind with one tap.",
    stepClose: "From Thu 19 Nov",
    stepCloseDesc: "ALYR sends nothing more on WhatsApp and charges nothing more. The workspace opens to read and download only.",
    stepErase: "Mon 18 Jan 2027",
    stepEraseDesc: "After 60 days everything is erased, and you get a receipt of the erasure by email.",
    closeWarningBanner: "31 bookings are after 19 Nov and 11 customers owe QAR\u00a09,840. Customers booked after that day are told on the 19th; reminders to pay stop then.",
    copyConfirmationCheck: "I have my own copy of the data, or I do not need one",
    copyConfirmationSub: "Last download: Sun 1 Nov, 212 MB. You can download again until 18 Jan.",
    emailCodeNotice: "Code from the email we just sent to hana@nuqta.qa. Works for 10 minutes.",
    keepAccountBtn: "Keep the account",
    confirmCloseBtn: "Close on Thu 19 Nov",

    loadingTitle: "Settings",
    loadingSubtitle: "Loading your account settings and preferences...",
    agentRestrictedTitle: "Your account",
    agentRestrictedSubtitle: "You are signed in as an Agent. Personal profile settings are editable; company export and closing are restricted to owners.",
    agentPermissionsNote: "Owner permissions are required to download all data or request account closure.",
    offlineBannerText: "Offline · displaying cached account settings. Changes will sync once network is restored.",
    backToWorkspace: "Back to workspace",
  },
  ar: {
    settingsTitle: "الإعدادات",
    accountTab: "حسابك",
    privacyTab: "البيانات والخصوصية",
    businessTab: "النشاط التجاري",
    addressTab: "العنوان وساعات العمل",
    messagesTab: "الرسائل",
    notificationsTab: "الإشعارات",

    accountTitle: "حسابك",
    accountSubtitle: "اسمك، وكيف تسجل الدخول، وأجهزتك النشطة، ومظهر مساحة العمل بالنسبة لك.",
    saveChanges: "حفظ التغييرات",
    savedDate: "حُفظ الأربعاء 4 نوفمبر",
    discard: "تراجع",

    youSection: "أنت",
    rolesLink: "الفريق · الأدوار",
    ownerBadge: "مالك",
    yourNameLabel: "اسمك",
    replyNameLabel: "الاسم على ردودك",
    replyNameHelp: 'يرى العملاء "هناء: ..." عندما تكون الردود موقّعة.',
    whatsappLabel: "رقم واتساب الخاص بك",
    whatsappLinkedTag: "مرتبط 3 سبتمبر",
    whatsappHelp: "لإشعاراتك الخاصة وتقرير يوم الأحد.",
    roleLabel: "الدور",
    roleHelp: "المالك فقط من يمكنه تعديل هذا الدور.",

    signInEmailSection: "بريد تسجيل الدخول",
    changeEmailBtn: "تغيير",
    magicCodeHelp: "يرسل أَلير رمزاً من 6 أرقام إلى هذا العنوان في كل مرة تسجل فيها الدخول. لا توجد كلمة مرور لتتذكرها أو لتتسرب.",
    lastSignInLabel: "آخر تسجيل دخول",

    devicesSection: "الأجهزة المسجل الدخول منها",
    signOutEverywhere: "تسجيل الخروج من كل الأجهزة الأخرى",
    deviceCount: "3 أجهزة",
    thisDeviceTag: "هذا الجهاز",
    signOutBtn: "تسجيل الخروج",
    deviceDurationNote: "تستمر الجلسة 30 يوماً على كل جهاز. تغيير بريد تسجيل الدخول يسجل خروجك من كل الأجهزة الأخرى.",

    businessesSection: "أنشطتك التجارية",
    businessesSubtitle: "تسجيل الدخول يفتح النشاط الأخير الذي استخدمته",
    openNowTag: "مفتوح الآن",
    openBtn: "فتح",
    businessSeparationNote: "يحتفظ كل نشاط تجاري بعملائه وطلباته وفريقه بشكل منفصل. فتح نشاط آخر يعيد تحميل مساحة العمل.",

    languageSection: "اللغة",
    languageHelp: "تُحفظ مع حسابك وتطبق على كل أجهزتك",
    englishOption: "English",
    englishSub: "من اليسار إلى اليمين",
    arabicOption: "العربية",
    arabicSub: "من اليمين إلى اليسار",

    appearanceSection: "المظهر",
    lightOption: "فاتح",
    darkOption: "داكن",
    autoOption: "حسب الجهاز",

    noticesSection: "مكان استلام إشعاراتك",
    noticesLink: "ما يتم إبلاغك به",
    noticeWorkspace: "في مساحة العمل",
    noticeWorkspaceSub: "الجرس والشارات",
    noticeWhatsapp: "على واتساب",
    noticeBoth: "كلاهما",
    noticeHelp: "ما يمكنك الاستفسار عنه عبر واتساب: اليوم، الطلبات، الحجوزات، المستحقات، التقرير، المساعدة.",

    signOutSection: "تسجيل الخروج",
    signOutSubtitle: "تسجيل الخروج من هذا الجهاز. يمكنك العودة برمز جديد من بريدك الإلكتروني.",
    signOutDeviceBtn: "تسجيل الخروج",

    privacyTitle: "البيانات والخصوصية",
    privacySubtitle: "نسختك الخاصة من كل شيء، وطلبات العملاء بشأن بياناتهم، والشروط المقبولة، وإغلاق الحساب.",
    downloadAllBtn: "تنزيل كل البيانات",
    actionConfirmNotice: "كل إجراء هنا يطلب التأكيد أولاً",

    yourDataSection: "بياناتك",
    yourDataSubtitle: "كل ما يحتفظ به هذا النشاط التجاري في أَلير",
    incCustomers: "العملاء، الرسائل، الطلبات، الحجوزات وحسابات الآجل",
    incCatalog: "الكتالوج، الأسعار، المخزون وتاريخه",
    incDocuments: "ملف PDF لكل مستند، شعارك وختمك، وصور الكتالوج",
    incTeam: "الفريق، الإعدادات وسجل النشاط",
    zipDescription: "ملف مضغوط ZIP يحتوي على جداول CSV يفتحها إكسل وتحافظ على النصوص العربية مع إرشادات القراءة.",
    lastDownloadLabel: "آخر تنزيل",
    whoCanDownloadLabel: "من يمكنه التنزيل",
    moneyLabel: "المبالغ",
    moneyDetail: "دراهم، 100 = 1\u00a0ر.ق",
    leftOutLabel: "المستبعد",
    leftOutDetail: "رموز الدخول وتفاصيل البطاقات البنكية",
    colDownloaded: "تاريخ التنزيل",
    colBy: "بواسطة",
    colSize: "الحجم",
    colFollowed: "الإجراء المتبع",
    downloadRuleNote: "وفقاً للقاعدة: يُخطر كل مالك ومسؤول عبر البريد الإلكتروني عند تنزيل البيانات ويُدرج التنزيل هنا.",

    requestsSection: "طلبات بيانات العملاء",
    requestsCount: "6 منذ سبتمبر",
    recordRequestBtn: "تسجيل طلب",
    colAsked: "تاريخ الطلب",
    colCustomer: "العميل",
    colAskedFor: "المطلوب",
    colState: "الحالة",
    colHandledBy: "المسؤول",
    requestsRuleNote: 'وفقاً للقاعدة: يمكن حذف بيانات العميل بمجرد اكتمال كل الطلبات وعدم وجود حجوزات مستقبلية، مع حفظ الفواتير باسم "عميل محذوف".',

    termsSection: "الشروط المقبولة",
    termsSubtitle: "تُطلب الموافقة مرة واحدة لكل إصدار جديد",
    colDocument: "المستند",
    colVersion: "الإصدار",
    colAccepted: "تاريخ القبول",
    readItLink: "قراءة المستند",
    replacedNote: "مستبدل",

    closeAccountSection: "إغلاق الحساب",
    closeAccountDescription: "إنهاء الاشتراك بمهلة 7 أيام. يستمر كل شيء بالعمل حتى انقضاء المهلة، بعدها يتوقف واتساب وتتوقف الاشتراكات، مع مهلة 60 يوماً لتنزيل بياناتك قبل مسحها نهائياً.",
    closeAccountBtn: "إغلاق الحساب",
    closeAccountOwnersOnly: "للمالكين فقط. يطلب تأكيد الإجراء.",

    keepsSection: "ما يحتفظ به أَلير",
    keptInLabel: "مكان الحفظ",
    keptInValue: "Google Cloud، الدوحة",
    convOrdersLabel: "المحادثات والطلبات",
    convOrdersValue: "طوال فترة فتح الحساب",
    docsLabel: "المستندات الصادرة",
    docsValue: "طوال فترة فتح الحساب",
    afterCloseLabel: "بعد إغلاق الحساب",
    afterCloseValue: "60 يوماً ثم يُمسح نهائياً",
    staffSeeLabel: "ما يراه موظفو أَلير",
    staffSeeValue: "أرقام وإحصاءات، ولا يرون نصوص الرسائل أبداً",
    noCardDetailsNote: "تذهب المدفوعات مباشرة إلى حسابك لدى مزود الدفع. لا يحتفظ أَلير بأي أموال أو بيانات بطاقات.",

    consentSection: "العملاء والموافقات",
    customersLink: "العملاء",
    onRecordLabel: "العملاء المسجلون",
    saidStopLabel: "أرسلوا STOP",
    forgottenLabel: "عملاء محذوفون",
    waitingForgetLabel: "بانتظار الحذف",
    consentRuleNote: "العميل وحده من يملك الموافقة على استلام الرسائل أو العروض. لا يمكن لأحد من الفريق تفعيلها بالنيابة عنه.",

    changeEmailTitle: "تغيير بريد تسجيل الدخول",
    stepNewAddress: "العنوان الجديد",
    stepCode: "رمز التحقق من البريد",
    nowTag: "الحالي",
    newTag: "الجديد",
    codeInstruction: "أرسلنا رمز تحقق إلى العنوان الجديد. أدخله هنا لاعتماده عنواناً لتسجيل الدخول.",
    codeExpiryNotice: "صالح لمدة 10 دقائق · 5 محاولات",
    resendCountdown: "إرسال رمز جديد خلال 0:38",
    safetyOldAddress: "يتم إشعار عنوانك القديم فوراً لمنع أي تغيير غير مصرح به.",
    safetySignOutOthers: "سيتم تسجيل خروجك من الجهازين الآخرين، ويبقى هذا الجهاز نشطاً.",
    useAnotherAddressBtn: "استخدام عنوان آخر",
    confirmChangeEmailBtn: "تغيير بريد تسجيل الدخول",

    closeAccountModalTitle: "إغلاق حساب نقطة للعناية بالسيارات؟",
    closeBusinessSummary: "7 أفراد · 1,284 عميلاً · على أَلير منذ 1 سبتمبر 2026",
    whatHappensSection: "ماذا سيحدث، ومتى",
    stepToday: "اليوم",
    stepTodayDesc: "طلب الإغلاق. يتم إشعار هناء وعمر عبر البريد. لا شيء آخر يتغير حالياً.",
    stepNotice: "حتى الخميس 19 نوفمبر",
    stepNoticeDesc: "مهلة سبعة أيام. يستمر العمل كالمعتاد ويمكنك التراجع بنقرة واحدة.",
    stepClose: "اعتباراً من الخميس 19 نوفمبر",
    stepCloseDesc: "يتوقف إرسال واتساب وتتوقف الاشتراكات. تفتح مساحة العمل للقراءة والتنزيل فقط.",
    stepErase: "الاثنين 18 يناير 2027",
    stepEraseDesc: "بعد 60 يوماً تُمحى كل البيانات نهائياً، وتستلم إشعاراً بتأكيد الحذف عبر البريد.",
    closeWarningBanner: "توجد 31 زيارة محجوزة بعد 19 نوفمبر و11 عميلاً لديهم مستحقات بقيمة 9,840\u00a0ر.ق. سيتم إبلاغ العملاء وتتوقف رسائل التذكير بالدفع.",
    copyConfirmationCheck: "لدي نسختي الخاصة من البيانات، أو أنني لا أحتاج إليها",
    copyConfirmationSub: "آخر تنزيل: الأحد 1 نوفمبر، 212 ميغابايت. يمكنك التنزيل مجدداً حتى 18 يناير.",
    emailCodeNotice: "رمز التحقق المرسل إلى hana@nuqta.qa. صالح لمدة 10 دقائق.",
    keepAccountBtn: "الاحتفاظ بالحساب",
    confirmCloseBtn: "تأكيد الإغلاق في 19 نوفمبر",

    loadingTitle: "الإعدادات",
    loadingSubtitle: "جاري تحميل إعدادات الحساب والتفضيلات...",
    agentRestrictedTitle: "حسابك",
    agentRestrictedSubtitle: "أنت مسجل كعضو في الفريق. يمكنك تعديل بياناتك الشخصية؛ بينما يقتصر تنزيل البيانات وإغلاق الحساب على المالكين.",
    agentPermissionsNote: "صلاحيات المالك مطلوبة لتنزيل كل البيانات أو طلب إغلاق الحساب.",
    offlineBannerText: "وضع عدم الاتصال · يتم عرض الإعدادات المخزنة محلياً. ستتم المزامنة عند عودة الاتصال.",
    backToWorkspace: "العودة إلى مساحة العمل",
  },
};
