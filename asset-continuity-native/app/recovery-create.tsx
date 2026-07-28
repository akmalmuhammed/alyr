import {
  CheckCircle,
  FileLock,
  ShareNetwork,
  ShieldCheck
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
              <CheckCircle color={colors.volt} size={32} weight="regular" />
              <View style={styles.successCopy}>
                <Text
                  style={[
                    styles.commandLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.successEyebrow}
                </Text>
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.commandTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {recoveryCopy.successTitle}
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
              {recoveryCopy.successBody}
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
          </Section>

          {error ? (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          ) : null}
          <PrimaryButton
            disabled={busy}
            icon={ShareNetwork}
            label={recoveryCopy.share}
            loading={busy}
            onPress={() => void share()}
          />
          <SecondaryButton
            icon={FileLock}
            label={recoveryCopy.createAnother}
            onPress={() => setVerification(null)}
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
