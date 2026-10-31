"use client";

// The services a shop's customers can book (ALY-259, D-140, spec 043), for an owner or admin:
// add one, change its names (English and Arabic), length, price, deposit and who does it, hide
// it from the booking page and show it again. Bookings already made keep what they were made
// with, so hiding or repricing a service never moves a customer's visit. The checks run here
// in the page's language (`bookingsServiceForm.ts`) and again in the API. Words in
// `bookingsCopy.ts`; money from `_customer/price.ts`.

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "../_customer/price";
import type { BookingsCopy, Lang } from "./bookingsCopy";
import {
  blankForm, checkForm, formFromService, type ServiceForm, type ServiceRow,
} from "./bookingsServiceForm";

export type Person = { id: string; name: string; name_ar: string; active: boolean };
export type Save = (url: string, method: string, body: unknown, done?: string) => Promise<string>;

function personName(p: { name: string; name_ar: string }, lang: Lang): string {
  return lang === "ar" && p.name_ar ? p.name_ar : p.name;
}

function serviceName(s: ServiceRow, lang: Lang): string {
  return lang === "ar" && s.name_ar ? s.name_ar : s.name;
}

/** The facts under a service's name: how long, what it costs, its deposit, what is booked. */
function facts(s: ServiceRow, t: BookingsCopy, lang: Lang): string[] {
  const deposit = s.deposit_kind === "none" ? ""
    : t.depositOf(s.deposit_kind === "percent"
      ? `${s.deposit_value}% (${formatPrice(s.deposit, lang)})`
      : formatPrice(s.deposit, lang));
  return [
    t.minutes(s.duration_minutes),
    s.price ? formatPrice(s.price, lang) : t.noPriceShown,
    deposit,
    s.upcoming ? t.bookedAhead(s.upcoming) : "",
  ].filter(Boolean);
}

export function BookingsServices({ t, lang, services, people, save }: {
  t: BookingsCopy; lang: Lang; services: ServiceRow[]; people: Person[]; save: Save;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const active = people.filter((p) => p.active);
  const noneShown = services.length > 0 && services.every((s) => !s.active);

  function giveBack(id: string) {
    // The form is gone: put the keyboard back on the button that opened it.
    setTimeout(() => document.getElementById(`bk-svc-edit-${id}`)?.focus(), 0);
  }

  async function toggle(s: ServiceRow) {
    if (s.active && s.upcoming > 0) { setHiding(s.id); return; }
    await save(`/api/services/${s.id}/active`, "POST", { active: !s.active }, s.active ? t.serviceHidden : t.serviceShown);
  }

  return (
    <section className="bk-part" aria-labelledby="bk-services">
      <h3 id="bk-services">{t.services}</h3>
      <p className="bk-quiet">{t.servicesHint}</p>
      {noneShown && <p className="bk-warn" role="status">{t.noneShown}</p>}

      {services.length === 0 ? (
        <p className="bk-empty">{t.noServices}</p>
      ) : (
        <ul className="bk-people bk-services">
          {services.map((s) => (
            <li key={s.id} className={`bk-person bk-service${s.active ? "" : " is-hidden"}`}>
              {editing === s.id ? (
                <ServiceFormView
                  t={t} lang={lang} idp={`bk-s-${s.id}`} title={t.editServiceTitle(serviceName(s, lang))}
                  submit={t.save} people={active} start={formFromService(s, active.map((p) => p.id))}
                  onSubmit={(body) => save(`/api/services/${s.id}`, "PATCH", body, t.serviceSaved)}
                  onClose={() => { setEditing(null); giveBack(s.id); }}
                />
              ) : (
                <>
                  <div className="bk-service-head">
                    <p className="bk-service-name">
                      <b><bdi>{serviceName(s, lang)}</bdi></b>
                      {!s.active && <span className="bk-tag">{t.hiddenTag}</span>}
                    </p>
                    <p className="bk-facts">
                      {facts(s, t, lang).map((f) => <span key={f}><bdi>{f}</bdi></span>)}
                    </p>
                  </div>
                  <div className="bk-acts">
                    <button type="button" id={`bk-svc-edit-${s.id}`} className="btn small"
                      aria-label={`${t.editService}: ${serviceName(s, lang)}`}
                      onClick={() => { setEditing(s.id); setAdding(false); setHiding(null); }}>{t.editService}</button>
                    <button type="button" className="btn small"
                      aria-label={`${s.active ? t.hide : t.showAgain}: ${serviceName(s, lang)}`}
                      onClick={() => void toggle(s)}>{s.active ? t.hide : t.showAgain}</button>
                  </div>
                  {hiding === s.id && (
                    <div className="bk-form inline" role="group" aria-label={t.hide}>
                      <p>{t.hideAsk(s.upcoming)}</p>
                      <div className="bk-acts">
                        <button type="button" className="btn primary"
                          onClick={async () => {
                            await save(`/api/services/${s.id}/active`, "POST", { active: false }, t.serviceHidden);
                            setHiding(null);
                          }}>{t.hideYes}</button>
                        <button type="button" className="btn ghost" onClick={() => setHiding(null)}>{t.hideNo}</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <ServiceFormView
          t={t} lang={lang} idp="bk-s-new" title={t.addServiceTitle} submit={t.addServiceSave}
          people={active} start={blankForm()}
          onSubmit={(body) => save("/api/services", "POST", body, t.serviceAdded)}
          onClose={() => { setAdding(false); setTimeout(() => document.getElementById("bk-svc-add")?.focus(), 0); }}
        />
      ) : (
        <div className="bk-acts">
          <button type="button" id="bk-svc-add" className="btn" onClick={() => { setAdding(true); setEditing(null); setHiding(null); }}>
            {t.addService}
          </button>
        </div>
      )}
    </section>
  );
}

function ServiceFormView({ t, lang, idp, title, submit, people, start, onSubmit, onClose }: {
  t: BookingsCopy; lang: Lang; idp: string; title: string; submit: string; people: Person[];
  start: ServiceForm; onSubmit: (body: Record<string, unknown>) => Promise<string>; onClose: () => void;
}) {
  const [form, setForm] = useState<ServiceForm>(start);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const set = (change: Partial<ServiceForm>) => setForm({ ...form, ...change });
  const hasPeople = people.length > 0;

  return (
    <form className="bk-form" noValidate aria-labelledby={`${idp}-title`} onSubmit={async (e) => {
      e.preventDefault();
      const checked = checkForm(form, hasPeople);
      if (checked.error) { setError(checked.error); return; }
      setBusy(true);
      const code = await onSubmit(checked.body);
      setBusy(false);
      if (code) { setError(code); return; }
      onClose();
    }}>
      <h4 id={`${idp}-title`}>{title}</h4>
      <div className="bk-grid start">
        <label className="bk-field" htmlFor={`${idp}-n`}><span>{t.nameEn}</span>
          <input id={`${idp}-n`} ref={first} value={form.name} maxLength={120} dir="auto" autoComplete="off"
            onChange={(e) => set({ name: e.target.value })} required aria-invalid={error === "bad_name"} /></label>
        <label className="bk-field" htmlFor={`${idp}-a`}><span>{t.nameAr}</span>
          <input id={`${idp}-a`} value={form.nameAr} maxLength={120} dir="rtl" lang="ar" autoComplete="off"
            onChange={(e) => set({ nameAr: e.target.value })} /></label>
        <label className="bk-field" htmlFor={`${idp}-m`}><span>{t.lengthMin}</span>
          <input id={`${idp}-m`} value={form.minutes} inputMode="numeric" dir="ltr" autoComplete="off"
            onChange={(e) => set({ minutes: e.target.value })} required aria-invalid={error === "bad_duration"} /></label>
        <label className="bk-field" htmlFor={`${idp}-p`}><span>{t.priceQar}</span>
          <input id={`${idp}-p`} value={form.price} inputMode="decimal" dir="ltr" autoComplete="off"
            onChange={(e) => set({ price: e.target.value })} aria-describedby={`${idp}-p-hint`}
            aria-invalid={error === "bad_price" || error === "deposit_needs_price"} />
          <small id={`${idp}-p-hint`}>{t.priceHint}</small></label>
        <label className="bk-field" htmlFor={`${idp}-k`}><span>{t.deposits}</span>
          <select id={`${idp}-k`} value={form.depositKind}
            onChange={(e) => set({ depositKind: e.target.value as ServiceForm["depositKind"], deposit: "" })}>
            {(["none", "fixed", "percent"] as const).map((k) => <option key={k} value={k}>{t.depositKind[k]}</option>)}
          </select></label>
        {form.depositKind !== "none" && (
          <label className="bk-field" htmlFor={`${idp}-d`}><span>{form.depositKind === "fixed" ? t.amountQar : t.percent}</span>
            <input id={`${idp}-d`} value={form.deposit} inputMode="decimal" dir="ltr" autoComplete="off"
              onChange={(e) => set({ deposit: e.target.value })} required aria-invalid={error === "bad_deposit"} /></label>
        )}
      </div>
      {hasPeople && (
        <fieldset className="bk-choices">
          <legend>{t.whoDoes}</legend>
          <label className="bk-check">
            <input type="radio" name={`${idp}-who`} checked={form.everyone} onChange={() => set({ everyone: true })} />
            <span>{t.everyone}</span>
          </label>
          <label className="bk-check">
            <input type="radio" name={`${idp}-who`} checked={!form.everyone} onChange={() => set({ everyone: false })} />
            <span>{t.onlyThese}</span>
          </label>
          {!form.everyone && (
            <div className="bk-doers">
              {people.map((p) => (
                <label key={p.id} className="bk-check">
                  <input type="checkbox" checked={form.chosen.includes(p.id)}
                    onChange={(e) => set({ chosen: e.target.checked ? [...form.chosen, p.id] : form.chosen.filter((id) => id !== p.id) })} />
                  <span><bdi>{personName(p, lang)}</bdi></span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      {error && <p className="bk-error" role="alert">{t.errors[error] ?? t.errors.generic}</p>}
      <div className="bk-acts">
        <button type="submit" className="btn primary" disabled={busy}>{submit}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t.close}</button>
      </div>
    </form>
  );
}
