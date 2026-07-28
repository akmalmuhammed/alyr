import { useRouter } from "expo-router";
import {
  CheckCircle,
  FileLock,
  ShieldCheck,
  Warning
} from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  RECOVERY_REPLACE_CONFIRMATION,
  type RecoveryImportPreview,
  useRecoveryJourney,
  validateRecoveryConfirmation
} from "@/recovery";
import {
  formatLocalizedNumber,
  formatRecoveryDate,
  localizedRecoveryErrorMessage,
  recoveryConfirmationDescription,
  recoveryReplaceAlertBody,
  shouldStackSecondaryMetadata,
  useSecondarySurfaceCopy
} from "@/i18n/secondarySurfaceCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function ImportRecoveryKitScreen() {
  const { can } = useWorkspace();
  const router = useRouter();
  const runtime = useRecoveryJourney();
  const { fontScale, width } = useWindowDimensions();
  const { copy, language, rtl } = useSecondarySurfaceCopy();
  const recoveryCopy = copy.recovery.import;
  const compactMetadata = shouldStackSecondaryMetadata(width, fontScale);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<RecoveryImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = useMemo(
    () => validateRecoveryConfirmation(confirmation),
    [confirmation]
  );

  useEffect(
    () => () => {
      runtime.clearPreview();
    },
    [runtime]
  );

  const chooseAndVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await runtime.chooseAndPreview(passphrase);
      setPassphrase("");
      if (result) setPreview(result);
    } catch (caught) {
      setPassphrase("");
      setError(localizedRecoveryErrorMessage(caught, language));
    } finally {
      setBusy(false);
    }
  };

  const abandonPreview = () => {
    runtime.clearPreview();
    setPreview(null);
    setConfirmation("");
    setError(null);
  };

  const restore = async () => {
    if (!preview || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await runtime.restore(preview.previewId, confirmation);
      setPreview(null);
      setConfirmation("");
      Alert.alert(
        recoveryCopy.completeTitle,
        recoveryCopy.completeBody,
        [
          {
            text: recoveryCopy.openVault,
            onPress: () => router.replace("/(tabs)/vault")
          }
        ]
      );
    } catch (caught) {
      setError(localizedRecoveryErrorMessage(caught, language));
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = () => {
    if (!preview || !confirmed || busy) return;
    Alert.alert(
      recoveryCopy.replaceTitle,
      recoveryReplaceAlertBody(preview.householdName, language),
      [
        { text: recoveryCopy.keepCurrent, style: "cancel" },
        {
          text: recoveryCopy.replaceAndRestore,
          style: "destructive",
          onPress: () => void restore()
        }
      ]
    );
  };

  if (!can("household.manage")) {
    return <PermissionDeniedScreen capability="household.manage" />;
  }

  return (
    <AppScreen testID="recovery-import-screen">
      <View style={styles.heading}>
        <Eyebrow tone="volt">{recoveryCopy.eyebrow}</Eyebrow>
        <ScreenTitle>{recoveryCopy.title}</ScreenTitle>
        <BodyText muted>{recoveryCopy.intro}</BodyText>
      </View>

      {runtime.capability.kind === "unavailable" ? (
        <RecoveryUnavailablePanel capability={runtime.capability} />
      ) : preview ? (
        <>
          <CommandSurface>
            <View
              style={[
                styles.commandHeader,
                rtl && styles.rowReverse
              ]}
            >
              <ShieldCheck color={colors.volt} size={31} weight="regular" />
              <View style={styles.commandCopy}>
                <Text
                  style={[
                    styles.commandLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.previewEyebrow}
                </Text>
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.commandTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.previewTitle}
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
              {recoveryCopy.previewBody}
            </Text>
          </CommandSurface>

          <Section>
            <Text
              style={[
                styles.sectionTitle,
                styles.mixedScript,
                rtl && styles.textRight
              ]}
            >
              {preview.householdName}
            </Text>
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.created}
              rtl={rtl}
              value={formatRecoveryDate(preview.createdAt, language)}
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.items}
              rtl={rtl}
              value={formatLocalizedNumber(preview.itemCount, language)}
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.places}
              rtl={rtl}
              value={formatLocalizedNumber(preview.placeCount, language)}
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.proofRecords}
              rtl={rtl}
              value={formatLocalizedNumber(preview.proofCount, language)}
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.protectedFiles}
              rtl={rtl}
              value={formatLocalizedNumber(
                preview.attachmentCount,
                language
              )}
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.kitId}
              rtl={rtl}
              value={`••••${preview.kitIdSuffix}`}
              valueDirection="ltr"
            />
            <MetadataRow
              compact={compactMetadata}
              label={recoveryCopy.sha256}
              mono
              rtl={rtl}
              value={preview.containerSha256}
              valueDirection="ltr"
            />
          </Section>

          <View
            style={[
              styles.dangerNotice,
              rtl && styles.rowReverse
            ]}
          >
            <Warning color={colors.danger} size={22} weight="regular" />
            <Text
              style={[
                styles.dangerText,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {recoveryCopy.dangerBody}
            </Text>
          </View>

          <Field
            autoCapitalize="characters"
            autoCorrect={false}
            description={recoveryConfirmationDescription(
              RECOVERY_REPLACE_CONFIRMATION,
              language
            )}
            label={recoveryCopy.confirmationLabel}
            onChangeText={setConfirmation}
            style={rtl ? styles.confirmationInput : undefined}
            value={confirmation}
          />
          {error ? (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          ) : null}
          <SecondaryButton
            destructive
            disabled={!confirmed || busy}
            icon={Warning}
            label={recoveryCopy.reviewReplacement}
            onPress={confirmRestore}
          />
          <SecondaryButton
            disabled={busy}
            label={recoveryCopy.chooseDifferent}
            onPress={abandonPreview}
          />
        </>
      ) : (
        <>
          <CommandSurface>
            <View
              style={[
                styles.commandHeader,
                rtl && styles.rowReverse
              ]}
            >
              <FileLock color={colors.volt} size={31} weight="regular" />
              <View style={styles.commandCopy}>
                <Text
                  style={[
                    styles.commandLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.localCheckEyebrow}
                </Text>
                <Text
                  style={[
                    styles.commandTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.localCheckTitle}
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
              {recoveryCopy.localCheckBody}
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
              {recoveryCopy.openVerify}
            </Text>
            <BodyText muted>{recoveryCopy.openVerifyBody}</BodyText>
            <Field
              autoCapitalize="none"
              autoComplete="off"
              label={recoveryCopy.passphrase}
              onChangeText={setPassphrase}
              onSubmitEditing={() => void chooseAndVerify()}
              returnKeyType="next"
              secureTextEntry
              textContentType="password"
              value={passphrase}
            />
          </Section>
          {error ? (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          ) : null}
          <PrimaryButton
            accessibilityHint={recoveryCopy.chooseVerifyHint}
            disabled={passphrase.length === 0 || busy}
            icon={CheckCircle}
            label={recoveryCopy.chooseVerify}
            loading={busy}
            onPress={() => void chooseAndVerify()}
          />
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
  commandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  commandCopy: {
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
    fontSize: 21,
    lineHeight: 27
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
    minHeight: 46,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  metadataLabel: {
    width: 108,
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
  dangerNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    backgroundColor: colors.dangerQuiet
  },
  dangerText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
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
  textRight: {
    textAlign: "right"
  },
  mixedScript: {
    writingDirection: "auto"
  },
  ltrValue: {
    writingDirection: "ltr"
  },
  ltrValueRtlAlign: {
    textAlign: "right"
  },
  confirmationInput: {
    textAlign: "left",
    writingDirection: "ltr"
  }
});
