"use client";

import React, { useState } from "react";
import { getCreditCopy, CreditLang } from "./copy";
import { formatQar, getAgeBadgeTone, getInitials, calculateCreditUsed } from "./logic";
import { FIXTURE_CUSTOMERS } from "./fixtures";

interface CreditPhoneProps {
  view?: "accounts" | "account";
  lang?: CreditLang;
  onSelectAccount?: (id: string) => void;
  onBack?: () => void;
  onOpenReminders?: () => void;
  onOpenPayment?: () => void;
  onOpenStatement?: () => void;
}

export function CreditPhone({
  view = "accounts",
  lang = "en",
  onSelectAccount,
  onBack,
  onOpenReminders,
  onOpenPayment,
  onOpenStatement,
}: CreditPhoneProps) {
  const t = getCreditCopy(lang);

  const [activeChip, setActiveChip] = useState("all");

  const bluefin = FIXTURE_CUSTOMERS[2];

  // 7 key accounts shown on phone drawing
  const phoneAccounts = FIXTURE_CUSTOMERS.slice(0, 7);

  if (view === "account") {
    return (
      <div className="crd-root" style={{ maxInlineSize: "24.375rem", margin: "0 auto" }}>
        {/* Mobile App Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBlockEnd: "var(--rule-hairline) solid var(--line)" }}>
          <button
            type="button"
            className="u-btn u-btn--quiet"
            style={{ padding: "0 0.5rem", fontSize: "1.25rem" }}
            onClick={onBack}
            aria-label="Back"
          >
            ←
          </button>
          <span style={{ fontWeight: 600, fontSize: "var(--font-size-base)" }}>{bluefin.name}</span>
          <div className="crd-avatar" style={{ inlineSize: "1.75rem", blockSize: "1.75rem", background: "var(--text)", color: "var(--inv)" }}>
            H
          </div>
        </div>

        {/* Owes Card (Carbon) */}
        <div className="crd-panel" style={{ background: "var(--band)", color: "var(--on-band)", border: "none", overflow: "hidden" }}>
          <div style={{ padding: "1rem 1rem 0.875rem 1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="crd-band-label">{t.owesLabel}</span>
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--band-muted)" }}>
                {bluefin.phone}
              </span>
            </div>
            <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--on-band)" }}>
              {t.owesBluefinVal}
            </span>
            <div className="crd-meter-track" style={{ blockSize: "0.375rem", background: "var(--band-line)" }}>
              <div className="crd-meter-fill" style={{ inlineSize: "84%", background: "var(--on-band)" }} />
            </div>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--band-muted)" }}>
              {t.meterUsedSub}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBlockStart: "var(--rule-hairline) solid var(--band-line)" }}>
            <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", borderInlineEnd: "var(--rule-hairline) solid var(--band-line)" }}>
              <span className="crd-band-label">{t.oldestDebtLabel}</span>
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", fontWeight: 600 }}>41 days</span>
            </div>
            <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", borderInlineEnd: "var(--rule-hairline) solid var(--band-line)" }}>
              <span className="crd-band-label">{t.promiseLabel}</span>
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", fontWeight: 600, color: "var(--on-band-warn)" }}>Passed 9 Nov</span>
            </div>
            <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span className="crd-band-label">{t.colFollowsUp}</span>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Hana</span>
            </div>
          </div>
        </div>

        {/* Promise Passed Alert Banner */}
        <div className="crd-refund-banner" style={{ padding: "0.625rem 0.875rem" }} role="alert">
          <span style={{ fontSize: "var(--font-size-xs)" }}>
            {lang === "ar" ? "وُعد بالسداد في ٩ نوفمبر. لم يُسدد شيء منذ ذلك الحين." : "Promised to pay by Mon 9 Nov. Nothing has been paid since."}
          </span>
          <button type="button" className="u-btn u-btn--line" style={{ blockSize: "1.75rem", fontSize: "var(--ui-micro)" }}>
            {lang === "ar" ? "موعد جديد" : "New date"}
          </button>
        </div>

        {/* 3 Action Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
          <button
            type="button"
            className="u-btn u-btn--line"
            style={{ blockSize: "2.5rem", justifyContent: "center" }}
            onClick={onOpenReminders}
          >
            {t.phoneRemindAction}
          </button>
          <button
            type="button"
            className="u-btn u-btn--line"
            style={{ blockSize: "2.5rem", justifyContent: "center" }}
            onClick={onOpenStatement}
          >
            {t.phoneStatementAction}
          </button>
          <button
            type="button"
            className="u-btn u-btn--line"
            style={{ blockSize: "2.5rem", justifyContent: "center" }}
          >
            {t.phoneSaleAction}
          </button>
        </div>

        {/* Not Paid Yet Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", textTransform: "uppercase" }}>
            {t.notPaidYetTitle}
          </span>

          <div className="crd-panel">
            <div className="crd-list-row" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>Invoice INV-2026-0358</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>Fri 2 Oct · QAR 500 paid</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="crd-badge crd-badge-warn">41 days</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>QAR 1,040</span>
              </div>
            </div>

            <div className="crd-list-row" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>Order 1028</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>Today 09:26</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="crd-badge crd-badge-n">{lang === "ar" ? "اليوم" : "Today"}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>QAR 224</span>
              </div>
            </div>
          </div>
        </div>

        {/* Entries Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", textTransform: "uppercase" }}>
              {t.entriesTitle}
            </span>
            <span style={{ fontSize: "var(--font-size-xs)", textDecoration: "underline", color: "var(--text)" }}>
              {t.phoneAll6}
            </span>
          </div>

          <div className="crd-panel">
            <div className="crd-list-row">
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", inlineSize: "3rem" }}>12 Nov</span>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Sale on account</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>Order 1028 · by Yusuf</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-sm)" }}>QAR 224</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>owes 1,264</span>
              </div>
            </div>

            <div className="crd-list-row">
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", inlineSize: "3rem" }}>14 Oct</span>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Paid by pay link</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>PL-2026-100782 · your provider</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-sm)" }}>QAR 500</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>owes 1,040</span>
              </div>
            </div>

            <div className="crd-list-row">
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", inlineSize: "3rem" }}>6 Oct</span>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Sale cancelled</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>CN-2026-0009 · by Omar</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-sm)" }}>−QAR 80</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>owes 1,540</span>
              </div>
            </div>

            <div className="crd-list-row">
              <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)", inlineSize: "3rem" }}>2 Oct</span>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>Sale on account</span>
                <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>INV-2026-0358 · by Omar</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-sm)" }}>QAR 1,620</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>owes 1,620</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reminder note */}
        <div style={{ padding: "0.625rem 0.75rem", borderRadius: "var(--radius-sm)", background: "var(--subtle)" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
            {t.phoneReminderTimelineNote}
          </span>
        </div>

        {/* Sticky Action Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {t.phoneWritesDownMoney}
          </span>
          <button
            type="button"
            className="u-btn u-btn--volt"
            style={{ blockSize: "2.75rem" }}
            onClick={onOpenPayment}
          >
            {t.btnRecordPayment}
          </button>
        </div>
      </div>
    );
  }

  // ── Frame 7: Phone · Credit List ──────────────────────────────────────────
  return (
    <div className="crd-root" style={{ maxInlineSize: "24.375rem", margin: "0 auto" }}>
      {/* Mobile App Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBlockEnd: "var(--rule-hairline) solid var(--line)" }}>
        <span style={{ fontWeight: 600, fontSize: "var(--font-size-base)" }}>Nuqta Car Care</span>
        <div className="crd-avatar" style={{ inlineSize: "1.75rem", blockSize: "1.75rem", background: "var(--text)", color: "var(--inv)" }}>
          H
        </div>
      </div>

      {/* Summary Card (Carbon) */}
      <div className="crd-panel" style={{ background: "var(--band)", color: "var(--on-band)", border: "none", overflow: "hidden" }}>
        <div style={{ padding: "1rem 1rem 0.875rem 1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          <span className="crd-band-label">{t.owedToYou}</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.625rem" }}>
            <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--on-band)" }}>
              {t.totalOwed}
            </span>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--band-muted)" }}>
              11 {lang === "ar" ? "عميل" : "customers"}
            </span>
          </div>

          <div className="crd-stack-bar" style={{ inlineSize: "100%" }}>
            <div className="crd-stack-segment" style={{ inlineSize: "52%", background: "var(--on-band)" }} />
            <div className="crd-stack-segment" style={{ inlineSize: "26%", background: "var(--band-faint)" }} />
            <div className="crd-stack-segment" style={{ inlineSize: "14%", background: "var(--on-band-warn)" }} />
            <div className="crd-stack-segment" style={{ inlineSize: "8%", background: "var(--on-band-bad)" }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBlockStart: "var(--rule-hairline) solid var(--band-line)" }}>
          <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", borderInlineEnd: "var(--rule-hairline) solid var(--band-line)" }}>
            <span className="crd-band-label">{t.over60DaysTitle}</span>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", fontWeight: 600 }}>QAR 2,150</span>
          </div>
          <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", borderInlineEnd: "var(--rule-hairline) solid var(--band-line)" }}>
            <span className="crd-band-label">{t.promisedTitle}</span>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", fontWeight: 600 }}>QAR 450</span>
          </div>
          <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span className="crd-band-label">{t.filterOverLimit}</span>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", fontWeight: 600 }}>1</span>
          </div>
        </div>
      </div>

      {/* Search & Filter chips */}
      <input
        type="search"
        className="crd-search"
        style={{ inlineSize: "100%", blockSize: "2.5rem" }}
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
      />

      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          type="button"
          className={`crd-chip ${activeChip === "all" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip("all")}
        >
          <span>{t.filterAll}</span>
          <span className="crd-chip-count">11</span>
        </button>

        <button
          type="button"
          className={`crd-chip ${activeChip === "over_30" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip(activeChip === "over_30" ? "all" : "over_30")}
        >
          <span>{t.filterOver30}</span>
          <span className="crd-chip-count">6</span>
        </button>

        <button
          type="button"
          className={`crd-chip ${activeChip === "promised" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip(activeChip === "promised" ? "all" : "promised")}
        >
          <span>{t.filterPromised}</span>
          <span className="crd-chip-count">1</span>
        </button>
      </div>

      {/* Accounts List (Cards) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {phoneAccounts.map((cust) => {
          const limitInfo = calculateCreditUsed(cust.owes, cust.limit);
          const ageTone = getAgeBadgeTone(cust.oldestDebtDays);

          return (
            <div
              key={cust.id}
              className="crd-panel"
              style={{ padding: "0.75rem 0.875rem", gap: "0.5rem", cursor: "pointer" }}
              onClick={() => onSelectAccount && onSelectAccount(cust.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{cust.name}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
                  {formatQar(cust.owes, lang)}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div className="crd-meter-track" style={{ inlineSize: "9.375rem" }}>
                  <div
                    className={`crd-meter-fill ${limitInfo.isOver ? "crd-meter-fill-bad" : ""}`}
                    style={{ inlineSize: `${Math.min(100, limitInfo.percent)}%` }}
                  />
                </div>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                  {limitInfo.percent}% {t.ofLimit} {formatQar(cust.limit, lang)}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", borderBlockStart: "var(--rule-hairline) solid var(--line)", paddingBlockStart: "0.375rem" }}>
                <span className={`crd-badge crd-badge-${ageTone}`}>
                  {cust.oldestDebtDays} {t.daysSuffix}
                </span>
                {cust.promise && (
                  <span className={`crd-badge crd-badge-${cust.promise.tone}`}>
                    {cust.promise.status}
                  </span>
                )}
                {cust.tag && cust.tag.tone === "bad" && (
                  <span className="crd-badge crd-badge-bad">
                    {cust.tag.text}
                  </span>
                )}
                <div style={{ marginInlineStart: "auto" }} className="crd-avatar">
                  {getInitials(cust.followsUp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom Action */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
          {t.phoneRemindCount}
        </span>
        <button
          type="button"
          className="u-btn u-btn--volt"
          style={{ blockSize: "2.75rem" }}
          onClick={onOpenReminders}
        >
          {t.btnSendReminders}
        </button>
      </div>
    </div>
  );
}
