import { Redirect } from "expo-router";

/**
 * Backward-compatible route for older links. ALYR now has one first-use state
 * machine under `(auth)`, so this route can never create a competing
 * workspace setup journey.
 */
export default function LegacyOnboardingRedirect() {
  return <Redirect href="/(auth)" />;
}
