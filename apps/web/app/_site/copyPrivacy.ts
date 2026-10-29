// The words of the privacy policy (/privacy, /ar/privacy), English and Arabic (ALY-68; the record of processing is ALY-120). Every
// line says what ALYR really does, checked against docs/data-residency.md, the customer
// agreement draft (docs/company/customer-agreement/agreement.md, section 9), the hosting
// decision (D-060: Google Cloud, Doha) and the code (consent.py's STOP words, the site's
// one localStorage key and the analytics of D-070). It is a draft until the founder and a lawyer have read it (ALY-51),
// and the Arabic is a draft until the native review (ALY-66). Meta's app settings point to
// this page for the privacy policy, and to `#delete` for the data deletion instructions.

export type PrivacySection = {
  /** The section's anchor: `#delete` is the address Meta's app settings use. */
  id: string;
  title: string;
  paras: string[];
  list?: string[];
  /** Paragraphs after the list. */
  after?: string[];
  /** A button that asks the analytics question again (D-070). */
  choice?: string;
};

export type PrivacyPage = {
  eyebrow: string;
  title: string;
  updated: string;
  lead: string;
  sections: PrivacySection[];
};

export const privacyEn: PrivacyPage = {
  eyebrow: "Privacy policy",
  title: "How ALYR handles your data",
  updated: "Last updated 28 October 2026",
  lead: "ALYR is run by alyr software W.L.L., a company registered in Qatar (commercial registration 255539). This page says what data we hold, why, who else sees it, how long we keep it and how to ask us to delete it.",
  sections: [
    {
      id: "who",
      title: "Who this is about",
      paras: [
        "ALYR is software that businesses in Qatar use to take orders, bookings and payments on WhatsApp and to keep their records. Two groups of people have data in ALYR:",
      ],
      list: [
        "The businesses that use ALYR (our clients) and their staff. For this data, alyr software W.L.L. is responsible.",
        "The customers of those businesses, who message them on WhatsApp or open an order, booking or payment page. For this data the business decides how it is used, and ALYR processes it on the business's behalf, as Qatar's Personal Data Privacy Protection Law (Law No. 13 of 2016) describes.",
      ],
    },
    {
      id: "what",
      title: "What we hold",
      paras: ["About a business and its staff:"],
      list: [
        "names, email addresses and phone numbers, and the business's name, address and type;",
        "the sign-in codes we email, and a record of who did what in ALYR;",
        "the price agreed with ALYR and the payments made for it.",
      ],
      after: [
        "About a business's customers: their WhatsApp number or WhatsApp user ID, the name they show on WhatsApp, their messages with the business, their orders, bookings and credit balances, the status of their payments, and whether they agreed to be messaged or asked to stop. We never hold card numbers: payments are taken by the business's own payment provider, and we keep only its reference and status.",
        "About visitors to alyr.qa and owners using ALYR: what the site and the product count, and how you choose, is in \"Analytics and your choice\" below. If you choose light or dark mode, that choice is kept in your own browser and never sent to us.",
      ],
    },
    {
      id: "analytics",
      title: "Analytics and your choice",
      paras: [
        "We use PostHog to see how alyr.qa and ALYR's screens are used, so we can make them better. It works at two levels, and you choose in the box at the bottom of the screen.",
      ],
      list: [
        "Until you choose, and if you choose \"No thanks\": we count pages opened, buttons pressed, errors and how fast pages load, without cookies. Your IP address is used for a moment to tell one visit from another and is not stored. Your browser keeps only your choice and, until you close the tab, a code saying which link or leaflet brought you.",
        "If you choose \"Allow\": we also use cookies so a returning visit is recognised, and we record how pages are used (where the pointer moves, what is clicked, how far you scroll) to replay it. Everything you type is hidden in these recordings.",
        "In setting up a business and in the workspace: every text and every input is hidden in recordings and clicks, so we see the shape of the screen, never what is on it. The inbox, where a business talks to its customers, is never recorded. A signed-in owner who allowed it is known by their user ID and their business's ID only, never by name, email or phone number.",
        "Never: the pages a business's customers open (orders, bookings, payments, tracking) and ALYR's own back office load no analytics at all.",
      ],
      after: [
        "Analytics data is kept in PostHog's European Union region. Recordings are deleted after 30 days.",
      ],
      choice: "Change your choice",
    },
    {
      id: "use",
      title: "What we use it for",
      paras: [
        "To run ALYR for the business: answer and record messages, take orders and bookings, send the messages the business asks for, and keep its records. To support the business, keep ALYR secure and fix faults. We may count totals that identify no business and no person, to run and improve ALYR.",
        "We do not sell data, use it for advertising, or message a business's customers for ourselves. A business can send marketing messages only to people who agreed to receive them, and anyone who writes STOP is not messaged again.",
      ],
    },
    {
      id: "whatsapp",
      title: "WhatsApp and Meta",
      paras: [
        "Every WhatsApp message goes through Meta's official WhatsApp Business Platform. When a business connects its WhatsApp number to ALYR, Meta shares that account's messages, phone numbers and message templates with ALYR so ALYR can send and receive messages for the business. We use that access only to run ALYR for that business. Meta also handles these messages under its own terms and privacy policy.",
      ],
    },
    {
      id: "shared",
      title: "Who else receives it",
      paras: ["Only the services ALYR needs to work, each for its own part:"],
      list: [
        "Google Cloud, Doha region, Qatar: ALYR's servers and database, where the data above is kept.",
        "Meta (WhatsApp Business Platform): the WhatsApp messages and the numbers and names that come with them, outside Qatar.",
        "Cloudflare: the website and the pages customers open from WhatsApp, passing through its network, outside Qatar.",
        "PostHog: the analytics described under \"Analytics and your choice\", in the European Union.",
        "Resend: the emails ALYR sends, such as sign-in codes, weekly reports to a business owner, and receipts or invoices a business emails to its customer, in the European Union.",
        "Zoho: ALYR's own mailboxes, which hold the emails people send us, outside Qatar.",
        "The business's own payment provider and, if the business connects it, its own sales or accounting system.",
      ],
      after: [
        "We share data with anyone else only when the law requires it.",
      ],
    },
    {
      id: "keep",
      title: "How long we keep it",
      paras: [
        "For as long as the business uses ALYR. When a business stops, it can ask for a copy of its records within 30 days. 60 days after it stops, we delete its data, except what the law requires us to keep, such as our invoices to it. Copies in our backups are gone within 35 days after that.",
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      paras: [
        "You can ask to see the data we hold about you, to correct it or to delete it.",
        "If you are a customer of a business that uses ALYR, ask the business first: it decides about your data. You can also write to us and we will help the business answer you. To stop a business's messages, reply STOP in the chat.",
        "If you are a business or a member of its staff, write to hello@alyr.qa. We answer within 30 days.",
      ],
    },
    {
      id: "delete",
      title: "Deleting your data",
      paras: ["To ask us to delete your data:"],
      list: [
        "Write to hello@alyr.qa from the email address or phone number we know you by, and say what you want deleted.",
        "If you connected a WhatsApp Business account to ALYR through Facebook, you can also remove ALYR in your Facebook settings, under Business integrations. That stops ALYR's access; write to us as well if you want the data deleted.",
        "We confirm by email when it is done, within 30 days.",
      ],
      after: [
        "If you are a customer of a business, we delete your data with the business's agreement, because the records are the business's.",
      ],
    },
    {
      id: "security",
      title: "How we protect it",
      paras: [
        "Each business's records are kept apart inside the database itself, so one business cannot see another's. Connections are encrypted. Only the people at ALYR who need to see data can, and they are bound to keep it confidential. If a breach affects a business's data, we tell the business without delay.",
      ],
    },
    {
      id: "changes",
      title: "Changes and contact",
      paras: [
        "When this policy changes, we update this page and its date. Questions about your data go to hello@alyr.qa; security reports go to security@alyr.qa.",
        "alyr software W.L.L., commercial registration 255539, Doha, Qatar.",
      ],
    },
  ],
};

export const privacyAr: PrivacyPage = {
  eyebrow: "سياسة الخصوصية",
  title: "كيف تتعامل ALYR مع بياناتك",
  updated: "آخر تحديث: 28 أكتوبر 2026",
  lead: "تدير ALYR شركةُ alyr software ذ.م.م.، وهي شركة مسجّلة في قطر (سجل تجاري رقم 255539). توضّح هذه الصفحة البيانات التي نحتفظ بها، ولماذا، ومن غيرنا يطّلع عليها، وكم نحتفظ بها، وكيف تطلب منا حذفها.",
  sections: [
    {
      id: "who",
      title: "على من تنطبق",
      paras: [
        "ALYR برنامج تستخدمه المشاريع في قطر لاستقبال الطلبات والحجوزات والمدفوعات على واتساب وحفظ سجلاتها. لدى فئتين من الناس بيانات في ALYR:",
      ],
      list: [
        "المشاريع التي تستخدم ALYR (عملاؤنا) وموظفوها. شركة alyr software ذ.م.م. هي المسؤولة عن هذه البيانات.",
        "عملاء تلك المشاريع، الذين يراسلونها على واتساب أو يفتحون صفحة طلب أو حجز أو دفع. يقرر المشروع كيف تُستخدم هذه البيانات، وتعالجها ALYR نيابةً عنه، كما يصف قانون حماية خصوصية البيانات الشخصية في قطر (القانون رقم 13 لسنة 2016).",
      ],
    },
    {
      id: "what",
      title: "ما نحتفظ به",
      paras: ["عن المشروع وموظفيه:"],
      list: [
        "الأسماء وعناوين البريد الإلكتروني وأرقام الهواتف، واسم المشروع وعنوانه ونوعه؛",
        "رموز الدخول التي نرسلها بالبريد، وسجلّ بما فعله كل شخص في ALYR؛",
        "السعر المتفق عليه مع ALYR والمبالغ المدفوعة مقابله.",
      ],
      after: [
        "عن عملاء المشروع: رقم واتساب أو معرّف المستخدم على واتساب، والاسم الظاهر على واتساب، ورسائلهم مع المشروع، وطلباتهم وحجوزاتهم وأرصدة حساباتهم، وحالة مدفوعاتهم، وهل وافقوا على تلقي الرسائل أو طلبوا التوقف. لا نحتفظ أبداً بأرقام البطاقات: يتسلّم المدفوعات مزوّدُ الدفع الخاص بالمشروع، ونحتفظ بمرجع الدفع وحالته فقط.",
        "عن زوار alyr.qa وأصحاب المشاريع الذين يستخدمون ALYR: ما يعدّه الموقع والمنتج، وكيف تختار، مذكور في «التحليلات واختيارك» أدناه. إذا اخترت الوضع الفاتح أو الداكن، يُحفظ اختيارك في متصفحك أنت ولا يُرسل إلينا.",
      ],
    },
    {
      id: "analytics",
      title: "التحليلات واختيارك",
      paras: [
        "نستخدم PostHog لنعرف كيف يُستخدم alyr.qa وشاشات ALYR حتى نحسّنها. يعمل على مستويين، وتختار أنت من المربع أسفل الشاشة.",
      ],
      list: [
        "قبل أن تختار، وإذا اخترت «لا، شكراً»: نعدّ الصفحات التي تُفتح والأزرار التي يُضغط عليها والأخطاء وسرعة تحميل الصفحات، دون ملفات تعريف الارتباط. يُستخدم عنوان IP لحظةً للتمييز بين زيارة وأخرى ولا يُحفظ. لا يحفظ متصفحك إلا اختيارك، ورمزاً يبيّن الرابط أو المنشور الذي أوصلك إلينا حتى تغلق الصفحة.",
        "إذا اخترت «اسمح»: نستخدم أيضاً ملفات تعريف الارتباط لنتعرّف على الزيارة العائدة، ونسجّل طريقة استخدام الصفحات (حركة المؤشر وما يُضغط عليه ومدى التمرير) لإعادة عرضها. كل ما تكتبه مخفي في هذه التسجيلات.",
        "في إعداد المشروع ومساحة العمل: كل نص وكل خانة إدخال مخفية في التسجيلات والنقرات، فنرى شكل الشاشة لا محتواها. صندوق المحادثات، حيث يتحدث المشروع مع عملائه، لا يُسجَّل أبداً. صاحب المشروع الذي سمح بذلك نميّزه برقم المستخدم ورقم المشروع فقط، لا باسمه أو بريده أو رقم هاتفه.",
        "أبداً: الصفحات التي يفتحها عملاء المشروع (الطلبات والحجوزات والمدفوعات والتتبع) ولوحة إدارة ALYR الداخلية لا تحمّل أي تحليلات.",
      ],
      after: [
        "تُحفظ بيانات التحليلات في منطقة الاتحاد الأوروبي لدى PostHog. تُحذف التسجيلات بعد 30 يوماً.",
      ],
      choice: "غيّر اختيارك",
    },
    {
      id: "use",
      title: "فيمَ نستخدمها",
      paras: [
        "لتشغيل ALYR للمشروع: الرد على الرسائل وتسجيلها، واستقبال الطلبات والحجوزات، وإرسال الرسائل التي يطلبها المشروع، وحفظ سجلاته. ولدعم المشروع، وحماية ALYR، وإصلاح الأعطال. وقد نحسب مجاميع لا تكشف أي مشروع أو شخص، لتشغيل ALYR وتحسينها.",
        "لا نبيع البيانات، ولا نستخدمها للإعلان، ولا نراسل عملاء المشروع لحسابنا. لا يستطيع المشروع إرسال رسائل تسويقية إلا لمن وافق على تلقيها، ومن يكتب STOP لا تصله رسائل بعد ذلك.",
      ],
    },
    {
      id: "whatsapp",
      title: "واتساب وMeta",
      paras: [
        "تمر كل رسالة واتساب عبر منصة واتساب للأعمال الرسمية من Meta. عندما يربط المشروع رقم واتساب الخاص به بـ ALYR، تشارك Meta مع ALYR رسائل ذلك الحساب وأرقام الهواتف وقوالب الرسائل، لكي ترسل ALYR الرسائل وتستقبلها نيابةً عن المشروع. لا نستخدم هذا الوصول إلا لتشغيل ALYR لذلك المشروع. وتتعامل Meta أيضاً مع هذه الرسائل وفق شروطها وسياسة خصوصيتها.",
      ],
    },
    {
      id: "shared",
      title: "من غيرنا يتسلّمها",
      paras: ["الخدمات التي تحتاجها ALYR لتعمل فقط، كلٌّ في جزئه:"],
      list: [
        "Google Cloud، منطقة الدوحة، قطر: خوادم ALYR، وفيها قاعدة البيانات حيث تُحفظ البيانات المذكورة أعلاه.",
        "Meta (منصة واتساب للأعمال): رسائل واتساب والأرقام والأسماء المرافقة لها، خارج قطر.",
        "Cloudflare: الموقع والصفحات التي يفتحها العملاء من واتساب، وتمر عبر شبكتها، خارج قطر.",
        "PostHog: التحليلات الموصوفة في «التحليلات واختيارك»، في الاتحاد الأوروبي.",
        "Resend: الرسائل البريدية التي ترسلها ALYR، مثل رموز الدخول والتقارير الأسبوعية لصاحب المشروع والإيصالات أو الفواتير التي يرسلها المشروع لعميله، في الاتحاد الأوروبي.",
        "Zoho: صناديق البريد الخاصة بـ ALYR، وفيها الرسائل التي يرسلها الناس إلينا، خارج قطر.",
        "مزوّد الدفع الخاص بالمشروع، ونظام المبيعات أو المحاسبة الخاص به إذا ربطه المشروع.",
      ],
      after: [
        "لا نشارك البيانات مع أي جهة أخرى إلا إذا ألزمنا القانون بذلك.",
      ],
    },
    {
      id: "keep",
      title: "كم نحتفظ بها",
      paras: [
        "طوال مدة استخدام المشروع لـ ALYR. عندما يتوقف المشروع، يمكنه طلب نسخة من سجلاته خلال 30 يوماً. وبعد 60 يوماً من توقفه نحذف بياناته، إلا ما يلزمنا القانون بالاحتفاظ به، مثل فواتيرنا له. وتزول النسخ الموجودة في النسخ الاحتياطية خلال 35 يوماً بعد ذلك.",
      ],
    },
    {
      id: "rights",
      title: "حقوقك",
      paras: [
        "يمكنك أن تطلب الاطلاع على البيانات التي نحتفظ بها عنك، أو تصحيحها، أو حذفها.",
        "إذا كنت عميلاً لمشروع يستخدم ALYR، فاسأل المشروع أولاً: فهو صاحب القرار في بياناتك. ويمكنك أيضاً مراسلتنا وسنساعد المشروع على الرد عليك. ولإيقاف رسائل المشروع، أرسل STOP في المحادثة.",
        "إذا كنت مشروعاً أو موظفاً فيه، فاكتب إلى hello@alyr.qa. نرد خلال 30 يوماً.",
      ],
    },
    {
      id: "delete",
      title: "حذف بياناتك",
      paras: ["لتطلب منا حذف بياناتك:"],
      list: [
        "اكتب إلى hello@alyr.qa من البريد الإلكتروني أو رقم الهاتف الذي نعرفك به، واذكر ما تريد حذفه.",
        "إذا ربطت حساب واتساب للأعمال بـ ALYR عبر فيسبوك، يمكنك أيضاً إزالة ALYR من إعدادات فيسبوك، تحت «تكاملات الأعمال». يوقف ذلك وصول ALYR؛ وراسلنا أيضاً إذا أردت حذف البيانات.",
        "نؤكد لك بالبريد الإلكتروني عند الانتهاء، خلال 30 يوماً.",
      ],
      after: [
        "إذا كنت عميلاً لمشروع، نحذف بياناتك بموافقة المشروع، لأن السجلات سجلاته.",
      ],
    },
    {
      id: "security",
      title: "كيف نحميها",
      paras: [
        "تُحفظ سجلات كل مشروع منفصلة داخل قاعدة البيانات نفسها، فلا يرى مشروعٌ سجلات غيره. الاتصالات مشفّرة. لا يطّلع على البيانات في ALYR إلا من يحتاج إليها، وهم ملزمون بالسرية. وإذا وقع اختراق يمس بيانات مشروع، نخبره دون تأخير.",
      ],
    },
    {
      id: "changes",
      title: "التغييرات والتواصل",
      paras: [
        "عندما تتغير هذه السياسة، نحدّث هذه الصفحة وتاريخها. الأسئلة عن بياناتك إلى hello@alyr.qa، وبلاغات الأمان إلى security@alyr.qa.",
        "alyr software ذ.م.م.، سجل تجاري رقم 255539، الدوحة، قطر.",
      ],
    },
  ],
};
