// The words of the terms banner in the workspace (ALY-167): shown to the owner until they accept
// the current customer agreement and privacy notice, in both languages.

export type Lang = "en" | "ar";

export const COPY = {
  en: {
    region: "Terms and privacy notice",
    title: "Please read and accept our terms",
    sub: "ALYR has published a new version. You are asked once, and your acceptance is recorded.",
    agreement: (title: string) => `I accept the ${title}`,
    privacy: (title: string) => `I have read the ${title}`,
    read: "Read it",
    changed: (what: string) => `What changed: ${what}`,
    accept: "Accept",
    failed: "Could not save that. Try again.",
  },
  ar: {
    region: "الشروط وإشعار الخصوصية",
    title: "يرجى قراءة شروطنا والموافقة عليها",
    sub: "نشرت ALYR نسخة جديدة. نسألك مرة واحدة، ونسجّل موافقتك.",
    agreement: (title: string) => `أوافق على ${title}`,
    privacy: (title: string) => `قرأت ${title}`,
    read: "اقرأه",
    changed: (what: string) => `ما تغيّر: ${what}`,
    accept: "أوافق",
    failed: "تعذّر الحفظ. حاول مرة أخرى.",
  },
};
