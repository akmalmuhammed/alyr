// The Why? side sheet: the exact change, the evidence by kind (You confirmed, In ALYR, Public),
// where it lands and who may approve, and what happens after Approve. A kind of evidence the API
// does not send yet (In ALYR: workstream C) is left out, and the count says so. The footer button
// names the exact change. A modal dialog: focus moves in, Tab stays in, Esc closes, focus returns.

import { useEffect, useRef, type KeyboardEvent } from "react";
import { personFor, type AskView, type Person } from "./adapter";
import { T, dayName, type D2Lang } from "./copy";
import { Ic } from "./icons";
import { Av, Avs, Hl, Kbd, Ltr, Say, day, dayTime } from "./parts";
import { OwnChart, OwnSource, ownPoint } from "./OwnRecords";
import { emptyBefore } from "./logic";
import type { OwnRecordsView } from "./ownLogic";

export function EvidenceSheet({ ask, lang, approvers, own = null, onClose, onApprove, onDecline, busy }: {
  ask: AskView;
  lang: D2Lang;
  approvers: Person[];
  /** ALYR's own records: the week, for an hours ask without its one weekday's bars. */
  own?: OwnRecordsView | null;
  onClose: () => void;
  onApprove: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  const t = T[lang];
  const { p } = ask;
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);

  const trap = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const jump = (id: string) => ref.current?.querySelector(`#${id}`)?.scrollIntoView({ block: "start" });

  const publicEv = p.evidence.filter((e) => e.where);
  // In ALYR: the one weekday's bars, or else the week of ALYR's own records for an hours ask.
  const week = !ask.firstParty && own && own.state !== "off" && p.field === "hours" ? own : null;
  const kinds = (ask.confirmed ? 1 : 0) + (ask.firstParty || week ? 1 : 0) + (publicEv.length ? 1 : 0);
  const names = approvers.map((a) => `${a.name}${t.roles[a.role] ? ` (${t.roles[a.role]})` : ""}`);
  const who = names.length > 1 ? `${names.slice(0, -1).join(t.listSep)}${t.or}${names[names.length - 1]}` : names[0] ?? "";
  const fp = ask.firstParty;

  return (
    <>
      <div className="d2-scrim" onClick={onClose} aria-hidden="true" />
      <div className="d2-sheet" role="dialog" aria-modal="true" aria-labelledby="d2-why-title" ref={ref} onKeyDown={trap}>
        <div className="d2-sheet-head">
          <span className="d2-crumb"><Say lang={lang}>{t.sheetCrumb(ask.index, ask.of)}</Say></span>
          <span className="d2-sheet-close"><Kbd>{t.esc}</Kbd><button ref={closeRef} className="d2-icon-btn" type="button" onClick={onClose} aria-label={t.close}><Ic name="x" /></button></span>
        </div>
        <h2 className="d2-sheet-title" id="d2-why-title">{ask.lead.pre}{ask.lead.hl}{ask.lead.post}</h2>
        <nav className="d2-segm" aria-label={t.sheetNav}>
          <button type="button" onClick={() => jump("d2-w-ev")}>{t.sheetEvidence}{kinds ? <bdi className="d2-n">{kinds}</bdi> : null}</button>
          <button type="button" onClick={() => jump("d2-w-where")}>{t.sheetWhere}</button>
          <button type="button" onClick={() => jump("d2-w-after")}>{t.sheetAfter}</button>
        </nav>
        <div className="d2-exact">
          <div className="d2-exact-lab">{t.exactLabel}</div>
          <div className="d2-exact-row">
            <span className="d2-strong">{ask.day ? t.exactDay(ask.day, ask.where) : t.exactField(p.field_label, ask.where)}</span>
            {emptyBefore(p) ? null : <><span className="d2-strike"><Ltr>{ask.before}</Ltr></span>
            <Ic name="arrow" size="sm" flip className="d2-to" /></>}
            <span className="d2-strong"><Hl draw={false}><Ltr>{ask.after}</Ltr></Hl></span>
          </div>
          {ask.day ? <p className="d2-small d2-muted">{t.onlyLine(ask.day)}</p> : null}
        </div>

        <section id="d2-w-ev">
          <h3>{t.kinds(kinds)}{publicEv.length && ask.confirmed ? <small>{t.onlyDisagrees(ask.where)}</small> : null}</h3>
          {ask.confirmed ? (
            <div className="d2-ev">
              <span className="d2-ev-ic"><Ic name="person" /></span>
              <div>
                <div className="d2-ev-k">{ask.confirmed.sample ? t.evSample : t.evYou}</div>
                <p>{ask.day ? <>{dayName(ask.day, lang)} <Ltr>{ask.confirmed.text}</Ltr></> : <Ltr>{ask.confirmed.text}</Ltr>}</p>
                {ask.confirmed.at && !ask.confirmed.sample ? (
                  <p className="d2-src">
                    {ask.confirmed.by ? <Av person={personFor(ask.confirmed.by, approvers)} size="sm" /> : null}
                    <Say lang={lang}>{ask.confirmed.by ? t.confirmedBy(ask.confirmed.by, dayTime(ask.confirmed.at, lang)) : t.confirmedWhen(dayTime(ask.confirmed.at, lang))}</Say>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {fp ? (
            <div className="d2-ev">
              <span className="d2-ev-ic d2-ev-alyr"><Av tone="alyr" /></span>
              <div>
                <div className="d2-ev-k">{t.evAlyr}</div>
                <p><Say lang={lang}>{t.firstPartyLine(fp.weeks.reduce((a, w) => a + w.orders, 0), fp.weeks.reduce((a, w) => a + w.bookings, 0), fp.weeks.length, fp.day)}</Say></p>
                <div className="d2-smx" style={{ ["--d2-cols" as string]: fp.weeks.length }}>
                  {fp.weeks.map((w) => (
                    <div className="d2-smx-day" key={w.date}>
                      <b>{day(w.date, lang)}</b>
                      {fp.listingSaidClosed ? <div className="d2-smx-g">{t.dayClosed(ask.where)}</div> : null}
                      <div className="d2-smx-dots" aria-hidden="true">
                        {Array.from({ length: w.orders }, (_, i) => <i key={`o${i}`} />)}
                        {Array.from({ length: w.bookings }, (_, i) => <i key={`b${i}`} className="d2-bk" />)}
                      </div>
                      <div className="d2-smx-n">{t.dayCounts(w.orders, w.bookings)}</div>
                    </div>
                  ))}
                </div>
                {fp.countedAt ? <p className="d2-src">{t.countedFrom(dayTime(fp.countedAt, lang))}</p> : null}
              </div>
            </div>
          ) : week ? (
            <div className="d2-ev">
              <span className="d2-ev-ic d2-ev-alyr"><Av tone="alyr" /></span>
              <div>
                <div className="d2-ev-k">{t.evAlyr}</div>
                <p><Say lang={lang}>{ownPoint(week, lang)}</Say></p>
                <OwnChart view={week} lang={lang} compact />
                <p className="d2-src"><OwnSource view={week} lang={lang} /></p>
              </div>
            </div>
          ) : null}
          {publicEv.length ? (
            <div className="d2-ev">
              <span className="d2-ev-ic"><Ic name="globe" /></span>
              <div>
                <div className="d2-ev-k">{t.evPublic}</div>
                {publicEv.map((e, i) => <p key={`${e.label}-${i}`}><Say lang={lang}>{e.where}</Say>{": "}{e.sentence ? <Say lang={lang}>{e.sentence}</Say> : <>{e.label ? <Say lang={lang}>{`${e.label}: `}</Say> : null}<Ltr>{e.value}</Ltr></>}</p>)}
                {publicEv[0].seen_at ? <p className="d2-src"><Say lang={lang}>{`${t.readAt(publicEv[0].day_only ? day(publicEv[0].seen_at, lang) : dayTime(publicEv[0].seen_at, lang))}${ask.where === "google" ? ` · ${t.notStored}` : ""}`}</Say></p> : null}
              </div>
            </div>
          ) : null}
        </section>

        <section id="d2-w-where">
          <h3>{t.whereTitle}</h3>
          <dl className="d2-dl">
            <dt>{t.changesOn}</dt><dd><Say lang={lang}>{t.changesOnText(ask.where, ask.place)}</Say></dd>
            {who ? <><dt>{t.whoApproves}</dt><dd><Avs people={approvers} size="md" /><Say lang={lang}>{t.whoText(who)}</Say></dd></> : null}
            {p.expires_at ? <><dt>{t.expires}</dt><dd><Say lang={lang}>{t.expiresText(day(p.expires_at, lang))}</Say></dd></> : null}
            {ask.alsoFixes ? <><dt>{t.alsoFixes}</dt><dd><Say lang={lang}>{t.alsoFixesText(ask.alsoFixes.checks, ask.alsoFixes.from, ask.alsoFixes.to, ask.alsoFixes.of)}</Say></dd></> : null}
          </dl>
        </section>

        <section id="d2-w-after">
          <h3>{t.afterTitle}</h3>
          <ol className="d2-steps">
            {[t.step1(ask.where), t.step2, t.step3].map((s) => <li key={s.b}><span><b>{s.b}</b>{s.rest}</span></li>)}
          </ol>
        </section>

        {p.rule ? <p className="d2-rule"><Say lang={lang}>{t.byRule(p.rule)}</Say></p> : null}
        <div className="d2-t-actions d2-sheet-foot">
          <button className="d2-btn d2-btn-approve d2-cut-control" type="button" onClick={onApprove} disabled={!p.can.approve || busy}><span><Say lang={lang}>{t.approveExact(ask.exact)}</Say></span><Kbd>{t.keyA}</Kbd></button>
          <button className="d2-btn d2-btn-text" type="button" onClick={onDecline} disabled={!p.can.decline || busy}>{t.notNow}</button>
        </div>
      </div>
    </>
  );
}
