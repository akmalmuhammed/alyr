import * as Crypto from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CloudArrowDown,
  FilePdf,
  FileText,
  ShieldCheck,
  WarningCircle
} from "phosphor-react-native";
import type { Icon } from "phosphor-react-native";
import { useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import type {
  ExportStatusResponse,
  RenderedExport
} from "@alyr/contracts";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  Section
} from "@/components/ui";
import {
  exportErrorMessage,
  useExportCopy
} from "@/i18n/exportCopy";
import { getRuntimeCloudExportPort } from "@/runtime/cloudServices";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

type ExportFormat = "json-manifest" | "pdf";

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export default function ExportCreateScreen() {
  const router = useRouter();
  const { mode } = useAuthFlow();
  const {
    can,
    workspace,
    pendingOperationCount,
    sync,
    syncNow
  } = useWorkspace();
  const { copy, language, locale, rtl } = useExportCopy();
  const [format, setFormat] =
    useState<ExportFormat>("json-manifest");
  const [redacted, setRedacted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [ready, setReady] =
    useState<ExportStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const cloudExport =
    mode === "supabase" ? getRuntimeCloudExportPort() : null;

  if (!workspace) return null;
  if (!can("export.create")) {
    return <PermissionDeniedScreen capability="export.create" />;
  }

  const changeFormat = (next: ExportFormat) => {
    setFormat(next);
    setReady(null);
    setError(null);
    idempotencyKeyRef.current = null;
  };
  const changeRedaction = (next: boolean) => {
    setRedacted(next);
    setReady(null);
    setError(null);
    idempotencyKeyRef.current = null;
  };

  const createExport = async () => {
    if (!cloudExport || creating || pendingOperationCount > 0) return;
    setCreating(true);
    setError(null);
    setReady(null);
    const idempotencyKey =
      idempotencyKeyRef.current ?? Crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    try {
      let result = await cloudExport.create({
        apiVersion: 1,
        householdId: workspace.household.id,
        format,
        assetIds: [],
        redacted,
        idempotencyKey
      });
      if (!result.ok) {
        setError(exportErrorMessage(result.error.code, language));
        return;
      }
      let status = result.value;
      for (
        let attempt = 0;
        (status.status === "queued" ||
          status.status === "processing") &&
        attempt < 8;
        attempt += 1
      ) {
        await sleep(Math.min(400 + attempt * 250, 1500));
        result = await cloudExport.get(status.exportId);
        if (!result.ok) {
          setError(exportErrorMessage(result.error.code, language));
          return;
        }
        status = result.value;
      }
      if (status.status !== "ready") {
        setError(
          status.error
            ? exportErrorMessage(status.error.code, language)
            : copy.screen.error.offline
        );
        return;
      }
      idempotencyKeyRef.current = null;
      setReady(status);
    } catch {
      setError(copy.screen.error.offline);
    } finally {
      setCreating(false);
    }
  };

  const shareRendered = async (
    rendered: RenderedExport
  ): Promise<void> => {
    const file = new File(Paths.cache, rendered.fileName);
    try {
      file.create({ overwrite: true });
      file.write(rendered.bytes);
      rendered.bytes.fill(0);
      if (
        !file.exists ||
        file.size < 1 ||
        !(await Sharing.isAvailableAsync())
      ) {
        Alert.alert(
          copy.screen.shareUnavailableTitle,
          copy.screen.shareUnavailableBody
        );
        return;
      }
      await Sharing.shareAsync(file.uri, {
        dialogTitle: copy.screen.share,
        mimeType: rendered.mimeType
      });
    } finally {
      rendered.bytes.fill(0);
      if (file.exists) file.delete();
    }
  };

  const shareExport = async () => {
    if (!cloudExport || !ready || sharing) return;
    setSharing(true);
    setError(null);
    try {
      const result = await cloudExport.download(ready);
      if (!result.ok) {
        setError(exportErrorMessage(result.error.code, language));
        return;
      }
      await shareRendered(result.value);
    } catch {
      Alert.alert(
        copy.screen.shareFailedTitle,
        copy.screen.shareFailedBody
      );
    } finally {
      setSharing(false);
    }
  };

  const expiryLabel =
    ready?.expiresAt
      ? copy.screen.expires(
          new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: "long",
            year: "numeric"
          }).format(new Date(ready.expiresAt))
        )
      : null;

  return (
    <AppScreen testID="cloud-export-screen">
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, rtl && styles.arabicMedium]}>
          {copy.screen.eyebrow}
        </Text>
        <ScreenTitle>{copy.screen.title}</ScreenTitle>
        <BodyText muted>{copy.screen.intro}</BodyText>
      </View>

      {!cloudExport ? (
        <CommandSurface>
          <View style={[styles.noticeHeading, rtl && styles.rowReverse]}>
            <CloudArrowDown color={colors.volt} size={28} />
            <Text
              style={[
                styles.commandTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.screen.previewTitle}
            </Text>
          </View>
          <Text
            style={[
              styles.commandBody,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {copy.screen.previewBody}
          </Text>
          <SecondaryButton
            icon={rtl ? ArrowRight : ArrowLeft}
            label={copy.screen.backToVault}
            onPress={() => router.back()}
          />
        </CommandSurface>
      ) : (
        <>
          <Section>
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.screen.scopeTitle}
            </Text>
            <Text
              style={[
                styles.sectionBody,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {copy.screen.scopeBody}
            </Text>
            <View
              style={[styles.proofBoundary, rtl && styles.rowReverse]}
            >
              <ShieldCheck color={colors.success} size={22} />
              <View style={styles.flex}>
                <Text
                  style={[
                    styles.boundaryTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.textRight
                  ]}
                >
                  {copy.screen.originalsTitle}
                </Text>
                <Text
                  style={[
                    styles.boundaryBody,
                    rtl && styles.arabic,
                    rtl && styles.textRight
                  ]}
                >
                  {copy.screen.originalsBody}
                </Text>
              </View>
            </View>
          </Section>

          <Section>
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.screen.formatTitle}
            </Text>
            <ChoiceRow
              active={format === "json-manifest"}
              description={copy.screen.jsonMeta}
              icon={FileText}
              label={copy.screen.json}
              onPress={() => changeFormat("json-manifest")}
              rtl={rtl}
              testID="export-format-json"
            />
            <ChoiceRow
              active={format === "pdf"}
              description={copy.screen.pdfMeta}
              icon={FilePdf}
              label={copy.screen.pdf}
              onPress={() => changeFormat("pdf")}
              rtl={rtl}
              testID="export-format-pdf"
            />
          </Section>

          <Section>
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.screen.privacyTitle}
            </Text>
            <ChoiceRow
              active={!redacted}
              description={copy.screen.completeMeta}
              icon={ShieldCheck}
              label={copy.screen.complete}
              onPress={() => changeRedaction(false)}
              rtl={rtl}
              testID="export-complete-record"
            />
            <ChoiceRow
              active={redacted}
              description={copy.screen.redactedMeta}
              icon={FileText}
              label={copy.screen.redacted}
              onPress={() => changeRedaction(true)}
              rtl={rtl}
              testID="export-redacted-record"
            />
          </Section>

          {pendingOperationCount > 0 ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.warning}
            >
              <View
                style={[styles.noticeHeading, rtl && styles.rowReverse]}
              >
                <WarningCircle color={colors.warning} size={24} />
                <Text
                  style={[
                    styles.warningTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.textRight
                  ]}
                >
                  {copy.screen.pendingTitle}
                </Text>
              </View>
              <Text
                style={[
                  styles.warningBody,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {copy.screen.pendingBody}
              </Text>
              <SecondaryButton
                disabled={sync.status === "syncing"}
                label={copy.screen.syncNow}
                onPress={() => void syncNow()}
              />
            </View>
          ) : null}

          {error ? (
            <View
              accessibilityLiveRegion="assertive"
              style={styles.error}
              testID="export-error"
            >
              <WarningCircle color={colors.danger} size={24} />
              <View style={styles.flex}>
                <Text
                  style={[
                    styles.errorTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.textRight
                  ]}
                >
                  {copy.screen.errorTitle}
                </Text>
                <Text
                  style={[
                    styles.errorBody,
                    rtl && styles.arabic,
                    rtl && styles.textRight
                  ]}
                >
                  {error}
                </Text>
              </View>
            </View>
          ) : null}

          {ready ? (
            <CommandSurface style={styles.readySurface}>
              <View
                style={[styles.noticeHeading, rtl && styles.rowReverse]}
              >
                <CheckCircle color={colors.volt} size={30} />
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.readyTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.textRight
                  ]}
                >
                  {copy.screen.readyTitle}
                </Text>
              </View>
              <Text
                style={[
                  styles.commandBody,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {copy.screen.readyBody}
              </Text>
              {expiryLabel ? (
                <Text style={styles.expiry}>{expiryLabel}</Text>
              ) : null}
              <PrimaryButton
                icon={CloudArrowDown}
                label={copy.screen.share}
                loading={sharing}
                onPress={() => void shareExport()}
              />
              <SecondaryButton
                label={copy.screen.createAnother}
                onPress={() => {
                  setReady(null);
                  setError(null);
                }}
              />
            </CommandSurface>
          ) : (
            <PrimaryButton
              accessibilityHint={copy.screen.intro}
              disabled={pendingOperationCount > 0}
              icon={CloudArrowDown}
              label={
                creating
                  ? copy.screen.creating
                  : copy.screen.create
              }
              loading={creating}
              onPress={() => void createExport()}
            />
          )}
        </>
      )}
    </AppScreen>
  );
}

function ChoiceRow({
  active,
  description,
  icon: Icon,
  label,
  onPress,
  rtl,
  testID
}: {
  readonly active: boolean;
  readonly description: string;
  readonly icon: Icon;
  readonly label: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        rtl && styles.rowReverse,
        active && styles.choiceActive,
        pressed && styles.pressed
      ]}
      testID={testID}
    >
      <View
        style={[styles.choiceIcon, active && styles.choiceIconActive]}
      >
        <Icon
          color={active ? colors.carbon : colors.textMuted}
          size={22}
        />
      </View>
      <View style={styles.flex}>
        <Text
          style={[
            styles.choiceTitle,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.choiceMeta,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {description}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.radio, active && styles.radioActive]}
      >
        {active ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  textRight: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  flex: {
    flex: 1
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18
  },
  sectionBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 23
  },
  proofBoundary: {
    alignItems: "flex-start",
    backgroundColor: colors.surfaceQuiet,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  boundaryTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15
  },
  boundaryBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xxs
  },
  choice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 82,
    padding: spacing.md
  },
  choiceActive: {
    borderColor: colors.carbon,
    borderWidth: 2,
    padding: spacing.md - 1
  },
  choiceIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceQuiet,
    borderRadius: radius.sm,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  choiceIconActive: {
    backgroundColor: colors.volt
  },
  choiceTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16
  },
  choiceMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xxs
  },
  radio: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  radioActive: {
    borderColor: colors.carbon,
    borderWidth: 2
  },
  radioDot: {
    backgroundColor: colors.carbon,
    borderRadius: radius.round,
    height: 10,
    width: 10
  },
  noticeHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  commandTitle: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.bodyBold,
    fontSize: 19
  },
  commandBody: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 23
  },
  warning: {
    backgroundColor: colors.warningQuiet,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  warningTitle: {
    color: colors.text,
    flex: 1,
    fontFamily: typography.bodyBold,
    fontSize: 16
  },
  warningBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  error: {
    alignItems: "flex-start",
    backgroundColor: colors.dangerQuiet,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  errorTitle: {
    color: colors.danger,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  errorBody: {
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xxs
  },
  readySurface: {
    gap: spacing.md
  },
  readyTitle: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.bodyBold,
    fontSize: 22
  },
  expiry: {
    color: colors.volt,
    fontFamily: typography.bodyMedium,
    fontSize: 13
  },
  pressed: {
    opacity: 0.72
  }
});
