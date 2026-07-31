import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowRight,
  CircleNotch,
  GlobeHemisphereWest
} from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  FadeOutRight
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets
} from "react-native-safe-area-context";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { useLocale } from "@/i18n/LocaleProvider";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import {
  radius,
  spacing,
  typography,
  worldline
} from "@/theme/tokens";

import {
  useWorldlineOnboardingCopy,
  WORLDLINE_ONBOARDING_SCENE_IDS
} from "./onboardingCopy";
import { OnboardingSceneArtwork } from "./OnboardingScenes";
import type {
  OnboardingExperienceActions,
  OnboardingSceneIndex
} from "./types";
import { WorldlineProgress } from "./WorldlineProgress";

const sceneCount = WORLDLINE_ONBOARDING_SCENE_IDS.length;

export function OnboardingExperience({
  busy = false,
  errorMessage = null,
  onBegin,
  onExploreSample,
  onSignIn,
  onSkip,
  sampleEnabled = true
}: OnboardingExperienceActions & {
  readonly busy?: boolean;
  readonly errorMessage?: string | null;
  readonly sampleEnabled?: boolean;
}) {
  const [scene, setScene] = useState<OnboardingSceneIndex>(0);
  const [direction, setDirection] = useState<"forward" | "back">(
    "forward"
  );
  const [actionPending, setActionPending] = useState(false);
  const reduceMotion = useReduceMotionPreference();
  const { height, width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocale();
  const { copy, rtl } = useWorldlineOnboardingCopy();
  const sceneId = WORLDLINE_ONBOARDING_SCENE_IDS[scene];
  const sceneCopy = copy.scenes[sceneId];
  const compact = height < 700 || width < 350;
  const largeText = fontScale >= 1.2;
  const pending = busy || actionPending;

  const announceScene = useCallback(
    (next: OnboardingSceneIndex) => {
      const nextCopy =
        copy.scenes[WORLDLINE_ONBOARDING_SCENE_IDS[next]];
      AccessibilityInfo.announceForAccessibility(
        `${copy.progressLabel(next + 1, sceneCount)}. ${nextCopy.title}`
      );
    },
    [copy]
  );

  const moveTo = useCallback(
    (next: OnboardingSceneIndex, nextDirection: "forward" | "back") => {
      setDirection(nextDirection);
      setScene(next);
      announceScene(next);
    },
    [announceScene]
  );

  const moveBack = useCallback(() => {
    if (scene === 0) return;
    moveTo((scene - 1) as OnboardingSceneIndex, "back");
  }, [moveTo, scene]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (scene > 0) {
          moveBack();
        }
        return true;
      }
    );
    return () => subscription.remove();
  }, [moveBack, scene]);

  const runExit = useCallback(
    async (action: () => void | Promise<void>) => {
      if (pending) return;
      setActionPending(true);
      try {
        await action();
      } finally {
        setActionPending(false);
      }
    },
    [pending]
  );

  const primaryAction = useCallback(() => {
    if (scene < sceneCount - 1) {
      moveTo((scene + 1) as OnboardingSceneIndex, "forward");
      return;
    }
    void runExit(onBegin);
  }, [moveTo, onBegin, runExit, scene]);

  const secondaryAction = useCallback(() => {
    if (scene === 0) {
      void runExit(onSkip);
      return;
    }
    if (scene === sceneCount - 1) {
      void runExit(onExploreSample);
      return;
    }
    moveBack();
  }, [moveBack, onExploreSample, onSkip, runExit, scene]);

  const entering = useMemo(() => {
    if (reduceMotion) return FadeIn.duration(80);
    if (direction === "forward") {
      return (rtl ? FadeInLeft : FadeInRight).duration(480);
    }
    return (rtl ? FadeInRight : FadeInLeft).duration(480);
  }, [direction, reduceMotion, rtl]);
  const exiting = useMemo(() => {
    if (reduceMotion) return FadeOut.duration(80);
    if (direction === "forward") {
      return (rtl ? FadeOutRight : FadeOutLeft).duration(240);
    }
    return (rtl ? FadeOutLeft : FadeOutRight).duration(240);
  }, [direction, reduceMotion, rtl]);

  const showTopSignIn = scene === 0 || scene === sceneCount - 1;
  const showBack = scene > 0;
  const primaryTestId =
    scene === sceneCount - 1
      ? "onboarding-start-first-item"
      : "onboarding-next";
  const secondaryTestId =
    scene === 0
      ? "onboarding-skip"
      : scene === sceneCount - 1
        ? "onboarding-explore-sample"
        : "onboarding-back";
  const nextIcon = rtl ? ArrowLeft : ArrowRight;

  return (
    <View style={styles.screen} testID="onboarding-screen">
      <StatusBar style="light" />
      <LinearGradient
        colors={worldline.backgroundGradient}
        end={{ x: 0.9, y: 1 }}
        start={{ x: 0.1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.ambient}
      >
        <View style={styles.ambientViolet} />
        <View style={styles.ambientCyan} />
      </View>

      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <View
          style={[
            styles.topBar,
            rtl && rtlRowStyle(),
            compact && styles.topBarCompact
          ]}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.signal, rtl && rtlRowStyle()]}
          >
            <GlobeHemisphereWest
              color={worldline.text}
              size={20}
              weight="thin"
            />
            <LinearGradient
              colors={worldline.gradient}
              end={{ x: 1, y: 0 }}
              start={{ x: 0, y: 0 }}
              style={styles.signalLine}
            />
            <View style={styles.signalEndpoint} />
          </View>

          <View style={[styles.topActions, rtl && rtlRowStyle()]}>
            <Pressable
              accessibilityLabel={
                language === "ar"
                  ? "Switch language to English"
                  : "تغيير اللغة إلى العربية"
              }
              accessibilityRole="button"
              hitSlop={8}
              onPress={() =>
                void setLanguage(language === "ar" ? "en" : "ar")
              }
              style={({ pressed }) => [
                styles.quietTopAction,
                pressed && styles.pressed
              ]}
              testID="onboarding-language"
            >
              <Text
                style={[
                  styles.quietTopLabel,
                  language === "ar" && styles.arabicText
                ]}
              >
                {language === "ar" ? "EN" : "العربية"}
              </Text>
            </Pressable>
            {showTopSignIn ? (
              <Pressable
                accessibilityRole="button"
                disabled={pending}
                hitSlop={8}
                onPress={() => void runExit(onSignIn)}
                style={({ pressed }) => [
                  styles.quietTopAction,
                  pressed && styles.pressed
                ]}
                testID="onboarding-sign-in"
              >
                <Text
                  style={[
                    styles.quietTopLabel,
                    rtl && styles.arabicText
                  ]}
                >
                  {sceneCopy.quietAction}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.progressWrap,
            compact && styles.progressWrapCompact
          ]}
          testID="onboarding-progress"
        >
          <WorldlineProgress
            current={scene}
            progressLabel={copy.progressLabel(scene + 1, sceneCount)}
            rtl={rtl}
          />
        </View>

        <ScrollView
          bounces={false}
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollContentCompact,
            largeText && styles.scrollContentLargeText,
            { paddingBottom: Math.max(insets.bottom, spacing.md) }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={entering}
            exiting={exiting}
            key={`${language}-${sceneId}`}
            style={styles.scene}
            testID={`onboarding-scene-${scene + 1}`}
          >
            <View
              style={[
                styles.artwork,
                compact && styles.artworkCompact
              ]}
            >
              <OnboardingSceneArtwork
                exampleLabel={copy.exampleLabel}
                globeAccessibilityLabel={copy.exampleGlobeLabel}
                rtl={rtl}
                scene={scene}
              />
            </View>

            <View style={styles.message}>
              <Text
                style={[
                  styles.eyebrow,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {sceneCopy.eyebrow}
              </Text>
              <Text
                accessibilityRole="header"
                style={[
                  styles.title,
                  compact && styles.titleCompact,
                  largeText && styles.titleLargeText,
                  rtl && styles.titleArabic,
                  rtl && styles.rtlText
                ]}
              >
                {sceneCopy.title}
              </Text>
              <Text
                style={[
                  styles.body,
                  rtl && styles.arabicText,
                  rtl && styles.rtlText
                ]}
              >
                {sceneCopy.body}
              </Text>
            </View>
          </Animated.View>

          <View style={styles.footer}>
            {errorMessage ? (
              <View accessibilityRole="alert" style={styles.error}>
                <Text
                  style={[
                    styles.errorText,
                    rtl && styles.arabicText,
                    rtl && styles.rtlText
                  ]}
                >
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={primaryAction}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.primaryPressed,
                pending && styles.disabled
              ]}
              testID={primaryTestId}
            >
              <LinearGradient
                colors={worldline.gradient}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={[
                  styles.primaryInner,
                  rtl && rtlRowStyle()
                ]}
              >
                <Text
                  style={[
                    styles.primaryLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {sceneCopy.primaryAction}
                </Text>
                {pending && scene === sceneCount - 1 ? (
                  <CircleNotch
                    color={worldline.text}
                    size={21}
                    weight="regular"
                  />
                ) : (
                  (() => {
                    const Icon = nextIcon;
                    return (
                      <Icon
                        color={worldline.text}
                        size={21}
                        weight="regular"
                      />
                    );
                  })()
                )}
              </LinearGradient>
            </Pressable>

            <View style={[styles.lowerActions, rtl && rtlRowStyle()]}>
              <Pressable
                accessibilityRole="button"
                disabled={
                  pending ||
                  (scene === sceneCount - 1 && !sampleEnabled)
                }
                onPress={secondaryAction}
                style={({ pressed }) => [
                  styles.secondary,
                  scene === sceneCount - 1 && styles.secondaryStrong,
                  pressed && styles.pressed,
                  (!sampleEnabled || pending) && styles.disabled
                ]}
                testID={secondaryTestId}
              >
                {showBack && scene < sceneCount - 1 ? (
                  rtl ? (
                    <ArrowRight color={worldline.textMuted} size={18} />
                  ) : (
                    <ArrowLeft color={worldline.textMuted} size={18} />
                  )
                ) : null}
                <Text
                  style={[
                    styles.secondaryLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {sceneCopy.secondaryAction}
                </Text>
              </Pressable>

              {scene === sceneCount - 1 ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={pending}
                  onPress={moveBack}
                  style={({ pressed }) => [
                    styles.secondary,
                    pressed && styles.pressed
                  ]}
                  testID="onboarding-back"
                >
                  {rtl ? (
                    <ArrowRight color={worldline.textMuted} size={18} />
                  ) : (
                    <ArrowLeft color={worldline.textMuted} size={18} />
                  )}
                  <Text
                    style={[
                      styles.secondaryLabel,
                      rtl && styles.arabicMedium
                    ]}
                  >
                    {copy.scenes.place.secondaryAction}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: worldline.canvas
  },
  safeArea: {
    flex: 1
  },
  ambient: {
    top: 0,
    end: 0,
    bottom: 0,
    start: 0,
    position: "absolute",
    overflow: "hidden"
  },
  ambientViolet: {
    width: 320,
    height: 320,
    top: -190,
    start: -150,
    position: "absolute",
    borderRadius: 160,
    backgroundColor: worldline.violetQuiet,
    transform: [{ scaleX: 1.5 }]
  },
  ambientCyan: {
    width: 280,
    height: 280,
    end: -200,
    bottom: 40,
    position: "absolute",
    borderRadius: 140,
    backgroundColor: worldline.cyanQuiet,
    transform: [{ scaleX: 1.6 }]
  },
  topBar: {
    minHeight: 60,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg
  },
  topBarCompact: {
    minHeight: 48
  },
  signal: {
    height: 28,
    alignItems: "center",
    flexDirection: "row"
  },
  signalLine: {
    width: 44,
    height: 1,
    marginHorizontal: 8
  },
  signalEndpoint: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: worldline.endpoint
  },
  topActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5
  },
  quietTopAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: radius.round,
    outlineColor: worldline.cyan
  },
  quietTopLabel: {
    color: worldline.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  arabicText: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  progressWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: 3
  },
  progressWrapCompact: {
    paddingTop: 0
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  scrollContentCompact: {
    gap: spacing.md,
    paddingTop: spacing.xs
  },
  scrollContentLargeText: {
    justifyContent: "flex-start"
  },
  scene: {
    flexGrow: 1
  },
  artwork: {
    minHeight: 304,
    justifyContent: "center"
  },
  artworkCompact: {
    minHeight: 272
  },
  message: {
    gap: 10,
    paddingTop: spacing.sm
  },
  eyebrow: {
    color: worldline.cyan,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 1.4,
    lineHeight: 16
  },
  title: {
    maxWidth: 560,
    color: worldline.text,
    fontFamily: typography.display,
    fontSize: 38,
    letterSpacing: -1.25,
    lineHeight: 42
  },
  titleCompact: {
    fontSize: 33,
    letterSpacing: -0.9,
    lineHeight: 37
  },
  titleLargeText: {
    fontSize: 32,
    lineHeight: 39
  },
  titleArabic: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0,
    lineHeight: 50
  },
  body: {
    maxWidth: 540,
    color: worldline.textMuted,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 23
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  footer: {
    gap: 10,
    paddingTop: spacing.xs
  },
  error: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: worldline.border,
    backgroundColor: worldline.surfaceStrong
  },
  errorText: {
    color: worldline.text,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  primary: {
    minHeight: 58,
    overflow: "hidden",
    borderRadius: radius.lg,
    outlineColor: worldline.cyan,
    shadowColor: worldline.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 7
  },
  primaryInner: {
    minHeight: 58,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20
  },
  primaryLabel: {
    color: worldline.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  primaryPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.992 }]
  },
  lowerActions: {
    minHeight: 48,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8
  },
  secondary: {
    minHeight: 44,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: radius.round,
    outlineColor: worldline.cyan
  },
  secondaryStrong: {
    borderWidth: 1,
    borderColor: worldline.border
  },
  secondaryLabel: {
    color: worldline.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  pressed: {
    opacity: 0.62
  },
  disabled: {
    opacity: 0.46
  }
});
