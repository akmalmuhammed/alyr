import "react-native-gesture-handler";
import "react-native-reanimated";

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  useFonts as useDMSans
} from "@expo-google-fonts/dm-sans";
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_600SemiBold,
  useFonts as useArabic
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts as useManrope
} from "@expo-google-fonts/manrope";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { WorkspaceProvider } from "@/state/WorkspaceProvider";
import { PrivacyShield } from "@/components/PrivacyShield";
import { colors } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dmLoaded] = useDMSans({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold
  });
  const [manropeLoaded] = useManrope({
    Manrope_600SemiBold,
    Manrope_700Bold
  });
  const [arabicLoaded] = useArabic({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_600SemiBold
  });
  const fontsLoaded = dmLoaded && manropeLoaded && arabicLoaded;

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.cyan} size="small" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <WorkspaceProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              animation: "fade_from_bottom",
              contentStyle: { backgroundColor: colors.canvas },
              headerStyle: { backgroundColor: colors.canvas },
              headerTintColor: colors.text,
              headerShadowVisible: false,
              headerBackButtonDisplayMode: "minimal"
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="(onboarding)"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="capture/index"
              options={{
                presentation: "modal",
                headerShown: false,
                gestureEnabled: false
              }}
            />
            <Stack.Screen
              name="search"
              options={{
                presentation: "modal",
                headerShown: false
              }}
            />
            <Stack.Screen
              name="asset/[id]"
              options={{
                title: "Asset Passport"
              }}
            />
            <Stack.Screen
              name="place/[id]"
              options={{
                title: "Place"
              }}
            />
          </Stack>
          <PrivacyShield />
        </WorkspaceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas
  }
});
