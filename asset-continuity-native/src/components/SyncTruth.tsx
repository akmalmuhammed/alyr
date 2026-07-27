import {
  ArrowsClockwise,
  CloudCheck,
  CloudSlash,
  DeviceMobile,
  WarningCircle
} from "phosphor-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatLocalizedNumber } from "@/i18n/coreJourneyCopy";
import type { WorkspaceSyncRuntimeState } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

type Language = "en" | "ar";

export function queuedSyncChangeSummary(
  pendingOperationCount: number,
  language: Language
): string {
  const count = formatLocalizedNumber(pendingOperationCount, language);
  if (language === "en") {
    return `${count} ${
      pendingOperationCount === 1 ? "change" : "changes"
    } safely queued for cloud acknowledgement`;
  }
  if (pendingOperationCount === 0) {
    return "لا توجد تغييرات محلية بانتظار تأكيد السحابة";
  }
  if (pendingOperationCount === 1) {
    return "تغيير واحد محفوظ بأمان وينتظر تأكيد السحابة";
  }
  if (pendingOperationCount === 2) {
    return "تغييران محفوظان بأمان وينتظران تأكيد السحابة";
  }
  return `${count} تغييرات محفوظة بأمان وتنتظر تأكيد السحابة`;
}

function presentation(
  sync: WorkspaceSyncRuntimeState,
  pendingOperationCount: number,
  language: Language
) {
  const ar = language === "ar";
  if (sync.conflicts.length > 0) {
    const count = formatLocalizedNumber(sync.conflicts.length, language);
    return {
      icon: WarningCircle,
      color: colors.danger,
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
      color: colors.warning,
      title: ar ? "محفوظ على هذا الجهاز" : "Saved on this device",
      detail: ar
        ? "معاينة محلية فقط · غير محمي سحابيًا"
        : "Local preview only · not protected in cloud"
    };
  }
  if (sync.status === "needs-attention") {
    return {
      icon: WarningCircle,
      color: colors.danger,
      title: ar ? "تحتاج المزامنة إلى مراجعة" : "Sync needs review",
      detail: ar
        ? "السجل المحلي محفوظ. افتح الخزنة لمراجعة حالة الاتصال."
        : "Your local record is preserved. Open Vault to review sync status."
    };
  }
  if (sync.status === "syncing" || pendingOperationCount > 0) {
    return {
      icon: ArrowsClockwise,
      color: colors.information,
      title: ar ? "جارٍ التأكيد" : "Awaiting cloud",
      detail: queuedSyncChangeSummary(
        pendingOperationCount,
        language
      )
    };
  }
  if (sync.status === "offline") {
    return {
      icon: CloudSlash,
      color: colors.warning,
      title: ar ? "محفوظ على الجهاز" : "Saved on device",
      detail: ar
        ? "ستُستأنف المزامنة عند عودة الاتصال"
        : "Sync resumes when the connection returns"
    };
  }
  if (sync.lastSyncedAt) {
    return {
      icon: CloudCheck,
      color: colors.success,
      title: ar ? "محمي في السحابة" : "Protected in cloud",
      detail: ar
        ? "أكدت السحابة أحدث التغييرات المحلية"
        : "Cloud acknowledged the latest local changes"
    };
  }
  return {
    icon: CloudCheck,
    color: colors.information,
    title: ar ? "السجل السحابي متصل" : "Cloud register connected",
    detail: ar
      ? "لا توجد تغييرات محلية بانتظار المزامنة"
      : "No local changes are waiting to sync"
  };
}

export function SyncTruth({
  language,
  onPress,
  pendingOperationCount,
  sync
}: {
  readonly language: Language;
  readonly onPress?: (() => void) | undefined;
  readonly pendingOperationCount: number;
  readonly sync: WorkspaceSyncRuntimeState;
}) {
  const rtl = language === "ar";
  const state = presentation(sync, pendingOperationCount, language);
  const Icon = state.icon;
  const content = (
    <>
      <View style={styles.icon}>
        <Icon color={state.color} size={21} weight="regular" />
      </View>
      <View style={styles.copy}>
        <Text
          style={[
            styles.title,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {state.title}
        </Text>
        <Text
          style={[
            styles.detail,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {state.detail}
        </Text>
      </View>
    </>
  );
  const rowStyle = [styles.row, rtl && styles.rowReverse];
  return onPress ? (
    <Pressable
      accessibilityHint={
        language === "ar"
          ? "يفتح حالة المزامنة وخيارات مراجعة الاختلافات"
          : "Opens sync status and recovery options"
      }
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        ...rowStyle,
        pressed && styles.pressed
      ]}
      testID="sync-truth"
    >
      {content}
    </Pressable>
  ) : (
    <View
      accessible
      accessibilityLabel={`${state.title}. ${state.detail}`}
      style={rowStyle}
      testID="sync-truth"
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.surfaceQuiet
  },
  copy: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  detail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  pressed: {
    opacity: 0.64
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
