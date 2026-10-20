"use client";

// The shop's saved lines (ALY-141, spec 016): what it writes on its invoices again and again, a
// name in each language, a usual price and a unit. Offered as a person starts typing a line, and
// added here or with "Save for next time" under a line. Not the Catalog: no stock, no photos.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, sayRefusal, type Meta, type SavedLine } from "./documentsApi";
import { COPY, type Lang } from "./documentsCopy";
import { inputMoney, parseMoney, written } from "./documentsLogic";
import { Announce, Field, Icon, Sheet } from "./CatalogUi";
import type { Push } from "./DocumentSheets";
import { STANDALONE } from "./standaloneCopy";
import "./standalone.css";

type Form = { name: string; name_ar: string; unit: string; price: string };

export function SavedLines({ lang, meta, push, nav }: { lang: Lang; meta: Meta; push: Push; nav: React.ReactNode }) {
  const t = COPY[lang];
  const s = STANDALONE[lang];
  const exponent = meta.currencies[meta.defaults.currency]?.exponent ?? 2;
  const fallback = { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone };
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SavedLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState<null | { id: string | null; form: Form }>(null);
  const [round, setRound] = useState(0);
  const asked = useRef(0);
  const fmt = (minor: number) => written(minor, meta.defaults.currency, exponent, meta.currencies[meta.defaults.currency]?.symbol_ar ?? "", lang);

  useEffect(() => {
    const wait = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(wait);
  }, [typed]);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    try {
      const r = await api<{ lines: SavedLine[] }>(`/api/documents/saved-lines?limit=200&q=${encodeURIComponent(q)}`);
      if (mine !== asked.current) return;
      setRows(r.lines);
      setLoaded(true);
      setOffline(false);
    } catch (error) {
      if (mine !== asked.current) return;
      if (sayRefusal(error, lang, fallback) === t.offline) setOffline(true);
      else push(sayRefusal(error, lang, fallback), { tone: "bad" });
    }
    // `fallback` and `push` do not change what a load asks for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lang, t]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load, round]);

  const empty = loaded && rows.length === 0 && !q;
  const add = () => setEditing({ id: null, form: { name: "", name_ar: "", unit: "piece", price: "" } });
  return (
    <div className="ct dc" lang={lang}>
      {nav}
      <header className="sh-head">
        <span className="sh-eyebrow">{loaded ? s.linesCount(rows.length) : " "}</span>
        <h1>{s.linesTitle}</h1>
        <p>{s.linesSub}</p>
      </header>

      {offline && (
        <div className="ct-banner bad" role="status">
          <span>{t.offline}</span>
          <button type="button" className="btn small" onClick={() => void load()}>{t.retry}</button>
        </div>
      )}

      <div className="ct-actions">
        <button type="button" className="btn volt ct-btn" onClick={add}><Icon name="plus" />{s.linesAdd}</button>
      </div>

      {!empty && (
        <label className="ct-search">
          <Icon name="search" />
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={s.linesSearch}
            aria-label={s.linesSearch} dir="auto" enterKeyHint="search" autoComplete="off" spellCheck={false} />
        </label>
      )}
      <Announce text={loaded ? s.linesCount(rows.length) : ""} />
      {!loaded && !offline && <p className="ct-quiet ct-pad" role="status">{t.loading}</p>}

      {empty && (
        <section className="sh-tile raised folded ct-empty">
          <span className="sh-glyph"><Icon name="tag" /></span>
          <h2>{s.linesNoneTitle}</h2>
          <p>{s.linesNoneText}</p>
          <button type="button" className="btn volt ct-btn" onClick={add}><Icon name="plus" />{s.linesAdd}</button>
        </section>
      )}
      {loaded && !empty && rows.length === 0 && <div className="empty-note ct-none"><p>{s.linesNoMatch}</p></div>}

      {rows.length > 0 && (
        <ul className="sa-list">
          {rows.map((l) => (
            <li key={l.id}>
              <button type="button" className="sa-row" onClick={() => setEditing({
                id: l.id, form: { name: l.name, name_ar: l.name_ar, unit: l.unit, price: l.price_minor ? inputMoney(l.price_minor, exponent) : "" },
              })}>
                <span className="sa-row-main">
                  <b dir="auto">{lang === "ar" ? l.name_ar || l.name : l.name || l.name_ar}</b>
                  <small>{s.linesUsed(l.uses)} · {t.units[l.unit] ?? l.unit}</small>
                </span>
                <span className="sa-row-end num"><bdi>{fmt(l.price_minor)}</bdi></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <LineForm lang={lang} meta={meta} id={editing.id} start={editing.form}
          onClose={() => setEditing(null)}
          onDone={(message) => { setEditing(null); setRound((n) => n + 1); push(message); }} />
      )}
    </div>
  );
}

function LineForm({ lang, meta, id, start, onClose, onDone }: {
  lang: Lang; meta: Meta; id: string | null; start: Form; onClose: () => void; onDone: (message: string) => void;
}) {
  const t = COPY[lang];
  const s = STANDALONE[lang];
  const exponent = meta.currencies[meta.defaults.currency]?.exponent ?? 2;
  const [f, setF] = useState<Form>(start);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const set = (k: keyof Form, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  async function save() {
    setFail("");
    if (!f.name.trim() && !f.name_ar.trim()) { setFail(s.linesError); return; }
    const price = f.price.trim() ? parseMoney(f.price, exponent) : 0;
    if (price === null) { setFail(t.lineBad); return; }
    setBusy(true);
    try {
      const body = { name: f.name.trim(), name_ar: f.name_ar.trim(), unit: f.unit, price_minor: price };
      if (id) await api(`/api/documents/saved-lines/${id}`, "PUT", body);
      else await api("/api/documents/saved-lines", "POST", body);
      onDone(s.linesSaved);
    } catch (error) {
      setFail(sayRefusal(error, lang, { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone }));
      setBusy(false);
    }
  }
  async function remove() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/api/documents/saved-lines/${id}`, "DELETE");
      onDone(s.linesRemoved);
    } catch (error) {
      setFail(sayRefusal(error, lang, { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone }));
      setBusy(false);
    }
  }

  return (
    <Sheet title={id ? s.linesFormEdit : s.linesFormNew} onClose={onClose} closeLabel={t.close}
      footer={(
        <div className="dc-foot">
          <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => void save()}>{busy ? t.saving : t.save}</button>
          {id && <button type="button" className="btn danger ct-btn" disabled={busy} onClick={() => void remove()}><Icon name="trash" />{s.linesRemove}</button>}
          <button type="button" className="btn ghost ct-btn" onClick={onClose}>{t.cancel}</button>
        </div>
      )}>
      {fail && <p className="ct-alert" role="alert"><Icon name="warn" />{fail}</p>}
      <form className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label={s.linesName}><input value={f.name} dir="auto" maxLength={300} autoComplete="off" data-autofocus onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label={s.linesNameAr}><input value={f.name_ar} dir="rtl" maxLength={300} autoComplete="off" onChange={(e) => set("name_ar", e.target.value)} /></Field>
        <div className="ct-grid2">
          <Field label={s.linesPrice}><input className="ct-bignum" inputMode="decimal" dir="ltr" value={f.price} autoComplete="off" placeholder="0.00" onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label={s.linesUnit}>
            <select value={f.unit} onChange={(e) => set("unit", e.target.value)}>
              {meta.units.map((u) => <option key={u} value={u}>{t.units[u] ?? u}</option>)}
            </select>
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
