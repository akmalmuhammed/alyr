"use client";

// The Features screen (ALY-148, D-039; specs/012-feature-engine): what the Catalog does for this
// shop, grouped in plain words. Each feature has a switch, what it is for, what it changes and
// where, how many items use it, and who set it. Turning one off hides it and stops it applying to
// new items; nothing already made is changed or deleted, and the screen says so. Above the
// features, the section's name (English and Arabic) and how the order page is laid out.
//
// Owners and admins only (the button is theirs; the API refuses anyone else). A switch is saved
// the moment it is pressed, with a message that names what moved with it; the name and layout are
// saved with their own button.

import { useCallback, useEffect, useMemo, useState } from "react";
import { matches, searchWords } from "../_customer/fold";
import {
  api, sayError, type FeatureGroup, type FeatureRow, type FeaturesView, type Setup,
} from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Announce, Field, Fold, Icon, Sheet, Switch, type Toast } from "./CatalogUi";
import { FEAT } from "./featuresCopy";
import "./features.css";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;
type Changed = { key: string; from: unknown; to: unknown }[];

export function CatalogFeatures({ lang, push, onClose, onChanged, onOpen }: {
  lang: Lang; push: Push; onClose: () => void; onChanged: () => void;
  /** Open the shop's own fields, or the change of type, in place of this screen. */
  onOpen?: (what: "fields" | "template") => void;
}) {
  const f = FEAT[lang];
  const t = COPY[lang];
  const ar = lang === "ar";
  const [view, setView] = useState<FeaturesView | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [style, setStyle] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([api<FeaturesView>("/api/features"), api<Setup>("/api/items/setup")])
      .then(([features, shape]) => {
        setView(features);
        setSetup(shape);
        setNameEn(shape.section.custom ? shape.section.name : "");
        setNameAr(shape.section.custom ? shape.section.name_ar : "");
        setStyle(shape.layout_custom ? shape.layout.style : "");
      })
      .catch((error) => setFailure(sayError(error, lang, t)));
  }, [lang, t]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const pick = (en: string, other: string) => (ar && other ? other : en);
  const names = useMemo(() => {
    const map = new Map<string, FeatureRow>();
    view?.groups.forEach((g) => g.features.forEach((x) => map.set(x.key, x)));
    return map;
  }, [view]);
  const nameOfKey = (key: string) => {
    const row = names.get(key);
    return row ? pick(row.name, row.name_ar) : key;
  };
  const list = (keys: string[]) => keys.map(nameOfKey).join(ar ? "، " : ", ");

  async function change(row: FeatureRow, body: { enabled?: boolean; config?: Record<string, string> }) {
    setBusy(row.key);
    setFailure("");
    try {
      const done = await api<FeaturesView & { changed: Changed }>(`/api/features/${row.key}`, "PUT", body);
      setView(done);
      const name = pick(row.name, row.name_ar);
      const moved = done.changed.filter((c) => c.key !== row.key && typeof c.to === "boolean");
      let text: string;
      if (body.config) text = f.soldOutSet(f.soldOutOptions[body.config.mode] ?? "");
      else text = body.enabled ? f.turnedOn(name) : f.turnedOff(name);
      if (moved.length) text += `. ${(body.enabled ? f.alsoOn : f.alsoOff)(list(moved.map((m) => m.key)))}`;
      push(text);
      onChanged();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(null);
    }
  }

  async function saveShape() {
    setSaving(true);
    setFailure("");
    try {
      const saved = await api<Setup>("/api/items/setup", "PUT", {
        section_name: nameEn.trim(), section_name_ar: nameAr.trim(), layout_style: style,
      });
      setSetup(saved);
      push(f.saved);
      onChanged();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setSaving(false);
    }
  }

  const words = searchWords(typed);
  const shown: FeatureGroup[] = useMemo(() => {
    if (!view) return [];
    if (words.length === 0) return view.groups;
    return view.groups
      .map((g) => ({
        ...g,
        features: g.features.filter((x) => matches(
          words, x.name, x.name_ar, x.hint, x.hint_ar, x.changes, x.changes_ar,
          ...x.affects.map((p) => f.places[p as keyof typeof f.places]),
        )),
      }))
      .filter((g) => g.features.length > 0);
  }, [view, words, f]);
  const total = shown.reduce((n, g) => n + g.features.length, 0);

  function row(x: FeatureRow) {
    const name = pick(x.name, x.name_ar);
    const choice = x.kind === "choice";
    const id = `ct-feat-${x.key}`;
    const needs = x.depends_on.filter((d) => !names.get(d)?.enabled);
    return (
      <li key={x.key} className={`ct-feat ${x.enabled ? "on" : "off"}`}>
        <div className="ct-feat-top">
          <span className="ct-toggle-text">
            <b id={id}>{name}</b>
            <small>{pick(x.hint, x.hint_ar)}</small>
          </span>
          {!choice && (
            <span className="ct-feat-switch">
              <Switch on={x.enabled} label={f.toggle(name, x.enabled)} disabled={busy !== null || !view?.can_manage}
                onChange={(next) => void change(x, { enabled: next })} />
              <span className="ct-state" aria-hidden="true">{x.enabled ? f.on : f.off}</span>
            </span>
          )}
        </div>
        {choice && (
          <fieldset className="ct-choices small" disabled={busy !== null || !view?.can_manage}>
            <legend>{f.soldOutLabel}</legend>
            {(x.choices.mode ?? []).map((mode) => (
              <label key={mode} className={`ct-choice ${x.config.mode === mode ? "on" : ""}`}>
                <input type="radio" name={`feat-${x.key}`} checked={x.config.mode === mode}
                  onChange={() => void change(x, { config: { mode } })} />
                <span className="ct-choice-mark" aria-hidden="true" />
                <span className="ct-choice-text"><b>{f.soldOutOptions[mode]}</b></span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="ct-feat-changes"><b>{f.changesLabel}</b> {pick(x.changes, x.changes_ar)}</p>
        {x.key === "custom_fields" && x.enabled && onOpen && (
          <div><button type="button" className="btn small" onClick={() => onOpen("fields")}><Icon name="sliders" />{f.manageFields}</button></div>
        )}
        <ul className="ct-feat-places" aria-label={f.changesLabel}>
          {x.affects.map((p) => <li key={p} className="sh-pill ct-pill quiet">{f.places[p as keyof typeof f.places]}</li>)}
        </ul>
        {needs.length > 0 && <p className="ct-hint">{f.needs(list(needs))}</p>}
        {x.in_use && <p className="ct-hint ct-feat-use">{pick(x.in_use.text, x.in_use.text_ar)}</p>}
        {x.set_by === "owner" && <p className="ct-hint">{f.setByYou}</p>}
      </li>
    );
  }

  return (
    <Sheet title={f.title} subtitle={setup ? f.startedFrom(pick(setup.template.name, setup.template.name_ar)) : undefined}
      onClose={onClose} closeLabel={f.close} wide
      footer={<button type="button" className="btn primary ct-btn ct-grow" onClick={onClose}>{f.close}</button>}>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <p className="ct-hint ct-feat-intro">{f.intro}</p>
      {view?.can_manage && onOpen && (
        <div><button type="button" className="btn ct-btn" onClick={() => onOpen("template")}><Icon name="retry" />{f.tplOpen}</button></div>
      )}
      {!view && !failure && <p className="ct-quiet" role="status">{f.loading}</p>}

      {view && setup && (
        <>
          <Fold title={f.shapeTitle}
            summary={`${pick(setup.section.name, setup.section.name_ar)} · ${f.layouts[setup.layout.style][0]}`}>
            <p className="ct-hint">{f.shapeHint}</p>
            <Field label={f.nameEn} hint={f.nameHint(setup.section.template_name)}>
              <input value={nameEn} dir="auto" maxLength={40} autoComplete="off" disabled={!view.can_manage}
                onChange={(e) => setNameEn(e.target.value)} />
            </Field>
            <Field label={f.nameAr} hint={f.nameHint(setup.section.template_name_ar)}>
              <input value={nameAr} dir="rtl" lang="ar" maxLength={40} autoComplete="off" disabled={!view.can_manage}
                onChange={(e) => setNameAr(e.target.value)} />
            </Field>
            <div className="ct-field">
              <span className="ct-label" id="ct-layout-label">{f.layoutLabel}</span>
              <div className="ct-chips" role="group" aria-labelledby="ct-layout-label">
                {[["", f.layoutOwn] as const, ...(["menu", "grid", "list", "table"] as const).map((k) => [k, f.layouts[k][0]] as const)].map(([key, title]) => (
                  <button key={key || "own"} type="button" className="ct-chip" aria-pressed={style === key}
                    disabled={!view.can_manage} onClick={() => setStyle(key)}>
                    {style === key && <Icon name="check" className="sh-ico ct-chip-tick" />}{title}
                  </button>
                ))}
              </div>
              <p className="ct-hint">{style ? f.layouts[style][1] : f.layoutOwnHint}</p>
            </div>
            {view.can_manage && (
              <button type="button" className="btn ct-btn" disabled={saving} onClick={() => void saveShape()}>
                {saving ? f.saving : f.save}
              </button>
            )}
          </Fold>

          <label className="ct-search">
            <Icon name="search" />
            <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={f.searchPlaceholder}
              aria-label={f.searchLabel} dir="auto" enterKeyHint="search" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          <Announce text={words.length ? (total === 0 ? f.noMatch(typed) : String(total)) : ""} />
          {words.length > 0 && total === 0 && (
            <div className="empty-note ct-none">
              <p>{f.noMatch(typed)}</p>
              <button type="button" className="btn small" onClick={() => setTyped("")}>{f.clearSearch}</button>
            </div>
          )}

          {shown.map((g) => (
            <section key={g.key} className="ct-sec ct-feats" aria-labelledby={`ct-group-${g.key}`}>
              <h3 id={`ct-group-${g.key}`}>{pick(g.name, g.name_ar)}</h3>
              <p className="ct-hint">{pick(g.hint, g.hint_ar)}</p>
              <ul className="ct-stack">{g.features.map(row)}</ul>
            </section>
          ))}

          {words.length === 0 && (
            <Fold title={f.coreTitle} summary={String(view.core.length)}>
              <p className="ct-hint">{f.coreHint}</p>
              <ul className="ct-core">
                {view.core.map((c) => (
                  <li key={c.key}><b>{pick(c.name, c.name_ar)}</b> <span className="ct-quiet">{pick(c.hint, c.hint_ar)}</span></li>
                ))}
              </ul>
            </Fold>
          )}
        </>
      )}
    </Sheet>
  );
}
