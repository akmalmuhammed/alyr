"use client";

import React, { useState } from "react";
import { Button, Kbd } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_TYPES } from "./fixtures";
import { PhonePreview } from "./PhonePreview";
import type { LanguageChoice } from "./logic";

export interface SignUpBusinessTypeProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  onBack: () => void;
  onContinue: (typeId: string) => void;
}

export function SignUpBusinessType({
  t,
  lang,
  onBack,
  onContinue
}: SignUpBusinessTypeProps) {
  const [selectedId, setSelectedId] = useState<string>("carcare");

  const selectedType = FIXTURE_TYPES.find((tp) => tp.id === selectedId) || FIXTURE_TYPES[2];
  const typeCopy = t.types[selectedType.id] || { title: "Car care & garage", desc: "" };

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-content">
        {/* Left Form */}
        <div className="auth-wizard-step">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.signupTypeKicker}</span>
            <h1 className="auth-card-title">{t.signupTypeTitle}</h1>
            <p className="auth-card-subtitle">{t.signupTypeSubtitle}</p>
          </div>

          {/* 12 Types Grid */}
          <div className="auth-type-grid" role="radiogroup" aria-label={t.signupTypeTitle}>
            {FIXTURE_TYPES.map((tp) => {
              const isSelected = tp.id === selectedId;
              const itemCopy = t.types[tp.id] || { title: tp.titleKey, desc: tp.descKey };
              return (
                <div
                  key={tp.id}
                  className={`auth-type-tile ${isSelected ? "auth-type-tile--selected" : ""}`}
                  onClick={() => setSelectedId(tp.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(tp.id);
                    }
                  }}
                >
                  <div className="auth-type-top">
                    <span style={{ fontSize: "var(--text-md)" }}>•</span>
                    {isSelected ? (
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>✓</span>
                    ) : tp.badge ? (
                      <span className="auth-type-badge">{itemCopy.badge || tp.badge}</span>
                    ) : null}
                  </div>

                  <span className="auth-type-title">{itemCopy.title}</span>
                  <span className="auth-type-desc">{itemCopy.desc}</span>
                </div>
              );
            })}
          </div>

          {/* What you start with */}
          <div className="auth-start-panel">
            <div className="auth-start-header">
              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{t.startWithTitle}</span>
              <span style={{ color: "var(--text-muted)" }}>{t.startWithSub}</span>
            </div>

            <div className="auth-start-items">
              {t.startItems.map((item, i) => (
                <div key={i} className="auth-start-item">
                  <span className="auth-start-item-title">{item.title}</span>
                  <span className="auth-start-item-desc">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Phone Preview */}
        <div className="auth-wizard-preview">
          <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            {t.customerSeeHeader}
          </span>
          <PhonePreview
            businessName={lang === "ar" ? "نقطة للعناية بالسيارات" : "Nuqta Car Care"}
            variant="type"
            lang={lang}
            caption={t.phonePreviewCaptionType}
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="auth-wizard-actions">
        <Button kind="line" size="md" onClick={onBack}>
          {t.back}
        </Button>
        <span className="auth-wizard-note">{t.signupTypeChosenNote(typeCopy.title)}</span>
        <div className="auth-spacer" />
        <Kbd>{t.enterKey}</Kbd>
        <Button kind="volt" size="md" onClick={() => onContinue(selectedId)}>
          {t.continueBtn}
        </Button>
      </div>
    </div>
  );
}
