"use client";

import React, { useState } from "react";
import { teamCopy, type Lang } from "./copy";
import {
  calculateOutcomeParts,
  getInitials,
  type TeamMember,
  type WorkPerson,
} from "./logic";

export type TeamPhoneProps = {
  lang?: Lang;
  view?: "team" | "week";
  members: TeamMember[];
  people: WorkPerson[];
  onOpenInvite?: () => void;
  onOpenPerson?: (id: string) => void;
  onOpenInbox?: () => void;
  signReplies?: boolean;
  onToggleSignReplies?: (next: boolean) => void;
};

export function TeamPhone({
  lang = "en",
  view = "team",
  members,
  people,
  onOpenInvite,
  onOpenPerson,
  onOpenInbox,
  signReplies = true,
  onToggleSignReplies,
}: TeamPhoneProps) {
  const t = teamCopy[lang];
  const [period, setPeriod] = useState<"today" | "week" | "28d">("week");
  const [chip, setChip] = useState<string>("all");

  const filteredMembers = members.filter((m) => {
    if (chip === "agents") return m.role === "agent";
    if (chip === "not_signed") return !!m.notSignedInYet;
    return true;
  });

  return (
    <div
      className="team-phone-container"
      style={{ direction: lang === "ar" ? "rtl" : "ltr" }}
    >
      {view === "team" ? (
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                {t.title}
              </h1>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {t.phoneTeamCount}
              </span>
            </div>
            <button
              type="button"
              className="btn volt"
              style={{ height: "2.25rem", padding: "0 1rem" }}
              onClick={onOpenInvite}
            >
              {t.phoneBtnInvite}
            </button>
          </div>

          {/* Search bar */}
          <input
            type="search"
            className="team-search-input"
            style={{ inlineSize: "100%" }}
            placeholder={t.searchPlaceholder}
          />

          {/* Chips */}
          <div className="team-chips-wrap">
            <button
              type="button"
              className={`team-chip ${chip === "all" ? "team-chip-active" : ""}`}
              onClick={() => setChip("all")}
            >
              <span>{t.filterAll}</span>
              <span className="team-chip-count">{members.length}</span>
            </button>
            <button
              type="button"
              className={`team-chip ${chip === "agents" ? "team-chip-active" : ""}`}
              onClick={() => setChip("agents")}
            >
              <span>{t.filterAgents}</span>
              <span className="team-chip-count">
                {members.filter((m) => m.role === "agent").length}
              </span>
            </button>
            <button
              type="button"
              className={`team-chip ${chip === "not_signed" ? "team-chip-active" : ""}`}
              onClick={() => setChip("not_signed")}
            >
              <span>{t.filterNotSignedIn}</span>
              <span className="team-chip-count">
                {members.filter((m) => m.notSignedInYet).length}
              </span>
            </button>
          </div>

          {/* Banner */}
          {members.some((m) => m.notSignedInYet) && (
            <aside className="team-banner team-banner-warn">
              <span>{t.bannerInviteWarning}</span>
              <button type="button" className="team-banner-action">
                {t.sendAgain}
              </button>
            </aside>
          )}

          {/* Person cards list */}
          <div className="team-table-panel">
            {filteredMembers.map((person, i) => (
              <div
                key={person.id}
                className="team-phone-card"
                onClick={() => onOpenPerson?.(person.id)}
                style={{
                  borderRadius: 0,
                  border: "none",
                  borderBottom: i < filteredMembers.length - 1 ? "var(--rule-hairline) solid var(--line-subtle)" : "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div
                    className={`team-avatar ${person.isYou ? "team-avatar-inv" : ""}`}
                    style={{ inlineSize: "2.25rem", blockSize: "2.25rem" }}
                  >
                    {getInitials(person.name)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
                      {person.name}
                    </span>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      {person.role === "owner" ? t.roleOwnerName : person.role === "admin" ? t.roleAdminName : t.roleAgentName}
                    </span>
                    {person.lastSeen?.tone ? (
                      <span
                        className={`team-status-tag team-status-${person.lastSeen.tone}`}
                        style={{ alignSelf: "flex-start", marginTop: "0.125rem" }}
                      >
                        {person.lastSeen.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                        {person.lastSeen?.label}
                      </span>
                    )}
                  </div>
                </div>

                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-muted)" }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            ))}
          </div>

          {/* Bottom links card */}
          <div className="team-table-panel" style={{ padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="team-switch-row" style={{ paddingBlockEnd: "0.5rem" }}>
              <div className="team-switch-info">
                <span className="team-switch-label">{t.replySigningToggle}</span>
                <span className="team-switch-sub">{t.replySigningHint}</span>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={signReplies}
                onChange={(e) => onToggleSignReplies?.(e.target.checked)}
                aria-label={t.replySigningToggle}
                style={{ inlineSize: "1.75rem", blockSize: "1rem" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "var(--rule-hairline) solid var(--line-subtle)", fontSize: "var(--font-size-sm)" }}>
              <span style={{ fontWeight: 500 }}>{t.phoneLinkRoles}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.phoneRolesCount} ›</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0", fontSize: "var(--font-size-sm)" }}>
              <span style={{ fontWeight: 500 }}>{t.phoneLinkShifts}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.phoneShiftsCount} ›</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* This week on Phone */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                {t.weekTitle}
              </h1>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                Sun 8 Nov to now · A to Z
              </span>
            </div>
            <div className="team-chips-wrap">
              <button
                type="button"
                className={`team-chip ${period === "today" ? "team-chip-active" : ""}`}
                onClick={() => setPeriod("today")}
              >
                {t.periodToday}
              </button>
              <button
                type="button"
                className={`team-chip ${period === "week" ? "team-chip-active" : ""}`}
                onClick={() => setPeriod("week")}
              >
                {t.periodWeek}
              </button>
              <button
                type="button"
                className={`team-chip ${period === "28d" ? "team-chip-active" : ""}`}
                onClick={() => setPeriod("28d")}
              >
                28 d
              </button>
            </div>
          </div>

          <aside className="team-banner team-banner-warn">
            <span>{t.phoneBannerWaiting}</span>
            <button
              type="button"
              className="team-banner-action"
              onClick={onOpenInbox}
            >
              {t.phoneOpenInbox}
            </button>
          </aside>

          {/* 2x2 Grid of tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.statWaitingAnswer}</span>
              <span className="team-stat-num" style={{ color: "var(--warn)" }}>3</span>
              <span className="team-stat-sub">{t.statWaitingDelta}</span>
            </div>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.statTypicalReply}</span>
              <span className="team-stat-num">{t.statTypicalReplyVal}</span>
              <span className="team-stat-sub">320 replies</span>
            </div>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.statConvsClosed}</span>
              <span className="team-stat-num">{t.statConvsClosedVal}</span>
              <span className="team-stat-sub">36 sold, 47 booked</span>
            </div>
            <div className="team-stat-card">
              <span className="team-stat-label">{t.statSalesLookedAfter}</span>
              <span className="team-stat-num" style={{ fontSize: "var(--font-size-lg)" }}>
                {t.statSalesVal}
              </span>
              <span className="team-stat-sub">52 orders</span>
            </div>
          </div>

          {/* People cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {people.map((p) => {
              const parts = calculateOutcomeParts(p.outcomes);
              const closedCount = p.outcomes
                ? p.outcomes.sold + p.outcomes.booked + p.outcomes.answered + p.outcomes.lost
                : 0;

              return (
                <div key={p.name} className="team-table-panel" style={{ padding: "0.75rem 1rem", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div className="team-avatar" style={{ inlineSize: "2rem", blockSize: "2rem" }}>
                        {p.initials}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{p.name}</span>
                        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{p.role}</span>
                      </div>
                    </div>
                    {p.waiting && (
                      <span style={{ fontSize: "var(--ui-micro)", fontWeight: 600, color: "var(--warn)" }}>
                        {p.waiting}
                      </span>
                    )}
                  </div>

                  {closedCount > 0 && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "var(--font-size-xs)" }}>
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block" }}>{t.colReplies}</span>
                          <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600 }}>{p.replies}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block" }}>{t.colFirstAnswer}</span>
                          <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600 }}>{p.firstAnswer}</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block" }}>{t.colClosed}</span>
                          <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600 }}>{closedCount}</span>
                        </div>
                      </div>

                      <div className="team-week-stack" style={{ inlineSize: "100%" }} aria-hidden="true">
                        {parts.map((part) => (
                          <span
                            key={part.key}
                            className={`team-week-part-${part.key}`}
                            style={{ flexGrow: part.flex }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Nobody yet card */}
            <div className="team-table-panel" style={{ padding: "0.75rem 1rem", background: "var(--surface-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{t.rowNobodyYet}</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    1 open · 3 orders · QAR 2,912
                  </span>
                </div>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--warn)", fontWeight: 600 }}>
                  1 waiting · 12 min
                </span>
              </div>
            </div>

            <p style={{ margin: "0.5rem 0", fontSize: "var(--ui-micro)", letterSpacing: "0.04em", color: "var(--text-muted)", textAlign: "center" }}>
              {t.phoneRuleBanner}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
