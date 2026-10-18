"use client";

// The shop's catalog settings (owners and admins): may agents edit items, the low-stock
// number, when the shop's day starts, and how long an unpaid payment-link order holds its
// stock. Each is saved with the button, and each was already in the API. Below them, the
// customer price groups (wholesale), which save as they are changed.

import { useEffect, useState } from "react";
import { api, sayError, toInt, type Settings } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
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
  const [soldOut, setSoldOut] = useState<"grey" | "hide">("grey");
  const [wholesale, setWholesale] = useState(false);
  const [number, setNumber] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Settings>("/api/items/settings").then((s) => {
      setSaved(s);
      setAgents(s.agents_edit_items);
      setLow(String(s.low_stock_at));
      setDay(s.day_starts);
      setHold(String(s.hold_minutes));
      setSoldOut(s.sold_out_display);
      setWholesale(s.wholesale_layout);
      setNumber(s.whatsapp_number ? `+${s.whatsapp_number}` : "");
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
        sold_out_display: soldOut, wholesale_layout: wholesale, whatsapp_number: number.trim(),
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
        <h3 className="ct-subhead">{t.pageTitle}</h3>
        <fieldset className="ct-radios" disabled={!saved}>
          <legend>{t.soldOutShown}</legend>
          {(["grey", "hide"] as const).map((key) => (
            <label key={key} className={`ct-radio ${soldOut === key ? "on" : ""}`}>
              <input type="radio" name="ct-soldout" checked={soldOut === key} onChange={() => setSoldOut(key)} />
              <span>{key === "grey" ? t.soldOutGrey : t.soldOutHide}</span>
            </label>
          ))}
          <p className="ct-hint">{t.soldOutHint}</p>
        </fieldset>
        <div className="ct-toggle">
          <span className="ct-toggle-text"><b>{t.wholesaleLayout}</b><small>{t.wholesaleLayoutHint}</small></span>
          <Switch on={wholesale} label={t.wholesaleLayout} onChange={setWholesale} disabled={!saved} />
        </div>
        <Field label={t.whatsappNumber} hint={t.whatsappHint}>
          <input value={number} inputMode="tel" dir="ltr" autoComplete="off" onChange={(e) => setNumber(e.target.value)} disabled={!saved} />
        </Field>
      </form>
      <CatalogGroups lang={lang} push={push} />
    </Sheet>
  );
}
