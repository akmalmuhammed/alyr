"use client";

// Discovery for one business, recorded by ALYR staff (D-169): the places, the recorded source, what a
// remote audit saw at each place on a day, and the check-up. Only ALYR staff reach it (the API checks
// every call), and it opens exactly one business: the one in the address, `?business=<id>`, reached
// from the client's business row. English, like the rest of the console. Every word is in
// `discoveryOpsCopy.ts`, every rule about what may be typed in `discoveryOpsLogic.ts` and again in
// the API; this file draws and calls.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { T } from "./discoveryOpsCopy";
import { DAYS, PLATFORMS, bodyOf, dayText, daysBetween, emptyForm, formFrom, isOld, reviewTally, type HoursForm, type Mode, type ObservationForm, type SavedObservation, type Tri } from "./discoveryOpsLogic";
import "./discoveryOps.css";

type History = { id: string; observed_on: string; recorded_at: string; recorded_by: string; recorded: string[] };
type Place = {
  id: string; name: string; name_ar: string; area: string; website_url: string | null; whatsapp_e164: string | null; is_primary: boolean;
  observation: (SavedObservation & { recorded_by: string }) | null; history: History[];
};
type Run = { id: string; status: string; score: number | null; finished_at: string | null; error: string | null } | null;
type View = { business: { id: string; name: string }; demo: boolean; source: string | null; places: Place[]; last_run: Run; stale_after_days: number };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });

export function OpsDiscovery({ businessId }: { businessId: string }) {
  const base = `/api/admin/businesses/${businessId}/discovery`;
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);

  const load = useCallback(async () => {
    const answer = await api<View>(base);
    if (answer.ok) { setView(answer.data); setError(""); setOff(false); } else if (answer.status === 409) { setOff(true); setError(""); } else setError(answer.error || T.failed);
  }, [base]);

  async function switchOn() {
    setBusy(true); setError("");
    const answer = await api(`/api/admin/businesses/${businessId}/modules/discovery`, "POST", { enabled: true });
    setBusy(false);
    if (!answer.ok) return setError(answer.error || T.failed);
    setMessage(T.switchedOn);
    await load();
  }

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function call(path: string, method: string, body: unknown, done: string) {
    setBusy(true); setMessage(""); setError("");
    const answer = await api<View>(`${base}${path}`, method, body);
    setBusy(false);
    if (!answer.ok) return setError(answer.error || T.failed);
    setMessage(done);
    await load();
  }

  if (off) {
    return (
      <div className="ops-dsc">
        <p>{T.off}</p>
        {error && <p className="ops-error" role="alert">{error}</p>}
        <p className="ops-actions"><button type="button" className="btn volt" disabled={busy} onClick={() => void switchOn()}>{T.switchOn}</button></p>
      </div>
    );
  }
  if (!view) return <p role="status">{error || T.loading}</p>;
  const hasPlaces = view.places.length > 0;
  const recorded = view.places.some((p) => p.observation);
  const manualOn = view.source === "manual";

  return (
    <div className="ops-dsc">
      <header className="sh-head">
        <Link className="ops-link" href="/ops/clients">{T.back}</Link>
        <span className="sh-eyebrow">{T.title}</span>
        <h1>{view.business.name}</h1>
        <p>{T.intro}</p>
      </header>

      <div role="status" aria-live="polite">
        {message && <p className="ops-ok">{message}</p>}
        {error && <p className="ops-error" role="alert">{error}</p>}
      </div>

      <section className="ops-dsc-card" aria-labelledby="dsc-source">
        <h2 id="dsc-source">{T.source}</h2>
        <p>
          <span className={`sh-pill ${manualOn ? "active" : "idle"}`}>{manualOn ? T.sourceOn : view.source ? T.sourceOther : T.sourceOff}</span>
        </p>
        <p className="ops-dsc-quiet">{view.demo ? T.demo : T.notDemo}</p>
        <p className="ops-actions">
          {manualOn
            ? <button type="button" className="btn small ghost" disabled={busy} onClick={() => void call("/source", "PUT", { on: false }, T.turnedOff)}>{T.turnOff}</button>
            : <button type="button" className={`btn ${recorded ? "" : "volt"}`} disabled={busy} onClick={() => void call("/source", "PUT", { on: true }, T.turnedOn)}>{T.turnOn}</button>}
        </p>
        <h3>{T.lastRun}</h3>
        {view.last_run
          ? <p>{T.runStatus(view.last_run.status)}{view.last_run.score !== null ? ` · ${T.score(view.last_run.score)}` : ""}{view.last_run.error ? ` · ${view.last_run.error}` : ""}</p>
          : <p className="ops-dsc-quiet">{T.noRun}</p>}
        <p className="ops-actions">
          <button type="button" className={`btn ${manualOn && recorded ? "volt" : ""}`} disabled={busy || !manualOn || !recorded} onClick={() => void call("/run", "POST", undefined, T.runStarted)}>{T.run}</button>
        </p>
        <p className="ops-dsc-quiet">{manualOn && recorded ? T.runHelp : T.nothingToRun}</p>
      </section>

      <PlacesEditor key={view.places.map((p) => p.id).join()} places={view.places} busy={busy} onSave={(items) => void call("/places", "PUT", { items }, T.placesSaved)} />

      {hasPlaces && view.places.map((p) => (
        <ObservationBlock key={p.id} place={p} base={base} staleAfter={view.stale_after_days} onSaved={() => { setMessage(T.recorded); void load(); }} />
      ))}
    </div>
  );
}

// ── places ──────────────────────────────────────────────

type Draft = { id?: string; name: string; name_ar: string; area: string; website_url: string; whatsapp_e164: string; is_primary: boolean };

function PlacesEditor({ places, busy, onSave }: { places: Place[]; busy: boolean; onSave: (items: Draft[]) => void }) {
  const [rows, setRows] = useState<Draft[]>(() => places.length
    ? places.map((p) => ({ id: p.id, name: p.name, name_ar: p.name_ar, area: p.area, website_url: p.website_url ?? "", whatsapp_e164: p.whatsapp_e164 ?? "", is_primary: p.is_primary }))
    : [{ name: "", name_ar: "", area: "", website_url: "", whatsapp_e164: "", is_primary: true }]);
  const set = (i: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const primary = (i: number) => setRows((rs) => rs.map((r, n) => ({ ...r, is_primary: n === i })));
  return (
    <section className="ops-dsc-card" aria-labelledby="dsc-places">
      <h2 id="dsc-places">{T.places}</h2>
      <p className="ops-dsc-quiet">{T.placesHelp}</p>
      <form className="ops-dsc-form" onSubmit={(e) => { e.preventDefault(); onSave(rows.filter((r) => r.name.trim())); }}>
        {rows.map((r, i) => (
          <fieldset key={r.id ?? `new-${i}`} className="ops-dsc-set">
            <legend>{r.name || `${T.placeName} ${i + 1}`}</legend>
            <div className="ops-dsc-grid">
              <label className="ops-field"><span>{T.placeName}</span><input value={r.name} onChange={(e) => set(i, { name: e.target.value })} required maxLength={160} /></label>
              <label className="ops-field"><span>{T.placeNameAr}</span><input value={r.name_ar} onChange={(e) => set(i, { name_ar: e.target.value })} dir="rtl" maxLength={160} /></label>
              <label className="ops-field"><span>{T.placeArea}</span><input value={r.area} onChange={(e) => set(i, { area: e.target.value })} maxLength={120} /></label>
              <label className="ops-field"><span>{T.placeSite}</span><input value={r.website_url} onChange={(e) => set(i, { website_url: e.target.value })} dir="ltr" inputMode="url" placeholder={T.urlPlaceholder} maxLength={300} /></label>
              <label className="ops-field"><span>{T.placeWhatsapp}</span><input value={r.whatsapp_e164} onChange={(e) => set(i, { whatsapp_e164: e.target.value })} dir="ltr" inputMode="tel" maxLength={20} /></label>
            </div>
            <div className="ops-actions">
              <label className="ops-check"><input type="radio" name="dsc-primary" checked={r.is_primary} onChange={() => primary(i)} />{T.placePrimary}</label>
              {rows.length > 1 && <button type="button" className="btn small ghost" onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}>{T.removePlace}</button>}
            </div>
          </fieldset>
        ))}
        <div className="ops-actions">
          <button type="button" className="btn small ghost" onClick={() => setRows((rs) => [...rs, { name: "", name_ar: "", area: "", website_url: "", whatsapp_e164: "", is_primary: false }])}>{T.addPlace}</button>
          <button type="submit" className="btn primary" disabled={busy}>{T.savePlaces}</button>
        </div>
      </form>
    </section>
  );
}

// ── what was seen at one place ─────────────────────────

function Tri3({ id, label, value, onChange }: { id: string; label: string; value: Tri; onChange: (v: Tri) => void }) {
  return (
    <label className="ops-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as Tri)}>
        <option value="">{T.notChecked}</option><option value="yes">{T.yes}</option><option value="no">{T.no}</option>
      </select>
    </label>
  );
}

function ModeSelect({ id, label, value, none, onChange }: { id: string; label: string; value: Mode; none: string; onChange: (v: Mode) => void }) {
  return (
    <label className="ops-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as Mode)}>
        <option value="unchecked">{T.notChecked}</option><option value="none">{none}</option><option value="set">{T.set}</option>
      </select>
    </label>
  );
}

function Hours({ id, label, value, none, onChange }: { id: string; label: string; value: HoursForm; none: string; onChange: (v: HoursForm) => void }) {
  return (
    <div className="ops-dsc-hours">
      <ModeSelect id={id} label={label} value={value.mode} none={none} onChange={(mode) => onChange({ ...value, mode })} />
      {value.mode === "set" && (
        <ul className="ops-dsc-days">
          {DAYS.map((d) => {
            const day = value.days[d];
            const set = (patch: Partial<typeof day>) => onChange({ ...value, days: { ...value.days, [d]: { ...day, ...patch } } });
            return (
              <li key={d}>
                <span>{T.days[d]}</span>
                <label className="ops-check"><input type="checkbox" checked={day.closed} onChange={(e) => set({ closed: e.target.checked })} />{T.closed}</label>
                {!day.closed && (
                  <>
                    <label className="ops-field"><span>{T.open}</span><input type="time" value={day.open} onChange={(e) => set({ open: e.target.value })} dir="ltr" /></label>
                    <label className="ops-field"><span>{T.close}</span><input type="time" value={day.close} onChange={(e) => set({ close: e.target.value })} dir="ltr" /></label>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ObservationBlock({ place, base, staleAfter, onSaved }: { place: Place; base: string; staleAfter: number; onSaved: () => void }) {
  const [form, setForm] = useState<ObservationForm>(() => formFrom(place.observation, today()));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = (name: string) => `dsc-${place.id}-${name}`;
  const l = form.listing;
  const w = form.website;
  const patchListing = (patch: Partial<typeof l>) => setForm((f) => ({ ...f, listing: { ...f.listing, ...patch } }));
  const patchSite = (patch: Partial<typeof w>) => setForm((f) => ({ ...f, website: { ...f.website, ...patch } }));
  const tally = form.reviews.checked ? reviewTally(form.reviews.text, form.observedOn) : null;
  const last = place.observation;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const body = bodyOf(form);
    if (!body.ok) return setError(body.error);
    setBusy(true);
    const answer = await api(`${base}/places/${place.id}/observations`, "POST", body.body);
    setBusy(false);
    if (!answer.ok) return setError(answer.error || T.failed);
    onSaved();
  }

  return (
    <section className="ops-dsc-card" aria-labelledby={id("h")}>
      <h2 id={id("h")}>{T.recordFor(place.name)}</h2>
      {last
        ? <p>{T.last(dayText(last.observed_on), last.recorded_by)}{isOld(last.observed_on, today(), staleAfter) ? ` · ${T.old(daysBetween(last.observed_on, today()))}` : ""}</p>
        : <p className="ops-dsc-quiet">{T.untouched}</p>}
      <p className="ops-dsc-quiet">{T.startsFrom}</p>
      <form className="ops-dsc-form" onSubmit={submit}>
        <div className="ops-dsc-grid">
          <label className="ops-field"><span>{T.observedOn}</span><input type="date" value={form.observedOn} max={today()} required onChange={(e) => setForm({ ...form, observedOn: e.target.value })} dir="ltr" /></label>
          <label className="ops-field ops-dsc-wide"><span>{T.where}</span><input value={form.where} placeholder={T.wherePlaceholder} maxLength={300} onChange={(e) => setForm({ ...form, where: e.target.value })} /></label>
        </div>

        <fieldset className="ops-dsc-set">
          <legend>{T.listing}</legend>
          <label className="ops-field" htmlFor={id("state")}>
            <span>{T.listingState}</span>
            <select id={id("state")} value={l.state} onChange={(e) => patchListing({ state: e.target.value as typeof l.state })}>
              <option value="unchecked">{T.notChecked}</option><option value="found">{T.found}</option><option value="missing">{T.missing}</option>
            </select>
          </label>
          {l.state === "found" && (
            <>
              <div className="ops-dsc-grid">
                <Tri3 id={id("claimed")} label={T.claimed} value={l.claimed} onChange={(claimed) => patchListing({ claimed })} />
                <label className="ops-field"><span>{T.name}</span><input value={l.name} onChange={(e) => patchListing({ name: e.target.value })} /></label>
                <label className="ops-field"><span>{T.phone}</span><input value={l.phone} onChange={(e) => patchListing({ phone: e.target.value })} dir="ltr" inputMode="tel" /></label>
                <label className="ops-field"><span>{T.address}</span><input value={l.address} onChange={(e) => patchListing({ address: e.target.value })} /></label>
                <label className="ops-field"><span>{T.url}</span><input value={l.url} onChange={(e) => patchListing({ url: e.target.value })} dir="ltr" inputMode="url" /></label>
                <label className="ops-field"><span>{T.photos}</span><input value={l.photos} onChange={(e) => patchListing({ photos: e.target.value })} inputMode="numeric" dir="ltr" /></label>
                <label className="ops-field"><span>{T.rating}</span><input value={l.rating} onChange={(e) => patchListing({ rating: e.target.value })} inputMode="decimal" dir="ltr" /></label>
                <label className="ops-field"><span>{T.reviewCount}</span><input value={l.reviewCount} onChange={(e) => patchListing({ reviewCount: e.target.value })} inputMode="numeric" dir="ltr" /></label>
              </div>
              <Hours id={id("hours")} label={T.hours} value={l.hours} none={T.noneShown} onChange={(hours) => patchListing({ hours })} />
              <ModeSelect id={id("cats")} label={T.categories} value={l.categoriesMode} none={T.noneSet} onChange={(categoriesMode) => patchListing({ categoriesMode })} />
              {l.categoriesMode === "set" && <label className="ops-field"><span>{T.categories}</span><input value={l.categories} onChange={(e) => patchListing({ categories: e.target.value })} /></label>}
            </>
          )}
        </fieldset>

        <fieldset className="ops-dsc-set">
          <legend>{T.website}</legend>
          <label className="ops-check"><input type="checkbox" checked={w.checked} onChange={(e) => patchSite({ checked: e.target.checked })} />{T.websiteChecked}</label>
          {w.checked && (
            <>
              <div className="ops-dsc-grid">
                <label className="ops-field"><span>{T.siteUrl}</span><input value={w.url} onChange={(e) => patchSite({ url: e.target.value })} dir="ltr" inputMode="url" /></label>
                <Tri3 id={id("reach")} label={T.reachable} value={w.reachable} onChange={(reachable) => patchSite({ reachable })} />
                <Tri3 id={id("lists")} label={T.lists} value={w.lists} onChange={(lists) => patchSite({ lists })} />
                <Tri3 id={id("page")} label={T.page} value={w.page} onChange={(page) => patchSite({ page })} />
                <label className="ops-field"><span>{T.phone}</span><input value={w.phone} onChange={(e) => patchSite({ phone: e.target.value })} dir="ltr" inputMode="tel" /></label>
              </div>
              <ModeSelect id={id("wa")} label={T.whatsapp} value={w.whatsappMode} none={T.nonePage} onChange={(whatsappMode) => patchSite({ whatsappMode })} />
              {w.whatsappMode === "set" && <label className="ops-field"><span>{T.whatsapp}</span><input value={w.whatsapp} onChange={(e) => patchSite({ whatsapp: e.target.value })} dir="ltr" inputMode="url" /></label>}
              <Hours id={id("whours")} label={`${T.website}: ${T.hours}`} value={w.hours} none={T.noneShown} onChange={(hours) => patchSite({ hours })} />
            </>
          )}
        </fieldset>

        <fieldset className="ops-dsc-set">
          <legend>{T.reviews}</legend>
          <label className="ops-check"><input type="checkbox" checked={form.reviews.checked} onChange={(e) => setForm({ ...form, reviews: { ...form.reviews, checked: e.target.checked } })} />{T.reviewsChecked}</label>
          {form.reviews.checked && (
            <>
              <p className="ops-dsc-quiet" id={id("rhelp")}>{T.reviewsHelp}</p>
              <label className="ops-field">
                <span>{T.reviews}</span>
                <textarea rows={8} value={form.reviews.text} aria-describedby={id("rhelp")} placeholder={T.reviewsPlaceholder} dir="ltr" spellCheck={false} onChange={(e) => setForm({ ...form, reviews: { ...form.reviews, text: e.target.value } })} />
              </label>
              {tally && <p className="ops-dsc-quiet" role="status">{T.tally(tally.count, tally.replied, tally.low)}</p>}
            </>
          )}
        </fieldset>

        <fieldset className="ops-dsc-set">
          <legend>{T.social}</legend>
          <p className="ops-dsc-quiet">{T.socialHelp}</p>
          <div className="ops-dsc-grid">
            {PLATFORMS.map((p) => (
              <div key={p} className="ops-dsc-pair">
                <label className="ops-field"><span>{`${T.platforms[p]}: ${T.socialLink}`}</span><input value={form.social[p].link} dir="ltr" onChange={(e) => setForm({ ...form, social: { ...form.social, [p]: { ...form.social[p], link: e.target.value } } })} /></label>
                <Tri3 id={id(`s-${p}`)} label={`${T.platforms[p]}: ${T.linked}`} value={form.social[p].linked} onChange={(linked) => setForm({ ...form, social: { ...form.social, [p]: { ...form.social[p], linked } } })} />
              </div>
            ))}
          </div>
        </fieldset>

        {error && <p className="ops-error" role="alert">{error}</p>}
        <div className="ops-actions">
          <button type="submit" className="btn primary" disabled={busy}>{T.save}</button>
          <button type="button" className="btn small ghost" onClick={() => setForm(emptyForm(today()))}>{T.clear}</button>
        </div>
      </form>

      {place.history.length > 0 && (
        <>
          <h3>{T.history}</h3>
          <ul className="ops-history">
            {place.history.map((h) => <li key={h.id}>{T.historyRow(dayText(h.observed_on), h.recorded_by, h.recorded.join(", "))}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
