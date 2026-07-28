import { useRouter } from "expo-router";
import {
  ArrowsClockwise,
  CheckCircle,
  Cloud,
  DeviceMobile,
  WarningCircle
} from "phosphor-react-native";
import { useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import type { SyncConflict } from "@alyr/contracts";

import { LocalizedRouteBack } from "@/components/LocalizedRouteBack";
import {
  AppScreen,
  BodyText,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  StatusPill
} from "@/components/ui";
import {
  conflictFieldLabel,
  conflictManualReviewRoute,
  conflictProvenanceValues,
  conflictRecordLabel,
  conflictResolutionOptions,
  conflictReplacementOperationId,
  syncConflictsVisibleToRole,
  type ConflictResolutionChoice
} from "@/data/conflictInbox";
import type { NativeWorkspace } from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";
import { syncConflictCopy } from "@/i18n/syncConflictCopy";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

function localizedField(
  conflict: SyncConflict,
  language: "en" | "ar",
  canReadLiabilities: boolean,
  workspace: NativeWorkspace
): string {
  const english = conflictFieldLabel(conflict, {
    canReadLiabilities,
    workspace
  });
  if (language === "en") return english;
  const translations: Record<string, string> = {
    "Household access": "صلاحيات الأسرة",
    Ownership: "الملكية",
    Identifier: "المعرّف",
    "Recorded value": "القيمة المسجلة",
    Location: "الموقع",
    "Item name": "اسم الغرض",
    "Item details": "تفاصيل الغرض",
    "Place details": "تفاصيل المكان",
    "Space details": "تفاصيل المساحة",
    Lifecycle: "حالة السجل",
    "Evidence review": "مراجعة الإثبات",
    "Record details": "تفاصيل السجل",
    Record: "السجل"
  };
  return translations[english] ?? english;
}

export default function SyncConflictsScreen() {
  const router = useRouter();
  const { language, rtl } = useLocale();
  const { visibility: valueVisibility } = usePortfolioPrivacy();
  const copy = syncConflictCopy(language);
  const {
    workspace,
    sync,
    can,
    resolveSyncConflict
  } = useWorkspace();
  const [busyOperationId, setBusyOperationId] = useState<string | null>(
    null
  );
  if (!workspace) return null;
  const canReadLiabilities = can("liability.read");
  const visibleConflicts = syncConflictsVisibleToRole(
    sync.conflicts,
    workspace,
    canReadLiabilities
  );

  const runResolution = async (
    conflict: SyncConflict,
    choice: Exclude<ConflictResolutionChoice, "review-manually">
  ) => {
    setBusyOperationId(conflict.operationId);
    try {
      await resolveSyncConflict(conflict.operationId, choice);
      const announcement =
        choice === "keep-cloud"
          ? copy.keepCloud
          : copy.waitingTitle;
      AccessibilityInfo.announceForAccessibility(announcement);
    } catch {
      Alert.alert(
        copy.resolutionFailedTitle,
        copy.resolutionFailedBody
      );
    } finally {
      setBusyOperationId(null);
    }
  };

  const confirmResolution = (
    conflict: SyncConflict,
    choice: Exclude<ConflictResolutionChoice, "review-manually">
  ) => {
    Alert.alert(
      choice === "keep-cloud"
        ? copy.keepCloudConfirmTitle
        : copy.reapplyConfirmTitle,
      choice === "keep-cloud"
        ? copy.keepCloudConfirmBody
        : copy.reapplyConfirmBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text:
            choice === "keep-cloud"
              ? copy.confirmCloud
              : copy.confirmLocal,
          onPress: () => void runResolution(conflict, choice)
        }
      ]
    );
  };

  return (
    <AppScreen testID="sync-conflict-inbox">
      <View style={[styles.topBar, rtl && styles.rowReverse]}>
        <LocalizedRouteBack
          label={copy.back}
          onPress={() => router.back()}
          rtl={rtl}
          testID="sync-conflicts-back"
        />
        <StatusPill
          label={`${visibleConflicts.length} ${copy.difference}`}
          tone={visibleConflicts.length > 0 ? "warning" : "volt"}
        />
      </View>

      <View style={styles.heading}>
        <ScreenTitle>{copy.title}</ScreenTitle>
        <BodyText muted>{copy.intro}</BodyText>
      </View>

      {visibleConflicts.length === 0 ? (
        <View
          accessible
          accessibilityLabel={`${copy.allClearTitle}. ${copy.allClearBody}`}
          style={styles.empty}
        >
          <CheckCircle color={colors.success} size={34} weight="regular" />
          <Text
            style={[
              styles.emptyTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.allClearTitle}
          </Text>
          <Text
            style={[
              styles.emptyBody,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.allClearBody}
          </Text>
          <SecondaryButton
            label={copy.returnToVault}
            onPress={() => router.replace("/vault")}
          />
        </View>
      ) : (
        visibleConflicts.map((conflict) => {
          const options = conflictResolutionOptions(conflict);
          const provenance = conflictProvenanceValues(conflict, {
            canReadLiabilities,
            language,
            visibility: valueVisibility,
            workspace
          });
          const accessibleProvenance = conflictProvenanceValues(conflict, {
            accessibility: true,
            canReadLiabilities,
            language,
            visibility: valueVisibility,
            workspace
          });
          const replacementOperationId =
            conflictReplacementOperationId(conflict);
          const busy = busyOperationId === conflict.operationId;
          const recordLabel = conflictRecordLabel(conflict, workspace, {
            canReadLiabilities
          });
          const field = localizedField(
            conflict,
            language,
            canReadLiabilities,
            workspace
          );
          return (
            <View
              accessibilityLabel={`${recordLabel}. ${field}. ${copy.localSource}: ${accessibleProvenance.local}. ${copy.cloudSource}: ${accessibleProvenance.cloud}.`}
              key={conflict.operationId}
              style={styles.card}
              testID={`sync-conflict-${conflict.operationId}`}
            >
              <View style={[styles.cardHeader, rtl && styles.rowReverse]}>
                <View style={styles.cardHeading}>
                  <Text
                    style={[
                      styles.recordName,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {recordLabel}
                  </Text>
                  <Text
                    style={[
                      styles.field,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {field} · {copy.cloudVersion} {conflict.serverVersion}
                  </Text>
                </View>
                <WarningCircle
                  color={colors.warning}
                  size={24}
                  weight="regular"
                />
              </View>

              <View style={styles.provenance}>
                <View style={[styles.source, rtl && styles.rowReverse]}>
                  <View style={styles.sourceIcon}>
                    <DeviceMobile
                      color={colors.text}
                      size={20}
                      weight="regular"
                    />
                  </View>
                  <View style={styles.sourceCopy}>
                    <Text
                      style={[
                        styles.sourceLabel,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.localSource}
                    </Text>
                    <Text
                      style={[
                        styles.sourceMeta,
                        rtl && styles.arabic,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.localSourceDetail}
                    </Text>
                    <Text
                      selectable
                      style={[
                        styles.sourceValue,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {provenance.local}
                    </Text>
                  </View>
                </View>
                <View style={[styles.source, rtl && styles.rowReverse]}>
                  <View style={styles.sourceIcon}>
                    <Cloud
                      color={colors.information}
                      size={20}
                      weight="regular"
                    />
                  </View>
                  <View style={styles.sourceCopy}>
                    <Text
                      style={[
                        styles.sourceLabel,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.cloudSource}
                    </Text>
                    <Text
                      style={[
                        styles.sourceMeta,
                        rtl && styles.arabic,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.cloudSourceDetail}
                    </Text>
                    <Text
                      selectable
                      style={[
                        styles.sourceValue,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {provenance.cloud}
                    </Text>
                  </View>
                </View>
              </View>

              {!provenance.cloudVerified ? (
                <Text
                  style={[
                    styles.notice,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.cloudUnavailable}
                </Text>
              ) : null}
              {conflict.conflictKind === "permission" ? (
                <Text
                  style={[
                    styles.notice,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.permissionDetail}
                </Text>
              ) : null}
              {replacementOperationId ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={[styles.waiting, rtl && styles.rowReverse]}
                >
                  <ArrowsClockwise
                    color={colors.information}
                    size={20}
                    weight="regular"
                  />
                  <View style={styles.waitingCopy}>
                    <Text
                      style={[
                        styles.waitingTitle,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.waitingTitle}
                    </Text>
                    <Text
                      style={[
                        styles.waitingBody,
                        rtl && styles.arabic,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.waitingBody}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  {options.includes("reapply-local") ? (
                    <PrimaryButton
                      disabled={busy}
                      label={copy.reapplyLocal}
                      loading={busy}
                      onPress={() =>
                        confirmResolution(conflict, "reapply-local")
                      }
                    />
                  ) : null}
                  {options.includes("keep-cloud") ? (
                    <SecondaryButton
                      disabled={busy}
                      label={copy.keepCloud}
                      onPress={() =>
                        confirmResolution(conflict, "keep-cloud")
                      }
                    />
                  ) : null}
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    conflictManualReviewRoute(conflict, workspace, {
                      canReadLiabilities
                    })
                  )
                }
                style={({ pressed }) => [
                  styles.manual,
                  pressed && styles.pressed
                ]}
              >
                <Text
                  style={[
                    styles.manualLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.reviewManually}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      {visibleConflicts.length > 0 ? (
        <Text
          style={[
            styles.provenanceHint,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.provenanceHint}
        </Text>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: "row-reverse" },
  topBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  heading: { gap: spacing.xs },
  empty: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  emptyBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  cardHeading: { minWidth: 0, flex: 1, gap: 2 },
  recordName: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  field: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"]
  },
  provenance: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md
  },
  source: {
    minHeight: 94,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  sourceIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceQuiet
  },
  sourceCopy: { minWidth: 0, flex: 1, gap: 1 },
  sourceLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  sourceMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  sourceValue: {
    marginTop: spacing.xs,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    fontVariant: ["tabular-nums"]
  },
  notice: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  waiting: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  waitingCopy: { minWidth: 0, flex: 1, gap: 2 },
  waitingTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  waitingBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  actions: { gap: spacing.sm },
  manual: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  manualLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    textDecorationLine: "underline"
  },
  provenanceHint: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  pressed: { opacity: 0.62 },
  arabic: { fontFamily: typography.arabic },
  arabicMedium: { fontFamily: typography.arabicMedium },
  rtlText: { textAlign: "right", writingDirection: "rtl" }
});
