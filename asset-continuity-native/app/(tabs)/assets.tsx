import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  FunnelSimple,
  MagnifyingGlass,
  MapPin,
  Plus
} from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { AssetListItem } from "@/components/AssetListItem";
import { PermissionNotice } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  IconButton,
  PrimaryButton,
  ScreenTitle,
  Section
} from "@/components/ui";
import {
  assetLifecycleStatus,
  isAssetActive
} from "@/domain/model";
import { buildPortfolioSnapshot } from "@/domain/portfolio";
import {
  formatLocalizedNumber,
  itemCount,
  spaceCount,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

type CollectionView = "items" | "places";
export type AssetFilter =
  | "all"
  | "location"
  | "evidence"
  | "value"
  | "review"
  | "archived";

export function initialCollectionView(
  value: string | undefined
): CollectionView {
  return value === "places" ? "places" : "items";
}

export function initialAssetFilter(
  value: string | undefined
): AssetFilter {
  return value === "location" ||
    value === "evidence" ||
    value === "value" ||
    value === "review" ||
    value === "archived"
    ? value
    : "all";
}

export default function ItemsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    view?: string;
    filter?: string;
  }>();
  const { can, recordedAssetValues, workspace } = useWorkspace();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const [view, setView] = useState<CollectionView>(() =>
    initialCollectionView(params.view)
  );
  const [filter, setFilter] = useState<AssetFilter>(() =>
    initialAssetFilter(params.filter)
  );

  useEffect(() => {
    setView(initialCollectionView(params.view));
    setFilter(initialAssetFilter(params.filter));
  }, [params.filter, params.view]);

  const reviewIds = useMemo(() => {
    if (!workspace) {
      return {
        location: new Set<string>(),
        evidence: new Set<string>(),
        value: new Set<string>(),
        review: new Set<string>()
      };
    }
    const snapshot = buildPortfolioSnapshot(
      workspace,
      recordedAssetValues
    );
    return {
      location: new Set(snapshot.locationGapAssetIds),
      evidence: new Set(snapshot.proofGapAssetIds),
      value: new Set(snapshot.unvaluedAssetIds),
      review: new Set(snapshot.pendingProofReviewAssetIds)
    };
  }, [recordedAssetValues, workspace]);

  const filteredAssets = useMemo(() => {
    if (!workspace) return [];
    return workspace.assets.filter((asset) =>
      filter === "archived"
        ? assetLifecycleStatus(asset) === "archived"
        : isAssetActive(asset) &&
          (filter === "all" ||
            reviewIds[filter].has(asset.id))
    );
  }, [filter, reviewIds, workspace]);

  if (!workspace) return null;
  const canWriteAssets = can("asset.write");
  const canWritePlaces = can("place.write");
  const activeAssets = workspace.assets.filter(isAssetActive);
  const archivedCount = workspace.assets.length - activeAssets.length;

  return (
    <AppScreen testID="assets-screen">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <View style={styles.headerCopy}>
          <ScreenTitle>{copy.items.title}</ScreenTitle>
          <BodyText muted>
            {copy.items.intro}
          </BodyText>
        </View>
        <View style={[styles.headerActions, rtl && styles.rowReverse]}>
          <IconButton
            icon={MagnifyingGlass}
            label={copy.search.title}
            onPress={() => router.push(PRIMARY_ROUTES.search)}
          />
          {canWriteAssets ? (
            <IconButton
              icon={Camera}
              label={copy.items.addItem}
              onPress={() => router.push("/capture")}
            />
          ) : null}
        </View>
      </View>

      <View
        accessibilityRole="tablist"
        style={[styles.segment, rtl && styles.rowReverse]}
      >
        <Segment
          active={view === "items"}
          label={`${copy.items.itemsTab} · ${formatLocalizedNumber(
            activeAssets.length,
            language
          )}`}
          onPress={() => setView("items")}
        />
        <Segment
          active={view === "places"}
          label={`${copy.items.placesTab} · ${formatLocalizedNumber(
            workspace.places.length,
            language
          )}`}
          onPress={() => setView("places")}
        />
      </View>

      {!can(view === "places" ? "place.write" : "asset.write") ? (
        <PermissionNotice
          capability={view === "places" ? "place.write" : "asset.write"}
          testID="items-view-only-notice"
        />
      ) : null}

      {view === "places" ? (
        <Section>
          <View
            style={[
              styles.sectionHeading,
              rtl && styles.rowReverse
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.sectionTitleArabic
              ]}
            >
              {copy.items.yourPlaces}
            </Text>
            {canWritePlaces ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/capture?intent=place")}
                style={styles.inlineAction}
              >
                <Plus color={colors.text} size={19} />
                <Text
                  style={[
                    styles.inlineActionLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.items.addPlace}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {workspace.places.length > 0 ? (
            workspace.places.map((place) => {
              const assetCount = workspace.assets.filter(
                (asset) =>
                  isAssetActive(asset) && asset.placeId === place.id
              ).length;
              const precision =
                place.confirmedAt && place.precision === "exact"
                  ? place.horizontalAccuracyMeters
                      ? `${copy.items.gps} ±${formatLocalizedNumber(
                          Math.round(place.horizontalAccuracyMeters),
                          language
                        )} ${language === "ar" ? "م" : "m"}`
                    : copy.items.locationConfirmed
                  : place.precision === "user_placed"
                    ? copy.items.pinAdjusted
                    : copy.items.pinNeedsReview;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={place.id}
                  onPress={() => router.push(`/place/${place.id}`)}
                  style={({ pressed }) => [
                    styles.placeRow,
                    rtl && styles.rowReverse,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.placeMarker}>
                    <MapPin color={colors.text} size={23} weight="regular" />
                  </View>
                  <View style={styles.placeCopy}>
                    <Text
                      style={[
                        styles.placeName,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {place.name}
                    </Text>
                    <Text
                      style={[
                        styles.placeLocation,
                        rtl && styles.arabic,
                        rtl && styles.rtlText
                      ]}
                    >
                      {place.addressSummary ?? place.regionLabel}
                    </Text>
                    <Text
                      style={[
                        styles.placeMeta,
                        rtl && styles.arabic,
                        rtl && styles.rtlText
                      ]}
                    >
                      {itemCount(assetCount, language)} ·{" "}
                      {spaceCount(place.rooms.length, language)} ·{" "}
                      {precision}
                    </Text>
                  </View>
                  <ForwardIcon color={colors.textMuted} size={20} />
                </Pressable>
              );
            })
          ) : (
            <View style={[styles.empty, rtl && styles.alignEnd]}>
              <MapPin color={colors.text} size={34} weight="regular" />
              <Text
                style={[
                  styles.emptyTitle,
                  rtl && styles.sectionTitleArabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.items.addPlaceTitle}
              </Text>
              <BodyText muted>
                {copy.items.addPlaceBody}
              </BodyText>
              {canWritePlaces ? (
                <PrimaryButton
                  icon={Plus}
                  label={copy.items.addFirstPlace}
                  onPress={() => router.push("/capture?intent=place")}
                />
              ) : null}
            </View>
          )}
        </Section>
      ) : (
        <Section>
          <ScrollView
            accessibilityRole="radiogroup"
            contentContainerStyle={[
              styles.filters,
              rtl && styles.rowReverse
            ]}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRail}
          >
            <Filter
              active={filter === "all"}
              label={copy.items.all}
              onPress={() => setFilter("all")}
            />
            <Filter
              active={filter === "location"}
              label={copy.items.needsLocation}
              onPress={() => setFilter("location")}
            />
            <Filter
              active={filter === "evidence"}
              label={copy.items.needsProof}
              onPress={() => setFilter("evidence")}
            />
            <Filter
              active={filter === "value"}
              label={copy.items.needsValue}
              onPress={() => setFilter("value")}
            />
            <Filter
              active={filter === "review"}
              label={copy.items.reviewProof}
              onPress={() => setFilter("review")}
            />
            <Filter
              active={filter === "archived"}
              label={`${copy.items.archived} · ${formatLocalizedNumber(
                archivedCount,
                language
              )}`}
              onPress={() => setFilter("archived")}
            />
          </ScrollView>

          {filteredAssets.length > 0 ? (
            filteredAssets.map((asset) => (
              <AssetListItem
                asset={asset}
                evidence={workspace.evidence}
                key={asset.id}
                onPress={() => router.push(`/asset/${asset.id}`)}
                places={workspace.places}
              />
            ))
          ) : activeAssets.length === 0 && filter !== "archived" ? (
            <View style={[styles.empty, rtl && styles.alignEnd]}>
              <Text
                style={[
                  styles.emptyTitle,
                  rtl && styles.sectionTitleArabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.items.startTitle}
              </Text>
              <BodyText muted>
                {copy.items.startBody}
              </BodyText>
              {canWriteAssets ? (
                <PrimaryButton
                  icon={Plus}
                  label={copy.items.addFirstItem}
                  onPress={() => router.push("/capture")}
                />
              ) : null}
            </View>
          ) : (
            <View style={[styles.empty, rtl && styles.alignEnd]}>
              <FunnelSimple color={colors.text} size={32} weight="regular" />
              <Text
                style={[
                  styles.emptyTitle,
                  rtl && styles.sectionTitleArabic,
                  rtl && styles.rtlText
                ]}
              >
                {filter === "archived"
                  ? copy.items.noArchived
                  : copy.items.noItems}
              </Text>
              <BodyText muted>
                {filter === "archived"
                  ? copy.items.noArchivedBody
                  : copy.items.noItemsBody}
              </BodyText>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFilter("all")}
                style={styles.clearFilter}
              >
                <Text
                  style={[
                    styles.clearFilterLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.items.clearFilter}
                </Text>
              </Pressable>
            </View>
          )}
        </Section>
      )}
    </AppScreen>
  );
}

function Segment({
  active,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        active && styles.segmentButtonActive,
        pressed && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.segmentButtonLabel,
          active && styles.segmentButtonLabelActive,
          rtl && styles.arabicMedium
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Filter({
  active,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        active && styles.filterActive,
        pressed && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.filterLabel,
          active && styles.filterLabelActive,
          rtl && styles.arabicMedium
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowReverse: {
    flexDirection: "row-reverse"
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  segment: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.mist
  },
  segmentButton: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm
  },
  segmentButtonActive: {
    backgroundColor: colors.surface
  },
  segmentButtonLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  segmentButtonLabelActive: {
    color: colors.text
  },
  sectionHeading: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  sectionTitleArabic: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  inlineAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.xs
  },
  inlineActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  placeRow: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  placeMarker: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  placeCopy: {
    flex: 1,
    gap: 2
  },
  placeName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  placeLocation: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  placeMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  filterRail: {
    marginHorizontal: -20
  },
  filters: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: 20,
    paddingBottom: 2
  },
  filter: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xs,
    backgroundColor: colors.surface
  },
  filterActive: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  filterLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13
  },
  filterLabelActive: {
    color: colors.white
  },
  empty: {
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  clearFilter: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginStart: -spacing.sm
  },
  clearFilterLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    textDecorationLine: "underline"
  },
  pressed: {
    opacity: 0.65
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
