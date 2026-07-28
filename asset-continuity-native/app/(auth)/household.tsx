import { Redirect, useRouter } from "expo-router";
import {
  ArrowRight,
  CaretDown,
  CaretUp,
  Key,
  ShieldCheck
} from "phosphor-react-native";
import { useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import {
  PREVIEW_HOUSEHOLD_INVITE_CODE,
  useAuthFlow
} from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthField,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  TextAction,
  focusFirstInvalidAuthField
} from "@/auth/components";
import {
  AUTH_ROUTES,
  authActivationProgress
} from "@/auth/routes";
import { completeSignedAccountExit } from "@/auth/signedAccountExit";
import { validateHouseholdName } from "@/auth/validation";
import {
  localizeAuthFailure,
  localizeValidationMessage,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import {
  inviteFailureMessage,
  useInviteCopy
} from "@/i18n/inviteCopy";
import { colors, spacing, typography } from "@/theme/tokens";

export default function HouseholdSetupScreen() {
  const router = useRouter();
  const nameRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const {
    activeHouseholdId,
    busy,
    clearError,
    error: authError,
    householdName,
    provisionHousehold,
    mode,
    pendingHouseholdInvite,
    session,
    setHouseholdName,
    stageHouseholdInvite,
    signOut
  } = useAuthFlow();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const inviteCopy = useInviteCopy();
  const [inviteEntryOpen, setInviteEntryOpen] = useState(false);
  const [name, setName] = useState(
    householdName.trim() || copy.household.defaultName
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteCodeError, setInviteCodeError] =
    useState<string | null>(null);
  const [leavingAccount, setLeavingAccount] = useState(false);
  const householdAlreadyCreated = Boolean(activeHouseholdId);
  const accountAccessPending =
    householdAlreadyCreated &&
    (!session?.activeMembershipId ||
      session.activeHouseholdRole !== "owner");
  const reviewingInvitation =
    Boolean(pendingHouseholdInvite) || inviteEntryOpen;

  if (!session) return <Redirect href={AUTH_ROUTES.signIn} />;
  if (
    session.onboarding === "complete" &&
    activeHouseholdId &&
    session.activeMembershipId &&
    session.activeHouseholdRole
  ) {
    return <Redirect href="/" />;
  }

  const advance = async () => {
    if (reviewingInvitation) {
      if (pendingHouseholdInvite) {
        router.replace(AUTH_ROUTES.join);
        return;
      }
      const normalizedCode = inviteCode.trim().toUpperCase();
      if (!normalizedCode) {
        setInviteCodeError(inviteCopy.household.codeRequired);
        focusFirstInvalidAuthField([
          { error: "Invitation code required", ref: codeRef }
        ]);
        return;
      }
      const staged = await stageHouseholdInvite(normalizedCode);
      if (!staged) return;
      router.push(AUTH_ROUTES.join);
      return;
    }

    const error = localizeValidationMessage(
      validateHouseholdName(name),
      language
    ) ?? null;
    setNameError(error);
    if (error) {
      focusFirstInvalidAuthField([{ error, ref: nameRef }]);
      return;
    }
    const householdId = await provisionHousehold(name);
    if (!householdId) return;
    setHouseholdName(name.trim());
    router.push(AUTH_ROUTES.privacy);
  };

  const reviewSampleInvitation = async () => {
    setInviteCode(PREVIEW_HOUSEHOLD_INVITE_CODE);
    setInviteCodeError(null);
    clearError();
    const staged = await stageHouseholdInvite(
      PREVIEW_HOUSEHOLD_INVITE_CODE
    );
    if (!staged) return;
    router.push(AUTH_ROUTES.join);
  };

  const useAnotherAccount = async () => {
    if (busy || leavingAccount) return;
    setLeavingAccount(true);
    clearError();
    const result = await completeSignedAccountExit(
      signOut,
      () => router.replace(AUTH_ROUTES.welcome)
    );
    if (result === "still-signed-in") {
      setLeavingAccount(false);
    }
  };

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label: accountAccessPending
              ? copy.household.retryAccess
              : copy.household.createAction,
            ...(reviewingInvitation
              ? { label: inviteCopy.household.reviewAction }
              : {}),
            icon: ArrowRight,
            loading: busy && !leavingAccount,
            disabled: busy || leavingAccount,
            onPress: () => void advance()
          }}
          secondary={{
            label: copy.common.useAnotherAccount,
            disabled: busy || leavingAccount,
            onPress: () => void useAnotherAccount()
          }}
        />
      }
      {...(mode === "supabase"
        ? {
            progress: authActivationProgress("household")
          }
        : {})}
      testID="auth-household-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={
            pendingHouseholdInvite
              ? inviteCopy.household.joinBody
              : copy.household.body
          }
          eyebrow={
            pendingHouseholdInvite
              ? inviteCopy.joinLink.eyebrow
              : copy.household.eyebrow
          }
          title={
            pendingHouseholdInvite
              ? inviteCopy.household.joinTitle
              : copy.household.title
          }
        />

        {pendingHouseholdInvite ? (
          <AuthNotice>
            {inviteCopy.joinLink.protectedNotice}
          </AuthNotice>
        ) : (
          <>
            <AuthField
              autoCapitalize="words"
              autoCorrect
              error={nameError}
              label={copy.household.label}
              maxLength={60}
              onChangeText={(value) => {
                setName(value);
                if (value.trim()) setNameError(null);
                if (authError) clearError();
              }}
              onSubmitEditing={() =>
                inviteEntryOpen
                  ? codeRef.current?.focus()
                  : void advance()
              }
              placeholder={copy.household.placeholder}
              ref={nameRef}
              returnKeyType={inviteEntryOpen ? "next" : "go"}
              testID="auth-private-record-name"
              textContentType="organizationName"
              value={name}
            />
            {!householdAlreadyCreated ? (
              <View style={styles.invitationDisclosure}>
                <Pressable
                  accessibilityHint={
                    inviteEntryOpen
                      ? inviteCopy.household.codeEntryCloseHint
                      : inviteCopy.household.codeEntryHint
                  }
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: busy || leavingAccount,
                    expanded: inviteEntryOpen
                  }}
                  disabled={busy || leavingAccount}
                  onPress={() => {
                    clearError();
                    setInviteCodeError(null);
                    setInviteEntryOpen((current) => !current);
                  }}
                  style={({ pressed }) => [
                    styles.invitationDisclosureTrigger,
                    rtl && styles.rowReverse,
                    pressed && styles.pressed,
                    (busy || leavingAccount) && styles.disabled
                  ]}
                  testID="household-invitation-disclosure"
                >
                  <Key color={colors.textMuted} size={20} />
                  <Text
                    style={[
                      styles.invitationDisclosureLabel,
                      rtl && styles.factTextArabic
                    ]}
                  >
                    {inviteEntryOpen
                      ? inviteCopy.household.codeEntryCloseAction
                      : inviteCopy.household.codeEntryAction}
                  </Text>
                  {inviteEntryOpen ? (
                    <CaretUp color={colors.textMuted} size={18} />
                  ) : (
                    <CaretDown color={colors.textMuted} size={18} />
                  )}
                </Pressable>
              </View>
            ) : null}
            {inviteEntryOpen ? (
              <View style={styles.invitationEntry}>
                <Text
                  style={[
                    styles.invitationEntryIntro,
                    rtl && styles.factTextArabic
                  ]}
                >
                  {inviteCopy.household.joinDescription}
                </Text>
                <AuthField
                  autoCapitalize="characters"
                  autoCorrect={false}
                  error={inviteCodeError}
                  label={inviteCopy.household.codeLabel}
                  description={inviteCopy.household.codeDescription}
                  maxLength={128}
                  onChangeText={(value) => {
                    setInviteCode(value);
                    if (value.trim()) setInviteCodeError(null);
                    if (authError) clearError();
                  }}
                  onSubmitEditing={() => void advance()}
                  placeholder={inviteCopy.household.codePlaceholder}
                  ref={codeRef}
                  returnKeyType="done"
                  style={styles.codeInput}
                  testID="auth-invitation-code"
                  textContentType="oneTimeCode"
                  value={inviteCode}
                />
                {mode === "preview" ? (
                  <>
                    <AuthNotice>
                      {inviteCopy.household.previewNotice}
                    </AuthNotice>
                    <TextAction
                      disabled={busy}
                      label={inviteCopy.household.sampleAction}
                      onPress={() => void reviewSampleInvitation()}
                    />
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        )}
        {authError ? (
          <AuthNotice live tone="attention">
            {reviewingInvitation
              ? inviteFailureMessage(authError.code, language)
              : localizeAuthFailure(authError, language)}
          </AuthNotice>
        ) : null}
        {!reviewingInvitation ? (
          <View style={[styles.fact, rtl && styles.rowReverse]}>
            <ShieldCheck color={colors.text} size={22} />
            <Text
              style={[
                styles.factText,
                rtl && styles.factTextArabic
              ]}
            >
              {copy.household.ownerFact}
            </Text>
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
  fact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  factText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  factTextArabic: {
    fontFamily: typography.arabic,
    textAlign: "right",
    writingDirection: "rtl"
  },
  invitationDisclosure: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  invitationDisclosureTrigger: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  invitationDisclosureLabel: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  invitationEntry: {
    gap: spacing.md
  },
  invitationEntryIntro: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  pressed: {
    opacity: 0.68
  },
  disabled: {
    opacity: 0.48
  },
  codeInput: {
    fontFamily: typography.bodyBold,
    letterSpacing: 1.2,
    textAlign: "left",
    writingDirection: "ltr"
  }
});
