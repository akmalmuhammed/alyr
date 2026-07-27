/**
 * Platform-neutral ALYR product tokens.
 *
 * Paper is the default working canvas, Carbon carries structure and premium
 * moments, and Volt is reserved for action, current state, and confirmed
 * progress. Platform adapters choose the active light or dark scheme.
 */
export const palette = {
  paper: "#F6F7F3",
  white: "#FFFFFF",
  mist: "#E9ECEF",
  concrete: "#A7ADB5",
  muted: "#5F666D",
  carbon: "#15171A",
  canvasDark: "#0E1012",
  surfaceDark: "#191C1F",
  graphite: "#2A2E33",
  black: "#050505",
  volt: "#B7F34A",
} as const;

export const colors = {
  brand: {
    paper: palette.paper,
    carbon: palette.carbon,
    volt: palette.volt,
    mist: palette.mist,
    concrete: palette.concrete,
    white: palette.white,
  },
  light: {
    canvas: palette.paper,
    canvasRaised: palette.mist,
    surface: palette.white,
    surfaceRaised: palette.white,
    surfaceStrong: palette.mist,
    text: palette.carbon,
    textMuted: palette.muted,
    textSubtle: "#697077",
    border: "#D9DDE0",
    borderStrong: "#858C93",
    action: palette.volt,
    actionText: palette.carbon,
  },
  dark: {
    canvas: palette.canvasDark,
    canvasRaised: palette.carbon,
    surface: palette.surfaceDark,
    surfaceRaised: "#202327",
    surfaceStrong: palette.graphite,
    text: palette.white,
    textMuted: "#C3C7CB",
    textSubtle: palette.concrete,
    border: "rgba(255, 255, 255, 0.12)",
    borderStrong: "rgba(255, 255, 255, 0.22)",
    action: palette.volt,
    actionText: palette.carbon,
  },
  /**
   * Compatibility aliases for existing consumers. They intentionally resolve
   * to restrained brand/semantic colors rather than the retired neon palette.
   */
  accent: {
    cyan: "#1769AA",
    blue: "#1769AA",
    violet: palette.carbon,
    violetSoft: palette.muted,
  },
  semantic: {
    success: "#2D7D46",
    warning: "#A35F00",
    danger: "#B42318",
    information: "#1769AA",
  },
  focus: {
    dark: palette.volt,
    light: palette.carbon,
  },
} as const;

/**
 * Kept temporarily for call-site compatibility. Action and progress gradients
 * resolve to a single Volt field; atmosphere resolves to a neutral wash.
 */
export const gradients = {
  primaryAction: {
    angleDegrees: 0,
    stops: [
      { offset: 0, color: palette.volt },
      { offset: 1, color: palette.volt },
    ],
  },
  globeAtmosphere: {
    angleDegrees: 0,
    stops: [
      { offset: 0, color: "rgba(21, 23, 26, 0.04)" },
      { offset: 1, color: "rgba(21, 23, 26, 0.04)" },
    ],
  },
} as const;

export const typography = {
  families: {
    interface: "Instrument Sans",
    display: "Instrument Sans",
    arabic: "IBM Plex Sans Arabic",
    metadata: "IBM Plex Mono",
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
    display: 44,
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
  small: 8,
  control: 8,
  panel: 12,
  large: 16,
  round: 999,
} as const;

export const control = {
  minimumTouchTarget: 44,
  comfortableHeight: 48,
  compactHeight: 40,
  focusRingWidth: 2,
  focusRingOffset: 2,
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
  primaryDestinations: ["today", "assets", "family", "vault"],
  contextualActions: ["capture", "household"],
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
  palette,
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
  palette,
  colors,
  typography,
  spacing,
  radii,
  control,
  motion,
  navigation,
} as const;

export type AlyrTokens = typeof alyrTokens;
