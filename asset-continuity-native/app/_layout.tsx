import "react-native-gesture-handler";
import "react-native-reanimated";
import "react-native-url-polyfill/auto";

import "@/background/expoBackgroundSync";

import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_600SemiBold,
  useFonts as useArabic
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import {
  IBMPlexMono_500Medium,
  useFonts as useMono
} from "@expo-google-fonts/ibm-plex-mono";
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  useFonts as useInstrumentSans
} from "@expo-google-fonts/instrument-sans";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowRight,
  WarningCircle
} from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  SafeAreaView
} from "react-native-safe-area-context";

import { AuthFlowProvider, useAuthFlow } from "@/auth/AuthFlowProvider";
import { AuthBootstrapBoundary } from "@/auth/AuthBootstrapBoundary";
import { resolveFirstRecordHandoff } from "@/auth/firstRecordHandoff";
import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import {
  DeviceAuthProvider,
  DeviceUnlockScreen,
  useDeviceAuth
} from "@/deviceAuth";
import {
  SessionBoundWorkspaceProvider,
  signedOutSampleWorkspaceReady
} from "@/state/SessionBoundWorkspaceProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { useCoreJourneyCopy } from "@/i18n/coreJourneyCopy";
import { useInviteCopy } from "@/i18n/inviteCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import {
  PrivacyShield,
  usePrivacyShielded
} from "@/components/PrivacyShield";
import {
  resolveFontStartupState,
  StartupStatus
} from "@/components/StartupStatus";
import { useStartupCopy } from "@/i18n/startupCopy";
import { installSignedSupabaseRuntimeFromEnvironment } from "@/runtime/signedSupabaseRuntime";
import {
  PortfolioPrivacyProvider,
  valueVisibilityScopeForSession
} from "@/privacy/PortfolioPrivacyProvider";
import {
  ReviewReminderProvider,
  ReviewReminderWorkspaceObserver
} from "@/notifications/ReviewReminderProvider";
import { OnboardingIntroProvider } from "@/onboarding/OnboardingIntroProvider";
import { colors } from "@/theme/tokens";

const signedRuntimeInstallation =
  installSignedSupabaseRuntimeFromEnvironment();
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <LocaleProvider>
      <LocalizedRootLayout />
    </LocaleProvider>
  );
}

function LocalizedRootLayout() {
  const [instrumentLoaded, instrumentError] = useInstrumentSans({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold
  });
  const [arabicLoaded, arabicError] = useArabic({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_600SemiBold
  });
  const [monoLoaded, monoError] = useMono({
    IBMPlexMono_500Medium
  });
  const [continueWithSystemText, setContinueWithSystemText] =
    useState(false);
  const fontStartupState = resolveFontStartupState({
    arabicError,
    arabicLoaded,
    instrumentError,
    instrumentLoaded,
    monoError,
    monoLoaded
  });

  useEffect(() => {
    if (fontStartupState !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [fontStartupState]);

  if (fontStartupState === "loading") {
    return (
      <StartupStatus
        kind="application"
        testID="root-font-startup-status"
      />
    );
  }

  if (
    fontStartupState === "fallback" &&
    !continueWithSystemText
  ) {
    return (
      <FontFallbackRecovery
        onContinue={() => setContinueWithSystemText(true)}
      />
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <OnboardingIntroProvider>
          <AuthFlowProvider
            {...(signedRuntimeInstallation.kind === "configured"
              ? {
                  householdAccess:
                    signedRuntimeInstallation.services.cloud.householdAccess,
                  accountDeletion:
                    signedRuntimeInstallation.services.cloud.accountDeletion
                }
              : {})}
          >
            <AuthBootstrapBoundary>
              <SignedWorkspaceBoundary />
            </AuthBootstrapBoundary>
          </AuthFlowProvider>
        </OnboardingIntroProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function FontFallbackRecovery({
  onContinue
}: {
  readonly onContinue: () => void;
}) {
  const { copy, rtl } = useStartupCopy();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `${copy.fontErrorTitle}. ${copy.fontErrorBody}`
    );
  }, [copy.fontErrorBody, copy.fontErrorTitle]);

  return (
    <SafeAreaProvider>
      <SafeAreaView
        accessibilityRole="alert"
        style={styles.fontFallbackSafeArea}
        testID="font-fallback-recovery"
      >
        <View style={styles.fontFallbackContent}>
          <View style={styles.fontFallbackIcon}>
            <WarningCircle
              color={colors.action}
              size={28}
              weight="regular"
            />
          </View>
          <Text
            style={[
              styles.fontFallbackEyebrow,
              rtl && styles.fontFallbackRtl
            ]}
          >
            {copy.fontErrorEyebrow}
          </Text>
          <Text
            style={[
              styles.fontFallbackTitle,
              rtl && styles.fontFallbackRtl
            ]}
          >
            {copy.fontErrorTitle}
          </Text>
          <Text
            style={[
              styles.fontFallbackBody,
              rtl && styles.fontFallbackRtl
            ]}
          >
            {copy.fontErrorBody}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onContinue}
            style={({ pressed }) => [
              styles.fontFallbackAction,
              pressed && styles.localizedBackPressed
            ]}
            testID="font-fallback-continue"
          >
            <Text
              style={[
                styles.fontFallbackActionLabel,
                rtl && styles.fontFallbackRtl
              ]}
            >
              {copy.fontErrorAction}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function SignedWorkspaceBoundary() {
  const { bootstrapState, mode, session } = useAuthFlow();
  const valueVisibilityScope = useMemo(
    () => valueVisibilityScopeForSession(mode, session),
    [mode, session]
  );
  const deviceSubjectReady =
    mode === "supabase" &&
    bootstrapState === "ready" &&
    session?.assurance === "verified-email" &&
    session.identity.emailVerified &&
    Boolean(
      session.activeHouseholdId &&
        session.activeMembershipId &&
        session.activeHouseholdRole
    );
  const protectionRequired =
    deviceSubjectReady && session?.onboarding === "complete";
  const subjectId =
    deviceSubjectReady && session?.activeHouseholdId
      ? `${session.identity.id}:${session.activeHouseholdId}`
      : null;

  return (
    <PortfolioPrivacyProvider scope={valueVisibilityScope}>
      <DeviceAuthProvider
        protectionRequired={protectionRequired}
        subjectId={subjectId}
      >
        <ReviewReminderProvider>
          <SessionBoundWorkspaceProvider>
            <ReviewReminderWorkspaceObserver>
              <RootNavigator />
            </ReviewReminderWorkspaceObserver>
          </SessionBoundWorkspaceProvider>
        </ReviewReminderProvider>
      </DeviceAuthProvider>
    </PortfolioPrivacyProvider>
  );
}

function RootNavigator() {
  const router = useRouter();
  const deliveredFirstRecordHandoffRef = useRef<string | null>(
    null
  );
  const { bootstrapState, mode, session } = useAuthFlow();
  const deviceAuth = useDeviceAuth();
  const { workspace } = useWorkspace();
  const privacyShielded = usePrivacyShielded();
  const reduceMotion = useReduceMotionPreference();
  const {
    copy,
    ready: localeReady,
    rtl
  } = useCoreJourneyCopy();
  const inviteCopy = useInviteCopy();
  const signedSessionReady =
    mode === "supabase" &&
    bootstrapState === "ready" &&
    session?.assurance === "verified-email" &&
    session.identity.emailVerified &&
    session.onboarding === "complete" &&
    Boolean(
      session.activeHouseholdId &&
        session.activeMembershipId &&
        session.activeHouseholdRole
    );
  const localSampleReady = signedOutSampleWorkspaceReady(
    mode,
    session,
    workspace?.mode ?? null
  );
  const dataRoutesReady =
    Boolean(workspace) &&
    (mode === "preview" || localSampleReady || signedSessionReady);
  const onboardingFinished =
    session?.onboarding === "complete" &&
    (mode === "preview" || signedSessionReady);
  const pendingFirstRecordIntent =
    deviceAuth.pendingFirstRecordIntent;
  const pendingFirstRecordHandoff =
    deviceAuth.pendingFirstRecordHandoff;
  const firstRecordHandoffDestination =
    resolveFirstRecordHandoff({
      dataRoutesReady,
      onboardingFinished: Boolean(onboardingFinished),
      vaultReleased: deviceAuth.vaultReleased,
      intent: pendingFirstRecordIntent
    });

  useEffect(() => {
    if (
      !firstRecordHandoffDestination ||
      !pendingFirstRecordIntent ||
      !pendingFirstRecordHandoff ||
      deliveredFirstRecordHandoffRef.current ===
        pendingFirstRecordHandoff.handoffId
    ) {
      return;
    }
    deliveredFirstRecordHandoffRef.current =
      pendingFirstRecordHandoff.handoffId;
    const separator = firstRecordHandoffDestination.includes("?")
      ? "&"
      : "?";
    router.replace(
      `${firstRecordHandoffDestination}${separator}handoffId=${encodeURIComponent(
        pendingFirstRecordHandoff.handoffId
      )}`
    );
  }, [
    firstRecordHandoffDestination,
    pendingFirstRecordHandoff,
    pendingFirstRecordIntent,
    router
  ]);

  if (!localeReady) {
    return (
      <StartupStatus
        kind="application"
        testID="root-locale-startup-status"
      />
    );
  }

  if (deviceAuth.requiresUnlock && !deviceAuth.vaultReleased) {
    return <DeviceUnlockScreen />;
  }
  const navigatorAccessibilityProps =
    Platform.OS === "web"
      ? { "aria-hidden": privacyShielded }
      : {
          accessibilityElementsHidden: privacyShielded,
          importantForAccessibility: privacyShielded
            ? ("no-hide-descendants" as const)
            : ("auto" as const)
        };

  return (
    <View style={styles.navigatorRoot}>
      <View
        {...navigatorAccessibilityProps}
        style={styles.navigatorLayer}
      >
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            animation: reduceMotion
              ? "none"
              : rtl
                ? Platform.OS === "ios"
                  ? "ios_from_left"
                  : "slide_from_left"
                : "default",
            contentStyle: { backgroundColor: colors.canvas },
            gestureDirection: "horizontal",
            headerStyle: { backgroundColor: colors.canvas },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            headerBackVisible: false,
            ...(rtl
              ? {
                  headerRight: () => (
                  <Pressable
                    accessibilityLabel={copy.common.back}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() =>
                      router.canGoBack()
                        ? router.back()
                        : router.replace("/")
                    }
                    style={({ pressed }) => [
                      styles.localizedBack,
                      pressed && styles.localizedBackPressed
                    ]}
                  >
                    <ArrowRight color={colors.text} size={22} />
                  </Pressable>
                  )
                }
              : {
                  headerLeft: () => (
                    <Pressable
                      accessibilityLabel={copy.common.back}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() =>
                        router.canGoBack()
                          ? router.back()
                          : router.replace("/")
                      }
                      style={({ pressed }) => [
                        styles.localizedBack,
                        pressed && styles.localizedBackPressed
                      ]}
                    >
                      <ArrowLeft color={colors.text} size={22} />
                    </Pressable>
                  )
                }),
            headerTitleStyle: {
              fontFamily: rtl
                ? "IBMPlexSansArabic_600SemiBold"
                : "InstrumentSans_600SemiBold"
            }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="join" options={{ headerShown: false }} />
          <Stack.Screen
            name="(onboarding)"
            options={{ animation: "none", headerShown: false }}
          />
          <Stack.Screen
            name="privacy-policy"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="terms"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="support"
            options={{ headerShown: false }}
          />
          <Stack.Protected guard={dataRoutesReady}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="capture/index"
              options={{
                presentation: "modal",
                headerShown: false,
                gestureEnabled: true
              }}
            />
            <Stack.Screen
              name="personal-start"
              options={{
                presentation: "modal",
                headerShown: false,
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="asset/[id]"
              options={{
                title: copy.stack.assetPassport
              }}
            />
            <Stack.Screen
              name="evidence/[id]"
              options={{
                title: copy.stack.evidence
              }}
            />
            <Stack.Screen
              name="asset-edit"
              options={{
                title: copy.stack.updatePassport,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="asset-value"
              options={{
                title: copy.stack.recordedValue,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="liability-create"
              options={{
                title: rtl ? "إضافة التزام" : "Add liability",
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="liability/[id]"
              options={{
                title: rtl ? "سجل الالتزام" : "Liability record"
              }}
            />
            <Stack.Screen
              name="liability-balance"
              options={{
                title: rtl ? "رصيد الالتزام" : "Liability balance",
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="place/[id]"
              options={{
                title: copy.stack.place
              }}
            />
            <Stack.Screen
              name="place-pin"
              options={{
                title: copy.stack.propertyPin,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="place-edit"
              options={{
                title: copy.stack.editPlace,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="space-edit"
              options={{
                title: copy.stack.placeSpace,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="invite-member"
              options={{
                headerShown: false,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="member-access"
              options={{
                headerShown: false,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="sync-conflicts"
              options={{
                headerShown: false
              }}
            />
            <Stack.Screen
              name="dashboard"
              options={{
                headerTitle: () => null,
                title: copy.stack.portfolio
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                title: copy.stack.settings
              }}
            />
            <Stack.Screen
              name="atlas"
              options={{
                headerTitle: () => null,
                title: copy.stack.atlas
              }}
            />
            <Stack.Screen
              name="recovery-create"
              options={{
                title: copy.stack.createRecoveryKit,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="export-create"
              options={{
                title: copy.vault.dataPortability
              }}
            />
            <Stack.Screen
              name="recovery-import"
              options={{
                title: copy.stack.restoreRecoveryKit,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="account-delete"
              options={{
                headerShown: false,
                presentation: "modal",
                gestureEnabled: false
              }}
            />
          </Stack.Protected>
        </Stack>
      </View>
      <PrivacyShield visible={privacyShielded} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  navigatorRoot: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  navigatorLayer: {
    flex: 1
  },
  localizedBack: {
    width: 44,
    height: 44,
    marginEnd: -8,
    alignItems: "center",
    justifyContent: "center"
  },
  localizedBackPressed: {
    opacity: 0.62
  },
  fontFallbackSafeArea: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  fontFallbackContent: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 32
  },
  fontFallbackIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    backgroundColor: colors.surface
  },
  fontFallbackEyebrow: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    letterSpacing: 1.1
  },
  fontFallbackTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 38,
    letterSpacing: -0.6
  },
  fontFallbackBody: {
    maxWidth: 520,
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24
  },
  fontFallbackRtl: {
    textAlign: "right",
    writingDirection: "rtl",
    letterSpacing: 0
  },
  fontFallbackAction: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.action
  },
  fontFallbackActionLabel: {
    color: colors.carbon,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22
  }
});
