import { nativeTokens } from "@alyr/design-tokens";

export const colors = {
  canvas: nativeTokens.colors.dark.canvasRaised,
  canvasAlt: nativeTokens.colors.dark.canvas,
  surface: nativeTokens.colors.dark.surface,
  surfaceRaised: nativeTokens.colors.dark.surfaceRaised,
  surfaceQuiet: nativeTokens.colors.dark.surfaceStrong,
  border: nativeTokens.colors.dark.border,
  borderStrong: nativeTokens.colors.dark.borderStrong,
  text: nativeTokens.colors.dark.text,
  textMuted: nativeTokens.colors.dark.textMuted,
  textFaint: nativeTokens.colors.dark.textSubtle,
  cyan: nativeTokens.colors.accent.cyan,
  cyanQuiet: "rgba(74, 216, 245, 0.12)",
  violet: nativeTokens.colors.accent.violet,
  violetSoft: nativeTokens.colors.accent.violetSoft,
  violetQuiet: "rgba(139, 92, 246, 0.14)",
  volt: nativeTokens.colors.semantic.success,
  voltQuiet: "rgba(183, 243, 74, 0.12)",
  warning: nativeTokens.colors.semantic.warning,
  warningQuiet: "rgba(242, 179, 93, 0.12)",
  danger: nativeTokens.colors.semantic.danger,
  dangerQuiet: "rgba(255, 126, 132, 0.12)",
  transparent: "transparent",
  shadow: "#000000"
} as const;

export const gradients = {
  primary: [
    "#7928FF",
    nativeTokens.colors.accent.blue,
    nativeTokens.colors.accent.cyan
  ] as const,
  atmosphere: [
    "rgba(139, 92, 246, 0.28)",
    "rgba(74, 216, 245, 0.03)",
    "rgba(3, 9, 20, 0)"
  ] as const,
  progress: [colors.violet, colors.cyan] as const
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40
} as const;

export const radius = {
  xs: 6,
  sm: 9,
  md: 12,
  lg: 16,
  xl: 22,
  round: 999
} as const;

export const typography = {
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
  display: "Manrope_600SemiBold",
  displayBold: "Manrope_700Bold",
  arabic: "IBMPlexSansArabic_400Regular",
  arabicMedium: "IBMPlexSansArabic_600SemiBold"
} as const;

export const shadows = {
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 28,
    elevation: 12
  }
} as const;
