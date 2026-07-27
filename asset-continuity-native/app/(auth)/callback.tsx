import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle
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
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { colors, spacing } from "@/theme/tokens";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const {
    acceptPendingHouseholdInvite,
    busy,
    clearError,
    error,
    exchangeConfirmationCode,
    pendingHouseholdInvite,
    session
  } = useAuthFlow();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const started = useRef(false);
  const code = Array.isArray(params.code) ? params.code[0] : params.code;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code) return;
    void exchangeConfirmationCode(code).then(async (nextSession) => {
      if (nextSession) {
        if (pendingHouseholdInvite) {
          const membership = await acceptPendingHouseholdInvite();
          if (membership) {
            router.replace("/");
            return;
          }
        }
        router.replace(
          nextSession.onboarding === "complete"
            ? "/"
            : AUTH_ROUTES.household
        );
      }
    });
  }, [
    acceptPendingHouseholdInvite,
    code,
    exchangeConfirmationCode,
    pendingHouseholdInvite,
    router
  ]);

  return (
    <AuthScaffold
      footer={
        error || !code ? (
          <AuthActions
            primary={{
              label: copy.callback.returnToConfirmation,
              icon: rtl ? ArrowRight : ArrowLeft,
              onPress: () => router.replace(AUTH_ROUTES.confirmEmail)
            }}
          />
        ) : undefined
      }
      testID="auth-callback-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={copy.callback.body}
          eyebrow={copy.callback.eyebrow}
          title={
            session
              ? copy.callback.confirmedTitle
              : copy.callback.checkingTitle
          }
        />
        {busy ? (
          <View
            accessibilityLabel={copy.callback.checkingLabel}
            accessibilityRole="progressbar"
            style={styles.checking}
          >
            <ActivityIndicator color={colors.text} size="small" />
            <AuthNotice live>{copy.callback.waiting}</AuthNotice>
          </View>
        ) : null}
        {!code ? (
          <ErrorBanner
            message={copy.callback.incompleteLink}
            onDismiss={() => router.replace(AUTH_ROUTES.confirmEmail)}
          />
        ) : null}
        {error ? (
          <ErrorBanner
            message={localizeAuthFailure(error, language)}
            onDismiss={clearError}
          />
        ) : null}
        {session ? (
          <View style={[styles.complete, rtl && styles.rowReverse]}>
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
  complete: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  rowReverse: {
    flexDirection: "row-reverse"
  }
});
