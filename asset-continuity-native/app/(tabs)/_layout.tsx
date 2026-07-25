import { Redirect, Tabs } from "expo-router";
import {
  Archive,
  House,
  ShieldCheck,
  UsersThree
} from "phosphor-react-native";
import { StyleSheet } from "react-native";

import { useCopy } from "@/i18n/copy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, typography } from "@/theme/tokens";

export default function TabsLayout() {
  const { workspace } = useWorkspace();
  const { text } = useCopy();
  if (!workspace) {
    return <Redirect href="/(onboarding)" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: colors.violetSoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: text.home,
          tabBarIcon: ({ color, focused }) => (
            <House
              color={typeof color === "string" ? color : colors.text}
              size={25}
              weight={focused ? "duotone" : "regular"}
            />
          )
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: text.assets,
          tabBarIcon: ({ color, focused }) => (
            <Archive
              color={typeof color === "string" ? color : colors.text}
              size={25}
              weight={focused ? "duotone" : "regular"}
            />
          )
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: text.family,
          tabBarIcon: ({ color, focused }) => (
            <UsersThree
              color={typeof color === "string" ? color : colors.text}
              size={25}
              weight={focused ? "duotone" : "regular"}
            />
          )
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: text.vault,
          tabBarIcon: ({ color, focused }) => (
            <ShieldCheck
              color={typeof color === "string" ? color : colors.text}
              size={25}
              weight={focused ? "duotone" : "regular"}
            />
          )
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
    height: 78,
    paddingTop: 9,
    paddingBottom: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#050D18"
  },
  tabItem: {
    minHeight: 56
  },
  label: {
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16
  }
});
