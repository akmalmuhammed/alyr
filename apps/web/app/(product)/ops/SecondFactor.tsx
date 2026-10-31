"use client";

// The second factor of the back office (ALY-125, D-136), in English and Arabic: the door a staff
// sign-in meets while the console asks for an authenticator code (`FactorGate`, drawn by the
// shell), and the Security screen where a member of staff sets it up, checks it, replaces it,
// makes new recovery codes and turns it off (`FactorPanel`). The words are in factorCopy.ts, the
// reading of the API's answers in factorLogic.ts. Secrets and recovery codes live in this
// component's state only while they are on screen: nothing is stored in the browser.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { color } from "../../_tokens/tokens";
import { keepLang, savedLang, type Lang } from "../_workspace/lang";
import * as qr from "../_workspace/qr";
import { COPY, type Words } from "./factorCopy";
import { codesFile, digits, groups, minutesToWait, recovery, type Gate } from "./factorLogic";

const INK = { dark: color.brand.carbon, light: color.ink.white };

type Answer<T> = { ok: boolean; status: number; data: T; retry: number };
type Seed = { secret: string; link: string; replacing: boolean };
type Status = {
  email: string; enrolled: boolean; confirmed_at: string | null; recovery_codes_left: number;
  enrolment_open: boolean; required: boolean;
};

async function call<T>(path: string, body?: unknown): Promise<Answer<T>> {
  const response = await fetch(`/api/admin/factor${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, status: response.status, data, retry: Number(response.headers.get("retry-after") ?? 0) };
}

/** What to tell the person about a refused answer. */
function problem(answer: Answer<unknown>, t: Words): string {
  if (answer.status === 401) return t.wrong;
  if (answer.status === 429) return t.paused(minutesToWait(answer.retry));
  if (answer.status === 403 || answer.status === 409) {
    const detail = (answer.data as { detail?: { code?: string } })?.detail;
    if (detail && detail.code === "enrolment_closed") return t.closedBody;
    if (detail && detail.code === "second_factor_required") return t.turnOffClosed;
    return t.notStaff;
  }
  return t.offline;
}

/** The language of these screens: the one kept with the workspace, else the device's. */
function useLang(): { lang: Lang; t: Words; flip: () => void } {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const read = setTimeout(() => setLang(savedLang() ?? (navigator.language.startsWith("ar") ? "ar" : "en")), 0);
    return () => clearTimeout(read);
  }, []);
  const flip = useCallback(() => {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    keepLang(next);
  }, [lang]);
  return { lang, t: COPY[lang], flip };
}

/** Text with a file path or a command inside it, which keep their own direction in an Arabic sentence. */
function Words({ text }: { text: string }) {
  const parts = text.split(/(docs\/runbooks\/staff-sign-in\.md|open-enrolment)/);
  return <>{parts.map((part, i) => (i % 2 ? <bdi key={i} dir="ltr">{part}</bdi> : part))}</>;
}

function Switch({ t, lang, flip }: { t: Words; lang: Lang; flip: () => void }) {
  return (
    <button className="fa-btn quiet" type="button" onClick={flip} aria-label={t.switchLabel} lang={lang === "en" ? "ar" : "en"}>
      {t.switchTo}
    </button>
  );
}

function CodeField({ id, t, value, onChange, recoveryMode }: {
  id: string; t: Words; value: string; onChange: (v: string) => void; recoveryMode: boolean;
}) {
  return (
    <label className="fa-label" htmlFor={id}>
      <span>{recoveryMode ? t.recoveryLabel : t.codeLabel}</span>
      <input
        id={id} className="fa-input" dir="ltr" value={value} required autoComplete="one-time-code" spellCheck={false}
        inputMode={recoveryMode ? "text" : "numeric"} autoCapitalize="characters"
        onChange={(e) => onChange(recoveryMode ? recovery(e.target.value) : digits(e.target.value))}
      />
    </label>
  );
}

function QrSquare({ link, label }: { link: string; label: string }) {
  const drawn = useMemo(() => qr.svg(link, INK), [link]);
  // The square is drawn here from the link, which the API made; nothing from the outside goes in.
  return <div className="fa-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: drawn }} />;
}

/** The recovery codes, shown once, with a way to keep them. `onDone` is offered only after the
 *  person says they have saved them. */
function Codes({ t, codes, onDone }: { t: Words; codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codesFile(codes, t.codesFileHead);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "alyr-console-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="fa-block" aria-labelledby="fa-codes-title">
      <h2 id="fa-codes-title" className="fa-title">{t.codesTitle}</h2>
      <p className="fa-text">{t.codesBody}</p>
      <ul className="fa-codes" dir="ltr">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="fa-row">
        <button className="fa-btn" type="button" onClick={copy}>{t.copyCodes}</button>
        <button className="fa-btn" type="button" onClick={download}>{t.downloadCodes}</button>
        <span className="fa-ok" role="status">{copied ? t.copied : ""}</span>
      </div>
      <label className="fa-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>{t.savedIt}</span>
      </label>
      <button className="fa-btn primary" type="button" disabled={!saved} onClick={onDone}>{t.done}</button>
    </section>
  );
}

/** From the secret to the recovery codes: scan, type the first code, keep the codes. */
function Enrol({ t, seed, onFinished }: { t: Words; seed: Seed; onFinished: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const answer = await call<{ recovery_codes: string[] }>("/confirm", { code });
      if (answer.ok) setCodes(answer.data.recovery_codes);
      else setError(problem(answer, t));
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  if (codes) return <Codes t={t} codes={codes} onDone={onFinished} />;
  return (
    <section className="fa-block" aria-labelledby="fa-setup-title">
      <h2 id="fa-setup-title" className="fa-title">{t.setupTitle}</h2>
      <p className="fa-text">{t.setupStepScan}</p>
      <QrSquare link={seed.link} label={t.qrLabel} />
      <p className="fa-text">{t.cannotScan}</p>
      <p className="fa-key" dir="ltr">{groups(seed.secret)}</p>
      <p className="fa-text"><a href={seed.link}>{t.openInApp}</a></p>
      <form className="fa-form" onSubmit={confirm}>
        <p className="fa-text">{t.setupStepType}</p>
        <CodeField id="fa-setup-code" t={t} value={code} onChange={setCode} recoveryMode={false} />
        {error && <p className="fa-error" role="alert">{error}</p>}
        <button className="fa-btn primary" type="submit" disabled={busy || code.length !== 6}>{t.turnOn}</button>
      </form>
    </section>
  );
}

/** What the shell draws instead of the console while the second step is not done. */
export function FactorGate({ gate }: { gate: Gate }) {
  const router = useRouter();
  const { lang, t, flip } = useLang();
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState<Seed | null>(null);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const answer = await call("/verify", { code });
      if (answer.ok) window.location.reload();
      else setError(problem(answer, t));
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true); setError("");
    try {
      const answer = await call<Seed>("/begin", {});
      if (answer.ok) setSeed(answer.data);
      else setError(problem(answer, t));
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="fa-page" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <main className="fa">
        <div className="fa-top">
          <b className="fa-brand">ALYR</b>
          <Switch t={t} lang={lang} flip={flip} />
        </div>
        {gate === "prompt" && (
          <form className="fa-form" onSubmit={verify}>
            <h1 className="fa-title">{t.promptTitle}</h1>
            <p className="fa-text">{t.promptBody}</p>
            <CodeField id="fa-code" t={t} value={code} onChange={setCode} recoveryMode={recoveryMode} />
            {recoveryMode && <p className="fa-text">{t.recoveryHint}</p>}
            {error && <p className="fa-error" role="alert">{error}</p>}
            <button className="fa-btn primary" type="submit" disabled={busy || code.length < (recoveryMode ? 14 : 6)}>{t.continue}</button>
            <button className="fa-btn quiet" type="button" onClick={() => { setRecoveryMode(!recoveryMode); setCode(""); setError(""); }}>
              {recoveryMode ? t.useApp : t.useRecovery}
            </button>
            <p className="fa-text small"><Words text={t.lostPhone} /></p>
          </form>
        )}
        {gate === "enrol" && (seed
          ? <Enrol t={t} seed={seed} onFinished={() => window.location.reload()} />
          : (
            <section className="fa-block">
              <h1 className="fa-title">{t.setupTitle}</h1>
              {error && <p className="fa-error" role="alert">{error}</p>}
              <button className="fa-btn primary" type="button" onClick={start} disabled={busy}>{t.start}</button>
            </section>
          ))}
        {gate === "closed" && (
          <section className="fa-block">
            <h1 className="fa-title">{t.closedTitle}</h1>
            <p className="fa-text"><Words text={t.closedBody} /></p>
          </section>
        )}
        <button className="fa-btn quiet" type="button" onClick={signOut}>{t.signOut}</button>
      </main>
    </div>
  );
}

/** The Security screen: where a member of staff manages the authenticator. */
export function FactorPanel() {
  const { lang, t, flip } = useLang();
  const [status, setStatus] = useState<Status | null>(null);
  const [current, setCurrent] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [fresh, setFresh] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const answer = await call<Status>("");
    if (answer.ok) setStatus(answer.data);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function act(run: () => Promise<Answer<unknown>>, done: (answer: Answer<unknown>) => void) {
    setBusy(true); setError(""); setMessage("");
    try {
      const answer = await run();
      if (answer.ok) { done(answer); setCurrent(""); await load(); }
      else setError(problem(answer, t));
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  const enrolled = status?.enrolled ?? false;
  const date = status?.confirmed_at ? new Date(status.confirmed_at).toLocaleDateString(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB") : "";
  const need = recoveryMode ? 14 : 6;

  return (
    <div className="fa-panel" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="fa-head">
        <div>
          <span className="sh-eyebrow">{lang === "ar" ? "الإعدادات" : "Settings"}</span>
          <h1 className="fa-title">{t.securityTitle}</h1>
          <p className="fa-text">{t.securityLead}</p>
        </div>
        <Switch t={t} lang={lang} flip={flip} />
      </header>

      {seed && <Enrol t={t} seed={seed} onFinished={() => { setSeed(null); setMessage(seed.replacing ? t.replaced : ""); void load(); }} />}
      {fresh && <Codes t={t} codes={fresh} onDone={() => setFresh(null)} />}

      {status && !seed && !fresh && (
        <>
          <dl className="fa-facts">
            <div><dt>{t.appHeading}</dt><dd>{enrolled ? t.appOn(date) : t.appOff}</dd></div>
            <div><dt>{t.requiredHeading}</dt><dd>{status.required ? t.requiredYes : t.requiredNo}</dd></div>
            {enrolled && <div><dt>{t.recoveryHeading}</dt><dd>{t.recoveryLeft(status.recovery_codes_left)}</dd></div>}
          </dl>
          {message && <p className="fa-ok" role="status">{message}</p>}
          {error && <p className="fa-error" role="alert">{error}</p>}

          {!enrolled && (
            <button className="fa-btn primary" type="button" disabled={busy}
              onClick={() => act(() => call<Seed>("/begin", {}), (a) => setSeed((a as Answer<Seed>).data))}>
              {t.setupTitle}
            </button>
          )}

          {enrolled && (
            <section className="fa-block" aria-labelledby="fa-change">
              <h2 id="fa-change" className="fa-title">{t.changeHeading}</h2>
              <p className="fa-text">{t.changeBody}</p>
              <CodeField id="fa-current" t={{ ...t, codeLabel: t.currentLabel }} value={current} onChange={setCurrent} recoveryMode={recoveryMode} />
              <button className="fa-btn quiet" type="button" onClick={() => { setRecoveryMode(!recoveryMode); setCurrent(""); }}>
                {recoveryMode ? t.useApp : t.useRecovery}
              </button>
              <div className="fa-row">
                <button className="fa-btn" type="button" disabled={busy || current.length < need}
                  onClick={() => act(() => call("/verify", { code: current }), () => setMessage(t.checked))}>{t.check}</button>
                <button className="fa-btn" type="button" disabled={busy || current.length < need}
                  onClick={() => act(() => call<Seed>("/begin", { current }), (a) => setSeed((a as Answer<Seed>).data))}>{t.replace}</button>
                <button className="fa-btn" type="button" disabled={busy || current.length < need}
                  onClick={() => act(() => call<{ recovery_codes: string[] }>("/recovery", { current }), (a) => setFresh((a as Answer<{ recovery_codes: string[] }>).data.recovery_codes))}>{t.newCodes}</button>
                <button className="fa-btn" type="button" disabled={busy || current.length < need || status.required}
                  onClick={() => act(() => call("/disable", { current }), () => setMessage(t.turnedOff))}>{t.turnOff}</button>
              </div>
              {status.required && <p className="fa-text small">{t.turnOffClosed}</p>}
            </section>
          )}
          <p className="fa-text small">{t.note}</p>
        </>
      )}
    </div>
  );
}
