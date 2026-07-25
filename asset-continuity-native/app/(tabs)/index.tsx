import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Camera,
  GlobeHemisphereWest,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkle
} from "phosphor-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  BodyText,
  BrandMark,
  Eyebrow,
  IconButton,
  PrimaryButton,
  ProgressBar,
  ScreenTitle,
  SectionHeader,
  StatusPill,
  Surface
} from "@/components/ui";
import { workspaceProgress } from "@/domain/readiness";
import { useCopy } from "@/i18n/copy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  gradients,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

export default function HomeScreen() {
  const router = useRouter();
  const { workspace, repository, pendingOperationCount } = useWorkspace();
  const { text, rtl } = useCopy();
  if (!workspace) {
    return null;
  }
  const progress = workspaceProgress(workspace.assets);
  const groupedRegions = new Map<string, number>();
  workspace.places.forEach((place) => {
    groupedRegions.set(
      place.regionLabel,
      (groupedRegions.get(place.regionLabel) ?? 0) + 1
    );
  });

  return (
    <AppScreen testID="home-screen">
      <View style={[styles.topBar, rtl && styles.rowReverse]}>
        <BrandMark compact />
        <View style={[styles.topActions, rtl && styles.rowReverse]}>
          <IconButton
            icon={MagnifyingGlass}
            label={text.search}
            onPress={() => router.push("/search")}
          />
          <View style={styles.secureIcon}>
            <LockKey color={colors.volt} size={20} weight="regular" />
          </View>
        </View>
      </View>

      <View style={styles.heading}>
        <View style={[styles.headingStatus, rtl && styles.rowReverse]}>
          <StatusPill
            label={
              workspace.mode === "sample" ? text.sample : text.personal
            }
            tone={workspace.mode === "sample" ? "violet" : "volt"}
          />
          <StatusPill
            label={
              repository.durable ? "Encrypted local store" : "Session preview"
            }
            tone={repository.durable ? "cyan" : "warning"}
          />
        </View>
        <ScreenTitle>{text.everything}</ScreenTitle>
        <BodyText muted>{text.privateMap}</BodyText>
        <View style={[styles.stats, rtl && styles.rowReverse]}>
          <Text style={styles.statStrong}>{workspace.assets.length}</Text>
          <Text style={styles.statMuted}>assets</Text>
          <View style={styles.statDivider} />
          <Text style={styles.statStrong}>{workspace.places.length}</Text>
          <Text style={styles.statMuted}>places</Text>
          <View style={styles.statDivider} />
          <Text style={styles.statAccent}>{progress.percent}%</Text>
          <Text style={styles.statMuted}>registered</Text>
        </View>
      </View>

      <Surface emphasis style={styles.atlas}>
        <LinearGradient
          colors={gradients.atmosphere}
          end={{ x: 0.95, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.atlasHeader, rtl && styles.rowReverse]}>
          <View>
            <Eyebrow tone="cyan">Private atlas</Eyebrow>
            <Text style={styles.atlasTitle}>
              {workspace.places.length > 0
                ? "Your Places at a glance"
                : "Your first Place starts the map"}
            </Text>
          </View>
          <View style={styles.atlasIcon}>
            <GlobeHemisphereWest
              color={colors.cyan}
              size={30}
              weight="duotone"
            />
          </View>
        </View>
        {groupedRegions.size > 0 ? (
          <View style={styles.regionList}>
            {[...groupedRegions.entries()].map(([region, count]) => (
              <View
                key={region}
                style={[styles.regionRow, rtl && styles.rowReverse]}
              >
                <View style={styles.regionPin}>
                  <MapPin color={colors.violetSoft} size={18} weight="fill" />
                </View>
                <View style={styles.regionCopy}>
                  <Text style={styles.regionName}>{region}</Text>
                  <Text style={styles.regionMeta}>
                    {count} {count === 1 ? "Place" : "Places"}
                  </Text>
                </View>
                <View style={styles.regionLine} />
              </View>
            ))}
          </View>
        ) : (
          <BodyText muted>
            Add a home, plot, apartment, or storage location. The globe arrives
            after the capture foundation; the accessible Place list remains the
            source of truth.
          </BodyText>
        )}
      </Surface>

      <Surface emphasis>
        <View style={[styles.nextHeader, rtl && styles.rowReverse]}>
          <View style={styles.nextIcon}>
            <Sparkle color={colors.violetSoft} size={24} weight="duotone" />
          </View>
          <View style={styles.nextCopy}>
            <Eyebrow>{text.nextAction}</Eyebrow>
            <Text style={styles.nextTitle}>{text.continueRegister}</Text>
          </View>
          <Text style={styles.progressCount}>
            {progress.captured}/{progress.target}
          </Text>
        </View>
        <ProgressBar
          label={`${progress.captured} of ${progress.target} critical assets`}
          percent={progress.percent}
        />
        <BodyText muted>
          One complete, searchable Passport is useful immediately. Twenty-five
          creates the first continuity register.
        </BodyText>
        <PrimaryButton
          icon={Camera}
          label={text.captureAsset}
          onPress={() => router.push("/capture")}
        />
      </Surface>

      <View style={styles.section}>
        <SectionHeader
          action={
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/capture?intent=place")}
              style={styles.textAction}
            >
              <Plus color={colors.cyan} size={18} />
              <Text style={styles.textActionLabel}>Add Place</Text>
            </Pressable>
          }
          title={text.places}
        />
        {workspace.places.length > 0 ? (
          workspace.places.map((place) => {
            const assetCount = workspace.assets.filter(
              (asset) => asset.placeId === place.id
            ).length;
            return (
              <Pressable
                accessibilityHint="Opens the Place and its rooms"
                accessibilityRole="button"
                key={place.id}
                onPress={() => router.push(`/place/${place.id}`)}
                style={({ pressed }) => [
                  styles.placeRow,
                  pressed && styles.pressed
                ]}
              >
                <View style={styles.placeGlyph}>
                  <MapPin color={colors.cyan} size={22} weight="duotone" />
                </View>
                <View style={styles.placeCopy}>
                  <Text style={styles.placeName}>{place.name}</Text>
                  <Text style={styles.placeMeta}>
                    {place.regionLabel} · {assetCount} assets ·{" "}
                    {place.rooms.length} spaces
                  </Text>
                </View>
                <ArrowRight color={colors.textMuted} size={20} />
              </Pressable>
            );
          })
        ) : (
          <Surface>
            <ShieldCheck color={colors.violetSoft} size={28} />
            <Text style={styles.emptyTitle}>{text.noPlaces}</Text>
            <BodyText muted>
              A Place can contain rooms, zones, and containers. You can also
              capture an asset now and leave its location unknown.
            </BodyText>
          </Surface>
        )}
      </View>

      <View style={styles.syncFootnote}>
        <View
          style={[
            styles.syncDot,
            pendingOperationCount > 0 && styles.syncDotPending
          ]}
        />
        <Text style={styles.syncText}>
          {pendingOperationCount} local updates waiting ·{" "}
          {repository.durable
            ? "preserved in the encrypted device database"
            : "preview session only"}
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: "row-reverse" },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  secureIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  heading: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  headingStatus: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.xs
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 7,
    paddingTop: spacing.xs
  },
  statStrong: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  statMuted: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14
  },
  statAccent: {
    color: colors.violetSoft,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  statDivider: {
    width: 3,
    height: 3,
    marginHorizontal: 3,
    borderRadius: radius.round,
    backgroundColor: colors.textFaint
  },
  atlas: {
    overflow: "hidden",
    minHeight: 220
  },
  atlasHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.lg
  },
  atlasTitle: {
    maxWidth: 260,
    paddingTop: 4,
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  atlasIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 216, 245, 0.26)",
    borderRadius: radius.round,
    backgroundColor: colors.cyanQuiet
  },
  regionList: {
    gap: spacing.sm
  },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  regionPin: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.round,
    backgroundColor: colors.violetQuiet
  },
  regionCopy: {
    minWidth: 90,
    gap: 2
  },
  regionName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14
  },
  regionMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  },
  regionLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border
  },
  nextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  nextIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.violetQuiet
  },
  nextCopy: {
    flex: 1,
    gap: 2
  },
  nextTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  progressCount: {
    color: colors.cyan,
    fontFamily: typography.bodyBold,
    fontSize: 18
  },
  section: {
    gap: spacing.sm
  },
  textAction: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm
  },
  textActionLabel: {
    color: colors.cyan,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  placeRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  placeGlyph: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.cyanQuiet
  },
  placeCopy: {
    flex: 1,
    gap: 4
  },
  placeName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16
  },
  placeMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.72
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18
  },
  syncFootnote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: radius.round,
    backgroundColor: colors.textFaint
  },
  syncDotPending: {
    backgroundColor: colors.warning
  },
  syncText: {
    flex: 1,
    color: colors.textFaint,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  }
});
