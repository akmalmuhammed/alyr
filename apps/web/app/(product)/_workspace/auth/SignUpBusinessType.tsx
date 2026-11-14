"use client";

import React, { useState } from "react";
import { Button, Icon, type IconName, Kbd } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_TYPES, type BusinessTypeItem } from "./fixtures";
import { PhonePreview } from "./PhonePreview";
import type { LanguageChoice } from "./logic";

export interface SignUpBusinessTypeProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  onBack: () => void;
  onContinue: (chosen: BusinessTypeItem) => void;
}

const STARTS_ICONS: readonly IconName[] = ["cal", "tag", "box", "inbox"];

export function SignUpBusinessType({
  t,
  lang,
  onBack,
  onContinue
}: SignUpBusinessTypeProps) {
  const [selectedId, setSelectedId] = useState<string>("carcare");

  const selectedTrade =
    FIXTURE_TYPES.find((item) => item.id === selectedId) || FIXTURE_TYPES[2];

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-content">
        {/* Left Step Form */}
        <div className="auth-wizard-step">
          <div className="auth-step-body">
            <div className="auth-card-header">
              <span className="auth-card-kicker">{t.signupTypeKicker}</span>
              <h1 className="auth-card-title auth-card-title--lg">{t.signupTypeTitle}</h1>
              <p className="auth-card-subtitle">{t.signupTypeSubtitle}</p>
            </div>

            {/* 3x4 Grid of Business Types */}
            <div className="auth-type-grid">
              {FIXTURE_TYPES.map((item) => {
                const isSelected = item.id === selectedId;
                const typeData = t.types[item.titleKey] || { title: item.id, desc: "", badge: item.badge };

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`auth-type-tile ${isSelected ? "auth-type-tile--selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedId(item.id);
                      }
                    }}
                  >
                    <div className="auth-type-tile-top">
                      <Icon
                        name={item.icon as IconName}
                        size="sm"
                        className={`auth-type-icon ${isSelected ? "auth-type-icon--selected" : ""}`}
                      />
                      <div className="auth-spacer" />
                      {isSelected ? (
                        <span className="auth-tick-circle">
                          <Icon name="check" size="sm" className="auth-tick-check" />
                        </span>
                      ) : typeData.badge ? (
                        <span className="auth-with-alyr-label">{typeData.badge}</span>
                      ) : null}
                    </div>

                    <div className="auth-type-tile-content">
                      <span className="auth-type-title">{typeData.title}</span>
                      <span className="auth-type-subtitle">{typeData.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* "What you start with" Panel */}
            <div className="auth-starts-panel">
              <div className="auth-starts-header">
                <span className="auth-card-kicker">{t.startWithTitle}</span>
                <div className="auth-spacer" />
                <span className="auth-starts-change-note">{t.startWithSub}</span>
              </div>

              <div className="auth-starts-cols">
                {t.startItems.map((col, idx) => (
                  <div
                    key={idx}
                    className={`auth-starts-col ${idx > 0 ? "auth-starts-col--bordered" : ""}`}
                  >
                    <div className="auth-starts-title-line">
                      <Icon name={STARTS_ICONS[idx % STARTS_ICONS.length]} size="sm" />
                      <span className="auth-starts-title">{col.title}</span>
                    </div>
                    <span className="auth-starts-desc">{col.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="auth-wizard-actions">
            <Button kind="line" size="md" onClick={onBack}>
              {t.back}
            </Button>
            <span className="auth-actions-note">
              {t.signupTypeChosenNote("Car care & garage")}
            </span>
            <div className="auth-spacer" />
            <Kbd>{t.enterKey}</Kbd>
            <Button kind="volt" size="md" onClick={() => onContinue(selectedTrade)}>
              {t.continueBtn}
            </Button>
          </div>
        </div>

        {/* Right Preview Pane */}
        <div className="auth-wizard-preview">
          <span className="auth-card-kicker">{t.customerSeeHeader}</span>
          <PhonePreview
            businessName={lang === "ar" ? "نشاطك التجاري" : "Your business"}
            variant="type"
            lang={lang}
            caption={t.phonePreviewCaptionType}
          />
        </div>
      </div>
    </div>
  );
}
