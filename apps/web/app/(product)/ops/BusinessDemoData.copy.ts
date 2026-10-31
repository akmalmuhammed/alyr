// The words of the "test business" switch in the back office (specs/063, D-150): one object per
// language. The console is English, so the switch shows both: each line in English, then in Arabic
// beneath it. Arabic is Modern Standard, and unreviewed by a native speaker until ALY-66.

export const T = {
  en: {
    heading: "Test business",
    label: "Test business: demo data may be loaded",
    help: "Lets the demo-data command fill this business with made-up customers, orders and documents. Real customers are never touched. Off by default.",
    loaded: "Demo data is loaded.",
    saving: "Saving…",
    savedOn: "Saved. Demo data may be loaded into this business.",
    savedOff: "Saved. Demo data may not be loaded into this business.",
    failed: "That did not save. Try again.",
  },
  ar: {
    heading: "نشاط تجريبي",
    label: "نشاط تجريبي: يُسمح بتحميل بيانات تجريبية",
    help: "يتيح لأمر البيانات التجريبية ملء هذا النشاط بعملاء وطلبات ومستندات وهمية. لا يمسّ العملاء الحقيقيين أبدًا. متوقف افتراضيًا.",
    loaded: "البيانات التجريبية محمّلة.",
    saving: "جارٍ الحفظ…",
    savedOn: "تم الحفظ. يُسمح بتحميل بيانات تجريبية في هذا النشاط.",
    savedOff: "تم الحفظ. لا يُسمح بتحميل بيانات تجريبية في هذا النشاط.",
    failed: "لم يُحفظ التغيير. حاول مرة أخرى.",
  },
} as const;
