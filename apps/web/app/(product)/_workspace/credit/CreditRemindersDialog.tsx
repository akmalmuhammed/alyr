"use client";

import React, { useState } from "react";
import { getCreditCopy, CreditLang } from "./copy";
import { FIXTURE_REMINDERS_DATA } from "./fixtures";

interface CreditRemindersDialogProps {
  lang?: CreditLang;
  onClose: () => void;
  onSend?: () => void;
}

export function CreditRemindersDialog({
  lang = "en",
  onClose,
  onSend,
}: CreditRemindersDialogProps) {
  const t = getCreditCopy(lang);

  const [selected, setSelected] = useState<Record<string, boolean>>({
    "bayview-school": true,
    bluefin: true,
    "omar-ali": true,
  });

  const [previewTone, setPreviewTone] = useState<"gentle" | "firm" | "final">("gentle");

  const toggleSelect = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="crd-scrim" onClick={onClose}>
      <div
        className="crd-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.dialogRemindersTitle}
      >
        <header className="crd-modal-header">
          <h2 className="crd-modal-title">{t.dialogRemindersTitle}</h2>
          <button
            type="button"
            className="u-btn u-btn--quiet"
            style={{ padding: "0 0.5rem" }}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="crd-modal-body" tabIndex={0}>
          {/* Top filter row */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <span style={{ fontSize: "var(--font-size-sm)" }}>{t.filterRemindersLabel}</span>
            <select
              className="crd-search"
              style={{ inlineSize: "13rem" }}
              aria-label={t.filterRemindersLabel}
            >
              <option value="30">{t.filterRemindersOpt}</option>
              <option value="60">60 days old or more</option>
              <option value="90">90 days old or more</option>
            </select>
            <span style={{ marginInlineStart: "auto", fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {t.remindersMatchCount}
            </span>
          </div>

          {/* 2-column layout: Lists on left, WhatsApp preview on right */}
          <div className="crd-reminders-grid">
            {/* Left Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* 3 will be reminded */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {t.remindersSectionSend}
                </span>

                <div className="crd-panel">
                  {FIXTURE_REMINDERS_DATA.willRemind.map((item) => (
                    <div
                      key={item.id}
                      className="crd-list-row"
                      style={{ cursor: "pointer", background: selected[item.id] ? "var(--subtle)" : "transparent" }}
                      onClick={() => toggleSelect(item.id)}
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[item.id]}
                        onChange={() => toggleSelect(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={item.name}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{item.name}</span>
                        <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                          {item.sub}
                        </span>
                      </div>
                      <span className={`crd-badge crd-badge-${item.tagTone}`}>
                        {item.tone}
                      </span>
                      <div style={{ inlineSize: "10.5rem", display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                        <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 500 }}>{item.goes}</span>
                        <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{item.goesSub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 are skipped */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {t.remindersSectionSkip}
                </span>

                <div className="crd-panel">
                  {FIXTURE_REMINDERS_DATA.skipped.map((item) => (
                    <div key={item.name} className="crd-list-row">
                      <span style={{ inlineSize: "0.5rem", blockSize: "0.5rem", borderRadius: "var(--radius-full)", border: "var(--rule-hairline) solid var(--text-muted)" }} />
                      <div style={{ inlineSize: "9.375rem", display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                        <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>{item.name}</span>
                        <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{item.sub}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                        <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 500 }}>{item.why}</span>
                        <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{item.whySub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Consequence Bullets */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", padding: "0.5rem 0" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "var(--font-size-xs)", color: "var(--text)" }}>
                  <span>→</span>
                  <span>{t.ruleBulletPayLink}</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "var(--font-size-xs)", color: "var(--text)" }}>
                  <span>⏳</span>
                  <span>{t.ruleBulletWording}</span>
                </div>
              </div>
            </div>

            {/* Right Column: WhatsApp Preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)" }}>
                {t.reminderPreviewTitle}
              </span>

              {/* Tone Tabs */}
              <div className="crd-tabs" role="tablist" style={{ border: "none" }}>
                <button
                  type="button"
                  className={`crd-tab ${previewTone === "gentle" ? "crd-tab-active" : ""}`}
                  style={{ padding: "0.25rem 0.5rem", fontSize: "var(--font-size-xs)" }}
                  onClick={() => setPreviewTone("gentle")}
                >
                  {t.toneGentle}
                </button>
                <button
                  type="button"
                  className={`crd-tab ${previewTone === "firm" ? "crd-tab-active" : ""}`}
                  style={{ padding: "0.25rem 0.5rem", fontSize: "var(--font-size-xs)" }}
                  onClick={() => setPreviewTone("firm")}
                >
                  {t.toneFirm}
                </button>
                <button
                  type="button"
                  className={`crd-tab ${previewTone === "final" ? "crd-tab-active" : ""}`}
                  style={{ padding: "0.25rem 0.5rem", fontSize: "var(--font-size-xs)" }}
                  onClick={() => setPreviewTone("final")}
                >
                  {t.toneFinal}
                </button>
              </div>

              {/* WhatsApp Green Bubble & Buttons */}
              <div className="crd-wa-paper">
                <div className="crd-wa-bubble">
                  <span>{t.previewBubble}</span>
                  <span className="crd-wa-time">{t.previewBubbleTime}</span>
                </div>
                <button type="button" className="crd-wa-action">
                  {t.btnPayNow}
                </button>
                <button type="button" className="crd-wa-action">
                  {t.btnPromiseWeek}
                </button>
              </div>

              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t.promiseWeekHelp}
              </span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t.bayviewTemplateNote}
              </span>
            </div>
          </div>
        </div>

        <footer className="crd-modal-footer">
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {t.noticePressButton}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="u-btn u-btn--quiet"
              onClick={onClose}
            >
              {t.btnCancel}
            </button>
            <button
              type="button"
              className="u-btn u-btn--volt"
              onClick={onSend || onClose}
            >
              {selectedCount === 3 ? t.btnSend3Reminders : `Send ${selectedCount} reminders`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
