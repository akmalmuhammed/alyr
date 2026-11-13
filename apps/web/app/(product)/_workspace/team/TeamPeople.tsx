"use client";

import React, { useState } from "react";
import { teamCopy, type Lang } from "./copy";
import {
  filterMembers,
  getInitials,
  type FilterChip,
  type TeamMember,
} from "./logic";

export type TeamPeopleProps = {
  lang?: Lang;
  members: TeamMember[];
  onOpenPerson?: (id: string) => void;
  onOpenInvite?: () => void;
  onOpenRoles?: () => void;
  canManage?: boolean;
  signReplies?: boolean;
  onToggleSignReplies?: (next: boolean) => void;
};

export function TeamPeople({
  lang = "en",
  members,
  onOpenPerson,
  onOpenInvite,
  onOpenRoles,
  canManage = true,
  signReplies = true,
  onToggleSignReplies,
}: TeamPeopleProps) {
  const t = teamCopy[lang];
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<FilterChip>("all");

  const filtered = filterMembers(members, query, chip);

  const chips: Array<{ id: FilterChip; label: string; count: number }> = [
    { id: "all", label: t.filterAll, count: members.length },
    {
      id: "owners_admins",
      label: t.filterOwnersAdmins,
      count: members.filter((m) => m.role === "owner" || m.role === "admin").length,
    },
    {
      id: "agents",
      label: t.filterAgents,
      count: members.filter((m) => m.role === "agent").length,
    },
    {
      id: "not_signed_in",
      label: t.filterNotSignedIn,
      count: members.filter((m) => m.notSignedInYet).length,
    },
    {
      id: "phone_not_linked",
      label: t.filterPhoneNotLinked,
      count: members.filter((m) => !m.phone).length,
    },
  ];

  return (
    <div
      className="team-workbench"
      style={{ direction: lang === "ar" ? "rtl" : "ltr" }}
    >
      {/* ── Title & Main Actions ─────────────────────────────────────────── */}
      <header className="team-header">
        <div className="team-header-main">
          <h1 className="team-title">{t.title}</h1>
          <p className="team-subtitle">{t.subtitle}</p>
        </div>
        <div className="team-header-actions">
          <button type="button" className="btn line">
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
          </button>
          {canManage && (
            <button
              type="button"
              className="btn volt"
              onClick={onOpenInvite}
            >
              {t.invitePerson}
            </button>
          )}
        </div>
      </header>

      {/* ── 4 Stat Cards ─────────────────────────────────────────────────── */}
      <section className="team-stats-strip" aria-label="Team stats">
        <div className="team-stat-card">
          <span className="team-stat-label">{t.statPeople}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num">{members.length}</span>
          </div>
          <span className="team-stat-sub">{t.statPeopleSub}</span>
        </div>

        <div className="team-stat-card">
          <span className="team-stat-label">{t.statActiveNow}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num">
              {members.filter((m) => m.lastSeen?.tone === "volt").length}
            </span>
          </div>
          <span className="team-stat-sub">{t.statActiveNowSub}</span>
        </div>

        <div className="team-stat-card">
          <span className="team-stat-label">{t.statPhoneLinked}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num">
              {members.filter((m) => !!m.phone).length} of {members.length}
            </span>
          </div>
          <span className="team-stat-sub">{t.statPhoneLinkedSub}</span>
        </div>

        <div className="team-stat-card">
          <span className="team-stat-label">{t.statSignedThisWeek}</span>
          <div className="team-stat-num-row">
            <span className="team-stat-num">
              {members.filter((m) => !m.notSignedInYet).length} of {members.length}
            </span>
          </div>
          <span className="team-stat-sub">{t.statSignedThisWeekSub}</span>
        </div>
      </section>

      {/* ── Invite Warning Banner ─────────────────────────────────────────── */}
      {members.some((m) => m.notSignedInYet) && (
        <aside className="team-banner team-banner-warn" role="alert">
          <div className="team-banner-content">
            <span className="team-banner-dot" aria-hidden="true" />
            <span>{t.bannerInviteWarning}</span>
          </div>
          <button type="button" className="team-banner-action">
            {t.bannerInviteAction}
          </button>
        </aside>
      )}

      {/* ── Toolbar: Search & Chips ───────────────────────────────────────── */}
      <section className="team-toolbar" aria-label="Filters">
        <div className="team-toolbar-start">
          <input
            type="search"
            className="team-search-input"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.searchPlaceholder}
          />
          <div className="team-chips-wrap">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`team-chip ${chip === c.id ? "team-chip-active" : ""}`}
                onClick={() => setChip(c.id)}
              >
                <span>{c.label}</span>
                <span className="team-chip-count">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="team-toolbar-end">
          <span>{t.aToZ}</span>
        </div>
      </section>

      {/* ── People Table ──────────────────────────────────────────────────── */}
      <section className="team-table-panel" aria-label={t.colPerson}>
        <div className="team-table-scroll">
          <table className="team-table">
            <thead>
              <tr>
                <th className="team-th">{t.colPerson}</th>
                <th className="team-th" style={{ inlineSize: "9.375rem" }}>
                  {t.colRole}
                </th>
                <th className="team-th" style={{ inlineSize: "13.125rem" }}>
                  {t.colOwnPhone}
                </th>
                <th className="team-th" style={{ inlineSize: "12.5rem" }}>
                  {t.colLastSeen}
                </th>
                <th className="team-th" style={{ inlineSize: "4.75rem" }}></th>
                <th className="team-th" style={{ inlineSize: "1.5rem" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => {
                const isSelected = false;
                const isLocked = person.isYou || !canManage;
                const roleCapitalized =
                  person.role === "owner"
                    ? t.roleOwnerName
                    : person.role === "admin"
                    ? t.roleAdminName
                    : t.roleAgentName;

                return (
                  <tr
                    key={person.id}
                    className={`team-tr ${isSelected ? "team-tr-selected" : ""}`}
                    onClick={() => onOpenPerson?.(person.id)}
                  >
                    <td className="team-td">
                      <div className="team-person-cell">
                        <div
                          className={`team-avatar ${
                            person.isYou ? "team-avatar-inv" : ""
                          }`}
                        >
                          {getInitials(person.name)}
                        </div>
                        <div className="team-person-meta">
                          <div className="team-person-name-row">
                            <span className="team-person-name">
                              {person.name}
                            </span>
                            {person.isYou && (
                              <span className="team-you-tag">{t.you}</span>
                            )}
                          </div>
                          <span className="team-person-email">
                            {person.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="team-td">
                      {isLocked ? (
                        <div className="team-role-locked">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect
                              x="3"
                              y="11"
                              width="18"
                              height="11"
                              rx="2"
                              ry="2"
                            />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          <span>{roleCapitalized}</span>
                        </div>
                      ) : (
                        <div className="team-role-badge">
                          <span>{roleCapitalized}</span>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      )}
                    </td>

                    <td className="team-td">
                      {person.phone ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                          <span className="team-status-tag team-status-ok" style={{ alignSelf: "flex-start" }}>
                            {t.linked}
                          </span>
                          <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                            •••• {person.phone.lastDigits} · {person.phone.since}
                          </span>
                        </div>
                      ) : (
                        <span className="team-status-tag team-status-off" style={{ alignSelf: "flex-start" }}>
                          {t.notLinked}
                        </span>
                      )}
                    </td>

                    <td className="team-td">
                      <div className="team-seen-cell">
                        {person.lastSeen?.tone ? (
                          <span
                            className={`team-status-tag team-status-${person.lastSeen.tone}`}
                            style={{ alignSelf: "flex-start" }}
                          >
                            {person.lastSeen.label}
                          </span>
                        ) : (
                          <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>
                            {person.lastSeen.label}
                          </span>
                        )}
                        <span className="team-seen-sub">
                          {person.lastSeen.sub}
                        </span>
                      </div>
                    </td>

                    <td className="team-td">
                      {person.notSignedInYet ? (
                        <button
                          type="button"
                          className="team-link-action"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          {t.sendAgain}
                        </button>
                      ) : null}
                    </td>

                    <td className="team-td" style={{ textAlign: "end" }}>
                      <button
                        type="button"
                        aria-label="Actions"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "0.25rem",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="team-table-footer">
          {t.tableFooter}
        </footer>
      </section>

      {/* ── Three Bottom Panels ───────────────────────────────────────────── */}
      <div className="team-panels-row">
        {/* Panel 1: How replies are signed */}
        <section className="team-panel" aria-label={t.replySigningTitle}>
          <header className="team-panel-head">
            <span>{t.replySigningTitle}</span>
          </header>
          <div className="team-panel-body">
            <div className="team-switch-row">
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
                style={{ inlineSize: "1.75rem", blockSize: "1rem", cursor: "pointer" }}
              />
            </div>
            <div className="team-bubble-preview">
              <span className="team-bubble-caption">{t.howItLooks}</span>
              <div className="team-bubble-box">
                <span className="team-bubble-text">{t.bubbleSample}</span>
                <span className="team-bubble-meta">{t.bubbleMeta}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Panel 2: Roles in short */}
        <section className="team-panel" aria-label={t.rolesInShortTitle}>
          <header className="team-panel-head">
            <span>{t.rolesInShortTitle}</span>
            <button
              type="button"
              className="team-link-action"
              onClick={onOpenRoles}
            >
              {t.openRoles}
            </button>
          </header>
          <div className="team-panel-body">
            <div className="team-role-item">
              <div className="team-role-item-head">
                <span className="team-role-name">{t.roleOwnerName}</span>
                <span className="team-role-who">{t.roleOwnerWho}</span>
              </div>
              <span className="team-role-desc">{t.roleOwnerDesc}</span>
            </div>

            <div className="team-role-item">
              <div className="team-role-item-head">
                <span className="team-role-name">{t.roleAdminName}</span>
                <span className="team-role-who">{t.roleAdminWho}</span>
              </div>
              <span className="team-role-desc">{t.roleAdminDesc}</span>
            </div>

            <div className="team-role-item">
              <div className="team-role-item-head">
                <span className="team-role-name">{t.roleAgentName}</span>
                <span className="team-role-who">{t.roleAgentWho}</span>
              </div>
              <span className="team-role-desc">{t.roleAgentDesc}</span>
            </div>
          </div>
        </section>

        {/* Panel 3: Sign-ins this week */}
        <section className="team-panel" aria-label={t.signinsWeekTitle}>
          <header className="team-panel-head">
            <span>{t.signinsWeekTitle}</span>
          </header>
          <div className="team-panel-body">
            <div className="team-signins-big">
              <span className="team-signins-num">6</span>
              <span className="team-signins-sub">
                of {members.length} people signed in
              </span>
            </div>

            <div className="team-signins-meter" aria-hidden="true">
              <div
                className="team-signins-bar"
                style={{ inlineSize: "85.7%" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <div className="team-kv-row">
                <span className="team-kv-key">{t.kvActiveNow}</span>
                <span className="team-kv-val">3</span>
              </div>
              <div className="team-kv-row">
                <span className="team-kv-key">{t.kvSignedWeek}</span>
                <span className="team-kv-val">6</span>
              </div>
              <div className="team-kv-row">
                <span className="team-kv-key">{t.kvInvitedNotSigned}</span>
                <span className="team-kv-val">1</span>
              </div>
            </div>
          </div>
          <footer className="team-panel-footer">
            {t.signinsFootnote}
          </footer>
        </section>
      </div>
    </div>
  );
}
