import type { Icon } from "phosphor-react-native";
import {
  Camera,
  Car,
  Cloud,
  Cube,
  Diamond,
  HouseLine,
  Palette,
  Train,
  Watch
} from "phosphor-react-native";

import type {
  AssetVisualKind,
  NativeAsset
} from "@/domain/model";
import { colors } from "@/theme/tokens";

export function assetFallbackKind(
  asset: Pick<NativeAsset, "categoryId" | "visualKind">
): AssetVisualKind {
  if (asset.visualKind) {
    return asset.visualKind;
  }
  if (asset.categoryId.includes("watch")) return "watch";
  if (
    asset.categoryId.includes("car") ||
    asset.categoryId.startsWith("vehicle.")
  ) {
    return "vehicle";
  }
  if (asset.categoryId.startsWith("property.")) return "property";
  if (asset.categoryId.includes("art")) return "art";
  if (asset.categoryId.includes("digital")) return "digital";
  return "other";
}

const VISUAL_ICONS: Readonly<Record<AssetVisualKind, Icon>> = {
  watch: Watch,
  vehicle: Car,
  property: HouseLine,
  art: Palette,
  camera: Camera,
  heirloom: Diamond,
  childhood: Train,
  digital: Cloud,
  other: Cube
};

export function AssetArtworkIcon({
  asset,
  color = colors.text,
  size = 24
}: {
  readonly asset: Pick<NativeAsset, "categoryId" | "visualKind">;
  readonly color?: string;
  readonly size?: number;
}) {
  const IconComponent = VISUAL_ICONS[assetFallbackKind(asset)];
  return (
    <IconComponent
      color={color}
      size={size}
      weight="regular"
    />
  );
}
