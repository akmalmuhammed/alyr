"use client";

import { Button, Icon, Steps } from "../../../_ui";
import { Symbol } from "../../../_site/brand";
import type { AuthCopyStrings } from "./copy";
import type { LanguageChoice } from "./logic";

export interface AuthTopBarProps {
  t: AuthCopyStrings;
  language: LanguageChoice;
  onToggleLanguage: () => void;
  /** The sign-up steps, with the index of the current one; sign-in has none and shows the help line. */
  steps?: readonly string[];
  currentStep?: number;
}

/** The 52 px bar of the sign-in and sign-up screens: the official symbol and name, then help or the steps, then the language. */
export function AuthTopBar({ t, language, onToggleLanguage, steps, currentStep }: AuthTopBarProps) {
  const wizard = steps !== undefined && currentStep !== undefined;
  return (
    <header className="auth-bar">
      <div className="auth-bar-brand">
        <Symbol className="auth-bar-mark" />
        <span className="auth-bar-wordmark">{t.brandName}</span>
      </div>

      {wizard ? (
        <nav className="auth-bar-steps" aria-label={t.stepsLabel}>
          <Steps steps={steps} current={currentStep} stateLabels={{ done: t.stepDone, current: t.stepCurrent }} />
        </nav>
      ) : (
        <div className="auth-bar-support">
          <span className="auth-bar-help">{t.needHand}</span>
          <a className="auth-bar-email" href={`mailto:${t.supportEmail}`}>
            {t.supportEmail}
          </a>
        </div>
      )}

      <Button
        kind="line"
        size="sm"
        icon={<Icon name="globe" size="md" />}
        onClick={onToggleLanguage}
        aria-label={t.languageSwitchLabel}
        className="auth-lang"
      >
        <span lang={language === "en" ? "ar" : "en"}>{t.languageName}</span>
      </Button>
    </header>
  );
}
