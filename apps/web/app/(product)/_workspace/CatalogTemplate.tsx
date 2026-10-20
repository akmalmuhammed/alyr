"use client";

// Change your type of business (ALY-148, D-039; specs/012-feature-engine): pick another template,
// read exactly what it would add, then add it. It only adds: nothing is switched off or removed,
// what the owner set themselves stays as they set it, and nothing they made is changed. The
// preview carries a hash, and the apply must carry it, so only what was read is done.

import { useEffect, useRef, useState } from "react";
import { api, ApiError, sayError, type TemplateChoice, type TemplatePlan } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Icon, Sheet, type Toast } from "./CatalogUi";
import { FEAT } from "./featuresCopy";
import "./features.css";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;

export function CatalogTemplate({ lang, push, onClose, onChanged }: {
  lang: Lang; push: Push; onClose: () => void; onChanged: () => void;
}) {
  const f = FEAT[lang];
  const t = COPY[lang];
  const ar = lang === "ar";
  const [info, setInfo] = useState<{ current: TemplateChoice; choices: TemplateChoice[] } | null>(null);
  const [picked, setPicked] = useState("");
  const [plan, setPlan] = useState<TemplatePlan | null>(null);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const planRef = useRef<HTMLElement>(null);
  // The preview sits under the choices; bring it into view when it arrives.
  useEffect(() => { if (plan) planRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [plan]);

  useEffect(() => {
    api<{ current: TemplateChoice; choices: TemplateChoice[] }>("/api/templates")
      .then(setInfo).catch((error) => setFailure(sayError(error, lang, t)));
  }, [lang, t]);

  const name = (x: { name: string; name_ar: string }) => (ar && x.name_ar ? x.name_ar : x.name);
  const label = (x: { label: string; label_ar: string }) => (ar && x.label_ar ? x.label_ar : x.label || x.label_ar);
  const words = (rows: { name: string; name_ar: string }[]) => rows.map(name).join(ar ? "، " : ", ");

  async function look(key: string) {
    setPicked(key);
    setPlan(null);
    setFailure("");
    setBusy(true);
    try {
      setPlan(await api<TemplatePlan>(`/api/templates/preview?to=${encodeURIComponent(key)}`));
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setFailure("");
    try {
      await api("/api/templates/apply", "POST", { to: plan.to.key, preview: plan.hash });
      push(f.tplDone(name(plan.to)));
      onChanged();
      onClose();
    } catch (error) {
      setFailure(error instanceof ApiError && error.code === "preview_changed" ? f.tplChanged : sayError(error, lang, t));
      if (error instanceof ApiError && error.code === "preview_changed") void look(plan.to.key);
      setBusy(false);
    }
  }

  const layoutName = (style: string) => (f.layouts[style]?.[0] ?? style).toLowerCase();

  return (
    <Sheet title={f.tplTitle} subtitle={info ? f.tplNow(name(info.current)) : undefined} onClose={onClose}
      closeLabel={f.close} wide
      footer={(
        <>
          <button type="button" className="btn ct-btn" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="btn primary ct-btn ct-grow" disabled={busy || !plan || plan.nothing} onClick={() => void apply()}>
            {busy && plan ? f.tplApplying : f.tplApply}
          </button>
        </>
      )}>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <p className="ct-hint">{f.tplIntro}</p>
      {!info && !failure && <p className="ct-quiet" role="status">{f.loading}</p>}
      {info && (
        <fieldset className="ct-choices small" disabled={busy}>
          <legend>{f.tplChoose}</legend>
          {info.choices.map((c) => (
            <label key={c.key} className={`ct-choice ${picked === c.key ? "on" : ""}`}>
              <input type="radio" name="tpl" checked={picked === c.key} onChange={() => void look(c.key)} />
              <span className="ct-choice-mark" aria-hidden="true" />
              <span className="ct-choice-text">
                <b dir="auto">{name(c)}{c.key === info.current.key && <> <span className="sh-pill ct-pill quiet">{f.tplYours}</span></>}</b>
                {(ar ? c.note_ar || c.note : c.note) && <small dir="auto">{ar ? c.note_ar || c.note : c.note}</small>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {busy && !plan && <p className="ct-quiet" role="status">{f.tplLooking}</p>}
      {plan && (
        <section ref={planRef} className="ct-sec ct-plan" aria-live="polite">
          {plan.nothing ? <p className="ct-hint">{f.tplNothing}</p> : (
            <>
              {plan.turn_on.length > 0 && (
                <div><h3>{f.tplWillAdd}</h3><ul className="ct-plan-list">{plan.turn_on.map((x) => <li key={x.key}>{name(x)}</li>)}</ul></div>
              )}
              {plan.categories.length > 0 && (
                <div><h3>{f.tplCategories}</h3><p className="ct-hint">{words(plan.categories)}</p></div>
              )}
              {plan.fields.length > 0 && (
                <div><h3>{f.tplFields}</h3><p className="ct-hint">{plan.fields.map(label).join(ar ? "، " : ", ")}</p></div>
              )}
              {plan.fields_skipped.length > 0 && (
                <div><h3>{f.tplFieldsSkipped}</h3><p className="ct-hint">{plan.fields_skipped.map(label).join(ar ? "، " : ", ")}</p></div>
              )}
              {(plan.wording.section || plan.wording.layout) && (
                <div>
                  <h3>{f.tplWording}</h3>
                  {plan.wording.section && <p className="ct-hint">{f.tplSection(ar ? plan.wording.section.from.ar : plan.wording.section.from.en, ar ? plan.wording.section.to.ar : plan.wording.section.to.en)}</p>}
                  {plan.wording.layout && <p className="ct-hint">{f.tplLayout(layoutName(plan.wording.layout.from), layoutName(plan.wording.layout.to))}</p>}
                </div>
              )}
            </>
          )}
          {plan.stay_off.length > 0 && (
            <div><h3>{f.tplStayOff}</h3><p className="ct-hint">{words(plan.stay_off)}</p></div>
          )}
          {plan.stays_on.length > 0 && (
            <div><h3>{f.tplStaysOn}</h3><p className="ct-hint">{words(plan.stays_on)}</p></div>
          )}
          <p className="ct-hint ct-plan-safe"><Icon name="check" className="sh-ico" /> {f.tplSafe}</p>
        </section>
      )}
    </Sheet>
  );
}
