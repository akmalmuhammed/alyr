"use client";

// The shop's catalog settings (owners and admins): may agents edit items, the low-stock
// number, when the shop's day starts, and how long an unpaid payment-link order holds its
// stock. Each is saved with the button, and each was already in the API. Below them, the
// WhatsApp numbers the owner registers as staff, who may change the Catalog by message
// (those save at once, one number at a time), and customer price groups (wholesale),
// which save as they are changed.

import { useEffect, useState } from "react";
import { api, sayError, toInt, type Settings, type StaffNumber } from "./catalogApi";
import { COPY, type Copy, type Lang } from "./catalogCopy";
import { CatalogGroups } from "./CatalogGroups";
import { Field, Icon, Sheet, Switch, type Toast } from "./CatalogUi";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;

export function CatalogSettings({ lang, push, onClose }: { lang: Lang; push: Push; onClose: () => void }) {
  const t = COPY[lang];
  const [saved, setSaved] = useState<Settings | null>(null);
  const [agents, setAgents] = useState(false);
  const [low, setLow] = useState("");
  const [day, setDay] = useState("00:00");
  const [hold, setHold] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Settings>("/api/items/settings").then((s) => {
      setSaved(s);
      setAgents(s.agents_edit_items);
      setLow(String(s.low_stock_at));
      setDay(s.day_starts);
      setHold(String(s.hold_minutes));
    }).catch((error) => setFailure(sayError(error, lang, t)));
  }, [lang, t]);

  async function save() {
    const lowNumber = toInt(low);
    const holdNumber = toInt(hold);
    if (lowNumber === null || lowNumber < 0 || holdNumber === null || holdNumber < 5 || holdNumber > 1440) {
      setFailure(t.failed);
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      await api<Settings>("/api/items/settings", "PUT", {
        agents_edit_items: agents, low_stock_at: lowNumber, day_starts: day, hold_minutes: holdNumber,
      });
      push(t.settingsSaved);
      onClose();
    } catch (error) {
      setFailure(sayError(error, lang, t));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t.settingsTitle} onClose={onClose} closeLabel={t.close}
      footer={(
        <>
          <button type="button" className="btn ct-btn" onClick={onClose}>{t.cancel}</button>
          <button type="submit" form="ct-settings-form" className="btn primary ct-btn ct-grow" disabled={busy || !saved}>{busy ? t.saving : t.save}</button>
        </>
      )}>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <form id="ct-settings-form" className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="ct-toggle">
          <span className="ct-toggle-text"><b id="ct-agents">{t.agentsEdit}</b><small>{t.agentsEditHint}</small></span>
          <Switch on={agents} label={t.agentsEdit} onChange={setAgents} disabled={!saved} />
        </div>
        <Field label={t.lowStockAt} hint={t.lowStockHint}>
          <input value={low} inputMode="numeric" dir="ltr" onChange={(e) => setLow(e.target.value)} disabled={!saved} />
        </Field>
        <Field label={t.dayStarts} hint={t.dayStartsHint}>
          <input type="time" value={day} dir="ltr" onChange={(e) => setDay(e.target.value)} disabled={!saved} />
        </Field>
        <Field label={t.holdMinutes} hint={t.holdHint}>
          <input value={hold} inputMode="numeric" dir="ltr" onChange={(e) => setHold(e.target.value)} disabled={!saved} />
        </Field>
      </form>
      <StaffNumbers lang={lang} t={t} push={push} />
      <CatalogGroups lang={lang} push={push} />
    </Sheet>
  );
}

/** The numbers that may change the Catalog by WhatsApp. Each change is saved as it is made. */
function StaffNumbers({ lang, t, push }: { lang: Lang; t: Copy; push: Push }) {
  const [numbers, setNumbers] = useState<StaffNumber[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"en" | "ar">(lang);
  const [manager, setManager] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    api<{ numbers: StaffNumber[] }>("/api/staff-numbers")
      .then((answer) => setNumbers(answer.numbers))
      .catch((error) => { setNumbers([]); setFailure(sayError(error, lang, t)); });
  }, [lang, t]);

  async function add() {
    setBusy(true);
    setFailure("");
    try {
      const made = await api<StaffNumber>("/api/staff-numbers", "POST", { name: name.trim(), phone: phone.trim(), lang: language, manager });
      setNumbers((all) => [...(all ?? []).filter((n) => n.id !== made.id), made]);
      setName("");
      setPhone("");
      setManager(false);
      push(t.staffAdded);
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  async function setManagerOf(number: StaffNumber, next: boolean) {
    setFailure("");
    try {
      const changed = await api<StaffNumber>(`/api/staff-numbers/${number.id}`, "PUT", { manager: next });
      setNumbers((all) => (all ?? []).map((n) => (n.id === changed.id ? changed : n)));
    } catch (error) {
      setFailure(sayError(error, lang, t));
    }
  }

  async function remove(number: StaffNumber) {
    setFailure("");
    setAsking(null);
    try {
      await api(`/api/staff-numbers/${number.id}`, "DELETE");
      setNumbers((all) => (all ?? []).filter((n) => n.id !== number.id));
      push(t.staffRemoved);
    } catch (error) {
      setFailure(sayError(error, lang, t));
    }
  }

  return (
    <section className="ct-sec ct-staff" aria-labelledby="ct-staff-title">
      <h3 id="ct-staff-title">{t.staffTitle}</h3>
      <p className="ct-hint">{t.staffHint}</p>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {numbers !== null && numbers.length === 0 && <p className="ct-hint">{t.staffEmpty}</p>}
      <ul className="ct-stack">
        {(numbers ?? []).map((n) => (
          <li key={n.id} className="ct-card-form">
            <div className="ct-row-between">
              <b dir="auto">{n.name}</b>
              <span className="num" dir="ltr">+{n.phone}</span>
            </div>
            <div className="ct-toggle">
              <span className="ct-toggle-text"><b>{t.staffManager}</b><small>{t.staffManagerHint}</small></span>
              <Switch on={n.manager} label={`${t.staffManager}: ${n.name}`} onChange={(next) => void setManagerOf(n, next)} />
            </div>
            {asking === n.id ? (
              <div className="ct-stack">
                <p className="ct-hint" role="status">{t.staffRemoveAsk(n.name)}</p>
                <div className="ct-row-between">
                  <button type="button" className="btn small" onClick={() => setAsking(null)}>{t.cancel}</button>
                  <button type="button" className="btn small danger-line" onClick={() => void remove(n)}><Icon name="trash" />{t.staffRemove}</button>
                </div>
              </div>
            ) : (
              <div className="ct-row-between">
                <span className="ct-hint">{t.staffLangs[n.lang]}</span>
                <button type="button" className="btn small ghost" onClick={() => setAsking(n.id)}><Icon name="trash" />{t.staffRemove}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="ct-card-form" noValidate onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Field label={t.staffName}>
          <input value={name} dir="auto" maxLength={80} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.staffPhone} hint={t.staffPhoneHint}>
          <input value={phone} type="tel" inputMode="tel" dir="ltr" autoComplete="off" onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t.staffLang}>
          <select value={language} onChange={(e) => setLanguage(e.target.value === "ar" ? "ar" : "en")}>
            <option value="en">{t.staffLangs.en}</option>
            <option value="ar">{t.staffLangs.ar}</option>
          </select>
        </Field>
        <label className="ct-check"><input type="checkbox" checked={manager} onChange={(e) => setManager(e.target.checked)} />{t.staffManager}</label>
        <button type="submit" className="btn ct-btn" disabled={busy || !name.trim() || !phone.trim()}>
          <Icon name="plus" />{t.staffAdd}
        </button>
      </form>
    </section>
  );
}
