import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Archive,
  Check,
  CheckCircle,
  File,
  ImageSquare,
  MapPin,
  Warning
} from "phosphor-react-native";
import { Alert, Image, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  BodyText,
  Eyebrow,
  PrimaryButton,
  ProgressBar,
  ScreenTitle,
  StatusPill,
  Surface
} from "@/components/ui";
import { calculateNativeAssetReadiness } from "@/domain/readiness";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export default function AssetPassportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { workspace, markRetrieved } = useWorkspace();
  const asset = workspace?.assets.find((item) => item.id === id);
  if (!workspace || !asset) {
    return (
      <AppScreen>
        <Surface>
          <Warning color={colors.warning} size={30} />
          <Text style={styles.sectionTitle}>Passport not found</Text>
          <BodyText muted>
            This record may have been removed from the current workspace.
          </BodyText>
        </Surface>
      </AppScreen>
    );
  }

  const readiness = calculateNativeAssetReadiness(
    asset,
    workspace.places,
    workspace.evidence
  );
  const evidence = workspace.evidence.filter((item) =>
    asset.evidenceIds.includes(item.id)
  );
  const place = workspace.places.find((item) => item.id === asset.placeId);
  const room = place?.rooms.find((item) => item.id === asset.roomId);
  const path = asset.categoryId.startsWith("digital")
    ? "No physical location"
    : place
      ? [place.name, room?.name, asset.locatorText]
          .filter(Boolean)
          .join("  ›  ")
      : "Unknown · add when remembered";

  const confirmRetrieval = async () => {
    await markRetrieved(asset.id);
    Alert.alert(
      "Retrieval recorded",
      "ALYR saved only the successful retrieval event—not your search text."
    );
  };

  return (
    <AppScreen testID="asset-passport-screen">
      {asset.photoUri ? (
        <Image source={{ uri: asset.photoUri }} style={styles.heroImage} />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Archive color={colors.violetSoft} size={56} weight="duotone" />
        </View>
      )}

      <View style={styles.heading}>
        <View style={styles.statusRow}>
          <StatusPill label={asset.categoryLabel} tone="violet" />
          <StatusPill label="On device" tone="cyan" />
        </View>
        <ScreenTitle>{asset.name}</ScreenTitle>
        <BodyText muted>
          Created {new Date(asset.createdAt).toLocaleDateString()} · changes
          append to the record
        </BodyText>
      </View>

      <Surface emphasis>
        <View style={styles.readinessHeader}>
          <View>
            <Eyebrow tone="cyan">Passport readiness</Eyebrow>
            <Text style={styles.readinessValue}>{readiness.percent}%</Text>
          </View>
          <CheckCircle
            color={readiness.percent === 100 ? colors.volt : colors.violetSoft}
            size={38}
            weight="duotone"
          />
        </View>
        <ProgressBar
          label={`Passport is ${readiness.percent} percent ready`}
          percent={readiness.percent}
        />
        <View style={styles.checklist}>
          {readiness.items.map((item) => (
            <View key={item.id} style={styles.checkRow}>
              <View
                style={[
                  styles.checkIcon,
                  item.complete && styles.checkIconComplete
                ]}
              >
                {item.complete ? (
                  <Check color={colors.canvas} size={14} weight="bold" />
                ) : (
                  <View style={styles.checkDot} />
                )}
              </View>
              <Text
                style={[
                  styles.checkLabel,
                  item.complete && styles.checkLabelComplete
                ]}
              >
                {item.label}
              </Text>
              <Text style={styles.checkWeight}>{item.weight}%</Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface>
        <View style={styles.sectionIconRow}>
          <View style={styles.sectionIcon}>
            <MapPin color={colors.cyan} size={22} weight="duotone" />
          </View>
          <View style={styles.sectionCopy}>
            <Eyebrow tone="cyan">Retrieval path</Eyebrow>
            <Text style={styles.sectionTitle}>{path}</Text>
          </View>
        </View>
        {place?.horizontalAccuracyMeters !== null &&
        place?.horizontalAccuracyMeters !== undefined ? (
          <BodyText muted>
            GPS reading ±{Math.round(place.horizontalAccuracyMeters)} m ·{" "}
            {place.precision}. The indoor path is recorded separately.
          </BodyText>
        ) : (
          <BodyText muted>
            {place
              ? `Property pin: ${place.precision}. No measured GPS accuracy is claimed.`
              : "ALYR will not guess a Place."}
          </BodyText>
        )}
        <PrimaryButton
          icon={CheckCircle}
          label="I found this item"
          onPress={() => void confirmRetrieval()}
        />
      </Surface>

      <Surface>
        <View style={styles.sectionIconRow}>
          <View style={styles.sectionIconViolet}>
            <File color={colors.violetSoft} size={22} weight="duotone" />
          </View>
          <View style={styles.sectionCopy}>
            <Eyebrow>Supporting materials</Eyebrow>
            <Text style={styles.sectionTitle}>
              {evidence.length} {evidence.length === 1 ? "record" : "records"}
            </Text>
          </View>
        </View>
        {evidence.length > 0 ? (
          evidence.map((item) => (
            <View key={item.id} style={styles.evidenceRow}>
              <ImageSquare color={colors.textMuted} size={21} />
              <View style={styles.evidenceCopy}>
                <Text numberOfLines={1} style={styles.evidenceName}>
                  {item.fileName}
                </Text>
                <Text style={styles.evidenceMeta}>
                  {item.reviewStatus === "reviewed"
                    ? "Reviewed by you"
                    : "Pending your review"}{" "}
                  · {item.storageState}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <BodyText muted>
            No paper or artifact is attached yet. Missing evidence stays visible
            instead of reducing trust silently.
          </BodyText>
        )}
      </Surface>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroImage: {
    width: "100%",
    aspectRatio: 1.7,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  heroPlaceholder: {
    width: "100%",
    aspectRatio: 1.9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
    borderRadius: radius.lg,
    backgroundColor: colors.violetQuiet
  },
  heading: {
    gap: spacing.sm
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  readinessHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  readinessValue: {
    paddingTop: 3,
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 36,
    lineHeight: 42
  },
  checklist: {
    gap: spacing.sm
  },
  checkRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  checkIcon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round
  },
  checkIconComplete: {
    borderColor: colors.volt,
    backgroundColor: colors.volt
  },
  checkDot: {
    width: 5,
    height: 5,
    borderRadius: radius.round,
    backgroundColor: colors.textFaint
  },
  checkLabel: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14
  },
  checkLabelComplete: {
    color: colors.text
  },
  checkWeight: {
    color: colors.textFaint,
    fontFamily: typography.bodyMedium,
    fontSize: 12
  },
  sectionIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  sectionIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.cyanQuiet
  },
  sectionIconViolet: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.violetQuiet
  },
  sectionCopy: {
    flex: 1,
    gap: 2
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  evidenceRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  evidenceCopy: {
    flex: 1,
    gap: 3
  },
  evidenceName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  evidenceMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  }
});
