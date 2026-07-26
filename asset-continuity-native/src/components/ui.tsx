import { LinearGradient } from "expo-linear-gradient";
import type { Icon } from "phosphor-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useCopy } from "@/i18n/copy";
import { isExpoGoPreview } from "@/runtime/environment";
import {
  colors,
  gradients,
  radius,
  shadows,
  spacing,
  typography
} from "@/theme/tokens";

export function AppScreen({
  children,
  scroll = true,
  contentStyle,
  testID
}: PropsWithChildren<{
  readonly scroll?: boolean;
  readonly contentStyle?: ViewStyle;
  readonly testID?: string;
}>) {
  const { rtl } = useCopy();
  const content = (
    <View
      style={[
        styles.screenContent,
        rtl && styles.rtlContent,
        contentStyle
      ]}
    >
      {children}
    </View>
  );
  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.safeArea}
      testID={testID}
    >
      {isExpoGoPreview ? (
        <View
          accessibilityLabel="iPhone preview. Data resets when this Expo Go session closes."
          accessibilityRole="summary"
          style={styles.previewBanner}
        >
          <View style={styles.previewDot} />
          <Text style={styles.previewBannerText}>
            IPHONE PREVIEW · SESSION ONLY
          </Text>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function BrandMark({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Image
      accessibilityLabel="ALYR"
      resizeMode="contain"
      source={
        compact
          ? require("../../assets/alyr/logos/png-exports/standalone-symbol-reversed-256w.png")
          : require("../../assets/alyr/logos/png-exports/primary-horizontal-reversed-480w.png")
      }
      style={compact ? styles.brandCompact : styles.brand}
    />
  );
}

export function Eyebrow({
  children,
  tone = "violet"
}: PropsWithChildren<{ readonly tone?: "violet" | "cyan" | "volt" }>) {
  const { rtl } = useCopy();
  return (
    <Text
      style={[
        styles.eyebrow,
        rtl && styles.arabicMedium,
        tone === "cyan" && styles.eyebrowCyan,
        tone === "volt" && styles.eyebrowVolt
      ]}
    >
      {children}
    </Text>
  );
}

export function ScreenTitle({
  children,
  size = "large",
  style
}: PropsWithChildren<{
  readonly size?: "large" | "medium";
  readonly style?: TextStyle;
}>) {
  const { rtl } = useCopy();
  return (
    <Text
      accessibilityRole="header"
      style={[
        styles.title,
        size === "medium" && styles.titleMedium,
        rtl && styles.arabicMedium,
        style
      ]}
    >
      {children}
    </Text>
  );
}

export function BodyText({
  children,
  muted = false,
  style
}: PropsWithChildren<{
  readonly muted?: boolean;
  readonly style?: TextStyle;
}>) {
  const { rtl } = useCopy();
  return (
    <Text
      style={[
        styles.body,
        muted && styles.bodyMuted,
        rtl && styles.arabic,
        style
      ]}
    >
      {children}
    </Text>
  );
}

export function Surface({
  children,
  style,
  emphasis = false
}: PropsWithChildren<{
  readonly style?: ViewStyle;
  readonly emphasis?: boolean;
}>) {
  return (
    <View
      style={[
        styles.surface,
        emphasis && styles.surfaceEmphasis,
        style
      ]}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon: IconComponent,
  disabled = false,
  loading = false,
  accessibilityHint
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: Icon;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly accessibilityHint?: string;
}) {
  const { rtl } = useCopy();
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButtonOuter,
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled
      ]}
    >
      <LinearGradient
        colors={gradients.primary}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={[styles.primaryButton, rtl && styles.rowReverse]}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : IconComponent ? (
          <IconComponent color={colors.text} size={22} weight="regular" />
        ) : null}
        <Text style={[styles.primaryButtonLabel, rtl && styles.arabicMedium]}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon: IconComponent,
  disabled = false,
  destructive = false
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: Icon;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  const { rtl } = useCopy();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        rtl && styles.rowReverse,
        destructive && styles.destructiveButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled
      ]}
    >
      {IconComponent ? (
        <IconComponent
          color={destructive ? colors.danger : colors.text}
          size={20}
          weight="regular"
        />
      ) : null}
      <Text
        style={[
          styles.secondaryButtonLabel,
          destructive && styles.destructiveText,
          rtl && styles.arabicMedium
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  label,
  icon: IconComponent,
  onPress,
  active = false
}: {
  readonly label: string;
  readonly icon: Icon;
  readonly onPress: () => void;
  readonly active?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        active && styles.iconButtonActive,
        pressed && styles.buttonPressed
      ]}
    >
      <IconComponent
        color={active ? colors.cyan : colors.text}
        size={22}
        weight="regular"
      />
    </Pressable>
  );
}

export function SectionHeader({
  title,
  action
}: {
  readonly title: string;
  readonly action?: ReactNode;
}) {
  const { rtl } = useCopy();
  return (
    <View style={[styles.sectionHeader, rtl && styles.rowReverse]}>
      <Text style={[styles.sectionTitle, rtl && styles.arabicMedium]}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function ProgressBar({
  percent,
  label
}: {
  readonly percent: number;
  readonly label?: string;
}) {
  const normalized = Math.max(0, Math.min(percent, 100));
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: normalized }}
      style={styles.progressTrack}
    >
      <LinearGradient
        colors={gradients.progress}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={[styles.progressFill, { width: `${normalized}%` }]}
      />
    </View>
  );
}

export function StatusPill({
  label,
  tone = "neutral"
}: {
  readonly label: string;
  readonly tone?: "neutral" | "cyan" | "violet" | "volt" | "warning";
}) {
  const { rtl } = useCopy();
  return (
    <View
      style={[
        styles.pill,
        tone === "cyan" && styles.pillCyan,
        tone === "violet" && styles.pillViolet,
        tone === "volt" && styles.pillVolt,
        tone === "warning" && styles.pillWarning
      ]}
    >
      <View
        style={[
          styles.pillDot,
          tone === "cyan" && styles.dotCyan,
          tone === "violet" && styles.dotViolet,
          tone === "volt" && styles.dotVolt,
          tone === "warning" && styles.dotWarning
        ]}
      />
      <Text style={[styles.pillLabel, rtl && styles.arabic]}>{label}</Text>
    </View>
  );
}

export function Field({
  label,
  description,
  error,
  ...props
}: TextInputProps & {
  readonly label: string;
  readonly description?: string;
  readonly error?: string | null;
}) {
  const { rtl } = useCopy();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, rtl && styles.arabicMedium]}>
        {label}
      </Text>
      {description ? (
        <Text style={[styles.fieldDescription, rtl && styles.arabic]}>
          {description}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.cyan}
        style={[
          styles.field,
          error && styles.fieldError,
          rtl && styles.arabic,
          rtl && styles.textRight
        ]}
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorBanner({
  message,
  onDismiss
}: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  return (
    <Pressable
      accessibilityHint="Dismiss this message"
      accessibilityRole="button"
      onPress={onDismiss}
      style={styles.errorBanner}
    >
      <Text style={styles.errorBannerText}>{message}</Text>
    </Pressable>
  );
}

export const uiStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  gapXs: { gap: spacing.xs },
  gapSm: { gap: spacing.sm },
  gapMd: { gap: spacing.md },
  flex: { flex: 1 },
  textRight: { textAlign: "right" },
  center: { alignItems: "center", justifyContent: "center" }
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  previewBanner: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(183, 243, 74, 0.2)",
    backgroundColor: colors.surface
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  previewBannerText: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.1
  },
  scrollContent: {
    flexGrow: 1
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 128,
    gap: spacing.xl,
    backgroundColor: colors.canvas
  },
  rtlContent: {
    direction: "rtl"
  },
  brand: {
    width: 128,
    height: 40
  },
  brandCompact: {
    width: 34,
    height: 34
  },
  eyebrow: {
    color: colors.violetSoft,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    letterSpacing: 1.5,
    lineHeight: 18,
    textTransform: "uppercase"
  },
  eyebrowCyan: {
    color: colors.cyan
  },
  eyebrowVolt: {
    color: colors.volt
  },
  title: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1
  },
  titleMedium: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5
  },
  body: {
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24
  },
  bodyMuted: {
    color: colors.textMuted
  },
  surface: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  surfaceEmphasis: {
    borderColor: "rgba(139, 92, 246, 0.52)",
    backgroundColor: colors.surfaceRaised
  },
  primaryButtonOuter: {
    minHeight: 54,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadows.floating
  },
  primaryButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md
  },
  primaryButtonLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16
  },
  secondaryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15
  },
  destructiveButton: {
    borderColor: "rgba(255, 126, 132, 0.32)",
    backgroundColor: colors.dangerQuiet
  },
  destructiveText: {
    color: colors.danger
  },
  iconButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    backgroundColor: colors.surface
  },
  iconButtonActive: {
    borderColor: "rgba(74, 216, 245, 0.48)",
    backgroundColor: colors.cyanQuiet
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }]
  },
  buttonDisabled: {
    opacity: 0.45
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 28
  },
  progressTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: "rgba(151, 165, 188, 0.18)"
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.round
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 30,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    backgroundColor: "rgba(154, 167, 188, 0.07)"
  },
  pillCyan: {
    borderColor: "rgba(74, 216, 245, 0.3)",
    backgroundColor: colors.cyanQuiet
  },
  pillViolet: {
    borderColor: "rgba(139, 92, 246, 0.32)",
    backgroundColor: colors.violetQuiet
  },
  pillVolt: {
    borderColor: "rgba(183, 243, 74, 0.3)",
    backgroundColor: colors.voltQuiet
  },
  pillWarning: {
    borderColor: "rgba(242, 179, 93, 0.3)",
    backgroundColor: colors.warningQuiet
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: radius.round,
    backgroundColor: colors.textMuted
  },
  dotCyan: { backgroundColor: colors.cyan },
  dotViolet: { backgroundColor: colors.violetSoft },
  dotVolt: { backgroundColor: colors.volt },
  dotWarning: { backgroundColor: colors.warning },
  pillLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18
  },
  fieldGroup: {
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  fieldDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  field: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surfaceQuiet,
    fontFamily: typography.body,
    fontSize: 16
  },
  fieldError: {
    borderColor: colors.danger
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  errorBanner: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 126, 132, 0.32)",
    borderRadius: radius.md,
    backgroundColor: colors.dangerQuiet
  },
  errorBannerText: {
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  textRight: {
    textAlign: "right"
  }
});
