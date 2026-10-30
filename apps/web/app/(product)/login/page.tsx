"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { keepLang, savedLang, type Lang } from "../_workspace/lang";
import { codeDigits } from "./code";
import { COPY } from "./copy";
import { landing } from "./next";

type CodeAnswer = { sent: boolean; dev_code?: string | null };
type Problem = "tooMany" | "cannotSend" | "wrong" | "offline";

async function post<R>(url: string, body: object): Promise<{ ok: boolean; status: number; data: R }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

export default function Login() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [langReady, setLangReady] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<Problem | "">("");
  const [busy, setBusy] = useState(false);
  const t = COPY[lang];

  // The language chosen before on this device, else the device's own. The page stays hidden
  // until it is known, so an Arabic reader never sees the English first.
  useEffect(() => {
    const read = setTimeout(() => {
      setLang(savedLang() ?? (navigator.language.startsWith("ar") ? "ar" : "en"));
      setLangReady(true);
    }, 0);
    return () => clearTimeout(read);
  }, []);

  function switchLang() {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    keepLang(next);
  }

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const answer = await post<CodeAnswer>("/api/auth/code", { email });
      if (answer.status === 429) return setError("tooMany");
      if (!answer.ok) return setError("cannotSend");
      setDevCode(answer.data.dev_code ?? null);
      setStep("code");
    } catch {
      setError("offline");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const answer = await post("/api/auth/verify", { email, code });
      if (!answer.ok) return setError("wrong");
      // The workspace opens in the language the person signed in with.
      keepLang(lang);
      // Back to the page that sent them here (`?next=`), when it is a safe path of this site.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(await landing(next, async () => (await fetch("/api/admin/staff", { cache: "no-store" })).ok));
    } catch {
      setError("offline");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} hidden={!langReady}>
      <div className="login-top">
        <h1>ALYR</h1>
        <button className="btn small" type="button" onClick={switchLang} aria-label={t.switchLabel}
          lang={lang === "en" ? "ar" : "en"}>{t.switchTo}</button>
      </div>
      <p className="lead">{t.lead}</p>
      {step === "email" ? (
        <form onSubmit={(e) => { e.preventDefault(); requestCode(); }}>
          <label htmlFor="email">{t.email}</label>
          <input
            id="email" type="email" required autoFocus value={email} dir="ltr"
            onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          />
          <button className="btn primary" type="submit" disabled={busy}>{t.send}</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <p className="hint">{t.sentBefore}<bdi dir="ltr">{email}</bdi>{t.sentAfter}</p>
          {devCode && (
            <p className="devcode">{t.devCode} <b dir="ltr">{devCode}</b></p>
          )}
          <label htmlFor="code">{t.code}</label>
          <input
            id="code" inputMode="numeric" required autoFocus value={code} dir="ltr"
            onChange={(e) => setCode(codeDigits(e.target.value))} autoComplete="one-time-code" maxLength={6}
          />
          <button className="btn primary" type="submit" disabled={busy}>{t.signIn}</button>
          <button className="btn" type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
            {t.other}
          </button>
        </form>
      )}
      {error && <p className="error" role="alert">{t[error]}</p>}
      <p className="hint">{t.noCode}</p>
    </main>
  );
}
