import { nativeTokens } from "@alyr/design-tokens";

const light = {
  canvas: nativeTokens.colors.light.canvas,
  canvasAlt: nativeTokens.colors.light.canvasRaised,
  surface: nativeTokens.colors.light.surface,
  surfaceRaised: nativeTokens.colors.light.surfaceRaised,
  surfaceQuiet: nativeTokens.colors.light.surfaceStrong,
  border: nativeTokens.colors.light.border,
  borderStrong: nativeTokens.colors.light.borderStrong,
  text: nativeTokens.colors.light.text,
  textMuted: nativeTokens.colors.light.textMuted,
  textFaint: nativeTokens.colors.light.textSubtle,
  action: nativeTokens.colors.light.action,
  actionText: nativeTokens.colors.light.actionText,
  information: nativeTokens.colors.semantic.information,
  success: nativeTokens.colors.semantic.success,
  warning: nativeTokens.colors.semantic.warning,
  danger: nativeTokens.colors.semantic.danger
} as const;

const dark = {
  canvas: nativeTokens.colors.dark.canvas,
  canvasAlt: nativeTokens.colors.dark.canvasRaised,
  surface: nativeTokens.colors.dark.surface,
  surfaceRaised: nativeTokens.colors.dark.surfaceRaised,
  surfaceQuiet: nativeTokens.colors.dark.surfaceStrong,
  border: nativeTokens.colors.dark.border,
  borderStrong: nativeTokens.colors.dark.borderStrong,
  text: nativeTokens.colors.dark.text,
  textMuted: nativeTokens.colors.dark.textMuted,
  textFaint: nativeTokens.colors.dark.textSubtle,
  action: nativeTokens.colors.dark.action,
  actionText: nativeTokens.colors.dark.actionText,
  information: "#6FAFE0",
  success: "#70B985",
  warning: "#E6A84F",
  danger: "#F08B82"
} as const;

export const themes = { light, dark } as const;

export const colors = {
  ...light,
  carbon: nativeTokens.palette.carbon,
  white: nativeTokens.palette.white,
  mist: nativeTokens.palette.mist,
  concrete: nativeTokens.palette.concrete,
  informationQuiet: "rgba(23, 105, 170, 0.08)",
  volt: light.action,
  voltQuiet: "rgba(183, 243, 74, 0.18)",
  voltBorder: "rgba(183, 243, 74, 0.34)",
  warningQuiet: "rgba(169, 100, 0, 0.09)",
  warningBorder: "rgba(169, 100, 0, 0.28)",
  dangerQuiet: "rgba(180, 35, 24, 0.08)",
  dangerBorder: "rgba(180, 35, 24, 0.28)",
  onCarbonBorder: "rgba(246, 247, 243, 0.18)",
  onCarbonSurface: "rgba(246, 247, 243, 0.05)",
  modalScrim: "rgba(21, 23, 26, 0.42)",
  transparent: "transparent",
  shadow: nativeTokens.palette.black
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
  xs: 4,
  sm: 8,
  md: 8,
  lg: 12,
  xl: 16,
  round: 999
} as const;

export const typography = {
  body: "InstrumentSans_400Regular",
  bodyMedium: "InstrumentSans_500Medium",
  bodyBold: "InstrumentSans_600SemiBold",
  display: "InstrumentSans_600SemiBold",
  displayBold: "InstrumentSans_700Bold",
  metadata: "IBMPlexMono_500Medium",
  arabic: "IBMPlexSansArabic_400Regular",
  arabicMedium: "IBMPlexSansArabic_600SemiBold"
} as const;

export const shadows = {
  floating: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6
  }
} as const;
