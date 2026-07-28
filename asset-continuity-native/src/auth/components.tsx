import type { Icon } from "phosphor-react-native";
import { ArrowLeft, ArrowRight, Check } from "phosphor-react-native";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type PropsWithChildren,
  type RefObject,
  type ReactNode
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewStyle
} from "react-native";

import {
  AppScreen,
  BodyText,
  BrandMark,
  PrimaryButton,
  SecondaryButton
} from "@/components/ui";
import {
  formatStep,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export interface AuthViewport {
  readonly width: number;
  readonly height: number;
  readonly fontScale: number;
}

export function isCompactAuthViewport({
  width,
  height,
  fontScale
}: AuthViewport): boolean {
  return width <= 340 || height <= 600 || fontScale >= 1.3;
}

export function AuthScaffold({
  backDisabled = false,
  children,
  footer,
  headerAction,
  onBack,
  progress,
  testID
}: PropsWithChildren<{
  readonly backDisabled?: boolean;
  readonly footer?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly onBack?: () => void;
  readonly progress?: { readonly current: number; readonly total: number };
  readonly testID?: string;
}>) {
  const { copy, language, rtl } = useCoreJourneyCopy();
  const compact = isCompactAuthViewport(useWindowDimensions());
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
  return (
    <AppScreen
      contentStyle={StyleSheet.flatten([
        styles.screen,
        compact && styles.screenCompact
      ])}
      {...(footer && !compact ? { footer } : {})}
      {...(testID ? { testID } : {})}
    >
      <View style={[styles.header, rtl && styles.rowReverse]}>
        {onBack ? (
          <Pressable
            accessibilityLabel={copy.common.back}
            accessibilityRole="button"
            accessibilityState={{ disabled: backDisabled }}
            disabled={backDisabled}
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [
              styles.back,
              pressed && styles.pressed,
              backDisabled && styles.disabled
            ]}
          >
            <BackIcon color={colors.text} size={22} />
          </Pressable>
        ) : (
          <BrandMark />
        )}
        {progress ? (
          <View
            accessibilityLabel={formatStep(
              progress.current,
              progress.total,
              language
            )}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 1,
              max: progress.total,
              now: progress.current
            }}
            style={[
              styles.progressBlock,
              rtl && styles.progressBlockRtl
            ]}
          >
            <Text
              style={[
                styles.progressLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {formatStep(progress.current, progress.total, language)}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressValue,
                  rtl && styles.progressValueRtl,
                  {
                    width: `${(progress.current / progress.total) * 100}%`
                  }
                ]}
              />
            </View>
          </View>
        ) : (
          headerAction ?? null
        )}
      </View>
      {children}
      {compact && footer ? (
        <View
          style={styles.inlineFooter}
          testID="auth-inline-footer"
        >
          {footer}
        </View>
      ) : null}
    </AppScreen>
  );
}

export function AuthHeading({
  eyebrow,
  title,
  body,
  focusOnChange = false
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly focusOnChange?: boolean;
}) {
  const compact = isCompactAuthViewport(useWindowDimensions());
  const { rtl } = useCoreJourneyCopy();
  const titleRef = useRef<Text>(null);
  useEffect(() => {
    if (!focusOnChange) return;
    const frame = requestAnimationFrame(() => {
      if (Platform.OS === "web") {
        (
          titleRef.current as unknown as {
            focus?: () => void;
          } | null
        )?.focus?.();
        return;
      }
      const handle = findNodeHandle(titleRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusOnChange, title]);
  return (
    <View style={styles.heading}>
      <Text
        style={[
          styles.eyebrow,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {eyebrow}
      </Text>
      <Text
        accessibilityRole="header"
        ref={titleRef}
        style={[
          styles.title,
          compact && styles.titleCompact,
          rtl && styles.titleArabic,
          rtl && compact && styles.titleArabicCompact,
          rtl && styles.rtlText
        ]}
        {...(focusOnChange ? { tabIndex: -1 } : {})}
      >
        {title}
      </Text>
      <BodyText muted style={styles.intro}>
        {body}
      </BodyText>
    </View>
  );
}

export function AuthStatusRow({
  detail,
  eyebrow,
  icon: IconComponent,
  live = false,
  value,
  valueDirection = "natural"
}: {
  readonly detail: string;
  readonly eyebrow: string;
  readonly icon: Icon;
  readonly live?: boolean;
  readonly value: string;
  readonly valueDirection?: "natural" | "ltr";
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <View
      accessible
      accessibilityLabel={`${eyebrow}. ${value}. ${detail}`}
      {...(live ? { accessibilityLiveRegion: "polite" as const } : {})}
      style={[styles.statusRow, rtl && styles.rowReverse]}
    >
      <View style={styles.statusIcon}>
        <IconComponent color={colors.volt} size={22} weight="bold" />
      </View>
      <View style={styles.statusCopy}>
        <Text
          style={[
            styles.statusEyebrow,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {eyebrow}
        </Text>
        <Text
          style={[
            styles.statusValue,
            rtl && valueDirection === "natural" && styles.arabicMedium,
            rtl && valueDirection === "natural" && styles.rtlText,
            valueDirection === "ltr" && styles.ltrValue,
            rtl && valueDirection === "ltr" && styles.ltrValueRtl
          ]}
        >
          {value}
        </Text>
        <Text
          style={[
            styles.statusDetail,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

type AuthFieldProps = TextInputProps & {
  readonly label: string;
  readonly description?: string | undefined;
  readonly error?: string | null | undefined;
  readonly style?: TextInputProps["style"] | undefined;
};

export const AuthField = forwardRef<TextInput, AuthFieldProps>(
  function AuthField(
    {
      label,
      description,
      error,
      style,
      ...props
    },
    ref
  ) {
    const { rtl } = useCoreJourneyCopy();
    const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const hint = [props.accessibilityHint, description, error]
    .filter(Boolean)
    .join(" ");
  return (
    <View style={styles.fieldGroup}>
      <Text
        style={[
          styles.fieldLabel,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
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
            rtl && styles.rtlText
          ]}
        >
          {description}
        </Text>
      ) : null}
      <TextInput
        {...props}
        accessibilityHint={hint || undefined}
        accessibilityLabel={props.accessibilityLabel ?? label}
        aria-describedby={
          error ? errorId : description ? descriptionId : undefined
        }
        aria-invalid={Boolean(error)}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.action}
        ref={ref}
        style={[
          styles.field,
          error && styles.fieldError,
          rtl && styles.arabic,
          rtl &&
            props.keyboardType !== "email-address" &&
            !props.secureTextEntry &&
            styles.rtlInput,
          style
        ]}
      />
      {error ? (
        <Text
          nativeID={errorId}
          style={[
            styles.errorText,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
  }
);

export interface InvalidAuthFieldTarget {
  readonly error: string | null | undefined;
  readonly ref: RefObject<TextInput | null>;
}

type FocusScheduler = (focus: () => void) => void;

function scheduleAfterValidation(focus: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(focus);
    return;
  }
  setTimeout(focus, 0);
}

/**
 * Focuses only the first invalid field after React has committed its error
 * description. The focused input exposes that error through its hint and
 * `aria-describedby`, so field errors do not also use a live region and cause
 * duplicate VoiceOver announcements.
 */
export function focusFirstInvalidAuthField(
  targets: readonly InvalidAuthFieldTarget[],
  schedule: FocusScheduler = scheduleAfterValidation
): boolean {
  const firstInvalid = targets.find((target) => Boolean(target.error));
  if (!firstInvalid) return false;

  schedule(() => {
    firstInvalid.ref.current?.focus();
  });
  return true;
}

export function AuthActions({
  primary,
  secondary
}: {
  readonly primary: {
    readonly label: string;
    readonly onPress: () => void;
    readonly loading?: boolean;
    readonly disabled?: boolean;
    readonly icon?: Icon;
  };
  readonly secondary?: {
    readonly label: string;
    readonly onPress: () => void;
    readonly disabled?: boolean;
  };
}) {
  const { rtl } = useCoreJourneyCopy();
  const suppliedIcon = primary.icon;
  const icon =
    suppliedIcon === ArrowLeft || suppliedIcon === ArrowRight
      ? rtl
        ? ArrowLeft
        : ArrowRight
      : suppliedIcon;
  return (
    <View style={styles.actions}>
      <PrimaryButton
        label={primary.label}
        onPress={primary.onPress}
        {...(icon ? { icon } : {})}
        {...(primary.loading ? { loading: true } : {})}
        {...(primary.disabled ? { disabled: true } : {})}
      />
      {secondary ? (
        <SecondaryButton
          label={secondary.label}
          onPress={secondary.onPress}
          {...(secondary.disabled ? { disabled: true } : {})}
        />
      ) : null}
    </View>
  );
}

export function AuthNotice({
  children,
  tone = "neutral",
  live = false
}: PropsWithChildren<{
  readonly tone?: "neutral" | "attention" | "dark";
  readonly live?: boolean;
}>) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <View
      {...(live ? { accessibilityLiveRegion: "polite" as const } : {})}
      style={[
        styles.notice,
        rtl && styles.noticeRtl,
        tone === "attention" && styles.noticeAttention,
        tone === "dark" && styles.noticeDark
      ]}
    >
      <Text
        style={[
          styles.noticeText,
          rtl && styles.arabic,
          rtl && styles.rtlText,
          tone === "dark" && styles.noticeTextDark
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function CommandList({
  items,
  style
}: {
  readonly items: readonly string[];
  readonly style?: ViewStyle;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <View style={[styles.command, style]}>
      <Text
        style={[
          styles.commandEyebrow,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {rtl ? "سجل خاص واحد" : "ONE PRIVATE RECORD"}
      </Text>
      {items.map((item, index) => (
        <View
          key={item}
          style={[styles.commandRow, rtl && styles.rowReverse]}
        >
          <Text style={styles.commandIndex}>
            {String(index + 1).padStart(2, "0")}
          </Text>
          <Text
            style={[
              styles.commandText,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SelectionRow({
  active,
  description,
  disabled = false,
  icon: IconComponent,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly description: string;
  readonly disabled?: boolean;
  readonly icon: Icon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selection,
        rtl && styles.rowReverse,
        active && styles.selectionActive,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
    >
      <IconComponent color={colors.text} size={23} />
      <View style={styles.selectionCopy}>
        <Text
          style={[
            styles.selectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.selectionDescription,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {description}
        </Text>
      </View>
      {active ? (
        <View style={styles.selectedMark}>
          <Check color={colors.carbon} size={15} weight="bold" />
        </View>
      ) : (
        <View style={styles.unselectedMark} />
      )}
    </Pressable>
  );
}

export function TextAction({
  label,
  onPress,
  disabled = false,
  tone = "default"
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly tone?: "default" | "inverse";
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
    >
      <Text
        style={[
          styles.textActionLabel,
          tone === "inverse" && styles.textActionLabelInverse,
          rtl && styles.arabicMedium
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: spacing.md,
    gap: spacing.xxl
  },
  screenCompact: {
    paddingTop: spacing.xs,
    gap: spacing.lg
  },
  inlineFooter: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  rowReverse: {
    ...rtlRowStyle()
  },
  back: {
    width: 44,
    height: 44,
    marginStart: -spacing.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  pressed: {
    opacity: 0.62
  },
  disabled: {
    opacity: 0.42
  },
  progressBlock: {
    width: 92,
    gap: 5,
    alignItems: "flex-end"
  },
  progressBlockRtl: {
    alignItems: "flex-start"
  },
  progressLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    fontVariant: ["tabular-nums"]
  },
  progressTrack: {
    width: "100%",
    height: 2,
    backgroundColor: colors.border
  },
  progressValue: {
    height: 2,
    backgroundColor: colors.carbon
  },
  progressValueRtl: {
    alignSelf: "flex-end"
  },
  heading: {
    gap: spacing.sm
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.15
  },
  title: {
    maxWidth: 540,
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 38,
    lineHeight: 41,
    letterSpacing: -1.25
  },
  titleCompact: {
    fontSize: 33,
    lineHeight: 36,
    letterSpacing: -0.9
  },
  titleArabic: {
    fontFamily: typography.arabicMedium,
    fontSize: 36,
    lineHeight: 48,
    letterSpacing: 0
  },
  titleArabicCompact: {
    fontSize: 32,
    lineHeight: 42
  },
  intro: {
    maxWidth: 520,
    fontSize: 16,
    lineHeight: 24
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  statusIcon: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.carbon
  },
  statusCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3
  },
  statusEyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.8
  },
  statusValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  statusDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  ltrValue: {
    fontFamily: typography.bodyBold,
    textAlign: "left",
    writingDirection: "ltr"
  },
  ltrValueRtl: {
    textAlign: "right"
  },
  fieldGroup: {
    gap: 7
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  fieldDescription: {
    marginTop: -3,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  field: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 16
  },
  fieldError: {
    borderColor: colors.danger
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  actions: {
    gap: spacing.sm
  },
  notice: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet
  },
  noticeRtl: {
    borderLeftWidth: 0,
    borderRightWidth: 2,
    borderRightColor: colors.borderStrong
  },
  noticeAttention: {
    borderLeftColor: colors.warning,
    borderRightColor: colors.warning,
    backgroundColor: colors.warningQuiet
  },
  noticeDark: {
    borderLeftColor: colors.action,
    borderRightColor: colors.action,
    backgroundColor: colors.carbon
  },
  noticeText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20
  },
  noticeTextDark: {
    color: colors.concrete
  },
  command: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.carbon
  },
  commandEyebrow: {
    marginBottom: spacing.sm,
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    letterSpacing: 1
  },
  commandRow: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong
  },
  commandIndex: {
    color: colors.volt,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    fontVariant: ["tabular-nums"]
  },
  commandText: {
    flex: 1,
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  selection: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  selectionActive: {
    borderBottomColor: colors.carbon
  },
  selectionCopy: {
    flex: 1,
    gap: 3
  },
  selectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  selectionDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  selectedMark: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.round,
    backgroundColor: colors.action
  },
  unselectedMark: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round
  },
  textAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  textActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    letterSpacing: -0.1
  },
  textActionLabelInverse: {
    color: colors.white
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  rtlInput: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
