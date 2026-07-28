import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle
} from "phosphor-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  TextAction
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import type {
  AuthFailure,
  AuthFailureCode,
  AuthSessionDescriptor
} from "@/auth/types";
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { colors, spacing } from "@/theme/tokens";

type ConfirmationCallbackPhase =
  | "checking"
  | "failed"
  | "complete";

interface ConfirmationCallbackFailure {
  readonly stage: "exchange";
  readonly failure: AuthFailure;
}

const AUTH_FAILURE_CODES = new Set<AuthFailureCode>([
  "account_exists",
  "confirmation_required",
  "invalid_credentials",
  "invalid_request",
  "network_unavailable",
  "pilot_access_denied",
  "pilot_access_required",
  "pilot_capacity_reached",
  "rate_limited",
  "session_missing",
  "unsupported",
  "unexpected"
]);

function isAuthFailureCode(value: unknown): value is AuthFailureCode {
  return (
    typeof value === "string" &&
    AUTH_FAILURE_CODES.has(value as AuthFailureCode)
  );
}

/**
 * Maps rejected provider promises to the same finite, localized failure
 * vocabulary used by ordinary gateway results. Raw exception text never
 * reaches the callback UI.
 */
export function confirmationCallbackFailureFromException(
  exception: unknown
): AuthFailure {
  if (exception && typeof exception === "object") {
    const candidate = exception as {
      readonly code?: unknown;
      readonly message?: unknown;
      readonly retryable?: unknown;
    };
    if (isAuthFailureCode(candidate.code)) {
      return {
        code: candidate.code,
        message:
          typeof candidate.message === "string"
            ? candidate.message
            : "The account provider rejected confirmation.",
        retryable:
          typeof candidate.retryable === "boolean"
            ? candidate.retryable
            : true
      };
    }
  }

  const message =
    exception instanceof Error ? exception.message : String(exception ?? "");
  const normalized = message.toLowerCase();
  const code: AuthFailureCode =
    /network|fetch|offline|timed?\s*out/u.test(normalized)
      ? "network_unavailable"
      : /rate|too many|429/u.test(normalized)
        ? "rate_limited"
        : "unexpected";
  return {
    code,
    message: "The account provider did not complete confirmation.",
    retryable: true
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const {
    busy,
    clearError,
    email,
    error,
    exchangeConfirmationCode,
    pendingHouseholdInvite,
    resendConfirmation,
    session
  } = useAuthFlow();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const started = useRef(false);
  const attemptVersion = useRef(0);
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const [phase, setPhase] = useState<ConfirmationCallbackPhase>(
    code ? "checking" : "failed"
  );
  const [bannerVisible, setBannerVisible] = useState(!code);
  const [completionDestination, setCompletionDestination] =
    useState<
      | "/"
      | typeof AUTH_ROUTES.household
      | typeof AUTH_ROUTES.join
      | null
    >(null);
  const [callbackFailure, setCallbackFailure] =
    useState<ConfirmationCallbackFailure | null>(null);

  const continueWithVerifiedSession = useCallback(
    async (
      nextSession: AuthSessionDescriptor,
      attempt: number
    ): Promise<boolean> => {
      const destination:
        | "/"
        | typeof AUTH_ROUTES.household
        | typeof AUTH_ROUTES.join =
        pendingHouseholdInvite
          ? AUTH_ROUTES.join
          : nextSession.onboarding === "complete"
            ? "/"
            : AUTH_ROUTES.household;
      if (attempt !== attemptVersion.current) return false;
      setCallbackFailure(null);
      setCompletionDestination(destination);
      setPhase("complete");
      return true;
    },
    [pendingHouseholdInvite]
  );

  const checkConfirmation = useCallback(async () => {
    const attempt = attemptVersion.current + 1;
    attemptVersion.current = attempt;
    clearError();
    setBannerVisible(false);
    setCallbackFailure(null);
    setCompletionDestination(null);

    if (!code?.trim()) {
      setPhase("failed");
      setBannerVisible(true);
      return;
    }

    setPhase("checking");
    let nextSession: AuthSessionDescriptor | null = null;
    try {
      nextSession = await exchangeConfirmationCode(code);
    } catch (exception) {
      if (attempt !== attemptVersion.current) return;
      setCallbackFailure({
        stage: "exchange",
        failure:
          confirmationCallbackFailureFromException(exception)
      });
      setPhase("failed");
      setBannerVisible(true);
      return;
    }
    if (attempt !== attemptVersion.current) return;
    if (!nextSession) {
      setPhase("failed");
      setBannerVisible(true);
      return;
    }
    await continueWithVerifiedSession(nextSession, attempt);
  }, [
    clearError,
    code,
    continueWithVerifiedSession,
    exchangeConfirmationCode
  ]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code?.trim() && session?.identity.emailVerified) {
      const attempt = attemptVersion.current + 1;
      attemptVersion.current = attempt;
      setBannerVisible(false);
      setPhase("checking");
      void continueWithVerifiedSession(session, attempt);
      return;
    }
    void checkConfirmation();
  }, [
    checkConfirmation,
    code,
    continueWithVerifiedSession,
    session
  ]);

  const leaveCallback = useCallback(
    (
      destination:
        | typeof AUTH_ROUTES.signIn
        | typeof AUTH_ROUTES.forgotPassword
    ) => {
      attemptVersion.current += 1;
      clearError();
      router.replace(destination);
    },
    [clearError, router]
  );

  const requestAnotherConfirmation = useCallback(async () => {
    attemptVersion.current += 1;
    clearError();
    setCallbackFailure(null);
    setBannerVisible(false);
    if (!email.trim()) {
      router.replace(AUTH_ROUTES.signIn);
      return;
    }
    let accepted = false;
    try {
      accepted = await resendConfirmation();
    } catch (exception) {
      setCallbackFailure({
        stage: "exchange",
        failure:
          confirmationCallbackFailureFromException(exception)
      });
      setPhase("failed");
      setBannerVisible(true);
      return;
    }
    if (accepted) {
      router.replace(AUTH_ROUTES.confirmEmail);
      return;
    }
    setPhase("failed");
    setBannerVisible(true);
  }, [
    clearError,
    email,
    resendConfirmation,
    router
  ]);

  const retryFailure = useCallback(async () => {
    await checkConfirmation();
  }, [checkConfirmation]);

  const headingTitle =
    phase === "complete"
      ? copy.callback.confirmedTitle
      : phase === "failed"
        ? copy.callback.failedTitle
        : copy.callback.checkingTitle;
  const headingBody =
    phase === "failed"
      ? copy.callback.failedBody
      : copy.callback.body;
  const failureMessage = !code?.trim()
    ? copy.callback.incompleteLink
    : callbackFailure
      ? localizeAuthFailure(callbackFailure.failure, language)
      : error
        ? localizeAuthFailure(error, language)
        : copy.callback.exchangeFailed;
  return (
    <AuthScaffold
      footer={
        phase === "failed" ? (
          <AuthActions
            primary={{
              label: code?.trim()
                ? copy.callback.retry
                : email.trim()
                  ? copy.callback.requestNewLink
                  : copy.callback.signInToResend,
              icon: rtl ? ArrowLeft : ArrowRight,
              loading: busy,
              disabled: busy,
              onPress: () =>
                code?.trim()
                  ? void retryFailure()
                  : void requestAnotherConfirmation()
            }}
            secondary={{
              label: copy.callback.signIn,
              disabled: busy,
              onPress: () => leaveCallback(AUTH_ROUTES.signIn)
            }}
          />
        ) : phase === "complete" && completionDestination ? (
          <AuthActions
            primary={{
              label: copy.callback.continue,
              icon: rtl ? ArrowLeft : ArrowRight,
              onPress: () => router.replace(completionDestination)
            }}
          />
        ) : undefined
      }
      testID="auth-callback-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={headingBody}
          eyebrow={copy.callback.eyebrow}
          focusOnChange={phase !== "checking"}
          title={headingTitle}
        />
        {phase === "checking" ? (
          <View
            accessibilityLabel={copy.callback.checkingLabel}
            accessibilityRole="progressbar"
            style={styles.checking}
            testID="auth-callback-checking"
          >
            <ActivityIndicator color={colors.text} size="small" />
            <AuthNotice live>{copy.callback.waiting}</AuthNotice>
          </View>
        ) : null}
        {phase === "failed" ? (
          <View style={styles.recovery} testID="auth-callback-failed">
            {bannerVisible ? (
              <ErrorBanner
                message={failureMessage}
                onDismiss={() => {
                  clearError();
                  setBannerVisible(false);
                }}
              />
            ) : null}
            <AuthNotice live tone="attention">
              {copy.callback.failedNotice}
            </AuthNotice>
            <View
              accessibilityLabel={copy.callback.otherOptions}
              style={styles.recoveryActions}
            >
              <TextAction
                disabled={busy}
                label={
                  email.trim()
                    ? copy.callback.resend
                    : copy.callback.signInToResend
                }
                onPress={() => void requestAnotherConfirmation()}
              />
              <TextAction
                disabled={busy}
                label={copy.callback.recover}
                onPress={() =>
                  leaveCallback(AUTH_ROUTES.forgotPassword)
                }
              />
            </View>
          </View>
        ) : null}
        {phase === "complete" ? (
          <View
            style={[styles.complete, rtl && styles.rowReverse]}
            testID="auth-callback-complete"
          >
            <CheckCircle color={colors.success} size={24} weight="fill" />
            <AuthNotice live>{copy.callback.complete}</AuthNotice>
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
  checking: {
    gap: spacing.md,
    alignItems: "flex-start"
  },
  recovery: {
    gap: spacing.md
  },
  recoveryActions: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  complete: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  rowReverse: {
    flexDirection: "row-reverse"
  }
});
