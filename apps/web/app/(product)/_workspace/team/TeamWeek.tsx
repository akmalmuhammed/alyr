"use client";

import type { ReactNode } from "react";
import { Avatar, Banner, Button, PageTitle, Panel, PanelFooter, PanelHeader, Stack, Stat, Table, Tabs } from "@/app/_ui";
import type { TableColumn } from "@/app/_ui";
import { formatDate, formatTime, money, none } from "@/app/_ui/format";
import { T } from "./copy";
import type { Lang } from "./copy";
import { OUTCOMES, PERIODS, answerMinutes, outcomeParts } from "./logic";
import type { Period, Report, WorkRow } from "./logic";

export type TeamWeekProps = {
  lang: Lang;
  report: Report;
  /** When the numbers were read (Doha time, ISO). */
  updatedAt: string;
  period: Period;
  onPeriod: (period: Period) => void;
  /** Where "Open the inbox" goes. */
  inboxHref: string;
  /** A drawer or dialog is on top: the page's main button is an outline. */
  covered: boolean;
  /** The one banner of the page (offline or a failure); the waiting banner is drawn only when there is none. */
  banner?: ReactNode;
  /** The period is being read again: the old numbers stay. */
  refreshing?: boolean;
};

type Line = { key: string; kind: "person" | "nobody" | "all"; row: WorkRow };

/** The legend of the "how they ended" bars. */
function Key({ lang }: { lang: Lang }) {
  const t = T[lang];
  return (
    <ul className="team-key">
      {OUTCOMES.map((o) => (
        <li key={o}><span className={`team-swatch team-swatch--${o}`} aria-hidden="true" />{t.outcomes[o]}</li>
      ))}
    </ul>
  );
}

/** The managers' report: who has what open, how fast they answered, how conversations ended, A to Z. */
export function TeamWeek(props: TeamWeekProps) {
  const { lang, report, updatedAt, period, covered, banner, refreshing } = props;
  const t = T[lang];
  const { all, nobody } = report;
  const since = formatDate(report.since, lang);
  const answer = answerMinutes(all.firstAnswer);
  const dash = <span className="team-sub">{none(lang)}</span>;

  const lines: Line[] = [
    ...report.rows.map((row): Line => ({ key: row.id ?? row.name, kind: "person", row })),
    { key: "nobody", kind: "nobody", row: nobody },
    { key: "all", kind: "all", row: all },
  ];

  const ended = (row: WorkRow) =>
    row.closedTotal === 0 ? (
      <span className="team-sub">{t.nothingClosed}</span>
    ) : (
      <span className="team-ended">
        <Stack parts={outcomeParts(row.closed)} summary={t.outcomesSummary(row.closed)} />
        <span className="team-sub">{t.outcomeLine(row.closed)}{row.closed.unsaid > 0 ? ` · ${t.outcomeNoOutcome(row.closed.unsaid)}` : ""}</span>
      </span>
    );

  const first = (row: WorkRow) =>
    row.firstAnswer !== null ? <span className="u-mono">{t.answerMinutes(answerMinutes(row.firstAnswer) ?? 0)}</span> : <span className="team-sub">{row.replies === 0 ? t.noReplies : none(lang)}</span>;

  const columns: TableColumn<Line>[] = [
    {
      key: "who",
      header: t.colPerson,
      phone: "title",
      cell: ({ kind, row }) =>
        kind === "person" ? (
          <span className="team-who">
            <Avatar name={row.name} />
            <span className="team-who-text">
              <span className="team-name"><bdi>{row.name}</bdi></span>
              <span className="team-sub">{row.role ? t.roles[row.role] : none(lang)}</span>
            </span>
          </span>
        ) : (
          <span className="team-who-text team-total">
            <span>{kind === "nobody" ? t.nobodyYet : t.everyone}</span>
            <span className="team-sub">{kind === "nobody" ? t.nobodyYetSub : t.everyoneSub(since)}</span>
          </span>
        ),
    },
    {
      key: "open",
      header: t.colOpen,
      width: "7rem",
      phone: "tag",
      cell: ({ row }) =>
        row.open === 0 && row.waiting === 0 ? (
          dash
        ) : (
          <span className="team-cell-main">
            <span><bdi className="u-mono">{row.open}</bdi> {t.openWord}</span>
            {row.waiting > 0 ? <span className="team-warn">{t.waitingLine(row.waiting, row.oldestWait)}</span> : null}
          </span>
        ),
    },
    {
      key: "replies",
      header: t.colReplies,
      width: "5rem",
      align: "end",
      mono: true,
      phone: "foot",
      cell: ({ kind, row }) => (kind === "nobody" ? dash : row.replies),
      phoneCell: ({ kind, row }) => (
        <span className="team-figs">
          <span className="team-fig"><span className="u-label">{t.colReplies}</span><span className="u-mono">{kind === "nobody" ? none(lang) : row.replies}</span></span>
          <span className="team-fig"><span className="u-label">{t.colAnswer}</span>{kind === "nobody" ? none(lang) : first(row)}</span>
          <span className="team-fig"><span className="u-label">{t.colClosed}</span><span className="u-mono">{kind === "nobody" ? none(lang) : row.closedTotal}</span></span>
          <span className="team-fig"><span className="u-label">{t.colOrders}</span><span className="u-mono">{row.orders}</span></span>
          <span className="team-fig"><span className="u-label">{t.colSales}</span><span className="u-mono"><bdi className="team-money">{row.orders === 0 ? none(lang) : money(row.sales, lang)}</bdi></span></span>
        </span>
      ),
    },
    { key: "answer", header: t.colAnswer, width: "6.5rem", cell: ({ kind, row }) => (kind === "nobody" ? dash : first(row)) },
    { key: "closed", header: t.colClosed, width: "5rem", align: "end", mono: true, cell: ({ kind, row }) => (kind === "nobody" ? dash : row.closedTotal) },
    { key: "ended", header: t.colEnded, width: "14rem", phone: "body", cell: ({ kind, row }) => (kind === "nobody" ? dash : ended(row)) },
    {
      key: "bookings",
      header: t.colBookings,
      width: "7rem",
      cell: ({ kind, row }) => {
        const marked = row.came + row.noShows;
        if (kind === "nobody" || marked === 0) return dash;
        return (
          <span className="team-cell-main">
            <span className="u-mono">{marked}</span>
            <span className="team-sub">{row.noShows > 0 ? t.didNotCome(row.noShows) : t.allCame}</span>
          </span>
        );
      },
    },
    { key: "orders", header: t.colOrders, width: "5rem", align: "end", mono: true, cell: ({ row }) => row.orders },
    { key: "sales", header: t.colSales, width: "7rem", align: "end", mono: true, cell: ({ row }) => (row.orders === 0 ? dash : <bdi className="team-money">{money(row.sales, lang)}</bdi>) },
  ];

  return (
    <div className="team-page" aria-busy={refreshing || undefined}>
      <PageTitle
        title={t.weekTitle}
        sub={t.weekSub(period, since, formatTime(updatedAt, lang))}
        right={
          <div className="team-actions">
            <Tabs
              label={t.periodLabel}
              value={String(period)}
              items={PERIODS.map((p) => ({ id: String(p), label: t.periods[p] }))}
              onChange={(id) => props.onPeriod(Number(id) as Period)}
            />
            <Button kind={covered ? "line" : "volt"} href={props.inboxHref}>{t.openInbox}</Button>
          </div>
        }
      />
      {banner ?? (all.waiting > 0 ? <Banner tone="warn">{t.waitingBanner(all.waiting, all.oldestWait, nobody.waiting)}</Banner> : null)}
      <div className="team-stats">
        <Stat
          label={t.statWaiting}
          value={all.waiting}
          delta={all.waiting > 0 && all.oldestWait !== null ? t.statWaitingDelta(all.oldestWait) : undefined}
          tone={all.waiting > 0 ? "warn" : "n"}
          sub={t.statWaitingSub(report.waitingMinutes)}
        />
        <Stat label={t.statAnswer} value={answer === null ? none(lang) : t.answerMinutes(answer)} sub={t.statAnswerSub(all.replies)} />
        <Stat label={t.statClosed} value={all.closedTotal} sub={t.statClosedSub(all.closed)} />
        <Stat label={t.statSales} value={<bdi className="team-money">{money(all.sales, lang)}</bdi>} sub={t.statSalesSub(all.orders, nobody.sales)} />
      </div>
      <Panel clip>
        <PanelHeader title={t.workTitle} sub={t.aToZ} right={<Key lang={lang} />} />
        <Table caption={t.workCaption} columns={columns} rows={lines} rowKey={(l) => l.key} />
        <PanelFooter>{t.weekRule}</PanelFooter>
      </Panel>
      <Panel clip>
        <PanelHeader title={t.countedTitle} />
        <dl className="team-defs">
          {t.defs(report.waitingMinutes).map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
