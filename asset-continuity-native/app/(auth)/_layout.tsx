import { Redirect, Stack, useSegments } from "expo-router";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  authenticatedAuthEntryDestination,
  publicAuthEntryRouteFromSegments
} from "@/auth/routes";
import { colors } from "@/theme/tokens";

export default function AuthLayout() {
  const segments = useSegments();
  const {
    bootstrapState,
    mode,
    passwordRecoverySessionActive,
    session
  } = useAuthFlow();
  const redirect = authenticatedAuthEntryDestination({
    bootstrapState,
    mode,
    passwordRecoverySessionActive,
    route: publicAuthEntryRouteFromSegments(segments),
    session
  });

  if (redirect) return <Redirect href={redirect} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "default",
        contentStyle: { backgroundColor: colors.canvas },
        gestureEnabled: true
      }}
    >
      <Stack.Screen
        name="reset-password"
        options={{
          /*
           * Leaving recovery must invalidate the transient provider session.
           * The screen owns back/hardware-back handling so an iOS swipe cannot
           * bypass that asynchronous boundary.
           */
          gestureEnabled: false
        }}
      />
    </Stack>
  );
}
