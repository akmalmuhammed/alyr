"use client";

import React from "react";
import { Icon, Steps } from "../../../_ui";
import { AlyrLogo } from "./AlyrLogo";
import type { AuthCopyStrings } from "./copy";
import type { LanguageChoice } from "./logic";

export interface AuthTopBarProps {
  t: AuthCopyStrings;
  language?: LanguageChoice;
  onToggleLanguage: () => void;
  steps?: readonly string[];
  currentStep?: number;
}

export function AuthTopBar({
  t,
  language,
  onToggleLanguage,
  steps,
  currentStep
}: AuthTopBarProps) {
  const isArabic = language === "ar";

  return (
    <header className="auth-bar" role="banner">
      <div className="auth-bar-brand">
        <AlyrLogo height={22} />
        <span className="auth-bar-wordmark">{t.brandName}</span>
      </div>

      <div className="auth-spacer" />

      {steps && typeof currentStep === "number" ? (
        <div className="auth-bar-center">
          <Steps steps={steps} current={currentStep} />
        </div>
      ) : (
        <div className="auth-bar-support">
          <span className="auth-bar-help">{t.needHand}</span>
          <span className="auth-bar-email">{t.supportEmail}</span>
        </div>
      )}

      {steps && typeof currentStep === "number" ? <div className="auth-spacer" /> : null}

      <button
        type="button"
        className="auth-lang-trigger"
        onClick={onToggleLanguage}
        aria-label={t.languageName}
      >
        <Icon name="globe" size="sm" />
        <span style={{ fontFamily: isArabic ? "var(--font-ui-sans)" : "var(--font-ui-arabic)" }}>
          {t.languageName}
        </span>
      </button>
    </header>
  );
}
