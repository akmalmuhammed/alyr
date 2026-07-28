import {
  CheckCircle,
  FileLock,
  ShareNetwork,
  ShieldCheck,
  Warning
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";

import { RecoveryUnavailablePanel } from "@/components/RecoveryUnavailablePanel";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  Eyebrow,
  Field,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  Section
} from "@/components/ui";
import {
  type RecoveryKitVerification,
  useRecoveryJourney
} from "@/recovery";
import {
  formatLocalizedNumber,
  formatRecoveryByteSize,
  formatRecoveryDate,
  localizedRecoveryErrorMessage,
  shouldStackSecondaryMetadata,
  useSecondarySurfaceCopy
} from "@/i18n/secondarySurfaceCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

function codePointLength(value: string): number {
  return [...value.normalize("NFC")].length;
}

export default function CreateRecoveryKitScreen() {
  const { can } = useWorkspace();
  const runtime = useRecoveryJourney();
  const { fontScale, width } = useWindowDimensions();
  const { copy, language, rtl } = useSecondarySurfaceCopy();
  const recoveryCopy = copy.recovery.create;
  const compactMetadata = shouldStackSecondaryMetadata(width, fontScale);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] =
    useState<RecoveryKitVerification | null>(null);
  const [shareSheetReturned, setShareSheetReturned] = useState(false);

  const fieldError = useMemo(() => {
    if (!passphrase && !confirmation) return null;
    if (codePointLength(passphrase) < 12) {
      return recoveryCopy.minimumError;
    }
    if (passphrase !== confirmation) {
      return recoveryCopy.mismatchError;
    }
    return null;
  }, [
    confirmation,
    passphrase,
    recoveryCopy.minimumError,
    recoveryCopy.mismatchError
  ]);
  const ready =
    codePointLength(passphrase) >= 12 &&
    passphrase === confirmation &&
    !busy;

  const createKit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const created = await runtime.create(passphrase);
      setVerification(created);
      setShareSheetReturned(false);
      setPassphrase("");
      setConfirmation("");
    } catch (caught) {
      setError(localizedRecoveryErrorMessage(caught, language));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!verification) return;
    setBusy(true);
    setError(null);
    try {
      await runtime.share(verification.reference);
      setShareSheetReturned(true);
    } catch (caught) {
      setError(localizedRecoveryErrorMessage(caught, language));
    } finally {
      setBusy(false);
    }
  };

  const confirmExternalBackup = async () => {
    if (!verification || !shareSheetReturned) return;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await runtime.confirmExternalBackup(
        verification.reference
      );
      setVerification({
        ...verification,
        externalBackupConfirmedAt:
          confirmed.externalBackupConfirmedAt
      });
    } catch (caught) {
      setError(localizedRecoveryErrorMessage(caught, language));
    } finally {
      setBusy(false);
    }
  };

  if (!can("export.create")) {
    return <PermissionDeniedScreen capability="export.create" />;
  }

  return (
    <AppScreen testID="recovery-create-screen">
      <View style={styles.heading}>
        <Eyebrow tone="volt">{recoveryCopy.eyebrow}</Eyebrow>
        <ScreenTitle>{recoveryCopy.title}</ScreenTitle>
        <BodyText muted>{recoveryCopy.intro}</BodyText>
      </View>

      {runtime.capability.kind === "unavailable" ? (
        <RecoveryUnavailablePanel capability={runtime.capability} />
      ) : verification ? (
        <>
          <CommandSurface>
            <View
              style={[
                styles.successHeader,
                rtl && styles.rowReverse
              ]}
            >
              {verification.externalBackupConfirmedAt ? (
                <ShieldCheck
                  color={colors.volt}
                  size={32}
                  weight="regular"
                />
              ) : (
                <FileLock
                  color={colors.volt}
                  size={32}
                  weight="regular"
                />
              )}
              <View style={styles.successCopy}>
                <Text
                  style={[
                    styles.commandLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {verification.externalBackupConfirmedAt
                    ? recoveryCopy.protectedEyebrow
                    : recoveryCopy.successEyebrow}
                </Text>
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.commandTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {verification.externalBackupConfirmedAt
                    ? recoveryCopy.protectedTitle
                    : recoveryCopy.successTitle}
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
              {verification.externalBackupConfirmedAt
                ? recoveryCopy.protectedBody
                : recoveryCopy.successBody}
            </Text>
          </CommandSurface>

          <Section>
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {recoveryCopy.verification}
            </Text>
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.file}
              rtl={rtl}
              value={verification.fileName}
              valueDirection="ltr"
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.size}
              rtl={rtl}
              value={formatRecoveryByteSize(
                verification.byteSize,
                language
              )}
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.protectedFiles}
              rtl={rtl}
              value={formatLocalizedNumber(
                verification.attachmentCount,
                language
              )}
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.protection}
              rtl={rtl}
              value={verification.protection}
              valueDirection="ltr"
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.sha256}
              mono
              rtl={rtl}
              value={verification.sha256}
              valueDirection="ltr"
            />
            {verification.externalBackupConfirmedAt ? (
              <MetadataRow
                compact={compactMetadata}
                label={recoveryCopy.confirmedAt}
                rtl={rtl}
                value={formatRecoveryDate(
                  verification.externalBackupConfirmedAt,
                  language
                )}
              />
            ) : null}
          </Section>

          {error ? (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          ) : null}
          {!verification.externalBackupConfirmedAt ? (
            <Section>
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.backupGate,
                  rtl && styles.rowReverse
                ]}
              >
                <Warning
                  color={colors.warning}
                  size={24}
                  weight="regular"
                />
                <View style={styles.backupGateCopy}>
                  <Text
                    style={[
                      styles.backupGateTitle,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {shareSheetReturned
                      ? recoveryCopy.shareSheetReturnedTitle
                      : recoveryCopy.backupNeededTitle}
                  </Text>
                  <Text
                    style={[
                      styles.backupGateBody,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {shareSheetReturned
                      ? recoveryCopy.shareSheetReturnedBody
                      : recoveryCopy.backupNeededBody}
                  </Text>
                </View>
              </View>
            </Section>
          ) : null}
          {!verification.externalBackupConfirmedAt ? (
            <PrimaryButton
              disabled={busy}
              icon={ShareNetwork}
              label={recoveryCopy.share}
              loading={busy}
              onPress={() => void share()}
            />
          ) : null}
          {shareSheetReturned &&
          !verification.externalBackupConfirmedAt ? (
            <SecondaryButton
              accessibilityHint={recoveryCopy.confirmExternalCopyHint}
              disabled={busy}
              icon={CheckCircle}
              label={recoveryCopy.confirmExternalCopy}
              loading={busy}
              onPress={() => void confirmExternalBackup()}
            />
          ) : null}
          <SecondaryButton
            icon={FileLock}
            label={recoveryCopy.createAnother}
            onPress={() => {
              setVerification(null);
              setShareSheetReturned(false);
            }}
          />
        </>
      ) : (
        <>
          <CommandSurface>
            <View
              style={[
                styles.successHeader,
                rtl && styles.rowReverse
              ]}
            >
              <ShieldCheck color={colors.volt} size={30} weight="regular" />
              <View style={styles.successCopy}>
                <Text
                  style={[
                    styles.commandLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.protectsEyebrow}
                </Text>
                <Text
                  style={[
                    styles.commandTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.protectsTitle}
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
              {recoveryCopy.protectsBody}
            </Text>
          </CommandSurface>

          <Section>
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {recoveryCopy.choosePassphrase}
            </Text>
            <BodyText muted>{recoveryCopy.choosePassphraseBody}</BodyText>
            <Field
              autoCapitalize="none"
              autoComplete="off"
              error={fieldError}
              label={recoveryCopy.passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              textContentType="newPassword"
              value={passphrase}
            />
            <Field
              autoCapitalize="none"
              autoComplete="off"
              error={fieldError}
              label={recoveryCopy.confirmPassphrase}
              onChangeText={setConfirmation}
              onSubmitEditing={() => void createKit()}
              returnKeyType="done"
              secureTextEntry
              textContentType="newPassword"
              value={confirmation}
            />
          </Section>

          {error ? (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          ) : null}
          <PrimaryButton
            accessibilityHint={recoveryCopy.createHint}
            disabled={!ready}
            icon={FileLock}
            label={recoveryCopy.create}
            loading={busy}
            onPress={() => void createKit()}
          />
          <Text
            style={[
              styles.footnote,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {recoveryCopy.footnote}
          </Text>
        </>
      )}
    </AppScreen>
  );
}

function MetadataRow({
  compact,
  label,
  mono = false,
  rtl,
  valueDirection = "auto",
  value
}: {
  readonly compact: boolean;
  readonly label: string;
  readonly mono?: boolean;
  readonly rtl: boolean;
  readonly value: string;
  readonly valueDirection?: "auto" | "ltr";
}) {
  return (
    <View
      style={[
        styles.metadataRow,
        rtl && styles.rowReverse,
        compact && styles.metadataRowCompact
      ]}
    >
      <Text
        style={[
          styles.metadataLabel,
          compact && styles.metadataLabelCompact,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <Text
        selectable
        style={[
          styles.metadataValue,
          mono && styles.metadataMono,
          rtl && valueDirection === "auto" && styles.arabic,
          rtl && valueDirection === "auto" && styles.rtlText,
          valueDirection === "ltr" && styles.ltrValue,
          rtl && valueDirection === "ltr" && styles.ltrValueRtlAlign
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  successCopy: {
    flex: 1,
    gap: 2
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 14,
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
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  metadataRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  metadataLabel: {
    width: 104,
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  metadataRowCompact: {
    flexDirection: "column",
    gap: 3
  },
  metadataLabelCompact: {
    width: "100%"
  },
  metadataValue: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  metadataMono: {
    fontFamily: "monospace",
    fontSize: 12
  },
  footnote: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center"
  },
  backupGate: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  backupGateCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  backupGateTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  backupGateBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  ltrValue: {
    writingDirection: "ltr"
  },
  ltrValueRtlAlign: {
    textAlign: "right"
  }
});
