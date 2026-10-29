"use client";

// Where an owner pays ALYR by card (ALY-180, D-074). This address is the default payment link
// of ALYR's Paddle account: Paddle.js opens the checkout for the transaction in `?_ptxn=` by
// itself. The card form is Paddle's own window, from Paddle's address; ALYR never sees the
// card. When Paddle says the checkout is complete, the page asks ALYR until the payment is
// recorded (ALYR records it only from Paddle's signed webhook, after reading it back).
// The security policy lets this one page load Paddle's script and frame (next.config.ts).

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../../../_site/brand";
import { call } from "../../start/api";
import { COPY, type Lang } from "../../start/copy";
import "../../start/start.css";

type Phase = "loading" | "open" | "closed" | "confirming" | "paid" | "slow" | "nothing" | "failed" | "signin";
type Card = {
  checkout: { status: string; transaction: string | null } | null;
  paddle: { token: string; environment: "sandbox" | "live" } | null;
};
type PaddleEvent = { name?: string };
type PaddleJs = {
  Environment: { set: (env: string) => void };
  Initialize: (options: object) => void;
  Checkout: { open: (options: { transactionId: string }) => void };
};

export default function Billing() {
  const [lang, setLang] = useState<Lang>("en");
  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const transaction = useRef("");
  const started = useRef(false);
  const t = COPY[lang].billing;

  useEffect(() => {
    const first = setTimeout(async () => {
      try {
        const saved = localStorage.getItem("alyr-lang");
        if (saved === "ar" || saved === "en") setLang(saved);
        else if (navigator.language.startsWith("ar")) setLang("ar");
      } catch { /* storage may be blocked */ }
      transaction.current = new URLSearchParams(window.location.search).get("_ptxn") ?? "";
      const answer = await call<Card>("/api/onboarding/payment/card").catch(() => null);
      if (!answer) return setPhase("failed");
      if (answer.status === 401) return setPhase("signin");
      const checkout = answer.data.checkout;
      if (checkout?.status === "paid") return setPhase("paid");
      // Only the owner's own open checkout is opened, whatever the address says.
      if (!answer.ok || !answer.data.paddle || checkout?.status !== "open" || checkout.transaction !== transaction.current) {
        return setPhase("nothing");
      }
      setCard(answer.data);
    }, 0);
    return () => clearTimeout(first);
  }, []);

  // Wait for ALYR to record the payment: Paddle's webhook usually arrives within seconds.
  const confirm = async () => {
    setPhase("confirming");
    for (let i = 0; i < 30; i += 1) {
      const answer = await call<{ status: string }>("/api/onboarding/payment").catch(() => null);
      if (answer?.ok && answer.data.status === "paid") return setPhase("paid");
      await new Promise((done) => setTimeout(done, 2000));
    }
    setPhase("slow");
  };

  // Paddle.js is on the page: say which account, and Initialize opens the checkout for
  // ?_ptxn= by itself.
  const begin = () => {
    const Paddle = (window as unknown as { Paddle?: PaddleJs }).Paddle;
    if (!Paddle || !card?.paddle) return setPhase("failed");
    if (started.current) return;
    started.current = true;
    if (card.paddle.environment === "sandbox") Paddle.Environment.set("sandbox");
    Paddle.Initialize({
      token: card.paddle.token,
      checkout: { settings: { displayMode: "overlay", locale: lang, allowLogout: false } },
      eventCallback: (event: PaddleEvent) => {
        if (event.name === "checkout.loaded") setPhase("open");
        if (event.name === "checkout.completed") void confirm();
        if (event.name === "checkout.closed") setPhase((now) => (now === "open" || now === "loading" ? "closed" : now));
      },
    });
  };

  const reopen = () => {
    const Paddle = (window as unknown as { Paddle?: PaddleJs }).Paddle;
    if (Paddle && transaction.current) {
      setPhase("loading");
      Paddle.Checkout.open({ transactionId: transaction.current });
    }
  };

  const message: Record<Phase, string> = {
    loading: t.loading, open: t.body, closed: t.body, confirming: t.confirming, paid: t.paid,
    slow: t.slow, nothing: t.nothing, failed: t.failed, signin: "",
  };

  return (
    <div className="ob ob-solo" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      {card?.paddle && (
        <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive"
          onReady={begin} onError={() => setPhase("failed")} />
      )}
      <aside className="ob-rail"><Logo label="ALYR" className="ob-logo" /></aside>
      <header className="ob-top"><Logo label="ALYR" className="ob-logo" /></header>
      <main className="ob-main">
        <div className="ob-content">
          <h1>{t.title}</h1>
          {phase === "signin" ? (
            <Link className="ob-btn primary" href="/login">{t.signIn}</Link>
          ) : (
            <p className={phase === "failed" ? "ob-error" : "ob-sub"} role={phase === "failed" ? "alert" : "status"}>{message[phase]}</p>
          )}
          {phase === "closed" && <button type="button" className="ob-btn primary" onClick={reopen}>{t.reopen}</button>}
          {phase !== "signin" && <Link className={`ob-btn ${phase === "paid" ? "primary" : "ghost"}`} href="/start">{t.back}</Link>}
        </div>
      </main>
    </div>
  );
}
