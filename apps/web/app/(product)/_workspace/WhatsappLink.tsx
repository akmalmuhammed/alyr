"use client";

import { useCallback, useEffect, useState } from "react";
import { COPY, commandsFor, type Lang } from "./whatsappCopy";
import "./whatsapp.css";

// "Your WhatsApp" on the Team screen (ALY-131, D-065): link the signed-in person's phone to
// their login with a one-time code, say where they work, and show what the phone can ask.
// The API is routes/owner.py. Every word is in whatsappCopy.ts.

type Preference = "portal" | "whatsapp" | "both";
type Status = { linked: boolean; number_ends: string | null; verified_at: string | null; preference: Preference };
type Code = { code: string; message: string; expiresAt: number; lifetime: number };

const PREFERENCES: Preference[] = ["portal", "whatsapp", "both"];
const POLL_MS = 3000;

async function call(url: string, method = "GET", body?: object) {
  const response = await fetch(url, {
    method, cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WhatsappLink({ lang, role, modules, signedIn }: { lang: Lang; role: string; modules: string[]; signedIn: boolean }) {
  const t = COPY[lang];
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [code, setCode] = useState<Code | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await call("/api/owner/whatsapp"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load, signedIn]);

  const left = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
  const live = code !== null && left > 0;

  // The countdown, and (while a code is live) asking whether the phone has sent it yet.
  useEffect(() => {
    if (!live) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    const poll = setInterval(async () => {
      try {
        const next: Status = await call("/api/owner/whatsapp");
        if (next.linked) {
          setStatus(next);
          setCode(null);
          setMessage({ text: t.justLinked, bad: false });
        }
      } catch { /* the next poll will try again */ }
    }, POLL_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [live, t.justLinked]);

  async function getCode() {
    setBusy(true);
    setMessage(null);
    setCopied(false);
    try {
      const made = await call("/api/owner/whatsapp-link", "POST");
      const started = Date.now();
      setNow(started);
      setCode({ code: made.code, message: made.message, lifetime: made.expires_in, expiresAt: started + made.expires_in * 1000 });
    } catch {
      setMessage({ text: t.codeFailed, bad: true });
    }
    setBusy(false);
  }

  async function copyMessage() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the message is on screen to copy by hand */ }
  }

  async function unlink() {
    setBusy(true);
    try {
      setStatus(await call("/api/owner/whatsapp", "DELETE"));
      setMessage({ text: t.unlinked, bad: false });
    } catch {
      setMessage({ text: t.saveFailed, bad: true });
    }
    setAsking(false);
    setBusy(false);
  }

  async function choose(preference: Preference) {
    if (!status || status.preference === preference) return;
    const before = status;
    setStatus({ ...status, preference });
    try {
      setStatus(await call("/api/owner/channel", "PUT", { preference }));
    } catch {
      setStatus(before);
      setMessage({ text: t.saveFailed, bad: true });
    }
  }

  const roleName = t.roles[role] ?? role;
  const shell = (body: React.ReactNode) => (
    <section className="wa" aria-labelledby="wa-title" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="wa-head">
        <h2 id="wa-title">{t.title}</h2>
        <p>{t.sub}</p>
      </header>
      {body}
    </section>
  );

  if (!signedIn) return shell(<p className="wa-note">{t.demoNote}</p>);
  if (failed && !status) {
    return shell(
      <p className="wa-note">{t.loadFailed} <button type="button" className="wa-link" onClick={load}>{t.retry}</button></p>,
    );
  }
  if (!status) return shell(<p className="wa-note">{t.loading}</p>);

  const since = status.verified_at
    ? new Date(status.verified_at).toLocaleDateString(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const commands = commandsFor(role, modules);

  return shell(
    <>
      <div className="wa-card">
        <div className="wa-card-head">
          <h3>{t.linkTitle}</h3>
          {status.linked && <span className="sh-pill active">{t.linked}</span>}
        </div>

        {status.linked && !code && (
          <>
            <p className="wa-number">
              {t.numberEnds} <b className="num" dir="ltr">•••• {status.number_ends}</b>
              {since && <span className="wa-quiet"> · {t.since(since)}</span>}
            </p>
            <p className="wa-quiet">{t.linkedNote}</p>
            {asking ? (
              <div className="wa-confirm" role="group" aria-label={t.unlink}>
                <p>{t.unlinkAsk}</p>
                <div className="wa-actions">
                  <button type="button" className="btn danger wa-btn" disabled={busy} onClick={unlink}>{t.unlinkYes}</button>
                  <button type="button" className="btn wa-btn" onClick={() => setAsking(false)}>{t.keepLinked}</button>
                </div>
              </div>
            ) : (
              <div className="wa-actions">
                <button type="button" className="btn danger-line wa-btn" onClick={() => setAsking(true)}>{t.unlink}</button>
                <button type="button" className="btn wa-btn" disabled={busy} onClick={getCode}>{t.otherNumber}</button>
              </div>
            )}
          </>
        )}

        {!status.linked && !code && (
          <>
            <p className="wa-quiet">{t.linkIntro}</p>
            <ol className="wa-steps">
              {t.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <div className="wa-actions">
              <button type="button" className="btn volt wa-btn" disabled={busy} onClick={getCode}>
                {busy ? t.gettingCode : t.getCode}
              </button>
            </div>
          </>
        )}

        {code && (
          <div className="wa-code">
            <div className="wa-codebox">
              <span className="wa-label" id="wa-msg-label">{t.messageLabel}</span>
              <div className="wa-msgrow">
                <output className="wa-msg" dir="ltr" aria-labelledby="wa-msg-label">{code.message}</output>
                <button type="button" className="btn wa-btn" onClick={copyMessage} disabled={!live}>
                  {copied ? t.copied : t.copy}
                </button>
              </div>
              <p className="wa-quiet">{t.sendTo}</p>
            </div>
            {live ? (
              <div className="wa-timer">
                <div className="wa-timer-line">
                  <span>{t.expiresIn} <b className="num" dir="ltr" role="timer" aria-label={t.minutes(clock(left))}>{clock(left)}</b></span>
                  <span className="wa-quiet" role="status">{t.waiting}</span>
                </div>
                <div className="wa-bar" aria-hidden="true"><span style={{ width: `${(left / code.lifetime) * 100}%` }} /></div>
              </div>
            ) : (
              <p className="wa-bad" role="status">{t.expired}</p>
            )}
            <div className="wa-actions">
              {!live && <button type="button" className="btn volt wa-btn" disabled={busy} onClick={getCode}>{t.newCode}</button>}
              <button type="button" className="btn ghost wa-btn" onClick={() => setCode(null)}>{t.cancel}</button>
            </div>
          </div>
        )}

        {message && <p className={message.bad ? "wa-bad" : "wa-ok"} role="status">{message.text}</p>}
      </div>

      <div className="wa-pair">
        <div className="wa-card">
          <div className="wa-card-head"><h3 id="wa-work">{t.workTitle}</h3></div>
          <p className="wa-quiet">{t.workHint}</p>
          <div className="wa-choice" role="radiogroup" aria-labelledby="wa-work">
            {PREFERENCES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={status.preference === p} onClick={() => choose(p)}>
                <b>{t.workOptions[p].name}</b>
                <small>{t.workOptions[p].hint}</small>
              </button>
            ))}
          </div>
          {status.preference !== "portal" && !status.linked && <p className="wa-quiet">{t.needLink}</p>}
        </div>

        <div className="wa-card">
          <div className="wa-card-head"><h3>{t.sendTitle}</h3></div>
          <p className="wa-quiet">{(status.linked ? t.sendIntroLinked : t.sendIntroUnlinked)(roleName)}</p>
          <ul className="wa-cmds">
            {commands.map((c) => {
              const info = t.commands[c];
              const note = role === "agent" ? t.commandNotes[c]?.agent : undefined;
              return (
                <li key={c}>
                  <span className="wa-words">
                    <code dir="ltr">{info.word}</code>
                    {info.arabic && <code lang="ar" dir="rtl">{info.arabic}</code>}
                  </span>
                  <span className="wa-what">{info.what}{note && <small>{note}</small>}</span>
                </li>
              );
            })}
          </ul>
          <p className="wa-quiet">{t.bothLanguages}</p>
        </div>
      </div>
    </>,
  );
}
