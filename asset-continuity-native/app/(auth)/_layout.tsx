import {
  Redirect,
  Stack,
  useLocalSearchParams,
  useSegments
} from "expo-router";
import { Platform } from "react-native";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  authenticatedAuthEntryDestination,
  hasPasswordRecoveryCodeParameter,
  publicAuthEntryRouteFromSegments
} from "@/auth/routes";
import { useLocale } from "@/i18n/LocaleProvider";
import { colors } from "@/theme/tokens";

export default function AuthLayout() {
  const segments = useSegments();
  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();
  const reduceMotion = useReduceMotionPreference();
  const { rtl } = useLocale();
  const {
    bootstrapState,
    mode,
    passwordRecoverySessionActive,
    session
  } = useAuthFlow();
  const route = publicAuthEntryRouteFromSegments(segments);
  const redirect = authenticatedAuthEntryDestination({
    bootstrapState,
    mode,
    passwordRecoveryCodePresent:
      route === "resetPassword" &&
      hasPasswordRecoveryCodeParameter(params.code),
    passwordRecoverySessionActive,
    route,
    session
  });

  if (redirect) return <Redirect href={redirect} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion
          ? "none"
          : rtl
            ? Platform.OS === "ios"
              ? "ios_from_left"
              : "slide_from_left"
            : "default",
        contentStyle: { backgroundColor: colors.canvas },
        gestureDirection: "horizontal",
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
