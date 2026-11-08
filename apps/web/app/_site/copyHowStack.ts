// The words of the homepage's "How we work with you" (HowStack.tsx), English and Arabic:
// four panels that stack as the visitor scrolls, one per step.
// - The check-up is a remote look (decision of 5 Nov 2026: no shop visits), so it says what
//   we look at and that we send the list; it never says we come to the shop.
// - The setup is done by us with the business. "See" and "Improve" are ALYR Agent's own screen
//   and numbers, drawn from the bakery sample, and say what Agent counts or compares.
// - No AI wording, no promise of a date, nothing coming. The last panel ends on "Then we check
//   again". The Arabic is a draft until the native review (ALY-66); digits are Western.
// The words inside the drawn scenes (the sheet's rows, the checklist, the sample screens) are
// the existing `home.how.scenes` in copy.ts; only the check-up sheet's title and label are
// reworded here, because the old ones said "at the counter".

export type HowStackStepId = "check" | "setup" | "see" | "improve";

export type HowStackStep = {
  id: HowStackStepId;
  /** The small chip above the headline. */
  tag: string;
  /** The headline's first line, and its second line, set apart. */
  lead: string;
  mark: string;
  /** Two short lines. */
  body: string;
};

export type HowStackCopy = {
  title: string;
  /** One line under the title. */
  lead: string;
  /** Read before the four panels, for screen readers. */
  listLabel: string;
  steps: HowStackStep[];
  /** The check-up sheet drawn in the first panel: its title and what a screen reader hears. */
  check: { title: string; label: string };
  /** After the last panel. */
  note: string;
};

export const howStackEn: HowStackCopy = {
  title: "How we work with you",
  lead: "Four steps, in order, from the first look to the next check.",
  listLabel: "The four steps",
  steps: [
    {
      id: "check",
      tag: "Step 1 · Check-up",
      lead: "We look at how you run today,",
      mark: "then send you the list.",
      body: "We look at how customers find you and how orders, bookings and credit are kept. You get the list in plain words.",
    },
    {
      id: "setup",
      tag: "Step 2 · Set up",
      lead: "We set up only what the list calls for,",
      mark: "with you and your team.",
      body: "We add your menu or prices, your services and your opening hours with you, then show your team where orders arrive.",
    },
    {
      id: "see",
      tag: "Step 3 · See",
      lead: "You see your business",
      mark: "on one screen.",
      body: "ALYR Agent counts your orders and messages and lists what needs you now. The numbers update as orders come in.",
    },
    {
      id: "improve",
      tag: "Step 4 · Improve",
      lead: "We go over your week with you.",
      mark: "Then we check again.",
      body: "ALYR Agent compares this week with the same days last week. We go over it with you and add what your business needs next.",
    },
  ],
  check: {
    title: "Check-up",
    label: "Sample check-up sheet of a fictional bakery. Four things checked are ticked, each with what was found.",
  },
  note: "We set ALYR up with each business ourselves, and agree your go-live date with you.",
};

export const howStackAr: HowStackCopy = {
  title: "كيف نعمل معك",
  lead: "أربع خطوات بالترتيب، من النظرة الأولى إلى الفحص التالي.",
  listLabel: "الخطوات الأربع",
  steps: [
    {
      id: "check",
      tag: "الخطوة 1 · الفحص",
      lead: "ننظر كيف يسير عملك اليوم،",
      mark: "ثم نرسل لك القائمة.",
      body: "ننظر كيف يجدك العملاء وكيف تُحفظ الطلبات والحجوزات والآجل. وتصلك القائمة بكلمات واضحة.",
    },
    {
      id: "setup",
      tag: "الخطوة 2 · التجهيز",
      lead: "نجهّز فقط ما تحتاجه القائمة،",
      mark: "معك ومع فريقك.",
      body: "نضيف معك قائمتك أو أسعارك وخدماتك وساعات العمل، ثم نُري فريقك أين تصل الطلبات.",
    },
    {
      id: "see",
      tag: "الخطوة 3 · الرؤية",
      lead: "ترى عملك كله",
      mark: "في شاشة واحدة.",
      body: "يعدّ ALYR Agent طلباتك ورسائلك ويعرض ما يحتاجك الآن. وتتحدّث الأرقام مع وصول الطلبات.",
    },
    {
      id: "improve",
      tag: "الخطوة 4 · التحسين",
      lead: "نراجع أسبوعك معك.",
      mark: "ثم نفحص من جديد.",
      body: "يقارن ALYR Agent هذا الأسبوع بالأيام نفسها من الأسبوع الماضي. ونراجعه معك ونضيف ما يحتاجه عملك بعد ذلك.",
    },
  ],
  check: {
    title: "الفحص",
    label: "ورقة فحص توضيحية لمخبز غير حقيقي. أربعة أمور فُحصت، ومع كل منها ما وُجد.",
  },
  note: "نجهّز ALYR مع كل عمل بأنفسنا، ونتفق معك على موعد التشغيل.",
};
