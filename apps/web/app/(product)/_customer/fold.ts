// Searching the shop's items the way people write them (ALY-112). The customer types an
// Arabic word with or without the marks above the letters, the alef written four ways, the
// final yeh as ya or alef maqsura, the round ta as ha; this folds both the word and the
// items' text to one spelling before comparing.
//
// It mirrors `apps/api/src/alyr/modules/items/text.py` (`fold`, `search_words`, `matches`),
// which does the same on the server for a page that is not fully loaded. The cases both
// must agree on are `specs/005-order-page-v2/fold-cases.json`; the API's test and this
// folder's both read them, so one cannot drift from the other.

const MAP: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", // alef with hamza, madda, wasla
  "ى": "ي", "ی": "ي", "ئ": "ي", // alef maqsura, Persian yeh, yeh with hamza
  "ة": "ه", // ta marbuta
  "ؤ": "و", // waw with hamza
  "ک": "ك", // Persian kaf
  "ـ": "", // tatweel, the stretch line
};
const DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
const MARKS = /[ً-ٰٟۖ-ۭ]/g; // tashkeel and small marks
const SEPARATORS = /[\s,.;:/\\|()[\]{}\-_+*«»"'`،؛؟]+/;

/** Lower case, one spelling for each Arabic letter people mix up, no marks. */
export function fold(text: string): string {
  let out = "";
  for (const char of text.toLowerCase()) {
    if (char in MAP) out += MAP[char];
    else {
      const digit = DIGITS.indexOf(char);
      out += digit >= 0 ? String(digit % 10) : char;
    }
  }
  return out.replace(MARKS, "").trim();
}

/** The words of a search, folded. An empty search has none. */
export function searchWords(query: string): string[] {
  return fold(query).split(SEPARATORS).filter(Boolean);
}

/** Every word is found somewhere in the fields (part of a word counts: «شاور» finds «شاورما»). */
export function matches(words: string[], ...fields: (string | undefined | null)[]): boolean {
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).map((f) => fold(f as string)).join(" ");
  return words.every((w) => haystack.includes(w));
}
