"use client";

import React, { useState } from "react";
import { getCreditCopy, CreditLang } from "./copy";
import { formatQar } from "./logic";

interface CreditPaymentDialogProps {
  lang?: CreditLang;
  onClose: () => void;
  onSave?: (amount: number, method: string) => void;
}

export function CreditPaymentDialog({
  lang = "en",
  onClose,
  onSave,
}: CreditPaymentDialogProps) {
  const t = getCreditCopy(lang);

  const [amountStr, setAmountStr] = useState("1,040");
  const [payMethod, setPayMethod] = useState<"cash" | "bank" | "card" | "cheque">("bank");
  const [reference, setReference] = useState("TRX-90412");

  const amountVal = parseFloat(amountStr.replace(/,/g, "")) || 0;
  const owesNow = 1264;
  const owesAfter = Math.max(0, owesNow - amountVal);

  return (
    <div className="crd-scrim" onClick={onClose}>
      <div
        className="crd-modal crd-modal-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.dialogPaymentTitle}
      >
        <header className="crd-modal-header">
          <h2 className="crd-modal-title">{t.dialogPaymentTitle}</h2>
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
          {/* Customer Debt Overview Box */}
          <div style={{ background: "var(--subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.1875rem" }}>
              <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{t.summaryBluefinOwes}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.summaryBluefinDebt}</span>
            </div>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-lg)", fontWeight: 600 }}>
              {formatQar(126400, lang)}
            </span>
          </div>

          {/* Form Fields: Amount, Date, Reference */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.25fr", gap: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-muted)" }}>
                {t.fieldAmountPaid}
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span style={{ position: "absolute", insetInlineStart: "0.75rem", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  QAR
                </span>
                <input
                  type="text"
                  className="crd-search"
                  style={{ inlineSize: "100%", paddingInlineStart: "2.5rem" }}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  aria-label={t.fieldAmountPaid}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-muted)" }}>
                {t.fieldPaidOn}
              </label>
              <select className="crd-search" style={{ inlineSize: "100%" }} aria-label={t.fieldPaidOn}>
                <option value="today">{t.fieldPaidOnVal}</option>
                <option value="yesterday">Wed 11 Nov</option>
                <option value="other">Earlier date…</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-muted)" }}>
                {t.fieldReferenceOptional}
              </label>
              <input
                type="text"
                className="crd-search"
                style={{ inlineSize: "100%" }}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="TRX-..."
                aria-label={t.fieldReferenceOptional}
              />
            </div>
          </div>

          {/* Payment Method Radio Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {t.howPaidLabel}
            </label>

            <div className="crd-panel">
              <label
                className="crd-list-row"
                style={{ cursor: "pointer", background: payMethod === "cash" ? "var(--subtle)" : "transparent" }}
              >
                <input
                  type="radio"
                  name="crd-pay-method"
                  checked={payMethod === "cash"}
                  onChange={() => setPayMethod("cash")}
                />
                <span style={{ fontWeight: 500 }}>{t.payMethodCash}</span>
              </label>

              <label
                className="crd-list-row"
                style={{ cursor: "pointer", background: payMethod === "bank" ? "var(--subtle)" : "transparent" }}
              >
                <input
                  type="radio"
                  name="crd-pay-method"
                  checked={payMethod === "bank"}
                  onChange={() => setPayMethod("bank")}
                />
                <span style={{ fontWeight: 500 }}>{t.payMethodBank}</span>
                <span style={{ marginInlineStart: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  {t.payMethodBankHint}
                </span>
              </label>

              <label
                className="crd-list-row"
                style={{ cursor: "pointer", background: payMethod === "card" ? "var(--subtle)" : "transparent" }}
              >
                <input
                  type="radio"
                  name="crd-pay-method"
                  checked={payMethod === "card"}
                  onChange={() => setPayMethod("card")}
                />
                <span style={{ fontWeight: 500 }}>{t.payMethodCard}</span>
                <span style={{ marginInlineStart: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  {t.payMethodCardHint}
                </span>
              </label>

              <label
                className="crd-list-row"
                style={{ cursor: "pointer", background: payMethod === "cheque" ? "var(--subtle)" : "transparent" }}
              >
                <input
                  type="radio"
                  name="crd-pay-method"
                  checked={payMethod === "cheque"}
                  onChange={() => setPayMethod("cheque")}
                />
                <span style={{ fontWeight: 500 }}>{t.payMethodCheque}</span>
                <span style={{ marginInlineStart: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  {t.payMethodChequeHint}
                </span>
              </label>
            </div>
          </div>

          {/* What it pays off breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {t.whatPaysOffTitle}
            </label>

            <div className="crd-panel">
              <div className="crd-list-row">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>Invoice INV-2026-0358</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Fri 2 Oct · 41 days</span>
                </div>
                <span style={{ fontFamily: "var(--font-ui-mono)", color: "var(--text-muted)" }}>QAR 1,040</span>
                <span>→</span>
                <span className="crd-badge crd-badge-n" style={{ background: "var(--ok-soft)", color: "var(--ok-text)" }}>
                  {t.paidInFull}
                </span>
              </div>

              <div className="crd-list-row">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>Order 1028</span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Today 09:26</span>
                </div>
                <span style={{ fontFamily: "var(--font-ui-mono)", color: "var(--text-muted)" }}>QAR 224</span>
                <span>→</span>
                <span className="crd-badge crd-badge-n">
                  QAR 224 {t.stillOwed}
                </span>
              </div>

              <div className="crd-list-row" style={{ background: "var(--subtle)" }}>
                <span style={{ fontWeight: 600 }}>{t.owesAfterPaymentLabel}</span>
                <span style={{ marginInlineStart: "auto", fontFamily: "var(--font-ui-mono)", fontWeight: 600, fontSize: "var(--font-size-base)" }}>
                  {formatQar(owesAfter * 100, lang)}
                </span>
              </div>
            </div>
          </div>

          {/* Consequence Bullets */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", fontSize: "var(--font-size-xs)", color: "var(--text)" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span>📄</span>
              <span>{t.bulletReceipt}</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span>✓</span>
              <span>{t.bulletPromiseClose}</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span>ℹ</span>
              <span>{t.bulletHonestyMoney}</span>
            </div>
          </div>
        </div>

        <footer className="crd-modal-footer">
          <div style={{ marginInlineStart: "auto", display: "flex", gap: "0.5rem" }}>
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
                if (onSave) onSave(amountVal * 100, payMethod);
                onClose();
              }}
            >
              {t.btnSavePayment}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
