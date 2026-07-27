import { Redirect, useRouter } from "expo-router";
import {
  ArrowRight,
  House,
  ShieldCheck,
  UsersThree
} from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

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
  SelectionRow,
  TextAction,
  focusFirstInvalidAuthField
} from "@/auth/components";
import { AUTH_ROUTES, authStepNumber } from "@/auth/routes";
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
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function HouseholdSetupScreen() {
  const router = useRouter();
  const nameRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const {
    acceptHouseholdInvite,
    acceptPendingHouseholdInvite,
    activeHouseholdId,
    busy,
    clearError,
    error: authError,
    householdName,
    provisionHousehold,
    mode,
    pendingHouseholdInvite,
    session,
    setHouseholdName
  } = useAuthFlow();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const inviteCopy = useInviteCopy();
  const { startWorkspace, workspace } = useWorkspace();
  const [setupMode, setSetupMode] = useState<"create" | "join">(
    pendingHouseholdInvite ? "join" : "create"
  );
  const [name, setName] = useState(
    householdName || copy.household.defaultName
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteCodeError, setInviteCodeError] =
    useState<string | null>(null);
  const householdAlreadyCreated = Boolean(activeHouseholdId);
  const automaticJoinStarted = useRef(false);
  const accountAccessPending =
    householdAlreadyCreated &&
    (!session?.activeMembershipId ||
      session.activeHouseholdRole !== "owner");

  useEffect(() => {
    if (
      automaticJoinStarted.current ||
      !pendingHouseholdInvite ||
      !session ||
      activeHouseholdId
    ) {
      return;
    }
    automaticJoinStarted.current = true;
    void acceptPendingHouseholdInvite().then((membership) => {
      if (membership) router.replace("/");
    });
  }, [
    acceptPendingHouseholdInvite,
    activeHouseholdId,
    pendingHouseholdInvite,
    router,
    session
  ]);

  if (!session) return <Redirect href={AUTH_ROUTES.signIn} />;
  if (
    session.onboarding === "complete" &&
    activeHouseholdId
  ) {
    return <Redirect href="/" />;
  }

  const advance = async () => {
    if (setupMode === "join") {
      if (pendingHouseholdInvite) {
        const membership = await acceptPendingHouseholdInvite();
        if (membership) router.replace("/");
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
      const membership =
        await acceptHouseholdInvite(normalizedCode);
      if (!membership) return;
      if (mode === "preview" && !workspace) {
        await startWorkspace("sample");
      }
      router.replace("/");
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
    const membership = await acceptHouseholdInvite(
      PREVIEW_HOUSEHOLD_INVITE_CODE
    );
    if (!membership) return;
    if (!workspace) await startWorkspace("sample");
    router.replace("/");
  };

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label: accountAccessPending
              ? copy.household.retryAccess
              : copy.common.continue,
            ...(setupMode === "join"
              ? { label: inviteCopy.household.joinAction }
              : {}),
            icon: ArrowRight,
            loading: busy,
            disabled: busy,
            onPress: () => void advance()
          }}
        />
      }
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace(AUTH_ROUTES.signIn)
      }
      progress={authStepNumber("household")}
      testID="auth-household-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={
            setupMode === "create"
              ? copy.household.body
              : inviteCopy.household.joinBody
          }
          eyebrow={copy.household.eyebrow}
          title={
            setupMode === "create"
              ? copy.household.title
              : inviteCopy.household.joinTitle
          }
        />

        {!householdAlreadyCreated ? (
          <View
            accessibilityLabel={
              language === "ar"
                ? "اختر طريقة بدء سجل المنزل"
                : "Choose how to start the household record"
            }
            accessibilityRole="radiogroup"
          >
            <SelectionRow
              active={setupMode === "create"}
              description={inviteCopy.household.createDescription}
              icon={House}
              label={inviteCopy.household.createChoice}
              onPress={() => {
                clearError();
                setSetupMode("create");
              }}
            />
            <SelectionRow
              active={setupMode === "join"}
              description={inviteCopy.household.joinDescription}
              icon={UsersThree}
              label={inviteCopy.household.joinChoice}
              onPress={() => {
                clearError();
                setSetupMode("join");
              }}
            />
          </View>
        ) : null}

        {setupMode === "create" ? (
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
              onSubmitEditing={() => void advance()}
              placeholder={copy.household.placeholder}
              ref={nameRef}
              returnKeyType="next"
              textContentType="organizationName"
              value={name}
            />
          </>
        ) : (
          <>
            {pendingHouseholdInvite ? (
              <AuthNotice>
                {inviteCopy.joinLink.protectedNotice}
              </AuthNotice>
            ) : (
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
                textContentType="oneTimeCode"
                value={inviteCode}
              />
            )}
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
          </>
        )}
        {authError ? (
          <AuthNotice live tone="attention">
            {setupMode === "join"
              ? inviteFailureMessage(authError.code, language)
              : localizeAuthFailure(authError, language)}
          </AuthNotice>
        ) : null}
        {setupMode === "create" ? (
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
  codeInput: {
    fontFamily: typography.bodyBold,
    letterSpacing: 1.2,
    textAlign: "left",
    writingDirection: "ltr"
  }
});
