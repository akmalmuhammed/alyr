"use client";

// Delivery and pickup (ALY-150 part 2, specs/014-pricing-pack): how a shop's customers get their
// order, in the Catalog beside Features and Discounts. Owners and admins only, and only while the
// shop has the feature on (the button is not drawn otherwise). Two switches (collect, deliver)
// with the rules said in words, one fee for the whole shop, and the zones: a list with a form to
// add or edit one, archive that asks first, and the archived ones in a fold to restore. No maps,
// no distances: the customer picks a zone from this list and writes the address. Money is typed
// in riyals with up to two decimals and sent as whole dirhams by exact digit moves, never a float.
// Phone first, English and Arabic; the API's own sentence is shown beside Save.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "../_customer/price";
import {
  api, nameOf, sayError,
  type DeliverySettingsBody, type DeliveryView, type DeliveryZone, type DeliveryZoneBody,
} from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Field, Fold, Icon, Sheet, Switch, type Toast } from "./CatalogUi";
import { DELIVERY, type DeliveryCopy } from "./deliveryCopy";
import { clock12, cutoffValue, daysLine, toggleDay } from "./deliveryForm";
import { dirhamsToRiyals, riyalsToDirhams } from "./pricingMoney";
import "./pricing.css";
import "./delivery.css";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;

const NO_ZONE: DeliveryZone | null = null;
type Mode = { kind: "list" } | { kind: "form"; zone: DeliveryZone | null };

/** The words under a zone's name: the fee, free over, the minimum, the days and the cut-off. */
export function zoneFacts(zone: DeliveryZone, lang: Lang, d: DeliveryCopy): string[] {
  const out: string[] = [zone.fee === 0 ? d.feeFree : d.fee(formatPrice(zone.fee, lang))];
  if (zone.free_over !== null) out.push(d.freeOver(formatPrice(zone.free_over, lang)));
  if (zone.min_order > 0) out.push(d.minimum(formatPrice(zone.min_order, lang)));
  const days = daysLine(zone.days, d.daysShort, d.daySep, "");
  const when = [days ? d.delivers(days) : d.everyDay, zone.cutoff ? d.cutoff(clock12(zone.cutoff, d.am, d.pm)) : ""].filter(Boolean);
  out.push(when.join(" · "));
  return out;
}

export function CatalogDelivery({ lang, push, onClose, onChanged }: {
  lang: Lang; push: Push; onClose: () => void; onChanged?: () => void;
}) {
  const d = DELIVERY[lang];
  const t = COPY[lang];
  const [view, setView] = useState<DeliveryView | null>(null);
  const [failure, setFailure] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [switching, setSwitching] = useState(false);
  const [switchFailure, setSwitchFailure] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [askFailure, setAskFailure] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // The shop-wide fee: typed, then saved with its own button. Filled once from the shop's settings.
  const [flat, setFlat] = useState<{ fee: string; free: string; min: string } | null>(null);
  const [flatErrors, setFlatErrors] = useState<Partial<Record<"fee" | "free" | "min", string>>>({});
  const [flatFailure, setFlatFailure] = useState("");
  const [flatBusy, setFlatBusy] = useState(false);
  const form = useRef<HTMLDivElement>(null);

  const fill = (v: DeliveryView) => setFlat({
    fee: dirhamsToRiyals(v.flat_fee), free: dirhamsToRiyals(v.flat_free_over), min: v.flat_min_order ? dirhamsToRiyals(v.flat_min_order) : "",
  });
  const load = useCallback(() => {
    api<DeliveryView>("/api/delivery")
      .then((v) => { setView(v); setFlat((was) => was ?? { fee: dirhamsToRiyals(v.flat_fee), free: dirhamsToRiyals(v.flat_free_over), min: v.flat_min_order ? dirhamsToRiyals(v.flat_min_order) : "" }); setFailure(""); })
      .catch((error) => setFailure(sayError(error, lang, t)));
  }, [lang, t]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function switchTo(key: "pickup" | "delivery", on: boolean) {
    setSwitching(true);
    setSwitchFailure("");
    try {
      const next = await api<DeliveryView>("/api/delivery", "PUT", { [key]: on } satisfies DeliverySettingsBody);
      setView(next);
      push(d.switchSaved);
      onChanged?.();
    } catch (error) {
      setSwitchFailure(sayError(error, lang, t));
    } finally {
      setSwitching(false);
    }
  }

  // A field being corrected stops being marked wrong; the rest are checked again at Save.
  function editFlat(patch: Partial<NonNullable<typeof flat>>, key: "fee" | "free" | "min") {
    if (!flat) return;
    setFlat({ ...flat, ...patch });
    const next = { ...flatErrors, [key]: undefined };
    setFlatErrors(next);
    if (flatFailure === d.fixFields && Object.values(next).every((v) => !v)) setFlatFailure("");
  }

  async function saveFlat() {
    if (!flat || !view) return;
    const errors: typeof flatErrors = {};
    let fee: number | null = null;
    let free: number | null = null;
    let min = 0;
    if (flat.fee.trim()) {
      const v = riyalsToDirhams(flat.fee);
      if (v === null) errors.fee = d.flatErr.fee; else fee = v;
    }
    if (flat.free.trim()) {
      const v = riyalsToDirhams(flat.free);
      if (v === null || v < 1) errors.free = d.flatErr.freeOver; else free = v;
    }
    if (flat.min.trim()) {
      const v = riyalsToDirhams(flat.min);
      if (v === null) errors.min = d.flatErr.min; else min = v;
    }
    setFlatErrors(errors);
    if (Object.keys(errors).length > 0) { setFlatFailure(d.fixFields); return; }
    setFlatBusy(true);
    setFlatFailure("");
    try {
      const next = await api<DeliveryView>("/api/delivery", "PUT", { flat_fee: fee, flat_free_over: free, flat_min_order: min } satisfies DeliverySettingsBody);
      setView(next);
      fill(next);
      push(d.flatSaved);
      onChanged?.();
    } catch (error) {
      setFlatFailure(sayError(error, lang, t));
    } finally {
      setFlatBusy(false);
    }
  }

  async function change(zone: DeliveryZone, action: "archive" | "restore") {
    setBusy(zone.id);
    setAskFailure("");
    setSwitchFailure("");
    try {
      await api<{ zone: DeliveryZone }>(`/api/delivery/zones/${zone.id}/${action}`, "POST");
      push(action === "archive" ? d.zoneArchived : d.zoneRestored);
      setAsking(null);
      load();
      onChanged?.();
    } catch (error) {
      // Archiving the only place you deliver to while delivery is on is refused, in the shop's words.
      const words = sayError(error, lang, t);
      if (action === "archive") setAskFailure(words); else setSwitchFailure(words);
    } finally {
      setBusy(null);
    }
  }

  if (mode.kind === "form") {
    return (
      <ZoneForm lang={lang} zone={mode.zone} push={push} onCancel={() => setMode({ kind: "list" })}
        onSaved={() => { setMode({ kind: "list" }); load(); onChanged?.(); }} />
    );
  }

  const zones = view?.zones ?? [];
  const canAdd = view ? zones.length < view.limits.zones : false;

  function row(zone: DeliveryZone) {
    const label = nameOf(zone, lang);
    const busyNow = busy === zone.id;
    const facts = zoneFacts(zone, lang, d);
    return (
      <li key={zone.id} className="ct-card-form dl-zone" data-zone={zone.id}>
        <div className="pr-head">
          <span className="ct-toggle-text"><b dir="auto">{label}</b></span>
          <span className="dl-fee num"><bdi>{zone.fee === 0 ? d.feeFree : formatPrice(zone.fee, lang)}</bdi></span>
        </div>
        <ul className="pr-meta">{facts.slice(1).map((line) => <li key={line} dir="auto">{line}</li>)}</ul>
        <div className="ct-row-btns pr-acts">
          <button type="button" className="btn small" aria-label={d.editNamed(label)} disabled={busyNow}
            onClick={() => setMode({ kind: "form", zone })}>{d.edit}</button>
          <button type="button" className="btn small ghost" aria-label={d.archiveNamed(label)} aria-expanded={asking === zone.id} disabled={busyNow}
            onClick={() => { setAsking(asking === zone.id ? null : zone.id); setAskFailure(""); }}><Icon name="trash" />{d.archive}</button>
        </div>
        {asking === zone.id && (
          <div className="sh-confirm" role="alertdialog" aria-label={d.archiveNamed(label)}>
            <span>{d.archiveAsk(label)}</span>
            {askFailure && <span className="ct-error" role="alert">{askFailure}</span>}
            <button type="button" className="btn small" data-autofocus onClick={() => setAsking(null)}>{d.archiveKeep}</button>
            <button type="button" className="btn small danger" disabled={busyNow} onClick={() => void change(zone, "archive")}>{d.archiveConfirm}</button>
          </div>
        )}
      </li>
    );
  }

  return (
    <Sheet title={d.title} onClose={onClose} closeLabel={d.close} wide
      footer={<button type="button" className="btn primary ct-btn ct-grow" onClick={onClose}>{d.done}</button>}>
      <div ref={form} className="pr-body dl-body">
        {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
        <p className="ct-hint pr-intro">{d.intro}</p>
        {!view && !failure && <p className="ct-quiet" role="status">{d.loading}</p>}
        {view && flat && (
          <>
            <fieldset className="dl-set">
              <legend>{d.waysLegend}</legend>
              <div className="ct-toggle">
                <span className="ct-toggle-text"><b>{d.pickup[0]}</b><small>{d.pickup[1]}</small></span>
                <Switch on={view.pickup} label={d.pickup[0]} disabled={switching} onChange={(v) => void switchTo("pickup", v)} />
              </div>
              <div className="ct-toggle">
                <span className="ct-toggle-text"><b>{d.delivery[0]}</b><small>{d.delivery[1]}</small></span>
                <Switch on={view.delivery} label={d.delivery[0]} disabled={switching} onChange={(v) => void switchTo("delivery", v)} />
              </div>
              <p className="ct-hint dl-guard">{d.guard}</p>
              {switchFailure && <p className="ct-alert" role="alert"><Icon name="warn" />{switchFailure}</p>}
            </fieldset>

            <section className="ct-card-form dl-flat" aria-labelledby="dl-flat-t">
              <h3 id="dl-flat-t" className="dl-h">{d.flatTitle}</h3>
              <p className="ct-hint">{d.flatHint}</p>
              <Field label={d.flatFee} hint={d.flatFeeHint} error={flatErrors.fee}>
                <input value={flat.fee} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => editFlat({ fee: e.target.value }, "fee")} />
              </Field>
              <Field label={d.flatFreeOver} hint={d.flatFreeOverHint} error={flatErrors.free}>
                <input value={flat.free} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => editFlat({ free: e.target.value }, "free")} />
              </Field>
              <Field label={d.flatMin} hint={d.flatMinHint} error={flatErrors.min}>
                <input value={flat.min} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => editFlat({ min: e.target.value }, "min")} />
              </Field>
              <div className="dl-save">
                {flatFailure && <p className="ct-alert" role="alert"><Icon name="warn" />{flatFailure}</p>}
                <button type="button" className="btn ct-btn" disabled={flatBusy} onClick={() => void saveFlat()}>{flatBusy ? d.flatSaving : d.flatSave}</button>
              </div>
            </section>

            <section className="dl-zones" aria-labelledby="dl-zones-t">
              <div className="dl-zones-head">
                <div>
                  <h3 id="dl-zones-t" className="dl-h">{d.zonesTitle}</h3>
                  <p className="ct-hint">{d.zonesHint}</p>
                </div>
              </div>
              <button type="button" className="btn primary ct-btn pr-add" disabled={!canAdd}
                onClick={() => setMode({ kind: "form", zone: NO_ZONE })}><Icon name="plus" />{d.addZone}</button>
              {!canAdd && <p className="ct-hint">{d.full(view.limits.zones)}</p>}
              {zones.length === 0 ? (
                <div className="pr-slot">
                  <b>{d.zonesEmpty}</b>
                  <span>{d.zonesEmptyText}</span>
                </div>
              ) : (
                <ul className="ct-stack">{zones.map(row)}</ul>
              )}
              {view.archived.length > 0 && (
                <Fold title={d.archived(view.archived.length)}>
                  <ul className="ct-stack">
                    {view.archived.map((zone) => {
                      const label = nameOf(zone, lang);
                      return (
                        <li key={zone.id} className="ct-card-form dl-zone over" data-zone={zone.id}>
                          <div className="pr-head">
                            <span className="ct-toggle-text"><b dir="auto">{label}</b></span>
                            <button type="button" className="btn small" aria-label={d.restoreNamed(label)} disabled={busy === zone.id}
                              onClick={() => void change(zone, "restore")}>{d.restore}</button>
                          </div>
                          <ul className="pr-meta">{zoneFacts(zone, lang, d).map((line) => <li key={line} dir="auto">{line}</li>)}</ul>
                        </li>
                      );
                    })}
                  </ul>
                </Fold>
              )}
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ── the zone form ───────────────────────────────────────

type Draft = { name: string; nameAr: string; fee: string; free: string; min: string; days: number[]; cutoff: string };
type Errors = Partial<Record<"name" | "fee" | "free" | "min" | "cutoff", string>>;

function draftOf(zone: DeliveryZone | null): Draft {
  if (!zone) return { name: "", nameAr: "", fee: "", free: "", min: "", days: [], cutoff: "" };
  return {
    name: zone.name, nameAr: zone.name_ar, fee: dirhamsToRiyals(zone.fee), free: dirhamsToRiyals(zone.free_over),
    min: zone.min_order ? dirhamsToRiyals(zone.min_order) : "", days: [...zone.days], cutoff: zone.cutoff ?? "",
  };
}

/** What the person typed, checked; and the body the API takes when it is fine. */
function checked(draft: Draft, d: DeliveryCopy): { errors: Errors; body: DeliveryZoneBody | null } {
  const errors: Errors = {};
  if (!draft.name.trim() && !draft.nameAr.trim()) errors.name = d.err.name;
  const fee = riyalsToDirhams(draft.fee);
  if (fee === null) errors.fee = d.err.fee;
  let free: number | null = null;
  if (draft.free.trim()) {
    const v = riyalsToDirhams(draft.free);
    if (v === null || v < 1) errors.free = d.err.freeOver; else free = v;
  }
  let min = 0;
  if (draft.min.trim()) {
    const v = riyalsToDirhams(draft.min);
    if (v === null) errors.min = d.err.min; else min = v;
  }
  if (draft.cutoff.trim() && cutoffValue(draft.cutoff) === null) errors.cutoff = d.err.cutoff;
  if (Object.keys(errors).length > 0 || fee === null) return { errors, body: null };
  return {
    errors,
    body: {
      name: draft.name.trim(), name_ar: draft.nameAr.trim(), fee, free_over: free, min_order: min,
      cutoff: cutoffValue(draft.cutoff), days: draft.days.length === 7 ? [] : draft.days,
    },
  };
}

function ZoneForm({ lang, zone, push, onCancel, onSaved }: {
  lang: Lang; zone: DeliveryZone | null; push: Push; onCancel: () => void; onSaved: () => void;
}) {
  const d = DELIVERY[lang];
  const t = COPY[lang];
  const [draft, setDraft] = useState<Draft>(() => draftOf(zone));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // A field that is being corrected stops being marked wrong; the rest are checked again at Save.
  const set = (patch: Partial<Draft>) => {
    setDraft((x) => ({ ...x, ...patch }));
    const fixed: Errors = {};
    if ("name" in patch || "nameAr" in patch) fixed.name = undefined;
    if ("fee" in patch) fixed.fee = undefined;
    if ("free" in patch) fixed.free = undefined;
    if ("min" in patch) fixed.min = undefined;
    if ("cutoff" in patch) fixed.cutoff = undefined;
    const next = { ...errors, ...fixed };
    setErrors(next);
    if (failure === d.fixFields && Object.values(next).every((v) => !v)) setFailure("");
  };

  async function save() {
    const { errors: found, body } = checked(draft, d);
    setErrors(found);
    if (!body) {
      setFailure(d.fixFields);
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      if (zone) await api(`/api/delivery/zones/${zone.id}`, "PUT", body);
      else await api("/api/delivery/zones", "POST", body);
      push(zone ? d.zoneSaved : d.zoneAdded);
      onSaved();
    } catch (error) {
      setFailure(sayError(error, lang, t));
      setBusy(false);
    }
  }

  return (
    <Sheet title={zone ? d.editTitle : d.newTitle} onClose={onCancel} closeLabel={d.close} wide
      footer={(
        <div className="pr-foot">
          {failure && <p className="ct-alert pr-foot-alert" role="alert"><Icon name="warn" />{failure}</p>}
          <div className="pr-foot-btns">
            <button type="button" className="btn ct-btn" onClick={onCancel}>{d.cancel}</button>
            <button type="submit" form="dl-form" className="btn primary ct-btn ct-grow" disabled={busy}>{busy ? d.saving : d.save}</button>
          </div>
        </div>
      )}>
      <form id="dl-form" ref={form} className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="ct-grid2 names">
          <Field label={d.name} error={errors.name}>
            <input value={draft.name} dir="auto" maxLength={60} autoComplete="off" autoFocus={!zone} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={d.nameAr}>
            <input value={draft.nameAr} dir="rtl" lang="ar" maxLength={60} autoComplete="off" onChange={(e) => set({ nameAr: e.target.value })} />
          </Field>
        </div>
        <p className="ct-hint pr-tight">{d.nameHint}</p>

        <Field label={d.zoneFee} hint={d.zoneFeeHint} error={errors.fee}>
          <input value={draft.fee} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ fee: e.target.value })} />
        </Field>
        <Field label={d.zoneFreeOver} hint={d.zoneFreeOverHint} error={errors.free}>
          <input value={draft.free} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ free: e.target.value })} />
        </Field>
        <Field label={d.zoneMin} hint={d.zoneMinHint} error={errors.min}>
          <input value={draft.min} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ min: e.target.value })} />
        </Field>

        <fieldset className="dl-days">
          <legend>{d.daysLegend}</legend>
          <div className="dl-daylist">
            {d.daysFull.map((name, day) => (
              <label key={day} className="dl-day">
                <input type="checkbox" checked={draft.days.includes(day)} onChange={() => set({ days: toggleDay(draft.days, day) })} />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <p className="ct-hint">{d.daysHint}</p>
        </fieldset>

        <Field label={d.cutoffLabel} hint={d.cutoffHint} error={errors.cutoff}>
          <input type="time" value={draft.cutoff} dir="ltr" onChange={(e) => set({ cutoff: e.target.value })} />
        </Field>
      </form>
    </Sheet>
  );
}
