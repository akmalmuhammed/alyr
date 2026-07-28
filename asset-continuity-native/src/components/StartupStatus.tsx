import { useEffect } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";

import { BrandMark } from "@/components/ui";
import { useStartupCopy } from "@/i18n/startupCopy";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

export type StartupStatusKind = "application" | "workspace";
export type FontStartupState = "loading" | "fallback" | "ready";

export function resolveFontStartupState(input: {
  readonly arabicError: Error | null;
  readonly arabicLoaded: boolean;
  readonly instrumentError: Error | null;
  readonly instrumentLoaded: boolean;
  readonly monoError: Error | null;
  readonly monoLoaded: boolean;
}): FontStartupState {
  if (input.arabicError || input.instrumentError || input.monoError) {
    return "fallback";
  }
  return input.arabicLoaded &&
    input.instrumentLoaded &&
    input.monoLoaded
    ? "ready"
    : "loading";
}

export function StartupStatus({
  kind,
  testID
}: {
  readonly kind: StartupStatusKind;
  readonly testID: string;
}) {
  const { copy, rtl } = useStartupCopy();
  const label = copy[kind];

  useEffect(() => {
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(label);
    }
  }, [label]);

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={styles.root}
      testID={testID}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.brandFrame}
        testID="startup-brand"
      >
        <BrandMark compact />
      </View>
      <View
        accessible={false}
        style={styles.statusLine}
      >
        <ActivityIndicator
          accessible={false}
          color={colors.action}
          importantForAccessibility="no"
          size="small"
        />
        <Text
          accessible={false}
          importantForAccessibility="no"
          style={[
            styles.label,
            rtl && styles.labelRtl
          ]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    backgroundColor: colors.canvas
  },
  brandFrame: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  statusLine: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  label: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  labelRtl: {
    writingDirection: "rtl"
  }
});
