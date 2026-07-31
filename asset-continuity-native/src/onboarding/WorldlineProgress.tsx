import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import { typography, worldline } from "@/theme/tokens";

import type { OnboardingSceneIndex } from "./types";

const steps = [0, 1, 2, 3] as const;

export function WorldlineProgress({
  current,
  progressLabel,
  rtl
}: {
  readonly current: OnboardingSceneIndex;
  readonly progressLabel: string;
  readonly rtl: boolean;
}) {
  const reduceMotion = useReduceMotionPreference();
  const progress = useSharedValue((current + 1) / steps.length);

  useEffect(() => {
    progress.value = withTiming((current + 1) / steps.length, {
      duration: reduceMotion ? 80 : 480
    });
  }, [current, progress, reduceMotion]);

  const progressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }]
  }));

  return (
    <View
      accessibilityLabel={progressLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{
        max: steps.length,
        min: 1,
        now: current + 1,
        text: progressLabel
      }}
      style={styles.root}
      testID="worldline-progress"
    >
      <View style={[styles.meta, rtl && rtlRowStyle()]}>
        <Text style={[styles.label, rtl && styles.arabic]}>
          {progressLabel}
        </Text>
        <Text style={styles.ordinal}>
          {String(current + 1).padStart(2, "0")} / 04
        </Text>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.track}
      >
        <View style={styles.trackBase} />
        <Animated.View
          style={[
            styles.progressClip,
            rtl ? styles.progressOriginRtl : styles.progressOrigin,
            progressStyle
          ]}
        >
          <LinearGradient
            colors={worldline.gradient}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={[styles.nodes, rtl && rtlRowStyle()]}>
          {steps.map((step) => {
            const reached = step <= current;
            const active = step === current;
            return (
              <View
                key={step}
                style={[
                  styles.node,
                  reached && styles.nodeReached,
                  active && styles.nodeActive
                ]}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10
  },
  meta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  label: {
    color: worldline.textFaint,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 1.2,
    lineHeight: 16,
    textTransform: "uppercase"
  },
  arabic: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0,
    textTransform: "none"
  },
  ordinal: {
    color: worldline.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    letterSpacing: 0.8,
    lineHeight: 16
  },
  track: {
    height: 14,
    justifyContent: "center"
  },
  trackBase: {
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    backgroundColor: worldline.border
  },
  progressClip: {
    height: 2,
    left: 0,
    position: "absolute",
    right: 0
  },
  progressOrigin: {
    transformOrigin: "left center"
  },
  progressOriginRtl: {
    transformOrigin: "right center"
  },
  nodes: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  node: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: worldline.border,
    backgroundColor: worldline.canvas
  },
  nodeReached: {
    borderColor: worldline.cyan,
    backgroundColor: worldline.blue
  },
  nodeActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderColor: worldline.text,
    backgroundColor: worldline.cyan
  }
});
