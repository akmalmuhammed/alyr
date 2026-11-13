"use client";

import React from "react";
import { teamCopy, type Lang } from "./copy";
import { getInitials, type TeamMember } from "./logic";

export type TeamRemoveDialogProps = {
  lang?: Lang;
  person: TeamMember;
  onClose: () => void;
  onConfirmRemove: () => void;
};

export function TeamRemoveDialog({
  lang = "en",
  person,
  onClose,
  onConfirmRemove,
}: TeamRemoveDialogProps) {
  const t = teamCopy[lang];

  return (
    <div
      className="team-modal-scrim"
      onClick={onClose}
      style={{ direction: lang === "ar" ? "rtl" : "ltr" }}
    >
      <div
        className="team-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-remove-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ inlineSize: "32rem" }}
      >
        <header className="team-modal-head">
          <h2 id="team-remove-modal-title" style={{ margin: 0, fontSize: "inherit", fontWeight: "inherit" }}>
            {lang === "ar"
              ? `إزالة ${person.name} من الفريق؟`
              : `Remove ${person.name} from the team?`}
          </h2>
        </header>

        <div className="team-modal-body" tabIndex={0}>
          {/* Person overview banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              background: "var(--surface-subtle)",
              padding: "0.75rem",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <div className="team-avatar" style={{ inlineSize: "2.25rem", blockSize: "2.25rem" }}>
              {getInitials(person.name)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
                {person.name}
              </span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {t.removePersonSub}
              </span>
            </div>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {person.email}
            </span>
          </div>

          {/* What happens list */}
          <div className="team-field-group">
            <span className="team-field-label">{t.whatHappensTitle}</span>
            <div
              style={{
                border: "var(--rule-hairline) solid var(--line)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                padding: "0.25rem 0.875rem",
              }}
            >
              <div className="team-kv-row" style={{ padding: "0.5rem 0", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
                <span className="team-kv-key">{t.kvSignInAction}</span>
                <span className="team-kv-val">{t.kvSignInResult}</span>
              </div>
              <div className="team-kv-row" style={{ padding: "0.5rem 0", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
                <span className="team-kv-key">{t.kvOpenConvsAction}</span>
                <span className="team-kv-val">{t.kvOpenConvsResult}</span>
              </div>
              <div className="team-kv-row" style={{ padding: "0.5rem 0", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
                <span className="team-kv-key">{t.kvOrdersAction}</span>
                <span className="team-kv-val">{t.kvOrdersResult}</span>
              </div>
              <div className="team-kv-row" style={{ padding: "0.5rem 0", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
                <span className="team-kv-key">{t.kvShiftsAction}</span>
                <span className="team-kv-val">{t.kvShiftsResult}</span>
              </div>
              <div className="team-kv-row" style={{ padding: "0.5rem 0", borderBottom: "var(--rule-hairline) solid var(--line-subtle)" }}>
                <span className="team-kv-key">{t.kvCalendarAction}</span>
                <span className="team-kv-val">{t.kvCalendarResult}</span>
              </div>
              <div className="team-kv-row" style={{ padding: "0.5rem 0" }}>
                <span className="team-kv-key">{t.kvHistoryAction}</span>
                <span className="team-kv-val">{t.kvHistoryResult}</span>
              </div>
            </div>
          </div>

          {/* Explanatory bullets */}
          <div className="team-bullets-list">
            <div className="team-bullet-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none", marginTop: "0.125rem" }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{t.bulletCalendarKeep}</span>
            </div>
            <div className="team-bullet-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none", marginTop: "0.125rem" }}>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>{t.bulletReinviteAnytime}</span>
            </div>
          </div>
        </div>

        <footer className="team-modal-foot">
          <button
            type="button"
            className="btn line"
            onClick={onClose}
          >
            {lang === "ar" ? `الإبقاء على ${person.name}` : `Keep ${person.name}`}
          </button>
          <button
            type="button"
            className="btn bad"
            onClick={onConfirmRemove}
          >
            {t.btnRemoveConfirm}
          </button>
        </footer>
      </div>
    </div>
  );
}
