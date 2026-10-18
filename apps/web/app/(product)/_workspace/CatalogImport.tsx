"use client";

// Import and export (ALY-108): download a template or every item as Excel or CSV, upload a
// file, read the preview of every row, and only then import it. Nothing is saved before the
// owner has seen what will happen; the import carries the preview's hash, so it applies
// exactly that. The newest import can be undone once. Phone first, like the rest of the
// Catalog: the file picker is the phone's own, and the lists page in as they are asked for.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api, issueText, nameOf, sayError, sendFile, stamp,
  type ImportIssue, type ImportItem, type ImportKinds, type ImportPreview, type ImportRecent,
  type ImportResult, type ImportUndone, type OnDuplicate,
} from "./catalogApi";
import { COPY, type Copy, type Lang } from "./catalogCopy";
import { Field, Fold, Icon, Sheet } from "./CatalogUi";

type Step =
  | { kind: "home" }
  | { kind: "sending"; name: string; percent: number }
  | { kind: "preview"; data: ImportPreview }
  | { kind: "applying"; data: ImportPreview }
  | { kind: "done"; data: ImportResult };

const SHEET_TYPES = ".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ZIP_TYPES = ".zip,application/zip,application/x-zip-compressed";
const PAGE = 40;
const DUPLICATES: OnDuplicate[] = ["create", "update", "skip"];
const DUPLICATE_CODES = ["duplicate_name", "updates_existing", "skipped_existing", "ambiguous_match"];

function Notes({ issues, lang, t }: { issues: ImportIssue[]; lang: Lang; t: Copy }) {
  return (
    <ul className="ct-imp-notes">
      {issues.map((issue, n) => (
        <li key={n} className={`ct-lvl-${issue.level}`}>
          <Icon name={issue.level === "info" ? "check" : "warn"} />
          <span>
            <span className="ct-sr">{t.imp.levels[issue.level]}: </span>
            <b className="num">{t.imp.row(issue.row)}</b> {issueText(issue, lang)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Entry({ item, lang, t, show }: { item: ImportItem; lang: Lang; t: Copy; show: "errors" | "warnings" | "added" | "updated" }) {
  const name = nameOf(item, lang) || t.imp.noName;
  const notes = item.issues.filter((n) => (show === "errors" ? n.level === "error" : show === "warnings" ? n.level !== "error" : n.level === "warning"));
  return (
    <li className="ct-imp-entry">
      <div className="ct-imp-head">
        <b dir="auto">{name}</b>
        {item.draft && <span className="sh-pill ct-pill wait">{t.status.draft}</span>}
        {show === "added" && item.price_text && <span className="ct-quiet num" dir="ltr">{item.price_text}</span>}
        {show === "added" && item.category && <span className="ct-quiet" dir="auto">{item.category}</span>}
        {show === "added" && item.variants > 1 && <span className="ct-quiet">{t.imp.sizes(item.variants)}</span>}
        {show === "added" && item.photos > 0 && <span className="ct-quiet">{t.photoCount(item.photos)}</span>}
      </div>
      {show === "updated" && item.diff.length > 0 && (
        <ul className="ct-imp-diff">
          {item.diff.map((d, n) => (
            <li key={n}>
              <span className="ct-imp-what" dir="auto">{lang === "ar" ? d.label_ar : d.label}{d.variant ? ` · ${d.variant}` : ""}</span>
              <span className="ct-pv-change">
                <span className="ct-pv-from num" dir="auto">{d.before || t.imp.empty}</span>
                <Icon name="arrow" className="sh-ico ct-flip ct-pv-arrow" />
                <b className="ct-pv-to num" dir="auto">{d.after || t.imp.empty}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && <Notes issues={notes} lang={lang} t={t} />}
    </li>
  );
}

/** A list that shows a page at a time. */
function Paged({ items, render, label, t }: { items: ImportItem[]; render: (item: ImportItem) => React.ReactNode; label: string; t: Copy }) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <>
      <ul className="ct-imp-list" aria-label={label}>{items.slice(0, limit).map(render)}</ul>
      {items.length > limit && <button type="button" className="btn ct-btn" onClick={() => setLimit((l) => l + PAGE)}>{t.imp.showMore}</button>}
    </>
  );
}

export function CatalogImport({ lang, canEdit, onClose, onChanged }: {
  lang: Lang; canEdit: boolean; onClose: () => void; onChanged: () => void;
}) {
  const t = COPY[lang];
  const i = t.imp;
  const [step, setStep] = useState<Step>({ kind: "home" });
  const [failure, setFailure] = useState("");
  const [fileLang, setFileLang] = useState<Lang>(lang);
  const [kinds, setKinds] = useState<ImportKinds | null>(null);
  const [kind, setKind] = useState("generic");
  const [recent, setRecent] = useState<ImportRecent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [zipPercent, setZipPercent] = useState<number | null>(null);
  const [undone, setUndone] = useState<ImportUndone | null>(null);
  const chooser = useRef<HTMLInputElement>(null);
  const zipChooser = useRef<HTMLInputElement>(null);

  // What the home screen offers: the templates, and the imports so far.
  const loadHome = useCallback(async () => {
    try {
      const [k, r] = await Promise.all([
        api<ImportKinds>(`/api/items/import/kinds?lang=${lang}`),
        api<{ imports: ImportRecent[] }>("/api/items/import/recent"),
      ]);
      setKinds(k);
      setKind((current) => (k.kinds.some((x) => x.key === current) && current !== "generic" ? current : k.suggested));
      setRecent(r.imports);
    } catch {
      setRecent([]);
    }
  }, [lang]);
  useEffect(() => {
    const first = setTimeout(loadHome, 0);
    return () => clearTimeout(first);
  }, [loadHome]);

  // The photos of a finished import arrive after it; look until they are in.
  const watching = step.kind === "done" ? step.data : null;
  const photoState = watching?.photos?.state ?? null;
  useEffect(() => {
    if (!watching || !watching.photos || photoState === "done" || photoState === "failed") return;
    const timer = setTimeout(async () => {
      try {
        const fresh = await api<ImportResult>(`/api/items/import/${watching.id}`);
        setStep((now) => (now.kind === "done" && now.data.id === fresh.id ? { kind: "done", data: fresh } : now));
        onChanged();
      } catch {
        // The next look will try again.
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [watching, photoState, onChanged]);

  function discard(data: ImportPreview) {
    void api(`/api/items/import/${data.id}`, "DELETE").catch(() => undefined);
  }
  function closeAll() {
    if (step.kind === "preview") discard(step.data);
    onClose();
  }

  async function pickSheet(file: File) {
    setFailure("");
    setUndone(null);
    setStep({ kind: "sending", name: file.name, percent: 0 });
    try {
      const data = await sendFile<ImportPreview>(
        "POST", `/api/items/import?filename=${encodeURIComponent(file.name)}&on_duplicate=create`, file,
        (percent) => setStep((s) => (s.kind === "sending" ? { ...s, percent } : s)),
      );
      setStep({ kind: "preview", data });
    } catch (error) {
      setFailure(sayError(error, lang, t));
      setStep({ kind: "home" });
    }
  }

  async function pickZip(file: File) {
    if (step.kind !== "preview") return;
    const id = step.data.id;
    setFailure("");
    setZipPercent(0);
    try {
      const data = await sendFile<ImportPreview>(
        "PUT", `/api/items/import/${id}/photos?filename=${encodeURIComponent(file.name)}`, file, setZipPercent,
      );
      setStep({ kind: "preview", data });
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setZipPercent(null);
    }
  }

  async function change(call: () => Promise<ImportPreview>) {
    setBusy(true);
    setFailure("");
    try {
      setStep({ kind: "preview", data: await call() });
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  async function apply(data: ImportPreview) {
    setStep({ kind: "applying", data });
    setFailure("");
    try {
      const done = await api<ImportResult>(`/api/items/import/${data.id}/apply`, "POST", { preview: data.hash });
      setStep({ kind: "done", data: done });
      onChanged();
      void loadHome();
    } catch (error) {
      setFailure(sayError(error, lang, t));
      try {
        // Look again at what it is now (a stale preview), or at the preview it was.
        setStep({ kind: "preview", data: await api<ImportPreview>(`/api/items/import/${data.id}`) });
      } catch {
        setStep({ kind: "home" });
      }
    }
  }

  async function undo() {
    setBusy(true);
    setFailure("");
    try {
      const result = await api<ImportUndone>("/api/items/import/undo", "POST");
      setUndone(result);
      onChanged();
      void loadHome();
      if (step.kind === "done") setStep({ kind: "done", data: await api<ImportResult>(`/api/items/import/${step.data.id}`) });
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  // When the control that had the focus is gone (a step changed, a button was switched off), put
  // it on the step's main button, so Tab and Escape keep working from the keyboard.
  useEffect(() => {
    const sheet = document.querySelector<HTMLElement>(".ct-sheet");
    if (!sheet || sheet.contains(document.activeElement)) return;
    sheet.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)")?.focus({ preventScroll: true });
  });

  // ── the screens ──
  const q = (extra: Record<string, string>) => new URLSearchParams({ lang: fileLang, ...extra }).toString();

  function home() {
    return (
      <div className="ct-form">
        <p className="ct-intro">{i.sub}</p>

        <section className="ct-sec" aria-labelledby="ct-imp-upload">
          <h3 id="ct-imp-upload">{i.uploadTitle}</h3>
          {canEdit ? (
            <>
              <p className="ct-hint">{i.uploadText}</p>
              <input ref={chooser} className="ct-file" type="file" accept={SHEET_TYPES} tabIndex={-1} aria-hidden="true"
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void pickSheet(file); }} />
              <button type="button" className="btn volt ct-btn" data-autofocus onClick={() => chooser.current?.click()}><Icon name="upload" />{i.choose}</button>
            </>
          ) : <p className="ct-hint">{i.readOnly}</p>}
        </section>

        <div className="ct-sec">
          <h3 id="ct-imp-lang">{i.fileLang}</h3>
          <div className="ct-chips" role="group" aria-labelledby="ct-imp-lang">
            {(["en", "ar"] as const).map((code) => (
              <button key={code} type="button" className="ct-chip" aria-pressed={fileLang === code} lang={code} onClick={() => setFileLang(code)}>
                {fileLang === code && <Icon name="check" className="sh-ico ct-chip-tick" />}{i.langs[code]}
              </button>
            ))}
          </div>
        </div>

        <section className="ct-sec" aria-labelledby="ct-imp-template">
          <h3 id="ct-imp-template">{i.templateTitle}</h3>
          <p className="ct-hint">{i.templateText}</p>
          {kinds && (
            <Field label={i.kind} hint={kinds.kinds.find((k) => k.key === kind)?.note}>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.kinds.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
              </select>
            </Field>
          )}
          <div className="ct-imp-btns">
            <a className="btn ct-btn" href={`/api/items/import/template?${q({ kind, format: "xlsx" })}`} download><Icon name="download" />{i.excel} <bdi dir="ltr">(.xlsx)</bdi></a>
            <a className="btn ct-btn" href={`/api/items/import/template?${q({ kind, format: "csv" })}`} download><Icon name="download" />{i.csv}</a>
          </div>
        </section>

        <section className="ct-sec" aria-labelledby="ct-imp-export">
          <h3 id="ct-imp-export">{i.exportTitle}</h3>
          <p className="ct-hint">{i.exportText}</p>
          <div className="ct-imp-btns">
            <a className="btn ct-btn" href={`/api/items/export?${q({ format: "xlsx" })}`} download><Icon name="download" />{i.excel} <bdi dir="ltr">(.xlsx)</bdi></a>
            <a className="btn ct-btn" href={`/api/items/export?${q({ format: "csv" })}`} download><Icon name="download" />{i.csv}</a>
          </div>
        </section>

        <section className="ct-sec" aria-labelledby="ct-imp-recent">
          <h3 id="ct-imp-recent">{i.recentTitle}</h3>
          {recent && recent.length === 0 && <p className="ct-quiet">{i.recentNone}</p>}
          {recent && recent.length > 0 && (
            <ul className="ct-imp-recent">
              {recent.map((r) => (
                <li key={r.id}>
                  <span className="ct-imp-file" dir="auto">{r.filename}</span>
                  <small>{stamp(r.at)} · {r.by.name}</small>
                  <small>{r.status === "undone" ? i.undoneTag : i.recentLine(r.created, r.updated)}{r.skipped > 0 && r.status !== "undone" ? ` · ${i.doneLeft(r.skipped)}` : ""}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  function sending(s: Extract<Step, { kind: "sending" }>) {
    return (
      <div className="ct-form">
        <p className="ct-progress" role="status">
          <b dir="auto">{s.name}</b><br />
          {s.percent < 100 ? i.sending(s.percent) : i.checking}
        </p>
        <span className="ct-bar-track" aria-hidden="true"><span style={{ width: `${s.percent}%` }} /></span>
      </div>
    );
  }

  function preview(data: ImportPreview, working: boolean) {
    const s = data.summary;
    const of = (action: ImportItem["action"]) => data.items.filter((x) => x.action === action);
    const errors = of("error");
    const added = of("create");
    const updated = of("update");
    const skipped = of("skip");
    const unchanged = of("unchanged");
    const warned = [...added, ...updated].filter((x) => x.issues.some((n) => n.level === "warning"));
    const photoNotes = data.items.some((x) => x.issues.some((n) => n.code.startsWith("photo_")) || x.photos > 0) || data.zip !== null;
    const dupes = data.items.some((x) => x.issues.some((n) => DUPLICATE_CODES.includes(n.code))) || data.options.on_duplicate !== "create";
    const actionable = s.create + s.update;
    return (
      <div className="ct-form">
        <p className="ct-progress" role="status">
          <b dir="auto">{data.filename}</b><br />
          <span className="ct-quiet">{i.summaryLine(s.items, s.rows)}</span>
        </p>
        <ul className="ct-imp-counts" aria-label={i.previewTitle}>
          {([["create", s.create, ""], ["update", s.update, ""], ["unchanged", s.unchanged + s.skip, ""], ["out", s.error, s.error ? "bad" : ""]] as const).map(([key, n, tone]) => (
            <li key={key} className={tone}><b className="num">{n}</b><span>{i.counts[key]}</span></li>
          ))}
        </ul>

        {actionable === 0 && <p className="ct-alert" role="status"><Icon name="warn" />{i.nothing}</p>}
        {s.drafts > 0 && <p className="ct-diff"><Icon name="warn" />{i.draftNote(s.drafts)}</p>}
        {s.stock_moves > 0 && <p className="ct-hint">{i.stockNote(s.stock_moves)}</p>}
        {s.new_categories.length > 0 && (
          <p className="ct-hint"><b>{i.newCats}:</b> <span dir="auto">{s.new_categories.slice(0, 8).map((c) => `${c.name} (${c.items})`).join(lang === "ar" ? "، " : ", ")}</span>{s.new_categories.length > 8 ? ` ${i.moreCats(s.new_categories.length - 8)}` : ""}. {i.newCatsText}</p>
        )}
        {data.notes.map((n, k) => <p key={k} className="ct-hint">{issueText(n, lang)}</p>)}

        {dupes && (
          <fieldset className="ct-choices small">
            <legend className="ct-label">{i.dupTitle}</legend>
            {DUPLICATES.map((mode) => (
              <label key={mode} className={`ct-choice ${data.options.on_duplicate === mode ? "on" : ""}`}>
                <input type="radio" name="on-duplicate" checked={data.options.on_duplicate === mode} disabled={working || busy}
                  onChange={() => void change(() => api<ImportPreview>(`/api/items/import/${data.id}/options`, "POST", { on_duplicate: mode }))} />
                <span className="ct-choice-mark" aria-hidden="true" />
                <span className="ct-choice-text"><b>{i.dup[mode][0]}</b><small>{i.dup[mode][1]}</small></span>
              </label>
            ))}
          </fieldset>
        )}

        {errors.length > 0 && (
          <Fold title={i.leftOutTitle(errors.length)} open>
            <p className="ct-hint">{i.leftOutText}</p>
            <Paged items={errors} label={i.leftOutTitle(errors.length)} t={t} render={(x) => <Entry key={x.row} item={x} lang={lang} t={t} show="errors" />} />
          </Fold>
        )}
        {warned.length > 0 && (
          <Fold title={i.lookTitle(warned.length)} open={errors.length === 0 && warned.length <= 5 ? true : undefined}>
            <p className="ct-hint">{i.lookText}</p>
            <Paged items={warned} label={i.lookTitle(warned.length)} t={t} render={(x) => <Entry key={x.row} item={x} lang={lang} t={t} show="warnings" />} />
          </Fold>
        )}
        {added.length > 0 && (
          <Fold title={i.addTitle(added.length)}>
            <Paged items={added} label={i.addTitle(added.length)} t={t} render={(x) => <Entry key={x.row} item={x} lang={lang} t={t} show="added" />} />
          </Fold>
        )}
        {updated.length > 0 && (
          <Fold title={i.updateTitle(updated.length)}>
            <Paged items={updated} label={i.updateTitle(updated.length)} t={t} render={(x) => <Entry key={x.row} item={x} lang={lang} t={t} show="updated" />} />
          </Fold>
        )}
        {skipped.length > 0 && (
          <Fold title={i.skippedTitle(skipped.length)}>
            <Paged items={skipped} label={i.skippedTitle(skipped.length)} t={t} render={(x) => <Entry key={x.row} item={x} lang={lang} t={t} show="warnings" />} />
          </Fold>
        )}
        {unchanged.length > 0 && <p className="ct-hint"><b>{i.unchangedTitle(unchanged.length)}.</b> {i.unchangedText}</p>}

        <Fold title={i.photosTitle} open={photoNotes ? true : undefined}>
          <p className="ct-hint">{i.photosText}</p>
          {data.zip && (
            <p className="ct-progress" role="status">
              <b dir="auto">{data.zip.name}</b><br />
              <span className="ct-quiet">{i.zipMatched(s.zip.used ?? 0, s.zip.entries ?? 0)}</span>
              {(s.zip.unused_count ?? 0) > 0 && <><br /><span className="ct-quiet">{i.zipUnused(s.zip.unused_count ?? 0)}</span></>}
              {(s.zip.unusable?.length ?? 0) > 0 && <><br /><span className="ct-quiet">{i.zipUnusable(s.zip.unusable?.length ?? 0)}</span></>}
            </p>
          )}
          {zipPercent !== null && (
            <>
              <p className="ct-progress" role="status">{zipPercent < 100 ? i.sending(zipPercent) : i.checking}</p>
              <span className="ct-bar-track" aria-hidden="true"><span style={{ width: `${zipPercent}%` }} /></span>
            </>
          )}
          <input ref={zipChooser} className="ct-file" type="file" accept={ZIP_TYPES} tabIndex={-1} aria-hidden="true"
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void pickZip(file); }} />
          <div className="ct-imp-btns">
            <button type="button" className="btn ct-btn" disabled={busy || working || zipPercent !== null} onClick={() => zipChooser.current?.click()}>
              <Icon name="upload" />{data.zip ? i.changeZip : i.addZip}
            </button>
            {data.zip && (
              <button type="button" className="btn ghost ct-btn" disabled={busy || working || zipPercent !== null}
                onClick={() => void change(() => api<ImportPreview>(`/api/items/import/${data.id}/photos`, "DELETE"))}>{i.removeZip}</button>
            )}
          </div>
        </Fold>
      </div>
    );
  }

  function done(data: ImportResult) {
    const c = data.summary.counts;
    const problems = data.summary.problems.filter((p) => p.action === "error");
    const photos = data.photos;
    return (
      <div className="ct-form">
        {data.status === "applied" && (
          <div className="ct-finish" role="status">
            <span className="sh-check"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-6" /></svg></span>
            <p>{i.doneTitle}</p>
          </div>
        )}
        {data.status === "undone" && <p className="ct-diff" role="status"><Icon name="undo" />{i.undoneToast(undone ? undone.removed + undone.archived : 0, undone?.restored ?? 0)}</p>}
        {data.status === "applied" && (
          <ul className="ct-imp-counts" aria-label={i.doneTitle}>
            <li><b className="num">{c.create}</b><span>{i.countsDone.create}</span></li>
            <li><b className="num">{c.update}</b><span>{i.countsDone.update}</span></li>
            <li><b className="num">{c.unchanged + c.skip}</b><span>{i.countsDone.unchanged}</span></li>
            <li className={c.error ? "bad" : ""}><b className="num">{c.error}</b><span>{i.countsDone.out}</span></li>
          </ul>
        )}
        {data.status === "applied" && c.stock_moves > 0 && <p className="ct-hint">{i.doneStock(c.stock_moves)}</p>}
        {photos && photos.state !== "failed" && (
          <p className="ct-progress" role="status">
            {photos.state === "done" ? i.photosDone(photos.done) : i.photosAdding(photos.done + photos.failed.length, photos.total)}
          </p>
        )}
        {photos?.state === "failed" && <p className="ct-alert" role="alert"><Icon name="warn" />{i.photosFailed}</p>}
        {photos && photos.failed.length > 0 && (
          <Fold title={i.photosFailedTitle(photos.failed.length)}>
            <ul className="ct-imp-notes">
              {photos.failed.map((f, n) => (
                <li key={n} className="ct-lvl-warning"><Icon name="warn" /><span><b dir="ltr">{f.file}</b> {lang === "ar" ? f.message_ar : f.message}</span></li>
              ))}
            </ul>
          </Fold>
        )}
        {problems.length > 0 && (
          <Fold title={i.leftOutTitle(problems.length)} open>
            <p className="ct-hint">{i.leftOutDone}</p>
            <ul className="ct-imp-list">
              {problems.map((p) => (
                <li key={p.row} className="ct-imp-entry">
                  <div className="ct-imp-head"><b dir="auto">{(lang === "ar" ? p.name_ar || p.name : p.name || p.name_ar) || i.noName}</b></div>
                  <Notes issues={p.issues.filter((n) => n.level === "error")} lang={lang} t={t} />
                </li>
              ))}
            </ul>
          </Fold>
        )}
        {undone && undone.left.length > 0 && (
          <Fold title={i.undoLeft(undone.left.length)} open>
            <ul className="ct-imp-notes">
              {undone.left.map((l) => (
                <li key={l.id} className="ct-lvl-warning"><Icon name="warn" /><span><b dir="auto">{(lang === "ar" ? l.name_ar || l.name : l.name || l.name_ar) || i.noName}</b> {lang === "ar" ? l.message_ar : l.message}</span></li>
              ))}
            </ul>
          </Fold>
        )}
      </div>
    );
  }

  // ── footer and frame ──
  let footer: React.ReactNode;
  let title = i.title;
  let body: React.ReactNode;
  if (step.kind === "home") {
    body = home();
    footer = <button type="button" className="btn primary ct-btn ct-grow" onClick={onClose}>{t.close}</button>;
  } else if (step.kind === "sending") {
    body = sending(step);
    footer = null;
  } else if (step.kind === "preview" || step.kind === "applying") {
    const working = step.kind === "applying";
    const data = step.data;
    const n = data.summary.create + data.summary.update;
    title = i.previewTitle;
    body = preview(data, working);
    footer = (
      <>
        <button type="button" className="btn ct-btn" disabled={working || busy} onClick={() => { discard(data); setStep({ kind: "home" }); }}>{i.discard}</button>
        <button type="button" className="btn volt ct-btn ct-grow" data-autofocus disabled={working || busy || n === 0 || zipPercent !== null} onClick={() => void apply(data)}>
          {working ? i.applying : i.apply(n)}
        </button>
      </>
    );
  } else {
    body = done(step.data);
    footer = (
      <>
        {step.data.can_undo && step.data.status === "applied" && canEdit && (
          <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void undo()}><Icon name="undo" />{busy ? i.undoing : i.undo}</button>
        )}
        <button type="button" className="btn primary ct-btn ct-grow" data-autofocus onClick={onClose}>{i.doneButton}</button>
      </>
    );
  }

  return (
    <Sheet title={title} onClose={closeAll} closeLabel={t.close} footer={footer} wide>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {body}
    </Sheet>
  );
}

