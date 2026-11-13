"use client";

import React, { useState } from "react";
import { getCreditCopy, CreditLang } from "./copy";
import {
  formatQar,
  calculateCreditUsed,
  getAgeBadgeTone,
  getInitials,
  filterCreditAccounts,
  sortCreditAccounts,
} from "./logic";
import {
  FIXTURE_CUSTOMERS,
  FIXTURE_OPEN_ORDERS,
  FIXTURE_RECENT_PAYMENTS,
} from "./fixtures";

interface CreditAccountsProps {
  lang?: CreditLang;
  hasOpenDialog?: boolean;
  onOpenAccount?: (id: string) => void;
  onOpenReminders?: () => void;
  onOpenRecordSale?: () => void;
  onOpenRecordPayment?: () => void;
}

export function CreditAccounts({
  lang = "en",
  hasOpenDialog = false,
  onOpenAccount,
  onOpenReminders,
  onOpenRecordSale,
  onOpenRecordPayment,
}: CreditAccountsProps) {
  const t = getCreditCopy(lang);

  const [activeTab, setActiveTab] = useState<"owe_money" | "owe_nothing" | "all">("owe_money");
  const [search, setSearch] = useState("");
  const [activeChip, setActiveChip] = useState("all");
  const [followsUp, setFollowsUp] = useState("Anyone");
  const [sortBy, setSortBy] = useState<"owes_desc" | "name_asc" | "oldest_desc">("owes_desc");

  const filtered = filterCreditAccounts(FIXTURE_CUSTOMERS, {
    tab: activeTab,
    search,
    chip: activeChip,
    followsUp,
  });

  const sorted = sortCreditAccounts(filtered, sortBy);

  const totalOwedDirhams = 984000;
  const customersOwedCount = 11;

  // Counts for tabs and chips
  const oweMoneyCount = FIXTURE_CUSTOMERS.filter((c) => c.owes > 0).length;
  const oweNothingCount = FIXTURE_CUSTOMERS.filter((c) => c.owes === 0).length;
  const totalCreditCount = FIXTURE_CUSTOMERS.length;
  const over30Count = FIXTURE_CUSTOMERS.filter((c) => c.oldestDebtDays > 30).length;
  const promisedCount = FIXTURE_CUSTOMERS.filter((c) => c.promise && !c.promise.passed).length;
  const promisePassedCount = FIXTURE_CUSTOMERS.filter((c) => c.promise && c.promise.passed).length;
  const overLimitCount = FIXTURE_CUSTOMERS.filter((c) => c.owes > c.limit).length;
  const saidStopCount = FIXTURE_CUSTOMERS.filter((c) => c.tag?.text === "Said stop").length;

  return (
    <div className="crd-root">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <header className="crd-header">
        <div className="crd-title-group">
          <h1 className="crd-title">{t.creditTitle}</h1>
          <p className="crd-subtitle">{t.creditSubtitle}</p>
        </div>
        <div className="crd-actions">
          <button
            type="button"
            className="u-btn u-btn--line"
            onClick={onOpenRecordSale}
          >
            {t.btnRecordSale}
          </button>
          <button
            type="button"
            className="u-btn u-btn--line"
            onClick={onOpenRecordPayment}
          >
            {t.btnRecordPayment}
          </button>
          <button
            type="button"
            className={`u-btn ${hasOpenDialog ? "u-btn--line" : "u-btn--volt"}`}
            onClick={onOpenReminders}
          >
            {t.btnSendReminders}
          </button>
        </div>
      </header>

      {/* ── Owed Carbon Band ──────────────────────────────────────────────── */}
      <section className="crd-band" aria-label={t.owedToYou}>
        {/* Left main: total owed, stack bar, and 4 age categories */}
        <div className="crd-band-main">
          <span className="crd-band-label">{t.owedToYou}</span>
          <div className="crd-band-hero-row">
            <span className="crd-band-total">{formatQar(totalOwedDirhams, lang)}</span>
            <span className="crd-band-count">
              {customersOwedCount} {lang === "ar" ? "عميل" : "customers"}
            </span>
          </div>

          {/* Proportional Stack Bar: 52% 0-30, 26% 31-60, 14% 61-90, 8% 90+ */}
          <div className="crd-stack-bar">
            <div className="crd-stack-segment" style={{ inlineSize: "52%", background: "var(--on-band)" }} />
            <div className="crd-stack-segment" style={{ inlineSize: "26%", background: "var(--band-faint)" }} />
            <div className="crd-stack-segment" style={{ inlineSize: "14%", background: "var(--on-band-warn)" }} />
            <div className="crd-stack-segment" style={{ inlineSize: "8%", background: "var(--on-band-bad)" }} />
          </div>

          <div className="crd-band-legend">
            <div className="crd-legend-item">
              <div className="crd-legend-header">
                <span className="crd-legend-dot" style={{ background: "var(--on-band)" }} />
                <span className="crd-legend-label">{t.age0to30}</span>
              </div>
              <span className="crd-legend-val">{t.valAge0to30}</span>
            </div>

            <div className="crd-legend-item">
              <div className="crd-legend-header">
                <span className="crd-legend-dot" style={{ background: "var(--band-faint)" }} />
                <span className="crd-legend-label">{t.age31to60}</span>
              </div>
              <span className="crd-legend-val">{t.valAge31to60}</span>
            </div>

            <div className="crd-legend-item">
              <div className="crd-legend-header">
                <span className="crd-legend-dot" style={{ background: "var(--on-band-warn)" }} />
                <span className="crd-legend-label">{t.age61to90}</span>
              </div>
              <span className="crd-legend-val">{t.valAge61to90}</span>
            </div>

            <div className="crd-legend-item">
              <div className="crd-legend-header">
                <span className="crd-legend-dot" style={{ background: "var(--on-band-bad)" }} />
                <span className="crd-legend-label">{t.ageOver90}</span>
              </div>
              <span className="crd-legend-val">{t.valAgeOver90}</span>
            </div>
          </div>
        </div>

        {/* 3 Right Stat Columns */}
        <div className="crd-band-col">
          <span className="crd-band-label">{t.over60DaysTitle}</span>
          <span className="crd-band-col-val">{t.over60DaysVal}</span>
          <span className="crd-band-col-sub">{t.over60DaysSub}</span>
        </div>

        <div className="crd-band-col">
          <span className="crd-band-label">{t.promisedTitle}</span>
          <span className="crd-band-col-val">{t.promisedVal}</span>
          <span className="crd-band-col-sub">{t.promisedSub}</span>
        </div>

        <div className="crd-band-col">
          <span className="crd-band-label">{t.paidInNovTitle}</span>
          <span className="crd-band-col-val">{t.paidInNovVal}</span>
          <span className="crd-band-col-sub">{t.paidInNovSub}</span>
        </div>
      </section>

      {/* ── Tabs (UTabs) ──────────────────────────────────────────────────── */}
      <div className="crd-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "owe_money"}
          className={`crd-tab ${activeTab === "owe_money" ? "crd-tab-active" : ""}`}
          onClick={() => setActiveTab("owe_money")}
        >
          <span>{t.tabOweMoney}</span>
          <span className="crd-tab-count">{oweMoneyCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "owe_nothing"}
          className={`crd-tab ${activeTab === "owe_nothing" ? "crd-tab-active" : ""}`}
          onClick={() => setActiveTab("owe_nothing")}
        >
          <span>{t.tabOweNothing}</span>
          <span className="crd-tab-count">{oweNothingCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`crd-tab ${activeTab === "all" ? "crd-tab-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          <span>{t.tabAllWithCredit}</span>
          <span className="crd-tab-count">{totalCreditCount}</span>
        </button>
      </div>

      {/* ── Search & Filter Chips ─────────────────────────────────────────── */}
      <div className="crd-filters">
        <input
          type="search"
          className="crd-search"
          placeholder={t.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t.searchPlaceholder}
        />

        <button
          type="button"
          className={`crd-chip ${activeChip === "all" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip("all")}
        >
          <span>{t.filterAll}</span>
          <span className="crd-chip-count">{activeTab === "all" ? totalCreditCount : oweMoneyCount}</span>
        </button>

        <button
          type="button"
          className={`crd-chip ${activeChip === "over_30" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip(activeChip === "over_30" ? "all" : "over_30")}
        >
          <span>{t.filterOver30}</span>
          <span className="crd-chip-count">{over30Count}</span>
        </button>

        <button
          type="button"
          className={`crd-chip ${activeChip === "promised" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip(activeChip === "promised" ? "all" : "promised")}
        >
          <span>{t.filterPromised}</span>
          <span className="crd-chip-count">{promisedCount}</span>
        </button>

        <button
          type="button"
          className={`crd-chip ${activeChip === "promise_passed" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip(activeChip === "promise_passed" ? "all" : "promise_passed")}
        >
          <span>{t.filterPromisePassed}</span>
          <span className="crd-chip-count">{promisePassedCount}</span>
        </button>

        <button
          type="button"
          className={`crd-chip ${activeChip === "over_limit" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip(activeChip === "over_limit" ? "all" : "over_limit")}
        >
          <span>{t.filterOverLimit}</span>
          <span className="crd-chip-count">{overLimitCount}</span>
        </button>

        <button
          type="button"
          className={`crd-chip ${activeChip === "said_stop" ? "crd-chip-active" : ""}`}
          onClick={() => setActiveChip(activeChip === "said_stop" ? "all" : "said_stop")}
        >
          <span>{t.filterSaidStop}</span>
          <span className="crd-chip-count">{saidStopCount}</span>
        </button>

        <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <select
            className="crd-search"
            style={{ inlineSize: "8.5rem" }}
            value={followsUp}
            onChange={(e) => setFollowsUp(e.target.value)}
            aria-label={t.followsUpPrefix}
          >
            <option value="Anyone">{t.followsUpPrefix}: {t.followsUpAnyone}</option>
            <option value="Hana">Hana</option>
            <option value="Omar">Omar</option>
            <option value="Salma">Salma</option>
            <option value="Bilal">Bilal</option>
            <option value="Reem">Reem</option>
            <option value="Yusuf">Yusuf</option>
          </select>

          <button
            type="button"
            className="u-btn u-btn--quiet"
            style={{ blockSize: "2rem" }}
            onClick={() => {
              if (sortBy === "owes_desc") setSortBy("oldest_desc");
              else if (sortBy === "oldest_desc") setSortBy("name_asc");
              else setSortBy("owes_desc");
            }}
          >
            {sortBy === "owes_desc" ? t.sortOwesMost : sortBy === "oldest_desc" ? t.colOldestDebt : t.colCustomer}
          </button>
        </div>
      </div>

      {/* ── Accounts Table Panel ──────────────────────────────────────────── */}
      <section className="crd-panel" aria-label={t.colCustomer}>
        <div className="crd-table-scroll" tabIndex={0} role="region" aria-label={t.creditTitle}>
          <table className="crd-table">
            <thead>
              <tr>
                <th className="crd-th">{t.colCustomer}</th>
                <th className="crd-th crd-th-right" style={{ inlineSize: "5.75rem" }}>{t.colOwes}</th>
                <th className="crd-th" style={{ inlineSize: "10rem" }}>{t.colLimitUsed}</th>
                <th className="crd-th" style={{ inlineSize: "5.75rem" }}>{t.colOldestDebt}</th>
                <th className="crd-th" style={{ inlineSize: "9.375rem" }}>{t.colPromiseToPay}</th>
                <th className="crd-th" style={{ inlineSize: "8rem" }}>{t.colLastReminder}</th>
                <th className="crd-th" style={{ inlineSize: "5.5rem" }}>{t.colFollowsUp}</th>
                <th className="crd-th" style={{ inlineSize: "1rem" }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((cust) => {
                const limitInfo = calculateCreditUsed(cust.owes, cust.limit);
                const ageTone = getAgeBadgeTone(cust.oldestDebtDays);

                return (
                  <tr key={cust.id} className="crd-tr">
                    {/* Customer */}
                    <td className="crd-td">
                      <div className="crd-customer-cell">
                        <div className="crd-customer-top">
                          <button
                            type="button"
                            className="crd-customer-name"
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textAlign: "inherit" }}
                            onClick={() => onOpenAccount && onOpenAccount(cust.id)}
                          >
                            {cust.name}
                          </button>
                          {cust.tag && (
                            <span className={`crd-badge crd-badge-${cust.tag.tone}`}>
                              {cust.tag.text}
                            </span>
                          )}
                        </div>
                        <span className="crd-customer-phone">{cust.phone}</span>
                      </div>
                    </td>

                    {/* Owes */}
                    <td className="crd-td crd-td-right">
                      <span style={{ fontWeight: 500 }}>
                        {formatQar(cust.owes, lang)}
                      </span>
                    </td>

                    {/* Limit Used */}
                    <td className="crd-td">
                      <div className="crd-meter-cell">
                        <div className="crd-meter-top">
                          <span
                            className="crd-meter-percent"
                            style={{ color: limitInfo.isOver ? "var(--bad)" : "inherit" }}
                          >
                            {limitInfo.percent}%
                          </span>
                          <span className="crd-meter-of">
                            {t.ofLimit} {formatQar(cust.limit, lang)}
                          </span>
                        </div>
                        <div className="crd-meter-track">
                          <div
                            className={`crd-meter-fill ${limitInfo.isOver ? "crd-meter-fill-bad" : ""}`}
                            style={{ inlineSize: `${Math.min(100, limitInfo.percent)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Oldest Debt */}
                    <td className="crd-td">
                      {cust.oldestDebtDays > 0 ? (
                        <span className={`crd-badge crd-badge-${ageTone}`}>
                          {cust.oldestDebtDays} {t.daysSuffix}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
                          {t.none}
                        </span>
                      )}
                    </td>

                    {/* Promise to Pay */}
                    <td className="crd-td">
                      {cust.promise ? (
                        <span className={`crd-badge crd-badge-${cust.promise.tone}`}>
                          {cust.promise.status}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
                          {t.none}
                        </span>
                      )}
                    </td>

                    {/* Last Reminder */}
                    <td className="crd-td">
                      {cust.lastReminder ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 500 }}>
                            {cust.lastReminder.date}
                          </span>
                          <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                            {cust.lastReminder.countText}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-xs)" }}>
                          {t.none}
                        </span>
                      )}
                    </td>

                    {/* Follows Up */}
                    <td className="crd-td">
                      <div className="crd-who-cell">
                        <div className="crd-avatar">
                          {getInitials(cust.followsUp)}
                        </div>
                        <span>{cust.followsUp}</span>
                      </div>
                    </td>

                    {/* Row Menu Dots */}
                    <td className="crd-td" style={{ textAlign: "center", color: "var(--text-muted)" }}>
                      ···
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="crd-table-footer">
          <span className="crd-pager-text">{t.pagerAccounts}</span>
          <span className="crd-rule-text">{t.ruleAccounts}</span>
        </div>
      </section>

      {/* ── Bottom Split Panels ───────────────────────────────────────────── */}
      <div className="crd-split-grid">
        {/* Left Panel: Open Orders on Account */}
        <section className="crd-panel" aria-label={t.openOrdersTitle}>
          <div className="crd-panel-header">
            <h2 className="crd-panel-title">{t.openOrdersTitle}</h2>
            <span className="crd-panel-subtitle">{t.openOrdersSub}</span>
          </div>

          <div>
            {FIXTURE_OPEN_ORDERS.map((ord) => (
              <div key={ord.orderNumber} className="crd-list-row">
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, inlineSize: "3rem" }}>
                  {ord.orderNumber}
                </span>
                <span style={{ fontWeight: 500, inlineSize: "9.375rem" }}>
                  {ord.customerName}
                </span>
                <span className={`crd-badge crd-badge-${ord.tone}`} style={{ inlineSize: "5.5rem", justifyContent: "center" }}>
                  {ord.status}
                </span>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", flex: 1 }}>
                  {ord.impactText}
                </span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500, inlineSize: "5rem", textAlign: "end" }}>
                  {formatQar(ord.amount, lang)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: "0.75rem 1.25rem", background: "var(--surface)", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
            <span className="crd-rule-text">{t.openOrdersRule}</span>
          </div>
        </section>

        {/* Right Panel: Paid in November */}
        <section className="crd-panel" aria-label={t.paidInNovPanelTitle}>
          <div className="crd-panel-header">
            <h2 className="crd-panel-title">{t.paidInNovPanelTitle}</h2>
            <span className="crd-panel-subtitle">{t.paidInNovVal}</span>
          </div>

          <div>
            {FIXTURE_RECENT_PAYMENTS.map((rec) => (
              <div key={rec.customerName} className="crd-list-row">
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", inlineSize: "4.75rem" }}>
                  {rec.date}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem", flex: 1 }}>
                  <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>{rec.customerName}</span>
                  <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>{rec.howText}</span>
                </div>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>
                  {formatQar(rec.amount, lang)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
