"use client";

import React from "react";
import type { SettingsCopy } from "./copy";

interface SettingsStatesProps {
  t: SettingsCopy;
  state: "loading" | "agent" | "offline";
  onBackToWorkspace?: () => void;
}

export function SettingsStates({ t, state, onBackToWorkspace }: SettingsStatesProps) {
  if (state === "loading") {
    return (
      <div
        className="set-shell"
        aria-busy="true"
        aria-live="polite"
        style={{ minBlockSize: "28rem" }}
      >
        <div className="set-header">
          <h1 className="set-title">{t.loadingTitle}</h1>
          <p className="set-subtitle">{t.loadingSubtitle}</p>
        </div>

        <div className="set-layout">
          <div className="set-col-main">
            <div className="set-panel" style={{ minBlockSize: "14rem" }}>
              <div className="set-panel-header">
                <span className="set-panel-title">{t.youSection}</span>
              </div>
              <div className="set-panel-body">
                <div style={{ display: "flex", gap: "var(--sp-4, 1rem)", alignItems: "center" }}>
                  <div
                    style={{
                      inlineSize: "3.5rem",
                      blockSize: "3.5rem",
                      borderRadius: "50%",
                      background: "var(--line)",
                    }}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ inlineSize: "40%", blockSize: "0.75rem", background: "var(--line)", borderRadius: "0.125rem" }} />
                    <div style={{ inlineSize: "70%", blockSize: "0.75rem", background: "var(--line)", borderRadius: "0.125rem" }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="set-panel" style={{ minBlockSize: "10rem" }}>
              <div className="set-panel-header">
                <span className="set-panel-title">{t.signInEmailSection}</span>
              </div>
              <div className="set-panel-body">
                <div style={{ inlineSize: "60%", blockSize: "0.75rem", background: "var(--line)", borderRadius: "0.125rem" }} />
                <div style={{ inlineSize: "90%", blockSize: "0.75rem", background: "var(--line)", borderRadius: "0.125rem" }} />
              </div>
            </div>
          </div>

          <div className="set-col-side">
            <div className="set-panel" style={{ minBlockSize: "10rem" }}>
              <div className="set-panel-header">
                <span className="set-panel-title">{t.appearanceSection}</span>
              </div>
              <div className="set-panel-body">
                <div style={{ inlineSize: "100%", blockSize: "4rem", background: "var(--line)", borderRadius: "0.25rem" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === "agent") {
    return (
      <div className="set-shell">
        <div className="set-header">
          <div className="set-title-bar">
            <div className="set-title-group">
              <h1 className="set-title">{t.agentRestrictedTitle}</h1>
              <p className="set-subtitle">{t.agentRestrictedSubtitle}</p>
            </div>
            <div className="set-action-bar">
              <button
                type="button"
                className="u-btn u-btn--volt"
                onClick={onBackToWorkspace}
              >
                {t.backToWorkspace}
              </button>
            </div>
          </div>
        </div>

        <div className="set-warn-banner">
          {t.agentPermissionsNote}
        </div>
      </div>
    );
  }

  // offline banner wrapper
  return (
    <div className="set-warn-banner" style={{ marginBlockEnd: "var(--sp-4, 1rem)" }}>
      {t.offlineBannerText}
    </div>
  );
}
