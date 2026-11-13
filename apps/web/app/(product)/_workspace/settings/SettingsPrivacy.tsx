"use client";

import React from "react";
import type { SettingsCopy } from "./copy";
import type { CustomerDataRequest, TermsItem, DownloadRecord } from "./logic";

interface SettingsPrivacyProps {
  t: SettingsCopy;
  downloads: DownloadRecord[];
  requests: CustomerDataRequest[];
  terms: TermsItem[];
  onCloseAccountClick: () => void;
}

export function SettingsPrivacy({
  t,
  downloads,
  requests,
  terms,
  onCloseAccountClick,
}: SettingsPrivacyProps) {
  return (
    <div className="set-layout">
      {/* Left column: Your data, Customer requests, Terms */}
      <div className="set-col-main">
        {/* Your data panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <div className="set-panel-title-wrap">
              <h2 className="set-panel-title">{t.yourDataSection}</h2>
              <span className="set-panel-subtitle">{t.yourDataSubtitle}</span>
            </div>
          </div>
          <div className="set-panel-body">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 16rem",
                gap: "var(--sp-4, 1rem)",
                borderBottom: "var(--rule-hairline, 0.0625rem solid var(--line))",
                paddingBottom: "var(--sp-4, 1rem)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2, 0.5rem)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text)" }}>
                  <span style={{ color: "var(--ok)", fontWeight: "bold" }}>✓</span>
                  <span>{t.incCustomers}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text)" }}>
                  <span style={{ color: "var(--ok)", fontWeight: "bold" }}>✓</span>
                  <span>{t.incCatalog}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text)" }}>
                  <span style={{ color: "var(--ok)", fontWeight: "bold" }}>✓</span>
                  <span>{t.incDocuments}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text)" }}>
                  <span style={{ color: "var(--ok)", fontWeight: "bold" }}>✓</span>
                  <span>{t.incTeam}</span>
                </div>
                <p style={{ margin: "var(--sp-2, 0.5rem) 0 0 0", fontSize: "0.75rem", lineHeight: 1.4, color: "var(--muted)" }}>
                  {t.zipDescription}
                </p>
              </div>

              <div
                style={{
                  borderInlineStart: "var(--rule-hairline, 0.0625rem solid var(--line))",
                  paddingInlineStart: "var(--sp-4, 1rem)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--sp-2, 0.5rem)",
                }}
              >
                <div className="set-kv-row">
                  <span className="set-kv-label">{t.lastDownloadLabel}</span>
                  <span className="set-kv-val">Sun 1 Nov · 212 MB</span>
                </div>
                <div className="set-kv-row">
                  <span className="set-kv-label">{t.whoCanDownloadLabel}</span>
                  <span className="set-kv-val">Owners only</span>
                </div>
                <div className="set-kv-row">
                  <span className="set-kv-label">{t.moneyLabel}</span>
                  <span className="set-kv-val">{t.moneyDetail}</span>
                </div>
                <div className="set-kv-row">
                  <span className="set-kv-label">{t.leftOutLabel}</span>
                  <span className="set-kv-val">{t.leftOutDetail}</span>
                </div>
              </div>
            </div>

            {/* Downloads history table */}
            <div className="set-table-wrap">
              <table className="set-table">
                <thead>
                  <tr>
                    <th>{t.colDownloaded}</th>
                    <th>{t.colBy}</th>
                    <th>{t.colSize}</th>
                    <th>{t.colFollowed}</th>
                  </tr>
                </thead>
                <tbody>
                  {downloads.map((dl) => (
                    <tr key={dl.id}>
                      <td style={{ fontFamily: "monospace" }}>{dl.downloadedAt}</td>
                      <td>{dl.downloadedBy}</td>
                      <td style={{ fontFamily: "monospace" }}>{dl.size}</td>
                      <td style={{ color: "var(--muted)" }}>{dl.followedNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="set-panel-footer">{t.downloadRuleNote}</div>
        </div>

        {/* Customer data requests panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <div className="set-panel-title-wrap">
              <h2 className="set-panel-title">{t.requestsSection}</h2>
              <span className="set-panel-subtitle">{t.requestsCount}</span>
            </div>
            <button type="button" className="u-btn u-btn--line u-btn--sm">
              {t.recordRequestBtn}
            </button>
          </div>
          <div className="set-table-wrap">
            <table className="set-table">
              <thead>
                <tr>
                  <th>{t.colAsked}</th>
                  <th>{t.colCustomer}</th>
                  <th>{t.colAskedFor}</th>
                  <th>{t.colState}</th>
                  <th>{t.colHandledBy}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td style={{ fontFamily: "monospace" }}>{req.askedDate}</td>
                    <td style={{ fontWeight: 600 }}>{req.customerIdentifier}</td>
                    <td>
                      {req.askedFor === "copy"
                        ? "A copy of their data"
                        : req.askedFor === "forget"
                        ? "To be forgotten"
                        : req.askedFor === "no_messages"
                        ? "No more messages"
                        : "Name corrected"}
                    </td>
                    <td>
                      <span
                        className={`u-tag ${
                          req.state === "waiting"
                            ? "u-tag--warn"
                            : req.state === "sent" || req.state === "done"
                            ? "u-tag--ok"
                            : "u-tag--muted"
                        }`}
                      >
                        {req.state.charAt(0).toUpperCase() + req.state.slice(1)}
                      </span>
                    </td>
                    <td>
                      <div>
                        <span>{req.handledBy}</span>
                        {req.note && (
                          <span style={{ display: "block", fontSize: "0.6875rem", color: "var(--muted)" }}>
                            {req.note}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="set-panel-footer">{t.requestsRuleNote}</div>
        </div>

        {/* Terms you accepted panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <div className="set-panel-title-wrap">
              <h2 className="set-panel-title">{t.termsSection}</h2>
              <span className="set-panel-subtitle">{t.termsSubtitle}</span>
            </div>
          </div>
          <div className="set-table-wrap">
            <table className="set-table">
              <thead>
                <tr>
                  <th>{t.colDocument}</th>
                  <th>{t.colVersion}</th>
                  <th>{t.colAccepted}</th>
                  <th>{t.colBy}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id}>
                    <td style={{ fontWeight: 600 }}>{term.document}</td>
                    <td style={{ fontFamily: "monospace" }}>{term.version}</td>
                    <td style={{ fontFamily: "monospace" }}>{term.acceptedAt}</td>
                    <td>{term.acceptedBy}</td>
                    <td style={{ textAlign: "end" }}>
                      {term.isCurrent ? (
                        <a href="#read" className="set-tab-link" style={{ padding: 0 }}>
                          {t.readItLink}
                        </a>
                      ) : (
                        <span style={{ fontSize: "0.6875rem", color: "var(--muted)" }}>
                          {t.replacedNote}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right column: Close account, What ALYR keeps, Customers consent */}
      <div className="set-col-side">
        {/* Close account panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <h2 className="set-panel-title">{t.closeAccountSection}</h2>
          </div>
          <div className="set-panel-body">
            <p style={{ margin: 0, fontSize: "0.8125rem", lineHeight: 1.4, color: "var(--muted)" }}>
              {t.closeAccountDescription}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2, 0.5rem)" }}>
              <button
                type="button"
                className="u-btn u-btn--line u-btn--sm"
                style={{ color: "var(--bad)" }}
                onClick={onCloseAccountClick}
              >
                {t.closeAccountBtn}
              </button>
              <span style={{ fontSize: "0.6875rem", color: "var(--muted)" }}>
                {t.closeAccountOwnersOnly}
              </span>
            </div>
          </div>
        </div>

        {/* What ALYR keeps panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <h2 className="set-panel-title">{t.keepsSection}</h2>
          </div>
          <div className="set-panel-body">
            <div className="set-kv-list">
              <div className="set-kv-row">
                <span className="set-kv-label">{t.keptInLabel}</span>
                <span className="set-kv-val">{t.keptInValue}</span>
              </div>
              <div className="set-kv-row">
                <span className="set-kv-label">{t.convOrdersLabel}</span>
                <span className="set-kv-val">{t.convOrdersValue}</span>
              </div>
              <div className="set-kv-row">
                <span className="set-kv-label">{t.docsLabel}</span>
                <span className="set-kv-val">{t.docsValue}</span>
              </div>
              <div className="set-kv-row">
                <span className="set-kv-label">{t.afterCloseLabel}</span>
                <span className="set-kv-val">{t.afterCloseValue}</span>
              </div>
              <div className="set-kv-row">
                <span className="set-kv-label">{t.staffSeeLabel}</span>
                <span className="set-kv-val">{t.staffSeeValue}</span>
              </div>
            </div>
          </div>
          <div className="set-panel-footer">{t.noCardDetailsNote}</div>
        </div>

        {/* Customers and consent panel */}
        <div className="set-panel">
          <div className="set-panel-header">
            <h2 className="set-panel-title">{t.consentSection}</h2>
            <a href="#customers" className="set-tab-link">
              {t.customersLink}
            </a>
          </div>
          <div className="set-panel-body">
            <div className="set-kv-list">
              <div className="set-kv-row">
                <span className="set-kv-label">{t.onRecordLabel}</span>
                <span className="set-kv-val" style={{ fontFamily: "monospace" }}>1,284</span>
              </div>
              <div className="set-kv-row">
                <span className="set-kv-label">{t.saidStopLabel}</span>
                <span className="set-kv-val" style={{ fontFamily: "monospace" }}>9</span>
              </div>
              <div className="set-kv-row">
                <span className="set-kv-label">{t.forgottenLabel}</span>
                <span className="set-kv-val" style={{ fontFamily: "monospace" }}>1</span>
              </div>
              <div className="set-kv-row">
                <span className="set-kv-label">{t.waitingForgetLabel}</span>
                <span className="set-kv-val" style={{ fontFamily: "monospace" }}>1</span>
              </div>
            </div>
          </div>
          <div className="set-panel-footer">{t.consentRuleNote}</div>
        </div>
      </div>
    </div>
  );
}
