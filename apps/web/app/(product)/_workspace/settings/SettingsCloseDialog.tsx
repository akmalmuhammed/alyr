"use client";

import React, { useState } from "react";
import type { SettingsCopy } from "./copy";
import { formatCodeDigits } from "./logic";

interface SettingsCloseDialogProps {
  t: SettingsCopy;
  onClose: () => void;
  onConfirmClose: () => void;
}

export function SettingsCloseDialog({
  t,
  onClose,
  onConfirmClose,
}: SettingsCloseDialogProps) {
  const [hasConfirmedCopy, setHasConfirmedCopy] = useState(true);

  const digits = formatCodeDigits("4819");

  return (
    <div className="set-scrim" role="dialog" aria-modal="true" aria-labelledby="set-close-dialog-title">
      <div className="set-modal" style={{ maxInlineSize: "37.5rem" }}>
        <div className="set-modal-header">
          <h2 id="set-close-dialog-title" className="set-modal-title">
            {t.closeAccountModalTitle}
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
          {/* Business identity badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-3, 0.75rem)",
              padding: "var(--sp-3, 0.75rem)",
              background: "var(--subtle)",
              borderRadius: "var(--radius-sm, 0.25rem)",
            }}
          >
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
              N
            </div>
            <div>
              <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text)", display: "block" }}>
                Nuqta Car Care
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {t.closeBusinessSummary}
              </span>
            </div>
          </div>

          {/* Timeline breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2, 0.5rem)" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)" }}>
              {t.whatHappensSection}
            </span>
            <div
              style={{
                border: "var(--rule-hairline, 0.0625rem solid var(--line))",
                borderRadius: "var(--radius-sm, 0.25rem)",
                overflow: "hidden",
              }}
            >
              <div className="set-list-row" style={{ paddingBlock: "var(--sp-2, 0.5rem)" }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.75rem", inlineSize: "7.5rem", flexShrink: 0 }}>
                  {t.stepToday}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text)", flex: 1 }}>
                  {t.stepTodayDesc}
                </span>
              </div>
              <div className="set-list-row" style={{ paddingBlock: "var(--sp-2, 0.5rem)" }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.75rem", inlineSize: "7.5rem", flexShrink: 0 }}>
                  {t.stepNotice}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text)", flex: 1 }}>
                  {t.stepNoticeDesc}
                </span>
              </div>
              <div className="set-list-row" style={{ paddingBlock: "var(--sp-2, 0.5rem)" }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.75rem", inlineSize: "7.5rem", flexShrink: 0 }}>
                  {t.stepClose}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text)", flex: 1 }}>
                  {t.stepCloseDesc}
                </span>
              </div>
              <div className="set-list-row" style={{ paddingBlock: "var(--sp-2, 0.5rem)", borderBottom: "none" }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.75rem", inlineSize: "7.5rem", flexShrink: 0, color: "var(--bad)" }}>
                  {t.stepErase}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text)", flex: 1 }}>
                  {t.stepEraseDesc}
                </span>
              </div>
            </div>
          </div>

          {/* Warning banner */}
          <div className="set-warn-banner">
            {t.closeWarningBanner}
          </div>

          {/* Confirmation checkbox */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--sp-2, 0.5rem)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={hasConfirmedCopy}
              onChange={(e) => setHasConfirmedCopy(e.target.checked)}
              style={{ marginTop: "0.125rem" }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text)" }}>
                {t.copyConfirmationCheck}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {t.copyConfirmationSub}
              </span>
            </div>
          </label>

          {/* Code input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2, 0.5rem)" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {t.emailCodeNotice}
            </span>
            <div className="set-code-grid">
              {digits.map((digit, idx) => (
                <div
                  key={idx}
                  className={`set-code-box ${idx === 4 ? "set-code-box--active" : ""}`}
                >
                  {digit}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="set-modal-footer" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            {t.closeAccountOwnersOnly}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
            <button type="button" className="u-btn u-btn--line" onClick={onClose}>
              {t.keepAccountBtn}
            </button>
            <button
              type="button"
              className="set-destructive-action"
              onClick={onConfirmClose}
            >
              {t.confirmCloseBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
