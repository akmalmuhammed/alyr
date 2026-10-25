"use client";

// Demo mode (ALY-246): the real portal published with sample data and no backend. It is on only
// in a build made with NEXT_PUBLIC_ALYR_DEMO=1 (scripts/build-portal-demo.sh); in every other
// build this file does nothing. The browser's own `fetch` is replaced here so each screen reads
// recorded answers of a fictional demo shop (apps/web/demo/<shop>.json, made by
// scripts/demo-portal/record.mjs) and anything that would change data is refused in plain words.
// Nothing is sent anywhere and nothing is kept except the choice of shop in this browser.

import Link from "next/link";
import { useEffect, useState } from "react";
import { answer, DEMO_SHOPS, currentShop, setShop } from "./shim";
import "./demo.css";

const ON = process.env.NEXT_PUBLIC_ALYR_DEMO === "1";

const WORDS = {
  en: { tag: "Demo", note: "Sample data for a make-believe shop. Nothing you do here is saved.", shop: "Shop", start: "All demos", blocked: "This is a demo, so that change was not saved." },
  ar: { tag: "تجربة", note: "بيانات تجريبية لمتجر افتراضي. لا يُحفظ شيء مما تفعله هنا.", shop: "المتجر", start: "كل التجارب", blocked: "هذه نسخة تجريبية، لذلك لم يُحفظ هذا التغيير." },
};

const readLang = (): "en" | "ar" => {
  try {
    const stored = localStorage.getItem("alyr-workspace-lang") ?? localStorage.getItem("alyr-lang");
    if (stored === "ar" || stored === "en") return stored;
  } catch { /* storage blocked */ }
  return document.documentElement.lang === "ar" ? "ar" : "en";
};

export default function DemoMode() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [shop, setCurrent] = useState<string>(DEMO_SHOPS[0].key);
  const [toast, setToast] = useState(false);
  const [onStart, setOnStart] = useState(false);

  useEffect(() => {
    if (!ON) return;
    // What is saved in this browser is read after the first paint, so the page the server
    // drew and the first client render agree.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLang(readLang());
    setCurrent(currentShop());
    setOnStart(window.location.pathname.startsWith("/start"));
    /* eslint-enable react-hooks/set-state-in-effect */
    const refresh = () => setLang(readLang());
    let timer: ReturnType<typeof setTimeout>;
    const blocked = () => {
      setLang(readLang());
      setToast(true);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(false), 4000);
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("alyr-demo-blocked", blocked);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("alyr-demo-blocked", blocked); clearTimeout(timer); };
  }, []);

  if (!ON) return null;
  const t = WORDS[lang];
  return (
    <div className="demo-pill" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} role="note" aria-label={t.note}>
      <Link href="/" className="demo-tag" title={t.note}>{t.tag}</Link>
      {!onStart && <label className="demo-shop">
        <span>{t.shop}</span>
        <select value={shop} onChange={(e) => {
            setShop(e.target.value);
            // A full load, so every screen asks again and reads the new shop.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/app/";
          }}>
          {DEMO_SHOPS.map((s) => <option key={s.key} value={s.key}>{lang === "ar" ? s.name_ar : s.name}</option>)}
        </select>
      </label>}
      <Link href="/" className="demo-link">{t.start}</Link>
      {toast && <span className="demo-toast" role="status">{t.blocked}</span>}
    </div>
  );
}

// Installed as soon as this file loads in the browser, before any screen asks for data.
if (ON && typeof window !== "undefined") {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = typeof input === "string" || input instanceof URL ? null : input;
    const url = new URL(request ? request.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return real(input, init);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    let body: unknown = null;
    try {
      const raw = init?.body ?? (request ? await request.clone().text() : null);
      body = typeof raw === "string" && raw ? JSON.parse(raw) : null;
    } catch { /* a body that is not JSON (a file) is not needed to answer */ }
    return answer(real, method, url, body);
  };
}
