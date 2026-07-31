import { StatusBar } from "expo-status-bar";
import {
  LockKey,
  ShieldCheck,
  WarningCircle
} from "phosphor-react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandMark, PrimaryButton } from "@/components/ui";
import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

import { deviceAuthCopy } from "./copy";
import { useDeviceAuth } from "./DeviceAuthProvider";

export function DeviceUnlockScreen() {
  const {
    onboardingHandoffRestoreState,
    retryCapability,
    retryOnboardingHandoffRestore,
    state,
    unlock
  } = useDeviceAuth();
  const { busy: authBusy, signOut } = useAuthFlow();
  const { language, rtl } = useLocale();
  const copy = deviceAuthCopy(language, state.capability);
  const restoringHandoff =
    onboardingHandoffRestoreState === "loading";
  const handoffRestoreFailed =
    onboardingHandoffRestoreState === "error";
  const checking =
    restoringHandoff ||
    (!handoffRestoreFailed && state.phase === "checking");
  const unavailable =
    !handoffRestoreFailed && state.phase === "unavailable";
  const unlocking = state.phase === "unlocking";
  const title = restoringHandoff
    ? copy.restoreCheckingTitle
    : handoffRestoreFailed
      ? copy.restoreFailedTitle
      : checking
        ? copy.checkingTitle
        : unavailable
          ? copy.unavailableTitle
          : copy.unlockTitle;
  const body = restoringHandoff
    ? copy.restoreCheckingBody
    : handoffRestoreFailed
      ? copy.restoreFailedBody
      : checking
        ? copy.checkingBody
        : unavailable
          ? copy.unavailableBody
          : copy.unlockBody;

  return (
    <SafeAreaView
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={styles.safeArea}
      testID="device-auth-lock-screen"
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, rtl && styles.rowReverse]}>
          <BrandMark reversed />
          <View style={[styles.status, rtl && styles.rowReverse]}>
            <View style={styles.statusDot} />
            <Text
              style={[
                styles.statusText,
                rtl && styles.arabicMedium
              ]}
            >
              {language === "ar" ? "مقفل" : "LOCKED"}
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.iconFrame}>
            {checking ? (
              <ActivityIndicator color={colors.volt} size="small" />
            ) : unavailable || handoffRestoreFailed ? (
              <WarningCircle
                color={colors.warning}
                size={34}
                weight="regular"
              />
            ) : (
              <LockKey
                color={colors.volt}
                size={34}
                weight="regular"
              />
            )}
          </View>
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
            {title}
          </Text>
          <Text
            style={[
              styles.body,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {body}
          </Text>
          {state.notice ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.notice,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.notices[state.notice]}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          {!checking ? (
            <PrimaryButton
              accessibilityHint={
                handoffRestoreFailed
                  ? copy.retryRestoreHint
                  : unavailable
                    ? copy.retryHint
                    : copy.unlockHint
              }
              icon={
                unavailable || handoffRestoreFailed
                  ? ShieldCheck
                  : LockKey
              }
              label={
                handoffRestoreFailed
                  ? copy.retryRestoreAction
                  : unavailable
                    ? copy.retryAction
                    : copy.unlockAction
              }
              loading={unlocking}
              onPress={() =>
                handoffRestoreFailed
                  ? retryOnboardingHandoffRestore()
                  : unavailable
                    ? retryCapability()
                    : void unlock()
              }
            />
          ) : null}
          {!checking ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: authBusy, busy: authBusy }}
              disabled={authBusy}
              onPress={() => void signOut()}
              style={({ pressed }) => [
                styles.signOut,
                pressed && styles.pressed,
                authBusy && styles.disabled
              ]}
            >
              <Text
                style={[
                  styles.signOutText,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.signOutAction}
              </Text>
            </Pressable>
          ) : null}
          <Text
            style={[
              styles.localOnly,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {language === "ar"
              ? "يتم التحقق بواسطة نظام الجهاز. لا يحتفظ Heldat ببصمتك أو رمز الدخول."
              : "Verification stays with the device. Heldat stores neither your biometrics nor your passcode."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.carbon
  },
  content: {
    flexGrow: 1,
    minHeight: "100%",
    justifyContent: "space-between",
    gap: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.carbon
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  status: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.onCarbonBorder,
    borderRadius: radius.round
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  statusText: {
    color: colors.concrete,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.2
  },
  hero: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: spacing.md
  },
  iconFrame: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.voltBorder,
    borderRadius: radius.xl,
    backgroundColor: colors.onCarbonSurface
  },
  eyebrow: {
    color: colors.volt,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1.7
  },
  title: {
    maxWidth: 460,
    color: colors.white,
    fontFamily: typography.displayBold,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -1
  },
  body: {
    maxWidth: 460,
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 17,
    lineHeight: 26
  },
  notice: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.volt,
    color: colors.white,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  footer: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: spacing.md
  },
  localOnly: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  signOut: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  signOutText: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  pressed: {
    opacity: 0.68
  },
  disabled: {
    opacity: 0.42
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  rtlText: {
    alignSelf: "stretch",
    textAlign: "right",
    writingDirection: "rtl"
  }
});
