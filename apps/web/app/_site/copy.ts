// Every word on the public site, in English and Arabic. Components contain no text.
// ALYR is the business agent for owner-run businesses in Qatar: a company that sets up and
// looks after the owner's tech, and a suite of products in one workspace (D-035). The
// homepage presents the suite, led by ALYR Agent; each product has its own page, in the
// fixed order Chat, Bookings, Agent, Accounts, Shelf, Docs (20 Oct 2026: Payroll left the
// site until it is built, D-039).
// Voice follows the Brand & Growth Playbook (11 Oct 2026): plain words, one idea per
// sentence, no hype, and no number or promise we cannot yet show (docs/brand.md,
// docs/agent-dashboard/06-messaging.md, 07-site-brief.md). Nothing says or implies AI.
// Sample screens use fictional businesses (Qirfa Bakery, Dafira Salon, Zilal Cooling) and
// the product's own wording for its screens and messages; every one is captioned so.
// The Arabic is written natively, not translated line by line, and still needs a
// native speaker's review before launch (ALY-66).

import type { ContactState, PageKey, ProductKey, TrustRecord } from "./site";
import { docsAr, docsEn, type DocLinkPage, type DocsPage } from "./copyDocs";
import { shelfAr, shelfEn, type ShelfPage } from "./copyShelf";

export type Locale = "en" | "ar";

export { fill } from "./fill";

export type ChatLine = {
  from: "customer" | "business" | "staff" | "event";
  text: string;
  // Tappable links or buttons shown under the message.
  action?: string;
  actions?: string[];
  // Who wrote it, for staff messages.
  name?: string;
  // A file sent as a document message (a receipt's PDF), drawn above its caption.
  doc?: { name: string; meta: string };
};

export type PanelRow = {
  lead?: string;
  main: string;
  sub?: string;
  trail?: string;
  // Buttons on the row, as the workspace draws them (Came, No-show).
  acts?: string[];
  // signal: the row this conversation just created. done: finished. quiet: not yet.
  tone?: "signal" | "done" | "quiet";
  // A long second line that wraps instead of being cut (a refusal quoted whole).
  wrap?: boolean;
};

/** The booking page (`/b/`) as a customer sees it, with a service, a day and a time chosen. */
export type BookingPage = {
  shop: string;
  monogram: string;
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

export type Demo = {
  id: string;
  tab: string;
  /** When the sample conversation starts, in minutes after midnight. */
  start: number;
  chat: ChatLine[];
  /** What the team sees; `kicker` names the screen when it is not the workspace, `page`
   * draws the customer's booking page instead of rows, `paper` the receipt RC-0042 on A4 and
   * `doc` a document's own page (`/d/`) on the customer's phone. */
  panel: { title: string; badge: string; kicker?: string; rows: PanelRow[]; total?: [string, string]; page?: BookingPage; paper?: boolean; doc?: DocLinkPage };
  caption: string;
};

/** A product page's tabbed demo: a customer's chat beside what the team sees. */
export type DemoSet = {
  business: string;
  /** The chat avatar's letter, when the business name's first letter is a generic word («مخبز», «صالون»). */
  avatar?: string;
  businessMeta: string;
  today: string;
  typeHere: string;
  workspace: string;
  note: string;
  tabsLabel: string;
  pause: string;
  play: string;
  demos: Demo[];
};

/** One beat of the "how it works" figure on a product page. */
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

/** The "how it works" figure: a message followed through the customer's phone, WhatsApp,
 * ALYR and the team's screen. */
export type FlowSet = {
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

/** `descriptionNoOffer` is used while prices are off the page (`OFFER_LIVE` in site.ts). */
type Meta = { title: string; description: string; descriptionNoOffer?: string };
export type Titled = { title: string; body: string };

/** A figure's caption: its number and what it shows. The component adds "Fig" and, unless
 * the figure names its own, "Sample, fictional bakery" from `fig`. */
export type Caption = { n: string; text: string; nOffer?: string };

/** One line of a drawn chat message; a link shows in link colour after its text. */
export type BubbleLine = string | { text: string; link: string };
export type Bubble = {
  from: "customer" | "business" | "assistant" | "staff";
  lines: BubbleLine[];
  time: string;
  who?: string;
};

/** A question and its answer. A question with a `state` shows only in that contact state,
 * one with `offer` only while prices are on (or off) the page (site.ts). */
export type Question = { id: string; q: string; a: string; state?: ContactState; offer?: boolean };
export type Questions = { eyebrow: string; title: string; items: Question[] };

/** A figure of the Sunday report: the card and its text are the engine's own sample output
 * (`_agent/samples/report/`), drawn as the WhatsApp message the owner gets (ReportPhone). */
export type Report = { caption: Caption };

/** The words around the report's sample message, and each sample card in words. */
export type ReportCopy = {
  /** Under the sender's name in the chat's header, as WhatsApp shows a business. */
  meta: string;
  /** The day chip above the message: the report goes out on Sunday. */
  day: string;
  /** When it goes out, shop time (`report.SEND_HOUR`). */
  time: string;
  /** Each sample's card image, said in words from the card's own facts. */
  alt: Record<SampleKey, string>;
};

// ------------------------------------------------------------- ALYR Agent's figure

export type SampleKey = "bakery" | "salon" | "homeservices";

/**
 * One thing ALYR did, in the live feed beside the dashboard. Its words are the product's
 * own messages for that sample. `adds` names the "Done for you" rows it counts towards
 * (the dashboard's `done.rows[].key`): the count steps up as it arrives. A flag takes its
 * words from the dashboard itself (`flag`: a Needs you now row or a suggestion, by key), so
 * the two always agree.
 */
export type FeedEvent = {
  at: string;
  title: string;
  line?: string;
  flag?: { from: "needs" | "suggestion"; key: string };
  adds: ("sent" | "booking_reminders")[];
};

export type AgentFigure = {
  /** The window's path after the shop's name: the workspace home. */
  path: string;
  switchLabel: string;
  status: string;
  feedLabel: string;
  flagged: string;
  samples: Record<SampleKey, {
    tab: string;
    shop: string;
    monogram: string;
    announce: string;
    /** The end of every caption on this sample's figure. */
    fictional: string;
    feed: FeedEvent[];
  }>;
};

// ----------------------------------------------------------------- the homepage

type Home = {
  hero: {
    eyebrow: string;
    title: [string, string];
    body: string;
    more: string;
    facts: string[];
    /** The facts while prices are off the page (`OFFER_LIVE`). */
    factsNoOffer: string[];
    figure: { label: string; caption: Caption };
  };
  spotlight: {
    eyebrow: string;
    title: string;
    body: string;
    caption: Caption;
    label: string;
    callouts: string[];
    calloutsLabel: string;
    under: string;
    link: string;
  };
  suite: {
    eyebrow: string;
    title: string;
    body: string;
    rows: Record<ProductKey, { body: string; link: string }>;
    notes: Titled[];
    caption: Caption;
    crops: {
      items: string; total: string; pay: string; times: string[]; time: string; owed: string;
      /** ALYR Shelf: two item cards on the order page, one nearly gone, one sold out. */
      shelf: { name: string; price: string; note: string; out?: boolean }[];
      /** ALYR Docs: the top of a receipt, said for screen readers (the paper is drawn from `PAPER`). */
      receipt: string;
    };
  };
  business: {
    eyebrow: string;
    title: string;
    uses: string;
    rows: { name: string; body: string; products: ProductKey[]; note?: string }[];
    other: string;
  };
  how: {
    eyebrow: string;
    title: string;
    steps: Titled[];
    /** The set-up line: under the steps, and again under the price. */
    note: string;
    report: Report;
    start: { title: string; items: string[] };
    month: { title: string; items: string[] };
  };
  price: {
    eyebrow: string;
    title: string;
    from: string;
    amount: string;
    currency: string;
    /** English reads "QAR 449"; Arabic reads "449 ر.ق". */
    currencyFirst: boolean;
    period: string;
    first: string;
    setup: string;
    includes: string;
    combosLabel: string;
    combos: { label: string; value: string }[];
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
  faq: Questions;
  final: Titled;
  /** The sample business on the trust figure: the order tracking page. */
  sample: {
    shop: string;
    monogram: string;
    track: {
      context: string;
      eyebrow: string;
      title: string;
      status: string;
      steps: { label: string; at: string; reached: boolean; now?: boolean }[];
      person: { name: string; rest: string };
      updates: string;
    };
  };
};

// ----------------------------------------------------------- the product pages

/** The bar under the header on a product page: the product's name and its sections. */
export type ProductBar = { label: string; links: { id: string; label: string }[] };

/** A product page's opening, on the Carbon block. */
export type ProductHero = { eyebrow: string; title: [string, string]; lead: string; facts: string[]; factsOffer?: string[] };

/** A real workspace screen at true scale, with numbered callouts. */
export type ScreenSection = { eyebrow: string; title: string; body?: string; caption: Caption; label: string; callouts: string[] };

/** Everything the product does today, by audience, then what is not built yet. */
export type InsideSection = {
  eyebrow: string;
  title: string;
  groups: { name: string; items: string[] }[];
  notYet: { title: string; items: string[] };
  note?: string;
};

export type WhoSection = { eyebrow: string; title: string; rows: { name: string; tags: string[] }[]; other: string };

/** "Works with the rest of ALYR": what each other product adds, in the suite's order. */
export type WorksSection = { eyebrow: string; title: string; rows: Partial<Record<ProductKey, string>>; link: string };

/** The Bookings screen of the workspace, drawn. */
export type BookingsSheet = {
  path: string;
  sub: string;
  heads: { when: string; service: string; customer: string; by: string; status: string };
  acts: { came: string; noShow: string; cancel: string };
  rows: { when: string; ref: string; service: string; customer: string; by: string; status: string; ended?: boolean }[];
  filtered: { label: string; show: string; caption: string };
};

/** The Credit accounts screen of the workspace, drawn. */
export type CreditSheet = {
  path: string;
  sub: string;
  outstanding: string;
  total: string;
  owing: string;
  buckets: { label: string; amount: string; share: number }[];
  remind: string;
  remindHint: string;
  heads: { customer: string; balance: string; age: string };
  rows: { name: string; balance: string; days: string; age: 0 | 1 | 2 | 3; promised?: string; settled?: boolean; on?: boolean }[];
  entries: { title: string; by: string; who: string; rows: { at: string; what: string; amount: string; payment?: boolean }[] };
};

export type PageCommon = {
  bar: ProductBar;
  hero: ProductHero;
  inside: InsideSection;
  who: WhoSection;
  works: WorksSection;
  faq: Questions;
  cta: Titled;
};

type BookingsPage = PageCommon & {
  demo: DemoSet;
  flow: FlowSet;
  screen: ScreenSection & { sheet: BookingsSheet };
};

type AccountsPage = PageCommon & {
  demo: DemoSet;
  flow: FlowSet;
  screen: ScreenSection & { sheet: CreditSheet };
};

type AgentPage = PageCommon & {
  figure: { label: string; caption: Caption };
  how: { eyebrow: string; title: string; steps: Titled[]; card: string; under: string; caption: Caption };
  report: { eyebrow: string; title: string; body: string; report: Report };
  rules: { eyebrow: string; title: string; body: string; heads: [string, string]; rows: { name: string; rule: string; note?: string }[]; notes: string[] };
};

export type Copy = {
  meta: Record<PageKey, Meta>;
  skip: string;
  nav: {
    products: string; business: string; how: string; questions: string; price: string;
    other: string; home: string; menu: string; sections: string; productsMenu: string;
    cta: { whatsapp: string; email: string; pending: string };
  };
  /** The suite, in its fixed order: the Products menu, the footer, the rows on each page. */
  products: {
    items: Record<ProductKey, { name: string; descriptor: string; line: string; state: string }>;
    see: string;
  };
  /** The light/dark switch in the header: its name says what pressing it does; the menu
   * row on phones shows the short form, which the name contains. */
  theme: { toDark: string; toLight: string; dark: string; light: string };
  /** How to reach ALYR, in each of the three contact states (site.ts). */
  contact: {
    whatsapp: string;
    email: string;
    reply: string;
    replyShort: string;
    pending: string;
    commits: string;
    prefill: string;
    subject: string;
    /** The email's first lines: what the visit needs to know. */
    body: string;
    draft: string;
    bar: string;
  };
  footer: { line: string; rights: string; workspace: string; disclaimer: string; doha: string; links: string; products: string };
  fig: { label: string; fictional: string };
  report: ReportCopy;
  agent: AgentFigure;
  home: Home;
  product: DemoSet & {
    bar: ProductBar;
    eyebrow: string;
    title: string;
    body: string;
    facts: Titled[];
    flow: FlowSet;
    inside: { eyebrow: string; title: string; note: string; groups: { name: string; items: Titled[] }[] };
    why: { eyebrow: string; statement: string; pillars: Titled[] };
    who: { eyebrow: string; title: string; rows: { name: string; body: string; tags: string[]; link?: { key: ProductKey; label: string } }[]; other: string };
    works: WorksSection;
    cta: { title: string; body: string };
  };
  pages: { bookings: BookingsPage; agent: AgentPage; accounts: AccountsPage; shelf: ShelfPage; docs: DocsPage };
};

const en: Copy = {
  meta: {
    home: {
      title: "ALYR · Orders, bookings and credit accounts, set up for you",
      description:
        "ALYR sets up and looks after the technology for owner-run businesses in Qatar: orders, bookings, credit accounts, what you sell and your receipts, in one workspace. ALYR Agent comes with each product: what needs you today, and your week in numbers. From QAR 449 a month for the first product, plus setup.",
      descriptionNoOffer:
        "ALYR sets up and looks after the technology for owner-run businesses in Qatar: orders, bookings, credit accounts, what you sell and your receipts, in one workspace. ALYR Agent comes with each product: what needs you today, and your week in numbers.",
    },
    chat: {
      title: "ALYR Chat · WhatsApp orders and team inbox",
      description:
        "ALYR Chat answers your customers' WhatsApp messages with an order page and order tracking, and gives your team one inbox. Set up for you. For restaurants, cafes, shops and home services in Qatar.",
    },
    bookings: {
      title: "ALYR Bookings · Appointments from the WhatsApp chat, with reminders",
      description:
        "Customers book a free time from a page that opens in the chat. ALYR confirms at once, reminds them two hours before, and your team marks who came. Set up for you, in Qatar.",
    },
    agent: {
      title: "ALYR Agent · Your business in numbers, with every ALYR product",
      description:
        "The home screen of your ALYR workspace: what needs you now, your week against the same days last week, and up to three suggestions, each with the rule behind it. With every ALYR product.",
    },
    accounts: {
      title: "ALYR Accounts · Credit accounts and polite reminders, in the chat",
      description:
        "Record credit sales with one line from your staff phone, see who owes you and for how long, and send reminders whose tone follows the age of the debt. Set up for you, in Qatar.",
    },
    shelf: {
      title: "ALYR Shelf · Items, photos and stock, with every ALYR product",
      description:
        "Everything you sell, on one shelf: photos, prices, sizes and choices in Arabic and English. Every sale counts the stock down, the last one sells once, and the order page says Sold out. With every ALYR product.",
    },
    docs: {
      title: "ALYR Docs · Receipts, invoices and credit notes, in Arabic and English",
      description:
        "Receipts from your sales and the payments you record, numbered without a gap, Arabic first and final once issued. No CR yet: receipts, and invoices once you register. Set up for you, in Qatar.",
    },
  },
  skip: "Skip to content",
  nav: {
    products: "Products",
    business: "By business",
    how: "How it works",
    questions: "Questions",
    price: "Price",
    other: "العربية",
    home: "ALYR home",
    menu: "Menu",
    sections: "Sections",
    productsMenu: "ALYR products",
    cta: { whatsapp: "Message us", email: "Email us", pending: "Talk to us" },
  },
  products: {
    items: {
      chat: {
        name: "ALYR Chat",
        descriptor: "WhatsApp orders and team inbox",
        line: "Orders from the chat, one team inbox, order tracking",
        state: "Set up for you",
      },
      bookings: {
        name: "ALYR Bookings",
        descriptor: "Appointments and reminders",
        line: "Appointments from the chat, with a reminder before each",
        state: "Set up for you",
      },
      agent: {
        name: "ALYR Agent",
        descriptor: "Your business in numbers",
        line: "What needs you today, and your week in numbers",
        state: "With every product",
      },
      accounts: {
        name: "ALYR Accounts",
        descriptor: "Credit accounts",
        line: "Credit accounts: who owes you, and polite reminders",
        state: "Set up for you",
      },
      shelf: {
        name: "ALYR Shelf",
        descriptor: "Items and stock",
        line: "Everything you sell: photos, prices, sizes and stock",
        state: "With every product",
      },
      docs: {
        name: "ALYR Docs",
        descriptor: "Receipts and invoices",
        line: "Receipts, invoices and credit notes from your sales",
        state: "Set up for you",
      },
    },
    see: "See {name}",
  },
  theme: { toDark: "Switch to dark mode", toLight: "Switch to light mode", dark: "Dark mode", light: "Light mode" },
  contact: {
    whatsapp: "Message us on WhatsApp",
    email: "Email us",
    reply: "A person from ALYR replies.",
    replyShort: "A person from ALYR replies.",
    pending: "Our WhatsApp line opens soon. Please check back shortly.",
    commits: "A message commits you to nothing.",
    prefill: "Hello ALYR, I'd like to see how it works for my business.",
    subject: "How ALYR works for my business",
    body: "Business name:\nArea:\nWhat you sell or book:\nHow customers reach you today:\nBest time to visit:\n",
    draft: "The message we fill in for you",
    bar: "Contact ALYR",
  },
  footer: {
    line: "We do the tech. You run the business.",
    rights: "ALYR. Built in Qatar.",
    workspace: "Staff sign-in",
    disclaimer: "ALYR uses the WhatsApp Business Platform. ALYR is not affiliated with, or endorsed by, WhatsApp or Meta.",
    doha: "Doha",
    links: "Site",
    products: "Products",
  },
  fig: { label: "Fig", fictional: "Sample, fictional bakery" },
  report: {
    meta: "Business account",
    day: "Sunday",
    time: "09:00",
    alt: {
      bakery:
        "Weekly report card: Qirfa Bakery, 4–10 Oct, marked Sample. Sales QAR 12,005, up 1% on the week before. A bar for each day from Sunday to Saturday beside the week before; the busiest, Tuesday, QAR 2,947. Most ordered: butter croissant, 54 ordered. Owed to you: QAR 13,894 by 6 customers. Visits: 3, 0 no-shows.",
      salon:
        "Weekly report card: Dafira Salon, 4–10 Oct, marked Sample. Visits 28, up 33% on the week before. A bar for each day from Sunday to Saturday beside the week before; the busiest, Saturday, 7 visits. No-shows: 3 of 31 due. Booked ahead: 17 in the next 7 days. Wrote to you: 33 customers.",
      homeservices:
        "Weekly report card: Zilal Cooling, 4–10 Oct, marked Sample. Jobs 22; the week before, 19. A bar for each day from Sunday to Saturday beside the week before, Friday closed; the busiest, Monday, 5 jobs. No-shows: 1 of 23 due. Owed to you: QAR 13,400 by 2 customers. Booked ahead: 9 in the next 7 days.",
    },
  },
  agent: {
    path: "Home",
    switchLabel: "Sample business",
    status: "ALYR · Running",
    feedLabel: "What ALYR did this afternoon",
    flagged: "Flagged by rule",
    samples: {
      bakery: {
        tab: "Bakery",
        shop: "Qirfa Bakery",
        monogram: "QB",
        announce: "Showing Qirfa Bakery, a fictional bakery.",
        fictional: "Sample data, fictional bakery",
        feed: [
          { at: "16:00", title: "Booking reminder sent", line: "Cake tasting, today at 18:00\u00a0·\u00a0Noor A.", adds: ["sent", "booking_reminders"] },
          { at: "16:04", title: "Welcome menu sent", line: "To a new customer: “Welcome to Qirfa Bakery. How can we help?”", adds: ["sent"] },
          { at: "16:09", title: "Order confirmation sent", line: "Order #1441 from Lina F., with its tracking page", adds: ["sent"] },
          { at: "16:13", title: "Order page sent", line: "Sara M. wrote “order”. The link went back at once.", adds: ["sent"] },
          { at: "16:18", title: "Flagged by rule", flag: { from: "suggestion", key: "overdue" }, adds: [] },
        ],
      },
      salon: {
        tab: "Salon",
        shop: "Dafira Salon",
        monogram: "DS",
        announce: "Showing Dafira Salon, a fictional salon.",
        fictional: "Sample data, fictional salon",
        feed: [
          { at: "15:58", title: "Welcome menu sent", line: "To a new customer: “Welcome to Dafira Salon. How can we help?”", adds: ["sent"] },
          { at: "16:00", title: "Booking reminder sent", line: "Blow-dry, today at 18:00\u00a0·\u00a0Dana R.", adds: ["sent", "booking_reminders"] },
          { at: "16:01", title: "Flagged by rule", flag: { from: "needs", key: "unmarked" }, adds: [] },
          { at: "16:07", title: "Booking page sent", line: "Rania H. tapped “Book a visit”. The link went back at once.", adds: ["sent"] },
          { at: "16:16", title: "Flagged by rule", flag: { from: "suggestion", key: "repeat_no_show" }, adds: [] },
        ],
      },
      homeservices: {
        tab: "Home services",
        shop: "Zilal Cooling",
        monogram: "ZC",
        announce: "Showing Zilal Cooling, a fictional AC company.",
        fictional: "Sample data, fictional AC company",
        feed: [
          { at: "15:56", title: "Welcome menu sent", line: "To a new customer: “Welcome to Zilal Cooling. How can we help?”", adds: ["sent"] },
          { at: "16:00", title: "Booking reminder sent", line: "AC service, split unit, today at 18:00\u00a0·\u00a0Hassan D.", adds: ["sent", "booking_reminders"] },
          { at: "16:06", title: "Booking page sent", line: "Omar K. wrote “book”. The link went back at once.", adds: ["sent"] },
          { at: "16:12", title: "Booking details sent", line: "Ali T. wrote “my booking”: his visit, with a Cancel button.", adds: ["sent"] },
          { at: "16:17", title: "Flagged by rule", flag: { from: "suggestion", key: "overdue" }, adds: [] },
        ],
      },
    },
  },
  home: {
    hero: {
      eyebrow: "ALYR · At work for you",
      title: ["Your business", "just got an agent."],
      body:
        "In the WhatsApp chat, ALYR replies to routine messages, sends booking reminders and helps you follow up what’s owed. ALYR Agent puts what needs you on one screen, by rules you can check. We set it up in your shop. You run the business.",
      more: "See the products",
      facts: ["Set up for you, in your shop", "From QAR 449 a month, Agent included", "Arabic and English"],
      factsNoOffer: ["Set up for you, in your shop", "Every suggestion shows its rule", "Arabic and English"],
      figure: {
        label: "The ALYR Agent home screen of a fictional bakery, and what ALYR did for it this afternoon",
        caption: { n: "01", text: "ALYR Agent on a Thursday afternoon" },
      },
    },
    spotlight: {
      eyebrow: "ALYR Agent · Your business in numbers",
      title: "Every suggestion shows the rule behind it.",
      body:
        "ALYR Agent counts the orders, bookings, chats and credit accounts already in your workspace. It compares your week with the same days last week, puts the work that is waiting at the top, and suggests up to three things. Each names its rule and opens the screen where you act.",
      caption: { n: "02", text: "The whole home screen" },
      label: "The ALYR Agent home screen of the sample business you choose",
      calloutsLabel: "What each part shows",
      callouts: [
        "One sentence on your week, against the same days last week.",
        "Needs you now: work that is waiting, and for how long. It clears when the work is done.",
        "Four numbers, chosen by what you sell. A percentage only when both weeks have 20 or more.",
        "Up to three suggestions. Each ends with its rule, and opens the rows it counted.",
        "Done for you: what ALYR sent this week.",
      ],
      under: "The real screen, with fictional businesses. ALYR computed every number from each sample’s records.",
      link: "See ALYR Agent",
    },
    suite: {
      eyebrow: "The products",
      title: "One workspace.\nA product for each job.",
      body:
        "We set ALYR up in your shop. Our products take the orders and bookings and send the reminders in WhatsApp, and they share one workspace, one customer list and one team. ALYR Agent and ALYR Shelf come with every one. Choose the rest.",
      rows: {
        chat: {
          body: "Customers order from a page made for their phone, with no app and no account. Each order has its own tracking page, and your whole team answers from one inbox.",
          link: "See ALYR Chat",
        },
        bookings: {
          body: "Customers pick a time you are actually free. The confirmation goes out at once, and a reminder two hours before.",
          link: "See ALYR Bookings",
        },
        agent: {
          body: "What needs you now, your week against the same days last week, and up to three suggestions, each with its rule.",
          link: "See ALYR Agent",
        },
        accounts: {
          body: "Record credit sales in the chat, send polite reminders with a payment link, and see who promised to pay and when.",
          link: "See ALYR Accounts",
        },
        shelf: {
          body: "Everything you sell, with photos, sizes and stock. Each sale counts it down, and the order page says Sold out by itself.",
          link: "See ALYR Shelf",
        },
        docs: {
          body: "Receipts and invoices from your sales: numbered without a gap, Arabic first, and final once issued.",
          link: "See ALYR Docs",
        },
      },
      notes: [
        {
          title: "In every product: a name on everything.",
          body: "Every chat, order, booking and credit account has one person responsible. You see who answered, how fast, and what was sold or lost.",
        },
        {
          title: "Payment links",
          body: "come with ALYR Chat and ALYR Bookings. Today they open a test page; card payments start once a payment provider is connected.",
        },
      ],
      caption: { n: "03", text: "A corner of each product’s screen, at true size" },
      crops: {
        items: "3 items",
        total: "QAR 38",
        pay: "Pay QAR 38",
        times: ["4:00 pm", "4:30 pm", "5:00 pm", "5:30 pm", "6:00 pm", "6:30 pm"],
        time: "4:30 pm",
        owed: "Owed to you",
        shelf: [
          { name: "Pistachio kunafa cheesecake", price: "QAR 185", note: "Only 1 left today" },
          { name: "Saffron milk cake, slice", price: "QAR 26", note: "Sold out", out: true },
        ],
        receipt: "The top of receipt RC-0042, Arabic first",
      },
    },
    business: {
      eyebrow: "By business",
      title: "Start from how your customers reach you.",
      uses: "Uses",
      rows: [
        {
          name: "Restaurants and cafes",
          body: "Your menu in the chat, orders on your screen, and each customer told when it is ready. Office regulars can order on account.",
          products: ["chat", "accounts", "agent", "shelf"],
          note: "Table bookings are not in ALYR yet.",
        },
        {
          name: "Salons and barbers",
          body: "Customers book a service from the chat, get a reminder two hours before, and your team marks who came.",
          products: ["bookings", "agent"],
          note: "One booking at a time today: right for one chair. Several chairs at once is next.",
        },
        {
          name: "Home services",
          body: "Visits booked from the chat, parts ordered from a page, contract customers on account, and a receipt for each payment.",
          products: ["bookings", "chat", "accounts", "agent", "docs"],
          note: "One visit at a time per business today.",
        },
        {
          name: "Shops and wholesale",
          body: "Orders from your price list in the chat, stock counted on every sale, and trade customers on credit, with reminders that stay polite.",
          products: ["chat", "accounts", "agent", "shelf", "docs"],
        },
      ],
      other: "Run something else? Write to us about how you work today.",
    },
    how: {
      eyebrow: "How it works",
      title: "From the first visit to your first week in numbers.",
      steps: [
        {
          title: "We visit you.",
          body: "We come to your shop, see how orders and bookings reach you today, and show you ALYR on your own phone.",
        },
        {
          title: "We set it up.",
          body: "We load your items with their photos, or your services, and your prices, in Arabic and English. We set your hours, switch on the products you need, and give each person on your team a sign-in.",
        },
        {
          title: "You go live.",
          body: "We train your team at the counter. You share your chat link and QR codes, and orders and bookings start arriving in one place.",
        },
        {
          title: "You see what changed.",
          body: "ALYR Agent shows what needs you each day. A short report of your week on WhatsApp every Sunday starts once WhatsApp approves its wording. Want something changed? Message us and we change it.",
        },
      ],
      note: "We set ALYR up with each business ourselves, and agree your go-live date at the visit.",
      report: { caption: { n: "04", text: "The Sunday report on WhatsApp, for 4⁠–⁠10 Oct" } },
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
          "A person from ALYR answers your messages",
          "ALYR Agent, and the Sunday report once WhatsApp approves it",
          "Every product update, with nothing to install",
        ],
      },
    },
    price: {
      eyebrow: "Price",
      title: "What it costs, in QAR.",
      from: "From",
      amount: "449",
      currency: "QAR",
      currencyFirst: true,
      period: "a month",
      first: "for your first product. Add ALYR Chat, ALYR Bookings or ALYR Accounts for QAR 150 a month each. ALYR Agent and ALYR Shelf come with every one.",
      setup: "Setup from QAR 1,500, quoted at your visit.",
      includes:
        "Every month includes your products, ALYR Agent, ALYR Shelf and the Sunday report, sign-ins for your team, a person from ALYR when you message, and menu, price and hours changes when you ask. Your monthly price is confirmed in writing at the visit.",
      combosLabel: "For example",
      combos: [
        { label: "One product, for example ALYR Bookings", value: "from QAR 449" },
        { label: "ALYR Chat and ALYR Bookings", value: "from QAR 599" },
        { label: "Chat, Bookings and Accounts", value: "from QAR 749" },
        { label: "ALYR Agent and ALYR Shelf", value: "included" },
      ],
      ledgerLabel: "Fees, said plainly",
      ledger: [
        { label: "Commission on your orders", value: "None. ALYR takes no commission.", strong: true },
        { label: "WhatsApp message fees", value: "Billed to you by Meta, at Meta’s rates. We add nothing." },
        { label: "Term", value: "Month to month. Stop at the end of any month, with 7 days’ notice." },
      ],
      agreement: {
        caption: { n: "05", text: "The first month, as it goes into your agreement" },
        kicker: "Agreement · first month",
        parties: "ALYR and Qirfa Bakery",
        titleLead: "Your first month,",
        titleMark: "with your money back.",
        body:
          "Before we start, we agree one result with you, for example a number of orders or bookings taken through the chat in the 30 days after you go live. If we don’t reach it, we refund your first month’s subscription.",
        fields: [
          { label: "The result", value: "Agreed with you at the visit", blank: true },
          { label: "Counted", value: "In your workspace, where you see it too" },
          { label: "Period", value: "30 days from go-live" },
          { label: "Your part", value: "Put up your QR codes and share your chat link with customers in the first week." },
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
          body: "Automatic replies handle the routine, ALYR Agent only suggests and shows the rule for each suggestion, and anyone on your team can step into any chat.",
        },
      ],
      closing: "And if the first month misses the result we agreed, you get that month’s subscription back.",
      records: {
        label: "On record",
        items: { cr: "Commercial registration", provider: "Payment provider", meta: "Meta Tech Provider" },
      },
      figure: {
        caption: { n: "05", nOffer: "06", text: "The same tracking page in English and Arabic" },
        label: "The same customer page in English and in Arabic, side by side",
      },
    },
    faq: {
      eyebrow: "Questions",
      title: "Fair questions.",
      items: [
        {
          id: "which-product",
          q: "Which product do I need?",
          a: "Tell us how customers reach you. Orders in the chat: ALYR Chat. Appointments: ALYR Bookings. Customers who pay later: ALYR Accounts. Receipts and invoices: ALYR Docs. A bakery that sells cakes and books tastings uses Chat and Bookings. ALYR Agent and ALYR Shelf come with each.",
        },
        {
          id: "all-of-them",
          q: "Do I have to take all of them?",
          a: "No. Start with one, and add another when you need it, in the same workspace, with the same customers and team.",
        },
        {
          id: "suggestions",
          q: "Where do ALYR Agent’s suggestions come from?",
          a: "From fixed rules, written under each suggestion. It counts your own records, compares the week with the same days last week, and shows a percentage only when both weeks have 20 or more. It suggests; you decide.",
        },
        {
          id: "whatsapp-business",
          q: "I already use WhatsApp Business. It’s free.",
          a: "Your customers keep using WhatsApp. ALYR adds what the app doesn’t have: an order page, bookings, payment links and one inbox for your whole team, so orders stop ending up on paper. Which number they message, and what that means for the app on your phone, we go through with you at the visit.",
        },
        {
          id: "delivery-apps",
          q: "Delivery apps bring me customers.",
          a: "Keep them for new customers. ALYR is for the regulars who already message you. Their orders come to you direct, and ALYR takes no commission on them.",
        },
        {
          id: "chairs",
          q: "I have more than one chair or room.",
          a: "Today ALYR Bookings takes one booking at a time for the whole business. That suits one chair, one room or one practitioner. Several at once is the next step for Bookings. Tell us how many you run, and we’ll tell you honestly whether it fits yet.",
        },
        {
          id: "cost",
          offer: false,
          q: "What does it cost?",
          a: "Our prices go on this page soon. Until then, message us and we will take you through them.",
        },
        {
          id: "price",
          offer: true,
          q: "QAR 449 a month is a lot.",
          a: "It is a real cost, which is why your first month comes with a result we agree in advance. If we miss it, you get that month’s subscription back.",
        },
        {
          id: "more-products",
          offer: true,
          q: "What if I need more than one product?",
          a: "The first is from QAR 449 a month. ALYR Chat, ALYR Bookings and ALYR Accounts are QAR 150 a month each after that. ALYR Agent and ALYR Shelf come with all of them.",
        },
        {
          id: "staff",
          q: "My staff won’t use it.",
          a: "We train them at your counter. Each person gets their own sign-in, and the steps are ones they already know: an order goes new, confirmed, ready, done; a visit is marked came or no-show.",
        },
        {
          id: "busy-night",
          q: "What if something breaks on a busy night?",
          a: "Message us and the person who set you up picks it up. Behind the scenes, every message is saved before it is sent and tried again if WhatsApp is slow, so a slow moment doesn’t lose it.",
        },
        {
          id: "pay-online",
          q: "My customers won’t pay online.",
          a: "They don’t have to. Card payment links aren’t live yet, and when they are, a link is offered, never forced. Regulars with a credit account can put an order on their account.",
        },
        {
          id: "not-technical",
          q: "I’m not technical.",
          a: "You don’t need to be. We set it up, train your team and change things when you ask.",
        },
        {
          id: "data",
          q: "Is my data safe?",
          a: "Each business’s records are kept apart inside the database itself, and ALYR uses WhatsApp’s official Business Platform. ALYR is built never to hold your money.",
        },
        {
          id: "message-fees",
          q: "What do WhatsApp messages cost?",
          a: "Meta charges for some WhatsApp messages, at its own rates, and decides which ones. Meta bills you directly, and ALYR adds nothing. We go through the current rates with you at the visit.",
        },
        {
          id: "contract",
          q: "Am I tied in?",
          a: "No. There is a written agreement, but it runs month to month. You can stop at the end of any month, with 7 days’ notice.",
        },
        {
          id: "whatsapp-line",
          q: "Can I message you on WhatsApp?",
          a: "Our WhatsApp line opens soon. Until then, email us and a person from ALYR replies.",
          state: "email",
        },
      ],
    },
    final: {
      title: "We’ll show you ALYR on your own phone.",
      body: "Send us a message. A person from ALYR replies, then comes to your shop.",
    },
    sample: {
      shop: "Qirfa Bakery",
      monogram: "QB",
      track: {
        context: "Order tracking",
        eyebrow: "Your order",
        title: "Order #1439",
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
    },
  },
  product: {
    bar: {
      label: "ALYR Chat",
      links: [
        { id: "how", label: "How it works" },
        { id: "inside", label: "What’s in it" },
        { id: "works", label: "Works with" },
      ],
    },
    eyebrow: "ALYR Chat · Set up for you",
    title: "Orders in the chat.\nOne inbox for the team.",
    body:
      "Your customers keep messaging you the way they already do. ALYR Chat adds the order page, the payment link and the updates, and your team sees it all in one place.",
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
        id: "order",
        tab: "Order",
        start: 9 * 60 + 58,
        chat: [
          { from: "customer", text: "I need two AC filters and a thermostat." },
          { from: "business", text: "Here is our order page. Pick what you need.", action: "Open the order page" },
          { from: "business", text: "Order #1042 received: 3 items, QAR 385." },
        ],
        panel: {
          title: "Order #1042",
          badge: "New",
          rows: [
            { lead: "2 ×", main: "AC filter", trail: "QAR 120", tone: "signal" },
            { lead: "1 ×", main: "Digital thermostat", trail: "QAR 265", tone: "signal" },
          ],
          total: ["Total", "QAR 385"],
        },
        caption: "The customer orders from a page made for their phone. Your team sees it the moment it lands.",
      },
      {
        id: "pay",
        tab: "Pay",
        start: 10 * 60 + 6,
        chat: [
          { from: "business", text: "Order #1042 is confirmed. You can pay here.", action: "Pay QAR 385" },
          { from: "business", text: "Received QAR 385 for order #1042. Thank you." },
        ],
        panel: {
          title: "Payments",
          badge: "Today",
          rows: [
            { main: "Order #1042", sub: "Mariam Saleh", trail: "QAR 385 · Paid", tone: "signal" },
            { main: "Order #1039", sub: "Khalid Nasser", trail: "QAR 210 · Paid", tone: "done" },
          ],
        },
        caption: "Payment links are built and tested on a test page. ALYR is built never to hold your money.",
      },
      {
        id: "track",
        tab: "Track",
        start: 10 * 60 + 5,
        chat: [
          { from: "business", text: "Order #1042 is confirmed." },
          { from: "business", text: "Order #1042 is ready for collection." },
          { from: "customer", text: "On my way." },
        ],
        panel: {
          title: "Order #1042",
          badge: "Ready",
          rows: [
            { lead: "10:02", main: "Received", tone: "done" },
            { lead: "10:05", main: "Confirmed", tone: "done" },
            { lead: "11:40", main: "Ready for collection", trail: "Customer told", tone: "signal" },
            { lead: "", main: "Collected", tone: "quiet" },
          ],
        },
        caption: "Each change of status messages the customer, so nobody has to ask.",
      },
      {
        id: "inbox",
        tab: "Team inbox",
        start: 17 * 60 + 20,
        chat: [
          { from: "customer", text: "Is the thermostat covered by a warranty?" },
          { from: "staff", text: "Yes, 12 months. I will bring the receipt with me tomorrow." },
        ],
        panel: {
          title: "Inbox",
          badge: "3 open",
          rows: [
            { main: "Mariam Saleh", sub: "Is the thermostat covered by a warranty?", trail: "Yusuf", tone: "signal" },
            { main: "Khalid Nasser", sub: "Is the generator part in?", trail: "Unassigned", tone: "quiet" },
            { main: "Staff note", sub: "Mariam prefers calls after 5 PM.", trail: "Team only", tone: "done" },
          ],
        },
        caption: "One number, the whole team. When a person answers, the automatic replies step back.",
      },
    ],
    facts: [
      {
        title: "Your number, agreed at setup",
        body: "Which number your customers message is agreed with you at setup. We go through Meta's requirements with you first.",
      },
      {
        title: "Built never to hold your money",
        body: "Payment links are built and tested on a test page. Real payments will go through your own account with a Qatari payment provider; that connection is not live yet.",
      },
      {
        title: "No message without consent",
        body: "A customer who says stop is not messaged again. Every consent is recorded.",
      },
    ],
    flow: {
      eyebrow: "How it works",
      title: "What happens when a customer orders.",
      body:
        "Your customer sees an ordinary chat. Behind it, ALYR sends the order page, keeps the record and tells the customer at every step. Follow one order through.",
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
          id: "order",
          tab: "A customer orders",
          steps: [
            {
              move: "in",
              title: "A customer writes to your number",
              body: "Mariam messages you on WhatsApp. The message reaches ALYR through WhatsApp's official Business Platform.",
              chat: { from: "customer", text: "Hi, I'd like to order for pickup" },
              work: ["Message received", "Customer found: Mariam Saleh"],
            },
            {
              title: "An order word, so ALYR answers",
              body: "“Order” is one of the words ALYR answers by itself, in English and Arabic. Anything else goes to your team.",
              work: ["Request: order"],
            },
            {
              move: "out",
              title: "The order page comes back straight away",
              body: "The reply goes back the same way, in her language, with the link to your order page.",
              chat: { from: "business", text: "Here is our order page. Pick what you need.", action: "Open the order page" },
              work: ["Reply sent"],
            },
            {
              move: "in",
              title: "She orders on the page",
              body: "Your products and prices, on a page that opens from the chat. No app, no account.",
              chat: { from: "event", text: "Ordered 3 items, QAR 385" },
              work: ["Order #1042 saved"],
            },
            {
              move: "team",
              title: "Your team sees the order",
              body: "It is on your Orders screen the moment it lands. Nobody copied anything out of a chat.",
              record: { id: "order", lead: "#1042", main: "Mariam Saleh · 3 items", sub: "QAR 385", trail: "New", tone: "signal" },
              work: ["Order #1042: new, unassigned"],
            },
            {
              move: "out",
              title: "She gets the confirmation",
              body: "With the total, a payment link and her own tracking page.",
              chat: { from: "business", text: "Order #1042 received: 3 items, QAR 385." },
              work: ["Confirmation sent", "Tracking page made"],
            },
          ],
        },
        {
          id: "moves",
          tab: "The order moves",
          steps: [
            {
              move: "back",
              title: "Yusuf presses Confirm",
              body: "On the Orders screen, one press. The order becomes his, so the team can see who has it.",
              record: { id: "order", lead: "#1042", main: "Mariam Saleh · 3 items", sub: "Yusuf", trail: "Confirmed", tone: "signal" },
              work: ["Order #1042: confirmed by Yusuf"],
            },
            {
              move: "out",
              title: "The customer hears at once",
              body: "Each change of status goes to her as a message, in her language.",
              chat: { from: "business", text: "Order #1042 is confirmed." },
              work: ["Message sent"],
            },
            {
              move: "back",
              title: "Ready, with one more press",
              body: "Yusuf marks it ready when it is packed.",
              record: { id: "order", lead: "#1042", main: "Mariam Saleh · 3 items", sub: "Yusuf", trail: "Ready", tone: "signal" },
              work: ["Order #1042: ready"],
            },
            {
              move: "out",
              title: "Her tracking page updates by itself",
              body: "Order received, confirmed by the shop, ready for collection: every step with its time, and who is looking after it.",
              chat: { from: "business", text: "Order #1042 is ready for collection." },
              work: ["Tracking page: ready for collection"],
            },
            {
              move: "back",
              title: "Done when she collects it",
              body: "Marked done, the order closes, and the customer gets one last message.",
              record: { id: "order", lead: "#1042", main: "Mariam Saleh · 3 items", sub: "Yusuf", trail: "Done", tone: "done" },
              work: ["Order #1042: done"],
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
              record: { id: "chat", main: "Mariam Saleh", sub: "Is the thermostat covered by a warranty?", trail: "Unassigned", tone: "quiet" },
              work: ["Saved to the shared inbox"],
            },
            {
              move: "back",
              title: "Yusuf answers from his screen",
              body: "He types the reply in the workspace. The chat becomes his, so the team can see who is handling it.",
              record: { id: "chat", main: "Mariam Saleh", sub: "Is the thermostat covered by a warranty?", trail: "Yusuf", tone: "signal" },
              work: ["Chat taken by Yusuf"],
            },
            {
              title: "The automatic replies step back",
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
      eyebrow: "What’s in it",
      title: "Everything it does today.",
      note: "We set ALYR Chat up with you at your shop. Everything listed here is built. We agree your number with you when we set you up.",
      groups: [
        {
          name: "For your customers",
          items: [
            { title: "An order page for their phone", body: "Your products and prices on a page that opens from the chat. No app, no account." },
            { title: "Pay from a link", body: "A payment link in the chat, and a message confirming payment the moment it is paid. Built and tested on a test page; card payments are not live yet." },
            { title: "Order tracking", body: "Each order has its own page showing every step and who is looking after it." },
            { title: "Updates without asking", body: "Confirmed, ready, done: each change of status reaches them as a message." },
            { title: "Arabic or English", body: "ALYR answers in the language the customer writes in." },
          ],
        },
        {
          name: "For your team",
          items: [
            { title: "One shared inbox", body: "Every chat on your number in one place. Anyone can take a chat, and the team sees who has it." },
            { title: "Step in at any moment", body: "When a person replies, the automatic replies go quiet for that customer until the chat is closed." },
            { title: "Notes and saved replies", body: "Notes only the team can see, and ready answers for the questions you get every day." },
            { title: "A name on every order", body: "Every chat and order has one person responsible, and the record of who did what cannot be edited." },
          ],
        },
        {
          name: "Behind the scenes",
          items: [
            { title: "WhatsApp's rules, handled", body: "Ordinary replies for 24 hours after a customer writes, approved wording after that. ALYR picks the right one each time." },
            { title: "Stop means stop", body: "A customer who says stop is not messaged again, and every consent is on record." },
            { title: "Nothing lost", body: "Each message is saved before it is sent, and tried again if WhatsApp is slow. A failure is shown, never hidden." },
            { title: "Your records, kept apart", body: "Each business is separated inside the database itself, not by a setting someone can forget." },
            { title: "Delivered and read", body: "ALYR records when each message is delivered and when it is read." },
          ],
        },
      ],
    },
    why: {
      eyebrow: "Why it helps",
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
          body: "We set it up for you. Your customers need no new app.",
        },
        {
          title: "Trusted",
          body: "A person from ALYR to talk to, a product in Arabic and English, and WhatsApp's official Business Platform.",
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
          name: "Salons and barbers",
          body: "Bookings and reminders have their own product now.",
          tags: [],
          link: { key: "bookings", label: "See ALYR Bookings" },
        },
        {
          name: "Home and field services",
          body: "Parts and supplies ordered from a page, and an update at every step.",
          tags: ["Order", "Track"],
        },
        {
          name: "Shops and trading",
          body: "Orders and payment links. Add ALYR Accounts for customers on credit.",
          tags: ["Order", "Pay"],
          link: { key: "accounts", label: "See ALYR Accounts" },
        },
      ],
      other: "Run something else? Write to us about how you work today.",
    },
    works: {
      eyebrow: "The products",
      title: "Works with the rest of ALYR.",
      link: "See {name}",
      rows: {
        bookings: "Appointments from the same chat, with reminders.",
        agent: "Comes with ALYR Chat: sales against the same days last week, orders waiting.",
        accounts: "Let regulars put an order on their account.",
        shelf: "Your order page shows your shelf: photos, sizes, and what has sold out.",
        docs: "A numbered receipt for each paid order, in the chat.",
      },
    },
    cta: {
      title: "Tell us how orders reach you today.",
      body: "Send us a message. A person from ALYR replies, then comes to show you ALYR Chat on your own phone.",
    },
  },
  pages: {
    // --------------------------------------------------------------- /bookings
    bookings: {
      bar: {
        label: "ALYR Bookings",
        links: [
          { id: "how", label: "How it works" },
          { id: "inside", label: "What’s in it" },
          { id: "works", label: "Works with" },
        ],
      },
      hero: {
        eyebrow: "ALYR Bookings · Set up for you",
        title: ["Customers book in the chat.", "ALYR reminds them before they come."],
        lead:
          "Your customers pick a service and a free time from a page that opens in the chat, with no app. The confirmation goes at once, a reminder two hours before, and your team marks who came.",
        facts: ["Free times from your opening hours", "A reminder 2 hours before", "One booking at a time, for one chair or one\u00a0room"],
        factsOffer: ["From QAR 449 a month, or QAR 150 beside ALYR Chat or ALYR Accounts"],
      },
      demo: {
        business: "Dafira Salon",
        businessMeta: "Business account",
        today: "Today",
        typeHere: "Message",
        workspace: "Workspace",
        note: "Sample conversation with a fictional salon.",
        tabsLabel: "What ALYR Bookings does",
        pause: "Pause the demo",
        play: "Play the demo",
        demos: [
          {
            id: "book",
            tab: "Book",
            start: 16 * 60 + 40,
            chat: [
              { from: "customer", text: "Hi, can I book a haircut and blow-dry for Saturday?" },
              { from: "business", text: "Pick a service and a time that suits you: alyr.qa/b/dafira" },
            ],
            panel: {
              kicker: "Her phone",
              title: "Booking page",
              badge: "Sat 17 Oct",
              rows: [],
              page: {
                shop: "Dafira Salon",
                monogram: "DS",
                context: "Booking",
                eyebrow: "Book from your chat",
                title: "Book a visit",
                as: "Booking as",
                customer: "Rania H.",
                steps: ["Choose a service", "Choose a day", "Choose a time"],
                services: [
                  { name: "Haircut and blow-dry", meta: "60 min · QAR 180", on: true },
                  { name: "Blow-dry", meta: "45 min · QAR 120" },
                ],
                days: [
                  { top: "Today", day: "15", month: "Oct" },
                  { top: "Fri", day: "16", month: "Oct" },
                  { top: "Sat", day: "17", month: "Oct", on: true },
                  { top: "Sun", day: "18", month: "Oct" },
                  { top: "Mon", day: "19", month: "Oct" },
                ],
                times: ["12:30 pm", "1:00 pm", "4:00 pm", "5:30 pm", "7:30 pm", "8:30 pm"],
                time: "7:30 pm",
                summary: ["Haircut and blow-dry", "Sat 17 Oct · 7:30 pm"],
                confirm: "Confirm booking",
              },
            },
            caption: "Free times come from your opening hours. Two customers can never take the same slot.",
          },
          {
            id: "confirm",
            tab: "Confirm",
            start: 16 * 60 + 43,
            chat: [
              { from: "business", text: "Booking 412 confirmed at Dafira Salon: Haircut and blow-dry, Sat 17 Oct, 7:30 PM. To cancel, send “my booking”." },
            ],
            panel: {
              title: "Bookings",
              badge: "Sat 17 Oct",
              rows: [
                { lead: "10:00 AM", main: "Haircut and blow-dry", sub: "Mona E. · Hiba", trail: "Booked", tone: "done" },
                { lead: "11:30 AM", main: "Manicure and pedicure", sub: "Farah B. · Sana", trail: "Booked", tone: "done" },
                { lead: "7:30 PM", main: "Haircut and blow-dry", sub: "Rania H. · Hiba", trail: "Booked", tone: "signal" },
              ],
            },
            caption: "The confirmation goes the moment they book, in the language they write in.",
          },
          {
            id: "remind",
            tab: "Remind",
            start: 17 * 60 + 30,
            chat: [
              { from: "business", text: "Reminder: booking 412 at Dafira Salon, Sat 17 Oct, 7:30 PM." },
            ],
            panel: {
              title: "Booking 412",
              badge: "Sat 17 Oct",
              rows: [
                { lead: "7:30 PM", main: "Haircut and blow-dry", sub: "Rania H. · Hiba", trail: "Booked", tone: "done" },
                { lead: "5:30 PM", main: "Reminder sent", sub: "Two hours before", trail: "Delivered", tone: "signal" },
              ],
            },
            caption: "Two hours before, by itself. A cancelled booking is never reminded.",
          },
          {
            id: "cancel",
            tab: "Cancel",
            start: 16 * 60 + 50,
            chat: [
              { from: "customer", text: "my booking" },
              { from: "business", text: "Booking 412: Haircut and blow-dry, Sat 17 Oct, 7:30 PM.", action: "Cancel booking" },
              { from: "customer", text: "Cancel booking" },
              { from: "business", text: "Your booking has been cancelled." },
            ],
            panel: {
              title: "Bookings",
              badge: "Sat 17 Oct",
              rows: [
                { lead: "7:30 PM", main: "Haircut and blow-dry", sub: "Rania H.", trail: "Cancelled", tone: "quiet" },
                { lead: "7:30 PM", main: "Free again", sub: "Open to other customers", trail: "Open", tone: "signal" },
              ],
            },
            caption: "“my booking” shows the next one, with a button to cancel. The time is free again for others.",
          },
          {
            id: "came",
            tab: "Came",
            start: 16 * 60 + 20,
            chat: [],
            panel: {
              title: "Bookings",
              badge: "Today",
              rows: [
                { lead: "11:00 AM", main: "Haircut and blow-dry", sub: "Lina F. · Hiba", trail: "Came", tone: "done" },
                { lead: "3:00 PM", main: "Hair treatment", sub: "Maha S. · Sana · over at 4:00 PM", acts: ["Came", "No-show"], tone: "signal" },
                { lead: "6:00 PM", main: "Blow-dry", sub: "Dana R. · Hiba", trail: "Booked", tone: "quiet" },
              ],
            },
            caption: "Your team marks Came or No-show. That is what the no-show figures count.",
          },
        ],
      },
      flow: {
        eyebrow: "How it works",
        title: "What happens when a customer books.",
        body:
          "Your customer sees an ordinary chat. Behind it, ALYR reads your hours, locks the time and sets the reminder. Follow one booking through.",
        tabsLabel: "Examples",
        stepsLabel: "Steps",
        pause: "Pause",
        play: "Play",
        note: "Sample conversation with a fictional salon.",
        customer: { name: "Your customer", sub: "On WhatsApp, as always" },
        whatsapp: { name: "WhatsApp", sub: "Business Platform" },
        alyr: { name: "ALYR Bookings", sub: "Working in the background", idle: "Waiting for the next message" },
        team: { name: "Your team", sub: "The workspace", idle: "Nothing new yet" },
        stories: [
          {
            id: "book",
            tab: "A customer books",
            steps: [
              {
                move: "in",
                title: "A customer writes to your number",
                body: "Rania writes on WhatsApp. The message reaches ALYR through WhatsApp's official Business Platform.",
                chat: { from: "customer", text: "Hi, can I book a haircut and blow-dry for Saturday?" },
                work: ["Message received", "Customer found: Rania H."],
              },
              {
                title: "A booking word, so ALYR answers",
                body: "“Book” is one of the words ALYR answers by itself, in English and Arabic. Anything else goes to your team.",
                work: ["Request: booking"],
              },
              {
                move: "out",
                title: "The link comes back straight away",
                body: "Her message is in English, so the reply is too.",
                chat: { from: "business", text: "Pick a service and a time that suits you: alyr.qa/b/dafira" },
                work: ["Reply sent"],
              },
              {
                move: "in",
                title: "She picks a time",
                body: "The page shows only times free in your opening hours. When she confirms, ALYR checks the time again and locks it.",
                chat: { from: "event", text: "Picked Sat 17 Oct, 7:30 PM" },
                work: ["Time checked again and locked"],
              },
              {
                move: "team",
                title: "Your team sees the booking, with who looks after it",
                body: "It is on your Bookings screen the moment it is made, with one person responsible.",
                record: { id: "booking", lead: "7:30 PM", main: "Haircut and blow-dry", sub: "Rania H. · Hiba", trail: "Booked", tone: "signal" },
                work: ["Booking 412 saved"],
              },
              {
                move: "out",
                title: "Confirmation now, reminder later",
                body: "ALYR confirms the booking at once and sets a reminder for two hours before. Your team typed nothing.",
                chat: { from: "business", text: "Booking 412 confirmed at Dafira Salon: Haircut and blow-dry, Sat 17 Oct, 7:30 PM." },
                work: ["Confirmation sent", "Reminder set for 5:30 PM"],
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
                work: ["Reminder due: booking 412"],
              },
              {
                title: "It checks the booking still stands",
                body: "A booking that was cancelled or moved is skipped, so nobody is reminded of a visit that is not happening.",
                work: ["Booking 412: still booked"],
              },
              {
                title: "It checks WhatsApp's rules",
                body: "Rania last wrote more than 24 hours ago. WhatsApp then allows only wording it has approved in advance, so ALYR uses that. Had she asked you to stop, nothing would go out.",
                work: ["Consent: on record", "Last message: over 24 hours ago", "Approved wording chosen"],
              },
              {
                move: "out",
                title: "The reminder arrives",
                body: "It reaches her phone from your number, in the language she uses with you.",
                chat: { from: "business", text: "Reminder: booking 412 at Dafira Salon, Sat 17 Oct, 7:30 PM." },
                work: ["Reminder sent"],
              },
              {
                move: "team",
                title: "Your team knows it was read",
                body: "WhatsApp reports back when a message is delivered and when it is read. ALYR keeps both on record.",
                record: { id: "reminder", lead: "5:30 PM", main: "Reminder, booking 412", sub: "Rania H.", trail: "Read", tone: "signal" },
                work: ["Delivered", "Read"],
              },
            ],
          },
          {
            id: "marked",
            tab: "The team marks the visit",
            steps: [
              {
                title: "The visit ends",
                body: "At 8:30 PM the haircut and blow-dry is over. Until someone marks it, it stays “Booked”.",
                work: ["Booking 412: over, not marked"],
              },
              {
                move: "team",
                title: "ALYR Agent lists it",
                body: "Under Needs you now: “1 visit not marked. Until it is marked, the no-show figures are short.”",
                record: { id: "visit", lead: "7:30 PM", main: "Haircut and blow-dry", sub: "Rania H. · Hiba", trail: "Not marked", tone: "quiet" },
                work: ["RULE · booked and already over · 1 visit"],
              },
              {
                move: "back",
                title: "One tap: Came",
                body: "Hiba presses Came on the Bookings screen.",
                record: { id: "visit", lead: "7:30 PM", main: "Haircut and blow-dry", sub: "Rania H. · Hiba", trail: "Came", tone: "signal" },
                work: ["Marked: came"],
              },
              {
                title: "The figures stay true",
                body: "No-shows over 30 days, and customers who missed twice and booked again, are counted from these marks.",
                work: ["No-show figures updated", "Needs you now: cleared"],
              },
            ],
          },
        ],
      },
      screen: {
        eyebrow: "The screen",
        title: "Today and the next seven days, on one screen.",
        caption: { n: "02", text: "The Bookings screen" },
        label: "The Bookings screen of a fictional salon’s workspace",
        callouts: [
          "Every visit booked from the chat, in time order.",
          "Who looks after each visit.",
          "Came, No-show or Cancel, one tap each.",
          "Opened from ALYR Agent, it shows only the visits a rule counted.",
        ],
        sheet: {
          path: "Bookings",
          sub: "Today and the next seven days, booked from the chat",
          heads: { when: "When", service: "Service", customer: "Customer", by: "Handled by", status: "Status" },
          acts: { came: "Came", noShow: "No-show", cancel: "Cancel" },
          rows: [
            { when: "Thu 15 Oct, 3:00 PM", ref: "#398", service: "Hair treatment", customer: "Maha S.", by: "Sana Rao", status: "Booked", ended: true },
            { when: "Thu 15 Oct, 6:00 PM", ref: "#401", service: "Blow-dry", customer: "Dana R.", by: "Hiba Taher", status: "Booked" },
            { when: "Fri 16 Oct, 2:00 PM", ref: "#403", service: "Haircut and blow-dry", customer: "Noor A.", by: "Hiba Taher", status: "Booked" },
            { when: "Fri 16 Oct, 5:00 PM", ref: "#405", service: "Hair colour", customer: "Sara M.", by: "Sana Rao", status: "Booked" },
            { when: "Sat 17 Oct, 10:00 AM", ref: "#407", service: "Haircut and blow-dry", customer: "Mona E.", by: "Hiba Taher", status: "Booked" },
            { when: "Sat 17 Oct, 11:30 AM", ref: "#408", service: "Manicure and pedicure", customer: "Farah B.", by: "Sana Rao", status: "Booked" },
          ],
          filtered: {
            label: "Visits not marked yet",
            show: "Show all",
            caption: "Opened from ALYR Agent: only the visit its rule counted.",
          },
        },
      },
      inside: {
        eyebrow: "What’s in it",
        title: "Everything it does today.",
        groups: [
          {
            name: "For your customers",
            items: [
              "A booking page from the chat: service, day, time. No app, no account.",
              "Only times that are really free, from your hours and the bookings you have.",
              "A note for you, if they want to add one.",
              "The confirmation at once, in their language.",
              "A reminder two hours before.",
              "“my booking” to see or cancel the next one.",
            ],
          },
          {
            name: "For your team",
            items: [
              "Today and the next seven days, with who looks after each visit.",
              "Came or No-show in one tap.",
              "The chat that led to each booking, in the team inbox.",
              "In ALYR Agent: visits not marked, the no-show rate over 30 days, repeat no-shows booked again, quiet days ahead, customers due back.",
            ],
          },
          {
            name: "Behind the scenes",
            items: [
              "Two customers can never take the same slot: the time is checked again and locked.",
              "A cancelled booking is never reminded.",
              "WhatsApp's rules, handled: ordinary messages for 24 hours after a customer writes, approved wording after that.",
              "Stop means stop.",
            ],
          },
        ],
        notYet: {
          title: "Not yet",
          items: [
            "Several bookings at the same time, by staff, chair or room. Next for ALYR Bookings.",
            "Moving a booking, or adding a walk-in, from the screen.",
            "Changing services and opening hours yourself. ALYR changes them when you ask.",
            "Taking a deposit or a payment when the customer books.",
            "Choosing when the reminder goes.",
            "Messages to bring back customers who are due. They need marketing consent first.",
          ],
        },
        note: "We set ALYR Bookings up with you at your shop. Everything listed above the line is built.",
      },
      who: {
        eyebrow: "Who it’s for",
        title: "For businesses that serve one customer at a time.",
        rows: [
          { name: "Barbers and salons with one chair", tags: ["Book", "Remind", "Came"] },
          { name: "Home services with one team", tags: ["Visits", "Remind"] },
          { name: "Tutors, trainers and consultants", tags: ["Book", "Remind"] },
        ],
        other: "Several chairs or rooms? Tell us how many, and we’ll say honestly whether it fits yet.",
      },
      works: {
        eyebrow: "The products",
        title: "Works with the rest of ALYR.",
        link: "See {name}",
        rows: {
          chat: "Take orders too: a bakery books cake tastings and sells the cake.",
          agent: "Comes with ALYR Bookings: visits not marked, no-shows over 30 days, customers due back.",
          accounts: "Let regular clients pay later, and remind them politely.",
          shelf: "Sell products beside your services. Customers order them through ALYR Chat.",
          docs: "A receipt for a visit paid at the counter, or a deposit receipt for part.",
        },
      },
      faq: {
        eyebrow: "Questions",
        title: "Before you ask.",
        items: [
          {
            id: "own",
            q: "Can I use it on its own?",
            a: "Yes. ALYR Bookings works without ALYR Chat. It comes with the team inbox, because your customers write to you there, and with ALYR Agent.",
          },
          {
            id: "setup",
            q: "How long does setup take?",
            a: "We agree your go-live date at the visit. We load your services, prices and opening hours ourselves.",
          },
          {
            id: "move",
            q: "How do I move from my book or my phone?",
            a: "At the visit we agree the day you switch, and how the bookings you already have for the days after it come across.",
          },
          {
            id: "chairs",
            q: "I have more than one chair or room.",
            a: "Today ALYR Bookings takes one booking at a time for the whole business. That suits one chair, one room or one practitioner. Several at once is the next step for Bookings. Tell us how many you run, and we’ll tell you honestly whether it fits yet.",
          },
          {
            id: "no-show",
            q: "What if a customer doesn’t come?",
            a: "Your team marks No-show. ALYR Agent shows your no-show rate over 30 days, and flags a customer who missed twice and has booked again.",
          },
        ],
      },
      cta: {
        title: "Tell us how bookings reach you today.",
        body: "Send us a message. A person from ALYR replies, then comes to show you ALYR Bookings on your own phone.",
      },
    },

    // ------------------------------------------------------------------ /agent
    agent: {
      bar: {
        label: "ALYR Agent",
        links: [
          { id: "how", label: "How it works" },
          { id: "rules", label: "The rules" },
          { id: "inside", label: "What’s in it" },
          { id: "works", label: "Works with" },
        ],
      },
      hero: {
        eyebrow: "ALYR Agent · With every product",
        title: ["Your business in numbers.", "What needs you, first."],
        lead:
          "ALYR Agent is the home screen of your workspace. It says in one sentence how the week is going, lists what needs you now, and suggests up to three things, each with the rule behind it.",
        facts: ["With every ALYR product", "Every suggestion shows its rule", "Counted from your own records"],
      },
      figure: {
        label: "The ALYR Agent home screen of the sample business you choose, and what ALYR did for it this afternoon",
        caption: { n: "01", text: "ALYR Agent on a Thursday afternoon" },
      },
      how: {
        eyebrow: "How it works",
        title: "Your records, a rule, a card, the screen.",
        steps: [
          { title: "Your records", body: "The orders, bookings, chats and credit accounts your team already keeps in ALYR." },
          { title: "A rule", body: "Fixed rules, each with a minimum, so a small number never raises an alarm." },
          { title: "A card", body: "When a rule is true, a card says what it found, with the rule written underneath." },
          { title: "The screen to act on", body: "Its button opens the screen with exactly the rows it counted. When the work is done, the card closes." },
        ],
        card: "One suggestion, as the screen shows it",
        under: "The button opens your credit accounts with those three customers. Nothing is sent until you press Send reminders there.",
        caption: { n: "02", text: "One suggestion, opened" },
      },
      report: {
        eyebrow: "The Sunday report",
        title: "The same week, on your WhatsApp, every Sunday.",
        body:
          "At 9:00 on Sunday, a card with last week’s main number against the week before, each day beside the same day the week before, and two or three facts for your kind of business. Under it, a line for each product, what ALYR did for you, and one next step with its rule. The first reports go out once WhatsApp approves the report’s wording.",
        report: { caption: { n: "03", text: "The Sunday report on WhatsApp, for 4⁠–⁠10 Oct" } },
      },
      rules: {
        eyebrow: "The rules",
        title: "It counts. It compares. It shows the rule.",
        body: "No guesses and no scores. Six of the rules, as they appear on your screen.",
        heads: ["What it looks for", "The rule, as the screen shows it"],
        rows: [
          { name: "Customers waiting", rule: "RULE · the customer wrote last and has had no answer for 10 minutes" },
          { name: "Orders not confirmed", rule: "RULE · new for over 15 minutes" },
          { name: "Overdue, not reminded", rule: "RULE · owed 30+ days, no promise, no reminder in 7 days" },
          { name: "Missed twice, booked again", rule: "RULE · 2+ no-shows in 90 days, booked in the next 7" },
          {
            name: "Regulars gone quiet",
            rule: "RULE · 3+ orders or visits 31 to 120 days ago, none in the last 30",
            note: "Information only: writing to them needs their marketing consent, which ALYR does not collect yet.",
          },
          { name: "No-show rate", rule: "RULE · no-shows ÷ (came + no-shows) over 30 days; 10% or more, with 3 or more" },
        ],
        notes: [
          "Same days, never yesterday: the week so far is compared with the same days and hours last week.",
          "Small numbers stay counts: a percentage only when both weeks have 20 or more; below that, “7 · last week 4”.",
        ],
      },
      inside: {
        eyebrow: "What’s in it",
        title: "Everything it does today.",
        groups: [
          {
            name: "Every day, on your screen",
            items: [
              "One sentence on the week, against the same days last week.",
              "Needs you now: customers waiting, orders not confirmed, visits not marked. They clear when the work is done.",
              "Four numbers, chosen by what you sell.",
              "Up to three suggestions by rule, each opening the rows it counted.",
              "“Not now” sets a suggestion aside until its numbers change, or until Sunday.",
              "Done for you this week: messages ALYR sent and booking reminders.",
              "The week day by day with last week behind it, busiest hours over 28 days, top items or services, money owed by age, and the team by name.",
            ],
          },
          {
            name: "For your team",
            items: ["On this screen, staff see the work in front of them and their own numbers, not the shop’s money."],
          },
          {
            name: "Every week, everywhere",
            items: ["The Sunday report for WhatsApp. The first go out once WhatsApp approves its wording.", "Arabic and English, light and dark, phone and laptop."],
          },
        ],
        notYet: {
          title: "Not yet",
          items: [
            "A screen for the Sunday report, and choosing its day and time.",
            "Messages to quiet regulars from a suggestion. They need marketing consent first.",
            "Tapping a number to open its week on a phone.",
            "A count of chats answered after hours.",
            "Cash at the counter. Sales count orders, not cash collected.",
          ],
        },
        note: "ALYR Agent comes with every ALYR product. Everything listed above the line is built.",
      },
      who: {
        eyebrow: "Who it’s for",
        title: "Every ALYR business has it.\nWhat leads depends on yours.",
        rows: [
          { name: "Restaurants, cafes and bakeries", tags: ["Sales this week", "Orders this week", "Owed to you", "Came back this week"] },
          { name: "Salons and barbers", tags: ["Visits this week", "Booked, next 7 days", "No-shows, 30 days", "New bookings this week"] },
          { name: "Home services", tags: ["Jobs this week", "Booked, next 7 days", "Owed to you", "No-shows, 30 days"] },
          { name: "Shops and wholesale", tags: ["Owed to you", "Collected this week", "Over 60 days", "Promised to pay"] },
        ],
        other: "Run something else? Write to us about how you work today.",
      },
      works: {
        eyebrow: "The products",
        title: "Works with the rest of ALYR.",
        link: "See {name}",
        rows: {
          chat: "Sales against the same days last week, orders waiting, top items.",
          bookings: "Visits, no-shows over 30 days, customers due back.",
          accounts: "Money owed by age, overdue and not reminded, promises passed.",
          shelf: "Sold out now and low stock.",
          docs: "Unpaid invoices and documents not delivered.",
        },
      },
      faq: {
        eyebrow: "Questions",
        title: "Before you ask.",
        items: [
          { id: "pay", offer: false, q: "Do I pay for ALYR Agent?", a: "It comes with every ALYR product." },
          { id: "pay-offer", offer: true, q: "Do I pay for ALYR Agent?", a: "No. It is included with every ALYR product." },
          {
            id: "suggestions",
            q: "Where do the suggestions come from?",
            a: "From fixed rules, written under each suggestion. It counts your own records, compares the week with the same days last week, and shows a percentage only when both weeks have 20 or more. It suggests; you decide.",
          },
          {
            id: "trust",
            q: "Can I trust the numbers?",
            a: "Every number is counted from your own records, and every suggestion opens the rows behind it. Two things to know: a visit nobody marked stays out of the no-show rate until someone does, and the sales figures count orders, not cash taken at the counter.",
          },
          {
            id: "messages",
            q: "Will it message my customers?",
            a: "No. ALYR Agent shows and suggests. Routine messages (automatic replies, confirmations, booking reminders) go from the products you use, and ALYR Agent counts them under Done for you. A payment reminder goes only when you press Send reminders in ALYR Accounts.",
          },
          {
            id: "staff",
            q: "Can my staff see it?",
            a: "Yes. On this screen they see the work in front of them and their own numbers, not the shop’s money. You and your managers see everything.",
          },
        ],
      },
      cta: {
        title: "Tell us what you’d want to know each morning.",
        body: "Send us a message. A person from ALYR replies, then comes to show you ALYR Agent on your own phone.",
      },
    },

    // --------------------------------------------------------------- /accounts
    accounts: {
      bar: {
        label: "ALYR Accounts",
        links: [
          { id: "how", label: "How it works" },
          { id: "inside", label: "What’s in it" },
          { id: "works", label: "Works with" },
        ],
      },
      hero: {
        eyebrow: "ALYR Accounts · Set up for you",
        title: ["Know who owes you.", "Remind them without the awkward call."],
        lead:
          "Record a credit sale with one line from your staff phone, and the customer is told the new balance. One press sends reminders in a tone that follows the age of the debt, and a promise to pay pauses them.",
        facts: ["The oldest debt is settled first", "Never reminded twice within 3 days", "Stop means stop"],
        factsOffer: ["From QAR 449 a month, or QAR 150 beside ALYR Chat or ALYR Bookings"],
      },
      demo: {
        business: "Qirfa Bakery",
        businessMeta: "Business account",
        today: "Today",
        typeHere: "Message",
        workspace: "Workspace",
        note: "Sample conversation with a fictional bakery and its office account.",
        tabsLabel: "What ALYR Accounts does",
        pause: "Pause the demo",
        play: "Play the demo",
        demos: [
          {
            id: "record",
            tab: "Record",
            start: 16 * 60 + 24,
            chat: [
              { from: "business", text: "Qirfa Bakery: we recorded a credit purchase of QAR 450. Your balance is now QAR 3,150." },
            ],
            panel: {
              title: "Marina Desk Co-working",
              badge: "Credit account",
              rows: [
                { lead: "Karim", main: "“Marina 450 credit”", sub: "From the staff phone", trail: "Recorded", tone: "done" },
                { main: "Credit sale · QAR 450", sub: "The customer has been told.", trail: "QAR 3,150", tone: "signal" },
              ],
            },
            caption: "One line from your staff phone. The customer hears about every entry.",
          },
          {
            id: "remind",
            tab: "Remind",
            start: 16 * 60 + 40,
            chat: [
              {
                from: "business",
                text: "A friendly reminder from Qirfa Bakery: QAR 3,150 is due. Your oldest unpaid purchase was 35 days ago. Pay here: alyr.qa/pay/…",
                actions: ["Pay now", "I'll pay within a week"],
              },
            ],
            panel: {
              title: "Credit accounts",
              badge: "Send reminders",
              rows: [
                { main: "Marina Desk Co-working", sub: "Oldest unpaid: 35 days · friendly", trail: "Reminded", tone: "signal" },
                { main: "Bluefin Events", sub: "Oldest unpaid: 48 days · friendly", trail: "Reminded", tone: "done" },
                { main: "Ward Events", sub: "Oldest unpaid: 104 days · final notice", trail: "Reminded", tone: "done" },
                { main: "Palm Court Offices", sub: "Promised by 19 Oct", trail: "Skipped", tone: "quiet" },
              ],
              total: ["Sent", "3 reminders, 1 skipped"],
            },
            caption: "Gentle under 60 days, firmer from 60, a final notice from 90.",
          },
          {
            id: "promise",
            tab: "Promise",
            start: 16 * 60 + 52,
            chat: [
              { from: "customer", text: "I'll pay within a week" },
              { from: "business", text: "Thank you. We have noted that you will pay by 22 Oct. No reminders will be sent until then." },
            ],
            panel: {
              title: "Marina Desk Co-working",
              badge: "Credit account",
              rows: [
                { main: "Balance QAR 3,150", sub: "Oldest unpaid: 35 days", trail: "Promised by 22 Oct", tone: "signal" },
              ],
            },
            caption: "A promise pauses the reminders until its date. If it passes with nothing paid, ALYR Agent shows it.",
          },
          {
            id: "pay",
            tab: "Pay",
            start: 19 * 60 + 5,
            chat: [
              { from: "customer", text: "pay 450" },
              { from: "business", text: "To pay QAR 450, open this link: alyr.qa/pay/…" },
              { from: "business", text: "Received QAR 450. Your balance is now QAR 2,700. Thank you." },
            ],
            panel: {
              title: "Marina Desk Co-working",
              badge: "Entries",
              rows: [
                { lead: "15 Oct", main: "Payment · Paid by payment link", trail: "−QAR 450", tone: "signal" },
                { lead: "15 Oct", main: "Credit sale", trail: "+QAR 450", tone: "done" },
              ],
              total: ["Balance", "QAR 2,700"],
            },
            caption: "The payment page is still a test page: no money moves.",
          },
          {
            id: "accounts",
            tab: "Accounts",
            start: 19 * 60 + 20,
            chat: [],
            panel: {
              title: "Credit accounts",
              badge: "5 customers owe money",
              rows: [
                { main: "Palm Court Offices", sub: "Oldest unpaid: 76 days · Promised by 19 Oct", trail: "QAR 3,875", tone: "done" },
                { main: "Bluefin Events", sub: "Oldest unpaid: 48 days · Reminded", trail: "QAR 3,450", tone: "done" },
                { main: "Marina Desk Co-working", sub: "Oldest unpaid: 35 days · Promised by 22 Oct", trail: "QAR 2,700", tone: "signal" },
                { main: "Tamr Café", sub: "Oldest unpaid: 12 days", trail: "QAR 1,700", tone: "done" },
                { main: "Ward Events", sub: "Oldest unpaid: 104 days · Final notice", trail: "QAR 1,250", tone: "quiet" },
              ],
            },
            caption: "Payments settle the oldest debt first, as a paper book is read.",
          },
        ],
      },
      flow: {
        eyebrow: "How it works",
        title: "What happens between a sale on credit and the payment.",
        body:
          "Your customer sees an ordinary chat. Behind it, ALYR keeps the book, checks before it reminds, and pauses when someone promises. Follow one account through.",
        tabsLabel: "Examples",
        stepsLabel: "Steps",
        pause: "Pause",
        play: "Play",
        note: "Sample conversation with a fictional bakery.",
        customer: { name: "Your customer", sub: "On WhatsApp, as always" },
        whatsapp: { name: "WhatsApp", sub: "Business Platform" },
        alyr: { name: "ALYR Accounts", sub: "Working in the background", idle: "Waiting for the next entry" },
        team: { name: "Your team", sub: "The workspace", idle: "Nothing new yet" },
        stories: [
          {
            id: "sale",
            tab: "A sale on credit",
            steps: [
              {
                move: "back",
                title: "One line from the staff phone",
                body: "Karim sends “Marina 450 credit” to the shop’s number, from a phone registered in ALYR as staff.",
                work: ["Staff message: Karim", "Customer: Marina Desk Co-working", "Credit sale: QAR 450"],
              },
              {
                move: "team",
                title: "ALYR records it on that customer’s account",
                body: "The balance on Credit accounts is current the moment the line arrives.",
                record: { id: "acct", main: "Marina Desk Co-working", sub: "Credit sale · QAR 450", trail: "QAR 3,150", tone: "signal" },
                work: ["Entry saved", "Balance: QAR 3,150"],
              },
              {
                move: "out",
                title: "The customer is told the new balance",
                body: "Every entry reaches the customer, so the book is one both sides have seen.",
                chat: { from: "business", text: "Qirfa Bakery: we recorded a credit purchase of QAR 450. Your balance is now QAR 3,150." },
                work: ["Notice sent"],
              },
              {
                move: "in",
                title: "Or the customer puts an order on account",
                body: "From the order page, a customer with a credit limit taps “Put it on my account”. Over the limit, it is refused.",
                chat: { from: "event", text: "Put it on my account" },
                work: ["Credit limit checked", "Order on account"],
              },
            ],
          },
          {
            id: "remind",
            tab: "A reminder goes out",
            steps: [
              {
                move: "back",
                title: "You press Send reminders",
                body: "On Credit accounts, one press reminds every customer whose oldest unpaid purchase is 30 days old or more.",
                work: ["Send reminders: accounts 30+ days"],
              },
              {
                title: "It checks before it sends",
                body: "A live promise, a customer who said stop, or a reminder in the last 3 days: any one of them, and that customer is skipped.",
                work: ["Promise: none", "Consent: on record", "Last reminder: 9 days ago"],
              },
              {
                title: "The tone follows the age",
                body: "Under 60 days, a friendly reminder. From 60, firmer. From 90, a final notice.",
                work: ["Oldest unpaid: 35 days", "Tone: friendly"],
              },
              {
                move: "out",
                title: "The reminder arrives",
                body: "With a payment link, and two buttons: Pay now, and I'll pay within a week.",
                chat: { from: "business", text: "A friendly reminder from Qirfa Bakery: QAR 3,150 is due. Your oldest unpaid purchase was 35 days ago.", action: "Pay now" },
                work: ["Reminder sent"],
              },
              {
                move: "team",
                title: "Your team sees who was reminded",
                body: "And who was skipped, and why.",
                record: { id: "acct", main: "Marina Desk Co-working", sub: "Reminded today", trail: "QAR 3,150", tone: "signal" },
                work: ["3 reminders sent, 1 skipped"],
              },
            ],
          },
          {
            id: "promise",
            tab: "A promise pauses it",
            steps: [
              {
                move: "in",
                title: "The customer taps “I'll pay within a week”",
                body: "One tap, from the reminder itself.",
                chat: { from: "customer", text: "I'll pay within a week" },
                work: ["Reply: promise to pay"],
              },
              {
                title: "ALYR notes the date",
                body: "Seven days from today. Until then, no reminder goes to this customer.",
                work: ["Promised by 22 Oct", "Reminders paused"],
              },
              {
                move: "out",
                title: "The customer hears it was noted",
                body: "In the same chat, at once.",
                chat: { from: "business", text: "Thank you. We have noted that you will pay by 22 Oct. No reminders will be sent until then." },
                work: ["Confirmation sent"],
              },
              {
                move: "team",
                title: "Your team sees the promise",
                body: "On the account, beside the balance.",
                record: { id: "acct", main: "Marina Desk Co-working", sub: "Promised by 22 Oct", trail: "QAR 3,150", tone: "signal" },
                work: ["Account: promised"],
              },
              {
                title: "If the date passes with nothing paid",
                body: "ALYR Agent shows it, with its rule.",
                work: ["RULE · the promised date passed with nothing paid"],
              },
            ],
          },
        ],
      },
      screen: {
        eyebrow: "The screen",
        title: "Who owes you, and how long.",
        caption: { n: "02", text: "Credit accounts" },
        label: "The Credit accounts screen of a fictional bakery’s workspace",
        callouts: [
          "Total owed to you.",
          "By age: 0–30, 31–60, 61–90, over 90 days.",
          "Send reminders, to accounts 30+ days old.",
          "A promise to pay, on each account.",
          "Each customer’s entries.",
        ],
        sheet: {
          path: "Credit accounts",
          sub: "Who owes what, and for how long",
          outstanding: "Outstanding",
          total: "QAR 12,975",
          owing: "5 customers owe money",
          buckets: [
            { label: "0–30 days", amount: "QAR 6,678", share: 0.515 },
            { label: "31–60 days", amount: "QAR 3,407", share: 0.263 },
            { label: "61–90 days", amount: "QAR 1,640", share: 0.126 },
            { label: "Over 90 days", amount: "QAR 1,250", share: 0.096 },
          ],
          remind: "Send reminders",
          remindHint: "To customers whose oldest unpaid purchase is 30+ days old",
          heads: { customer: "Customer", balance: "Balance", age: "Oldest debt" },
          rows: [
            { name: "Palm Court Offices", balance: "QAR 3,875", days: "76 days", age: 2, promised: "Promised by 19 Oct" },
            { name: "Bluefin Events", balance: "QAR 3,450", days: "48 days", age: 1 },
            { name: "Marina Desk Co-working", balance: "QAR 2,700", days: "35 days", age: 1, on: true },
            { name: "Tamr Café", balance: "QAR 1,700", days: "12 days", age: 0 },
            { name: "Ward Events", balance: "QAR 1,250", days: "104 days", age: 3 },
            { name: "Garden Gate Nursery", balance: "QAR 0", days: "Settled", age: 0, settled: true },
          ],
          entries: {
            title: "Entries",
            who: "Marina Desk Co-working",
            by: "Follows up: Karim",
            rows: [
              { at: "08 Oct", what: "Credit sale · Order #1418", amount: "+QAR 800" },
              { at: "24 Sep", what: "Credit sale · Order #1352", amount: "+QAR 1,100" },
              { at: "10 Sep", what: "Credit sale · Order #1290", amount: "+QAR 800" },
              { at: "03 Sep", what: "Payment", amount: "−QAR 1,450", payment: true },
            ],
          },
        },
      },
      inside: {
        eyebrow: "What’s in it",
        title: "Everything it does today.",
        groups: [
          {
            name: "For your customers",
            items: [
              "Told about every entry, with the new balance.",
              "“balance” brings the balance and latest entries, with Pay now.",
              "Pay all or part from a link (“pay 500”).",
              "“I'll pay within a week”, one tap.",
            ],
          },
          {
            name: "For your team",
            items: [
              "Record a sale or a payment with one line from the staff phone.",
              "Orders on account for customers with a credit limit, refused over it (with ALYR Chat).",
              "What is owed, by age, and who promised and when.",
              "Send reminders to everyone 30+ days old, in one press.",
              "One person responsible for each account.",
              "In ALYR Agent: overdue and not reminded, promises passed, over the limit, owed growing three weeks running.",
            ],
          },
          {
            name: "Behind the scenes",
            items: [
              "The oldest debt is settled first.",
              "Nobody is reminded twice within 3 days.",
              "The tone follows the age of the debt.",
              "Stop means stop.",
            ],
          },
        ],
        notYet: {
          title: "Not yet",
          items: [
            "Live payments through your own payment provider. Links run on a test page today.",
            "Recording a sale or payment from the screen.",
            "Setting a credit limit yourself. ALYR sets it when you ask.",
            "Statements of account.",
            "“Pay now” and “I'll pay within a week”, on a reminder sent over 24 hours after the customer last wrote. That one carries the pay link only.",
            "Invoices, and receipts that say how a customer paid, belong to ALYR Docs, which we set up with you.",
          ],
        },
        note: "We set ALYR Accounts up with you at your shop. Everything listed above the line is built.",
      },
      who: {
        eyebrow: "Who it’s for",
        title: "For businesses that let regulars pay later.",
        rows: [
          { name: "Wholesale and trading, with trade customers on terms", tags: ["Record", "Remind", "Collect"] },
          { name: "Shops with regulars on the book", tags: ["Record", "Remind"] },
          { name: "Restaurants and bakeries with office or event accounts", tags: ["Order on account", "Remind"] },
          { name: "Home services with contract customers", tags: ["Record", "Remind"] },
        ],
        other: "Run something else? Write to us about how you work today.",
      },
      works: {
        eyebrow: "The products",
        title: "Works with the rest of ALYR.",
        link: "See {name}",
        rows: {
          chat: "Orders put on account land here, and the order page refuses one over the limit.",
          bookings: "Clients who pay for visits later: record it with the same one line.",
          agent: "Comes with ALYR Accounts: overdue and not reminded, promises passed, over the limit.",
          shelf: "An order on account takes its stock straight away.",
          docs: "An invoice for each sale on account, and a receipt for each payment that says what is left.",
        },
      },
      faq: {
        eyebrow: "Questions",
        title: "Before you ask.",
        items: [
          {
            id: "own",
            q: "Can I use it on its own?",
            a: "Yes. You record sales with a line from your staff phone. Add ALYR Chat, and customers can put an order on their account from the order page.",
          },
          {
            id: "upset",
            q: "Will reminders upset my customers?",
            a: "The first is a friendly reminder. It turns firmer only after 60 days, nobody gets two within 3 days, and one tap on “I'll pay within a week” pauses them.",
          },
          {
            id: "stop",
            q: "What if a customer says stop?",
            a: "They get no more reminders or notices. You still see what they owe.",
          },
          {
            id: "move",
            q: "How do I move from my paper book?",
            a: "At setup we go through each customer’s balance with you, so the first reminder is right.",
          },
        ],
      },
      cta: {
        title: "Tell us how you keep credit today.",
        body: "Send us a message. A person from ALYR replies, then comes to show you ALYR Accounts on your own phone.",
      },
    },

    // ------------------------------------------------------------------ /shelf
    shelf: shelfEn,

    // ------------------------------------------------------------------- /docs
    docs: docsEn,
  },
};

const ar: Copy = {
  meta: {
    home: {
      title: "ALYR · الطلبات والحجوزات والحسابات الآجلة، نجهّزها لك",
      description:
        "تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر وتتولى متابعتها: الطلبات والحجوزات والحسابات الآجلة وما تبيعه وإيصالاتك، في مساحة عمل واحدة. ومع كل منتج يأتي ALYR Agent: ما يحتاجك اليوم، وأسبوعك بالأرقام. من 449 ر.ق شهرياً لأول منتج، إضافة إلى رسوم التجهيز.",
      descriptionNoOffer:
        "تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر وتتولى متابعتها: الطلبات والحجوزات والحسابات الآجلة وما تبيعه وإيصالاتك، في مساحة عمل واحدة. ومع كل منتج يأتي ALYR Agent: ما يحتاجك اليوم، وأسبوعك بالأرقام.",
    },
    chat: {
      title: "ALYR Chat · طلبات واتساب وصندوق الفريق",
      description:
        "يردّ ALYR Chat على رسائل عملائك في واتساب بصفحة للطلب وصفحة لتتبّعه، ويجمع فريقك في صندوق واحد، ونحن نجهّزه لك. للمطاعم والمقاهي والمحلات والخدمات المنزلية في قطر.",
    },
    bookings: {
      title: "ALYR Bookings · المواعيد من محادثة واتساب، مع التذكيرات",
      description:
        "يحجز عملاؤك وقتاً متاحاً من صفحة تُفتح من المحادثة. تؤكد ALYR الحجز فوراً، وتذكّرهم قبل الموعد بساعتين، ويسجّل فريقك من حضر. ونجهّزه لك في قطر.",
    },
    agent: {
      title: "ALYR Agent · نشاطك بالأرقام، مع كل منتجات ALYR",
      description:
        "الشاشة الرئيسية في مساحة عملك مع ALYR: ما يحتاجك الآن، وأسبوعك مقارنةً بالأيام نفسها من الأسبوع الماضي، وحتى ثلاثة اقتراحات لكل منها القاعدة التي وراءه. مع كل منتجات ALYR.",
    },
    accounts: {
      title: "ALYR Accounts · الحسابات الآجلة وتذكيرات لبقة، داخل المحادثة",
      description:
        "سجّل البيع بالآجل بسطر واحد من هاتف الموظف، واعرف من عليه مستحقات لك ومنذ متى، وأرسل تذكيرات تتدرّج نبرتها مع عمر الدين. ونجهّزه لك في قطر.",
    },
    shelf: {
      title: "ALYR Shelf · الأصناف والصور والمخزون، مع كل منتجات ALYR",
      description:
        "كل ما تبيعه في مكان واحد: الصور والأسعار والمقاسات والخيارات بالعربية والإنجليزية. كل بيع ينقص المخزون، والقطعة الأخيرة تُباع مرة واحدة، وصفحة الطلب تكتب «نفد». مع كل منتجات ALYR.",
    },
    docs: {
      title: "ALYR Docs · الإيصالات والفواتير والإشعارات الدائنة، بالعربية والإنجليزية",
      description:
        "إيصالات من مبيعاتك والمدفوعات التي تسجّلها، بأرقام متتالية بلا فجوات، والعربية أولاً، ونهائية بعد إصدارها. ليس لديك سجل تجاري بعد: إيصالات، ثم فواتير حين يصبح لديك سجل. ونجهّزه لك في قطر.",
    },
  },
  skip: "انتقل إلى المحتوى",
  nav: {
    products: "المنتجات",
    business: "حسب نشاطك",
    how: "كيف نعمل",
    questions: "أسئلة",
    price: "السعر",
    other: "English",
    home: "الصفحة الرئيسية لـ ALYR",
    menu: "القائمة",
    sections: "الأقسام",
    productsMenu: "منتجات ALYR",
    cta: { whatsapp: "راسلنا", email: "راسلنا بالبريد", pending: "تواصل معنا" },
  },
  products: {
    items: {
      chat: {
        name: "ALYR Chat",
        descriptor: "طلبات واتساب وصندوق الفريق",
        line: "الطلبات من المحادثة، وصندوق واحد للفريق، وتتبّع الطلب",
        state: "نجهّزه لك",
      },
      bookings: {
        name: "ALYR Bookings",
        descriptor: "المواعيد والتذكيرات",
        line: "المواعيد من المحادثة، مع تذكير قبل كل موعد",
        state: "نجهّزه لك",
      },
      agent: {
        name: "ALYR Agent",
        descriptor: "نشاطك بالأرقام",
        line: "ما يحتاجك اليوم، وأسبوعك بالأرقام",
        state: "مع كل منتج",
      },
      accounts: {
        name: "ALYR Accounts",
        descriptor: "الحسابات الآجلة",
        line: "الحسابات الآجلة: من عليه مستحقات لك، وتذكيرات لبقة",
        state: "نجهّزه لك",
      },
      shelf: {
        name: "ALYR Shelf",
        descriptor: "الأصناف والمخزون",
        line: "كل ما تبيعه: الصور والأسعار والمقاسات والمخزون",
        state: "مع كل منتج",
      },
      docs: {
        name: "ALYR Docs",
        descriptor: "الإيصالات والفواتير",
        line: "إيصالات وفواتير وإشعارات دائنة من مبيعاتك",
        state: "نجهّزه لك",
      },
    },
    see: "تعرّف على {name}",
  },
  theme: { toDark: "التبديل إلى الوضع الداكن", toLight: "التبديل إلى الوضع الفاتح", dark: "الوضع الداكن", light: "الوضع الفاتح" },
  contact: {
    whatsapp: "راسلنا على واتساب",
    email: "راسلنا بالبريد",
    reply: "يردّ عليك شخص من ALYR.",
    replyShort: "يردّ عليك شخص من ALYR.",
    pending: "سيتوفر رقم واتساب الخاص بنا قريباً. نرجو العودة لاحقاً.",
    commits: "الرسالة لا تُلزمك بشيء.",
    prefill: "السلام عليكم، أبي أعرف كيف تشتغل ALYR مع محلي.",
    subject: "كيف تعمل ALYR مع محلي",
    body: "اسم النشاط:\nالمنطقة:\nماذا تبيع أو ماذا يُحجز لديك:\nكيف يصل إليك عملاؤك اليوم:\nأنسب وقت للزيارة:\n",
    draft: "الرسالة التي نكتبها لك مسبقاً",
    bar: "تواصل مع ALYR",
  },
  footer: {
    line: "علينا التقنية، وعليك شغلك.",
    rights: "ALYR. صُنع في قطر.",
    workspace: "دخول الموظفين",
    disclaimer: "تستخدم ALYR منصة واتساب للأعمال، وليست تابعة لواتساب أو Meta، ولا معتمدة منهما.",
    doha: "الدوحة",
    links: "الموقع",
    products: "المنتجات",
  },
  fig: { label: "الشكل", fictional: "مثال: مخبز غير حقيقي" },
  report: {
    meta: "حساب أعمال",
    day: "الأحد",
    time: "09:00",
    alt: {
      bakery:
        "بطاقة التقرير الأسبوعي: مخبز قرفة، 4–10 أكتوبر، وعليها كلمة «عيّنة». المبيعات 12,005 ر.ق، أكثر بـ1% عن الأسبوع السابق. عمود لكل يوم من الأحد إلى السبت بجانب الأسبوع السابق، وأعلاها الثلاثاء: 2,947 ر.ق. الأكثر طلباً: كرواسون بالزبدة، الكمية 54. المستحق لك: 13,894 ر.ق، و6 عملاء مدينون. الزيارات: 3، والغياب 0.",
      salon:
        "بطاقة التقرير الأسبوعي: صالون ضفيرة، 4–10 أكتوبر، وعليها كلمة «عيّنة». الزيارات 28، أكثر بـ33% عن الأسبوع السابق. عمود لكل يوم من الأحد إلى السبت بجانب الأسبوع السابق، وأعلاها السبت: 7 زيارات. الغياب: 3 من أصل 31. المحجوز القادم: 17 خلال 7 أيام. راسلوك: 33 عميلاً.",
      homeservices:
        "بطاقة التقرير الأسبوعي: ظلال للتكييف، 4–10 أكتوبر، وعليها كلمة «عيّنة». المهام 22، والأسبوع السابق 19. عمود لكل يوم من الأحد إلى السبت بجانب الأسبوع السابق، والجمعة إجازة، وأعلاها الاثنين: 5 مهام. الغياب: 1 من أصل 23. المستحق لك: 13,400 ر.ق، وعميلان مدينان. المحجوز القادم: 9 خلال 7 أيام.",
    },
  },
  agent: {
    path: "الرئيسية",
    switchLabel: "نشاط توضيحي",
    status: "ALYR · تعمل",
    feedLabel: "ما أنجزته ALYR عصر اليوم",
    flagged: "تنبيه حسب القاعدة",
    samples: {
      bakery: {
        tab: "مخبز",
        shop: "مخبز قرفة",
        monogram: "ق",
        announce: "يُعرض الآن مخبز قرفة، وهو مخبز غير حقيقي.",
        fictional: "مثال: مخبز غير حقيقي",
        feed: [
          { at: "16:00", title: "أُرسل تذكير بموعد", line: "تذوّق الكيك، اليوم الساعة 18:00\u00a0·\u00a0نور أ.", adds: ["sent", "booking_reminders"] },
          { at: "16:04", title: "أُرسلت قائمة الترحيب", line: "لعميل جديد: «أهلاً بك في مخبز قرفة. كيف نقدر نساعدك؟»", adds: ["sent"] },
          { at: "16:09", title: "أُرسل تأكيد الطلب", line: "الطلب رقم 1441 من لينا ف.، مع صفحة تتبّعه", adds: ["sent"] },
          { at: "16:13", title: "أُرسلت صفحة الطلب", line: "كتبت سارة م. «طلب»، فوصلها الرابط فوراً.", adds: ["sent"] },
          { at: "16:18", title: "تنبيه حسب القاعدة", flag: { from: "suggestion", key: "overdue" }, adds: [] },
        ],
      },
      salon: {
        tab: "صالون",
        shop: "صالون ضفيرة",
        monogram: "ض",
        announce: "يُعرض الآن صالون ضفيرة، وهو صالون غير حقيقي.",
        fictional: "مثال: صالون غير حقيقي",
        feed: [
          { at: "15:58", title: "أُرسلت قائمة الترحيب", line: "لعميلة جديدة: «أهلاً بك في صالون ضفيرة. كيف نقدر نخدمك؟»", adds: ["sent"] },
          { at: "16:00", title: "أُرسل تذكير بموعد", line: "تسشوار، اليوم الساعة 18:00\u00a0·\u00a0دانة ر.", adds: ["sent", "booking_reminders"] },
          { at: "16:01", title: "تنبيه حسب القاعدة", flag: { from: "needs", key: "unmarked" }, adds: [] },
          { at: "16:07", title: "أُرسلت صفحة الحجز", line: "ضغطت رانيا ح. «احجز موعداً»، فوصلها الرابط فوراً.", adds: ["sent"] },
          { at: "16:16", title: "تنبيه حسب القاعدة", flag: { from: "suggestion", key: "repeat_no_show" }, adds: [] },
        ],
      },
      homeservices: {
        tab: "خدمات منزلية",
        shop: "ظلال للتكييف",
        monogram: "ظ",
        announce: "تُعرض الآن ظلال للتكييف، وهي شركة تكييف غير حقيقية.",
        fictional: "مثال: شركة تكييف غير حقيقية",
        feed: [
          { at: "15:56", title: "أُرسلت قائمة الترحيب", line: "لعميل جديد: «أهلاً بك في ظلال للتكييف. كيف نقدر نساعدك؟»", adds: ["sent"] },
          { at: "16:00", title: "أُرسل تذكير بموعد", line: "صيانة مكيف سبليت، اليوم الساعة 18:00\u00a0·\u00a0حسن د.", adds: ["sent", "booking_reminders"] },
          { at: "16:06", title: "أُرسلت صفحة الحجز", line: "كتب عمر ك. «حجز»، فوصله الرابط فوراً.", adds: ["sent"] },
          { at: "16:12", title: "أُرسلت تفاصيل الحجز", line: "كتب علي ت. «حجزي»، فوصله موعده مع زر للإلغاء.", adds: ["sent"] },
          { at: "16:17", title: "تنبيه حسب القاعدة", flag: { from: "suggestion", key: "overdue" }, adds: [] },
        ],
      },
    },
  },
  home: {
    hero: {
      eyebrow: "ALYR · تعمل من أجلك",
      title: ["صار لنشاطك", "من يتابعه عنك."],
      body:
        "داخل محادثة واتساب، تردّ ALYR على الرسائل المعتادة، وترسل تذكيرات المواعيد، وتساعدك في متابعة المستحقات. ويضع ALYR Agent ما يحتاجك على شاشة واحدة، بقواعد تستطيع مراجعتها. نجهّز كل شيء في محلك، وأنت تدير عملك.",
      more: "تعرّف على المنتجات",
      facts: ["نجهّزها لك في محلك", "من 449 ر.ق شهرياً، وALYR Agent مشمول", "بالعربية والإنجليزية"],
      factsNoOffer: ["نجهّزها لك في محلك", "كل اقتراح يُظهر قاعدته", "بالعربية والإنجليزية"],
      figure: {
        label: "الشاشة الرئيسية لـ ALYR Agent في مخبز غير حقيقي، وما أنجزته ALYR له عصر اليوم",
        caption: { n: "01", text: "ALYR Agent عصر يوم خميس" },
      },
    },
    spotlight: {
      eyebrow: "ALYR Agent · نشاطك بالأرقام",
      title: "كل اقتراح يُظهر القاعدة التي وراءه.",
      body:
        "يعدّ ALYR Agent الطلبات والحجوزات والمحادثات والحسابات الآجلة الموجودة أصلاً في مساحة عملك. يقارن أسبوعك بالأيام نفسها من الأسبوع الماضي، ويضع العمل المنتظر في الأعلى، ويقترح حتى ثلاثة أمور، لكل منها قاعدتها وزرّ يفتح الشاشة التي تتصرف منها.",
      caption: { n: "02", text: "الشاشة الرئيسية كاملة" },
      label: "الشاشة الرئيسية لـ ALYR Agent للنشاط التوضيحي الذي تختاره",
      calloutsLabel: "ما يعرضه كل جزء",
      callouts: [
        "جملة واحدة عن أسبوعك، مقارنةً بالأيام نفسها من الأسبوع الماضي.",
        "يحتاجك الآن: العمل المنتظر، ومنذ متى. ويختفي حين يُنجز.",
        "أربعة أرقام بحسب ما تبيعه. ولا تظهر النسبة المئوية إلا حين يبلغ الأسبوعان 20 أو أكثر.",
        "حتى ثلاثة اقتراحات. ينتهي كل منها بقاعدته، ويفتح السجلات التي عدّها.",
        "أنجزته ALYR لك: ما أرسلته هذا الأسبوع.",
      ],
      under: "الشاشة الحقيقية، بأنشطة غير حقيقية. كل رقم فيها حسبته ALYR من سجلات المثال نفسه.",
      link: "تعرّف على ALYR Agent",
    },
    suite: {
      eyebrow: "المنتجات",
      title: "مساحة عمل واحدة.\nولكل مهمة منتج.",
      body:
        "نجهّز ALYR في محلك. منتجاتنا تستقبل الطلبات والحجوزات وترسل التذكيرات داخل واتساب، وتتشارك مساحة عمل واحدة وقائمة عملاء واحدة وفريقاً واحداً. ويأتي ALYR Agent وALYR Shelf مع كل منها، واختر الباقي.",
      rows: {
        chat: {
          body: "يطلب العميل من صفحة مصمّمة لهاتفه، بلا تطبيق ولا حساب. ولكل طلب صفحة تتبّع، وفريقك كله يردّ من صندوق واحد.",
          link: "تعرّف على ALYR Chat",
        },
        bookings: {
          body: "يختار العميل من الأوقات المتاحة فعلاً لديك. يصله التأكيد فوراً، وتذكير قبل الموعد بساعتين.",
          link: "تعرّف على ALYR Bookings",
        },
        agent: {
          body: "ما يحتاجك الآن، وأسبوعك مقارنةً بالأيام نفسها من الأسبوع الماضي، وحتى ثلاثة اقتراحات، لكل منها قاعدته.",
          link: "تعرّف على ALYR Agent",
        },
        accounts: {
          body: "سجّل البيع بالآجل في المحادثة، وأرسل تذكيرات لبقة برابط دفع، واعرف من وعد بالسداد ومتى.",
          link: "تعرّف على ALYR Accounts",
        },
        shelf: {
          body: "كل ما تبيعه، بصوره ومقاساته ومخزونه. كل بيع ينقصه، وصفحة الطلب تكتب «نفد» تلقائياً.",
          link: "تعرّف على ALYR Shelf",
        },
        docs: {
          body: "إيصالات وفواتير من مبيعاتك: بأرقام متتالية بلا فجوات، والعربية أولاً، ونهائية بعد إصدارها.",
          link: "تعرّف على ALYR Docs",
        },
      },
      notes: [
        {
          title: "في كل منتج: لكل شيء مسؤول.",
          body: "لكل محادثة وطلب وحجز وحساب آجل موظف مسؤول. ترى من ردّ، وبأي سرعة، وما الذي بيع أو ضاع.",
        },
        {
          title: "روابط الدفع",
          body: "تأتي مع ALYR Chat وALYR Bookings. وهي اليوم تفتح صفحة تجريبية، ويبدأ الدفع بالبطاقات بعد ربط مزوّد دفع.",
        },
      ],
      caption: { n: "03", text: "ركن من شاشة كل منتج، بحجمه الحقيقي" },
      crops: {
        items: "الأصناف: 3",
        total: "38 ر.ق",
        pay: "ادفع 38 ر.ق",
        times: ["4:00 م", "4:30 م", "5:00 م", "5:30 م", "6:00 م", "6:30 م"],
        time: "4:30 م",
        owed: "مستحق لك",
        shelf: [
          { name: "تشيز كيك الكنافة بالفستق", price: "185 ر.ق", note: "المتبقي اليوم 1 فقط" },
          { name: "كيك الحليب بالزعفران، قطعة", price: "26 ر.ق", note: "نفد", out: true },
        ],
        receipt: "أعلى الإيصال RC-0042، والعربية أولاً",
      },
    },
    business: {
      eyebrow: "حسب نشاطك",
      title: "ابدأ من الطريقة التي يصل بها إليك عملاؤك.",
      uses: "يستخدم",
      rows: [
        {
          name: "المطاعم والمقاهي",
          body: "قائمتك داخل المحادثة، والطلبات على شاشتك، ويُبلَّغ العميل حين يجهز طلبه. وعملاء المكاتب الدائمون يطلبون على حسابهم.",
          products: ["chat", "accounts", "agent", "shelf"],
          note: "حجز الطاولات غير متوفر في ALYR بعد.",
        },
        {
          name: "الصالونات ومحلات الحلاقة",
          body: "يحجز العميل الخدمة من المحادثة، ويصله تذكير قبل موعده بساعتين، ويسجّل فريقك من حضر.",
          products: ["bookings", "agent"],
          note: "حجز واحد في الوقت نفسه اليوم: يناسب كرسياً واحداً. وأكثر من كرسي في الوقت نفسه هو الخطوة التالية.",
        },
        {
          name: "الخدمات المنزلية",
          body: "زيارات تُحجز من المحادثة، وقطع غيار تُطلب من صفحة، وعملاء عقود بالآجل، وإيصال لكل دفعة.",
          products: ["bookings", "chat", "accounts", "agent", "docs"],
          note: "زيارة واحدة في الوقت نفسه لكل منشأة اليوم.",
        },
        {
          name: "المحلات وتجارة الجملة",
          body: "طلبات من قائمة أسعارك في المحادثة، ومخزون يُعدّ مع كل بيع، وعملاء تجاريون بالآجل، بتذكيرات تبقى لبقة.",
          products: ["chat", "accounts", "agent", "shelf", "docs"],
        },
      ],
      other: "نشاطك مختلف؟ راسلنا وأخبرنا كيف تعمل اليوم.",
    },
    how: {
      eyebrow: "كيف نعمل",
      title: "من أول زيارة إلى أول أسبوع بالأرقام.",
      steps: [
        {
          title: "نزورك.",
          body: "نأتي إلى محلك، ونرى كيف تصلك الطلبات والحجوزات اليوم، ونريك ALYR على هاتفك أنت.",
        },
        {
          title: "نجهّز كل شيء.",
          body: "نضيف أصنافك بصورها، أو خدماتك، وأسعارك، بالعربية والإنجليزية. ونضبط ساعات العمل، ونفعّل المنتجات التي تحتاجها، ونعطي كل موظف في فريقك حساب دخول خاصاً به.",
        },
        {
          title: "يبدأ التشغيل.",
          body: "ندرّب فريقك عند الكاونتر، وتشارك رابط المحادثة ورموز QR، فتصل الطلبات والحجوزات إلى مكان واحد.",
        },
        {
          title: "ترى ما تغيّر.",
          body: "يعرض لك ALYR Agent ما يحتاجك كل يوم. ويبدأ تقرير أسبوعك على واتساب صباح كل أحد بعد موافقة واتساب على صياغته. تحتاج تعديلاً؟ راسلنا ونعدّله لك.",
        },
      ],
      note: "نجهّز ALYR مع كل منشأة بأنفسنا، ونتفق معك على موعد بدء التشغيل خلال الزيارة.",
      report: { caption: { n: "04", text: "تقرير الأحد على واتساب، عن 4⁠–⁠10 أكتوبر" } },
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
          "شخص من ALYR يردّ على رسائلك",
          "ALYR Agent، وتقرير الأحد بعد موافقة واتساب عليه",
          "كل تحديثات المنتج، بلا تثبيت",
        ],
      },
    },
    price: {
      eyebrow: "السعر",
      title: "كم يكلّف، بالريال القطري.",
      from: "ابتداءً من",
      amount: "449",
      currency: "ر.ق",
      currencyFirst: false,
      period: "شهرياً",
      first: "لأول منتج. وأضف ALYR Chat أو ALYR Bookings أو ALYR Accounts بـ\u00a0150 ر.ق شهرياً لكل منها. ويأتي ALYR Agent وALYR Shelf مع كل منتج.",
      setup: "ورسوم تجهيز تبدأ من 1,500 ر.ق، ونحدد مبلغها خلال زيارتنا لك.",
      includes:
        "يشمل اشتراكك الشهري منتجاتك، وALYR Agent، وALYR Shelf، وتقرير الأحد، وحسابات دخول لفريقك، وشخصاً من ALYR يردّ على رسائلك، وتعديل القائمة والأسعار والساعات عند الطلب. ونؤكد لك سعرك الشهري كتابةً خلال الزيارة.",
      combosLabel: "مثلاً",
      combos: [
        { label: "منتج واحد، مثل ALYR Bookings", value: "من 449 ر.ق" },
        { label: "ALYR Chat مع ALYR Bookings", value: "من 599 ر.ق" },
        { label: "Chat وBookings وAccounts", value: "من 749 ر.ق" },
        { label: "ALYR Agent وALYR Shelf", value: "مشمولان" },
      ],
      ledgerLabel: "الرسوم بوضوح",
      ledger: [
        { label: "العمولة على طلباتك", value: "لا عمولة. ALYR لا تأخذ أي نسبة من طلباتك.", strong: true },
        { label: "رسوم رسائل واتساب", value: "تحتسبها Meta عليك مباشرة بأسعارها، ولا نضيف عليها شيئاً." },
        { label: "مدة الاشتراك", value: "اشتراك شهري. يمكنك إيقافه في نهاية أي شهر، على أن تُبلغنا قبل 7 أيام." },
      ],
      agreement: {
        caption: { n: "05", text: "الشهر الأول كما يُكتب في اتفاقك" },
        kicker: "الاتفاق · الشهر الأول",
        parties: "بين ALYR ومخبز قرفة",
        titleLead: "شهرك الأول،",
        titleMark: "بضمان استرداد المبلغ.",
        body:
          "قبل أن نبدأ نتفق معك على نتيجة واحدة، مثل عدد الطلبات أو الحجوزات عبر المحادثة خلال 30 يوماً من بدء التشغيل. وإن لم نحققها نعيد لك اشتراك الشهر الأول.",
        fields: [
          { label: "النتيجة", value: "نتفق عليها معك خلال الزيارة", blank: true },
          { label: "أين تُحسب", value: "في مساحة عملك، وتراها أنت أيضاً" },
          { label: "المدة", value: "30 يوماً من بدء التشغيل" },
          { label: "دورك", value: "أن تضع رموز QR في محلك وتشارك رابط المحادثة مع عملائك في الأسبوع الأول." },
          { label: "إن لم نحققها", value: "نعيد لك اشتراك الشهر الأول. رسوم التجهيز لا تُسترد." },
        ],
        print: "الشروط مكتوبة في اتفاقك معنا.",
      },
    },
    trust: {
      eyebrow: "لماذا تثق بنا",
      title: "شركة جديدة. ونعمل بالأصول.",
      body:
        "نختار الآن أوائل عملائنا في الدوحة، لذلك لن ترى هنا بعدُ شعارات عملاء أو أرقاماً. وإليك ما نستطيع أن نريك إياه بدلاً من ذلك.",
      facts: [
        {
          label: "الشخص",
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
          body: "الردود الآلية تتولى المتكرر، وALYR Agent يقترح فقط ويُظهر قاعدة كل اقتراح، وأي موظف يستطيع الدخول إلى أي محادثة.",
        },
      ],
      closing: "وإن لم يحقق الشهر الأول النتيجة التي اتفقنا عليها، نعيد لك اشتراك ذلك الشهر.",
      records: {
        label: "موثّق",
        items: { cr: "السجل التجاري", provider: "مزوّد الدفع", meta: "مزوّد تقنية معتمد لدى Meta" },
      },
      figure: {
        caption: { n: "05", nOffer: "06", text: "صفحة تتبّع الطلب نفسها بالعربية والإنجليزية" },
        label: "صفحة العميل نفسها بالعربية والإنجليزية، جنباً إلى جنب",
      },
    },
    faq: {
      eyebrow: "أسئلة",
      title: "أسئلة في محلها.",
      items: [
        {
          id: "which-product",
          q: "أي منتج أحتاج؟",
          a: "أخبرنا كيف يصل إليك عملاؤك. الطلبات في المحادثة: ALYR Chat. المواعيد: ALYR Bookings. عملاء يدفعون لاحقاً: ALYR Accounts. الإيصالات والفواتير: ALYR Docs. والمخبز الذي يبيع الكيك ويحجز مواعيد التذوّق يستخدم Chat وBookings معاً. ومع كل منتج يأتي ALYR Agent وALYR Shelf.",
        },
        {
          id: "all-of-them",
          q: "هل عليّ أن آخذها كلها؟",
          a: "لا. ابدأ بمنتج واحد، وأضف غيره حين تحتاجه، في مساحة العمل نفسها، مع العملاء أنفسهم والفريق نفسه.",
        },
        {
          id: "suggestions",
          q: "من أين تأتي اقتراحات ALYR Agent؟",
          a: "من قواعد ثابتة مكتوبة تحت كل اقتراح. يعدّ سجلاتك أنت، ويقارن الأسبوع بالأيام نفسها من الأسبوع الماضي، ولا يعرض نسبة مئوية إلا حين يبلغ الأسبوعان 20 أو أكثر. هو يقترح، والقرار لك.",
        },
        {
          id: "whatsapp-business",
          q: "أستخدم واتساب للأعمال، وهو مجاني.",
          a: "عملاؤك يواصلون استخدام واتساب. وتضيف ALYR ما لا يوفّره التطبيق: صفحة طلب، وحجوزات، وروابط دفع، وصندوقاً واحداً لفريقك كله، فلا تنتهي الطلبات على الورق. أما الرقم الذي يراسلك عليه عملاؤك، وما يعنيه ذلك للتطبيق على هاتفك، فنراجعه معك خلال الزيارة.",
        },
        {
          id: "delivery-apps",
          q: "تطبيقات التوصيل تجلب لي العملاء.",
          a: "أبقِ عليها للعملاء الجدد. ALYR لعملائك الدائمين الذين يراسلونك أصلاً؛ طلباتهم تصلك مباشرة، ولا تأخذ ALYR عليها عمولة.",
        },
        {
          id: "chairs",
          q: "لديّ أكثر من كرسي أو غرفة.",
          a: "يقبل ALYR Bookings اليوم حجزاً واحداً في الوقت نفسه للمنشأة كلها، وهذا يناسب كرسياً واحداً أو غرفة واحدة أو مختصاً واحداً. أما الحجوزات المتزامنة فهي الخطوة التالية في Bookings. أخبرنا كم لديك، ونقول لك بصراحة إن كان يناسبك الآن.",
        },
        {
          id: "cost",
          offer: false,
          q: "كم تكلّف؟",
          a: "سننشر أسعارنا على هذه الصفحة قريباً. وحتى ذلك الحين، راسلنا ونشرحها لك.",
        },
        {
          id: "price",
          offer: true,
          q: "449 ر.ق شهرياً مبلغ كبير.",
          a: "صحيح أنه مبلغ له وزنه، ولهذا نتفق معك مسبقاً على نتيجة لشهرك الأول. وإن لم نحققها نعيد لك اشتراك ذلك الشهر.",
        },
        {
          id: "more-products",
          offer: true,
          q: "وإن احتجت أكثر من منتج؟",
          a: "الأول من 449 ر.ق شهرياً، ثم ALYR Chat وALYR Bookings وALYR Accounts بـ\u00a0150 ر.ق شهرياً لكل منها. ويأتي ALYR Agent وALYR Shelf معها كلها.",
        },
        {
          id: "staff",
          q: "موظفيّ لن يستخدموه.",
          a: "ندرّبهم عند الكاونتر. لكل موظف حساب دخول خاص، والخطوات مما يعرفونه: الطلب جديد، مؤكد، جاهز، مكتمل؛ والموعد حضر أو لم يحضر.",
        },
        {
          id: "busy-night",
          q: "وإذا تعطّل شيء في ليلة مزدحمة؟",
          a: "راسلنا ويتولى الأمر الشخص الذي جهّز لك النظام. وفي الخلفية تُحفظ كل رسالة قبل إرسالها، ويُعاد إرسالها إن تأخر واتساب، فلا تضيع في لحظة بطء.",
        },
        {
          id: "pay-online",
          q: "عملائي لا يدفعون إلكترونياً.",
          a: "ليس عليهم ذلك. روابط الدفع بالبطاقة لم تُفعَّل بعد، وحين تُفعَّل يكون الرابط خياراً لا إلزاماً. والعملاء الدائمون أصحاب الحسابات الآجلة يسجّلون الطلب على حسابهم.",
        },
        {
          id: "not-technical",
          q: "لست خبيراً بالتقنية.",
          a: "ولا تحتاج إلى ذلك. نحن نجهّز كل شيء، وندرّب فريقك، ونعدّل متى طلبت.",
        },
        {
          id: "data",
          q: "هل بياناتي آمنة؟",
          a: "سجلات كل منشأة مفصولة داخل قاعدة البيانات نفسها، وتستخدم ALYR منصة واتساب للأعمال الرسمية. وصُمّمت ALYR بحيث لا تحتفظ بأموالك أبداً.",
        },
        {
          id: "message-fees",
          q: "كم تكلّف رسائل واتساب؟",
          a: "تحتسب Meta رسوماً على بعض رسائل واتساب بأسعارها، وهي التي تحدد أي الرسائل تُحتسب. وتصلك فاتورتها من Meta مباشرة، ولا تضيف ALYR شيئاً. ونراجع معك الأسعار الحالية خلال الزيارة.",
        },
        {
          id: "contract",
          q: "هل أنا ملزم بمدة طويلة؟",
          a: "لا. بيننا اتفاق مكتوب، لكن الاشتراك شهري، ويمكنك إيقافه في نهاية أي شهر، على أن تُبلغنا قبل 7 أيام.",
        },
        {
          id: "whatsapp-line",
          q: "هل أستطيع مراسلتكم على واتساب؟",
          a: "سيتوفر رقم واتساب الخاص بنا قريباً. وحتى ذلك الحين راسلنا بالبريد، ويردّ عليك شخص من ALYR.",
          state: "email",
        },
      ],
    },
    final: {
      title: "نريك ALYR على هاتفك أنت.",
      body: "أرسل لنا رسالة، ويردّ عليك شخص من ALYR ثم يزورك في محلك.",
    },
    sample: {
      shop: "مخبز قرفة",
      monogram: "ق",
      track: {
        context: "تتبّع الطلب",
        eyebrow: "طلبك",
        title: "الطلب رقم 1439",
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
    },
  },
  product: {
    bar: {
      label: "ALYR Chat",
      links: [
        { id: "how", label: "كيف يعمل" },
        { id: "inside", label: "ماذا يتضمن" },
        { id: "works", label: "يعمل مع" },
      ],
    },
    eyebrow: "ALYR Chat · طلبات واتساب وصندوق الفريق · نجهّزه لك",
    title: "الطلبات داخل المحادثة.\nوصندوق واحد للفريق.",
    body:
      "يواصل عملاؤك مراسلتك كما اعتادوا. ويضيف ALYR Chat صفحة الطلب ورابط الدفع والتحديثات، وفريقك يرى كل شيء في مكان واحد.",
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
        id: "order",
        tab: "الطلب",
        start: 9 * 60 + 58,
        chat: [
          { from: "customer", text: "أحتاج فلترين للمكيف وثرموستات." },
          { from: "business", text: "تفضل صفحة الطلب، اختر ما تحتاجه.", action: "افتح صفحة الطلب" },
          { from: "business", text: "تم استلام الطلب رقم 1042: 3 أصناف، 385 ر.ق." },
        ],
        panel: {
          title: "الطلب رقم 1042",
          badge: "جديد",
          rows: [
            { lead: "2 ×", main: "فلتر مكيف", trail: "120 ر.ق", tone: "signal" },
            { lead: "1 ×", main: "ثرموستات رقمي", trail: "265 ر.ق", tone: "signal" },
          ],
          total: ["الإجمالي", "385 ر.ق"],
        },
        caption: "يطلب العميل من صفحة مصممة لهاتفه، ويراها فريقك لحظة وصولها.",
      },
      {
        id: "pay",
        tab: "الدفع",
        start: 10 * 60 + 6,
        chat: [
          { from: "business", text: "تم تأكيد الطلب رقم 1042. يمكنك الدفع من هنا.", action: "ادفع 385 ر.ق" },
          { from: "business", text: "تم استلام 385 ر.ق عن الطلب رقم 1042. شكراً لك." },
        ],
        panel: {
          title: "المدفوعات",
          badge: "اليوم",
          rows: [
            { main: "الطلب رقم 1042", sub: "مريم صالح", trail: "385 ر.ق · مدفوع", tone: "signal" },
            { main: "الطلب رقم 1039", sub: "خالد ناصر", trail: "210 ر.ق · مدفوع", tone: "done" },
          ],
        },
        caption: "روابط الدفع جاهزة ومجرّبة على صفحة تجريبية. وصُمّمت ALYR بحيث لا تحتفظ بأموالك.",
      },
      {
        id: "track",
        tab: "التتبّع",
        start: 10 * 60 + 5,
        chat: [
          { from: "business", text: "تم تأكيد الطلب رقم 1042." },
          { from: "business", text: "الطلب رقم 1042 جاهز للاستلام." },
          { from: "customer", text: "أنا في الطريق." },
        ],
        panel: {
          title: "الطلب رقم 1042",
          badge: "جاهز",
          rows: [
            { lead: "10:02", main: "تم الاستلام", tone: "done" },
            { lead: "10:05", main: "تم التأكيد", tone: "done" },
            { lead: "11:40", main: "جاهز للاستلام", trail: "أُبلغ العميل", tone: "signal" },
            { lead: "", main: "تم التسليم", tone: "quiet" },
          ],
        },
        caption: "كل تغيير في الحالة يصل إلى العميل برسالة، فلا يحتاج أحد أن يسأل.",
      },
      {
        id: "inbox",
        tab: "صندوق الفريق",
        start: 17 * 60 + 20,
        chat: [
          { from: "customer", text: "هل الثرموستات عليه ضمان؟" },
          { from: "staff", text: "نعم، ضمان 12 شهراً. سأحضر الإيصال معي غداً." },
        ],
        panel: {
          title: "المحادثات",
          badge: "3 مفتوحة",
          rows: [
            { main: "مريم صالح", sub: "هل الثرموستات عليه ضمان؟", trail: "يوسف", tone: "signal" },
            { main: "خالد ناصر", sub: "هل وصلت قطعة المولّد؟", trail: "غير مسندة", tone: "quiet" },
            { main: "ملاحظة داخلية", sub: "مريم تفضّل الاتصال بعد 5 مساءً.", trail: "للفريق فقط", tone: "done" },
          ],
        },
        caption: "رقم واحد والفريق كله. وحين يردّ أحد الموظفين تتوقف الردود الآلية.",
      },
    ],
    facts: [
      {
        title: "رقمك، نتفق عليه عند التجهيز",
        body: "نتفق معك عند التجهيز على الرقم الذي يراسلك عليه عملاؤك، ونراجع معك متطلبات Meta أولاً.",
      },
      {
        title: "لا تحتفظ بأموالك",
        body: "روابط الدفع جاهزة ومجرّبة على صفحة تجريبية. وسيمرّ الدفع الفعلي عبر حسابك لدى مزوّد دفع قطري، وهذا الربط لم يبدأ بعد.",
      },
      {
        title: "لا رسالة بلا موافقة",
        body: "من يطلب الإيقاف لا تصله رسائل بعدها، وكل موافقة تُسجَّل.",
      },
    ],
    flow: {
      eyebrow: "كيف يعمل",
      title: "ماذا يحدث حين يطلب عميل.",
      body:
        "عميلك يرى محادثة عادية. وخلفها ترسل ALYR صفحة الطلب، وتحفظ السجل، وتبلّغ العميل عند كل خطوة. تابع طلباً واحداً من أوله إلى آخره.",
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
          id: "order",
          tab: "عميل يطلب",
          steps: [
            {
              move: "in",
              title: "عميل يراسل رقمك",
              body: "مريم تراسلك على واتساب، وتصل الرسالة إلى ALYR عبر منصة واتساب للأعمال الرسمية.",
              chat: { from: "customer", text: "السلام عليكم، أبي أطلب للاستلام" },
              work: ["تم استلام الرسالة", "العميلة: مريم صالح"],
            },
            {
              title: "كلمة طلب، فتردّ ALYR",
              body: "كلمة «أطلب» من الكلمات التي تردّ عليها ALYR تلقائياً بالعربية والإنجليزية، وما عداها يذهب إلى فريقك.",
              work: ["نوع الرسالة: طلب"],
            },
            {
              move: "out",
              title: "تصلها صفحة الطلب فوراً",
              body: "يعود الرد من الطريق نفسه وبلغتها، ومعه رابط صفحة الطلب.",
              chat: { from: "business", text: "تفضل، اختر طلبك من هنا.", action: "افتح صفحة الطلب" },
              work: ["تم إرسال الرد"],
            },
            {
              move: "in",
              title: "تطلب من الصفحة",
              body: "منتجاتك وأسعارك في صفحة تُفتح من المحادثة، بلا تطبيق ولا حساب.",
              chat: { from: "event", text: "طلبت 3 أصناف، 385 ر.ق" },
              work: ["تم حفظ الطلب رقم 1042"],
            },
            {
              move: "team",
              title: "فريقك يرى الطلب",
              body: "يظهر على شاشة الطلبات لحظة وصوله، ولم ينسخ أحد شيئاً من المحادثة.",
              record: { id: "order", lead: "#1042", main: "مريم صالح · 3 أصناف", sub: "385 ر.ق", trail: "جديد", tone: "signal" },
              work: ["الطلب رقم 1042: جديد، غير مسند"],
            },
            {
              move: "out",
              title: "يصلها التأكيد",
              body: "مع الإجمالي ورابط الدفع وصفحة تتبّع خاصة بطلبها.",
              chat: { from: "business", text: "تم استلام الطلب رقم 1042: 3 أصناف، 385 ر.ق." },
              work: ["تم إرسال التأكيد", "أُنشئت صفحة التتبّع"],
            },
          ],
        },
        {
          id: "moves",
          tab: "الطلب يتقدّم",
          steps: [
            {
              move: "back",
              title: "يضغط يوسف «تأكيد»",
              body: "ضغطة واحدة على شاشة الطلبات، ويصير الطلب باسمه، فيعرف الفريق من يتولاه.",
              record: { id: "order", lead: "#1042", main: "مريم صالح · 3 أصناف", sub: "يوسف", trail: "مؤكد", tone: "signal" },
              work: ["الطلب رقم 1042: أكّده يوسف"],
            },
            {
              move: "out",
              title: "يصل الخبر إليها فوراً",
              body: "كل تغيير في الحالة يصلها برسالة، وبلغتها.",
              chat: { from: "business", text: "تم تأكيد الطلب رقم 1042." },
              work: ["تم إرسال الرسالة"],
            },
            {
              move: "back",
              title: "جاهز، بضغطة أخرى",
              body: "يضع يوسف عليه «جاهز» حين يُغلَّف.",
              record: { id: "order", lead: "#1042", main: "مريم صالح · 3 أصناف", sub: "يوسف", trail: "جاهز", tone: "signal" },
              work: ["الطلب رقم 1042: جاهز"],
            },
            {
              move: "out",
              title: "صفحة التتبّع تتحدّث تلقائياً",
              body: "تم استلام الطلب، أكّده المتجر، جاهز للاستلام: كل خطوة بوقتها، ومن يتولى الطلب.",
              chat: { from: "business", text: "الطلب رقم 1042 جاهز للاستلام." },
              work: ["صفحة التتبّع: جاهز للاستلام"],
            },
            {
              move: "back",
              title: "مكتمل حين تستلمه",
              body: "حين يُحدَّد مكتملاً يُغلق الطلب، وتصلها رسالة أخيرة.",
              record: { id: "order", lead: "#1042", main: "مريم صالح · 3 أصناف", sub: "يوسف", trail: "مكتمل", tone: "done" },
              work: ["الطلب رقم 1042: مكتمل"],
            },
          ],
        },
        {
          id: "person",
          tab: "موظف يتدخل",
          steps: [
            {
              move: "in",
              title: "سؤال يحتاج إلى موظف",
              body: "ليس كل شيء يصلح أن يكون آلياً. مريم تسأل عن أمر لا يجيب عنه إلا فريقك.",
              chat: { from: "customer", text: "هل الثرموستات عليه ضمان؟" },
              work: ["تم استلام الرسالة"],
            },
            {
              move: "team",
              title: "تصل إلى صندوق الفريق",
              body: "كل محادثة على رقمك في صندوق واحد يراه الفريق كله، أياً كان المناوب.",
              record: { id: "chat", main: "مريم صالح", sub: "هل الثرموستات عليه ضمان؟", trail: "غير مسندة", tone: "quiet" },
              work: ["حُفظت في صندوق الفريق"],
            },
            {
              move: "back",
              title: "يوسف يردّ من شاشته",
              body: "يكتب الرد في مساحة العمل، وتصير المحادثة باسمه، فيعرف الفريق من يتولاها.",
              record: { id: "chat", main: "مريم صالح", sub: "هل الثرموستات عليه ضمان؟", trail: "يوسف", tone: "signal" },
              work: ["المحادثة مع يوسف"],
            },
            {
              title: "الردود الآلية تتنحّى",
              body: "حين يردّ موظف تتوقف ALYR عن الرد التلقائي على ما تكتبه مريم، وتعود حين تُغلق المحادثة.",
              work: ["أُوقفت الردود التلقائية لهذه المحادثة"],
            },
            {
              move: "out",
              title: "الرد يخرج من رقمك",
              body: "مريم ترى شركة واحدة ورقماً واحداً، ولا يهمها من أي شاشة جاء الرد.",
              chat: { from: "business", text: "نعم، ضمان 12 شهراً. سأحضر الإيصال معي غداً." },
              work: ["أُرسل الرد من رقمك"],
            },
            {
              move: "team",
              title: "ملاحظة تبقى مع العميل",
              body: "يترك يوسف ملاحظة لزميله القادم. الملاحظات للفريق فقط ولا تُرسل للعميل أبداً.",
              record: { id: "note", main: "ملاحظة داخلية", sub: "مريم تفضّل الاتصال بعد 5 مساءً.", trail: "للفريق فقط", tone: "done" },
              work: ["حُفظت الملاحظة، للفريق فقط"],
            },
          ],
        },
      ],
    },
    inside: {
      eyebrow: "ماذا يتضمن",
      title: "كل ما يفعله اليوم.",
      note: "نجهّز ALYR Chat معك في محلك. كل ما في هذه القائمة جاهز، ونتفق معك على الرقم عند تجهيزه لك.",
      groups: [
        {
          name: "لعملائك",
          items: [
            { title: "صفحة طلب تناسب الهاتف", body: "منتجاتك وأسعارك في صفحة تُفتح من المحادثة، بلا تطبيق ولا حساب." },
            { title: "الدفع برابط", body: "رابط دفع في المحادثة، ورسالة تؤكد السداد لحظة الدفع. جاهز ومجرّب على صفحة تجريبية، والدفع بالبطاقات لم يبدأ بعد." },
            { title: "تتبّع الطلب", body: "لكل طلب صفحة خاصة به، تُظهر كل خطوة ومن يتولاه." },
            { title: "تحديثات بلا سؤال", body: "تم التأكيد، جاهز، مكتمل: كل تغيير في الحالة يصلهم برسالة." },
            { title: "بالعربية أو الإنجليزية", body: "تردّ ALYR باللغة التي يكتب بها العميل." },
          ],
        },
        {
          name: "لفريقك",
          items: [
            { title: "صندوق واحد للفريق", body: "كل المحادثات على رقمك في مكان واحد. يتولى أي موظف المحادثة، ويرى الفريق من يتولاها." },
            { title: "تدخّل في أي لحظة", body: "حين يردّ موظف تتوقف الردود الآلية مع ذلك العميل إلى أن تُغلق المحادثة." },
            { title: "ملاحظات وردود جاهزة", body: "ملاحظات لا يراها إلا الفريق، وإجابات جاهزة للأسئلة التي تتكرر كل يوم." },
            { title: "لكل طلب مسؤول", body: "لكل محادثة وطلب موظف مسؤول، وسجلّ من فعل ماذا لا يمكن تعديله." },
          ],
        },
        {
          name: "في الخلفية",
          items: [
            { title: "قواعد واتساب علينا", body: "ردود عادية خلال 24 ساعة من رسالة العميل، وبعدها صياغة معتمدة. وتختار ALYR المناسب في كل مرة." },
            { title: "الإيقاف يعني الإيقاف", body: "من يطلب الإيقاف لا تصله رسائل بعدها، وكل موافقة مسجّلة." },
            { title: "لا شيء يضيع", body: "تُحفظ كل رسالة قبل إرسالها، ويُعاد إرسالها إن تأخر واتساب. والتعذّر يظهر ولا يُخفى." },
            { title: "سجلاتك منفصلة", body: "بيانات كل منشأة مفصولة داخل قاعدة البيانات نفسها، لا بإعداد قد يُنسى." },
            { title: "سُلّمت وقُرئت", body: "تسجّل ALYR متى سُلّمت كل رسالة ومتى قُرئت." },
          ],
        },
      ],
    },
    why: {
      eyebrow: "كيف يفيدك",
      statement:
        "عملاؤك يراسلونك قبل أن يزوروك أو يطلبوا. تضيع المحادثات، وتُكتب الطلبات على الورق، ويصير الدفع صورة تحويل. والأعمال الرابحة تجعل المحادثة واجهة محلها.",
      pillars: [
        {
          title: "بِع أكثر",
          body: "لا تضيع الطلبات في المحادثة، حتى بعد الدوام أو في زحمة الجمعة.",
        },
        {
          title: "احتفظ بربحك",
          body: "الطلبات التي تصلك مباشرة بلا عمولة تطبيقات التوصيل، وقائمة عملائك تبقى لك.",
        },
        {
          title: "سهل",
          body: "نجهّزه لك، وعملاؤك لا يحتاجون تطبيقاً جديداً.",
        },
        {
          title: "موثوق",
          body: "شخص من ALYR تتحدث إليه، ومنتج بالعربية والإنجليزية، ومنصة واتساب للأعمال الرسمية.",
        },
      ],
    },
    who: {
      eyebrow: "لمن صُمّم",
      title: "للأنشطة التي تعمل على واتساب أصلاً.",
      rows: [
        {
          name: "المطاعم والمقاهي",
          body: "قائمتك داخل محادثة عملائك. الطلبات تصلك مباشرة، وزبائنك الدائمون يبقون لك.",
          tags: ["طلب", "دفع"],
        },
        {
          name: "الصالونات ومحلات الحلاقة",
          body: "للحجوزات والتذكيرات منتجها الخاص الآن.",
          tags: [],
          link: { key: "bookings", label: "تعرّف على ALYR Bookings" },
        },
        {
          name: "الخدمات المنزلية والميدانية",
          body: "قطع ومستلزمات تُطلب من صفحة، وتحديث عند كل خطوة.",
          tags: ["طلب", "تتبّع"],
        },
        {
          name: "المحلات والتجارة",
          body: "طلبات وروابط دفع. وأضف ALYR Accounts لعملاء الآجل.",
          tags: ["طلب", "دفع"],
          link: { key: "accounts", label: "تعرّف على ALYR Accounts" },
        },
      ],
      other: "نشاطك مختلف؟ راسلنا وأخبرنا كيف تعمل اليوم.",
    },
    works: {
      eyebrow: "المنتجات",
      title: "يعمل مع بقية منتجات ALYR.",
      link: "تعرّف على {name}",
      rows: {
        bookings: "المواعيد من المحادثة نفسها، مع التذكيرات.",
        agent: "يأتي مع ALYR Chat: المبيعات مقارنةً بالأيام نفسها من الأسبوع الماضي، والطلبات المنتظرة.",
        accounts: "دع زبائنك الدائمين يسجّلون الطلب على حسابهم.",
        shelf: "تعرض صفحة طلبك أصنافك: الصور والمقاسات وما نفد منها.",
        docs: "إيصال مرقّم لكل طلب مدفوع، في المحادثة.",
      },
    },
    cta: {
      title: "أخبرنا كيف تصلك الطلبات اليوم.",
      body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Chat على هاتفك أنت.",
    },
  },
  pages: {
    // --------------------------------------------------------------- /bookings
    bookings: {
      bar: {
        label: "ALYR Bookings",
        links: [
          { id: "how", label: "كيف يعمل" },
          { id: "inside", label: "ماذا يتضمن" },
          { id: "works", label: "يعمل مع" },
        ],
      },
      hero: {
        eyebrow: "ALYR Bookings · المواعيد والتذكيرات · نجهّزه لك",
        title: ["عملاؤك يحجزون من المحادثة.", "وتذكّرهم ALYR قبل موعدهم."],
        lead:
          "يختار عملاؤك الخدمة والوقت المتاح من صفحة تُفتح من المحادثة، بلا تطبيق. يصلهم التأكيد فوراً، والتذكير قبل الموعد بساعتين، ويسجّل فريقك من حضر.",
        facts: ["الأوقات المتاحة من ساعات عملك", "تذكير قبل الموعد بساعتين", "حجز واحد في الوقت نفسه، لكرسي واحد أو غرفة واحدة"],
        factsOffer: ["من 449 ر.ق شهرياً، أو 150 ر.ق مع ALYR Chat أو ALYR Accounts"],
      },
      demo: {
        business: "صالون ضفيرة",
        avatar: "ض",
        businessMeta: "حساب أعمال",
        today: "اليوم",
        typeHere: "مراسلة",
        workspace: "مساحة العمل",
        note: "محادثة توضيحية مع صالون غير حقيقي.",
        tabsLabel: "ماذا يفعل ALYR Bookings",
        pause: "إيقاف العرض",
        play: "تشغيل العرض",
        demos: [
          {
            id: "book",
            tab: "احجز",
            start: 16 * 60 + 40,
            chat: [
              { from: "customer", text: "السلام عليكم، ممكن أحجز قص وتسشوار يوم السبت؟" },
              { from: "business", text: "اختر الخدمة والوقت المناسب من هنا: alyr.qa/b/dafira" },
            ],
            panel: {
              kicker: "هاتفها",
              title: "صفحة الحجز",
              badge: "السبت 17 أكتوبر",
              rows: [],
              page: {
                shop: "صالون ضفيرة",
                monogram: "ض",
                context: "حجز",
                eyebrow: "حجز من المحادثة",
                title: "احجز موعداً",
                as: "الحجز باسم",
                customer: "Rania H.",
                steps: ["اختر الخدمة", "اختر اليوم", "اختر الوقت"],
                services: [
                  { name: "قص وتسشوار", meta: "60 دقيقة · 180 ر.ق", on: true },
                  { name: "تسشوار", meta: "45 دقيقة · 120 ر.ق" },
                ],
                days: [
                  { top: "اليوم", day: "15", month: "أكتوبر" },
                  { top: "الجمعة", day: "16", month: "أكتوبر" },
                  { top: "السبت", day: "17", month: "أكتوبر", on: true },
                  { top: "الأحد", day: "18", month: "أكتوبر" },
                  { top: "الاثنين", day: "19", month: "أكتوبر" },
                ],
                times: ["12:30 م", "1:00 م", "4:00 م", "5:30 م", "7:30 م", "8:30 م"],
                time: "7:30 م",
                summary: ["قص وتسشوار", "السبت 17 أكتوبر · 7:30 م"],
                confirm: "تأكيد الحجز",
              },
            },
            caption: "الأوقات المتاحة تأتي من ساعات عملك، ولا يمكن لعميلين أن يحجزا الموعد نفسه.",
          },
          {
            id: "confirm",
            tab: "التأكيد",
            start: 16 * 60 + 43,
            chat: [
              { from: "business", text: "تم تأكيد حجزك رقم 412 لدى صالون ضفيرة: قص وتسشوار، 17/10 19:30. للإلغاء أرسل «حجزي»." },
            ],
            panel: {
              title: "الحجوزات",
              badge: "السبت 17 أكتوبر",
              rows: [
                { lead: "10:00 ص", main: "قص وتسشوار", sub: "Mona E. · هبة", trail: "محجوز", tone: "done" },
                { lead: "11:30 ص", main: "مانيكير وباديكير", sub: "Farah B. · سنا", trail: "محجوز", tone: "done" },
                { lead: "7:30 م", main: "قص وتسشوار", sub: "Rania H. · هبة", trail: "محجوز", tone: "signal" },
              ],
            },
            caption: "يصل التأكيد لحظة الحجز، باللغة التي يكتب بها العميل.",
          },
          {
            id: "remind",
            tab: "التذكير",
            start: 17 * 60 + 30,
            chat: [
              { from: "business", text: "تذكير: حجزك رقم 412 لدى صالون ضفيرة، 17/10 19:30." },
            ],
            panel: {
              title: "الحجز 412",
              badge: "السبت 17 أكتوبر",
              rows: [
                { lead: "7:30 م", main: "قص وتسشوار", sub: "Rania H. · هبة", trail: "محجوز", tone: "done" },
                { lead: "5:30 م", main: "أُرسل التذكير", sub: "قبل الموعد بساعتين", trail: "تم التسليم", tone: "signal" },
              ],
            },
            caption: "قبل الموعد بساعتين، تلقائياً. والحجز الملغى لا يُذكَّر به أبداً.",
          },
          {
            id: "cancel",
            tab: "الإلغاء",
            start: 16 * 60 + 50,
            chat: [
              { from: "customer", text: "حجزي" },
              { from: "business", text: "حجزك رقم 412: قص وتسشوار، 17/10 19:30.", action: "إلغاء الحجز" },
              { from: "customer", text: "إلغاء الحجز" },
              { from: "business", text: "تم إلغاء حجزك." },
            ],
            panel: {
              title: "الحجوزات",
              badge: "السبت 17 أكتوبر",
              rows: [
                { lead: "7:30 م", main: "قص وتسشوار", sub: "Rania H.", trail: "ملغي", tone: "quiet" },
                { lead: "7:30 م", main: "متاح من جديد", sub: "لبقية العملاء", trail: "متاح", tone: "signal" },
              ],
            },
            caption: "كلمة «حجزي» تعرض الحجز القادم مع زر للإلغاء، ويعود الوقت متاحاً لغيره.",
          },
          {
            id: "came",
            tab: "الحضور",
            start: 16 * 60 + 20,
            chat: [],
            panel: {
              title: "الحجوزات",
              badge: "اليوم",
              rows: [
                { lead: "11:00 ص", main: "قص وتسشوار", sub: "Lina F. · هبة", trail: "حضر", tone: "done" },
                { lead: "3:00 م", main: "علاج الشعر", sub: "Maha S. · سنا · انتهى 4:00 م", acts: ["حضر", "لم يحضر"], tone: "signal" },
                { lead: "6:00 م", main: "تسشوار", sub: "Dana R. · هبة", trail: "محجوز", tone: "quiet" },
              ],
            },
            caption: "يسجّل فريقك «حضر» أو «لم يحضر»، ومن ذلك تُحسب أرقام الغياب.",
          },
        ],
      },
      flow: {
        eyebrow: "كيف يعمل",
        title: "ماذا يحدث حين يحجز عميل.",
        body:
          "عميلك يرى محادثة عادية. وخلفها تقرأ ALYR ساعات عملك، وتحجز الوقت، وتضبط التذكير. تابع حجزاً واحداً من أوله إلى آخره.",
        tabsLabel: "الأمثلة",
        stepsLabel: "الخطوات",
        pause: "إيقاف",
        play: "تشغيل",
        note: "محادثة توضيحية مع صالون غير حقيقي.",
        customer: { name: "عميلك", sub: "على واتساب كعادته" },
        whatsapp: { name: "واتساب", sub: "منصة الأعمال" },
        alyr: { name: "ALYR Bookings", sub: "يعمل في الخلفية", idle: "بانتظار الرسالة التالية" },
        team: { name: "فريقك", sub: "مساحة العمل", idle: "لا جديد بعد" },
        stories: [
          {
            id: "book",
            tab: "عميل يحجز",
            steps: [
              {
                move: "in",
                title: "عميل يراسل رقمك",
                body: "تكتب رانيا على واتساب، وتصل الرسالة إلى ALYR عبر منصة واتساب للأعمال الرسمية.",
                chat: { from: "customer", text: "السلام عليكم، ممكن أحجز قص وتسشوار يوم السبت؟" },
                work: ["تم استلام الرسالة", "العميلة: Rania H."],
              },
              {
                title: "كلمة حجز، فتردّ ALYR",
                body: "كلمة «أحجز» من الكلمات التي تردّ عليها ALYR تلقائياً بالعربية والإنجليزية. وما عداها يذهب إلى فريقك.",
                work: ["نوع الرسالة: حجز"],
              },
              {
                move: "out",
                title: "يصلها الرابط فوراً",
                body: "ولأن رسالتها بالعربية، تصلها الردود بالعربية.",
                chat: { from: "business", text: "اختر الخدمة والوقت المناسب من هنا: alyr.qa/b/dafira" },
                work: ["تم إرسال الرد"],
              },
              {
                move: "in",
                title: "تختار الوقت",
                body: "لا تعرض الصفحة إلا الأوقات المتاحة في ساعات عملك. وعند التأكيد تتحقق ALYR من الموعد مرة أخرى وتحجزه.",
                chat: { from: "event", text: "اختارت السبت 17 أكتوبر، 7:30 م" },
                work: ["تم التحقق من الموعد وحجزه"],
              },
              {
                move: "team",
                title: "فريقك يرى الحجز، ومن يتولاه",
                body: "يظهر على شاشة الحجوزات لحظة إتمامه، ومعه موظف مسؤول.",
                record: { id: "booking", lead: "7:30 م", main: "قص وتسشوار", sub: "Rania H. · هبة", trail: "محجوز", tone: "signal" },
                work: ["تم حفظ الحجز 412"],
              },
              {
                move: "out",
                title: "تأكيد الآن، وتذكير لاحقاً",
                body: "تؤكد ALYR الحجز فوراً، وتضبط تذكيراً قبل الموعد بساعتين. وفريقك لم يكتب حرفاً.",
                chat: { from: "business", text: "تم تأكيد حجزك رقم 412 لدى صالون ضفيرة: قص وتسشوار، 17/10 19:30." },
                work: ["تم إرسال التأكيد", "تذكير مضبوط الساعة 5:30 م"],
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
                work: ["حان التذكير: الحجز 412"],
              },
              {
                title: "تتأكد أن الحجز ما زال قائماً",
                body: "الحجز الملغى أو المنقول إلى وقت آخر يُتجاوز، فلا يُذكَّر أحد بزيارة لن تتم.",
                work: ["الحجز 412: ما زال قائماً"],
              },
              {
                title: "تراجع قواعد واتساب",
                body: "آخر رسالة من رانيا مضى عليها أكثر من 24 ساعة. عندها لا يسمح واتساب إلا بصياغة وافق عليها مسبقاً، فتستخدمها ALYR. ولو طلبت الإيقاف لما أُرسل شيء.",
                work: ["الموافقة: مسجّلة", "آخر رسالة: قبل أكثر من 24 ساعة", "اختيرت الصياغة المعتمدة"],
              },
              {
                move: "out",
                title: "يصل التذكير",
                body: "يصل إلى هاتفها من رقمك، وباللغة التي تراسلك بها.",
                chat: { from: "business", text: "تذكير: حجزك رقم 412 لدى صالون ضفيرة، 17/10 19:30." },
                work: ["تم إرسال التذكير"],
              },
              {
                move: "team",
                title: "فريقك يعرف أنها قرأته",
                body: "يبلّغ واتساب حين تُسلَّم الرسالة وحين تُقرأ، وتحفظ ALYR ذلك في السجل.",
                record: { id: "reminder", lead: "5:30 م", main: "تذكير، الحجز 412", sub: "Rania H.", trail: "قُرئ", tone: "signal" },
                work: ["تم التسليم", "قُرئت"],
              },
            ],
          },
          {
            id: "marked",
            tab: "الفريق يسجّل الزيارة",
            steps: [
              {
                title: "تنتهي الزيارة",
                body: "عند 8:30 م ينتهي القص والتسشوار. ويبقى «محجوزاً» إلى أن يسجّله أحد.",
                work: ["الحجز 412: انتهى ولم يُسجَّل"],
              },
              {
                move: "team",
                title: "يظهر في ALYR Agent",
                body: "تحت «يحتاجك الآن»: «زيارة بلا تسجيل حضور. أرقام الغياب ناقصة حتى تُسجَّل.»",
                record: { id: "visit", lead: "7:30 م", main: "قص وتسشوار", sub: "Rania H. · هبة", trail: "لم تُسجَّل", tone: "quiet" },
                work: ["القاعدة · محجوز وانتهى وقته · زيارة واحدة"],
              },
              {
                move: "back",
                title: "نقرة واحدة: حضر",
                body: "تضغط هبة «حضر» على شاشة الحجوزات.",
                record: { id: "visit", lead: "7:30 م", main: "قص وتسشوار", sub: "Rania H. · هبة", trail: "حضر", tone: "signal" },
                work: ["سُجّل: حضر"],
              },
              {
                title: "تبقى الأرقام صحيحة",
                body: "الغياب خلال 30 يوماً، ومن تغيّب مرتين ثم حجز من جديد، يُحسبان من هذا التسجيل.",
                work: ["حُدّثت أرقام الغياب", "يحتاجك الآن: لا شيء"],
              },
            ],
          },
        ],
      },
      screen: {
        eyebrow: "الشاشة",
        title: "اليوم والأيام السبعة القادمة، على شاشة واحدة.",
        caption: { n: "02", text: "شاشة الحجوزات" },
        label: "شاشة الحجوزات في مساحة عمل صالون غير حقيقي",
        callouts: [
          "كل زيارة حُجزت من المحادثة، بترتيب الوقت.",
          "من يتولى كل زيارة.",
          "حضر أو لم يحضر أو إلغاء، بنقرة واحدة.",
          "حين تفتحها من ALYR Agent، لا تعرض إلا الزيارات التي عدّتها القاعدة.",
        ],
        sheet: {
          path: "الحجوزات",
          sub: "اليوم والأيام السبعة القادمة، من المحادثة",
          heads: { when: "الموعد", service: "الخدمة", customer: "العميل", by: "المسؤول", status: "الحالة" },
          acts: { came: "حضر", noShow: "لم يحضر", cancel: "إلغاء" },
          rows: [
            { when: "15/10 15:00", ref: "#398", service: "علاج الشعر", customer: "Maha S.", by: "سنا راو", status: "محجوز", ended: true },
            { when: "15/10 18:00", ref: "#401", service: "تسشوار", customer: "Dana R.", by: "هبة طاهر", status: "محجوز" },
            { when: "16/10 14:00", ref: "#403", service: "قص وتسشوار", customer: "Noor A.", by: "هبة طاهر", status: "محجوز" },
            { when: "16/10 17:00", ref: "#405", service: "صبغة شعر", customer: "Sara M.", by: "سنا راو", status: "محجوز" },
            { when: "17/10 10:00", ref: "#407", service: "قص وتسشوار", customer: "Mona E.", by: "هبة طاهر", status: "محجوز" },
            { when: "17/10 11:30", ref: "#408", service: "مانيكير وباديكير", customer: "Farah B.", by: "سنا راو", status: "محجوز" },
          ],
          filtered: {
            label: "زيارات لم تُسجَّل بعد",
            show: "اعرض الكل",
            caption: "حين تُفتح من ALYR Agent: الزيارة التي عدّتها القاعدة فقط.",
          },
        },
      },
      inside: {
        eyebrow: "ماذا يتضمن",
        title: "كل ما يفعله اليوم.",
        groups: [
          {
            name: "لعملائك",
            items: [
              "صفحة حجز من المحادثة: الخدمة واليوم والوقت، بلا تطبيق ولا حساب.",
              "لا تظهر إلا الأوقات المتاحة فعلاً، من ساعات عملك وحجوزاتك الحالية.",
              "ملاحظة لك إن أرادوا إضافتها.",
              "التأكيد فوراً، بلغتهم.",
              "تذكير قبل الموعد بساعتين.",
              "«حجزي» لعرض الحجز القادم أو إلغائه.",
            ],
          },
          {
            name: "لفريقك",
            items: [
              "اليوم والأيام السبعة القادمة، ومن يتولى كل زيارة.",
              "«حضر» أو «لم يحضر» بنقرة واحدة.",
              "المحادثة التي جاء منها كل حجز، في صندوق الفريق.",
              "في ALYR Agent: زيارات لم تُسجَّل، ونسبة الغياب خلال 30 يوماً، ومن تكرر غيابه وحجز من جديد، والأيام الهادئة القادمة، والعملاء الذين حان موعد عودتهم.",
            ],
          },
          {
            name: "في الخلفية",
            items: [
              "لا يأخذ عميلان الوقت نفسه أبداً: يُتحقق من الموعد مرة أخرى ويُحجز.",
              "الحجز الملغى لا يُذكَّر به.",
              "قواعد واتساب علينا: رسائل عادية خلال 24 ساعة من رسالة العميل، وصياغة معتمدة بعدها.",
              "الإيقاف يعني الإيقاف.",
            ],
          },
        ],
        notYet: {
          title: "لم يتوفر بعد",
          items: [
            "حجوزات متزامنة حسب الموظف أو الكرسي أو الغرفة. وهي الخطوة التالية في ALYR Bookings.",
            "نقل حجز أو إضافة عميل بلا موعد من الشاشة.",
            "تعديل الخدمات وساعات العمل بنفسك. تعدّلها ALYR عند طلبك.",
            "أخذ عربون أو دفعة عند الحجز.",
            "اختيار موعد إرسال التذكير.",
            "رسائل لاستعادة العملاء الذين حان موعد عودتهم. تحتاج أولاً إلى موافقة تسويقية.",
          ],
        },
        note: "نجهّز ALYR Bookings معك في محلك. كل ما فوق الخط جاهز.",
      },
      who: {
        eyebrow: "لمن صُمّم",
        title: "للأنشطة التي تخدم عميلاً واحداً في كل مرة.",
        rows: [
          { name: "محلات الحلاقة والصالونات بكرسي واحد", tags: ["حجز", "تذكير", "حضور"] },
          { name: "الخدمات المنزلية بفريق واحد", tags: ["زيارات", "تذكير"] },
          { name: "المدرّسون والمدرّبون والمستشارون", tags: ["حجز", "تذكير"] },
        ],
        other: "أكثر من كرسي أو غرفة؟ أخبرنا كم لديك، ونقول لك بصراحة إن كان يناسبك الآن.",
      },
      works: {
        eyebrow: "المنتجات",
        title: "يعمل مع بقية منتجات ALYR.",
        link: "تعرّف على {name}",
        rows: {
          chat: "خذ الطلبات أيضاً: المخبز يحجز مواعيد التذوّق ويبيع الكيك.",
          agent: "يأتي مع ALYR Bookings: زيارات لم تُسجَّل، والغياب خلال 30 يوماً، والعملاء الذين حان موعد عودتهم.",
          accounts: "دع عملاءك الدائمين يدفعون لاحقاً، وذكّرهم بلباقة.",
          shelf: "بِع منتجات إلى جانب خدماتك، ويطلبها عملاؤك عبر ALYR Chat.",
          docs: "إيصال للزيارة المدفوعة في المحل، أو إيصال عربون لجزء منها.",
        },
      },
      faq: {
        eyebrow: "أسئلة",
        title: "قبل أن تسأل.",
        items: [
          {
            id: "own",
            q: "هل أستطيع استخدامه وحده؟",
            a: "نعم. يعمل ALYR Bookings دون ALYR Chat، ويأتي معه صندوق الفريق لأن عملاءك يراسلونك فيه، ويأتي معه ALYR Agent.",
          },
          {
            id: "setup",
            q: "كم يستغرق التجهيز؟",
            a: "نتفق معك على موعد بدء التشغيل خلال الزيارة، ونضيف خدماتك وأسعارك وساعات عملك بأنفسنا.",
          },
          {
            id: "move",
            q: "كيف أنتقل من دفتري أو هاتفي؟",
            a: "نتفق خلال الزيارة على يوم الانتقال، وعلى طريقة نقل الحجوزات الموجودة لديك لما بعده.",
          },
          {
            id: "chairs",
            q: "لديّ أكثر من كرسي أو غرفة.",
            a: "يقبل ALYR Bookings اليوم حجزاً واحداً في الوقت نفسه للمنشأة كلها، وهذا يناسب كرسياً واحداً أو غرفة واحدة أو مختصاً واحداً. أما الحجوزات المتزامنة فهي الخطوة التالية في Bookings. أخبرنا كم لديك، ونقول لك بصراحة إن كان يناسبك الآن.",
          },
          {
            id: "no-show",
            q: "وإذا لم يحضر العميل؟",
            a: "يسجّل فريقك «لم يحضر». ويعرض لك ALYR Agent نسبة الغياب خلال 30 يوماً، وينبّهك إلى العميل الذي تغيّب مرتين ثم حجز من جديد.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف تصلك الحجوزات اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Bookings على هاتفك أنت.",
      },
    },

    // ------------------------------------------------------------------ /agent
    agent: {
      bar: {
        label: "ALYR Agent",
        links: [
          { id: "how", label: "كيف يعمل" },
          { id: "rules", label: "القواعد" },
          { id: "inside", label: "ماذا يتضمن" },
          { id: "works", label: "يعمل مع" },
        ],
      },
      hero: {
        eyebrow: "ALYR Agent · مع كل منتج",
        title: ["نشاطك بالأرقام.", "وما يحتاجك أولاً."],
        lead:
          "ALYR Agent هو الشاشة الرئيسية في مساحة عملك. يقول لك في جملة واحدة كيف يسير أسبوعك، ويعرض ما يحتاجك الآن، ويقترح حتى ثلاثة أمور، لكل منها القاعدة التي وراءه.",
        facts: ["مع كل منتجات ALYR", "كل اقتراح يُظهر قاعدته", "يُحسب من سجلاتك أنت"],
      },
      figure: {
        label: "الشاشة الرئيسية لـ ALYR Agent للنشاط التوضيحي الذي تختاره، وما أنجزته ALYR له عصر اليوم",
        caption: { n: "01", text: "ALYR Agent عصر يوم خميس" },
      },
      how: {
        eyebrow: "كيف يعمل",
        title: "سجلاتك، ثم القاعدة، ثم البطاقة، ثم الشاشة.",
        steps: [
          { title: "سجلاتك", body: "الطلبات والحجوزات والمحادثات والحسابات الآجلة التي يسجّلها فريقك أصلاً في ALYR." },
          { title: "القاعدة", body: "قواعد ثابتة، لكل منها حد أدنى، فلا يثير رقم صغير إنذاراً." },
          { title: "البطاقة", body: "حين تنطبق القاعدة، تظهر بطاقة تقول ما وجدته، والقاعدة مكتوبة تحتها." },
          { title: "الشاشة", body: "زرّها يفتح الشاشة على السجلات التي عدّتها بالضبط. وحين يُنجز العمل تُغلق البطاقة." },
        ],
        card: "اقتراح واحد كما يظهر على الشاشة",
        under: "يفتح الزر حساباتك الآجلة على هؤلاء العملاء الثلاثة. ولا يُرسل شيء حتى تضغط «أرسل التذكيرات» هناك.",
        caption: { n: "02", text: "اقتراح واحد، مفتوحاً" },
      },
      report: {
        eyebrow: "تقرير الأحد",
        title: "الأسبوع نفسه على واتساب، صباح كل يوم أحد.",
        body:
          "الساعة 9:00 صباح الأحد تصلك بطاقة فيها أهم رقم في أسبوعك الماضي مقارنة بالأسبوع الذي قبله، وكل يوم بجانب اليوم نفسه من الأسبوع الذي قبله، واثنان أو ثلاثة من أهم ما يخص نوع نشاطك. وتحتها سطر لكل منتج، وما أنجزته ALYR عنك، وخطوة تالية واحدة مع قاعدتها. وتبدأ أولى التقارير بعد موافقة واتساب على صياغة التقرير.",
        report: { caption: { n: "03", text: "تقرير الأحد على واتساب، عن 4⁠–⁠10 أكتوبر" } },
      },
      rules: {
        eyebrow: "القواعد",
        title: "يعدّ، ويقارن، ويُظهر القاعدة.",
        body: "لا تخمين ولا تقييم بالنقاط. هذه ست من القواعد، كما تظهر على شاشتك.",
        heads: ["ما يبحث عنه", "القاعدة كما تظهر على الشاشة"],
        rows: [
          { name: "عملاء بانتظار الرد", rule: "القاعدة · آخر رسالة من العميل ولم يُردّ عليها منذ 10 دقائق" },
          { name: "طلبات لم تُؤكَّد", rule: "القاعدة · جديد منذ أكثر من 15 دقيقة" },
          { name: "متأخر بلا تذكير", rule: "القاعدة · مستحق منذ 30 يوماً أو أكثر، دون وعد ودون تذكير خلال 7 أيام" },
          { name: "تغيّب مرتين وحجز من جديد", rule: "القاعدة · غياب مرتين أو أكثر خلال 90 يوماً، وحجز خلال الأيام السبعة القادمة" },
          {
            name: "زبائن دائمون انقطعوا",
            rule: "القاعدة · 3 طلبات أو زيارات أو أكثر قبل 31 إلى 120 يوماً، ولا شيء خلال آخر 30 يوماً",
            note: "للعلم فقط: مراسلتهم تحتاج إلى موافقتهم التسويقية، وALYR لا تجمعها بعد.",
          },
          { name: "نسبة الغياب", rule: "القاعدة · الغياب ÷ (الحضور + الغياب) خلال 30 يوماً؛ 10% أو أكثر مع 3 حالات أو أكثر" },
        ],
        notes: [
          "الأيام نفسها، لا الأمس: الأسبوع حتى الآن يُقارن بالأيام والساعات نفسها من الأسبوع الماضي.",
          "الأرقام الصغيرة تبقى أعداداً: لا نسبة مئوية إلا حين يبلغ الأسبوعان 20 أو أكثر، وما دون ذلك يظهر هكذا: «7 · الأسبوع الماضي 4».",
        ],
      },
      inside: {
        eyebrow: "ماذا يتضمن",
        title: "كل ما يفعله اليوم.",
        groups: [
          {
            name: "كل يوم، على شاشتك",
            items: [
              "جملة واحدة عن الأسبوع، مقارنةً بالأيام نفسها من الأسبوع الماضي.",
              "يحتاجك الآن: عملاء بانتظار الرد، وطلبات لم تُؤكَّد، وزيارات لم تُسجَّل. وتختفي حين يُنجز العمل.",
              "أربعة أرقام بحسب ما تبيعه.",
              "حتى ثلاثة اقتراحات حسب القاعدة، كل منها يفتح السجلات التي عدّها.",
              "«ليس الآن» يؤجل الاقتراح حتى تتغير أرقامه أو حتى يوم الأحد.",
              "أنجزته ALYR لك هذا الأسبوع: الرسائل التي أرسلتها، وتذكيرات المواعيد.",
              "الأسبوع يوماً بيوم وخلفه الأسبوع الماضي، وأكثر الساعات ازدحاماً خلال 28 يوماً، والأكثر طلباً أو حجزاً، والمستحقات حسب عمرها، والفريق بالأسماء.",
            ],
          },
          {
            name: "لفريقك",
            items: ["على هذه الشاشة يرى الموظف العمل الذي أمامه وأرقامه هو، لا أموال المحل."],
          },
          {
            name: "كل أسبوع، وفي كل مكان",
            items: ["تقرير الأحد لواتساب. وتبدأ أولى التقارير بعد موافقة واتساب على صياغته.", "بالعربية والإنجليزية، فاتح وداكن، على الهاتف والحاسوب."],
          },
        ],
        notYet: {
          title: "لم يتوفر بعد",
          items: [
            "شاشة لتقرير الأحد، واختيار يومه وساعته.",
            "رسائل للزبائن الدائمين الذين انقطعوا، من الاقتراح نفسه. تحتاج أولاً إلى موافقة تسويقية.",
            "نقرة على الرقم تفتح أسبوعه على الهاتف.",
            "عدد المحادثات التي رُدّ عليها بعد الدوام.",
            "النقد عند الكاونتر. المبيعات تُحسب من الطلبات، لا من النقد المحصَّل.",
          ],
        },
        note: "يأتي ALYR Agent مع كل منتجات ALYR. كل ما فوق الخط جاهز.",
      },
      who: {
        eyebrow: "لمن صُمّم",
        title: "يأتي مع كل نشاط يعمل بـ\u00a0ALYR.\nوما يتصدّر الشاشة يتبع نشاطك.",
        rows: [
          { name: "المطاعم والمقاهي والمخابز", tags: ["المبيعات هذا الأسبوع", "الطلبات هذا الأسبوع", "مستحق لك", "عادوا للطلب هذا الأسبوع"] },
          { name: "الصالونات ومحلات الحلاقة", tags: ["الزيارات هذا الأسبوع", "محجوز للأيام السبعة القادمة", "الغياب خلال 30 يوماً", "حجوزات جديدة هذا الأسبوع"] },
          { name: "الخدمات المنزلية", tags: ["المهام هذا الأسبوع", "محجوز للأيام السبعة القادمة", "مستحق لك", "الغياب خلال 30 يوماً"] },
          { name: "المحلات وتجارة الجملة", tags: ["مستحق لك", "المحصَّل هذا الأسبوع", "متأخر أكثر من 60 يوماً", "وعدوا بالسداد"] },
        ],
        other: "نشاطك مختلف؟ راسلنا وأخبرنا كيف تعمل اليوم.",
      },
      works: {
        eyebrow: "المنتجات",
        title: "يعمل مع بقية منتجات ALYR.",
        link: "تعرّف على {name}",
        rows: {
          chat: "المبيعات مقارنةً بالأيام نفسها من الأسبوع الماضي، والطلبات المنتظرة، والأكثر طلباً.",
          bookings: "الزيارات، والغياب خلال 30 يوماً، والعملاء الذين حان موعد عودتهم.",
          accounts: "المستحقات حسب عمرها، والمتأخر بلا تذكير، والوعود التي مضى موعدها.",
          shelf: "ما نفد الآن وما قلّ مخزونه.",
          docs: "الفواتير غير المدفوعة والمستندات التي لم تصل.",
        },
      },
      faq: {
        eyebrow: "أسئلة",
        title: "قبل أن تسأل.",
        items: [
          { id: "pay", offer: false, q: "هل أدفع مقابل ALYR Agent؟", a: "يأتي مع كل منتجات ALYR." },
          { id: "pay-offer", offer: true, q: "هل أدفع مقابل ALYR Agent؟", a: "لا، فهو مشمول مع كل منتجات ALYR." },
          {
            id: "suggestions",
            q: "من أين تأتي الاقتراحات؟",
            a: "من قواعد ثابتة مكتوبة تحت كل اقتراح. يعدّ سجلاتك أنت، ويقارن الأسبوع بالأيام نفسها من الأسبوع الماضي، ولا يعرض نسبة مئوية إلا حين يبلغ الأسبوعان 20 أو أكثر. هو يقترح، والقرار لك.",
          },
          {
            id: "trust",
            q: "هل يمكنني الوثوق بالأرقام؟",
            a: "كل رقم يُحسب من سجلاتك أنت، وكل اقتراح يفتح السجلات التي وراءه. ومما ينبغي أن تعرفه: الزيارة التي لم يسجّلها أحد لا تدخل نسبة الغياب حتى تُسجَّل، وأرقام المبيعات تعدّ الطلبات لا النقد المستلم عند الكاونتر.",
          },
          {
            id: "messages",
            q: "هل يراسل عملائي؟",
            a: "لا. ALYR Agent يعرض ويقترح فقط. أما الرسائل المعتادة، كالردود الآلية والتأكيدات وتذكيرات المواعيد، فتخرج من المنتجات التي تستخدمها، ويعدّها ALYR Agent تحت «أنجزته ALYR لك». ولا يُرسل تذكير بالدفع إلا حين تضغط «أرسل التذكيرات» في ALYR Accounts.",
          },
          {
            id: "staff",
            q: "هل يراه موظفيّ؟",
            a: "نعم. يرون على هذه الشاشة العمل الذي أمامهم وأرقامهم هم، لا أموال المحل، وأنت ومديروك ترون كل شيء.",
          },
        ],
      },
      cta: {
        title: "أخبرنا بما تريد أن تعرفه كل صباح.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Agent على هاتفك أنت.",
      },
    },

    // --------------------------------------------------------------- /accounts
    accounts: {
      bar: {
        label: "ALYR Accounts",
        links: [
          { id: "how", label: "كيف يعمل" },
          { id: "inside", label: "ماذا يتضمن" },
          { id: "works", label: "يعمل مع" },
        ],
      },
      hero: {
        eyebrow: "ALYR Accounts · الحسابات الآجلة · نجهّزه لك",
        title: ["اعرف من عليه مستحقات لك.", "وذكّره دون اتصال محرج."],
        lead:
          "سجّل البيع بالآجل بسطر واحد من هاتف الموظف، فيُبلَّغ العميل برصيده الجديد. وبضغطة واحدة تُرسل التذكيرات بنبرة تتدرّج مع عمر الدين، والوعد بالسداد يوقفها.",
        facts: ["يُسدَّد الأقدم أولاً", "لا تذكير مرتين خلال 3 أيام", "الإيقاف يعني الإيقاف"],
        factsOffer: ["من 449 ر.ق شهرياً، أو 150 ر.ق مع ALYR Chat أو ALYR Bookings"],
      },
      demo: {
        business: "مخبز قرفة",
        avatar: "ق",
        businessMeta: "حساب أعمال",
        today: "اليوم",
        typeHere: "مراسلة",
        workspace: "مساحة العمل",
        note: "محادثة توضيحية مع مخبز غير حقيقي وحساب أحد المكاتب.",
        tabsLabel: "ماذا يفعل ALYR Accounts",
        pause: "إيقاف العرض",
        play: "تشغيل العرض",
        demos: [
          {
            id: "record",
            tab: "التسجيل",
            start: 16 * 60 + 24,
            chat: [
              { from: "business", text: "مخبز قرفة: تم تسجيل شراء آجل بمبلغ 450 ر.ق. رصيدك الآن 3,150 ر.ق." },
            ],
            panel: {
              title: "Marina Desk Co-working",
              badge: "حساب آجل",
              rows: [
                { lead: "كريم", main: "Marina 450 credit", sub: "من هاتف الموظف", trail: "سُجّل", tone: "done" },
                { main: "بيع آجل · 450 ر.ق", sub: "تم إبلاغ العميل.", trail: "3,150 ر.ق", tone: "signal" },
              ],
            },
            caption: "سطر واحد من هاتف الموظف، ويُبلَّغ العميل بكل حركة.",
          },
          {
            id: "remind",
            tab: "التذكير",
            start: 16 * 60 + 40,
            chat: [
              {
                from: "business",
                text: "تذكير ودي من مخبز قرفة: عليك مبلغ 3,150 ر.ق. أقدم فاتورة غير مدفوعة منذ 35 يوماً. للدفع: alyr.qa/pay/…",
                actions: ["ادفع الآن", "سأدفع خلال أسبوع"],
              },
            ],
            panel: {
              title: "الحسابات الآجلة",
              badge: "إرسال التذكيرات",
              rows: [
                { main: "Marina Desk Co-working", sub: "أقدم دين: 35 يوماً · ودّي", trail: "تم التذكير", tone: "signal" },
                { main: "Bluefin Events", sub: "أقدم دين: 48 يوماً · ودّي", trail: "تم التذكير", tone: "done" },
                { main: "Ward Events", sub: "أقدم دين: 104 أيام · إشعار أخير", trail: "تم التذكير", tone: "done" },
                { main: "Palm Court Offices", sub: "وعد بالسداد قبل 19 أكتوبر", trail: "تم التخطي", tone: "quiet" },
              ],
              total: ["أُرسل", "3 تذكيرات، واستُثني عميل واحد"],
            },
            caption: "ودّي قبل 60 يوماً، وأشد لهجة من اليوم 60، وإشعار أخير من اليوم 90.",
          },
          {
            id: "promise",
            tab: "الوعد",
            start: 16 * 60 + 52,
            chat: [
              { from: "customer", text: "سأدفع خلال أسبوع" },
              { from: "business", text: "شكراً لك. سجلنا أنك ستدفع قبل 22/10. لن نرسل تذكيرات حتى ذلك التاريخ." },
            ],
            panel: {
              title: "Marina Desk Co-working",
              badge: "حساب آجل",
              rows: [
                { main: "الرصيد 3,150 ر.ق", sub: "أقدم دين: 35 يوماً", trail: "وعد بالسداد قبل 22 أكتوبر", tone: "signal" },
              ],
            },
            caption: "الوعد بالسداد يوقف التذكيرات حتى موعده، وإن مضى دون دفع يظهر في ALYR Agent.",
          },
          {
            id: "pay",
            tab: "الدفع",
            start: 19 * 60 + 5,
            chat: [
              { from: "customer", text: "ادفع 450" },
              { from: "business", text: "لدفع 450 ر.ق افتح الرابط: alyr.qa/pay/…" },
              { from: "business", text: "تم استلام 450 ر.ق. رصيدك الآن 2,700 ر.ق. شكراً لك." },
            ],
            panel: {
              title: "Marina Desk Co-working",
              badge: "الحركات",
              rows: [
                { lead: "15 أكتوبر", main: "دفعة · عبر رابط الدفع", trail: "−450 ر.ق", tone: "signal" },
                { lead: "15 أكتوبر", main: "بيع آجل", trail: "+450 ر.ق", tone: "done" },
              ],
              total: ["الرصيد", "2,700 ر.ق"],
            },
            caption: "صفحة الدفع ما زالت تجريبية، ولا تُنقل فيها أي أموال.",
          },
          {
            id: "accounts",
            tab: "الحسابات",
            start: 19 * 60 + 20,
            chat: [],
            panel: {
              title: "الحسابات الآجلة",
              badge: "5 عملاء عليهم مبالغ",
              rows: [
                { main: "Palm Court Offices", sub: "أقدم دين: 76 يوماً · وعد بالسداد قبل 19 أكتوبر", trail: "3,875 ر.ق", tone: "done" },
                { main: "Bluefin Events", sub: "أقدم دين: 48 يوماً · تم التذكير", trail: "3,450 ر.ق", tone: "done" },
                { main: "Marina Desk Co-working", sub: "أقدم دين: 35 يوماً · وعد بالسداد قبل 22 أكتوبر", trail: "2,700 ر.ق", tone: "signal" },
                { main: "Tamr Café", sub: "أقدم دين: 12 يوماً", trail: "1,700 ر.ق", tone: "done" },
                { main: "Ward Events", sub: "أقدم دين: 104 أيام · إشعار أخير", trail: "1,250 ر.ق", tone: "quiet" },
              ],
            },
            caption: "تُسدَّد أقدم الديون أولاً، كما يُقرأ الدفتر الورقي.",
          },
        ],
      },
      flow: {
        eyebrow: "كيف يعمل",
        title: "ماذا يحدث بين البيع بالآجل والسداد.",
        body:
          "عميلك يرى محادثة عادية. وخلفها تحفظ ALYR الدفتر، وتتحقق قبل أن تذكّر، وتتوقف حين يعد أحد بالسداد. تابع حساباً واحداً من أوله إلى آخره.",
        tabsLabel: "الأمثلة",
        stepsLabel: "الخطوات",
        pause: "إيقاف",
        play: "تشغيل",
        note: "محادثة توضيحية مع مخبز غير حقيقي.",
        customer: { name: "عميلك", sub: "على واتساب كعادته" },
        whatsapp: { name: "واتساب", sub: "منصة الأعمال" },
        alyr: { name: "ALYR Accounts", sub: "يعمل في الخلفية", idle: "بانتظار الحركة التالية" },
        team: { name: "فريقك", sub: "مساحة العمل", idle: "لا جديد بعد" },
        stories: [
          {
            id: "sale",
            tab: "بيع بالآجل",
            steps: [
              {
                move: "back",
                title: "سطر واحد من هاتف الموظف",
                body: "يرسل كريم «Marina 450 credit» إلى رقم المحل، من هاتف مسجّل في ALYR على أنه هاتف موظف.",
                work: ["رسالة موظف: كريم", "العميل: Marina Desk Co-working", "بيع آجل: 450 ر.ق"],
              },
              {
                move: "team",
                title: "تسجّله ALYR على حساب العميل",
                body: "الرصيد على شاشة الحسابات الآجلة محدّث لحظة وصول السطر.",
                record: { id: "acct", main: "Marina Desk Co-working", sub: "بيع آجل · 450 ر.ق", trail: "3,150 ر.ق", tone: "signal" },
                work: ["تم حفظ الحركة", "الرصيد: 3,150 ر.ق"],
              },
              {
                move: "out",
                title: "يُبلَّغ العميل برصيده الجديد",
                body: "كل حركة تصل إلى العميل، فيصير الدفتر مما رآه الطرفان.",
                chat: { from: "business", text: "مخبز قرفة: تم تسجيل شراء آجل بمبلغ 450 ر.ق. رصيدك الآن 3,150 ر.ق." },
                work: ["تم إرسال الإشعار"],
              },
              {
                move: "in",
                title: "أو يسجّل العميل طلبه على حسابه",
                body: "ومن صفحة الطلب، يضغط العميل الذي له حد ائتمان «سجّله على حسابي»، ويُرفض الطلب إن تجاوز الحد.",
                chat: { from: "event", text: "سجّله على حسابي" },
                work: ["تم التحقق من حد الائتمان", "طلب على الحساب"],
              },
            ],
          },
          {
            id: "remind",
            tab: "تذكير يُرسل",
            steps: [
              {
                move: "back",
                title: "تضغط «أرسل التذكيرات»",
                body: "ضغطة واحدة على شاشة الحسابات الآجلة تذكّر كل عميل مضى على أقدم دين غير مسدَّد له 30 يوماً أو أكثر.",
                work: ["إرسال التذكيرات: حسابات 30 يوماً أو أكثر"],
              },
              {
                title: "تتحقق قبل أن ترسل",
                body: "وعد قائم، أو عميل طلب الإيقاف، أو تذكير خلال آخر 3 أيام: أيٌّ منها يكفي لتخطّي ذلك العميل.",
                work: ["الوعد: لا يوجد", "الموافقة: مسجّلة", "آخر تذكير: قبل 9 أيام"],
              },
              {
                title: "تتدرّج النبرة مع العمر",
                body: "قبل 60 يوماً تذكير ودّي، ومن 60 أشد، ومن 90 إشعار أخير.",
                work: ["أقدم دين: 35 يوماً", "النبرة: ودّية"],
              },
              {
                move: "out",
                title: "يصل التذكير",
                body: "مع رابط دفع وزرّين: «ادفع الآن» و«سأدفع خلال أسبوع».",
                chat: { from: "business", text: "تذكير ودي من مخبز قرفة: عليك مبلغ 3,150 ر.ق. أقدم فاتورة غير مدفوعة منذ 35 يوماً.", action: "ادفع الآن" },
                work: ["تم إرسال التذكير"],
              },
              {
                move: "team",
                title: "فريقك يرى من ذُكِّر",
                body: "ومن تُخطّي، ولماذا.",
                record: { id: "acct", main: "Marina Desk Co-working", sub: "ذُكِّر اليوم", trail: "3,150 ر.ق", tone: "signal" },
                work: ["أُرسلت 3 تذكيرات، وتُخطّي عميل واحد"],
              },
            ],
          },
          {
            id: "promise",
            tab: "الوعد يوقفه",
            steps: [
              {
                move: "in",
                title: "يضغط العميل «سأدفع خلال أسبوع»",
                body: "نقرة واحدة من التذكير نفسه.",
                chat: { from: "customer", text: "سأدفع خلال أسبوع" },
                work: ["الرد: وعد بالسداد"],
              },
              {
                title: "تسجّل ALYR الموعد",
                body: "سبعة أيام من اليوم، ولا يصل هذا العميل أي تذكير حتى ذلك الحين.",
                work: ["وعد بالسداد قبل 22 أكتوبر", "أُوقفت التذكيرات"],
              },
              {
                move: "out",
                title: "يعرف العميل أن وعده سُجّل",
                body: "في المحادثة نفسها، وفوراً.",
                chat: { from: "business", text: "شكراً لك. سجلنا أنك ستدفع قبل 22/10. لن نرسل تذكيرات حتى ذلك التاريخ." },
                work: ["تم إرسال التأكيد"],
              },
              {
                move: "team",
                title: "فريقك يرى الوعد",
                body: "على الحساب، بجانب الرصيد.",
                record: { id: "acct", main: "Marina Desk Co-working", sub: "وعد بالسداد قبل 22 أكتوبر", trail: "3,150 ر.ق", tone: "signal" },
                work: ["الحساب: وعد بالسداد"],
              },
              {
                title: "إن مضى الموعد ولم يُدفع شيء",
                body: "يظهر في ALYR Agent مع قاعدته.",
                work: ["القاعدة · مضى موعد الوعد ولم يُدفع شيء"],
              },
            ],
          },
        ],
      },
      screen: {
        eyebrow: "الشاشة",
        title: "من عليه مستحقات لك، ومنذ متى.",
        caption: { n: "02", text: "الحسابات الآجلة" },
        label: "شاشة الحسابات الآجلة في مساحة عمل مخبز غير حقيقي",
        callouts: [
          "إجمالي المستحق لك.",
          "حسب العمر: 0–30، 31–60، 61–90، أكثر من 90 يوماً.",
          "أرسل التذكيرات للحسابات المتأخرة 30 يوماً أو أكثر.",
          "الوعد بالسداد، على كل حساب.",
          "حركات كل عميل.",
        ],
        sheet: {
          path: "الحسابات الآجلة",
          sub: "من عليه مبلغ، ومنذ متى",
          outstanding: "إجمالي المستحق",
          total: "12,975 ر.ق",
          owing: "5 عملاء عليهم مبالغ",
          buckets: [
            { label: "0–30 يوماً", amount: "6,678 ر.ق", share: 0.515 },
            { label: "31–60 يوماً", amount: "3,407 ر.ق", share: 0.263 },
            { label: "61–90 يوماً", amount: "1,640 ر.ق", share: 0.126 },
            { label: "أكثر من 90 يوماً", amount: "1,250 ر.ق", share: 0.096 },
          ],
          remind: "إرسال التذكيرات",
          remindHint: "للعملاء الذين مضى على أقدم دين غير مسدَّد لهم 30 يوماً أو أكثر",
          heads: { customer: "العميل", balance: "الرصيد", age: "أقدم دين" },
          rows: [
            { name: "Palm Court Offices", balance: "3,875 ر.ق", days: "76 يوماً", age: 2, promised: "وعد بالسداد قبل 19 أكتوبر" },
            { name: "Bluefin Events", balance: "3,450 ر.ق", days: "48 يوماً", age: 1 },
            { name: "Marina Desk Co-working", balance: "2,700 ر.ق", days: "35 يوماً", age: 1, on: true },
            { name: "Tamr Café", balance: "1,700 ر.ق", days: "12 يوماً", age: 0 },
            { name: "Ward Events", balance: "1,250 ر.ق", days: "104 أيام", age: 3 },
            { name: "Garden Gate Nursery", balance: "0 ر.ق", days: "مسدد", age: 0, settled: true },
          ],
          entries: {
            title: "الحركات",
            who: "Marina Desk Co-working",
            by: "المتابع: كريم",
            rows: [
              { at: "08 أكتوبر", what: "بيع آجل · الطلب رقم 1418", amount: "+800 ر.ق" },
              { at: "24 سبتمبر", what: "بيع آجل · الطلب رقم 1352", amount: "+1,100 ر.ق" },
              { at: "10 سبتمبر", what: "بيع آجل · الطلب رقم 1290", amount: "+800 ر.ق" },
              { at: "03 سبتمبر", what: "دفعة", amount: "−1,450 ر.ق", payment: true },
            ],
          },
        },
      },
      inside: {
        eyebrow: "ماذا يتضمن",
        title: "كل ما يفعله اليوم.",
        groups: [
          {
            name: "لعملائك",
            items: [
              "يُبلَّغون بكل حركة، مع الرصيد الجديد.",
              "كلمة «رصيدي» تعرض الرصيد وآخر الحركات، مع «ادفع الآن».",
              "الدفع كاملاً أو جزئياً من رابط («ادفع 500»).",
              "«سأدفع خلال أسبوع» بنقرة واحدة.",
            ],
          },
          {
            name: "لفريقك",
            items: [
              "تسجيل بيع أو دفعة بسطر واحد من هاتف الموظف.",
              "طلبات على الحساب للعملاء أصحاب حد الائتمان، وتُرفض إن تجاوزته (مع ALYR Chat).",
              "المستحقات حسب عمرها، ومن وعد بالسداد ومتى.",
              "إرسال التذكيرات لكل المتأخرين 30 يوماً أو أكثر بضغطة واحدة.",
              "موظف مسؤول عن كل حساب.",
              "في ALYR Agent: المتأخر بلا تذكير، والوعود التي مضى موعدها، وتجاوز الحد، ونمو الآجل 3 أسابيع متتالية.",
            ],
          },
          {
            name: "في الخلفية",
            items: [
              "يُسدَّد الأقدم أولاً.",
              "لا يُذكَّر أحد مرتين خلال 3 أيام.",
              "تتدرّج النبرة بحسب عمر الدين.",
              "الإيقاف يعني الإيقاف.",
            ],
          },
        ],
        notYet: {
          title: "لم يتوفر بعد",
          items: [
            "الدفع الفعلي عبر مزوّد الدفع الخاص بك. الروابط تعمل اليوم على صفحة تجريبية.",
            "تسجيل بيع أو دفعة من الشاشة.",
            "تحديد حد الائتمان بنفسك. تحدده ALYR عند طلبك.",
            "كشوف الحساب.",
            "زرّا «ادفع الآن» و«سأدفع خلال أسبوع» في التذكير الذي يُرسل بعد 24 ساعة من آخر رسالة للعميل؛ يصله رابط الدفع فقط.",
            "الفواتير، والإيصالات التي تذكر طريقة الدفع، من ALYR Docs، ونجهّزه معك.",
          ],
        },
        note: "نجهّز ALYR Accounts معك في محلك. كل ما فوق الخط جاهز.",
      },
      who: {
        eyebrow: "لمن صُمّم",
        title: "للأنشطة التي تبيع لعملائها الدائمين بالآجل.",
        rows: [
          { name: "تجارة الجملة، مع عملاء تجاريين بالآجل", tags: ["تسجيل", "تذكير", "تحصيل"] },
          { name: "محلات لها زبائن دائمون في الدفتر", tags: ["تسجيل", "تذكير"] },
          { name: "مطاعم ومخابز لها حسابات مكاتب أو مناسبات", tags: ["طلب على الحساب", "تذكير"] },
          { name: "خدمات منزلية مع عملاء عقود", tags: ["تسجيل", "تذكير"] },
        ],
        other: "نشاطك مختلف؟ راسلنا وأخبرنا كيف تعمل اليوم.",
      },
      works: {
        eyebrow: "المنتجات",
        title: "يعمل مع بقية منتجات ALYR.",
        link: "تعرّف على {name}",
        rows: {
          chat: "الطلبات المسجّلة على الحساب تصل هنا، وصفحة الطلب ترفض ما يتجاوز الحد.",
          bookings: "العملاء الذين يدفعون ثمن زياراتهم لاحقاً: سجّلها بالسطر نفسه.",
          agent: "يأتي مع ALYR Accounts: المتأخر بلا تذكير، والوعود التي مضى موعدها، وتجاوز الحد.",
          shelf: "الطلب على الحساب يأخذ كميته فوراً.",
          docs: "فاتورة لكل بيع بالآجل، وإيصال لكل دفعة يقول كم تبقّى.",
        },
      },
      faq: {
        eyebrow: "أسئلة",
        title: "قبل أن تسأل.",
        items: [
          {
            id: "own",
            q: "هل أستطيع استخدامه وحده؟",
            a: "نعم. تسجّل المبيعات بسطر من هاتف الموظف. وإن أضفت ALYR Chat، يستطيع العميل تسجيل طلبه على حسابه من صفحة الطلب.",
          },
          {
            id: "upset",
            q: "هل تزعج التذكيرات عملائي؟",
            a: "الأول تذكير ودّي، ولا تشتد النبرة إلا بعد 60 يوماً، ولا يصل أحداً تذكيران خلال 3 أيام، ونقرة على «سأدفع خلال أسبوع» توقفها.",
          },
          {
            id: "stop",
            q: "وإن طلب العميل الإيقاف؟",
            a: "لا تصله بعدها تذكيرات ولا إشعارات، وتبقى ترى ما عليه.",
          },
          {
            id: "move",
            q: "كيف أنتقل من دفتري الورقي؟",
            a: "نراجع معك عند التجهيز رصيد كل عميل، فيكون أول تذكير صحيحاً.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف تسجّل الآجل اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Accounts على هاتفك أنت.",
      },
    },
    shelf: shelfAr,
    docs: docsAr,
  },
};

export const copy: Record<Locale, Copy> = { en, ar };
