import type { Icon } from "phosphor-react-native";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type PropsWithChildren,
  type ReactNode,
  type RefObject
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import {
  SafeAreaView,
  type Edge,
  useSafeAreaInsets
} from "react-native-safe-area-context";

import { useCopy } from "@/i18n/copy";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

export function AppScreen({
  children,
  scroll = true,
  contentStyle,
  footer,
  safeEdges = ["top"],
  scrollRef,
  testID
}: PropsWithChildren<{
  readonly scroll?: boolean;
  readonly contentStyle?: ViewStyle;
  readonly footer?: ReactNode;
  readonly safeEdges?: Edge[];
  readonly scrollRef?: RefObject<ScrollView | null>;
  readonly testID?: string;
}>) {
  const insets = useSafeAreaInsets();
  const content = (
    <View
      style={[
        styles.screenContent,
        contentStyle
      ]}
    >
      {children}
    </View>
  );
  const body = (
    <>
      {scroll ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg }
          ]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) }
          ]}
        >
          {footer}
        </View>
      ) : null}
    </>
  );
  return (
    <SafeAreaView
      edges={safeEdges}
      style={styles.safeArea}
      testID={testID}
    >
      {footer ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardBody}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export function BrandMark({
  compact = false,
  reversed = false
}: {
  readonly compact?: boolean;
  readonly reversed?: boolean;
}) {
  return (
    <Image
      accessibilityLabel="ALYR"
      resizeMode="contain"
      source={
        compact
          ? reversed
            ? require("../../assets/alyr/logos/png-exports/standalone-symbol-reversed-256w.png")
            : require("../../assets/alyr/logos/png-exports/standalone-symbol-carbon-volt-256w.png")
          : reversed
            ? require("../../assets/alyr/logos/png-exports/primary-horizontal-reversed-480w.png")
            : require("../../assets/alyr/logos/png-exports/primary-horizontal-carbon-volt-480w.png")
      }
      style={compact ? styles.brandCompact : styles.brand}
    />
  );
}

export function Eyebrow({
  children,
  tone = "neutral"
}: PropsWithChildren<{
  readonly tone?: "neutral" | "information" | "volt";
}>) {
  const { rtl } = useCopy();
  return (
    <Text
      style={[
        styles.eyebrow,
        rtl && styles.arabicMedium,
        rtl && styles.textRight,
        tone === "information" && styles.eyebrowInformation,
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
        rtl && styles.textRight,
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
        rtl && styles.textRight,
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

export function Section({
  children,
  style
}: PropsWithChildren<{ readonly style?: ViewStyle }>) {
  return <View style={[styles.section, style]}>{children}</View>;
}

export function Panel({
  children,
  style
}: PropsWithChildren<{ readonly style?: ViewStyle }>) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function CommandSurface({
  children,
  style
}: PropsWithChildren<{ readonly style?: ViewStyle }>) {
  return <View style={[styles.commandSurface, style]}>{children}</View>;
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
      <View style={[styles.primaryButton, rtl && styles.rowReverse]}>
        {loading ? (
          <ActivityIndicator color={colors.carbon} size="small" />
        ) : IconComponent ? (
          <IconComponent color={colors.carbon} size={22} weight="regular" />
        ) : null}
        <Text style={[styles.primaryButtonLabel, rtl && styles.arabicMedium]}>
          {label}
        </Text>
      </View>
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
        color={active ? colors.carbon : colors.text}
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
      <Text
        accessibilityRole="header"
        style={[
          styles.sectionTitle,
          rtl && styles.arabicMedium,
          rtl && styles.textRight
        ]}
      >
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
  const { rtl } = useCopy();
  const normalized = Math.max(0, Math.min(percent, 100));
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: normalized }}
      style={styles.progressTrack}
    >
      <View
        style={[
          styles.progressFill,
          rtl && styles.progressFillRtl,
          { width: `${normalized}%` }
        ]}
      />
    </View>
  );
}

export function StatusPill({
  label,
  tone = "neutral"
}: {
  readonly label: string;
  readonly tone?: "neutral" | "information" | "volt" | "warning";
}) {
  const { rtl } = useCopy();
  return (
    <View
      style={[
        styles.pill,
        rtl && styles.rowReverse,
        tone === "information" && styles.pillInformation,
        tone === "volt" && styles.pillVolt,
        tone === "warning" && styles.pillWarning
      ]}
    >
      <View
        style={[
          styles.pillDot,
          tone === "information" && styles.dotInformation,
          tone === "volt" && styles.dotVolt,
          tone === "warning" && styles.dotWarning
        ]}
      />
      <Text style={[styles.pillLabel, rtl && styles.arabic]}>{label}</Text>
    </View>
  );
}

type FieldProps = TextInputProps & {
  readonly label: string;
  readonly description?: string;
  readonly error?: string | null;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  {
    label,
    description,
    error,
    accessibilityHint,
    accessibilityLabel,
    style: inputStyle,
    ...props
  },
  ref
) {
  const { rtl } = useCopy();
  const fieldId = useId();
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const effectiveHint = [accessibilityHint, description, error]
    .filter(Boolean)
    .join(" ");
  return (
    <View style={styles.fieldGroup}>
      <Text
        style={[
          styles.fieldLabel,
          rtl && styles.arabicMedium,
          rtl && styles.textRight
        ]}
      >
        {label}
      </Text>
      {description ? (
        <Text
          nativeID={descriptionId}
          style={[
            styles.fieldDescription,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {description}
        </Text>
      ) : null}
      <TextInput
        {...props}
        accessibilityHint={effectiveHint || undefined}
        accessibilityLabel={accessibilityLabel ?? label}
        aria-describedby={error ? errorId : description ? descriptionId : undefined}
        aria-invalid={Boolean(error)}
        placeholderTextColor={colors.textFaint}
        ref={ref}
        selectionColor={colors.action}
        style={[
          styles.field,
          error && styles.fieldError,
          rtl && styles.arabic,
          rtl && styles.textRight,
          inputStyle
        ]}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          nativeID={errorId}
          style={[
            styles.errorText,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});

export function ErrorBanner({
  message,
  onDismiss
}: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  const { language, rtl } = useCopy();
  const lastAnnouncedMessage = useRef<string | null>(null);

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      lastAnnouncedMessage.current === message
    ) {
      return;
    }
    lastAnnouncedMessage.current = message;
    AccessibilityInfo.announceForAccessibility(
      language === "ar" ? `خطأ. ${message}` : `Error. ${message}`
    );
  }, [language, message]);

  return (
    <View style={[styles.errorBanner, rtl && styles.rowReverse]}>
      <Text
        accessibilityRole="alert"
        {...(Platform.OS === "android"
          ? { accessibilityLiveRegion: "assertive" as const }
          : {})}
        style={[
          styles.errorBannerText,
          rtl && styles.arabic,
          rtl && styles.textRight
        ]}
      >
        {message}
      </Text>
      <Pressable
        accessibilityLabel={
          language === "ar" ? "إخفاء الرسالة" : "Dismiss message"
        }
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.errorDismiss,
          pressed && styles.buttonPressed
        ]}
      >
        <Text
          style={[
            styles.errorDismissText,
            rtl && styles.arabicMedium
          ]}
        >
          {language === "ar" ? "إخفاء" : "Dismiss"}
        </Text>
      </Pressable>
    </View>
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
  textRight: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  center: { alignItems: "center", justifyContent: "center" }
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  keyboardBody: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    gap: 28,
    backgroundColor: colors.canvas
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.canvas
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
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    letterSpacing: 1.5,
    lineHeight: 18,
    textTransform: "uppercase"
  },
  eyebrowInformation: {
    color: colors.information
  },
  eyebrowVolt: {
    color: colors.volt
  },
  title: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8
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
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  surfaceEmphasis: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised
  },
  section: {
    gap: spacing.md
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  commandSurface: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.carbon
  },
  primaryButtonOuter: {
    minHeight: 54,
    borderRadius: radius.md,
    overflow: "hidden"
  },
  primaryButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.volt
  },
  primaryButtonLabel: {
    color: colors.carbon,
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
    backgroundColor: colors.surface
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "transparent"
  },
  iconButtonActive: {
    borderColor: colors.carbon,
    backgroundColor: colors.surface
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
    height: 5,
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: colors.mist
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  progressFillRtl: {
    alignSelf: "flex-end"
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 26,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xs,
    backgroundColor: colors.surface
  },
  pillInformation: {
    borderColor: colors.information,
    backgroundColor: colors.informationQuiet
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
  dotInformation: { backgroundColor: colors.information },
  dotVolt: { backgroundColor: colors.volt },
  dotWarning: { backgroundColor: colors.warning },
  pillLabel: {
    color: colors.text,
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
    backgroundColor: colors.surface,
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
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 126, 132, 0.32)",
    borderRadius: radius.md,
    backgroundColor: colors.dangerQuiet
  },
  errorBannerText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  errorDismiss: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.xs
  },
  errorDismissText: {
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  rowReverse: {
    ...rtlRowStyle()
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
  }
});
