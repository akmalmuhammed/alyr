import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  ArrowRight,
  BellRinging,
  CloudArrowDown,
  CloudSlash,
  Clock,
  DownloadSimple,
  FileText,
  GearSix,
  Lifebuoy,
  LockKey,
  SignOut,
  ShieldCheck,
  Trash,
  UploadSimple,
  UserCircle,
  Warning
} from "phosphor-react-native";
import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  completeSignedAccountExit,
  signedAccountIdentity
} from "@/auth/signedAccountExit";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ScreenTitle,
  SecondaryButton,
  Section
} from "@/components/ui";
import { PermissionNotice } from "@/components/PermissionDenied";
import { SyncTruth } from "@/components/SyncTruth";
import { VaultRecentProof } from "@/components/VaultRecentProof";
import { useDeviceAuth } from "@/deviceAuth";
import {
  formatByteSize,
  householdAccessSummary,
  pendingUpdateSummary,
  proofFileSummary,
  signedAccountExitPrompt,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useAccountDeletionCopy } from "@/i18n/accountDeletionCopy";
import { useExportCopy } from "@/i18n/exportCopy";
import {
  reviewReminderSettingsCopy,
  type ReviewReminderSettingsCopy
} from "@/i18n/reviewReminderCopy";
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";
import {
  useReviewReminder,
  type ReviewReminderStatus
} from "@/notifications/ReviewReminderProvider";
import { sampleActivationDestination } from "@/navigation/sampleActivation";
import { useRecoveryJourney } from "@/recovery";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export function isCompactVaultActionWidth(width: number): boolean {
  return width <= 360;
}

export function VaultScreen({
  surface = "vault"
}: {
  readonly surface?: "vault" | "settings";
} = {}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { busy: authBusy, mode, session, signOut } = useAuthFlow();
  const deviceAuth = useDeviceAuth();
  const {
    workspace,
    attachmentStore,
    can,
    repository,
    pendingOperationCount,
    sync,
    syncNow,
    changeLanguage,
    exportReadableSnapshot
  } = useWorkspace();
  const { copy, language, rtl, setLanguage } = useCoreJourneyCopy();
  const { copy: accountCopy } = useAccountDeletionCopy();
  const { copy: exportCopy } = useExportCopy();
  const compactActions = isCompactVaultActionWidth(width);
  const canExport = can("export.create");
  const canReadEvidence = can("evidence.read");
  const canManageHousehold = can("household.manage");
  const recovery = useRecoveryJourney();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  if (!workspace) return null;

  const sampleActivationRoute = sampleActivationDestination({
    canManageHousehold,
    mode,
    session,
    workspaceMode: workspace.mode
  });
  const signedAccount = signedAccountIdentity(mode, session);
  const placeDocuments = workspace.placeDocuments ?? [];
  const proofFileCount =
    workspace.evidence.length + placeDocuments.length;
  const localBytes =
    workspace.evidence.reduce(
      (total, item) => total + item.byteSize,
      0
    ) +
    placeDocuments.reduce(
      (total, document) => total + document.byteSize,
      0
    );

  const shareSnapshot = async (): Promise<void> => {
    try {
      const snapshot = exportReadableSnapshot();
      if (!snapshot) {
        throw new Error("Readable snapshot was empty.");
      }
      if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) {
        Alert.alert(
          copy.vault.installedAppRequiredTitle,
          copy.vault.installedAppRequiredBody
        );
        return;
      }
      const file = new File(
        Paths.cache,
        `alyr-readable-snapshot-${Date.now()}.json`
      );
      file.create({ overwrite: true });
      file.write(snapshot);
      await Sharing.shareAsync(file.uri, {
        dialogTitle: copy.vault.shareDialogTitle,
        mimeType: "application/json"
      });
    } catch {
      Alert.alert(
        copy.vault.exportFailedTitle,
        copy.vault.exportFailedBody,
        [
          { text: copy.vault.cancel, style: "cancel" },
          {
            text: copy.vault.exportTryAgain,
            onPress: () => void shareSnapshot()
          }
        ]
      );
    }
  };

  const completeAccountExit = async () => {
    const result = await completeSignedAccountExit(signOut, () => {
      router.replace(AUTH_ROUTES.welcome);
    });
    if (result === "still-signed-in") {
      Alert.alert(
        copy.vault.signOutIncompleteTitle,
        copy.vault.signOutIncompleteBody
      );
    }
  };

  const confirmAccountExit = () => {
    if (!signedAccount || authBusy) return;
    Alert.alert(
      copy.vault.signOutConfirmTitle,
      signedAccountExitPrompt(
        signedAccount.email,
        workspace.household.name,
        language
      ),
      [
        { text: copy.vault.cancel, style: "cancel" },
        {
          text: copy.vault.signOut,
          style: "destructive",
          onPress: () => void completeAccountExit()
        }
      ]
    );
  };

  return (
    <AppScreen
      testID={surface === "vault" ? "vault-screen" : "settings-screen"}
    >
      <View style={styles.heading}>
        <ScreenTitle>
          {surface === "vault"
            ? copy.vault.title
            : copy.vault.settingsTitle}
        </ScreenTitle>
        <BodyText muted>
          {surface === "vault"
            ? copy.vault.intro
            : copy.vault.settingsIntro}
        </BodyText>
      </View>

      {surface === "vault" ? (
        <>
      <SyncTruth
        language={language}
        onPress={
          sync.status === "local-only"
            ? undefined
            : sync.conflicts.length > 0
              ? () => router.push("/sync-conflicts")
              : () => void syncNow()
        }
        pendingOperationCount={pendingOperationCount}
        sync={sync}
      />

      <CommandSurface>
        <View
          style={[styles.protectionHeader, rtl && styles.rowReverse]}
        >
          {repository.encryptedAtRest ? (
            <ShieldCheck color={colors.volt} size={30} weight="regular" />
          ) : (
            <Warning color={colors.warning} size={30} weight="regular" />
          )}
          <View style={styles.protectionCopy}>
            <Text
              style={[
                styles.commandLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.deviceProtection}
            </Text>
            <Text
              style={[
                styles.commandTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {deviceAuth.previewBypass
                ? copy.vault.sessionPreviewUnlockOff
                : deviceAuth.requiresUnlock
                  ? copy.vault.deviceUnlockActive
                  : repository.encryptedAtRest
                    ? copy.vault.protectedOnDevice
                    : copy.vault.previewSessionOnly}
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.commandBody,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {deviceAuth.previewBypass
            ? copy.vault.previewBypassBody
            : deviceAuth.requiresUnlock
              ? copy.vault.deviceUnlockBody
              : repository.encryptedAtRest
                ? copy.vault.protectedBody
                : copy.vault.previewBody}
        </Text>
        {deviceAuth.requiresUnlock ? (
          <SecondaryButton
            icon={LockKey}
            label={copy.vault.lockNow}
            onPress={deviceAuth.lockNow}
          />
        ) : null}
      </CommandSurface>

      <Section>
        {canReadEvidence ? (
          <>
            <View style={[styles.sectionHeading, rtl && styles.rowReverse]}>
              <Text
                style={[
                  styles.sectionTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.vault.proofOnDevice}
              </Text>
              <Text
                style={[
                  styles.sectionValue,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {formatByteSize(localBytes, language)}
              </Text>
            </View>
            <Text
              style={[
                styles.sectionMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {proofFileSummary(
                proofFileCount,
                repository.encryptedAtRest,
                language
              )}
            </Text>
          </>
        ) : (
          <PermissionNotice
            capability="evidence.read"
            testID="vault-proof-view-denied"
          />
        )}
      </Section>

      {canReadEvidence ? (
        <VaultRecentProof
          attachmentStore={attachmentStore}
          onOpenEvidence={(evidenceId) =>
            router.push(`/evidence/${evidenceId}`)
          }
          workspace={workspace}
        />
      ) : null}

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.vault.backupRecovery}
        </Text>
        <StatusRow
          compact={compactActions}
          description={copy.vault.cloudBackupDescription}
          icon={CloudSlash}
          label={copy.vault.cloudBackup}
          status={copy.vault.notSetUp}
        />
        <StatusRow
          compact={compactActions}
          description={copy.vault.createRecoveryKitDescription}
          icon={LockKey}
          label={copy.vault.createRecoveryKit}
          {...(canExport
            ? { onPress: () => router.push("/recovery-create") }
            : {})}
          status={
            recovery.capability.kind === "available"
              ? copy.vault.ready
              : copy.vault.signedBuildNeeded
          }
        />
        <StatusRow
          compact={compactActions}
          description={copy.vault.restoreRecoveryKitDescription}
          icon={UploadSimple}
          label={copy.vault.restoreRecoveryKit}
          {...(canManageHousehold
            ? { onPress: () => router.push("/recovery-import") }
            : {})}
          status={
            recovery.capability.kind === "available"
              ? copy.vault.chooseFile
              : copy.vault.signedBuildNeeded
          }
        />
      </Section>

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.vault.dataPortability}
        </Text>
        {canExport ? (
          <>
            <StatusRow
              compact={compactActions}
              description={exportCopy.vault.cloudExportMeta}
              icon={CloudArrowDown}
              label={exportCopy.vault.cloudExport}
              onPress={() => router.push("/export-create")}
              status={
                mode === "supabase"
                  ? exportCopy.vault.open
                  : exportCopy.vault.signedAccount
              }
            />
            <Pressable
              accessibilityHint={copy.vault.exportReadableHint}
              accessibilityRole="button"
              onPress={() => void shareSnapshot()}
              style={({ pressed }) => [
                styles.settingsRow,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
            >
              <DownloadSimple color={colors.text} size={22} weight="regular" />
              <View style={styles.settingsCopy}>
                <Text
                  style={[
                    styles.settingsTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {exportCopy.vault.localExport}
                </Text>
                <Text
                  style={[
                    styles.settingsMeta,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {exportCopy.vault.localExportMeta}
                </Text>
              </View>
              <ArrowRight
                color={colors.textMuted}
                size={20}
                style={rtl ? styles.mirrorArrow : undefined}
              />
            </Pressable>
          </>
        ) : (
          <PermissionNotice
            capability="export.create"
            testID="vault-export-view-only-notice"
          />
        )}
      </Section>

      <Section>
        <StatusRow
          compact={compactActions}
          description={copy.vault.settingsMeta}
          icon={GearSix}
          label={copy.vault.settingsTitle}
          onPress={() => router.push("/settings")}
          status={copy.vault.settingsOpen}
        />
      </Section>
        </>
      ) : (
        <>
      <ReviewReminderSettingsSection
        language={language}
        rtl={rtl}
      />

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.vault.privacySupport}
        </Text>
        <StatusRow
          compact={compactActions}
          description={copy.vault.privacyNoticeDescription}
          icon={ShieldCheck}
          label={copy.vault.privacyNotice}
          onPress={() => router.push("/privacy-policy")}
          status="v0.1"
        />
        <StatusRow
          compact={compactActions}
          description={copy.vault.pilotTermsDescription}
          icon={FileText}
          label={copy.vault.pilotTerms}
          onPress={() => router.push("/terms")}
          status="v0.1"
        />
        <StatusRow
          compact={compactActions}
          description={copy.vault.supportDescription}
          icon={Lifebuoy}
          label={copy.vault.support}
          onPress={() => router.push("/support")}
          status={copy.vault.settingsOpen}
        />
      </Section>

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.vault.household}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(PRIMARY_ROUTES.family)}
          style={({ pressed }) => [
            styles.settingsRow,
            rtl && styles.rowReverse,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.settingsCopy}>
            <Text
              style={[
                styles.settingsTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.householdAccess}
            </Text>
            <Text
              style={[
                styles.settingsMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {householdAccessSummary(
                workspace.members.length,
                language
              )}
            </Text>
          </View>
          <ArrowRight
            color={colors.textMuted}
            size={20}
            style={rtl ? styles.mirrorArrow : undefined}
          />
        </Pressable>
      </Section>

      {signedAccount ? (
        <Section>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.account}
          </Text>
          <View
            style={[styles.accountIdentity, rtl && styles.rowReverse]}
          >
            <UserCircle
              color={colors.text}
              size={28}
              weight="regular"
            />
            <View style={styles.settingsCopy}>
              <Text
                style={[
                  styles.accountLabel,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.vault.signedIn}
              </Text>
              <Text
                ellipsizeMode="middle"
                numberOfLines={1}
                selectable
                style={[
                  styles.accountEmail,
                  rtl && styles.rtlAlign
                ]}
              >
                {signedAccount.email}
              </Text>
              <Text
                style={[
                  styles.settingsMeta,
                  styles.mixedScriptText,
                  rtl && styles.rtlAlign
                ]}
              >
                {workspace.household.name}
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel={copy.vault.verifiedAccount}
              accessibilityRole="image"
            >
              <ShieldCheck
                color={colors.success}
                size={22}
                weight="regular"
              />
            </View>
          </View>
          <SecondaryButton
            destructive
            disabled={authBusy}
            icon={SignOut}
            label={
              authBusy
                ? copy.vault.signingOut
                : copy.vault.signOutSwitch
            }
            onPress={confirmAccountExit}
          />
          <Text
            style={[
              styles.sectionMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.signOutExplanation}
          </Text>
          <SecondaryButton
            destructive
            disabled={authBusy}
            icon={Trash}
            label={accountCopy.vault.deleteAccount}
            onPress={() => router.push("/account-delete")}
          />
          <Text
            style={[
              styles.sectionMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {accountCopy.vault.deleteAccountMeta}
          </Text>
        </Section>
      ) : null}

      {mode === "preview" ? (
        <Section>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {accountCopy.preview.eyebrow}
          </Text>
          <SecondaryButton
            destructive
            icon={Trash}
            label={accountCopy.vault.resetPreview}
            onPress={() => router.push("/account-delete")}
          />
          <Text
            style={[
              styles.sectionMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {accountCopy.vault.resetPreviewMeta}
          </Text>
        </Section>
      ) : null}

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicSectionTitle,
            rtl && styles.rtlText
          ]}
        >
          {copy.vault.language}
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={[styles.languageOptions, rtl && styles.rowReverse]}
        >
          <LanguageChoice
            active={language === "en"}
            label={copy.vault.english}
            onPress={() =>
              void (canManageHousehold
                ? Promise.all([setLanguage("en"), changeLanguage("en")])
                : setLanguage("en"))
            }
          />
          <LanguageChoice
            active={language === "ar"}
            label={copy.vault.arabic}
            onPress={() =>
              void (canManageHousehold
                ? Promise.all([setLanguage("ar"), changeLanguage("ar")])
                : setLanguage("ar"))
            }
          />
        </View>
        <Text
          style={[
            styles.sectionMeta,
            rtl && styles.arabicBody,
            rtl && styles.rtlText
          ]}
        >
          {copy.vault.languageReady}
        </Text>
      </Section>

      <Section>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDiagnostics }}
          onPress={() => setShowDiagnostics((current) => !current)}
          style={({ pressed }) => [
            styles.settingsRow,
            rtl && styles.rowReverse,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.settingsCopy}>
            <Text
              style={[
                styles.settingsTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.advancedDiagnostics}
            </Text>
            <Text
              style={[
                styles.settingsMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.diagnosticsMeta}
            </Text>
          </View>
          <ArrowRight
            color={colors.textMuted}
            size={20}
            style={
              showDiagnostics
                ? rtl
                  ? styles.rtlExpandedArrow
                  : styles.expandedArrow
                : rtl
                  ? styles.mirrorArrow
                  : undefined
            }
          />
        </Pressable>
        {showDiagnostics ? (
          <View style={styles.diagnostics}>
            <StatusRow
              compact={compactActions}
              description={pendingUpdateSummary(
                pendingOperationCount,
                language
              )}
              icon={ShieldCheck}
              label={copy.vault.deviceQueue}
              status={
                pendingOperationCount > 0
                  ? copy.vault.waiting
                  : copy.vault.upToDate
              }
            />
            <Text
              style={[
                styles.diagnosticWarning,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.diagnosticWarning}
            </Text>
          </View>
        ) : null}
      </Section>

      {sampleActivationRoute ? (
        <SecondaryButton
          icon={LockKey}
          label={copy.vault.createMyPrivateHousehold}
          onPress={() => router.push(sampleActivationRoute)}
        />
      ) : null}
        </>
      )}
    </AppScreen>
  );
}

export default function VaultRoute() {
  return <VaultScreen />;
}

function reviewReminderStatusLabel(
  status: ReviewReminderStatus,
  available: boolean,
  copy: ReviewReminderSettingsCopy
): string {
  if (!available || status === "unavailable") {
    return copy.accountRequired;
  }
  switch (status) {
    case "enabled":
      return copy.enabledStatus;
    case "no-review":
      return copy.noReviewStatus;
    case "permission-blocked":
      return copy.permissionBlockedStatus;
    case "cleanup-pending":
      return copy.cleanupPendingStatus;
    case "loading":
      return copy.loadingStatus;
    case "error":
      return copy.errorStatus;
    case "disabled":
    default:
      return copy.disabledStatus;
  }
}

export function ReviewReminderSettingsSection({
  language,
  rtl
}: {
  readonly language: "en" | "ar";
  readonly rtl: boolean;
}) {
  const reminder = useReviewReminder();
  const reminderCopy = reviewReminderSettingsCopy(language);
  const controlDisabled =
    !reminder.available ||
    reminder.busy ||
    reminder.status === "loading" ||
    reminder.status === "cleanup-pending";
  const blocked = reminder.status === "permission-blocked";
  const switchEnabled = reminder.enabled && !blocked;
  const statusLabel = reviewReminderStatusLabel(
    reminder.status,
    reminder.available,
    reminderCopy
  );
  const cleanupPending =
    reminder.status === "cleanup-pending";
  const statusColor = blocked || cleanupPending
    ? colors.warning
    : reminder.status === "error"
      ? colors.danger
      : reminder.enabled
        ? colors.success
        : colors.textMuted;
  const iconColor = blocked
    ? colors.warning
    : reminder.enabled
      ? colors.action
      : colors.textMuted;

  const toggleReminder = async (): Promise<void> => {
    if (controlDisabled) return;
    const nextStatus = switchEnabled
      ? await reminder.disable()
      : await reminder.enable();
    if (nextStatus === "permission-blocked") {
      Alert.alert(
        reminderCopy.permissionDeniedTitle,
        reminderCopy.permissionDeniedBody,
        [{ text: reminderCopy.permissionDeniedAction }]
      );
    }
  };

  return (
    <Section>
      <View
        style={[
          styles.reminderHeading,
          rtl && styles.rowReverse
        ]}
      >
        <View style={styles.reminderHeadingCopy}>
          <Text
            style={[
              styles.reminderEyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {reminderCopy.eyebrow}
          </Text>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {reminderCopy.title}
          </Text>
        </View>
        <View
          accessible={false}
          style={styles.reminderIcon}
        >
          <BellRinging
            color={iconColor}
            size={24}
            weight="regular"
          />
        </View>
      </View>

      <Text
        style={[
          styles.reminderBody,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {reminderCopy.body}
      </Text>

      <Pressable
        accessibilityHint={reminderCopy.toggleHint}
        accessibilityLabel={reminderCopy.toggleLabel}
        accessibilityRole="switch"
        accessibilityState={{
          checked: switchEnabled,
          disabled: controlDisabled,
          busy: reminder.busy
        }}
        disabled={controlDisabled}
        onPress={() => void toggleReminder()}
        style={({ pressed }) => [
          styles.reminderToggle,
          rtl && styles.rowReverse,
          controlDisabled && styles.reminderControlDisabled,
          pressed && styles.pressed
        ]}
        testID="review-reminder-toggle"
      >
        <View style={styles.reminderToggleCopy}>
          <Text
            style={[
              styles.settingsTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {reminderCopy.toggleLabel}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.reminderStatus,
              { color: statusColor },
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
            testID="review-reminder-status"
          >
            {statusLabel}
          </Text>
        </View>
        <View
          accessible={false}
          pointerEvents="none"
          style={styles.reminderSwitchTarget}
        >
          <Switch
            accessibilityElementsHidden
            importantForAccessibility="no"
            ios_backgroundColor={colors.borderStrong}
            onValueChange={() => undefined}
            thumbColor={
              switchEnabled ? colors.carbon : colors.white
            }
            trackColor={{
              false: colors.borderStrong,
              true: colors.action
            }}
            value={switchEnabled}
            testID="review-reminder-switch"
          />
        </View>
      </Pressable>

      <View
        style={[
          styles.reminderTime,
          rtl && styles.rowReverse
        ]}
      >
        <Clock
          color={colors.textMuted}
          size={20}
          weight="regular"
        />
        <View style={styles.reminderTimeCopy}>
          <Text
            style={[
              styles.reminderTimeLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {reminderCopy.timeLabel}
          </Text>
          <Text
            style={[
              styles.reminderTimeValue,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {reminderCopy.localTime}
          </Text>
        </View>
      </View>

      <Text
        style={[
          styles.reminderPrivacy,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {reminderCopy.privacyNote}
      </Text>
    </Section>
  );
}

function StatusRow({
  compact = false,
  description,
  icon: Icon,
  label,
  onPress,
  status
}: {
  readonly compact?: boolean;
  readonly description: string;
  readonly icon: typeof CloudSlash;
  readonly label: string;
  readonly onPress?: () => void;
  readonly status: string;
}) {
  const { rtl } = useCoreJourneyCopy();
  const content = (
    <>
      <View style={[styles.statusLead, rtl && styles.rowReverse]}>
        <Icon color={colors.text} size={22} weight="regular" />
        <View style={styles.statusCopy}>
          <Text
            style={[
              styles.statusTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {label}
          </Text>
          <Text
            style={[
              styles.statusDescription,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {description}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.statusAction,
          compact && styles.statusActionCompact,
          rtl && styles.rowReverse
        ]}
      >
        <Text
          style={[
            styles.statusValue,
            rtl && styles.arabicMedium,
            rtl && styles.rtlStatusValue
          ]}
        >
          {status}
        </Text>
        {onPress ? (
          <ArrowRight
            color={colors.textMuted}
            size={18}
            style={rtl ? styles.mirrorArrow : undefined}
          />
        ) : null}
      </View>
    </>
  );
  const rowStyles = [
    styles.statusRow,
    rtl && styles.rowReverse,
    compact && styles.statusRowCompact
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityHint={description}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          ...rowStyles,
          pressed && styles.pressed
        ]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={rowStyles}>{content}</View>;
}

function LanguageChoice({
  active,
  disabled = false,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.languageChoice,
        active && styles.languageChoiceActive,
        disabled && styles.languageChoiceDisabled,
        pressed && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.languageLabel,
          rtl && styles.arabicMedium,
          active && styles.languageLabelActive
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  protectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  protectionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1
  },
  commandTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  commandBody: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  sectionHeading: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionTitle: {
    flexShrink: 1,
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  sectionValue: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  sectionMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  reminderHeading: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  reminderHeadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  reminderEyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1
  },
  reminderIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  reminderBody: {
    maxWidth: 560,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22
  },
  reminderToggle: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  reminderToggleCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  reminderStatus: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18
  },
  reminderSwitchTarget: {
    minWidth: 52,
    minHeight: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  reminderControlDisabled: {
    opacity: 0.56
  },
  reminderTime: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  reminderTimeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  reminderTimeLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  reminderTimeValue: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  reminderPrivacy: {
    maxWidth: 560,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  statusRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  statusRowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.xs,
    paddingVertical: spacing.md
  },
  statusLead: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  statusTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  statusDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  statusValue: {
    maxWidth: 104,
    flexShrink: 1,
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right"
  },
  statusAction: {
    maxWidth: 132,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs
  },
  statusActionCompact: {
    width: "100%",
    maxWidth: "100%",
    paddingStart: 38
  },
  settingsRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  settingsCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  settingsTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  settingsMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  accountIdentity: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  accountLabel: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1
  },
  accountEmail: {
    minWidth: 0,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    writingDirection: "ltr"
  },
  languageOptions: {
    flexDirection: "row",
    gap: spacing.xs
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  languageChoice: {
    minWidth: 0,
    minHeight: 44,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  languageChoiceActive: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  languageChoiceDisabled: {
    opacity: 0.46
  },
  languageLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  languageLabelActive: {
    color: colors.white
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  rtlAlign: {
    textAlign: "right"
  },
  rtlStatusValue: {
    textAlign: "left",
    writingDirection: "rtl"
  },
  mixedScriptText: {
    writingDirection: "auto"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  arabicSectionTitle: {
    fontFamily: typography.arabicMedium
  },
  arabicBody: {
    fontFamily: typography.arabic
  },
  diagnostics: {
    gap: spacing.md
  },
  diagnosticWarning: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  expandedArrow: {
    transform: [{ rotate: "90deg" }]
  },
  rtlExpandedArrow: {
    transform: [{ scaleX: -1 }, { rotate: "-90deg" }]
  },
  mirrorArrow: {
    transform: [{ scaleX: -1 }]
  },
  pressed: {
    opacity: 0.65
  }
});
