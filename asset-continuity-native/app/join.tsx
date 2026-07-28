import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ShieldCheck
} from "phosphor-react-native";
import {
  useCallback,
  useEffect,
  useRef
} from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import { useInviteCopy } from "@/i18n/inviteCopy";
import { colors, spacing } from "@/theme/tokens";

export default function JoinHouseholdScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();
  const {
    acceptPendingHouseholdInvite,
    bootstrapState,
    busy,
    clearError,
    discardPendingHouseholdInvite,
    error,
    pendingHouseholdInvite,
    session,
    stageHouseholdInvite
  } = useAuthFlow();
  const copy = useInviteCopy();
  const rawCode = Array.isArray(params.code)
    ? params.code[0]
    : params.code;
  const stagedCode = useRef<string | null>(null);
  const stagingInFlight = useRef(false);
  const acceptanceStarted = useRef(false);
  const acceptanceInFlight = useRef(false);

  const protectInvitation = useCallback(
    async (oneTimeCode: string) => {
      if (stagingInFlight.current) return;
      stagingInFlight.current = true;
      clearError();
      try {
        const stored = await stageHouseholdInvite(oneTimeCode);
        if (stored) {
          // Remove the bearer from visible route state as soon as its
          // encrypted device-bound copy is durable.
          router.replace(AUTH_ROUTES.join);
        }
      } finally {
        stagingInFlight.current = false;
      }
    },
    [clearError, router, stageHouseholdInvite]
  );

  const acceptInvitation = useCallback(async () => {
    if (acceptanceInFlight.current) return;
    acceptanceInFlight.current = true;
    clearError();
    try {
      const membership = await acceptPendingHouseholdInvite();
      if (membership) router.replace("/");
    } catch {
      // The auth flow owns the localized, privacy-preserving error state.
    } finally {
      acceptanceInFlight.current = false;
    }
  }, [acceptPendingHouseholdInvite, clearError, router]);

  useEffect(() => {
    if (!rawCode || stagedCode.current === rawCode) return;
    stagedCode.current = rawCode;
    void protectInvitation(rawCode);
  }, [protectInvitation, rawCode]);

  useEffect(() => {
    if (
      acceptanceStarted.current ||
      bootstrapState !== "ready" ||
      !session ||
      !pendingHouseholdInvite
    ) {
      return;
    }
    acceptanceStarted.current = true;
    void acceptInvitation();
  }, [
    acceptInvitation,
    bootstrapState,
    pendingHouseholdInvite,
    session
  ]);

  const closeInvitation = async () => {
    await discardPendingHouseholdInvite();
    clearError();
    router.replace(session ? "/" : AUTH_ROUTES.welcome);
  };

  const loading =
    bootstrapState === "bootstrapping" ||
    Boolean(rawCode && !pendingHouseholdInvite && !error) ||
    Boolean(session && pendingHouseholdInvite && !error);
  const invalid =
    bootstrapState === "ready" &&
    !loading &&
    (!pendingHouseholdInvite || Boolean(error));
  const retryableStagingFailure =
    invalid &&
    Boolean(rawCode && error?.retryable && !pendingHouseholdInvite);
  const retryableAcceptanceFailure =
    invalid &&
    Boolean(
      session &&
        pendingHouseholdInvite &&
        error?.retryable
    );
  const retryableFailure =
    retryableStagingFailure || retryableAcceptanceFailure;

  return (
    <AuthScaffold
      footer={
        loading ? undefined : retryableFailure ? (
          <AuthActions
            primary={{
              label: copy.joinLink.retryAction,
              icon: ArrowRight,
              disabled: busy,
              onPress: () => {
                if (retryableAcceptanceFailure) {
                  void acceptInvitation();
                } else if (rawCode) {
                  void protectInvitation(rawCode);
                }
              }
            }}
            secondary={{
              label: copy.joinLink.cancelAction,
              disabled: busy,
              onPress: () => void closeInvitation()
            }}
          />
        ) : invalid ? (
          <AuthActions
            primary={{
              label: copy.joinLink.cancelAction,
              icon: ArrowLeft,
              onPress: () => void closeInvitation()
            }}
          />
        ) : (
          <AuthActions
            primary={{
              label: copy.joinLink.existingAction,
              icon: ArrowRight,
              disabled: busy,
              onPress: () => router.push(AUTH_ROUTES.signIn)
            }}
            secondary={{
              label: copy.joinLink.newAction,
              disabled: busy,
              onPress: () => router.push(AUTH_ROUTES.createAccount)
            }}
          />
        )
      }
      onBack={() => void closeInvitation()}
      testID="join-household-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={
            retryableAcceptanceFailure
              ? copy.joinLink.acceptRetryBody
              : retryableStagingFailure
                ? copy.joinLink.retryBody
              : invalid
              ? copy.joinLink.invalidBody
              : loading
                ? session
                  ? copy.joinLink.acceptingBody
                  : copy.joinLink.protectingBody
                : copy.joinLink.body
          }
          eyebrow={copy.joinLink.eyebrow}
          title={
            retryableAcceptanceFailure
              ? copy.joinLink.acceptRetryTitle
              : retryableStagingFailure
                ? copy.joinLink.retryTitle
              : invalid
              ? copy.joinLink.invalidTitle
              : loading
                ? session
                  ? copy.joinLink.acceptingTitle
                  : copy.joinLink.protectingTitle
                : copy.joinLink.title
          }
        />
        {loading ? (
          <View
            accessibilityRole="progressbar"
            style={styles.progress}
          >
            <ActivityIndicator color={colors.text} size="small" />
            <AuthNotice live>
              {session
                ? copy.joinLink.acceptingBody
                : copy.joinLink.protectingBody}
            </AuthNotice>
          </View>
        ) : retryableAcceptanceFailure ? (
          <AuthNotice live tone="attention">
            {copy.joinLink.acceptRetryBody}
          </AuthNotice>
        ) : retryableStagingFailure ? (
          <AuthNotice live tone="attention">
            {copy.joinLink.retryBody}
          </AuthNotice>
        ) : invalid ? (
          <AuthNotice live tone="attention">
            {copy.joinLink.invalidBody}
          </AuthNotice>
        ) : (
          <>
            <View style={styles.status}>
              <CheckCircle
                color={colors.success}
                size={24}
                weight="fill"
              />
              <AuthNotice live>{copy.joinLink.title}</AuthNotice>
            </View>
            <View style={styles.status}>
              <ShieldCheck color={colors.text} size={24} />
              <AuthNotice>
                {copy.joinLink.protectedNotice}
              </AuthNotice>
            </View>
          </>
        )}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  progress: {
    gap: spacing.md,
    alignItems: "flex-start"
  },
  status: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  }
});
