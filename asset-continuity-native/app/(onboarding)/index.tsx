import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Eye,
  FingerprintSimple,
  MapPin,
  ShieldCheck
} from "phosphor-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  BodyText,
  BrandMark,
  ErrorBanner,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  Surface
} from "@/components/ui";
import type { WorkspaceMode } from "@/domain/model";
import { isExpoGoPreview } from "@/runtime/environment";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  gradients,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

export default function OnboardingScreen() {
  const router = useRouter();
  const {
    error,
    clearError,
    saving,
    startWorkspace,
    storageReady
  } = useWorkspace();
  const [choice, setChoice] = useState<WorkspaceMode>(
    isExpoGoPreview ? "sample" : "personal"
  );

  const start = async () => {
    try {
      await startWorkspace(choice);
      router.replace("/(tabs)");
    } catch {
      // WorkspaceProvider presents the recoverable error without a dev redbox.
    }
  };

  return (
    <AppScreen contentStyle={styles.screen} testID="onboarding-screen">
      <View style={styles.brandRow}>
        <BrandMark />
        <StatusPill
          label={isExpoGoPreview ? "Test preview" : "Private by design"}
          tone={isExpoGoPreview ? "warning" : "volt"}
        />
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>
          Know it. Find it.{"\n"}
          <Text style={styles.heroAccent}>Prove it.</Text> Hand it over.
        </Text>
        <BodyText muted style={styles.heroCopy}>
          Build a private continuity record for the things your household
          cannot afford to forget.
        </BodyText>
      </View>

      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <View accessibilityRole="radiogroup" style={styles.choiceList}>
        <WorkspaceChoice
          active={choice === "personal"}
          description={
            isExpoGoPreview
              ? "Use only non-sensitive test information. This temporary Expo Go workspace resets with the session."
              : "Begin with an empty household. Nothing from the sample will enter your personal workspace."
          }
          icon={FingerprintSimple}
          label={
            isExpoGoPreview
              ? "Start a temporary test"
              : "Start my private workspace"
          }
          onPress={() => setChoice("personal")}
        />
        <WorkspaceChoice
          active={choice === "sample"}
          description="Explore a clearly labelled fictional household before adding any personal information."
          icon={Eye}
          label="Explore the sample"
          onPress={() => setChoice("sample")}
        />
      </View>

      <Surface style={styles.privacy}>
        <View style={styles.privacyIcon}>
          <ShieldCheck color={colors.volt} size={24} weight="regular" />
        </View>
        <View style={styles.privacyCopy}>
          <Text style={styles.privacyTitle}>Your device is the first vault</Text>
          <BodyText muted>
            {isExpoGoPreview
              ? "This free iPhone preview tests the real flow, camera, documents, and location. Encrypted persistence is reserved for the signed ALYR build."
              : "The pilot starts local-first. Cloud sync is never implied until a server acknowledges it."}
          </BodyText>
        </View>
      </Surface>

      <PrimaryButton
        accessibilityHint="Creates the selected workspace on this device"
        icon={ArrowRight}
        label={
          choice === "personal"
            ? isExpoGoPreview
              ? "Start temporary preview"
              : "Create private workspace"
            : "Open sample"
        }
        loading={saving}
        disabled={!storageReady}
        onPress={() => void start()}
      />
      <View style={styles.footnote}>
        <MapPin color={colors.textFaint} size={16} />
        <Text style={styles.footnoteText}>
          Exact, approximate, and unknown locations stay visibly different.
        </Text>
      </View>
    </AppScreen>
  );
}

function WorkspaceChoice({
  active,
  description,
  icon: Icon,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly description: string;
  readonly icon: typeof FingerprintSimple;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active && styles.choiceActive,
        pressed && styles.choicePressed
      ]}
    >
      {active ? (
        <LinearGradient
          colors={gradients.primary}
          style={styles.choiceIcon}
        >
          <Icon color={colors.text} size={23} />
        </LinearGradient>
      ) : (
        <View style={styles.choiceIconQuiet}>
          <Icon color={colors.textMuted} size={23} />
        </View>
      )}
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceTitle}>{label}</Text>
        <Text style={styles.choiceDescription}>{description}</Text>
      </View>
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: "center",
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  hero: {
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  heroTitle: {
    maxWidth: 560,
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 42,
    lineHeight: 47,
    letterSpacing: -1.8
  },
  heroAccent: {
    color: colors.violetSoft
  },
  heroCopy: {
    maxWidth: 520,
    fontSize: 17,
    lineHeight: 26
  },
  choiceList: {
    gap: spacing.sm
  },
  choice: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  choiceActive: {
    borderColor: "rgba(139, 92, 246, 0.64)",
    backgroundColor: colors.surfaceRaised
  },
  choicePressed: {
    opacity: 0.84
  },
  choiceIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md
  },
  choiceIconQuiet: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  choiceCopy: {
    flex: 1,
    gap: 5
  },
  choiceTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  choiceDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round
  },
  radioActive: {
    borderColor: colors.cyan
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.round,
    backgroundColor: colors.cyan
  },
  privacy: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  privacyIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.voltQuiet
  },
  privacyCopy: {
    flex: 1,
    gap: spacing.xs
  },
  privacyTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  footnote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  footnoteText: {
    color: colors.textFaint,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  }
});
