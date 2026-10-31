// The words of the pricing page (/pricing, /ar/pricing), English and Arabic (ALY-301). Paddle,
// ALYR's card-payment provider (D-074), wants the product and what it costs visible, with the
// terms, the refund policy and the privacy policy linked, before it lets a checkout open from
// alyr.qa. The founder decided on 31 Oct 2026 to publish the prices; the page stands alone,
// so it does not wait for the homepage's offer switch (NEXT_PUBLIC_ALYR_OFFER, site.ts).
//
// Every figure comes from the back office's price list defaults, not from older copy:
// - QAR 449 a month for the first product (ALYR Chat, ALYR Bookings or ALYR Accounts):
//   migrations 0015_pricing.sql (chat), 0017_product_line_up.sql (bookings) and
//   0018_combination_pricing.sql (accounts, formerly "credit"), all 44900 dirhams;
// - QAR 50 a month for each product added: 0018 set the item "extra_product" to 15000 dirhams
//   and 0049_no_payment_first.sql (D-053, 25 Oct 2026) moved it to 5000;
// - USD 129 and USD 15 by card: 0064_card_billing.sql (price_usd 12900 and 1500; D-074);
// - ALYR Agent (0 in 0017) and ALYR Shelf come with every product (D-123);
// - no setup fee: D-092 (30 Oct 2026) took the "setup" line (QAR 2,500 in 0015) out of use.
// ALYR Docs is not on this page: it has no price (D-123).
//
// What every month includes follows clause 2.2 of the customer agreement draft (PR #47,
// docs/company/customer-agreement/agreement.md), with the weekly report framed as the
// homepage frames it. The terms, the refund and the payment lines follow the final texts in
// copyLegal.ts. A line may hold a link as [label](address) (LegalPage.tsx's links).
//
// The Arabic, below the English, is formal Modern Standard Arabic and a DRAFT for the native
// review (ALY-66); it uses the legal terms of copyLegal.ts.

/** One price in a table cell: the amount as the page prints it, and what it is per. */
export type PriceCell = { amount: string; per?: string };

export type PricingPage = {
  eyebrow: string;
  title: string;
  /** "Last updated 31 October 2026". */
  updated: string;
  lead: string;
  plan: {
    title: string;
    /** The table's name for screen readers. */
    caption: string;
    /** The first column's head. */
    what: string;
    transfer: { name: string; currency: string };
    card: { name: string; currency: string };
    rows: { name: string; note: string; transfer: PriceCell; card: PriceCell }[];
    confirm: string;
  };
  examples: {
    title: string;
    caption: string;
    rows: { name: string; transfer: PriceCell; card: PriceCell }[];
  };
  terms: { title: string; rows: { name: string; value: string }[] };
  includes: { title: string; items: string[]; note: string };
  refund: { title: string; body: string; link: string };
  pay: { title: string; items: { name: string; body: string }[]; note: string };
  seller: { title: string; body: string };
};

// =================================================================== ENGLISH

export const pricingEn: PricingPage = {
  eyebrow: "Pricing",
  title: "What ALYR costs",
  updated: "Last updated 31 October 2026",
  lead: "ALYR is the tech team for owner-run businesses in Qatar. We set up your orders, bookings, credit accounts and stock on one screen, in your shop, and keep improving it with you. One plan, month to month, with no setup fee.",
  plan: {
    title: "The plan",
    caption: "Monthly prices: by bank transfer in Qatari riyals, and by card in US dollars",
    what: "Each month",
    transfer: { name: "By bank transfer", currency: "Qatari riyals" },
    card: { name: "By card", currency: "US dollars" },
    rows: [
      {
        name: "Your first product",
        note: "ALYR Chat, ALYR Bookings or ALYR Accounts",
        transfer: { amount: "QAR 449", per: "a month" },
        card: { amount: "USD 129", per: "a month" },
      },
      {
        name: "Each product you add",
        note: "Another of the three, in the same workspace",
        transfer: { amount: "QAR 50", per: "a month" },
        card: { amount: "USD 15", per: "a month" },
      },
      {
        name: "ALYR Agent and ALYR Shelf",
        note: "They come with every product",
        transfer: { amount: "Included" },
        card: { amount: "Included" },
      },
      {
        name: "Setup fee",
        note: "There is no setup fee at the moment",
        transfer: { amount: "None" },
        card: { amount: "None" },
      },
    ],
    confirm: "These are our list prices. You see your own price, in writing, before you pay anything, and you pay nothing until you go live.",
  },
  examples: {
    title: "For example, each month",
    caption: "Examples of monthly prices",
    rows: [
      { name: "A salon with ALYR Bookings", transfer: { amount: "QAR 449" }, card: { amount: "USD 129" } },
      { name: "A bakery with ALYR Chat and ALYR Accounts", transfer: { amount: "QAR 499" }, card: { amount: "USD 144" } },
      { name: "Home services with ALYR Chat, ALYR Bookings and ALYR Accounts", transfer: { amount: "QAR 549" }, card: { amount: "USD 159" } },
    ],
  },
  terms: {
    title: "How the plan works",
    rows: [
      { name: "Term", value: "Month to month. You can stop at the end of any month by telling us at least 7 days before it ends; in your first month, up to its last day." },
      { name: "Commission", value: "None. ALYR takes no commission on your orders, bookings or payments." },
      { name: "WhatsApp message fees", value: "Meta decides which messages carry a fee and bills them to your business at Meta's rates. ALYR adds nothing to them." },
      { name: "When you pay", value: "Each month in advance. Nothing is charged before you go live." },
      { name: "Price changes", value: "We can change a price by telling you in writing at least 30 days before. You can stop before the new price applies." },
    ],
  },
  includes: {
    title: "What every month includes",
    items: [
      "Your products, with every update and nothing to install",
      "ALYR Agent and ALYR Shelf with every product",
      "Sign-ins for your whole team",
      "A weekly report of your week on WhatsApp, once WhatsApp approves its wording",
      "A person from ALYR who answers your messages",
      "Changes to your menu, prices and opening hours whenever you ask",
    ],
    note: "We do not promise a response time.",
  },
  refund: {
    title: "Your first month, refunded if the result is missed",
    body: "Before we start, we agree one result with you in writing, for example a number of orders or bookings taken through the chat. It is counted in your workspace over the 30 days after you go live. If the result is missed, we refund your first month's subscription in full.",
    link: "Read the refund policy",
  },
  pay: {
    title: "How to pay",
    items: [
      {
        name: "By card",
        body: "Card payments are taken by Paddle.com Market Limited, our merchant of record. Paddle charges in US dollars, handles sales tax and sends your receipt. Paddle's buyer terms apply: [paddle.com/legal/checkout-buyer-terms](https://www.paddle.com/legal/checkout-buyer-terms).",
      },
      {
        name: "By bank transfer",
        body: "ALYR invoices you in Qatari riyals and you pay by bank transfer.",
      },
    ],
    note: "ALYR never holds, receives or moves the money your own customers pay you.",
  },
  seller: {
    title: "Who sells ALYR",
    body: "ALYR is run by alyr software W.L.L., commercial registration 255539, Doha, Qatar. Questions about prices or payment go to [hello@alyr.qa](mailto:hello@alyr.qa). The [terms of service](/terms), the [refund policy](/refund) and the [privacy policy](/privacy) apply.",
  },
};

// =================================================================== ARABIC
// FORMAL MODERN STANDARD ARABIC, A DRAFT FOR THE NATIVE REVIEW (ALY-66). Same sections, rows
// and links as the English above; edit them together.

export const pricingAr: PricingPage = {
  eyebrow: "الأسعار",
  title: "كم تكلّف ALYR",
  updated: "آخر تحديث: 31 أكتوبر 2026",
  lead: "ALYR فريق التقنية للأنشطة التي يديرها أصحابها في قطر. نجهّز طلباتك وحجوزاتك وحساباتك الآجلة ومخزونك في شاشة واحدة، في محلك، ونواصل تحسينها معك. خطة واحدة، شهراً بشهر، وبلا رسوم تجهيز.",
  plan: {
    title: "الخطة",
    caption: "الأسعار الشهرية: بالتحويل المصرفي بالريال القطري، وبالبطاقة بالدولار الأمريكي",
    what: "كل شهر",
    transfer: { name: "بالتحويل المصرفي", currency: "بالريال القطري" },
    card: { name: "بالبطاقة", currency: "بالدولار الأمريكي" },
    rows: [
      {
        name: "أول منتج",
        note: "ALYR Chat أو ALYR Bookings أو ALYR Accounts",
        transfer: { amount: "449 ر.ق", per: "شهرياً" },
        card: { amount: "129 دولاراً", per: "شهرياً" },
      },
      {
        name: "كل منتج تضيفه",
        note: "منتج آخر من الثلاثة، في مساحة العمل نفسها",
        transfer: { amount: "50 ر.ق", per: "شهرياً" },
        card: { amount: "15 دولاراً", per: "شهرياً" },
      },
      {
        name: "ALYR Agent وALYR Shelf",
        note: "يأتيان مع كل منتج",
        transfer: { amount: "مشمولان" },
        card: { amount: "مشمولان" },
      },
      {
        name: "رسوم التجهيز",
        note: "لا توجد رسوم تجهيز حالياً",
        transfer: { amount: "لا توجد" },
        card: { amount: "لا توجد" },
      },
    ],
    confirm: "هذه أسعار القائمة لدينا. ترى سعرك الخاص كتابةً قبل أن تدفع أي مبلغ، ولا تدفع شيئاً قبل بدء التشغيل.",
  },
  examples: {
    title: "مثلاً، كل شهر",
    caption: "أمثلة على الأسعار الشهرية",
    rows: [
      { name: "صالون مع ALYR Bookings", transfer: { amount: "449 ر.ق" }, card: { amount: "129 دولاراً" } },
      { name: "مخبز مع ALYR Chat وALYR Accounts", transfer: { amount: "499 ر.ق" }, card: { amount: "144 دولاراً" } },
      { name: "خدمات منزلية مع ALYR Chat وALYR Bookings وALYR Accounts", transfer: { amount: "549 ر.ق" }, card: { amount: "159 دولاراً" } },
    ],
  },
  terms: {
    title: "كيف تعمل الخطة",
    rows: [
      { name: "المدة", value: "اشتراك شهري. يمكنك الإيقاف في نهاية أي شهر بإبلاغنا قبل انتهائه بـ 7 أيام على الأقل، وفي شهرك الأول حتى آخر يوم فيه." },
      { name: "العمولة", value: "لا عمولة. ALYR لا تأخذ أي نسبة من طلباتك أو حجوزاتك أو مدفوعاتك." },
      { name: "رسوم رسائل واتساب", value: "تحدد Meta الرسائل التي تترتب عليها رسوم، وتحتسبها على مشروعك بأسعارها. ولا نضيف عليها شيئاً." },
      { name: "موعد الدفع", value: "كل شهر مقدماً. ولا يُحصَّل أي مبلغ قبل بدء التشغيل." },
      { name: "تغيير الأسعار", value: "يجوز لنا تغيير السعر بإشعارك كتابةً قبل 30 يوماً على الأقل، ولك أن تتوقف قبل سريان السعر الجديد." },
    ],
  },
  includes: {
    title: "ما يشمله كل شهر",
    items: [
      "منتجاتك، مع كل تحديث وبلا تثبيت",
      "ALYR Agent وALYR Shelf مع كل منتج",
      "حسابات دخول لفريقك كله",
      "تقرير أسبوعي عن أسبوعك على واتساب، بعد موافقة واتساب على صياغته",
      "شخص من ALYR يردّ على رسائلك",
      "تعديل قائمتك وأسعارك وساعات عملك متى طلبت",
    ],
    note: "لا نَعِد بزمن محدد للرد.",
  },
  refund: {
    title: "شهرك الأول، يُسترد إن لم نحقق النتيجة",
    body: "قبل أن نبدأ، نتفق معك كتابةً على نتيجة واحدة، مثل عدد الطلبات أو الحجوزات التي تصلك عبر المحادثة. وتُحتسب في مساحة عملك خلال الـ 30 يوماً التي تلي بدء التشغيل. وإن لم تتحقق النتيجة، نعيد إليك اشتراك شهرك الأول كاملاً.",
    link: "اقرأ سياسة الاسترداد",
  },
  pay: {
    title: "طريقة الدفع",
    items: [
      {
        name: "بالبطاقة",
        body: "تُحصَّل مدفوعات البطاقة عبر Paddle.com Market Limited، وهي التاجر المسجَّل (Merchant of Record) لدينا. وتحصّل Paddle المبالغ بالدولار الأمريكي، وتتولى ضريبة المبيعات، وترسل لك الإيصال. وتسري شروط المشتري لدى Paddle: [paddle.com/legal/checkout-buyer-terms](https://www.paddle.com/legal/checkout-buyer-terms).",
      },
      {
        name: "بالتحويل المصرفي",
        body: "تصدر ALYR فاتورتك بالريال القطري، وتدفعها بتحويل مصرفي.",
      },
    ],
    note: "لا نستلم أبداً الأموال التي يدفعها لك عملاؤك، ولا نحتفظ بها، ولا ننقلها.",
  },
  seller: {
    title: "من يبيع ALYR",
    body: "تدير ALYR شركةُ alyr software ذ.م.م. (الير للبرمجيات)، سجل تجاري رقم 255539، الدوحة، قطر. للأسئلة عن الأسعار أو الدفع اكتب إلى [hello@alyr.qa](mailto:hello@alyr.qa). وتسري [شروط الخدمة](/ar/terms) و[سياسة الاسترداد](/ar/refund) و[سياسة الخصوصية](/ar/privacy).",
  },
};
