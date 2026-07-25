import { ShieldCheck } from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  View
} from "react-native";

import { colors, typography } from "@/theme/tokens";

export function PrivacyShield() {
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  if (appState === "active") {
    return null;
  }

  return (
    <View
      accessibilityLabel="ALYR is locked while the app is not active"
      accessibilityRole="summary"
      importantForAccessibility="yes"
      style={styles.overlay}
    >
      <View style={styles.mark}>
        <ShieldCheck color={colors.volt} size={34} weight="duotone" />
      </View>
      <Text style={styles.brand}>ALYR</Text>
      <Text style={styles.message}>Private while you are away</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10_000,
    elevation: 10_000,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.canvas
  },
  mark: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface
  },
  brand: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 24,
    letterSpacing: 6
  },
  message: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14
  }
});
