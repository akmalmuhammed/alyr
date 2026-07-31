import { useRouter } from "expo-router";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { OnboardingExperience } from "@/onboarding/OnboardingExperience";
import { useOnboardingIntro } from "@/onboarding/OnboardingIntroProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";

export default function WorldlineOnboardingScreen() {
  const router = useRouter();
  const {
    clearError: clearAuthError,
    clearStatus,
    mode,
    reset
  } = useAuthFlow();
  const {
    clearError,
    error,
    saving,
    startWorkspace,
    storageReady
  } = useWorkspace();
  const { language } = useCoreJourneyCopy();
  const { markSeen } = useOnboardingIntro();

  const prepareAccountEntry = () => {
    clearAuthError();
    clearStatus();
    // Preview identities are session-only. Provider-owned cloud sessions are
    // never cleared by a presentation route.
    if (mode === "preview") reset();
  };

  const skip = async () => {
    await markSeen();
    router.replace(AUTH_ROUTES.welcome);
  };

  const signIn = async () => {
    prepareAccountEntry();
    await markSeen();
    router.replace(AUTH_ROUTES.signIn);
  };

  const begin = async () => {
    prepareAccountEntry();
    await markSeen();
    router.replace(AUTH_ROUTES.createAccount);
  };

  const exploreSample = async () => {
    clearError();
    try {
      await startWorkspace("sample");
      await markSeen();
      router.replace("/(tabs)");
    } catch {
      // WorkspaceProvider keeps the failed action on scene four and exposes a
      // localized, actionable storage error through the experience.
    }
  };

  return (
    <OnboardingExperience
      busy={saving}
      errorMessage={
        error ? localizedWorkspaceError(error, language) : null
      }
      onBegin={begin}
      onExploreSample={exploreSample}
      onSignIn={signIn}
      onSkip={skip}
      sampleEnabled={storageReady}
    />
  );
}
