"use client";

import React from "react";
import { Button } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { PhonePreview } from "./PhonePreview";
import type { LanguageChoice } from "./logic";

export interface SignUpPlanPriceProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  onBack: () => void;
  onAccept: () => void;
}

export function SignUpPlanPrice({
  t,
  lang,
  onBack,
  onAccept
}: SignUpPlanPriceProps) {
  return (
    <div className="auth-wizard">
      <div className="auth-wizard-content">
        {/* Left Form */}
        <div className="auth-wizard-step">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.signupPlanKicker}</span>
            <h1 className="auth-card-title">{t.signupPlanTitle}</h1>
            <p className="auth-card-subtitle">{t.signupPlanSubtitle}</p>
          </div>

          <div style={{ display: "flex", gap: "var(--space-xl)", alignItems: "flex-start" }}>
            {/* Carbon Price Card */}
            <div className="auth-price-card">
              <div className="auth-price-card-header">
                <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--band-line)" }}>
                  {t.priceCardTitle}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", letterSpacing: "0.05em", color: "var(--band-line)" }}>
                  {t.publishedMeta}
                </span>
              </div>

              <div className="auth-price-card-main">
                <span className="auth-price-card-amount">{t.pricePerMonthAmount}</span>
                <span className="auth-price-card-label">{t.pricePerMonthLabel}</span>
              </div>

              <div className="auth-price-breakdown">
                {t.planBreakdown.map((item, i) => (
                  <div key={i} className="auth-price-line">
                    <span className="auth-price-line-name">{item.name}</span>
                    <span className="auth-price-line-note">{item.note}</span>
                    <div className="auth-spacer" />
                    <span className="auth-price-line-amt">{item.amount}</span>
                  </div>
                ))}
              </div>

              <div className="auth-price-totals">
                <div className="auth-price-tot">
                  <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--band-line)" }}>
                    {t.sumEachMonthLabel}
                  </span>
                  <span className="auth-price-tot-amt">{t.pricePerMonthAmount}</span>
                </div>

                <div className="auth-price-tot">
                  <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--band-line)" }}>
                    {t.sumOnceLabel}
                  </span>
                  <span className="auth-price-tot-amt">None</span>
                </div>

                <div className="auth-price-tot">
                  <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--band-line)" }}>
                    {t.sumDueNowLabel}
                  </span>
                  <span className="auth-price-tot-amt auth-price-tot-amt--volt">
                    {t.pricePerMonthAmount}
                  </span>
                </div>
              </div>

              <span className="auth-price-note">{t.teamPricingNote}</span>
            </div>

            {/* Side Guarantees */}
            <div style={{ display: "flex", flexDirection: "column", width: "18.75rem", gap: "var(--space-lg)" }}>
              {/* Count on panel */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: "var(--rule-hairline) solid var(--line)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--surface)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    height: "2.5rem",
                    display: "flex",
                    alignItems: "center",
                    paddingInline: "var(--space-md)",
                    backgroundColor: "var(--subtle)",
                    borderBottom: "var(--rule-hairline) solid var(--line)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    color: "var(--text-muted)"
                  }}
                >
                  {t.countOnTitle}
                </div>

                <div style={{ display: "flex", flexDirection: "column", padding: "var(--space-md)", gap: "var(--space-sm)" }}>
                  {t.countOnItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-xs)", fontSize: "var(--text-xs)", lineHeight: 1.4 }}>
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp charges */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "var(--space-md)",
                  gap: "var(--space-xs)",
                  border: "var(--rule-hairline) solid var(--line)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--surface)"
                }}
              >
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text)" }}>
                  {t.waChargesTitle}
                </span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {t.waChargesSub}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Phone Preview & Setup Summary */}
        <div className="auth-wizard-preview">
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              {t.setupSoFarTitle}
            </span>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                border: "var(--rule-hairline) solid var(--line)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--surface)",
                overflow: "hidden"
              }}
            >
              {t.setupSoFarItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-sm)",
                    padding: "var(--space-sm) var(--space-md)",
                    borderBottom: i === t.setupSoFarItems.length - 1 ? "none" : "var(--rule-hairline) solid var(--line)"
                  }}
                >
                  <span style={{ color: "var(--ok)", fontWeight: 700, fontSize: "var(--text-xs)" }}>✓</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{item.title}</span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{item.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PhonePreview
            businessName={lang === "ar" ? "نقطة للعناية بالسيارات" : "Nuqta Car Care"}
            variant="plan"
            lang={lang}
            caption={t.phonePreviewCaptionPlan}
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="auth-wizard-actions">
        <Button kind="line" size="md" onClick={onBack}>
          {t.back}
        </Button>
        <span className="auth-wizard-note">{t.acceptPlanNote}</span>
        <div className="auth-spacer" />
        <Button kind="volt" size="md" onClick={onAccept}>
          {t.acceptPlanBtn}
        </Button>
      </div>
    </div>
  );
}
