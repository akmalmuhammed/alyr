import { useRouter } from "expo-router";
import { ArrowRight } from "phosphor-react-native";
import { useRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  TextAction,
  focusFirstInvalidAuthField,
  isCompactAuthViewport
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  hasFieldErrors,
  normalizeEmail,
  validateSignIn,
  type FieldErrors
} from "@/auth/validation";
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  localizeFieldErrors,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { spacing } from "@/theme/tokens";

export default function SignInScreen() {
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const {
    busy,
    clearError,
    error,
    mode,
    pendingHouseholdInvite,
    resendConfirmation,
    signIn,
    acceptPendingHouseholdInvite
  } = useAuthFlow();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const compact = isCompactAuthViewport(useWindowDimensions());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const submit = async () => {
    const errors = localizeFieldErrors(
      validateSignIn({ email, password }),
      language
    );
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      focusFirstInvalidAuthField([
        { error: errors.email, ref: emailRef },
        { error: errors.password, ref: passwordRef }
      ]);
      return;
    }

    const attempt = await signIn(normalizeEmail(email), password);
    if (!attempt) return;
    setPassword("");

    if (attempt.kind !== "authenticated") {
      router.replace(AUTH_ROUTES.confirmEmail);
      return;
    }
    if (pendingHouseholdInvite) {
      const membership = await acceptPendingHouseholdInvite();
      if (membership) {
        router.replace("/");
        return;
      }
    }
    router.replace(
      attempt.session.onboarding === "complete"
        ? "/"
        : AUTH_ROUTES.household
    );
  };

  const actions = (
    <AuthActions
      primary={{
        label: copy.signIn.submit,
        icon: ArrowRight,
        loading: busy,
        onPress: () => void submit()
      }}
      secondary={{
        label: copy.signIn.createAccount,
        disabled: busy,
        onPress: () => router.replace(AUTH_ROUTES.createAccount)
      }}
    />
  );

  return (
    <AuthScaffold
      footer={
        compact && mode === "preview" ? (
          <View style={styles.compactFooter}>
            {actions}
            <AuthNotice tone="attention">
              {copy.signIn.previewNotice}
            </AuthNotice>
          </View>
        ) : (
          actions
        )
      }
      onBack={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }
        router.replace(AUTH_ROUTES.welcome);
      }}
      testID="auth-sign-in-screen"
    >
      <View style={[styles.content, compact && styles.contentCompact]}>
        <AuthHeading
          body={copy.signIn.body}
          eyebrow={copy.signIn.eyebrow}
          title={copy.signIn.title}
        />
        {error ? (
          <View style={styles.errorBlock}>
            <ErrorBanner
              message={localizeAuthFailure(error, language)}
              onDismiss={clearError}
            />
            {error.code === "confirmation_required" ? (
              <TextAction
                disabled={busy}
                label={copy.confirmEmail.requestAgain}
                onPress={() => {
                  void resendConfirmation().then((accepted) => {
                    if (accepted) {
                      router.replace(AUTH_ROUTES.confirmEmail);
                    }
                  });
                }}
              />
            ) : null}
          </View>
        ) : null}
        {mode === "preview" && !compact ? (
          <AuthNotice tone="attention">
            {copy.signIn.previewNotice}
          </AuthNotice>
        ) : null}
        <View style={[styles.fields, compact && styles.fieldsCompact]}>
          <AuthField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={fieldErrors.email}
            keyboardType="email-address"
            label={copy.signIn.email}
            onChangeText={(value) => {
              setEmail(value);
              if (fieldErrors.email) {
                setFieldErrors((current) => {
                  const { email: _email, ...rest } = current;
                  return rest;
                });
              }
              if (error) clearError();
            }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder={copy.signIn.emailPlaceholder}
            ref={emailRef}
            returnKeyType="next"
            textContentType="username"
            value={email}
          />
          <AuthField
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            error={fieldErrors.password}
            label={copy.signIn.password}
            onChangeText={(value) => {
              setPassword(value);
              if (fieldErrors.password) {
                setFieldErrors((current) => {
                  const { password: _password, ...rest } = current;
                  return rest;
                });
              }
              if (error) clearError();
            }}
            onSubmitEditing={() => void submit()}
            placeholder={copy.signIn.passwordPlaceholder}
            ref={passwordRef}
            returnKeyType="go"
            secureTextEntry
            textContentType="password"
            value={password}
          />
          <View
            style={[
              styles.inlineAction,
              rtl && styles.inlineActionRtl
            ]}
          >
            <TextAction
              disabled={busy}
              label={copy.signIn.forgotPassword}
              onPress={() => router.push(AUTH_ROUTES.forgotPassword)}
            />
          </View>
        </View>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  contentCompact: {
    gap: spacing.md
  },
  fields: {
    gap: spacing.lg
  },
  fieldsCompact: {
    gap: spacing.md
  },
  compactFooter: {
    gap: spacing.md
  },
  errorBlock: {
    gap: spacing.xs
  },
  inlineAction: {
    alignItems: "flex-end",
    marginTop: -spacing.sm
  },
  inlineActionRtl: {
    alignItems: "flex-start"
  }
});
