"use client";

// The first page of the published demo (ALY-246): pick a make-believe shop and open its
// workspace, or sign up as a new business. Used only by the demo build (scripts/build-portal-demo.sh).

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEMO_SHOPS, setShop } from "./shim";
import { clearRun } from "./signup";
import "./landing.css";

const WORDS = {
  en: {
    kicker: "Client portal demo",
    title: "The ALYR workspace, with sample data",
    lead: "This is the real portal, running on make-believe shops. Look around, open a chat, try an order or a booking. Nothing you do is saved, and nothing is sent to anyone.",
    shops: "Open a shop's workspace",
    open: "Open workspace",
    signup: "Sign up as a new business",
    signupAbout: "Walk through setting up a barber shop: services, hours, a test chat as a customer, the plan and going live. Any email works; the code is shown on the page.",
    signupGo: "Start sign-up",
    note: "Every name, phone number and amount here is invented. The demo cannot reach WhatsApp or take payment.",
    lang: "العربية",
  },
  ar: {
    kicker: "تجربة بوابة العميل",
    title: "مساحة عمل ALYR ببيانات تجريبية",
    lead: "هذه هي البوابة الحقيقية تعمل على متاجر افتراضية. تجوّل وافتح محادثة وجرّب طلباً أو حجزاً. لا يُحفظ شيء مما تفعله ولا يُرسل شيء لأحد.",
    shops: "افتح مساحة عمل متجر",
    open: "افتح مساحة العمل",
    signup: "سجّل كنشاط جديد",
    signupAbout: "جرّب إعداد صالون حلاقة: الخدمات والدوام ومحادثة تجريبية كعميل ثم الخطة والانطلاق. أي بريد يصلح، ويظهر الرمز في الصفحة.",
    signupGo: "ابدأ التسجيل",
    note: "كل الأسماء وأرقام الهواتف والمبالغ هنا مخترعة. لا تصل التجربة إلى واتساب ولا تقبل أي دفعة.",
    lang: "English",
  },
};

export default function Landing() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("alyr-workspace-lang");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after the first paint so server and client agree
      if (stored === "ar" || stored === "en") setLang(stored);
    } catch { /* storage blocked */ }
  }, []);
  const t = WORDS[lang];
  const pick = (next: "en" | "ar") => {
    setLang(next);
    try { localStorage.setItem("alyr-workspace-lang", next); localStorage.setItem("alyr-lang", next); } catch { /* storage blocked */ }
  };
  return (
    <main className="dl-page" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="dl-top">
        <span className="dl-mark">ALYR</span>
        <button type="button" className="dl-lang" onClick={() => pick(lang === "en" ? "ar" : "en")}>{t.lang}</button>
      </header>
      <p className="dl-kicker">{t.kicker}</p>
      <h1>{t.title}</h1>
      <p className="dl-lead">{t.lead}</p>

      <h2>{t.shops}</h2>
      <div className="dl-cards">
        {DEMO_SHOPS.map((s) => (
          <Link key={s.key} className="dl-card" href="/app" onClick={() => setShop(s.key)}>
            <strong>{lang === "ar" ? s.name_ar : s.name}</strong>
            <span>{s.about}</span>
            <em>{t.open} →</em>
          </Link>
        ))}
      </div>

      <h2>{t.signup}</h2>
      <Link className="dl-card dl-wide" href="/start" onClick={() => clearRun()}>
        <span>{t.signupAbout}</span>
        <em>{t.signupGo} →</em>
      </Link>
      <p className="dl-note">{t.note}</p>
    </main>
  );
}
