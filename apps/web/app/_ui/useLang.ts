// The language a screen reads in: one hook, so a screen never keeps its own copy of it. It reads
// the choice kept on this device (`_workspace/lang.ts`, the keys sign-in and sign-up already
// write, so a person who chose Arabic there lands in Arabic here) and follows a change made in
// this tab or in another. A browser that refuses storage starts in English every time.
//
//   const { lang, dir, attrs, ready, setLang, pick } = useLang();
//   <div {...attrs}>             // lang="ar" dir="rtl" on the screen's root
//   pick({ en: "Orders", ar: "الطلبات" })
//
// `ready` is false on the server and for the first client render, so a screen that would
// otherwise flash English before Arabic can wait for it. The pure parts (`dirOf`, `pickText`)
// are tested with `node --test`.

import { useCallback, useSyncExternalStore } from "react";
import { keepLang, savedLang } from "../(product)/_workspace/lang.ts";
import type { Lang } from "./format.ts";

export type LangText = { en: string; ar: string };

/** The text direction of a language. */
export function dirOf(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** The line in a language. */
export function pickText(text: LangText, lang: Lang): string {
  return text[lang];
}

const CHANGED = "alyr:lang";

// What was chosen in this tab, so a browser that refuses storage still changes language for the
// visit. Another tab's change (a `storage` event) takes over from it.
let chosen: Lang | null = null;

function subscribe(onChange: () => void): () => void {
  const fromOtherTab = () => {
    chosen = null;
    onChange();
  };
  window.addEventListener("storage", fromOtherTab);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", fromOtherTab);
    window.removeEventListener(CHANGED, onChange);
  };
}

const read = (): Lang => chosen ?? savedLang() ?? "en";
const serverLang = (): Lang => "en";
const noSubscription = () => () => {};

export function useLang() {
  const lang = useSyncExternalStore(subscribe, read, serverLang);
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  const setLang = useCallback((next: Lang) => {
    chosen = next;
    keepLang(next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  const pick = useCallback((text: LangText) => pickText(text, lang), [lang]);
  const dir = dirOf(lang);
  return { lang, dir, attrs: { lang, dir } as const, ready, setLang, pick };
}
