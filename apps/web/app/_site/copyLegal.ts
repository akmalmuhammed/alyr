// The words of the terms of service (/terms, /ar/terms) and the refund policy (/refund, /ar/refund),
// English and Arabic (ALY-301). Paddle, ALYR's card-payment provider and merchant of record
// (D-074), reviews both before it lets a checkout open from alyr.qa.
//
// The English is the final text of docs/company/paddle/terms-draft.md and refund-draft.md on the
// branch aly-301-paddle-pages (PR #222), as the product lead settled it on 31 Oct 2026, with
// four edits the site's checks and the page itself need: the refund page's first heading no
// longer says "money back" (the check refuses the phrase outside the offer switch; the
// pricing page and the refund say the same thing in other words), "WhatsApp's rules" reads
// "WhatsApp's terms, policies and fees" (no "rule" on the public site, founder 25 Oct 2026),
// "privacy notice" reads "privacy policy" (the page's own name), and the decision number
// (D-092) is not printed on a public page. A Qatar-qualified lawyer reads both after they
// are live (ALY-51); changes follow as a new dated version. Neither text is legal advice.
//
// A line may hold a link as [label](address); LegalPage.tsx turns it into one. An address
// beginning with / is a page of this site in the page's language.
//
// The Arabic, below the English, is formal Modern Standard Arabic (documents, arabic.md) with
// one term for each idea: الاشتراك (the subscription), التاجر المسجَّل (Merchant of Record),
// إشعار كتابي (written notice), بدء التشغيل (go-live, as the homepage says it), التحويل
// المصرفي (bank transfer). It is a DRAFT until the native review (ALY-66), like the other
// Arabic pages.

/** A paragraph: plain text, or text with its clause number (4.1). */
export type LegalPara = string | { n: string; text: string };

export type LegalSection = {
  /** The section's anchor, and the contents list's target. */
  id: string;
  title: string;
  paras: LegalPara[];
  list?: string[];
  /** Paragraphs after the list. */
  after?: string[];
};

export type LegalPage = {
  eyebrow: string;
  title: string;
  /** "Last updated 31 October 2026": the day the version was published. */
  updated: string;
  lead: string;
  /** The name of the contents list; when set, the page lists its sections at the top. */
  contents?: string;
  /** Headings carry their number (1, 2, 3 …). */
  numbered?: boolean;
  sections: LegalSection[];
};

// =================================================================== ENGLISH

export const termsEn: LegalPage = {
  eyebrow: "Terms of service",
  title: "ALYR terms of service",
  updated: "Last updated 31 October 2026",
  lead: "These terms apply when you use ALYR. They sit on top of any agreement we sign with you: where there is one, it applies first.",
  contents: "On this page",
  numbered: true,
  sections: [
    {
      id: "who",
      title: "Who we are",
      paras: [
        "ALYR is run by alyr software W.L.L., a company registered in the State of Qatar, commercial registration no. 255539, Doha, Qatar. Contact: [hello@alyr.qa](mailto:hello@alyr.qa).",
      ],
    },
    {
      id: "sells",
      title: "What ALYR sells",
      paras: [
        "ALYR sets up and runs software for businesses: ALYR Chat (orders, bookings, payment links and a shared inbox on WhatsApp's official Business Platform), ALYR Bookings, ALYR Agent and ALYR Accounts, and their supporting tools. We sell to businesses, not to consumers. By signing up you confirm that you act for a business.",
      ],
    },
    {
      id: "account",
      title: "Your account",
      paras: [
        "You create an account with a verified email address. You are responsible for everything done under your account and for the people you give a sign-in. Give sign-ins only to people who work for you.",
      ],
    },
    {
      id: "payment",
      title: "Price and payment",
      paras: [
        { n: "4.1", text: "Prices are on our [pricing page](/pricing): in Qatari riyals when you pay by bank transfer, and in US dollars when you pay by card (our card provider charges in dollars). We can change a price by telling you in writing at least 30 days before; you can stop before the new price applies." },
        { n: "4.2", text: "You pay each month in advance. Card payments are taken by Paddle.com Market Limited, our merchant of record, who charges in US dollars, handles sales tax and sends the receipt. Paddle's buyer terms apply to the card payment: [paddle.com/legal/checkout-buyer-terms](https://www.paddle.com/legal/checkout-buyer-terms). Payment by bank transfer is invoiced by ALYR." },
        { n: "4.3", text: "We never hold, receive or move the money your own customers pay you." },
        { n: "4.4", text: "If a payment is still unpaid 14 days after it was due, we may pause ALYR after at least 7 days' written notice. We charge no interest and no late fee. Pausing never deletes your data." },
      ],
    },
    {
      id: "stopping",
      title: "Stopping",
      paras: [
        "Month to month. You can stop at the end of any month by telling us at least 7 days before it ends (in your first month, up to its last day). We can stop by telling you at least 30 days before. Refunds: see the [refund policy](/refund).",
      ],
    },
    {
      id: "whatsapp",
      title: "WhatsApp and Meta",
      paras: [
        "ALYR is not WhatsApp or Meta and is not endorsed by them. Meta sets WhatsApp's terms, policies and fees. You follow Meta's business and commerce policies and get a person's agreement before sending them marketing messages.",
      ],
    },
    {
      id: "use",
      title: "Acceptable use",
      paras: [
        "Use ALYR only for your own lawful business. No spam, no unlawful content, no reselling or copying ALYR, and no attempts to get around its security or its consent checks.",
      ],
    },
    {
      id: "data",
      title: "Your data",
      paras: [
        "Your data is yours. We use it only to run ALYR for you, support you and keep it secure; we do not sell it. For the personal data of your customers and team, you are the controller and we process it on your behalf under Qatar's Personal Data Privacy Protection Law (Law No. 13 of 2016). How we handle data, and who processes it: see the [privacy policy](/privacy). When you stop, you can ask for a copy within 30 days, and we delete your data 60 days after the end, except what the law requires us to keep.",
      ],
    },
    {
      id: "availability",
      title: "Availability",
      paras: [
        "ALYR depends on WhatsApp and on internet and hosting providers we do not control. We do not promise a level of uptime. We tell you when we know something is wrong and fix faults on our side as fast as we reasonably can.",
      ],
    },
    {
      id: "liability",
      title: "Liability",
      paras: [
        "Our total liability to you is limited to what you paid us in the 12 months before the event behind the claim. Neither of us is liable for indirect losses or lost profit as far as Qatar's law allows. Nothing limits liability for fraud or any liability the law does not allow us to limit.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      paras: [
        "We may change these terms; we tell you at least 30 days ahead for changes that affect you. A signed agreement can only be changed in writing by both of us.",
      ],
    },
    {
      id: "law",
      title: "Law and disputes",
      paras: [
        "The law of the State of Qatar applies. We first try to settle a disagreement by talking for 30 days; then the competent courts of Qatar decide.",
      ],
    },
  ],
};

export const refundEn: LegalPage = {
  eyebrow: "Refund policy",
  title: "ALYR refund policy",
  updated: "Last updated 31 October 2026",
  lead: "When ALYR refunds you, how the money comes back and how to ask.",
  sections: [
    {
      id: "first-month",
      title: "Your first month, refunded if the result is missed",
      paras: [
        "Before we start, we agree one result with you in writing, for example a number of orders or bookings taken through the chat. It is counted in your ALYR workspace, where you can see it too, over the 30 days after you go live. If the result is missed, we refund your first month's subscription in full, within 14 days after the 30 days end, the same way you paid, without your having to ask. This applies once per business. To qualify, put up the QR codes we give you and share your chat link with your customers in the first 7 days.",
      ],
    },
    {
      id: "stopping",
      title: "Stopping",
      paras: [
        "You can stop at the end of any month with 7 days' notice (in your first month, up to its last day, so you see the result first). You pay for the month you have started; we do not refund part of a month you chose to stop in, except as below.",
      ],
    },
    {
      id: "more",
      title: "When we refund more",
      paras: [],
      list: [
        "If you end the agreement because we seriously broke it and did not put it right within 14 days, or a fault on our side stopped ALYR working for you for more than 3 days in a row, we refund the part of the month you paid for and did not get.",
        "If we have not got you live within 30 days after the date we agreed, unless you caused the delay, we refund what you paid. There is no setup fee at the moment; if one is ever charged, it is covered by this line.",
      ],
    },
    {
      id: "paid",
      title: "How refunds are paid",
      paras: [],
      list: [
        "Card payments are taken by Paddle.com Market Limited, our merchant of record. We ask Paddle to refund the card, and the money returns to the same card in the same US dollar amount, which can take 5 to 10 business days to show on your statement, depending on your bank. You can also contact Paddle: [paddle.com/help/contact](https://www.paddle.com/help/contact)",
        "Bank transfers are refunded by transfer to the account you paid from, in riyals.",
      ],
    },
    {
      id: "ask",
      title: "How to ask",
      paras: [
        "Write to [hello@alyr.qa](mailto:hello@alyr.qa) with your business name. We reply within 3 business days.",
      ],
    },
    {
      id: "rights",
      title: "Your legal rights",
      paras: [
        "This policy does not take away any right you have under Qatar's law.",
      ],
    },
  ],
};

// =================================================================== ARABIC
// FORMAL MODERN STANDARD ARABIC, A DRAFT FOR THE NATIVE REVIEW (ALY-66). Same sections, same
// order and same links as the English above; edit them together.

export const termsAr: LegalPage = {
  eyebrow: "شروط الخدمة",
  title: "شروط خدمة ALYR",
  updated: "آخر تحديث: 31 أكتوبر 2026",
  lead: "تسري هذه الشروط عند استخدامك ALYR، وهي تُضاف إلى أي اتفاقية نوقّعها معك؛ وحيثما وُجدت اتفاقية فإنها تُطبَّق أولاً.",
  contents: "في هذه الصفحة",
  numbered: true,
  sections: [
    {
      id: "who",
      title: "من نحن",
      paras: [
        "تدير ALYR شركةُ alyr software ذ.م.م. (الير للبرمجيات)، وهي شركة مسجّلة في دولة قطر، بسجل تجاري رقم 255539، ومقرها الدوحة، قطر. للتواصل: [hello@alyr.qa](mailto:hello@alyr.qa).",
      ],
    },
    {
      id: "sells",
      title: "ما تبيعه ALYR",
      paras: [
        "تجهّز ALYR برمجيات للمشاريع وتشغّلها لها، وهي: ALYR Chat (الطلبات والحجوزات وروابط الدفع وصندوق مشترك للفريق على منصة واتساب للأعمال الرسمية)، وALYR Bookings، وALYR Agent، وALYR Accounts، والأدوات المساندة لها. نبيع للمشاريع وليس للمستهلكين، وبتسجيلك تؤكد أنك تتصرف نيابةً عن مشروع.",
      ],
    },
    {
      id: "account",
      title: "حسابك",
      paras: [
        "تنشئ حسابك ببريد إلكتروني جرى التحقق منه. وأنت مسؤول عن كل ما يجري عبر حسابك، وعن الأشخاص الذين تمنحهم حق الدخول. لا تمنح حق الدخول إلا لمن يعمل لديك.",
      ],
    },
    {
      id: "payment",
      title: "السعر والدفع",
      paras: [
        { n: "4.1", text: "الأسعار مذكورة في [صفحة الأسعار](/ar/pricing): بالريال القطري عند الدفع بالتحويل المصرفي، وبالدولار الأمريكي عند الدفع بالبطاقة (لأن مزوّد البطاقات لدينا يحصّل المبالغ بالدولار). يجوز لنا تغيير السعر بإشعارك كتابةً قبل 30 يوماً على الأقل، ولك أن تتوقف قبل سريان السعر الجديد." },
        { n: "4.2", text: "تدفع كل شهر مقدماً. تُحصَّل مدفوعات البطاقة عبر Paddle.com Market Limited، وهي التاجر المسجَّل (Merchant of Record) لدينا، وتحصّل المبالغ بالدولار الأمريكي، وتتولى ضريبة المبيعات، وترسل لك الإيصال. وتسري شروط المشتري لدى Paddle على الدفع بالبطاقة: [paddle.com/legal/checkout-buyer-terms](https://www.paddle.com/legal/checkout-buyer-terms). أما الدفع بالتحويل المصرفي فتصدر ALYR فاتورته." },
        { n: "4.3", text: "لا نستلم أبداً الأموال التي يدفعها لك عملاؤك، ولا نحتفظ بها، ولا ننقلها." },
        { n: "4.4", text: "إذا بقي مبلغ غير مدفوع بعد 14 يوماً من استحقاقه، جاز لنا إيقاف ALYR مؤقتاً بعد إشعار كتابي مدته 7 أيام على الأقل. لا نفرض فوائد ولا رسوم تأخير. ولا يؤدي الإيقاف المؤقت إلى حذف بياناتك." },
      ],
    },
    {
      id: "stopping",
      title: "الإيقاف",
      paras: [
        "الاشتراك شهري، شهراً بشهر. يمكنك الإيقاف في نهاية أي شهر بإبلاغنا قبل انتهائه بـ 7 أيام على الأقل (وفي شهرك الأول حتى آخر يوم فيه). ويجوز لنا الإيقاف بإبلاغك قبل 30 يوماً على الأقل. أحكام الاسترداد في [سياسة الاسترداد](/ar/refund).",
      ],
    },
    {
      id: "whatsapp",
      title: "واتساب وMeta",
      paras: [
        "ALYR ليست واتساب ولا Meta، وليست معتمدة منهما. وMeta هي التي تحدد شروط واتساب وسياساته ورسومه. عليك الالتزام بسياسات Meta للأعمال والتجارة، والحصول على موافقة الشخص قبل أن ترسل إليه رسائل تسويقية.",
      ],
    },
    {
      id: "use",
      title: "الاستخدام المقبول",
      paras: [
        "استخدم ALYR لأعمالك المشروعة فقط. يُمنع إرسال الرسائل المزعجة، ونشر المحتوى المخالف للقانون، وإعادة بيع ALYR أو نسخها، ومحاولة التحايل على إجراءاتها الأمنية أو على فحوص الموافقة فيها.",
      ],
    },
    {
      id: "data",
      title: "بياناتك",
      paras: [
        "بياناتك ملك لك. لا نستخدمها إلا لتشغيل ALYR لك ودعمك وحمايتها، ولا نبيعها. وفي ما يخص البيانات الشخصية لعملائك وفريقك، فأنت المراقب (Controller) ونحن نعالجها نيابةً عنك بموجب قانون حماية خصوصية البيانات الشخصية في قطر (القانون رقم 13 لسنة 2016). وكيفية تعاملنا مع البيانات ومن يعالجها مبيّنة في [سياسة الخصوصية](/ar/privacy). وعند توقفك يمكنك طلب نسخة من بياناتك خلال 30 يوماً، ونحذف بياناتك بعد 60 يوماً من انتهاء الخدمة، باستثناء ما يوجب القانون الاحتفاظ به.",
      ],
    },
    {
      id: "availability",
      title: "التوافر",
      paras: [
        "تعتمد ALYR على واتساب وعلى مزوّدي الإنترنت والاستضافة الذين لا نتحكم بهم. لذلك لا نَعِد بمستوى معيّن من التوافر. نخبرك عندما نعلم بوجود مشكلة، ونصلح الأعطال من جانبنا بأسرع ما يمكن بصورة معقولة.",
      ],
    },
    {
      id: "liability",
      title: "المسؤولية",
      paras: [
        "تقتصر مسؤوليتنا الإجمالية تجاهك على المبلغ الذي دفعته لنا خلال الأشهر الـ 12 السابقة للواقعة التي تستند إليها المطالبة. ولا يتحمل أي منا المسؤولية عن الخسائر غير المباشرة أو ضياع الأرباح إلى الحد الذي يسمح به القانون القطري. ولا يوجد في هذه الشروط ما يحد من المسؤولية عن الاحتيال، أو عن أي مسؤولية لا يجيز القانون لنا الحد منها.",
      ],
    },
    {
      id: "changes",
      title: "التغييرات",
      paras: [
        "يجوز لنا تعديل هذه الشروط، ونبلغك قبل 30 يوماً على الأقل بالتعديلات التي تمسّك. أما الاتفاقية الموقّعة فلا تُعدَّل إلا كتابةً وبموافقة الطرفين.",
      ],
    },
    {
      id: "law",
      title: "القانون وتسوية النزاعات",
      paras: [
        "يسري قانون دولة قطر. نحاول أولاً تسوية أي خلاف بالتحاور مدة 30 يوماً، ثم تفصل فيه المحاكم المختصة في دولة قطر.",
      ],
    },
  ],
};

export const refundAr: LegalPage = {
  eyebrow: "سياسة الاسترداد",
  title: "سياسة الاسترداد في ALYR",
  updated: "آخر تحديث: 31 أكتوبر 2026",
  lead: "متى نعيد لك المبلغ، وكيف يعود إليك، وكيف تطلب ذلك.",
  sections: [
    {
      id: "first-month",
      title: "شهرك الأول، يُسترد إن لم نحقق النتيجة",
      paras: [
        "قبل أن نبدأ، نتفق معك كتابةً على نتيجة واحدة، مثل عدد الطلبات أو الحجوزات التي تصلك عبر المحادثة. وتُحتسب النتيجة في مساحة عملك على ALYR، وتراها أنت أيضاً، خلال الـ 30 يوماً التي تلي بدء التشغيل. وإذا لم تتحقق النتيجة، نعيد إليك اشتراك شهرك الأول كاملاً خلال 14 يوماً من انتهاء الـ 30 يوماً، بالطريقة نفسها التي دفعت بها، ودون أن تضطر إلى طلب ذلك. ينطبق هذا مرة واحدة لكل مشروع. وحتى تستحق الاسترداد، ضع رموز QR التي نسلّمها لك وشارك رابط المحادثة مع عملائك خلال الأيام السبعة الأولى.",
      ],
    },
    {
      id: "stopping",
      title: "الإيقاف",
      paras: [
        "يمكنك الإيقاف في نهاية أي شهر بإشعار مدته 7 أيام (وفي شهرك الأول حتى آخر يوم فيه، لترى النتيجة أولاً). تدفع عن الشهر الذي بدأته، ولا نعيد جزءاً من شهر اخترت الإيقاف فيه، إلا في الحالات المذكورة أدناه.",
      ],
    },
    {
      id: "more",
      title: "حالات نعيد فيها أكثر",
      paras: [],
      list: [
        "إذا أنهيت الاتفاقية لأننا أخللنا بها إخلالاً جسيماً ولم نعالجه خلال 14 يوماً، أو لأن عطلاً من جانبنا أوقف عمل ALYR لك أكثر من 3 أيام متتالية، نعيد إليك الجزء من الشهر الذي دفعته ولم تحصل عليه.",
        "إذا لم نبدأ تشغيل ALYR لك خلال 30 يوماً من التاريخ المتفق عليه، ما لم تكن أنت سبب التأخير، نعيد إليك ما دفعته. لا توجد رسوم تجهيز حالياً؛ وإذا فُرضت رسوم تجهيز يوماً ما فهي مشمولة بهذا البند.",
      ],
    },
    {
      id: "paid",
      title: "كيف تُدفع المبالغ المستردة",
      paras: [],
      list: [
        "مدفوعات البطاقة تحصّلها Paddle.com Market Limited، وهي التاجر المسجَّل (Merchant of Record) لدينا. نطلب من Paddle ردّ المبلغ إلى البطاقة، فيعود إلى البطاقة نفسها وبمبلغ الدولار الأمريكي نفسه، وقد يستغرق ظهوره في كشف حسابك من 5 إلى 10 أيام عمل بحسب مصرفك. ويمكنك أيضاً التواصل مع Paddle: [paddle.com/help/contact](https://www.paddle.com/help/contact)",
        "التحويلات المصرفية نردّ مبالغها بتحويل مصرفي إلى الحساب الذي دفعت منه، بالريال القطري.",
      ],
    },
    {
      id: "ask",
      title: "كيف تطلب الاسترداد",
      paras: [
        "اكتب إلى [hello@alyr.qa](mailto:hello@alyr.qa) واذكر اسم مشروعك. نرد خلال 3 أيام عمل.",
      ],
    },
    {
      id: "rights",
      title: "حقوقك القانونية",
      paras: [
        "لا تنتقص هذه السياسة من أي حق لك بموجب قانون قطر.",
      ],
    },
  ],
};
