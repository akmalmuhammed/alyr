"use client";

import React, { useState, useEffect } from "react";
import { SETTINGS_COPY } from "./copy";
import {
  FIXTURE_PROFILE,
  FIXTURE_DEVICES,
  FIXTURE_BUSINESSES,
  FIXTURE_DOWNLOADS,
  FIXTURE_REQUESTS,
  FIXTURE_TERMS,
} from "./fixtures";
import type { ThemeChoice, LanguageChoice, NoticeChannel } from "./logic";
import { SettingsAccount } from "./SettingsAccount";
import { SettingsPrivacy } from "./SettingsPrivacy";
import { SettingsEmailDialog } from "./SettingsEmailDialog";
import { SettingsCloseDialog } from "./SettingsCloseDialog";
import { SettingsStates } from "./SettingsStates";
import "./settings.css";

export interface SettingsWorkbenchProps {
  initialTab?: "account" | "privacy";
  initialDialog?: "email" | "close";
  initialState?: "loading" | "agent" | "offline";
  initialLang?: LanguageChoice;
  initialTheme?: ThemeChoice;
}

export function SettingsWorkbench({
  initialTab = "account",
  initialDialog,
  initialState,
  initialLang = "en",
  initialTheme = "light",
}: SettingsWorkbenchProps) {
  const [tab, setTab] = useState<"account" | "privacy">(initialTab);
  const [dialog, setDialog] = useState<"email" | "close" | null>(initialDialog || null);
  const [activeState, setActiveState] = useState<"loading" | "agent" | "offline" | null>(initialState || null);
  const [language, setLanguage] = useState<LanguageChoice>(initialLang);
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme);
  const [noticesChannel, setNoticesChannel] = useState<NoticeChannel>("both");
  const [profile, setProfile] = useState(FIXTURE_PROFILE);

  const t = SETTINGS_COPY[language];

  // Sync DOM document direction, language, and theme
  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.setAttribute("data-theme", theme === "auto" ? "light" : theme);
  }, [language, theme]);

  const hasOpenDialog = dialog !== null;

  if (activeState === "loading") {
    return (
      <div className="set-preview-wrap">
        <SettingsStates t={t} state="loading" />
      </div>
    );
  }

  if (activeState === "agent") {
    return (
      <div className="set-preview-wrap">
        <SettingsStates
          t={t}
          state="agent"
          onBackToWorkspace={() => setActiveState(null)}
        />
      </div>
    );
  }

  return (
    <div className="set-preview-wrap">
      <div className="set-shell">
        {/* Top bar with time, status, bell */}
        <div className="set-top-nav">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
            <span style={{ fontFamily: "monospace", fontSize: "0.6875rem", color: "var(--muted)" }}>
              Thu 12 Nov · Doha 09:40
            </span>
            <span className="u-tag u-tag--volt" style={{ fontSize: "0.625rem" }}>
              WhatsApp live
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
            <span style={{ fontSize: "0.875rem" }} aria-label="Notifications">
              🔔
            </span>
          </div>
        </div>

        {/* Offline notice banner if in offline state */}
        {activeState === "offline" && (
          <SettingsStates t={t} state="offline" />
        )}

        {/* Workspace section tabs */}
        <div className="set-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "account"}
            className={`set-tab-link ${tab === "account" ? "set-tab-link--active" : ""}`}
            onClick={() => setTab("account")}
          >
            {t.accountTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "privacy"}
            className={`set-tab-link ${tab === "privacy" ? "set-tab-link--active" : ""}`}
            onClick={() => setTab("privacy")}
          >
            {t.privacyTab}
          </button>
        </div>

        {/* Screen Title & Action Bar */}
        <div className="set-title-bar">
          <div className="set-title-group">
            <h1 className="set-title">
              {tab === "account" ? t.accountTitle : t.privacyTitle}
            </h1>
            <p className="set-subtitle">
              {tab === "account" ? t.accountSubtitle : t.privacySubtitle}
            </p>
          </div>

          <div className="set-action-bar">
            {tab === "account" ? (
              <>
                <span className="set-status-note">{t.savedDate}</span>
                <button
                  type="button"
                  className={`u-btn ${hasOpenDialog ? "u-btn--line" : "u-btn--volt"}`}
                >
                  {t.saveChanges}
                </button>
              </>
            ) : (
              <>
                <span className="set-status-note">{t.actionConfirmNotice}</span>
                <button
                  type="button"
                  className={`u-btn ${hasOpenDialog ? "u-btn--line" : "u-btn--volt"}`}
                  onClick={() => alert("Downloading business data ZIP...")}
                >
                  {t.downloadAllBtn}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Main Tab Views */}
        {tab === "account" ? (
          <SettingsAccount
            t={t}
            profile={profile}
            devices={FIXTURE_DEVICES}
            businesses={FIXTURE_BUSINESSES}
            theme={theme}
            language={language}
            noticesChannel={noticesChannel}
            onThemeChange={setTheme}
            onLanguageChange={setLanguage}
            onNoticesChange={setNoticesChannel}
            onChangeEmailClick={() => setDialog("email")}
            onSwitchBusiness={(bizId) => {
              const selected = FIXTURE_BUSINESSES.find((b) => b.id === bizId);
              if (selected) {
                setProfile((prev) => ({
                  ...prev,
                  role: selected.role,
                }));
              }
            }}
          />
        ) : (
          <SettingsPrivacy
            t={t}
            downloads={FIXTURE_DOWNLOADS}
            requests={FIXTURE_REQUESTS}
            terms={FIXTURE_TERMS}
            onCloseAccountClick={() => setDialog("close")}
          />
        )}
      </div>

      {/* Modal Dialogs */}
      {dialog === "email" && (
        <SettingsEmailDialog
          t={t}
          currentEmail={profile.email}
          onClose={() => setDialog(null)}
          onConfirm={(newEmail) => {
            setProfile((prev) => ({ ...prev, email: newEmail }));
            setDialog(null);
          }}
        />
      )}

      {dialog === "close" && (
        <SettingsCloseDialog
          t={t}
          onClose={() => setDialog(null)}
          onConfirmClose={() => {
            setDialog(null);
            alert("Account close request scheduled for Thu 19 Nov.");
          }}
        />
      )}
    </div>
  );
}
