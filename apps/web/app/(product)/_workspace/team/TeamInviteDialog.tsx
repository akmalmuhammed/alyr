"use client";

import React, { useState } from "react";
import { teamCopy, type Lang } from "./copy";
import type { RoleKey } from "./logic";

export type TeamInviteDialogProps = {
  lang?: Lang;
  onClose: () => void;
  onSendInvite?: (name: string, email: string, role: RoleKey, bays: string[]) => void;
};

export function TeamInviteDialog({
  lang = "en",
  onClose,
  onSendInvite,
}: TeamInviteDialogProps) {
  const t = teamCopy[lang];
  const [name, setName] = useState("Maha");
  const [email, setEmail] = useState("maha@nuqta.qa");
  const [role, setRole] = useState<RoleKey>("agent");
  const [bays, setBays] = useState<string[]>(["Detailing"]);

  const allBays = ["Bay 1", "Bay 2", "Detailing", "Ceramic"];

  function toggleBay(bay: string) {
    if (bays.includes(bay)) {
      setBays(bays.filter((b) => b !== bay));
    } else {
      setBays([...bays, bay]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSendInvite?.(name, email, role, bays);
  }

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
        aria-labelledby="team-invite-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="team-modal-head">
          <h2 id="team-invite-modal-title" style={{ margin: 0, fontSize: "inherit", fontWeight: "inherit" }}>
            {t.inviteModalTitle}
          </h2>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="team-modal-body">
            {/* Name & Email inputs in 2 columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="team-field-group">
                <label className="team-field-label" htmlFor="invite-name">
                  {t.fieldName}
                </label>
                <input
                  id="invite-name"
                  type="text"
                  className="team-field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.fieldNamePlaceholder}
                  required
                />
                <span className="team-field-help">{t.fieldNameHelp}</span>
              </div>

              <div className="team-field-group">
                <label className="team-field-label" htmlFor="invite-email">
                  {t.fieldEmail}
                </label>
                <input
                  id="invite-email"
                  type="email"
                  className="team-field-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.fieldEmailPlaceholder}
                  required
                />
                <span className="team-field-help">{t.fieldEmailHelp}</span>
              </div>
            </div>

            {/* Role Radio Group */}
            <div className="team-field-group">
              <span className="team-field-label">{t.fieldRole}</span>
              <div className="team-radio-group">
                <label
                  className={`team-radio-item ${
                    role === "agent" ? "team-radio-item-active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value="agent"
                    checked={role === "agent"}
                    onChange={() => setRole("agent")}
                    style={{ marginBlockStart: "0.125rem" }}
                  />
                  <div className="team-radio-info">
                    <span className="team-radio-title">{t.roleAgentName}</span>
                    <span className="team-radio-desc">{t.roleAgentRadioDesc}</span>
                  </div>
                </label>

                <label
                  className={`team-radio-item ${
                    role === "admin" ? "team-radio-item-active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value="admin"
                    checked={role === "admin"}
                    onChange={() => setRole("admin")}
                    style={{ marginBlockStart: "0.125rem" }}
                  />
                  <div className="team-radio-info">
                    <span className="team-radio-title">{t.roleAdminName}</span>
                    <span className="team-radio-desc">{t.roleAdminRadioDesc}</span>
                  </div>
                </label>

                <label
                  className={`team-radio-item ${
                    role === "owner" ? "team-radio-item-active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value="owner"
                    checked={role === "owner"}
                    onChange={() => setRole("owner")}
                    style={{ marginBlockStart: "0.125rem" }}
                  />
                  <div className="team-radio-info">
                    <span className="team-radio-title">{t.roleOwnerName}</span>
                    <span className="team-radio-desc">{t.roleOwnerRadioDesc}</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Bays and people */}
            <div className="team-field-group">
              <span className="team-field-label">{t.sectionBays}</span>
              <div className="team-bays-row">
                {allBays.map((bay) => {
                  const active = bays.includes(bay);
                  return (
                    <button
                      key={bay}
                      type="button"
                      className={`team-bay-tag ${active ? "team-bay-tag-active" : ""}`}
                      onClick={() => toggleBay(bay)}
                    >
                      <span>{active ? "✓" : "○"}</span>
                      <span>{bay}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Callout box */}
            <div className="team-callout-box">
              <span className="team-callout-title">{t.calloutInviteSummary}</span>
              <span className="team-callout-desc">{t.calloutInviteDesc}</span>
            </div>

            {/* Explanatory bullets */}
            <div className="team-bullets-list">
              <div className="team-bullet-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none", marginTop: "0.125rem" }}>
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span>{t.bulletEmailLink}</span>
              </div>
              <div className="team-bullet-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none", marginTop: "0.125rem" }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>{t.bulletTeamImmediate}</span>
              </div>
            </div>
          </div>

          <footer className="team-modal-foot">
            <button
              type="button"
              className="btn quiet"
              onClick={onClose}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="btn volt"
            >
              {t.btnSendInvite}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
