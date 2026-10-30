// The words of the plan banner in the workspace (ALY-218, D-082): shown to the owner while a
// payment is overdue, while ALYR's automatic messages are paused, and when the plan is ending or
// has ended. In both languages. Dates arrive written out in the owner's language.

export type Lang = "en" | "ar";

export const COPY = {
  en: {
    region: "Your ALYR plan",
    due: {
      title: "Your payment is due",
      sub: (owed: string, pause: string) => pause
        ? `Pay ${owed} by ${pause} to keep everything working. Until then, everything works as usual.`
        : `Please pay ${owed}. Everything works as usual.`,
    },
    paused: {
      title: "Automatic WhatsApp replies are paused",
      sub: (owed: string, since: string) =>
        `${owed} has been due since ${since}, so ALYR has paused its automatic replies and messages to your customers. Your workspace and your data are all here, and replies you type in the inbox still go. Everything starts again as soon as your payment is recorded.`,
    },
    ending: {
      title: (day: string) => `Your plan ends on ${day}`,
      sub: "Everything works until then. After that ALYR sends nothing more for you on WhatsApp and charges nothing more. Changed your mind? Write to ALYR.",
    },
    ended: {
      title: "Your plan has ended",
      sub: "ALYR sends nothing more for you on WhatsApp. Your data is all here. To come back, write to ALYR.",
    },
    pay: (bank: string, reference: string) => `Pay by bank transfer to ${bank}. Write ${reference} as the reference.`,
    payNoBank: (reference: string) => `ALYR sends you the bank details by email. Write ${reference} as the reference.`,
    recorded: "ALYR records your payment as soon as it arrives.",
  },
  ar: {
    region: "خطتك في ALYR",
    due: {
      title: "حان موعد دفعتك",
      sub: (owed: string, pause: string) => pause
        ? `ادفع ${owed} قبل ${pause} ليبقى كل شيء يعمل. حتى ذلك الحين يعمل كل شيء كالمعتاد.`
        : `يُرجى دفع ${owed}. كل شيء يعمل كالمعتاد.`,
    },
    paused: {
      title: "الردود التلقائية على واتساب متوقفة",
      sub: (owed: string, since: string) =>
        `مبلغ ${owed} مستحق منذ ${since}، لذلك أوقفت ALYR ردودها التلقائية ورسائلها لعملائك. مساحة عملك وبياناتك كلها هنا، والردود التي تكتبها في صندوق الرسائل تُرسل. يعود كل شيء للعمل حالما تُسجَّل دفعتك.`,
    },
    ending: {
      title: (day: string) => `تنتهي خطتك يوم ${day}`,
      sub: "يعمل كل شيء حتى ذلك اليوم. بعده لا ترسل ALYR شيئاً باسمك على واتساب ولا تحاسبك على شيء. غيّرت رأيك؟ راسل ALYR.",
    },
    ended: {
      title: "انتهت خطتك",
      sub: "لا ترسل ALYR شيئاً باسمك على واتساب. بياناتك كلها هنا. للعودة، راسل ALYR.",
    },
    pay: (bank: string, reference: string) => `ادفع بتحويل بنكي إلى ${bank}. اكتب ${reference} كمرجع للتحويل.`,
    payNoBank: (reference: string) => `ترسل لك ALYR تفاصيل الحساب البنكي بالبريد الإلكتروني. اكتب ${reference} كمرجع للتحويل.`,
    recorded: "تسجّل ALYR دفعتك حالما تصل.",
  },
};
