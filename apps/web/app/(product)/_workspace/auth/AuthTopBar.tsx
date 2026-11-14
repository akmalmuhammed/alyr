"use client";

import React from "react";
import { Button, Steps } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import type { LanguageChoice } from "./logic";

export interface AuthTopBarProps {
  t: AuthCopyStrings;
  language?: LanguageChoice;
  onToggleLanguage: () => void;
  steps?: string[];
  currentStep?: number;
}

export function AuthTopBar({
  t,
  onToggleLanguage,
  steps,
  currentStep
}: AuthTopBarProps) {
  return (
    <header className="auth-bar" role="banner">
      <div className="auth-bar-brand">
        <span className="auth-bar-logo">{t.brandName}</span>
      </div>

      <div className="auth-spacer" />

      {steps && typeof currentStep === "number" ? (
        <div style={{ flex: "0 1 auto" }}>
          <Steps steps={steps} current={currentStep} />
        </div>
      ) : (
        <>
          <span className="auth-bar-help">{t.needHand}</span>
          <span className="auth-bar-email">{t.supportEmail}</span>
        </>
      )}

      <div className="auth-spacer" />

      <Button kind="line" size="sm" onClick={onToggleLanguage} aria-label={t.languageName}>
        {t.languageName}
      </Button>
    </header>
  );
}
