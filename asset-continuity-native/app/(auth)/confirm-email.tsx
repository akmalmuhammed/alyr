import { Redirect, useRouter } from "expo-router";
import { ArrowRight, EnvelopeSimpleOpen } from "phosphor-react-native";
import { StyleSheet, Text, View } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  TextAction
} from "@/auth/components";
import { AUTH_ROUTES, authStepNumber } from "@/auth/routes";
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
  const {
    acceptPendingHouseholdInvite,
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

  if (!email || !confirmation) {
    if (session) {
      return <Redirect href={AUTH_ROUTES.household} />;
    }
    return <Redirect href={AUTH_ROUTES.createAccount} />;
  }
  const maskedEmail = maskEmail(email);

  const continueAfterConfirmation = async () => {
    const session =
      mode === "preview"
        ? await continuePreview()
        : await checkConfirmedSession();
    if (!session) return;
    if (pendingHouseholdInvite) {
      const membership = await acceptPendingHouseholdInvite();
      if (membership) {
        router.replace("/");
        return;
      }
    }
    router.replace(AUTH_ROUTES.household);
  };

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
            loading: busy,
            onPress: () => void continueAfterConfirmation()
          }}
          secondary={{
            label:
              mode === "preview"
                ? copy.confirmEmail.differentEmail
                : copy.confirmEmail.requestAgain,
            disabled: busy,
            onPress: () => {
              if (mode === "preview") {
                router.replace(AUTH_ROUTES.createAccount);
              } else {
                void resendConfirmation();
              }
            }
          }}
        />
      }
      onBack={() => router.replace(AUTH_ROUTES.createAccount)}
      progress={authStepNumber("confirmEmail")}
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
        <AuthNotice tone={mode === "preview" ? "attention" : "neutral"}>
          {mode === "preview"
            ? copy.confirmEmail.previewNotice
            : copy.confirmEmail.liveNotice}
        </AuthNotice>
        {error ? (
          <ErrorBanner
            message={localizeAuthFailure(error, language)}
            onDismiss={clearError}
          />
        ) : null}
        {statusMessage ? (
          <View>
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
