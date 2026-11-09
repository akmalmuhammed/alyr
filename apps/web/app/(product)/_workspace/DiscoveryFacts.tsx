"use client";

// Confirming a fact (ALY-324, spec 066 "Facts"): the real opening hours, phone number, category,
// name or WhatsApp number of one place. A change is only ever made from a fact a person confirmed,
// so this form is the first half of an approval. Hours are seven rows with an open time, a close
// time and a "Closed" box; the rest are one field. Every field has a visible label and its error in
// words beside it. It is checked here (24-hour times, close after open, a phone as `+` and 7 to 15
// digits) and again by the API, whose own words are shown if it refuses. Used in the finding's
// sheet, where saving makes the change appear at once, and in Settings, where a fact is edited.

import { useState } from "react";
import { Field, Icon } from "./CatalogUi";
import { DAYS, discovery, type Fact, type FactKey } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { factText, hoursDraft, hoursValue, sayError, textFact, type HoursDraft, type HoursErrors, type TextError } from "./discoveryLogic";

export function FactForm({ lang, factKey, locationId, initial, title, intro = true, volt = false, submitLabel, onSaved, onCancel }: {
  lang: Lang; factKey: FactKey; locationId: string; initial: Record<string, unknown> | null;
  /** A heading for the form, when the sheet around it does not have one. */
  title?: string; intro?: boolean;
  /** Whether saving is the main action of the view (the one Volt button). */
  volt?: boolean; submitLabel: string;
  onSaved: (fact: Fact) => void; onCancel?: () => void;
}) {
  const t = T[lang];
  const [hours, setHours] = useState<HoursDraft>(() => hoursDraft(initial));
  const [text, setText] = useState(() => (factKey === "hours" ? "" : factText(factKey, initial)));
  const [hourErrors, setHourErrors] = useState<HoursErrors>({});
  const [textError, setTextError] = useState<TextError | null>(null);
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setServerError("");
    let value: Record<string, unknown> | null;
    if (factKey === "hours") {
      const checked = hoursValue(hours);
      setHourErrors(checked.errors);
      value = checked.value;
    } else {
      const checked = textFact(factKey, text);
      setTextError(checked.error);
      value = checked.value;
    }
    if (value === null) return;
    setBusy(true);
    try {
      onSaved(await discovery.setFact(lang, { location_id: locationId, key: factKey, value }));
    } catch (e) {
      setServerError(sayError(e, lang));
      setBusy(false);
    }
  }

  const label = factKey === "phone" ? t.phoneLabel : factKey === "whatsapp" ? t.whatsappLabel : factKey === "category" ? t.categoryLabel : t.nameLabel;
  const tooLong = factKey === "category" ? 80 : 160;
  const wordsFor = (e: TextError | null) => (e === "long" ? t.factTooLong(tooLong) : e ? t.factErrors[e] : undefined);

  return (
    <form className="dv-factform" onSubmit={(e) => void submit(e)} noValidate>
      {title && <h3 className="dv-factform-h">{title}</h3>}
      {intro && <p className="ct-quiet dv-factform-intro">{t.factIntro}</p>}
      {serverError && <p className="ct-alert" role="alert"><Icon name="warn" />{serverError}</p>}

      {factKey === "hours" ? (
        <>
          <p className="ct-hint dv-hint">{t.timeHint}</p>
          <div className="dv-hrows">
            {DAYS.map((d) => {
              const row = hours[d];
              const err = hourErrors[d];
              const set = (patch: Partial<typeof row>) => setHours((all) => ({ ...all, [d]: { ...all[d], ...patch } }));
              return (
                <fieldset key={d} className="dv-hrow">
                  <legend className="dv-hday">{t.daysLong[d]}</legend>
                  <label className="dv-closed">
                    <input type="checkbox" checked={row.closed} onChange={(e) => set({ closed: e.target.checked })} />
                    <span>{t.closedDay}</span>
                  </label>
                  {!row.closed && (
                    <div className="dv-hrow-times">
                      <Field label={t.opens} error={err?.open ? t.factErrors[err.open] : undefined}>
                        <input type="text" inputMode="numeric" autoComplete="off" maxLength={5} dir="ltr" value={row.open} onChange={(e) => set({ open: e.target.value })} />
                      </Field>
                      <Field label={t.closes} error={err?.close ? t.factErrors[err.close] : undefined}>
                        <input type="text" inputMode="numeric" autoComplete="off" maxLength={5} dir="ltr" value={row.close} onChange={(e) => set({ close: e.target.value })} />
                      </Field>
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>
        </>
      ) : (
        <Field label={label} hint={factKey === "phone" || factKey === "whatsapp" ? t.phoneHint : undefined} error={wordsFor(textError)}>
          <input type={factKey === "phone" || factKey === "whatsapp" ? "tel" : "text"} autoComplete="off" value={text}
            dir={factKey === "phone" || factKey === "whatsapp" ? "ltr" : "auto"} onChange={(e) => setText(e.target.value)} />
        </Field>
      )}

      <div className="dv-actions">
        <button type="submit" className={`btn ${volt ? "volt" : "primary"} ct-btn`} disabled={busy}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn ghost ct-btn" disabled={busy} onClick={onCancel}>{t.cancel}</button>}
      </div>
    </form>
  );
}
