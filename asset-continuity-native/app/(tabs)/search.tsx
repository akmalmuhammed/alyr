import { useRouter } from "expo-router";
import { MagnifyingGlass, MapPin, X } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { AssetListItem } from "@/components/AssetListItem";
import {
  AppScreen,
  BodyText,
  IconButton,
  ScreenTitle,
  Section
} from "@/components/ui";
import { LocalizedRouteBack } from "@/components/LocalizedRouteBack";
import {
  isAssetActive,
  type LanguageCode,
  type NativeAsset,
  type NativePlace,
  type NativeRoom
} from "@/domain/model";
import { localizedCategoryLabel } from "@/i18n/captureCopy";
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";
import {
  itemCount,
  placeCount,
  searchResultAnnouncement,
  spaceCount,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export function assetSearchTerms(
  asset: NativeAsset,
  place: NativePlace | undefined,
  room: NativeRoom | undefined,
  language: LanguageCode
): readonly string[] {
  return [
    asset.name,
    asset.categoryLabel,
    localizedCategoryLabel(
      asset.categoryId,
      asset.categoryLabel,
      language
    ),
    asset.locatorText,
    place?.name,
    place?.regionLabel,
    room?.name
  ].filter((value): value is string => Boolean(value));
}

export default function SearchScreen() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const assetResults = useMemo(() => {
    if (!workspace || !normalized) return [];

    return workspace.assets.filter((asset) => {
      const place = workspace.places.find((item) => item.id === asset.placeId);
      const room = place?.rooms.find((item) => item.id === asset.roomId);
      return assetSearchTerms(asset, place, room, language).some(
        (value) => value.toLowerCase().includes(normalized)
      );
    });
  }, [language, normalized, workspace]);

  const placeResults = useMemo(
    () =>
      !workspace || !normalized
        ? []
        : workspace.places.filter((place) =>
            [
              place.name,
              place.addressSummary,
              place.regionLabel,
              ...place.rooms.map((room) => room.name)
            ]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(normalized))
          ),
    [normalized, workspace]
  );

  useEffect(() => {
    if (!normalized || Platform.OS === "web") return;
    const timer = setTimeout(() => {
      const message = searchResultAnnouncement(
        assetResults.length,
        placeResults.length,
        language
      );
      AccessibilityInfo.announceForAccessibility(message);
    }, 400);
    return () => clearTimeout(timer);
  }, [
    assetResults.length,
    language,
    normalized,
    placeResults.length
  ]);

  if (!workspace) return null;
  const activeAssets = workspace.assets.filter(isAssetActive);

  return (
    <AppScreen testID="search-screen">
      <View style={[styles.heading, rtl && styles.rowReverse]}>
        <LocalizedRouteBack
          label={copy.common.back}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace(PRIMARY_ROUTES.items)
          }
          rtl={rtl}
          testID="search-back"
        />
        <View style={styles.headingCopy}>
          <ScreenTitle>{copy.search.title}</ScreenTitle>
          <BodyText muted>{copy.search.intro}</BodyText>
        </View>
      </View>

      <View style={[styles.searchWrap, rtl && styles.rowReverse]}>
        <MagnifyingGlass color={colors.textMuted} size={21} />
        <TextInput
          accessibilityLabel={copy.search.label}
          autoCapitalize="none"
          onChangeText={setQuery}
          placeholder={copy.search.placeholder}
          placeholderTextColor={colors.textFaint}
          returnKeyType="search"
          selectionColor={colors.action}
          style={[styles.input, rtl && styles.inputArabic]}
          value={query}
        />
        {query ? (
          <IconButton
            icon={X}
            label={copy.search.clear}
            onPress={() => setQuery("")}
          />
        ) : null}
      </View>

      {!normalized ? (
        <Section>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.sectionTitleArabic
            ]}
          >
            {copy.search.glance}
          </Text>
          {workspace.places.length > 0 ? (
            <>
              <Text
                style={[
                  styles.groupLabel,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {placeCount(workspace.places.length, language)}
              </Text>
              {workspace.places.slice(0, 2).map((place) => (
                <Pressable
                  accessibilityRole="button"
                  key={place.id}
                  onPress={() => router.push(`/place/${place.id}`)}
                  style={({ pressed }) => [
                    styles.placeResult,
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
                      {place.regionLabel} ·{" "}
                      {spaceCount(place.rooms.length, language)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}
          {activeAssets.length > 0 ? (
            <Text
              style={[
                styles.groupLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {itemCount(activeAssets.length, language)}
            </Text>
          ) : null}
          {activeAssets.slice(0, 3).map((asset) => (
            <AssetListItem
              asset={asset}
              evidence={workspace.evidence}
              key={asset.id}
              onPress={() => router.push(`/asset/${asset.id}`)}
              places={workspace.places}
            />
          ))}
          {activeAssets.length === 0 && workspace.places.length === 0 ? (
            <View style={[styles.emptyState, rtl && styles.alignEnd]}>
              <Text
                style={[
                  styles.emptyTitle,
                  rtl && styles.sectionTitleArabic,
                  rtl && styles.rtlText
                ]}
              >
                {workspace.assets.length > 0
                  ? copy.search.noActive
                  : copy.search.nothing}
              </Text>
              <BodyText muted>
                {workspace.assets.length > 0
                  ? copy.search.archivedBody
                  : copy.search.nothingBody}
              </BodyText>
            </View>
          ) : null}
        </Section>
      ) : (
        <>
          {placeResults.length > 0 ? (
            <Section>
              <Text
                style={[
                  styles.sectionTitle,
                  rtl && styles.sectionTitleArabic
                ]}
              >
                {copy.common.places}
              </Text>
              {placeResults.map((place) => (
                <Pressable
                  accessibilityRole="button"
                  key={place.id}
                  onPress={() => router.push(`/place/${place.id}`)}
                  style={({ pressed }) => [
                    styles.placeResult,
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
                      {place.regionLabel} ·{" "}
                      {spaceCount(place.rooms.length, language)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Section>
          ) : null}

          {assetResults.length > 0 ? (
            <Section>
              <Text
                style={[
                  styles.sectionTitle,
                  rtl && styles.sectionTitleArabic
                ]}
              >
                {copy.common.items}
              </Text>
              {assetResults.map((asset) => (
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

          {assetResults.length === 0 && placeResults.length === 0 ? (
            <View style={[styles.emptyState, rtl && styles.alignEnd]}>
              <Text
                style={[
                  styles.emptyTitle,
                  rtl && styles.sectionTitleArabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.search.noMatch} “{query}”
              </Text>
              <BodyText muted>
                {copy.search.noMatchBody}
              </BodyText>
              <Pressable
                accessibilityRole="button"
                onPress={() => setQuery("")}
                style={styles.clearAction}
              >
                <Text
                  style={[
                    styles.clearActionLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.search.clear}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  searchWrap: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 16
  },
  inputArabic: {
    fontFamily: typography.arabic,
    textAlign: "right",
    writingDirection: "rtl"
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
  groupLabel: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1
  },
  placeResult: {
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
    gap: 3
  },
  placeName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16
  },
  placeMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  emptyState: {
    alignItems: "flex-start",
    gap: spacing.sm,
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
  clearAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginStart: -spacing.sm
  },
  clearActionLabel: {
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
