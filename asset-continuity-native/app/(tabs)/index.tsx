import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChartDonut,
  MapPin,
  Plus
} from "phosphor-react-native";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { AssetListItem } from "@/components/AssetListItem";
import { AssetPhotoPreview } from "@/components/AssetPhotoPreview";
import { PermissionNotice } from "@/components/PermissionDenied";
import { SyncTruth } from "@/components/SyncTruth";
import {
  AppScreen,
  BodyText,
  BrandMark,
  CommandSurface,
  IconButton,
  PrimaryButton,
  ScreenTitle,
  Section,
  SectionHeader
} from "@/components/ui";
import type { NativeAsset } from "@/domain/model";
import { isAssetActive } from "@/domain/model";
import { buildPortfolioSnapshot } from "@/domain/portfolio";
import { calculateNativeAssetReadiness } from "@/domain/readiness";
import {
  rankTodayAttention,
  selectTodayCommandState,
  selectTodayPlacePinStatus,
  type TodayPlacePin
} from "@/domain/today";

import {
  atlasAccessibilityLabel,
  formatLocalizedNumber,
  formatLocalizedPercent,
  itemCount,
  placeCount,
  portfolioAccessibilityLabel,
  spaceCount,
  todayHouseholdSummary,
  todayPinSummary,
  type CoreJourneyCopy,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import {
  formatRecordedValue,
  valueVisibilityFromHidden
} from "@/privacy/ValueVisibility";
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
    : { accessibilityElementsHidden: true };

type GapKind = "identity" | "photo" | "location" | "evidence";

interface AtlasPoint {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly confirmation: TodayPlacePin["confirmation"];
}

function projectAtlasPins(
  pinned: readonly TodayPlacePin[]
): AtlasPoint[] {
  if (pinned.length === 0) return [];

  const latitudes = pinned.map((pin) => pin.latitude);
  const longitudes = pinned.map((pin) => pin.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = maxLatitude - minLatitude;
  const longitudeSpan = maxLongitude - minLongitude;

  return pinned.slice(0, 8).map((pin) => ({
    id: pin.place.id,
    confirmation: pin.confirmation,
    // A proportional overview, not a street map. Every marker is still
    // derived from the saved coordinates and absent Places never get a pin.
    cx:
      longitudeSpan === 0
        ? 272
        : 196 + ((pin.longitude - minLongitude) / longitudeSpan) * 122,
    cy:
      latitudeSpan === 0
        ? 76
        : 30 + ((maxLatitude - pin.latitude) / latitudeSpan) * 94
  }));
}

function gapCopy(
  asset: NativeAsset,
  gap: GapKind,
  copy: CoreJourneyCopy
): {
  readonly title: string;
  readonly detail: string;
  readonly action: string;
} {
  if (gap === "location") {
    return {
      title: `${copy.today.locationGap} ${asset.name}`,
      detail: copy.today.locationGapDetail,
      action: copy.today.reviewLocation
    };
  }
  if (gap === "evidence") {
    return {
      title: `${copy.today.proofGap} ${asset.name}`,
      detail: copy.today.proofGapDetail,
      action: copy.today.addProof
    };
  }
  if (gap === "photo") {
    return {
      title: `${copy.today.photoGap} ${asset.name}`,
      detail: copy.today.photoGapDetail,
      action: copy.today.addPhoto
    };
  }
  return {
    title: `${copy.today.identityGap} ${asset.name}`,
    detail: copy.today.identityGapDetail,
    action: copy.today.reviewPassport
  };
}

function gapHref(asset: NativeAsset, gap: GapKind): string {
  return `/asset-edit?assetId=${encodeURIComponent(asset.id)}&focus=${gap}`;
}

function TodayPortfolioCard({
  accessibilityLabel,
  recordCount,
  copy,
  language,
  onPress,
  rtl,
  totals,
  valuedCount
}: {
  readonly accessibilityLabel: string;
  readonly recordCount: number;
  readonly copy: CoreJourneyCopy;
  readonly language: "en" | "ar";
  readonly onPress: () => void;
  readonly rtl: boolean;
  readonly totals: readonly {
    readonly currency: string;
    readonly compact: string;
  }[];
  readonly valuedCount: number;
}) {
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  return (
    <Section>
      <Pressable
        accessibilityHint={copy.today.portfolioHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.portfolioRow,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
      >
        <View style={styles.portfolioIcon}>
          <ChartDonut color={colors.volt} size={22} weight="regular" />
        </View>
        <View style={styles.portfolioCopy}>
          <Text
            style={[
              styles.portfolioLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.today.portfolio}
          </Text>
          {totals.length === 0 ? (
            <Text
              style={[
                styles.portfolioValue,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.today.noValues}
            </Text>
          ) : (
            <View style={styles.portfolioValues}>
              {totals.map((total) => (
                <Text
                  key={total.currency}
                  style={[
                    styles.portfolioValue,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {total.compact}
                </Text>
              ))}
            </View>
          )}
          <Text
            style={[
              styles.portfolioMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {language === "ar"
              ? `${formatLocalizedNumber(
                  valuedCount,
                  language
                )} من ${formatLocalizedNumber(
                  recordCount,
                  language
                )} ${copy.today.valueCoverage}`
              : `${formatLocalizedNumber(
                  valuedCount,
                  language
                )} of ${formatLocalizedNumber(
                  recordCount,
                  language
                )} items and properties ${copy.today.valueCoverage}`}{" "}
            · {copy.today.currenciesSeparate}
          </Text>
        </View>
        <ForwardIcon color={colors.textMuted} size={20} />
      </Pressable>
    </Section>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    can,
    pendingOperationCount,
    recordedAssetValues,
    sync,
    workspace
  } = useWorkspace();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const { amountsHidden } = usePortfolioPrivacy();
  if (!workspace) return null;
  const canWriteAssets = can("asset.write");
  const canWritePlaces = can("place.write");
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const activeAssets = workspace.assets.filter(isAssetActive);

  const readinessEntries = activeAssets.map((asset) => ({
    asset,
    readiness: calculateNativeAssetReadiness(
      asset,
      workspace.places,
      workspace.evidence
    )
  }));
  const incomplete = rankTodayAttention(readinessEntries);
  const registerReadiness =
    readinessEntries.length === 0
      ? 0
      : Math.round(
          readinessEntries.reduce(
            (total, entry) => total + entry.readiness.percent,
            0
          ) / readinessEntries.length
        );

  const firstGap = incomplete[0];
  const primary = firstGap?.readiness.nextItem
    ? gapCopy(
        firstGap.asset,
        firstGap.readiness.nextItem.id,
        copy
      )
    : null;
  const commandState = selectTodayCommandState(
    activeAssets.length,
    incomplete.length
  );
  const command =
    commandState === "empty"
      ? {
          eyebrow: copy.today.startHere,
          title: copy.today.emptyTitle,
          detail: copy.today.emptyDetail,
          action: copy.today.addFirstItem,
          icon: Camera
        }
      : commandState === "ready"
        ? {
            eyebrow: copy.today.registerReady,
            title: copy.today.readyTitle,
            detail: copy.today.readyDetail,
            action: copy.today.addAnotherItem,
            icon: Plus
          }
        : {
            eyebrow: copy.today.nextToProtect,
            title: primary?.title ?? copy.today.reviewNext,
            detail:
              primary?.detail ??
              copy.today.reviewNextDetail,
            action: primary?.action ?? copy.today.reviewPassport,
            icon: ForwardIcon
          };
  const CommandIcon = command.icon;
  const summary = todayHouseholdSummary(
    activeAssets.length,
    workspace.places.length,
    language
  );
  const placePinStatus = selectTodayPlacePinStatus(workspace.places);
  const atlasPins = projectAtlasPins(placePinStatus.pins);
  const regionSummary = [
    ...new Set(workspace.places.map((place) => place.regionLabel))
  ]
    .filter(Boolean)
    .join(" \u00B7 ");
  const pinSummary = todayPinSummary(
    placePinStatus.confirmedCount,
    placePinStatus.confirmationNeededCount,
    language
  );
  const portfolio = buildPortfolioSnapshot(
    workspace,
    recordedAssetValues
  );
  const valueVisibility = valueVisibilityFromHidden(amountsHidden);
  const portfolioTotals = portfolio.currencyTotals.slice(0, 2).map(
    (total) => {
      if (total.amountMinor === null) {
        const unavailable = `${total.currency} ${copy.today.totalUnavailable}`;
        return {
          currency: total.currency,
          compact: unavailable,
          exact: unavailable
        };
      }
      const compact = formatRecordedValue({
        amountMinor: total.amountMinor,
        compact: true,
        currency: total.currency,
        language,
        visibility: valueVisibility
      });
      const exact = formatRecordedValue({
        amountMinor: total.amountMinor,
        currency: total.currency,
        language,
        visibility: valueVisibility
      });
      return {
        currency: total.currency,
        compact: compact.text,
        exact: exact.accessibilityLabel
      };
    }
  );
  const readinessPercent = formatLocalizedPercent(
    registerReadiness,
    language
  );
  const portfolioSummary =
    portfolioTotals.length === 0
      ? copy.today.noValues
      : portfolioTotals.map((total) => total.exact).join("; ");
  const portfolioA11y = portfolioAccessibilityLabel(
    portfolioSummary,
    portfolio.valuedEntryCount,
    portfolio.valuableCount,
    language
  );

  return (
    <AppScreen testID="home-screen">
      <View style={[styles.topBar, rtl && styles.rowReverse]}>
        <View style={[styles.identity, rtl && styles.rowReverse]}>
          <BrandMark compact />
          <View style={styles.identityCopy}>
            <Text
              style={[
                styles.householdName,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {workspace.household.name}
            </Text>
            <Text
              style={[
                styles.modeLabel,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {workspace.mode === "sample"
                ? copy.today.demoHousehold
                : copy.today.privateRegister}
            </Text>
          </View>
        </View>
        {canWriteAssets ? (
          <View style={[styles.topActions, rtl && styles.rowReverse]}>
            <IconButton
              icon={Plus}
              label={copy.items.addItem}
              onPress={() => router.push("/capture")}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.heading}>
        <ScreenTitle>{copy.today.title}</ScreenTitle>
        <BodyText muted>{summary}</BodyText>
      </View>

      <SyncTruth
        language={language}
        onPress={() =>
          router.push(
            sync.conflicts.length > 0 ? "/sync-conflicts" : "/vault"
          )
        }
        pendingOperationCount={pendingOperationCount}
        sync={sync}
      />

      {!canWriteAssets ? (
        <PermissionNotice
          capability="asset.write"
          testID="today-view-only-notice"
        />
      ) : null}

      <CommandSurface>
        <View
          style={[
            styles.commandHeader,
            rtl && styles.rowReverse
          ]}
        >
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {command.eyebrow}
          </Text>
          <Text
            style={[
              styles.commandReadiness,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.today.registerReadiness} · {readinessPercent}
          </Text>
        </View>
        <View
          accessibilityLabel={`${copy.today.registerReadiness}: ${readinessPercent}`}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: registerReadiness
          }}
          style={styles.commandProgressTrack}
        >
          <View
            style={[
              styles.commandProgressFill,
              rtl && styles.commandProgressFillRtl,
              { width: `${registerReadiness}%` }
            ]}
          />
        </View>
        <View
          style={[
            styles.commandMain,
            rtl && styles.rowReverse
          ]}
        >
          {firstGap ? (
            <AssetPhotoPreview
              active
              asset={firstGap.asset}
              evidence={workspace.evidence}
              variant="command"
            />
          ) : (
            <View style={styles.commandIcon}>
              <CommandIcon
                color={colors.volt}
                size={26}
                weight="regular"
              />
            </View>
          )}
          <View style={styles.commandCopy}>
            <Text
              style={[
                styles.commandTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {command.title}
            </Text>
            <Text
              style={[
                styles.commandDetail,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {command.detail}
            </Text>
          </View>
        </View>
        {canWriteAssets ? (
          <PrimaryButton
            icon={command.icon}
            label={command.action}
            onPress={() =>
              commandState === "incomplete" && firstGap
                ? router.push(
                    gapHref(
                      firstGap.asset,
                      firstGap.readiness.nextItem!.id
                    )
                  )
                : router.push("/capture")
            }
          />
        ) : null}
      </CommandSurface>

      <TodayPortfolioCard
        accessibilityLabel={portfolioA11y}
        recordCount={portfolio.valuableCount}
        copy={copy}
        language={language}
        onPress={() => router.push("/dashboard")}
        rtl={rtl}
        totals={portfolioTotals}
        valuedCount={portfolio.valuedEntryCount}
      />

      {incomplete.length > 1 ? (
        <Section>
          <SectionHeader title={copy.today.needsAttention} />
          {incomplete.slice(1, 3).map(({ asset, readiness }) => {
            const task = gapCopy(
              asset,
              readiness.nextItem!.id,
              copy
            );
            return (
              <Pressable
                accessibilityRole="button"
                key={asset.id}
                onPress={() =>
                  router.push(
                    canWriteAssets
                      ? gapHref(asset, readiness.nextItem!.id)
                      : `/asset/${asset.id}`
                  )
                }
                style={({ pressed }) => [
                  styles.taskRow,
                  rtl && styles.rowReverse,
                  pressed && styles.pressed
                ]}
              >
                <View style={styles.taskSignal} />
                <View style={styles.taskCopy}>
                  <Text
                    style={[
                      styles.taskTitle,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {task.title}
                  </Text>
                  <Text
                    style={[
                      styles.taskDetail,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {task.detail}
                  </Text>
                </View>
                <ForwardIcon color={colors.textMuted} size={20} />
              </Pressable>
            );
          })}
        </Section>
      ) : null}

      <Section>
        <SectionHeader
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.today.viewAllPlaces}
              onPress={() => router.push("/assets?view=places")}
              style={styles.textAction}
            >
              <Text
                style={[
                  styles.textActionLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.today.viewPlaces}
              </Text>
            </Pressable>
          }
          title={copy.items.yourPlaces}
        />
        <Pressable
          accessibilityLabel={atlasAccessibilityLabel(
            placePinStatus.confirmedCount,
            placePinStatus.confirmationNeededCount,
            workspace.places.length,
            language
          )}
          accessibilityHint={copy.today.atlasHint}
          accessibilityRole="button"
          onPress={() => router.push("/atlas")}
          style={({ pressed }) => [
            styles.atlas,
            pressed && styles.pressed
          ]}
        >
          <Svg
            {...hiddenMapDecorationProps}
            height="154"
            style={StyleSheet.absoluteFill}
            viewBox="0 0 350 154"
            width="100%"
          >
            <Path
              d="M-14 40 C58 2 122 74 196 38 S314 12 380 48"
              fill="none"
              opacity={0.42}
              stroke={colors.concrete}
              strokeWidth="1"
            />
            <Path
              d="M-6 94 C66 50 136 116 202 78 S308 58 368 98"
              fill="none"
              opacity={0.52}
              stroke={colors.concrete}
              strokeWidth="1"
            />
            <Path
              d="M38 -8 C68 54 38 92 78 166"
              fill="none"
              opacity={0.35}
              stroke={colors.concrete}
              strokeWidth="1"
            />
            <Path
              d="M274 -10 C240 38 290 96 250 166"
              fill="none"
              opacity={0.35}
              stroke={colors.concrete}
              strokeWidth="1"
            />
            {atlasPins.map((pin) => (
              <Circle
                cx={pin.cx}
                cy={pin.cy}
                fill={
                  pin.confirmation === "confirmed"
                    ? colors.volt
                    : colors.surface
                }
                key={pin.id}
                r="6"
                stroke={
                  pin.confirmation === "confirmed"
                    ? colors.carbon
                    : colors.warning
                }
                strokeWidth="3"
              />
            ))}
          </Svg>
          <View style={styles.atlasCopy}>
            <Text
              style={[
                styles.atlasKicker,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.today.locationOverview}
            </Text>
            <Text
              style={[
                styles.atlasTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {workspace.places.length > 0
                ? `${placeCount(
                    workspace.places.length,
                    language
                  )} ${copy.today.registerMapSuffix}`
                : copy.today.registerMapEmpty}
            </Text>
            <Text
              style={[
                styles.atlasMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {workspace.places.length > 0
                ? `${pinSummary}${regionSummary ? ` \u00B7 ${regionSummary}` : ""}`
                : copy.today.addPlaceDetail}
            </Text>
          </View>
        </Pressable>

        {workspace.places.slice(0, 2).map((place) => {
          const assetCount = activeAssets.filter(
            (asset) => asset.placeId === place.id
          ).length;
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
              <MapPin color={colors.text} size={22} weight="regular" />
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
                    styles.placeMeta,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {place.regionLabel} · {itemCount(assetCount, language)} ·{" "}
                  {spaceCount(place.rooms.length, language)}
                </Text>
              </View>
              <ForwardIcon color={colors.textMuted} size={20} />
            </Pressable>
          );
        })}

        {workspace.places.length === 0 && canWritePlaces ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/capture?intent=place")}
            style={styles.addPlace}
          >
            <Plus color={colors.text} size={20} />
            <Text
              style={[
                styles.addPlaceLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {copy.today.addFirstPlace}
            </Text>
          </Pressable>
        ) : null}
      </Section>

      {activeAssets.length > 0 ? (
        <Section>
          <SectionHeader
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.today.viewAllItems}
                onPress={() => router.push("/assets?view=items")}
                style={styles.textAction}
              >
                <Text
                  style={[
                    styles.textActionLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.today.seeAll}
                </Text>
              </Pressable>
            }
            title={copy.today.itemsSection}
          />
          {activeAssets.slice(0, 3).map((asset) => (
            <AssetListItem
              asset={asset}
              evidence={workspace.evidence}
              key={asset.id}
              onPress={() => router.push(`/asset/${asset.id}`)}
              places={workspace.places}
            />
          ))}
        </Section>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rowReverse: {
    flexDirection: "row-reverse"
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  identityCopy: {
    flex: 1,
    gap: 1
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  householdName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 19
  },
  modeLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 16
  },
  heading: {
    gap: spacing.xs
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.2
  },
  commandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  commandReadiness: {
    flexShrink: 1,
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "right",
    fontVariant: ["tabular-nums"]
  },
  commandProgressTrack: {
    height: 4,
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: themes.dark.surfaceQuiet
  },
  commandProgressFill: {
    height: "100%",
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  commandProgressFillRtl: {
    alignSelf: "flex-end"
  },
  commandMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md
  },
  commandCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs
  },
  commandIcon: {
    width: 56,
    height: 56,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: themes.dark.surfaceQuiet
  },
  commandTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3
  },
  commandDetail: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  taskRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  portfolioRow: {
    minHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  portfolioIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.carbon
  },
  portfolioCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  portfolioLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1
  },
  portfolioValues: {
    gap: 1
  },
  portfolioValue: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"]
  },
  portfolioMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  taskSignal: {
    width: 8,
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  taskCopy: {
    flex: 1,
    gap: 2
  },
  taskTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22
  },
  taskDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  textAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    marginEnd: -spacing.xs
  },
  textActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    textDecorationLine: "underline"
  },
  atlas: {
    minHeight: 154,
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.mist
  },
  atlasCopy: {
    maxWidth: "70%",
    gap: 2
  },
  atlasKicker: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.1
  },
  atlasTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  atlasMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  placeRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  placeCopy: {
    flex: 1,
    gap: 2
  },
  placeName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22
  },
  placeMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  addPlace: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  addPlaceLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15
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
