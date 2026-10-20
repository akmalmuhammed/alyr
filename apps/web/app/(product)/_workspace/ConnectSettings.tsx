"use client";

// The connection screen (ALY-142, specs/016-documents-connected): how a shop connects another
// POS or accounting tool to ALYR. In the order a person needs it: confirm the terms (the shop
// has its customers' permission to be messaged), say who numbers each kind of document, make an
// API key for the machine, add webhook addresses, or import a file of sales.
//
// Owners and admins only; the API refuses anyone else. A key and a webhook secret are shown once,
// in the answer that makes them, and the screen says so. Nothing here changes a document that
// was issued: it changes who numbers the next one, and who may send sales.

import { useCallback, useEffect, useState } from "react";
import { api, stamp } from "./catalogApi";
import { Announce, Field, Icon, Sheet, Switch, ToastLayer, useToasts } from "./CatalogUi";
import { CC, EVENT_ORDER, KIND_ORDER, SCOPE_ORDER, type Lang } from "./connectCopy";
import { copyText, say } from "./connectApi";
import { ConnectImport, type ImportRow } from "./ConnectImport";
import "./connect.css";

export type Terms = {
  version: number; accepted: boolean; accepted_version: number | null; accepted_by: string | null;
  accepted_at: string | null; points: { en: string; ar: string }[];
};
type KeyRow = {
  id: string; name: string; prefix: string; scopes: string[]; rate_limit_per_minute: number;
  created_at: string; last_used_at: string | null; revoked_at: string | null; active: boolean;
};
type Hook = {
  id: string; name: string; url: string; events: string[]; enabled: boolean; disabled_reason: string | null;
  failing_since: string | null; consecutive_failures: number; last_success_at: string | null;
  last_failure_at: string | null; last_status: number | null; last_error: string | null;
};
type HookMessage = {
  id: string; event: string; status: string; attempts: number; response_status: number | null;
  response_snippet: string | null; error: string | null; created_at: string; next_attempt_at: string | null;
};
type Overview = {
  terms: Terms; keys: KeyRow[]; default_rate_limit: number; authority: Record<string, "alyr" | "external">;
  webhooks: Hook[]; imports: ImportRow[]; base_url: string;
};
type SheetState =
  | null
  | { is: "key" }
  | { is: "revoke"; key: KeyRow }
  | { is: "authority"; kind: string; to: "alyr" | "external" }
  | { is: "hook-add" }
  | { is: "hook"; hook: Hook };

/** The one small link the workspace's Connections screen shows (the shell's only change). */
export function ConnectLink({ lang, href, icon, arrow }: {
  lang: Lang; href: string; icon: React.ReactNode; arrow: React.ReactNode;
}) {
  const c = CC[lang];
  return (
    <a className="cn-link" href={href}>
      <span className="sh-glyph">{icon}</span>
      <span className="cn-link-text"><b>{c.title}</b><small>{c.sub}</small></span>
      <span className="cn-link-arrow">{arrow}</span>
    </a>
  );
}

export function ConnectSettings({ lang, canManage }: { lang: Lang; canManage: boolean }) {
  const c = CC[lang];
  const { toasts, push, dismiss } = useToasts();
  const [view, setView] = useState<Overview | null>(null);
  const [failure, setFailure] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);

  const load = useCallback(async () => {
    try {
      setView(await api<Overview>("/api/connect-setup/overview"));
      setFailure("");
    } catch (error) {
      setFailure(say(error, lang, c));
    }
  }, [lang, c]);
  useEffect(() => {
    if (!canManage) return;
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load, canManage]);

  const header = (
    <header className="sh-head">
      <span className="sh-eyebrow">{c.eyebrow}</span>
      <h1>{c.title}</h1>
      <p>{c.sub}</p>
    </header>
  );
  if (!canManage) {
    return <div className="cn">{header}<p className="cn-note">{c.managersOnly}</p></div>;
  }
  if (!view) {
    return <div className="cn">{header}<p className="cn-note" role="status">{failure || c.loading}</p></div>;
  }

  const accepted = view.terms.accepted;
  // One main action at a time: confirm the terms, then make the first key.
  const primary = !accepted ? "terms" : view.keys.length === 0 ? "key" : "";

  async function acceptTerms() {
    try {
      await api("/api/connect-setup/terms/accept", "POST", {});
      await load();
    } catch (error) {
      push(say(error, lang, c), { tone: "bad" });
    }
  }

  async function changeAuthority(kind: string, to: "alyr" | "external") {
    try {
      await api("/api/connect-setup/authority", "PUT", { changes: { [kind]: to } });
      setSheet(null);
      push(c.numSaved(c.kinds[kind as keyof typeof c.kinds], to === "external"));
      await load();
    } catch (error) {
      push(say(error, lang, c), { tone: "bad" });
    }
  }

  return (
    <div className="cn">
      {header}
      <Announce text={failure} />
      {failure && <p className="cn-error" role="alert">{failure}</p>}

      <section className="cn-card" aria-labelledby="cn-terms">
        <h2 id="cn-terms">{c.termsTitle}</h2>
        <p className="cn-intro">{c.termsIntro}</p>
        <ol className="cn-points">
          {view.terms.points.map((p, i) => <li key={i}>{lang === "ar" ? p.ar : p.en}</li>)}
        </ol>
        {accepted ? (
          <p className="cn-ok"><span className="sh-pill active">{c.termsPill}</span>{" "}
            {c.termsDone(view.terms.accepted_by ?? "", view.terms.accepted_at ? stamp(view.terms.accepted_at, lang) : "")}</p>
        ) : (
          <>
            {view.terms.accepted_version !== null && <p className="cn-hint">{c.termsNew}</p>}
            <div className="ct-actions">
              <button type="button" className={`btn ct-btn ${primary === "terms" ? "primary" : ""}`} onClick={acceptTerms}>
                {c.termsAccept}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="cn-card" aria-labelledby="cn-num">
        <h2 id="cn-num">{c.numTitle}</h2>
        <p className="cn-intro">{c.numIntro}</p>
        <ul className="cn-rows">
          {KIND_ORDER.map((kind) => {
            const other = view.authority[kind] === "external";
            const name = c.kinds[kind];
            return (
              <li key={kind} className="cn-row">
                <span className="cn-row-text">
                  <b>{name}</b>
                  <small>{other ? c.numOther : c.numAlyr}</small>
                </span>
                <Switch on={other} label={c.numSwitch(name, other)}
                  onChange={(next) => setSheet({ is: "authority", kind, to: next ? "external" : "alyr" })} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cn-card" aria-labelledby="cn-keys">
        <h2 id="cn-keys">{c.keysTitle}</h2>
        <p className="cn-intro">{c.keysIntro}</p>
        {view.keys.length === 0 ? (
          <p className="cn-empty">{c.keysEmpty}</p>
        ) : (
          <ul className="cn-rows">
            {view.keys.map((k) => (
              <li key={k.id} className={`cn-row cn-key ${k.active ? "" : "gone"}`}>
                <span className="cn-row-text">
                  <b>{k.name} <span className={`sh-pill ${k.active ? "active" : "idle"}`}>{k.active ? c.keyActive : c.keyRevoked}</span></b>
                  <code className="cn-code" dir="ltr">alyr_k1_{k.prefix}_…</code>
                  <span className="cn-pills">
                    {k.scopes.map((s) => <span key={s} className="cn-tag">{c.scopes[s as keyof typeof c.scopes]?.name ?? s}</span>)}
                    <span className="cn-tag">{c.rate(k.rate_limit_per_minute)}</span>
                  </span>
                  <small>{k.last_used_at ? c.keyUsed(stamp(k.last_used_at, lang)) : c.keyNever}</small>
                </span>
                {k.active && (
                  <button type="button" className="btn ct-btn danger-line" onClick={() => setSheet({ is: "revoke", key: k })}>
                    {c.keyRevoke}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="ct-actions">
          <button type="button" className={`btn ct-btn ${primary === "key" ? "primary" : ""}`} disabled={!accepted}
            onClick={() => setSheet({ is: "key" })}>
            <Icon name="plus" />{c.keyMake}
          </button>
          {!accepted && <span className="cn-hint">{c.keysNeedTerms}</span>}
        </div>
      </section>

      <section className="cn-card" aria-labelledby="cn-hooks">
        <h2 id="cn-hooks">{c.hooksTitle}</h2>
        <p className="cn-intro">{c.hooksIntro}</p>
        {view.webhooks.length === 0 ? (
          <p className="cn-empty">{c.hooksEmpty}</p>
        ) : (
          <ul className="cn-rows">
            {view.webhooks.map((h) => (
              <li key={h.id} className="cn-row">
                <span className="cn-row-text">
                  <b>{h.name || hostOf(h.url)}{" "}
                    <span className={`sh-pill ${!h.enabled ? "idle" : h.consecutive_failures > 0 ? "wait" : "active"}`}>
                      {!h.enabled ? c.hookOff : h.consecutive_failures > 0 ? c.hookFailing(h.consecutive_failures) : c.hookActive}
                    </span>
                  </b>
                  <code className="cn-code" dir="ltr">{h.url}</code>
                  <span className="cn-pills">
                    {h.events.map((e) => <span key={e} className="cn-tag" dir="ltr">{e}</span>)}
                  </span>
                  <small>{!h.enabled && h.disabled_reason ? c.hookOffWhy
                    : h.last_success_at ? c.hookLastOk(stamp(h.last_success_at, lang)) : c.hookNeverOk}</small>
                </span>
                <button type="button" className="btn ct-btn" onClick={() => setSheet({ is: "hook", hook: h })}>{c.hookOpen}</button>
              </li>
            ))}
          </ul>
        )}
        <div className="ct-actions">
          <button type="button" className="btn ct-btn" onClick={() => setSheet({ is: "hook-add" })}>
            <Icon name="plus" />{c.hookAdd}
          </button>
        </div>
      </section>

      <ConnectImport lang={lang} accepted={accepted} imports={view.imports} push={push} onChanged={load} />

      <section className="cn-card cn-dev" aria-labelledby="cn-dev">
        <h2 id="cn-dev">{c.base}</h2>
        <code className="cn-code cn-wide" dir="ltr">{view.base_url}/api/connect</code>
        <p className="cn-hint">{c.baseHint}</p>
      </section>

      {sheet?.is === "key" && <KeySheet lang={lang} defaultRate={view.default_rate_limit} onClose={() => setSheet(null)}
        onMade={load} />}
      {sheet?.is === "revoke" && (
        <Confirm lang={lang} title={c.keyRevokeTitle(sheet.key.name)} body={c.keyRevokeBody} action={c.keyRevoke} danger
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            await api(`/api/connect-setup/keys/${sheet.key.id}/revoke`, "POST", {});
            setSheet(null);
            push(c.keyRevoked_(sheet.key.name));
            await load();
          }} />
      )}
      {sheet?.is === "authority" && (
        <Confirm lang={lang} title={c.kinds[sheet.kind as keyof typeof c.kinds]}
          body={sheet.to === "external" ? c.numToOther(c.kinds[sheet.kind as keyof typeof c.kinds]) : c.numToAlyr(c.kinds[sheet.kind as keyof typeof c.kinds])}
          action={c.numConfirm} onClose={() => setSheet(null)} onConfirm={() => changeAuthority(sheet.kind, sheet.to)} />
      )}
      {sheet?.is === "hook-add" && <HookAddSheet lang={lang} onClose={() => setSheet(null)}
        onMade={load} />}
      {sheet?.is === "hook" && <HookSheet lang={lang} hook={sheet.hook} push={push} onClose={() => setSheet(null)} onChanged={load} />}
      <ToastLayer toasts={toasts} dismiss={dismiss} lang={lang} undoWord={c.undo} dismissWord={c.dismiss} />
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ── a question with two answers ──────────────────────────────────────────────────────────

function Confirm({ lang, title, body, action, danger = false, onClose, onConfirm }: {
  lang: Lang; title: string; body: string; action: string; danger?: boolean;
  onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const c = CC[lang];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Sheet title={title} onClose={onClose} closeLabel={c.close}
      footer={
        <>
          <button type="button" className={`btn ct-btn ${danger ? "danger-line" : "primary"}`} disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onConfirm();
              } catch (e) {
                setError(say(e, lang, c));
                setBusy(false);
              }
            }}>{action}</button>
          <button type="button" className="btn ct-btn" onClick={onClose}>{c.cancel}</button>
        </>
      }>
      <p className="cn-sheet-text">{body}</p>
      {error && <p className="ct-error" role="alert">{error}</p>}
    </Sheet>
  );
}

// ── a secret, shown once ─────────────────────────────────────────────────────────────────

function Secret({ lang, label, note, value }: { lang: Lang; label: string; note: string; value: string }) {
  const c = CC[lang];
  const [copied, setCopied] = useState(false);
  return (
    <div className="cn-secret">
      <h3>{label}</h3>
      <p className="cn-note">{note}</p>
      <textarea className="cn-secret-box" readOnly dir="ltr" rows={3} value={value} aria-label={label}
        spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn ct-btn" onClick={async () => setCopied(await copyText(value))}>
        <Icon name={copied ? "check" : "copy"} />{copied ? c.copied : c.copy}
      </button>
      <p className="ct-sr" role="status" aria-live="polite">{copied ? c.copied : ""}</p>
    </div>
  );
}

function KeySheet({ lang, defaultRate, onClose, onMade }: {
  lang: Lang; defaultRate: number; onClose: () => void; onMade: () => Promise<void>;
}) {
  const c = CC[lang];
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>(["sales:write", "documents:read"]);
  const [rate, setRate] = useState(String(defaultRate));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");

  async function make() {
    setBusy(true);
    setError("");
    try {
      const done = await api<{ secret: string }>("/api/connect-setup/keys", "POST", {
        name: name.trim(), scopes: chosen, rate_limit_per_minute: Number(rate) || defaultRate,
      });
      setSecret(done.secret);
      await onMade();
    } catch (e) {
      setError(say(e, lang, c));
    } finally {
      setBusy(false);
    }
  }

  if (secret) {
    return (
      <Sheet title={c.keyReady} onClose={onClose} closeLabel={c.close}
        footer={<button type="button" className="btn ct-btn primary" onClick={onClose}>{c.done}</button>}>
        <Secret lang={lang} label={c.keyShownOnce} note={c.keyShownOnceNote} value={secret} />
      </Sheet>
    );
  }
  return (
    <Sheet title={c.keyMake} onClose={onClose} closeLabel={c.close}
      footer={
        <>
          <button type="button" className="btn ct-btn primary" disabled={busy || !name.trim() || chosen.length === 0} onClick={make}>
            {c.keyMakeNow}
          </button>
          <button type="button" className="btn ct-btn" onClick={onClose}>{c.cancel}</button>
        </>
      }>
      <div className="cn-form">
        <Field label={c.keyName} hint={c.keyNameHint}>
          <input data-autofocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <fieldset className="cn-fieldset">
          <legend>{c.keyScopes}</legend>
          {SCOPE_ORDER.map((s) => (
            <label key={s} className="ct-check">
              <input type="checkbox" checked={chosen.includes(s)}
                onChange={(e) => setChosen(e.target.checked ? [...chosen, s] : chosen.filter((x) => x !== s))} />
              <span className="cn-check-text"><b>{c.scopes[s].name}</b><small>{c.scopes[s].hint}</small></span>
            </label>
          ))}
        </fieldset>
        <Field label={c.keyRate} hint={c.keyRateHint}>
          <input inputMode="numeric" dir="ltr" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))} />
        </Field>
        {error && <p className="ct-error" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}

// ── webhooks ─────────────────────────────────────────────────────────────────────────────

function EventChoices({ lang, value, onChange }: { lang: Lang; value: string[]; onChange: (next: string[]) => void }) {
  const c = CC[lang];
  return (
    <fieldset className="cn-fieldset">
      <legend>{c.hookEvents}</legend>
      {EVENT_ORDER.map((e) => (
        <label key={e} className="ct-check">
          <input type="checkbox" checked={value.includes(e)}
            onChange={(ev) => onChange(ev.target.checked ? [...value, e] : value.filter((x) => x !== e))} />
          <span className="cn-check-text"><b>{c.events[e]}</b><small dir="ltr">{e}</small></span>
        </label>
      ))}
    </fieldset>
  );
}

function HookAddSheet({ lang, onClose, onMade }: { lang: Lang; onClose: () => void; onMade: () => Promise<void> }) {
  const c = CC[lang];
  const [url, setUrl] = useState("https://");
  const [name, setName] = useState("");
  const [events, setEvents] = useState<string[]>(["document.issued", "document.delivered", "document.failed"]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");

  async function make() {
    setBusy(true);
    setError("");
    try {
      const done = await api<{ secret: string }>("/api/connect-setup/webhooks", "POST", { url: url.trim(), events, name: name.trim() });
      setSecret(done.secret);
      await onMade();
    } catch (e) {
      setError(say(e, lang, c));
    } finally {
      setBusy(false);
    }
  }

  if (secret) {
    return (
      <Sheet title={c.hookReady} onClose={onClose} closeLabel={c.close}
        footer={<button type="button" className="btn ct-btn primary" onClick={onClose}>{c.done}</button>}>
        <Secret lang={lang} label={c.hookSecretTitle} note={c.hookSecretNote} value={secret} />
      </Sheet>
    );
  }
  return (
    <Sheet title={c.hookAdd} onClose={onClose} closeLabel={c.close}
      footer={
        <>
          <button type="button" className="btn ct-btn primary" disabled={busy || events.length === 0 || url.trim().length < 9} onClick={make}>
            {c.hookMake}
          </button>
          <button type="button" className="btn ct-btn" onClick={onClose}>{c.cancel}</button>
        </>
      }>
      <div className="cn-form">
        <Field label={c.hookUrl} hint={c.hookUrlHint}>
          <input data-autofocus dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label={c.hookName}>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <EventChoices lang={lang} value={events} onChange={setEvents} />
        {error && <p className="ct-error" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}

function HookSheet({ lang, hook, push, onClose, onChanged }: {
  lang: Lang; hook: Hook; push: (text: string, o?: { tone?: "ok" | "bad" }) => number; onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const c = CC[lang];
  const [log, setLog] = useState<HookMessage[] | null>(null);
  const [secret, setSecret] = useState("");
  const [asking, setAsking] = useState<"" | "rotate" | "remove">("");
  const [on, setOn] = useState(hook.enabled);
  const [error, setError] = useState("");

  const loadLog = useCallback(async () => {
    try {
      setLog((await api<{ deliveries: HookMessage[] }>(`/api/connect-setup/webhooks/${hook.id}/deliveries`)).deliveries);
    } catch (e) {
      setError(say(e, lang, c));
    }
  }, [hook.id, lang, c]);
  useEffect(() => {
    const first = setTimeout(loadLog, 0);
    return () => clearTimeout(first);
  }, [loadLog]);

  async function run(work: () => Promise<void>) {
    setError("");
    try {
      await work();
    } catch (e) {
      setError(say(e, lang, c));
    }
  }

  if (asking === "remove") {
    return <Confirm lang={lang} title={c.hookRemoveTitle} body={c.hookRemoveBody} action={c.hookRemove} danger onClose={onClose}
      onConfirm={async () => {
        await api(`/api/connect-setup/webhooks/${hook.id}`, "DELETE");
        push(c.hookRemoved);
        await onChanged();
        onClose();
      }} />;
  }
  if (asking === "rotate" && !secret) {
    return <Confirm lang={lang} title={c.hookRotate} body={c.hookRotateBody} action={c.hookRotate} onClose={onClose}
      onConfirm={async () => {
        const done = await api<{ secret: string }>(`/api/connect-setup/webhooks/${hook.id}/rotate-secret`, "POST", {});
        setSecret(done.secret);
      }} />;
  }
  if (secret) {
    return (
      <Sheet title={c.hookSecretTitle} onClose={onClose} closeLabel={c.close}
        footer={<button type="button" className="btn ct-btn primary" onClick={onClose}>{c.done}</button>}>
        <Secret lang={lang} label={c.hookSecretTitle} note={c.hookSecretNote} value={secret} />
      </Sheet>
    );
  }
  return (
    <Sheet title={hook.name || hostOf(hook.url)} subtitle={hook.url} onClose={onClose} closeLabel={c.close} wide
      footer={<button type="button" className="btn ct-btn" onClick={onClose}>{c.close}</button>}>
      <div className="cn-form">
        <div className="cn-row">
          <span className="cn-row-text"><b>{on ? c.hookActive : c.hookOff}</b>
            {!on && hook.disabled_reason && <small>{c.hookOffWhy}</small>}</span>
          <Switch on={on} label={c.hookSwitch(hook.name || hostOf(hook.url), on)}
            onChange={(next) => run(async () => {
              await api(`/api/connect-setup/webhooks/${hook.id}`, "PUT", { enabled: next });
              setOn(next);
              push(next ? c.hookOn : c.hookOffDone);
              await onChanged();
            })} />
        </div>
        <div className="ct-actions">
          <button type="button" className="btn ct-btn" disabled={!on}
            onClick={() => run(async () => {
              await api(`/api/connect-setup/webhooks/${hook.id}/test`, "POST", {});
              push(c.hookTestSent);
              setTimeout(loadLog, 1500);
            })}>{c.hookTest}</button>
          <button type="button" className="btn ct-btn" onClick={() => setAsking("rotate")}>{c.hookRotate}</button>
          <button type="button" className="btn ct-btn danger-line" onClick={() => setAsking("remove")}>{c.hookRemove}</button>
        </div>
        {error && <p className="ct-error" role="alert">{error}</p>}
        <h3 className="cn-h3">{c.hookLog}</h3>
        {log === null ? <p className="cn-note">{c.loading}</p>
          : log.length === 0 ? <p className="cn-empty">{c.hookLogEmpty}</p>
          : (
            <ul className="cn-rows cn-log">
              {log.map((m) => (
                <li key={m.id} className="cn-row cn-logrow">
                  <span className="cn-row-text">
                    <b><code dir="ltr">{m.event}</code>{" "}
                      <span className={`sh-pill ${m.status === "delivered" ? "active" : m.status === "failed" ? "idle" : "wait"}`}>{c.deliveryStates[m.status] ?? m.status}</span></b>
                    <small>{stamp(m.created_at, lang)} · {c.hookTries(m.attempts)}
                      {m.response_status ? <> · <bdi dir="ltr">HTTP {m.response_status}</bdi></> : null}</small>
                    {m.error && <small className="cn-bad" dir="auto">{m.error}</small>}
                    {m.response_snippet && <small className="cn-snippet" dir="auto">{m.response_snippet}</small>}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Sheet>
  );
}
