"use client";

import React, { useState, useEffect } from "react";
import { AUTH_COPY } from "./copy";
import type { LanguageChoice, ThemeChoice } from "./logic";
import { AuthTopBar } from "./AuthTopBar";
import { AuthFoot } from "./AuthFoot";
import { SignInEmail } from "./SignInEmail";
import { SignInCode } from "./SignInCode";
import { SignInChooseBusiness } from "./SignInChooseBusiness";
import { SignInStates } from "./SignInStates";
import { SignUpBusinessType } from "./SignUpBusinessType";
import { SignUpGuidedSetup } from "./SignUpGuidedSetup";
import { SignUpPlanPrice } from "./SignUpPlanPrice";
import "./auth.css";

export type AuthFlow = "signin" | "signup";
export type AuthStep = "email" | "code" | "choose" | "states" | "type" | "setup" | "plan";

export interface AuthWorkbenchProps {
  initialFlow?: AuthFlow;
  initialStep?: AuthStep;
  initialLang?: LanguageChoice;
  initialTheme?: ThemeChoice;
}

export function AuthWorkbench({
  initialFlow = "signin",
  initialStep = "email",
  initialLang = "en",
  initialTheme = "light"
}: AuthWorkbenchProps) {
  const [flow, setFlow] = useState<AuthFlow>(initialFlow);
  const [step, setStep] = useState<AuthStep>(initialStep);
  const [language, setLanguage] = useState<LanguageChoice>(initialLang);
  const [theme] = useState<ThemeChoice>(initialTheme);
  const [email, setEmail] = useState<string>("hana@nuqta.qa");

  const t = AUTH_COPY[language];

  // Sync document direction, language, and theme
  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.setAttribute("data-theme", theme === "auto" ? "light" : theme);
  }, [language, theme]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "en" ? "ar" : "en"));
  };

  const getWizardStepIndex = (): number => {
    switch (step) {
      case "type":
        return 1;
      case "setup":
        return 2;
      case "plan":
        return 5;
      default:
        return 0;
    }
  };

  return (
    <div className="auth-root">
      <AuthTopBar
        t={t}
        language={language}
        onToggleLanguage={toggleLanguage}
        steps={flow === "signup" ? t.steps : undefined}
        currentStep={flow === "signup" ? getWizardStepIndex() : undefined}
      />

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {flow === "signin" && (
          <>
            {step === "email" && (
              <SignInEmail
                t={t}
                email={email}
                onChangeEmail={setEmail}
                onSubmit={() => setStep("code")}
                onGoToSignUp={() => {
                  setFlow("signup");
                  setStep("type");
                }}
              />
            )}

            {step === "code" && (
              <SignInCode
                t={t}
                email={email}
                onSubmit={() => setStep("choose")}
                onChangeEmail={() => setStep("email")}
              />
            )}

            {step === "choose" && (
              <SignInChooseBusiness
                t={t}
                email={email}
                onSelectBusiness={() => {}}
                onSignOut={() => setStep("email")}
              />
            )}

            {step === "states" && <SignInStates t={t} />}
          </>
        )}

        {flow === "signup" && (
          <>
            {step === "type" && (
              <SignUpBusinessType
                t={t}
                lang={language}
                onBack={() => {
                  setFlow("signin");
                  setStep("email");
                }}
                onContinue={() => setStep("setup")}
              />
            )}

            {step === "setup" && (
              <SignUpGuidedSetup
                t={t}
                lang={language}
                onBack={() => setStep("type")}
                onContinue={() => setStep("plan")}
              />
            )}

            {step === "plan" && (
              <SignUpPlanPrice
                t={t}
                lang={language}
                onBack={() => setStep("setup")}
                onAccept={() => {
                  setFlow("signin");
                  setStep("choose");
                }}
              />
            )}
          </>
        )}
      </main>

      {flow === "signin" && <AuthFoot t={t} />}
    </div>
  );
}
