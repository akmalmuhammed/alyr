import { useRouter } from "expo-router";
import { ArrowRight, EnvelopeSimple } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthField,
  AuthHeading,
  AuthScaffold,
  AuthStatusRow,
  TextAction,
  focusFirstInvalidAuthField
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  normalizeEmail,
  maskEmail,
  validateEmail
} from "@/auth/validation";
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  localizeFieldErrors,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { spacing } from "@/theme/tokens";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const {
    busy,
    clearError,
    email: rememberedEmail,
    error,
    mode,
    passwordRecovery,
    requestPasswordRecovery
  } = useAuthFlow();
  const { copy, language } = useCoreJourneyCopy();
  const [email, setEmail] = useState(rememberedEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  useEffect(() => {
    if (!editingEmail) return;
    const frame = requestAnimationFrame(() => emailRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editingEmail]);

  const submit = async () => {
    const validation = validateEmail(email);
    const localized = validation
      ? localizeFieldErrors({ email: validation }, language).email ??
        validation
      : null;
    setEmailError(localized);
    if (localized) {
      focusFirstInvalidAuthField([
        { error: localized, ref: emailRef }
      ]);
      return;
    }
    const accepted = await requestPasswordRecovery(normalizeEmail(email));
    if (accepted) setEditingEmail(false);
  };

  const sent = Boolean(passwordRecovery) && !editingEmail;
  return (
    <AuthScaffold
      footer={
        sent ? (
          <AuthActions
            primary={{
              label:
                mode === "preview"
                  ? copy.forgotPassword.openPreviewReset
                  : copy.forgotPassword.backToSignIn,
              icon: ArrowRight,
              disabled: busy,
              onPress: () =>
                router.replace(
                  mode === "preview"
                    ? AUTH_ROUTES.resetPassword
                    : AUTH_ROUTES.signIn
                )
            }}
            secondary={{
              label: copy.forgotPassword.sendAgain,
              disabled: busy,
              onPress: () => void submit()
            }}
          />
        ) : (
          <AuthActions
            primary={{
              label: copy.forgotPassword.submit,
              icon: EnvelopeSimple,
              loading: busy,
              onPress: () => void submit()
            }}
            secondary={{
              label: copy.forgotPassword.backToSignIn,
              disabled: busy,
              onPress: () => router.replace(AUTH_ROUTES.signIn)
            }}
          />
        )
      }
      onBack={() => router.replace(AUTH_ROUTES.signIn)}
      testID="auth-forgot-password-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={
            sent
              ? mode === "preview"
                ? copy.forgotPassword.previewBody
                : copy.forgotPassword.sentBody
              : copy.forgotPassword.body
          }
          eyebrow={
            sent
              ? mode === "preview"
                ? copy.forgotPassword.previewSentEyebrow
                : copy.forgotPassword.sentEyebrow
              : copy.forgotPassword.eyebrow
          }
          title={
            sent
              ? mode === "preview"
                ? copy.forgotPassword.previewSentTitle
                : copy.forgotPassword.sentTitle
              : copy.forgotPassword.title
          }
          focusOnChange={sent}
        />
        {error ? (
          <ErrorBanner
            message={localizeAuthFailure(error, language)}
            onDismiss={clearError}
          />
        ) : null}
        {sent ? (
          <View style={styles.sentState}>
            <AuthStatusRow
              detail={copy.forgotPassword.destinationNote}
              eyebrow={
                mode === "preview"
                  ? copy.forgotPassword.previewRequestReady
                  : copy.forgotPassword.requestAccepted
              }
              icon={EnvelopeSimple}
              live
              value={maskEmail(passwordRecovery?.destination ?? email)}
              valueDirection="ltr"
            />
            <TextAction
              disabled={busy}
              label={copy.forgotPassword.differentEmail}
              onPress={() => setEditingEmail(true)}
            />
          </View>
        ) : (
          <AuthField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={emailError}
            keyboardType="email-address"
            label={copy.forgotPassword.email}
            onChangeText={(value) => {
              setEmail(value);
              setEmailError(null);
              if (error) clearError();
            }}
            onSubmitEditing={() => void submit()}
            placeholder={copy.forgotPassword.emailPlaceholder}
            ref={emailRef}
            returnKeyType="go"
            textContentType="emailAddress"
            value={email}
          />
        )}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  sentState: {
    gap: spacing.xs
  }
});
