import * as LocalAuthentication from "expo-local-authentication";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  CloudSlash,
  Database,
  DownloadSimple,
  FingerprintSimple,
  HardDrives,
  LockKey,
  ShieldCheck,
  Translate,
  Warning
} from "phosphor-react-native";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  BodyText,
  ProgressBar,
  ScreenTitle,
  SecondaryButton,
  StatusPill,
  Surface
} from "@/components/ui";
import { useCopy } from "@/i18n/copy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const PILOT_BYTES = 40 * 1024 * 1024;

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VaultScreen() {
  const {
    workspace,
    repository,
    pendingOperationCount,
    changeLanguage,
    exportReadableSnapshot,
    replaceWithPersonalWorkspace
  } = useWorkspace();
  const { language, text } = useCopy();
  if (!workspace) return null;

  const localBytes = workspace.evidence.reduce(
    (total, item) => total + item.byteSize,
    0
  );
  const storagePercent = Math.min(
    100,
    Math.round((localBytes / PILOT_BYTES) * 100)
  );

  const authenticate = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Native check required",
        "Biometric unlock is verified only in an iOS or Android development build."
      );
      return;
    }
    const available = await LocalAuthentication.hasHardwareAsync();
    if (!available) {
      Alert.alert(
        "Biometrics unavailable",
        "This device does not expose supported biometric hardware."
      );
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock ALYR Vault",
      cancelLabel: "Cancel",
      disableDeviceFallback: false
    });
    Alert.alert(
      result.success ? "Vault unlocked" : "Vault stayed locked",
      result.success
        ? "The local biometric check succeeded."
        : "No protected content was revealed."
    );
  };

  const shareSnapshot = async () => {
    const snapshot = exportReadableSnapshot();
    if (!snapshot) return;
    if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) {
      Alert.alert(
        "Native export required",
        "The readable snapshot is available from an installed native build. It is not an encrypted Recovery Kit."
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
      dialogTitle: "Export readable ALYR snapshot",
      mimeType: "application/json"
    });
  };

  const confirmReset = () => {
    Alert.alert(
      "Replace this workspace?",
      "This creates a new personal workspace in the current local store. Export anything you need first.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace workspace",
          style: "destructive",
          onPress: () => void replaceWithPersonalWorkspace()
        }
      ]
    );
  };

  return (
    <AppScreen testID="vault-screen">
      <View style={styles.heading}>
        <StatusPill
          label={repository.encryptedAtRest ? "Device protected" : "Preview mode"}
          tone={repository.encryptedAtRest ? "volt" : "warning"}
        />
        <ScreenTitle>{text.vault}</ScreenTitle>
        <BodyText muted>
          Evidence, device storage, access boundaries, and recovery status in
          one honest view.
        </BodyText>
      </View>

      <Surface emphasis>
        <View style={styles.statusHeader}>
          <View style={styles.statusIcon}>
            {repository.encryptedAtRest ? (
              <ShieldCheck color={colors.volt} size={32} weight="duotone" />
            ) : (
              <Warning color={colors.warning} size={32} weight="duotone" />
            )}
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>
              {repository.encryptedAtRest
                ? "Encrypted device database"
                : "Session-only preview store"}
            </Text>
            <Text style={styles.statusMeta}>
              {repository.kind === "sqlite-sqlcipher"
                ? "SQLCipher · key held in platform secure storage"
                : "Memory fallback · closes with this preview session"}
            </Text>
          </View>
        </View>
        <SecondaryButton
          icon={FingerprintSimple}
          label="Test biometric unlock"
          onPress={() => void authenticate()}
        />
      </Surface>

      <Surface>
        <View style={styles.metricHeader}>
          <HardDrives color={colors.cyan} size={25} weight="duotone" />
          <View style={styles.metricCopy}>
            <Text style={styles.metricTitle}>Pilot storage allowance</Text>
            <Text style={styles.metricValue}>
              {bytesLabel(localBytes)} / 40 MB
            </Text>
          </View>
          <Text style={styles.metricPercent}>{storagePercent}%</Text>
        </View>
        <ProgressBar
          label={`${storagePercent} percent of the pilot allowance used`}
          percent={storagePercent}
        />
        <BodyText muted>
          {workspace.evidence.length} material records. Imported files over 10
          MB are rejected rather than silently changed.
        </BodyText>
      </Surface>

      <Surface>
        <View style={styles.diagnosticRow}>
          <Database color={colors.violetSoft} size={23} weight="duotone" />
          <View style={styles.diagnosticCopy}>
            <Text style={styles.diagnosticTitle}>{text.sync}</Text>
            <Text style={styles.diagnosticMeta}>
              {pendingOperationCount} local operations queued
            </Text>
          </View>
          <StatusPill label="Local only" tone="warning" />
        </View>
        <View style={styles.diagnosticRow}>
          <CloudSlash color={colors.textMuted} size={23} weight="duotone" />
          <View style={styles.diagnosticCopy}>
            <Text style={styles.diagnosticTitle}>Cloud acknowledgement</Text>
            <Text style={styles.diagnosticMeta}>
              Not configured · no backup claim
            </Text>
          </View>
        </View>
      </Surface>

      <Surface>
        <Text style={styles.sectionTitle}>Portable copy</Text>
        <BodyText muted>
          Export a readable JSON snapshot for inspection. It contains private
          metadata and is not encrypted. The passphrase-protected Recovery Kit
          remains a separate production gate.
        </BodyText>
        <SecondaryButton
          icon={DownloadSimple}
          label="Export readable snapshot"
          onPress={() => void shareSnapshot()}
        />
      </Surface>

      <Surface>
        <View style={styles.languageHeader}>
          <Translate color={colors.cyan} size={24} weight="duotone" />
          <Text style={styles.sectionTitle}>{text.language}</Text>
        </View>
        <View accessibilityRole="radiogroup" style={styles.languageOptions}>
          <LanguageChoice
            active={language === "en"}
            label="English"
            onPress={() => void changeLanguage("en")}
          />
          <LanguageChoice
            active={language === "ar"}
            label="العربية"
            onPress={() => void changeLanguage("ar")}
          />
        </View>
        <BodyText muted>
          Core navigation supports Arabic RTL. Public, legal, and high-risk
          Arabic copy still requires human linguistic review.
        </BodyText>
      </Surface>

      {workspace.mode === "sample" ? (
        <SecondaryButton
          icon={LockKey}
          label="Replace sample with personal workspace"
          onPress={confirmReset}
        />
      ) : null}
    </AppScreen>
  );
}

function LanguageChoice({
  active,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.languageChoice,
        active && styles.languageChoiceActive,
        pressed && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.languageLabel,
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
    gap: spacing.sm
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  statusIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.voltQuiet
  },
  statusCopy: {
    flex: 1,
    gap: 4
  },
  statusTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 17
  },
  statusMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  metricCopy: {
    flex: 1,
    gap: 2
  },
  metricTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  metricValue: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  },
  metricPercent: {
    color: colors.cyan,
    fontFamily: typography.bodyBold,
    fontSize: 17
  },
  diagnosticRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  diagnosticCopy: {
    flex: 1,
    gap: 3
  },
  diagnosticTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  diagnosticMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18
  },
  languageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  languageOptions: {
    flexDirection: "row",
    gap: spacing.xs
  },
  languageChoice: {
    minWidth: 112,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  languageChoiceActive: {
    borderColor: "rgba(74, 216, 245, 0.44)",
    backgroundColor: colors.cyanQuiet
  },
  languageLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  languageLabelActive: {
    color: colors.cyan
  },
  pressed: {
    opacity: 0.72
  }
});
