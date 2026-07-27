import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Platform,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Warning } from "phosphor-react-native";

import { AssetArtworkIcon } from "@/components/AssetArtwork";
import { useAttachmentPreview } from "@/components/AttachmentViewer";
import type {
  CapturedFile,
  NativeAsset,
  NativeEvidence
} from "@/domain/model";
import { getAssetPhotoPreviewCopy } from "@/i18n/assetEditCopy";
import { useLocale } from "@/i18n/LocaleProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const hiddenPhotoDecorationProps =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const
      };

/**
 * These are clearly fictional, privacy-safe product-tour images. They make
 * the sample workspace communicate the finished experience without
 * pretending that the bundled artwork is the immutable evidence blob.
 */
const SAMPLE_ARTWORK: Readonly<Record<string, ImageSourcePropType>> = {
  "asset-gmt": require("../../assets/sample-assets/gmt-watch.png"),
  "asset-heritage": require("../../assets/sample-assets/pearl-necklace.png"),
  "asset-roadster": require("../../assets/sample-assets/roadster.png"),
  "asset-childhood": require("../../assets/sample-assets/childhood-train.png")
};

interface AssetPhotoPreviewProps {
  readonly active: boolean;
  readonly asset: NativeAsset;
  readonly draft?: CapturedFile | null;
  readonly evidence: readonly NativeEvidence[];
  readonly variant: "thumbnail" | "command" | "editor";
}

/**
 * Displays an asset photo without treating the protected blob URI as an image
 * source. Signed builds materialize a verified temporary file through the
 * attachment store; `useAttachmentPreview` removes it on blur, backgrounding,
 * replacement, or unmount. Only that ephemeral URI reaches `<Image>`.
 */
export function AssetPhotoPreview({
  active,
  asset,
  draft = null,
  evidence,
  variant
}: AssetPhotoPreviewProps) {
  const { language, rtl } = useLocale();
  const copy = getAssetPhotoPreviewCopy(language);
  const { attachmentStore, repository, workspace } = useWorkspace();
  const photoEvidence =
    evidence.find((item) => item.id === asset.photoEvidenceId) ?? null;
  const sampleArtworkSource =
    workspace?.mode === "sample" ? SAMPLE_ARTWORK[asset.id] : undefined;
  const sampleArtworkFallback = Boolean(
    workspace?.mode === "sample" &&
      photoEvidence &&
      !asset.photoUri &&
      !asset.photoProtectedUri &&
      !photoEvidence.localUri
  );
  const protectedPhoto = useAttachmentPreview({
    active:
      active &&
      draft === null &&
      photoEvidence !== null &&
      !sampleArtworkFallback,
    encryptedAtRest: repository.encryptedAtRest,
    evidence: photoEvidence,
    encryptedUri: asset.photoProtectedUri,
    previewUri: repository.encryptedAtRest ? undefined : asset.photoUri,
    store: attachmentStore
  });
  const displayUri =
    draft?.localUri ??
    (protectedPhoto.status === "ready" ? protectedPhoto.uri : null);

  if (!displayUri && sampleArtworkSource) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel={copy.illustrativeSampleLabel(asset.name)}
        resizeMode="cover"
        source={sampleArtworkSource}
        style={
          variant === "thumbnail"
            ? styles.thumbnailImage
            : variant === "command"
              ? styles.commandImage
              : styles.editorImage
        }
        testID={`asset-photo-sample-${variant}-${asset.id}`}
      />
    );
  }

  if (displayUri) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel={
          draft
            ? copy.newPrimaryPhotoLabel(asset.name)
            : copy.currentPrimaryPhotoLabel(asset.name)
        }
        resizeMode="cover"
        source={{ uri: displayUri }}
        style={
          variant === "thumbnail"
            ? styles.thumbnailImage
            : variant === "command"
              ? styles.commandImage
              : styles.editorImage
        }
        testID={`asset-photo-${variant}-${asset.id}`}
      />
    );
  }

  if (variant !== "editor") {
    return (
      <View
        {...hiddenPhotoDecorationProps}
        style={
          variant === "command"
            ? styles.commandFallback
            : styles.thumbnailFallback
        }
        testID={`asset-photo-fallback-${variant}-${asset.id}`}
      >
        {protectedPhoto.status === "loading" ? (
          <ActivityIndicator color={colors.textMuted} size="small" />
        ) : (
          <AssetArtworkIcon asset={asset} size={24} />
        )}
      </View>
    );
  }

  const error = protectedPhoto.status === "error";
  const fallbackMessage =
    protectedPhoto.status === "loading"
      ? copy.openingProtectedPhoto
      : error
        ? language === "ar"
          ? copy.protectedPhotoError
          : protectedPhoto.error || copy.protectedPhotoError
        : sampleArtworkFallback
          ? copy.sampleCategoryArtwork
          : asset.photoProtectedUri
            ? copy.photoProtectedOnDevice
            : copy.noPrimaryPhoto;

  return (
    <View
      accessible
      accessibilityLabel={fallbackMessage}
      {...(error
        ? {
            accessibilityLiveRegion: "polite" as const,
            accessibilityRole: "alert" as const
          }
        : protectedPhoto.status === "loading"
          ? {
              accessibilityLiveRegion: "polite" as const,
              accessibilityRole: "progressbar" as const
            }
          : {
              accessibilityRole: "image" as const
            })}
      style={styles.editorFallback}
      testID={`asset-photo-fallback-${variant}-${asset.id}`}
    >
      {protectedPhoto.status === "loading" ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : error ? (
        <Warning color={colors.danger} size={32} weight="regular" />
      ) : (
        <AssetArtworkIcon asset={asset} size={34} />
      )}
      <Text
        style={[
          styles.fallbackLabel,
          rtl && styles.arabicMedium,
          rtl && styles.textRight,
          error && styles.errorLabel
        ]}
      >
        {fallbackMessage}
      </Text>
      {!error ? (
        <Text
          style={[
            styles.fallbackMeta,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {sampleArtworkFallback
            ? copy.sampleMetadataOnly
            : copy.selectedPhotoProtection}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnailImage: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  thumbnailFallback: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden"
  },
  commandImage: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceQuiet
  },
  commandFallback: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: "hidden"
  },
  editorImage: {
    width: "100%",
    height: 224,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceQuiet
  },
  editorFallback: {
    height: 224,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: "hidden"
  },
  fallbackLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center"
  },
  errorLabel: {
    color: colors.danger
  },
  fallbackMeta: {
    maxWidth: 300,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  arabic: {
    fontFamily: typography.arabic,
    writingDirection: "rtl"
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    writingDirection: "rtl"
  },
  textRight: {
    textAlign: "right"
  }
});
