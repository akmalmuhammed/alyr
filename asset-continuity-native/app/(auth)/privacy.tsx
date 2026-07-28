import { Redirect, useRouter } from "expo-router";
import {
  Buildings,
  CaretDown,
  CaretUp,
  Cube,
  LockKey,
  MapPin,
  ShieldCheck,
  UsersThree
} from "phosphor-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  AuthStatusRow,
  SelectionRow
} from "@/auth/components";
import { AUTH_ROUTES, authStepNumber } from "@/auth/routes";
import { completeSignedAccountExit } from "@/auth/signedAccountExit";
import { ErrorBanner } from "@/components/ui";
import {
  deviceAuthCopy,
  onboardingDevicePreflightCopy,
  useDeviceAuth
} from "@/deviceAuth";
import {
  localizeAuthFailure,
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

export default function PrivacyAndCaptureScreen() {
  const router = useRouter();
  const {
    activeHouseholdId,
    busy: authBusy,
    clearError: clearAuthError,
    completeOnboarding,
    createCompletion,
    error: authError,
    firstCaptureIntent,
    householdName,
    mode,
    session,
    setFirstCaptureIntent,
    signOut
  } = useAuthFlow();
  const {
    clearError: clearWorkspaceError,
    error: workspaceError,
    renameHousehold,
    retryBootstrap,
    saving,
    startWorkspace,
    storageReady,
    workspace
  } = useWorkspace();
  const {
    authorizeOnboarding,
    checkOnboardingProtection,
    clearOnboardingAuthorization,
    onboardingHandoffRestoreState,
    onboardingPreflight,
    pendingFirstRecordIntent,
    retryOnboardingHandoffRestore
  } = useDeviceAuth();
  const { copy, language } = useCoreJourneyCopy();
  const [submitting, setSubmitting] = useState(false);
  const [protectionDetailsOpen, setProtectionDetailsOpen] =
    useState(false);
  const [leavingAccount, setLeavingAccount] = useState(false);
  const commitInFlightRef = useRef(false);
  const protectionCopy = onboardingDevicePreflightCopy(
    language,
    onboardingPreflight.capability
  );
  const handoffCopy = deviceAuthCopy(
    language,
    onboardingPreflight.capability
  );
  const handoffRestoreLoading =
    onboardingHandoffRestoreState === "loading";
  const handoffRestoreFailed =
    onboardingHandoffRestoreState === "error";
  const protectionBusy =
    onboardingPreflight.phase === "checking" ||
    onboardingPreflight.phase === "authorizing";

  useEffect(() => {
    if (
      session?.onboarding !== "complete" &&
      onboardingPreflight.phase === "idle"
    ) {
      void checkOnboardingProtection();
    }
  }, [
    checkOnboardingProtection,
    onboardingPreflight.phase,
    session?.onboarding
  ]);

  useEffect(() => {
    if (
      session?.onboarding !== "complete" &&
      pendingFirstRecordIntent &&
      firstCaptureIntent !== pendingFirstRecordIntent
    ) {
      setFirstCaptureIntent(pendingFirstRecordIntent);
    }
  }, [
    firstCaptureIntent,
    pendingFirstRecordIntent,
    session?.onboarding,
    setFirstCaptureIntent
  ]);

  const commitAuthorizedOnboarding = useCallback(
    async (intent: "item" | "place") => {
      if (
        commitInFlightRef.current ||
        session?.onboarding === "complete" ||
        !storageReady
      ) {
        return;
      }
      const next = createCompletion();
      if (!next || next.firstCaptureIntent !== intent) return;
      commitInFlightRef.current = true;
      setSubmitting(true);
      try {
        if (!workspace || workspace.mode === "sample") {
          await startWorkspace("personal");
        }
        await renameHousehold(next.householdName);
        await completeOnboarding();
        /*
         * RootNavigator owns the final handoff. It waits for the durable
         * onboarding session, local vault, and device release, then resumes
         * the exact intent persisted before these mutations.
         */
      } catch {
        // WorkspaceProvider supplies a recovery-oriented message below.
      } finally {
        commitInFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [
      completeOnboarding,
      createCompletion,
      renameHousehold,
      session?.onboarding,
      startWorkspace,
      storageReady,
      workspace
    ]
  );

  useEffect(() => {
    if (
      pendingFirstRecordIntent &&
      storageReady &&
      (onboardingPreflight.phase === "authorized" ||
        onboardingPreflight.phase === "bypassed")
    ) {
      void commitAuthorizedOnboarding(
        pendingFirstRecordIntent
      );
    }
  }, [
    commitAuthorizedOnboarding,
    onboardingPreflight.phase,
    pendingFirstRecordIntent,
    storageReady
  ]);

  const finish = async () => {
    if (handoffRestoreLoading || submitting) return;
    if (handoffRestoreFailed) {
      retryOnboardingHandoffRestore();
      return;
    }
    const next = createCompletion();
    if (!next) return;
    setSubmitting(true);
    try {
      const authorization = await authorizeOnboarding(
        next.firstCaptureIntent
      );
      if (!authorization) return;
      if (workspaceError && !storageReady) {
        await retryBootstrap();
      } else if (storageReady) {
        await commitAuthorizedOnboarding(
          authorization.intent
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const waitingForAuthorizedVault =
    Boolean(pendingFirstRecordIntent) &&
    (onboardingPreflight.phase === "authorized" ||
      onboardingPreflight.phase === "bypassed") &&
    !storageReady;
  const onboardingCommitLocked =
    submitting ||
    commitInFlightRef.current ||
    (Boolean(pendingFirstRecordIntent) &&
      (onboardingPreflight.phase === "authorized" ||
        onboardingPreflight.phase === "bypassed"));
  const onboardingChoiceLocked =
    onboardingCommitLocked ||
    onboardingHandoffRestoreState !== "ready" ||
    leavingAccount;

  const useAnotherAccount = async () => {
    if (
      authBusy ||
      leavingAccount ||
      commitInFlightRef.current
    ) {
      return;
    }
    setLeavingAccount(true);
    clearAuthError();
    /*
     * Revoke any in-process or durable first-record handoff before the
     * identity boundary changes. Auth sign-out then remounts the
     * SessionBoundWorkspaceProvider, which locks and releases the old
     * account + household scoped vault before Welcome is shown.
     */
    clearOnboardingAuthorization();
    const result = await completeSignedAccountExit(
      signOut,
      () => router.replace(AUTH_ROUTES.welcome)
    );
    if (result === "still-signed-in") {
      setLeavingAccount(false);
    }
  };

  if (!session) return <Redirect href={AUTH_ROUTES.signIn} />;
  if (!householdName.trim() || !activeHouseholdId) {
    return <Redirect href={AUTH_ROUTES.household} />;
  }

  return (
    <AuthScaffold
      backDisabled={onboardingCommitLocked || leavingAccount}
      footer={
        <AuthActions
          primary={{
            label:
              handoffRestoreLoading
                ? protectionCopy.preparingAction
                : handoffRestoreFailed
                  ? handoffCopy.retryRestoreAction
              : protectionBusy
                ? protectionCopy.checkingAction
                : waitingForAuthorizedVault
                  ? workspaceError
                    ? protectionCopy.retryStorageAction
                    : protectionCopy.preparingAction
                : onboardingPreflight.phase === "unavailable"
                  ? protectionCopy.retryAction
                  : onboardingPreflight.phase === "bypassed"
                    ? firstCaptureIntent === "place"
                      ? copy.privacy.addFirstPlace
                      : copy.privacy.addFirstItem
                    : firstCaptureIntent === "place"
                      ? protectionCopy.verifyPlaceAction
                      : protectionCopy.verifyItemAction,
            icon: LockKey,
            loading:
              saving ||
              submitting ||
              authBusy ||
              protectionBusy ||
              handoffRestoreLoading,
            disabled:
              (onboardingHandoffRestoreState === "ready" &&
                !firstCaptureIntent) ||
              handoffRestoreLoading ||
              authBusy ||
              leavingAccount ||
              submitting ||
              protectionBusy ||
              (waitingForAuthorizedVault && !workspaceError),
            onPress: () => void finish()
          }}
          secondary={{
            label: copy.common.useAnotherAccount,
            disabled:
              authBusy ||
              leavingAccount ||
              commitInFlightRef.current,
            onPress: () => void useAnotherAccount()
          }}
        />
      }
      onBack={() => {
        if (onboardingCommitLocked || leavingAccount) return;
        router.canGoBack()
          ? router.back()
          : router.replace(AUTH_ROUTES.household);
      }}
      progress={authStepNumber("privacy")}
      testID="auth-privacy-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={copy.privacy.body}
          eyebrow={copy.privacy.eyebrow}
          title={copy.privacy.title}
        />
        <View
          accessibilityLabel={copy.privacy.chooseFirst}
          accessibilityRole="radiogroup"
        >
          <SelectionRow
            active={firstCaptureIntent === "item"}
            description={copy.privacy.itemDescription}
            disabled={onboardingChoiceLocked}
            icon={Cube}
            label={copy.privacy.itemLabel}
            onPress={() => {
              if (onboardingChoiceLocked) return;
              if (firstCaptureIntent !== "item") {
                clearOnboardingAuthorization();
              }
              setFirstCaptureIntent("item");
            }}
          />
          <SelectionRow
            active={firstCaptureIntent === "place"}
            description={copy.privacy.placeDescription}
            disabled={onboardingChoiceLocked}
            icon={Buildings}
            label={copy.privacy.placeLabel}
            onPress={() => {
              if (onboardingChoiceLocked) return;
              if (firstCaptureIntent !== "place") {
                clearOnboardingAuthorization();
              }
              setFirstCaptureIntent("place");
            }}
          />
        </View>
        <View testID="onboarding-device-preflight">
          <AuthStatusRow
            detail={
              handoffRestoreLoading
                ? handoffCopy.restoreCheckingBody
                : handoffRestoreFailed
                  ? handoffCopy.restoreFailedBody
              : onboardingPreflight.phase === "unavailable"
                ? protectionCopy.unavailableBody
                : onboardingPreflight.phase === "bypassed"
                  ? protectionCopy.bypassedBody
                  : onboardingPreflight.phase === "authorized"
                    ? protectionCopy.authorizedBody
                    : onboardingPreflight.phase === "ready" ||
                        onboardingPreflight.phase === "authorizing"
                      ? protectionCopy.readyBody
                      : protectionCopy.checkingBody
            }
            eyebrow={protectionCopy.eyebrow}
            icon={LockKey}
            live
            value={
              handoffRestoreLoading
                ? handoffCopy.restoreCheckingTitle
                : handoffRestoreFailed
                  ? handoffCopy.restoreFailedTitle
              : onboardingPreflight.phase === "unavailable"
                ? protectionCopy.unavailableTitle
                : onboardingPreflight.phase === "bypassed"
                  ? protectionCopy.bypassedTitle
                  : onboardingPreflight.phase === "authorized"
                    ? protectionCopy.authorizedTitle
                    : onboardingPreflight.phase === "ready" ||
                        onboardingPreflight.phase === "authorizing"
                      ? protectionCopy.readyTitle
                      : protectionCopy.checkingTitle
            }
          />
        </View>
        {onboardingPreflight.notice ? (
          <AuthNotice live tone="attention">
            {protectionCopy.notices[onboardingPreflight.notice]}
          </AuthNotice>
        ) : null}
        <View style={styles.protectionDisclosure}>
          <Pressable
            accessibilityHint={copy.privacy.privateText}
            accessibilityLabel={copy.privacy.privateTitle}
            accessibilityRole="button"
            accessibilityState={{ expanded: protectionDetailsOpen }}
            onPress={() =>
              setProtectionDetailsOpen((current) => !current)
            }
            style={({ pressed }) => [
              styles.protectionDisclosureTrigger,
              language === "ar" && styles.rowReverse,
              pressed && styles.pressed
            ]}
          >
            <View style={styles.protectionDisclosureIcon}>
              <ShieldCheck color={colors.text} size={22} />
            </View>
            <View style={styles.principleCopy}>
              <Text
                style={[
                  styles.principleTitle,
                  language === "ar" &&
                    styles.principleTitleArabic
                ]}
              >
                {copy.privacy.privateTitle}
              </Text>
              <Text
                style={[
                  styles.principleText,
                  language === "ar" &&
                    styles.principleTextArabic
                ]}
              >
                {copy.privacy.privateText}
              </Text>
            </View>
            {protectionDetailsOpen ? (
              <CaretUp color={colors.textMuted} size={19} />
            ) : (
              <CaretDown color={colors.textMuted} size={19} />
            )}
          </Pressable>
          {protectionDetailsOpen ? (
            <View style={styles.principles}>
              <Principle
                icon={MapPin}
                text={copy.privacy.locationText}
                title={copy.privacy.locationTitle}
              />
              <Principle
                icon={UsersThree}
                text={copy.privacy.accessText}
                title={copy.privacy.accessTitle}
              />
              {mode === "preview" ? (
                <AuthNotice tone="attention">
                  {copy.privacy.previewNotice}
                </AuthNotice>
              ) : (
                <AuthNotice>
                  {copy.privacy.liveNotice}
                </AuthNotice>
              )}
            </View>
          ) : null}
        </View>
        {workspaceError ? (
          <ErrorBanner
            message={localizedWorkspaceError(
              workspaceError,
              language
            )}
            onDismiss={clearWorkspaceError}
          />
        ) : null}
        {authError ? (
          <ErrorBanner
            message={localizeAuthFailure(authError, language)}
            onDismiss={clearAuthError}
          />
        ) : null}
      </View>
    </AuthScaffold>
  );
}

function Principle({
  icon: IconComponent,
  text,
  title
}: {
  readonly icon: typeof ShieldCheck;
  readonly text: string;
  readonly title: string;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <View style={[styles.principle, rtl && styles.rowReverse]}>
      <IconComponent color={colors.text} size={21} />
      <View style={styles.principleCopy}>
        <Text
          style={[
            styles.principleTitle,
            rtl && styles.principleTitleArabic
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.principleText,
            rtl && styles.principleTextArabic
          ]}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  protectionDisclosure: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  protectionDisclosureTrigger: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  protectionDisclosureIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceQuiet
  },
  principles: {
    paddingBottom: spacing.md
  },
  principle: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  principleCopy: {
    flex: 1,
    gap: 2
  },
  principleTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  principleText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  principleTitleArabic: {
    fontFamily: typography.arabicMedium,
    textAlign: "right",
    writingDirection: "rtl"
  },
  principleTextArabic: {
    fontFamily: typography.arabic,
    textAlign: "right",
    writingDirection: "rtl"
  },
  pressed: {
    opacity: 0.68
  }
});
