import { useRouter } from "expo-router";
import { MagnifyingGlass, MapPin, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AssetListItem } from "@/components/AssetListItem";
import { AppScreen, BodyText, IconButton, Surface } from "@/components/ui";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export default function SearchScreen() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const assetResults = useMemo(
    () =>
      !workspace || !normalized
        ? []
        : workspace.assets.filter((asset) =>
            [asset.name, asset.categoryLabel, asset.locatorText]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(normalized))
          ),
    [normalized, workspace]
  );
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

  if (!workspace) return null;

  return (
    <AppScreen testID="search-screen">
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <MagnifyingGlass color={colors.textMuted} size={20} />
          <TextInput
            accessibilityLabel="Search your private register"
            autoFocus
            onChangeText={setQuery}
            placeholder="Asset, Place, room, or locator"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.cyan}
            style={styles.input}
            value={query}
          />
        </View>
        <IconButton icon={X} label="Close search" onPress={() => router.back()} />
      </View>

      {!normalized ? (
        <Surface>
          <Text style={styles.promptTitle}>Find something in seconds</Text>
          <BodyText muted>
            Search stays on this device. Query text is not included in
            analytics or sync diagnostics.
          </BodyText>
        </Surface>
      ) : (
        <>
          {placeResults.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Places</Text>
              {placeResults.map((place) => (
                <Pressable
                  accessibilityRole="button"
                  key={place.id}
                  onPress={() => router.replace(`/place/${place.id}`)}
                  style={({ pressed }) => [
                    styles.placeResult,
                    pressed && styles.pressed
                  ]}
                >
                  <View style={styles.placeGlyph}>
                    <MapPin color={colors.cyan} size={21} weight="duotone" />
                  </View>
                  <View style={styles.placeCopy}>
                    <Text style={styles.placeName}>{place.name}</Text>
                    <Text style={styles.placeMeta}>
                      {place.regionLabel} · {place.rooms.length} spaces
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {assetResults.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Asset Passports</Text>
              {assetResults.map((asset) => (
                <AssetListItem
                  asset={asset}
                  evidence={workspace.evidence}
                  key={asset.id}
                  onPress={() => router.replace(`/asset/${asset.id}`)}
                  places={workspace.places}
                />
              ))}
            </View>
          ) : null}

          {assetResults.length === 0 && placeResults.length === 0 ? (
            <Surface>
              <Text style={styles.promptTitle}>Nothing matches “{query}”</Text>
              <BodyText muted>
                Try a category, Place, room, or retrieval clue.
              </BodyText>
            </Surface>
          ) : null}
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  searchWrap: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(74, 216, 245, 0.44)",
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  input: {
    flex: 1,
    minHeight: 48,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 16
  },
  promptTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20
  },
  placeResult: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  placeGlyph: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.cyanQuiet
  },
  placeCopy: {
    flex: 1,
    gap: 3
  },
  placeName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  placeMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13
  },
  pressed: {
    opacity: 0.7
  }
});
