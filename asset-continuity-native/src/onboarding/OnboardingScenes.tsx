import { LinearGradient } from "expo-linear-gradient";
import {
  Camera,
  Check,
  FileText,
  ImageSquare,
  MapPin,
  Scan
} from "phosphor-react-native";
import { useEffect } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop
} from "react-native-svg";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import { radius, typography, worldline } from "@/theme/tokens";

import { OnboardingGlobe } from "./OnboardingGlobe";
import type { OnboardingSceneIndex } from "./types";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const decorativeProps =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const
      };

export function OnboardingSceneArtwork({
  exampleLabel,
  globeAccessibilityLabel,
  rtl,
  scene
}: {
  readonly exampleLabel: string;
  readonly globeAccessibilityLabel: string;
  readonly rtl: boolean;
  readonly scene: OnboardingSceneIndex;
}) {
  if (scene === 0) {
    return <PromiseArtwork exampleLabel={exampleLabel} rtl={rtl} />;
  }
  if (scene === 1) {
    return (
      <OnboardingGlobe
        accessibilityLabel={globeAccessibilityLabel}
        exampleLabel={exampleLabel}
        rtl={rtl}
      />
    );
  }
  if (scene === 2) {
    return <ProofArtwork exampleLabel={exampleLabel} rtl={rtl} />;
  }
  return <StartArtwork exampleLabel={exampleLabel} rtl={rtl} />;
}

function PromiseArtwork({
  exampleLabel,
  rtl
}: {
  readonly exampleLabel: string;
  readonly rtl: boolean;
}) {
  const reduceMotion = useReduceMotionPreference();
  const path = useSharedValue(reduceMotion ? 1 : 0);
  const traveller = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      path.value = 1;
      traveller.value = 1;
      return;
    }
    path.value = withTiming(1, {
      duration: 1100,
      easing: Easing.bezier(0.16, 1, 0.3, 1)
    });
    traveller.value = withDelay(
      180,
      withTiming(1, {
        duration: 960,
        easing: Easing.bezier(0.16, 1, 0.3, 1)
      })
    );
  }, [path, reduceMotion, traveller]);

  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: 520 * (1 - path.value)
  }));
  const travellerStyle = useAnimatedStyle(() => ({
    opacity: path.value,
    transform: [
      { translateX: (rtl ? -1 : 1) * traveller.value * 238 },
      {
        translateY:
          -18 * Math.sin(traveller.value * Math.PI)
      }
    ]
  }));
  const entry = (delay: number) =>
    FadeInDown.delay(reduceMotion ? 0 : delay).duration(
      reduceMotion ? 80 : 420
    );

  return (
    <View {...decorativeProps} style={styles.stage}>
      <View style={styles.examplePill}>
        <Text style={[styles.exampleLabel, rtl && styles.arabicLabel]}>
          {exampleLabel}
        </Text>
      </View>

      <View style={styles.promiseLine}>
        <Svg height="210" viewBox="0 0 340 210" width="100%">
          <Defs>
            <SvgLinearGradient id="promiseGradient" x1="0" x2="1" y1="0" y2="0">
              <Stop offset="0" stopColor={worldline.violet} />
              <Stop offset="0.52" stopColor={worldline.blue} />
              <Stop offset="1" stopColor={worldline.cyan} />
            </SvgLinearGradient>
          </Defs>
          <Path
            d="M18 156 C72 156 77 66 140 66 C203 66 202 142 258 142 C293 142 305 105 326 105"
            fill="none"
            opacity={0.14}
            stroke={worldline.text}
            strokeLinecap="round"
            strokeWidth="1.5"
          />
          <AnimatedPath
            animatedProps={pathProps}
            d="M18 156 C72 156 77 66 140 66 C203 66 202 142 258 142 C293 142 305 105 326 105"
            fill="none"
            stroke="url(#promiseGradient)"
            strokeDasharray={520}
            strokeLinecap="round"
            strokeWidth="2.4"
          />
          <AnimatedCircle
            cx={18}
            cy={156}
            fill={worldline.endpoint}
            r={3.5}
          />
          <Circle cx={326} cy={105} fill={worldline.cyan} r={3.5} />
        </Svg>
        <Animated.View style={[styles.traveller, travellerStyle]}>
          <Scan color={worldline.text} size={16} weight="regular" />
        </Animated.View>
      </View>

      <Animated.View
        entering={entry(100)}
        style={[styles.assetTile, styles.assetTileHome]}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={require("../../assets/sample-assets/pearl-apartment.png")}
          style={styles.assetImage}
        />
        <View style={styles.assetIndex}>
          <Text style={styles.assetIndexText}>01</Text>
        </View>
      </Animated.View>
      <Animated.View
        entering={entry(260)}
        style={[styles.assetTile, styles.assetTileWatch]}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={require("../../assets/sample-assets/gmt-watch.png")}
          style={styles.assetImage}
        />
        <View style={styles.assetIndex}>
          <Text style={styles.assetIndexText}>02</Text>
        </View>
      </Animated.View>
      <Animated.View
        entering={entry(420)}
        style={[styles.assetTile, styles.assetTileMemory]}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={require("../../assets/sample-assets/childhood-train.png")}
          style={styles.assetImage}
        />
        <View style={styles.assetIndex}>
          <Text style={styles.assetIndexText}>03</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function ProofArtwork({
  exampleLabel,
  rtl
}: {
  readonly exampleLabel: string;
  readonly rtl: boolean;
}) {
  const reduceMotion = useReduceMotionPreference();
  const entries = [
    {
      icon: ImageSquare,
      label: rtl ? "الصورة" : "PHOTO",
      value: rtl ? "تحفظ شكل الشيء" : "What it looks like"
    },
    {
      icon: MapPin,
      label: rtl ? "المكان" : "PLACE",
      value: rtl ? "حيث يمكن إيجاده" : "Where to find it"
    },
    {
      icon: FileText,
      label: rtl ? "الإثبات" : "PROOF",
      value: rtl ? "ما يدعم السجل" : "What supports the record"
    }
  ] as const;

  return (
    <View {...decorativeProps} style={styles.stage}>
      <LinearGradient
        colors={worldline.gradient}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.passportBoundary}
      >
        <View style={styles.passport}>
          <View style={[styles.passportHeader, rtl && rtlRowStyle()]}>
            <View>
              <Text style={[styles.passportMeta, rtl && styles.arabicLabel]}>
                {exampleLabel}
              </Text>
              <Text style={[styles.passportTitle, rtl && styles.arabicTitle]}>
                {rtl ? "جواز غرض واحد" : "ONE ITEM PASSPORT"}
              </Text>
            </View>
            <Animated.View
              entering={FadeIn.delay(reduceMotion ? 0 : 660).duration(
                reduceMotion ? 80 : 240
              )}
              style={styles.confirmed}
            >
              <Check color={worldline.canvas} size={16} weight="bold" />
            </Animated.View>
          </View>

          <View style={styles.proofRows}>
            {entries.map((entry, index) => {
              const Icon = entry.icon;
              return (
                <Animated.View
                  entering={FadeInUp.delay(
                    reduceMotion ? 0 : 110 + index * 150
                  ).duration(reduceMotion ? 80 : 360)}
                  key={entry.label}
                  style={[styles.proofRow, rtl && rtlRowStyle()]}
                >
                  <View style={styles.proofIcon}>
                    <Icon color={worldline.cyan} size={20} weight="regular" />
                  </View>
                  <View style={styles.proofCopy}>
                    <Text
                      style={[
                        styles.proofLabel,
                        rtl && styles.arabicLabel,
                        rtl && styles.rtlText
                      ]}
                    >
                      {entry.label}
                    </Text>
                    <Text
                      style={[
                        styles.proofValue,
                        rtl && styles.arabicBody,
                        rtl && styles.rtlText
                      ]}
                    >
                      {entry.value}
                    </Text>
                  </View>
                  <View style={styles.proofTick}>
                    <Check color={worldline.endpoint} size={14} weight="bold" />
                  </View>
                </Animated.View>
              );
            })}
          </View>
        </View>
      </LinearGradient>
      <View style={styles.proofSignal} />
    </View>
  );
}

function StartArtwork({
  exampleLabel,
  rtl
}: {
  readonly exampleLabel: string;
  readonly rtl: boolean;
}) {
  const reduceMotion = useReduceMotionPreference();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 820 }),
        withTiming(1, { duration: 820 })
      ),
      -1,
      false
    );
  }, [pulse, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }]
  }));
  const chips = [
    { icon: Camera, label: rtl ? "صورة" : "PHOTO" },
    { icon: FileText, label: rtl ? "اسم" : "NAME" },
    { icon: MapPin, label: rtl ? "مكان" : "PLACE" }
  ] as const;

  return (
    <View {...decorativeProps} style={styles.stage}>
      <Text style={[styles.startExample, rtl && styles.arabicLabel]}>
        {exampleLabel}
      </Text>
      <View style={styles.captureOrbit}>
        <Svg height="236" viewBox="0 0 236 236" width="236">
          <Defs>
            <SvgLinearGradient id="captureGradient" x1="0" x2="1" y1="1" y2="0">
              <Stop offset="0" stopColor={worldline.violet} />
              <Stop offset="0.55" stopColor={worldline.blue} />
              <Stop offset="1" stopColor={worldline.cyan} />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={118}
            cy={118}
            fill="none"
            opacity={0.3}
            r={102}
            stroke="url(#captureGradient)"
            strokeDasharray="3 9"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
          <Circle
            cx={118}
            cy={118}
            fill={worldline.surface}
            r={75}
            stroke={worldline.border}
            strokeWidth="1"
          />
        </Svg>
        <Animated.View style={[styles.captureCore, pulseStyle]}>
          <Scan color={worldline.text} size={37} weight="thin" />
          <View style={styles.captureEndpoint} />
        </Animated.View>
      </View>
      <View style={[styles.captureChips, rtl && rtlRowStyle()]}>
        {chips.map((chip, index) => {
          const Icon = chip.icon;
          return (
            <Animated.View
              entering={FadeInDown.delay(
                reduceMotion ? 0 : 140 + index * 120
              ).duration(reduceMotion ? 80 : 360)}
              key={chip.label}
              style={styles.captureChip}
            >
              <Icon color={worldline.cyan} size={16} />
              <Text style={[styles.captureChipText, rtl && styles.arabicLabel]}>
                {chip.label}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: "100%",
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  examplePill: {
    top: 4,
    end: 4,
    position: "absolute",
    zIndex: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: worldline.border,
    backgroundColor: worldline.surface
  },
  exampleLabel: {
    color: worldline.textFaint,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 0.8,
    lineHeight: 16
  },
  arabicLabel: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  promiseLine: {
    width: "100%",
    height: 210,
    justifyContent: "center"
  },
  traveller: {
    width: 34,
    height: 34,
    left: 5,
    top: 139,
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: worldline.cyan,
    backgroundColor: worldline.canvasRaised
  },
  assetTile: {
    width: 78,
    height: 92,
    position: "absolute",
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: worldline.border,
    backgroundColor: worldline.canvasRaised
  },
  assetTileHome: {
    start: 40,
    top: 116
  },
  assetTileWatch: {
    start: "41%",
    top: 26
  },
  assetTileMemory: {
    end: 28,
    top: 126
  },
  assetImage: {
    width: "100%",
    height: "100%"
  },
  assetIndex: {
    left: 7,
    bottom: 7,
    position: "absolute",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: worldline.scrim
  },
  assetIndexText: {
    color: worldline.text,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 15
  },
  passportBoundary: {
    width: "88%",
    padding: 1,
    borderRadius: radius.xl
  },
  passport: {
    padding: 18,
    gap: 16,
    borderRadius: radius.xl,
    backgroundColor: worldline.canvasRaised
  },
  passportHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  passportMeta: {
    color: worldline.textFaint,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 0.8,
    lineHeight: 16
  },
  passportTitle: {
    marginTop: 3,
    color: worldline.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    letterSpacing: 0.2,
    lineHeight: 20
  },
  arabicTitle: {
    fontFamily: typography.arabicMedium
  },
  confirmed: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: worldline.endpoint
  },
  proofRows: {
    gap: 8
  },
  proofRow: {
    minHeight: 52,
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: worldline.borderQuiet,
    backgroundColor: worldline.surface
  },
  proofIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: worldline.cyanQuiet
  },
  proofCopy: {
    flex: 1,
    gap: 1
  },
  proofLabel: {
    color: worldline.cyan,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 0.6,
    lineHeight: 15
  },
  proofValue: {
    color: worldline.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 17
  },
  arabicBody: {
    fontFamily: typography.arabic
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  proofTick: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  proofSignal: {
    width: 5,
    height: 5,
    marginTop: 13,
    borderRadius: 3,
    backgroundColor: worldline.endpoint
  },
  startExample: {
    top: 5,
    position: "absolute",
    color: worldline.textFaint,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 0.8,
    lineHeight: 16
  },
  captureOrbit: {
    width: 236,
    height: 236,
    alignItems: "center",
    justifyContent: "center"
  },
  captureCore: {
    width: 112,
    height: 112,
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 56,
    borderWidth: 1,
    borderColor: worldline.cyan,
    backgroundColor: worldline.canvasRaised,
    shadowColor: worldline.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 28,
    elevation: 8
  },
  captureEndpoint: {
    width: 7,
    height: 7,
    end: 15,
    bottom: 19,
    position: "absolute",
    borderRadius: 4,
    backgroundColor: worldline.endpoint
  },
  captureChips: {
    marginTop: -18,
    flexDirection: "row",
    gap: 8
  },
  captureChip: {
    minHeight: 34,
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: worldline.border,
    backgroundColor: worldline.surface
  },
  captureChipText: {
    color: worldline.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 0.5,
    lineHeight: 15
  }
});
