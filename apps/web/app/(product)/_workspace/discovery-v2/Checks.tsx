"use client";

// Checks, Discovery v2 (workstream U2): "N of M checks match", the filters with their counts, and
// every check grouped as Core, Your own data and the business's family pack, differences first.
// Each row is the check with its state in words and the evidence the API kept, every piece
// opening a hover card (where it came from, when it was read). "Not measured" is never a match or
// a difference and is left out of the count, and the page says so. "Check again" starts a check-up
// (the existing endpoint) and shows it running in a Carbon card over a still skeleton.

import { useState, type ReactNode } from "react";
import type { Run } from "../discoveryApi";
import { stepKind } from "../discoveryLogic";
import { Mark } from "../shellParts";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { EvidenceChip, Filters, ScreenFrame, SkeletonGroups, StatePill } from "./frame";
import { Ic } from "./icons";
import { Ltr, dayTime } from "./parts";
import { bidiValue, filterRows, type CheckFilter, type CheckGroup, type CheckRowView, type ChecksView } from "./screens";

export type ChecksHrefs = { week: string; setup: string | null; connections: string | null; task: (findingId: string) => string };

export function Checks({ lang, view, tabs, foot, hrefs, nextCheckAt, run, onCheckAgain, busy, error, initialFilter = "all", openFirstCard = false }: {
  lang: D2Lang;
  view: ChecksView;
  tabs: ReactNode;
  foot?: ReactNode;
  hrefs: ChecksHrefs;
  /** TODO(D): when the weekly check runs next (api-gaps.md #4). Not drawn when absent. */
  nextCheckAt: string | null;
  /** A check-up started from this page and not finished yet. */
  run: Run | null;
  onCheckAgain: () => void;
  busy: boolean;
  error: string;
  initialFilter?: CheckFilter;
  /** For the preview: the first evidence chip's hover card shown open. */
  openFirstCard?: boolean;
}) {
  const t = T2[lang];
  const [filter, setFilter] = useState<CheckFilter>(initialFilter);
  const kindWords = t.kindOf(view.tradeTitle ?? view.familyTitle ?? "");
  const openKey = openFirstCard ? view.groups.flatMap((g) => filterRows(g.rows, filter)).find((r) => r.evidence.length)?.key ?? null : null;

  return (
    <ScreenFrame lang={lang} foot={foot}>
      {tabs}
      <section className="d2-brief">
        {view.tally ? (
          <>
            <h1 className="d2-display">{t.checksTitle(view.tally.matched, view.tally.measured)}</h1>
            <p className="d2-sub">
              {t.differSub(view.tally.measured - view.tally.matched)}{" "}
              {view.checkedAt ? t.checkedFor(dayTime(view.checkedAt, lang), kindWords) : null}
              {hrefs.setup ? <> <a className="d2-link" href={hrefs.setup}>{t.changeKind}</a></> : null}
            </p>
          </>
        ) : (
          <>
            <h1 className="d2-display">{t.checksNone}</h1>
            <p className="d2-sub">{t.checksNoneBody}</p>
          </>
        )}
      </section>

      <div className="d2s-toolbar">
        {view.tally ? (
          <Filters label={t.filtersLabel} value={filter} onChange={setFilter}
            items={(["all", "differ", "ok", "nm"] as const).map((key) => ({ key, label: t.filters[key], count: view.counts[key] }))} />
        ) : <span />}
        <div className="d2s-toolbar-end">
          {nextCheckAt ? <span>{t.nextCheck(dayTime(nextCheckAt, lang))}</span> : null}
          <button className="d2-btn d2-btn-line d2-btn-sm" type="button" onClick={onCheckAgain} disabled={busy || !!run} data-tip={t.checkAgainTip}>
            <Ic name="refresh" size="sm" />{t.checkAgain}
          </button>
        </div>
      </div>
      {error ? <p className="d2s-error" role="alert">{error}</p> : null}

      {run ? (
        <>
          <CheckingCard lang={lang} run={run} />
          <SkeletonGroups />
        </>
      ) : (
        view.groups.map((g) => {
          const rows = filterRows(g.rows, filter);
          if (!rows.length) return null;
          return <Group key={g.id} lang={lang} group={g} rows={rows} hrefs={hrefs} measured={view.tally?.measured ?? 0} openKey={openKey} />;
        })
      )}

      {view.tally && !run ? <p className="d2-rule">{t.ruleLine}</p> : null}
    </ScreenFrame>
  );
}

function Group({ lang, group, rows, hrefs, measured, openKey }: { lang: D2Lang; group: CheckGroup; rows: CheckRowView[]; hrefs: ChecksHrefs; measured: number; openKey: string | null }) {
  const t = T2[lang];
  const nm = rows.filter((r) => r.kind === "nm").length;
  const titleId = `d2s-g-${group.id}`;
  return (
    <section className="d2s-group" aria-labelledby={titleId}>
      <header className="d2s-group-head">
        <h2 id={titleId}>{group.title}</h2>
        <p>{t.groupSub[group.id]} · <span className="d2-tnum">{t.groupTally(group.matched, group.differ)}</span></p>
      </header>
      <ul className="d2s-card d2s-list d2s-checks">
        {rows.map((r) => <Row key={r.key} lang={lang} row={r} hrefs={hrefs} openCard={r.key === openKey} />)}
      </ul>
      {nm > 0 ? (
        <div className="d2s-nm-note">
          <p>{t.nmNote(nm, measured)}<small>{t.nmWhy}</small></p>
          {hrefs.connections ? <a className="d2-btn d2-btn-line d2-btn-sm" href={hrefs.connections}>{t.seeConnections}</a> : null}
        </div>
      ) : null}
    </section>
  );
}

function Row({ lang, row, hrefs, openCard }: { lang: D2Lang; row: CheckRowView; hrefs: ChecksHrefs; openCard: boolean }) {
  const t = T2[lang];
  const label = row.place ? t.atPlace(row.label, row.place) : row.label;
  const sentence = row.kind === "differ" && row.finding
    ? <><b>{bidiValue(row.finding.title).text}</b>{row.place ? <> <span className="d2-muted">· {row.place}</span></> : null}</>
    : label;
  const tone = row.kind === "ok" ? "ok" : row.kind === "differ" ? "warn" : "nm";
  return (
    <li data-kind={row.kind}>
      <span className={`d2s-cmark d2s-cmark-${row.kind}`} aria-hidden="true">{row.kind === "ok" ? <Ic name="check" size="xs" /> : null}</span>
      <div className="d2s-row-main">
        <p className="d2s-s">{sentence}</p>
        {row.evidence.length ? (
          <div className="d2s-evs">{row.evidence.map((ev, i) => <EvidenceChip key={`${ev.label}-${i}`} ev={ev} lang={lang} open={openCard && i === 0} />)}</div>
        ) : null}
      </div>
      <span className="d2s-side">
        <StatePill tone={tone}>{t.state[row.kind]}</StatePill>
        {row.kind === "differ" && row.askWaiting ? <a className="d2-btn d2-btn-line d2-btn-sm" href={hrefs.week}>{t.seeAsk}</a>
          : row.kind === "differ" && row.finding && row.finding.kind === "owner" ? <a className="d2-btn d2-btn-line d2-btn-sm" href={hrefs.task(row.finding.id)}>{t.openTask}</a> : null}
      </span>
    </li>
  );
}

/** The Carbon "Checking now" card: the run's logged steps as they finish, and a bar that moves
 * only between the run's real states (queued, running, done). */
export function CheckingCard({ lang, run }: { lang: D2Lang; run: Run }) {
  const t = T2[lang];
  const steps = run.steps.filter((s) => s.ok);
  const names = [...new Set(steps.map((s) => {
    const k = stepKind(s.tool);
    return k.kind === "other" ? t.stepNames[k.word ?? "other"] : t.stepNames[k.kind];
  }))];
  const fill = run.status === "queued" ? 1 : run.status === "running" ? 2 : 3;
  return (
    <section className="d2s-checking d2-on-carbon d2-cut" aria-live="polite">
      <div className="d2s-ch-top"><span className="d2s-ch-mk" aria-hidden="true"><Mark /></span><b>{t.checkingTitle}</b>{run.status === "queued" ? <small>{t.checkingQueued}</small> : null}</div>
      <span className="d2s-ch-bar" aria-hidden="true"><i data-fill={fill} /></span>
      {names.length ? <ul>{names.map((name) => <li key={name}><span className="d2s-ch-d"><Ic name="check" size="xs" /></span><Ltr>{name}</Ltr></li>)}</ul> : null}
      <p>{t.checkingBody}</p>
    </section>
  );
}
