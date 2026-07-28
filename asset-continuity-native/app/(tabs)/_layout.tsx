import { Redirect, Tabs } from "expo-router";
import {
  Cube,
  House,
  ShieldCheck,
  UsersThree
} from "phosphor-react-native";
import {
  Platform,
  StyleSheet,
  View
} from "react-native";
import type { ReactNode } from "react";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { StartupStatus } from "@/components/StartupStatus";
import { useCopy } from "@/i18n/copy";
import { signedOutSampleWorkspaceReady } from "@/state/SessionBoundWorkspaceProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, typography } from "@/theme/tokens";

function TabGlyph({
  children,
  focused
}: {
  readonly children: ReactNode;
  readonly focused: boolean;
}) {
  return (
    <View style={styles.tabGlyph}>
      <View
        style={[
          styles.tabSignal,
          !focused && styles.tabSignalHidden
        ]}
      />
      {children}
    </View>
  );
}

export default function TabsLayout() {
  const { bootstrapState, mode, session } = useAuthFlow();
  const { loading, workspace } = useWorkspace();
  const { rtl, text } = useCopy();
  if (bootstrapState === "bootstrapping" || loading) {
    return (
      <StartupStatus
        kind="workspace"
        testID="tabs-startup-status"
      />
    );
  }
  const signedSessionReady =
    mode === "supabase" &&
    session?.assurance === "verified-email" &&
    session.identity.emailVerified &&
    Boolean(session.activeHouseholdId);
  const localSampleReady = signedOutSampleWorkspaceReady(
    mode,
    session,
    workspace?.mode ?? null
  );
  if (
    !workspace ||
    (mode !== "preview" && !localSampleReady && !signedSessionReady)
  ) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: [
          styles.label,
          rtl && styles.labelArabic
        ],
        tabBarStyle: [
          styles.tabBar,
          rtl && Platform.OS !== "web" && styles.rtl
        ],
        tabBarItemStyle: styles.tabItem
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: text.navToday,
          tabBarAccessibilityLabel: text.navTodayA11y,
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph focused={focused}>
              <House
                color={typeof color === "string" ? color : colors.text}
                size={23}
                weight={focused ? "fill" : "regular"}
              />
            </TabGlyph>
          )
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: text.navItems,
          tabBarAccessibilityLabel: text.navItemsA11y,
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph focused={focused}>
              <Cube
                color={typeof color === "string" ? color : colors.text}
                size={23}
                weight={focused ? "fill" : "regular"}
              />
            </TabGlyph>
          )
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: text.navFamily,
          tabBarAccessibilityLabel: text.navFamilyA11y,
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph focused={focused}>
              <UsersThree
                color={typeof color === "string" ? color : colors.text}
                size={23}
                weight={focused ? "fill" : "regular"}
              />
            </TabGlyph>
          )
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: text.navVault,
          tabBarAccessibilityLabel: text.navVaultA11y,
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph focused={focused}>
              <ShieldCheck
                color={typeof color === "string" ? color : colors.text}
                size={23}
                weight={focused ? "fill" : "regular"}
              />
            </TabGlyph>
          )
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          href: null,
          title: text.navSearch
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: colors.canvas
  },
  tabBar: {
    minHeight: 66,
    paddingTop: 8,
    paddingBottom: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 10
  },
  tabItem: {
    minHeight: 52
  },
  label: {
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: 2
  },
  labelArabic: {
    fontFamily: typography.arabicMedium,
    fontSize: 13,
    lineHeight: 18
  },
  tabGlyph: {
    minWidth: 32,
    height: 30,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4
  },
  tabSignal: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.volt
  },
  tabSignalHidden: {
    opacity: 0
  },
  rtl: Platform.select({
    web: {},
    default: { direction: "rtl" as const }
  })
});
