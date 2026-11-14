"use client";

import React from "react";
import { Button, Icon, Kbd } from "../../../_ui";
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
  const isAr = lang === "ar";
  const dueAmount = isAr ? "1,000\u00a0ر.ق" : "QAR 1,000";

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-content">
        {/* Left Step Form */}
        <div className="auth-wizard-step">
          <div className="auth-step-body">
            <div className="auth-card-header">
              <span className="auth-card-kicker">{t.signupPlanKicker}</span>
              <h1 className="auth-card-title auth-card-title--lg">{t.signupPlanTitle}</h1>
              <p className="auth-card-subtitle">{t.signupPlanSubtitle}</p>
            </div>

            <div className="auth-plan-row">
              {/* Carbon Price Card */}
              <div className="auth-price-card">
                <div className="auth-price-card-header">
                  <span className="auth-price-card-kicker">{t.priceCardTitle}</span>
                  <span className="auth-price-card-published">{t.publishedMeta}</span>
                </div>

                <div className="auth-price-card-main">
                  <span className="auth-price-card-amount">{t.pricePerMonthAmount}</span>
                  <span className="auth-price-card-period">{t.pricePerMonthLabel}</span>
                </div>

                <div className="auth-price-breakdown">
                  {t.planBreakdown.map((line, idx) => (
                    <div key={idx} className="auth-price-line">
                      <span className="auth-price-line-name">{line.name}</span>
                      <span className="auth-price-line-note">{line.note}</span>
                      <div className="auth-spacer" />
                      <span className="auth-price-line-amt">{line.amount}</span>
                    </div>
                  ))}
                </div>

                <div className="auth-price-totals">
                  <div className="auth-price-tot">
                    <span className="auth-price-tot-label">{t.sumEachMonthLabel}</span>
                    <span className="auth-price-tot-amt">{t.pricePerMonthAmount}</span>
                  </div>
                  <div className="auth-price-tot">
                    <span className="auth-price-tot-label">{t.sumOnceLabel}</span>
                    <span className="auth-price-tot-amt">{t.pricePerMonthAmount}</span>
                  </div>
                  <div className="auth-price-tot">
                    <span className="auth-price-tot-label">{t.sumDueNowLabel}</span>
                    <span className="auth-price-tot-amt auth-price-tot-amt--volt">
                      {dueAmount}
                    </span>
                  </div>
                </div>

                <p className="auth-price-note">{t.teamPricingNote}</p>
              </div>

              {/* Stack on Right: Count on & WhatsApp charges */}
              <div className="auth-plan-side-stack">
                <div className="auth-side-panel">
                  <div className="auth-side-panel-header">
                    <span className="auth-side-panel-title">{t.countOnTitle}</span>
                  </div>
                  <div className="auth-side-panel-body">
                    {t.countOnItems.map((item, idx) => (
                      <div key={idx} className="auth-side-item">
                        <Icon name="check" size="sm" className="auth-side-check-icon" />
                        <span className="auth-side-item-text">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="auth-side-panel">
                  <div className="auth-side-panel-body auth-side-panel-body--padded">
                    <span className="auth-meta-charges-title">{t.waChargesTitle}</span>
                    <p className="auth-meta-charges-desc">{t.waChargesSub}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="auth-wizard-actions">
            <Button kind="line" size="md" onClick={onBack}>
              {t.back}
            </Button>
            <span className="auth-actions-note">{t.acceptPlanNote}</span>
            <div className="auth-spacer" />
            <Kbd>{t.enterKey}</Kbd>
            <Button kind="volt" size="md" onClick={onAccept}>
              {t.acceptPlanBtn}
            </Button>
          </div>
        </div>

        {/* Right Preview Pane */}
        <div className="auth-wizard-preview">
          <span className="auth-card-kicker">{t.setupSoFarTitle}</span>

          <div className="auth-sofar-panel">
            {t.setupSoFarItems.map((item, idx) => (
              <div
                key={idx}
                className={`auth-sofar-row ${idx < t.setupSoFarItems.length - 1 ? "auth-sofar-row--bordered" : ""}`}
              >
                <span className="auth-tick-circle auth-tick-circle--sm">
                  <Icon name="check" size="sm" className="auth-tick-check" />
                </span>
                <div className="auth-sofar-info">
                  <span className="auth-sofar-title">{item.title}</span>
                  <span className="auth-sofar-sub">{item.sub}</span>
                </div>
              </div>
            ))}
          </div>

          <PhonePreview
            businessName="Nuqta Car Care"
            subTitle={isAr ? "خط تجريبي · أنت فقط من يرى هذا" : "Test line · only you can see this"}
            variant="plan"
            lang={lang}
            caption={t.phonePreviewCaptionPlan}
          />
        </div>
      </div>
    </div>
  );
}
