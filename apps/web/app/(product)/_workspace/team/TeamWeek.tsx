"use client";

import React, { useState } from "react";
import { Button } from "@/app/_ui/Button";
import { Avatar } from "@/app/_ui/Avatar";
import { teamCopy, type Lang } from "./copy";
import { calculateOutcomeParts, type WorkPerson } from "./logic";

export type TeamWeekProps = {
  lang?: Lang;
  people: WorkPerson[];
  onOpenInbox?: () => void;
};

export function TeamWeek({
  lang = "en",
  people,
  onOpenInbox,
}: TeamWeekProps) {
  const t = teamCopy[lang];
  const [period, setPeriod] = useState<"today" | "week" | "28d">("week");

  return (
    <div
      className="team-workbench"
      style={{ direction: lang === "ar" ? "rtl" : "ltr" }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="team-header">
        <div className="team-header-main">
          <h1 className="team-title">{t.weekTitle}</h1>
          <p className="team-subtitle">{t.weekSubtitle}</p>
        </div>
        <div className="team-header-actions">
          <div className="team-chips-wrap" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={period === "today"}
              className={`team-chip ${period === "today" ? "team-chip-active" : ""}`}
              onClick={() => setPeriod("today")}
            >
              {t.periodToday}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={period === "week"}
              className={`team-chip ${period === "week" ? "team-chip-active" : ""}`}
              onClick={() => setPeriod("week")}
            >
              {t.periodWeek}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={period === "28d"}
              className={`team-chip ${period === "28d" ? "team-chip-active" : ""}`}
              onClick={() => setPeriod("28d")}
            >
              {t.period28Days}
            </button>
          </div>

          <Button kind="line" size="md">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t.export}
          </Button>

          <Button
            kind="volt"
            size="md"
            onClick={onOpenInbox}
          >
            {t.openInbox}
          </Button>
        </div>
      </header>

      {/* ── Warning Banner ────────────────────────────────────────────────── */}
      <aside className="team-banner team-banner-warn" role="alert">
        <div className="team-banner-content">
          <span className="team-banner-dot" aria-hidden="true" />
          <span>{t.weekBanner}</span>
        </div>
        <button
          type="button"
          className="team-banner-action"
          onClick={onOpenInbox}
        >
          {t.weekBannerAction}
        </button>
      </aside>

      {/* ── 4 Stat Cards ──────────────────────────────────────────────────── */}
      <section className="team-stats-strip" aria-label="Work metrics">
        <div className="team-stat-card">
          <span className="team-stat-label">{t.statWaitingAnswer}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num" style={{ color: "var(--warn)" }}>
              3
            </span>
            <span className="team-stat-delta team-stat-delta-warn">
              {t.statWaitingDelta}
            </span>
          </div>
          <span className="team-stat-sub">{t.statWaitingSub}</span>
        </div>

        <div className="team-stat-card">
          <span className="team-stat-label">{t.statTypicalReply}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num">{t.statTypicalReplyVal}</span>
          </div>
          <span className="team-stat-sub">{t.statTypicalReplySub}</span>
        </div>

        <div className="team-stat-card">
          <span className="team-stat-label">{t.statConvsClosed}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num">{t.statConvsClosedVal}</span>
          </div>
          <span className="team-stat-sub">{t.statConvsClosedSub}</span>
        </div>

        <div className="team-stat-card">
          <span className="team-stat-label">{t.statSalesLookedAfter}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num">{t.statSalesVal}</span>
          </div>
          <span className="team-stat-sub">{t.statSalesSub}</span>
        </div>
      </section>

      {/* ── Work by Person Table ──────────────────────────────────────────── */}
      <section className="team-table-panel" aria-label={t.cardWorkByPerson}>
        <div
          style={{
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "var(--rule-hairline) solid var(--line)",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
            {t.cardWorkByPerson}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <span style={{ inlineSize: "0.625rem", blockSize: "0.625rem", background: "var(--text)", borderRadius: "var(--radius-sm)" }} />
              {t.outcomeSold}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <span style={{ inlineSize: "0.625rem", blockSize: "0.625rem", background: "var(--text-muted)", borderRadius: "var(--radius-sm)" }} />
              {t.outcomeBooked}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <span style={{ inlineSize: "0.625rem", blockSize: "0.625rem", background: "var(--line)", borderRadius: "var(--radius-sm)" }} />
              {t.outcomeAnswered}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <span style={{ inlineSize: "0.625rem", blockSize: "0.625rem", background: "var(--bad)", borderRadius: "var(--radius-sm)" }} />
              {t.outcomeLost}
            </span>
            <span>·</span>
            <span>{t.aToZ}</span>
          </div>
        </div>

        <div className="team-table-scroll" tabIndex={0} role="region" aria-label={t.teamReport}>
          <table className="team-table">
            <thead>
              <tr>
                <th className="team-th">{t.colPerson}</th>
                <th className="team-th" style={{ inlineSize: "7rem" }}>{t.colOpenNow}</th>
                <th className="team-th team-th-right" style={{ inlineSize: "3.5rem" }}>{t.colReplies}</th>
                <th className="team-th" style={{ inlineSize: "6rem" }}>{t.colFirstAnswer}</th>
                <th className="team-th team-th-right" style={{ inlineSize: "3.25rem" }}>{t.colClosed}</th>
                <th className="team-th" style={{ inlineSize: "14rem" }}>{t.colHowEnded}</th>
                <th className="team-th" style={{ inlineSize: "8rem" }}>{t.colBookingsMarked}</th>
                <th className="team-th team-th-right" style={{ inlineSize: "3.5rem" }}>{t.colOrders}</th>
                <th className="team-th team-th-right" style={{ inlineSize: "6.5rem" }}>{t.colSales}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const parts = calculateOutcomeParts(person.outcomes);
                const closedCount = person.outcomes
                  ? person.outcomes.sold +
                    person.outcomes.booked +
                    person.outcomes.answered +
                    person.outcomes.lost
                  : 0;

                return (
                  <tr key={person.name} className="team-tr">
                    <td className="team-td">
                      <div className="team-person-cell">
                        <Avatar name={person.name} initials={person.initials} size={28} />
                        <div className="team-person-meta">
                          <span className="team-person-name">{person.name}</span>
                          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                            {person.role}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="team-td">
                      {person.open > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                          <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>
                            {person.open} {t.filterAll.toLowerCase()}
                          </span>
                          {person.waiting && (
                            <span style={{ fontSize: "var(--ui-micro)", fontWeight: 600, color: "var(--warn-text)" }}>
                              {person.waiting}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
                          {t.none}
                        </span>
                      )}
                    </td>

                    <td className="team-td team-td-right">
                      {person.replies > 0 ? person.replies : t.dash}
                    </td>

                    <td className="team-td">
                      {person.firstAnswer !== "–" ? (
                        <span style={{ fontFamily: "var(--font-ui-mono)" }}>{person.firstAnswer}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
                          {t.noRepliesYet}
                        </span>
                      )}
                    </td>

                    <td className="team-td team-td-right">
                      {closedCount > 0 ? closedCount : t.dash}
                    </td>

                    <td className="team-td">
                      {person.outcomes && closedCount > 0 ? (
                        <div className="team-week-stack-box">
                          <div className="team-week-stack" aria-hidden="true">
                            {parts.map((p) => (
                              <span
                                key={p.key}
                                className={`team-week-part-${p.key}`}
                                style={{ flexGrow: p.flex }}
                              />
                            ))}
                          </div>
                          <span className="team-week-stack-labels">
                            {person.outcomes.sold} {t.outcomeSold.toLowerCase()} · {person.outcomes.booked} {t.outcomeBooked.toLowerCase()} · {person.outcomes.answered} {t.outcomeAnswered.toLowerCase()} · {person.outcomes.lost} {t.outcomeLost.toLowerCase()}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
                          {t.nothingClosedYet}
                        </span>
                      )}
                    </td>

                    <td className="team-td">
                      {person.bookings ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                          <span style={{ fontFamily: "var(--font-ui-mono)" }}>
                            {person.bookings.marked}
                          </span>
                          <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                            {person.bookings.noShow > 0 ? t.didNotCome(person.bookings.noShow) : t.allCame}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>{t.dash}</span>
                      )}
                    </td>

                    <td className="team-td team-td-right">
                      {person.orders > 0 ? person.orders : t.dash}
                    </td>

                    <td className="team-td team-td-right">
                      {person.sales}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* ── Table Footers ─────────────────────────────────────────── */}
            <tfoot>
              {/* Row 1: Nobody yet */}
              <tr style={{ background: "var(--surface-subtle)", borderTop: "var(--rule-hairline) solid var(--line)" }}>
                <td className="team-td">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 600 }}>{t.rowNobodyYet}</span>
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                      {t.rowNobodySub}
                    </span>
                  </div>
                </td>
                <td className="team-td">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontFamily: "var(--font-ui-mono)" }}>1 open</span>
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--warn)", fontWeight: 600 }}>
                      1 waiting · 12 min
                    </span>
                  </div>
                </td>
                <td className="team-td team-td-right">{t.dash}</td>
                <td className="team-td" style={{ color: "var(--text-muted)" }}>{t.dash}</td>
                <td className="team-td team-td-right">{t.dash}</td>
                <td className="team-td" style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
                  {t.rowNobodyNote}
                </td>
                <td className="team-td" style={{ color: "var(--text-muted)" }}>{t.dash}</td>
                <td className="team-td team-td-right">3</td>
                <td className="team-td team-td-right">QAR 2,912</td>
              </tr>

              {/* Row 2: Everyone */}
              <tr style={{ background: "var(--surface-subtle)", borderTop: "var(--rule-hairline) solid var(--line)", fontWeight: 600 }}>
                <td className="team-td">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span>{t.rowEveryone}</span>
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", fontWeight: 400 }}>
                      {t.rowEveryoneSub}
                    </span>
                  </div>
                </td>
                <td className="team-td">
                  <span style={{ fontFamily: "var(--font-ui-mono)" }}>15 open</span>
                </td>
                <td className="team-td team-td-right">320</td>
                <td className="team-td">
                  <span style={{ fontFamily: "var(--font-ui-mono)" }}>2 min</span>
                </td>
                <td className="team-td team-td-right">117</td>
                <td className="team-td">
                  <div className="team-week-stack-box">
                    <div className="team-week-stack" aria-hidden="true">
                      <span className="team-week-part-sold" style={{ flexGrow: 36 }} />
                      <span className="team-week-part-booked" style={{ flexGrow: 47 }} />
                      <span className="team-week-part-answered" style={{ flexGrow: 29 }} />
                      <span className="team-week-part-lost" style={{ flexGrow: 5 }} />
                    </div>
                    <span className="team-week-stack-labels" style={{ fontWeight: 400 }}>
                      36 sold · 47 booked · 29 answered · 5 lost
                    </span>
                  </div>
                </td>
                <td className="team-td">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontFamily: "var(--font-ui-mono)" }}>110</span>
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", fontWeight: 400 }}>
                      6 did not come
                    </span>
                  </div>
                </td>
                <td className="team-td team-td-right">52</td>
                <td className="team-td team-td-right">QAR 21,480</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <footer className="team-table-footer">
          {t.weekFooterRule}
        </footer>
      </section>

      {/* ── Three Bottom Panels ───────────────────────────────────────────── */}
      <div className="team-panels-row">
        {/* Panel 1: Why lost */}
        <section className="team-panel" aria-label={t.whyLostTitle}>
          <header className="team-panel-head">
            <span>{t.whyLostTitle}</span>
            <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", fontWeight: 400 }}>
              {t.whyLostCount}
            </span>
          </header>
          <div className="team-panel-body">
            <div className="team-meter-row">
              <span style={{ inlineSize: "9rem" }}>{t.whyLostPrice}</span>
              <div className="team-meter-track" aria-hidden="true">
                <div className="team-meter-fill" style={{ inlineSize: "100%" }} />
              </div>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>2</span>
            </div>

            <div className="team-meter-row">
              <span style={{ inlineSize: "9rem" }}>{t.whyLostNotAvailable}</span>
              <div className="team-meter-track" aria-hidden="true">
                <div className="team-meter-fill" style={{ inlineSize: "50%" }} />
              </div>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>1</span>
            </div>

            <div className="team-meter-row">
              <span style={{ inlineSize: "9rem" }}>{t.whyLostNoReply}</span>
              <div className="team-meter-track" aria-hidden="true">
                <div className="team-meter-fill" style={{ inlineSize: "50%" }} />
              </div>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>1</span>
            </div>

            <div className="team-meter-row">
              <span style={{ inlineSize: "9rem" }}>{t.whyLostWentElsewhere}</span>
              <div className="team-meter-track" aria-hidden="true">
                <div className="team-meter-fill" style={{ inlineSize: "50%" }} />
              </div>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>1</span>
            </div>

            <div className="team-meter-row">
              <span style={{ inlineSize: "9rem" }}>{t.whyLostOther}</span>
              <div className="team-meter-track" aria-hidden="true">
                <div className="team-meter-fill" style={{ inlineSize: "0%" }} />
              </div>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>0</span>
            </div>
          </div>
          <footer className="team-panel-footer">
            {t.whyLostFootnote}
          </footer>
        </section>

        {/* Panel 2: First answer by day */}
        <section className="team-panel" aria-label={t.firstAnswerTitle}>
          <header className="team-panel-head">
            <span>{t.firstAnswerTitle}</span>
            <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", fontWeight: 400 }}>
              {t.firstAnswerSubtitle}
            </span>
          </header>
          <div className="team-panel-body">
            <div className="team-day-bars-row">
              <div className="team-day-bar-col">
                <span className="team-day-bar-val">3 min</span>
                <div className="team-day-bar-pillar" style={{ blockSize: "2.625rem" }} />
                <span className="team-day-bar-label">Sun</span>
              </div>
              <div className="team-day-bar-col">
                <span className="team-day-bar-val">2 min</span>
                <div className="team-day-bar-pillar" style={{ blockSize: "1.75rem" }} />
                <span className="team-day-bar-label">Mon</span>
              </div>
              <div className="team-day-bar-col">
                <span className="team-day-bar-val">2 min</span>
                <div className="team-day-bar-pillar" style={{ blockSize: "1.75rem" }} />
                <span className="team-day-bar-label">Tue</span>
              </div>
              <div className="team-day-bar-col">
                <span className="team-day-bar-val">4 min</span>
                <div className="team-day-bar-pillar" style={{ blockSize: "3.5rem" }} />
                <span className="team-day-bar-label">Wed</span>
              </div>
              <div className="team-day-bar-col">
                <span className="team-day-bar-val" style={{ fontWeight: 600, color: "var(--text)" }}>2 min</span>
                <div className="team-day-bar-pillar team-day-bar-pillar-active" style={{ blockSize: "1.75rem" }} />
                <span className="team-day-bar-label" style={{ fontWeight: 600, color: "var(--text)" }}>Thu</span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {t.firstAnswerSlowestNote}
            </p>
          </div>
          <footer className="team-panel-footer">
            {t.firstAnswerFootnote}
          </footer>
        </section>

        {/* Panel 3: How each number is counted */}
        <section className="team-panel" aria-label={t.howCountedTitle}>
          <header className="team-panel-head">
            <span>{t.howCountedTitle}</span>
          </header>
          <div className="team-panel-body">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", paddingBottom: "0.5rem", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>{t.defWaitingTitle}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t.defWaitingText}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", paddingBottom: "0.5rem", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>{t.defRepliesTitle}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t.defRepliesText}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", paddingBottom: "0.5rem", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>{t.defClosedTitle}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t.defClosedText}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>{t.defBookingsTitle}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t.defBookingsText}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
