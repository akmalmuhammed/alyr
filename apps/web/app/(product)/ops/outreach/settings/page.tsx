"use client";

// Outreach settings (specs/065, ALY-311): the kill switch first, then the global daily cap, the
// default level, the honeytoken addresses and the booking link. Turning the switch either way
// asks on the page itself, with a reason that goes to the audit log; nothing uses window.confirm.

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { LEVEL, W } from "../copy";
import { useOverview } from "../Frame";
import { honeytokenList, settingsErrors, when, type SettingsForm } from "../outreachLogic";
import { Failed, Pill } from "../parts";
import type { KillSwitch, Level, Settings, SettingsChange } from "../types";

const S = W.settings;

function formOf(s: Settings): SettingsForm {
  return { global_daily_cap: String(s.global_daily_cap), default_level: s.default_level, honeytokens: s.honeytokens.join("\n"), booking_url: s.booking_url };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Settings>("/api/admin/outreach/settings");
    if (answer.ok) { setSettings(answer.data); setError(""); } else setError(answer.error || W.loadError);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{S.eyebrow}</span>
        <h1>{S.title}</h1>
        <p>{S.lead}</p>
      </header>
      {error && !settings && <Failed message={error} retry={load} />}
      {!settings && !error && <p className="sh-note">{W.loading}</p>}
      {settings && <>
        <Kill kill={settings.kill_switch} changed={(k) => setSettings({ ...settings, kill_switch: k })} />
        <Form key={settings.updated_at ?? ""} settings={settings} saved={setSettings} />
      </>}
    </>
  );
}

function Kill({ kill, changed }: { kill: KillSwitch; changed: (k: KillSwitch) => void }) {
  const { refresh } = useOverview();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const turningOn = !kill.on;
  // Stopping always says why; starting again also says why, so the audit log reads both ways.
  const missing = !reason.trim();

  async function flip() {
    setTried(true); setError("");
    if (missing) return;
    setBusy(true);
    const answer = await api<KillSwitch>("/api/admin/outreach/kill-switch", "POST", { on: turningOn, reason: reason.trim() });
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    changed(answer.data);
    setAsking(false); setReason(""); setTried(false);
    setSaid(turningOn ? S.stopped : S.started);
    refresh();
  }

  return (
    <section className={`or-kill-panel ${kill.on ? "on" : ""}`} aria-labelledby="kill-title">
      <div className="or-kill-head">
        <div>
          <span className="or-label">{S.kill}</span>
          <h2 id="kill-title">{kill.on ? S.killOnTitle : S.killOffTitle}</h2>
          <p>{kill.on ? S.killOnText(kill.by, when(kill.at), kill.reason) : S.killOffText}</p>
          {kill.on && kill.by === "gateway" && <p className="or-bad">{S.gatewayTripped}</p>}
        </div>
        <Pill tone={kill.on ? "bad" : "active"}>{kill.on ? W.overview.killOn : W.overview.killOff}</Pill>
      </div>
      {said && !asking && <p className="or-kill-said" role="status">{said}</p>}
      {!asking ? (
        <div className="or-actions">
          <button type="button" className={`btn ${kill.on ? "primary" : "danger"} or-kill-btn`} onClick={() => { setAsking(true); setSaid(""); }}>
            {kill.on ? S.start : S.stop}
          </button>
        </div>
      ) : (
        <div className="or-confirm" role="group" aria-labelledby="kill-ask">
          <h3 id="kill-ask">{turningOn ? S.stopConfirmTitle : S.startConfirmTitle}</h3>
          <label className="ops-field">
            <span>{S.reason}</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={tried && missing} aria-describedby={tried && missing ? "kill-reason-error" : undefined} />
            {tried && missing && <small className="or-field-error" id="kill-reason-error">{S.reasonNeeded}</small>}
          </label>
          {error && <p className="ops-error" role="alert">{error}</p>}
          <div className="or-actions">
            <button type="button" className={`btn ${turningOn ? "danger" : "primary"}`} onClick={flip} disabled={busy}>{turningOn ? S.stopYes : S.startYes}</button>
            <button type="button" className="btn ghost" onClick={() => { setAsking(false); setReason(""); setTried(false); setError(""); }} disabled={busy}>{S.cancel}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Form({ settings, saved }: { settings: Settings; saved: (s: Settings) => void }) {
  const [form, setForm] = useState<SettingsForm>(formOf(settings));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const errors = settingsErrors(form);
  const err = (k: keyof SettingsForm) => (tried && errors[k] ? <small className="or-field-error" id={`s-${k}`}>{errors[k]}</small> : null);
  const aria = (k: keyof SettingsForm) => ({ "aria-invalid": tried && !!errors[k], "aria-describedby": tried && errors[k] ? `s-${k}` : `h-${k}` });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true); setError(""); setSaid("");
    if (Object.keys(errors).length) return;
    setBusy(true);
    const change: SettingsChange = {
      global_daily_cap: Number(form.global_daily_cap), default_level: form.default_level,
      honeytokens: honeytokenList(form.honeytokens), booking_url: form.booking_url.trim(),
    };
    const answer = await api<Settings>("/api/admin/outreach/settings", "PUT", change);
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    setSaid(S.saved);
    saved(answer.data);
  }

  return (
    <form className="ops-form or-form" onSubmit={save} noValidate>
      <h2 className="ops-wide">{S.caps}</h2>
      <label className="ops-field">
        <span>{S.cap}</span>
        <input inputMode="numeric" value={form.global_daily_cap} onChange={(e) => setForm({ ...form, global_daily_cap: e.target.value })} {...aria("global_daily_cap")} />
        <small className="or-field-help" id="h-global_daily_cap">{S.capHelp}</small>
        {err("global_daily_cap")}
      </label>
      <label className="ops-field">
        <span>{S.level}</span>
        <select value={form.default_level} onChange={(e) => setForm({ ...form, default_level: Number(e.target.value) as Level })} aria-describedby="h-default_level">
          {[0, 1, 2, 3].map((l) => <option key={l} value={l}>{LEVEL[l]}</option>)}
        </select>
        <small className="or-field-help" id="h-default_level">{S.levelHelp}</small>
      </label>
      <label className="ops-field ops-wide">
        <span>{S.honeytokens}</span>
        <textarea rows={4} value={form.honeytokens} onChange={(e) => setForm({ ...form, honeytokens: e.target.value })} spellCheck={false} {...aria("honeytokens")} />
        <small className="or-field-help" id="h-honeytokens">{S.honeytokensHelp}</small>
        {err("honeytokens")}
      </label>
      <label className="ops-field ops-wide">
        <span>{S.booking}</span>
        <input type="url" inputMode="url" value={form.booking_url} placeholder={settings.booking_url_default || "https://"} onChange={(e) => setForm({ ...form, booking_url: e.target.value })} {...aria("booking_url")} />
        <small className="or-field-help" id="h-booking_url">{S.bookingHelp(settings.booking_url_default)}</small>
        {err("booking_url")}
      </label>
      {said && <p className="ops-ok" role="status">{said}</p>}
      {error && <p className="ops-error ops-wide" role="alert">{error}</p>}
      <div className="ops-wide or-actions">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? S.saving : S.save}</button>
        {settings.updated_at && <small className="or-dim">{S.updated(settings.updated_by, when(settings.updated_at))}</small>}
      </div>
    </form>
  );
}
