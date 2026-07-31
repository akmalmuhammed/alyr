import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo
} from "react";

import {
  onboardingSeenStore,
  type OnboardingSeenStore,
  type OnboardingSeenStatus,
  useOnboardingSeenStatus
} from "./onboardingSeenStore";

export type OnboardingIntroStatus =
  OnboardingSeenStatus["status"];

export interface OnboardingIntroValue {
  readonly status: OnboardingIntroStatus;
  readonly markSeen: () => Promise<void>;
}

const OnboardingIntroContext =
  createContext<OnboardingIntroValue | null>(null);

export function OnboardingIntroProvider({
  children,
  store = onboardingSeenStore
}: PropsWithChildren<{
  readonly store?: OnboardingSeenStore;
}>) {
  const onboarding = useOnboardingSeenStatus(store);
  const value = useMemo<OnboardingIntroValue>(
    () => ({
      status: onboarding.status,
      markSeen: onboarding.markSeen
    }),
    [onboarding.markSeen, onboarding.status]
  );

  return (
    <OnboardingIntroContext.Provider value={value}>
      {children}
    </OnboardingIntroContext.Provider>
  );
}

export function useOnboardingIntro(): OnboardingIntroValue {
  const value = useContext(OnboardingIntroContext);
  if (!value) {
    throw new Error(
      "useOnboardingIntro must be used inside OnboardingIntroProvider."
    );
  }
  return value;
}
