"use client";

// The consent prompt (D-070): one short card at the bottom of the screen until the visitor
// chooses. "Allow" turns on cookies, recordings and heatmaps; "No thanks" keeps the
// cookieless count. The choice is kept in this browser and can be changed on the privacy
// page. Shown on alyr.qa, in onboarding and in the workspace, never on customer pages.

import { useEffect, useState } from "react";
import { onChoice, readChoice, resetChoice, setChoice, type Choice } from "./posthog";
import "./consent.css";

const COPY = {
  en: {
    title: "Help us improve ALYR",
    site: "We count visits without cookies. If you allow it, we also use cookies and record how pages are used, with everything you type hidden.",
    product: "We count which screens are used, never what is in them. If you allow it, we also record how the screens are used, with all text and typing hidden. Customer conversations are never recorded.",
    allow: "Allow",
    deny: "No thanks",
    more: "Privacy notice",
  },
  ar: {
    title: "ساعدنا على تحسين ALYR",
    site: "نعدّ الزيارات دون ملفات تعريف الارتباط. إذا سمحت، نستخدم أيضاً ملفات تعريف الارتباط ونسجّل طريقة استخدام الصفحات، مع إخفاء كل ما تكتبه.",
    product: "نعدّ الشاشات المستخدمة، لا ما بداخلها. إذا سمحت، نسجّل أيضاً طريقة استخدام الشاشات مع إخفاء كل النصوص وما تكتبه. لا نسجّل محادثات العملاء أبداً.",
    allow: "اسمح",
    deny: "لا، شكراً",
    more: "إشعار الخصوصية",
  },
};

const SITE = process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.qa";

export function Consent({ surface }: { surface: "site" | "product" }) {
  const [choice, setLocal] = useState<Choice | null | "unknown">("unknown");

  useEffect(() => {
    const first = setTimeout(() => setLocal(readChoice()), 0);
    const stop = onChoice(setLocal);
    return () => { clearTimeout(first); stop(); };
  }, []);

  if (choice !== null) return null;
  const lang = typeof document !== "undefined" && document.documentElement.lang === "ar" ? "ar" : "en";
  const t = COPY[lang];
  const privacy = `${surface === "site" ? "" : SITE}${lang === "ar" ? "/ar/privacy" : "/privacy"}`;

  return (
    <section className="ph-consent" role="region" aria-label={t.title} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} data-ph-block>
      <div className="ph-consent-text">
        <b>{t.title}</b>
        <p>{surface === "site" ? t.site : t.product} <a href={privacy}>{t.more}</a></p>
      </div>
      <div className="ph-consent-actions">
        <button type="button" className="ph-consent-deny" onClick={() => setChoice("denied")}>{t.deny}</button>
        <button type="button" className="ph-consent-allow" onClick={() => setChoice("granted")}>{t.allow}</button>
      </div>
    </section>
  );
}

/** For the privacy page: ask again. */
export function ChangeChoice({ label }: { label: string }) {
  return (
    <button type="button" className="ph-consent-change" onClick={resetChoice}>
      {label}
    </button>
  );
}
