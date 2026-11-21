"use client";

import type { ReactNode } from "react";
import { Banner, Button, DashedSlot, Icon, KV, KVList, PageTitle, Panel, PanelBody, PanelHeader, Stack, Stat, Tabs } from "@/app/_ui";
import { formatDate, formatTime, none } from "@/app/_ui/format";
import { T } from "./copy";
import type { Lang } from "./copy";
import { PERIODS, answerMinutes, outcomeParts } from "./logic";
import type { Period, Report, WorkRow } from "./logic";

export type TeamAgentProps = {
  lang: Lang;
  report: Report;
  /** The signed-in person's own row, or null before they have any activity. */
  row: WorkRow | null;
  updatedAt: string;
  period: Period;
  onPeriod: (period: Period) => void;
  inboxHref: string;
  /** The one banner of the page (offline or a failure) replaces the note about who sees what. */
  banner?: ReactNode;
};

/**
 * What a person with the agent role sees of the report: their own numbers and nothing of the team. The
 * shop-wide totals, "Nobody yet" and everyone else's rows are never drawn, and there is no money (an
 * agent sees per-order totals only). The API still sends the totals today: see requests.md.
 */
export function TeamAgent({ lang, report, row, updatedAt, period, onPeriod, inboxHref, banner }: TeamAgentProps) {
  const t = T[lang];
  const since = formatDate(report.since, lang);
  const answer = row ? answerMinutes(row.firstAnswer) : null;

  return (
    <div className="team-page">
      <PageTitle
        title={t.agentTitle}
        sub={t.weekSubAgent(period, since, formatTime(updatedAt, lang))}
        right={
          <div className="team-actions">
            <Tabs
              label={t.periodLabel}
              value={String(period)}
              items={PERIODS.map((p) => ({ id: String(p), label: t.periods[p] }))}
              onChange={(id) => onPeriod(Number(id) as Period)}
            />
            <Button kind="volt" href={inboxHref}>{t.openInbox}</Button>
          </div>
        }
      />
      {banner ?? <Banner tone="n"><Icon name="lock" /> {t.agentLock}</Banner>}
      {row ? (
        <>
          <div className="team-stats">
            <Stat
              label={t.agentWaiting}
              value={row.waiting}
              delta={row.waiting > 0 && row.oldestWait !== null ? t.statWaitingDelta(row.oldestWait) : undefined}
              tone={row.waiting > 0 ? "warn" : "n"}
              sub={t.statWaitingSub(report.waitingMinutes)}
            />
            <Stat label={t.agentAnswer} value={answer === null ? none(lang) : t.answerMinutes(answer)} sub={t.statAnswerSub(row.replies)} />
            <Stat label={t.agentClosed} value={row.closedTotal} sub={t.statClosedSub(row.closed)} />
            <Stat label={t.agentOrders} value={row.orders} />
          </div>
          <Panel>
            <PanelHeader title={t.agentEnded} />
            <PanelBody>
              {row.closedTotal > 0 ? (
                <>
                  <Stack size="md" parts={outcomeParts(row.closed)} summary={t.outcomesSummary(row.closed)} />
                  <span className="team-sub">{t.outcomeLine(row.closed)}</span>
                </>
              ) : (
                <span className="team-sub">{t.nothingClosed}</span>
              )}
              <KVList>
                <KV k={t.agentOpen} mono>{row.open}</KV>
                <KV k={t.agentBookings} mono>{row.came + row.noShows}</KV>
              </KVList>
            </PanelBody>
          </Panel>
        </>
      ) : (
        <DashedSlot title={t.agentTitle}>{t.agentNoRow}</DashedSlot>
      )}
    </div>
  );
}
