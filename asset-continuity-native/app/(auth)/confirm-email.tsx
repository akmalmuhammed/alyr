import {
  Redirect,
  useLocalSearchParams,
  useRouter
} from "expo-router";
import { ArrowRight, EnvelopeSimpleOpen } from "phosphor-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
  type AppStateStatus
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  TextAction
} from "@/auth/components";
import {
  AUTH_ROUTES,
  authActivationProgress,
  confirmEmailReturnRoute
} from "@/auth/routes";
import { maskEmail } from "@/auth/validation";
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export function isolateLtrEmail(value: string): string {
  return `\u2066${value}\u2069`;
}

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    from?: string | string[];
  }>();
  const {
    busy,
    checkConfirmedSession,
    clearError,
    clearStatus,
    confirmation,
    email,
    continuePreview,
    error,
    mode,
    pendingHouseholdInvite,
    resendConfirmation,
    session,
    statusMessage
  } = useAuthFlow();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const returnRoute = confirmEmailReturnRoute(params.from);
  const [foregroundCycle, setForegroundCycle] = useState(0);
  const [processedForegroundCycle, setProcessedForegroundCycle] =
    useState(0);
  const [foregroundChecking, setForegroundChecking] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const foregroundExitObservedRef = useRef(
    AppState.currentState === "background" ||
      AppState.currentState === "inactive"
  );
  const confirmationCheckInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const continueAfterConfirmation = useCallback(
    async (source: "manual" | "foreground" = "manual") => {
      if (busy || confirmationCheckInFlightRef.current) return;
      confirmationCheckInFlightRef.current = true;
      if (source === "foreground") {
        setForegroundChecking(true);
      }
      try {
        const verifiedSession =
          mode === "preview"
            ? await continuePreview()
            : await checkConfirmedSession();
        if (!verifiedSession || !mountedRef.current) return;
        if (pendingHouseholdInvite) {
          router.replace(AUTH_ROUTES.join);
          return;
        }
        router.replace(AUTH_ROUTES.household);
      } finally {
        confirmationCheckInFlightRef.current = false;
        if (mountedRef.current) {
          setForegroundChecking(false);
        }
      }
    },
    [
      busy,
      checkConfirmedSession,
      continuePreview,
      mode,
      pendingHouseholdInvite,
      router
    ]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        const previousState = appStateRef.current;
        appStateRef.current = nextState;

        if (nextState === "background" || nextState === "inactive") {
          foregroundExitObservedRef.current = true;
          return;
        }
        if (
          mode === "supabase" &&
          nextState === "active" &&
          previousState !== "active" &&
          foregroundExitObservedRef.current
        ) {
          foregroundExitObservedRef.current = false;
          setForegroundCycle((cycle) => cycle + 1);
        }
      }
    );
    return () => subscription.remove();
  }, [mode]);

  useEffect(() => {
    if (
      foregroundCycle <= processedForegroundCycle ||
      mode !== "supabase" ||
      !email ||
      !confirmation ||
      busy ||
      confirmationCheckInFlightRef.current
    ) {
      return;
    }
    setProcessedForegroundCycle((cycle) => cycle + 1);
    void continueAfterConfirmation("foreground");
  }, [
    busy,
    confirmation,
    continueAfterConfirmation,
    email,
    foregroundCycle,
    foregroundChecking,
    mode,
    processedForegroundCycle
  ]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!busy) router.replace(returnRoute);
        return true;
      }
    );
    return () => subscription.remove();
  }, [busy, returnRoute, router]);

  if (!email || !confirmation) {
    if (session) {
      return (
        <Redirect
          href={
            pendingHouseholdInvite
              ? AUTH_ROUTES.join
              : AUTH_ROUTES.household
          }
        />
      );
    }
    return <Redirect href={AUTH_ROUTES.createAccount} />;
  }
  const maskedEmail = maskEmail(email);
  const checking = busy || foregroundChecking;

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label:
              mode === "preview"
                ? copy.confirmEmail.continuePreview
                : copy.confirmEmail.confirmed,
            icon: ArrowRight,
            loading: checking,
            onPress: () => void continueAfterConfirmation("manual")
          }}
          secondary={{
            label:
              mode === "preview"
                ? copy.confirmEmail.differentEmail
                : copy.confirmEmail.requestAgain,
            disabled: checking,
            onPress: () => {
              if (mode === "preview") {
                router.replace(returnRoute);
              } else {
                void resendConfirmation();
              }
            }
          }}
        />
      }
      backDisabled={busy}
      onBack={() => router.replace(returnRoute)}
      {...(mode === "supabase"
        ? {
            progress:
              authActivationProgress("confirmEmail")
          }
        : {})}
      testID="auth-confirm-email-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={
            mode === "preview"
              ? copy.confirmEmail.previewBody
              : copy.confirmEmail.liveBody
          }
          eyebrow={
            mode === "preview"
              ? copy.confirmEmail.previewEyebrow
              : copy.confirmEmail.liveEyebrow
          }
          title={
            mode === "preview"
              ? copy.confirmEmail.previewTitle
              : copy.confirmEmail.liveTitle
          }
        />
        <View style={[styles.destination, rtl && styles.rowReverse]}>
          <View style={styles.iconBox}>
            <EnvelopeSimpleOpen color={colors.text} size={24} />
          </View>
          <View style={styles.destinationCopy}>
            <Text
              style={[
                styles.destinationLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {confirmation.delivery === "none"
                ? copy.confirmEmail.testEmail
                : copy.confirmEmail.deliveryAccepted}
            </Text>
            <Text
              accessibilityLabel={maskedEmail}
              style={[
                styles.destinationValue,
                rtl && styles.destinationValueRtl
              ]}
            >
              {isolateLtrEmail(maskedEmail)}
            </Text>
          </View>
        </View>
        {foregroundChecking ? (
          <AuthNotice live tone="dark">
            {copy.confirmEmail.foregroundChecking}
          </AuthNotice>
        ) : (
          <AuthNotice
            tone={mode === "preview" ? "attention" : "neutral"}
          >
            {mode === "preview"
              ? copy.confirmEmail.previewNotice
              : copy.confirmEmail.liveNotice}
          </AuthNotice>
        )}
        {error ? (
          <ErrorBanner
            message={
              error.code === "session_missing"
                ? copy.confirmEmail.notConfirmedYet
                : localizeAuthFailure(error, language)
            }
            onDismiss={clearError}
          />
        ) : null}
        {statusMessage ? (
          <View style={styles.statusBlock}>
            <AuthNotice live>{copy.confirmEmail.resendAccepted}</AuthNotice>
            <TextAction
              label={copy.confirmEmail.dismissStatus}
              onPress={clearStatus}
            />
          </View>
        ) : null}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  statusBlock: {
    gap: spacing.xs
  },
  destination: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  iconBox: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.mist
  },
  destinationCopy: {
    flex: 1,
    gap: 3
  },
  destinationLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.8
  },
  destinationValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    writingDirection: "ltr"
  },
  destinationValueRtl: {
    textAlign: "right"
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
