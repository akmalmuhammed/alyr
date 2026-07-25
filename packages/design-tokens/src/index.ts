/**
 * Platform-neutral ALYR product tokens. Values follow the approved premium
 * midnight continuity UI. Platform adapters decide how to express shadows,
 * gradients, fonts, and reduced motion.
 */
export const colors = {
  dark: {
    canvas: "#02060D",
    canvasRaised: "#030A14",
    surface: "#07111F",
    surfaceRaised: "#0B1728",
    surfaceStrong: "#111F32",
    text: "#F7F9FF",
    textMuted: "#A9B4C7",
    textSubtle: "#76839A",
    border: "rgba(143, 168, 210, 0.18)",
    borderStrong: "rgba(133, 164, 218, 0.30)",
  },
  light: {
    canvas: "#F5F7FB",
    canvasRaised: "#ECF0F6",
    surface: "#FFFFFF",
    text: "#11192A",
    textMuted: "#657086",
    border: "#DFE5EE",
  },
  accent: {
    cyan: "#4AD8F5",
    blue: "#4E8CFF",
    violet: "#8B5CF6",
    violetSoft: "#B79AFF",
  },
  semantic: {
    success: "#9BE65E",
    warning: "#F8BD65",
    danger: "#FF7F86",
    information: "#4AD8F5",
  },
  focus: {
    dark: "#7BE5FA",
    light: "#2446A8",
  },
} as const;

export const gradients = {
  primaryAction: {
    angleDegrees: 100,
    stops: [
      { offset: 0, color: "#7928FF" },
      { offset: 0.52, color: "#4E8CFF" },
      { offset: 1, color: "#35D8ED" },
    ],
  },
  globeAtmosphere: {
    angleDegrees: 135,
    stops: [
      { offset: 0, color: "rgba(139, 92, 246, 0.58)" },
      { offset: 0.55, color: "rgba(78, 140, 255, 0.34)" },
      { offset: 1, color: "rgba(74, 216, 245, 0.14)" },
    ],
  },
} as const;

export const typography = {
  families: {
    interface: "DM Sans",
    display: "Manrope",
    arabic: "IBM Plex Sans Arabic",
    systemFallback: "System",
  },
  sizes: {
    display: 44,
    heading1: 34,
    heading2: 28,
    heading3: 23,
    heading4: 20,
    bodyLarge: 18,
    body: 16,
    bodySmall: 14,
    label: 13,
    metadata: 12,
  },
  lineHeights: {
    display: 46,
    heading1: 37,
    heading2: 32,
    heading3: 28,
    heading4: 25,
    bodyLarge: 28,
    body: 25,
    bodySmall: 20,
    label: 16,
    metadata: 16,
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

export const radii = {
  compact: 4,
  small: 10,
  control: 12,
  panel: 16,
  large: 24,
  round: 999,
} as const;

export const control = {
  minimumTouchTarget: 44,
  comfortableHeight: 48,
  compactHeight: 40,
  focusRingWidth: 3,
  focusRingOffset: 3,
  iconSizes: {
    compact: 16,
    navigation: 20,
    control: 24,
    feature: 32,
  },
} as const;

export const motion = {
  durationMs: {
    instant: 80,
    fast: 160,
    medium: 280,
    slow: 480,
  },
  easing: {
    standard: [0.16, 1, 0.3, 1],
  },
  reducedMotion: {
    spatialTravel: 0,
    durationMs: 80,
  },
} as const;

export const navigation = {
  primaryDestinations: ["home", "assets", "family", "vault"],
  contextualActions: ["search", "capture"],
} as const;

export const layout = {
  contentMaxWidth: 1440,
  readingMaxWidth: 704,
  formMaxWidth: 576,
  desktopRailWidth: 252,
  tabletRailWidth: 82,
  narrowBreakpoint: 480,
  tabletBreakpoint: 768,
  railBreakpoint: 960,
  wideBreakpoint: 1280,
} as const;

export const alyrTokens = {
  colors,
  gradients,
  typography,
  spacing,
  radii,
  control,
  motion,
  navigation,
  layout,
} as const;

/**
 * React Native-compatible values only. No CSS strings other than colors and
 * font-family names are exposed here.
 */
export const nativeTokens = {
  colors,
  typography,
  spacing,
  radii,
  control,
  motion,
  navigation,
} as const;

export type AlyrTokens = typeof alyrTokens;
