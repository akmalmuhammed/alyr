import { File, Paths } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  ArrowRight,
  ArrowsClockwise,
  BellRinging,
  CloudCheck,
  CloudArrowDown,
  CloudSlash,
  Clock,
  DeviceMobile,
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
  Warning,
  WarningCircle
} from "phosphor-react-native";
import { useCallback, useState } from "react";
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
  canExitSignedOutSample,
  completeSignedOutSampleExit
} from "@/auth/signedOutSampleExit";
import {
  authoritativeHouseholdAccessSnapshot,
  verifiedHouseholdAccessForWorkspace
} from "@/auth/verifiedHouseholdAccess";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ScreenTitle,
  SecondaryButton,
  Section
} from "@/components/ui";
import { PermissionNotice } from "@/components/PermissionDenied";
import { queuedSyncChangeSummary } from "@/components/SyncTruth";
import { VaultRecentProof } from "@/components/VaultRecentProof";
import { useDeviceAuth } from "@/deviceAuth";
import {
  formatByteSize,
  formatLocalizedDate,
  formatLocalizedNumber,
  householdAccessSummary,
  pendingUpdateSummary,
  proofFileSummary,
  sampleHouseholdAccessSummary,
  signedAccountExitPrompt,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useAccountDeletionCopy } from "@/i18n/accountDeletionCopy";
import { useExportCopy } from "@/i18n/exportCopy";
import type {
  NativeEvidence,
  NativePlaceDocument
} from "@/domain/model";
import {
  cloudStorageUsageTruth,
  type AuthoritativeCloudStorageUsage
} from "@/domain/vaultStorage";
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
import {
  type LocalRecoveryKitRecord,
  useRecoveryJourney
} from "@/recovery";
import {
  useWorkspace,
  type WorkspaceSyncRuntimeState
} from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  themes,
  typography
} from "@/theme/tokens";

export function isCompactVaultActionWidth(width: number): boolean {
  return width <= 360;
}

export function localProofStorageSummary(
  evidence: readonly NativeEvidence[],
  placeDocuments: readonly NativePlaceDocument[]
): {
  readonly fileCount: number;
  readonly byteSize: number;
} {
  const localRecords = [...evidence, ...placeDocuments].filter(
    (record) => Boolean(record.localUri)
  );
  return {
    fileCount: localRecords.length,
    byteSize: localRecords.reduce(
      (total, record) => total + record.byteSize,
      0
    )
  };
}

export function archiveSyncPresentation(
  sync: WorkspaceSyncRuntimeState,
  pendingOperationCount: number,
  language: "en" | "ar"
) {
  const ar = language === "ar";
  if (sync.conflicts.length > 0) {
    const count = formatLocalizedNumber(sync.conflicts.length, language);
    return {
      icon: WarningCircle,
      color: themes.dark.danger,
      title: ar ? "تحتاج المزامنة إلى مراجعة" : "Sync needs review",
      detail: ar
        ? `${count} اختلافات محفوظة بأمان. افتحها لمقارنة السجل المحلي بالسحابة.`
        : `${count} ${
            sync.conflicts.length === 1 ? "difference" : "differences"
          } safely preserved. Open to compare device and cloud records.`
    };
  }
  if (sync.status === "local-only") {
    return {
      icon: DeviceMobile,
      color: themes.dark.warning,
      title: ar ? "محفوظ على هذا الجهاز" : "Saved on this device",
      detail: ar
        ? "تبقى هذه المساحة على هذا الجهاز · لا توجد نسخة سحابية"
        : "This workspace stays on this device · no cloud copy"
    };
  }
  if (sync.status === "needs-attention") {
    return {
      icon: WarningCircle,
      color: themes.dark.danger,
      title: ar ? "تحتاج المزامنة إلى مراجعة" : "Sync needs review",
      detail: ar
        ? "سجلك المحلي محفوظ. افتح الحالة لمراجعة الاتصال."
        : "Your local record is preserved. Open status to review the connection."
    };
  }
  if (sync.status === "syncing" || pendingOperationCount > 0) {
    return {
      icon: ArrowsClockwise,
      color: themes.dark.information,
      title: ar ? "بانتظار تأكيد السحابة" : "Awaiting cloud",
      detail: queuedSyncChangeSummary(
        pendingOperationCount,
        language
      )
    };
  }
  if (sync.status === "offline") {
    return {
      icon: CloudSlash,
      color: themes.dark.warning,
      title: ar ? "محفوظ على الجهاز" : "Saved on device",
      detail: ar
        ? "تُستأنف المزامنة عند عودة الاتصال"
        : "Sync resumes when the connection returns"
    };
  }
  if (sync.lastSyncedAt) {
    return {
      icon: CloudCheck,
      color: themes.dark.success,
      title: ar ? "محمي في السحابة" : "Protected in cloud",
      detail: ar
        ? "أكدت السحابة أحدث التغييرات المحلية"
        : "Cloud acknowledged the latest local changes"
    };
  }
  return {
    icon: CloudCheck,
    color: themes.dark.information,
    title: ar ? "السجل السحابي متصل" : "Cloud register connected",
    detail: ar
      ? "لا توجد تغييرات محلية بانتظار المزامنة"
      : "No local changes are waiting to sync"
  };
}

function ArchiveStatusMasthead({
  canReadEvidence,
  cloudAllowanceLabel,
  cloudUsageDescription,
  cloudUsageStatus,
  encryptedAtRest,
  localSizeLabel,
  lockNow,
  onSyncPress,
  pendingOperationCount,
  previewBypass,
  proofFileCount,
  requiresUnlock,
  sync
}: {
  readonly canReadEvidence: boolean;
  readonly cloudAllowanceLabel: string;
  readonly cloudUsageDescription: string;
  readonly cloudUsageStatus: string;
  readonly encryptedAtRest: boolean;
  readonly localSizeLabel: string;
  readonly lockNow: () => void;
  readonly onSyncPress?: (() => void) | undefined;
  readonly pendingOperationCount: number;
  readonly previewBypass: boolean;
  readonly proofFileCount: number;
  readonly requiresUnlock: boolean;
  readonly sync: WorkspaceSyncRuntimeState;
}) {
  const { copy, language, rtl } = useCoreJourneyCopy();
  const syncState = archiveSyncPresentation(
    sync,
    pendingOperationCount,
    language
  );
  const SyncIcon = syncState.icon;
  const protectionTitle = previewBypass
    ? copy.vault.sessionPreviewUnlockOff
    : requiresUnlock
      ? copy.vault.deviceUnlockActive
      : encryptedAtRest
        ? copy.vault.protectedOnDevice
        : copy.vault.previewSessionOnly;
  const protectionBody = previewBypass
    ? copy.vault.previewBypassBody
    : requiresUnlock
      ? copy.vault.deviceUnlockBody
      : encryptedAtRest
        ? copy.vault.protectedBody
        : copy.vault.previewBody;
  const pendingSummary = pendingUpdateSummary(
    pendingOperationCount,
    language
  );
  const localProofSummary = proofFileSummary(
    proofFileCount,
    encryptedAtRest,
    language
  );
  const syncContent = (
    <>
      <View style={[styles.archiveFactLabelColumn, rtl && styles.archiveFactLabelColumnRtl]}>
        <Text
          style={[
            styles.archiveFactLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.vault.archiveSync}
        </Text>
      </View>
      <View style={styles.archiveSyncCopy}>
        <View style={[styles.archiveSyncTitleRow, rtl && styles.rowReverse]}>
          <SyncIcon
            color={syncState.color}
            size={18}
            weight="regular"
          />
          <Text
            accessibilityRole="header"
            style={[
              styles.archiveFactValue,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {syncState.title}
          </Text>
        </View>
        <Text
          style={[
            styles.archiveFactDescription,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {syncState.detail}
        </Text>
      </View>
      {onSyncPress ? (
        <ArrowRight
          color={colors.concrete}
          size={18}
          style={rtl ? styles.mirrorArrow : undefined}
        />
      ) : null}
    </>
  );

  return (
    <View testID="vault-archive-status">
      <CommandSurface
        style={styles.archiveMasthead}
      >
      <View
        style={[styles.protectionHeader, rtl && styles.rowReverse]}
      >
        {encryptedAtRest ? (
          <ShieldCheck color={colors.volt} size={30} weight="regular" />
        ) : (
          <Warning color={themes.dark.warning} size={30} weight="regular" />
        )}
        <View style={styles.protectionCopy}>
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.archiveStatus}
          </Text>
          <Text
            style={[
              styles.commandTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {protectionTitle}
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
        {protectionBody}
      </Text>

      <View style={styles.archiveLedger}>
        {onSyncPress ? (
          <Pressable
            accessibilityHint={
              language === "ar"
                ? "يفتح حالة المزامنة وخيارات مراجعة الاختلافات"
                : "Opens sync status and recovery options"
            }
            accessibilityLabel={`${copy.vault.archiveSync}. ${syncState.title}. ${syncState.detail}`}
            accessibilityRole="button"
            onPress={onSyncPress}
            style={({ pressed }) => [
              styles.archiveFactRow,
              rtl && styles.rowReverse,
              pressed && styles.archivePressed
            ]}
            testID="sync-truth"
          >
            {syncContent}
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityLabel={`${copy.vault.archiveSync}. ${syncState.title}. ${syncState.detail}`}
            style={[styles.archiveFactRow, rtl && styles.rowReverse]}
            testID="sync-truth"
          >
            {syncContent}
          </View>
        )}

        <ArchiveFact
          accessibilityLabel={`${copy.vault.deviceQueue}. ${pendingSummary}. ${
            pendingOperationCount > 0
              ? copy.vault.waiting
              : copy.vault.upToDate
          }`}
          detail={
            pendingOperationCount > 0
              ? copy.vault.waiting
              : copy.vault.upToDate
          }
          label={copy.vault.deviceQueue}
          rtl={rtl}
          value={pendingSummary}
        />

        {canReadEvidence ? (
          <>
            <ArchiveFact
              accessibilityLabel={`${copy.vault.proofOnDevice}. ${localSizeLabel}. ${localProofSummary} ${copy.vault.localProofStorageDescription}`}
              detail={localProofSummary}
              description={copy.vault.localProofStorageDescription}
              label={copy.vault.proofOnDevice}
              rtl={rtl}
              testID="vault-local-proof-storage"
              value={localSizeLabel}
            />
            <ArchiveFact
              accessibilityLabel={[
                copy.vault.cloudPilotStorage,
                cloudUsageStatus,
                `${copy.vault.cloudPilotAllowance}: ${cloudAllowanceLabel}`,
                cloudUsageDescription
              ].join(". ")}
              detail={`${copy.vault.cloudPilotAllowance}: ${cloudAllowanceLabel}`}
              description={cloudUsageDescription}
              label={copy.vault.cloudPilotStorage}
              rtl={rtl}
              testID="vault-cloud-storage-usage"
              value={cloudUsageStatus}
            />
          </>
        ) : null}
      </View>

        {requiresUnlock ? (
          <Pressable
            accessibilityRole="button"
            onPress={lockNow}
            style={({ pressed }) => [
              styles.archiveLockAction,
              rtl && styles.rowReverse,
              pressed && styles.archivePressed
            ]}
            testID="vault-lock-now"
          >
            <LockKey color={colors.white} size={19} weight="regular" />
            <Text
              style={[
                styles.archiveLockLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {copy.vault.lockNow}
            </Text>
          </Pressable>
        ) : null}
      </CommandSurface>
    </View>
  );
}

function ArchiveFact({
  accessibilityLabel,
  description,
  detail,
  label,
  rtl,
  testID,
  value
}: {
  readonly accessibilityLabel: string;
  readonly description?: string;
  readonly detail: string;
  readonly label: string;
  readonly rtl: boolean;
  readonly testID?: string;
  readonly value: string;
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      style={[styles.archiveFactRow, rtl && styles.rowReverse]}
      testID={testID}
    >
      <View style={[styles.archiveFactLabelColumn, rtl && styles.archiveFactLabelColumnRtl]}>
        <Text
          style={[
            styles.archiveFactLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {label}
        </Text>
      </View>
      <View style={styles.archiveFactCopy}>
        <Text
          style={[
            styles.archiveFactValue,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {value}
        </Text>
        <Text
          style={[
            styles.archiveFactDetail,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {detail}
        </Text>
        {description ? (
          <Text
            style={[
              styles.archiveFactDescription,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function VaultChapterHeader({
  index,
  testID,
  title
}: {
  readonly index: number;
  readonly testID: string;
  readonly title: string;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const reference = formatLocalizedNumber(index, language, {
    minimumIntegerDigits: 2,
    useGrouping: false
  });
  return (
    <View
      style={[styles.chapterHeader, rtl && styles.rowReverse]}
      testID={testID}
    >
      <Text
        style={styles.chapterReference}
      >
        {reference}
      </Text>
      <Text
        accessibilityRole="header"
        style={[
          styles.chapterTitle,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

export function VaultScreen({
  authoritativeCloudStorageUsage = null,
  surface = "vault"
}: {
  readonly authoritativeCloudStorageUsage?:
    | AuthoritativeCloudStorageUsage
    | null;
  readonly surface?: "vault" | "settings";
} = {}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const {
    busy: authBusy,
    householdAccessSnapshot,
    mode,
    session,
    signOut
  } = useAuthFlow();
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
    exportReadableSnapshot,
    resetSignedOutSampleVault
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
  const [sampleExitBusy, setSampleExitBusy] = useState(false);
  const [recentRecoveryKits, setRecentRecoveryKits] = useState<
    readonly LocalRecoveryKitRecord[]
  >([]);
  const [recoveryHistoryState, setRecoveryHistoryState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [recoveryHistoryRefreshKey, setRecoveryHistoryRefreshKey] =
    useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (recovery.capability.kind !== "available") {
        setRecoveryHistoryState("idle");
        setRecentRecoveryKits((current) =>
          current.length === 0 ? current : []
        );
        return () => {
          active = false;
        };
      }
      setRecoveryHistoryState("loading");
      void recovery
        .listRecent()
        .then((records) => {
          if (active) {
            setRecentRecoveryKits(records);
            setRecoveryHistoryState("ready");
          }
        })
        .catch(() => {
          if (active) {
            setRecentRecoveryKits((current) =>
              current.length === 0 ? current : []
            );
            setRecoveryHistoryState("error");
          }
        });
      return () => {
        active = false;
      };
    }, [recovery, recoveryHistoryRefreshKey])
  );
  if (!workspace) return null;

  const sampleActivationRoute = sampleActivationDestination({
    canManageHousehold,
    mode,
    session,
    workspaceMode: workspace.mode
  });
  const verifiedCloudAccess = verifiedHouseholdAccessForWorkspace(
    mode,
    session,
    workspace.household.id
  );
  const cloudStorage = cloudStorageUsageTruth({
    verifiedCloudAccess: Boolean(verifiedCloudAccess),
    authoritativeUsage: authoritativeCloudStorageUsage
  });
  const authoritativeAccess = authoritativeHouseholdAccessSnapshot(
    mode,
    session,
    householdAccessSnapshot,
    workspace.household.id
  );
  const cloudExportActivationRoute =
    mode === "supabase" && session === null
      ? sampleActivationRoute
      : null;
  const cloudExportRoute = verifiedCloudAccess
    ? "/export-create"
    : cloudExportActivationRoute;
  const householdAccessDescription = authoritativeAccess
    ? householdAccessSummary(
        authoritativeAccess.members.length,
        authoritativeAccess.pendingInvites.length,
        language
      )
    : workspace.mode === "sample" && session === null
      ? sampleHouseholdAccessSummary(
          workspace.members.length,
          language
        )
      : copy.vault.householdAccessPending;
  const signedAccount = signedAccountIdentity(mode, session);
  const signedOutSampleExitAvailable = canExitSignedOutSample({
    mode,
    session,
    workspaceMode: workspace.mode
  });
  const placeDocuments = workspace.placeDocuments ?? [];
  const {
    fileCount: proofFileCount,
    byteSize: localBytes
  } = localProofStorageSummary(
    workspace.evidence,
    placeDocuments
  );
  const localSizeLabel = formatByteSize(localBytes, language);
  const cloudAllowanceLabel = formatByteSize(
    cloudStorage.allowanceBytes,
    language
  );
  const cloudUsageStatus =
    cloudStorage.kind === "authoritative"
      ? `${formatByteSize(cloudStorage.usedBytes, language)} ${
          copy.vault.cloudUsed
        }`
      : cloudStorage.reason === "not-connected"
        ? copy.vault.cloudNotConnected
        : copy.vault.cloudUsageUnknown;
  const cloudUsageDescription =
    cloudStorage.kind === "authoritative"
      ? `${copy.vault.cloudUsageConfirmedDescription} ${formatLocalizedDate(
          cloudStorage.measuredAt,
          language
        )}. ${copy.vault.cloudAllowanceDescription}`
      : cloudStorage.reason === "not-connected"
        ? copy.vault.cloudNotConnectedDescription
        : `${copy.vault.cloudUsageUnknownDescription} ${copy.vault.cloudAllowanceDescription}`;

  const shareSnapshot = async (): Promise<void> => {
    let file: File | null = null;
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
      file = new File(
        Paths.cache,
        `heldat-readable-snapshot-${Date.now()}.json`
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
    } finally {
      if (file?.exists) {
        try {
          file.delete();
        } catch {
          Alert.alert(
            copy.vault.temporaryCopyCleanupTitle,
            copy.vault.temporaryCopyCleanupBody
          );
        }
      }
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

  const completeSampleExit = async () => {
    setSampleExitBusy(true);
    const result = await completeSignedOutSampleExit({
      mode,
      session,
      workspaceMode: workspace.mode,
      resetSampleVault: resetSignedOutSampleVault,
      clearDeviceAuthorization:
        deviceAuth.clearOnboardingAuthorization,
      routeToWelcome: () => {
        router.replace(AUTH_ROUTES.welcome);
      }
    });
    if (result === "reset-failed") {
      setSampleExitBusy(false);
      Alert.alert(
        copy.vault.exitSampleFailedTitle,
        copy.vault.exitSampleFailedBody
      );
      return;
    }
    if (result === "not-signed-out-sample") {
      setSampleExitBusy(false);
    }
  };

  const confirmSampleExit = () => {
    if (!signedOutSampleExitAvailable || sampleExitBusy) return;
    const beginSampleExit = () => {
      void completeSampleExit();
    };
    Alert.alert(
      copy.vault.exitSampleConfirmTitle,
      copy.vault.exitSampleConfirmBody,
      [
        { text: copy.vault.cancel, style: "cancel" },
        {
          text: copy.vault.exitSample,
          style: "destructive",
          onPress: beginSampleExit
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
      <ArchiveStatusMasthead
        canReadEvidence={canReadEvidence}
        cloudAllowanceLabel={cloudAllowanceLabel}
        cloudUsageDescription={cloudUsageDescription}
        cloudUsageStatus={cloudUsageStatus}
        encryptedAtRest={repository.encryptedAtRest}
        localSizeLabel={localSizeLabel}
        lockNow={deviceAuth.lockNow}
        onSyncPress={
          sync.status === "local-only"
            ? undefined
            : sync.conflicts.length > 0
              ? () => router.push("/sync-conflicts")
              : () => void syncNow()
        }
        pendingOperationCount={pendingOperationCount}
        previewBypass={deviceAuth.previewBypass}
        proofFileCount={proofFileCount}
        requiresUnlock={deviceAuth.requiresUnlock}
        sync={sync}
      />

      {!canReadEvidence ? (
        <PermissionNotice
          capability="evidence.read"
          testID="vault-proof-view-denied"
        />
      ) : null}

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
        <VaultChapterHeader
          index={2}
          testID="vault-chapter-recovery"
          title={copy.vault.backupRecovery}
        />
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
        {recoveryHistoryState === "error" ? (
          <StatusRow
            compact={compactActions}
            description={copy.vault.recoveryHistoryUnavailable}
            icon={Warning}
            label={copy.vault.recentRecoveryKits}
            onPress={() =>
              setRecoveryHistoryRefreshKey((current) => current + 1)
            }
            status={copy.vault.retryRecoveryHistory}
          />
        ) : null}
        {recentRecoveryKits.length > 0 ? (
          <View
            style={styles.recoveryHistory}
            testID="vault-recent-recovery-kits"
          >
            <Text
              style={[
                styles.storageSubheading,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.recentRecoveryKits}
            </Text>
            <Text
              style={[
                styles.sectionMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.recentRecoveryKitsDescription}
            </Text>
            {recentRecoveryKits.map((kit) => (
              <StatusRow
                compact={compactActions}
                description={`${formatLocalizedDate(
                  kit.createdAt,
                  language
                )} · ${formatByteSize(kit.byteSize, language)}`}
                icon={
                  kit.externalBackupConfirmedAt
                    ? ShieldCheck
                    : Warning
                }
                key={kit.reference}
                label={kit.fileName}
                onPress={() => router.push("/recovery-create")}
                status={
                  kit.externalBackupConfirmedAt
                    ? copy.vault.externalCopyConfirmed
                    : copy.vault.localKitNeedsCopy
                }
              />
            ))}
          </View>
        ) : null}
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
        <VaultChapterHeader
          index={3}
          testID="vault-chapter-portability"
          title={copy.vault.dataPortability}
        />
        {canExport ? (
          <>
            <StatusRow
              compact={compactActions}
              description={
                verifiedCloudAccess
                  ? exportCopy.vault.cloudExportMeta
                  : exportCopy.vault.activateAccountMeta
              }
              icon={CloudArrowDown}
              label={exportCopy.vault.cloudExport}
              {...(cloudExportRoute
                ? { onPress: () => router.push(cloudExportRoute) }
                : {})}
              status={
                verifiedCloudAccess
                  ? exportCopy.vault.open
                  : cloudExportActivationRoute
                    ? exportCopy.vault.activateAccount
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
        <VaultChapterHeader
          index={4}
          testID="vault-chapter-settings"
          title={copy.vault.settingsTitle}
        />
        <StatusRow
          accessibilityLabel={`${copy.vault.settingsTitle}. ${copy.vault.settingsMeta}`}
          compact={compactActions}
          description={copy.vault.settingsMeta}
          icon={GearSix}
          label={copy.vault.settingsControls}
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
          status={copy.vault.documentCurrent}
        />
        <StatusRow
          compact={compactActions}
          description={copy.vault.pilotTermsDescription}
          icon={FileText}
          label={copy.vault.pilotTerms}
          onPress={() => router.push("/terms")}
          status={copy.vault.documentCurrent}
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
              {householdAccessDescription}
            </Text>
          </View>
          <ArrowRight
            color={colors.textMuted}
            size={20}
            style={rtl ? styles.mirrorArrow : undefined}
          />
        </Pressable>
      </Section>

      {signedOutSampleExitAvailable ? (
        <Section>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.sampleWorkspace}
          </Text>
          <SecondaryButton
            accessibilityHint={copy.vault.exitSampleHint}
            destructive
            disabled={sampleExitBusy}
            icon={SignOut}
            label={
              sampleExitBusy
                ? copy.vault.exitingSample
                : copy.vault.exitSample
            }
            loading={sampleExitBusy}
            onPress={confirmSampleExit}
          />
          <Text
            style={[
              styles.sectionMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.exitSampleMeta}
          </Text>
        </Section>
      ) : null}

      {signedAccount ? (
        <Section>
          <Text
            accessibilityRole="header"
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
  accessibilityLabel,
  compact = false,
  description,
  icon: Icon,
  label,
  onPress,
  status
}: {
  readonly accessibilityLabel?: string;
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
        accessibilityLabel={accessibilityLabel}
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
  archiveMasthead: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderRadius: radius.lg
  },
  protectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  archiveLedger: {
    borderTopWidth: 1,
    borderTopColor: colors.onCarbonBorder
  },
  archiveFactRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.onCarbonBorder
  },
  archiveFactLabelColumn: {
    width: 78,
    flexShrink: 0,
    paddingTop: 2,
    alignItems: "flex-start"
  },
  archiveFactLabelColumnRtl: {
    alignItems: "flex-end"
  },
  archiveFactLabel: {
    color: colors.concrete,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  archiveFactCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  archiveSyncCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  archiveSyncTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  archiveFactValue: {
    flexShrink: 1,
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    fontVariant: ["tabular-nums"]
  },
  archiveFactDetail: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  archiveFactDescription: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  archiveLockAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.onCarbonBorder,
    borderRadius: radius.md
  },
  archiveLockLabel: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  archivePressed: {
    opacity: 0.7
  },
  chapterHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong
  },
  chapterReference: {
    width: 30,
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "left",
    writingDirection: "ltr"
  },
  chapterTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  sectionTitle: {
    flexShrink: 1,
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  sectionMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  recoveryHistory: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  storageSubheading: {
    flexShrink: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
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
