// "N changes since last week": every change of the last 7 days as one white card, who decided it,
// the before and after, whether the next check saw it, and Undo while the API allows it (saying
// exactly what Undo puts back). A change the owner made outside ALYR has no Undo here. Under it
// the status line: when ALYR checked, how many checks match, how many were not measured.

import type { Person, ReceiptRow } from "./adapter";
import { personFor } from "./adapter";
import { T, type D2Lang } from "./copy";
import { allMatch, joinNames, stageOf, type Tally } from "./logic";
import { Ic, TickDraw } from "./icons";
import { Av, Ltr, day, dayTime } from "./parts";

export function ReceiptsList({ lang, rows, people, tally, checkedAt, checksHref, onUndo, busyId }: {
  lang: D2Lang;
  rows: ReceiptRow[];
  people: Person[];
  tally: Tally | null;
  checkedAt: string | null;
  checksHref: string;
  onUndo: (row: Extract<ReceiptRow, { kind: "change" }>) => void;
  busyId: string | null;
}) {
  const t = T[lang];
  const changes = rows.filter((r): r is Extract<ReceiptRow, { kind: "change" }> => r.kind === "change");
  const matched = rows.length > 0 && allMatch(changes.map((r) => r.p)) && rows.every((r) => r.kind === "change" || r.f.status === "verified");
  const deciders = [...new Set(changes.map((r) => r.p.decided?.by ?? "").filter(Boolean))];
  const whoPeople: Person[] = deciders.map((name) => personFor(name, people));
  return (
    <section className="d2-since" aria-labelledby="d2-since-title">
      <div className="d2-since-head">
        <h2 className="d2-section" id="d2-since-title">{matched ? <TickDraw /> : null}{t.since(rows.length)}{matched ? ` ${t.allMatch}` : ""}</h2>
        {whoPeople.length ? (
          <span className="d2-who-sum">
            <span className="d2-avs">{whoPeople.map((p) => <Av key={p.name} person={p} tip={p.name} />)}<Av tone="alyr" tip={t.sentByAlyr} /></span>
            {joinNames([...whoPeople.map((p) => p.name), "ALYR"], lang, "and")}
          </span>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="d2-changes">
          {rows.map((r) => {
            if (r.kind === "you") {
              return (
                <li key={r.f.id}>
                  <span className="d2-when">{day(r.when, lang)}</span>
                  <div>
                    <div className="d2-what">{r.f.title}</div>
                    <div className="d2-who">
                      <span className="d2-actor"><Av tone="you" />{t.doneByYou}</span>
                      <span className={`d2-pill${r.f.status === "verified" ? " d2-pill-ok" : ""}`}>{r.f.status === "verified" ? <><Ic name="check" size="xs" />{t.matchesNow}</> : t.pendingCheck}</span>
                    </div>
                  </div>
                  <div className="d2-act"><span className="d2-na">{t.madeOutside}</span></div>
                </li>
              );
            }
            const p = r.p;
            const stage = stageOf(p);
            const by = p.decided?.by ?? "";
            const pill = stage === "live" ? <span className="d2-pill d2-pill-ok"><Ic name="check" size="xs" />{t.matchesNow}</span>
              : stage === "notLive" ? <span className="d2-pill d2-pill-warn">{t.notMatching}</span>
              : stage === "undone" ? <span className="d2-pill">{t.undoneBy(p.undone?.by ?? by)}</span>
              : <span className="d2-pill">{t.pendingCheck}</span>;
            return (
              <li key={p.id}>
                <span className="d2-when">{day(r.when, lang)}</span>
                <div>
                  <div className="d2-what">{t.exactField(r.what, r.where)}</div>
                  <div className="d2-pair">
                    {p.before.removed ? <span className="d2-chip d2-chip-from d2-chip-removed" data-tip={t.removedTip}>{r.before}</span> : <span className="d2-chip d2-chip-from"><Ltr>{r.before}</Ltr></span>}
                    <Ic name="arrow" size="xs" flip className="d2-to" />
                    <span className="d2-chip d2-chip-to"><Ltr>{r.after}</Ltr></span>
                  </div>
                  <div className="d2-who">
                    {by ? <span className="d2-actor"><Av person={personFor(by, people)} />{t.approvedSent(by)}</span> : null}
                    {pill}
                  </div>
                </div>
                <div className="d2-act">
                  {p.can.undo && p.undo_until ? (
                    <>
                      <button className="d2-undo" type="button" onClick={() => onUndo(r)} disabled={busyId !== null} data-tip={t.undoTip(r.before, r.where)}><Ic name="undo" size="xs" flip />{t.undo}</button>
                      <small>{t.untilDate(day(p.undo_until, lang))}</small>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="d2-statusline">
        {checkedAt ? <span>{t.checkedAt(dayTime(checkedAt, lang))}</span> : null}
        {tally ? <><span className="d2-sep" aria-hidden="true">·</span><span>{t.matchLine(tally.matched, tally.measured)}</span></> : null}
        {tally && tally.notMeasured ? <><span className="d2-sep" aria-hidden="true">·</span><span>{t.notMeasuredLine(tally.notMeasured)}</span></> : null}
        {tally ? <><span className="d2-sep" aria-hidden="true">·</span><a className="d2-link" href={checksHref}>{t.seeAll(tally.total)}</a></> : null}
      </p>
    </section>
  );
}
