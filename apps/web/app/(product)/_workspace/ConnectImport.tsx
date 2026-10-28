"use client";

// Import sales from a file (ALY-142). A shop whose POS exports a CSV or Excel file uploads it, sees
// every row checked, with its number, in its own language, before anything is made, then makes
// the documents in one go. The newest import can be taken back while nothing in it has been
// sent. The same shape as the Catalog's import (CatalogImport.tsx), on its own words.

import { useRef, useState } from "react";
import { ApiError, api, sendFile, stamp } from "./catalogApi";
import { Field, Icon, Sheet } from "./CatalogUi";
import { CC, type Lang } from "./connectCopy";
import { say } from "./connectApi";

export type ImportRow = {
  id: string; filename: string; status: string; created_at: string; applied_at: string | null;
  counts: { sales?: number; made?: number; skipped?: number }; can_undo?: boolean; actor: string;
};
export type SavedMapping = { name: string; mapping: Record<string, string>; options: Record<string, unknown> };
type Problem = { row: number; sale: string; field: string; code: string; message: string; message_ar: string };
type SaleCard = {
  sale_id: string; row: number; kind: string; number: string | null; customer: string; lines: number;
  total_minor: number; currency: string; state: string;
};
type Preview = {
  id: string; filename: string; status: string; headers: string[]; mapping: Record<string, string>;
  options: { kind?: string; send?: boolean; default_payment_method?: string };
  columns: { key: string; label: string; label_ar: string; needed: boolean }[]; missing: string[];
  counts: { rows: number; sales: number; ready: number; existing: number; problems: number };
  sales: SaleCard[]; problems: Problem[]; problems_total: number; hash: string; can_apply: boolean;
  template?: string | null;
};
type Push = (text: string, options?: { tone?: "ok" | "bad" }) => number;

const FORMATS = ".csv,.txt,.tsv,.xlsx,text/csv,text/plain";

function money(minor: number, currency: string, lang: Lang): string {
  const amount = (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return lang === "ar" ? `${amount} ${currency === "QAR" ? "ر.ق" : currency}` : `${currency} ${amount}`;
}

export function ConnectImport({ lang, accepted, imports, push, onChanged }: {
  lang: Lang; accepted: boolean; imports: ImportRow[];
  push: Push; onChanged: () => Promise<void>;
}) {
  const c = CC[lang];
  const picker = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [failure, setFailure] = useState("");

  async function choose(file: File | undefined) {
    if (!file) return;
    setFailure("");
    setProgress(0);
    try {
      const made = await sendFile<Preview>(
        "POST", `/api/connect-setup/imports?filename=${encodeURIComponent(file.name)}`, file, setProgress);
      setPreview(made);
    } catch (error) {
      setFailure(say(error, lang, c));
    } finally {
      setProgress(null);
      if (picker.current) picker.current.value = "";
    }
  }

  const newest = imports.find((i) => i.can_undo);

  return (
    <section className="cn-card" aria-labelledby="cn-imp">
      <h2 id="cn-imp">{c.impTitle}</h2>
      <p className="cn-intro">{c.impIntro}</p>
      <div className="ct-actions">
        <a className="btn ct-btn" href={`/api/connect-setup/imports/template?lang=${lang}`} download>
          <Icon name="download" />{c.impTemplate}
        </a>
        <button type="button" className="btn ct-btn" disabled={!accepted || progress !== null}
          onClick={() => picker.current?.click()}>
          <Icon name="upload" />{progress !== null ? `${c.impUploading} ${progress}%` : c.impUpload}
        </button>
        <input ref={picker} type="file" className="ct-file" accept={FORMATS} tabIndex={-1} aria-label={c.impUpload}
          onChange={(e) => void choose(e.target.files?.[0])} />
      </div>
      <p className="cn-hint">{accepted ? `${c.impFormats} ${c.sampleNote}` : c.impTermsFirst}</p>
      {failure && <p className="ct-error" role="alert">{failure}</p>}

      <h3 className="cn-h3">{c.impHistory}</h3>
      {imports.length === 0 ? <p className="cn-empty">{c.impHistoryEmpty}</p> : (
        <ul className="cn-rows">
          {imports.map((i) => (
            <li key={i.id} className="cn-row">
              <span className="cn-row-text">
                <b><bdi dir="auto">{i.filename}</bdi>{" "}
                  <span className={`sh-pill ${i.status === "applied" ? "active" : "idle"}`}>{c.status[i.status] ?? i.status}</span></b>
                <small>{stamp(i.applied_at ?? i.created_at, lang)} · {i.actor}
                  {i.status === "applied" ? ` · ${c.impApplied_(i.counts.made ?? 0)}` : ""}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {newest && (
        <div className="ct-actions">
          <button type="button" className="btn ct-btn" onClick={() => setUndoing(true)}><Icon name="undo" />{c.impUndo}</button>
        </div>
      )}

      {preview && (
        <PreviewSheet lang={lang} preview={preview} setPreview={setPreview} push={push}
          onClose={async (applied) => {
            if (!applied) await api(`/api/connect-setup/imports/${preview.id}`, "DELETE").catch(() => undefined);
            setPreview(null);
            await onChanged();
          }} />
      )}
      {undoing && (
        <UndoSheet lang={lang} onClose={() => setUndoing(false)} push={push}
          onDone={async () => { setUndoing(false); await onChanged(); }} />
      )}
    </section>
  );
}

function UndoSheet({ lang, onClose, onDone, push }: {
  lang: Lang; onClose: () => void; onDone: () => Promise<void>; push: Push;
}) {
  const c = CC[lang];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={c.impUndoTitle} onClose={onClose} closeLabel={c.close}
      footer={
        <>
          <button type="button" className="btn ct-btn danger-line" disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const done = await api<{ withdrawn: number }>("/api/connect-setup/imports/undo", "POST", {});
                push(c.impUndone(done.withdrawn));
                await onDone();
              } catch (e) {
                setError(say(e, lang, c));
                setBusy(false);
              }
            }}>{c.impUndo}</button>
          <button type="button" className="btn ct-btn" onClick={onClose}>{c.cancel}</button>
        </>
      }>
      <p className="cn-sheet-text">{c.impUndoBody}</p>
      {error && <p className="ct-error" role="alert">{error}</p>}
    </Sheet>
  );
}

function PreviewSheet({ lang, preview, setPreview, push, onClose }: {
  lang: Lang; preview: Preview; setPreview: (p: Preview) => void; push: Push;
  onClose: (applied: boolean) => Promise<void>;
}) {
  const c = CC[lang];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  async function change(body: { mapping?: Record<string, string>; options?: Preview["options"] }) {
    setError("");
    try {
      setPreview(await api<Preview>(`/api/connect-setup/imports/${preview.id}`, "PUT", body));
    } catch (e) {
      setError(say(e, lang, c));
    }
  }

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const done = await api<{ counts: { made?: number; skipped?: number } }>(
        `/api/connect-setup/imports/${preview.id}/apply`, "POST", { preview: preview.hash });
      push(c.impApplied(done.counts.made ?? 0, done.counts.skipped ?? 0));
      await onClose(true);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "import_changed" || e.code === "import_has_errors")) {
        // The world moved since the preview: read it again rather than apply what was not seen.
        await change({});
      }
      setError(say(e, lang, c));
      setBusy(false);
    }
  }

  async function remember() {
    setError("");
    try {
      await api("/api/connect-setup/import-templates", "PUT", {
        name: name.trim(), mapping: preview.mapping, options: preview.options });
      setSaved(true);
    } catch (e) {
      setError(say(e, lang, c));
    }
  }

  const opts = preview.options;

  return (
    <Sheet title={c.impCheck} subtitle={preview.filename} onClose={() => void onClose(false)} closeLabel={c.close} wide
      footer={
        <>
          <button type="button" className="btn ct-btn primary" disabled={!preview.can_apply || busy} onClick={apply}>
            {c.impApply}
          </button>
          <button type="button" className="btn ct-btn" onClick={() => void onClose(false)}>{c.impDiscard}</button>
        </>
      }>
      <div className="cn-form">
        <p className="cn-summary" role="status" aria-live="polite">
          {c.impSummary(preview.counts.sales, preview.counts.rows)}{" "}
          <span className="sh-pill active">{c.impReady(preview.counts.ready)}</span>{" "}
          {preview.counts.existing > 0 && <span className="sh-pill quiet">{c.impExisting(preview.counts.existing)}</span>}{" "}
          {preview.problems_total > 0
            ? <span className="sh-pill wait">{c.impProblems(preview.problems_total)}</span>
            : preview.counts.sales > 0 && <span className="cn-hint">{c.impNoProblems}</span>}
        </p>
        {preview.template && <p className="cn-hint">{c.impTemplateUsed(preview.template)}</p>}
        {error && <p className="ct-error" role="alert">{error}</p>}

        {preview.problems.length > 0 && (
          <ul className="cn-rows cn-problems">
            {preview.problems.map((p, i) => (
              <li key={i} className="cn-row">
                <span className="cn-row-text">
                  <b><span>{c.impRow(p.row)}</span>{p.sale ? <><span className="cn-sep" aria-hidden="true">·</span><bdi dir="auto">{p.sale}</bdi></> : null}</b>
                  <small dir="auto">{lang === "ar" ? p.message_ar : p.message}</small>
                </span>
              </li>
            ))}
            {preview.problems_total > preview.problems.length && (
              <li className="cn-row"><span className="cn-row-text"><small>{c.impMore(preview.problems_total - preview.problems.length)}</small></span></li>
            )}
          </ul>
        )}

        <h3 className="cn-h3">{c.impMapTitle}</h3>
        <p className="cn-hint">{c.impMapHint}</p>
        <div className="cn-map">
          {preview.columns.map((col) => {
            const missing = preview.missing.includes(col.key);
            return (
              <Field key={col.key} label={`${lang === "ar" ? col.label_ar : col.label}${col.needed ? " *" : ""}`}
                error={missing ? c.impMapMissing : undefined}>
                <select value={preview.mapping[col.key] ?? ""}
                  onChange={(e) => {
                    const next = { ...preview.mapping };
                    if (e.target.value) next[col.key] = e.target.value; else delete next[col.key];
                    void change({ mapping: next });
                  }}>
                  <option value="">{c.impMapNone}</option>
                  {preview.headers.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            );
          })}
        </div>

        <h3 className="cn-h3">{c.impOptions}</h3>
        <div className="cn-map">
          <Field label={c.impKind}>
            <select value={opts.kind ?? "receipt"} onChange={(e) => void change({ options: { ...opts, kind: e.target.value } })}>
              {(["receipt", "invoice", "credit_note", "quote"] as const).map((k) => <option key={k} value={k}>{c.kindsShort[k]}</option>)}
            </select>
          </Field>
          <Field label={c.impMethod}>
            <select value={opts.default_payment_method ?? ""}
              onChange={(e) => void change({ options: { ...opts, default_payment_method: e.target.value || undefined } })}>
              {(["", "cash", "card", "bank_transfer", "cheque"] as const).map((m) => <option key={m} value={m}>{c.methods[m]}</option>)}
            </select>
          </Field>
        </div>
        <label className="ct-check">
          <input type="checkbox" checked={!!opts.send} onChange={(e) => void change({ options: { ...opts, send: e.target.checked } })} />
          <span className="cn-check-text"><b>{c.impSend}</b><small>{c.impSendHint}</small></span>
        </label>

        <h3 className="cn-h3">{c.impSales}</h3>
        {preview.sales.length === 0 ? <p className="cn-empty">{c.impNoSales}</p> : (
          <ul className="cn-rows">
            {preview.sales.map((s) => (
              <li key={s.sale_id} className="cn-row">
                <span className="cn-row-text">
                  <b><bdi dir="auto">{s.sale_id}</bdi>{s.number ? <> · <bdi dir="auto">{s.number}</bdi></> : null}{" "}
                    <span className={`sh-pill ${s.state === "ready" ? "active" : s.state === "existing" ? "quiet" : "wait"}`}>
                      {s.state === "ready" ? c.stateReady : s.state === "existing" ? c.stateExisting : c.stateProblem}
                    </span></b>
                  <small><bdi dir="auto">{s.customer}</bdi> · {c.kindsShort[s.kind as keyof typeof c.kindsShort] ?? s.kind} · {" "}
                    <bdi dir="ltr">{money(s.total_minor, s.currency, lang)}</bdi></small>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="cn-remember">
          <Field label={c.impRememberName}>
            <input value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </Field>
          <button type="button" className="btn ct-btn" disabled={!name.trim()} onClick={remember}>{c.impRemember}</button>
          {saved && <span className="cn-hint" role="status">{c.impRemembered}</span>}
        </div>
      </div>
    </Sheet>
  );
}
