// The words of the sector pages (/for/bakeries ... /for/fashion and their /ar pages),
// English and Arabic (ALY-232, D-057). Each page answers its owner's main question in its
// first lines, shows the trade's day in the owner's words, and says what each ALYR product
// does for that trade, describing only what is built (docs/work/ALY-232-sector-pages/02-truth.md).
// The openers come from docs/company/introduction.md. No price, no offer, no AI word, no
// "rule", no clinic. The figure on each page is the homepage's day split for that trade
// (`row`), or the trade's own sample rows (`day`) where the homepage has no tab. The Arabic
// is a draft until the native review (ALY-66).

import type { BusinessRow, Questions, Titled } from "./copy";
import { SECTORS, type GuideKey, type ProductKey, type SectorKey } from "./site";

export type Sector = {
  meta: { title: string; description: string };
  /** The trade's name: the breadcrumb, the guides' links; and its short name, for the footer. */
  name: string;
  short: string;
  /** The H1: the owner's main question, said as a statement (no question mark outside the
   * Questions section). */
  title: string;
  /** The answer, said first, in two or three sentences. */
  answer: string;
  /** The homepage business row whose afternoon the figure draws (BusinessRow.id). */
  row?: string;
  /** The trade's own sample afternoon, where the homepage has no tab for it. */
  day?: Pick<BusinessRow, "chats" | "orders">;
  /** The trade's day today, in the owner's words, second person. */
  today: { title: string; items: string[] };
  /** What ALYR sets up for this trade, product by product, in the suite's order. */
  products: { title: string; rows: { key: ProductKey; body: string }[] };
  /** A limit of today's product, said where leaving it out would make a line untrue. */
  note?: string;
  /** The owner guide for this trade, and the homepage panel's link to this page. */
  guide: GuideKey;
  more: string;
  faq: Questions;
  cta: Titled;
  /** The contact message for this trade: the WhatsApp prefill, in the owner's words, and
   * the email's subject. */
  prefill: string;
  subject: string;
};

export type SectorsCopy = {
  /** The breadcrumb: its name for screen readers, the homepage, and the homepage's section. */
  crumbs: { label: string; home: string; business: string };
  /** The tags under the answer. */
  uses: string;
  /** The day split's section. */
  figure: { title: string; body: string };
  /** The guide's row: its label, and the link's words. */
  guide: { title: string; read: string };
  /** The product rows' links: "See {name}". */
  see: string;
  /** The footer's row of trades. */
  footer: string;
  /** What a sector page's social card shows, for its alt text (the cards are English). */
  card: string;
  items: Record<SectorKey, Sector>;
};

/** The sector pages' titles and descriptions, under their page keys (`for-bakeries`), for
 * `copy.meta`: document.tsx, the structured data and the machine copies read them there. */
export function sectorMeta(words: SectorsCopy) {
  return Object.fromEntries(SECTORS.map((key) => [`for-${key}`, words.items[key].meta])) as Record<
    `for-${SectorKey}`,
    Sector["meta"]
  >;
}

// ------------------------------------------------------------------ English

export const sectorsEn: SectorsCopy = {
  crumbs: { label: "You are here", home: "ALYR", business: "By business" },
  uses: "What we would set up",
  figure: {
    title: "The same hour, today and with ALYR",
    body: "Today’s chats as they pile up, and the same customers as ALYR keeps them. Move the fold, or press Today or With ALYR.",
  },
  guide: { title: "Owner guide", read: "Read the guide" },
  see: "See {name}",
  footer: "For your business",
  card: "ALYR: a page for one kind of owner-run business in Qatar, with its question and the products it uses",
  items: {
    // ------------------------------------------------------------ bakeries
    bakeries: {
      meta: {
        title: "WhatsApp orders for bakeries in Qatar · ALYR",
        description:
          "How a bakery or home kitchen in Qatar can take WhatsApp orders without losing them: a menu page in the chat, every order on one screen with one person on it, and office accounts with reminders. Set up for you by ALYR.",
      },
      name: "Bakeries and home kitchens",
      short: "Bakeries",
      title: "How a bakery in Qatar can take WhatsApp orders without losing them",
      answer:
        "Give customers your menu as a page that opens from the chat, so each order arrives with its items and quantities, and its day when it is made to order, instead of in a voice note. Every order then lands on one screen, with one person on your team responsible for it. ALYR sets this up with you, at your bakery. Office regulars can order on an account they pay later.",
      row: "bakery",
      today: {
        title: "Your day today",
        items: [
          "The week before Eid, orders arrive faster than anyone can write them down.",
          "A voice note says “the same as last time, for 12”, and someone has to work out what that was.",
          "“Is it ready?” comes in all afternoon, while your hands are in the dough.",
          "Offices order on account, and the money waits until someone remembers to ask.",
        ],
      },
      products: {
        title: "What we set up for a bakery",
        rows: [
          { key: "chat", body: "Your menu page in the chat, by the piece or by weight. Each order arrives complete, on one screen, and the customer is told when it is confirmed and when it is ready." },
          { key: "accounts", body: "Offices and regulars order on account. You see who owes what and for how long, and one press sends the reminders." },
          { key: "agent", body: "What needs you now, and this week against the same days last week." },
          { key: "shelf", body: "How many of each cake you can make a day, the time orders close, and Sold out when the day’s number is reached." },
        ],
      },
      guide: "stop-losing-whatsapp-orders",
      more: "See the page for bakeries",
      faq: {
        title: "Questions",
        items: [
          {
            id: "date",
            q: "Can a customer order a cake for a later day?",
            a: "Yes. An item can ask for notice before it is ordered, and the order page asks which day it is for. You set the notice and the time orders close.",
          },
          {
            id: "limit",
            q: "Can I cap how many I make a day?",
            a: "Yes. Give an item a number for each day. When it is reached, the order page shows Sold out for that day, and the stock log records each sale.",
          },
          {
            id: "voice",
            q: "What happens to orders that still come as voice notes?",
            a: "They reach your team in one shared inbox, where anyone can take the chat and send your menu page with a saved reply.",
          },
          {
            id: "offices",
            q: "How do offices order now and pay later?",
            a: "They order on their account, up to a limit you set. Each entry is sent to them with the new balance, and reminders go when you press Send reminders.",
          },
          {
            id: "start",
            q: "Where do we start?",
            a: "With a check-up at your bakery, to see how orders reach you today. Then we put your menu, photos and prices on the page in both languages, and show your team how it works.",
          },
        ],
      },
      cta: {
        title: "Tell us how orders reach your bakery today.",
        body: "Send us a message. A person from ALYR replies, then comes to show you how it would work for your bakery, on your own phone.",
      },
      prefill: "Hello ALYR, I run a bakery and I’d like to see how ALYR takes our orders.",
      subject: "How ALYR works for my bakery",
    },

    // ------------------------------------------------------------ salons
    salons: {
      meta: {
        title: "WhatsApp bookings and reminders for salons in Qatar · ALYR",
        description:
          "How a salon or barber in Qatar can take bookings on WhatsApp and remind every customer: a booking page in the chat, a confirmation at once, a reminder two hours before, and who came marked in one tap. Set up for you by ALYR.",
      },
      name: "Salons and barbers",
      short: "Salons",
      title: "How a salon in Qatar can take bookings on WhatsApp and remind every customer",
      answer:
        "Let customers pick an open time from a page that opens in the chat, confirm it at once, and send a reminder two hours before the visit. Then mark who came, so you know how many did not. ALYR Bookings sends the page, the confirmation and the reminder, and gives your team a Came or No-show button. ALYR Agent counts your no-shows over 30 days.",
      row: "salon",
      today: {
        title: "Your day today",
        items: [
          "“Any time after 4?” arrives while you are with a customer.",
          "Someone books on Monday, forgets by Thursday, and the chair stays empty for the hour.",
          "The bookings live in a notebook or in your head.",
          "Nobody can say how many people did not come last week.",
        ],
      },
      products: {
        title: "What we set up for a salon",
        rows: [
          { key: "bookings", body: "A booking page from the chat with only the times that are open, the confirmation at once, a reminder two hours before, and Came or No-show in one tap." },
          { key: "agent", body: "Your no-show rate over 30 days, customers who missed twice and booked again, and visits nobody has marked." },
        ],
      },
      note: "ALYR Bookings takes one booking at a time for the whole business today: right for one chair or one room.",
      guide: "cut-no-shows-with-reminders",
      more: "See the page for salons and barbers",
      faq: {
        title: "Questions",
        items: [
          {
            id: "chairs",
            q: "I have three chairs.",
            a: "With three chairs, two customers can want the same hour, and today ALYR Bookings gives that hour to one of them only. Tell us how your chairs fill, and we’ll tell you whether it fits.",
          },
          {
            id: "cancel",
            q: "Can a customer cancel without calling?",
            a: "Yes. A customer who writes “my booking” sees the next one and can cancel it, and the time is free again for someone else. A cancelled booking gets no reminder.",
          },
          {
            id: "confirm",
            q: "Do I confirm each booking myself?",
            a: "No. The page offers only times that are open, from your opening hours and the bookings you have, so the confirmation goes at once.",
          },
          {
            id: "repeat",
            q: "What about a customer who never comes?",
            a: "Your team marks No-show. ALYR Agent shows a customer who missed twice and has booked again, so you can decide what to do before the day.",
          },
        ],
      },
      cta: {
        title: "Tell us how bookings reach your salon today.",
        body: "Send us a message. A person from ALYR replies, then comes to show you a booking made from a chat on your own phone.",
      },
      prefill: "Hello ALYR, I run a salon and I’d like to see how ALYR takes our bookings.",
      subject: "How ALYR works for my salon",
    },

    // ------------------------------------------------------------ groceries
    groceries: {
      meta: {
        title: "Credit accounts and WhatsApp orders for groceries in Qatar · ALYR",
        description:
          "How a grocery or baqala in Qatar can keep track of customers who buy on credit: each sale recorded with one line from the staff phone, the customer told the new balance, and reminders in one press. Orders from your list in the chat. Set up for you by ALYR.",
      },
      name: "Groceries and baqalas",
      short: "Groceries",
      title: "How a grocery in Qatar can keep track of customers who buy on credit",
      answer:
        "Record each credit sale the moment it happens, with one line typed on the staff phone, and the customer gets a message with the new balance. ALYR Accounts keeps who owes what and for how long, and one press sends reminders to everyone 30 days or more behind, firmer as the debt ages. Customers can also order from your list in the chat.",
      day: {
        chats: [
          { who: "Flat 12", kind: "voice", text: "0:31", at: "7:42 pm", n: 11 },
          { who: "Ahmed", kind: "text", text: "Put it on my account, I’ll pay Thursday", at: "7:30 pm", n: 9 },
          { who: "Fatma", kind: "text", text: "How much do I owe?", at: "7:12 pm", n: 8 },
          { who: "Villa 7", kind: "photo", text: "This rice, 2 bags", at: "6:55 pm", n: 6 },
          { who: "Saleh", kind: "text", text: "Do you have fresh milk?", at: "6:40 pm", n: 4 },
        ],
        orders: [
          { ref: "#1188", who: "Flat 12", what: "Bread, eggs, 2 kg tomatoes", by: "Rafi", status: "On account", tone: "ok" },
          { ref: "Credit", who: "Ahmed", what: "Credit sale, new balance sent", by: "Rafi", status: "Recorded", tone: "ok" },
          { ref: "Credit", who: "Fatma", what: "Asked for her balance", by: "Rafi", status: "Balance sent", tone: "ok" },
          { ref: "#1187", who: "Villa 7", what: "Basmati rice 5 kg × 2", by: "Joseph", status: "Ready, customer told", tone: "now" },
          { ref: "Chat", who: "Saleh", what: "Asked about fresh milk", by: "Joseph", status: "Joseph is answering", tone: "wait" },
        ],
      },
      today: {
        title: "Your day today",
        items: [
          "The credit book is behind the counter, and only one person can read it.",
          "A customer says they paid last week, and nobody wrote it down.",
          "Asking a neighbour for money feels awkward, so nobody asks.",
          "Orders from the building come as voice notes: “the usual, and two of the big water”.",
        ],
      },
      products: {
        title: "What we set up for a grocery",
        rows: [
          { key: "accounts", body: "A credit sale or a payment recorded with one line from the staff phone. The customer is told each entry and the new balance, and can ask for it any time." },
          { key: "chat", body: "Your list as a page in the chat, by the piece or by weight. Regulars can put an order on their account, up to the limit you set." },
          { key: "agent", body: "What is owed by age, promises to pay that have passed, and accounts over their limit." },
          { key: "shelf", body: "Stock counted on every sale, and an item left out of the page when it runs out." },
        ],
      },
      guide: "keep-track-of-who-owes-you",
      more: "See the page for groceries",
      faq: {
        title: "Questions",
        items: [
          {
            id: "book",
            q: "How do I move from my credit book?",
            a: "At setup we go through each customer’s balance with you, so the first message they get is right.",
          },
          {
            id: "upset",
            q: "Will reminders upset my neighbours?",
            a: "The first is a friendly reminder. It turns firmer from 60 days, and from 90 days it is a final notice. Nobody gets two within 3 days, a customer can answer “I’ll pay within a week” with one tap, and a customer who says stop gets no more.",
          },
          {
            id: "paid",
            q: "A customer pays part of what they owe.",
            a: "Record the payment with one line. It settles the oldest purchase first, and the customer is told what is left.",
          },
          {
            id: "delivery",
            q: "Can customers ask for delivery to the building?",
            a: "The order page can ask for delivery or pickup, with your delivery areas, a fee and a minimum order, once we switch it on for your shop. ALYR does not track drivers: your team marks the order complete.",
          },
        ],
      },
      cta: {
        title: "Tell us how your credit book works today.",
        body: "Send us a message. A person from ALYR replies, then comes to your shop to go through your book with you.",
      },
      prefill: "Hello ALYR, I run a grocery and I’d like to see the credit accounts and orders.",
      subject: "How ALYR works for my grocery",
    },

    // ------------------------------------------------------------ restaurants
    restaurants: {
      meta: {
        title: "Direct WhatsApp orders for restaurants and cafés in Qatar · ALYR",
        description:
          "How a restaurant or café in Qatar can take orders direct on WhatsApp: the menu as a page in the chat, every order on one screen, the customer told when it is ready for collection, and office lunches on account. Set up for you by ALYR.",
      },
      name: "Restaurants and cafés",
      short: "Restaurants",
      title: "How a restaurant in Qatar can take orders direct on WhatsApp",
      answer:
        "Give your regulars your menu as a page that opens from the chat. They choose the dishes and their options, the order lands on one screen with one person on it, and each customer is told when the order is ready for collection. Office lunches can go on an account the office settles later.",
      row: "restaurant",
      today: {
        title: "Your day today",
        items: [
          "At lunch, orders arrive by call, chat and voice note at once, and end up on paper.",
          "“I’m outside, is it ready?”",
          "An office orders lunch for 14 on its tab, and the tab lives in a notebook.",
          "Regulars who would order from you direct go through an app that takes its share.",
        ],
      },
      products: {
        title: "What we set up for a restaurant",
        rows: [
          { key: "chat", body: "Your menu in the chat, with each dish’s options. Every order on one screen with one person responsible, and a message to the customer when it is ready." },
          { key: "accounts", body: "Offices order lunch on account, and you see what each one owes." },
          { key: "agent", body: "Your busiest hours, your best sellers, and this week against the same days last week." },
          { key: "shelf", body: "Photos and prices in Arabic and English, and a dish shown as Sold out the moment your staff mark it." },
        ],
      },
      note: "Table bookings are not in ALYR yet.",
      guide: "stop-losing-whatsapp-orders",
      more: "See the page for restaurants",
      faq: {
        title: "Questions",
        items: [
          {
            id: "apps",
            q: "Should I leave the delivery apps?",
            a: "No. Keep them for customers who find you there. Regulars who already message you can order direct from your menu page, and ALYR takes no cut of those orders.",
          },
          {
            id: "delivery",
            q: "Can customers ask for delivery?",
            a: "The order page can offer delivery areas with a fee and a minimum order, once we switch it on for you. ALYR does not track drivers or show a map: your team marks the order complete.",
          },
          {
            id: "sold-out",
            q: "What happens when a dish runs out at 1 pm?",
            a: "Your staff can send “sold out” and the dish’s name from their phone, and the menu page shows Sold out at once. “back” turns it on again.",
          },
          {
            id: "tables",
            q: "Can customers book a table?",
            a: "Not yet. ALYR takes orders for collection and, once switched on, for delivery. Table bookings are not in ALYR.",
          },
        ],
      },
      cta: {
        title: "Tell us how orders reach your restaurant today.",
        body: "Send us a message. A person from ALYR replies, then comes to show you how it would work for your restaurant, on your own phone.",
      },
      prefill: "Hello ALYR, I run a restaurant and I’d like to see how ALYR takes our orders.",
      subject: "How ALYR works for my restaurant",
    },

    // ------------------------------------------------------------ home services
    "home-services": {
      meta: {
        title: "WhatsApp bookings for home services in Qatar · ALYR",
        description:
          "How a home services company in Qatar can answer customers while the team is on a job: visits booked from the chat with a reminder before each, parts ordered from a page, and contract customers on account. Set up for you by ALYR.",
      },
      name: "Home services",
      short: "Home services",
      title: "How a home services company in Qatar can answer customers while the team is on a job",
      answer:
        "Let the everyday requests answer themselves in the chat: customers book a visit from a page with your open times, get a confirmation at once and a reminder before you arrive, and order parts from a page. Everything else waits in one shared inbox, with one person responsible, until someone is free. Contract customers can pay later, with reminders.",
      row: "home-services",
      today: {
        title: "Your day today",
        items: [
          "“AC not cooling, can someone come?” arrives while both technicians are on a roof.",
          "“When are you coming?” arrives twice before lunch.",
          "A part is asked for by photo, and the photo gets lost further up the chat.",
          "Contract customers pay late, and chasing them takes calls.",
        ],
      },
      products: {
        title: "What we set up for a home services company",
        rows: [
          { key: "bookings", body: "Visits booked from the chat, only at open times, with the confirmation at once and a reminder two hours before." },
          { key: "chat", body: "Parts and filters ordered from a page, and every chat in one inbox your whole team shares." },
          { key: "accounts", body: "Contract customers on account, with reminders whose tone follows how late the payment is." },
          { key: "docs", body: "A numbered receipt in Arabic and English for each payment you record." },
          { key: "agent", body: "Visits nobody has marked, money owed by age, and this week against the same days last week." },
        ],
      },
      note: "ALYR Bookings takes one visit at a time for the whole business today.",
      guide: "cut-no-shows-with-reminders",
      more: "See the page for home services",
      faq: {
        title: "Questions",
        items: [
          {
            id: "teams",
            q: "I have two teams out at once.",
            a: "Then two customers can want the same morning, and today ALYR Bookings gives each time to one visit only. Tell us how your teams work, and we’ll tell you whether it fits before you decide anything.",
          },
          {
            id: "on-job",
            q: "Who answers while we are on a job?",
            a: "ALYR answers the everyday requests: book a visit, order a part, ask a balance, pay. Anything else waits in the shared inbox with one person responsible, and the customer’s message is not lost.",
          },
          {
            id: "where",
            q: "Can the customer see when we will arrive?",
            a: "They get the confirmation with the day and time at once, and a reminder two hours before. ALYR does not show a map or track the van.",
          },
          {
            id: "receipts",
            q: "Can contract customers get a receipt for each payment?",
            a: "We can set that up with ALYR Docs: each payment you record then makes a numbered receipt in Arabic and English that says what is left on the account.",
          },
        ],
      },
      cta: {
        title: "Tell us how jobs reach you today.",
        body: "Send us a message. A person from ALYR replies, then comes to show you a visit booked from a chat on your own phone.",
      },
      prefill: "Hello ALYR, we do home services and I’d like to see how ALYR takes our bookings.",
      subject: "How ALYR works for my company",
    },

    // ------------------------------------------------------------ fashion
    fashion: {
      meta: {
        title: "WhatsApp orders for fashion and gift shops in Qatar · ALYR",
        description:
          "How a fashion, abaya or gift shop in Qatar can show customers what is still available: each piece on a page with photos, sizes and price, stock counted on every sale, and orders by a piece’s code in the chat. Set up for you by ALYR.",
      },
      name: "Fashion and gifts",
      short: "Fashion and gifts",
      title: "How a fashion or gift shop in Qatar can show customers what is still available",
      answer:
        "Put each piece on a page with its photos, sizes, colours and price, and send customers there from the chat and your Instagram bio. Stock is counted on every sale, so a piece that is gone shows Sold out instead of waiting for your reply. A customer can also send a piece’s code or link in the chat and order it there.",
      row: "fashion",
      today: {
        title: "Your day today",
        items: [
          "“Price? Size 54?” under every photo you post.",
          "You send photos one by one, then lose track of which pieces are left.",
          "An order arrives as a screenshot, and someone has to work out which piece it was.",
          "Gift orders come late at night, and the questions wait until morning.",
        ],
      },
      products: {
        title: "What we set up for a fashion or gift shop",
        rows: [
          { key: "chat", body: "A chat link for your Instagram bio, a page of your pieces in the chat, and an order from a piece’s code or link." },
          { key: "agent", body: "Your best sellers, what is sold out or low now, and this week against the same days last week." },
          { key: "shelf", body: "Every piece with its photos, sizes and colours, stock counted on every sale, and Sold out when the last one goes." },
        ],
      },
      guide: "stop-losing-whatsapp-orders",
      more: "See the page for fashion and gifts",
      faq: {
        title: "Questions",
        items: [
          {
            id: "sizes",
            q: "Each abaya comes in five sizes.",
            a: "Each size can have its own stock, so size 54 can be sold out while 52 is still on the page.",
          },
          {
            id: "instagram",
            q: "Most of my customers find me on Instagram.",
            a: "Put your chat link in your bio. It opens a chat with your shop, and when the customer writes, ALYR answers with your page and the order comes to your screen.",
          },
          {
            id: "code",
            q: "Can a customer order by sending a screenshot?",
            a: "A screenshot still reaches your team in the shared inbox. Faster for everyone is a piece’s code or link: every piece has a short code, and a customer who sends it gets the piece with its price and a button to confirm.",
          },
          {
            id: "wrap",
            q: "Can customers ask for gift wrapping?",
            a: "Yes. A piece can carry choices, like gift wrapping, that the customer picks on the order page before ordering.",
          },
        ],
      },
      cta: {
        title: "Tell us how orders reach your shop today.",
        body: "Send us a message. A person from ALYR replies, then comes to show you how it would work for your shop, on your own phone.",
      },
      prefill: "Hello ALYR, I sell fashion and gifts and I’d like to see how ALYR takes our orders.",
      subject: "How ALYR works for my shop",
    },
  },
};

// ------------------------------------------------------------------ Arabic (draft, ALY-66)

export const sectorsAr: SectorsCopy = {
  crumbs: { label: "مسار التنقل", home: "ALYR", business: "حسب نشاطك" },
  uses: "ما سنجهّزه لك",
  figure: {
    title: "الساعة نفسها، اليوم ومع ALYR",
    body: "محادثات اليوم كما تتراكم، والعملاء أنفسهم كما ترتبهم ALYR. حرّك الطيّة، أو اضغط «اليوم» أو «مع ALYR».",
  },
  guide: { title: "دليل لأصحاب المحلات", read: "اقرأ الدليل" },
  see: "اطّلع على {name}",
  footer: "لنشاطك",
  card: "ALYR: صفحة لنوع واحد من المنشآت التي يديرها أصحابها في قطر، بسؤالها والمنتجات التي تستخدمها",
  items: {
    bakeries: {
      meta: {
        title: "طلبات واتساب للمخابز في قطر · ALYR",
        description:
          "كيف يستقبل مخبز أو مطبخ منزلي في قطر طلبات واتساب دون أن يضيع منها شيء: صفحة قائمة تفتح من المحادثة، وكل طلب على شاشة واحدة ومعه شخص مسؤول، وحسابات آجلة للمكاتب مع تذكير بالسداد. تجهّزها لك ALYR.",
      },
      name: "المخابز والمطابخ المنزلية",
      short: "المخابز",
      title: "كيف يستقبل مخبز في قطر طلبات واتساب دون أن يضيع منها شيء",
      answer:
        "اجعل قائمتك صفحة تفتح من المحادثة، فيصلك كل طلب بأصنافه وكمياته، ويومه إن كان يُحضَّر عند الطلب، بدل رسالة صوتية. عندها يصل كل طلب إلى شاشة واحدة، ويتولاه شخص واحد من فريقك. تجهّز ALYR ذلك معك في مخبزك. ويستطيع زبائن المكاتب أن يطلبوا على حساب آجل يسددونه لاحقاً.",
      row: "bakery",
      today: {
        title: "يومك اليوم",
        items: [
          "في الأسبوع الذي يسبق العيد تصل الطلبات أسرع مما يستطيع أحد أن يكتبها.",
          "رسالة صوتية تقول «مثل المرة الماضية، لـ\u00a012 شخصاً»، وعلى أحدهم أن يتذكر ما كان ذلك.",
          "تصل رسائل «طلبي جاهز؟» طوال العصر ويداك في العجين.",
          "المكاتب تطلب على الحساب، والمبلغ ينتظر حتى يتذكر أحد أن يطالب به.",
        ],
      },
      products: {
        title: "ما نجهّزه للمخبز",
        rows: [
          { key: "chat", body: "صفحة قائمتك في المحادثة، بالقطعة أو بالوزن. يصل كل طلب كاملاً إلى شاشة واحدة، ويُبلَّغ العميل عند تأكيده وعند جاهزيته." },
          { key: "accounts", body: "المكاتب والزبائن الدائمون يطلبون على الحساب. ترى من عليه مستحقات لك ومنذ متى، وتُرسل التذكيرات بضغطة واحدة." },
          { key: "agent", body: "ما يحتاجك الآن، وهذا الأسبوع مقارنةً بالأيام نفسها من الأسبوع الماضي." },
          { key: "shelf", body: "كم كعكة تستطيع أن تصنع في اليوم، ووقت إغلاق الطلبات، وعبارة «نفدت الكمية» حين يكتمل عدد اليوم." },
        ],
      },
      guide: "stop-losing-whatsapp-orders",
      more: "اطّلع على صفحة المخابز",
      faq: {
        title: "أسئلة",
        items: [
          {
            id: "date",
            q: "هل يستطيع العميل أن يطلب كعكة ليوم لاحق؟",
            a: "نعم. يمكن أن يحتاج الصنف إلى مهلة قبل طلبه، وتسأل صفحة الطلب عن اليوم المطلوب. أنت تحدد المهلة ووقت إغلاق الطلبات.",
          },
          {
            id: "limit",
            q: "هل أستطيع أن أحدد كم أصنع في اليوم؟",
            a: "نعم. أعطِ الصنف عدداً لكل يوم. حين يكتمل العدد تعرض صفحة الطلب «نفدت الكمية» لذلك اليوم، ويسجّل سجل المخزون كل بيع.",
          },
          {
            id: "voice",
            q: "ماذا يحدث للطلبات التي ما زالت تصل برسائل صوتية؟",
            a: "تصل إلى فريقك في صندوق واحد مشترك، يستطيع أي شخص فيه أن يتولى المحادثة ويرسل صفحة القائمة بردّ محفوظ.",
          },
          {
            id: "offices",
            q: "كيف تطلب المكاتب الآن وتدفع لاحقاً؟",
            a: "تطلب على حسابها حتى الحد الذي تضعه أنت. يُرسَل إليها كل قيد مع الرصيد الجديد، وتذهب التذكيرات حين تضغط «إرسال التذكيرات».",
          },
          {
            id: "start",
            q: "من أين نبدأ؟",
            a: "بفحص في مخبزك نرى فيه كيف تصلك الطلبات اليوم. بعدها نضع قائمتك وصورها وأسعارها في الصفحة باللغتين، ونُري فريقك كيف تعمل.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف تصل الطلبات إلى مخبزك اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليريك كيف تعمل لمخبزك، على هاتفك.",
      },
      prefill: "مرحبا ALYR، عندي مخبز وأبي أشوف كيف تستقبلون طلباتنا.",
      subject: "كيف تعمل ALYR في مخبزي",
    },

    salons: {
      meta: {
        title: "حجوزات وتذكيرات واتساب للصالونات في قطر · ALYR",
        description:
          "كيف يستقبل صالون أو محل حلاقة في قطر الحجوزات عبر واتساب ويذكّر كل عميل: صفحة حجز من المحادثة، وتأكيد فوري، وتذكير قبل الموعد بساعتين، وتسجيل الحضور بلمسة واحدة. تجهّزها لك ALYR.",
      },
      name: "الصالونات ومحلات الحلاقة",
      short: "الصالونات",
      title: "كيف يستقبل صالون في قطر الحجوزات عبر واتساب ويذكّر كل عميل بموعده",
      answer:
        "دع العملاء يختارون وقتاً متاحاً من صفحة تفتح في المحادثة، وأكّد الحجز فوراً، وأرسل تذكيراً قبل الموعد بساعتين. ثم سجّل من حضر، لتعرف كم عميلاً لم يحضر. يرسل ALYR Bookings الصفحة والتأكيد والتذكير، ويعطي فريقك زرّي «حضر» و«لم يحضر». ويحسب ALYR Agent حالات الغياب خلال 30 يوماً.",
      row: "salon",
      today: {
        title: "يومك اليوم",
        items: [
          "«فيه موعد بعد الساعة 4؟» تصل وأنت مع عميل.",
          "يحجز أحدهم يوم الاثنين، وينسى يوم الخميس، ويبقى الكرسي فارغاً ساعة كاملة.",
          "الحجوزات في دفتر أو في ذاكرتك.",
          "لا أحد يستطيع أن يقول كم عميلاً لم يحضر الأسبوع الماضي.",
        ],
      },
      products: {
        title: "ما نجهّزه للصالون",
        rows: [
          { key: "bookings", body: "صفحة حجز من المحادثة لا تعرض إلا الأوقات المتاحة، وتأكيد فوري، وتذكير قبل الموعد بساعتين، و«حضر» أو «لم يحضر» بلمسة واحدة." },
          { key: "agent", body: "نسبة الغياب خلال 30 يوماً، والعملاء الذين غابوا مرتين ثم حجزوا من جديد، والمواعيد التي لم يسجّل أحد حضورها." },
        ],
      },
      note: "يستقبل ALYR Bookings اليوم حجزاً واحداً في الوقت نفسه للنشاط كله: يناسب كرسياً واحداً أو غرفة واحدة.",
      guide: "cut-no-shows-with-reminders",
      more: "اطّلع على صفحة الصالونات ومحلات الحلاقة",
      faq: {
        title: "أسئلة",
        items: [
          {
            id: "chairs",
            q: "عندي ثلاثة كراسٍ.",
            a: "مع ثلاثة كراسٍ قد يريد عميلان الساعة نفسها، واليوم يعطي ALYR Bookings تلك الساعة لواحد منهما فقط. أخبرنا كيف تمتلئ كراسيك، ونخبرك إن كان يناسبك.",
          },
          {
            id: "cancel",
            q: "هل يستطيع العميل أن يلغي دون أن يتصل؟",
            a: "نعم. العميل الذي يكتب «حجزي» يرى حجزه القادم ويستطيع إلغاءه، فيعود الوقت متاحاً لغيره. ولا يصل تذكير لحجز أُلغي.",
          },
          {
            id: "confirm",
            q: "هل عليّ أن أؤكد كل حجز بنفسي؟",
            a: "لا. لا تعرض الصفحة إلا الأوقات المتاحة حسب ساعات عملك والحجوزات القائمة، لذلك يصل التأكيد فوراً.",
          },
          {
            id: "repeat",
            q: "وماذا عن عميل لا يحضر أبداً؟",
            a: "يسجّل فريقك «لم يحضر». ويعرض ALYR Agent العميل الذي غاب مرتين ثم حجز من جديد، لتقرر ما تفعله قبل الموعد.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف تصل الحجوزات إلى صالونك اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليريك حجزاً يتم من محادثة على هاتفك.",
      },
      prefill: "مرحبا ALYR، عندي صالون وأبي أشوف كيف تستقبلون حجوزاتنا.",
      subject: "كيف تعمل ALYR في صالوني",
    },

    groceries: {
      meta: {
        title: "الحسابات الآجلة وطلبات واتساب للبقالات في قطر · ALYR",
        description:
          "كيف تتابع بقالة في قطر العملاء الذين يشترون بالآجل: يُسجَّل كل بيع بسطر واحد من هاتف الموظف، ويُبلَّغ العميل برصيده الجديد، وتُرسل التذكيرات بضغطة واحدة. والطلبات من قائمتك في المحادثة. تجهّزها لك ALYR.",
      },
      name: "البقالات والمحلات الغذائية",
      short: "البقالات",
      title: "كيف تتابع بقالة في قطر العملاء الذين يشترون بالآجل",
      answer:
        "سجّل كل بيع آجل لحظة حدوثه بسطر واحد تكتبه على هاتف الموظف، فتصل إلى العميل رسالة برصيده الجديد. يحفظ ALYR Accounts من عليه مستحقات لك وكم ومنذ متى، وتُرسل بضغطة واحدة تذكيرات إلى كل من تأخر 30 يوماً أو أكثر، بنبرة أحزم كلما طال التأخير. ويستطيع العملاء أيضاً أن يطلبوا من قائمتك في المحادثة.",
      day: {
        chats: [
          { who: "شقة 12", kind: "voice", text: "0:31", at: "7:42 م", n: 11 },
          { who: "أحمد", kind: "text", text: "سجّلها على حسابي، أدفع الخميس", at: "7:30 م", n: 9 },
          { who: "فاطمة", kind: "text", text: "كم علي؟", at: "7:12 م", n: 8 },
          { who: "فيلا 7", kind: "photo", text: "هذا الرز، كيسين", at: "6:55 م", n: 6 },
          { who: "صالح", kind: "text", text: "عندكم حليب طازج؟", at: "6:40 م", n: 4 },
        ],
        orders: [
          { ref: "#1188", who: "شقة 12", what: "خبز، بيض، 2 كغ طماطم", by: "رفيع", status: "على الحساب", tone: "ok" },
          { ref: "آجل", who: "أحمد", what: "بيع آجل، أُرسل الرصيد الجديد", by: "رفيع", status: "سُجّل", tone: "ok" },
          { ref: "آجل", who: "فاطمة", what: "سألت عن رصيدها", by: "رفيع", status: "أُرسل الرصيد", tone: "ok" },
          { ref: "#1187", who: "فيلا 7", what: "رز بسمتي 5 كغ × 2", by: "جوزيف", status: "جاهز، أُبلغ العميل", tone: "now" },
          { ref: "محادثة", who: "صالح", what: "سأل عن الحليب الطازج", by: "جوزيف", status: "جوزيف يرد", tone: "wait" },
        ],
      },
      today: {
        title: "يومك اليوم",
        items: [
          "دفتر الديون خلف الكاونتر، ولا يقرأ خطه إلا شخص واحد.",
          "عميل يقول إنه دفع الأسبوع الماضي، ولم يكتب أحد ذلك.",
          "مطالبة الجار بالمال محرجة، فلا يطالب أحد.",
          "طلبات العمارة تصل برسائل صوتية: «المعتاد، واثنين من الماي الكبير».",
        ],
      },
      products: {
        title: "ما نجهّزه للبقالة",
        rows: [
          { key: "accounts", body: "بيع آجل أو دفعة تُسجَّل بسطر واحد من هاتف الموظف. يُبلَّغ العميل بكل قيد وبرصيده الجديد، ويستطيع أن يسأل عنه متى شاء." },
          { key: "chat", body: "قائمتك صفحةٌ في المحادثة، بالقطعة أو بالوزن. ويستطيع الزبائن الدائمون أن يضعوا الطلب على حسابهم حتى الحد الذي تضعه." },
          { key: "agent", body: "المستحقات حسب عمرها، ووعود السداد التي فات موعدها، والحسابات التي تجاوزت حدها." },
          { key: "shelf", body: "مخزون يُحسب مع كل بيع، وصنف يختفي من الصفحة حين ينفد." },
        ],
      },
      guide: "keep-track-of-who-owes-you",
      more: "اطّلع على صفحة البقالات",
      faq: {
        title: "أسئلة",
        items: [
          {
            id: "book",
            q: "كيف أنتقل من دفتر الديون؟",
            a: "عند التجهيز نراجع معك رصيد كل عميل، لتكون أول رسالة تصله صحيحة.",
          },
          {
            id: "upset",
            q: "هل تزعج التذكيرات جيراني؟",
            a: "التذكير الأول ودّي، ويصبح أحزم من 60 يوماً، ومن 90 يوماً يصبح إشعاراً أخيراً. لا يصل إلى أحد تذكيران خلال 3 أيام، ويستطيع العميل أن يرد بلمسة «سأدفع خلال أسبوع»، ومن يطلب التوقف لا يصله شيء بعد ذلك.",
          },
          {
            id: "paid",
            q: "عميل يدفع جزءاً مما عليه.",
            a: "سجّل الدفعة بسطر واحد. تُسدِّد أقدم مشترياته أولاً، ويُبلَّغ العميل بما بقي عليه.",
          },
          {
            id: "delivery",
            q: "هل يستطيع العملاء أن يطلبوا التوصيل إلى العمارة؟",
            a: "تستطيع صفحة الطلب أن تسأل عن التوصيل أو الاستلام، مع مناطق التوصيل والرسوم وحدّ أدنى للطلب، بعد أن نفعّل ذلك لمحلك. لا تتتبع ALYR السائقين: فريقك هو من يسجّل أن الطلب اكتمل.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف يعمل دفتر الآجل عندك اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي إلى محلك ليراجع دفترك معك.",
      },
      prefill: "مرحبا ALYR، عندي بقالة وأبي أشوف الحسابات الآجلة والطلبات.",
      subject: "كيف تعمل ALYR في بقالتي",
    },

    restaurants: {
      meta: {
        title: "طلبات واتساب المباشرة للمطاعم والمقاهي في قطر · ALYR",
        description:
          "كيف يستقبل مطعم أو مقهى في قطر الطلبات مباشرة عبر واتساب: القائمة صفحةٌ في المحادثة، وكل طلب على شاشة واحدة، ويُبلَّغ العميل حين يصبح طلبه جاهزاً للاستلام، وغداء المكاتب على الحساب. تجهّزها لك ALYR.",
      },
      name: "المطاعم والمقاهي",
      short: "المطاعم",
      title: "كيف يستقبل مطعم في قطر الطلبات مباشرة عبر واتساب",
      answer:
        "اجعل قائمتك صفحة تفتح من المحادثة لزبائنك الدائمين. يختارون الأطباق وخياراتها، ويصل الطلب إلى شاشة واحدة ومعه شخص مسؤول، ويُبلَّغ كل عميل حين يصبح طلبه جاهزاً للاستلام. ويمكن أن يكون غداء المكاتب على حساب آجل تسدده المكاتب لاحقاً.",
      row: "restaurant",
      today: {
        title: "يومك اليوم",
        items: [
          "وقت الغداء تصل الطلبات بالاتصال والمحادثة والرسائل الصوتية معاً، وينتهي بها الأمر على الورق.",
          "«أنا برا، الطلب جاهز؟»",
          "مكتب يطلب غداء 14 شخصاً على حسابه، والحساب في دفتر.",
          "زبائن دائمون كانوا سيطلبون منك مباشرة يمرون عبر تطبيق يأخذ نصيبه.",
        ],
      },
      products: {
        title: "ما نجهّزه للمطعم",
        rows: [
          { key: "chat", body: "قائمتك في المحادثة مع خيارات كل طبق. كل طلب على شاشة واحدة ومعه شخص مسؤول، ورسالة إلى العميل حين يجهز." },
          { key: "accounts", body: "المكاتب تطلب الغداء على الحساب، وترى ما على كل منها." },
          { key: "agent", body: "أكثر ساعاتك ازدحاماً، والأصناف الأكثر مبيعاً، وهذا الأسبوع مقارنةً بالأيام نفسها من الأسبوع الماضي." },
          { key: "shelf", body: "الصور والأسعار بالعربية والإنجليزية، و«نفدت الكمية» على الطبق فور أن يسجّل موظفك نفاده." },
        ],
      },
      note: "لا يتوفر حجز الطاولات في ALYR بعد.",
      guide: "stop-losing-whatsapp-orders",
      more: "اطّلع على صفحة المطاعم",
      faq: {
        title: "أسئلة",
        items: [
          {
            id: "apps",
            q: "هل أترك تطبيقات التوصيل؟",
            a: "لا. أبقِها للعملاء الذين يجدونك عليها. أما الزبائن الدائمون الذين يراسلونك أصلاً فيطلبون مباشرة من صفحة قائمتك، ولا تأخذ ALYR نسبة من هذه الطلبات.",
          },
          {
            id: "delivery",
            q: "هل يستطيع العملاء أن يطلبوا التوصيل؟",
            a: "تستطيع صفحة الطلب أن تعرض مناطق التوصيل مع الرسوم وحدّ أدنى للطلب، بعد أن نفعّل ذلك لك. لا تتتبع ALYR السائقين ولا تعرض خريطة: فريقك هو من يسجّل أن الطلب اكتمل.",
          },
          {
            id: "sold-out",
            q: "ماذا يحدث حين ينفد طبق الساعة 1 ظهراً؟",
            a: "يستطيع موظفك أن يرسل «نفد» واسم الطبق من هاتفه، فتعرض صفحة القائمة «نفدت الكمية» فوراً. و«رجع» يعيده.",
          },
          {
            id: "tables",
            q: "هل يستطيع العملاء حجز طاولة؟",
            a: "ليس بعد. تستقبل ALYR الطلبات للاستلام، وللتوصيل بعد تفعيله. لا يتوفر حجز الطاولات في ALYR بعد.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف تصل الطلبات إلى مطعمك اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليريك كيف تعمل لمطعمك، على هاتفك.",
      },
      prefill: "مرحبا ALYR، عندي مطعم وأبي أشوف كيف تستقبلون طلباتنا.",
      subject: "كيف تعمل ALYR في مطعمي",
    },

    "home-services": {
      meta: {
        title: "حجوزات واتساب للخدمات المنزلية في قطر · ALYR",
        description:
          "كيف تردّ شركة خدمات منزلية في قطر على عملائها حين يكون فريقها في موقع العمل: زيارات تُحجز من المحادثة مع تذكير قبل كل زيارة، وقطع غيار تُطلب من صفحة، وعملاء العقود على الحساب. تجهّزها لك ALYR.",
      },
      name: "الخدمات المنزلية",
      short: "الخدمات المنزلية",
      title: "كيف تردّ شركة خدمات منزلية في قطر على عملائها حين يكون فريقها في موقع العمل",
      answer:
        "دع الطلبات اليومية تُنجَز في المحادثة: يحجز العملاء زيارة من صفحة فيها أوقاتك المتاحة، ويصلهم تأكيد فوري وتذكير قبل وصولك، ويطلبون قطع الغيار من صفحة. وكل ما عدا ذلك ينتظر في صندوق واحد مشترك، ومعه شخص مسؤول، حتى يتفرغ أحد. ويستطيع عملاء العقود أن يسددوا لاحقاً، مع تذكير بالسداد.",
      row: "home-services",
      today: {
        title: "يومك اليوم",
        items: [
          "«المكيّف ما يبرّد، أحد يقدر يجي؟» تصل والفنيّان كلاهما على السطح.",
          "«متى بتوصلون؟» تصل مرتين قبل الظهر.",
          "قطعة غيار تُطلب بصورة، وتضيع الصورة في أعلى المحادثة.",
          "عملاء العقود يتأخرون في السداد، وملاحقتهم تحتاج اتصالات.",
        ],
      },
      products: {
        title: "ما نجهّزه لشركة الخدمات المنزلية",
        rows: [
          { key: "bookings", body: "زيارات تُحجز من المحادثة في الأوقات المتاحة فقط، مع تأكيد فوري وتذكير قبل الموعد بساعتين." },
          { key: "chat", body: "قطع الغيار والفلاتر تُطلب من صفحة، وكل المحادثات في صندوق واحد يتشاركه فريقك." },
          { key: "accounts", body: "عملاء العقود على الحساب، مع تذكيرات تتبع نبرتها مدة التأخير." },
          { key: "docs", body: "إيصال مرقّم بالعربية والإنجليزية لكل دفعة تسجّلها." },
          { key: "agent", body: "الزيارات التي لم يسجّلها أحد، والمستحقات حسب عمرها، وهذا الأسبوع مقارنةً بالأيام نفسها من الأسبوع الماضي." },
        ],
      },
      note: "يستقبل ALYR Bookings اليوم زيارة واحدة في الوقت نفسه للنشاط كله.",
      guide: "cut-no-shows-with-reminders",
      more: "اطّلع على صفحة الخدمات المنزلية",
      faq: {
        title: "أسئلة",
        items: [
          {
            id: "teams",
            q: "عندي فريقان يعملان في الوقت نفسه.",
            a: "عندها قد يريد عميلان الصباح نفسه، واليوم يعطي ALYR Bookings كل وقت لزيارة واحدة فقط. أخبرنا كيف يعمل فريقاك، ونخبرك إن كان يناسبك قبل أن تقرر أي شيء.",
          },
          {
            id: "on-job",
            q: "من يردّ ونحن في موقع العمل؟",
            a: "تردّ ALYR على الطلبات اليومية: حجز زيارة، طلب قطعة، السؤال عن الرصيد، الدفع. وكل ما عدا ذلك ينتظر في الصندوق المشترك ومعه شخص مسؤول، ولا تضيع رسالة العميل.",
          },
          {
            id: "where",
            q: "هل يرى العميل متى سنصل؟",
            a: "يصله التأكيد باليوم والوقت فوراً، وتذكير قبل الموعد بساعتين. لا تعرض ALYR خريطة ولا تتتبع السيارة.",
          },
          {
            id: "receipts",
            q: "هل يحصل عملاء العقود على إيصال لكل دفعة؟",
            a: "نستطيع أن نجهّز ذلك مع ALYR Docs: عندها تُنشئ كل دفعة تسجّلها إيصالاً مرقّماً بالعربية والإنجليزية يذكر ما بقي على الحساب.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف تصلك طلبات العمل اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليريك زيارة تُحجز من محادثة على هاتفك.",
      },
      prefill: "مرحبا ALYR، عندنا شركة خدمات منزلية ونبي نشوف كيف تستقبلون حجوزاتنا.",
      subject: "كيف تعمل ALYR مع شركتي",
    },

    fashion: {
      meta: {
        title: "طلبات واتساب لمحلات الأزياء والهدايا في قطر · ALYR",
        description:
          "كيف يُري محل أزياء أو عبايات أو هدايا في قطر عملاءه ما بقي متوفراً: كل قطعة في صفحة بصورها ومقاساتها وسعرها، ومخزون يُحسب مع كل بيع، وطلب برمز القطعة في المحادثة. تجهّزها لك ALYR.",
      },
      name: "الأزياء والهدايا",
      short: "الأزياء والهدايا",
      title: "كيف يُري محل أزياء أو هدايا في قطر عملاءه ما بقي متوفراً",
      answer:
        "ضع كل قطعة في صفحة بصورها ومقاساتها وألوانها وسعرها، وأرسل العملاء إليها من المحادثة ومن نبذة حسابك على إنستغرام. يُحسب المخزون مع كل بيع، فتظهر على القطعة التي نفدت عبارة «نفدت الكمية» بدل أن تنتظر ردّك. ويستطيع العميل أيضاً أن يرسل رمز القطعة أو رابطها في المحادثة ويطلبها هناك.",
      row: "fashion",
      today: {
        title: "يومك اليوم",
        items: [
          "«السعر؟ مقاس 54؟» تحت كل صورة تنشرها.",
          "ترسل الصور واحدة واحدة، ثم لا تعرف أيّ القطع بقيت.",
          "يصل الطلب على شكل لقطة شاشة، وعلى أحدهم أن يكتشف أي قطعة هي.",
          "طلبات الهدايا تصل في آخر الليل، والأسئلة تنتظر حتى الصباح.",
        ],
      },
      products: {
        title: "ما نجهّزه لمحل الأزياء والهدايا",
        rows: [
          { key: "chat", body: "رابط محادثة لنبذة حسابك على إنستغرام، وصفحة قطعك في المحادثة، وطلب برمز القطعة أو رابطها." },
          { key: "agent", body: "الأكثر مبيعاً، وما نفد أو قارب على النفاد الآن، وهذا الأسبوع مقارنةً بالأيام نفسها من الأسبوع الماضي." },
          { key: "shelf", body: "كل قطعة بصورها ومقاساتها وألوانها، ومخزون يُحسب مع كل بيع، و«نفدت الكمية» حين تُباع آخر قطعة." },
        ],
      },
      guide: "stop-losing-whatsapp-orders",
      more: "اطّلع على صفحة الأزياء والهدايا",
      faq: {
        title: "أسئلة",
        items: [
          {
            id: "sizes",
            q: "كل عباية تأتي بخمسة مقاسات.",
            a: "لكل مقاس مخزونه الخاص، فيمكن أن ينفد مقاس 54 ويبقى 52 ظاهراً في الصفحة.",
          },
          {
            id: "instagram",
            q: "أغلب عملائي يجدونني على إنستغرام.",
            a: "ضع رابط المحادثة في نبذة حسابك. يفتح الرابط محادثة مع محلك، وحين يكتب العميل تردّ ALYR بصفحتك ويصل الطلب إلى شاشتك.",
          },
          {
            id: "code",
            q: "هل يستطيع العميل أن يطلب بإرسال لقطة شاشة؟",
            a: "لقطة الشاشة تصل إلى فريقك في الصندوق المشترك. والأسرع للجميع رمز القطعة أو رابطها: لكل قطعة رمز قصير، ومن يرسله تصله القطعة بسعرها وزرّ للتأكيد.",
          },
          {
            id: "wrap",
            q: "هل يستطيع العملاء طلب تغليف الهدية؟",
            a: "نعم. يمكن أن تحمل القطعة خيارات مثل تغليف الهدية، يختارها العميل في صفحة الطلب قبل أن يطلب.",
          },
        ],
      },
      cta: {
        title: "أخبرنا كيف تصل الطلبات إلى محلك اليوم.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليريك كيف تعمل لمحلك، على هاتفك.",
      },
      prefill: "مرحبا ALYR، أبيع أزياء وهدايا وأبي أشوف كيف تستقبلون طلباتنا.",
      subject: "كيف تعمل ALYR في محلي",
    },
  },
};
