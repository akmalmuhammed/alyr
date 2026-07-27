import { useFocusEffect } from "expo-router";
import { ArrowRight } from "phosphor-react-native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AssetPhotoPreview } from "@/components/AssetPhotoPreview";
import type {
  LanguageCode,
  NativeAsset,
  NativeEvidence,
  NativePlace
} from "@/domain/model";
import { assetLifecycleStatus } from "@/domain/model";
import { calculateNativeAssetReadiness } from "@/domain/readiness";
import { localizedCategoryLabel } from "@/i18n/captureCopy";
import { useCopy } from "@/i18n/copy";
import {
  assetListAccessibilityLabel,
  formatEvidenceDeadline,
  getAssetListStateCopy,
  getSecondarySurfaceCopy,
  type AssetListStateKey
} from "@/i18n/secondarySurfaceCopy";
import { colors, radius, spacing, typography } from "@/theme/tokens";

function readinessLabel(
  asset: NativeAsset,
  places: readonly NativePlace[],
  evidence: readonly NativeEvidence[],
  language: LanguageCode
): {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly tone: "attention" | "ready" | "archived";
} {
  const stateCopy = (state: AssetListStateKey) =>
    getAssetListStateCopy(state, language);
  if (assetLifecycleStatus(asset) === "archived") {
    return {
      ...stateCopy("archived"),
      tone: "archived"
    };
  }
  const nextGap = calculateNativeAssetReadiness(asset, places, evidence).nextItem;
  if (!nextGap) {
    const nextDeadline = evidence
      .filter(
        (item) =>
          asset.evidenceIds.includes(item.id) &&
          typeof item.expiresAt === "string"
      )
      .sort(
        (left, right) =>
          Date.parse(left.expiresAt!) - Date.parse(right.expiresAt!)
      )[0]?.expiresAt;
    if (nextDeadline) {
      return {
        ...formatEvidenceDeadline(nextDeadline, language),
        tone: "attention"
      };
    }
    return {
      ...stateCopy("ready"),
      tone: "ready"
    };
  }
  if (nextGap.id === "location") {
    return {
      ...stateCopy("needs-location"),
      tone: "attention"
    };
  }
  if (nextGap.id === "evidence") {
    return {
      ...stateCopy("needs-proof"),
      tone: "attention"
    };
  }
  if (nextGap.id === "photo") {
    return {
      ...stateCopy("add-photo"),
      tone: "attention"
    };
  }
  return {
    ...stateCopy("in-progress"),
    tone: "attention"
  };
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
  const { language, rtl } = useCopy();
  const copy = getSecondarySurfaceCopy(language).assetList;
  const [screenActive, setScreenActive] = useState(false);
  const state = readinessLabel(asset, places, evidence, language);
  const place = places.find((item) => item.id === asset.placeId);
  const room = place?.rooms.find((item) => item.id === asset.roomId);
  const categoryLabel = localizedCategoryLabel(
    asset.categoryId,
    asset.categoryLabel,
    language
  );
  const locationLabel = asset.categoryId.startsWith("digital")
    ? copy.digitalLocation
    : place
      ? [place.name, room?.name, asset.locatorText]
          .filter(Boolean)
          .join(" · ")
      : copy.unknownLocation;

  useFocusEffect(
    useCallback(() => {
      setScreenActive(true);
      return () => setScreenActive(false);
    }, [])
  );

  return (
    <Pressable
      accessibilityHint={copy.openHint}
      accessibilityLabel={assetListAccessibilityLabel(
        asset.name,
        categoryLabel,
        state.accessibilityLabel,
        locationLabel,
        language
      )}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
    >
      <AssetPhotoPreview
        active={screenActive}
        asset={asset}
        evidence={evidence}
        variant="thumbnail"
      />
      <View style={styles.copy}>
        <View style={[styles.nameRow, rtl && styles.rowReverse]}>
          <Text
            style={[
              styles.name,
              styles.mixedScript,
              rtl && styles.textRight
            ]}
          >
            {asset.name}
          </Text>
          <Text
            style={[
              styles.state,
              state.tone === "ready" && styles.stateReady,
              state.tone === "archived" && styles.stateArchived,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {state.label}
          </Text>
        </View>
        <Text
          style={[
            styles.category,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {categoryLabel}
        </Text>
        <Text
          style={[
            styles.location,
            rtl && styles.arabic,
            rtl && styles.textRight,
            styles.mixedScript
          ]}
        >
          {locationLabel}
        </Text>
      </View>
      <ArrowRight
        color={colors.textMuted}
        mirrored={rtl}
        size={20}
        weight="regular"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  pressed: {
    opacity: 0.65
  },
  copy: {
    flex: 1,
    gap: 2
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs
  },
  name: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  state: {
    maxWidth: 96,
    color: colors.warning,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16
  },
  stateReady: {
    color: colors.success
  },
  stateArchived: {
    color: colors.textMuted
  },
  category: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  location: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  textRight: {
    textAlign: "right"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  mixedScript: {
    writingDirection: "auto"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  }
});
