"use client";

// Set up, Discovery v2 (workstream U2): "What kind of business is this?". The six families of
// check packs (`GET /api/discovery/packs`) as cards, each with a live miniature of the kind of
// page that business runs, and its trades as toggles with how many checks each brings. Choosing a
// card is Carbon (not the final decision); the one Volt button, "Check now", sits in a sticky
// Carbon bar: it saves the choice (`PUT /api/discovery/pack`) and starts a check-up. Under the cards,
// "What ALYR already has", from the facts and the connected source. Owner and admin only: for
// any other role the page is read-only (no bar, cards not pressable).

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Mark } from "../shellParts";
import type { Pack } from "./api2";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { ScreenFrame, Val } from "./frame";
import { FamilyMiniature } from "./FamilyMiniature";
import { Ic } from "./icons";
import { Kbd, Say } from "./parts";
import { checksFor, families, type KnownFact } from "./screens";

export type SetupStage = "idle" | "saving" | "queued" | "running" | "done";
export type Choice = { family: string | null; trade: string | null };

export function Setup({ lang, packs, choice, onChoose, canManage, known, stage, error, onCheckNow, tabs, google, noSource = false, connectHref = null }: {
  lang: D2Lang;
  packs: Pack[];
  choice: Choice;
  onChoose: (choice: Choice) => void;
  canManage: boolean;
  known: KnownFact[];
  stage: SetupStage;
  error: string;
  onCheckNow: () => void;
  tabs?: ReactNode;
  /** The Google Maps link of each place (`GoogleMapsLink`), when the live read is on. */
  google?: ReactNode;
  /** Discovery is on and no source is connected: said plainly, with the one next step. */
  noSource?: boolean;
  connectHref?: string | null;
}) {
  const t = T2[lang];
  const fams = families(packs);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = fams.find((f) => f.id === choice.family) ?? null;
  const trade = selected?.trades.find((tr) => tr.key === choice.trade) ?? null;
  const busy = stage !== "idle" && stage !== "done";
  const count = selected ? checksFor(packs, selected.id, trade?.key ?? null) : 0;
  const focusIndex = Math.max(0, fams.findIndex((f) => f.id === choice.family));

  // Enter starts the check when nothing else has focus (the prototype's shortcut).
  useEffect(() => {
    if (!canManage) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || !selected || busy) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      e.preventDefault();
      onCheckNow();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canManage, selected, busy, onCheckNow]);

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = lang === "ar";
    const next = { ArrowDown: 1, ArrowRight: rtl ? -1 : 1, ArrowUp: -1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    if (!next) return;
    e.preventDefault();
    const to = (index + next + fams.length) % fams.length;
    refs.current[to]?.focus();
    if (canManage) onChoose({ family: fams[to].id, trade: null });
  };

  const foot = canManage ? (
    <div className="d2s-actionbar-wrap">
      <div className="d2s-actionbar d2-on-carbon" role="region" aria-label={t.barAria}>
        <span className="d2s-ch-mk" aria-hidden="true"><Mark /></span>
        <div className="d2s-ab-sum">
          <b><Say lang={lang}>{selected ? t.barTitle(t.kindLine(selected.title, trade?.title ?? null), t.checksCount(count)) : t.barPick}</Say></b>
          <div className="d2s-ab-as">{t.promises.map((p) => <span key={p}><Ic name="check" size="xs" />{p}</span>)}</div>
          {error ? <p className="d2s-ab-err" role="alert">{error}</p> : null}
        </div>
        {selected ? (
          <button className="d2-btn d2-btn-approve d2s-ab-go" type="button" onClick={onCheckNow} disabled={busy} aria-keyshortcuts="Enter">
            <span>{busy ? t.running : t.checkNow}</span><Kbd>{t.checkNowKey}</Kbd>
          </button>
        ) : (
          <button className="d2-btn d2-btn-line" type="button" disabled>{t.checkNow}</button>
        )}
        <span className="d2s-ab-prog" aria-hidden="true"><i data-stage={stage} /></span>
        <span className="d2-sr" aria-live="polite">{busy ? t.running : ""}</span>
      </div>
    </div>
  ) : null;

  return (
    <ScreenFrame lang={lang} foot={foot} wide>
      {tabs}
      <ol className="d2s-psteps" aria-label={t.setupSteps}>
        <li className={stage === "idle" ? "d2s-now" : "d2s-done"} aria-current={stage === "idle" ? "step" : undefined}>
          <span className="d2s-pnode">{stage === "idle" ? "1" : <Ic name="check" size="xs" />}</span><b>{t.stepKind}</b><small>{t.stepKindSub}</small>
        </li>
        <li className={stage === "idle" ? undefined : stage === "done" ? "d2s-done" : "d2s-now"} aria-current={stage !== "idle" && stage !== "done" ? "step" : undefined}>
          <span className="d2s-pnode">{stage === "done" ? <Ic name="check" size="xs" /> : "2"}</span><b>{t.stepFirst}</b><small>{t.stepFirstSub}</small>
        </li>
      </ol>
      <section className="d2-brief d2s-setup-brief">
        <h1 className="d2-display">{t.setupTitle}</h1>
        <p className="d2-sub">{canManage ? t.setupSub : t.setupReadOnly}</p>
      </section>
      {noSource ? (
        <div className="d2s-nosource" role="note">
          <span className="d2s-caution-ic"><Ic name="alert" size="sm" /></span>
          <div><b>{t.noSourceTitle}</b><p>{t.noSourceBody}</p></div>
          {connectHref ? <a className="d2-btn d2-btn-line d2-btn-sm" href={connectHref}>{t.noSourceAction}</a> : null}
        </div>
      ) : null}

      <div className="d2s-families" role="radiogroup" aria-label={t.familyGroup} aria-readonly={!canManage || undefined}>
        {fams.map((f, i) => {
          const on = f.id === choice.family;
          return (
            <div key={f.id} className={`d2s-fam${on ? " d2s-fam-on" : ""}${canManage ? "" : " d2s-fam-ro"}`}>
              <span className="d2s-badge" aria-hidden="true"><Ic name="check" size="xs" /></span>
              <button
                ref={(el) => { refs.current[i] = el; }}
                className="d2s-fam-pick" type="button" role="radio" aria-checked={on}
                tabIndex={i === focusIndex ? 0 : -1}
                aria-disabled={!canManage || undefined}
                onClick={() => { if (canManage && !busy) onChoose({ family: f.id, trade: on ? choice.trade : null }); }}
                onKeyDown={(e) => move(e, i)}
              >
                <span className="d2s-stage" aria-hidden="true"><FamilyMiniature id={f.id} lang={lang} /></span>
                <span className="d2s-fam-title">{f.title}</span>
                <span className="d2s-fam-n"><Say lang={lang}>{t.checksCount(checksFor(packs, f.id, null))}</Say></span>
                {t.familyBlurb[f.id] ? <span className="d2s-fam-p">{t.familyBlurb[f.id]}</span> : null}
              </button>
              {f.trades.length ? (
                <div className="d2s-trades" role="group" aria-label={`${t.tradeGroup}: ${f.title}`}>
                  {f.trades.map((tr) => {
                    const n = checksFor(packs, f.id, tr.key);
                    // A trade's count is drawn only where it differs from its family's (QA: every pill said 17).
                    const own = n !== checksFor(packs, f.id, null);
                    const pressed = on && choice.trade === tr.key;
                    return (
                      <button key={tr.key} className="d2s-pill" type="button" aria-pressed={pressed} disabled={!canManage || busy}
                        data-tip={t.tradeTip(n, tr.title)}
                        onClick={() => onChoose({ family: f.id, trade: pressed ? null : tr.key })}>
                        {tr.title}{own ? <bdi className="d2s-n">{n.toLocaleString("en")}</bdi> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="d2-small d2-muted d2s-gap">{t.drawingsNote}</p>
      {google}

      <section className="d2s-known d2s-card" aria-labelledby="d2s-known-title">
        <header>
          <div>
            <h2 id="d2s-known-title">{t.knownTitle}</h2>
            <p>{t.knownSub}</p>
          </div>
          {known.length ? <span className="d2s-srcsum"><Say lang={lang}>{t.knownSum(known.length, new Set(known.map((k) => k.prov)).size)}</Say></span> : null}
        </header>
        {known.length ? (
          <ul className="d2s-facts">
            {known.map((k) => (
              <li key={k.key}>
                <span className="d2s-lab">{k.label}<span className={`d2s-prov${k.prov === "alyr" ? " d2s-prov-alyr" : ""}`}>
                  {k.prov === "you" ? <span className="d2s-pi"><Ic name="person" size="xs" /></span> : k.prov === "alyr" ? <span className="d2s-pi d2s-pi-alyr"><Mark /></span> : <span className="d2s-pi"><Ic name="globe" size="xs" /></span>}
                  {k.prov === "you" ? t.provYou : k.prov === "sample" ? t.provSample : k.prov === "alyr" ? t.provAlyr : t.provSource}
                </span></span>
                <span className="d2s-val">
                  {k.ltr ? <Val text={k.value} /> : k.value}
                  {k.sub ? <small lang={k.subLang}>{k.ltr ? <Val text={k.sub} /> : <bdi>{k.sub}</bdi>}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="d2-muted d2s-gap">{t.knownNone}</p>}
      </section>
    </ScreenFrame>
  );
}
