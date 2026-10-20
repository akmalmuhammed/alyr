// The words of the ALYR Docs page (/docs, /ar/docs), English and Arabic, from
// docs/site-products-2/02-messaging.md §4 and 03-visuals.md §3. ALYR Docs is the Documents
// module's public name (founder, 20 Oct 2026). The module is built and still off for every
// shop, so nothing here says or implies a shop can use it yet: no "today", "now", "live",
// "turn it on" or "coming". It is set up with you, like every ALYR product. Every drawn
// screen uses the product's own words (`modules/documents/words.py`, `delivery_words.py`,
// `_workspace/documentsCopy.ts`, `(product)/d/[slug]/page.tsx`) for Qirfa Bakery on Monday
// 19 Oct 2026. No line says "tax invoice" as something ALYR Docs issues, names e-invoicing,
// a retention period or a POS. The Arabic is a draft until the native review (ALY-66).

import type { Caption, DemoSet, FlowSet, PageCommon, ScreenSection } from "./copy";

export { PAPER_LABELS, RC0042, type Pair, type PaperDoc, type PaperLabels } from "./paperData";

/** The hosted page of one document (`/d/…`), as the customer sees it. */
export type DocLinkPage = {
  shop: string;
  monogram: string;
  context: string;
  eyebrow: string;
  number: string;
  issued: string;
  status: string;
  tone: "good" | "off" | "plain";
  linesLabel: string;
  lines: { name: string; meta: string; total: string }[];
  totals: { label: string; value: string; strong?: boolean }[];
  download: string;
};

/** FIG 01: a cash payment becomes receipt RC-0042 (03 §3.1). */
export type PaymentMoment = {
  eyebrow: string;
  title: string;
  body: string;
  caption: Caption;
  label: string;
  parts: { sheet: string; paper: string; chat: string };
  form: {
    shop: string; monogram: string; path: string; title: string; sub: string;
    amountLabel: string; amount: string; methodLabel: string; methods: string[];
    receipt: string; receiptHint: string; button: string; done: string;
  };
  chat: {
    business: string; avatar: string; meta: string; today: string;
    earlier: { text: string; at: string };
    file: string; fileMeta: string; caption: string; at: string;
    sent: string;
  };
};

/** The Documents section of the workspace (`/app/documents`), drawn. */
export type DocsSheet = {
  path: string;
  sub: string;
  search: string;
  filters: string[];
  heads: { number: string; kind: string; customer: string; amount: string; payment: string; delivery: string };
  rows: { number: string; kind: string; customer: string; amount: string; payment?: string; delivery: string; branch?: string; note?: string; on?: boolean; cancelled?: boolean }[];
  sorted: string;
  actions: string[];
};

export type DocsPage = PageCommon & {
  demo: DemoSet;
  moment: PaymentMoment;
  flow: FlowSet;
  screen: ScreenSection & { sheet: DocsSheet };
  paper: { eyebrow: string; title: string; body: string; caption: Caption; label: string; a4: string; roll: string; next: string; seriesLabel: string };
  issued: { eyebrow: string; title: string; body: string; caption: Caption; label: string; phones: { label: string; page: DocLinkPage }[] };
  cr: { eyebrow: string; title: string; body: string; caption: Caption; label: string };
};

// ------------------------------------------------------------------ English

const linkEn = (page: Omit<DocLinkPage, "shop" | "monogram" | "download" | "linesLabel">): DocLinkPage => ({
  shop: "Qirfa Bakery", monogram: "QB", download: "Download PDF", linesLabel: "Items", ...page,
});

export const docsEn: DocsPage = {
  bar: {
    label: "ALYR Docs",
    links: [
      { id: "how", label: "How it works" },
      { id: "inside", label: "What’s in it" },
      { id: "works", label: "Works with" },
    ],
  },
  hero: {
    eyebrow: "ALYR Docs · Set up for you",
    title: ["Payment in, receipt out.", "Every number in order. Every paper final."],
    lead:
      "When a payment is recorded, ALYR Docs issues the receipt with the next number and sends it to your customer. Arabic comes first, and nothing on it can change once it is issued. No commercial registration yet? You issue receipts, and invoices once you register.",
    facts: ["Numbers that never skip", "Final once issued", "Arabic first, English beside it"],
  },
  demo: {
    business: "Qirfa Bakery",
    businessMeta: "Business account",
    today: "Monday",
    typeHere: "Message",
    workspace: "Workspace",
    note: "Sample conversation with a fictional bakery. A document is sent on WhatsApp when the customer has written in the last 24 hours.",
    tabsLabel: "What ALYR Docs does",
    pause: "Pause the demo",
    play: "Play the demo",
    demos: [
      {
        id: "receipt",
        tab: "Receipt",
        start: 10 * 60 + 31,
        chat: [
          { from: "customer", text: "Is my order ready? I’m on my way." },
          {
            from: "business",
            doc: { name: "RC-0042.pdf", meta: "1 page · PDF" },
            text: "Receipt RC-0042 from Qirfa Bakery: QAR 64.00. Thank you.\nYou can also open it online:\nalyr.qa/d/… .",
          },
        ],
        panel: {
          kicker: "Documents",
          title: "Record a payment",
          badge: "Order #1461",
          rows: [
            { main: "Amount", sub: "Cash · Make the receipt", trail: "QAR 64.00", tone: "done" },
            { main: "Payment recorded. Receipt RC-0042 made.", sub: "Aisha Hamad · Paid", trail: "Sent", tone: "signal", wrap: true },
          ],
        },
        caption: "Cash taken at the counter, written down. The receipt goes in the chat as a PDF when the customer has written in the last 24 hours.",
      },
      {
        id: "paper",
        tab: "The paper",
        start: 10 * 60 + 40,
        chat: [],
        panel: { kicker: "Documents", title: "Receipt RC-0042", badge: "A4", rows: [], paper: true },
        caption: "Arabic first, English beside it, and the number in order. The shop can remove “Issued with ALYR”.",
      },
      {
        id: "no-cr",
        tab: "No CR",
        start: 11 * 60,
        chat: [],
        panel: {
          kicker: "Documents",
          title: "A shop with no CR number",
          badge: "Receipts",
          rows: [
            {
              main: "On every receipt",
              sub: "The seller has no commercial registration number on file. This document is a receipt and is not a tax invoice. ALYR does not give tax advice.",
              tone: "done",
              wrap: true,
            },
            {
              main: "Invoice",
              sub: "To issue an invoice, we need your shop’s commercial registration (CR) number. You can add it in your document settings. In the meantime you can issue a receipt, which does not need one.",
              tone: "quiet",
              wrap: true,
            },
          ],
        },
        caption: "No CR yet: receipts, and each one says so. Add your CR number, and invoices are there too.",
      },
      {
        id: "correct",
        tab: "Correct",
        start: 15 * 60 + 12,
        chat: [
          {
            from: "business",
            doc: { name: "CN-0003.pdf", meta: "1 page · PDF" },
            text: "Credit note CN-0003 from Qirfa Bakery: QAR 254.00. It cancels a document we issued before.\nYou can also open it online:\nalyr.qa/d/… .",
          },
        ],
        panel: {
          kicker: "Documents",
          title: "Invoice INV-0017",
          badge: "Omar Ali",
          rows: [
            { lead: "INV-0017", main: "Invoice · QAR 254.00", sub: "Cancelled by credit note CN-0003", trail: "Cancelled", tone: "quiet" },
            { lead: "CN-0003", main: "Credit note · QAR 254.00", sub: "Cancels INV-0017", trail: "Sent", tone: "signal" },
          ],
        },
        caption: "Issued means final. A correction is a credit note, and both keep their numbers.",
      },
      {
        id: "link",
        tab: "The link",
        start: 10 * 60 + 41,
        chat: [],
        panel: {
          kicker: "Document page",
          title: "Receipt RC-0042",
          badge: "alyr.qa/d/…",
          rows: [],
          doc: linkEn({
            context: "Receipt",
            eyebrow: "Receipt",
            number: "RC-0042",
            issued: "Issued 19 October 2026",
            status: "Paid",
            tone: "good",
            lines: [
              { name: "Saffron milk cake, slice", meta: "2 pc × QAR 26.00", total: "QAR 52.00" },
              { name: "Butter croissant", meta: "1 pc × QAR 12.00", total: "QAR 12.00" },
            ],
            totals: [{ label: "Total", value: "QAR 64.00", strong: true }],
          }),
        },
        caption: "Every document has its own page, with Paid or Balance due and Download PDF. The page itself shows nothing about the customer.",
      },
    ],
  },
  moment: {
    eyebrow: "A payment becomes paper",
    title: "One payment, one receipt, one number.",
    body:
      "Yusuf records Aisha’s cash at the counter. ALYR Docs takes the next receipt number and draws the paper in Arabic and English. Aisha wrote to the shop a few minutes before, so the PDF goes to her chat.",
    caption: { n: "01", text: "A cash payment becomes receipt RC-0042" },
    label:
      "A cash payment of QAR 64.00 is recorded in a fictional bakery’s workspace. Receipt RC-0042 is made, its paper is drawn Arabic first with English beside it, and the PDF arrives in the customer’s WhatsApp chat, below the message she sent minutes earlier, with its caption. The delivery shows Sent.",
    parts: { sheet: "The workspace", paper: "The paper", chat: "Aisha’s phone" },
    form: {
      shop: "Qirfa Bakery",
      monogram: "QB",
      path: "Documents",
      title: "Record a payment",
      sub: "Money you took yourself. ALYR never holds money; this writes it down, with who and when.",
      amountLabel: "Amount",
      amount: "QAR 64.00",
      methodLabel: "How was it paid?",
      methods: ["Cash", "Card", "Bank transfer", "Cheque"],
      receipt: "Make the receipt",
      receiptHint: "A receipt is numbered and can be sent to the customer.",
      button: "Record the payment",
      done: "Payment recorded. Receipt RC-0042 made.",
    },
    chat: {
      business: "Qirfa Bakery",
      avatar: "Q",
      meta: "Business account",
      today: "Monday",
      earlier: { text: "Is my order ready? I’m on my way.", at: "10:31" },
      file: "RC-0042.pdf",
      fileMeta: "1 page · PDF",
      caption: "Receipt RC-0042 from Qirfa Bakery: QAR 64.00. Thank you.\nYou can also open it online:\nalyr.qa/d/… .",
      at: "10:40",
      sent: "Sent · WhatsApp",
    },
  },
  flow: {
    eyebrow: "How it works",
    title: "What happens when a payment comes in.",
    body:
      "Your customer gets a receipt in the chat. Behind it, ALYR Docs takes the next number, writes the paper in both languages and seals it. Follow one receipt through.",
    tabsLabel: "Examples",
    stepsLabel: "Steps",
    pause: "Pause",
    play: "Play",
    note: "Sample conversation with a fictional bakery.",
    customer: { name: "Your customer", sub: "On WhatsApp, as always" },
    whatsapp: { name: "WhatsApp", sub: "Business Platform" },
    alyr: { name: "ALYR Docs", sub: "Working in the background", idle: "Waiting for the next payment" },
    team: { name: "Your team", sub: "The workspace", idle: "Nothing new yet" },
    stories: [
      {
        id: "receipt",
        tab: "A payment",
        steps: [
          {
            move: "back",
            title: "Yusuf records the payment",
            body: "Aisha pays QAR 64 in cash for order #1461. Yusuf records it in the workspace: amount, cash, done.",
            work: ["Record a payment · QAR 64.00 · Cash"],
          },
          {
            title: "The next number, never skipped",
            body: "ALYR Docs takes the shop’s next receipt number under a lock. If anything fails, the number goes back, so there is never a gap.",
            work: ["Series RC · next 0042 · taken under lock", "Number: RC-0042"],
          },
          {
            title: "Written, then sealed",
            body: "The paper is drawn in Arabic and English, with the shop and the customer copied onto it. After that, nothing on it can change.",
            work: ["Arabic first", "PDF drawn · 1 page", "Receipt RC-0042 issued"],
          },
          {
            title: "It checks WhatsApp’s rules",
            body: "Aisha wrote in the last 24 hours, so the PDF itself can go in the chat. After 24 hours, WhatsApp allows only wording it has approved, and the receipt’s wording is not approved.",
            work: ["Last message: 9 minutes ago", "Consent: on record", "Within 24 hours: sent"],
          },
          {
            move: "out",
            title: "The receipt arrives",
            body: "From the shop’s number, in her language, with a link that opens it.",
            chat: { from: "business", text: "Receipt RC-0042 from Qirfa Bakery: QAR 64.00. Thank you. You can also open it online: alyr.qa/d/… ." },
            work: ["Sent: PDF in the chat"],
          },
          {
            move: "team",
            title: "Your team sees it delivered",
            body: "The Documents screen says Sent, then Delivered.",
            record: { id: "doc", main: "RC-0042 · Aisha Hamad", sub: "QAR 64.00 · Paid", trail: "Delivered", tone: "signal" },
          },
        ],
      },
      {
        id: "account",
        tab: "An order on account",
        steps: [
          {
            move: "in",
            title: "An order on account",
            body: "Omar’s office orders pastries and puts them on its credit account.",
            chat: { from: "event", text: "Order #1462 on account, QAR 254" },
            work: ["Order on account"],
          },
          {
            title: "Qirfa has its CR number on file",
            body: "So ALYR Docs issues an invoice, with the next invoice number.",
            work: ["CR number: on file", "Invoice INV-0017 issued"],
          },
          {
            move: "out",
            title: "The invoice arrives",
            body: "As a PDF in the chat, with its caption and a link.",
            chat: { from: "business", text: "Invoice INV-0017 from Qirfa Bakery: QAR 254.00. Thank you. You can also open it online: alyr.qa/d/… ." },
            record: { id: "doc", main: "INV-0017 · Omar Ali", sub: "QAR 254.00 · Unpaid", trail: "Sent", tone: "signal" },
          },
          {
            title: "No CR on file?",
            body: "The sale still goes ahead, as a credit sale, and no invoice is made. The record says why.",
            work: ["Invoice not made: no CR number on file"],
          },
        ],
      },
      {
        id: "correct",
        tab: "A correction",
        steps: [
          {
            move: "team",
            title: "The invoice was wrong",
            body: "Omar’s office ordered sourdough, not mini pastries. The invoice cannot be edited: the database refuses.",
            record: { id: "doc", main: "INV-0017", sub: "This document has been issued and can no longer be changed. To correct it, issue a credit note.", trail: "Issued", tone: "quiet", wrap: true },
          },
          {
            move: "back",
            title: "Cancel document",
            body: "The owner presses Cancel document and writes why.",
            work: ["Credit note for all of INV-0017 · QAR 254.00", "Nothing is deleted"],
          },
          {
            title: "A credit note, numbered",
            body: "CN-0003 cancels INV-0017. Both keep their numbers, and the invoice says what cancelled it.",
            work: ["Credit note CN-0003 issued", "INV-0017: Cancelled by credit note CN-0003"],
            record: { id: "doc", main: "INV-0017", sub: "Cancelled by credit note CN-0003", trail: "Cancelled", tone: "quiet" },
          },
          {
            move: "out",
            title: "The customer is told",
            body: "The credit note goes to Omar the same way the invoice did.",
            chat: { from: "business", text: "Credit note CN-0003 from Qirfa Bakery: QAR 254.00. It cancels a document we issued before. You can also open it online: alyr.qa/d/… ." },
            work: ["Sent: PDF in the chat"],
          },
          {
            move: "team",
            title: "Then the right invoice",
            body: "A new invoice, with the next number, INV-0018.",
            record: { id: "next", main: "INV-0018 · Omar Ali", sub: "QAR 128.00 · Unpaid", trail: "Sent", tone: "signal" },
            work: ["Invoice INV-0018 issued"],
          },
        ],
      },
    ],
  },
  screen: {
    eyebrow: "The screen",
    title: "Every paper you issued, and whether it arrived.",
    caption: { n: "02", text: "The Documents screen" },
    label: "The Documents screen of a fictional bakery’s workspace",
    callouts: [
      "Every document, newest first, by its number.",
      "Paid, part paid or unpaid.",
      "Sent, delivered or not delivered, and why.",
      "Each branch with its own numbers.",
      "Record a payment, send again, or cancel with a credit note.",
    ],
    sheet: {
      path: "Documents",
      sub: "Receipts, invoices and the rest: numbered, in Arabic and English, and sent to your customers.",
      search: "Number, name, phone or amount",
      filters: ["Kind", "Status", "Payment", "Delivery", "Branch"],
      heads: { number: "Number", kind: "Kind", customer: "Customer", amount: "Amount", payment: "Payment", delivery: "Delivery" },
      rows: [
        { number: "RC-0042", kind: "Receipt", customer: "Aisha Hamad", amount: "QAR 64.00", payment: "Paid", delivery: "Delivered", on: true },
        { number: "RC-0041", kind: "Receipt", customer: "Mariam Saleh", amount: "QAR 38.00", payment: "Paid", delivery: "Sent" },
        { number: "INV-0018", kind: "Invoice", customer: "Omar Ali", amount: "QAR 128.00", payment: "Unpaid", delivery: "Delivered" },
        { number: "CN-0003", kind: "Credit note", customer: "Omar Ali", amount: "QAR 254.00", delivery: "Delivered", note: "Cancels INV-0017" },
        { number: "INV-0017", kind: "Invoice", customer: "Omar Ali", amount: "QAR 254.00", delivery: "Delivered", note: "Cancelled", cancelled: true },
        { number: "INVLUS-0007", kind: "Invoice", customer: "Khalid Nasser", amount: "QAR 412.00", payment: "Part paid", delivery: "Not delivered", branch: "Lusail" },
      ],
      sorted: "Newest first",
      actions: ["Download PDF", "Send again", "Record payment", "Cancel document"],
    },
  },
  paper: {
    eyebrow: "The paper",
    title: "One document, two papers.",
    body:
      "The same receipt on A4 and on an 80 mm roll: Arabic first with English beside it, the amounts in their own column, the number in its series. It is drawn once, when it is issued, and kept as it was.",
    caption: { n: "03", text: "Receipt RC-0042 on A4 and an 80 mm roll" },
    label: "Receipt RC-0042 of a fictional bakery, drawn on A4 and on an 80 mm roll: the shop, Receipt, the number RC-0042, 19 October 2026, the customer Aisha Hamad, two lines, a total of 64.00 riyals paid in cash, and at the foot the document code and Issued with ALYR. Under it, the series: RC-0040, RC-0041, RC-0042, and RC-0043 next.",
    a4: "210 mm",
    roll: "80 mm",
    next: "next",
    seriesLabel: "Series RC",
  },
  issued: {
    eyebrow: "Once issued",
    title: "A mistake gets a credit note, not an edit.",
    body:
      "Nobody can change an issued paper: the database refuses. A credit note cancels it, both keep their numbers, and the customer’s link to the old one says what cancelled it.",
    caption: { n: "04", text: "A correction, as the customer sees it" },
    label: "Two phones show the document page a customer opens from a link: invoice INV-0017 marked Cancelled by credit note CN-0003, and credit note CN-0003 against INV-0017, each for 254.00 riyals with Download PDF.",
    phones: [
      {
        label: "INV-0017",
        page: linkEn({
          context: "Invoice",
          eyebrow: "Invoice",
          number: "INV-0017",
          issued: "Issued 19 October 2026",
          status: "Cancelled by credit note CN-0003",
          tone: "off",
          lines: [
            { name: "Box of 12 mini pastries", meta: "2 box × QAR 95.00", total: "QAR 190.00" },
            { name: "Sourdough loaf", meta: "2 pc × QAR 32.00", total: "QAR 64.00" },
          ],
          totals: [
            { label: "Total", value: "QAR 254.00", strong: true },
          ],
        }),
      },
      {
        label: "CN-0003",
        page: linkEn({
          context: "Credit note",
          eyebrow: "Credit note",
          number: "CN-0003",
          issued: "Issued 19 October 2026",
          status: "Against INV-0017",
          tone: "plain",
          lines: [
            { name: "Box of 12 mini pastries", meta: "2 box × QAR 95.00", total: "QAR 190.00" },
            { name: "Sourdough loaf", meta: "2 pc × QAR 32.00", total: "QAR 64.00" },
          ],
          totals: [{ label: "Total", value: "QAR 254.00", strong: true }],
        }),
      },
    ],
  },
  cr: {
    eyebrow: "No CR yet",
    title: "No CR yet? Receipts, and they say so.",
    body:
      "Until your CR number is in your document settings, ALYR Docs issues receipts, never invoices, and each receipt says so in plain words. Add your CR number, and you can issue invoices too.",
    caption: { n: "05", text: "A receipt from a shop with no CR" },
    label: "The foot of a fictional bakery’s receipt, with its note in Arabic and English: the seller has no commercial registration number on file; this document is a receipt and is not a tax invoice; ALYR does not give tax advice.",
  },
  inside: {
    eyebrow: "What’s in it",
    title: "Everything it does.",
    groups: [
      {
        name: "For your customers",
        items: [
          "A receipt for every payment, with its own number.",
          "Arabic first, English beside it. Documents for consumers always carry Arabic.",
          "The PDF in the chat within WhatsApp’s 24 hours, and a link that opens it.",
          "A page for each document: Paid or Balance due, and Download PDF.",
          "A credit note when a paid order is cancelled.",
        ],
      },
      {
        name: "For your team",
        items: [
          "Receipts, invoices, quotations, delivery notes, credit notes and deposit receipts.",
          "Made from your sales: a receipt when an order is paid, an invoice when it goes on account, a receipt for each payment on account.",
          "Payments you take yourself, by cash, transfer, cheque or card terminal, each with its receipt.",
          "Part of a visit paid? A deposit receipt says what is left.",
          "Each branch with its own numbers, address and phone.",
          "Cash rounding to 5, 10, 25, 50 or 100 dirhams, as a line of its own.",
          "A4, A5 or an 80 mm roll.",
          "Your shop’s name, logo and colours, and “Issued with ALYR” at the foot unless you remove it.",
          "Staff may record payments only if the owner allows it.",
          "Your own system can send its sales by file or by API, and you choose, for each kind of paper, whose numbers it carries.",
        ],
      },
      {
        name: "Behind the scenes",
        items: [
          "Numbers never skip: a failed issue gives its number back.",
          "Issued paper cannot change: the database refuses any edit.",
          "A correction is a credit note. ALYR never deletes an issued document.",
          "Each paper is issued once, even if a payment is reported twice.",
          "A paper that cannot be made never stops the sale.",
          "No CR number on file: receipts only, each saying it is not a tax invoice.",
          "A customer who asked you to stop gets no document message.",
        ],
      },
    ],
    notYet: {
      title: "Not yet",
      items: [
        "Statements of account, and documents that repeat each month.",
        "Tax on documents, and any government e-invoicing system.",
        "Sending a document outside WhatsApp’s 24 hours, until WhatsApp approves the wording.",
        "Asking customers for their email address.",
      ],
    },
    note: "We set ALYR Docs up with you at your shop. Everything listed above the line is built.",
  },
  who: {
    eyebrow: "Who it’s for",
    title: "For businesses that hand over paper.",
    rows: [
      { name: "Bakeries, cafes and shops paid at the counter", tags: ["Receipt", "Credit note"] },
      { name: "Trading and wholesale with customers on account", tags: ["Invoice, with your CR", "Receipt for each payment"] },
      { name: "Home services that take part up front", tags: ["Quotation", "Deposit receipt", "Receipt"] },
      { name: "Shops with more than one branch", tags: ["Numbers for each branch"] },
      { name: "Shops that already have a till or accounting system", tags: ["Its sales, ALYR’s paper"] },
    ],
    other: "Run something else? Write to us about how you work.",
  },
  works: {
    eyebrow: "The products",
    title: "Works with the rest of ALYR.",
    link: "See {name}",
    rows: {
      chat: "A receipt when an order is paid at the counter, and a credit note when a paid order is cancelled.",
      bookings: "A visit paid at the counter gets a receipt, or a deposit receipt when part is paid.",
      agent: "Comes with it: unpaid invoices and documents not delivered, on your home screen.",
      accounts: "A sale on account makes an invoice, and each payment a receipt that says what is left.",
      shelf: "Each line is an item from your shelf, with its Arabic name, size and choices.",
    },
  },
  faq: {
    eyebrow: "Questions",
    title: "Before you ask.",
    items: [
      {
        id: "own",
        q: "Can I use it on its own?",
        a: "ALYR Docs works from the sales and payments in your ALYR workspace. If your sales are in another system, that system can send them to ALYR by file or by API.",
      },
      {
        id: "setup",
        q: "How long does setup take?",
        a: "We agree your go-live date at the visit. We set your numbers, branches and paper with you.",
      },
      {
        id: "no-cr",
        q: "I don’t have a CR yet.",
        a: "Then you issue receipts, and each says the seller has no CR number on file. Once your CR number is in your settings, you can issue invoices too.",
      },
      {
        id: "change",
        q: "Can I change a receipt after it is issued?",
        a: "Nobody can: the database refuses any change. To correct it, issue a credit note. It cancels the document, both keep their numbers, and nothing is deleted.",
      },
      {
        id: "arabic",
        q: "Is it in Arabic?",
        a: "Arabic first by default, with English beside it. Documents for consumers always carry Arabic. A document for a business can be English only.",
      },
      {
        id: "how",
        q: "How do my customers get it?",
        a: "In the chat as a PDF, when they have written to you in the last 24 hours. Every document also has a link that opens it.",
      },
      {
        id: "till",
        q: "I already have a till or accounting system.",
        a: "It can send its sales to ALYR by file or by API, and you choose, for each kind of paper, whose numbers it carries. We try it with your system with you first.",
      },
    ],
  },
  cta: {
    title: "Tell us how you give customers their receipts.",
    body: "Send us a message. A person from ALYR replies, then comes to show you ALYR Docs on your own phone.",
  },
};

// ------------------------------------------------------------------ Arabic

const linkAr = (page: Omit<DocLinkPage, "shop" | "monogram" | "download" | "linesLabel">): DocLinkPage => ({
  shop: "مخبز قرفة", monogram: "ق", download: "تنزيل ملف PDF", linesLabel: "البنود", ...page,
});

export const docsAr: DocsPage = {
  bar: {
    label: "ALYR Docs",
    links: [
      { id: "how", label: "كيف يعمل" },
      { id: "inside", label: "ماذا يتضمن" },
      { id: "works", label: "يعمل مع" },
    ],
  },
  hero: {
    eyebrow: "ALYR Docs · الإيصالات والفواتير · نجهّزه لك",
    title: ["تُسجَّل الدفعة، فيصدر الإيصال.", "أرقام متتالية، ومستند لا يتغيّر."],
    lead:
      "حين تُسجَّل دفعة، يُصدر ALYR Docs الإيصال بالرقم التالي ويرسله إلى عميلك. العربية أولاً، ولا يتغيّر فيه شيء بعد إصداره. ليس لديك سجل تجاري بعد؟ تُصدر إيصالات، ثم فواتير حين يصبح لديك سجل.",
    facts: ["أرقام متتالية بلا فجوات", "نهائي بعد إصداره", "العربية أولاً والإنجليزية بجانبها"],
  },
  demo: {
    business: "مخبز قرفة",
    avatar: "ق",
    businessMeta: "حساب أعمال",
    today: "الاثنين",
    typeHere: "مراسلة",
    workspace: "مساحة العمل",
    note: "محادثة توضيحية مع مخبز غير حقيقي. يُرسل المستند على واتساب إذا راسلك العميل خلال آخر 24 ساعة.",
    tabsLabel: "ما يفعله ALYR Docs",
    pause: "إيقاف العرض",
    play: "تشغيل العرض",
    demos: [
      {
        id: "receipt",
        tab: "الإيصال",
        start: 10 * 60 + 31,
        chat: [
          { from: "customer", text: "طلبي جاهز؟ أنا في الطريق." },
          {
            from: "business",
            doc: { name: "RC-0042.pdf", meta: "صفحة واحدة · PDF" },
            text: "\u200fإيصال رقم RC-0042 من مخبز قرفة بمبلغ 64.00 ر.ق. شكراً لك.\n\u200fيمكنك أيضاً فتحه عبر الإنترنت:\n\u2066alyr.qa/d/… .\u2069",
          },
        ],
        panel: {
          kicker: "المستندات",
          title: "تسجيل دفعة",
          badge: "الطلب رقم 1461",
          rows: [
            { main: "المبلغ", sub: "نقداً · إصدار الإيصال", trail: "64.00 ر.ق", tone: "done" },
            { main: "سُجّلت الدفعة وصدر الإيصال RC-0042.", sub: "عائشة حمد · مدفوع", trail: "أُرسل", tone: "signal", wrap: true },
          ],
        },
        caption: "مبلغ نقدي استُلم في المحل، مكتوب في السجل. ويصل الإيصال في المحادثة ملفَّ PDF إذا راسلك العميل خلال آخر 24 ساعة.",
      },
      {
        id: "paper",
        tab: "المستند",
        start: 10 * 60 + 40,
        chat: [],
        panel: { kicker: "المستندات", title: "الإيصال RC-0042", badge: "A4", rows: [], paper: true },
        caption: "العربية أولاً والإنجليزية بجانبها، والرقم في تسلسله. ويستطيع المحل إزالة «صدر عبر ALYR».",
      },
      {
        id: "no-cr",
        tab: "بلا سجل",
        start: 11 * 60,
        chat: [],
        panel: {
          kicker: "المستندات",
          title: "محل بلا رقم سجل تجاري",
          badge: "إيصالات",
          rows: [
            {
              main: "على كل إيصال",
              sub: "لا يوجد رقم سجل تجاري مسجّل للبائع. هذا المستند إيصال وليس فاتورة ضريبية. لا تقدّم ALYR استشارات ضريبية.",
              tone: "done",
              wrap: true,
            },
            {
              main: "فاتورة",
              sub: "لإصدار فاتورة نحتاج إلى رقم السجل التجاري لمتجرك. يمكنك إضافته من إعدادات المستندات. وفي الأثناء يمكنك إصدار إيصال، فهو لا يحتاج إلى هذا الرقم.",
              tone: "quiet",
              wrap: true,
            },
          ],
        },
        caption: "ليس لديك سجل تجاري بعد: إيصالات، وكل إيصال يقول ذلك. أضف رقم سجلك التجاري، فتصبح الفواتير متاحة أيضاً.",
      },
      {
        id: "correct",
        tab: "التصحيح",
        start: 15 * 60 + 12,
        chat: [
          {
            from: "business",
            doc: { name: "CN-0003.pdf", meta: "صفحة واحدة · PDF" },
            text: "\u200fإشعار دائن رقم CN-0003 من مخبز قرفة بمبلغ 254.00 ر.ق. يلغي هذا الإشعار مستنداً أصدرناه سابقاً.\n\u200fيمكنك أيضاً فتحه عبر الإنترنت:\n\u2066alyr.qa/d/… .\u2069",
          },
        ],
        panel: {
          kicker: "المستندات",
          title: "الفاتورة INV-0017",
          badge: "عمر علي",
          rows: [
            { lead: "INV-0017", main: "فاتورة · 254.00 ر.ق", sub: "أُلغي بإشعار دائن رقم CN-0003", trail: "ملغى", tone: "quiet" },
            { lead: "CN-0003", main: "إشعار دائن · 254.00 ر.ق", sub: "يلغي INV-0017", trail: "أُرسل", tone: "signal" },
          ],
        },
        caption: "ما صدر نهائي. والتصحيح إشعار دائن، ويحتفظ كلاهما برقمه.",
      },
      {
        id: "link",
        tab: "الرابط",
        start: 10 * 60 + 41,
        chat: [],
        panel: {
          kicker: "صفحة المستند",
          title: "الإيصال RC-0042",
          badge: "alyr.qa/d/…",
          rows: [],
          doc: linkAr({
            context: "إيصال",
            eyebrow: "إيصال",
            number: "RC-0042",
            issued: "صدر في 19 أكتوبر 2026",
            status: "مدفوع",
            tone: "good",
            lines: [
              { name: "كيك الحليب بالزعفران، قطعة", meta: "2 قطعة × 26.00 ر.ق", total: "52.00 ر.ق" },
              { name: "كرواسون بالزبدة", meta: "1 قطعة × 12.00 ر.ق", total: "12.00 ر.ق" },
            ],
            totals: [{ label: "الإجمالي", value: "64.00 ر.ق", strong: true }],
          }),
        },
        caption: "لكل مستند صفحته، عليها «مدفوع» أو «المتبقي» وزر تنزيل الملف. والصفحة نفسها لا تعرض شيئاً عن العميل.",
      },
    ],
  },
  moment: {
    eyebrow: "دفعة تصبح مستنداً",
    title: "دفعة واحدة، وإيصال واحد، ورقم واحد.",
    body:
      "يسجّل يوسف المبلغ الذي دفعته عائشة نقداً في المحل. فيأخذ ALYR Docs رقم الإيصال التالي، ويكتب المستند بالعربية والإنجليزية. وقد راسلت عائشة المحل قبل دقائق، فيصل الملف إلى محادثتها.",
    caption: { n: "01", text: "دفعة نقدية تصبح الإيصال RC-0042" },
    label:
      "تُسجَّل دفعة نقدية بمبلغ 64.00 ر.ق في مساحة عمل مخبز غير حقيقي. فيصدر الإيصال RC-0042، ويُكتب مستنده بالعربية أولاً والإنجليزية بجانبها، ويصل ملف PDF إلى محادثة العميلة على واتساب، تحت رسالتها قبل دقائق، مع تعليقه. وتظهر حالة الإرسال «أُرسل».",
    parts: { sheet: "مساحة العمل", paper: "المستند", chat: "هاتف عائشة" },
    form: {
      shop: "مخبز قرفة",
      monogram: "ق",
      path: "المستندات",
      title: "تسجيل دفعة",
      sub: "مال استلمته بنفسك. لا تحتفظ ALYR بالمال أبداً؛ هذا يكتبه مع اسم من سجّله ووقته.",
      amountLabel: "المبلغ",
      amount: "64.00 ر.ق",
      methodLabel: "كيف دُفع؟",
      methods: ["نقداً", "بطاقة", "تحويل مصرفي", "شيك"],
      receipt: "إصدار الإيصال",
      receiptHint: "الإيصال مرقّم ويمكن إرساله إلى العميل.",
      button: "سجّل الدفعة",
      done: "سُجّلت الدفعة وصدر الإيصال RC-0042.",
    },
    chat: {
      business: "مخبز قرفة",
      avatar: "ق",
      meta: "حساب أعمال",
      today: "الاثنين",
      earlier: { text: "طلبي جاهز؟ أنا في الطريق.", at: "10:31" },
      file: "RC-0042.pdf",
      fileMeta: "صفحة واحدة · PDF",
      caption: "\u200fإيصال رقم RC-0042 من مخبز قرفة بمبلغ 64.00 ر.ق. شكراً لك.\n\u200fيمكنك أيضاً فتحه عبر الإنترنت:\n\u2066alyr.qa/d/… .\u2069",
      at: "10:40",
      sent: "أُرسل · واتساب",
    },
  },
  flow: {
    eyebrow: "كيف يعمل",
    title: "ماذا يحدث حين تصل دفعة.",
    body:
      "يصل عميلك إيصال في المحادثة. وفي الخلفية يأخذ ALYR Docs الرقم التالي، ويكتب المستند باللغتين، ويثبّته. تابع إيصالاً واحداً من البداية.",
    tabsLabel: "الأمثلة",
    stepsLabel: "الخطوات",
    pause: "إيقاف",
    play: "تشغيل",
    note: "محادثة توضيحية مع مخبز غير حقيقي.",
    customer: { name: "عميلك", sub: "على واتساب كعادته" },
    whatsapp: { name: "واتساب", sub: "منصة الأعمال" },
    alyr: { name: "ALYR Docs", sub: "يعمل في الخلفية", idle: "بانتظار الدفعة التالية" },
    team: { name: "فريقك", sub: "مساحة العمل", idle: "لا جديد بعد" },
    stories: [
      {
        id: "receipt",
        tab: "دفعة",
        steps: [
          {
            move: "back",
            title: "يوسف يسجّل الدفعة",
            body: "تدفع عائشة 64 ر.ق نقداً عن الطلب رقم 1461، فيسجّلها يوسف في مساحة العمل: المبلغ، ونقداً، وانتهى.",
            work: ["تسجيل دفعة · 64.00 ر.ق · نقداً"],
          },
          {
            title: "الرقم التالي، دون تخطٍّ",
            body: "يأخذ ALYR Docs رقم الإيصال التالي للمحل وهو مقفل عليه. وإن تعثّر شيء يعود الرقم، فلا تبقى فجوة أبداً.",
            work: ["السلسلة RC · التالي 0042 · مقفل عليه", "الرقم: RC-0042"],
          },
          {
            title: "يُكتب ثم يُثبَّت",
            body: "يُكتب المستند بالعربية والإنجليزية، ويُنسخ عليه المحل والعميل. وبعدها لا يتغيّر فيه شيء.",
            work: ["العربية أولاً", "رُسم ملف PDF · صفحة واحدة", "صدر الإيصال RC-0042"],
          },
          {
            title: "يراعي قواعد واتساب",
            body: "راسلت عائشة خلال آخر 24 ساعة، فيمكن إرسال الملف نفسه في المحادثة. وبعد 24 ساعة لا يسمح واتساب إلا بصياغة وافق عليها، وصياغة الإيصال لم تُعتمد.",
            work: ["آخر رسالة: قبل 9 دقائق", "الموافقة: مسجّلة", "خلال 24 ساعة: أُرسل"],
          },
          {
            move: "out",
            title: "يصل الإيصال",
            body: "من رقم المحل، بلغتها، مع رابط يفتحه.",
            chat: { from: "business", text: "إيصال رقم RC-0042 من مخبز قرفة بمبلغ 64.00 ر.ق. شكراً لك. يمكنك أيضاً فتحه عبر الإنترنت: \u2066alyr.qa/d/… .\u2069" },
            work: ["أُرسل: ملف PDF في المحادثة"],
          },
          {
            move: "team",
            title: "يرى فريقك أنه وصل",
            body: "تكتب شاشة المستندات «أُرسل» ثم «وصل».",
            record: { id: "doc", main: "RC-0042 · عائشة حمد", sub: "64.00 ر.ق · مدفوع", trail: "وصل", tone: "signal" },
          },
        ],
      },
      {
        id: "account",
        tab: "طلب على الحساب",
        steps: [
          {
            move: "in",
            title: "طلب على الحساب",
            body: "يطلب مكتب عمر معجنات ويسجّلها على حسابه الآجل.",
            chat: { from: "event", text: "الطلب رقم 1462 على الحساب، 254 ر.ق" },
            work: ["طلب على الحساب"],
          },
          {
            title: "رقم السجل التجاري لمخبز قرفة محفوظ",
            body: "فيُصدر ALYR Docs فاتورة بالرقم التالي للفواتير.",
            work: ["رقم السجل التجاري: محفوظ", "صدرت الفاتورة INV-0017"],
          },
          {
            move: "out",
            title: "تصل الفاتورة",
            body: "ملفاً PDF في المحادثة، مع تعليقه ورابط.",
            chat: { from: "business", text: "فاتورة رقم INV-0017 من مخبز قرفة بمبلغ 254.00 ر.ق. شكراً لك. يمكنك أيضاً فتحه عبر الإنترنت: \u2066alyr.qa/d/… .\u2069" },
            record: { id: "doc", main: "INV-0017 · عمر علي", sub: "254.00 ر.ق · غير مدفوع", trail: "أُرسل", tone: "signal" },
          },
          {
            title: "لا رقم سجل تجاري؟",
            body: "يمضي البيع بالآجل كما هو، ولا تصدر فاتورة، ويقول السجل لماذا.",
            work: ["لم تصدر فاتورة: لا رقم سجل تجاري محفوظاً"],
          },
        ],
      },
      {
        id: "correct",
        tab: "تصحيح",
        steps: [
          {
            move: "team",
            title: "كانت الفاتورة خاطئة",
            body: "طلب مكتب عمر خبز العجين المخمّر لا المعجنات الصغيرة. ولا يمكن تعديل الفاتورة: قاعدة البيانات ترفض.",
            record: { id: "doc", main: "INV-0017", sub: "صدر هذا المستند ولا يمكن تعديله. لتصحيحه أصدر إشعارًا دائنًا.", trail: "صادر", tone: "quiet", wrap: true },
          },
          {
            move: "back",
            title: "إلغاء المستند",
            body: "يضغط المالك «إلغاء المستند» ويكتب السبب.",
            work: ["إشعار دائن لكامل INV-0017 · 254.00 ر.ق", "لا يُحذف شيء"],
          },
          {
            title: "إشعار دائن مرقّم",
            body: "يلغي CN-0003 الفاتورة INV-0017. ويحتفظ كلاهما برقمه، وتقول الفاتورة ما الذي ألغاها.",
            work: ["صدر الإشعار الدائن CN-0003", "INV-0017: أُلغي بإشعار دائن رقم CN-0003"],
            record: { id: "doc", main: "INV-0017", sub: "أُلغي بإشعار دائن رقم CN-0003", trail: "ملغى", tone: "quiet" },
          },
          {
            move: "out",
            title: "يُبلَّغ العميل",
            body: "يصل الإشعار الدائن إلى عمر كما وصلته الفاتورة.",
            chat: { from: "business", text: "إشعار دائن رقم CN-0003 من مخبز قرفة بمبلغ 254.00 ر.ق. يلغي هذا الإشعار مستنداً أصدرناه سابقاً. يمكنك أيضاً فتحه عبر الإنترنت: \u2066alyr.qa/d/… .\u2069" },
            work: ["أُرسل: ملف PDF في المحادثة"],
          },
          {
            move: "team",
            title: "ثم الفاتورة الصحيحة",
            body: "فاتورة جديدة بالرقم التالي، INV-0018.",
            record: { id: "next", main: "INV-0018 · عمر علي", sub: "128.00 ر.ق · غير مدفوع", trail: "أُرسل", tone: "signal" },
            work: ["صدرت الفاتورة INV-0018"],
          },
        ],
      },
    ],
  },
  screen: {
    eyebrow: "الشاشة",
    title: "كل مستند أصدرته، وهل وصل.",
    caption: { n: "02", text: "شاشة المستندات" },
    label: "شاشة المستندات في مساحة عمل مخبز غير حقيقي",
    callouts: [
      "كل مستند، الأحدث أولاً، برقمه.",
      "مدفوع أو مدفوع جزئياً أو غير مدفوع.",
      "أُرسل أو وصل أو لم يصل، والسبب.",
      "لكل فرع أرقامه.",
      "سجّل دفعة، أو أرسل مرة أخرى، أو ألغِ بإشعار دائن.",
    ],
    sheet: {
      path: "المستندات",
      sub: "إيصالات وفواتير وغيرها: مرقّمة، بالعربية والإنجليزية، وتُرسل إلى عملائك.",
      search: "الرقم أو الاسم أو الهاتف أو المبلغ",
      filters: ["النوع", "الحالة", "الدفع", "الإرسال", "الفرع"],
      heads: { number: "الرقم", kind: "النوع", customer: "العميل", amount: "المبلغ", payment: "الدفع", delivery: "الإرسال" },
      rows: [
        { number: "RC-0042", kind: "إيصال", customer: "عائشة حمد", amount: "64.00 ر.ق", payment: "مدفوع", delivery: "وصل", on: true },
        { number: "RC-0041", kind: "إيصال", customer: "مريم صالح", amount: "38.00 ر.ق", payment: "مدفوع", delivery: "أُرسل" },
        { number: "INV-0018", kind: "فاتورة", customer: "عمر علي", amount: "128.00 ر.ق", payment: "غير مدفوع", delivery: "وصل" },
        { number: "CN-0003", kind: "إشعار دائن", customer: "عمر علي", amount: "254.00 ر.ق", delivery: "وصل", note: "يلغي INV-0017" },
        { number: "INV-0017", kind: "فاتورة", customer: "عمر علي", amount: "254.00 ر.ق", delivery: "وصل", note: "ملغى", cancelled: true },
        { number: "INVLUS-0007", kind: "فاتورة", customer: "خالد ناصر", amount: "412.00 ر.ق", payment: "مدفوع جزئياً", delivery: "لم يصل", branch: "لوسيل" },
      ],
      sorted: "الأحدث أولاً",
      actions: ["تنزيل PDF", "إرسال مرة أخرى", "تسجيل دفعة", "إلغاء المستند"],
    },
  },
  paper: {
    eyebrow: "المستند",
    title: "مستند واحد، على ورقتين.",
    body:
      "الإيصال نفسه على ورقة A4 وعلى لفة 80 ملم: العربية أولاً والإنجليزية بجانبها، والمبالغ في عمودها، والرقم في تسلسله. يُكتب مرة واحدة حين يصدر، ويُحفظ كما كان.",
    caption: { n: "03", text: "الإيصال RC-0042 على A4 ولفة 80 ملم" },
    label: "الإيصال RC-0042 لمخبز غير حقيقي، على ورقة A4 وعلى لفة 80 ملم: المحل، وكلمة إيصال، والرقم RC-0042، و19 أكتوبر 2026، والعميلة عائشة حمد، وبندان، وإجمالي 64.00 ر.ق مدفوع نقداً، وفي أسفله رمز المستند و«صدر عبر ALYR». وتحته التسلسل: RC-0040 وRC-0041 وRC-0042، ثم RC-0043 التالي.",
    a4: "210 ملم",
    roll: "80 ملم",
    next: "التالي",
    seriesLabel: "السلسلة RC",
  },
  issued: {
    eyebrow: "بعد الإصدار",
    title: "الخطأ يُصحَّح بإشعار دائن، لا بتعديل.",
    body:
      "لا يستطيع أحد تغيير مستند صادر: قاعدة البيانات ترفض. يلغيه إشعار دائن، ويحتفظ كلاهما برقمه، ويقول رابط العميل إلى المستند القديم ما الذي ألغاه.",
    caption: { n: "04", text: "التصحيح كما يراه العميل" },
    label: "هاتفان يعرضان صفحة المستند التي يفتحها العميل من رابط: الفاتورة INV-0017 وعليها «أُلغي بإشعار دائن رقم CN-0003»، والإشعار الدائن CN-0003 بخصوص INV-0017، وكلاهما بمبلغ 254.00 ر.ق مع زر تنزيل الملف.",
    phones: [
      {
        label: "INV-0017",
        page: linkAr({
          context: "فاتورة",
          eyebrow: "فاتورة",
          number: "INV-0017",
          issued: "صدر في 19 أكتوبر 2026",
          status: "أُلغي بإشعار دائن رقم CN-0003",
          tone: "off",
          lines: [
            { name: "علبة 12 معجنات صغيرة", meta: "2 علبة × 95.00 ر.ق", total: "190.00 ر.ق" },
            { name: "خبز العجين المخمّر", meta: "2 قطعة × 32.00 ر.ق", total: "64.00 ر.ق" },
          ],
          totals: [{ label: "الإجمالي", value: "254.00 ر.ق", strong: true }],
        }),
      },
      {
        label: "CN-0003",
        page: linkAr({
          context: "إشعار دائن",
          eyebrow: "إشعار دائن",
          number: "CN-0003",
          issued: "صدر في 19 أكتوبر 2026",
          status: "بخصوص INV-0017",
          tone: "plain",
          lines: [
            { name: "علبة 12 معجنات صغيرة", meta: "2 علبة × 95.00 ر.ق", total: "190.00 ر.ق" },
            { name: "خبز العجين المخمّر", meta: "2 قطعة × 32.00 ر.ق", total: "64.00 ر.ق" },
          ],
          totals: [{ label: "الإجمالي", value: "254.00 ر.ق", strong: true }],
        }),
      },
    ],
  },
  cr: {
    eyebrow: "بلا سجل تجاري بعد",
    title: "ليس لديك سجل تجاري بعد؟ إيصالات، وتقول ذلك.",
    body:
      "إلى أن تضيف رقم سجلك التجاري في إعدادات المستندات، يُصدر ALYR Docs إيصالات لا فواتير، ويقول كل إيصال ذلك بكلمات واضحة. أضف رقم سجلك، فتستطيع إصدار الفواتير أيضاً.",
    caption: { n: "05", text: "إيصال من محل ليس له رقم سجل تجاري" },
    label: "أسفل إيصال لمخبز غير حقيقي، وعليه ملاحظته بالعربية والإنجليزية: لا يوجد رقم سجل تجاري مسجّل للبائع، وهذا المستند إيصال وليس فاتورة ضريبية، ولا تقدّم ALYR استشارات ضريبية.",
  },
  inside: {
    eyebrow: "ماذا يتضمن",
    title: "كل ما يفعله.",
    groups: [
      {
        name: "لعملائك",
        items: [
          "إيصال لكل دفعة، برقمه.",
          "العربية أولاً والإنجليزية بجانبها، ومستندات المستهلكين فيها العربية دائماً.",
          "الملف في المحادثة خلال 24 ساعة من آخر رسالة للعميل، ورابط يفتحه.",
          "صفحة لكل مستند: «مدفوع» أو «المتبقي»، وزر تنزيل الملف.",
          "إشعار دائن حين يُلغى طلب مدفوع.",
        ],
      },
      {
        name: "لفريقك",
        items: [
          "إيصالات، وفواتير، وعروض أسعار، وإشعارات تسليم، وإشعارات دائنة، وإيصالات عربون.",
          "من مبيعاتك: إيصال حين يُدفع طلب، وفاتورة حين يُسجَّل على الحساب، وإيصال لكل دفعة على الحساب.",
          "المدفوعات التي تستلمها بنفسك، نقداً أو بتحويل أو بشيك أو بجهاز البطاقات، ولكل منها إيصال.",
          "دُفع جزء من الزيارة؟ إيصال العربون يقول كم تبقّى.",
          "لكل فرع أرقامه وعنوانه وهاتفه.",
          "تقريب المبلغ النقدي إلى 5 أو 10 أو 25 أو 50 أو 100 درهم، في بند مستقل.",
          "A4 أو A5 أو لفة 80 ملم.",
          "اسم محلك وشعاره وألوانه، و«صدر عبر ALYR» في أسفله ما لم تُزِله.",
          "لا يسجّل الموظفون المدفوعات إلا إذا سمح المالك.",
          "يستطيع نظامك إرسال مبيعاته بملف أو عبر API، وتختار لكل نوع من المستندات أرقامَ من يحمل.",
        ],
      },
      {
        name: "في الخلفية",
        items: [
          "لا تتخطّى الأرقام رقماً: الإصدار المتعثّر يعيد رقمه.",
          "المستند الصادر لا يتغيّر: قاعدة البيانات ترفض أي تعديل.",
          "التصحيح إشعار دائن، ولا تحذف ALYR أي مستند صادر.",
          "يصدر كل مستند مرة واحدة، حتى لو وصل خبر الدفعة مرتين.",
          "المستند الذي يتعذّر إصداره لا يوقف البيع.",
          "لا رقم سجل تجاري محفوظاً: إيصالات فقط، وكل إيصال يقول إنه ليس فاتورة ضريبية.",
          "العميل الذي طلب الإيقاف لا تصله رسالة بمستند.",
        ],
      },
    ],
    notYet: {
      title: "لم يتوفر بعد",
      items: [
        "كشوف الحساب، والمستندات التي تتكرر كل شهر.",
        "الضريبة على المستندات، وأي نظام حكومي للفوترة الإلكترونية.",
        "إرسال مستند بعد 24 ساعة من آخر رسالة للعميل، إلى أن يوافق واتساب على الصياغة.",
        "طلب البريد الإلكتروني من العملاء.",
      ],
    },
    note: "نجهّز ALYR Docs معك في محلك. كل ما فوق الخط جاهز.",
  },
  who: {
    eyebrow: "لمن صُمّم",
    title: "للأنشطة التي تسلّم عملاءها مستندات.",
    rows: [
      { name: "المخابز والمقاهي والمحلات التي يُدفع لها في المحل", tags: ["إيصال", "إشعار دائن"] },
      { name: "التجارة والجملة مع عملاء بالآجل", tags: ["فاتورة مع سجلك التجاري", "إيصال لكل دفعة"] },
      { name: "الخدمات المنزلية التي تأخذ جزءاً مقدماً", tags: ["عرض سعر", "إيصال عربون", "إيصال"] },
      { name: "المحلات التي لها أكثر من فرع", tags: ["أرقام لكل فرع"] },
      { name: "المحلات التي لديها نظام كاشير أو محاسبة", tags: ["مبيعاته، ومستندات ALYR"] },
    ],
    other: "نشاطك مختلف؟ راسلنا وأخبرنا كيف تعمل.",
  },
  works: {
    eyebrow: "المنتجات",
    title: "يعمل مع بقية منتجات ALYR.",
    link: "تعرّف على {name}",
    rows: {
      chat: "إيصال حين يُدفع طلب في المحل، وإشعار دائن حين يُلغى طلب مدفوع.",
      bookings: "الزيارة المدفوعة في المحل لها إيصال، أو إيصال عربون حين يُدفع جزء منها.",
      agent: "يأتي معه: الفواتير غير المدفوعة والمستندات التي لم تصل، على شاشتك الرئيسية.",
      accounts: "البيع بالآجل يُصدر فاتورة، وكل دفعة إيصالاً يقول كم تبقّى.",
      shelf: "كل بند صنف من أصنافك، باسمه العربي ومقاسه وخياراته.",
    },
  },
  faq: {
    eyebrow: "أسئلة",
    title: "قبل أن تسأل.",
    items: [
      {
        id: "own",
        q: "هل أستطيع استخدامه وحده؟",
        a: "يعمل ALYR Docs من المبيعات والمدفوعات في مساحة عملك مع ALYR. وإن كانت مبيعاتك في نظام آخر، يستطيع ذلك النظام إرسالها إلى ALYR بملف أو عبر API.",
      },
      {
        id: "setup",
        q: "كم يستغرق التجهيز؟",
        a: "نتفق معك على موعد بدء التشغيل خلال الزيارة، ونضبط معك الترقيم والفروع وشكل المستند.",
      },
      {
        id: "no-cr",
        q: "ليس لديّ سجل تجاري بعد.",
        a: "تُصدر إذن إيصالات، ويقول كل منها إنه لا يوجد رقم سجل تجاري مسجّل للبائع. وحين تضيف رقم سجلك في الإعدادات، تستطيع إصدار الفواتير أيضاً.",
      },
      {
        id: "change",
        q: "هل أستطيع تعديل إيصال بعد إصداره؟",
        a: "لا يستطيع أحد ذلك: قاعدة البيانات ترفض أي تعديل. لتصحيحه أصدر إشعاراً دائناً، فيلغي المستند، ويحتفظ كلاهما برقمه، ولا يُحذف شيء.",
      },
      {
        id: "arabic",
        q: "هل هو بالعربية؟",
        a: "العربية أولاً افتراضياً، والإنجليزية بجانبها. ومستندات المستهلكين فيها العربية دائماً، أما مستند الشركات فيمكن أن يكون بالإنجليزية وحدها.",
      },
      {
        id: "how",
        q: "كيف يصل إلى عملائي؟",
        a: "في المحادثة ملفاً PDF، إذا راسلوك خلال آخر 24 ساعة. ولكل مستند أيضاً رابط يفتحه.",
      },
      {
        id: "till",
        q: "لديّ نظام كاشير أو محاسبة.",
        a: "يستطيع إرسال مبيعاته إلى ALYR بملف أو عبر API، وتختار لكل نوع من المستندات أرقامَ من يحمل. ونجرّبه مع نظامك معك أولاً.",
      },
    ],
  },
  cta: {
    title: "أخبرنا كيف تسلّم عملاءك إيصالاتهم.",
    body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Docs على هاتفك أنت.",
  },
};
