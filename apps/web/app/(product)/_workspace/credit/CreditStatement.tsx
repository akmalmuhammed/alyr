"use client";

import React, { useState } from "react";
import { getCreditCopy, CreditLang } from "./copy";

interface CreditStatementProps {
  lang?: CreditLang;
  onBack?: () => void;
  onSend?: () => void;
}

export function CreditStatement({
  lang = "en",
  onBack,
  onSend,
}: CreditStatementProps) {
  const t = getCreditCopy(lang);

  const [togglePaid, setTogglePaid] = useState(true);
  const [toggleAge, setToggleAge] = useState(true);
  const [toggleLink, setToggleLink] = useState(true);
  const [toggleBank, setToggleBank] = useState(true);

  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  return (
    <div className="crd-root">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <header className="crd-header">
        <div className="crd-title-group">
          <h1 className="crd-title">{t.statementDocTitle}</h1>
          <p className="crd-subtitle">{t.statementSubtitle}</p>
        </div>

        <div className="crd-actions">
          <button type="button" className="u-btn u-btn--line">
            {t.btnPrint}
          </button>
          <button type="button" className="u-btn u-btn--line">
            {t.btnPdf}
          </button>
          <button
            type="button"
            className="u-btn u-btn--volt"
            onClick={onSend || onBack}
          >
            {t.btnSendStatement}
          </button>
        </div>
      </header>

      {/* ── Main Layout: Paper stage on left, Options on right ────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 25rem", gap: "1.25rem", alignItems: "start" }}>
        {/* Left Paper Stage */}
        <div className="crd-statement-stage">
          <div style={{ inlineSize: "41.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600 }}>{lang === "ar" ? "معاينة" : "Preview"}</span>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>{t.previewMeta}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button type="button" className="u-btn u-btn--quiet" style={{ blockSize: "1.75rem", padding: "0 0.5rem" }}>‹</button>
              <span style={{ fontFamily: "var(--font-ui-mono)" }}>{t.pageCount}</span>
              <button type="button" className="u-btn u-btn--quiet" style={{ blockSize: "1.75rem", padding: "0 0.5rem" }}>›</button>
            </div>
          </div>

          {/* A4 Paper Document Preview */}
          <div className="crd-paper">
            {/* Document Header */}
            <div className="crd-paper-header">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>{t.companyName}</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.companyDetails}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.companyPhone}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.125rem" }}>
                <span style={{ fontSize: "var(--font-size-xl)", fontWeight: 700 }}>{t.statementDocTitle}</span>
                <span style={{ fontSize: "var(--font-size-base)", color: "var(--text-muted)", fontWeight: 500 }}>{t.statementDocArTitle}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.docRef}</span>
              </div>
            </div>

            {/* Recipient & Period */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", padding: "0.75rem 0", borderBlock: "var(--rule-hairline) solid var(--line)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.1875rem" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", textTransform: "uppercase", color: "var(--text-muted)" }}>{t.toLabel}</span>
                <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>Bluefin Events</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>+974 5555 0188</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.1875rem" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", textTransform: "uppercase", color: "var(--text-muted)" }}>{t.periodLabel}</span>
                <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{t.periodVal}</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.periodSub}</span>
              </div>
            </div>

            {/* Summary 4-Col Row */}
            <div className="crd-paper-summary-band">
              <div className="crd-paper-sum-col">
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.statOwedAtStart}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, fontSize: "var(--font-size-sm)" }}>QAR 0</span>
              </div>
              <div className="crd-paper-sum-col">
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.statPutOnAccount}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, fontSize: "var(--font-size-sm)" }}>QAR 2,124</span>
              </div>
              <div className="crd-paper-sum-col">
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.statPaid}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, fontSize: "var(--font-size-sm)" }}>QAR 860</span>
              </div>
              <div className="crd-paper-sum-col" style={{ background: "var(--subtle)" }}>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", fontWeight: 600 }}>{t.statYouOwe}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600, fontSize: "var(--font-size-base)" }}>QAR 1,264</span>
              </div>
            </div>

            {/* Statement Entries Table */}
            <div className="crd-table-scroll" tabIndex={0} role="region" aria-label={t.statementDocTitle}>
              <table className="crd-table" style={{ fontSize: "var(--font-size-xs)" }}>
                <thead>
                  <tr>
                    <th className="crd-th" style={{ inlineSize: "4.5rem" }}>{t.colDate}</th>
                    <th className="crd-th">{t.colWhat}</th>
                    <th className="crd-th crd-th-right" style={{ inlineSize: "6.5rem" }}>{t.statPutOnAccount}</th>
                    <th className="crd-th crd-th-right" style={{ inlineSize: "5rem" }}>{t.statPaid}</th>
                    <th className="crd-th crd-th-right" style={{ inlineSize: "5.5rem" }}>{t.colBalance}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="crd-tr">
                    <td className="crd-td" style={{ fontFamily: "var(--font-ui-mono)" }}>5 Sep</td>
                    <td className="crd-td">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 500 }}>Invoice INV-2026-0297</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--ui-micro)" }}>6 × Full wash</span>
                      </div>
                    </td>
                    <td className="crd-td crd-td-right">360</td>
                    <td className="crd-td crd-td-right">–</td>
                    <td className="crd-td crd-td-right" style={{ fontWeight: 500 }}>360</td>
                  </tr>

                  <tr className="crd-tr">
                    <td className="crd-td" style={{ fontFamily: "var(--font-ui-mono)" }}>21 Sep</td>
                    <td className="crd-td">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 500 }}>Payment</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--ui-micro)" }}>Bank transfer · TRX-71920</span>
                      </div>
                    </td>
                    <td className="crd-td crd-td-right">–</td>
                    <td className="crd-td crd-td-right">360</td>
                    <td className="crd-td crd-td-right" style={{ fontWeight: 500 }}>0</td>
                  </tr>

                  <tr className="crd-tr">
                    <td className="crd-td" style={{ fontFamily: "var(--font-ui-mono)" }}>2 Oct</td>
                    <td className="crd-td">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 500 }}>Invoice INV-2026-0358</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--ui-micro)" }}>6 × Interior detail, 8 × Full wash, 3 × Engine bay</span>
                      </div>
                    </td>
                    <td className="crd-td crd-td-right">1,620</td>
                    <td className="crd-td crd-td-right">–</td>
                    <td className="crd-td crd-td-right" style={{ fontWeight: 500 }}>1,620</td>
                  </tr>

                  <tr className="crd-tr">
                    <td className="crd-td" style={{ fontFamily: "var(--font-ui-mono)" }}>6 Oct</td>
                    <td className="crd-td">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 500 }}>Credit note CN-2026-0009</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--ui-micro)" }}>1 × Engine bay clean not done</span>
                      </div>
                    </td>
                    <td className="crd-td crd-td-right">−80</td>
                    <td className="crd-td crd-td-right">–</td>
                    <td className="crd-td crd-td-right" style={{ fontWeight: 500 }}>1,540</td>
                  </tr>

                  <tr className="crd-tr">
                    <td className="crd-td" style={{ fontFamily: "var(--font-ui-mono)" }}>14 Oct</td>
                    <td className="crd-td">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 500 }}>Payment</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--ui-micro)" }}>Pay link · credit card</span>
                      </div>
                    </td>
                    <td className="crd-td crd-td-right">–</td>
                    <td className="crd-td crd-td-right">500</td>
                    <td className="crd-td crd-td-right" style={{ fontWeight: 500 }}>1,040</td>
                  </tr>

                  <tr className="crd-tr">
                    <td className="crd-td" style={{ fontFamily: "var(--font-ui-mono)" }}>12 Nov</td>
                    <td className="crd-td">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 500 }}>Order 1028</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--ui-micro)" }}>12 × Air freshener, 2 × Glass cleaner</span>
                      </div>
                    </td>
                    <td className="crd-td crd-td-right">224</td>
                    <td className="crd-td crd-td-right">–</td>
                    <td className="crd-td crd-td-right" style={{ fontWeight: 500 }}>1,264</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Balance Row */}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1.5rem", padding: "0.5rem 0" }}>
              <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{t.youOweOnDate}</span>
              <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 700, fontSize: "var(--font-size-xl)" }}>
                QAR 1,264
              </span>
            </div>

            {/* Debt Age Breakdown */}
            {toggleAge && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {t.howOldTitle}
                </span>
                <div className="crd-paper-summary-band">
                  <div className="crd-paper-sum-col">
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.age0to30}</span>
                    <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, fontSize: "var(--font-size-xs)" }}>QAR 224</span>
                  </div>
                  <div className="crd-paper-sum-col">
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.age31to60}</span>
                    <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, fontSize: "var(--font-size-xs)" }}>QAR 1,040</span>
                  </div>
                  <div className="crd-paper-sum-col">
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.age61to90}</span>
                    <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, fontSize: "var(--font-size-xs)" }}>QAR 0</span>
                  </div>
                  <div className="crd-paper-sum-col">
                    <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.ageOver90}</span>
                    <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, fontSize: "var(--font-size-xs)" }}>QAR 0</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", padding: "0.75rem 0", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
              {toggleLink && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.1875rem" }}>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    {t.payOnlineTitle}
                  </span>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", fontWeight: 500 }}>
                    {t.payOnlineUrl}
                  </span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                    {t.payOnlineSub}
                  </span>
                </div>
              )}

              {toggleBank && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.1875rem" }}>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    {t.bankTransferTitle}
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 500 }}>{t.bankTransferAccount}</span>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text)" }}>{t.bankTransferIban}</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.bankTransferRef}</span>
                </div>
              )}
            </div>

            {/* Arabic Footer Note */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--ui-micro)", color: "var(--text-muted)", borderBlockStart: "var(--rule-hairline) solid var(--line)", paddingBlockStart: "0.5rem" }}>
              <span>{t.tellWithin7Days}</span>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 500 }}>{t.thankYouAr}</span>
            </div>
          </div>
        </div>

        {/* Right Sidebar Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Panel: What is on it */}
          <section className="crd-panel" aria-label={t.whatIsOnItTitle}>
            <div className="crd-panel-header">
              <h2 className="crd-panel-title">{t.whatIsOnItTitle}</h2>
            </div>

            <div style={{ padding: "0.875rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.375rem", borderBlockEnd: "var(--rule-hairline) solid var(--line)" }}>
              <label style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.periodFieldLabel}</label>
              <select className="crd-search" style={{ inlineSize: "100%" }} aria-label={t.periodFieldLabel}>
                <option value="default">{t.periodFieldVal}</option>
                <option value="custom">Custom dates…</option>
              </select>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                {t.periodFieldHelp}
              </span>
            </div>

            <div>
              <label className="crd-list-row" style={{ cursor: "pointer", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                  <span style={{ fontWeight: 500 }}>{t.togglePaidLines}</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.togglePaidLinesSub}</span>
                </div>
                <input
                  type="checkbox"
                  checked={togglePaid}
                  onChange={(e) => setTogglePaid(e.target.checked)}
                />
              </label>

              <label className="crd-list-row" style={{ cursor: "pointer", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                  <span style={{ fontWeight: 500 }}>{t.toggleHowOld}</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.toggleHowOldSub}</span>
                </div>
                <input
                  type="checkbox"
                  checked={toggleAge}
                  onChange={(e) => setToggleAge(e.target.checked)}
                />
              </label>

              <label className="crd-list-row" style={{ cursor: "pointer", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                  <span style={{ fontWeight: 500 }}>{t.togglePayLink}</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.togglePayLinkSub}</span>
                </div>
                <input
                  type="checkbox"
                  checked={toggleLink}
                  onChange={(e) => setToggleLink(e.target.checked)}
                />
              </label>

              <label className="crd-list-row" style={{ cursor: "pointer", justifyContent: "space-between" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                  <span style={{ fontWeight: 500 }}>{t.toggleBankDetails}</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.toggleBankDetailsSub}</span>
                </div>
                <input
                  type="checkbox"
                  checked={toggleBank}
                  onChange={(e) => setToggleBank(e.target.checked)}
                />
              </label>
            </div>
          </section>

          {/* Panel: Send to */}
          <section className="crd-panel" aria-label={t.sendToTitle}>
            <div className="crd-panel-header">
              <h2 className="crd-panel-title">{t.sendToTitle}</h2>
              <button
                type="button"
                className="u-btn u-btn--quiet"
                style={{ padding: 0, textDecoration: "underline", color: "var(--text)", font: "inherit" }}
              >
                {t.changeContactsLink}
              </button>
            </div>

            <div>
              <label className="crd-list-row" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>+974 5555 0188</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.sendToWhatsAppSub}</span>
                </div>
              </label>

              <label className="crd-list-row" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>accounts@bluefinevents.example</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{t.sendToEmailSub}</span>
                </div>
              </label>
            </div>

            {/* WhatsApp Preview message */}
            <div style={{ padding: "0.875rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem", background: "var(--surface)" }}>
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {t.withThisMessage}
              </span>
              <div className="crd-wa-paper">
                <div className="crd-wa-bubble">
                  <span>{t.statementMessageBubble}</span>
                  <span className="crd-wa-time">{t.statementBubbleMeta}</span>
                </div>
              </div>
            </div>

            <div style={{ padding: "0.75rem 1.25rem", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
              <span className="crd-rule-text">{t.ruleStatementSent}</span>
            </div>
          </section>

          {/* Panel: Earlier statements */}
          <section className="crd-panel" aria-label={t.earlierStatementsTitle}>
            <div className="crd-panel-header">
              <h2 className="crd-panel-title">{t.earlierStatementsTitle}</h2>
              <span className="crd-panel-subtitle">2</span>
            </div>

            <div>
              <div className="crd-list-row">
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>ST-2026-0006</span>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Sun 1 Nov</span>
                <span className="crd-badge crd-badge-n" style={{ marginInlineStart: "auto", background: "var(--ok-soft)", color: "var(--ok-text)" }}>
                  Read
                </span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>QAR 1,040</span>
              </div>

              <div className="crd-list-row">
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>ST-2026-0003</span>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Thu 1 Oct</span>
                <span className="crd-badge crd-badge-n" style={{ marginInlineStart: "auto", background: "var(--ok-soft)", color: "var(--ok-text)" }}>
                  Read
                </span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>QAR 0</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
