import type { Icon } from "phosphor-react-native";
import {
  ArrowRight,
  Car,
  Cloud,
  Cube,
  HouseLine,
  ImageSquare,
  Palette,
  Watch
} from "phosphor-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type {
  NativeAsset,
  NativeEvidence,
  NativePlace
} from "@/domain/model";
import { calculateNativeAssetReadiness } from "@/domain/readiness";
import { useCopy } from "@/i18n/copy";
import { colors, radius, spacing, typography } from "@/theme/tokens";

function categoryIcon(categoryId: string): Icon {
  if (categoryId.includes("watch")) return Watch;
  if (categoryId.includes("car")) return Car;
  if (categoryId.includes("real-estate")) return HouseLine;
  if (categoryId.includes("art")) return Palette;
  if (categoryId.includes("digital")) return Cloud;
  return Cube;
}

export function AssetListItem({
  asset,
  places,
  evidence,
  onPress
}: {
  readonly asset: NativeAsset;
  readonly places: readonly NativePlace[];
  readonly evidence: readonly NativeEvidence[];
  readonly onPress: () => void;
}) {
  const { rtl } = useCopy();
  const IconComponent = categoryIcon(asset.categoryId);
  const readiness = calculateNativeAssetReadiness(asset, places, evidence);
  const place = places.find((item) => item.id === asset.placeId);
  const room = place?.rooms.find((item) => item.id === asset.roomId);
  const locationLabel = asset.categoryId.startsWith("digital")
    ? "No physical location"
    : place
      ? [place.name, room?.name, asset.locatorText]
          .filter(Boolean)
          .join(" · ")
      : "Location unknown";

  return (
    <Pressable
      accessibilityHint="Opens this Asset Passport"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
    >
      {asset.photoUri ? (
        <Image source={{ uri: asset.photoUri }} style={styles.photo} />
      ) : (
        <View style={styles.glyph}>
          <IconComponent color={colors.violetSoft} size={24} weight="duotone" />
        </View>
      )}
      <View style={styles.copy}>
        <View style={[styles.nameRow, rtl && styles.rowReverse]}>
          <Text numberOfLines={1} style={[styles.name, rtl && styles.textRight]}>
            {asset.name}
          </Text>
          <Text style={styles.percent}>{readiness.percent}%</Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.category, rtl && styles.textRight]}
        >
          {asset.categoryLabel}
        </Text>
        <View style={[styles.locationRow, rtl && styles.rowReverse]}>
          <Text
            numberOfLines={1}
            style={[styles.location, rtl && styles.textRight]}
          >
            {locationLabel}
          </Text>
          {asset.evidenceIds.length === 0 ? (
            <View style={styles.gapTag}>
              <ImageSquare color={colors.warning} size={13} />
              <Text style={styles.gapText}>Proof gap</Text>
            </View>
          ) : null}
        </View>
      </View>
      <ArrowRight
        color={colors.textMuted}
        mirrored={rtl}
        size={19}
        weight="regular"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  pressed: {
    opacity: 0.7
  },
  photo: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  glyph: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.24)",
    borderRadius: radius.md,
    backgroundColor: colors.violetQuiet
  },
  copy: {
    flex: 1,
    gap: 3
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  name: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  percent: {
    color: colors.cyan,
    fontFamily: typography.bodyBold,
    fontSize: 12
  },
  category: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  location: {
    flex: 1,
    color: colors.textFaint,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  gapTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.warningQuiet
  },
  gapText: {
    color: colors.warning,
    fontFamily: typography.bodyMedium,
    fontSize: 10
  },
  textRight: {
    textAlign: "right"
  }
});
