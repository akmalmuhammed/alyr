import { useEffect } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useStartupCopy } from "@/i18n/startupCopy";
import { colors, spacing } from "@/theme/tokens";

export type StartupStatusKind = "application" | "workspace";
export type FontStartupState = "loading" | "fallback" | "ready";

export function resolveFontStartupState(input: {
  readonly arabicError: Error | null;
  readonly arabicLoaded: boolean;
  readonly instrumentError: Error | null;
  readonly instrumentLoaded: boolean;
}): FontStartupState {
  if (input.arabicError || input.instrumentError) return "fallback";
  return input.arabicLoaded && input.instrumentLoaded
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.canvas
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  labelRtl: {
    writingDirection: "rtl"
  }
});
