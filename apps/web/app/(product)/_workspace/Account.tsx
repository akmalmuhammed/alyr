"use client";

import { useCallback, useEffect, useState } from "react";
import { COPY, type Lang, type Refusal } from "./accountCopy";
import "./account.css";

// "Your account" (go-live items 40 and 41, specs/040, D-081): the email the person signs in with
// and how to change it, the businesses they work for and the switch between them, and the
// download of everything the business keeps (owners only). The API is routes/account.py.
// Every word is in accountCopy.ts.

type Business = { id: string; name: string; name_ar: string; role: string; current: boolean };
type Mine = {
  me: { name: string; email: string; role: string };
  signed_in: boolean;
  businesses: Business[];
  can_change_email: boolean;
  can_export: boolean;
};
type Step = "show" | "address" | "code";
type Note = { text: string; bad: boolean } | null;

class Refused extends Error {
  code: Refusal | "";
  constructor(code: Refusal | "") {
    super(code);
    this.code = code;
  }
}

async function call(url: string, body?: object) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok) throw new Refused(answer?.detail?.code ?? "");
  return answer;
}

export function Account({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  const [mine, setMine] = useState<Mine | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<Step>("show");
  const [address, setAddress] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<Note>(null);

  const load = useCallback(async () => {
    try {
      setMine(await call("/api/account"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const refused = (error: unknown) => {
    const key = error instanceof Refused ? error.code : "";
    setNote({ text: key ? t.refusals[key] : t.failed, bad: true });
  };

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy("code");
    setNote(null);
    try {
      const answer = await call("/api/account/email/code", { email: address });
      setSentTo(answer.email);
      setDevCode(answer.dev_code ?? "");
      setCode("");
      setStep("code");
    } catch (error) {
      refused(error);
    }
    setBusy("");
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy("confirm");
    setNote(null);
    try {
      const answer = await call("/api/account/email", { email: sentTo, code });
      setStep("show");
      setAddress("");
      setDevCode("");
      setNote({ text: t.changed(answer.email), bad: false });
      await load();
    } catch (error) {
      refused(error);
    }
    setBusy("");
  }

  async function open(business: Business) {
    setBusy(business.id);
    setNote(null);
    try {
      await call("/api/account/switch", { business_id: business.id });
      // Everything on screen belongs to the business left behind: load the workspace afresh,
      // on its home screen, rather than keep any of it.
      window.history.replaceState(null, "", "/app");
      window.location.reload();
    } catch (error) {
      refused(error);
      setBusy("");
    }
  }

  const head = (
    <header className="sh-head">
      <span className="sh-eyebrow">{t.eyebrow}</span>
      <h1>{t.title}</h1>
      <p>{t.sub}</p>
    </header>
  );
  if (!mine) {
    return (
      <>
        {head}
        <p className="ac-quiet">
          {failed
            ? <>{t.loadFailed} <button type="button" className="ac-link" onClick={load}>{t.retry}</button></>
            : t.loading}
        </p>
      </>
    );
  }

  const named = (b: Business) => (lang === "ar" && b.name_ar ? b.name_ar : b.name);
  const businesses = [...mine.businesses].sort((a, b) => Number(b.current) - Number(a.current));

  return (
    <div className="ac" dir={lang === "ar" ? "rtl" : "ltr"}>
      {head}

      <section className="ac-card" aria-labelledby="ac-email">
        <div className="ac-card-head">
          <h2 id="ac-email">{t.emailTitle}</h2>
          {mine.can_change_email && step === "show" && (
            <button type="button" className="btn ac-btn" onClick={() => { setStep("address"); setNote(null); }}>
              {t.change}
            </button>
          )}
        </div>
        {mine.signed_in
          ? <p className="ac-email" dir="ltr">{mine.me.email}</p>
          : <p className="ac-quiet">{t.demoEmail}</p>}
        {step === "show" && mine.signed_in && <p className="ac-quiet">{t.emailHint}</p>}

        {step === "address" && (
          <form className="ac-form" onSubmit={sendCode}>
            <label className="ac-field">
              <span>{t.newEmail}</span>
              <input type="email" dir="ltr" required autoComplete="email" inputMode="email" maxLength={200}
                value={address} onChange={(e) => setAddress(e.target.value)} autoFocus />
            </label>
            <div className="ac-actions">
              <button type="submit" className="btn volt ac-btn" disabled={busy !== "" || !address.trim()}>
                {busy === "code" ? t.sending : t.sendCode}
              </button>
              <button type="button" className="btn ghost ac-btn" onClick={() => { setStep("show"); setNote(null); }}>
                {t.cancel}
              </button>
            </div>
          </form>
        )}

        {step === "code" && (
          <form className="ac-form" onSubmit={confirm}>
            <p className="ac-quiet" role="status">{t.codeSent(sentTo)}</p>
            {devCode && <p className="ac-dev">{t.devCode(devCode)}</p>}
            <label className="ac-field">
              <span>{t.codeLabel}</span>
              <input dir="ltr" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*"
                maxLength={12} value={code} onChange={(e) => setCode(e.target.value.trim())} autoFocus
                className="ac-code" />
            </label>
            <div className="ac-actions">
              <button type="submit" className="btn volt ac-btn" disabled={busy !== "" || code.length < 4}>
                {busy === "confirm" ? t.confirming : t.confirm}
              </button>
              <button type="button" className="btn ghost ac-btn" onClick={() => { setStep("address"); setNote(null); }}>
                {t.otherAddress}
              </button>
            </div>
          </form>
        )}
        {note && <p className={note.bad ? "ac-bad" : "ac-ok"} role={note.bad ? "alert" : "status"}>{note.text}</p>}
      </section>

      {mine.signed_in && (
        <section className="ac-card" aria-labelledby="ac-businesses">
          <div className="ac-card-head"><h2 id="ac-businesses">{t.businessesTitle}</h2></div>
          <p className="ac-quiet">{businesses.length > 1 ? t.businessesHint : t.oneBusiness}</p>
          <ul className="ac-list">
            {businesses.map((b) => (
              <li key={b.id} className={b.current ? "on" : ""}>
                <span className="ac-biz">
                  <b>{named(b)}</b>
                  <small>{t.as(t.roles[b.role] ?? b.role)}</small>
                </span>
                {b.current
                  ? <span className="sh-pill active">{t.openNow}</span>
                  : (
                    <button type="button" className="btn ac-btn" disabled={busy !== ""} onClick={() => open(b)}
                      aria-label={`${t.open} ${named(b)}`}>
                      {busy === b.id ? t.opening : t.open}
                    </button>
                  )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ac-card" aria-labelledby="ac-data">
        <div className="ac-card-head"><h2 id="ac-data">{t.dataTitle}</h2></div>
        <p className="ac-quiet">{t.dataHint}</p>
        <ul className="ac-inside">
          {t.dataInside.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <p className="ac-quiet">{t.dataFormat}</p>
        {mine.can_export ? (
          <>
            <div className="ac-actions">
              <a className="btn volt ac-btn" href="/api/account/export" download>{t.download}</a>
            </div>
            <p className="ac-quiet">{t.dataNotice}</p>
          </>
        ) : (
          <p className="ac-note">{t.ownersOnly}</p>
        )}
      </section>
    </div>
  );
}
