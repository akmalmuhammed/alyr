"use client";

import React from "react";
import { teamCopy, type Lang } from "./copy";

export type TeamStatesProps = {
  lang?: Lang;
  activeState?: "loading" | "agent" | "empty" | "offline" | "all";
  onInvite?: () => void;
};

export function TeamStates({
  lang = "en",
  activeState = "all",
  onInvite,
}: TeamStatesProps) {
  const t = teamCopy[lang];

  const showLoading = activeState === "loading" || activeState === "all";
  const showAgent = activeState === "agent" || activeState === "all";
  const showEmptyErrors =
    activeState === "empty" || activeState === "offline" || activeState === "all";

  return (
    <div
      className="team-states-grid"
      style={{ direction: lang === "ar" ? "rtl" : "ltr" }}
    >
      {/* ── Column 1: Loading State ───────────────────────────────────────── */}
      {showLoading && (
        <div className="team-state-col" aria-label={t.stateLoadingLabel} aria-busy="true">
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateLoadingLabel}</span>
            <span className="team-state-strip-sub">{t.stateLoadingSub}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{t.weekTitle}</span>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", marginInlineStart: "0.5rem" }}>
                Sun 8 Nov to now
              </span>
            </div>
            <div className="team-chips-wrap">
              <span className="team-chip team-chip-active">{t.periodWeek}</span>
            </div>
          </div>

          <div style={{ padding: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem", borderBottom: "var(--rule-hairline) solid var(--line)" }}>
            <div className="team-skeleton-tile">
              <div className="team-skeleton-shimmer" style={{ inlineSize: "5rem", blockSize: "0.5rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "3.5rem", blockSize: "1.25rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "6.5rem", blockSize: "0.5rem" }} />
            </div>
            <div className="team-skeleton-tile">
              <div className="team-skeleton-shimmer" style={{ inlineSize: "5rem", blockSize: "0.5rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "3.5rem", blockSize: "1.25rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "6.5rem", blockSize: "0.5rem" }} />
            </div>
            <div className="team-skeleton-tile">
              <div className="team-skeleton-shimmer" style={{ inlineSize: "5rem", blockSize: "0.5rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "3.5rem", blockSize: "1.25rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "6.5rem", blockSize: "0.5rem" }} />
            </div>
            <div className="team-skeleton-tile">
              <div className="team-skeleton-shimmer" style={{ inlineSize: "5rem", blockSize: "0.5rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "3.5rem", blockSize: "1.25rem" }} />
              <div className="team-skeleton-shimmer" style={{ inlineSize: "6.5rem", blockSize: "0.5rem" }} />
            </div>
          </div>

          {/* Skeleton table */}
          <div className="team-table-scroll" aria-busy="true">
            <table className="team-table">
              <thead>
                <tr>
                  <th className="team-th">{t.colPerson}</th>
                  <th className="team-th">{t.colRole}</th>
                  <th className="team-th">{t.colOwnPhone}</th>
                  <th className="team-th">{t.colLastSeen}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [90, 150],
                  [70, 120],
                  [80, 170],
                  [60, 110],
                  [84, 140],
                  [72, 160],
                  [66, 130],
                ].map(([w1, w2], i) => (
                  <tr key={i} className="team-tr">
                    <td className="team-td">
                      <div className="team-person-cell">
                        <div
                          className="team-skeleton-shimmer"
                          style={{ inlineSize: "1.75rem", blockSize: "1.75rem", borderRadius: "var(--radius-full)", flex: "none" }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", flex: 1 }}>
                          <div className="team-skeleton-shimmer" style={{ inlineSize: `${w1 * 0.0625}rem`, blockSize: "0.625rem" }} />
                          <div className="team-skeleton-shimmer" style={{ inlineSize: `${w2 * 0.05}rem`, blockSize: "0.5rem" }} />
                        </div>
                      </div>
                    </td>
                    <td className="team-td">
                      <div className="team-skeleton-shimmer" style={{ inlineSize: "4.5rem", blockSize: "0.625rem" }} />
                    </td>
                    <td className="team-td">
                      <div className="team-skeleton-shimmer" style={{ inlineSize: "6rem", blockSize: "0.625rem" }} />
                    </td>
                    <td className="team-td">
                      <div className="team-skeleton-shimmer" style={{ inlineSize: "3rem", blockSize: "0.625rem" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="team-state-strip">
            <span className="team-state-strip-label">Changing the period</span>
            <span className="team-state-strip-sub">the old numbers stay, greyed</span>
          </div>

          <div style={{ height: "2.75rem", padding: "0 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                inlineSize: "0.375rem",
                blockSize: "0.375rem",
                borderRadius: "var(--radius-full)",
                background: "var(--volt)",
              }}
            />
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {t.stateCounting}
            </span>
          </div>
        </div>
      )}

      {/* ── Column 2: Agent Restricted View ───────────────────────────────── */}
      {showAgent && (
        <div className="team-state-col" aria-label={t.stateAgentLabel}>
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateAgentLabel}</span>
            <span className="team-state-strip-sub">{t.stateAgentSub}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{t.agentYourNumbers}</span>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", marginInlineStart: "0.5rem" }}>
                Sun 8 Nov to now
              </span>
            </div>
            <div className="team-chips-wrap">
              <span className="team-chip team-chip-active">{t.periodWeek}</span>
            </div>
          </div>

          <div style={{ padding: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem", borderBottom: "var(--rule-hairline) solid var(--line)" }}>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.tileWaitingForYou}</span>
              <span className="team-stat-num" style={{ color: "var(--warn)" }}>1</span>
              <span className="team-stat-sub">{t.tileWaitingSub}</span>
            </div>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.tileYourFirstAnswer}</span>
              <span className="team-stat-num">1 min</span>
              <span className="team-stat-sub">{t.tileFirstAnswerSub}</span>
            </div>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.tileYouClosed}</span>
              <span className="team-stat-num">34</span>
              <span className="team-stat-sub">{t.tileClosedSub}</span>
            </div>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.tileOrdersHandled}</span>
              <span className="team-stat-num">14</span>
              <span className="team-stat-sub">{t.tileOrdersSub}</span>
            </div>
          </div>

          <div style={{ padding: "0.875rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text)" }}>
              {t.howYourConvsEnded}
            </span>
            <div className="team-week-stack" style={{ inlineSize: "100%" }} aria-hidden="true">
              <span className="team-week-part-sold" style={{ flexGrow: 12 }} />
              <span className="team-week-part-booked" style={{ flexGrow: 13 }} />
              <span className="team-week-part-answered" style={{ flexGrow: 8 }} />
              <span className="team-week-part-lost" style={{ flexGrow: 1 }} />
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              12 sold · 13 booked · 8 answered · 1 lost
            </span>
          </div>

          <div style={{ padding: "0 1rem", display: "flex", flexDirection: "column" }}>
            <div className="team-kv-row" style={{ height: "2.75rem", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
              <span className="team-kv-key">{t.colOpenNow}</span>
              <span className="team-kv-val">4</span>
            </div>
            <div className="team-kv-row" style={{ height: "2.75rem", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
              <span className="team-kv-key">{t.kvBookingsMarked}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>1 did not come</span>
                <span className="team-kv-val">22</span>
              </div>
            </div>
            <div className="team-kv-row" style={{ height: "2.75rem" }}>
              <span className="team-kv-key">{t.kvOnShiftToday}</span>
              <span className="team-kv-val">{t.shiftTodayVal}</span>
            </div>
          </div>

          <div
            style={{
              padding: "0.625rem 1rem",
              background: "var(--surface-subtle)",
              borderTop: "var(--rule-hairline) solid var(--line)",
              borderBottom: "var(--rule-hairline) solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-muted)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none" }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{t.lockTeamSalesNotice}</span>
          </div>

          <div className="team-state-strip">
            <span className="team-state-strip-label">As an agent</span>
            <span className="team-state-strip-sub">the People page</span>
          </div>

          <div
            style={{
              padding: "0.75rem 1rem",
              borderBottom: "var(--rule-hairline) solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-muted)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none" }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{t.lockChangeTeamNotice}</span>
          </div>

          {/* Members list under locked view */}
          {[
            { ini: "B", name: "Bilal", role: "Agent" },
            { ini: "H", name: "Hana", role: "Owner" },
            { ini: "O", name: "Omar", role: "Admin" },
          ].map((p, i) => (
            <div
              key={i}
              style={{
                height: "3.25rem",
                padding: "0 1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                borderBottom: "var(--rule-hairline) solid var(--line-subtle)",
              }}
            >
              <div className="team-avatar" style={{ inlineSize: "1.75rem", blockSize: "1.75rem" }}>
                {p.ini}
              </div>
              <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>{p.name}</span>
              <span style={{ marginInlineStart: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {p.role}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Column 3: Empty and Errors ────────────────────────────────────── */}
      {showEmptyErrors && (
        <div className="team-state-col" aria-label={t.stateEmptyLabel}>
          {/* Empty State */}
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateEmptyLabel}</span>
            <span className="team-state-strip-sub">{t.stateEmptySub}</span>
          </div>

          <div
            style={{
              padding: "2.25rem 1.5rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "0.625rem",
              borderBottom: "var(--rule-hairline) solid var(--line)",
            }}
          >
            <span style={{ fontSize: "var(--font-size-md)", fontWeight: 600 }}>
              {t.emptyNoNumbersTitle}
            </span>
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", maxWidth: "20rem", lineHeight: 1.4 }}>
              {t.emptyNoNumbersDesc}
            </span>
            <button
              type="button"
              className="btn line"
              style={{ height: "2rem", marginTop: "0.5rem" }}
              onClick={onInvite}
            >
              {t.invitePerson}
            </button>
          </div>

          {/* Offline State */}
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateOfflineLabel}</span>
            <span className="team-state-strip-sub">{t.stateOfflineSub}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <div className="team-banner team-banner-bad">
              <span>{t.offlineBanner}</span>
              <button type="button" className="team-banner-action">
                {t.offlineTryNow}
              </button>
            </div>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
              {t.offlineTimestamp}
            </span>
          </div>

          {/* Refusal rules */}
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateRefusedLabel}</span>
            <span className="team-state-strip-sub">{t.stateRefusedSub}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line-subtle)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--font-size-xs)" }}>
            <span style={{ inlineSize: "0.375rem", blockSize: "0.375rem", borderRadius: "var(--radius-full)", background: "var(--bad)", flex: "none" }} />
            <span>{t.errLastOwner}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line-subtle)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--font-size-xs)" }}>
            <span style={{ inlineSize: "0.375rem", blockSize: "0.375rem", borderRadius: "var(--radius-full)", background: "var(--bad)", flex: "none" }} />
            <span>{t.errOnlyOwnerMakesOwner}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--font-size-xs)" }}>
            <span style={{ inlineSize: "0.375rem", blockSize: "0.375rem", borderRadius: "var(--radius-full)", background: "var(--bad)", flex: "none" }} />
            <span style={{ flex: 1 }}>{t.errAlreadyOnTeam}</span>
            <button type="button" className="team-link-action">
              {t.errOpenPerson}
            </button>
          </div>

          {/* Did not work */}
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateFailedLabel}</span>
            <span className="team-state-strip-sub">{t.stateFailedSub}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--font-size-xs)" }}>
            <span style={{ inlineSize: "0.375rem", blockSize: "0.375rem", borderRadius: "var(--radius-full)", background: "var(--bad)", flex: "none" }} />
            <span style={{ flex: 1 }}>{t.errInviteFailed}</span>
            <button type="button" className="team-link-action">
              {t.sendAgain}
            </button>
          </div>

          {/* Busy */}
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateBusyLabel}</span>
            <span className="team-state-strip-sub">{t.stateBusySub}</span>
          </div>

          <div style={{ padding: "0.875rem 1rem", borderBottom: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{ height: "2.25rem", padding: "0 0.875rem", display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--surface-subtle)", borderRadius: "var(--radius-sm)" }}>
              <span style={{ inlineSize: "0.375rem", blockSize: "0.375rem", borderRadius: "var(--radius-full)", background: "var(--text-muted)" }} />
              <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text-muted)" }}>
                {t.sendingInviteNotice}
              </span>
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {t.busyButtonNotice}
            </span>
          </div>

          {/* Done */}
          <div className="team-state-strip">
            <span className="team-state-strip-label">{t.stateDoneLabel}</span>
            <span className="team-state-strip-sub">{t.stateDoneSub}</span>
          </div>

          <div style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "var(--font-size-xs)" }}>
            <span style={{ inlineSize: "0.375rem", blockSize: "0.375rem", borderRadius: "var(--radius-full)", background: "var(--ok)", flex: "none" }} />
            <span style={{ flex: 1 }}>{t.doneInviteNotice}</span>
            <button type="button" className="team-link-action">
              {t.undo}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
