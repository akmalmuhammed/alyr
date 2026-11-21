// What a customer's message was, when it was not text (the first client's audit, T8, D-195).
//
// A voice note, a photo, a video, a file, a sticker, a place or a contact card arrives with no
// words of its own, and ALYR does not keep or show the file yet. The inbox used to draw an empty
// bubble; now it says what arrived, in both languages, and says plainly that the file is not shown
// here yet, so a person knows to ask the customer to write it down. A reaction is shown as itself
// and was never answered. The Arabic is a draft until the native review (ALY-66).

export type Lang = "en" | "ar";
type Bi = { en: string; ar: string };

const NOT_YET: Bi = { en: " (not shown here yet)", ar: " (لا يظهر هنا بعد)" };
const NOT_YET_F: Bi = { en: " (not shown here yet)", ar: " (لا تظهر هنا بعد)" };

const KINDS: Record<string, { label: Bi; shown: boolean; feminine?: boolean }> = {
  voice: { label: { en: "Voice note", ar: "رسالة صوتية" }, shown: false, feminine: true },
  audio: { label: { en: "Audio", ar: "ملف صوتي" }, shown: false },
  image: { label: { en: "Photo", ar: "صورة" }, shown: false, feminine: true },
  video: { label: { en: "Video", ar: "فيديو" }, shown: false },
  document: { label: { en: "File", ar: "ملف" }, shown: false },
  sticker: { label: { en: "Sticker", ar: "ملصق" }, shown: false },
  location: { label: { en: "Location", ar: "موقع" }, shown: false },
  contacts: { label: { en: "Contact card", ar: "بطاقة اتصال" }, shown: false, feminine: true },
  reaction: { label: { en: "Reaction", ar: "تفاعل" }, shown: true },
  unsupported: { label: { en: "A message WhatsApp could not pass on", ar: "رسالة لم ينقلها واتساب" }, shown: true },
};

/** A customer's message that is not text, as the inbox says it, in both languages; null for text,
 *  a tapped button, or anything else with words of its own. `body` is the caption, or the emoji of a
 *  reaction. */
export function inboundText(kind: string, body: string): Bi | null {
  const known = KINDS[kind];
  if (!known) return null;
  const note = known.shown ? { en: "", ar: "" } : known.feminine ? NOT_YET_F : NOT_YET;
  const text = body.trim();
  const join = (lang: Lang) => {
    const head = `${known.label[lang]}${note[lang]}`;
    if (!text) return head;
    return kind === "reaction" ? `${head}: ${text}` : `${head} · ${text}`;
  };
  return { en: join("en"), ar: join("ar") };
}
