// The words of the owner guides (/guides and its three guides, with their /ar pages),
// English and Arabic (ALY-233, from the growth plan's "Owner playbook"). Each guide answers
// in its first 100 words (`short`, checked by sectors.test.mjs), is useful with or without
// ALYR, and says what ALYR does for it only at the end, describing what is built. Signed
// "ALYR team", never a person (D-043). No numbers we do not have, no price, no AI word, no
// "rule". The Arabic is a draft until the native review (ALY-66).

import type { Titled } from "./copy";
import { GUIDES, type GuideKey, type ProductKey, type SectorKey } from "./site";

export type GuideSection = {
  id: string;
  title: string;
  body?: string;
  /** Steps, each with a short title and what to do. */
  steps?: Titled[];
  /** A plain list. */
  items?: string[];
};

export type Guide = {
  meta: { title: string; description: string };
  title: string;
  /** "In short": the answer, in the first 100 words of the page. */
  short: string;
  /** The day it was first published and last changed, ISO, Doha time; and as the page
   * prints it. Set `published` to the day the founder publishes, if later. */
  published: string;
  modified: string;
  date: string;
  sections: GuideSection[];
  /** What ALYR does for it, last, only what is built. */
  alyr: { title: string; body: string; items: string[]; products: ProductKey[] };
  /** The sector pages it serves. */
  sectors: SectorKey[];
  cta: Titled;
};

export type GuidesCopy = {
  meta: { title: string; description: string };
  /** The index page. */
  title: string;
  lead: string;
  /** The breadcrumb's name for this section, the kind of page, the author, and the labels
   * around a guide. */
  crumb: string;
  kind: string;
  by: string;
  published: string;
  short: string;
  related: string;
  see: string;
  read: string;
  footer: string;
  /** What a guide's social card shows, for its alt text (the cards are English). */
  card: string;
  cta: Titled;
  items: Record<GuideKey, Guide>;
};

/** The guides' index and each guide's title and description, under their page keys
 * (`guides`, `guide-stop-losing-whatsapp-orders`), for `copy.meta`. */
export function guideMeta(words: GuidesCopy) {
  return {
    guides: words.meta,
    ...(Object.fromEntries(GUIDES.map((key) => [`guide-${key}`, words.items[key].meta])) as Record<
      `guide-${GuideKey}`,
      Guide["meta"]
    >),
  };
}

// ------------------------------------------------------------------ English

export const guidesEn: GuidesCopy = {
  meta: {
    title: "Guides for owner-run businesses in Qatar · ALYR",
    description:
      "Practical guides for owners in Qatar: stop losing WhatsApp orders in the rush, cut no-shows with reminders, keep track of who owes you. Each works with the tools you have today.",
  },
  title: "Guides for owners",
  lead: "Practical steps for owner-run businesses in Qatar, written by the ALYR team. Each works with the tools you have today, and says at the end what ALYR does for it.",
  crumb: "Guides",
  kind: "Guide",
  by: "ALYR team",
  published: "Published",
  short: "In short",
  related: "For your kind of business",
  see: "See {name}",
  read: "Read the guide",
  footer: "Guides",
  card: "ALYR: an owner guide by the ALYR team, with its title and date",
  cta: {
    title: "Tell us which of these costs you the most.",
    body: "Send us a message. A person from ALYR replies, then comes to look at it with you at your shop.",
  },
  items: {
    // ------------------------------------------------------------ orders
    "stop-losing-whatsapp-orders": {
      meta: {
        title: "How to stop losing WhatsApp orders in the rush · ALYR guide",
        description:
          "For bakeries, restaurants and shops in Qatar: give every order one shape, confirm each in writing with a number, keep one list with one person per order, and close orders on time. With the WhatsApp Business app or with ALYR.",
      },
      title: "Stop losing WhatsApp orders in the rush",
      short:
        "Orders get lost in a rush because each one arrives in a different shape: a voice note, a photo, half a sentence. Give them one shape before the rush starts. Send customers a list or menu to choose from, confirm every order in writing with a number and a time, keep all orders in one list your whole team works from, and give each order one person responsible. Close orders at a set time. The WhatsApp Business app and a notebook can do most of this; ALYR does it with an order page and one shared screen.",
      published: "2026-10-28T09:00:00+03:00",
      modified: "2026-10-28T09:00:00+03:00",
      date: "28 Oct 2026",
      sections: [
        {
          id: "why",
          title: "Why orders get lost",
          body: "In a quiet hour, one person sees every chat and remembers every order. In a rush, three people answer from two phones, the same customer writes four times, and the order that matters is a voice note far up the chat. Nothing is lost on purpose. It is lost because nobody can see the whole list.",
        },
        {
          id: "before",
          title: "Before the rush",
          steps: [
            { title: "Give customers something to choose from", body: "Put your menu or price list where a customer can pick from it: the catalog in the WhatsApp Business app, a list with a number beside each item, or an order page. A customer who picks from a list sends an order you can read." },
            { title: "Decide when orders close", body: "Set the time orders for the next day close, and how many of each item you can make. Say both in your greeting message, and stop taking orders when either is reached." },
            { title: "Write your saved replies", body: "Write once the answers you give every day: the menu link, your hours, where to collect, how to pay, when an order will be ready. In the WhatsApp Business app these are quick replies." },
          ],
        },
        {
          id: "during",
          title: "During the rush",
          steps: [
            { title: "Confirm every order in writing", body: "Send the order back to the customer with the items, the quantity, the day and time, and a number, for example “Order 14 · 2 kg kunafa, 18 maamoul · Thursday, 5 pm”. If it is wrong, the customer says so now, not at the counter." },
            { title: "Keep one list", body: "Every confirmed order goes on one list your whole team works from, on paper by the oven or on a screen, never only in the chat. Mark each order new, confirmed, ready for collection or complete." },
            { title: "Give each order one person", body: "Write a name beside each order. When the customer asks, one person has the answer, and two people never reply to the same chat." },
            { title: "Label the chats", body: "In the WhatsApp Business app, give each chat a label such as New order, Confirmed or Ready, so the chat list shows where each one stands." },
          ],
        },
        {
          id: "after",
          title: "After the rush",
          steps: [
            { title: "Tell customers when it is ready", body: "A short message when the order is ready saves the “is it ready?” calls, and the customer comes at the right time." },
            { title: "Look at what went wrong", body: "At closing, look at the orders that were late, wrong or missed, and find the step that failed. Fix that step before the next rush." },
          ],
        },
      ],
      alyr: {
        title: "With ALYR",
        body: "We set these steps up with you, at your shop.",
        items: [
          "Customers order from a page that opens from the chat, by the piece or by weight, so every order arrives in one shape.",
          "Every order lands on one screen your team shares, with its status and one person responsible.",
          "The customer gets a message when the order is confirmed and when it is ready.",
          "Each item can have a number a day and a time orders close.",
          "Saved replies and notes in one inbox your whole team shares.",
        ],
        products: ["chat", "shelf"],
      },
      sectors: ["bakeries", "restaurants", "fashion"],
      cta: {
        title: "Tell us how your busiest day goes.",
        body: "Send us a message. A person from ALYR replies, then comes to look at your rush with you.",
      },
    },

    // ------------------------------------------------------------ no-shows
    "cut-no-shows-with-reminders": {
      meta: {
        title: "How to cut no-shows with reminders · ALYR guide",
        description:
          "For salons, barbers and home services in Qatar: confirm every booking in writing, remind a few hours before with an easy way to cancel, mark who came, and act on repeat no-shows. By hand, or with ALYR Bookings for the confirmation and the reminder.",
      },
      title: "Cut no-shows with reminders",
      short:
        "A customer who forgot cannot come, and a reminder fixes that. Confirm every booking in writing the moment it is made, with the day, the time and the service. Send a reminder a few hours before, with an easy way to cancel or move, so the slot can go to someone else. Mark who came and who did not, so you know your real no-show rate and who misses more than once. You can do this by hand with saved replies and one list; ALYR Bookings sends the confirmation and the reminder itself.",
      published: "2026-10-28T09:00:00+03:00",
      modified: "2026-10-28T09:00:00+03:00",
      date: "28 Oct 2026",
      sections: [
        {
          id: "why",
          title: "Why customers do not come",
          body: "Often it is not rudeness. The booking was made days ago, in a chat, between other messages, and nothing brought it back to mind. Some customers would have cancelled if cancelling were easy.",
        },
        {
          id: "confirm",
          title: "Confirm every booking",
          steps: [
            { title: "Write it back the moment it is made", body: "Day, date, time, service and who will see them, for example “Saturday 17 Oct, 4:30 pm, haircut with Karim”. A booking confirmed in writing is one the customer can find again." },
            { title: "Keep all bookings in one place", body: "One book at the counter, or one calendar everyone can see. Two lists mean two customers in the same slot." },
          ],
        },
        {
          id: "remind",
          title: "Remind them",
          steps: [
            { title: "Choose the time", body: "A few hours before suits an afternoon visit; for a morning visit, the evening before works better. Send it at the same time for every booking, so customers learn to expect it." },
            { title: "Make it easy to answer", body: "End the reminder with what to do if plans changed, for example “Reply 1 to confirm or 2 to cancel”. A cancellation two hours before is a slot you can still fill." },
            { title: "Keep it short", body: "The name, the day, the time and the place, and nothing else." },
          ],
        },
        {
          id: "mark",
          title: "Mark who came",
          steps: [
            { title: "Mark every visit the same day", body: "Came or no-show, every evening, so the monthly count is right." },
            { title: "Count once a month", body: "Divide the no-shows by the bookings. Watch the number when you change the reminder, and keep what works." },
          ],
        },
        {
          id: "repeat",
          title: "When the same customer misses again",
          body: "Talk to them before you take the next booking. Some businesses ask a customer who missed twice to confirm the day before, or to book only for the same day. Choose your own policy and say it in writing before the booking, not after.",
        },
      ],
      alyr: {
        title: "With ALYR",
        body: "ALYR Bookings covers the confirmation, the reminder and the count. It takes one booking at a time across the whole business, which suits one chair, one room or one team.",
        items: [
          "Customers book from a page in the chat that shows only open times.",
          "The confirmation goes at once and says how to cancel. The reminder goes two hours before every booking.",
          "“my booking” lets a customer cancel, which frees the time.",
          "Your team marks Came or No-show in one tap.",
          "ALYR Agent shows your no-show rate over 30 days and a customer who missed twice and booked again.",
        ],
        products: ["bookings", "agent"],
      },
      sectors: ["salons", "home-services"],
      cta: {
        title: "Tell us about the bookings you lost last month.",
        body: "Send us a message. A person from ALYR replies, then comes to show you a booking and its reminder on your own phone.",
      },
    },

    // ------------------------------------------------------------ credit
    "keep-track-of-who-owes-you": {
      meta: {
        title: "How to keep track of customers who owe you · ALYR guide",
        description:
          "For groceries, bakeries and home services in Qatar: record each credit sale when it happens, tell the customer the new balance, sort what is owed by age, and remind on a schedule. With a notebook or with ALYR Accounts.",
      },
      title: "Keep track of who owes you",
      short:
        "Record every credit sale when it happens, with the date, the amount and who took it, and tell the customer the new balance each time. Once a week, list who owes what and for how long, oldest first. Remind those more than 30 days behind, friendly at first and firmer as the debt ages, never twice in a few days. Agree a limit for each regular, record every promise to pay, and take each payment against the oldest purchase first. A credit book works if one person keeps it; ALYR Accounts does it from one line on the staff phone.",
      published: "2026-10-28T09:00:00+03:00",
      modified: "2026-10-28T09:00:00+03:00",
      date: "28 Oct 2026",
      sections: [
        {
          id: "why",
          title: "Why credit gets lost",
          body: "Credit is a favour to a regular, so it is written down quickly, by whoever is at the counter, in their own way. A month later nobody is sure of the total, and asking feels like an accusation. What fixes it is a record both sides trust.",
        },
        {
          id: "record",
          title: "Record it the same way every time",
          steps: [
            { title: "At the moment of the sale", body: "The date, the customer, what they took, the amount and who served them. Mistakes come in when it is written later." },
            { title: "Tell the customer each entry", body: "Send what was added and the new balance, the same day. A customer who sees each entry has little to dispute at the end of the month." },
            { title: "One record, one keeper", body: "One book kept by one person, or one screen. Two notebooks never agree." },
          ],
        },
        {
          id: "age",
          title: "Know how old each debt is",
          body: "Sort what is owed by age: up to 30 days, 31 to 60, 61 to 90, and over 90. The oldest amounts matter more than the total, because the longer a debt waits, the harder it is to collect.",
        },
        {
          id: "remind",
          title: "Remind on a schedule",
          steps: [
            { title: "Pick a day each week", body: "Remind everyone more than 30 days behind on the same day, so it is a routine for everyone and nobody feels singled out." },
            { title: "Let the tone follow the age", body: "A friendly reminder first, and firmer after 60 days. Never more than one reminder in a few days." },
            { title: "Ask for a date", body: "Let the customer answer with the day they will pay, write the promise down, and look at it again on that day." },
            { title: "Stop when asked", body: "If a customer asks you to stop the messages, stop, and settle it face to face." },
          ],
        },
        {
          id: "limits",
          title: "Limits and payments",
          items: [
            "Agree a limit for each regular, and stop new credit when it is reached.",
            "Take each payment against the oldest purchase first, and tell the customer what is left.",
            "Give a receipt for every payment, even part of one.",
          ],
        },
      ],
      alyr: {
        title: "With ALYR",
        body: "ALYR Accounts keeps this record for you, and we go through your book with you at setup.",
        items: [
          "Your staff record a credit sale or a payment with one line from their phone, and the customer is told the entry and the new balance.",
          "A customer can ask for their balance in the chat at any time.",
          "What is owed, by age, with who promised to pay and when.",
          "One press sends reminders to everyone 30 days or more behind, with the safeguards on the ALYR Accounts page.",
          "A payment settles the oldest purchase first.",
          "ALYR Agent shows promises that have passed and accounts over their limit.",
        ],
        products: ["accounts", "agent"],
      },
      sectors: ["groceries", "bakeries", "home-services"],
      cta: {
        title: "Tell us who owes you, and since when.",
        body: "Send us a message. A person from ALYR replies, then comes to go through your book with you.",
      },
    },
  },
};

// ------------------------------------------------------------------ Arabic (draft, ALY-66)

export const guidesAr: GuidesCopy = {
  meta: {
    title: "أدلة للمنشآت التي يديرها أصحابها في قطر · ALYR",
    description:
      "أدلة عملية لأصحاب المحلات في قطر: كيف لا تضيع طلبات واتساب وقت الزحمة، وكيف تقلل الغياب عن المواعيد بالتذكير، وكيف تتابع من عليه مستحقات لك. كل دليل يعمل بالأدوات التي لديك اليوم.",
  },
  title: "أدلة لأصحاب المحلات",
  lead: "خطوات عملية للمنشآت التي يديرها أصحابها في قطر، كتبها فريق ALYR. كل دليل يعمل بالأدوات التي لديك اليوم، ويذكر في آخره ما تفعله ALYR في ذلك.",
  crumb: "الأدلة",
  kind: "دليل",
  by: "فريق ALYR",
  published: "نُشر في",
  short: "باختصار",
  related: "لنوع نشاطك",
  see: "اطّلع على {name}",
  read: "اقرأ الدليل",
  footer: "الأدلة",
  card: "ALYR: دليل لأصحاب المحلات من فريق ALYR، بعنوانه وتاريخه",
  cta: {
    title: "أخبرنا أيّ هذه الأمور يكلّفك أكثر.",
    body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليراه معك في محلك.",
  },
  items: {
    "stop-losing-whatsapp-orders": {
      meta: {
        title: "كيف لا تضيع طلبات واتساب وقت الزحمة · دليل من ALYR",
        description:
          "للمخابز والمطاعم والمحلات في قطر: اجعل لكل طلب شكلاً واحداً، وأكّد كل طلب كتابةً برقم، واحتفظ بقائمة واحدة ولكل طلب شخص مسؤول، وأغلق الطلبات في وقتها. بتطبيق واتساب للأعمال أو مع ALYR.",
      },
      title: "لا تدع طلبات واتساب تضيع وقت الزحمة",
      short:
        "تضيع الطلبات وقت الزحمة لأن كل طلب يصل بشكل مختلف: رسالة صوتية، صورة، نصف جملة. اجعل لها شكلاً واحداً قبل أن تبدأ الزحمة. أرسل للعملاء قائمة يختارون منها، وأكّد كل طلب كتابةً برقم ووقت، واجمع الطلبات كلها في قائمة واحدة يعمل منها فريقك كله، واجعل لكل طلب شخصاً واحداً مسؤولاً عنه. وأغلق الطلبات في وقت محدد. يستطيع تطبيق واتساب للأعمال ودفتر واحد أن يؤديا أغلب هذا، وتؤديه ALYR بصفحة طلب وشاشة واحدة مشتركة.",
      published: "2026-10-28T09:00:00+03:00",
      modified: "2026-10-28T09:00:00+03:00",
      date: "28 أكتوبر 2026",
      sections: [
        {
          id: "why",
          title: "لماذا تضيع الطلبات",
          body: "في الساعة الهادئة يقرأ شخص واحد كل المحادثات ويتذكر كل طلب. وفي الزحمة يردّ ثلاثة أشخاص من هاتفين، ويكتب العميل نفسه أربع مرات، ويكون الطلب المهم رسالة صوتية بعيدة في أعلى المحادثة. لا يضيع شيء عن قصد، بل يضيع لأن أحداً لا يرى القائمة كاملة.",
        },
        {
          id: "before",
          title: "قبل الزحمة",
          steps: [
            { title: "أعطِ العملاء ما يختارون منه", body: "ضع قائمتك أو قائمة أسعارك حيث يستطيع العميل أن يختار منها: الكتالوج في تطبيق واتساب للأعمال، أو قائمة بجانب كل صنف فيها رقم، أو صفحة طلب. العميل الذي يختار من قائمة يرسل طلباً تستطيع قراءته." },
            { title: "حدّد متى تُغلق الطلبات", body: "حدّد الوقت الذي تُغلق فيه طلبات اليوم التالي، وكم تستطيع أن تصنع من كل صنف. اذكر الأمرين في رسالة الترحيب، وتوقف عن استقبال الطلبات حين يتحقق أحدهما." },
            { title: "اكتب ردودك المحفوظة", body: "اكتب مرة واحدة الإجابات التي تكررها كل يوم: رابط القائمة، ساعات العمل، مكان الاستلام، طريقة الدفع، موعد جاهزية الطلب. في تطبيق واتساب للأعمال تسمّى هذه الردود السريعة." },
          ],
        },
        {
          id: "during",
          title: "أثناء الزحمة",
          steps: [
            { title: "أكّد كل طلب كتابةً", body: "أعِد الطلب إلى العميل بأصنافه وكمياته ويومه ووقته ورقمه، مثل «الطلب رقم 14 · 2 كغ كنافة، 18 معمول · الخميس، 5 م». إن كان فيه خطأ قاله العميل الآن، لا عند الكاونتر." },
            { title: "احتفظ بقائمة واحدة", body: "كل طلب مؤكد يدخل قائمة واحدة يعمل منها فريقك كله، على ورقة بجانب الفرن أو على شاشة، لا في المحادثة وحدها. وضع لكل طلب حالته: جديد، مؤكد، جاهز للاستلام، مكتمل." },
            { title: "اجعل لكل طلب شخصاً واحداً", body: "اكتب اسماً بجانب كل طلب. حين يسأل العميل يكون الجواب عند شخص واحد، ولا يردّ شخصان على المحادثة نفسها." },
            { title: "صنّف المحادثات", body: "في تطبيق واتساب للأعمال أعطِ كل محادثة تصنيفاً مثل «طلب جديد» أو «مؤكد» أو «جاهز»، فتُظهر قائمة المحادثات أين وصل كل طلب." },
          ],
        },
        {
          id: "after",
          title: "بعد الزحمة",
          steps: [
            { title: "أبلغ العملاء حين يجهز الطلب", body: "رسالة قصيرة حين يجهز الطلب توفّر اتصالات «طلبي جاهز؟»، ويأتي العميل في الوقت المناسب." },
            { title: "راجع ما حدث", body: "عند الإغلاق راجع الطلبات التي تأخرت أو أُخطئ فيها أو ضاعت، وابحث عن الخطوة التي لم تنجح. أصلح تلك الخطوة قبل الزحمة القادمة." },
          ],
        },
      ],
      alyr: {
        title: "مع ALYR",
        body: "نجهّز هذه الخطوات معك في محلك.",
        items: [
          "يطلب العملاء من صفحة تفتح من المحادثة، بالقطعة أو بالوزن، فيصل كل طلب بالشكل نفسه.",
          "يصل كل طلب إلى شاشة واحدة يتشاركها فريقك، مع حالته وشخص واحد مسؤول عنه.",
          "تصل العميل رسالة حين يُؤكَّد الطلب وحين يجهز.",
          "يمكن أن يكون لكل صنف حدّ يومي ووقت تُغلق فيه الطلبات.",
          "ردود محفوظة وملاحظات في صندوق واحد يتشاركه فريقك.",
        ],
        products: ["chat", "shelf"],
      },
      sectors: ["bakeries", "restaurants", "fashion"],
      cta: {
        title: "أخبرنا كيف يمرّ أكثر أيامك ازدحاماً.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليرى الزحمة معك.",
      },
    },

    "cut-no-shows-with-reminders": {
      meta: {
        title: "كيف تقلل الغياب عن المواعيد بالتذكير · دليل من ALYR",
        description:
          "للصالونات ومحلات الحلاقة والخدمات المنزلية في قطر: أكّد كل حجز كتابةً، وذكّر قبل الموعد بساعات مع طريقة سهلة للإلغاء، وسجّل من حضر، وتعامل مع الغياب المتكرر. يدوياً، أو مع ALYR Bookings للتأكيد والتذكير.",
      },
      title: "قلّل الغياب عن المواعيد بالتذكير",
      short:
        "العميل الذي نسي لا يستطيع أن يحضر، والتذكير يعالج ذلك. أكّد كل حجز كتابةً فور إجرائه، باليوم والوقت والخدمة. وأرسل تذكيراً قبل الموعد بساعات، مع طريقة سهلة للإلغاء أو التأجيل، ليذهب الوقت الفارغ إلى غيره. وسجّل من حضر ومن لم يحضر، لتعرف نسبة الغياب الحقيقية ومن يتغيب أكثر من مرة. تستطيع أن تفعل هذا يدوياً بالردود المحفوظة وقائمة واحدة، ويرسل ALYR Bookings التأكيد والتذكير بنفسه.",
      published: "2026-10-28T09:00:00+03:00",
      modified: "2026-10-28T09:00:00+03:00",
      date: "28 أكتوبر 2026",
      sections: [
        {
          id: "why",
          title: "لماذا لا يحضر العملاء",
          body: "كثيراً ما لا يكون الأمر قلة احترام. فالحجز تمّ قبل أيام، في محادثة، بين رسائل أخرى، ولم يذكّر العميلَ به شيء. وبعض العملاء كانوا سيلغون لو كان الإلغاء سهلاً.",
        },
        {
          id: "confirm",
          title: "أكّد كل حجز",
          steps: [
            { title: "اكتبه للعميل لحظة الحجز", body: "اليوم والتاريخ والوقت والخدمة ومن سيخدمه، مثل «السبت 17 أكتوبر، 4:30 م، قص شعر مع كريم». الحجز المؤكد كتابةً يستطيع العميل أن يرجع إليه." },
            { title: "اجمع الحجوزات في مكان واحد", body: "دفتر واحد عند الكاونتر، أو تقويم واحد يراه الجميع. قائمتان تعنيان عميلين في الوقت نفسه." },
          ],
        },
        {
          id: "remind",
          title: "ذكّرهم",
          steps: [
            { title: "اختر الوقت", body: "قبل الموعد بساعات يناسب موعد العصر، أما موعد الصباح فيناسبه تذكير في المساء السابق. أرسله في الوقت نفسه لكل حجز، ليعتاد العملاء انتظاره." },
            { title: "اجعل الرد سهلاً", body: "اختم التذكير بما يفعله العميل إن تغيّرت خططه، مثل «أرسل 1 للتأكيد أو 2 للإلغاء». الإلغاء قبل الموعد بساعتين وقتٌ ما زال بإمكانك ملؤه." },
            { title: "اجعله قصيراً", body: "الاسم واليوم والوقت والمكان، لا أكثر." },
          ],
        },
        {
          id: "mark",
          title: "سجّل من حضر",
          steps: [
            { title: "سجّل كل موعد في يومه", body: "حضر أو لم يحضر، كل مساء، ليكون العدّ الشهري صحيحاً." },
            { title: "احسب مرة كل شهر", body: "اقسم عدد مرات الغياب على عدد الحجوزات. راقب الرقم حين تغيّر التذكير، واحتفظ بما ينجح." },
          ],
        },
        {
          id: "repeat",
          title: "حين يتغيب العميل نفسه مرة أخرى",
          body: "تحدّث معه قبل أن تقبل حجزه التالي. بعض المحلات تطلب من العميل الذي غاب مرتين أن يؤكد في اليوم السابق، أو أن يحجز لليوم نفسه فقط. اختر سياستك واكتبها للعميل قبل الحجز، لا بعده.",
        },
      ],
      alyr: {
        title: "مع ALYR",
        body: "يتولى ALYR Bookings التأكيد والتذكير والعدّ. ويستقبل حجزاً واحداً في الوقت نفسه للنشاط كله، وهذا يناسب كرسياً واحداً أو غرفة واحدة أو فريقاً واحداً.",
        items: [
          "يحجز العملاء من صفحة في المحادثة لا تعرض إلا الأوقات المتاحة.",
          "يصل التأكيد فوراً ومعه طريقة الإلغاء، ويصل التذكير قبل كل موعد بساعتين.",
          "تتيح «حجزي» للعميل أن يلغي، فيعود الوقت متاحاً.",
          "يسجّل فريقك «حضر» أو «لم يحضر» بلمسة واحدة.",
          "يعرض ALYR Agent نسبة الغياب خلال 30 يوماً، والعميل الذي غاب مرتين ثم حجز من جديد.",
        ],
        products: ["bookings", "agent"],
      },
      sectors: ["salons", "home-services"],
      cta: {
        title: "أخبرنا عن الحجوزات التي خسرتها الشهر الماضي.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليريك حجزاً وتذكيره على هاتفك.",
      },
    },

    "keep-track-of-who-owes-you": {
      meta: {
        title: "كيف تتابع العملاء الذين عليهم مستحقات لك · دليل من ALYR",
        description:
          "للبقالات والمخابز والخدمات المنزلية في قطر: سجّل كل بيع آجل لحظة حدوثه، وأبلغ العميل برصيده الجديد، ورتّب المستحقات حسب عمرها، وذكّر في موعد ثابت. بدفتر أو مع ALYR Accounts.",
      },
      title: "تابِع من عليه مستحقات لك",
      short:
        "اكتب كل بيع آجل لحظة حدوثه، بالتاريخ والمبلغ ومن أخذه، وأبلغ العميل برصيده الجديد في كل مرة. ومرة كل أسبوع اكتب من عليه كم ومنذ متى، الأقدم أولاً. وذكّر من تأخر أكثر من 30 يوماً، بنبرة ودية أولاً ثم أحزم كلما طال التأخير، ولا تذكّر أحداً مرتين خلال أيام قليلة. واتفق على حدّ لكل زبون دائم، واكتب كل وعد بالسداد مع تاريخه، واخصم كل دفعة من أقدم مشترياته أولاً. دفتر الديون يكفي إن حفظه شخص واحد، ويفعل ALYR Accounts ذلك بسطر واحد من هاتف الموظف.",
      published: "2026-10-28T09:00:00+03:00",
      modified: "2026-10-28T09:00:00+03:00",
      date: "28 أكتوبر 2026",
      sections: [
        {
          id: "why",
          title: "لماذا يضيع الآجل",
          body: "البيع بالآجل معروفٌ تقدّمه لزبون دائم، لذلك يُكتب بسرعة، بيد من يكون عند الكاونتر، وبطريقته. وبعد شهر لا أحد متأكد من المجموع، وتبدو المطالبة كأنها اتهام. والعلاج سجلّ يثق به الطرفان.",
        },
        {
          id: "record",
          title: "سجّله بالطريقة نفسها كل مرة",
          steps: [
            { title: "لحظة البيع", body: "التاريخ والعميل وما أخذه والمبلغ ومن خدمه. الأخطاء تدخل حين يُكتب لاحقاً." },
            { title: "أبلغ العميل بكل قيد", body: "أرسل ما أُضيف والرصيد الجديد في اليوم نفسه. العميل الذي يرى كل قيد قلّما يجد ما يعترض عليه في آخر الشهر." },
            { title: "سجلّ واحد وحافظ واحد", body: "دفتر واحد يحفظه شخص واحد، أو شاشة واحدة. دفتران لا يتفقان أبداً." },
          ],
        },
        {
          id: "age",
          title: "اعرف عمر كل دين",
          body: "رتّب المستحقات حسب عمرها: حتى 30 يوماً، ومن 31 إلى 60، ومن 61 إلى 90، وأكثر من 90. المبالغ الأقدم أهم من المجموع، لأن الدين كلما طال انتظاره صعب تحصيله.",
        },
        {
          id: "remind",
          title: "ذكّر في موعد ثابت",
          steps: [
            { title: "اختر يوماً كل أسبوع", body: "ذكّر كل من تأخر أكثر من 30 يوماً في اليوم نفسه، ليصبح الأمر عادة للجميع ولا يشعر أحد أنه المقصود وحده." },
            { title: "اجعل النبرة تتبع عمر الدين", body: "تذكير ودّي أولاً، ثم أحزم بعد 60 يوماً. ولا أكثر من تذكير واحد خلال أيام قليلة." },
            { title: "اطلب موعداً", body: "دع العميل يرد باليوم الذي سيدفع فيه، واكتب الوعد، وارجع إليه في ذلك اليوم." },
            { title: "توقف حين يُطلب منك", body: "إن طلب العميل أن تتوقف الرسائل فتوقف، وسوِّ الأمر معه وجهاً لوجه." },
          ],
        },
        {
          id: "limits",
          title: "الحدود والدفعات",
          items: [
            "اتفق على حدّ لكل زبون دائم، وأوقف الآجل الجديد حين يبلغه.",
            "اخصم كل دفعة من أقدم المشتريات أولاً، وأبلغ العميل بما بقي عليه.",
            "أعطِ إيصالاً لكل دفعة، حتى لو كانت جزءاً من المبلغ.",
          ],
        },
      ],
      alyr: {
        title: "مع ALYR",
        body: "يحفظ ALYR Accounts هذا السجل لك، ونراجع دفترك معك عند التجهيز.",
        items: [
          "يسجّل موظفوك البيع الآجل أو الدفعة بسطر واحد من هواتفهم، ويُبلَّغ العميل بالقيد وبرصيده الجديد.",
          "يستطيع العميل أن يسأل عن رصيده في المحادثة متى شاء.",
          "المستحقات حسب عمرها، مع من وعد بالسداد ومتى.",
          "ضغطة واحدة ترسل التذكيرات إلى كل من تأخر 30 يوماً أو أكثر، مع الضوابط المذكورة في صفحة ALYR Accounts.",
          "تُسدِّد الدفعة أقدم المشتريات أولاً.",
          "يعرض ALYR Agent وعود السداد التي فات موعدها والحسابات التي تجاوزت حدها.",
        ],
        products: ["accounts", "agent"],
      },
      sectors: ["groceries", "bakeries", "home-services"],
      cta: {
        title: "أخبرنا من عليه مستحقات لك ومنذ متى.",
        body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليراجع دفترك معك.",
      },
    },
  },
};
