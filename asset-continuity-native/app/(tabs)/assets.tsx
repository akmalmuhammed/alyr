import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  MagnifyingGlass,
  MapPin,
  Plus,
  SlidersHorizontal
} from "phosphor-react-native";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
import { assetLifecycleStatus, isAssetActive } from "@/domain/model";
import { buildPortfolioSnapshot } from "@/domain/portfolio";
import {
  formatLocalizedNumber,
  itemCount,
  placeCount,
  spaceCount,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { getRegisterCopy } from "@/i18n/registerCopy";
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";
import {
  groupRegisterAssets,
  groupRegisterPlaces,
  initialAssetFilter,
  initialCollectionView,
  initialItemGroup,
  initialItemSort,
  initialPlaceGroup,
  initialPlaceSort,
  sortRegisterAssets,
  sortRegisterPlaces,
  type AssetFilter,
  type CollectionView,
  type ItemGroup,
  type ItemSort,
  type PlaceGroup,
  type PlaceSort
} from "@/register/browse";
import { RegisterOrganizerModal } from "@/register/RegisterOrganizerModal";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export {
  initialAssetFilter,
  initialCollectionView,
  initialItemGroup,
  initialItemSort,
  initialPlaceGroup,
  initialPlaceSort
};
export type {
  AssetFilter,
  CollectionView,
  ItemGroup,
  ItemSort,
  PlaceGroup,
  PlaceSort
};

type RegisterRouteParams = {
  readonly view?: string;
  readonly filter?: string;
  readonly itemSort?: string;
  readonly itemGroup?: string;
  readonly placeSort?: string;
  readonly placeGroup?: string;
};

export default function ItemsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RegisterRouteParams>();
  const { can, recordedAssetValues, workspace } = useWorkspace();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const registerCopy = getRegisterCopy(language);
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;

  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [view, setView] = useState<CollectionView>(() =>
    initialCollectionView(params.view)
  );
  const [filter, setFilter] = useState<AssetFilter>(() =>
    initialAssetFilter(params.filter)
  );
  const [itemSort, setItemSort] = useState<ItemSort>(() =>
    initialItemSort(params.itemSort)
  );
  const [itemGroup, setItemGroup] = useState<ItemGroup>(() =>
    initialItemGroup(params.itemGroup)
  );
  const [placeSort, setPlaceSort] = useState<PlaceSort>(() =>
    initialPlaceSort(params.placeSort)
  );
  const [placeGroup, setPlaceGroup] = useState<PlaceGroup>(() =>
    initialPlaceGroup(params.placeGroup)
  );

  useEffect(() => {
    setView(initialCollectionView(params.view));
    setFilter(initialAssetFilter(params.filter));
    setItemSort(initialItemSort(params.itemSort));
    setItemGroup(initialItemGroup(params.itemGroup));
    setPlaceSort(initialPlaceSort(params.placeSort));
    setPlaceGroup(initialPlaceGroup(params.placeGroup));
  }, [
    params.filter,
    params.itemGroup,
    params.itemSort,
    params.placeGroup,
    params.placeSort,
    params.view
  ]);

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

  const activeAssets = useMemo(
    () => workspace?.assets.filter(isAssetActive) ?? [],
    [workspace]
  );

  const filteredAssets = useMemo(() => {
    if (!workspace) return [];
    return workspace.assets.filter((asset) =>
      filter === "archived"
        ? assetLifecycleStatus(asset) === "archived"
        : isAssetActive(asset) &&
          (filter === "all" || reviewIds[filter].has(asset.id))
    );
  }, [filter, reviewIds, workspace]);

  const sortedAssets = useMemo(
    () => sortRegisterAssets(filteredAssets, itemSort, language),
    [filteredAssets, itemSort, language]
  );
  const assetSections = useMemo(
    () =>
      groupRegisterAssets(
        sortedAssets,
        itemGroup,
        language,
        workspace?.places ?? [],
        registerCopy.noPlace
      ),
    [
      itemGroup,
      language,
      registerCopy.noPlace,
      sortedAssets,
      workspace?.places
    ]
  );

  const activeItemCountByPlace = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of activeAssets) {
      if (!asset.placeId) continue;
      counts.set(asset.placeId, (counts.get(asset.placeId) ?? 0) + 1);
    }
    return counts;
  }, [activeAssets]);

  const sortedPlaces = useMemo(
    () =>
      sortRegisterPlaces(
        workspace?.places ?? [],
        placeSort,
        language,
        activeItemCountByPlace
      ),
    [activeItemCountByPlace, language, placeSort, workspace?.places]
  );
  const placeSections = useMemo(
    () =>
      groupRegisterPlaces(
        sortedPlaces,
        placeGroup,
        language,
        registerCopy.noRegion
      ),
    [
      language,
      placeGroup,
      registerCopy.noRegion,
      sortedPlaces
    ]
  );

  if (!workspace) return null;

  const updateView = (next: CollectionView) => {
    setView(next);
    router.setParams({
      view: next === "items" ? undefined : next
    });
  };
  const updateFilter = (next: AssetFilter) => {
    setFilter(next);
    router.setParams({
      filter: next === "all" ? undefined : next
    });
  };
  const updateItemSort = (next: ItemSort) => {
    setItemSort(next);
    router.setParams({
      itemSort: next === "recent" ? undefined : next
    });
  };
  const updateItemGroup = (next: ItemGroup) => {
    setItemGroup(next);
    router.setParams({
      itemGroup: next === "none" ? undefined : next
    });
  };
  const updatePlaceSort = (next: PlaceSort) => {
    setPlaceSort(next);
    router.setParams({
      placeSort: next === "recent" ? undefined : next
    });
  };
  const updatePlaceGroup = (next: PlaceGroup) => {
    setPlaceGroup(next);
    router.setParams({
      placeGroup: next === "none" ? undefined : next
    });
  };

  const canWriteAssets = can("asset.write");
  const canWritePlaces = can("place.write");
  const showOrganizer =
    view === "items"
      ? workspace.assets.length > 0
      : workspace.places.length > 0;
  const currentCount =
    view === "items"
      ? itemCount(filteredAssets.length, language)
      : placeCount(workspace.places.length, language);
  const arrangement =
    view === "items"
      ? [
          filter === "all" ? null : registerCopy.filters[filter],
          registerCopy.itemSorts[itemSort],
          itemGroup === "none"
            ? null
            : registerCopy.itemGroups[itemGroup]
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          registerCopy.placeSorts[placeSort],
          placeGroup === "none"
            ? null
            : registerCopy.placeGroups[placeGroup]
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <>
      <AppScreen testID="assets-screen">
        <View style={[styles.header, rtl && styles.rowReverse]}>
          <View style={styles.headerCopy}>
            <ScreenTitle>{copy.items.title}</ScreenTitle>
            <BodyText muted>{copy.items.intro}</BodyText>
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
            onPress={() => updateView("items")}
          />
          <Segment
            active={view === "places"}
            label={`${copy.items.placesTab} · ${formatLocalizedNumber(
              workspace.places.length,
              language
            )}`}
            onPress={() => updateView("places")}
          />
        </View>

        {!can(view === "places" ? "place.write" : "asset.write") ? (
          <PermissionNotice
            capability={
              view === "places" ? "place.write" : "asset.write"
            }
            testID="items-view-only-notice"
          />
        ) : null}

        {showOrganizer ? (
          <View
            style={[styles.organizerBar, rtl && styles.rowReverse]}
          >
            <View style={styles.organizerCopy}>
              <Text
                accessibilityLabel={`${registerCopy.resultLabel}: ${currentCount}`}
                style={[
                  styles.resultCount,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {currentCount}
              </Text>
              <Text
                style={[
                  styles.arrangement,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {arrangement}
              </Text>
            </View>
            <Pressable
              accessibilityHint={registerCopy.organizeHint}
              accessibilityRole="button"
              onPress={() => setOrganizerOpen(true)}
              style={({ pressed }) => [
                styles.filter,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
            >
              <SlidersHorizontal color={colors.text} size={20} />
              <Text
                style={[
                  styles.organizeLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {registerCopy.organize}
              </Text>
            </Pressable>
          </View>
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
              placeSections.map((section) => (
                <Fragment key={section.id}>
                  {section.label ? (
                    <RegisterGroupHeading
                      count={placeCount(section.records.length, language)}
                      label={section.label}
                      rtl={rtl}
                    />
                  ) : null}
                  {section.records.map((place) => {
                    const assetCount =
                      activeItemCountByPlace.get(place.id) ?? 0;
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
                        onPress={() =>
                          router.push(`/place/${place.id}`)
                        }
                        style={({ pressed }) => [
                          styles.placeRow,
                          rtl && styles.rowReverse,
                          pressed && styles.pressed
                        ]}
                      >
                        <View style={styles.placeMarker}>
                          <MapPin
                            color={colors.text}
                            size={23}
                            weight="regular"
                          />
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
                        <ForwardIcon
                          color={colors.textMuted}
                          size={20}
                        />
                      </Pressable>
                    );
                  })}
                </Fragment>
              ))
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
                <BodyText muted>{copy.items.addPlaceBody}</BodyText>
                {canWritePlaces ? (
                  <PrimaryButton
                    icon={Plus}
                    label={copy.items.addFirstPlace}
                    onPress={() =>
                      router.push("/capture?intent=place")
                    }
                  />
                ) : null}
              </View>
            )}
          </Section>
        ) : (
          <Section>
            {filteredAssets.length > 0 ? (
              assetSections.map((section) => (
                <Fragment key={section.id}>
                  {section.label ? (
                    <RegisterGroupHeading
                      count={itemCount(section.records.length, language)}
                      label={section.label}
                      rtl={rtl}
                    />
                  ) : null}
                  {section.records.map((asset) => (
                    <AssetListItem
                      asset={asset}
                      evidence={workspace.evidence}
                      key={asset.id}
                      onPress={() =>
                        router.push(`/asset/${asset.id}`)
                      }
                      places={workspace.places}
                    />
                  ))}
                </Fragment>
              ))
            ) : activeAssets.length === 0 &&
              filter !== "archived" ? (
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
                <BodyText muted>{copy.items.startBody}</BodyText>
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
                <SlidersHorizontal
                  color={colors.text}
                  size={32}
                  weight="regular"
                />
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
                  onPress={() => updateFilter("all")}
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

      <RegisterOrganizerModal
        copy={registerCopy}
        filter={filter}
        itemGroup={itemGroup}
        itemSort={itemSort}
        onClose={() => setOrganizerOpen(false)}
        onFilterChange={updateFilter}
        onItemGroupChange={updateItemGroup}
        onItemSortChange={updateItemSort}
        onPlaceGroupChange={updatePlaceGroup}
        onPlaceSortChange={updatePlaceSort}
        open={organizerOpen}
        placeGroup={placeGroup}
        placeSort={placeSort}
        rtl={rtl}
        view={view}
      />
    </>
  );
}

function RegisterGroupHeading({
  count,
  label,
  rtl
}: {
  readonly count: string;
  readonly label: string;
  readonly rtl: boolean;
}) {
  return (
    <View style={[styles.groupHeading, rtl && styles.rowReverse]}>
      <Text
        accessibilityRole="header"
        style={[
          styles.groupTitle,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.groupCount,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {count}
      </Text>
    </View>
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
  organizerBar: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  organizerCopy: {
    flex: 1,
    gap: 2
  },
  resultCount: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  arrangement: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  filter: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  organizeLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14
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
  groupHeading: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  groupTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  groupCount: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 20
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
