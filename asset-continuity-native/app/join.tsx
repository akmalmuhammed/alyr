import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ShieldCheck
} from "phosphor-react-native";
import { useEffect, useRef } from "react";
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
  const acceptanceStarted = useRef(false);

  useEffect(() => {
    if (!rawCode || stagedCode.current === rawCode) return;
    stagedCode.current = rawCode;
    void stageHouseholdInvite(rawCode).then((stored) => {
      if (stored) {
        // Remove the bearer from visible route state as soon as its encrypted
        // device-bound copy is durable.
        router.replace(AUTH_ROUTES.join);
      }
    });
  }, [rawCode, router, stageHouseholdInvite]);

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
    void acceptPendingHouseholdInvite().then((membership) => {
      if (membership) router.replace("/");
    });
  }, [
    acceptPendingHouseholdInvite,
    bootstrapState,
    pendingHouseholdInvite,
    router,
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

  return (
    <AuthScaffold
      footer={
        loading ? undefined : invalid ? (
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
            invalid
              ? copy.joinLink.invalidBody
              : loading && session
                ? copy.joinLink.acceptingBody
                : copy.joinLink.body
          }
          eyebrow={copy.joinLink.eyebrow}
          title={
            invalid
              ? copy.joinLink.invalidTitle
              : loading && session
                ? copy.joinLink.acceptingTitle
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
              {copy.joinLink.acceptingBody}
            </AuthNotice>
          </View>
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
