import { ShieldCheck } from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useLocale } from "@/i18n/LocaleProvider";
import { BrandMark } from "@/components/ui";
import { colors, typography } from "@/theme/tokens";

export const PRIVACY_SHIELD_COPY = {
  en: {
    accessibilityLabel: "ALYR is locked while the app is not active",
    message: "Private while you are away"
  },
  ar: {
    accessibilityLabel: "تطبيق ALYR مقفل أثناء عدم استخدامه",
    message: "خصوصيتك محفوظة أثناء ابتعادك"
  }
} as const;

export function usePrivacyShielded() {
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  return appState !== "active";
}

export function PrivacyShield({
  visible
}: {
  readonly visible: boolean;
}) {
  const { language, rtl } = useLocale();
  const copy = PRIVACY_SHIELD_COPY[language];

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityLabel={copy.accessibilityLabel}
      accessibilityRole="summary"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={styles.overlay}
    >
      <View style={styles.mark}>
        <BrandMark compact reversed />
      </View>
      <ShieldCheck color={colors.text} size={22} weight="regular" />
      <Text
        style={[
          styles.message,
          rtl && styles.messageArabic,
          rtl && styles.rtlText
        ]}
      >
        {copy.message}
      </Text>
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
    borderRadius: 16,
    backgroundColor: colors.carbon
  },
  message: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14
  },
  messageArabic: {
    fontFamily: typography.arabic
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
