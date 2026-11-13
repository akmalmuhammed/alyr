"use client";

import React, { useState } from "react";
import { getCreditCopy, CreditLang } from "./copy";

interface CreditLimitDialogProps {
  lang?: CreditLang;
  onClose: () => void;
  onSave?: (limit: number, promiseDate?: string) => void;
}

export function CreditLimitDialog({
  lang = "en",
  onClose,
  onSave,
}: CreditLimitDialogProps) {
  const t = getCreditCopy(lang);

  const [limitType, setLimitType] = useState<"limit" | "no_limit" | "no_credit">("limit");
  const [limitVal, setLimitVal] = useState("1,500");
  const [payByDate, setPayByDate] = useState("Mon 16 Nov 2026");
  const [promiseAmt, setPromiseAmt] = useState("1,040");
  const [teamNote, setTeamNote] = useState("Their accountant says the transfer goes out on Sunday.");
  const [followsUp, setFollowsUp] = useState("Hana");

  return (
    <div className="crd-scrim" onClick={onClose}>
      <div
        className="crd-modal crd-modal-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.dialogLimitTitle}
      >
        <header className="crd-modal-header">
          <h2 className="crd-modal-title">{t.dialogLimitTitle}</h2>
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
          {/* Credit Limit Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {t.creditLimitLabel}
            </span>

            <div className="crd-panel">
              <label
                className="crd-list-row"
                style={{ cursor: "pointer", background: limitType === "limit" ? "var(--subtle)" : "transparent", alignItems: "flex-start" }}
              >
                <input
                  type="radio"
                  name="crd-limit-type"
                  checked={limitType === "limit"}
                  onChange={() => setLimitType("limit")}
                  style={{ marginBlockStart: "0.25rem" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{t.limitOptionUpTo}</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.35 }}>
                    {t.limitOptionUpToSub}
                  </span>
                </div>
              </label>

              <label
                className="crd-list-row"
                style={{ cursor: "pointer", background: limitType === "no_limit" ? "var(--subtle)" : "transparent", alignItems: "flex-start" }}
              >
                <input
                  type="radio"
                  name="crd-limit-type"
                  checked={limitType === "no_limit"}
                  onChange={() => setLimitType("no_limit")}
                  style={{ marginBlockStart: "0.25rem" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{t.limitOptionNoLimit}</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    {t.limitOptionNoLimitSub}
                  </span>
                </div>
              </label>

              <label
                className="crd-list-row"
                style={{ cursor: "pointer", background: limitType === "no_credit" ? "var(--subtle)" : "transparent", alignItems: "flex-start" }}
              >
                <input
                  type="radio"
                  name="crd-limit-type"
                  checked={limitType === "no_credit"}
                  onChange={() => setLimitType("no_credit")}
                  style={{ marginBlockStart: "0.25rem" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{t.limitOptionNoCredit}</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.35 }}>
                    {t.limitOptionNoCreditSub}
                  </span>
                </div>
              </label>
            </div>

            {limitType === "limit" && (
              <div className="crd-dialog-row-limit">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.fieldLimit}</label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <span style={{ position: "absolute", insetInlineStart: "0.75rem", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      QAR
                    </span>
                    <input
                      type="text"
                      className="crd-search"
                      style={{ inlineSize: "100%", paddingInlineStart: "2.5rem" }}
                      value={limitVal}
                      onChange={(e) => setLimitVal(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{t.meterOwesNow}</span>
                    <span style={{ fontFamily: "var(--font-ui-mono)", color: "var(--text-muted)" }}>{t.meterUsedSub}</span>
                  </div>
                  <div className="crd-meter-track" style={{ blockSize: "0.375rem" }}>
                    <div className="crd-meter-fill" style={{ inlineSize: "84%" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Promise to Pay Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t.promiseLabel}
              </span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--warn-text)", fontWeight: 500 }}>
                {t.noticeLastPromisePassed}
              </span>
            </div>

            <div className="crd-dialog-row-2">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.fieldPayBy}</label>
                <input
                  type="text"
                  className="crd-search"
                  style={{ inlineSize: "100%" }}
                  value={payByDate}
                  onChange={(e) => setPayByDate(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.fieldPromiseAmount}</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <span style={{ position: "absolute", insetInlineStart: "0.75rem", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    QAR
                  </span>
                  <input
                    type="text"
                    className="crd-search"
                    style={{ inlineSize: "100%", paddingInlineStart: "2.5rem" }}
                    value={promiseAmt}
                    onChange={(e) => setPromiseAmt(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.fieldNoteTeam}</label>
              <textarea
                className="crd-search"
                style={{ inlineSize: "100%", blockSize: "4rem", padding: "0.5rem 0.75rem" }}
                value={teamNote}
                onChange={(e) => setTeamNote(e.target.value)}
              />
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", lineHeight: 1.35 }}>
                {t.helpPromiseTeam}
              </span>
            </div>
          </div>

          {/* Follows Up Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.fieldFollowsUp}</label>
            <select
              className="crd-search"
              style={{ inlineSize: "12rem" }}
              value={followsUp}
              onChange={(e) => setFollowsUp(e.target.value)}
            >
              <option value="Hana">Hana</option>
              <option value="Omar">Omar</option>
              <option value="Salma">Salma</option>
              <option value="Bilal">Bilal</option>
              <option value="Reem">Reem</option>
              <option value="Yusuf">Yusuf</option>
            </select>
          </div>
        </div>

        <footer className="crd-modal-footer">
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {t.footerHistoryName}
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
              onClick={() => {
                if (onSave) onSave(150000, payByDate);
                onClose();
              }}
            >
              {t.btnSave}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
