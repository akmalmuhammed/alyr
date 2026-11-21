"use client";

import { useEffect, useState } from "react";
import { UiRoot } from "../../../_ui";
import { AUTH_COPY } from "./copy";
import { AuthFoot } from "./AuthFoot";
import { AuthTopBar } from "./AuthTopBar";
import {
  FIXTURE_BUSINESS_NAME,
  FIXTURE_BUSINESSES,
  FIXTURE_CODE,
  FIXTURE_EMAIL,
  FIXTURE_QUOTE,
  FIXTURE_SERVICES,
  FIXTURE_SESSION,
  type ServiceItem
} from "./fixtures";
import type { LanguageChoice, ThemeChoice } from "./logic";
import { SignInChooseBusiness } from "./SignInChooseBusiness";
import { SignInCode } from "./SignInCode";
import { SignInEmail } from "./SignInEmail";
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

// Where each sign-up screen sits in the bar of seven steps (0 is "Sign in", already done).
const WIZARD_INDEX: Partial<Record<AuthStep, number>> = { type: 1, setup: 2, plan: 5 };

/**
 * The sign-in and sign-up screens strung together on fixtures, for the preview route. Nothing here
 * calls the API: asking for a code, checking it, opening a business and accepting the price only
 * move to the next screen. The lead wires the real calls (`/api/auth/code`, `/api/auth/verify`,
 * `/api/onboarding/*`) when the section goes live.
 */
export function AuthWorkbench({ initialFlow = "signin", initialStep = "email", initialLang = "en", initialTheme = "light" }: AuthWorkbenchProps) {
  const [flow, setFlow] = useState<AuthFlow>(initialFlow);
  const [step, setStep] = useState<AuthStep>(initialStep);
  const [language, setLanguage] = useState<LanguageChoice>(initialLang);
  const [email, setEmail] = useState(FIXTURE_EMAIL);
  const [services, setServices] = useState<ServiceItem[]>(FIXTURE_SERVICES);

  const t = AUTH_COPY[language];
  const theme = initialTheme === "auto" ? undefined : initialTheme;

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const go = (nextFlow: AuthFlow, nextStep: AuthStep) => {
    setFlow(nextFlow);
    setStep(nextStep);
  };

  const wizardIndex = flow === "signup" ? WIZARD_INDEX[step] : undefined;

  return (
    <UiRoot lang={language} data-theme={theme} className="auth-root">
      <AuthTopBar
        t={t}
        language={language}
        onToggleLanguage={() => setLanguage((prev) => (prev === "en" ? "ar" : "en"))}
        steps={wizardIndex === undefined ? undefined : t.steps}
        currentStep={wizardIndex}
      />

      <main className="auth-main">
        {flow === "signin" && step === "email" && (
          <SignInEmail t={t} email={email} onChangeEmail={setEmail} onSubmit={() => go("signin", "code")} onGoToSignUp={() => go("signup", "type")} />
        )}
        {flow === "signin" && step === "code" && (
          <SignInCode
            t={t}
            lang={language}
            email={email}
            initialCode={FIXTURE_CODE}
            session={FIXTURE_SESSION}
            onSubmit={() => go("signin", "choose")}
            onChangeEmail={() => go("signin", "email")}
          />
        )}
        {flow === "signin" && step === "choose" && (
          <SignInChooseBusiness t={t} lang={language} email={email} businesses={FIXTURE_BUSINESSES} onOpen={() => {}} onSignOut={() => go("signin", "email")} />
        )}
        {flow === "signin" && step === "states" && <SignInStates t={t} lang={language} />}

        {flow === "signup" && step === "type" && (
          <SignUpBusinessType t={t} lang={language} onBack={() => go("signin", "email")} onContinue={() => go("signup", "setup")} />
        )}
        {flow === "signup" && step === "setup" && (
          <SignUpGuidedSetup
            t={t}
            lang={language}
            businessName={FIXTURE_BUSINESS_NAME}
            initialServices={services}
            onBack={() => go("signup", "type")}
            onContinue={(list) => {
              setServices(list);
              go("signup", "plan");
            }}
          />
        )}
        {flow === "signup" && step === "plan" && (
          <SignUpPlanPrice
            t={t}
            lang={language}
            businessName={FIXTURE_BUSINESS_NAME}
            quote={FIXTURE_QUOTE}
            services={services}
            onBack={() => go("signup", "setup")}
            onAccept={() => go("signin", "choose")}
          />
        )}
      </main>

      {flow === "signin" && <AuthFoot t={t} />}
      <p className="auth-fixture-note">{t.fixtureNote}</p>
    </UiRoot>
  );
}
