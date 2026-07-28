import {
  ArrowLeft,
  ArrowRight,
  GlobeHemisphereWest,
  ListBullets,
  MapPin,
  WarningCircle
} from "phosphor-react-native";
import { useRouter } from "expo-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { AssetListItem } from "@/components/AssetListItem";
import { PermissionNotice } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  Eyebrow,
  ScreenTitle,
  Section,
  SectionHeader
} from "@/components/ui";
import {
  ATLAS_COASTLINE_RENDER_LINES,
  ATLAS_GRATICULE_RENDER_LINES,
  assetsNeedingPhysicalPlace,
  atlasCenter,
  moveAtlasCenter,
  projectPreparedAtlasPolyline,
  projectOnAtlas,
  type AtlasCoordinates,
  type AtlasProjection
} from "@/domain/atlas";

import type { LanguageCode, NativePlace } from "@/domain/model";
import { playTactileFeedback } from "@/feedback/tactileFeedback";
import {
  atlasGlobeAccessibilityLabel,
  atlasItemCount,
  atlasItemsAt,
  atlasLocationWork,
  atlasMappedPlaceCount,
  atlasMappedPlaceLabel,
  atlasPlaceCount,
  atlasPositionLabel,
  atlasSpaceCount,
  localizedAtlasPinDisclosure,
  useSecondarySurfaceCopy
} from "@/i18n/secondarySurfaceCopy";
import {
  atlasLocationWorkRoute,
  type AtlasLocationWorkKind
} from "@/navigation/atlasLocationWork";
import {
  placeHasPin,
  placeNeedsPinReview
} from "@/register/browse";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  themes,
  typography
} from "@/theme/tokens";

const hiddenMapDecorationProps =
  Platform.OS === "web"
    ? { "aria-hidden": true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const
      };

interface PinnedPlace {
  readonly place: NativePlace;
  readonly latitude: number;
  readonly longitude: number;
  readonly assetCount: number;
}

type AtlasView = "globe" | "list";

const ATLAS_DRAG_THRESHOLD = 7;

export function shouldActivateAtlasDrag(
  deltaX: number,
  deltaY: number
): boolean {
  return Math.hypot(deltaX, deltaY) > ATLAS_DRAG_THRESHOLD;
}

function hasValidPin(
  place: NativePlace
): place is NativePlace & { readonly latitude: number; readonly longitude: number } {
  return placeHasPin(place);
}

function placePinLabel(
  place: NativePlace,
  language: LanguageCode,
  noCoordinate: string
): string {
  return hasValidPin(place)
    ? localizedAtlasPinDisclosure(place, language)
    : noCoordinate;
}

function projectedPath(
  segment: readonly AtlasProjection[],
  sphereRadius: number,
  projectionRadius: number
): string {
  return segment
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      const x = sphereRadius + point.x * projectionRadius;
      const y = sphereRadius + point.y * projectionRadius;
      return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function AtlasScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotionPreference();
  const { width } = useWindowDimensions();
  const { copy, language, rtl } = useSecondarySurfaceCopy();
  const atlasCopy = copy.atlas;
  const { can, workspace } = useWorkspace();
  const canWritePlaces = can("place.write");
  const places = workspace?.places ?? [];
  const activeAssets = useMemo(
    () =>
      (workspace?.assets ?? []).filter(
        (asset) => asset.lifecycleStatus === "active"
      ),
    [workspace?.assets]
  );
  const pinnedPlaces = useMemo<PinnedPlace[]>(
    () =>
      places.flatMap((place) =>
        hasValidPin(place)
          ? [
              {
                place,
                latitude: place.latitude,
                longitude: place.longitude,
                assetCount: activeAssets.filter(
                  (asset) => asset.placeId === place.id
                ).length
              }
            ]
          : []
      ),
    [activeAssets, places]
  );

  const [view, setView] = useState<AtlasView>("globe");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    pinnedPlaces[0]?.place.id ?? null
  );
  const initialCenter = atlasCenter(
    pinnedPlaces[0] ?? null,
    pinnedPlaces
  );
  const [cameraCenter, setCameraCenter] =
    useState<AtlasCoordinates>(initialCenter);
  const cameraCenterRef = useRef<AtlasCoordinates>(initialCenter);
  const dragStart = useRef<AtlasCoordinates>(initialCenter);
  const pendingDrag = useRef<{
    readonly deltaX: number;
    readonly deltaY: number;
  } | null>(null);
  const cameraFrame = useRef<number | null>(null);

  useEffect(() => {
    cameraCenterRef.current = cameraCenter;
  }, [cameraCenter]);

  useEffect(
    () => () => {
      if (cameraFrame.current !== null) {
        cancelAnimationFrame(cameraFrame.current);
        cameraFrame.current = null;
      }
      pendingDrag.current = null;
    },
    []
  );

  useEffect(() => {
    if (
      selectedPlaceId !== null &&
      !pinnedPlaces.some((entry) => entry.place.id === selectedPlaceId)
    ) {
      const fallback = pinnedPlaces[0] ?? null;
      setSelectedPlaceId(fallback?.place.id ?? null);
      setCameraCenter(atlasCenter(fallback, pinnedPlaces));
    } else if (selectedPlaceId === null && pinnedPlaces.length > 0) {
      const fallback = pinnedPlaces[0]!;
      setSelectedPlaceId(fallback.place.id);
      setCameraCenter(fallback);
    }
  }, [pinnedPlaces, selectedPlaceId]);

  const selectedIndex = Math.max(
    0,
    pinnedPlaces.findIndex(
      (entry) => entry.place.id === selectedPlaceId
    )
  );
  const selected = pinnedPlaces[selectedIndex] ?? null;
  const selectedAssets = selected
    ? activeAssets.filter(
        (asset) => asset.placeId === selected.place.id
      )
    : [];
  const diameter = Math.min(
    318,
    Math.max(248, width - 40 - spacing.xxl)
  );
  const sphereRadius = diameter / 2;
  const projectionRadius = sphereRadius - 14;

  const projections = useMemo(
    () =>
      pinnedPlaces.map((entry) => ({
        ...entry,
        projection: projectOnAtlas(entry, cameraCenter)
      })),
    [cameraCenter, pinnedPlaces]
  );
  const graticulePaths = useMemo(
    () =>
      ATLAS_GRATICULE_RENDER_LINES.flatMap((line) =>
        projectPreparedAtlasPolyline(line, cameraCenter)
      ).map((segment) =>
        projectedPath(segment, sphereRadius, projectionRadius)
      ),
    [cameraCenter, projectionRadius, sphereRadius]
  );
  const coastlinePaths = useMemo(
    () =>
      ATLAS_COASTLINE_RENDER_LINES.flatMap((line) =>
        projectPreparedAtlasPolyline(line, cameraCenter)
      ).map((segment) =>
        projectedPath(segment, sphereRadius, projectionRadius)
      ),
    [cameraCenter, projectionRadius, sphereRadius]
  );
  const visibleCount = projections.filter(
    (entry) => entry.projection.visible
  ).length;
  const unpinnedCount = places.filter(
    (place) => !placeHasPin(place)
  ).length;
  const unconfirmedPinCount = places.filter(
    placeNeedsPinReview
  ).length;
  const unplacedAssetCount =
    assetsNeedingPhysicalPlace(activeAssets).length;
  const locationWork: {
    readonly kind: AtlasLocationWorkKind;
    readonly label: string;
  }[] = [];
  if (unpinnedCount > 0) {
    locationWork.push({
      kind: "no-pin",
      label: atlasLocationWork("unpinned", unpinnedCount, language)
    });
  }
  if (unconfirmedPinCount > 0) {
    locationWork.push({
      kind: "pin-review",
      label: atlasLocationWork(
        "review",
        unconfirmedPinCount,
        language
      )
    });
  }
  if (unplacedAssetCount > 0) {
    locationWork.push({
      kind: "unplaced-items",
      label: atlasLocationWork(
        "unplaced",
        unplacedAssetCount,
        language
      )
    });
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          shouldActivateAtlasDrag(gesture.dx, gesture.dy),
        onPanResponderGrant: () => {
          if (cameraFrame.current !== null) {
            cancelAnimationFrame(cameraFrame.current);
            cameraFrame.current = null;
          }
          pendingDrag.current = null;
          dragStart.current = cameraCenterRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          pendingDrag.current = {
            deltaX: gesture.dx,
            deltaY: gesture.dy
          };
          if (cameraFrame.current !== null) return;

          cameraFrame.current = requestAnimationFrame(() => {
            cameraFrame.current = null;
            const pending = pendingDrag.current;
            pendingDrag.current = null;
            if (!pending) return;

            setCameraCenter(
              moveAtlasCenter(
                dragStart.current,
                pending.deltaX,
                pending.deltaY,
                diameter
              )
            );
          });
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false
      }),
    [diameter]
  );

  function focusPlace(entry: PinnedPlace) {
    setSelectedPlaceId(entry.place.id);
    setCameraCenter(entry);
    void playTactileFeedback("selection", { reduceMotion });
  }

  function rotate(step: -1 | 1) {
    if (pinnedPlaces.length < 2) return;
    const nextIndex =
      (selectedIndex + step + pinnedPlaces.length) % pinnedPlaces.length;
    focusPlace(pinnedPlaces[nextIndex]!);
  }

  if (!workspace) return null;

  return (
    <AppScreen
      contentStyle={styles.screenContent}
      safeEdges={[]}
      testID="atlas-screen"
    >
      <View style={styles.heading}>
        <Eyebrow>{atlasCopy.eyebrow}</Eyebrow>
        <ScreenTitle>{atlasCopy.title}</ScreenTitle>
        <BodyText muted>{atlasCopy.intro}</BodyText>
      </View>

      {!canWritePlaces ? (
        <PermissionNotice
          capability="place.write"
          testID="atlas-view-only-notice"
        />
      ) : null}

      <View
        accessibilityLabel={atlasCopy.viewLabel}
        style={[
          styles.viewSwitch,
          rtl && styles.rowReverse
        ]}
      >
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: view === "globe" }}
          onPress={() => setView("globe")}
          style={({ pressed }) => [
            styles.viewTab,
            rtl && styles.rowReverse,
            view === "globe" && styles.viewTabSelected,
            pressed && styles.pressed
          ]}
          testID="atlas-view-tab-globe"
        >
          <GlobeHemisphereWest
            color={view === "globe" ? colors.carbon : colors.textMuted}
            size={19}
            weight="regular"
          />
          <Text
            style={[
              styles.viewTabLabel,
              view === "globe" && styles.viewTabLabelSelected,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {atlasCopy.globe}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: view === "list" }}
          onPress={() => setView("list")}
          style={({ pressed }) => [
            styles.viewTab,
            rtl && styles.rowReverse,
            view === "list" && styles.viewTabSelected,
            pressed && styles.pressed
          ]}
          testID="atlas-view-tab-list"
        >
          <ListBullets
            color={view === "list" ? colors.carbon : colors.textMuted}
            size={19}
            weight="regular"
          />
          <Text
            style={[
              styles.viewTabLabel,
              view === "list" && styles.viewTabLabelSelected,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {atlasCopy.list}
          </Text>
        </Pressable>
      </View>

      {view === "globe" ? (
        <>
          <View
            accessibilityLabel={atlasGlobeAccessibilityLabel(
              pinnedPlaces.length,
              visibleCount,
              selected
                ? {
                    name: selected.place.name,
                    region: selected.place.regionLabel
                  }
                : null,
              language
            )}
            style={styles.geographyCanvas}
          >
            <View
              style={[
                styles.canvasHeader,
                rtl && styles.rowReverse
              ]}
            >
              <View style={styles.canvasHeaderCopy}>
                <Text
                  style={[
                    styles.canvasKicker,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {atlasCopy.selectedRegion}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.canvasRegion,
                    rtl && styles.arabicMedium,
                    styles.mixedScript,
                    rtl && styles.textRight
                  ]}
                >
                  {selected?.place.regionLabel || atlasCopy.noMappedRegion}
                </Text>
              </View>
              <View
                style={[
                  styles.canvasCount,
                  rtl && styles.canvasCountRtl
                ]}
              >
                <Text style={styles.canvasCountValue}>
                  {language === "ar"
                    ? new Intl.NumberFormat("ar-QA").format(
                        pinnedPlaces.length
                      )
                    : pinnedPlaces.length}
                </Text>
                <Text
                  style={[
                    styles.canvasCountLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {atlasMappedPlaceLabel(
                    pinnedPlaces.length,
                    language
                  )}
                </Text>
              </View>
            </View>

            <View
              {...panResponder.panHandlers}
              style={[
                styles.globe,
                {
                  width: diameter,
                  height: diameter,
                  borderRadius: diameter / 2
                }
              ]}
            >
              <View
                {...hiddenMapDecorationProps}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              >
                <Svg
                  height={diameter}
                  viewBox={`0 0 ${diameter} ${diameter}`}
                  width={diameter}
                >
                  <Circle
                    cx={sphereRadius}
                    cy={sphereRadius}
                    fill={themes.dark.surface}
                    r={sphereRadius - 1}
                    stroke={themes.dark.borderStrong}
                    strokeWidth="1"
                  />
                  {graticulePaths.map((path, index) => (
                    <Path
                      d={path}
                      fill="none"
                      key={`grid-${index}`}
                      opacity={0.09}
                      stroke={colors.concrete}
                      strokeWidth="0.75"
                    />
                  ))}
                  {coastlinePaths.map((path, index) => (
                    <Path
                      d={path}
                      fill="none"
                      key={`coast-${index}`}
                      opacity={0.56}
                      stroke={colors.concrete}
                      strokeLinejoin="round"
                      strokeWidth="1.15"
                    />
                  ))}
                  {projections
                    .filter((entry) => entry.projection.visible)
                    .map((entry) => {
                      const isSelected =
                        entry.place.id === selected?.place.id;
                      const x =
                        sphereRadius +
                        entry.projection.x * projectionRadius;
                      const y =
                        sphereRadius +
                        entry.projection.y * projectionRadius;
                      return (
                        <Circle
                          cx={x}
                          cy={y}
                          fill={colors.volt}
                          key={`halo-${entry.place.id}`}
                          opacity={isSelected ? 0.16 : 0}
                          r={isSelected ? 11 : 0}
                        />
                      );
                    })}
                  {projections
                    .filter((entry) => entry.projection.visible)
                    .map((entry) => {
                      const isSelected =
                        entry.place.id === selected?.place.id;
                      return (
                        <Circle
                          cx={
                            sphereRadius +
                            entry.projection.x * projectionRadius
                          }
                          cy={
                            sphereRadius +
                            entry.projection.y * projectionRadius
                          }
                          fill={isSelected ? colors.volt : colors.white}
                          key={entry.place.id}
                          opacity={
                            isSelected
                              ? 1
                              : Math.max(0.54, entry.projection.depth)
                          }
                          r={isSelected ? 4 : 3}
                          stroke={themes.dark.surface}
                          strokeWidth={isSelected ? 1.5 : 1}
                        />
                      );
                    })}
                </Svg>
              </View>

              {projections
                .filter((entry) => entry.projection.visible)
                .map((entry) => {
                  const selectedPin =
                    entry.place.id === selected?.place.id;
                  return (
                    <Pressable
                      accessibilityHint={atlasCopy.pinSelectHint}
                      accessibilityLabel={`${entry.place.name}, ${
                        entry.place.regionLabel
                      }, ${atlasItemCount(entry.assetCount, language)}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedPin }}
                      hitSlop={4}
                      key={entry.place.id}
                      onPress={() => focusPlace(entry)}
                      style={({ pressed }) => [
                        styles.pinTarget,
                        {
                          left:
                            sphereRadius +
                            entry.projection.x * projectionRadius -
                            22,
                          top:
                            sphereRadius +
                            entry.projection.y * projectionRadius -
                            22
                        },
                        pressed && styles.pressed
                      ]}
                    />
                  );
                })}

            </View>

            <Text
              style={[
                styles.interactionHint,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {atlasCopy.dragHint}
            </Text>

            <View
              style={[
                styles.rotateControls,
                rtl && styles.rowReverse
              ]}
            >
              <Pressable
                accessibilityLabel={atlasCopy.previousPlace}
                accessibilityRole="button"
                accessibilityState={{ disabled: pinnedPlaces.length < 2 }}
                disabled={pinnedPlaces.length < 2}
                onPress={() => rotate(-1)}
                style={({ pressed }) => [
                  styles.atlasNavButton,
                  pinnedPlaces.length < 2 && styles.disabled,
                  pressed && styles.pressed
                ]}
              >
                <ArrowLeft
                  color={colors.white}
                  mirrored={rtl}
                  size={20}
                />
              </Pressable>
              <View style={styles.positionCopy}>
                <Text
                  style={[
                    styles.positionLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {pinnedPlaces.length === 0
                    ? atlasCopy.noPropertyPins
                    : atlasPositionLabel(
                        selectedIndex + 1,
                        pinnedPlaces.length,
                        language
                      )}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.positionName,
                    rtl && styles.arabicMedium,
                    styles.mixedScript,
                    rtl && styles.textRight
                  ]}
                >
                  {selected?.place.name ?? atlasCopy.addPinToBegin}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={atlasCopy.nextPlace}
                accessibilityRole="button"
                accessibilityState={{ disabled: pinnedPlaces.length < 2 }}
                disabled={pinnedPlaces.length < 2}
                onPress={() => rotate(1)}
                style={({ pressed }) => [
                  styles.atlasNavButton,
                  pinnedPlaces.length < 2 && styles.disabled,
                  pressed && styles.pressed
                ]}
              >
                <ArrowRight
                  color={colors.white}
                  mirrored={rtl}
                  size={20}
                />
              </Pressable>
            </View>

            {selected ? (
              <View
                style={[
                  styles.selectedSummary,
                  rtl && styles.selectedSummaryRtl
                ]}
              >
                <Text
                  style={[
                    styles.selectedKicker,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {atlasCopy.selectedPlace}
                </Text>
                <Text
                  style={[
                    styles.selectedTitle,
                    rtl && styles.arabicMedium,
                    styles.mixedScript,
                    rtl && styles.textRight
                  ]}
                >
                  {selected.place.name}
                </Text>
                <Text
                  style={[
                    styles.selectedMeta,
                    rtl && styles.arabic,
                    styles.mixedScript,
                    rtl && styles.textRight
                  ]}
                >
                  {selected.place.regionLabel} ·{" "}
                  {atlasItemCount(selected.assetCount, language)} ·{" "}
                  {atlasSpaceCount(
                    selected.place.rooms.length,
                    language
                  )}
                </Text>
                <Text
                  style={[
                    styles.selectedPrecision,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {placePinLabel(
                    selected.place,
                    language,
                    atlasCopy.pinNeededNoCoordinate
                  )}
                </Text>
                <Pressable
                  accessibilityHint={atlasCopy.openPlaceHint}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push(`/place/${selected.place.id}`)
                  }
                  style={({ pressed }) => [
                    styles.commandAction,
                    rtl && styles.rowReverse,
                    pressed && styles.pressed
                  ]}
                >
                  <Text
                    style={[
                      styles.commandActionLabel,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {atlasCopy.openPlace}
                  </Text>
                  <ArrowRight
                    color={colors.carbon}
                    mirrored={rtl}
                    size={18}
                  />
                </Pressable>
              </View>
            ) : (
              <View
                style={[
                  styles.selectedSummary,
                  rtl && styles.selectedSummaryRtl
                ]}
              >
                <Text
                  style={[
                    styles.selectedKicker,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {atlasCopy.atlasStart}
                </Text>
                <Text
                  style={[
                    styles.selectedTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {atlasCopy.addFirstPin}
                </Text>
                <Text
                  style={[
                    styles.selectedMeta,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {atlasCopy.firstPinBody}
                </Text>
                {canWritePlaces ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/capture?intent=place")}
                    style={({ pressed }) => [
                      styles.commandAction,
                      rtl && styles.rowReverse,
                      pressed && styles.pressed
                    ]}
                  >
                    <Text
                      style={[
                        styles.commandActionLabel,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {atlasCopy.addPlace}
                    </Text>
                    <ArrowRight
                      color={colors.carbon}
                      mirrored={rtl}
                      size={18}
                    />
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          {locationWork.length > 0 ? (
            <View style={styles.attention}>
              <View style={styles.attentionCopy}>
                <View
                  style={[
                    styles.attentionHeading,
                    rtl && styles.rowReverse
                  ]}
                >
                  <WarningCircle color={colors.warning} size={22} />
                  <Text
                    style={[
                      styles.attentionTitle,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {atlasCopy.locationWorkTitle}
                  </Text>
                </View>
                <View style={styles.attentionActions}>
                  {locationWork.map((work) => (
                    <Pressable
                      accessibilityHint={atlasCopy.locationWorkHint}
                      accessibilityLabel={work.label}
                      accessibilityRole="button"
                      key={work.kind}
                      onPress={() =>
                        router.push(atlasLocationWorkRoute(work.kind))
                      }
                      style={({ pressed }) => [
                        styles.attentionAction,
                        rtl && styles.rowReverse,
                        pressed && styles.pressed
                      ]}
                    >
                      <Text
                        style={[
                          styles.attentionMeta,
                          rtl && styles.arabic,
                          rtl && styles.rtlText
                        ]}
                      >
                        {work.label}
                      </Text>
                      <ArrowRight
                        color={colors.textMuted}
                        mirrored={rtl}
                        size={17}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ) : null}

          {selected ? (
            <Section>
              <SectionHeader
                title={atlasItemsAt(selected.place.name, language)}
              />
              {selectedAssets.map((asset) => (
                <AssetListItem
                  asset={asset}
                  evidence={workspace.evidence}
                  key={asset.id}
                  onPress={() =>
                    router.push(
                      `/asset/${asset.id}?retrievalSource=place-view`
                    )
                  }
                  places={workspace.places}
                />
              ))}
              {selectedAssets.length === 0 ? (
                <View style={styles.emptyInline}>
                  <Text
                    style={[
                      styles.emptyInlineTitle,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {atlasCopy.noItemsTitle}
                  </Text>
                  <BodyText muted>{atlasCopy.noItemsBody}</BodyText>
                </View>
              ) : null}
            </Section>
          ) : null}
        </>
      ) : (
        <Section style={styles.placeList}>
          <SectionHeader title={atlasCopy.everyPlace} />
          <Text
            style={[
              styles.listSummary,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {atlasPlaceCount(places.length, language)} ·{" "}
            {atlasMappedPlaceCount(pinnedPlaces.length, language)}
          </Text>
          <BodyText muted>{atlasCopy.listBody}</BodyText>

          <View style={styles.placeRows}>
            {places.map((place) => {
              const assetCount = activeAssets.filter(
                (asset) => asset.placeId === place.id
              ).length;
              const selectedRow = place.id === selected?.place.id;
              const hasPin = hasValidPin(place);
              const requiresAttention =
                !hasPin || place.confirmedAt === null;
              const disclosure = placePinLabel(
                place,
                language,
                atlasCopy.pinNeededNoCoordinate
              );
              return (
                <Pressable
                  accessibilityHint={atlasCopy.openExactPlaceHint}
                  accessibilityLabel={`${place.name}, ${
                    place.regionLabel
                  }, ${atlasItemCount(
                    assetCount,
                    language
                  )}. ${disclosure}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedRow }}
                  key={place.id}
                  onPress={() => router.push(`/place/${place.id}`)}
                  style={({ pressed }) => [
                    styles.placeRow,
                    rtl && styles.rowReverse,
                    selectedRow && styles.placeRowSelected,
                    selectedRow && rtl && styles.placeRowSelectedRtl,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.placeIcon}>
                    <MapPin
                      color={
                        requiresAttention ? colors.warning : colors.text
                      }
                      size={21}
                      weight="regular"
                    />
                  </View>
                  <View style={styles.placeCopy}>
                    <View
                      style={[
                        styles.placeNameLine,
                        rtl && styles.rowReverse
                      ]}
                    >
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.placeName,
                          rtl && styles.arabicMedium,
                          styles.mixedScript,
                          rtl && styles.textRight
                        ]}
                      >
                        {place.name}
                      </Text>
                      {selectedRow ? (
                        <Text
                          style={[
                            styles.currentLabel,
                            rtl && styles.arabicMedium,
                            rtl && styles.rtlText
                          ]}
                        >
                          {atlasCopy.selected}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.placeMeta,
                        rtl && styles.arabic,
                        styles.mixedScript,
                        rtl && styles.textRight
                      ]}
                    >
                      {place.regionLabel} ·{" "}
                      {atlasItemCount(assetCount, language)}
                    </Text>
                    <Text
                      style={[
                        styles.placePinMeta,
                        requiresAttention && styles.placePinMetaWarning,
                        rtl && styles.arabic,
                        rtl && styles.rtlText
                      ]}
                    >
                      {disclosure}
                    </Text>
                  </View>
                  <ArrowRight
                    color={colors.textMuted}
                    mirrored={rtl}
                    size={18}
                  />
                </Pressable>
              );
            })}
          </View>

          {places.length === 0 ? (
            <View style={styles.empty}>
              <Text
                style={[
                  styles.emptyTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {atlasCopy.noPlacesTitle}
              </Text>
              <BodyText muted>{atlasCopy.noPlacesBody}</BodyText>
              {canWritePlaces ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/capture?intent=place")}
                  style={({ pressed }) => [
                    styles.emptyAction,
                    rtl && styles.rowReverse,
                    rtl && styles.emptyActionRtl,
                    pressed && styles.pressed
                  ]}
                >
                  <Text
                    style={[
                      styles.emptyActionLabel,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {atlasCopy.addPlace}
                  </Text>
                  <ArrowRight
                    color={colors.carbon}
                    mirrored={rtl}
                    size={18}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Section>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: spacing.lg
  },
  heading: {
    gap: spacing.xs
  },
  viewSwitch: {
    minHeight: 45,
    flexDirection: "row",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    backgroundColor: colors.canvas
  },
  viewTab: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: -1,
    borderBottomWidth: 3,
    borderBottomColor: colors.transparent
  },
  viewTabSelected: {
    borderBottomColor: colors.volt
  },
  viewTabLabel: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  viewTabLabelSelected: {
    color: colors.carbon
  },
  geographyCanvas: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.carbon,
    overflow: "hidden"
  },
  canvasHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  canvasHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  canvasKicker: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1
  },
  canvasRegion: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 27
  },
  canvasCount: {
    alignItems: "flex-end"
  },
  canvasCountValue: {
    color: colors.volt,
    fontFamily: typography.metadata,
    fontSize: 24,
    lineHeight: 27,
    fontVariant: ["tabular-nums"]
  },
  canvasCountLabel: {
    color: colors.concrete,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.8
  },
  globe: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: themes.dark.surface
  },
  pinTarget: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: radius.round
  },
  interactionHint: {
    width: "100%",
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  rotateControls: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  atlasNavButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: themes.dark.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: themes.dark.surface
  },
  positionCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2
  },
  positionLabel: {
    color: colors.concrete,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.1
  },
  positionName: {
    maxWidth: "100%",
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 19
  },
  selectedSummary: {
    width: "100%",
    alignItems: "flex-start",
    gap: 5,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themes.dark.borderStrong
  },
  selectedKicker: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.1
  },
  selectedTitle: {
    color: colors.white,
    fontFamily: typography.displayBold,
    fontSize: 21,
    lineHeight: 26
  },
  selectedMeta: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  selectedPrecision: {
    color: colors.white,
    fontFamily: typography.metadata,
    fontSize: 13,
    lineHeight: 19
  },
  commandAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.volt
  },
  commandActionLabel: {
    color: colors.carbon,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18
  },
  disabled: {
    opacity: 0.38
  },
  attention: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.warningQuiet
  },
  attentionCopy: {
    flex: 1,
    gap: spacing.xs
  },
  attentionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  attentionTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 19
  },
  attentionMeta: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  attentionActions: {
    marginTop: spacing.xs
  },
  attentionAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  placeList: {
    gap: spacing.sm
  },
  listSummary: {
    color: colors.text,
    fontFamily: typography.metadata,
    fontSize: 14,
    lineHeight: 19,
    fontVariant: ["tabular-nums"]
  },
  placeRows: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  placeRow: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderLeftWidth: 2,
    borderLeftColor: colors.transparent
  },
  placeRowSelected: {
    borderLeftColor: colors.carbon,
    backgroundColor: colors.surfaceQuiet
  },
  placeRowSelectedRtl: {
    borderLeftColor: colors.transparent,
    borderRightWidth: 2,
    borderRightColor: colors.carbon
  },
  placeIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceQuiet
  },
  placeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  placeNameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  placeName: {
    flexShrink: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 20
  },
  currentLabel: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.8
  },
  placeMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  placePinMeta: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17
  },
  placePinMetaWarning: {
    color: colors.text
  },
  empty: {
    gap: spacing.md,
    paddingVertical: spacing.lg
  },
  emptyInline: {
    gap: spacing.xs,
    paddingVertical: spacing.md
  },
  emptyInlineTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 25
  },
  emptyAction: {
    minHeight: 48,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.volt
  },
  emptyActionLabel: {
    color: colors.carbon,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 19
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  canvasCountRtl: {
    alignItems: "flex-start"
  },
  selectedSummaryRtl: {
    alignItems: "flex-end"
  },
  emptyActionRtl: {
    alignSelf: "flex-end"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0,
    textTransform: "none"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  textRight: {
    textAlign: "right"
  },
  mixedScript: {
    writingDirection: "auto"
  },
  pressed: {
    opacity: 0.72
  }
});
