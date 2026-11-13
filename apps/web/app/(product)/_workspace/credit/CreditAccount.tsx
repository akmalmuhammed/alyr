"use client";

import React, { useState } from "react";
import { getCreditCopy, CreditLang } from "./copy";
import {
  formatQar,
  getAgeBadgeTone,
  getInitials,
} from "./logic";
import {
  FIXTURE_BLUEFIN_UNPAID,
  FIXTURE_BLUEFIN_ENTRIES,
  FIXTURE_CUSTOMERS,
} from "./fixtures";

interface CreditAccountProps {
  lang?: CreditLang;
  hasOpenDialog?: boolean;
  onBack?: () => void;
  onOpenPayment?: () => void;
  onOpenLimit?: () => void;
  onOpenStatement?: () => void;
  onOpenReminders?: () => void;
}

export function CreditAccount({
  lang = "en",
  hasOpenDialog = false,
  onBack,
  onOpenPayment,
  onOpenLimit,
  onOpenStatement,
  onOpenReminders,
}: CreditAccountProps) {
  const t = getCreditCopy(lang);

  const [entryTab, setEntryTab] = useState<"all" | "sales" | "payments">("all");

  const bluefin = FIXTURE_CUSTOMERS[2]; // Bluefin Events

  const filteredEntries = FIXTURE_BLUEFIN_ENTRIES.filter((e) => {
    if (entryTab === "sales") return e.kind.includes("Sale");
    if (entryTab === "payments") return e.kind.includes("Payment");
    return true;
  });

  return (
    <div className="crd-root">
      {/* ── Account Header ────────────────────────────────────────────────── */}
      <header className="crd-header">
        <div className="crd-title-group">
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <h1 className="crd-title">{bluefin.name}</h1>
            <span className="crd-badge crd-badge-warn">{t.tagPassed}</span>
            <span className="crd-badge crd-badge-n">{bluefin.tag?.text}</span>
          </div>
          <p className="crd-subtitle">{t.accountHeaderSub}</p>
        </div>

        <div className="crd-actions">
          <button
            type="button"
            className="u-btn u-btn--line"
            onClick={onOpenStatement}
          >
            {t.btnStatement}
          </button>
          <button
            type="button"
            className="u-btn u-btn--line"
            onClick={onOpenReminders}
          >
            {t.btnRemind}
          </button>
          <button
            type="button"
            className="u-btn u-btn--line"
            onClick={onBack}
          >
            {t.btnRecordSale}
          </button>
          <button
            type="button"
            className={`u-btn ${hasOpenDialog ? "u-btn--line" : "u-btn--volt"}`}
            onClick={onOpenPayment}
          >
            {t.btnRecordPayment}
          </button>
        </div>
      </header>

      {/* ── Separate Deposit Refund Banner ─────────────────────────────────── */}
      <div className="crd-refund-banner" role="alert">
        <span>{t.refundBanner}</span>
        <button
          type="button"
          className="u-btn u-btn--line"
          style={{ blockSize: "2rem", whiteSpace: "nowrap" }}
        >
          {t.refundAction}
        </button>
      </div>

      {/* ── Account Carbon Band ───────────────────────────────────────────── */}
      <section className="crd-account-band" aria-label={bluefin.name}>
        {/* Col 1: Owes */}
        <div className="crd-account-band-col">
          <span className="crd-band-label">{t.owesLabel}</span>
          <div className="crd-band-hero-row">
            <span className="crd-band-total">{t.owesBluefinVal}</span>
            <span className="crd-band-count">{t.owesBluefinDesc}</span>
          </div>
          <span className="crd-band-col-sub">{t.owesBluefinSub}</span>
        </div>

        {/* Col 2: Credit limit */}
        <div className="crd-account-band-col">
          <span className="crd-band-label">{t.creditLimitLabel}</span>
          <div className="crd-band-hero-row">
            <span className="crd-band-total">{t.limitBluefinVal}</span>
            <span className="crd-band-count">{t.limitBluefinDesc}</span>
          </div>
          <span className="crd-band-col-sub">{t.limitBluefinSub}</span>
        </div>

        {/* Col 3: Oldest debt */}
        <div className="crd-account-band-col">
          <span className="crd-band-label">{t.oldestDebtLabel}</span>
          <div className="crd-band-hero-row">
            <span className="crd-band-total">{t.oldestDebtBluefinVal}</span>
            <span className="crd-band-count">{t.oldestDebtBluefinDesc}</span>
          </div>
          <span className="crd-band-col-sub">{t.oldestDebtBluefinSub}</span>
        </div>

        {/* Col 4: Promise to pay */}
        <div className="crd-account-band-col">
          <span className="crd-band-label">{t.promiseLabel}</span>
          <div className="crd-band-hero-row">
            <span className="crd-band-total" style={{ color: "var(--on-band-warn)" }}>
              {t.promisePassedVal}
            </span>
            <span className="crd-band-count" style={{ color: "var(--on-band-warn)" }}>
              {t.promisePassedDesc}
            </span>
          </div>
          <span className="crd-band-col-sub">{t.promisePassedSub}</span>
        </div>
      </section>

      {/* ── Middle Split: Not Paid Yet & Credit Limit ──────────────────────── */}
      <div className="crd-split-grid">
        {/* Left: Not paid yet table */}
        <section className="crd-panel" aria-label={t.notPaidYetTitle}>
          <div className="crd-panel-header">
            <h2 className="crd-panel-title">{t.notPaidYetTitle}</h2>
            <span className="crd-panel-subtitle">{t.notPaidYetSub}</span>
          </div>

          <div className="crd-table-scroll" tabIndex={0} role="region" aria-label={t.notPaidYetTitle}>
            <table className="crd-table">
              <thead>
                <tr>
                  <th className="crd-th">{t.colSale}</th>
                  <th className="crd-th" style={{ inlineSize: "6.5rem" }}>{t.colPutOnAccount}</th>
                  <th className="crd-th" style={{ inlineSize: "4.5rem" }}>{t.colAge}</th>
                  <th className="crd-th crd-th-right" style={{ inlineSize: "5.5rem" }}>{t.colAmount}</th>
                  <th className="crd-th crd-th-right" style={{ inlineSize: "4.75rem" }}>{t.colPaid}</th>
                  <th className="crd-th crd-th-right" style={{ inlineSize: "5.5rem" }}>{t.colStillOwed}</th>
                </tr>
              </thead>
              <tbody>
                {FIXTURE_BLUEFIN_UNPAID.map((item) => (
                  <tr key={item.title} className="crd-tr">
                    <td className="crd-td">
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                        <span style={{ fontWeight: 500 }}>{item.title}</span>
                        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                          {item.itemsText}
                        </span>
                      </div>
                    </td>
                    <td className="crd-td">{item.putOnAccountDate}</td>
                    <td className="crd-td">
                      {item.isToday ? (
                        <span className="crd-badge crd-badge-n">{lang === "ar" ? "اليوم" : "Today"}</span>
                      ) : (
                        <span className={`crd-badge crd-badge-${getAgeBadgeTone(item.ageDays)}`}>
                          {item.ageDays} {t.daysSuffix}
                        </span>
                      )}
                    </td>
                    <td className="crd-td crd-td-right">{formatQar(item.amount, lang)}</td>
                    <td className="crd-td crd-td-right">
                      {item.paid > 0 ? (
                        formatQar(item.paid, lang)
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>{t.paidSinceVal}</span>
                      )}
                    </td>
                    <td className="crd-td crd-td-right" style={{ fontWeight: 500 }}>
                      {formatQar(item.stillOwed, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: "0.75rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
            <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{t.totalOwedRow}</span>
            <span style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600, fontSize: "var(--font-size-base)" }}>
              {formatQar(126400, lang)}
            </span>
          </div>

          <div style={{ padding: "0.625rem 1.25rem", background: "var(--surface)", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
            <span className="crd-rule-text">{t.ruleNotPaid}</span>
          </div>
        </section>

        {/* Right: Credit Limit card */}
        <section className="crd-panel" aria-label={t.creditLimitLabel}>
          <div className="crd-panel-header">
            <h2 className="crd-panel-title">{t.creditLimitLabel}</h2>
            <button
              type="button"
              className="u-btn u-btn--quiet"
              style={{ padding: 0, textDecoration: "underline", color: "var(--text)", font: "inherit" }}
              onClick={onOpenLimit}
            >
              {t.changeLimitLink}
            </button>
          </div>

          <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.625rem" }}>
              <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: 600 }}>{t.owesBluefinVal}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.ofLimit} {t.limitBluefinVal}</span>
            </div>

            <div className="crd-meter-track" style={{ blockSize: "0.375rem" }}>
              <div className="crd-meter-fill" style={{ inlineSize: "84%" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <div className="crd-kv-row">
                <span className="crd-kv-key">{t.leftToUse}</span>
                <span className="crd-kv-val" style={{ fontFamily: "var(--font-ui-mono)" }}>{t.leftToUseVal}</span>
              </div>
              <div className="crd-kv-row">
                <span className="crd-kv-key">{t.openOrdersTitle}</span>
                <span className="crd-kv-val">{t.openOrdersVal}</span>
              </div>
              <div className="crd-kv-row">
                <span className="crd-kv-key">{t.setByLabel}</span>
                <span className="crd-kv-val" style={{ fontSize: "var(--font-size-xs)" }}>{t.setByVal}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "0.75rem 1.25rem", background: "var(--surface)", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
            <span className="crd-rule-text">{t.ruleLimit}</span>
          </div>
        </section>
      </div>

      {/* ── 3 Bottom Panels: Promise, Reminders, Customer ─────────────────── */}
      <div className="crd-three-panels">
        {/* Panel 1: Promise to pay */}
        <section className="crd-panel" aria-label={t.promiseLabel}>
          <div className="crd-panel-header">
            <h2 className="crd-panel-title">{t.promiseLabel}</h2>
            <span className="crd-badge crd-badge-warn">{t.tagPassed}</span>
          </div>

          <div style={{ padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.promisedOnLabel}</span>
              <span className="crd-kv-val">{t.promisedOnVal}</span>
            </div>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.howPromisedLabel}</span>
              <span className="crd-kv-val" style={{ fontSize: "var(--font-size-xs)" }}>{t.howPromisedVal}</span>
            </div>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.toPayByLabel}</span>
              <span className="crd-kv-val" style={{ fontWeight: 600 }}>{t.toPayByVal}</span>
            </div>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.paidSinceLabel}</span>
              <span className="crd-kv-val">{t.paidSinceVal}</span>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginBlockStart: "0.5rem" }}>
              <button
                type="button"
                className="u-btn u-btn--line"
                style={{ blockSize: "2rem" }}
                onClick={onOpenLimit}
              >
                {t.btnSetNewDate}
              </button>
              <button
                type="button"
                className="u-btn u-btn--quiet"
                style={{ blockSize: "2rem" }}
              >
                {t.btnClearPromise}
              </button>
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "0.75rem 1.25rem", borderBlockStart: "var(--rule-hairline) solid var(--line)" }}>
            <span className="crd-rule-text">{t.rulePromise}</span>
          </div>
        </section>

        {/* Panel 2: Reminders */}
        <section className="crd-panel" aria-label={t.remindersTitle}>
          <div className="crd-panel-header">
            <h2 className="crd-panel-title">{t.remindersTitle}</h2>
            <span className="crd-panel-subtitle">{t.remindersCountSub}</span>
          </div>

          {/* Tone progression strip */}
          <div className="crd-tone-strip">
            <div style={{ padding: "0.625rem 0.75rem", borderInlineEnd: "var(--rule-hairline) solid var(--line)", background: "var(--surface)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <span style={{ inlineSize: "0.4375rem", blockSize: "0.4375rem", borderRadius: "var(--radius-full)", background: "var(--text)" }} />
                <span style={{ fontWeight: 600, fontSize: "var(--font-size-xs)" }}>{t.toneGentle}</span>
              </div>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", display: "block" }}>{t.rangeGentle}</span>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text)", fontFamily: "var(--font-ui-mono)", fontWeight: 500 }}>{t.timingGentle}</span>
            </div>

            <div style={{ padding: "0.625rem 0.75rem", borderInlineEnd: "var(--rule-hairline) solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <span style={{ inlineSize: "0.4375rem", blockSize: "0.4375rem", borderRadius: "var(--radius-full)", border: "var(--rule-hairline) solid var(--text-muted)" }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.toneFirm}</span>
              </div>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", display: "block" }}>{t.rangeFirm}</span>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", fontFamily: "var(--font-ui-mono)" }}>{t.timingFirm}</span>
            </div>

            <div style={{ padding: "0.625rem 0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <span style={{ inlineSize: "0.4375rem", blockSize: "0.4375rem", borderRadius: "var(--radius-full)", border: "var(--rule-hairline) solid var(--text-muted)" }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.toneFinal}</span>
              </div>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", display: "block" }}>{t.rangeFinal}</span>
              <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", fontFamily: "var(--font-ui-mono)" }}>{t.timingFinal}</span>
            </div>
          </div>

          <div style={{ padding: "0.875rem 1.25rem", flex: 1 }}>
            <div className="crd-timeline">
              <div className="crd-timeline-item">
                <span className="crd-timeline-text">They tapped &quot;I&apos;ll pay within a week&quot;</span>
                <span className="crd-timeline-meta" style={{ color: "var(--warn-text)", fontWeight: 500 }}>
                  Mon 2 Nov 10:12 · promise until Mon 9 Nov
                </span>
              </div>
              <div className="crd-timeline-item">
                <span className="crd-timeline-text">Gentle reminder with a pay link for QAR 1,040. Delivered, read at 10:11.</span>
                <span className="crd-timeline-meta">Mon 2 Nov 10:05 · Send reminders, by Hana</span>
              </div>
            </div>
          </div>

          <div style={{ padding: "0.75rem 1.25rem", borderBlockStart: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              className="u-btn u-btn--line"
              style={{ blockSize: "2rem" }}
              onClick={onOpenReminders}
            >
              {t.btnRemindNow}
            </button>
            <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", flex: 1 }}>
              {t.remindNowNotice}
            </span>
          </div>
        </section>

        {/* Panel 3: Customer Details */}
        <section className="crd-panel" aria-label={t.customerPanelTitle}>
          <div className="crd-panel-header">
            <h2 className="crd-panel-title">{t.customerPanelTitle}</h2>
            <button
              type="button"
              className="u-btn u-btn--quiet"
              style={{ padding: 0, textDecoration: "underline", color: "var(--text)", font: "inherit" }}
            >
              {t.openProfileLink}
            </button>
          </div>

          <div style={{ padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.whatsappLabel}</span>
              <span className="crd-kv-val" style={{ fontFamily: "var(--font-ui-mono)" }}>{bluefin.phone}</span>
            </div>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.languageLabel}</span>
              <span className="crd-kv-val">{t.languageVal}</span>
            </div>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.messagesLabel}</span>
              <span className="crd-kv-val">{t.messagesVal}</span>
            </div>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.colFollowsUp}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <div className="crd-avatar" style={{ inlineSize: "1.125rem", blockSize: "1.125rem" }}>
                  {getInitials(bluefin.followsUp)}
                </div>
                <span className="crd-kv-val">{bluefin.followsUp}</span>
              </div>
            </div>
            <div className="crd-kv-row">
              <span className="crd-kv-key">{t.lastStatementLabel}</span>
              <span className="crd-kv-val" style={{ fontSize: "var(--font-size-xs)" }}>{t.lastStatementVal}</span>
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "0.75rem 1.25rem", borderBlockStart: "var(--rule-hairline) solid var(--line)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              className="u-btn u-btn--line"
              style={{ blockSize: "2rem" }}
            >
              {t.btnConversation}
            </button>
            <span style={{ fontSize: "var(--ui-micro)", color: "var(--text-muted)", flex: 1 }}>
              {t.conversationWindowNotice}
            </span>
          </div>
        </section>
      </div>

      {/* ── Transaction Entries Table ──────────────────────────────────────── */}
      <section className="crd-panel" aria-label={t.entriesTitle}>
        <div className="crd-panel-header">
          <h2 className="crd-panel-title">{t.entriesTitle}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="crd-tabs" role="tablist" style={{ border: "none" }}>
              <button
                type="button"
                role="tab"
                aria-selected={entryTab === "all"}
                className={`crd-tab ${entryTab === "all" ? "crd-tab-active" : ""}`}
                style={{ padding: "0.375rem 0.625rem" }}
                onClick={() => setEntryTab("all")}
              >
                <span>{t.tabEntriesAll}</span>
                <span className="crd-tab-count">6</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={entryTab === "sales"}
                className={`crd-tab ${entryTab === "sales" ? "crd-tab-active" : ""}`}
                style={{ padding: "0.375rem 0.625rem" }}
                onClick={() => setEntryTab("sales")}
              >
                <span>{t.tabEntriesSales}</span>
                <span className="crd-tab-count">3</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={entryTab === "payments"}
                className={`crd-tab ${entryTab === "payments" ? "crd-tab-active" : ""}`}
                style={{ padding: "0.375rem 0.625rem" }}
                onClick={() => setEntryTab("payments")}
              >
                <span>{t.tabEntriesPayments}</span>
                <span className="crd-tab-count">2</span>
              </button>
            </div>
            <button
              type="button"
              className="u-btn u-btn--quiet"
              style={{ blockSize: "2rem" }}
            >
              {t.btnExport}
            </button>
          </div>
        </div>

        <div className="crd-table-scroll" tabIndex={0} role="region" aria-label={t.entriesTitle}>
          <table className="crd-table">
            <thead>
              <tr>
                <th className="crd-th" style={{ inlineSize: "6.5rem" }}>{t.colDate}</th>
                <th className="crd-th">{t.colEntry}</th>
                <th className="crd-th" style={{ inlineSize: "8.75rem" }}>{t.colWrittenBy}</th>
                <th className="crd-th crd-th-right" style={{ inlineSize: "7.5rem" }}>{t.colPutOnAccount}</th>
                <th className="crd-th crd-th-right" style={{ inlineSize: "6.25rem" }}>{t.colPaid}</th>
                <th className="crd-th crd-th-right" style={{ inlineSize: "7rem" }}>{t.colOwesAfter}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={`${entry.date}-${entry.time}-${entry.kind}`} className="crd-tr">
                  <td className="crd-td">
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                      <span style={{ fontWeight: 500 }}>{entry.date}</span>
                      <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--ui-micro)", color: "var(--text-muted)" }}>
                        {entry.time}
                      </span>
                    </div>
                  </td>

                  <td className="crd-td">
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600 }}>{entry.kind}</span>
                        {entry.documentRef && (
                          <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", textDecoration: "underline", color: "var(--text-muted)" }}>
                            {entry.documentRef}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                        {entry.note}
                      </span>
                    </div>
                  </td>

                  <td className="crd-td">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <div className="crd-avatar" style={{ inlineSize: "1.125rem", blockSize: "1.125rem" }}>
                        {getInitials(entry.writtenBy)}
                      </div>
                      <span style={{ fontSize: "var(--font-size-xs)" }}>{entry.writtenBy}</span>
                    </div>
                  </td>

                  <td className="crd-td crd-td-right">
                    {entry.putOnAccount !== null ? (
                      formatQar(entry.putOnAccount, lang)
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>–</span>
                    )}
                  </td>

                  <td className="crd-td crd-td-right">
                    {entry.paid !== null ? (
                      formatQar(entry.paid, lang)
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>–</span>
                    )}
                  </td>

                  <td className="crd-td crd-td-right" style={{ fontWeight: 600 }}>
                    {formatQar(entry.owesAfter, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="crd-table-footer">
          <span className="crd-pager-text">{t.pagerEntries}</span>
          <span className="crd-rule-text">{t.ruleEntries}</span>
        </div>
      </section>
    </div>
  );
}
