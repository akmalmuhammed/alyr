"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { keepLang, savedLang, type Lang } from "../../_workspace/lang";
import { COPY } from "./copy";
import { fromHash } from "./token";

type Problem = "gone" | "missing" | "tooMany" | "offline";

// The page the sign-in link in the "your workspace is ready" email opens. Opening it signs
// nobody in: a mail program that fetches the address to check it only gets this page. The button
// is what spends the link (POST /api/auth/link), once.
export default function OpenWithLink() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [langReady, setLangReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<Problem | "">("");
  const [busy, setBusy] = useState(false);
  const t = COPY[lang];

  // The language the email was written in, else the one chosen before on this device, else the
  // device's own. The page stays hidden until it is known.
  useEffect(() => {
    const read = setTimeout(() => {
      const found = fromHash(window.location.hash);
      setLang(found.lang ?? savedLang() ?? (navigator.language.startsWith("ar") ? "ar" : "en"));
      setToken(found.token);
      if (!found.token) setError("missing");
      setLangReady(true);
    }, 0);
    return () => clearTimeout(read);
  }, []);

  function switchLang() {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    keepLang(next);
  }

  async function open() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.status === 429) return setError("tooMany");
      if (!response.ok) return setError("gone");
      // The workspace opens in the language of the email.
      keepLang(lang);
      router.push("/app");
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
      {token && error !== "gone" && (
        <>
          <p className="hint">{t.hint}</p>
          <button className="btn primary" type="button" disabled={busy} onClick={open}>{t.open}</button>
        </>
      )}
      {error && <p className="error" role="alert">{t[error]}</p>}
      {(error === "gone" || error === "missing") && <a className="btn" href="/login">{t.useCode}</a>}
    </main>
  );
}
