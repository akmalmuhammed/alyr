import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowRight, CheckCircle, Key } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  TextInput,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  AuthStatusRow,
  focusFirstInvalidAuthField
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  hasFieldErrors,
  validatePasswordReset,
  type FieldErrors
} from "@/auth/validation";
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  localizeFieldErrors,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { colors, spacing } from "@/theme/tokens";

function firstParameter(
  value: string | readonly string[] | undefined
): string {
  return typeof value === "string" ? value : value?.[0] ?? "";
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
  }>();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const exchangeAttempted = useRef(false);
  const {
    busy,
    cancelPasswordRecovery,
    clearError,
    email,
    error,
    exchangePasswordRecoveryCode,
    mode,
    passwordRecovery,
    passwordRecoveryGrant,
    updatePassword
  } = useAuthFlow();
  const { copy, language } = useCoreJourneyCopy();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [checking, setChecking] = useState(mode === "supabase");
  const [leaving, setLeaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const exitConfirmed = useRef(false);
  const exitAttempt = useRef<Promise<boolean> | null>(null);
  const recoveryReady =
    mode === "preview"
      ? Boolean(passwordRecovery)
      : mode === "supabase"
        ? Boolean(passwordRecoveryGrant)
        : false;

  const code = firstParameter(params.code);
  useEffect(() => {
    let active = true;
    if (mode === "preview") {
      setChecking(false);
      return () => {
        active = false;
      };
    }
    if (mode !== "supabase" || exchangeAttempted.current) return;
    exchangeAttempted.current = true;

    if (!code) {
      setChecking(false);
      return () => {
        active = false;
      };
    }
    void exchangePasswordRecoveryCode(code).finally(() => {
      if (active) setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [
    code,
    exchangePasswordRecoveryCode,
    mode,
    passwordRecovery
  ]);

  const leaveRecovery = useCallback(
    async (
      destination:
        | typeof AUTH_ROUTES.signIn
        | typeof AUTH_ROUTES.forgotPassword
    ): Promise<boolean> => {
      if (exitAttempt.current) return exitAttempt.current;
      setLeaving(true);
      const attempt = (async () => {
        const cancelled = await cancelPasswordRecovery();
        if (!cancelled) return false;
        exitConfirmed.current = true;
        router.replace(destination);
        return true;
      })();
      exitAttempt.current = attempt;
      try {
        return await attempt;
      } finally {
        exitAttempt.current = null;
        if (!exitConfirmed.current) setLeaving(false);
      }
    },
    [cancelPasswordRecovery, router]
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        void leaveRecovery(AUTH_ROUTES.signIn);
        return true;
      }
    );
    return () => subscription.remove();
  }, [leaveRecovery]);

  useEffect(
    () => () => {
      if (
        mode === "supabase" &&
        !exitConfirmed.current
      ) {
        void cancelPasswordRecovery();
      }
    },
    [cancelPasswordRecovery, mode]
  );

  const clearFieldError = (key: keyof FieldErrors) => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (error) clearError();
  };

  const submit = async () => {
    const errors = localizeFieldErrors(
      validatePasswordReset({
        email,
        password,
        confirmPassword
      }),
      language
    );
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      focusFirstInvalidAuthField([
        { error: errors.password, ref: passwordRef },
        { error: errors.confirmPassword, ref: confirmRef }
      ]);
      return;
    }
    const updated = await updatePassword(password);
    if (!updated) return;
    setPassword("");
    setConfirmPassword("");
    setComplete(true);
  };

  if (checking) {
    return (
      <AuthScaffold
        onBack={() => void leaveRecovery(AUTH_ROUTES.signIn)}
        testID="auth-reset-password-checking"
      >
        <View style={styles.checking}>
          <ActivityIndicator color={colors.action} size="small" />
          <AuthNotice live>
            {leaving
              ? copy.resetPassword.ending
              : copy.resetPassword.checking}
          </AuthNotice>
          {error ? (
            <ErrorBanner
              message={localizeAuthFailure(error, language)}
              onDismiss={clearError}
            />
          ) : null}
        </View>
      </AuthScaffold>
    );
  }

  if (!recoveryReady) {
    return (
      <AuthScaffold
        footer={
          <AuthActions
            primary={{
              label: copy.forgotPassword.submit,
              icon: ArrowRight,
              loading: leaving,
              onPress: () =>
                void leaveRecovery(AUTH_ROUTES.forgotPassword)
            }}
            secondary={{
              label: copy.resetPassword.backToSignIn,
              disabled: leaving,
              onPress: () =>
                void leaveRecovery(AUTH_ROUTES.signIn)
            }}
          />
        }
        onBack={() => void leaveRecovery(AUTH_ROUTES.signIn)}
        testID="auth-reset-password-incomplete"
      >
        <View style={styles.content}>
          <AuthHeading
            body={
              mode === "preview"
                ? copy.resetPassword.previewIncomplete
                : copy.resetPassword.incomplete
            }
            eyebrow={copy.resetPassword.eyebrow}
            title={copy.resetPassword.title}
          />
          {error ? (
            <ErrorBanner
              message={localizeAuthFailure(error, language)}
              onDismiss={clearError}
            />
          ) : null}
        </View>
      </AuthScaffold>
    );
  }

  if (complete) {
    return (
      <AuthScaffold
        footer={
          <AuthActions
            primary={{
              label: copy.resetPassword.backToSignIn,
              icon: ArrowRight,
              loading: busy || leaving,
              onPress: () =>
                void leaveRecovery(AUTH_ROUTES.signIn)
            }}
          />
        }
        testID="auth-reset-password-complete"
      >
        <View style={styles.content}>
          <AuthHeading
            body={
              mode === "preview"
                ? copy.resetPassword.previewCompleteBody
                : copy.resetPassword.completeBody
            }
            eyebrow={copy.resetPassword.eyebrow}
            focusOnChange
            title={
              mode === "preview"
                ? copy.resetPassword.previewCompleteTitle
                : copy.resetPassword.completeTitle
            }
          />
          <AuthStatusRow
            detail={
              mode === "preview"
                ? copy.resetPassword.previewCompleteDetail
                : copy.resetPassword.completeDetail
            }
            eyebrow={
              mode === "preview"
                ? copy.resetPassword.previewCompleteStatus
                : copy.resetPassword.completeStatus
            }
            icon={CheckCircle}
            live
            value={copy.resetPassword.completeValue}
          />
          {error ? (
            <ErrorBanner
              message={localizeAuthFailure(error, language)}
              onDismiss={clearError}
            />
          ) : null}
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label: copy.resetPassword.submit,
            icon: Key,
            loading: busy,
            onPress: () => void submit()
          }}
          secondary={{
            label: copy.resetPassword.backToSignIn,
            disabled: busy || leaving,
            onPress: () =>
              void leaveRecovery(AUTH_ROUTES.signIn)
          }}
        />
      }
      onBack={() => void leaveRecovery(AUTH_ROUTES.signIn)}
      testID="auth-reset-password-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={copy.resetPassword.body}
          eyebrow={copy.resetPassword.eyebrow}
          title={copy.resetPassword.title}
        />
        {error ? (
          <ErrorBanner
            message={localizeAuthFailure(error, language)}
            onDismiss={clearError}
          />
        ) : null}
        {mode === "preview" ? (
          <AuthNotice tone="attention">
            {copy.resetPassword.previewNotice}
          </AuthNotice>
        ) : null}
        <View style={styles.fields}>
          <AuthField
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            description={copy.resetPassword.passwordDescription}
            error={fieldErrors.password}
            label={copy.resetPassword.password}
            onChangeText={(value) => {
              setPassword(value);
              clearFieldError("password");
            }}
            onSubmitEditing={() => confirmRef.current?.focus()}
            passwordRules="minlength: 10; maxlength: 128;"
            placeholder={copy.resetPassword.passwordPlaceholder}
            ref={passwordRef}
            returnKeyType="next"
            secureTextEntry
            textContentType="newPassword"
            value={password}
          />
          <AuthField
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            error={fieldErrors.confirmPassword}
            label={copy.resetPassword.confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              clearFieldError("confirmPassword");
            }}
            onSubmitEditing={() => void submit()}
            placeholder={copy.resetPassword.confirmPasswordPlaceholder}
            ref={confirmRef}
            returnKeyType="go"
            secureTextEntry
            textContentType="newPassword"
            value={confirmPassword}
          />
        </View>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  checking: {
    gap: spacing.lg,
    paddingTop: spacing.xxl
  },
  content: {
    gap: spacing.xl
  },
  fields: {
    gap: spacing.lg
  }
});
