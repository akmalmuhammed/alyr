import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  ArrowRight,
  CloudArrowDown,
  CloudSlash,
  DownloadSimple,
  FileText,
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
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";
import { useRecoveryJourney } from "@/recovery";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export function isCompactVaultActionWidth(width: number): boolean {
  return width <= 360;
}

export default function VaultScreen() {
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
    <AppScreen testID="vault-screen">
      <View style={styles.heading}>
        <ScreenTitle>{copy.vault.title}</ScreenTitle>
        <BodyText muted>{copy.vault.intro}</BodyText>
      </View>

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
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {language === "ar" ? "الخصوصية والدعم" : "Privacy and support"}
        </Text>
        <StatusRow
          compact={compactActions}
          description={
            language === "ar"
              ? "ما الذي يحفظه ALYR وكيف تُدار السجلات."
              : "What ALYR stores and how household records are handled."
          }
          icon={ShieldCheck}
          label={
            language === "ar" ? "إشعار الخصوصية" : "Privacy notice"
          }
          onPress={() => router.push("/privacy-policy")}
          status="v0.1"
        />
        <StatusRow
          compact={compactActions}
          description={
            language === "ar"
              ? "الغرض والمسؤوليات وحدود النسخة التجريبية."
              : "Purpose, responsibilities and pilot boundaries."
          }
          icon={FileText}
          label={
            language === "ar" ? "شروط النسخة التجريبية" : "Pilot terms"
          }
          onPress={() => router.push("/terms")}
          status="v0.1"
        />
        <StatusRow
          compact={compactActions}
          description={
            language === "ar"
              ? "الإبلاغ عن مشكلة من دون كشف بيانات المنزل."
              : "Report an issue without exposing household data."
          }
          icon={Lifebuoy}
          label={language === "ar" ? "الدعم" : "Support"}
          onPress={() => router.push("/support")}
          status={language === "ar" ? "فتح" : "Open"}
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

      {mode === "preview" &&
      workspace.mode === "sample" &&
      canManageHousehold ? (
        <SecondaryButton
          icon={LockKey}
          label={copy.vault.createMyPrivateHousehold}
          onPress={() => router.push("/personal-start")}
        />
      ) : null}
    </AppScreen>
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
    fontSize: 11,
    lineHeight: 15,
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
    fontFamily: typography.bodyBold,
    fontSize: 10,
    lineHeight: 14,
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
