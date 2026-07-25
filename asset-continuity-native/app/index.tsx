import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors } from "@/theme/tokens";

export default function IndexScreen() {
  const { loading, workspace } = useWorkspace();
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.cyan} size="small" />
      </View>
    );
  }
  return workspace ? (
    <Redirect href="/(tabs)" />
  ) : (
    <Redirect href="/(onboarding)" />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas
  }
});
