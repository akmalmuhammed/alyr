"use client";

// Checks, Discovery v2 (workstream U2): "N of M checks match", the filters with their counts, and
// every check grouped as Core, Your own data and the business's family pack, differences first.
// Each row is the check with its state in words and the evidence the API kept, every piece
// opening a hover card (where it came from, when it was read). "Not measured" is never a match or
// a difference and is left out of the count, and the page says so. "Check again" starts a check-up
// (the existing endpoint) and shows it running in a Carbon card over a still skeleton.

import { useState, type ReactNode } from "react";
import type { FirstPartyAnswer, FpSource, Run } from "../discoveryApi";
import { T3 } from "./copy3";
import { phoneText, windowTotals } from "./ownLogic";
import { stepKind } from "../discoveryLogic";
import { Mark } from "../shellParts";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { EvidenceChip, Filters, ScreenFrame, SkeletonGroups, StatePill, Val } from "./frame";
import { Ic } from "./icons";
import { Ltr, Say, dayTime } from "./parts";
import { bidiValue, filterRows, linesOf, sentenceList, type CheckFilter, type CheckGroup, type CheckLine, type CheckRowView, type ChecksView } from "./screens";

export type ChecksHrefs = { week: string; setup: string | null; connections: string | null; task: (findingId: string) => string };

export function Checks({ lang, view, tabs, foot, hrefs, nextCheckAt, run, onCheckAgain, busy, error, initialFilter = "all", openFirstCard = false, own = null }: {
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
  /** ALYR's own records (`GET /first-party`): the facts the "Your own data" group is checked with. */
  own?: FirstPartyAnswer | null;
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
            <h1 className="d2-display"><Say lang={lang}>{t.checksTitle(view.tally.matched, view.tally.measured)}</Say></h1>
            <p className="d2-sub">
              <Say lang={lang}>{t.differSub(view.tally.measured - view.tally.matched)}</Say>{" "}
              {view.checkedAt ? <Say lang={lang}>{t.checkedFor(dayTime(view.checkedAt, lang), kindWords)}</Say> : null}
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
            items={(["all", "differ", "ok", "nm"] as const).map((key) => ({ key, label: t.filters[key], count: key === "all" ? null : view.counts[key] }))} />
        ) : <span />}
        <div className="d2s-toolbar-end">
          {nextCheckAt ? <span><Say lang={lang}>{t.nextCheck(dayTime(nextCheckAt, lang))}</Say></span> : null}
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
          return <Group key={g.id} lang={lang} group={g} rows={rows} hrefs={hrefs} measured={view.tally?.measured ?? 0} openKey={openKey} own={g.id === "own" ? own : null} filter={filter} />;
        })
      )}

      {view.tally && !run ? <p className="d2-rule">{t.ruleLine}</p> : null}
    </ScreenFrame>
  );
}

function Group({ lang, group, rows, hrefs, measured, openKey, own = null, filter }: { lang: D2Lang; group: CheckGroup; rows: CheckRowView[]; hrefs: ChecksHrefs; measured: number; openKey: string | null; own?: FirstPartyAnswer | null; filter: CheckFilter }) {
  const t = T2[lang];
  const t3 = T3[lang];
  const nm = rows.filter((r) => r.kind === "nm").length;
  const ok = rows.filter((r) => r.kind === "ok").length;
  const lines = linesOf(rows);
  const [opened, setOpened] = useState<{ ok: boolean; nm: boolean }>({ ok: false, nm: false });
  const titleId = `d2s-g-${group.id}`;
  return (
    <section className="d2s-group" aria-labelledby={titleId}>
      <header className="d2s-group-head">
        <h2 id={titleId}>{group.title}</h2>
        <p>{t.groupSub[group.id]} · <span className="d2-tnum"><Say lang={lang}>{t.groupTally(group.matched, group.differ)}</Say></span></p>
      </header>
      {own ? <OwnFacts lang={lang} fp={own} /> : null}
      <ul className="d2s-card d2s-list d2s-checks">
        {lines.filter((l) => l.kind === "differ").map((line) => (line.kind === "differ" ? <Row key={line.row.key} lang={lang} row={line.row} hrefs={hrefs} openCard={line.row.key === openKey} /> : null))}
        {/* Problems first. What matches and what was not measured fold into one row each. */}
        {(["ok", "nm"] as const).map((kind) => {
          const mine = lines.filter((l): l is Extract<CheckLine, { kind: "ok" | "nm" }> => l.kind === kind);
          if (!mine.length) return null;
          const count = kind === "ok" ? ok : nm;
          const isOpen = filter === kind || opened[kind];
          const id = `d2s-fold-${group.id}-${kind}`;
          return [
            <li key={`${kind}-sum`} data-kind={kind} className="d2s-sum">
              <span className={`d2s-cmark d2s-cmark-${kind}`} aria-hidden="true">{kind === "ok" ? <Ic name="check" size="xs" /> : null}</span>
              <p className="d2s-s"><Say lang={lang}>{kind === "ok" ? t3.sumMatch(count) : t3.sumNm(count)}</Say></p>
              <span className="d2s-side">
                {filter === kind ? null : (
                  <button className="d2-btn d2-btn-quiet d2-btn-sm d2-fold-tg" type="button" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpened((o) => ({ ...o, [kind]: !o[kind] }))}>
                    {isOpen ? t3.hide : t3.show}<Ic name="down" size="xs" />
                  </button>
                )}
              </span>
            </li>,
            isOpen ? mine.map((line) => <Line key={line.key} lang={lang} line={line} />) : null,
          ];
        })}
      </ul>
      {nm > 0 && (filter === "nm" || opened.nm) ? (
        <div className="d2s-nm-note">
          <p><Say lang={lang}>{t.nmNote(nm, measured)}</Say><small>{group.id === "own" ? T3[lang].ownNmWhy : t.nmWhy}</small></p>
          {hrefs.connections && group.id !== "own" ? <a className="d2-btn d2-btn-line d2-btn-sm" href={hrefs.connections}>{t.seeConnections}</a> : null}
        </div>
      ) : null}
    </section>
  );
}

function Row({ lang, row, hrefs, openCard }: { lang: D2Lang; row: CheckRowView; hrefs: ChecksHrefs; openCard: boolean }) {
  const t = T2[lang];
  const label = row.place ? t.atPlace(row.label, row.place) : row.label;
  // The API's sentence (what was looked at and what it showed) when it came; else the finding's title.
  const list = row.sentence ? sentenceList(row.sentence) : null;
  const sentence = row.sentence
    ? <><b><Say lang={lang}>{list ? list.head : bidiValue(row.sentence).text}</Say></b>{row.place ? <> <span className="d2-muted">· <Say lang={lang}>{row.place}</Say></span></> : null}</>
    : row.kind === "differ" && row.finding
    ? <><b><Say lang={lang}>{bidiValue(row.finding.title).text}</Say></b>{row.place ? <> <span className="d2-muted">· <Say lang={lang}>{row.place}</Say></span></> : null}</>
    : <Say lang={lang}>{label}</Say>;
  const tone = row.kind === "ok" ? "ok" : row.kind === "differ" ? "warn" : "nm";
  // With the sentence said, a chip only names where the evidence came from: one chip per source.
  const evidence = row.sentence ? row.evidence.filter((ev, i, all) => all.findIndex((x) => x.where === ev.where) === i) : row.evidence;
  return (
    <li data-kind={row.kind}>
      <span className={`d2s-cmark d2s-cmark-${row.kind}`} aria-hidden="true">{row.kind === "ok" ? <Ic name="check" size="xs" /> : null}</span>
      <div className="d2s-row-main">
        <p className="d2s-s">{sentence}</p>
        {/* Names are a list under the sentence, each in its own direction, never one run of text. */}
        {list ? <ul className="d2s-names">{list.items.map((item) => <li key={item}><Val text={item} /></li>)}</ul> : null}
        {!row.sentence && evidence.length ? (
          <div className="d2s-evs">{evidence.map((ev, i) => <EvidenceChip key={`${ev.label}-${i}`} ev={ev} lang={lang} open={openCard && i === 0} brief={!!row.sentence} />)}</div>
        ) : null}
      </div>
      <span className="d2s-side">
        {/* The row says the sentence: each source is a mark whose card says what it showed and when. */}
        {row.sentence && evidence.length ? <span className="d2s-evs-icons">{evidence.map((ev, i) => <EvidenceChip key={`${ev.label}-${i}`} ev={ev} lang={lang} open={openCard && i === 0} icon />)}</span> : null}
        <StatePill tone={tone}>{t.state[row.kind]}</StatePill>
        {row.kind === "differ" && row.askWaiting ? <a className="d2-btn d2-btn-line d2-btn-sm" href={hrefs.week}>{t.seeAsk}</a>
          // A website difference or an owner's task: the steps are on This week, with the exact text.
          : row.kind === "differ" && row.finding && (row.finding.kind === "owner" || row.finding.website_steps.length > 0) ? <a className="d2-btn d2-btn-line d2-btn-sm" href={hrefs.week}>{t.openTask}</a> : null}
      </span>
    </li>
  );
}

/** A check that matches (or was not measured) at one or more places: drawn once, with the places. */
function Line({ lang, line }: { lang: D2Lang; line: Extract<CheckLine, { kind: "ok" | "nm" }> }) {
  const t = T2[lang];
  // "Nuqta Car Care - West Bay, Nuqta Car Care - Al Wakra" says the business once: West Bay, Al Wakra.
  const head = line.places[0]?.split(" - ")[0] ?? "";
  const short = line.places.length > 1 && line.places.every((p) => p.startsWith(`${head} - `)) ? line.places.map((p) => p.slice(head.length + 3)) : line.places;
  const places = short.length > 4 ? t.placesMore(short.slice(0, 4), short.length - 4) : short.join(lang === "ar" ? "، " : ", ");
  return (
    <li data-kind={line.kind}>
      <span className={`d2s-cmark d2s-cmark-${line.kind}`} aria-hidden="true">{line.kind === "ok" ? <Ic name="check" size="xs" /> : null}</span>
      <div className="d2s-row-main">
        <p className="d2s-s"><Say lang={lang}>{line.sentence ? bidiValue(line.sentence).text : line.label}</Say>{places ? <> <span className="d2-muted">· <Say lang={lang}>{places}</Say></span></> : null}</p>
      </div>
      <span className="d2s-side"><StatePill tone={line.kind === "ok" ? "ok" : "nm"}>{t.state[line.kind]}</StatePill></span>
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

/** What the "Your own data" checks are set against: ALYR's own records, each with where it came
 * from and when it was read. Staff see the counts alone (the API leaves the rest out). */
function OwnFacts({ lang, fp }: { lang: D2Lang; fp: FirstPartyAnswer }) {
  const t3 = T3[lang];
  const totals = windowTotals(fp);
  const src = (s: FpSource | null) => (s ? <span className="d2s-ownf-src"><span className="d2s-src d2s-src-alyr" aria-hidden="true"><Mark /></span><span><Say lang={lang}>{s.read_at ? t3.ownSource(s.source_label, dayTime(s.read_at, lang)) : s.source_label}</Say></span></span> : null);
  const name = fp.names ? (lang === "ar" ? fp.names.ar || fp.names.en : fp.names.en || fp.names.ar) : "";
  const other = fp.names ? (lang === "ar" ? (fp.names.ar ? fp.names.en : "") : (fp.names.en ? fp.names.ar : "")) : "";
  return (
    <div className="d2s-ownf" role="group" aria-label={t3.factsTitle}>
      <div className="d2s-ownf-tile">
        <span className="d2s-ownf-k">{t3.fActivity}</span>
        <b className="d2s-ownf-v">{totals ? <Say lang={lang}>{t3.weekTotals(totals.orders, totals.bookings, fp.window?.weeks ?? 4)}</Say> : t3.fNotOn}</b>
        {fp.activity && !fp.covered && totals ? <small className="d2s-ownf-note">{t3.ownPartial}</small> : null}
        {src(fp.activity)}
      </div>
      {fp.links && (fp.links.booking || fp.links.order) ? (
        <div className="d2s-ownf-tile">
          <span className="d2s-ownf-k">{t3.fPages}</span>
          <span className="d2s-ownf-links">
            {fp.links.booking ? <a className="d2-link" href={fp.links.booking} target="_blank" rel="noreferrer">{t3.fBookingPage}</a> : null}
            {fp.links.order ? <a className="d2-link" href={fp.links.order} target="_blank" rel="noreferrer">{t3.fOrderPage}</a> : null}
          </span>
          {src(fp.links)}
        </div>
      ) : null}
      {fp.whatsapp ? (
        <div className="d2s-ownf-tile">
          <span className="d2s-ownf-k">{t3.fWhatsapp}</span>
          <b className="d2s-ownf-v"><Ltr>{phoneText(fp.whatsapp.number)}</Ltr></b>
          {src(fp.whatsapp)}
        </div>
      ) : null}
      {name ? (
        <div className="d2s-ownf-tile">
          <span className="d2s-ownf-k">{t3.fNames}</span>
          <b className="d2s-ownf-v"><bdi>{name}</bdi></b>
          {other ? <small className="d2s-ownf-sub" lang={lang === "ar" ? "en" : "ar"} dir={lang === "ar" ? "ltr" : "rtl"}>{other}</small> : null}
          {src(fp.names)}
        </div>
      ) : null}
      {fp.counts_only ? <p className="d2-small d2-muted d2s-ownf-only">{t3.countsOnly}</p> : null}
    </div>
  );
}