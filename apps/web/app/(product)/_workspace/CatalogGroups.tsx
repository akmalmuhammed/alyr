"use client";

// Customer price groups (wholesale), managed in the Catalog settings (owners and admins): the
// groups a shop prices by, each with a name in both languages and how many customers are in it.
// The default group is the normal price: it can be renamed, not removed. Each change is saved at
// once; a group that is removed sends its customers back to the default group.

import { useEffect, useRef, useState } from "react";
import { api, nameOf, sayError, type PriceGroup } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Field, Icon, type Toast } from "./CatalogUi";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;

export function CatalogGroups({ lang, push }: { lang: Lang; push: Push }) {
  const t = COPY[lang];
  const [groups, setGroups] = useState<PriceGroup[] | null>(null);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [adding, setAdding] = useState(false);
  // Where focus goes when a form or a confirmation goes away: the control that opened it. Without
  // this it falls to the page, and the sheet no longer hears Escape.
  const root = useRef<HTMLElement>(null);
  const back = useRef<string | null>(null);
  useEffect(() => {
    // (A button cannot take focus while it is disabled, so wait until nothing is being saved.)
    if (editing || adding || removing || busy || !back.current) return;
    root.current?.querySelector<HTMLElement>(back.current)?.focus({ preventScroll: true });
    back.current = null;
  }, [editing, adding, removing, busy, groups]);

  useEffect(() => {
    let live = true;
    api<{ groups: PriceGroup[] }>("/api/price-groups")
      .then((r) => { if (live) setGroups(r.groups); })
      .catch((error) => { if (live) setFailure(sayError(error, lang, t)); });
    return () => { live = false; };
  }, [lang, t]);

  /** The groups again, after a change. */
  async function load() {
    try {
      setGroups((await api<{ groups: PriceGroup[] }>("/api/price-groups")).groups);
    } catch (error) {
      setFailure(sayError(error, lang, t));
    }
  }

  function startAdd() {
    back.current = '[data-pg="add"]';
    setEditing(null);
    setRemoving(null);
    setName("");
    setNameAr("");
    setAdding(true);
    setFailure("");
  }

  function startEdit(group: PriceGroup) {
    back.current = `[data-pg-rename="${group.id}"]`;
    setAdding(false);
    setRemoving(null);
    setName(group.name);
    setNameAr(group.name_ar);
    setEditing(group.id);
    setFailure("");
  }

  async function save() {
    setBusy(true);
    setFailure("");
    try {
      if (editing) await api(`/api/price-groups/${editing}`, "PUT", { name: name.trim(), name_ar: nameAr.trim() });
      else await api("/api/price-groups", "POST", { name: name.trim(), name_ar: nameAr.trim() });
      push(editing ? t.pgSaved : t.pgAdded);
      setEditing(null);
      setAdding(false);
      await load();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  async function remove(group: PriceGroup) {
    setBusy(true);
    setFailure("");
    try {
      const result = await api<{ moved: number }>(`/api/price-groups/${group.id}`, "DELETE");
      push(t.pgRemoved(result.moved));
      back.current = '[data-pg="add"]';
      setRemoving(null);
      await load();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form className="ct-card-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="ct-grid2 names">
        <Field label={t.pgNameEn}><input value={name} dir="auto" maxLength={60} autoComplete="off" autoFocus onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t.pgNameAr}><input value={nameAr} dir="rtl" lang="ar" maxLength={60} autoComplete="off" onChange={(e) => setNameAr(e.target.value)} /></Field>
      </div>
      <p className="ct-hint">{t.pgNameHint}</p>
      <div className="ct-row-between">
        <button type="button" className="btn ct-btn" onClick={() => { setEditing(null); setAdding(false); }}>{t.cancel}</button>
        <button type="submit" className="btn primary ct-btn" disabled={busy || (!name.trim() && !nameAr.trim())}>{busy ? t.saving : t.pgSave}</button>
      </div>
    </form>
  );

  return (
    <section className="ct-sec" aria-labelledby="ct-pg-title" ref={root}>
      <h3 id="ct-pg-title">{t.pgTitle}</h3>
      <p className="ct-hint">{t.pgHint}</p>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {groups === null ? (
        failure ? null : <p className="ct-hint" role="status">{t.pgLoading}</p>
      ) : (
        <ul className="ct-stack">
          {groups.map((g) => (
            <li key={g.id} className="ct-card-form">
              {editing === g.id ? form : (
                <>
                  <div className="ct-row-between">
                    <span className="ct-toggle-text">
                      <b dir="auto">{nameOf(g, lang)}</b>
                      <small>
                        {g.is_default ? `${t.pgDefault} · ` : ""}{t.pgCustomers(g.customers ?? 0)}
                      </small>
                    </span>
                    <span className="ct-row-btns">
                      <button type="button" className="btn small" data-pg-rename={g.id} onClick={() => startEdit(g)} disabled={busy}>{t.pgRename}</button>
                      {!g.is_default && (
                        <button type="button" className="btn small ghost" data-pg-remove={g.id}
                          onClick={() => { back.current = `[data-pg-remove="${g.id}"]`; setRemoving(removing === g.id ? null : g.id); }}
                          aria-expanded={removing === g.id} disabled={busy}><Icon name="trash" />{t.pgRemove}</button>
                      )}
                    </span>
                  </div>
                  {g.is_default && <p className="ct-hint">{t.pgDefaultHint}</p>}
                  {removing === g.id && (
                    <div className="sh-confirm" role="alertdialog" aria-label={t.pgRemove}>
                      <span>{t.pgRemoveText(g.customers ?? 0, nameOf(g, lang))}</span>
                      <button type="button" className="btn small" data-autofocus onClick={() => { back.current = `[data-pg-remove="${g.id}"]`; setRemoving(null); }}>{t.leaveKeep}</button>
                      <button type="button" className="btn small danger" disabled={busy} onClick={() => void remove(g)}>{t.pgRemove}</button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? form : (
        groups !== null && (
          <button type="button" className="btn ct-btn" data-pg="add" onClick={startAdd} disabled={busy}><Icon name="plus" />{t.pgAdd}</button>
        )
      )}
    </section>
  );
}
