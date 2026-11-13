"use client";

import React, { useState } from "react";
import { teamCopy, type Lang } from "./copy";
import { getInitials, type RoleKey, type TeamMember } from "./logic";

export type TeamPersonDrawerProps = {
  lang?: Lang;
  person: TeamMember;
  onClose: () => void;
  onRemove?: (id: string) => void;
  onSave?: (person: TeamMember) => void;
};

export function TeamPersonDrawer({
  lang = "en",
  person,
  onClose,
  onRemove,
  onSave,
}: TeamPersonDrawerProps) {
  const t = teamCopy[lang];
  const [selectedRole, setSelectedRole] = useState<RoleKey>(person.role);
  const [bays, setBays] = useState<string[]>(person.bays || ["Bay 1", "Bay 2"]);

  const allBays = ["Bay 1", "Bay 2", "Detailing", "Ceramic"];

  function toggleBay(bay: string) {
    if (bays.includes(bay)) {
      setBays(bays.filter((b) => b !== bay));
    } else {
      setBays([...bays, bay]);
    }
  }

  const roleCapitalized =
    selectedRole === "owner"
      ? t.roleOwnerName
      : selectedRole === "admin"
      ? t.roleAdminName
      : t.roleAgentName;

  return (
    <div
      className="team-drawer-scrim"
      onClick={onClose}
      style={{ direction: lang === "ar" ? "rtl" : "ltr" }}
    >
      <div
        className="team-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-drawer-name"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Drawer Header ─────────────────────────────────────────────── */}
        <header className="team-drawer-head">
          <div className="team-drawer-title-row">
            <h2 id="team-drawer-name" className="team-drawer-name">
              {person.name}
            </h2>
            <span
              style={{
                fontSize: "var(--ui-micro)",
                padding: "0.125rem 0.375rem",
                borderRadius: "var(--radius-sm)",
                border: "var(--rule-hairline) solid var(--line)",
                color: "var(--text-muted)",
              }}
            >
              {roleCapitalized}
            </span>
            {person.lastSeen?.tone === "volt" && (
              <span className="team-status-tag team-status-volt">
                {t.activeNow}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn quiet"
            onClick={onClose}
            aria-label={t.cancel}
          >
            ✕
          </button>
        </header>

        {/* ── Drawer Body ───────────────────────────────────────────────── */}
        <div className="team-drawer-body">
          {/* Person overview */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
            <div className="team-avatar" style={{ inlineSize: "2.75rem", blockSize: "2.75rem", fontSize: "var(--font-size-md)" }}>
              {getInitials(person.name)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
              <span style={{ fontSize: "var(--font-size-md)", fontWeight: 600 }}>{person.name}</span>
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {person.email}
              </span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {person.joinedDate ? t.drawerJoined : ""}
              </span>
            </div>
          </div>

          {/* Section: Role */}
          <section className="team-drawer-section">
            <div className="team-drawer-section-head">
              <span className="team-drawer-section-label">{t.sectionRole}</span>
              <button type="button" className="team-link-action">
                {t.whatRolesMayDo}
              </button>
            </div>
            <div className="team-radio-group">
              <label
                className={`team-radio-item ${
                  selectedRole === "owner" ? "team-radio-item-active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="drawer-role"
                  value="owner"
                  checked={selectedRole === "owner"}
                  onChange={() => setSelectedRole("owner")}
                  style={{ marginBlockStart: "0.125rem" }}
                />
                <div className="team-radio-info">
                  <span className="team-radio-title">{t.roleOwnerName}</span>
                  <span className="team-radio-desc">{t.roleOwnerRadioDesc}</span>
                </div>
              </label>

              <label
                className={`team-radio-item ${
                  selectedRole === "admin" ? "team-radio-item-active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="drawer-role"
                  value="admin"
                  checked={selectedRole === "admin"}
                  onChange={() => setSelectedRole("admin")}
                  style={{ marginBlockStart: "0.125rem" }}
                />
                <div className="team-radio-info">
                  <span className="team-radio-title">{t.roleAdminName}</span>
                  <span className="team-radio-desc">{t.roleAdminRadioDesc}</span>
                </div>
              </label>

              <label
                className={`team-radio-item ${
                  selectedRole === "agent" ? "team-radio-item-active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="drawer-role"
                  value="agent"
                  checked={selectedRole === "agent"}
                  onChange={() => setSelectedRole("agent")}
                  style={{ marginBlockStart: "0.125rem" }}
                />
                <div className="team-radio-info">
                  <span className="team-radio-title">{t.roleAgentName}</span>
                  <span className="team-radio-desc">{t.roleAgentRadioDesc}</span>
                </div>
              </label>
            </div>
          </section>

          {/* Section: Bays and people */}
          <section className="team-drawer-section">
            <span className="team-drawer-section-label">{t.sectionBays}</span>
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
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {t.baysHint}
            </span>
          </section>

          {/* Section: Permissions */}
          <section className="team-drawer-section">
            <span className="team-drawer-section-label">{t.sectionPermissions}</span>
            <div className="team-perm-list">
              <div className="team-perm-row">
                <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓</span>
                <span>{t.permReplyInbox}</span>
              </div>
              <div className="team-perm-row">
                <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓</span>
                <span>{t.permConfirmOrders}</span>
              </div>
              <div className="team-perm-row">
                <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓</span>
                <span>{t.permMarkStock}</span>
              </div>
              <div className="team-perm-row team-perm-disabled">
                <span style={{ color: "var(--text-faint)" }}>✕</span>
                <span>{t.permMarkPaid}</span>
                <span style={{ marginInlineStart: "auto", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                  {t.permNoteOrdersSettings}
                </span>
              </div>
              <div className="team-perm-row team-perm-disabled">
                <span style={{ color: "var(--text-faint)" }}>✕</span>
                <span>{t.permSeeSales}</span>
              </div>
              <div className="team-perm-row team-perm-disabled">
                <span style={{ color: "var(--text-faint)" }}>✕</span>
                <span>{t.permChangeSettings}</span>
              </div>
            </div>
          </section>

          {/* Section: Signed in on */}
          <section className="team-drawer-section">
            <div className="team-drawer-section-head">
              <span className="team-drawer-section-label">{t.sectionDevices}</span>
              <button type="button" className="team-link-action">
                {t.signOutEverywhere}
              </button>
            </div>
            <div className="team-devices-list">
              <div className="team-device-row">
                <div className="team-device-info">
                  <span className="team-device-title">Chrome on Windows</span>
                  <span className="team-device-sub">Counter · signed in Sun 8 Nov 06:58</span>
                </div>
                <span className="team-status-tag team-status-volt">{t.activeNow}</span>
              </div>
              <div className="team-device-row">
                <div className="team-device-info">
                  <span className="team-device-title">Safari on iPhone</span>
                  <span className="team-device-sub">Last used Wed 11 Nov 21:40 · signed in 2 Nov</span>
                </div>
                <button type="button" className="team-link-action">
                  {t.signOutDevice}
                </button>
              </div>
            </div>
          </section>

          {/* Section: Her own phone */}
          <section className="team-drawer-section">
            <span className="team-drawer-section-label">{t.sectionOwnPhone}</span>
            <div style={{ background: "var(--surface-subtle)", padding: "0.75rem", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="team-status-tag team-status-ok">{t.linked}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                  number ending •••• 0131 · since 7 Nov 2026
                </span>
              </div>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t.ownPhoneDesc}
              </span>
            </div>
          </section>

          {/* Section: Her work now */}
          <section className="team-drawer-section">
            <div className="team-drawer-section-head">
              <span className="team-drawer-section-label">{t.sectionWorkNow}</span>
              <button type="button" className="team-link-action">
                {t.openHerWeek}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <div className="team-kv-row">
                <span className="team-kv-key">{t.kvOpenConvs}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="team-status-tag team-status-warn">{t.tagWaiting}</span>
                  <span className="team-kv-val">4</span>
                </div>
              </div>
              <div className="team-kv-row">
                <span className="team-kv-key">{t.kvOrdersHandled}</span>
                <span className="team-kv-val" style={{ fontSize: "var(--ui-micro)" }}>
                  5 · Order 1039, Order 1038, Order 1034, Order 1032, Order 1029
                </span>
              </div>
            </div>
          </section>

          {/* Section: History */}
          <section className="team-drawer-section">
            <span className="team-drawer-section-label">{t.sectionHistory}</span>
            <div className="team-timeline">
              <div className="team-timeline-item">
                <span className="team-timeline-dot team-timeline-dot-ok" />
                <div className="team-timeline-content">
                  <span className="team-timeline-title">Linked her own phone</span>
                  <span className="team-timeline-sub">Sat 7 Nov 2026 · by Salma</span>
                </div>
              </div>
              <div className="team-timeline-item">
                <span className="team-timeline-dot" />
                <div className="team-timeline-content">
                  <span className="team-timeline-title">Hana gave her Bay 2</span>
                  <span className="team-timeline-sub">Mon 14 Sep 2026</span>
                </div>
              </div>
              <div className="team-timeline-item">
                <span className="team-timeline-dot" />
                <div className="team-timeline-content">
                  <span className="team-timeline-title">Signed in for the first time</span>
                  <span className="team-timeline-sub">Mon 2 Mar 2026 08:14</span>
                </div>
              </div>
              <div className="team-timeline-item">
                <span className="team-timeline-dot" />
                <div className="team-timeline-content">
                  <span className="team-timeline-title">Hana invited her as an agent</span>
                  <span className="team-timeline-sub">Mon 2 Mar 2026 07:50</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Drawer Footer Actions ─────────────────────────────────────── */}
        <footer className="team-drawer-foot">
          <div className="team-drawer-foot-actions">
            <button
              type="button"
              className="btn volt"
              onClick={() => onSave?.({ ...person, role: selectedRole, bays })}
            >
              {t.saveChanges}
            </button>
            <button
              type="button"
              className="btn quiet"
              onClick={onClose}
            >
              {t.cancel}
            </button>
          </div>
          <button
            type="button"
            className="btn bad"
            onClick={() => onRemove?.(person.id)}
          >
            {t.removeFromTeam}
          </button>
        </footer>
      </div>
    </div>
  );
}
