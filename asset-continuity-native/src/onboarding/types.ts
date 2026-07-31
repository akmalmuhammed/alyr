export type OnboardingSceneIndex = 0 | 1 | 2 | 3;

export interface OnboardingExperienceActions {
  readonly onBegin: () => void | Promise<void>;
  readonly onExploreSample: () => void | Promise<void>;
  readonly onSignIn: () => void | Promise<void>;
  readonly onSkip: () => void | Promise<void>;
}
