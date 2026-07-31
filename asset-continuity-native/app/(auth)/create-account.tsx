import { useRouter } from "expo-router";
import { ArrowRight } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
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
  focusFirstInvalidAuthField
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  hasFieldErrors,
  normalizeEmail,
  normalizePilotAccessCode,
  validateCreateAccount,
  type FieldErrors
} from "@/auth/validation";
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  localizeFieldErrors,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import { useInviteCopy } from "@/i18n/inviteCopy";
import { colors, spacing, typography } from "@/theme/tokens";

export default function CreateAccountScreen() {
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const pilotAccessRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const {
    busy,
    clearError,
    createAccount,
    error,
    mode,
    pendingHouseholdInvite,
    refreshSignupMode,
    signupMode,
    signupModeState
  } = useAuthFlow();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const inviteCopy = useInviteCopy();
  const joiningHousehold =
    mode === "supabase" && Boolean(pendingHouseholdInvite);
  const standaloneSignedSignup =
    mode === "supabase" && !joiningHousehold;
  const trustedSignupMode =
    signupModeState === "ready" && signupMode !== null;
  const closedPilotSignup =
    standaloneSignedSignup &&
    trustedSignupMode &&
    signupMode === "closed_pilot";
  const publicSignup =
    standaloneSignedSignup &&
    trustedSignupMode &&
    signupMode !== "closed_pilot";
  const [email, setEmail] = useState("");
  const [pilotAccessCode, setPilotAccessCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (standaloneSignedSignup && signupModeState === "idle") {
      void refreshSignupMode();
    }
  }, [
    refreshSignupMode,
    signupModeState,
    standaloneSignedSignup
  ]);

  const submit = async () => {
    if (standaloneSignedSignup && !trustedSignupMode) {
      await refreshSignupMode();
      return;
    }
    const errors = localizeFieldErrors(
      validateCreateAccount({
        email,
        password,
        confirmPassword,
        pilotAccessCode,
        requirePilotAccess: closedPilotSignup
      }),
      language
    );
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      focusFirstInvalidAuthField([
        { error: errors.email, ref: emailRef },
        ...(closedPilotSignup
          ? [{
              error: errors.pilotAccessCode,
              ref: pilotAccessRef
            }]
          : []),
        { error: errors.password, ref: passwordRef },
        { error: errors.confirmPassword, ref: confirmRef }
      ]);
      return;
    }

    const attempt = await createAccount(
      normalizeEmail(email),
      password,
      closedPilotSignup
        ? normalizePilotAccessCode(pilotAccessCode)
        : undefined
    );
    if (!attempt) return;
    setPassword("");
    setConfirmPassword("");
    setPilotAccessCode("");
    if (
      attempt.kind === "authenticated" &&
      pendingHouseholdInvite
    ) {
      router.replace(AUTH_ROUTES.join);
      return;
    }
    router.replace(
      attempt.kind === "authenticated"
        ? AUTH_ROUTES.household
        : AUTH_ROUTES.confirmEmail
    );
  };

  const clearFieldError = (key: keyof FieldErrors) => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (error) clearError();
  };

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label:
              mode === "supabase"
                ? joiningHousehold
                  ? inviteCopy.account.createAction
                  : !trustedSignupMode
                    ? signupModeState === "error"
                      ? copy.createAccount.availabilityRetry
                      : copy.createAccount.availabilityChecking
                    : closedPilotSignup
                      ? copy.createAccount.signedSubmit
                      : copy.createAccount.submit
                : copy.createAccount.submit,
            icon: ArrowRight,
            loading:
              busy ||
              (standaloneSignedSignup &&
                (signupModeState === "idle" ||
                  signupModeState === "loading")),
            onPress: () => void submit()
          }}
          secondary={{
            label: copy.createAccount.existingAccount,
            disabled:
              busy ||
              (standaloneSignedSignup &&
                signupModeState === "loading"),
            onPress: () => router.replace(AUTH_ROUTES.signIn)
          }}
        />
      }
      onBack={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }
        router.replace(AUTH_ROUTES.welcome);
      }}
      testID="auth-create-account-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={copy.createAccount.body}
          eyebrow={copy.createAccount.eyebrow}
          title={copy.createAccount.title}
        />
        {error ? (
          <ErrorBanner
            message={localizeAuthFailure(error, language)}
            onDismiss={clearError}
          />
        ) : null}
        {mode === "preview" ? (
          <AuthNotice tone="attention">
            {copy.createAccount.previewNotice}
          </AuthNotice>
        ) : joiningHousehold ? (
          <AuthNotice tone="neutral">
            {inviteCopy.account.signupNotice}
          </AuthNotice>
        ) : standaloneSignedSignup ? (
          <AuthNotice tone="attention" live>
            {!trustedSignupMode
              ? signupModeState === "error"
                ? copy.createAccount.availabilityUnavailable
                : copy.createAccount.availabilityChecking
              : closedPilotSignup
                ? copy.createAccount.pilotNotice
                : copy.createAccount.publicNotice}
          </AuthNotice>
        ) : null}
        <View style={styles.fields}>
          <AuthField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            error={fieldErrors.email}
            keyboardType="email-address"
            label={copy.createAccount.email}
            onChangeText={(value) => {
              setEmail(value);
              clearFieldError("email");
            }}
            onSubmitEditing={() =>
              closedPilotSignup
                ? pilotAccessRef.current?.focus()
                : passwordRef.current?.focus()
            }
            placeholder={copy.createAccount.emailPlaceholder}
            returnKeyType="next"
            ref={emailRef}
            testID="auth-create-email"
            textContentType="emailAddress"
            value={email}
          />
          {closedPilotSignup ? (
            <AuthField
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect={false}
              description={copy.createAccount.pilotAccessDescription}
              error={fieldErrors.pilotAccessCode}
              label={copy.createAccount.pilotAccessCode}
              maxLength={80}
              onChangeText={(value) => {
                setPilotAccessCode(value);
                clearFieldError("pilotAccessCode");
              }}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder={copy.createAccount.pilotAccessPlaceholder}
              ref={pilotAccessRef}
              returnKeyType="next"
              style={styles.codeInput}
              testID="auth-create-pilot-access"
              value={pilotAccessCode}
            />
          ) : null}
          <AuthField
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            description={copy.createAccount.passwordDescription}
            error={fieldErrors.password}
            label={copy.createAccount.password}
            onChangeText={(value) => {
              setPassword(value);
              clearFieldError("password");
            }}
            onSubmitEditing={() => confirmRef.current?.focus()}
            passwordVisibility={{
              showLabel: copy.common.showPassword,
              hideLabel: copy.common.hidePassword
            }}
            passwordRules="minlength: 10; maxlength: 128;"
            placeholder={copy.createAccount.passwordPlaceholder}
            ref={passwordRef}
            returnKeyType="next"
            secureTextEntry
            testID="auth-create-password"
            textContentType="newPassword"
            value={password}
          />
          <AuthField
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            error={fieldErrors.confirmPassword}
            label={copy.createAccount.confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              clearFieldError("confirmPassword");
            }}
            onSubmitEditing={() => void submit()}
            passwordVisibility={{
              showLabel: copy.common.showPassword,
              hideLabel: copy.common.hidePassword
            }}
            placeholder={copy.createAccount.confirmPasswordPlaceholder}
            ref={confirmRef}
            returnKeyType="go"
            secureTextEntry
            testID="auth-create-confirm-password"
            textContentType="newPassword"
            value={confirmPassword}
          />
        </View>
        <View style={styles.legal}>
          <Text
            style={[
              styles.legalBody,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {publicSignup
              ? copy.createAccount.publicLegalAcknowledgement
              : copy.createAccount.legalAcknowledgement}
          </Text>
          <View style={[styles.legalLinks, rtl && styles.rowReverse]}>
            <LegalLink
              label={copy.createAccount.privacyNotice}
              onPress={() => router.push("/privacy-policy")}
              rtl={rtl}
            />
            <LegalLink
              label={publicSignup
                ? copy.createAccount.terms
                : copy.createAccount.pilotTerms}
              onPress={() => router.push("/terms")}
              rtl={rtl}
            />
          </View>
        </View>
      </View>
    </AuthScaffold>
  );
}

function LegalLink({
  label,
  onPress,
  rtl
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.legalLink,
        pressed && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.legalLinkLabel,
          rtl && styles.arabicMedium
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  fields: {
    gap: spacing.lg
  },
  legal: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  codeInput: {
    fontFamily: typography.bodyBold,
    letterSpacing: 1.2,
    textAlign: "left",
    writingDirection: "ltr"
  },
  legalBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  legalLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginStart: -spacing.sm
  },
  legalLinkLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    textDecorationLine: "underline"
  },
  pressed: {
    opacity: 0.62
  },
  rowReverse: {
    ...rtlRowStyle()
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
