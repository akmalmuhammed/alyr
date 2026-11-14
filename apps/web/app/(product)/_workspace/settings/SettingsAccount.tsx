"use client";

import React from "react";
import type { SettingsCopy } from "./copy";
import type { AccountProfile } from "./fixtures";
import type { UserDevice, BusinessItem, ThemeChoice, NoticeChannel, LanguageChoice } from "./logic";

interface SettingsAccountProps {
  t: SettingsCopy;
  profile: AccountProfile;
  devices: UserDevice[];
  businesses: BusinessItem[];
  theme: ThemeChoice;
  language: LanguageChoice;
  noticesChannel: NoticeChannel;
  onThemeChange: (theme: ThemeChoice) => void;
  onLanguageChange: (lang: LanguageChoice) => void;
  onNoticesChange: (ch: NoticeChannel) => void;
  onChangeEmailClick: () => void;
  onSwitchBusiness: (id: string) => void;
}

export function SettingsAccount({
  t,
  profile,
  devices,
  businesses,
  theme,
  language,
  noticesChannel,
  onThemeChange,
  onLanguageChange,
  onNoticesChange,
  onChangeEmailClick,
  onSwitchBusiness,
}: SettingsAccountProps) {
  return (
    <div className="set-layout">
      {/* Left column: Profile, Email, Devices, Businesses */}
      <div className="set-col-main">
        {/* You panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <div className="set-panel-title-wrap">
              <h2 className="set-panel-title">{t.youSection}</h2>
              <span className="set-panel-subtitle">{t.ownerBadge}</span>
            </div>
            <a href="#roles" className="set-tab-link">
              {t.rolesLink}
            </a>
          </div>
          <div className="set-panel-body">
            <div className="set-user-row">
              <div className="set-avatar" aria-hidden="true">
                {profile.name.charAt(0)}
              </div>
              <div className="set-field-group" style={{ flex: 1 }}>
                <div className="set-form-row">
                  <div className="set-field-group">
                    <label className="set-field-label" htmlFor="set-name-input">
                      {t.yourNameLabel}
                    </label>
                    <input
                      id="set-name-input"
                      type="text"
                      className="set-field-input"
                      defaultValue={profile.name}
                    />
                  </div>
                  <div className="set-field-group">
                    <label className="set-field-label" htmlFor="set-reply-name-input">
                      {t.replyNameLabel}
                    </label>
                    <input
                      id="set-reply-name-input"
                      type="text"
                      className="set-field-input"
                      defaultValue={profile.replyName}
                    />
                    <span className="set-field-help">{t.replyNameHelp}</span>
                  </div>
                </div>

                <div className="set-form-row" style={{ marginTop: "var(--sp-3, 0.75rem)" }}>
                  <div className="set-field-group">
                    <div className="set-field-label-row">
                      <label className="set-field-label" htmlFor="set-wa-input">
                        {t.whatsappLabel}
                      </label>
                      <span className="u-tag u-tag--muted" style={{ fontSize: "0.625rem" }}>
                        {t.whatsappLinkedTag}
                      </span>
                    </div>
                    <input
                      id="set-wa-input"
                      type="text"
                      dir="ltr"
                      className="set-field-input"
                      defaultValue={profile.whatsapp}
                    />
                    <span className="set-field-help">{t.whatsappHelp}</span>
                  </div>
                  <div className="set-field-group">
                    <label className="set-field-label" htmlFor="set-role-input">
                      {t.roleLabel}
                    </label>
                    <input
                      id="set-role-input"
                      type="text"
                      className="set-field-input"
                      readOnly
                      defaultValue={t.ownerBadge}
                    />
                    <span className="set-field-help">{t.roleHelp}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sign-in email panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <h2 className="set-panel-title">{t.signInEmailSection}</h2>
            <button
              type="button"
              className="u-btn u-btn--line u-btn--sm"
              onClick={onChangeEmailClick}
            >
              {t.changeEmailBtn}
            </button>
          </div>
          <div className="set-panel-body">
            <div className="set-list-row" style={{ padding: 0 }}>
              <div className="set-list-info">
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  {profile.email}
                </span>
                <span className="set-list-sub">{t.codeHelp}</span>
              </div>
              <div style={{ textAlign: "end", flexShrink: 0 }}>
                <span style={{ fontSize: "0.625rem", letterSpacing: "0.04em", color: "var(--muted)", display: "block" }}>
                  {t.lastSignInLabel}
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text)" }}>
                  {profile.lastSignIn}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Devices panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <div className="set-panel-title-wrap">
              <h2 className="set-panel-title">{t.devicesSection}</h2>
              <span className="set-panel-subtitle">{t.deviceCount}</span>
            </div>
            <a href="#signout-all" className="set-tab-link">
              {t.signOutEverywhere}
            </a>
          </div>
          <div>
            {devices.map((device) => (
              <div key={device.id} className="set-list-row">
                <div className="set-list-info">
                  <span className="set-list-title">{device.name}</span>
                  <span className="set-list-sub">
                    {device.location} · {device.signedInAt}
                    {device.lastUsedAt ? ` · ${device.lastUsedAt}` : ""}
                    {device.expiresAt ? ` · ${device.expiresAt}` : ""}
                  </span>
                </div>
                {device.isCurrent ? (
                  <span className="u-tag u-tag--ok">{t.thisDeviceTag}</span>
                ) : (
                  <button type="button" className="u-btn u-btn--line u-btn--sm">
                    {t.signOutBtn}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="set-panel-footer">{t.deviceDurationNote}</div>
        </div>

        {/* Your businesses panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <div className="set-panel-title-wrap">
              <h2 className="set-panel-title">{t.businessesSection}</h2>
              <span className="set-panel-subtitle">{t.businessesSubtitle}</span>
            </div>
          </div>
          <div>
            {businesses.map((biz) => (
              <div key={biz.id} className="set-list-row">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3, 0.75rem)" }}>
                  <div
                    style={{
                      inlineSize: "2.25rem",
                      blockSize: "2.25rem",
                      borderRadius: "var(--radius-sm, 0.25rem)",
                      background: "var(--band)",
                      color: "var(--volt)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "1rem",
                    }}
                  >
                    {biz.initial}
                  </div>
                  <div className="set-list-info">
                    <span className="set-list-title">
                      {biz.nameEn} · <span>{biz.nameAr}</span>
                    </span>
                    <span className="set-list-sub">
                      {biz.role === "owner" ? t.ownerBadge : biz.role} · {biz.peopleCount} people
                    </span>
                  </div>
                </div>
                {biz.isOpenNow ? (
                  <span className="u-tag u-tag--ink">{t.openNowTag}</span>
                ) : (
                  <button
                    type="button"
                    className="u-btn u-btn--line u-btn--sm"
                    onClick={() => onSwitchBusiness(biz.id)}
                  >
                    {t.openBtn}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="set-panel-footer">{t.businessSeparationNote}</div>
        </div>
      </div>

      {/* Right column: Language, Appearance, Notices, Sign out */}
      <div className="set-col-side">
        {/* Language panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <h2 className="set-panel-title">{t.languageSection}</h2>
          </div>
          <div>
            <label
              className="set-list-row"
              style={{ cursor: "pointer", background: language === "en" ? "var(--subtle)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
                <input
                  type="radio"
                  name="set-lang"
                  checked={language === "en"}
                  onChange={() => onLanguageChange("en")}
                />
                <span className="set-list-title">{t.englishOption}</span>
              </div>
              <span className="set-list-sub">{t.englishSub}</span>
            </label>
            <label
              className="set-list-row"
              style={{ cursor: "pointer", background: language === "ar" ? "var(--subtle)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
                <input
                  type="radio"
                  name="set-lang"
                  checked={language === "ar"}
                  onChange={() => onLanguageChange("ar")}
                />
                <span className="set-list-title">
                  {t.arabicOption}
                </span>
              </div>
              <span className="set-list-sub">{t.arabicSub}</span>
            </label>
          </div>
          <div className="set-panel-footer">{t.languageHelp}</div>
        </div>

        {/* Appearance panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <h2 className="set-panel-title">{t.appearanceSection}</h2>
          </div>
          <div className="set-panel-body">
            <div className="set-theme-grid">
              <button
                type="button"
                className={`set-theme-tile ${theme === "light" ? "set-theme-tile--active" : ""}`}
                onClick={() => onThemeChange("light")}
              >
                <div className="set-theme-preview set-theme-preview--light">
                  <div className="set-mock-line" style={{ inlineSize: "60%" }} />
                  <div className="set-mock-line" style={{ inlineSize: "85%" }} />
                  <div className="set-mock-bar" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <input
                    type="radio"
                    name="set-theme"
                    checked={theme === "light"}
                    onChange={() => onThemeChange("light")}
                  />
                  <span style={{ fontSize: "0.75rem", fontWeight: theme === "light" ? 600 : 400 }}>
                    {t.lightOption}
                  </span>
                </div>
              </button>

              <button
                type="button"
                className={`set-theme-tile ${theme === "dark" ? "set-theme-tile--active" : ""}`}
                onClick={() => onThemeChange("dark")}
              >
                <div className="set-theme-preview set-theme-preview--dark">
                  <div className="set-mock-line" style={{ inlineSize: "60%" }} />
                  <div className="set-mock-line" style={{ inlineSize: "85%" }} />
                  <div className="set-mock-bar" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <input
                    type="radio"
                    name="set-theme"
                    checked={theme === "dark"}
                    onChange={() => onThemeChange("dark")}
                  />
                  <span style={{ fontSize: "0.75rem", fontWeight: theme === "dark" ? 600 : 400 }}>
                    {t.darkOption}
                  </span>
                </div>
              </button>

              <button
                type="button"
                className={`set-theme-tile ${theme === "auto" ? "set-theme-tile--active" : ""}`}
                onClick={() => onThemeChange("auto")}
              >
                <div className="set-theme-preview set-theme-preview--auto">
                  <div className="set-theme-split-light">
                    <div className="set-mock-line" style={{ inlineSize: "60%" }} />
                    <div className="set-mock-bar" />
                  </div>
                  <div className="set-theme-split-dark">
                    <div className="set-mock-line" style={{ inlineSize: "60%" }} />
                    <div className="set-mock-bar" />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <input
                    type="radio"
                    name="set-theme"
                    checked={theme === "auto"}
                    onChange={() => onThemeChange("auto")}
                  />
                  <span style={{ fontSize: "0.75rem", fontWeight: theme === "auto" ? 600 : 400 }}>
                    {t.autoOption}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Notices panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <h2 className="set-panel-title">{t.noticesSection}</h2>
            <a href="#alerts-matrix" className="set-tab-link">
              {t.noticesLink}
            </a>
          </div>
          <div>
            <label
              className="set-list-row"
              style={{ cursor: "pointer", background: noticesChannel === "workspace" ? "var(--subtle)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
                <input
                  type="radio"
                  name="set-alerts"
                  checked={noticesChannel === "workspace"}
                  onChange={() => onNoticesChange("workspace")}
                />
                <span className="set-list-title">{t.noticeWorkspace}</span>
              </div>
              <span className="set-list-sub">{t.noticeWorkspaceSub}</span>
            </label>
            <label
              className="set-list-row"
              style={{ cursor: "pointer", background: noticesChannel === "whatsapp" ? "var(--subtle)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
                <input
                  type="radio"
                  name="set-alerts"
                  checked={noticesChannel === "whatsapp"}
                  onChange={() => onNoticesChange("whatsapp")}
                />
                <span className="set-list-title">{t.noticeWhatsapp}</span>
              </div>
              <span className="set-list-sub" dir="ltr">{profile.whatsapp}</span>
            </label>
            <label
              className="set-list-row"
              style={{ cursor: "pointer", background: noticesChannel === "both" ? "var(--subtle)" : undefined }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
                <input
                  type="radio"
                  name="set-alerts"
                  checked={noticesChannel === "both"}
                  onChange={() => onNoticesChange("both")}
                />
                <span className="set-list-title">{t.noticeBoth}</span>
              </div>
            </label>
          </div>
          <div className="set-panel-footer">{t.noticeHelp}</div>
        </div>

        {/* Sign out panel */}
        <div className="set-panel">
          <div className="set-list-row">
            <div className="set-list-info">
              <span className="set-list-title">{t.signOutSection}</span>
              <span className="set-list-sub">{t.signOutSubtitle}</span>
            </div>
            <button type="button" className="u-btn u-btn--line u-btn--sm">
              {t.signOutDeviceBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
