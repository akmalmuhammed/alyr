import {
  Image,
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle
} from "react-native";

const decorativeProps =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const
      };

/**
 * Production brand artwork from the approved ALYR system. Keeping this as a
 * real asset avoids one-off decorative vectors and gives premium command
 * moments a consistent visual signature.
 */
export function BrandSignalRail({
  style
}: {
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View {...decorativeProps} style={[styles.frame, style]}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={require("../../assets/alyr/web/raster-backgrounds/signal-rail-1600x240.png")}
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 1600 / 240,
    overflow: "hidden"
  },
  image: {
    width: "100%",
    height: "100%"
  }
});
