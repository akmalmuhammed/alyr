import {
  FileText,
  HouseLine,
  Watch
} from "phosphor-react-native";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType
} from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
  type PathProps
} from "react-native-svg";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import {
  ATLAS_COASTLINE_RENDER_LINES,
  ATLAS_GRATICULE_RENDER_LINES,
  projectPreparedAtlasPolyline,
  type AtlasCoordinates,
  type AtlasProjection
} from "@/domain/atlas";
import {
  spacing,
  typography,
  worldline
} from "@/theme/tokens";

import {
  DEFAULT_ONBOARDING_GLOBE_CENTER,
  DEFAULT_ONBOARDING_GLOBE_MARKERS,
  estimateWorldlineOrbitLength,
  projectWorldlineMarkers,
  WORLDLINE_MOTION,
  worldlineMarkerTiming,
  worldlineOrbitPath,
  type OnboardingAssetKind,
  type ProjectedWorldlineMarker,
  type WorldlineGlobeMarker
} from "./worldlineMotion";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const GLOBE_INSET = 16;

const hiddenDecorationProps =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const
      };

interface IconProps {
  readonly color?: string;
  readonly size?: number | string;
  readonly weight?: "regular" | "bold";
}

const markerIcons: Record<
  OnboardingAssetKind,
  ComponentType<IconProps>
> = {
  document: FileText as ComponentType<IconProps>,
  home: HouseLine as ComponentType<IconProps>,
  watch: Watch as ComponentType<IconProps>
};

export interface OnboardingGlobeProps {
  /**
   * Controls whether the one-shot reveal is allowed to advance. Setting this
   * false pauses the current UI-thread animation without discarding progress.
   */
  readonly active?: boolean;
  readonly accessibilityLabel?: string;
  readonly center?: AtlasCoordinates;
  readonly connectedLabel?: string;
  readonly diameter?: number;
  /**
   * Synthetic onboarding markers are provided by default. Real records must be
   * supplied explicitly and must never inherit the "example" presentation.
   */
  readonly example?: boolean;
  readonly exampleLabel?: string;
  readonly markers?: readonly WorldlineGlobeMarker[];
  readonly reduceMotion?: boolean;
  readonly rtl?: boolean;
  readonly testID?: string;
}

interface GlobeGeometry {
  readonly coastlinePaths: readonly string[];
  readonly graticulePaths: readonly string[];
  readonly markerProjections: readonly ProjectedWorldlineMarker[];
  readonly orbit: string;
  readonly orbitLength: number;
  readonly projectionRadius: number;
  readonly sphereRadius: number;
}

function projectedPath(
  segment: readonly AtlasProjection[],
  sphereRadius: number,
  projectionRadius: number
): string {
  return segment
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      const x = sphereRadius + point.x * projectionRadius;
      const y = sphereRadius + point.y * projectionRadius;
      return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function useForeground(): boolean {
  const [foreground, setForeground] = useState(
    AppState.currentState === "active"
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
    });
    return () => subscription.remove();
  }, []);

  return foreground;
}

function useGlobeGeometry(
  diameter: number,
  center: AtlasCoordinates,
  markers: readonly WorldlineGlobeMarker[]
): GlobeGeometry {
  return useMemo(() => {
    const sphereRadius = diameter / 2;
    const projectionRadius = sphereRadius - GLOBE_INSET - 1;

    const graticulePaths = ATLAS_GRATICULE_RENDER_LINES.flatMap((line) =>
      projectPreparedAtlasPolyline(line, center)
    ).map((segment) =>
      projectedPath(segment, sphereRadius, projectionRadius)
    );
    const coastlinePaths = ATLAS_COASTLINE_RENDER_LINES.flatMap((line) =>
      projectPreparedAtlasPolyline(line, center)
    ).map((segment) =>
      projectedPath(segment, sphereRadius, projectionRadius)
    );

    return {
      coastlinePaths,
      graticulePaths,
      markerProjections: projectWorldlineMarkers(
        markers,
        center,
        diameter,
        GLOBE_INSET
      ),
      orbit: worldlineOrbitPath(diameter, GLOBE_INSET),
      orbitLength: estimateWorldlineOrbitLength(diameter),
      projectionRadius,
      sphereRadius
    };
  }, [center, diameter, markers]);
}

function TravellingMarker({
  index,
  marker,
  progress,
  total
}: {
  readonly index: number;
  readonly marker: ProjectedWorldlineMarker;
  readonly progress: SharedValue<number>;
  readonly total: number;
}) {
  const timing = worldlineMarkerTiming(index, total);
  const Icon = markerIcons[marker.kind];

  const assetStyle = useAnimatedStyle(() => {
    const x = interpolate(
      progress.value,
      [timing.depart, timing.arrive],
      [marker.originPoint.x, marker.destination.x],
      "clamp"
    );
    const y = interpolate(
      progress.value,
      [timing.depart, timing.arrive],
      [marker.originPoint.y, marker.destination.y],
      "clamp"
    );
    const opacity = interpolate(
      progress.value,
      [
        Math.max(0, timing.depart - 0.08),
        timing.depart,
        timing.arrive,
        timing.settle
      ],
      [0, 1, 1, 0],
      "clamp"
    );
    const scale = interpolate(
      progress.value,
      [timing.depart, timing.arrive, timing.settle],
      [0.82, 1, 0.56],
      "clamp"
    );

    return {
      opacity,
      transform: [
        { translateX: x - 20 },
        { translateY: y - 20 },
        { scale }
      ]
    };
  }, [
    marker.destination.x,
    marker.destination.y,
    marker.originPoint.x,
    marker.originPoint.y
  ]);

  const pinStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [timing.arrive, timing.settle],
      [0, marker.visible ? 1 : 0],
      "clamp"
    );
    const scale = interpolate(
      progress.value,
      [timing.arrive, timing.settle],
      [1.9, 1],
      "clamp"
    );

    return {
      opacity,
      transform: [
        { translateX: marker.destination.x - 11 },
        { translateY: marker.destination.y - 11 },
        { scale }
      ]
    };
  }, [marker.destination.x, marker.destination.y, marker.visible]);

  return (
    <>
      <Animated.View style={[styles.assetTraveler, assetStyle]}>
        <View style={styles.assetGlyph}>
          <Icon color={worldline.text} size={19} weight="regular" />
        </View>
      </Animated.View>
      <Animated.View style={[styles.pin, pinStyle]}>
        <View style={styles.pinHalo} />
        <View style={styles.pinCore} />
      </Animated.View>
    </>
  );
}

export function OnboardingGlobe({
  active = true,
  accessibilityLabel,
  center = DEFAULT_ONBOARDING_GLOBE_CENTER,
  connectedLabel,
  diameter: requestedDiameter,
  example = true,
  exampleLabel,
  markers = DEFAULT_ONBOARDING_GLOBE_MARKERS,
  reduceMotion: reduceMotionOverride,
  rtl = false,
  testID = "onboarding-globe"
}: OnboardingGlobeProps) {
  const { width } = useWindowDimensions();
  const systemReduceMotion = useReduceMotionPreference();
  const reduceMotion = reduceMotionOverride ?? systemReduceMotion;
  const foreground = useForeground();
  const diameter =
    requestedDiameter ??
    Math.min(340, Math.max(230, width - spacing.xxl * 2));
  const geometry = useGlobeGeometry(diameter, center, markers);
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const resolvedLegendLabel = example
    ? exampleLabel ??
      (rtl ? "مثال · عالم خاص" : "EXAMPLE · PRIVATE WORLD")
    : connectedLabel ??
      (rtl ? "مكان مرتبط" : "CONNECTED PLACE");
  const resolvedAccessibilityLabel =
    accessibilityLabel ??
    (rtl
      ? "كرة أرضية توضيحية تعرض أغراضاً مرتبطة بأماكن."
      : "Example globe showing items connected to places.");

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(progress);
      progress.value = withTiming(1, {
        duration: WORLDLINE_MOTION.reduceMotionCrossfadeMs
      });
      return;
    }

    if (!active || !foreground) {
      cancelAnimation(progress);
      return;
    }

    const remaining = Math.max(0, 1 - progress.value);
    progress.value = withTiming(1, {
      duration: Math.max(
        WORLDLINE_MOTION.smallStateMs,
        Math.round(WORLDLINE_MOTION.globeRevealMs * remaining)
      ),
      easing: Easing.bezier(0.16, 1, 0.3, 1)
    });

    return () => cancelAnimation(progress);
  }, [active, foreground, progress, reduceMotion]);

  const orbitAnimatedProps = useAnimatedProps<PathProps>(() => ({
    strokeDashoffset: geometry.orbitLength * (1 - progress.value)
  }));
  const globeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12], [0.36, 1], "clamp"),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0, 0.28],
          [0.965, 1],
          "clamp"
        )
      }
    ]
  }));
  const confirmedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.82, 1], [0, 1], "clamp"),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0.82, 1],
          [0.72, 1],
          "clamp"
        )
      }
    ]
  }));

  return (
    <View
      accessible
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityRole="image"
      style={[styles.root, { width: diameter }]}
      testID={testID}
    >
      <View
        {...hiddenDecorationProps}
        style={[styles.visual, styles.nonInteractive]}
      >
        <View style={[styles.legendRow, rtl && rtlRowStyle()]}>
          <Text style={styles.exampleLabel}>{resolvedLegendLabel}</Text>
          <Animated.View style={[styles.confirmedSignal, confirmedStyle]} />
        </View>

        <Animated.View
          style={[
            styles.globe,
            { height: diameter, width: diameter },
            globeStyle
          ]}
        >
          <Svg
            height={diameter}
            viewBox={`0 0 ${diameter} ${diameter}`}
            width={diameter}
          >
            <Defs>
              <RadialGradient
                cx="37%"
                cy="30%"
                id="worldline-sphere"
                r="72%"
              >
                <Stop
                  offset="0%"
                  stopColor={worldline.canvasRaised}
                  stopOpacity="1"
                />
                <Stop
                  offset="62%"
                  stopColor={worldline.canvas}
                  stopOpacity="1"
                />
                <Stop
                  offset="100%"
                  stopColor={worldline.canvasDeep}
                  stopOpacity="1"
                />
              </RadialGradient>
              <SvgLinearGradient
                id="worldline-orbit"
                x1="0%"
                x2="100%"
                y1="0%"
                y2="100%"
              >
                <Stop offset="0%" stopColor={worldline.violet} />
                <Stop offset="48%" stopColor={worldline.blue} />
                <Stop offset="100%" stopColor={worldline.cyan} />
              </SvgLinearGradient>
            </Defs>

            <Circle
              cx={geometry.sphereRadius}
              cy={geometry.sphereRadius}
              fill="url(#worldline-sphere)"
              r={geometry.sphereRadius - GLOBE_INSET}
              stroke={worldline.border}
              strokeWidth="1"
            />

            {geometry.graticulePaths.map((path, index) => (
              <Path
                d={path}
                fill="none"
                key={`worldline-grid-${index}`}
                opacity={0.13}
                stroke={worldline.textMuted}
                strokeWidth="0.65"
              />
            ))}
            {geometry.coastlinePaths.map((path, index) => (
              <Path
                d={path}
                fill="none"
                key={`worldline-coast-${index}`}
                opacity={0.58}
                stroke={worldline.textMuted}
                strokeLinejoin="round"
                strokeWidth="1"
              />
            ))}

            <Path
              d={geometry.orbit}
              fill="none"
              opacity={0.12}
              stroke={worldline.cyan}
              strokeLinecap="round"
              strokeWidth="9"
            />
            <AnimatedPath
              animatedProps={orbitAnimatedProps}
              d={geometry.orbit}
              fill="none"
              stroke="url(#worldline-orbit)"
              strokeDasharray={`${geometry.orbitLength} ${geometry.orbitLength}`}
              strokeLinecap="round"
              strokeWidth="2.6"
            />
          </Svg>

          <View style={StyleSheet.absoluteFill}>
            {geometry.markerProjections.map((marker, index) => (
              <TravellingMarker
                index={index}
                key={marker.id}
                marker={marker}
                progress={progress}
                total={geometry.markerProjections.length}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: "center"
  },
  visual: {
    width: "100%",
    gap: spacing.sm
  },
  nonInteractive: {
    pointerEvents: "none"
  },
  legendRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: GLOBE_INSET
  },
  exampleLabel: {
    color: worldline.textFaint,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.15
  },
  confirmedSignal: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: worldline.endpoint,
    shadowColor: worldline.endpoint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 8,
    elevation: 3
  },
  globe: {
    position: "relative",
    overflow: "visible"
  },
  assetTraveler: {
    position: "absolute",
    left: 0,
    top: 0
  },
  assetGlyph: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: worldline.border,
    borderRadius: 10,
    backgroundColor: worldline.canvasRaised,
    shadowColor: worldline.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5
  },
  pin: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  pinHalo: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: worldline.endpointQuiet
  },
  pinCore: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: worldline.endpoint,
    shadowColor: worldline.endpoint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 8,
    elevation: 4
  }
});
