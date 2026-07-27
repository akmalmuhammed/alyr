import { ArrowLeft, ArrowRight } from "phosphor-react-native";
import { Pressable, StyleSheet } from "react-native";

import { colors, radius } from "@/theme/tokens";

export function LocalizedRouteBack({
  label,
  onPress,
  rtl,
  testID
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
  readonly testID: string;
}) {
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed
      ]}
      testID={testID}
    >
      <BackIcon color={colors.text} size={22} weight="regular" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.round
  },
  pressed: {
    opacity: 0.56
  }
});
