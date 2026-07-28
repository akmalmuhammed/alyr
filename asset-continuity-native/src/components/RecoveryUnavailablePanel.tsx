import { LockKey, Warning } from "phosphor-react-native";
import { StyleSheet, Text, View } from "react-native";

import { CommandSurface } from "@/components/ui";
import {
  getRecoveryUnavailableCopy,
  useSecondarySurfaceCopy
} from "@/i18n/secondarySurfaceCopy";
import type { RecoveryCapability } from "@/recovery";
import { colors, spacing, typography } from "@/theme/tokens";

export function RecoveryUnavailablePanel({
  capability
}: {
  readonly capability: Extract<
    RecoveryCapability,
    { readonly kind: "unavailable" }
  >;
}) {
  const { language, rtl } = useSecondarySurfaceCopy();
  const copy = getRecoveryUnavailableCopy(capability.reason, language);
  return (
    <CommandSurface>
      <View style={[styles.titleRow, rtl && styles.rowReverse]}>
        <View style={styles.iconFrame}>
          <LockKey color={colors.volt} size={26} weight="regular" />
        </View>
        <View style={styles.titleCopy}>
          <Text
            style={[
              styles.eyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.eyebrow}
          </Text>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.title}
          </Text>
        </View>
      </View>
      <Text
        style={[
          styles.body,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {copy.description}
      </Text>
      <View style={[styles.notice, rtl && styles.rowReverse]}>
        <Warning color={colors.warning} size={20} weight="regular" />
        <Text
          style={[
            styles.noticeText,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.nextStep}
        </Text>
      </View>
    </CommandSurface>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  iconFrame: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8
  },
  titleCopy: {
    flex: 1,
    gap: 2
  },
  eyebrow: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 1
  },
  title: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 21,
    lineHeight: 27
  },
  body: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong
  },
  noticeText: {
    flex: 1,
    color: colors.concrete,
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
  }
});
