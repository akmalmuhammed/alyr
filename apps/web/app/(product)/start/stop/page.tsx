"use client";

// The page the link at the foot of a reminder email opens (ALY-171): it switches the reminders
// off at once, with no sign-in, because the link is signed for this business and can do nothing
// else. It says what happened, in the language the owner reads.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "../../../_site/brand";
import { call } from "../api";
import { COPY, type Lang } from "../copy";
import "../start.css";

type Phase = "working" | "done" | "failed";

export default function StopReminders() {
  const [lang, setLang] = useState<Lang>("en");
  const [phase, setPhase] = useState<Phase>("working");
  const t = COPY[lang].resumeStop;

  useEffect(() => {
    let alive = true;
    const first = setTimeout(async () => {
      try {
        const saved = localStorage.getItem("alyr-lang");
        if (saved === "ar" || saved === "en") setLang(saved);
        else if (navigator.language.startsWith("ar")) setLang("ar");
      } catch { /* storage may be blocked */ }
      const query = new URLSearchParams(window.location.search);
      const answer = await call("/api/onboarding/resume/stop", "POST", { slug: query.get("b") ?? "", token: query.get("t") ?? "" }).catch(() => null);
      if (alive) setPhase(answer?.ok ? "done" : "failed");
    }, 0);
    return () => { alive = false; clearTimeout(first); };
  }, []);

  return (
    <div className="ob ob-solo" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <aside className="ob-rail"><Logo label="ALYR" className="ob-logo" /></aside>
      <header className="ob-top"><Logo label="ALYR" className="ob-logo" /></header>
      <main className="ob-main">
        <div className="ob-content">
          {phase === "working" && <p className="ob-sub" role="status">{t.working}</p>}
          {phase === "done" && (
            <>
              <h1>{t.title}</h1>
              <p className="ob-sub" role="status">{t.body}</p>
              <Link className="ob-btn primary" href="/start">{t.open}</Link>
            </>
          )}
          {phase === "failed" && (
            <>
              <h1>{t.failedTitle}</h1>
              <p className="ob-error" role="alert">{t.failed}</p>
              <a className="ob-link" href={`mailto:${COPY[lang].helpMail}`}><bdi dir="ltr">{COPY[lang].helpMail}</bdi></a>
              <Link className="ob-btn primary" href="/start">{t.open}</Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
