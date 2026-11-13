"use client";

import React, { useState } from "react";
import type { SettingsCopy } from "./copy";
import { formatCodeDigits } from "./logic";

interface SettingsEmailDialogProps {
  t: SettingsCopy;
  currentEmail: string;
  onClose: () => void;
  onConfirm: (newEmail: string, code: string) => void;
}

export function SettingsEmailDialog({
  t,
  currentEmail,
  onClose,
  onConfirm,
}: SettingsEmailDialogProps) {
  const [newEmail] = useState("hana.saeed@nuqta.qa");
  const code = "730518";

  const digits = formatCodeDigits(code);

  return (
    <div className="set-scrim" role="dialog" aria-modal="true" aria-labelledby="set-email-dialog-title">
      <div className="set-modal" style={{ maxInlineSize: "32.5rem" }}>
        <div className="set-modal-header">
          <h2 id="set-email-dialog-title" className="set-modal-title">
            {t.changeEmailTitle}
          </h2>
          <button
            type="button"
            className="u-btn u-btn--quiet u-btn--sm"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="set-modal-body">
          {/* Steps indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-2, 0.5rem)",
              fontSize: "0.75rem",
              color: "var(--muted)",
            }}
          >
            <span style={{ color: "var(--text)", fontWeight: 500 }}>✓ 1. {t.stepNewAddress}</span>
            <span>›</span>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>2. {t.stepCode}</span>
          </div>

          {/* Address comparison banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--sp-3, 0.75rem)",
              background: "var(--subtle)",
              borderRadius: "var(--radius-sm, 0.25rem)",
            }}
          >
            <div>
              <span style={{ fontSize: "0.625rem", letterSpacing: "0.04em", color: "var(--muted)", display: "block" }}>
                {t.nowTag}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "var(--text)" }}>
                {currentEmail}
              </span>
            </div>
            <span style={{ color: "var(--muted)" }}>→</span>
            <div>
              <span style={{ fontSize: "0.625rem", letterSpacing: "0.04em", color: "var(--muted)", display: "block" }}>
                {t.newTag}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text)" }}>
                {newEmail}
              </span>
            </div>
          </div>

          {/* Instruction and Code input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3, 0.75rem)" }}>
            <p style={{ margin: 0, fontSize: "0.8125rem", lineHeight: 1.4, color: "var(--text)" }}>
              {t.codeInstruction}
            </p>

            <div className="set-code-grid">
              {digits.map((digit, idx) => (
                <div
                  key={idx}
                  className={`set-code-box ${idx === 5 ? "set-code-box--active" : ""}`}
                >
                  {digit}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.75rem",
                color: "var(--muted)",
              }}
            >
              <span>{t.codeExpiryNotice}</span>
              <span>{t.resendCountdown}</span>
            </div>
          </div>

          {/* Safety notices */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-2, 0.5rem)",
              paddingTop: "var(--sp-2, 0.5rem)",
              borderTop: "var(--rule-hairline, 0.0625rem solid var(--line))",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2, 0.5rem)", fontSize: "0.75rem", color: "var(--muted)", lineHeight: 1.4 }}>
              <span>✉</span>
              <span>{t.safetyOldAddress}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2, 0.5rem)", fontSize: "0.75rem", color: "var(--muted)", lineHeight: 1.4 }}>
              <span>🔒</span>
              <span>{t.safetySignOutOthers}</span>
            </div>
          </div>
        </div>

        <div className="set-modal-footer">
          <button type="button" className="u-btn u-btn--quiet" onClick={onClose}>
            {t.useAnotherAddressBtn}
          </button>
          {/* Exactly ONE Volt button for the modal */}
          <button
            type="button"
            className="u-btn u-btn--volt"
            onClick={() => onConfirm(newEmail, code)}
          >
            {t.confirmChangeEmailBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
