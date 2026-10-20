"use client";

// The shop's own fields (ALY-148, D-039; specs/012-feature-engine): "Serves", "Warranty months",
// "Allergens". Owners and admins add them, rename them, choose who sees them, switch searching
// and "needed" on, and archive them (the values on the items stay). A field's kind and where it
// belongs are fixed once it is made, because what is written in it would no longer mean the same.
// Phone first, English and Arabic, saved with the button; archiving asks first.

import { useCallback, useEffect, useState } from "react";
import { api, sayError, type CustomField, type FieldsView } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Field, Fold, Icon, Sheet, Switch, type Toast } from "./CatalogUi";
import { FEAT } from "./featuresCopy";
import "./features.css";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;
type Kind = CustomField["kind"];
type Draft = {
  label: string; label_ar: string; kind: Kind; applies_to: "item" | "variant"; unit: string;
  choices: { value?: string; label: string; label_ar: string; active: boolean }[];
  shown: boolean; searchable: boolean; required: boolean;
};

const KINDS: Kind[] = ["text", "number", "choice", "yes_no", "date"];
const blank = (): Draft => ({
  label: "", label_ar: "", kind: "text", applies_to: "item", unit: "",
  choices: [], shown: false, searchable: false, required: false,
});
const draftOf = (f: CustomField): Draft => ({
  label: f.label, label_ar: f.label_ar, kind: f.kind, applies_to: f.applies_to, unit: f.unit,
  choices: f.choices.filter((c) => c.active).map((c) => ({ ...c })), shown: f.shown_to_customers,
  searchable: f.searchable, required: f.required,
});

export function CatalogFields({ lang, push, onClose, onChanged }: {
  lang: Lang; push: Push; onClose: () => void; onChanged: () => void;
}) {
  const f = FEAT[lang];
  const t = COPY[lang];
  const ar = lang === "ar";
  const [view, setView] = useState<FieldsView | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // "new" or a field's id
  const [draft, setDraft] = useState<Draft>(blank());
  const [asking, setAsking] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<FieldsView>("/api/custom-fields").then(setView).catch((error) => setFailure(sayError(error, lang, t)));
  }, [lang, t]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const nameOf = (x: { label: string; label_ar: string }) => (ar && x.label_ar ? x.label_ar : x.label || x.label_ar);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const full = view !== null && view.active >= view.limits.fields;

  function start(field?: CustomField) {
    setFailure("");
    setAsking(null);
    setEditing(field ? field.id : "new");
    setDraft(field ? draftOf(field) : blank());
  }

  async function save() {
    setBusy(true);
    setFailure("");
    try {
      const body = {
        label: draft.label.trim(), label_ar: draft.label_ar.trim(), unit: draft.unit.trim(),
        shown_to_customers: draft.shown, searchable: draft.searchable, required: draft.required,
        ...(draft.kind === "choice" ? { choices: draft.choices.filter((c) => c.label.trim() || c.label_ar.trim()).map((c) => ({ ...(c.value ? { value: c.value } : {}), label: c.label.trim(), label_ar: c.label_ar.trim(), active: true })) } : {}),
      };
      if (editing === "new") await api("/api/custom-fields", "POST", { ...body, kind: draft.kind, applies_to: draft.applies_to });
      else await api(`/api/custom-fields/${editing}`, "PUT", body);
      push(f.fieldSaved);
      setEditing(null);
      load();
      onChanged();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  async function archive(field: CustomField, restore: boolean) {
    setBusy(true);
    setFailure("");
    try {
      await api(`/api/custom-fields/${field.id}/${restore ? "restore" : "archive"}`, "POST");
      push(restore ? f.fieldBack : f.fieldArchived);
      setAsking(null);
      load();
      onChanged();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  const active = (view?.fields ?? []).filter((x) => !x.archived);
  const archived = (view?.fields ?? []).filter((x) => x.archived);

  const form = (
    <form className="ct-card-form ct-fieldform" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="ct-grid2 names">
        <Field label={f.fieldName}><input value={draft.label} dir="auto" maxLength={60} autoComplete="off" autoFocus onChange={(e) => set({ label: e.target.value })} /></Field>
        <Field label={f.fieldNameAr}><input value={draft.label_ar} dir="rtl" lang="ar" maxLength={60} autoComplete="off" onChange={(e) => set({ label_ar: e.target.value })} /></Field>
      </div>
      <div className="ct-grid2">
        <Field label={f.fieldKind} hint={editing === "new" ? undefined : f.fieldKeepsKind}>
          <select value={draft.kind} disabled={editing !== "new"} onChange={(e) => set({ kind: e.target.value as Kind, choices: e.target.value === "choice" && draft.choices.length === 0 ? [{ label: "", label_ar: "", active: true }] : draft.choices })}>
            {KINDS.map((k) => <option key={k} value={k}>{f.kinds[k]}</option>)}
          </select>
        </Field>
        <Field label={f.fieldPlace}>
          <select value={draft.applies_to} disabled={editing !== "new"} onChange={(e) => set({ applies_to: e.target.value as "item" | "variant" })}>
            <option value="item">{f.fieldPlaces.item}</option>
            <option value="variant">{f.fieldPlaces.variant}</option>
          </select>
        </Field>
      </div>
      {draft.kind === "number" && (
        <Field label={f.fieldUnit}><input value={draft.unit} dir="auto" maxLength={12} autoComplete="off" onChange={(e) => set({ unit: e.target.value })} /></Field>
      )}
      {draft.kind === "choice" && (
        <section className="ct-subsec" aria-label={f.choicesTitle}>
          <h3>{f.choicesTitle}</h3>
          <ul className="ct-subs">
            {draft.choices.map((c, i) => (
              <li key={c.value ?? `new-${i}`} className="ct-sub">
                <div className="ct-grid2 names">
                  <Field label={f.choiceName}><input value={c.label} dir="auto" maxLength={60} autoComplete="off" onChange={(e) => set({ choices: draft.choices.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></Field>
                  <Field label={f.choiceNameAr}><input value={c.label_ar} dir="rtl" lang="ar" maxLength={60} autoComplete="off" onChange={(e) => set({ choices: draft.choices.map((x, k) => (k === i ? { ...x, label_ar: e.target.value } : x)) })} /></Field>
                </div>
                <button type="button" className="btn small ghost" onClick={() => set({ choices: draft.choices.filter((_, k) => k !== i) })}><Icon name="trash" />{f.removeChoice}</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn ct-btn" onClick={() => set({ choices: [...draft.choices, { label: "", label_ar: "", active: true }] })}><Icon name="plus" />{f.addChoice}</button>
        </section>
      )}
      <div className="ct-toggle">
        <span className="ct-toggle-text"><b>{f.shownToCustomers}</b><small>{f.shownHint}</small></span>
        <Switch on={draft.shown} label={f.shownToCustomers} onChange={(v) => set({ shown: v })} />
      </div>
      <div className="ct-toggle">
        <span className="ct-toggle-text"><b>{f.searchable}</b><small>{f.searchableHint}</small></span>
        <Switch on={draft.searchable} label={f.searchable} onChange={(v) => set({ searchable: v })} />
      </div>
      <div className="ct-toggle">
        <span className="ct-toggle-text"><b>{f.required}</b><small>{f.requiredHint}</small></span>
        <Switch on={draft.required} label={f.required} onChange={(v) => set({ required: v })} />
      </div>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <div className="ct-row-between">
        <button type="button" className="btn ct-btn" onClick={() => setEditing(null)}>{t.cancel}</button>
        <button type="submit" className="btn primary ct-btn" disabled={busy || (!draft.label.trim() && !draft.label_ar.trim())}>{busy ? t.saving : f.fieldSave}</button>
      </div>
    </form>
  );

  function row(x: CustomField) {
    const pills = [
      x.applies_to === "variant" ? f.fieldPills.variant : "", x.shown_to_customers ? f.fieldPills.shown : "",
      x.searchable ? f.fieldPills.searched : "", x.required ? f.fieldPills.needed : "",
    ].filter(Boolean);
    return (
      <li key={x.id} className="ct-card-form">
        {editing === x.id ? form : (
          <>
            <div className="ct-row-between">
              <span className="ct-toggle-text">
                <b dir="auto">{nameOf(x)}</b>
                <small>{f.kinds[x.kind]}{x.unit ? ` · ${x.unit}` : ""}{(x.used_by ?? 0) > 0 ? ` · ${f.fieldUsed(x.used_by ?? 0)}` : ""}</small>
              </span>
              {view?.can_manage !== false && (
                <span className="ct-row-btns">
                  {x.archived ? (
                    <button type="button" className="btn small" disabled={busy} onClick={() => void archive(x, true)}><Icon name="undo" />{f.restoreField}</button>
                  ) : (
                    <>
                      <button type="button" className="btn small" onClick={() => start(x)}>{f.editField}</button>
                      <button type="button" className="btn small ghost" aria-expanded={asking === x.id} onClick={() => setAsking(asking === x.id ? null : x.id)}><Icon name="trash" />{f.archiveField}</button>
                    </>
                  )}
                </span>
              )}
            </div>
            {pills.length > 0 && <ul className="ct-feat-places" aria-label={nameOf(x)}>{pills.map((p) => <li key={p} className="sh-pill ct-pill quiet">{p}</li>)}</ul>}
            {asking === x.id && (
              <div className="sh-confirm" role="alertdialog" aria-label={f.archiveField}>
                <span>{f.archiveAsk}</span>
                <button type="button" className="btn small" data-autofocus onClick={() => setAsking(null)}>{f.keepField}</button>
                <button type="button" className="btn small danger" disabled={busy} onClick={() => void archive(x, false)}>{f.archiveField}</button>
              </div>
            )}
          </>
        )}
      </li>
    );
  }

  return (
    <Sheet title={f.fieldsTitle} subtitle={view ? f.fieldsCount(view.active, view.limits.fields) : undefined}
      onClose={onClose} closeLabel={f.close} wide
      footer={<button type="button" className="btn primary ct-btn ct-grow" onClick={onClose}>{f.close}</button>}>
      {failure && !editing && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <p className="ct-hint">{f.fieldsIntro}</p>
      {!view && !failure && <p className="ct-quiet" role="status">{f.loading}</p>}
      {view && (
        <>
          {active.length === 0 && editing !== "new" && <p className="ct-hint">{f.fieldsNone}</p>}
          <ul className="ct-stack">{active.map(row)}</ul>
          {editing === "new" ? form : (
            view.can_manage !== false && (
              <button type="button" className="btn ct-btn" disabled={full} onClick={() => start()}><Icon name="plus" />{f.addField}</button>
            )
          )}
          {archived.length > 0 && (
            <Fold title={f.archivedTitle} summary={String(archived.length)}>
              <p className="ct-hint">{f.archivedHint}</p>
              <ul className="ct-stack">{archived.map(row)}</ul>
            </Fold>
          )}
        </>
      )}
    </Sheet>
  );
}
