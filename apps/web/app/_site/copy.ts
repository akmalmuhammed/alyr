// Every word on the public site, in English and Arabic. Components contain no text.
// The homepage is about ALYR the company, which sets up and looks after the technology
// for owner-run businesses, and leads with what it sells today: ALYR Chat. The ALYR Chat
// page has its own copy under `product`. Voice follows the Brand & Growth Playbook
// (11 Oct 2026): plain words, one idea per sentence, no hype, and no number or promise we
// cannot yet show (see docs/brand.md and docs/site-redesign/03-product-truth.md).
// Every sample screen on the homepage uses one fictional business, Qirfa Bakery, and the
// product's own wording for its screens and messages.
// The Arabic is written natively, not translated line by line, and still needs a
// native speaker's review before launch (ALY-66).

import type { TrustRecord } from "./site";

export type Locale = "en" | "ar";

export { fill } from "./fill";

export type ChatLine = {
  from: "customer" | "business" | "staff";
  text: string;
  // A tappable link or button shown under the message.
  action?: string;
  // Who wrote it, for staff messages.
  name?: string;
};

export type PanelRow = {
  lead?: string;
  main: string;
  sub?: string;
  trail?: string;
  // signal: the row this conversation just created. done: finished. quiet: not yet.
  tone?: "signal" | "done" | "quiet";
};

export type Demo = {
  id: string;
  tab: string;
  chat: ChatLine[];
  panel: { title: string; badge: string; rows: PanelRow[]; total?: [string, string] };
  caption: string;
};

/** One beat of the "how it works" figure on the product page. */
export type FlowStep = {
  // Which way the signal travels: customer to ALYR, ALYR to customer, ALYR to the team's
  // screen, or the team's screen to ALYR. Absent when the work stays inside ALYR.
  move?: "in" | "out" | "team" | "back";
  title: string;
  body: string;
  // What appears on the customer's phone. An "event" is something they did on a page,
  // not a message they sent.
  chat?: { from: "customer" | "business" | "event"; text: string; action?: string };
  // Lines ALYR adds to its own work list, in the background.
  work?: string[];
  // A row that appears on the team's screen. A later row with the same id replaces it.
  record?: PanelRow & { id: string };
};

export type FlowStory = { id: string; tab: string; steps: FlowStep[] };

type Named = { name: string; sub: string };

type Meta = { title: string; description: string };
type Titled = { title: string; body: string };

// ------------------------------------------------------------- the homepage

/** A figure's caption: its number and what it shows. The component adds "Fig" and
 * "Sample, fictional bakery" from `fig`. */
export type Caption = { n: string; text: string };

/** One line of a drawn chat message; a link shows in link colour after its text. */
export type BubbleLine = string | { text: string; link: string };
export type Bubble = {
  from: "customer" | "business" | "assistant" | "staff";
  lines: BubbleLine[];
  time: string;
  who?: string;
};

export type OrderItem = { id: string; name: string; price: number; qty: number };

/** The order page as the product shows it (apps/web/app/(product)/s/[slug]). */
export type OrderPage = {
  shop: string;
  monogram: string;
  context: string;
  other: string;
  eyebrow: string;
  title: string;
  as: string;
  customer: string;
  categories: string[];
  sections: { name: string; items: OrderItem[] }[];
  money: string;
  count: { one: string; other: string };
  pay: string;
  add: string;
  more: string;
  less: string;
  max: string;
  announce: string;
  powered: string;
};

/** An order or booking as one row of the shop's workspace. */
export type ShopRow = { screen: string; ref: string; name: string; status: string; by: string };

type Home = {
  hero: {
    eyebrow: string;
    title: [string, string];
    body: string;
    how: string;
    facts: string[];
    figure: {
      label: string;
      caption: Caption;
      hint: string;
      order: OrderPage;
      record: { screen: string; title: string; status: string; customer: string; by: string; initial: string };
    };
  };
  problem: {
    eyebrow: string;
    title: string;
    rows: { text: string; when?: string }[];
    strong: string;
    muted: string;
    who: { label: string; first: string; firstTags: string[]; also: string; alsoTags: string[] };
  };
  does: {
    eyebrow: string;
    title: string;
    body: string;
    product: { name: string; line: string; state: string };
    storyLabel: string;
    modules: { id: "orders" | "pay" | "track" | "inbox" | "book"; title: string; body: string; caption: Caption }[];
    also: { title: string; items: Titled[] };
    rail: { label: string; state: string; slots: string[]; line: string; link: string };
  };
  sample: {
    shop: string;
    monogram: string;
    business: string;
    typeHere: string;
    powered: string;
    chat: { ask: Bubble; link: Bubble; placed: Bubble; receipt: Bubble };
    track: {
      context: string;
      eyebrow: string;
      title: string;
      status: string;
      steps: { label: string; at: string; reached: boolean; now?: boolean }[];
      person: { name: string; rest: string };
      updates: string;
    };
    inbox: {
      screen: string;
      customer: string;
      handled: string;
      handler: string;
      close: string;
      labels: { customer: string; assistant: string };
      thread: (Bubble | { activity: string; time: string })[];
      paused: { title: string; hint: string };
    };
    booking: {
      context: string;
      eyebrow: string;
      title: string;
      as: string;
      customer: string;
      steps: [string, string, string];
      services: { name: string; meta: string; on?: boolean }[];
      days: { top: string; day: string; month: string; on?: boolean }[];
      times: string[];
      time: string;
      summary: [string, string];
      confirm: string;
    };
    rows: { order: ShopRow; paid: ShopRow; ready: ShopRow; inbox: ShopRow; booking: ShopRow };
  };
  how: {
    eyebrow: string;
    title: string;
    steps: Titled[];
    report: {
      caption: Caption;
      heading: string;
      week: string;
      time: string;
      sections: { title: string; lines: string[] }[];
    };
  };
  included: {
    eyebrow: string;
    title: string;
    body: string;
    start: { title: string; items: string[] };
    month: { title: string; items: string[] };
    more: Titled;
    figure: {
      caption: Caption;
      workspace: string;
      setup: string;
      progress: string;
      steps: { text: string; done: boolean }[];
      ask: string;
      asked: string;
      office: string;
      queue: string;
      heads: { shop: string; step: string; note: string; by: string };
      row: { shop: string; when: string; step: string; note: string; by: string; done: string };
    };
  };
  price: {
    eyebrow: string;
    title: string;
    from: string;
    amount: string;
    currency: string;
    period: string;
    setup: string;
    includes: string;
    ledgerLabel: string;
    ledger: { label: string; value: string; strong?: boolean }[];
    agreement: {
      caption: Caption;
      kicker: string;
      parties: string;
      titleLead: string;
      titleMark: string;
      body: string;
      fields: { label: string; value: string; blank?: boolean }[];
      print: string;
    };
  };
  trust: {
    eyebrow: string;
    title: string;
    body: string;
    facts: { label: string; title: string; body: string }[];
    closing: string;
    records: { label: string; items: Record<TrustRecord, string> };
    figure: { caption: Caption; label: string };
  };
  faq: { eyebrow: string; title: string; items: { id: string; q: string; a: string }[] };
  final: Titled;
};

export type Copy = {
  meta: { home: Meta; chat: Meta };
  skip: string;
  nav: {
    what: string; product: string; how: string; price: string; questions: string;
    other: string; home: string; menu: string; sections: string;
    cta: { whatsapp: string; email: string; pending: string };
  };
  /** How to reach ALYR, in each of the three contact states (site.ts). */
  contact: {
    whatsapp: string;
    email: string;
    reply: string;
    replyShort: string;
    soon: string;
    pending: string;
    commits: string;
    prefill: string;
    subject: string;
    draft: string;
    bar: string;
  };
  footer: { line: string; rights: string; workspace: string; disclaimer: string; doha: string; links: string };
  fig: { label: string; fictional: string };
  home: Home;
  product: {
    eyebrow: string;
    title: string;
    body: string;
    business: string;
    businessMeta: string;
    today: string;
    typeHere: string;
    workspace: string;
    note: string;
    tabsLabel: string;
    pause: string;
    play: string;
    demos: Demo[];
    facts: Titled[];
    flow: {
      eyebrow: string;
      title: string;
      body: string;
      tabsLabel: string;
      stepsLabel: string;
      pause: string;
      play: string;
      note: string;
      customer: Named;
      whatsapp: Named;
      alyr: Named & { idle: string };
      team: Named & { idle: string };
      stories: FlowStory[];
    };
    inside: { eyebrow: string; title: string; note: string; groups: { name: string; items: Titled[] }[] };
    why: { eyebrow: string; statement: string; pillars: Titled[] };
    who: { eyebrow: string; title: string; rows: { name: string; body: string; tags: string[] }[]; other: string };
    next: { eyebrow: string; body: string };
    cta: { title: string; body: string };
  };
};

const en: Copy = {
  meta: {
    home: {
      title: "ALYR · Go digital without the IT team",
      description:
        "ALYR sets up and looks after the technology for owner-run businesses in Qatar, starting with ALYR Chat: orders, bookings and payments in the chat. From QAR 449 a month, in Arabic and English.",
    },
    chat: {
      title: "ALYR Chat · Sell, book and get paid in the chat",
      description:
        "ALYR Chat turns your customers' WhatsApp messages into orders, bookings and payments, set up for you. For restaurants, cafes, clinics, salons and shops in Qatar.",
    },
  },
  skip: "Skip to content",
  nav: {
    what: "What we do",
    product: "ALYR Chat",
    how: "How it works",
    price: "Price",
    questions: "Questions",
    other: "العربية",
    home: "ALYR home",
    menu: "Menu",
    sections: "Sections",
    cta: { whatsapp: "Message us", email: "Email us", pending: "Talk to us" },
  },
  contact: {
    whatsapp: "Message us on WhatsApp",
    email: "Email us",
    reply: "A person from ALYR replies, in Arabic or English.",
    replyShort: "A person from ALYR replies.",
    soon: "Our WhatsApp line opens soon. Until then, write to",
    pending: "Our WhatsApp line opens soon. Please check back shortly.",
    commits: "A message commits you to nothing.",
    prefill: "Hello ALYR, I'd like to see how it works for my business.",
    subject: "How ALYR works for my business",
    draft: "The message we fill in for you",
    bar: "Contact ALYR",
  },
  footer: {
    line: "We do the tech. You run the business.",
    rights: "ALYR. Built in Qatar.",
    workspace: "Staff sign-in",
    disclaimer: "ALYR works with WhatsApp Business. It is not affiliated with WhatsApp or Meta.",
    doha: "Doha",
    links: "Site",
  },
  fig: { label: "Fig", fictional: "Sample, fictional bakery" },
  home: {
    hero: {
      eyebrow: "We do the tech. You run the business.",
      // No-break spaces: on a narrow phone the line breaks only as "Without the / IT team."
      title: ["Go digital.", "Without the IT team."],
      body:
        "ALYR sets up and looks after the technology for owner-run businesses in Qatar. We start with your WhatsApp: orders, bookings and payments in the chat, and your whole team on one number.",
      how: "See how it works",
      facts: ["Set up for you, in your shop", "From QAR 449 a month", "Arabic and English"],
      figure: {
        label: "A sample order page on a customer’s phone, and the order it makes on the shop’s screen",
        caption: { n: "01", text: "Order page and the record it makes, sample prices" },
        hint: "Try + and −. Nothing is ordered.",
        order: {
          shop: "Qirfa Bakery",
          monogram: "QB",
          context: "Order",
          other: "العربية",
          eyebrow: "Order from your chat",
          title: "What would you like?",
          as: "Ordering as",
          customer: "Aisha Al-Kuwari",
          categories: ["Bakery", "Cakes", "Drinks"],
          sections: [
            {
              name: "Bakery",
              items: [
                { id: "manakish", name: "Za'atar manakish", price: 8, qty: 2 },
                { id: "fatayer", name: "Cheese fatayer", price: 6, qty: 0 },
                { id: "maamoul", name: "Date maamoul, box of 6", price: 30, qty: 0 },
              ],
            },
            { name: "Cakes", items: [{ id: "saffron", name: "Saffron cake, slice", price: 22, qty: 1 }] },
          ],
          money: "QAR {n}",
          count: { one: "{n} item", other: "{n} items" },
          pay: "Pay QAR {total}",
          add: "Add: {item}",
          more: "Add one: {item}",
          less: "Remove one: {item}",
          max: "{item}: 9 is the most in this sample.",
          announce: "{item}: {qty}. {count}, QAR {total}.",
          powered: "Powered by",
        },
        record: {
          screen: "Orders",
          title: "Order 1043",
          status: "New",
          customer: "Aisha Al-Kuwari",
          by: "Looked after by Yusuf",
          initial: "Y",
        },
      },
    },
    problem: {
      eyebrow: "Sound familiar?",
      title: "Your customers already message you. The trouble starts after that.",
      rows: [
        { text: "Orders arrive on WhatsApp and get copied onto paper. Some never make it." },
        { text: "In the Friday rush nobody can answer, so the customer orders from an app instead.", when: "Fri 13:10" },
        { text: "Payment is a transfer screenshot that someone has to check." },
        { text: "Bookings live in one person’s phone. On their day off, nobody knows who is coming.", when: "Sat 09:00" },
        { text: "Staff answer from their own numbers. You can’t see what they told the customer, or who dropped the order." },
        { text: "Customers on credit forget, and chasing them feels awkward." },
        { text: "At the end of the week, you can’t say how many orders came through the chat.", when: "Sat 22:00" },
      ],
      strong: "None of this needs an IT team.",
      muted: "It needs the chat set up properly, and someone to look after it.",
      who: {
        label: "Who it’s for",
        first: "First for",
        firstTags: ["Owner-run restaurants and cafes in Doha"],
        also: "Also for",
        alsoTags: ["Home and field services", "Shops and traders"],
      },
    },
    does: {
      eyebrow: "What ALYR does",
      title: "One workspace for your business. It starts with ALYR Chat.",
      body:
        "ALYR products share one workspace, one customer list and one team, and you switch on what you need. The first, ALYR Chat, turns the WhatsApp messages you already get into orders, bookings and payments.",
      product: { name: "ALYR Chat", line: "Sell, book and get paid in the chat.", state: "Early access" },
      storyLabel: "What ALYR Chat does, one step at a time",
      modules: [
        {
          id: "orders",
          title: "Orders",
          body: "Customers order from a page made for their phone, with no app and no account. The order lands on your screen, not on paper.",
          caption: { n: "02", text: "An order in the chat and on the shop’s screen, sample prices" },
        },
        {
          id: "pay",
          title: "Payment links",
          body: "Send a link in the chat and see the moment it is paid. Live card payments start once your payment account is connected.",
          caption: { n: "03", text: "Payment link and receipt. The payment page is still a test page: no money moves" },
        },
        {
          id: "track",
          title: "Order tracking",
          body: "Each order has its own page showing every step and who is looking after it. Fewer “where is my order?” messages.",
          caption: { n: "04", text: "Order tracking page" },
        },
        {
          id: "inbox",
          title: "Team inbox",
          body: "One number for the whole team. When a person replies, the automatic replies step back.",
          caption: { n: "05", text: "Team inbox, with the record of who took the chat" },
        },
        {
          id: "book",
          title: "Bookings",
          body: "Customers pick a time you are actually free. The confirmation goes out at once, and a reminder two hours before.",
          caption: { n: "06", text: "Booking a cake tasting, sample price" },
        },
      ],
      also: {
        title: "Also in your workspace",
        items: [
          {
            title: "Credit accounts",
            body: "Record credit sales in the chat, send polite reminders with a payment link, and see who promised to pay and when.",
          },
          {
            title: "A name on everything",
            body: "Every chat, order, booking and credit account has one person responsible. You see who answered, how fast, and what was sold or lost.",
          },
          {
            title: "Your Sunday report",
            body: "Every Sunday morning, last week’s numbers arrive on your WhatsApp: orders, bookings, money collected, and customers who wrote.",
          },
        ],
      },
      rail: {
        label: "ALYR products",
        state: "Early access",
        slots: ["Next", "After that"],
        line: "More products will join the same workspace, in the order our first businesses ask for them.",
        link: "See ALYR Chat",
      },
    },
    sample: {
      shop: "Qirfa Bakery",
      monogram: "QB",
      business: "Business account",
      typeHere: "Message",
      powered: "Powered by",
      chat: {
        ask: { from: "customer", lines: ["Hi, I'd like to order for pickup"], time: "4:02 PM" },
        link: {
          from: "business",
          lines: [{ text: "Here is our order page. Pick what you need: ", link: "alyr.qa/s/qirfa" }],
          time: "4:02 PM",
        },
        placed: {
          from: "business",
          lines: [
            "Order #1043 received.",
            "2 x Za'atar manakish  QAR 16",
            "1 x Saffron cake, slice  QAR 22",
            "Total: QAR 38",
            { text: "Pay here: ", link: "alyr.qa/pay/…" },
            { text: "Track your order: ", link: "alyr.qa/t/…" },
          ],
          time: "4:05 PM",
        },
        receipt: { from: "business", lines: ["Received QAR 38 for order #1043. Thank you."], time: "4:07 PM" },
      },
      track: {
        context: "Order tracking",
        eyebrow: "Your order",
        title: "Order #1043",
        status: "Ready for collection",
        steps: [
          { label: "Order received", at: "Wed 4:05 pm", reached: true },
          { label: "Confirmed by the shop", at: "Wed 4:09 pm", reached: true },
          { label: "Ready for collection", at: "Wed 4:31 pm", reached: true, now: true },
          { label: "Complete", at: "Waiting", reached: false },
        ],
        person: { name: "Yusuf", rest: " at Qirfa Bakery is looking after your order." },
        updates: "This page updates by itself. We also message you on WhatsApp at every step.",
      },
      inbox: {
        screen: "Inbox",
        customer: "Aisha Al-Kuwari",
        handled: "Handled by",
        handler: "Yusuf",
        close: "Close",
        labels: { customer: "Customer", assistant: "Assistant" },
        thread: [
          { from: "customer", lines: ["Can I get a whole saffron cake for Thursday?"], time: "4:12 PM" },
          { from: "assistant", lines: ["Thanks for your message. We will reply shortly."], time: "4:12 PM" },
          { activity: "Yusuf took this conversation", time: "4:14 PM" },
          { from: "staff", who: "Yusuf", lines: ["Yes. A whole one is QAR 145. Shall I put one aside for Thursday?"], time: "4:15 PM" },
        ],
        paused: {
          title: "You are answering",
          hint: "The assistant is quiet for this customer until you close the conversation or hand it back.",
        },
      },
      booking: {
        context: "Booking",
        eyebrow: "Book from your chat",
        title: "Book a visit",
        as: "Booking as",
        customer: "Aisha Al-Kuwari",
        steps: ["Choose a service", "Choose a day", "Choose a time"],
        services: [
          { name: "Cake tasting", meta: "30 min · QAR 50", on: true },
          { name: "Wedding cake consultation", meta: "60 min" },
        ],
        days: [
          { top: "Today", day: "16", month: "Oct" },
          { top: "Sat", day: "17", month: "Oct" },
          { top: "Sun", day: "18", month: "Oct", on: true },
          { top: "Mon", day: "19", month: "Oct" },
          { top: "Tue", day: "20", month: "Oct" },
        ],
        times: ["4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM"],
        time: "4:30 PM",
        summary: ["Cake tasting", "Sun 18 Oct · 4:30 PM"],
        confirm: "Confirm booking",
      },
      rows: {
        order: { screen: "Orders", ref: "1043", name: "Aisha Al-Kuwari", status: "New", by: "Yusuf" },
        paid: { screen: "Orders", ref: "1043", name: "Aisha Al-Kuwari", status: "Paid", by: "Yusuf" },
        ready: { screen: "Orders", ref: "1043", name: "Aisha Al-Kuwari", status: "Ready", by: "Yusuf" },
        inbox: { screen: "Inbox", ref: "Open", name: "Aisha Al-Kuwari", status: "Yusuf", by: "Yusuf" },
        booking: { screen: "Bookings", ref: "Sun 4:30 PM", name: "Cake tasting · Aisha Al-Kuwari", status: "Booked", by: "Yusuf" },
      },
    },
    how: {
      eyebrow: "How it works",
      title: "From the first visit to your first order.",
      steps: [
        {
          title: "We visit you.",
          body: "We come to your shop, see how orders and bookings reach you today, and show you ALYR on your own phone.",
        },
        {
          title: "We set it up.",
          body: "We load your menu or services and prices in Arabic and English, set your hours, and give each person on your team a sign-in.",
        },
        {
          title: "You go live.",
          body: "We train your team at the counter. You share your chat link and QR codes, and orders start arriving in one place.",
        },
        {
          title: "You see what changed.",
          body: "Every Sunday your numbers arrive on WhatsApp. Want something changed? Message us and we change it.",
        },
      ],
      report: {
        caption: { n: "07", text: "The Sunday report on WhatsApp, sample figures" },
        heading: "ALYR weekly report: Qirfa Bakery",
        week: "4 to 10 Oct",
        time: "9:00 AM",
        sections: [
          {
            title: "Orders",
            lines: [
              "Orders received: 64, worth QAR 2,310 (last week 52)",
              "Customers who ordered again: 21",
              "Most ordered: Za'atar manakish (118)",
            ],
          },
          {
            title: "Bookings",
            lines: [
              "Customers who came: 6 (last week 4)",
              "No-shows: 1",
              "New bookings made: 7",
              "Reminders ALYR sent for you: 7",
              "Booked for next week: 5",
              "Busiest day: Thursday",
            ],
          },
          {
            title: "Team inbox",
            lines: [
              "Customers who wrote: 88 (last week 71)",
              "New customers: 19",
              "Replies by your team: 142",
              "Messages ALYR sent for you: 236",
            ],
          },
        ],
      },
    },
    included: {
      eyebrow: "Set up for you",
      title: "You run the business. We do the tech.",
      body:
        "Setup is part of every plan, not a job we leave to you. And for as long as you subscribe, we look after the rest of your tech too.",
      start: {
        title: "When you start",
        items: [
          "Your menu, products or services, with prices, in Arabic and English",
          "Opening hours, booking times and reminders",
          "Sign-ins for your team",
          "Training at your counter",
          "Your chat link, and QR codes for the tables, the door, Instagram and Google Maps",
        ],
      },
      month: {
        title: "Every month",
        items: [
          "Menu, price and hours changes whenever you ask",
          "A person from ALYR, whenever you message",
          "Your Sunday report",
          "Every product update, with nothing to install",
        ],
      },
      more: {
        title: "When you need more",
        body:
          "A website, your Google listing, or a tool you already pay for that should work with ALYR? Ask us. Small jobs are part of looking after you. We price bigger ones before we start.",
      },
      figure: {
        caption: { n: "08", text: "Ask ALYR in your workspace, and the request in ALYR’s back office" },
        workspace: "Your workspace",
        setup: "Finish setting up ALYR Chat",
        progress: "2 of 5 steps done. Each one you finish switches more of it on.",
        steps: [
          { text: "Add the services customers can book", done: true },
          { text: "Add your menu or price list", done: true },
          { text: "Set your opening hours", done: false },
        ],
        ask: "Ask ALYR",
        asked: "ALYR is on it",
        office: "ALYR back office",
        queue: "Asked for help",
        heads: { shop: "Shop", step: "Product · step", note: "Note", by: "Asked by" },
        row: {
          shop: "Qirfa Bakery",
          when: "16/10/2026, 14:05",
          step: "chat · hours",
          note: "Friday: 2 pm to 11 pm",
          by: "Hessa",
          done: "Mark done",
        },
      },
    },
    price: {
      eyebrow: "Price",
      title: "One clear price, in QAR.",
      from: "From",
      amount: "449",
      currency: "QAR",
      period: "a month",
      setup: "Setup from QAR 1,500, quoted at your visit.",
      includes: "Every month includes ALYR Chat, sign-ins for your team, your Sunday report, and changes whenever you ask.",
      ledgerLabel: "Fees, said plainly",
      ledger: [
        { label: "Commission on your orders", value: "None. ALYR takes no commission.", strong: true },
        { label: "WhatsApp message fees", value: "Billed to you by Meta, at Meta’s rates. We add nothing." },
        { label: "Term", value: "Month to month. Stop at the end of any month." },
      ],
      agreement: {
        caption: { n: "09", text: "The first month, as it goes into your agreement" },
        kicker: "Agreement · first month",
        parties: "ALYR and Qirfa Bakery",
        titleLead: "Your first month,",
        titleMark: "with your money back.",
        body:
          "Before we start, we agree one result with you, for example a number of orders or bookings taken through the chat in your first 30 days. If we don’t reach it, we refund your first month.",
        fields: [
          { label: "The result", value: "Agreed with you at the visit", blank: true },
          { label: "Counted", value: "In your workspace, where you see it too" },
          { label: "Period", value: "30 days from go-live" },
          { label: "Your part", value: "Share your chat link and QR codes in the first week" },
          { label: "If we miss it", value: "Your first month’s subscription back. The setup fee is not refunded." },
        ],
        print: "The terms are written into your agreement.",
      },
    },
    trust: {
      eyebrow: "Why trust us",
      title: "New company. No shortcuts.",
      body:
        "We are choosing our first businesses in Doha now, so you won’t see logos or numbers here yet. Here is what we can show you instead.",
      facts: [
        {
          label: "The person",
          title: "You know who you are dealing with.",
          body: "The person who visits you sets you up and answers when you message.",
        },
        {
          label: "The platform",
          title: "WhatsApp’s official platform.",
          body: "ALYR runs on WhatsApp’s official Business Platform, not on unofficial tools that put a number at risk. We are not WhatsApp or Meta.",
        },
        {
          label: "Your records",
          title: "Your records, kept apart.",
          body: "Each business’s records are separated inside the database itself, not by a setting someone can forget.",
        },
        {
          label: "Consent",
          title: "Stop means stop.",
          body: "A customer who asks to stop is not messaged again, and every consent is on record.",
        },
        {
          label: "Languages",
          title: "Arabic and English, both first.",
          body: "Customers get replies in the language they write in. Your team can switch the workspace to either language.",
        },
        {
          label: "Control",
          title: "People stay in charge.",
          body: "Automatic replies handle the routine, and anyone on your team can step into any chat.",
        },
      ],
      closing: "And if the first month doesn’t deliver what we agreed, you get your money back.",
      records: {
        label: "On record",
        items: { cr: "Commercial registration", provider: "Payment provider", meta: "Meta Tech Provider" },
      },
      figure: {
        caption: { n: "10", text: "The same tracking page in English and Arabic" },
        label: "The same customer page in English and in Arabic, side by side",
      },
    },
    faq: {
      eyebrow: "Questions",
      title: "Fair questions.",
      items: [
        {
          id: "whatsapp-business",
          q: "I already use WhatsApp Business. It’s free.",
          a: "Keep using WhatsApp. ALYR adds what the app doesn’t have: an order page, bookings, payment links and one inbox for your whole team, so orders stop ending up on paper.",
        },
        {
          id: "delivery-apps",
          q: "Delivery apps bring me customers.",
          a: "Keep them for new customers. ALYR is for the regulars who already message you. Their orders come to you direct, and ALYR takes no commission on them.",
        },
        {
          id: "price",
          q: "QAR 449 a month is a lot.",
          a: "It is a real cost, which is why your first month comes with a result we agree in advance. If we miss it, you get the month back.",
        },
        {
          id: "staff",
          q: "My staff won’t use it.",
          a: "We train them at your counter. Each person gets their own sign-in, and orders move through steps they already know: new, confirmed, ready, done.",
        },
        {
          id: "busy-night",
          q: "What if something breaks on a busy night?",
          a: "Message us and a person from ALYR answers. Every message is saved before it is sent and tried again if WhatsApp is slow, so orders are not lost.",
        },
        {
          id: "pay-online",
          q: "My customers won’t pay online.",
          a: "They don’t have to. A payment link is offered, never forced, and regulars with a credit account can put an order on their account.",
        },
        {
          id: "not-technical",
          q: "I’m not technical.",
          a: "You don’t need to be. We set it up, train your team and change things when you ask.",
        },
        {
          id: "data",
          q: "Is my data safe? Is this approved?",
          a: "ALYR uses WhatsApp’s official Business Platform, and each business’s records are kept apart inside the database.",
        },
        {
          id: "message-fees",
          q: "What do WhatsApp messages cost?",
          a: "Meta charges for some messages, mostly reminders and notices sent more than 24 hours after a customer last wrote. Meta bills you directly at its own rates, and ALYR adds nothing.",
        },
        {
          id: "contract",
          q: "Is there a contract?",
          a: "Month to month. You can stop at the end of any month.",
        },
      ],
    },
    final: {
      title: "Tell us how you take orders today.",
      body: "Send us a message. A person from ALYR replies in Arabic or English, then comes to show you ALYR on your own menu or price list.",
    },
  },
  product: {
    eyebrow: "ALYR Chat · Early access",
    title: "Sell, book and get paid in the chat.",
    body:
      "Your customers keep messaging you the way they already do. ALYR Chat adds the booking, the order, the payment link and the updates, and your team sees it all in one place.",
    business: "Dana Home Services",
    businessMeta: "Business account",
    today: "Today",
    typeHere: "Message",
    workspace: "Workspace",
    note: "Sample conversation with a fictional business.",
    tabsLabel: "What the product does",
    pause: "Pause the demo",
    play: "Play the demo",
    demos: [
      {
        id: "book",
        tab: "Book",
        chat: [
          { from: "customer", text: "Hi, the AC in the majlis is leaking. Can someone come tomorrow?" },
          { from: "business", text: "We can. Pick a time that suits you.", action: "Choose a time" },
          { from: "business", text: "Booking 214 confirmed: AC service visit, Tue 14 Oct, 4:30 PM." },
          { from: "business", text: "Reminder: your visit is today at 4:30 PM." },
        ],
        panel: {
          title: "Bookings",
          badge: "Tue 14 Oct",
          rows: [
            { lead: "2:00 PM", main: "Generator service", sub: "Khalid Al-Naimi", trail: "Booked", tone: "done" },
            { lead: "4:30 PM", main: "AC service visit", sub: "Mariam Al-Kuwari", trail: "New", tone: "signal" },
            { lead: "6:00 PM", main: "Electrical inspection", sub: "Yousef Al-Emadi", trail: "Booked", tone: "done" },
          ],
        },
        caption: "Free times come from your opening hours. Two customers can never take the same slot.",
      },
      {
        id: "order",
        tab: "Order",
        chat: [
          { from: "customer", text: "I need two AC filters and a thermostat." },
          { from: "business", text: "Here is our order page. Pick what you need.", action: "Open the order page" },
          { from: "business", text: "Order 1042 received: 3 items, QAR 385." },
        ],
        panel: {
          title: "Order 1042",
          badge: "New",
          rows: [
            { lead: "2 ×", main: "AC filter", trail: "QAR 120", tone: "signal" },
            { lead: "1 ×", main: "Smart thermostat", trail: "QAR 265", tone: "signal" },
          ],
          total: ["Total", "QAR 385"],
        },
        caption: "The customer orders from a page made for their phone. Your team sees it the moment it lands.",
      },
      {
        id: "pay",
        tab: "Pay",
        chat: [
          { from: "business", text: "Order 1042 is confirmed. You can pay here.", action: "Pay QAR 385" },
          { from: "business", text: "Received QAR 385 for order 1042. Thank you." },
        ],
        panel: {
          title: "Payments",
          badge: "Today",
          rows: [
            { main: "Order 1042", sub: "Mariam Al-Kuwari", trail: "QAR 385 · Paid", tone: "signal" },
            { main: "On account", sub: "Al Rayyan Villas · 41 days", trail: "QAR 1,850 · Reminded", tone: "done" },
          ],
        },
        caption: "Payments settle in your own gateway account. ALYR never holds your money.",
      },
      {
        id: "track",
        tab: "Track",
        chat: [
          { from: "business", text: "Order 1042 is confirmed." },
          { from: "business", text: "Order 1042 is ready for pickup." },
          { from: "customer", text: "On my way." },
        ],
        panel: {
          title: "Order 1042",
          badge: "Ready",
          rows: [
            { lead: "10:02", main: "Received", tone: "done" },
            { lead: "10:05", main: "Confirmed", tone: "done" },
            { lead: "11:40", main: "Ready for pickup", trail: "Customer told", tone: "signal" },
            { lead: "", main: "Collected", tone: "quiet" },
          ],
        },
        caption: "Each change of status messages the customer, so nobody has to ask.",
      },
      {
        id: "collect",
        tab: "Collect",
        chat: [
          { from: "business", text: "Dana Home Services: we recorded a credit purchase of QAR 450. Your balance is now QAR 1,850." },
          { from: "business", text: "A friendly reminder from Dana Home Services: QAR 1,850 is due. You can pay here.", action: "Pay now" },
          { from: "customer", text: "I'll pay within a week" },
          { from: "business", text: "Thank you. We have noted that you will pay by 21 Oct. No reminders will be sent until then." },
        ],
        panel: {
          title: "Credit accounts",
          badge: "3 accounts",
          rows: [
            { main: "Al Rayyan Villas", sub: "Oldest unpaid: 41 days", trail: "QAR 1,850 · Promised", tone: "signal" },
            { main: "Khalid Al-Naimi", sub: "Oldest unpaid: 12 days", trail: "QAR 900", tone: "done" },
            { main: "Gulf Lights Trading", sub: "Oldest unpaid: 96 days", trail: "QAR 3,650 · Final notice", tone: "quiet" },
          ],
        },
        caption: "A promise to pay pauses the reminders until its date. Nobody is reminded twice within a few days.",
      },
      {
        id: "inbox",
        tab: "Team inbox",
        chat: [
          { from: "customer", text: "Is the thermostat covered by a warranty?" },
          { from: "staff", text: "Yes, 12 months. I will bring the receipt with me tomorrow." },
        ],
        panel: {
          title: "Inbox",
          badge: "3 open",
          rows: [
            { main: "Mariam Al-Kuwari", sub: "Is the thermostat covered by a warranty?", trail: "Yusuf", tone: "signal" },
            { main: "Khalid Al-Naimi", sub: "Is the generator part in?", trail: "Unassigned", tone: "quiet" },
            { main: "Staff note", sub: "Mariam prefers calls after 5 PM.", trail: "Team only", tone: "done" },
          ],
        },
        caption: "One number, the whole team. When a person answers, the assistant steps back.",
      },
    ],
    facts: [
      {
        title: "Keep your number",
        body: "Connect the WhatsApp Business number your customers already know. The app stays on your phone.",
      },
      {
        title: "Paid straight to you",
        body: "Payment links use your own gateway account. ALYR never holds or moves your money.",
      },
      {
        title: "No message without consent",
        body: "A customer who says stop is not messaged again. Every consent is recorded.",
      },
    ],
    flow: {
      eyebrow: "How it works",
      title: "What happens when a customer messages you.",
      body:
        "Your customer sees an ordinary chat. Behind it, ALYR does the checking, the booking and the record-keeping while they wait for the reply. Follow one message through.",
      tabsLabel: "Examples",
      stepsLabel: "Steps",
      pause: "Pause",
      play: "Play",
      note: "Sample conversation with a fictional business.",
      customer: { name: "Your customer", sub: "On WhatsApp, as always" },
      whatsapp: { name: "WhatsApp", sub: "Business Platform" },
      alyr: { name: "ALYR Chat", sub: "Working in the background", idle: "Waiting for the next message" },
      team: { name: "Your team", sub: "The workspace", idle: "Nothing new yet" },
      stories: [
        {
          id: "book",
          tab: "A customer books",
          steps: [
            {
              move: "in",
              title: "A customer writes to your number",
              body: "Mariam messages you on WhatsApp, the way she always has. The message reaches ALYR through WhatsApp's official Business Platform.",
              chat: { from: "customer", text: "The AC in the majlis is leaking. Can someone come tomorrow?" },
              work: ["Message received"],
            },
            {
              title: "ALYR checks who is asking",
              body: "It confirms the message really came from WhatsApp, finds Mariam in your customer list, and sees that she writes in English.",
              work: ["Sender checked: it is WhatsApp", "Customer found: Mariam Al-Kuwari"],
            },
            {
              title: "It works out what she needs",
              body: "She wants a visit. ALYR reads your opening hours and the bookings you already have, and keeps only the times that are free.",
              work: ["Request: book a visit", "Free times read from your hours"],
            },
            {
              move: "out",
              title: "She gets an answer straight away",
              body: "The reply goes back the same way, in her language, with a button that opens your booking page.",
              chat: { from: "business", text: "We can. Pick a time that suits you.", action: "Choose a time" },
              work: ["Reply sent"],
            },
            {
              move: "in",
              title: "She picks a time",
              body: "The page opens on her phone with no app and no sign-up. When she confirms, ALYR checks the time once more and locks it, so two customers can never take the same slot.",
              chat: { from: "event", text: "Picked Tue 14 Oct, 4:30 PM" },
              work: ["Time checked again and locked"],
            },
            {
              move: "team",
              title: "Your team sees the booking",
              body: "It appears on your team's screen the moment it is made. Nobody copied anything out of a chat.",
              record: { id: "booking", lead: "4:30 PM", main: "AC service visit", sub: "Mariam Al-Kuwari", trail: "New", tone: "signal" },
              work: ["Booking 214 saved"],
            },
            {
              move: "out",
              title: "Confirmation now, reminder later",
              body: "ALYR confirms the booking and sets a reminder for two hours before the visit. Your team typed nothing.",
              chat: { from: "business", text: "Booking 214 confirmed: AC service visit, Tue 14 Oct, 4:30 PM." },
              work: ["Confirmation sent", "Reminder set for 2:30 PM"],
            },
          ],
        },
        {
          id: "remind",
          tab: "A reminder goes out",
          steps: [
            {
              title: "The reminder comes due",
              body: "Two hours before the visit, the reminder ALYR set comes due. Nobody on your team has to remember it.",
              work: ["Reminder due: booking 214"],
            },
            {
              title: "It checks the booking still stands",
              body: "A booking that was cancelled or moved is skipped, so nobody is reminded of a visit that is not happening.",
              work: ["Booking 214: still booked"],
            },
            {
              title: "It checks WhatsApp's rules",
              body: "Mariam last wrote more than 24 hours ago. WhatsApp then allows only wording it has approved in advance, so ALYR uses that. Had she asked you to stop, nothing would go out.",
              work: ["Consent: on record", "Last message: over 24 hours ago", "Approved wording chosen"],
            },
            {
              move: "out",
              title: "The reminder arrives",
              body: "It reaches her phone from your number, in the language she uses with you.",
              chat: { from: "business", text: "Reminder: booking 214 at Dana Home Services is at Tue 14 Oct, 4:30 PM. See you soon." },
              work: ["Reminder sent"],
            },
            {
              move: "team",
              title: "Your team knows it was read",
              body: "WhatsApp reports back when a message is delivered and when it is read. ALYR keeps both on record.",
              record: { id: "reminder", lead: "2:30 PM", main: "Reminder, booking 214", sub: "Mariam Al-Kuwari", trail: "Read", tone: "signal" },
              work: ["Delivered", "Read"],
            },
          ],
        },
        {
          id: "person",
          tab: "A person steps in",
          steps: [
            {
              move: "in",
              title: "A question for a person",
              body: "Not everything should be automatic. Mariam asks something only your team can answer.",
              chat: { from: "customer", text: "Is the thermostat covered by a warranty?" },
              work: ["Message received"],
            },
            {
              move: "team",
              title: "It lands in the shared inbox",
              body: "Every chat on your number is in one inbox the whole team can see, whoever is on shift.",
              record: { id: "chat", main: "Mariam Al-Kuwari", sub: "Is the thermostat covered by a warranty?", trail: "Unassigned", tone: "quiet" },
              work: ["Saved to the shared inbox"],
            },
            {
              move: "back",
              title: "Yusuf answers from his screen",
              body: "He types the reply in the workspace. The chat becomes his, so the team can see who is handling it.",
              record: { id: "chat", main: "Mariam Al-Kuwari", sub: "Is the thermostat covered by a warranty?", trail: "Yusuf", tone: "signal" },
              work: ["Chat taken by Yusuf"],
            },
            {
              title: "The assistant steps back",
              body: "Once a person replies, ALYR stops answering Mariam's typed messages by itself. It takes over again when the chat is closed.",
              work: ["Automatic replies paused for this chat"],
            },
            {
              move: "out",
              title: "The reply goes out from your number",
              body: "Mariam sees one business and one number. She never needs to know which screen the answer came from.",
              chat: { from: "business", text: "Yes, 12 months. I will bring the receipt with me tomorrow." },
              work: ["Reply sent from your number"],
            },
            {
              move: "team",
              title: "A note stays with the customer",
              body: "Yusuf leaves a note for the next colleague. Notes are for the team only and are never sent.",
              record: { id: "note", main: "Staff note", sub: "Mariam prefers calls after 5 PM.", trail: "Team only", tone: "done" },
              work: ["Note saved, team only"],
            },
          ],
        },
      ],
    },
    inside: {
      eyebrow: "What is in it",
      title: "Everything it does today.",
      note: "ALYR Chat is in early access. Everything listed here is built. We connect it to your number when we set you up.",
      groups: [
        {
          name: "For your customers",
          items: [
            { title: "Booking in the chat", body: "They pick from the times you are actually free. A confirmation and a reminder follow by themselves." },
            { title: "An order page for their phone", body: "Your products and prices on a page that opens from the chat. No app, no account." },
            { title: "Pay from a link", body: "A payment link in the chat, and a receipt the moment it is paid." },
            { title: "Updates without asking", body: "Confirmed, ready, done: each change of status reaches them as a message." },
            { title: "Arabic or English", body: "ALYR answers in the language the customer writes in." },
          ],
        },
        {
          name: "For your team",
          items: [
            { title: "One shared inbox", body: "Every chat on your number in one place. Anyone can take a chat, and the team sees who has it." },
            { title: "Step in at any moment", body: "When a person replies, the assistant goes quiet for that customer until the chat is closed." },
            { title: "Notes and saved replies", body: "Notes only the team can see, and ready answers for the questions you get every day." },
            { title: "Credit accounts", body: "Record a sale on credit by typing it in a chat. The customer is told, and the balance is always current." },
            { title: "Reminders that stay polite", body: "Overdue accounts get a reminder with a payment link. The tone follows the age of the debt." },
          ],
        },
        {
          name: "Behind the scenes",
          items: [
            { title: "WhatsApp's rules, handled", body: "Free replies for 24 hours after a customer writes, approved wording after that. ALYR picks the right one each time." },
            { title: "Stop means stop", body: "A customer who says stop is not messaged again, and every consent is on record." },
            { title: "Nothing lost", body: "Each message is saved before it is sent, and tried again if WhatsApp is slow. A failure is shown, never hidden." },
            { title: "Your records, kept apart", body: "Each business is separated inside the database itself, not by a setting someone can forget." },
            { title: "Delivered and read", body: "ALYR records when each message is delivered and when it is read." },
          ],
        },
      ],
    },
    why: {
      eyebrow: "Why owners choose it",
      statement:
        "Your customers already message you before they visit or order. Those chats get lost, orders end up on paper, and payment means a transfer screenshot. The businesses that win treat the chat as their shop counter.",
      pillars: [
        {
          title: "Sell more",
          body: "Stop losing orders in the chat, even after hours or in the Friday rush.",
        },
        {
          title: "Keep more",
          body: "Orders that come to you direct carry no delivery-app commission. Your customer list stays yours.",
        },
        {
          title: "Easy",
          body: "We set it up for you, on the number you already use. Your customers need no new app.",
        },
        {
          title: "Trusted",
          body: "A local team, Arabic and English, built on WhatsApp's official Business Platform.",
        },
      ],
    },
    who: {
      eyebrow: "Who it's for",
      title: "For businesses that already run on WhatsApp.",
      rows: [
        {
          name: "Restaurants and cafes",
          body: "Your menu in your customers' chat. Orders come to you direct, and your regulars stay yours.",
          tags: ["Order", "Pay"],
        },
        {
          name: "Clinics and salons",
          body: "Bookings and reminders taken in the chat, without the phone tag.",
          tags: ["Book", "Remind"],
        },
        {
          name: "Home and field services",
          body: "Scheduled visits, updates on the day, and payment when the job is done.",
          tags: ["Schedule", "Pay"],
        },
        {
          name: "Shops and trading",
          body: "Orders, payment links, and credit accounts with reminders that stay polite.",
          tags: ["Order", "Collect"],
        },
      ],
      other: "Run something else? Tell us how you work today.",
    },
    next: {
      eyebrow: "What comes next",
      body:
        "We start with the chat. As you grow, ALYR adds payments, books and a website, all on the same customer list.",
    },
    cta: {
      title: "Let us set it up for you.",
      body:
        "Tell us how you take orders and bookings today. A person from ALYR replies, in Arabic or English, and shows you the same work on your own menu or price list.",
    },
  },
};

const ar: Copy = {
  meta: {
    home: {
      title: "ALYR · خلّ شغلك رقمي بدون فريق تقنية",
      description:
        "تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر وتتابعها عنك، بدءاً بـ\u00a0ALYR Chat: طلبات وحجوزات ومدفوعات داخل المحادثة. ابتداءً من 449 ر.ق شهرياً، بالعربية والإنجليزية.",
    },
    chat: {
      title: "ALYR Chat · استقبل الطلبات والحجوزات والدفع في المحادثة",
      description:
        "يحوّل ALYR Chat رسائل عملائك على واتساب إلى طلبات وحجوزات ومدفوعات، ونحن نجهّزه لك. للمطاعم والمقاهي والعيادات والصالونات والمحلات في قطر.",
    },
  },
  skip: "انتقل إلى المحتوى",
  nav: {
    what: "ماذا نقدّم",
    product: "ALYR Chat",
    how: "كيف يعمل",
    price: "السعر",
    questions: "أسئلة",
    other: "English",
    home: "الصفحة الرئيسية لـ\u00a0ALYR",
    menu: "القائمة",
    sections: "الأقسام",
    cta: { whatsapp: "راسلنا", email: "راسلنا بالبريد", pending: "تواصل معنا" },
  },
  contact: {
    whatsapp: "راسلنا على واتساب",
    email: "راسلنا بالبريد",
    reply: "يردّ عليك شخص من ALYR، بالعربية أو الإنجليزية.",
    replyShort: "يردّ عليك شخص من ALYR.",
    soon: "رقم واتساب الخاص بنا يُفتح قريباً. وحتى ذلك الحين راسلنا على",
    pending: "رقم واتساب الخاص بنا يُفتح قريباً. نرجو العودة لاحقاً.",
    commits: "الرسالة لا تُلزمك بشيء.",
    prefill: "السلام عليكم، أبي أشوف كيف يشتغل ALYR مع محلي.",
    subject: "كيف يعمل ALYR مع محلي",
    draft: "الرسالة التي نكتبها لك مسبقاً",
    bar: "تواصل مع ALYR",
  },
  footer: {
    line: "علينا التقنية، وعليك شغلك.",
    rights: "ALYR. صُنع في قطر.",
    workspace: "دخول الموظفين",
    disclaimer: "تعمل ALYR مع واتساب للأعمال، وليست تابعة لواتساب أو Meta.",
    doha: "الدوحة",
    links: "الموقع",
  },
  fig: { label: "الشكل", fictional: "مثال لمخبز غير حقيقي" },
  home: {
    hero: {
      eyebrow: "علينا التقنية، وعليك شغلك.",
      title: ["خلّ شغلك رقمي.", "بدون فريق تقنية."],
      body:
        "تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر، وتتابعها عنك. ونبدأ من واتساب: طلبات وحجوزات ومدفوعات داخل المحادثة، وفريقك كله على رقم واحد.",
      how: "شاهد كيف يعمل",
      facts: ["نجهّزها لك في محلك", "ابتداءً من 449 ر.ق شهرياً", "بالعربية والإنجليزية"],
      figure: {
        label: "صفحة طلب توضيحية على هاتف العميل، والطلب الذي تنشئه على شاشة المحل",
        caption: { n: "01", text: "صفحة الطلب والسجل الذي تنشئه، بأسعار للتوضيح" },
        hint: "جرّب + و −. لن يُرسل أي طلب.",
        order: {
          shop: "مخبز قرفة",
          monogram: "م",
          context: "طلب",
          other: "English",
          eyebrow: "طلب من المحادثة",
          title: "ماذا تود أن تطلب؟",
          as: "الطلب باسم",
          customer: "عائشة الكواري",
          categories: ["المخبوزات", "الكيك", "المشروبات"],
          sections: [
            {
              name: "المخبوزات",
              items: [
                { id: "manakish", name: "مناقيش زعتر", price: 8, qty: 2 },
                { id: "fatayer", name: "فطاير جبن", price: 6, qty: 0 },
                { id: "maamoul", name: "معمول تمر، علبة من 6", price: 30, qty: 0 },
              ],
            },
            { name: "الكيك", items: [{ id: "saffron", name: "كيك الزعفران، قطعة", price: 22, qty: 1 }] },
          ],
          money: "QAR {n}",
          count: { one: "{n} صنف", other: "{n} صنف" },
          pay: "ادفع {total} ر.ق",
          add: "أضف: {item}",
          more: "إضافة واحد: {item}",
          less: "إزالة واحد: {item}",
          max: "{item}: الحد الأعلى في هذا المثال 9.",
          announce: "{item}: {qty}. {count}، {total} ر.ق.",
          powered: "مدعوم من",
        },
        record: {
          screen: "الطلبات",
          title: "الطلب 1043",
          status: "جديد",
          customer: "عائشة الكواري",
          by: "يتابعه يوسف",
          initial: "ي",
        },
      },
    },
    problem: {
      eyebrow: "مألوف لك؟",
      title: "عملاؤك يراسلونك أصلاً. والمشكلة تبدأ بعد ذلك.",
      rows: [
        { text: "تصل الطلبات على واتساب ثم تُنقل إلى الورق، وبعضها لا يصل أبداً." },
        { text: "في زحمة الجمعة لا أحد يتفرّغ للرد، فيطلب العميل من تطبيق آخر.", when: "الجمعة 13:10" },
        { text: "الدفع صورة تحويل، ولا بد أن يتحقق منها أحد." },
        { text: "الحجوزات في هاتف شخص واحد، وفي يوم إجازته لا أحد يعرف من سيأتي.", when: "السبت 09:00" },
        { text: "الموظفون يردّون من أرقامهم الخاصة، فلا تعرف ماذا قالوا للعميل ولا من أضاع الطلب." },
        { text: "عملاء الآجل ينسون، ومطالبتهم محرجة." },
        { text: "وفي آخر الأسبوع لا تعرف كم طلباً جاءك عبر المحادثة.", when: "السبت 22:00" },
      ],
      strong: "كل هذا لا يحتاج فريق تقنية.",
      muted: "يحتاج محادثة مجهّزة كما يجب، ومن يتابعها عنك.",
      who: {
        label: "لمن صُمّم",
        first: "البداية مع",
        firstTags: ["المطاعم والمقاهي التي يديرها أصحابها في الدوحة"],
        also: "ويناسب أيضاً",
        alsoTags: ["الخدمات المنزلية والميدانية", "المحلات والتجارة"],
      },
    },
    does: {
      eyebrow: "ماذا تقدّم ALYR",
      title: "مساحة عمل واحدة لنشاطك. والبداية ALYR Chat.",
      body:
        "منتجات ALYR تتشارك مساحة عمل واحدة وقائمة عملاء واحدة وفريقاً واحداً، وتفعّل منها ما تحتاجه. وأولها ALYR Chat، يحوّل رسائل واتساب التي تصلك أصلاً إلى طلبات وحجوزات ومدفوعات.",
      product: { name: "ALYR Chat", line: "استقبل الطلبات والحجوزات والدفع في المحادثة.", state: "وصول مبكر" },
      storyLabel: "ماذا يفعل ALYR Chat، خطوة بعد خطوة",
      modules: [
        {
          id: "orders",
          title: "الطلبات",
          body: "يطلب العميل من صفحة مصمّمة لهاتفه، بلا تطبيق ولا حساب. ويصل الطلب إلى شاشتك، لا إلى الورق.",
          caption: { n: "02", text: "طلب في المحادثة وعلى شاشة المحل، بأسعار للتوضيح" },
        },
        {
          id: "pay",
          title: "روابط الدفع",
          body: "أرسل رابطاً في المحادثة، واعرف لحظة السداد. ويبدأ الدفع الفعلي بالبطاقات بعد ربط حساب الدفع الخاص بك.",
          caption: { n: "03", text: "رابط الدفع والإيصال. صفحة الدفع ما زالت تجريبية، ولا تُنقل فيها أي أموال" },
        },
        {
          id: "track",
          title: "متابعة الطلب",
          body: "لكل طلب صفحته، فيها كل خطوة ومن يتولاه. وتقلّ رسائل «وين طلبي؟».",
          caption: { n: "04", text: "صفحة متابعة الطلب" },
        },
        {
          id: "inbox",
          title: "صندوق الفريق",
          body: "رقم واحد للفريق كله. وحين يردّ أحد الموظفين تتوقف الردود الآلية.",
          caption: { n: "05", text: "صندوق الفريق، مع سجل من تولّى المحادثة" },
        },
        {
          id: "book",
          title: "الحجوزات",
          body: "يختار العميل من الأوقات المتاحة فعلاً لديك. يصله التأكيد فوراً، وتذكير قبل الموعد بساعتين.",
          caption: { n: "06", text: "حجز موعد لتذوّق الكيك، بسعر للتوضيح" },
        },
      ],
      also: {
        title: "وأيضاً في مساحة عملك",
        items: [
          {
            title: "الحسابات الآجلة",
            body: "سجّل البيع بالآجل في المحادثة، وأرسل تذكيرات لبقة برابط دفع، واعرف من وعد بالسداد ومتى.",
          },
          {
            title: "اسم على كل شيء",
            body: "لكل محادثة وطلب وحجز وحساب آجل موظف مسؤول. ترى من ردّ، وبأي سرعة، وما الذي بيع أو ضاع.",
          },
          {
            title: "تقرير الأحد",
            body: "كل أحد صباحاً تصلك أرقام الأسبوع الماضي على واتساب: الطلبات والحجوزات والمبالغ المحصّلة والعملاء الذين راسلوك.",
          },
        ],
      },
      rail: {
        label: "منتجات ALYR",
        state: "وصول مبكر",
        slots: ["التالي", "وبعده"],
        line: "ستنضم منتجات أخرى إلى مساحة العمل نفسها، بالترتيب الذي يطلبه أوائل عملائنا.",
        link: "شاهد ALYR Chat",
      },
    },
    sample: {
      shop: "مخبز قرفة",
      monogram: "م",
      business: "حساب أعمال",
      typeHere: "مراسلة",
      powered: "مدعوم من",
      chat: {
        ask: { from: "customer", lines: ["السلام عليكم، أبي أطلب للاستلام"], time: "4:02 م" },
        link: {
          from: "business",
          lines: [{ text: "تفضل، اختر طلبك من هنا: ", link: "alyr.qa/s/qirfa" }],
          time: "4:02 م",
        },
        placed: {
          from: "business",
          lines: [
            "تم استلام الطلب رقم 1043.",
            "2 x مناقيش زعتر  QAR 16",
            "1 x كيك الزعفران، قطعة  QAR 22",
            "الإجمالي: QAR 38",
            { text: "للدفع: ", link: "alyr.qa/pay/…" },
            { text: "تتبّع طلبك: ", link: "alyr.qa/t/…" },
          ],
          time: "4:05 م",
        },
        receipt: { from: "business", lines: ["تم استلام QAR 38 للطلب رقم 1043. شكراً لك."], time: "4:07 م" },
      },
      track: {
        context: "تتبّع الطلب",
        eyebrow: "طلبك",
        title: "الطلب رقم 1043",
        status: "جاهز للاستلام",
        steps: [
          { label: "تم استلام الطلب", at: "الأربعاء 4:05 م", reached: true },
          { label: "أكّده المتجر", at: "الأربعاء 4:09 م", reached: true },
          { label: "جاهز للاستلام", at: "الأربعاء 4:31 م", reached: true, now: true },
          { label: "مكتمل", at: "قيد الانتظار", reached: false },
        ],
        person: { name: "يوسف", rest: " من مخبز قرفة يتابع طلبك." },
        updates: "تتحدّث هذه الصفحة تلقائياً، ونراسلك على واتساب عند كل خطوة.",
      },
      inbox: {
        screen: "المحادثات",
        customer: "عائشة الكواري",
        handled: "المسؤول",
        handler: "يوسف",
        close: "إغلاق",
        labels: { customer: "العميل", assistant: "المساعد" },
        thread: [
          { from: "customer", lines: ["ممكن كيكة زعفران كاملة يوم الخميس؟"], time: "4:12 م" },
          { from: "assistant", lines: ["شكراً لرسالتك، سنرد عليك قريباً."], time: "4:12 م" },
          { activity: "يوسف تولّى المحادثة", time: "4:14 م" },
          { from: "staff", who: "يوسف", lines: ["نعم، الكاملة بـ 145 ر.ق. أخلي لك وحدة ليوم الخميس؟"], time: "4:15 م" },
        ],
        paused: {
          title: "أنت من يرد",
          hint: "المساعد متوقف لهذا العميل حتى تغلق المحادثة أو تعيدها إليه.",
        },
      },
      booking: {
        context: "حجز",
        eyebrow: "حجز من المحادثة",
        title: "احجز موعداً",
        as: "الحجز باسم",
        customer: "عائشة الكواري",
        steps: ["اختر الخدمة", "اختر اليوم", "اختر الوقت"],
        services: [
          { name: "تذوّق الكيك", meta: "30 دقيقة · QAR 50", on: true },
          { name: "استشارة كيك الزفاف", meta: "60 دقيقة" },
        ],
        days: [
          { top: "اليوم", day: "16", month: "أكتوبر" },
          { top: "السبت", day: "17", month: "أكتوبر" },
          { top: "الأحد", day: "18", month: "أكتوبر", on: true },
          { top: "الاثنين", day: "19", month: "أكتوبر" },
          { top: "الثلاثاء", day: "20", month: "أكتوبر" },
        ],
        times: ["4:00 م", "4:30 م", "5:00 م", "5:30 م", "6:00 م", "6:30 م"],
        time: "4:30 م",
        summary: ["تذوّق الكيك", "الأحد 18 أكتوبر · 4:30 م"],
        confirm: "تأكيد الحجز",
      },
      rows: {
        order: { screen: "الطلبات", ref: "1043", name: "عائشة الكواري", status: "جديد", by: "يوسف" },
        paid: { screen: "الطلبات", ref: "1043", name: "عائشة الكواري", status: "مدفوع", by: "يوسف" },
        ready: { screen: "الطلبات", ref: "1043", name: "عائشة الكواري", status: "جاهز", by: "يوسف" },
        inbox: { screen: "المحادثات", ref: "مفتوحة", name: "عائشة الكواري", status: "يوسف", by: "يوسف" },
        booking: { screen: "الحجوزات", ref: "الأحد 4:30 م", name: "تذوّق الكيك · عائشة الكواري", status: "محجوز", by: "يوسف" },
      },
    },
    how: {
      eyebrow: "كيف يعمل",
      title: "من الزيارة الأولى إلى أول طلب.",
      steps: [
        {
          title: "نزورك.",
          body: "نأتي إلى محلك، ونرى كيف تصلك الطلبات والحجوزات اليوم، ونريك ALYR على هاتفك أنت.",
        },
        {
          title: "نجهّزه لك.",
          body: "ندخل قائمتك أو خدماتك وأسعارك بالعربية والإنجليزية، ونضبط ساعات العمل، ونعطي كل موظف في فريقك حساب دخول خاصاً به.",
        },
        {
          title: "تبدأ العمل.",
          body: "ندرّب فريقك عند الكاونتر، وتشارك رابط المحادثة ورموز QR، فتصل الطلبات إلى مكان واحد.",
        },
        {
          title: "ترى ما تغيّر.",
          body: "كل أحد تصلك أرقامك على واتساب. تريد تعديل شيء؟ راسلنا ونعدّله.",
        },
      ],
      report: {
        caption: { n: "07", text: "تقرير الأحد على واتساب، بأرقام للتوضيح" },
        heading: "تقرير ALYR الأسبوعي: مخبز قرفة",
        week: "من 4/10 إلى 10/10",
        time: "9:00 ص",
        sections: [
          {
            title: "الطلبات",
            lines: [
              "طلبات وصلتك: 64، بقيمة QAR 2,310 (الأسبوع الماضي 52)",
              "عملاء طلبوا مرة أخرى: 21",
              "الأكثر طلباً: مناقيش زعتر (118)",
            ],
          },
          {
            title: "الحجوزات",
            lines: [
              "حضروا: 6 (الأسبوع الماضي 4)",
              "لم يحضروا: 1",
              "حجوزات جديدة: 7",
              "تذكيرات أرسلتها ALYR نيابة عنك: 7",
              "محجوز للأسبوع القادم: 5",
              "أكثر الأيام ازدحاماً: الخميس",
            ],
          },
          {
            title: "صندوق الفريق",
            lines: [
              "عملاء راسلوك: 88 (الأسبوع الماضي 71)",
              "عملاء جدد: 19",
              "ردود فريقك: 142",
              "رسائل أرسلتها ALYR نيابة عنك: 236",
            ],
          },
        ],
      },
    },
    included: {
      eyebrow: "نجهّزه لك",
      title: "أنت تدير شغلك. ونحن نتولى التقنية.",
      body:
        "التجهيز جزء من كل باقة، لا مهمة نتركها لك. وطوال اشتراكك نتابع بقية أمورك التقنية أيضاً.",
      start: {
        title: "عند البداية",
        items: [
          "قائمتك أو منتجاتك أو خدماتك بأسعارها، بالعربية والإنجليزية",
          "ساعات العمل وأوقات الحجز والتذكيرات",
          "حسابات دخول لفريقك",
          "تدريب عند الكاونتر",
          "رابط المحادثة، ورموز QR للطاولات والباب وإنستغرام وخرائط جوجل",
        ],
      },
      month: {
        title: "كل شهر",
        items: [
          "تعديل القائمة والأسعار والساعات متى طلبت",
          "شخص من ALYR يردّ متى راسلتنا",
          "تقرير الأحد",
          "كل تحديثات المنتج، بلا تثبيت",
        ],
      },
      more: {
        title: "حين تحتاج أكثر",
        body:
          "موقع، أو صفحتك على جوجل، أو أداة تدفع ثمنها وتريد أن تعمل مع ALYR؟ اطلب منا. المهام الصغيرة جزء من متابعتنا لك، والكبيرة نسعّرها قبل أن نبدأ.",
      },
      figure: {
        caption: { n: "08", text: "«اطلب من ALYR» في مساحة عملك، والطلب في المكتب الداخلي لـ\u00a0ALYR" },
        workspace: "مساحة عملك",
        setup: "أكمل إعداد ALYR Chat",
        progress: "أنجزت 2 من 5. كل خطوة تفعّل جزءاً أكبر.",
        steps: [
          { text: "أضف الخدمات المتاحة للحجز", done: true },
          { text: "أضف قائمتك أو أسعارك", done: true },
          { text: "حدّد ساعات العمل", done: false },
        ],
        ask: "اطلب من ALYR",
        asked: "ALYR تعمل عليها",
        office: "المكتب الداخلي لـ\u00a0ALYR",
        queue: "طلبات المساعدة",
        heads: { shop: "المحل", step: "المنتج · الخطوة", note: "ملاحظة", by: "الطلب من" },
        row: {
          shop: "مخبز قرفة",
          when: "16/10/2026، 14:05",
          step: "ALYR Chat · ساعات العمل",
          note: "الجمعة: من 2 م إلى 11 م",
          by: "حصة",
          done: "تم",
        },
      },
    },
    price: {
      eyebrow: "السعر",
      title: "سعر واحد واضح، بالريال القطري.",
      from: "ابتداءً من",
      amount: "449",
      currency: "ر.ق",
      period: "شهرياً",
      setup: "ورسوم تجهيز تبدأ من 1,500 ر.ق، نحددها معك خلال الزيارة.",
      includes: "يشمل كل شهر ALYR Chat، وحسابات دخول لفريقك، وتقرير الأحد، والتعديلات متى طلبت.",
      ledgerLabel: "الرسوم بوضوح",
      ledger: [
        { label: "العمولة على طلباتك", value: "لا شيء. لا تأخذ ALYR أي عمولة.", strong: true },
        { label: "رسوم رسائل واتساب", value: "تحتسبها Meta عليك مباشرة بأسعارها، ولا نضيف عليها شيئاً." },
        { label: "مدة الاشتراك", value: "شهراً بشهر. يمكنك التوقف في نهاية أي شهر." },
      ],
      agreement: {
        caption: { n: "09", text: "الشهر الأول كما يُكتب في اتفاقك" },
        kicker: "الاتفاق · الشهر الأول",
        parties: "بين ALYR ومخبز قرفة",
        titleLead: "شهرك الأول،",
        titleMark: "بضمان استرداد المبلغ.",
        body:
          "قبل أن نبدأ نتفق معك على نتيجة واحدة، مثل عدد الطلبات أو الحجوزات عبر المحادثة في أول 30 يوماً. وإن لم نحققها نعيد لك مبلغ الشهر الأول.",
        fields: [
          { label: "النتيجة", value: "نتفق عليها معك خلال الزيارة", blank: true },
          { label: "طريقة العدّ", value: "في مساحة عملك، وتراها أنت أيضاً" },
          { label: "المدة", value: "30 يوماً من بدء التشغيل" },
          { label: "دورك", value: "أن تشارك رابط المحادثة ورموز QR في الأسبوع الأول" },
          { label: "إن لم نحققها", value: "نعيد لك اشتراك الشهر الأول. رسوم التجهيز لا تُسترد." },
        ],
        print: "الشروط مكتوبة في اتفاقك معنا.",
      },
    },
    trust: {
      eyebrow: "لماذا تثق بنا",
      title: "شركة جديدة. بلا طرق مختصرة.",
      body:
        "نختار الآن أوائل عملائنا في الدوحة، لذلك لن ترى هنا شعارات أو أرقاماً بعد. وهذا ما نستطيع أن نريك إياه بدلاً منها.",
      facts: [
        {
          label: "من تتعامل معه",
          title: "تعرف من تتعامل معه.",
          body: "الشخص الذي يزورك هو من يجهّز لك، وهو من يردّ حين تراسلنا.",
        },
        {
          label: "المنصة",
          title: "منصة واتساب الرسمية.",
          body: "تعمل ALYR على منصة واتساب للأعمال الرسمية، لا على أدوات غير رسمية تعرّض الرقم للحظر. ولسنا واتساب ولا Meta.",
        },
        {
          label: "سجلاتك",
          title: "سجلاتك منفصلة.",
          body: "بيانات كل منشأة مفصولة داخل قاعدة البيانات نفسها، لا بإعداد قد يُنسى.",
        },
        {
          label: "الموافقة",
          title: "الإيقاف يعني الإيقاف.",
          body: "من يطلب إيقاف الرسائل لا تصله بعدها، وكل موافقة مسجّلة.",
        },
        {
          label: "اللغة",
          title: "العربية والإنجليزية على حدّ سواء.",
          body: "يصل الرد إلى العميل باللغة التي يكتب بها، ويستطيع فريقك تحويل مساحة العمل إلى أيٍّ منهما.",
        },
        {
          label: "القرار",
          title: "القرار لفريقك.",
          body: "الردود الآلية تتولى المتكرر، وأي موظف يستطيع الدخول إلى أي محادثة.",
        },
      ],
      closing: "وإن لم يحقق الشهر الأول ما اتفقنا عليه، نعيد لك مبلغك.",
      records: {
        label: "موثّق",
        items: { cr: "السجل التجاري", provider: "مزوّد الدفع", meta: "مزوّد تقنية معتمد لدى Meta" },
      },
      figure: {
        caption: { n: "10", text: "صفحة المتابعة نفسها بالعربية والإنجليزية" },
        label: "صفحة العميل نفسها بالعربية والإنجليزية، جنباً إلى جنب",
      },
    },
    faq: {
      eyebrow: "أسئلة",
      title: "أسئلة في محلها.",
      items: [
        {
          id: "whatsapp-business",
          q: "أستخدم واتساب للأعمال، وهو مجاني.",
          a: "واصل استخدام واتساب. تضيف ALYR ما لا يوفّره التطبيق: صفحة طلب، وحجوزات، وروابط دفع، وصندوقاً واحداً لفريقك كله، فلا تنتهي الطلبات على الورق.",
        },
        {
          id: "delivery-apps",
          q: "تطبيقات التوصيل تجلب لي العملاء.",
          a: "أبقِ عليها للعملاء الجدد. ALYR لعملائك الدائمين الذين يراسلونك أصلاً؛ طلباتهم تصلك مباشرة، ولا تأخذ ALYR عليها عمولة.",
        },
        {
          id: "price",
          q: "449 ر.ق شهرياً مبلغ كبير.",
          a: "هو تكلفة حقيقية، ولهذا يأتي شهرك الأول مع نتيجة نتفق عليها مسبقاً. وإن لم نحققها نعيد لك مبلغ الشهر.",
        },
        {
          id: "staff",
          q: "موظفيّ لن يستخدموه.",
          a: "ندرّبهم عند الكاونتر. لكل موظف حساب دخول خاص، والطلب يمرّ بمراحل يعرفونها: جديد، مؤكد، جاهز، مكتمل.",
        },
        {
          id: "busy-night",
          q: "وإذا تعطّل شيء في ليلة مزدحمة؟",
          a: "راسلنا ويردّ عليك شخص من ALYR. كل رسالة تُحفظ قبل إرسالها ويُعاد إرسالها إن تأخر واتساب، فلا تضيع الطلبات.",
        },
        {
          id: "pay-online",
          q: "عملائي لا يدفعون إلكترونياً.",
          a: "ليس عليهم ذلك. رابط الدفع خيار لا إلزام، والعملاء الدائمون أصحاب الحسابات الآجلة يسجّلون الطلب على حسابهم.",
        },
        {
          id: "not-technical",
          q: "لست خبيراً بالتقنية.",
          a: "لا تحتاج أن تكون. نحن نجهّز، وندرّب فريقك، ونعدّل متى طلبت.",
        },
        {
          id: "data",
          q: "هل بياناتي آمنة؟ وهل هذا معتمد؟",
          a: "تستخدم ALYR منصة واتساب للأعمال الرسمية، وسجلات كل منشأة مفصولة داخل قاعدة البيانات.",
        },
        {
          id: "message-fees",
          q: "كم تكلّف رسائل واتساب؟",
          a: "تحتسب Meta رسوماً على بعض الرسائل، وأغلبها التذكيرات والإشعارات التي تُرسل بعد مرور 24 ساعة على آخر رسالة من العميل. وتحتسبها Meta عليك مباشرة بأسعارها، ولا تضيف ALYR شيئاً.",
        },
        {
          id: "contract",
          q: "هل هناك عقد ملزم؟",
          a: "الاشتراك شهراً بشهر، ويمكنك التوقف في نهاية أي شهر.",
        },
      ],
    },
    final: {
      title: "أخبرنا كيف تستقبل الطلبات اليوم.",
      body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR بالعربية أو الإنجليزية، ثم يأتيك ليريك ALYR على قائمتك أو أسعارك أنت.",
    },
  },
  product: {
    eyebrow: "ALYR Chat · وصول مبكر",
    title: "استقبل الطلبات والحجوزات والدفع في المحادثة.",
    body:
      "يواصل عملاؤك مراسلتك كما اعتادوا. ويضيف ALYR Chat الحجز والطلب ورابط الدفع والتحديثات، وفريقك يرى كل شيء في مكان واحد.",
    business: "دانة للخدمات المنزلية",
    businessMeta: "حساب أعمال",
    today: "اليوم",
    typeHere: "مراسلة",
    workspace: "مساحة العمل",
    note: "محادثة توضيحية مع شركة غير حقيقية.",
    tabsLabel: "ماذا يفعل المنتج",
    pause: "إيقاف العرض",
    play: "تشغيل العرض",
    demos: [
      {
        id: "book",
        tab: "الحجز",
        chat: [
          { from: "customer", text: "السلام عليكم، مكيف المجلس يسرّب ماء. ممكن أحد يجي بكرة؟" },
          { from: "business", text: "وعليكم السلام، أكيد. اختر الوقت المناسب لك.", action: "اختر الوقت" },
          { from: "business", text: "تم تأكيد الحجز 214: زيارة صيانة مكيف، الثلاثاء ١٤ أكتوبر، ٤:٣٠ م." },
          { from: "business", text: "تذكير: موعد زيارتك اليوم الساعة ٤:٣٠ م." },
        ],
        panel: {
          title: "الحجوزات",
          badge: "الثلاثاء ١٤ أكتوبر",
          rows: [
            { lead: "٢:٠٠ م", main: "صيانة مولّد", sub: "خالد النعيمي", trail: "محجوز", tone: "done" },
            { lead: "٤:٣٠ م", main: "زيارة صيانة مكيف", sub: "مريم الكواري", trail: "جديد", tone: "signal" },
            { lead: "٦:٠٠ م", main: "فحص كهربائي", sub: "يوسف العمادي", trail: "محجوز", tone: "done" },
          ],
        },
        caption: "الأوقات المتاحة تأتي من ساعات عملك، ولا يمكن لعميلين أن يحجزا الموعد نفسه.",
      },
      {
        id: "order",
        tab: "الطلب",
        chat: [
          { from: "customer", text: "أحتاج فلترين للمكيف وثرموستات." },
          { from: "business", text: "تفضل صفحة الطلب، اختر ما تحتاجه.", action: "افتح صفحة الطلب" },
          { from: "business", text: "تم استلام الطلب 1042: ٣ أصناف، ٣٨٥ ر.ق." },
        ],
        panel: {
          title: "الطلب 1042",
          badge: "جديد",
          rows: [
            { lead: "٢ ×", main: "فلتر مكيف", trail: "١٢٠ ر.ق", tone: "signal" },
            { lead: "١ ×", main: "ثرموستات ذكي", trail: "٢٦٥ ر.ق", tone: "signal" },
          ],
          total: ["الإجمالي", "٣٨٥ ر.ق"],
        },
        caption: "يطلب العميل من صفحة مصممة لهاتفه، ويراها فريقك لحظة وصولها.",
      },
      {
        id: "pay",
        tab: "الدفع",
        chat: [
          { from: "business", text: "تم تأكيد الطلب 1042. يمكنك الدفع من هنا.", action: "ادفع ٣٨٥ ر.ق" },
          { from: "business", text: "تم استلام ٣٨٥ ر.ق عن الطلب 1042. شكراً لك." },
        ],
        panel: {
          title: "المدفوعات",
          badge: "اليوم",
          rows: [
            { main: "الطلب 1042", sub: "مريم الكواري", trail: "٣٨٥ ر.ق · مدفوع", tone: "signal" },
            { main: "على الحساب", sub: "فلل الريان · ٤١ يوماً", trail: "١٬٨٥٠ ر.ق · تم التذكير", tone: "done" },
          ],
        },
        caption: "تُسوّى المدفوعات في حساب بوابة الدفع الخاص بك. ALYR لا تحتفظ بأموالك أبداً.",
      },
      {
        id: "track",
        tab: "المتابعة",
        chat: [
          { from: "business", text: "تم تأكيد الطلب 1042." },
          { from: "business", text: "الطلب 1042 جاهز للاستلام." },
          { from: "customer", text: "أنا في الطريق." },
        ],
        panel: {
          title: "الطلب 1042",
          badge: "جاهز",
          rows: [
            { lead: "١٠:٠٢", main: "تم الاستلام", tone: "done" },
            { lead: "١٠:٠٥", main: "تم التأكيد", tone: "done" },
            { lead: "١١:٤٠", main: "جاهز للاستلام", trail: "أُبلغ العميل", tone: "signal" },
            { lead: "", main: "تم التسليم", tone: "quiet" },
          ],
        },
        caption: "كل تغيير في الحالة يصل إلى العميل برسالة، فلا يحتاج أحد أن يسأل.",
      },
      {
        id: "collect",
        tab: "التحصيل",
        chat: [
          { from: "business", text: "دانة للخدمات المنزلية: تم تسجيل شراء آجل بمبلغ ٤٥٠ ر.ق. رصيدك الآن ١٬٨٥٠ ر.ق." },
          { from: "business", text: "تذكير ودي من دانة للخدمات المنزلية: عليك مبلغ ١٬٨٥٠ ر.ق. يمكنك الدفع من هنا.", action: "ادفع الآن" },
          { from: "customer", text: "سأدفع خلال أسبوع" },
          { from: "business", text: "شكراً لك. سجلنا أنك ستدفع قبل ٢١ أكتوبر. لن نرسل تذكيرات حتى ذلك التاريخ." },
        ],
        panel: {
          title: "حسابات الآجل",
          badge: "٣ حسابات",
          rows: [
            { main: "فلل الريان", sub: "أقدم فاتورة: ٤١ يوماً", trail: "١٬٨٥٠ ر.ق · وعد بالسداد", tone: "signal" },
            { main: "خالد النعيمي", sub: "أقدم فاتورة: ١٢ يوماً", trail: "٩٠٠ ر.ق", tone: "done" },
            { main: "أنوار الخليج للتجارة", sub: "أقدم فاتورة: ٩٦ يوماً", trail: "٣٬٦٥٠ ر.ق · إشعار أخير", tone: "quiet" },
          ],
        },
        caption: "الوعد بالسداد يوقف التذكيرات حتى موعده. ولا يُذكَّر أحد مرتين خلال أيام قليلة.",
      },
      {
        id: "inbox",
        tab: "صندوق الفريق",
        chat: [
          { from: "customer", text: "هل الثرموستات عليه ضمان؟" },
          { from: "staff", text: "نعم، ضمان ١٢ شهراً. سأحضر الفاتورة معي غداً." },
        ],
        panel: {
          title: "الوارد",
          badge: "٣ مفتوحة",
          rows: [
            { main: "مريم الكواري", sub: "هل الثرموستات عليه ضمان؟", trail: "يوسف", tone: "signal" },
            { main: "خالد النعيمي", sub: "هل وصلت قطعة المولّد؟", trail: "غير مسندة", tone: "quiet" },
            { main: "ملاحظة داخلية", sub: "مريم تفضّل الاتصال بعد ٥ مساءً.", trail: "للفريق فقط", tone: "done" },
          ],
        },
        caption: "رقم واحد والفريق كله. وحين يردّ أحد الموظفين يتوقف المساعد الآلي.",
      },
    ],
    facts: [
      {
        title: "احتفظ برقمك",
        body: "اربط رقم واتساب للأعمال الذي يعرفه عملاؤك. ويبقى التطبيق على هاتفك.",
      },
      {
        title: "المبلغ يصلك مباشرة",
        body: "روابط الدفع تستخدم حساب بوابة الدفع الخاص بك. ALYR لا تحتفظ بأموالك ولا تنقلها.",
      },
      {
        title: "لا رسالة بلا موافقة",
        body: "من يطلب الإيقاف لا تصله رسائل بعدها، وكل موافقة تُسجَّل.",
      },
    ],
    flow: {
      eyebrow: "كيف يعمل",
      title: "ماذا يحدث حين يراسلك عميل.",
      body:
        "عميلك يرى محادثة عادية. وخلفها تتولى ALYR التحقق والحجز وحفظ السجلات ريثما يصله الرد. تابع رسالة واحدة من أولها إلى آخرها.",
      tabsLabel: "الأمثلة",
      stepsLabel: "الخطوات",
      pause: "إيقاف",
      play: "تشغيل",
      note: "محادثة توضيحية مع شركة غير حقيقية.",
      customer: { name: "عميلك", sub: "على واتساب كعادته" },
      whatsapp: { name: "واتساب", sub: "منصة الأعمال" },
      alyr: { name: "ALYR Chat", sub: "يعمل في الخلفية", idle: "بانتظار الرسالة التالية" },
      team: { name: "فريقك", sub: "مساحة العمل", idle: "لا جديد بعد" },
      stories: [
        {
          id: "book",
          tab: "عميل يحجز",
          steps: [
            {
              move: "in",
              title: "عميل يراسل رقمك",
              body: "مريم تراسلك على واتساب كما اعتادت. وتصل الرسالة إلى ALYR عبر منصة واتساب للأعمال الرسمية.",
              chat: { from: "customer", text: "مكيف المجلس يسرّب ماء. ممكن أحد يجي بكرة؟" },
              work: ["تم استلام الرسالة"],
            },
            {
              title: "ALYR تتحقق من المرسل",
              body: "تتأكد أن الرسالة جاءت فعلاً من واتساب، وتجد مريم في قائمة عملائك، وتلاحظ أنها تكتب بالعربية.",
              work: ["المصدر مؤكد: واتساب", "العميل: مريم الكواري"],
            },
            {
              title: "تفهم ما تحتاجه",
              body: "تريد زيارة. تقرأ ALYR ساعات عملك وحجوزاتك الحالية، وتُبقي الأوقات المتاحة فقط.",
              work: ["الطلب: حجز زيارة", "الأوقات المتاحة من ساعات عملك"],
            },
            {
              move: "out",
              title: "يصلها الرد فوراً",
              body: "يعود الرد من الطريق نفسه وبلغتها، ومعه زر يفتح صفحة الحجز الخاصة بك.",
              chat: { from: "business", text: "أكيد. اختر الوقت المناسب لك.", action: "اختر الوقت" },
              work: ["تم إرسال الرد"],
            },
            {
              move: "in",
              title: "تختار الوقت",
              body: "تُفتح الصفحة على هاتفها بلا تطبيق ولا تسجيل. وعند التأكيد تتحقق ALYR من الموعد مرة أخرى وتحجزه، فلا يأخذ عميلان الوقت نفسه.",
              chat: { from: "event", text: "اختارت الثلاثاء ١٤ أكتوبر، ٤:٣٠ م" },
              work: ["تم التحقق من الموعد وحجزه"],
            },
            {
              move: "team",
              title: "فريقك يرى الحجز",
              body: "يظهر على شاشة فريقك لحظة إتمامه. لم ينسخ أحد شيئاً من المحادثة.",
              record: { id: "booking", lead: "٤:٣٠ م", main: "زيارة صيانة مكيف", sub: "مريم الكواري", trail: "جديد", tone: "signal" },
              work: ["تم حفظ الحجز 214"],
            },
            {
              move: "out",
              title: "تأكيد الآن، وتذكير لاحقاً",
              body: "تؤكد ALYR الحجز وتضبط تذكيراً قبل الزيارة بساعتين. وفريقك لم يكتب حرفاً.",
              chat: { from: "business", text: "تم تأكيد الحجز 214: زيارة صيانة مكيف، الثلاثاء ١٤ أكتوبر، ٤:٣٠ م." },
              work: ["تم إرسال التأكيد", "تذكير مضبوط الساعة ٢:٣٠ م"],
            },
          ],
        },
        {
          id: "remind",
          tab: "تذكير يُرسل",
          steps: [
            {
              title: "يحين موعد التذكير",
              body: "قبل الزيارة بساعتين يحين التذكير الذي ضبطته ALYR. لا يحتاج أحد من فريقك أن يتذكره.",
              work: ["حان التذكير: الحجز 214"],
            },
            {
              title: "تتأكد أن الحجز ما زال قائماً",
              body: "الحجز الملغى أو المؤجل يُتجاوز، فلا يُذكَّر أحد بزيارة لن تتم.",
              work: ["الحجز 214: ما زال قائماً"],
            },
            {
              title: "تراجع قواعد واتساب",
              body: "آخر رسالة من مريم مضى عليها أكثر من ٢٤ ساعة. عندها لا يسمح واتساب إلا بصياغة وافق عليها مسبقاً، فتستخدمها ALYR. ولو طلبت مريم الإيقاف لما أُرسل شيء.",
              work: ["الموافقة: مسجّلة", "آخر رسالة: قبل أكثر من ٢٤ ساعة", "اختيرت الصياغة المعتمدة"],
            },
            {
              move: "out",
              title: "يصل التذكير",
              body: "يصل إلى هاتفها من رقمك، وباللغة التي تراسلك بها.",
              chat: { from: "business", text: "تذكير: الحجز 214 لدى دانة للخدمات المنزلية موعده الثلاثاء ١٤ أكتوبر، ٤:٣٠ م. بانتظارك." },
              work: ["تم إرسال التذكير"],
            },
            {
              move: "team",
              title: "فريقك يعرف أنها قرأته",
              body: "يبلّغ واتساب حين تُسلَّم الرسالة وحين تُقرأ، وتحفظ ALYR ذلك في السجل.",
              record: { id: "reminder", lead: "٢:٣٠ م", main: "تذكير، الحجز 214", sub: "مريم الكواري", trail: "قُرئ", tone: "signal" },
              work: ["تم التسليم", "قُرئت"],
            },
          ],
        },
        {
          id: "person",
          tab: "موظف يتدخل",
          steps: [
            {
              move: "in",
              title: "سؤال يحتاج إنساناً",
              body: "ليس كل شيء يصلح أن يكون آلياً. مريم تسأل عن أمر لا يجيب عنه إلا فريقك.",
              chat: { from: "customer", text: "هل الثرموستات عليه ضمان؟" },
              work: ["تم استلام الرسالة"],
            },
            {
              move: "team",
              title: "تصل إلى الوارد المشترك",
              body: "كل محادثة على رقمك في صندوق واحد يراه الفريق كله، أياً كان المناوب.",
              record: { id: "chat", main: "مريم الكواري", sub: "هل الثرموستات عليه ضمان؟", trail: "غير مسندة", tone: "quiet" },
              work: ["حُفظت في الوارد المشترك"],
            },
            {
              move: "back",
              title: "يوسف يردّ من شاشته",
              body: "يكتب الرد في مساحة العمل، وتصير المحادثة باسمه، فيعرف الفريق من يتولاها.",
              record: { id: "chat", main: "مريم الكواري", sub: "هل الثرموستات عليه ضمان؟", trail: "يوسف", tone: "signal" },
              work: ["المحادثة مع يوسف"],
            },
            {
              title: "المساعد الآلي يتنحّى",
              body: "حين يردّ موظف تتوقف ALYR عن الرد التلقائي على ما تكتبه مريم، وتعود حين تُغلق المحادثة.",
              work: ["أُوقفت الردود التلقائية لهذه المحادثة"],
            },
            {
              move: "out",
              title: "الرد يخرج من رقمك",
              body: "مريم ترى شركة واحدة ورقماً واحداً، ولا يهمها من أي شاشة جاء الرد.",
              chat: { from: "business", text: "نعم، ضمان ١٢ شهراً. سأحضر الفاتورة معي غداً." },
              work: ["أُرسل الرد من رقمك"],
            },
            {
              move: "team",
              title: "ملاحظة تبقى مع العميل",
              body: "يترك يوسف ملاحظة لزميله القادم. الملاحظات للفريق فقط ولا تُرسل للعميل أبداً.",
              record: { id: "note", main: "ملاحظة داخلية", sub: "مريم تفضّل الاتصال بعد ٥ مساءً.", trail: "للفريق فقط", tone: "done" },
              work: ["حُفظت الملاحظة، للفريق فقط"],
            },
          ],
        },
      ],
    },
    inside: {
      eyebrow: "ماذا يتضمن",
      title: "كل ما يفعله اليوم.",
      note: "ALYR Chat في مرحلة الوصول المبكر. كل ما في هذه القائمة جاهز، ونربطه برقمك عند تجهيزه لك.",
      groups: [
        {
          name: "لعملائك",
          items: [
            { title: "الحجز داخل المحادثة", body: "يختارون من الأوقات المتاحة فعلاً لديك، ويصلهم التأكيد والتذكير تلقائياً." },
            { title: "صفحة طلب تناسب الهاتف", body: "منتجاتك وأسعارك في صفحة تُفتح من المحادثة، بلا تطبيق ولا حساب." },
            { title: "الدفع برابط", body: "رابط دفع في المحادثة، وإيصال لحظة السداد." },
            { title: "تحديثات بلا سؤال", body: "تم التأكيد، جاهز، مكتمل: كل تغيير في الحالة يصلهم برسالة." },
            { title: "بالعربية أو الإنجليزية", body: "تردّ ALYR باللغة التي يكتب بها العميل." },
          ],
        },
        {
          name: "لفريقك",
          items: [
            { title: "وارد واحد مشترك", body: "كل المحادثات على رقمك في مكان واحد. يتولى أي موظف المحادثة، ويرى الفريق من يتولاها." },
            { title: "تدخّل في أي لحظة", body: "حين يردّ موظف يصمت المساعد الآلي مع ذلك العميل إلى أن تُغلق المحادثة." },
            { title: "ملاحظات وردود جاهزة", body: "ملاحظات لا يراها إلا الفريق، وإجابات جاهزة للأسئلة التي تتكرر كل يوم." },
            { title: "حسابات الآجل", body: "سجّل بيعاً بالآجل بكتابته في محادثة. يُبلَّغ العميل، والرصيد محدّث دائماً." },
            { title: "تذكيرات لبقة", body: "الحسابات المتأخرة يصلها تذكير مع رابط دفع، وتتدرّج النبرة بحسب عمر الدين." },
          ],
        },
        {
          name: "في الخلفية",
          items: [
            { title: "قواعد واتساب علينا", body: "ردود حرة خلال ٢٤ ساعة من رسالة العميل، وبعدها صياغة معتمدة. تختار ALYR الصحيح في كل مرة." },
            { title: "الإيقاف يعني الإيقاف", body: "من يطلب الإيقاف لا تصله رسائل بعدها، وكل موافقة مسجّلة." },
            { title: "لا شيء يضيع", body: "تُحفظ كل رسالة قبل إرسالها، ويُعاد إرسالها إن تأخر واتساب. والتعذّر يظهر ولا يُخفى." },
            { title: "سجلاتك منفصلة", body: "بيانات كل شركة مفصولة داخل قاعدة البيانات نفسها، لا بإعداد قد يُنسى." },
            { title: "سُلّمت وقُرئت", body: "تسجّل ALYR متى سُلّمت كل رسالة ومتى قُرئت." },
          ],
        },
      ],
    },
    why: {
      eyebrow: "لماذا يختاره أصحاب الأعمال",
      statement:
        "عملاؤك يراسلونك قبل أن يزوروك أو يطلبوا. تضيع المحادثات، وتُكتب الطلبات على الورق، ويصير الدفع صورة تحويل. والأعمال الرابحة تجعل المحادثة واجهة محلها.",
      pillars: [
        {
          title: "بِع أكثر",
          body: "لا تضيع الطلبات في المحادثة، حتى بعد الدوام أو في زحمة الجمعة.",
        },
        {
          title: "احتفظ بأكثر",
          body: "الطلبات التي تصلك مباشرة بلا عمولة تطبيقات التوصيل، وقائمة عملائك تبقى لك.",
        },
        {
          title: "سهل",
          body: "نجهّزها لك على الرقم الذي تستخدمه اليوم، وعملاؤك لا يحتاجون تطبيقاً جديداً.",
        },
        {
          title: "موثوق",
          body: "فريق محلي، بالعربية والإنجليزية، ومبني على منصة واتساب للأعمال الرسمية.",
        },
      ],
    },
    who: {
      eyebrow: "لمن",
      title: "للشركات التي تعمل على واتساب أصلاً.",
      rows: [
        {
          name: "المطاعم والمقاهي",
          body: "قائمتك داخل محادثة عملائك. الطلبات تصلك مباشرة، وزبائنك الدائمون يبقون لك.",
          tags: ["طلب", "دفع"],
        },
        {
          name: "العيادات والصالونات",
          body: "حجوزات وتذكيرات داخل المحادثة، بلا اتصالات متكررة.",
          tags: ["حجز", "تذكير"],
        },
        {
          name: "الخدمات المنزلية والميدانية",
          body: "زيارات مجدولة، وتحديثات في يوم الموعد، ودفع عند إنجاز العمل.",
          tags: ["جدولة", "دفع"],
        },
        {
          name: "المحلات والتجارة",
          body: "طلبات وروابط دفع وحسابات آجلة مع تذكيرات لبقة.",
          tags: ["طلب", "تحصيل"],
        },
      ],
      other: "نشاطك مختلف؟ أخبرنا كيف يسير العمل لديك اليوم.",
    },
    next: {
      eyebrow: "ما القادم",
      body:
        "نبدأ من المحادثة. ومع نموّ عملك تضيف ALYR المدفوعات والحسابات والموقع، كلها على قائمة العملاء نفسها.",
    },
    cta: {
      title: "دعنا نجهّزها لك.",
      body:
        "أخبرنا كيف تستقبل الطلبات والحجوزات اليوم. يردّ عليك شخص من ALYR بالعربية أو الإنجليزية، ويريك العمل نفسه على قائمتك أو أسعارك.",
    },
  },
};

export const copy: Record<Locale, Copy> = { en, ar };
