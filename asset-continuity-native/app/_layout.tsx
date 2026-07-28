import "react-native-gesture-handler";
import "react-native-reanimated";
import "react-native-url-polyfill/auto";

import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_600SemiBold,
  useFonts as useArabic
} from "@expo-google-fonts/ibm-plex-sans-arabic";
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
import { ArrowLeft, ArrowRight } from "phosphor-react-native";
import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthFlowProvider, useAuthFlow } from "@/auth/AuthFlowProvider";
import { AuthBootstrapBoundary } from "@/auth/AuthBootstrapBoundary";
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
import { installSignedSupabaseRuntimeFromEnvironment } from "@/runtime/signedSupabaseRuntime";
import {
  PortfolioPrivacyProvider,
  valueVisibilityScopeForSession
} from "@/privacy/PortfolioPrivacyProvider";
import { colors } from "@/theme/tokens";

const signedRuntimeInstallation =
  installSignedSupabaseRuntimeFromEnvironment();
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [instrumentLoaded] = useInstrumentSans({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold
  });
  const [arabicLoaded] = useArabic({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_600SemiBold
  });
  const fontsLoaded = instrumentLoaded && arabicLoaded;

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.action} size="small" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <LocaleProvider>
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
        </LocaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function SignedWorkspaceBoundary() {
  const { bootstrapState, mode, session } = useAuthFlow();
  const valueVisibilityScope = useMemo(
    () => valueVisibilityScopeForSession(mode, session),
    [mode, session]
  );
  const protectionRequired =
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
  const subjectId =
    protectionRequired && session?.activeHouseholdId
      ? `${session.identity.id}:${session.activeHouseholdId}`
      : null;

  return (
    <PortfolioPrivacyProvider scope={valueVisibilityScope}>
      <DeviceAuthProvider
        protectionRequired={protectionRequired}
        subjectId={subjectId}
      >
        <SessionBoundWorkspaceProvider>
          <RootNavigator />
        </SessionBoundWorkspaceProvider>
      </DeviceAuthProvider>
    </PortfolioPrivacyProvider>
  );
}

function RootNavigator() {
  const router = useRouter();
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

  if (!localeReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.action} size="small" />
      </View>
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
            animation: reduceMotion ? "none" : "default",
            contentStyle: { backgroundColor: colors.canvas },
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
            options={{ headerShown: false }}
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
                title: copy.stack.portfolio
              }}
            />
            <Stack.Screen
              name="atlas"
              options={{
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
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas
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
  }
});
