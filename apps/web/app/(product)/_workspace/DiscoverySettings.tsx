"use client";

// Discovery's Settings (ALY-324, spec 066 "Settings"; the owner and an admin only): who gets a
// change to approve on WhatsApp and how many a day, which team members manage which branch, the
// details each place's changes are made from (hours, phone, category, name, WhatsApp number, each
// confirmed by a person), and the weekly check-up. Every control saves when it is changed and says
// so; nothing here changes anything outside ALYR.

import Link from "next/link";
import { useState } from "react";
import { Field, Sheet, Switch } from "./CatalogUi";
import { FactForm } from "./DiscoveryFacts";
import { discovery, FACT_KEYS, type Fact, type FactKey, type Manager, type Place, type Settings, type TeamMember } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { formatDay, hoursText, placeName, sayError } from "./discoveryLogic";
import { Loading, Problem, useLoad } from "./discoveryUi";

type Push = (text: string, options?: { tone?: "ok" | "bad" | "warn"; undo?: () => void }) => number;

export function DiscoverySettings({ lang, push }: { lang: Lang; push: Push }) {
  const t = T[lang];
  const [settings, reload] = useLoad<Settings>(() => discovery.settings(lang), lang);
  const [places] = useLoad<Place[]>(() => discovery.places(), "places");
  const [team] = useLoad<TeamMember[]>(() => discovery.team().catch(() => []), "team");
  const [busy, setBusy] = useState(false);

  async function save(patch: { ask_cap_per_day?: number; weekly_run?: boolean; receivers?: string[] }) {
    setBusy(true);
    try {
      await discovery.setSettings(lang, patch);
      await reload(true);
      push(t.saved);
    } catch (e) {
      push(sayError(e, lang), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  const s = settings.data;
  if (settings.error && !s) return <Problem lang={lang} error={settings.error} onRetry={() => void reload()} />;
  if (!s) return <Loading lang={lang} />;
  const everyPlace = places.data ?? [];
  const staff = (team.data ?? []).filter((m) => m.role === "agent");

  return (
    <div className="dv-settings">
      <section className="dv-block dv-setsec" aria-labelledby="dv-set-msg">
        <h2 id="dv-set-msg">{t.messagesTitle}</h2>
        <p className="dv-setintro">{t.messagesIntro}</p>
        {s.receivers.length === 0 ? (
          <p className="dv-slot"><span className="dv-pending" aria-hidden="true" />{t.noReceivers}</p>
        ) : (
          <ul className="dv-list">
            {s.receivers.map((r) => (
              <li key={r.contact_id} className="dv-item dv-recv">
                <div className="dv-recv-who">
                  <b><bdi dir="auto">{r.name}</bdi></b>
                  {r.last4 && <span className="ct-quiet"><bdi dir="ltr">{t.last4(r.last4)}</bdi></span>}
                </div>
                {r.linked ? (
                  <div className="ct-switchrow">
                    <Switch on={r.receives} disabled={busy} label={`${t.receiverSwitch}: ${r.name}`}
                      onChange={(on) => void save({ receivers: s.receivers.filter((x) => (x.contact_id === r.contact_id ? on : x.receives)).map((x) => x.contact_id) })} />
                    <span>{t.receiverSwitch}</span>
                  </div>
                ) : (
                  <Link className="dv-link" href="/app/team">{t.linkFirst}</Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <Field label={t.dailyLimit} hint={t.dailyHint} className="dv-cap">
          <select value={s.ask_cap_per_day} disabled={busy} onChange={(e) => void save({ ask_cap_per_day: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        {!s.template_ready && <p className="dv-statusline" role="note">{t.templateNote}</p>}
      </section>

      <section className="dv-block dv-setsec" aria-labelledby="dv-set-mgr">
        <h2 id="dv-set-mgr">{t.managersTitle}</h2>
        <p className="dv-setintro">{t.managersIntro}</p>
        {staff.length === 0 ? (
          <p className="dv-slot"><span className="dv-pending" aria-hidden="true" />{t.noStaff} <Link className="dv-link" href="/app/team">{t.openTeam}</Link></p>
        ) : (
          everyPlace.map((place) => <Managers key={place.id} lang={lang} place={place} staff={staff} push={push} />)
        )}
      </section>

      <section className="dv-block dv-setsec" aria-labelledby="dv-set-facts">
        <h2 id="dv-set-facts">{t.detailsTitle}</h2>
        <p className="dv-setintro">{t.detailsIntro}</p>
        {everyPlace.map((place) => <PlaceFacts key={place.id} lang={lang} place={place} push={push} />)}
      </section>

      <section className="dv-block dv-setsec" aria-labelledby="dv-set-week">
        <h2 id="dv-set-week">{t.weeklyTitle}</h2>
        <div className="ct-switchrow dv-weekly">
          <Switch on={s.weekly_run} disabled={busy} label={t.weeklyLabel} onChange={(on) => void save({ weekly_run: on })} />
          <span>{t.weeklyLabel}</span>
        </div>
        <p className="dv-setintro">{t.weeklyHint}</p>
      </section>
    </div>
  );
}

// ── the managers of one branch ──────────────────────────

function Managers({ lang, place, staff, push }: { lang: Lang; place: Place; staff: TeamMember[]; push: Push }) {
  const t = T[lang];
  const [chosen, setChosen] = useState<string[]>(() => place.managers.map((m: Manager) => m.user_id));
  const [busy, setBusy] = useState(false);

  async function toggle(id: string, on: boolean) {
    const next = on ? [...chosen, id] : chosen.filter((x) => x !== id);
    setBusy(true);
    try {
      const saved = await discovery.setManagers(lang, place.id, next);
      setChosen(saved.map((m) => m.user_id));
      push(t.saved);
    } catch (e) {
      push(sayError(e, lang), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="dv-mgr" disabled={busy}>
      <legend><bdi dir="auto">{t.managersFor(placeName(place, lang))}</bdi></legend>
      {staff.map((m) => (
        <label key={m.id} className="dv-closed">
          <input type="checkbox" checked={chosen.includes(m.id)} onChange={(e) => void toggle(m.id, e.target.checked)} />
          <span><bdi dir="auto">{m.name}</bdi></span>
        </label>
      ))}
    </fieldset>
  );
}

// ── the confirmed details of one place ──────────────────

function PlaceFacts({ lang, place, push }: { lang: Lang; place: Place; push: Push }) {
  const t = T[lang];
  const [facts, reload] = useLoad<Fact[]>(() => discovery.facts(lang, place.id), `${lang}|${place.id}`);
  const [editing, setEditing] = useState<FactKey | null>(null);
  const byKey = (key: FactKey) => (facts.data ?? []).find((f) => f.key === key) ?? null;

  const valueOf = (key: FactKey, fact: Fact): string => {
    if (key === "hours") return hoursText(fact.value, lang);
    const v = key === "phone" || key === "whatsapp" ? fact.value.phone : fact.value[key];
    return typeof v === "string" ? v : "";
  };
  const sourceOf = (fact: Fact): string => {
    if (fact.default) return t.factDefault;
    if (fact.source === "sample") return t.factSample;
    const date = formatDay(fact.confirmed_at, lang);
    return fact.confirmed_by_name ? t.confirmedBy(fact.confirmed_by_name, date) : date ? t.confirmedOnly(date) : "";
  };

  return (
    <div className="dv-pfacts">
      <h3><bdi dir="auto">{placeName(place, lang)}</bdi></h3>
      {facts.error && !facts.data ? <Problem lang={lang} error={facts.error} onRetry={() => void reload()} /> : !facts.data ? <Loading lang={lang} /> : (
        <ul className="dv-list">
          {FACT_KEYS.map((key) => {
            const fact = byKey(key);
            return (
              <li key={key} className="dv-item dv-fact">
                <div className="dv-fact-main">
                  <span className="dv-fact-label">{t.factNames[key]}</span>
                  {fact ? (
                    <>
                      <span className="dv-fact-value"><bdi dir={key === "phone" || key === "whatsapp" ? "ltr" : "auto"}>{valueOf(key, fact)}</bdi></span>
                      <span className="dv-ev-where">{sourceOf(fact)}</span>
                    </>
                  ) : <span className="dv-fact-none">{t.notConfirmed}</span>}
                </div>
                <button type="button" className="btn ct-btn" onClick={() => setEditing(key)}>{t.edit}</button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <Sheet title={t.confirmTitles[editing]} subtitle={placeName(place, lang)} onClose={() => setEditing(null)} closeLabel={t.close}>
          <FactForm lang={lang} factKey={editing} locationId={place.id} initial={byKey(editing)?.value ?? null} submitLabel={t.saveFactPlain}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); push(t.saved); void reload(true); }} />
        </Sheet>
      )}
    </div>
  );
}
